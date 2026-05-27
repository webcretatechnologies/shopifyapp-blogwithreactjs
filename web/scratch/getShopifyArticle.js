import shopify, { prisma } from "../shopify.js";

async function main() {
  const session = await shopify.config.sessionStorage.loadSession("offline_rajiv-market-shop.myshopify.com");
  if (!session) {
    console.error("Session not found");
    return;
  }
  
  const client = new shopify.api.clients.Rest({ session });
  console.log("Fetching article...");
  const response = await client.get({
    path: "blogs/102435094846/articles/693428617534"
  });
  
  console.log("Article Title:", response.body.article.title);
  console.log("Article Body HTML length:", response.body.article.body_html.length);
  console.log("Article Body HTML:");
  console.log(response.body.article.body_html);
}

main().catch(console.error).finally(() => prisma.$disconnect());
