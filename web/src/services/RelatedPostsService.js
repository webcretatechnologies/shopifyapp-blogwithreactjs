/**
 * RelatedPostsService
 *
 * Selects posts for the "Related posts" block, read live by web/src/routes/relatedPosts.js
 * (and the sidebar related widget) on every storefront page view.
 *
 * Modes (shop default or per-post override):
 *   manual   — only PostRelatedPost picks (no auto-fill)
 *   category — same categoryId only
 *   random   — shuffled same-blog published posts
 *   smart    — category + shared-tag score, then recent fill (legacy default)
 */
import { prisma } from "../../shopify.js";

export const RELATED_SOURCE_MODES = ["smart", "category", "random", "manual"];

/**
 * @param {string|null|undefined} mode
 * @returns {"smart"|"category"|"random"|"manual"}
 */
export function normalizeRelatedSourceMode(mode) {
  const m = String(mode || "").toLowerCase().trim();
  return RELATED_SOURCE_MODES.includes(m) ? m : "smart";
}

function mapPost(p) {
  return {
    title: p.title,
    slug: p.slug,
    featuredImage: p.featuredImage || null,
    excerpt: p.excerpt || null,
  };
}

async function getManualPicks(postId, count) {
  const manualRows = await prisma.postRelatedPost.findMany({
    where: { postId },
    orderBy: { position: "asc" },
    include: { relatedPost: { include: { shopifyArticle: true } } },
  });

  return manualRows
    .map((r) => r.relatedPost)
    .filter((p) => p && p.status === "published" && p.shopifyArticle?.shopifyArticleId)
    .slice(0, count)
    .map(mapPost);
}

async function getSameBlogCandidates(shopId, postId, shopifyBlogId, extraWhere = {}) {
  return prisma.post.findMany({
    where: {
      shopId,
      id: { not: postId },
      status: "published",
      shopifyArticle: { shopifyBlogId: String(shopifyBlogId), shopifyArticleId: { not: null } },
      ...extraWhere,
    },
    include: { tags: { select: { tagId: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @param {number} postId
 * @param {number} shopId
 * @param {string|number|null} shopifyBlogId
 * @param {number|{count?:number, mode?:string}} countOrOpts
 * @returns {Promise<Array<{title:string, slug:string, featuredImage:string|null, excerpt:string|null}>>}
 */
export async function getRelatedPosts(postId, shopId, shopifyBlogId, countOrOpts) {
  const opts =
    typeof countOrOpts === "object" && countOrOpts !== null
      ? countOrOpts
      : { count: countOrOpts };

  const count = parseInt(opts.count, 10) || 0;
  const mode = normalizeRelatedSourceMode(opts.mode);

  if (!count || count <= 0) return [];

  if (mode === "manual") {
    return getManualPicks(postId, count);
  }

  // Backward compatible: on smart mode, existing manual picks still win (old behavior).
  // Explicit category/random ignore picks so those modes stay predictable.
  if (mode === "smart") {
    const manual = await getManualPicks(postId, count);
    if (manual.length > 0) return manual;
  }

  if (!shopifyBlogId) return [];

  if (mode === "category") {
    const current = await prisma.post.findUnique({
      where: { id: postId },
      select: { categoryId: true },
    });
    if (!current?.categoryId) return [];
    const peers = await getSameBlogCandidates(shopId, postId, shopifyBlogId, {
      categoryId: current.categoryId,
    });
    return peers.slice(0, count).map(mapPost);
  }

  if (mode === "random") {
    const candidates = await getSameBlogCandidates(shopId, postId, shopifyBlogId);
    if (candidates.length === 0) return [];
    return shuffleInPlace([...candidates]).slice(0, count).map(mapPost);
  }

  // smart (default)
  const currentPost = await prisma.post.findUnique({
    where: { id: postId },
    select: { categoryId: true, tags: { select: { tagId: true } } },
  });
  if (!currentPost) return [];
  const currentTagIds = new Set(currentPost.tags.map((t) => t.tagId));

  const candidates = await getSameBlogCandidates(shopId, postId, shopifyBlogId);
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

  return scored.slice(0, count).map((s) => mapPost(s.post));
}

/**
 * Resolve effective related-posts source mode for a post given shop default + optional override.
 * Post value "inherit" or empty → shop default.
 */
export function resolveRelatedSourceMode(shopMode, postMode) {
  const post = String(postMode || "").toLowerCase().trim();
  if (!post || post === "inherit") {
    return normalizeRelatedSourceMode(shopMode);
  }
  return normalizeRelatedSourceMode(post);
}

export default { getRelatedPosts, normalizeRelatedSourceMode, resolveRelatedSourceMode, RELATED_SOURCE_MODES };
