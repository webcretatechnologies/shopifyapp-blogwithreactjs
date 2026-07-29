const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const post = await prisma.post.findFirst({
    where: {
      title: { contains: "ABC" }
    }
  });
  if (post) {
    console.log("Found post:", post.title);
    console.log("has contentJson?", !!post.contentJson, "length:", JSON.stringify(post.contentJson).length);
    console.log("has contentHtml?", !!post.contentHtml, "length:", post.contentHtml?.length);
    if (post.contentHtml) {
      console.log("contentHtml contains table?", post.contentHtml.includes("<table"));
    }
  } else {
    console.log("Post not found");
  }
}
main().finally(() => prisma.$disconnect());
