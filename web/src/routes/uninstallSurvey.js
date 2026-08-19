import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

// Same secret/signing pattern superAdmin.js uses for its own tokens.
const SECRET = process.env.SHOPIFY_API_SECRET || "super-admin-secret-key-123";

const REASONS = [
  "Not using the store anymore",
  "App didn't work as expected",
  "Missing features I needed",
  "Too expensive",
  "Hard to set up / use",
  "Switched to a different app",
  "Other",
];

export function signUninstallSurveyToken(shopDomain) {
  return jwt.sign({ domain: shopDomain }, SECRET, { expiresIn: "14d" });
}

function verifyToken(shop, token) {
  try {
    const decoded = jwt.verify(token, SECRET);
    return decoded.domain === shop;
  } catch {
    return false;
  }
}

function page(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quick feedback</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f6f7;margin:0;padding:40px 16px;color:#202223;}
.card{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);}
h1{font-size:20px;margin:0 0 8px;}
p{color:#6d7175;font-size:14px;margin:0 0 20px;}
label{display:block;padding:10px 12px;border:1px solid #e1e3e5;border-radius:8px;margin-bottom:8px;cursor:pointer;font-size:14px;}
label:hover{border-color:#008060;}
input[type=radio]{margin-right:10px;}
textarea{width:100%;box-sizing:border-box;border:1px solid #e1e3e5;border-radius:8px;padding:10px;font-size:14px;font-family:inherit;margin-top:12px;min-height:80px;}
button{margin-top:20px;background:#008060;color:#fff;border:none;border-radius:8px;padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer;}
button:hover{background:#006e52;}
</style></head><body><div class="card">${body}</div></body></html>`;
}

// ─── GET /uninstall-survey?shop=&token= — Public feedback form ────────────────
router.get("/uninstall-survey", async (req, res) => {
  const { shop, token } = req.query;
  if (!shop || !token || !verifyToken(shop, token)) {
    return res.status(200).send(page(`<h1>This link has expired</h1><p>Thanks anyway for trying the app.</p>`));
  }

  const options = REASONS.map(
    (r) => `<label><input type="radio" name="reason" value="${r}" required>${r}</label>`
  ).join("");

  res.send(
    page(`
      <h1>Sorry to see you go</h1>
      <p>Mind telling us why you uninstalled? It takes 10 seconds and helps us improve.</p>
      <form method="POST" action="/uninstall-survey">
        <input type="hidden" name="shop" value="${shop}">
        <input type="hidden" name="token" value="${token}">
        ${options}
        <textarea name="message" placeholder="Anything else you'd like to add? (optional)"></textarea>
        <button type="submit">Send feedback</button>
      </form>
    `)
  );
});

// ─── POST /uninstall-survey — Records one feedback row ────────────────────────
router.post("/uninstall-survey", express.urlencoded({ extended: false }), async (req, res) => {
  const { shop, token, reason, message } = req.body;
  if (!shop || !token || !verifyToken(shop, token) || !reason) {
    return res.status(200).send(page(`<h1>This link has expired</h1><p>Thanks anyway for trying the app.</p>`));
  }

  try {
    await prisma.uninstallFeedback.create({
      data: { shopDomain: shop, reason, message: message || null },
    });
  } catch (err) {
    console.error("uninstall-survey submit error:", err);
  }

  res.send(page(`<h1>Thanks for the feedback</h1><p>We appreciate you taking the time.</p>`));
});

export default router;
