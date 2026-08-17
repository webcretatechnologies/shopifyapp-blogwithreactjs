/**
 * Live storefront routes (PUBLIC — no session auth required)
 *
 * Covers everything that must reflect a *global setting* the moment it's saved, not just on a
 * post's next Save & Sync — related posts (showRelatedPosts/relatedPostsCount), custom
 * header/footer code (Settings → Advanced), and the "Powered by" branding badge. Editor
 * ContentCompiler.compileForStorefront / ArticleSyncService.buildStorefrontHtmlForPost bake only
 * lightweight placeholder divs plus one shared <script src=".../related-posts.js"> into every
 * synced article; this file supplies the other half of each: the JSON endpoints the script
 * fetches (reading settings/plan entitlement fresh on every request, same pattern as
 * publicStyles.js), and the script itself. Kept under the original related-posts.js/.json URLs
 * even though its scope grew, since those URLs are already baked into every previously-synced
 * article's body_html.
 *
 * Accessed cross-domain from Shopify storefronts, so all routes here must be mounted BEFORE any
 * Shopify session validation middleware — same placement as tracking.js/publicStyles.js.
 *
 *   GET /related-posts.json?postId=<id>&shop=<shop-domain>
 *   GET /custom-code.json?shop=<shop-domain>
 *   GET /branding.json?shop=<shop-domain>
 *   GET /related-posts.js
 */
