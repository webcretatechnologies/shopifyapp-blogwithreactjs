/**
 * RelatedPostsService
 *
 * Selects the posts for the "Related posts" block, read live by web/src/routes/relatedPosts.js
 * on every storefront page view (not baked into body_html at sync time — see that file's
 * docblock for why). Manual picks (PostRelatedPost) always win when present; otherwise falls
 * back to an automatic same-category/shared-tag match within the same Shopify blog, topped up
 * with the most recent other posts so the block is never sparse.
 */
import { prisma } from "../../shopify.js";

/**
 * @returns {Promise<Array<{title:string, slug:string, featuredImage:string|null, excerpt:string|null}>>}
 */
export async function getRelatedPosts(postId, shopId, shopifyBlogId, count) {
  if (!count || count <= 0) return [];

  const manualRows = await prisma.postRelatedPost.findMany({
    where: { postId },
    orderBy: { position: "asc" },
    include: { relatedPost: { include: { shopifyArticle: true } } },
  });

  const manualPicks = manualRows
    .map((r) => r.relatedPost)
    .filter((p) => p && p.status === "published" && p.shopifyArticle?.shopifyArticleId);

  if (manualPicks.length > 0) {
    return manualPicks.slice(0, count).map((p) => ({
      title: p.title,
      slug: p.slug,
      featuredImage: p.featuredImage || null,
      excerpt: p.excerpt || null,
    }));
  }

  if (!shopifyBlogId) return [];

  const currentPost = await prisma.post.findUnique({
    where: { id: postId },
    select: { categoryId: true, tags: { select: { tagId: true } } },
  });
  if (!currentPost) return [];
  const currentTagIds = new Set(currentPost.tags.map((t) => t.tagId));

  const candidates = await prisma.post.findMany({
    where: {
      shopId,
      id: { not: postId },
      status: "published",
      shopifyArticle: { shopifyBlogId: String(shopifyBlogId), shopifyArticleId: { not: null } },
    },
    include: { tags: { select: { tagId: true } } },
    orderBy: { updatedAt: "desc" },
  });
  if (candidates.length === 0) return [];

  const scored = candidates.map((p) => {
    let score = 0;
    if (currentPost.categoryId && p.categoryId === currentPost.categoryId) score += 10;
    for (const t of p.tags) {
      if (currentTagIds.has(t.tagId)) score += 2;
    }
    return { post: p, score };
  });

  scored.sort((a, b) => b.score - a.score || b.post.updatedAt - a.post.updatedAt);

  // Scored matches first, then fill any remaining slots with the most-recent leftovers (already
  // in updatedAt-desc order from the query) so the block is never sparse when overlap is thin.
  const selected = scored.slice(0, count).map((s) => s.post);

  return selected.map((p) => ({
    title: p.title,
    slug: p.slug,
    featuredImage: p.featuredImage || null,
    excerpt: p.excerpt || null,
  }));
}

export default { getRelatedPosts };
