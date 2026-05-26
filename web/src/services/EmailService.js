import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

class EmailService {
  /**
   * Sends a support email, logs to DB, and handles SMTP vs local log driver fallback
   */
  static async sendSupportEmail({ subject, body, template = "support_request", shopDomain = null }) {
    const supportAdminEmail = process.env.SUPPORT_ADMIN_EMAIL || "hello@example.com";
    return this.sendEmail({ to: supportAdminEmail, subject, body, template, shopDomain });
  }

  /**
   * Sends a general email to a custom recipient, logs to DB, and handles SMTP vs local log driver fallback
   */
  static async sendEmail({ to, subject, body, template = "custom", shopDomain = null }) {
    const host = process.env.MAIL_HOST;
    const port = parseInt(process.env.MAIL_PORT || "587", 10);
    const user = process.env.MAIL_USERNAME;
    const pass = process.env.MAIL_PASSWORD;
    const fromAddress = process.env.MAIL_FROM_ADDRESS || "noreply@webcreta.com";
    const fromName = process.env.MAIL_FROM_NAME || "Shopify Blog App";

    const isSmtpConfigured = host && user && pass;

    if (!isSmtpConfigured) {
      console.warn(`[EmailService] SMTP settings not fully configured in .env. Printing email to logs instead.`);
      console.log(`================ EMAIL LOG ================`);
      console.log(`From: "${fromName}" <${fromAddress}>`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body:\n${body}`);
      console.log(`===========================================`);

      await prisma.emailLog.create({
        data: {
          recipientEmail: to,
          recipientDomain: shopDomain,
          subject,
          body,
          template,
          status: "sent",
        }
      });

      return { success: true, loggedOnly: true };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });

      await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        text: body,
      });

      await prisma.emailLog.create({
        data: {
          recipientEmail: to,
          recipientDomain: shopDomain,
          subject,
          body,
          template,
          status: "sent",
        }
      });

      return { success: true };
    } catch (error) {
      console.error("[EmailService] SMTP send error:", error);

      await prisma.emailLog.create({
        data: {
          recipientEmail: to,
          recipientDomain: shopDomain,
          subject,
          body,
          template,
          status: "failed",
        }
      });

      return { success: false, error: error.message };
    }
  }
}

export default EmailService;

