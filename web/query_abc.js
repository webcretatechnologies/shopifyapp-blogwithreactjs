import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const post = await prisma.post.findFirst({
    where: { title: { contains: "ABC Template" } }
  });
  if (post) {
     console.log("ID:", post.id);
     console.log("Shopify Article string:", !!post.shopifyArticle);
     console.log("Content JSON:", post.contentJson ? "Exists" : "Null");
     if (post.shopifyArticle) {
       const article = typeof post.shopifyArticle === 'string' ? JSON.parse(post.shopifyArticle) : post.shopifyArticle;
       console.log("Original body_html length:", article.body_html?.length);
     }
  } else {
    console.log("Not found");
  }
}
main().finally(() => prisma.$disconnect());
