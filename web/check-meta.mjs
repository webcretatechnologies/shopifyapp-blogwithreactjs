import { prisma } from "./shopify.js";
const post = await prisma.post.findUnique({ where: { id: 10 }, select: { metaDescription: true, excerpt: true, metaTitle: true, title: true } });
console.log(JSON.stringify(post, null, 2));
process.exit(0);
