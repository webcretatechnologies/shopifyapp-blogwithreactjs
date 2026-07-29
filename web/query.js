import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const post = await prisma.post.findFirst({
    where: { title: { contains: "ABC" } }
  });
  if (post) {
     console.log(Object.keys(post));
     console.log(post.shopifyArticle);
  }
}
main().finally(() => prisma.$disconnect());
