// @ts-check
import { join, dirname } from "path";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { createServer } from "http";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

import fs from "fs";
const logStream = fs.createWriteStream(join(__dirname, "debug.log"), { flags: "a" });
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
  logStream.write(`[LOG ${new Date().toISOString()}] ${args.map(x => typeof x === 'object' ? (x instanceof Error ? x.stack : JSON.stringify(x)) : String(x)).join(" ")}\n`);
  originalLog.apply(console, args);
};
console.error = (...args) => {
  logStream.write(`[ERROR ${new Date().toISOString()}] ${args.map(x => typeof x === 'object' ? (x instanceof Error ? x.stack : JSON.stringify(x)) : String(x)).join(" ")}\n`);
  originalError.apply(console, args);
};


import express from "express";
import { Server as SocketIOServer } from "socket.io";
import serveStatic from "serve-static";

import shopify, { prisma } from "./shopify.js";
import PrivacyWebhookHandlers from "./privacy.js";
import { ArticleSyncService } from "./src/services/ArticleSyncService.js";
import crypto from "crypto";
import postRoutes from "./src/routes/posts.js";
import settingsRoutes from "./src/routes/settings.js";
import billingRoutes from "./src/routes/billing.js";
import importRoutes from "./src/routes/import.js";
import wizardRoutes from "./src/routes/wizard.js";
import supportRoutes from "./src/routes/support.js";
import superAdminRoutes from "./src/routes/superAdmin.js";
import trackingRoutes from "./src/routes/tracking.js";

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

// ─── Public Tracking Routes (BEFORE Shopify auth — no session needed) ──────
app.use("/track", trackingRoutes);

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
    const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    res.json({ shop });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Posts (blog articles)
app.use("/api/posts", postRoutes);

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
