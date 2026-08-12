/**
 * Related posts routes (PUBLIC — no session auth required)
 *
 * Unlike the rest of an article's body, related posts must reflect the current
 * showRelatedPosts/relatedPostsCount settings the moment they change — not just on that post's
 * next Save & Sync. EditorContentCompiler.compileForStorefront bakes only a placeholder div
 * (`data-related-posts data-post-id="..."`) plus a <script src=".../related-posts.js"> into every
 * synced article; this file supplies both halves of the live mechanism: the JSON endpoint the
 * script fetches (reading settings fresh on every request, same pattern as publicStyles.js), and
 * the script itself.
 *
 * Accessed cross-domain from Shopify storefronts, so both routes must be mounted BEFORE any
 * Shopify session validation middleware — same placement as tracking.js/publicStyles.js.
 *
 *   GET /related-posts.json?postId=<id>&shop=<shop-domain>
 *   GET /related-posts.js
 */
import express from "express";
import { prisma } from "../../shopify.js";
import shopify from "../../shopify.js";
import { getRelatedPosts } from "../services/RelatedPostsService.js";

const router = express.Router();

// Same resolution as EditorContentCompiler.js/ArticleSyncService.js's APP_URL — the app's own
// public base URL, needed here so the served script knows where to fetch related-posts.json from
// without requiring an extra data-* attribute on the placeholder div.
const APP_URL = process.env.HOST || process.env.APP_URL || `https://${process.env.SHOPIFY_APP_HOST || "localhost:3000"}`;

// ─── Abuse guard ──────────────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 1000;
const dataCache = new Map(); // `${shop}:${postId}` -> { body, expiresAt }

router.get("/related-posts.json", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=15");

  const shopDomain = String(req.query.shop || "").trim();
  const postId = parseInt(req.query.postId, 10);
  if (!shopDomain || !Number.isInteger(postId)) {
    res.status(400).json({ show: false, items: [] });
    return;
  }

  const cacheKey = `${shopDomain}:${postId}`;
  const cached = dataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.send(cached.body);
    return;
  }

  const empty = JSON.stringify({ show: false, items: [] });

  try {
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain }, include: { settings: true } });
    if (!shop) {
      res.send(empty);
      return;
    }

    const settings = (shop.settings || []).reduce((acc, s) => {
      let val = s.value;
      if (val === "true") val = true;
      else if (val === "false") val = false;
      acc[s.key] = val;
      return acc;
    }, {});

    const showRelated = settings.showRelatedPosts !== false && settings.showRelatedPosts !== "false";
    const count = parseInt(settings.relatedPostsCount, 10) || 3;
    if (!showRelated || count <= 0) {
      dataCache.set(cacheKey, { body: empty, expiresAt: Date.now() + CACHE_TTL_MS });
      res.send(empty);
      return;
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, shopId: shop.id },
      select: { shopifyArticle: { select: { shopifyBlogId: true } } },
    });
    const blogId = post?.shopifyArticle?.shopifyBlogId;
    if (!post || !blogId) {
      dataCache.set(cacheKey, { body: empty, expiresAt: Date.now() + CACHE_TTL_MS });
      res.send(empty);
      return;
    }

    const session = await prisma.session.findFirst({ where: { shop: shopDomain, isOnline: false } });
    if (!session) {
      res.send(empty);
      return;
    }
    const client = new shopify.api.clients.Graphql({
      session: { shop: session.shop, accessToken: session.accessToken, isOnline: false },
    });
    const blogRes = await client.request(
      `query GetBlogHandle($id: ID!) { blog(id: $id) { handle } }`,
      { variables: { id: `gid://shopify/Blog/${blogId}` } }
    );
    const blogHandle = blogRes.data?.blog?.handle;
    if (!blogHandle) {
      res.send(empty);
      return;
    }

    const relatedPosts = await getRelatedPosts(postId, shop.id, blogId, count);
    const items = relatedPosts.map((p) => ({
      title: p.title,
      href: `https://${shopDomain}/blogs/${blogHandle}/${p.slug}`,
      image: p.featuredImage || null,
    }));

    const body = JSON.stringify({ show: items.length > 0, items });
    dataCache.set(cacheKey, { body, expiresAt: Date.now() + CACHE_TTL_MS });
    res.send(body);
  } catch (err) {
    console.error("GET /related-posts.json error:", err);
    res.send(empty);
  }
});

// Static bootstrap script — content never depends on request data, only on app deploys, so a
// longer cache is fine (unlike the JSON endpoint above).
router.get("/related-posts.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(RELATED_POSTS_SCRIPT);
});

const RELATED_POSTS_SCRIPT = `(function () {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render(container, items) {
    var html = '<h3 class="blogger-related-posts__title">Related Posts</h3><div class="blogger-related-posts__grid">';
    items.forEach(function (item) {
      html += '<a class="blogger-related-posts__item" href="' + escapeHtml(item.href) + '">';
      if (item.image) {
        // Blurred backdrop (__image-bg) + sharp uncropped foreground image — avoids both cropping
        // banner-style source images and plain empty-gray letterboxing. See the CSS comment in
        // EditorContentCompiler.js's generateGlobalCss() for the full reasoning.
        html += '<div class="blogger-related-posts__image-wrap">';
        html += '<img class="blogger-related-posts__image-bg" src="' + escapeHtml(item.image) + '" alt="" aria-hidden="true" loading="lazy">';
        html += '<img class="blogger-related-posts__image" src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.title) + '" loading="lazy">';
        html += '</div>';
      } else {
        // Keeps every card the same height even when a post has no featured image, instead of
        // its title floating at the top while sibling cards' titles sit below their images.
        html += '<div class="blogger-related-posts__image-placeholder"></div>';
      }
      html += '<span class="blogger-related-posts__item-title">' + escapeHtml(item.title) + '</span></a>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function init() {
    var containers = document.querySelectorAll('[data-related-posts]');
    containers.forEach(function (container) {
      var postId = container.getAttribute('data-post-id');
      var shop = container.getAttribute('data-shop');
      if (!postId || !shop) return;
      var url = '${APP_URL}/related-posts.json?postId=' + encodeURIComponent(postId) + '&shop=' + encodeURIComponent(shop);
      fetch(url)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.show && Array.isArray(data.items) && data.items.length > 0) {
            render(container, data.items);
          }
        })
        .catch(function () {});
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;

export default router;
