import { prisma } from "../shopify.js";

async function main() {
  const shop = "rajiv-market-shop.myshopify.com";
  console.log(`Deleting all sessions for shop: ${shop}`);
  const result = await prisma.session.deleteMany({
    where: { shop }
  });
  console.log(`Deleted ${result.count} sessions.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
