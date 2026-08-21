/**
 * Live storefront sidebar routes (PUBLIC — no session auth).
 *
 *   GET /sidebar.json?shop=&postId=
 *   GET /sidebar.js
 *
 * Mirrors related-posts live pattern: placeholders in body_html, content fetched fresh.
 */
import express from "express";
import { prisma } from "../../shopify.js";
import shopify from "../../shopify.js";
import { getRelatedPosts, resolveRelatedSourceMode } from "../services/RelatedPostsService.js";
import { isFeatureEnabled } from "../services/PlanFeatureService.js";

const router = express.Router();
const APP_URL = process.env.HOST || process.env.APP_URL || `https://${process.env.SHOPIFY_APP_HOST || "localhost:3000"}`;
const CACHE_TTL_MS = 15 * 1000;
const dataCache = new Map();

function parseSettings(shop) {
  return (shop.settings || []).reduce((acc, s) => {
    let val = s.value;
    if (val === "true") val = true;
    else if (val === "false") val = false;
    acc[s.key] = val;
    return acc;
  }, {});
}

function defaultWidgets() {
  return [
    { id: "related_1", type: "related_posts", enabled: true, settings: { title: "Related posts", count: 4 } },
    { id: "categories_1", type: "categories", enabled: true, settings: { title: "Categories", showCounts: true } },
  ];
}

function parseWidgets(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* fall through */
  }
  return defaultWidgets();
}

async function resolvePostId(shopDomain, query) {
  let postId = parseInt(query.postId, 10);
  if (Number.isInteger(postId)) return postId;
  const shopifyArticleId = String(query.shopifyArticleId || "").trim();
  if (!shopifyArticleId || !shopDomain) return null;
  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return null;
  const sa = await prisma.shopifyArticle.findFirst({
    where: { shopifyArticleId, shopId: shop.id },
  });
  return sa?.postId || null;
}

