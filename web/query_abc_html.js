import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const post = await prisma.post.findUnique({
    where: { id: 10 }
  });
  console.log("contentHtml includes '<table>':", post.contentHtml?.includes("<table"));
  console.log("contentHtml length:", post.contentHtml?.length);
}
main().finally(() => prisma.$disconnect());
