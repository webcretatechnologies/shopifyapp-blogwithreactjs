import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const posts = await prisma.post.findMany();
  for (const p of posts) {
    console.log(p.id, p.title);
  }
}
main().finally(() => prisma.$disconnect());
