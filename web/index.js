// @ts-check
import { join, dirname } from "path";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { createServer } from "http";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

import fs from "fs";

// Debug log to a file. Hardened against the failure mode that previously grew
// this file to 85GB: an EPIPE on stdout became an uncaughtException, whose
// handler called console.error, which tried to write to the same broken
// stdout, throwing EPIPE again — forever. Three independent safeguards below
// each stop that class of loop on their own:
//   1. A re-entrancy guard so a log call can never trigger another log call.
//   2. try/catch around every write so a logging failure can never itself
//      throw (the actual trigger of the original incident).
//   3. A hard size cap that rotates the file away long before it could ever
//      reach a size that matters, regardless of what's writing to it.
const LOG_PATH = join(__dirname, "debug.log");
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_REPEATS_PER_WINDOW = 20;
const REPEAT_WINDOW_MS = 1000;

let logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
logStream.on("error", () => { /* a broken log stream must never crash or recurse the app */ });

const originalLog = console.log;
const originalError = console.error;

let writingLog = false;
let sizeCheckPending = false;
let lastMessage = "";
let lastMessageCount = 0;
let lastMessageWindowStart = 0;

function rotateIfOversized() {
  if (sizeCheckPending) return;
  sizeCheckPending = true;
  fs.stat(LOG_PATH, (err, stats) => {
    sizeCheckPending = false;
    if (err || !stats || stats.size < MAX_LOG_BYTES) return;
    try { logStream.end(); } catch (_) { }
    try {
      fs.writeFileSync(LOG_PATH, `[LOG ${new Date().toISOString()}] debug.log rotated after exceeding ${MAX_LOG_BYTES} bytes\n`);
    } catch (_) { }
    try {
      logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
      logStream.on("error", () => { });
    } catch (_) { }
  });
}

function writeLogLine(prefix, args) {
  if (writingLog) return;
  writingLog = true;
  try {
    const message = args.map(x => typeof x === 'object' ? (x instanceof Error ? x.stack : JSON.stringify(x)) : String(x)).join(" ");

    const now = Date.now();
    if (message === lastMessage && now - lastMessageWindowStart < REPEAT_WINDOW_MS) {
      lastMessageCount++;
      if (lastMessageCount > MAX_REPEATS_PER_WINDOW) return;
    } else {
      lastMessage = message;
      lastMessageCount = 1;
      lastMessageWindowStart = now;
    }

    logStream.write(`[${prefix} ${new Date().toISOString()}] ${message}\n`);
    rotateIfOversized();
  } catch (_) {
    // A logging failure must never throw — that's exactly what caused the runaway log before.
  } finally {
    writingLog = false;
  }
}

console.log = (...args) => {
  writeLogLine("LOG", args);
  try { originalLog.apply(console, args); } catch (_) { }
};
console.error = (...args) => {
  writeLogLine("ERROR", args);
  try { originalError.apply(console, args); } catch (_) { }
};


import express from "express";
import { Server as SocketIOServer } from "socket.io";
import serveStatic from "serve-static";

import shopify, { prisma } from "./shopify.js";
import PrivacyWebhookHandlers from "./privacy.js";
import { ArticleSyncService } from "./src/services/ArticleSyncService.js";
import { getEmbedStatus, getMissingScopes } from "./src/services/ThemeEmbedStatusService.js";
import { trackEvent } from "./src/services/AnalyticsTrackingService.js";
import crypto from "crypto";
import postRoutes from "./src/routes/posts.js";
import settingsRoutes from "./src/routes/settings.js";
import billingRoutes from "./src/routes/billing.js";
import importRoutes from "./src/routes/import.js";
import wizardRoutes from "./src/routes/wizard.js";
import supportRoutes from "./src/routes/support.js";
import superAdminRoutes from "./src/routes/superAdmin.js";
import trackingRoutes from "./src/routes/tracking.js";
import publicStylesRoutes from "./src/routes/publicStyles.js";
import sitemapIndexRoutes from "./src/routes/sitemapIndex.js";
import relatedPostsRoutes from "./src/routes/relatedPosts.js";
import patternRoutes from "./src/routes/patterns.js";

