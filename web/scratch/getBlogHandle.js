import shopify, { prisma } from "../shopify.js";

async function main() {
  const session = await shopify.config.sessionStorage.loadSession("offline_rajiv-market-shop.myshopify.com");
  const client = new shopify.api.clients.Rest({ session });
  
  const blogRes = await client.get({
    path: "blogs/102435094846"
  });
  const blog = blogRes.body.blog;
  console.log("Blog:", blog);

  const articleRes = await client.get({
    path: "blogs/102435094846/articles/693428617534"
  });
  const article = articleRes.body.article;
  console.log("Article:", article);
  console.log("Article URL:", `https://rajiv-market-shop.myshopify.com/blogs/${blog.handle}/${article.handle}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
