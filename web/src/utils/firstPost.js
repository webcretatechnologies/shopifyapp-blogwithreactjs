/**
 * Whether the post just created is the shop's first ever post — used to trigger the
 * one-time "Congratulations" celebration regardless of which creation path produced it
 * (manual create, AI generation, or Shopify import).
 */
export async function isShopFirstPost(prisma, shopId) {
  const postCount = await prisma.post.count({ where: { shopId } });
  return postCount === 1;
}
