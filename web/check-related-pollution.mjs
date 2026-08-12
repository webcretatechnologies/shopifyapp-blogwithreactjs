import { prisma } from "./shopify.js";
const post = await prisma.post.findUnique({ where: { id: 8 }, select: { contentHtml: true } });
const count = (post.contentHtml.match(/blogger-related-posts"/g) || []).length;
console.log("Occurrences of blogger-related-posts in stored contentHtml:", count);
process.exit(0);
