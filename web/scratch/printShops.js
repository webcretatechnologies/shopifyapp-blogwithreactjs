import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.findMany();
  console.log("Sessions:", sessions.map(s => ({ id: s.id, shop: s.shop, state: s.state })));
  const shopifyArticles = await prisma.shopifyArticle.findMany();
  console.log("ShopifyArticles:", shopifyArticles);
}

main().catch(console.error).finally(() => prisma.$disconnect());
