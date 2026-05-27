import shopify, { prisma } from "../shopify.js";

async function main() {
  const session = await shopify.config.sessionStorage.loadSession("offline_rajiv-market-shop.myshopify.com");
  const client = new shopify.api.clients.Rest({ session });
  
  const response = await client.get({
    path: "blogs/102435094846/articles/693336441150"
  });

  const bodyHtml = response.body?.article?.body_html || "";
  console.log("Starts with style?", bodyHtml.trim().startsWith("<style id=\"blogger-custom-styles\">"));
  console.log("Includes blogger-article-container?", bodyHtml.includes("class=\"blogger-article-container\""));
  console.log("Starts with (first 400 chars):\n", bodyHtml.substring(0, 400));
}

main().catch(console.error).finally(() => prisma.$disconnect());