router.get("/sidebar.json", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=15");

  const shopDomain = String(req.query.shop || "").trim();
  const postId = await resolvePostId(shopDomain, req.query);
  const empty = JSON.stringify({ show: false, widgets: [] });

  if (!shopDomain || !Number.isInteger(postId)) {
    res.status(400).json({ show: false, widgets: [] });
    return;
  }

  const cacheKey = `sidebar:${shopDomain}:${postId}`;
  const cached = dataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.send(cached.body);
    return;
  }

  try {
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      include: { settings: true },
    });
    if (!shop || !isFeatureEnabled(shop.planKey, "blog_sidebar")) {
      dataCache.set(cacheKey, { body: empty, expiresAt: Date.now() + CACHE_TTL_MS });
      res.send(empty);
      return;
    }

    const settings = parseSettings(shop);
    const post = await prisma.post.findFirst({
      where: { id: postId, shopId: shop.id },
      select: {
        relatedPostsSourceMode: true,
        blogSidebarOverride: true,
        shopifyArticle: { select: { shopifyBlogId: true, shopifyArticleId: true } },
        products: {
          orderBy: { position: "asc" },
          include: { product: true },
        },
      },
    });
    if (!post) {
      res.send(empty);
      return;
    }

    let sidebarOn = settings.blogSidebarEnabled === true || settings.blogSidebarEnabled === "true";
    const ov = String(post.blogSidebarOverride || "").toLowerCase();
    if (ov === "off") sidebarOn = false;
    if (ov === "on") sidebarOn = true;
    if (!sidebarOn) {
      dataCache.set(cacheKey, { body: empty, expiresAt: Date.now() + CACHE_TTL_MS });
      res.send(empty);
      return;
    }

    const position = String(settings.blogSidebarPosition || "right").toLowerCase() === "left" ? "left" : "right";
    const width = parseInt(settings.blogSidebarWidth, 10) || 320;
    const widgetsConfig = parseWidgets(settings.blogSidebarWidgets).filter((w) => w && w.enabled);

    const session = await prisma.session.findFirst({ where: { shop: shopDomain, isOnline: false } });
    let blogHandle = null;
    const blogId = post.shopifyArticle?.shopifyBlogId;
    const shopifyArticleId = post.shopifyArticle?.shopifyArticleId;
    if (session && (blogId || shopifyArticleId)) {
      try {
        const client = new shopify.api.clients.Graphql({
          session: { shop: session.shop, accessToken: session.accessToken, isOnline: false },
        });
        if (blogId) {
          const blogRes = await client.request(
            `query GetBlogHandle($id: ID!) { blog(id: $id) { handle } }`,
            { variables: { id: `gid://shopify/Blog/${blogId}` } }
          );
          blogHandle = blogRes.data?.blog?.handle || null;
        }
        // Fallback: article → blog.handle (covers missing/stale blogId or blog() returning null)
        if (!blogHandle && shopifyArticleId) {
          const articleRes = await client.request(
            `query GetArticleBlog($id: ID!) { article(id: $id) { blog { handle } } }`,
            { variables: { id: `gid://shopify/Article/${shopifyArticleId}` } }
          );
          blogHandle = articleRes.data?.article?.blog?.handle || null;
        }
      } catch (e) {
        console.error("sidebar.json blog handle:", e.message);
      }
    }

    const widgets = [];
    for (const w of widgetsConfig) {
      const title = w.settings?.title || "";
      if (w.type === "related_posts") {
        // Need blogId for the related query and blogHandle for storefront hrefs.
        // If either is missing, skip this widget — sidebar.js must clear data-sidebar-related
        // so the bottom related block is not CSS-hidden while this slot stays empty.
        if (!blogId || !blogHandle) continue;
        const count = parseInt(w.settings?.count, 10) || 4;
        const mode = resolveRelatedSourceMode(settings.relatedPostsSourceMode, post.relatedPostsSourceMode);
        const related = await getRelatedPosts(postId, shop.id, blogId, { count, mode });
        if (!related.length) continue;
        widgets.push({
          type: "related_posts",
          title: title || "Related posts",
          layout: "list",
          items: related.map((p) => ({
            title: p.title,
            href: `https://${shopDomain}/blogs/${blogHandle}/${p.slug}`,
            image: p.featuredImage || null,
            excerpt: p.excerpt || null,
          })),
        });
      } else if (w.type === "categories") {
        const cats = await prisma.category.findMany({
          where: { shopId: shop.id },
          orderBy: { name: "asc" },
          include: {
            _count: { select: { posts: { where: { status: "published" } } } },
            posts: {
              where: { status: "published" },
              orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
              take: 12,
              select: { title: true, slug: true },
            },
          },
        });
        const showCounts = w.settings?.showCounts !== false;
        // Categories are Post.categoryId — not Shopify tags. Tagged archive hrefs only work after
        // ArticleSyncService pushes the category slug as a tag; always include direct post links
        // so the widget lists the same articles the count reflects, even before a resync.
        const catItems = cats
          .filter((c) => c._count.posts > 0)
          .map((c) => ({
            name: c.name,
            slug: c.slug,
            count: showCounts ? c._count.posts : null,
            href: blogHandle
              ? `https://${shopDomain}/blogs/${blogHandle}/tagged/${encodeURIComponent(c.slug)}`
              : `https://${shopDomain}/blogs`,
            posts: blogHandle
              ? (c.posts || []).map((p) => ({
                  title: p.title,
                  href: `https://${shopDomain}/blogs/${blogHandle}/${p.slug}`,
                }))
              : [],
          }));
        if (!catItems.length) continue;
        widgets.push({
          type: "categories",
          title: title || "Categories",
          items: catItems,
        });
      } else if (w.type === "rich_text") {
        const body = String(w.settings?.body || "").slice(0, 5000).trim();
        if (!body) continue;
        widgets.push({
          type: "rich_text",
          title,
          body,
        });
      } else if (w.type === "image_cta") {
        const imageUrl = w.settings?.imageUrl || "";
        const linkUrl = w.settings?.linkUrl || "";
        const buttonText = w.settings?.buttonText || "Learn more";
        if (!imageUrl && !(buttonText && linkUrl)) continue;
        widgets.push({
          type: "image_cta",
          title,
          imageUrl,
          linkUrl,
          buttonText,
        });
      } else if (w.type === "products") {
        const maxItems = parseInt(w.settings?.maxItems, 10) || 3;
        const source = w.settings?.source || "post_products";
        let products = [];
        if (source === "manual") {
          const handles = Array.isArray(w.settings?.productHandles) ? w.settings.productHandles : [];
          products = handles.slice(0, maxItems).map((handle) => ({
            title: handle,
            handle,
            href: `https://${shopDomain}/products/${encodeURIComponent(handle)}`,
            image: null,
          }));
        } else {
          products = (post.products || []).slice(0, maxItems).map((pp) => {
            const p = pp.product || {};
            const handle = p.handle || null;
            return {
              title: p.title || "Product",
              handle,
              href: handle
                ? `https://${shopDomain}/products/${encodeURIComponent(handle)}`
                : `https://${shopDomain}/products`,
              image: p.image || null,
            };
          });
        }
        if (!products.length) continue;
        widgets.push({
          type: "products",
          title: title || "Products",
          ctaLabel: w.settings?.ctaLabel || "View product",
          items: products,
        });
      }
    }

    const body = JSON.stringify({
      show: widgets.length > 0,
      position,
      width,
      widgets,
    });
    dataCache.set(cacheKey, { body, expiresAt: Date.now() + CACHE_TTL_MS });
    res.send(body);
  } catch (err) {
    console.error("GET /sidebar.json error:", err);
    res.send(empty);
  }
});

