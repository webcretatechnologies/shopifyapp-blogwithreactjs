import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const posts = await prisma.post.findMany({
    take: 5,
    orderBy: { updatedAt: "desc" },
    include: { shopifyArticle: true }
  });

  console.log("LAST 5 POSTS:");
  for (const post of posts) {
    console.log("-----------------------------------------");
    console.log("ID:", post.id);
    console.log("Title:", post.title);
    console.log("Status:", post.status);
    console.log("Shopify Article:", post.shopifyArticle);
    console.log("contentHtml (length):", post.contentHtml?.length || 0);
    console.log("contentHtml snippet:", post.contentHtml?.substring(0, 500));
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