// Process-level event handlers to prevent crashes from unhandled network errors
process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("⚠️ Uncaught Exception thrown:", err);
});


// Ensure uploads directory exists
const uploadsDir = join(__dirname, "public/uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();
const httpServer = createServer(app);

// ─── Socket.IO — Custom In-App Chat ────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  path: "/chat-socket",
  cors: { origin: "*" },
});

// In-memory chat store (use DB/Redis for production)
const chatHistory = {};

app.set("chatHistory", chatHistory);
app.set("io", io);

io.on("connection", (socket) => {
  socket.on("join_room", ({ room }) => {
    socket.join(room);
    // Send chat history to the joining client
    socket.emit("history", chatHistory[room] || []);
  });

  socket.on("send_message", (msg) => {
    const room = msg.room;
    if (!room) return;
    if (!chatHistory[room]) chatHistory[room] = [];
    chatHistory[room].push(msg);
    // Keep last 100 messages per room
    if (chatHistory[room].length > 100) chatHistory[room] = chatHistory[room].slice(-100);
    // Broadcast to all in the room (except sender for replies; sender already added optimistically)
    socket.to(room).emit("new_message", msg);
  });

  socket.on("admin_reply", (msg) => {
    const room = msg.room;
    if (!room) return;
    if (!chatHistory[room]) chatHistory[room] = [];
    chatHistory[room].push(msg);
    io.to(room).emit("new_message", msg);
  });
});

import proxyRoutes from "./src/routes/proxy.js";

// ─── Public Tracking Routes (BEFORE Shopify auth — no session needed) ──────
app.use("/track", trackingRoutes);

// ─── Public Global Styles Route (BEFORE Shopify auth — storefront-loaded CSS) ──
app.use("/styles.css", publicStylesRoutes);

// ─── Public Sitemap Route (BEFORE Shopify auth — crawler/search-engine accessible) ──
app.use("/", sitemapIndexRoutes);

// ─── Public Related Posts Routes (BEFORE Shopify auth — fetched live from the storefront) ──
app.use("/", relatedPostsRoutes);

// ─── App Proxy Routes (Validated via Shopify Signature) ──────────────────────
app.use("/api/proxy", proxyRoutes);

// ─── Shopify Auth & Webhook Routes ────────────────────────────────────────────
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res, next) => {
    // Register / update shop in DB after successful OAuth
    try {
      const session = res.locals.shopify?.session;
      if (session?.shop && session?.accessToken) {
        await prisma.shop.upsert({
          where: { domain: session.shop },
          create: {
            domain: session.shop,
            accessToken: session.accessToken,
            planKey: "free",
            installedAt: new Date(),
          },
          update: {
            accessToken: session.accessToken,
            uninstalledAt: null,
          },
        });

        // Register article webhooks for this shop
        try {
          const restClient = new shopify.api.clients.Rest({ session });
          await registerShopifyArticleWebhooks(session.shop, restClient);
        } catch (whErr) {
          console.error("Article webhook registration error:", whErr);
        }

        // Register/sync the declarative webhook topics (ORDERS_CREATE, APP_UNINSTALLED, etc. —
        // whatever's configured via shopify.processWebhooks' webhookHandlers below) against
        // Shopify's Admin API. processWebhooks only wires up the INCOMING delivery handler for
        // requests that arrive at /api/webhooks — it never actually tells Shopify to start
        // sending them. Editing shopify.app.toml's [webhooks] list alone does not create the
        // subscription for an already-installed shop; this explicit call is what does. Missing
        // this call is why ORDERS_CREATE was added to the TOML but never actually subscribed,
        // silently leaving orders/create webhooks undelivered.
        try {
          const registerResult = await shopify.api.webhooks.register({ session });
          for (const [topic, results] of Object.entries(registerResult)) {
            for (const r of results) {
              if (!r.success) console.error(`[WebhookRegister] ${topic} failed:`, r.result);
            }
          }
        } catch (whErr) {
          console.error("Webhook subscription registration error:", whErr);
        }
      }
    } catch (err) {
      console.error("Shop registration error:", err);
    }
    next();
  },
  shopify.redirectToShopifyOrAppRoot()
);