router.get("/sidebar.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=15");
  res.send(SIDEBAR_SCRIPT);
});

const SIDEBAR_SCRIPT = `(function () {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function resolveShop() {
    try {
      if (window.Shopify && window.Shopify.shop) return window.Shopify.shop;
    } catch (e) {}
    return null;
  }

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

  function relatedListHtml(items) {
    var html = '<div class="blogger-related-posts__list">';
    items.forEach(function (item) {
      html += '<a class="blogger-related-posts__list-item" href="' + escapeHtml(item.href) + '">';
      if (item.image) {
        html += '<img class="blogger-related-posts__list-thumb" src="' + escapeHtml(item.image) + '" alt="" loading="lazy">';
      } else {
        html += '<div class="blogger-related-posts__list-thumb blogger-related-posts__list-thumb--empty"></div>';
      }
      html += '<span class="blogger-related-posts__list-body"><span class="blogger-related-posts__item-title">' + escapeHtml(item.title) + '</span></span></a>';
    });
    html += '</div>';
    return html;
  }

  function widgetHasContent(w) {
    if (!w || !w.type) return false;
    if (w.type === 'related_posts' || w.type === 'categories' || w.type === 'products') {
      return !!(w.items && w.items.length);
    }
    if (w.type === 'rich_text') return !!(w.body && String(w.body).trim());
    if (w.type === 'image_cta') return !!(w.imageUrl || (w.buttonText && w.linkUrl));
    return false;
  }

  function renderWidget(w) {
    if (!widgetHasContent(w)) return '';
    var html = '<div class="blogger-sidebar-widget blogger-sidebar-widget--' + escapeHtml(w.type) + '">';
    if (w.title) html += '<h3 class="blogger-sidebar-widget__title">' + escapeHtml(w.title) + '</h3>';
    if (w.type === 'related_posts') {
      html += relatedListHtml(w.items);
    } else if (w.type === 'categories') {
      html += '<ul class="blogger-sidebar-categories">';
      w.items.forEach(function (c) {
        html += '<li class="blogger-sidebar-category">';
        html += '<a class="blogger-sidebar-category__name" href="' + escapeHtml(c.href) + '">' + escapeHtml(c.name);
        if (c.count != null) html += ' <span>(' + escapeHtml(String(c.count)) + ')</span>';
        html += '</a>';
        if (c.posts && c.posts.length) {
          html += '<ul class="blogger-sidebar-category__posts">';
          c.posts.forEach(function (p) {
            html += '<li><a href="' + escapeHtml(p.href) + '">' + escapeHtml(p.title) + '</a></li>';
          });
          html += '</ul>';
        }
        html += '</li>';
      });
      html += '</ul>';
    } else if (w.type === 'rich_text') {
      html += '<div class="blogger-sidebar-richtext">' + escapeHtml(w.body || '').replace(/\\n/g, '<br>') + '</div>';
    } else if (w.type === 'image_cta') {
      html += '<div class="blogger-sidebar-cta">';
      if (w.imageUrl) {
        var img = '<img src="' + escapeHtml(w.imageUrl) + '" alt="">';
        if (w.linkUrl) img = '<a href="' + escapeHtml(w.linkUrl) + '">' + img + '</a>';
        html += img;
      }
      if (w.buttonText && w.linkUrl) {
        html += '<a class="blogger-sidebar-cta__btn" href="' + escapeHtml(w.linkUrl) + '">' + escapeHtml(w.buttonText) + '</a>';
      }
      html += '</div>';
    } else if (w.type === 'products') {
      w.items.forEach(function (p) {
        html += '<a class="blogger-sidebar-product" href="' + escapeHtml(p.href) + '">';
        if (p.image) html += '<img src="' + escapeHtml(p.image) + '" alt="">';
        html += '<span>' + escapeHtml(p.title) + '</span></a>';
      });
    }
    html += '</div>';
    return html;
  }

  function activateLayout(container, hasRelated) {
    var layout = container.closest ? container.closest('.blogger-article-layout') : null;
    if (!layout && container.parentElement && container.parentElement.classList &&
        container.parentElement.classList.contains('blogger-article-layout')) {
      layout = container.parentElement;
    }
    if (!layout) return;
    layout.classList.add('blogger-article-layout--sidebar-active');
    // Published markup sets data-sidebar-related whenever the Related widget is *configured*.
    // Only keep it when Related actually rendered here — otherwise CSS would hide the bottom
    // related block while the sidebar slot is empty (e.g. blogHandle lookup failed).
    if (hasRelated) {
      layout.setAttribute('data-sidebar-related', '1');
    } else {
      layout.removeAttribute('data-sidebar-related');
    }
  }

  function ensureSidebarContainer() {
    var containers = document.querySelectorAll('[data-blog-sidebar], .blogger-article-sidebar');
    if (containers.length) return containers;
    // Aside was stripped — recreate inside any layout shell still present
    var layouts = document.querySelectorAll('.blogger-article-layout');
    var created = [];
    layouts.forEach(function (layout) {
      var aside = document.createElement('aside');
      aside.className = 'blogger-article-sidebar';
      aside.setAttribute('data-blog-sidebar', '');
      layout.appendChild(aside);
      created.push(aside);
    });
    return created;
  }

  function init() {
    var containers = ensureSidebarContainer();
    if (!containers || !containers.length) return;
    Array.prototype.forEach.call(containers, function (container) {
      var postId = container.getAttribute('data-post-id');
      var shop = container.getAttribute('data-shop') || resolveShop();
      if (!shop) return;
      var url = '${APP_URL}/sidebar.json?shop=' + encodeURIComponent(shop);
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
          if (!data || !data.show || !Array.isArray(data.widgets) || !data.widgets.length) return;
          var html = '';
          var hasRelated = false;
          data.widgets.forEach(function (w) {
            var chunk = renderWidget(w);
            if (!chunk) return;
            html += chunk;
            if (w.type === 'related_posts') hasRelated = true;
          });
          if (!html) return;
          container.innerHTML = html;
          activateLayout(container, hasRelated);
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
