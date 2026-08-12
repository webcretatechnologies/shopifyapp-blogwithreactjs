/**
 * Live storefront routes (PUBLIC — no session auth required)
 *
 * Covers everything that must reflect a *global setting* the moment it's saved, not just on a
 * post's next Save & Sync — related posts (showRelatedPosts/relatedPostsCount) and custom
 * header/footer code (Settings → Advanced). EditorContentCompiler.compileForStorefront bakes only
 * lightweight placeholder divs plus one shared <script src=".../related-posts.js"> into every
 * synced article; this file supplies the other half of each: the JSON endpoints the script
 * fetches (reading settings fresh on every request, same pattern as publicStyles.js), and the
 * script itself. Kept under the original related-posts.js/.json URLs even though its scope grew,
 * since those URLs are already baked into every previously-synced article's body_html.
 *
 * Accessed cross-domain from Shopify storefronts, so all routes here must be mounted BEFORE any
 * Shopify session validation middleware — same placement as tracking.js/publicStyles.js.
 *
 *   GET /related-posts.json?postId=<id>&shop=<shop-domain>
 *   GET /custom-code.json?shop=<shop-domain>
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

// Custom header/footer code (Settings → Advanced) — same live-update reasoning as related posts:
// a merchant expects a *setting* to apply everywhere the moment they save it, not only to posts
// they individually resync afterward. Reads fresh from ShopSetting on every request.
router.get("/custom-code.json", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=15");

  const shopDomain = String(req.query.shop || "").trim();
  const empty = JSON.stringify({ headerCode: "", footerCode: "" });
  if (!shopDomain) {
    res.send(empty);
    return;
  }

  const cacheKey = `customcode:${shopDomain}`;
  const cached = dataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.send(cached.body);
    return;
  }

  try {
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain }, include: { settings: true } });
    if (!shop) {
      res.send(empty);
      return;
    }
    const settings = (shop.settings || []).reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
    const body = JSON.stringify({
      headerCode: settings.customHeaderCode || "",
      footerCode: settings.customFooterCode || "",
    });
    dataCache.set(cacheKey, { body, expiresAt: Date.now() + CACHE_TTL_MS });
    res.send(body);
  } catch (err) {
    console.error("GET /custom-code.json error:", err);
    res.send(empty);
  }
});

// Static bootstrap script — content only changes on app deploys, so some caching is still
// reasonable, but a full hour (the original choice here) meant a browser that fetched this
// script before a deploy kept running the stale version for up to an hour afterward — exactly
// what happened when custom header/footer support was added to this same script shortly after
// related posts alone had already been fetched and cached by a real visitor. Kept short while
// this is still under active iteration.
router.get("/related-posts.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=15");
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

  function initRelatedPosts() {
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

  // el.innerHTML = html does NOT execute any <script> tags inside it — a real regression from
  // the old "baked directly into body_html" behavior, where a merchant's pasted tracking pixel/
  // chat-widget <script> ran normally as part of the initial page HTML. Manually recreate each
  // script element (the standard workaround) so pasted scripts keep working after this moved to
  // JS-injected content.
  function injectHtmlWithScripts(el, html) {
    el.innerHTML = html;
    var oldScripts = el.querySelectorAll('script');
    oldScripts.forEach(function (oldScript) {
      var newScript = document.createElement('script');
      for (var i = 0; i < oldScript.attributes.length; i++) {
        var attr = oldScript.attributes[i];
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  // Custom header/footer code (Settings → Advanced) — fetched once per page and injected into
  // whichever placeholder(s) are present, so a setting change applies to every already-published
  // post the moment a visitor loads the page, with no resync.
  function initCustomCode() {
    var headerEls = document.querySelectorAll('[data-custom-header]');
    var footerEls = document.querySelectorAll('[data-custom-footer]');
    if (headerEls.length === 0 && footerEls.length === 0) return;
    var shop = (headerEls[0] || footerEls[0]).getAttribute('data-shop');
    if (!shop) return;
    var url = '${APP_URL}/custom-code.json?shop=' + encodeURIComponent(shop);
    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data) return;
        if (data.headerCode) {
          headerEls.forEach(function (el) { injectHtmlWithScripts(el, data.headerCode); });
        }
        if (data.footerCode) {
          footerEls.forEach(function (el) { injectHtmlWithScripts(el, data.footerCode); });
        }
      })
      .catch(function () {});
  }

  function init() {
    initRelatedPosts();
    initCustomCode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;

export default router;