/**
 * Shopify no longer accepts ARTICLES_* webhook subscriptions (422).
 * Keep function for compatibility but skip registration and rely on reconcile polling.
 */
async function registerShopifyArticleWebhooks(shopDomain, restClient) {
  void restClient;
  console.log(`[WebhookRegister] Skipping article webhook registration for ${shopDomain}; using polling reconciliation`);
}

// ─── Legacy manual article webhook endpoint (kept for compatibility) ───────────
// Current production sync uses polling reconciliation, because Shopify rejects
// ARTICLES_* subscriptions with 422.
app.post(
  "/api/webhooks/articles",
  express.text({ type: "*/*" }),
  async (req, res) => {
    const hmac = req.headers["x-shopify-hmac-sha256"];
    const topic = req.headers["x-shopify-topic"];
    const shopDomain = req.headers["x-shopify-shop-domain"];

    if (!hmac || !topic || !shopDomain) {
      console.warn("[ArticleWebhook] Missing required webhook headers");
      return res.status(400).send("Missing webhook headers");
    }

    const apiSecret = process.env.SHOPIFY_API_SECRET;
    if (!apiSecret) {
      console.error("[ArticleWebhook] SHOPIFY_API_SECRET not configured — cannot validate webhooks");
      return res.status(500).send("Server misconfigured");
    }

    // Validate HMAC signature
    const computedHash = crypto
      .createHmac("sha256", apiSecret)
      .update(req.body, "utf8")
      .digest("base64");

    if (computedHash !== hmac) {
      console.error("[ArticleWebhook] Invalid HMAC for " + topic + " from " + shopDomain);
      return res.status(401).send("HMAC validation failed");
    }

    try {
      await ArticleSyncService.handleArticleWebhook(topic, shopDomain, req.body);
      res.status(200).send("OK");
    } catch (err) {
      console.error("[ArticleWebhook] Error processing " + topic + " from " + shopDomain + ":", err);
      // Always return 200 so Shopify doesn't retry
      res.status(200).send("Accepted");
    }
  }
);