import express from "express";
import { prisma } from "../../shopify.js";
import shopify from "../../shopify.js";
import { getRelatedPosts } from "../services/RelatedPostsService.js";
import { isFeatureEnabled } from "../services/PlanFeatureService.js";
import { APP_NAME, APP_BRANDING_URL } from "../utils/appName.js";

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
  let postId = parseInt(req.query.postId, 10);

  // Fallback path: the placeholder's own data-post-id can be missing if the article was last
  // saved directly in Shopify's admin editor — Shopify's sanitizer strips unrecognized data-*
  // attributes on save, and there's no other reliable source of our internal post id on the page.
  // The client script falls back to Shopify's own window.ShopifyAnalytics.meta.page.resourceId
  // (a real Shopify article GID, always present on article pages) and sends it here instead so it
  // can be resolved to our internal id via the ShopifyArticle join table.
  if (!Number.isInteger(postId)) {
    const shopifyArticleId = String(req.query.shopifyArticleId || "").trim();
    if (shopifyArticleId && shopDomain) {
      const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
      const sa = shop
        ? await prisma.shopifyArticle.findFirst({ where: { shopifyArticleId, shopId: shop.id } })
        : null;
      if (sa) postId = sa.postId;
    }
  }

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

    // Related Posts is marketed as a Starter+ feature on the pricing page ("Related Posts" bullet
    // is keyed to related_posts_manual, only appears in Starter's/Pro's list) — but this route
    // never actually checked entitlement, so Free shops got the "automatic" version regardless of
    // plan, contradicting what the pricing page promises. Gated here, at the one place that
    // actually decides what a storefront visitor sees, same as every other live-fetched setting
    // in this file.
    if (!isFeatureEnabled(shop.planKey, "related_posts_manual")) {
      dataCache.set(cacheKey, { body: empty, expiresAt: Date.now() + CACHE_TTL_MS });
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

// "Powered by" branding badge — same live-update reasoning as everything else in this file: Free
// always shows it (no remove_branding entitlement, no choice in the matter); Starter+ can remove
// it, but a shop's own "showPoweredByBadge" setting (Settings → Branding) lets an entitled
// merchant choose to keep showing it anyway. Resolved fresh on every request, so a plan
// upgrade/downgrade or a Settings change applies to every already-published post on its very next
// storefront view — no resync, matching custom header/footer above.
router.get("/branding.json", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=15");

  const shopDomain = String(req.query.shop || "").trim();
  const empty = JSON.stringify({ show: false, text: "" });
  if (!shopDomain) {
    res.send(empty);
    return;
  }

  const cacheKey = `branding:${shopDomain}`;
  const cached = dataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.send(cached.body);
    return;
  }

  try {
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) {
      res.send(empty);
      return;
    }
    const brandingEntitled = isFeatureEnabled(shop.planKey, "remove_branding");
    let show = true;
    if (brandingEntitled) {
      // Defaults to hidden when unset so Starter+ shops that never touch this setting keep
      // today's behavior (badge gone) rather than having it reappear.
      const pref = await prisma.shopSetting.findUnique({
        where: { shopId_key: { shopId: shop.id, key: "showPoweredByBadge" } },
      });
      show = pref?.value === "true";
    }
    const body = JSON.stringify({ show, text: `Powered by ${APP_NAME}`, link: APP_BRANDING_URL });
    dataCache.set(cacheKey, { body, expiresAt: Date.now() + CACHE_TTL_MS });
    res.send(body);
  } catch (err) {
    console.error("GET /branding.json error:", err);
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

  // Shopify's own storefront always exposes window.Shopify.shop — used as a fallback source of
  // the shop domain when a placeholder's own data-shop attribute is missing. That happens after
  // a merchant edits and saves an article directly in Shopify's admin blog editor: Shopify's own
  // sanitizer strips unrecognized data-* attributes on save (confirmed live), so data-shop (and
  // data-post-id, where nothing else on the page can recover it) can vanish even though the
  // placeholder's class name survives.
  function resolveShop() {
    try {
      if (window.Shopify && window.Shopify.shop) return window.Shopify.shop;
    } catch (e) {}
    return null;
  }

  // Shopify's own theme JS exposes the current article's GID at
  // window.ShopifyAnalytics.meta.page.resourceId (e.g. "gid://shopify/Article/123456") on every
  // article page — used as a fallback source of identity when data-post-id has been stripped by
  // Shopify's admin editor sanitizer.
  function resolveShopifyArticleId() {
    try {
      var gid = window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.page && window.ShopifyAnalytics.meta.page.resourceId;
      if (!gid) return null;
      var match = String(gid).match(/(\\d+)$/);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  function initRelatedPosts() {
    var containers = document.querySelectorAll('[data-related-posts], .blogger-related-posts');
    containers.forEach(function (container) {
      var postId = container.getAttribute('data-post-id');
      var shop = container.getAttribute('data-shop') || resolveShop();
      if (!shop) return;
      var url = '${APP_URL}/related-posts.json?shop=' + encodeURIComponent(shop);
      if (postId) {
        url += '&postId=' + encodeURIComponent(postId);
      } else {
        var articleId = resolveShopifyArticleId();
        if (!articleId) return;
        url += '&shopifyArticleId=' + encodeURIComponent(articleId);
      }
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
    var headerEls = document.querySelectorAll('[data-custom-header], .blogger-custom-header');
    var footerEls = document.querySelectorAll('[data-custom-footer], .blogger-custom-footer');
    if (headerEls.length === 0 && footerEls.length === 0) return;
    var shop = (headerEls[0] || footerEls[0]).getAttribute('data-shop') || resolveShop();
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

  // "Powered by" branding badge — fetched once per page, same live pattern as the header/footer
  // code above, so a plan change or a Settings → Branding toggle applies to every already-
  // published post on its next storefront view, with no resync.
  function initBrandingBadge() {
    var els = document.querySelectorAll('[data-branding-badge], .blogger-powered-by-badge');
    if (els.length === 0) return;
    var shop = els[0].getAttribute('data-shop') || resolveShop();
    if (!shop) return;
    var url = '${APP_URL}/branding.json?shop=' + encodeURIComponent(shop);
    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.show || !data.text) return;
        els.forEach(function (el) {
          if (data.link) {
            el.innerHTML = '<a href="' + escapeHtml(data.link) + '" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">' + escapeHtml(data.text) + '</a>';
          } else {
            el.textContent = data.text;
          }
        });
      })
      .catch(function () {});
  }

  function init() {
    initRelatedPosts();
    initCustomCode();
    initBrandingBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;

export default router;
