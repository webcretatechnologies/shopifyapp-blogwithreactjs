// @ts-check
import { join, dirname } from "path";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { createServer } from "http";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

import express from "express";
import { Server as SocketIOServer } from "socket.io";
import serveStatic from "serve-static";

import shopify, { prisma } from "./shopify.js";
import PrivacyWebhookHandlers from "./privacy.js";
import postRoutes from "./src/routes/posts.js";
import settingsRoutes from "./src/routes/settings.js";
import billingRoutes from "./src/routes/billing.js";
import { ArticleWebhookHandlers } from "./src/webhooks/articles.js";
import importRoutes from "./src/routes/import.js";
import wizardRoutes from "./src/routes/wizard.js";
import supportRoutes from "./src/routes/support.js";
import superAdminRoutes from "./src/routes/superAdmin.js";

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
      }
    } catch (err) {
      console.error("Shop registration error:", err);
    }
    next();
  },
  shopify.redirectToShopifyOrAppRoot()
);

app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({
    webhookHandlers: {
      ...PrivacyWebhookHandlers,
      ...ArticleWebhookHandlers,
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
app.use("/api/*", shopify.validateAuthenticatedSession());
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

// Static uploads
app.use("/uploads", express.static(uploadsDir));

// ─── Frontend Serving ─────────────────────────────────────────────────────────
app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Shopify Blog App backend running on port ${PORT}`);
  console.log(`💬 WebSocket chat server active on path /chat-socket`);
});