app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: {
          ...PrivacyWebhookHandlers,
          APP_SUBSCRIPTIONS_UPDATE: {
            deliveryMethod: "http",
            callbackUrl: "/api/webhooks",
            callback: async (topic, shop, body, webhookId) => {
          try {
            const payload = JSON.parse(body);
            const planName = payload?.app_subscription?.name;
            const status = payload?.app_subscription?.status;
            
            if (planName && status) {
              const shopRecord = await prisma.shop.findUnique({ where: { domain: shop } });
              if (shopRecord) {
                const isActive = status === 'ACTIVE';
                
                // Deactivate previous plans
                if (isActive) {
                  await prisma.appPlan.updateMany({
                    where: { shopId: shopRecord.id, isActive: true },
                    data: { isActive: false }
                  });
                }

                await prisma.appPlan.create({
                  data: {
                    shopId: shopRecord.id,
                    planKey: planName,
                    isActive: isActive
                  }
                });

                if (isActive) {
                  await prisma.shop.update({
                    where: { domain: shop },
                    data: { planKey: planName }
                  });
                } else {
                  await prisma.shop.update({
                    where: { domain: shop },
                    data: { planKey: 'free' }
                  });
                }
              }
            }
          } catch (err) {
            console.error("APP_SUBSCRIPTIONS_UPDATE error:", err);
          }
        },
      },
      APP_UNINSTALLED: {
        deliveryMethod: "http",
        callbackUrl: "/api/webhooks",
        callback: async (topic, shop) => {
          try {
            await prisma.shop.updateMany({
              where: { domain: shop },
              data: { uninstalledAt: new Date() },
            });
          } catch (err) {
            console.error("APP_UNINSTALLED webhook error:", err);
          }
        },
      },
      // Server-side conversion tracking — Shopify checkout/thank-you pages are Shopify-hosted
      // (not theme-rendered) for non-Plus stores, so client-side "thank you page" detection in
      // extensions/analytics-tracker/assets/tracker.js can never reliably run there. Attribution
      // instead travels through checkout as a cart attribute (blogger_source_post_id, written by
      // tracker.js's writeCartAttribute()) — Shopify carries cart attributes through to the
      // resulting order's note_attributes untouched, which this webhook reads back out.
      ORDERS_CREATE: {
        deliveryMethod: "http",
        callbackUrl: "/api/webhooks",
        callback: async (topic, shop, body) => {
          try {
            const order = JSON.parse(body);
            const attrs = Array.isArray(order.note_attributes) ? order.note_attributes : [];
            const postIdAttr = attrs.find((a) => a.name === "blogger_source_post_id")?.value;
            if (!postIdAttr) return; // Order not attributed to any blog post — not an error.

            const postId = Number(postIdAttr);
            if (!Number.isInteger(postId)) return;

            // Idempotency — Shopify webhook delivery is at-least-once; redelivery on a timeout
            // or transient non-2xx must not double-count the same order's conversion.
            const shopRecord = await prisma.shop.findUnique({ where: { domain: shop } });
            if (!shopRecord) return;

            try {
              await prisma.processedOrderWebhook.create({
                data: { shopId: shopRecord.id, orderId: String(order.id) },
              });
            } catch (err) {
              if (err.code === "P2002") return; // Already processed this order.
              throw err;
            }

            // Ownership check — the cart attribute is client-settable (devtools), so a tampered
            // value could at most misattribute within the tamperer's own shop, never write to a
            // post belonging to a different shop.
            const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, shopId: true } });
            if (!post || post.shopId !== shopRecord.id) return;

            // Only note_attributes/total_price/currency/id are read from the payload — never
            // customer PII (email, phone, shipping address, line items), keeping this out of
            // Shopify's Protected Customer Data approval requirements (already special-cased
            // elsewhere in this app — see src/routes/comments.js).
            await trackEvent({
              postId,
              eventType: "conversion",
              shopTimezone: shopRecord.timezone || "",
              value: order.total_price != null ? parseFloat(order.total_price) : null,
              currency: order.currency || null,
            });
          } catch (err) {
            console.error("ORDERS_CREATE webhook error:", err);
          }
        },
      },
      // Server-side checkout-initiation tracking — same reasoning as ORDERS_CREATE above, but one
      // step earlier. Client-side click/submit detection in tracker.js can only ever catch a
      // *standard* storefront checkout button, on the merchant's own cart page, before navigation
      // — it structurally cannot see accelerated/express checkout buttons (Shop Pay, Buy it now —
      // rendered as a cross-origin iframe) or B2B/company checkout flows that don't originate from
      // a normal cart page click at all. checkouts/create fires server-side the moment ANY
      // checkout session begins, regardless of how — confirmed necessary after a real B2B test
      // order completed with $0 checkouts recorded despite the click-based detection.
      CHECKOUTS_CREATE: {
        deliveryMethod: "http",
        callbackUrl: "/api/webhooks",
        callback: async (topic, shop, body) => {
          try {
            const checkout = JSON.parse(body);
            const attrs = Array.isArray(checkout.note_attributes) ? checkout.note_attributes : [];
            const postIdAttr = attrs.find((a) => a.name === "blogger_source_post_id")?.value;
            if (!postIdAttr) return; // Checkout not attributed to any blog post — not an error.

            const postId = Number(postIdAttr);
            if (!Number.isInteger(postId)) return;

            const shopRecord = await prisma.shop.findUnique({ where: { domain: shop } });
            if (!shopRecord) return;

            // Same idempotency table as ORDERS_CREATE, namespaced by a "checkout-" prefix so a
            // checkout id can never collide with an order id in the shared unique constraint.
            try {
              await prisma.processedOrderWebhook.create({
                data: { shopId: shopRecord.id, orderId: `checkout-${checkout.id}` },
              });
            } catch (err) {
              if (err.code === "P2002") return; // Already processed this checkout.
              throw err;
            }

            const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, shopId: true } });
            if (!post || post.shopId !== shopRecord.id) return;

            // No value/currency — "checkout" only increments the checkouts counter, not revenue
            // (that's ORDERS_CREATE's job, once the purchase actually completes).
            await trackEvent({
              postId,
              eventType: "checkout",
              shopTimezone: shopRecord.timezone || "",
            });
          } catch (err) {
            console.error("CHECKOUTS_CREATE webhook error:", err);
          }
        },
      },
    },
  })
);

