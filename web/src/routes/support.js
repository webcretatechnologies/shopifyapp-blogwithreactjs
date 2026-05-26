import express from "express";
import shopify, { prisma } from "../../shopify.js";
import EmailService from "../services/EmailService.js";

const router = express.Router();

// Save feedback and support requests, send notification email, and log transactions
router.post("/feedback", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const { subject, message, rating, page } = req.body;

    // Validate
    if (!subject || !message) {
      return res.status(400).json({ error: "Subject and message are required" });
    }

    // Get Shop record
    const shop = await prisma.shop.findUnique({
      where: { domain: session.shop },
    });
    if (!shop) {
      return res.status(404).json({ error: "Shop not found" });
    }

    // 1. Save to Database
    const feedback = await prisma.feedback.create({
      data: {
        shopId: shop.id,
        topic: subject,
        message,
        rating: rating ? parseInt(rating, 10) : null,
        page: page || "/support",
      },
    });

    // 2. Trigger Email notification to admin (uses EmailService)
    const emailSubject = `[Support Request] ${subject} - ${session.shop}`;
    const emailBody = `Support request details:
----------------------------------------
Store: ${session.shop}
Feedback ID: ${feedback.id}
Rating: ${rating || "Not provided"}
Subject: ${subject}
Page: ${page || "/support"}
Submitted At: ${new Date().toLocaleString()}

Message:
${message}
----------------------------------------`;

    await EmailService.sendSupportEmail({
      subject: emailSubject,
      body: emailBody,
      template: "support_request",
      shopDomain: session.shop,
    });

    res.json({ success: true, message: "Feedback submitted successfully." });
  } catch (err) {
    console.error("POST /api/support/feedback error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
