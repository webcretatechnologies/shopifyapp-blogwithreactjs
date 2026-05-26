import express from "express";
import shopify from "../../shopify.js";

const router = express.Router();

// Mock saving feedback to a DB or sending an email
router.post("/feedback", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const { subject, message, rating } = req.body;

    // Validate
    if (!subject || !message) {
      return res.status(400).json({ error: "Subject and message are required" });
    }

    // Here you would normally:
    // 1. Send an email to the support team
    // 2. Save it to a SupportTicket table in the DB
    // For now, we'll just log it.
    console.log(`[Support Feedback from ${session.shop}]:`, { subject, message, rating });

    res.json({ success: true, message: "Feedback submitted successfully." });
  } catch (err) {
    console.error("POST /api/support/feedback error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