// ─── API Routes (Protected by Shopify session) ───────────────────────────────
const validateSession = shopify.validateAuthenticatedSession();
app.use("/api", (req, res, next) => {
  Promise.resolve(validateSession(req, res, next)).catch(async (err) => {
    console.error("⚠️ Session validation error caught in wrapper:", err);
    
    // Check if it's a 403 Forbidden, invalid token, or expired token error
    const isForbidden = err.message?.includes("403") || 
                        err.message?.includes("Forbidden") || 
                        err.message?.includes("access tokens") || 
                        err.message?.includes("token");

    if (isForbidden) {
      try {
        // Resolve shop domain from session, query, or headers
        const shopDomain = req.query.shop || 
                           req.headers["x-shopify-shop-domain"] || 
                           res.locals.shopify?.session?.shop;
                           
        if (shopDomain) {
          console.log(`Deleting invalid session for shop: ${shopDomain}`);
          await prisma.session.deleteMany({
            where: { shop: shopDomain }
          });
        }
      } catch (dbErr) {
        console.error("Error deleting invalid session:", dbErr);
      }
    }

    if (!res.headersSent) {
      const shopDomain = req.query.shop || 
                         req.headers["x-shopify-shop-domain"] || 
                         res.locals.shopify?.session?.shop || 
                         "";
      const redirectUrl = `/api/auth?shop=${encodeURIComponent(shopDomain)}`;
      
      // Set headers for Shopify App Bridge v3 auto-intercept re-authorization
      res.setHeader("X-Shopify-API-Request-Failure-Reauthorize", "1");
      res.setHeader("X-Shopify-API-Request-Failure-Reauthorize-Url", redirectUrl);
      
      res.status(403).json({
        error: "Session validation failed",
        details: err.message,
        reauthorizeUrl: redirectUrl
      });
    }
  });
});
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Shop info + plan
app.get("/api/shop", async (_req, res) => {
  try {
    const session = res.locals.shopify?.session;
    let shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
    if (!shop) return res.status(404).json({ error: "Shop not found" });

    // Lazily backfill the shop's IANA timezone (used for scheduling date/time conversion) —
    // fetched once and cached, no separate migration/backfill script needed.
    if (!shop.timezone) {
      try {
        const client = new shopify.api.clients.Graphql({ session });
        const result = await client.request(`query { shop { ianaTimezone } }`);
        const tz = result.data?.shop?.ianaTimezone;
        if (tz) shop = await prisma.shop.update({ where: { id: shop.id }, data: { timezone: tz } });
      } catch (err) {
        console.warn("[Shop] Failed to fetch ianaTimezone:", err.message);
      }
    }

    res.json({ shop });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Setup status — one consolidated check for every "must be configured outside this app's own
// settings pages" requirement: theme app-embed activation (analytics tracker + meta robots),
// whether the merchant's theme supports app embeds at all, missing OAuth scopes, and whether
// they've published a first post. See src/services/ThemeEmbedStatusService.js.
app.get("/api/shop/setup-status", async (_req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });

    const [embedStatus, hasPosts] = await Promise.all([
      getEmbedStatus(session),
      shop ? prisma.post.count({ where: { shopId: shop.id } }).then((c) => c > 0) : Promise.resolve(false),
    ]);

    res.json({
      ...embedStatus,
      hasPosts,
      missingScopes: getMissingScopes(session),
    });
  } catch (err) {
    console.error("[SetupStatus] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Posts (blog articles)
app.use("/api/posts", postRoutes);

// Comments
import commentRoutes from "./src/routes/comments.js";
app.use("/api/comments", commentRoutes);

// Settings
app.use("/api/settings", settingsRoutes);

// Billing
app.use("/api/billing", billingRoutes);

// Importer
app.use("/api/import", importRoutes);

// Wizard
app.use("/api/wizard", wizardRoutes);

// Support
app.use("/api/support", supportRoutes);

// Reusable Patterns
app.use("/api/patterns", patternRoutes);

// Super Admin API
app.use("/admin-api", superAdminRoutes);

// ─── Manual webhook re-registration endpoint ──────────────────────
app.post("/api/articles/re-register-webhooks", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const restClient = new shopify.api.clients.Rest({ session });
    await registerShopifyArticleWebhooks(session.shop, restClient);
    res.json({ success: true, message: "Article webhooks re-registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Static uploads
app.use("/uploads", express.static(uploadsDir));

// ─── Frontend Serving ─────────────────────────────────────────────────────────
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use(shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

// Global Express error handler
app.use((err, req, res, next) => {
  console.error("⚠️ Express Error Handler caught:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

httpServer.listen(PORT, async () => {
  console.log(`🚀 Shopify Blog App backend running on port ${PORT}`);
  console.log(`💬 WebSocket chat server active on path /chat-socket`);

  // Register article webhooks for existing shops that already have the app installed.
  // New shops get webhooks registered during OAuth callback.
  try {
    const existingShops = await prisma.shop.findMany({
      where: { uninstalledAt: null },
      select: { domain: true },
    });
    for (const shop of existingShops) {
      try {
        const sessions = await shopify.config.sessionStorage.findSessionsByShop(shop.domain);
        const validSession = sessions?.find(s => s.accessToken);
        if (validSession) {
          const restClient = new shopify.api.clients.Rest({ session: validSession });
          await registerShopifyArticleWebhooks(shop.domain, restClient);

          // Self-heal the declarative webhook subscriptions (APP_UNINSTALLED, ORDERS_CREATE,
          // CHECKOUTS_CREATE, etc.) against whatever HOST/tunnel is current right now. In this
          // dev environment the tunnel URL rotates on nearly every server restart, and
          // shopify.api.webhooks.register() is idempotent — it updates each subscription's
          // callbackUrl if it's changed, or creates it if missing — so running this on every
          // boot keeps webhook delivery correct without needing a reauth or manual fix each
          // time. This directly addresses the repeated "webhook worked, then silently stopped
          // after a restart" failure mode hit multiple times this session.
          try {
            const registerResult = await shopify.api.webhooks.register({ session: validSession });
            for (const [topic, results] of Object.entries(registerResult)) {
              for (const r of results) {
                if (!r.success) console.error(`[Startup] Webhook self-heal ${topic} failed for ${shop.domain}:`, r.result);
              }
            }
          } catch (whErr) {
            console.error(`[Startup] Webhook self-heal error for ${shop.domain}:`, whErr.message);
          }
        }
      } catch (shopErr) {
        console.warn(`[Startup] Failed to register webhooks for ${shop.domain}:`, shopErr.message);
      }
    }
  } catch (err) {
    console.error("Failed to register webhooks for existing shops:", err.message);
  }

  // Start background reconciliation for near real-time 2-way sync.
  ArticleSyncService.startReconciliationScheduler(1);
});
