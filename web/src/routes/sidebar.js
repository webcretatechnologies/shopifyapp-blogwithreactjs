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
import { formatPrice } from "../utils/priceUtils.js";

const router = express.Router();
const APP_URL = process.env.HOST || process.env.APP_URL || `https://${process.env.SHOPIFY_APP_HOST || "localhost:3000"}`;

function sanitizePublicUrl(raw, max = 500) {
  const s = String(raw || "").trim().slice(0, max);
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;
  return "";
}

function sanitizeImageUrl(raw) {
  const s = String(raw || "").trim().slice(0, 2000);
  return /^https?:\/\//i.test(s) ? s : "";
}

const CACHE_TTL_MS = 60 * 1000;
const BLOG_HANDLE_TTL_MS = 10 * 60 * 1000;
const dataCache = new Map();
const blogHandleCache = new Map();

async function resolveBlogHandle(session, blogId, shopifyArticleId) {
  const cacheKey = blogId
    ? `blog:${blogId}`
    : shopifyArticleId
      ? `article:${shopifyArticleId}`
      : null;
  if (cacheKey) {
    const hit = blogHandleCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.handle;
  }

  let blogHandle = null;
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

  if (cacheKey && blogHandle) {
    blogHandleCache.set(cacheKey, { handle: blogHandle, expiresAt: Date.now() + BLOG_HANDLE_TTL_MS });
  }
  return blogHandle;
}

/**
 * Manual sidebar picks may reference products that were never attached to a post,
 * so they aren't in the local Product cache. Fetch from Shopify and upsert so the
 * storefront gets title/image/price instead of a bare handle.
 */
async function fetchAndCacheProductsByHandles(session, shopId, handles) {
  const out = new Map();
  if (!session?.accessToken || !handles?.length) return out;

  const client = new shopify.api.clients.Graphql({
    session: { shop: session.shop, accessToken: session.accessToken, isOnline: false },
  });
  const query = handles.map((h) => `handle:${String(h).trim()}`).filter(Boolean).join(" OR ");
  if (!query) return out;

  const result = await client.request(
    `query ProductsByHandles($query: String!, $first: Int!) {
      products(query: $query, first: $first) {
        edges {
          node {
            id
            title
            handle
            featuredImage { url }
            priceRangeV2 { minVariantPrice { amount } }
            variants(first: 1) {
              edges { node { id availableForSale } }
            }
          }
        }
      }
    }`,
    { variables: { query, first: Math.min(handles.length, 50) } }
  );

  for (const { node } of result.data?.products?.edges || []) {
    if (!node?.id || !node.handle) continue;
    const priceRaw = node.priceRangeV2?.minVariantPrice?.amount;
    const priceVal = priceRaw != null && priceRaw !== "" ? parseFloat(priceRaw) : null;
    const row = await prisma.product.upsert({
      where: { shopifyProductId: node.id },
      create: {
        shopId,
        shopifyProductId: node.id,
        title: node.title || node.handle,
        handle: node.handle,
        image: node.featuredImage?.url || null,
        price: Number.isFinite(priceVal) ? priceVal : null,
        variantId: node.variants?.edges?.[0]?.node?.id || null,
        variantAvailable: node.variants?.edges?.[0]?.node?.availableForSale ?? true,
      },
      update: {
        title: node.title || node.handle,
        handle: node.handle,
        image: node.featuredImage?.url || null,
        price: Number.isFinite(priceVal) ? priceVal : null,
        variantId: node.variants?.edges?.[0]?.node?.id || null,
        variantAvailable: node.variants?.edges?.[0]?.node?.availableForSale ?? true,
      },
      select: { title: true, handle: true, image: true, price: true },
    });
    out.set(row.handle, row);
  }
  return out;
}

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
    {
      id: "categories_1",
      type: "categories",
      enabled: true,
      settings: {
        title: "Categories",
        showCounts: true,
        showPosts: true,
        maxPosts: 3,
        sort: "name",
        includeCategoryIds: [],
      },
    },
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
  res.setHeader("Cache-Control", "public, max-age=60");

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
      blogHandle = await resolveBlogHandle(session, blogId, shopifyArticleId);
    }

    // Build widget payloads in parallel — sequential awaits were the main storefront delay.
    const widgetResults = await Promise.all(
      widgetsConfig.map(async (w) => {
        const title = w.settings?.title || "";
        if (w.type === "related_posts") {
          if (!blogId || !blogHandle) return null;
          const count = parseInt(w.settings?.count, 10) || 4;
          const widgetMode = w.settings?.sourceMode || w.settings?.source;
          const mode = resolveRelatedSourceMode(
            widgetMode || settings.relatedPostsSourceMode,
            post.relatedPostsSourceMode
          );
          const related = await getRelatedPosts(postId, shop.id, blogId, { count, mode });
          if (!related.length) return null;
          return {
            type: "related_posts",
            title: title || "Related posts",
            layout: "list",
            items: related.map((p) => ({
              title: p.title,
              href: `https://${shopDomain}/blogs/${blogHandle}/${p.slug}`,
              image: p.featuredImage || null,
              excerpt: p.excerpt || null,
            })),
          };
        }
        if (w.type === "recent_posts") {
          if (!blogId || !blogHandle) return null;
          const count = Math.min(12, Math.max(1, parseInt(w.settings?.count, 10) || 4));
          // Same order as Manage posts (Created): newest article first.
          // Do not use updatedAt — editing an older post would jump it to the top.
          // Do not use publishedAt alone — a missing/older publish time hid newer posts
          // (e.g. "Top 10 Best Incense Sticks") behind older ones that had a timestamp.
          const recent = await prisma.post.findMany({
            where: {
              shopId: shop.id,
              status: "published",
              id: { not: postId },
              shopifyArticle: {
                is: { shopifyBlogId: String(blogId) },
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: count,
            select: { title: true, slug: true, featuredImage: true, excerpt: true },
          });
          if (!recent.length) return null;
          return {
            type: "recent_posts",
            title: title || "Recent posts",
            items: recent.map((p) => ({
              title: p.title,
              href: `https://${shopDomain}/blogs/${blogHandle}/${p.slug}`,
              image: p.featuredImage || null,
              excerpt: p.excerpt || null,
            })),
          };
        }
        if (w.type === "categories") {
          const showCounts = w.settings?.showCounts !== false;
          const showPosts = w.settings?.showPosts !== false;
          const maxPosts = Math.min(6, Math.max(1, parseInt(w.settings?.maxPosts, 10) || 3));
          const sort = String(w.settings?.sort || "name").toLowerCase() === "count" ? "count" : "name";
          const includeRaw = w.settings?.includeCategoryIds;
          const includeIds = Array.isArray(includeRaw)
            ? includeRaw.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id))
            : [];

          const cats = await prisma.category.findMany({
            where: {
              shopId: shop.id,
              ...(includeIds.length ? { id: { in: includeIds } } : {}),
            },
            orderBy: { name: "asc" },
            include: {
              _count: {
                select: {
                  posts: { where: { status: "published", id: { not: postId } } },
                },
              },
              ...(showPosts
                ? {
                    posts: {
                      where: { status: "published", id: { not: postId } },
                      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
                      take: maxPosts,
                      select: { id: true, title: true, slug: true },
                    },
                  }
                : {}),
            },
          });

          // Skip categories with no *other* published posts — otherwise viewing the only
          // post in "Recipes" leaves a lonely "Recipes (1)" with nothing useful underneath.
          let catItems = cats
            .filter((c) => c._count.posts > 0)
            .map((c) => ({
              name: c.name,
              slug: c.slug,
              count: showCounts ? c._count.posts : null,
              postCount: c._count.posts,
              href: blogHandle
                ? `https://${shopDomain}/blogs/${blogHandle}/tagged/${encodeURIComponent(c.slug)}`
                : `https://${shopDomain}/blogs`,
              posts:
                showPosts && blogHandle
                  ? (c.posts || [])
                      .filter((p) => p.id !== postId)
                      .map((p) => ({
                        title: p.title,
                        href: `https://${shopDomain}/blogs/${blogHandle}/${p.slug}`,
                      }))
                  : [],
            }));

          if (sort === "count") {
            catItems.sort((a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name));
          } else {
            catItems.sort((a, b) => a.name.localeCompare(b.name));
          }
          catItems = catItems.map(({ postCount, ...rest }) => rest);
          if (!catItems.length) return null;
          return {
            type: "categories",
            title: title || "Categories",
            items: catItems,
          };
        }
        if (w.type === "rich_text") {
          const body = String(w.settings?.body || "").slice(0, 2000).trim();
          const styleRaw = String(w.settings?.style || "default").toLowerCase();
          const style = ["callout", "quote"].includes(styleRaw) ? styleRaw : "default";
          const linkUrl = sanitizePublicUrl(w.settings?.linkUrl);
          const buttonText = String(w.settings?.buttonText || "Learn more").slice(0, 60).trim();
          if (!body && !(linkUrl && buttonText)) return null;
          return {
            type: "rich_text",
            title,
            body,
            style,
            linkUrl: linkUrl || null,
            buttonText: linkUrl ? (buttonText || "Learn more") : null,
          };
        }
        if (w.type === "image_cta") {
          const imageUrl = sanitizeImageUrl(w.settings?.imageUrl);
          const linkUrl = sanitizePublicUrl(w.settings?.linkUrl);
          const showButton = w.settings?.showButton !== false;
          const buttonText = String(w.settings?.buttonText || "Learn more").slice(0, 60).trim();
          const caption = String(w.settings?.caption || "").slice(0, 120).trim();
          const altText = String(w.settings?.altText || "").slice(0, 200).trim();
          const layout = String(w.settings?.layout || "stacked").toLowerCase() === "overlay"
            ? "overlay"
            : "stacked";
          const openInNewTab = !!w.settings?.openInNewTab;
          if (!imageUrl && !(showButton && buttonText && linkUrl)) return null;
          return {
            type: "image_cta",
            title,
            imageUrl,
            linkUrl,
            buttonText: showButton && linkUrl ? (buttonText || "Learn more") : "",
            caption,
            altText: altText || caption || title || "",
            openInNewTab,
            showButton: showButton && !!linkUrl,
            layout: imageUrl ? layout : "stacked",
          };
        }
        if (w.type === "products") {
          const maxItems = Math.min(6, Math.max(1, parseInt(w.settings?.maxItems, 10) || 3));
          const source = w.settings?.source || "post_products";
          const showImage = w.settings?.showImage !== false;
          const showPrice = w.settings?.showPrice !== false;
          const ctaLabel = String(w.settings?.ctaLabel ?? "View product").trim();

          const mapProduct = (p) => {
            const handle = p.handle || null;
            if (!handle && !p.title) return null;
            return {
              title: p.title || handle || "Product",
              href: handle
                ? `https://${shopDomain}/products/${encodeURIComponent(handle)}`
                : `https://${shopDomain}/products`,
              image: showImage && p.image ? p.image : null,
              price: showPrice && p.price != null && p.price !== "" ? formatPrice(p.price) : null,
              ctaLabel: ctaLabel || null,
            };
          };

          let products = [];
          if (source === "manual") {
            const handles = (Array.isArray(w.settings?.productHandles) ? w.settings.productHandles : [])
              .map((h) => String(h || "").trim())
              .filter(Boolean)
              .slice(0, maxItems);
            if (handles.length) {
              const rows = await prisma.product.findMany({
                where: { shopId: shop.id, handle: { in: handles } },
                select: { title: true, handle: true, image: true, price: true },
              });
              const byHandle = new Map(rows.map((r) => [r.handle, r]));
              const missing = handles.filter((h) => !byHandle.has(h));
              if (missing.length && session) {
                try {
                  const fetched = await fetchAndCacheProductsByHandles(session, shop.id, missing);
                  for (const [handle, row] of fetched) byHandle.set(handle, row);
                } catch (e) {
                  console.error("sidebar.json products hydrate:", e.message);
                }
              }
              products = handles
                .map((handle) => {
                  const row = byHandle.get(handle);
                  if (row) return mapProduct(row);
                  // Still unknown after Shopify lookup — keep a working product link
                  return mapProduct({ title: handle, handle, image: null, price: null });
                })
                .filter(Boolean);
            }
          } else {
            products = (post.products || [])
              .slice(0, maxItems)
              .map((pp) => mapProduct(pp.product || {}))
              .filter(Boolean);
          }
          if (!products.length) return null;
          return {
            type: "products",
            title: title || "Products",
            items: products,
          };
        }
        return null;
      })
    );

    const widgets = widgetResults.filter(Boolean);

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
  res.setHeader("Cache-Control", "public, max-age=300");
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

  function formatRichtextBody(raw) {
    var escaped = escapeHtml(raw || '').replace(/\\r\\n/g, '\\n').trim();
    if (!escaped) return '';
    escaped = escaped.replace(/(https?:\\/\\/[^\\s<]+)/g, function (url) {
      var clean = url.replace(/[.,)\\]]+$/, '');
      var trail = url.slice(clean.length);
      return '<a href="' + clean + '" rel="noopener noreferrer" target="_blank">' + clean + '</a>' + trail;
    });
    var parts = escaped.split(/\\n{2,}/);
    var html = '';
    for (var i = 0; i < parts.length; i++) {
      html += '<p>' + parts[i].replace(/\\n/g, '<br>') + '</p>';
    }
    return html;
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

  function getLayout(container) {
    var layout = container.closest ? container.closest('.blogger-article-layout') : null;
    if (!layout && container.parentElement && container.parentElement.classList &&
        container.parentElement.classList.contains('blogger-article-layout')) {
      layout = container.parentElement;
    }
    return layout;
  }

  function skeletonHtml() {
    return '<div class="blogger-sidebar-loading" aria-busy="true" aria-label="Loading sidebar">' +
      '<div class="blogger-sidebar-skeleton-card"></div>' +
      '<div class="blogger-sidebar-skeleton-card"></div>' +
      '<div class="blogger-sidebar-skeleton-card"></div>' +
      '</div>';
  }

  function showPending(container) {
    var layout = getLayout(container);
    if (!layout) return;
    // Two-column shell immediately — do not hide bottom related until widgets actually load.
    layout.classList.add('blogger-article-layout--sidebar-pending');
    layout.classList.remove('blogger-article-layout--sidebar-active');
    layout.removeAttribute('data-sidebar-related');
    if (!container.querySelector('.blogger-sidebar-widget') &&
        !container.querySelector('.blogger-sidebar-loading')) {
      container.innerHTML = skeletonHtml();
    }
  }

  function activateLayout(container, hasRelated) {
    var layout = getLayout(container);
    if (!layout) return;
    layout.classList.remove('blogger-article-layout--sidebar-pending');
    layout.classList.add('blogger-article-layout--sidebar-active');
    if (hasRelated) {
      layout.setAttribute('data-sidebar-related', '1');
    } else {
      layout.removeAttribute('data-sidebar-related');
    }
  }

  function deactivateLayout(container) {
    var layout = getLayout(container);
    if (layout) {
      layout.classList.remove('blogger-article-layout--sidebar-pending');
      layout.classList.remove('blogger-article-layout--sidebar-active');
      layout.removeAttribute('data-sidebar-related');
    }
    container.innerHTML = '';
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

  function linkAttrs(href, newTab) {
    var attrs = ' href="' + escapeHtml(href) + '"';
    if (newTab) attrs += ' target="_blank" rel="noopener noreferrer"';
    return attrs;
  }

  function renderImageCta(w) {
    var layout = w.layout === 'overlay' && w.imageUrl ? 'overlay' : 'stacked';
    var href = w.linkUrl || '';
    var newTab = !!w.openInNewTab;
    var showBtn = !!(w.showButton && w.buttonText && href);
    var img = '';
    if (w.imageUrl) {
      img = '<img src="' + escapeHtml(w.imageUrl) + '" alt="' + escapeHtml(w.altText || '') + '" loading="lazy">';
    }
    var html = '<div class="blogger-sidebar-cta blogger-sidebar-cta--' + layout + '">';
    if (layout === 'overlay') {
      html += '<div class="blogger-sidebar-cta__media">';
      if (href) html += '<a class="blogger-sidebar-cta__imgwrap"' + linkAttrs(href, newTab) + '>' + img + '</a>';
      else html += img;
      if (w.caption || showBtn) {
        html += '<div class="blogger-sidebar-cta__overlay">';
        if (w.caption) html += '<p class="blogger-sidebar-cta__caption">' + escapeHtml(w.caption) + '</p>';
        if (showBtn) html += '<a class="blogger-sidebar-cta__btn"' + linkAttrs(href, newTab) + '>' + escapeHtml(w.buttonText) + '</a>';
        html += '</div>';
      }
      html += '</div>';
    } else {
      if (img) {
        html += '<div class="blogger-sidebar-cta__media">';
        if (href) html += '<a' + linkAttrs(href, newTab) + '>' + img + '</a>';
        else html += img;
        html += '</div>';
      }
      if (w.caption) html += '<p class="blogger-sidebar-cta__caption">' + escapeHtml(w.caption) + '</p>';
      if (showBtn) html += '<a class="blogger-sidebar-cta__btn"' + linkAttrs(href, newTab) + '>' + escapeHtml(w.buttonText) + '</a>';
    }
    html += '</div>';
    return html;
  }

  function widgetHasContent(w) {
    if (!w || !w.type) return false;
    if (w.type === 'related_posts' || w.type === 'recent_posts' || w.type === 'categories' || w.type === 'products') {
      return !!(w.items && w.items.length);
    }
    if (w.type === 'rich_text') return !!(w.body && String(w.body).trim()) || !!(w.linkUrl && w.buttonText);
    if (w.type === 'image_cta') return !!(w.imageUrl || (w.buttonText && w.linkUrl));
    return false;
  }

  function renderWidget(w) {
    if (!widgetHasContent(w)) return '';
    var html = '<div class="blogger-sidebar-widget blogger-sidebar-widget--' + escapeHtml(w.type) + '">';
    if (w.title) html += '<h3 class="blogger-sidebar-widget__title">' + escapeHtml(w.title) + '</h3>';
    if (w.type === 'related_posts' || w.type === 'recent_posts') {
      html += relatedListHtml(w.items);
    } else if (w.type === 'categories') {
      html += '<ul class="blogger-sidebar-categories">';
      w.items.forEach(function (c) {
        html += '<li class="blogger-sidebar-category">';
        html += '<a class="blogger-sidebar-category__name" href="' + escapeHtml(c.href) + '">';
        html += '<span class="blogger-sidebar-category__label">' + escapeHtml(c.name) + '</span>';
        if (c.count != null) {
          html += ' <span class="blogger-sidebar-category__count">(' + escapeHtml(String(c.count)) + ')</span>';
        }
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
      var styleClass = w.style === 'callout' || w.style === 'quote' ? ' blogger-sidebar-richtext--' + w.style : '';
      html += '<div class="blogger-sidebar-richtext' + styleClass + '">';
      html += formatRichtextBody(w.body || '');
      if (w.linkUrl && w.buttonText) {
        html += '<a class="blogger-sidebar-richtext__btn" href="' + escapeHtml(w.linkUrl) + '">' + escapeHtml(w.buttonText) + '</a>';
      }
      html += '</div>';
    } else if (w.type === 'image_cta') {
      html += renderImageCta(w);
    } else if (w.type === 'products') {
      w.items.forEach(function (p) {
        html += '<a class="blogger-sidebar-product" href="' + escapeHtml(p.href) + '">';
        if (p.image) {
          html += '<img class="blogger-sidebar-product__thumb" src="' + escapeHtml(p.image) + '" alt="" loading="lazy">';
        }
        html += '<span class="blogger-sidebar-product__body">';
        html += '<span class="blogger-sidebar-product__title">' + escapeHtml(p.title) + '</span>';
        if (p.price) {
          html += '<span class="blogger-sidebar-product__price">' + escapeHtml(p.price) + '</span>';
        }
        if (p.ctaLabel) {
          html += '<span class="blogger-sidebar-product__cta">' + escapeHtml(p.ctaLabel) + '</span>';
        }
        html += '</span></a>';
      });
    }
    html += '</div>';
    return html;
  }

  function ensureSidebarContainer() {
    var containers = document.querySelectorAll('[data-blog-sidebar], .blogger-article-sidebar');
    if (containers.length) return containers;
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
      // Reserve the column + skeleton before the network round-trip finishes.
      showPending(container);
      var url = '${APP_URL}/sidebar.json?shop=' + encodeURIComponent(shop);
      if (postId) {
        url += '&postId=' + encodeURIComponent(postId);
      } else {
        var articleId = resolveShopifyArticleId();
        if (!articleId) {
          deactivateLayout(container);
          return;
        }
        url += '&shopifyArticleId=' + encodeURIComponent(articleId);
      }
      fetch(url)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.show || !Array.isArray(data.widgets) || !data.widgets.length) {
            deactivateLayout(container);
            return;
          }
          var html = '';
          var hasRelated = false;
          data.widgets.forEach(function (w) {
            var chunk = renderWidget(w);
            if (!chunk) return;
            html += chunk;
            if (w.type === 'related_posts') hasRelated = true;
          });
          if (!html) {
            deactivateLayout(container);
            return;
          }
          container.innerHTML = html;
          activateLayout(container, hasRelated);
        })
        .catch(function () {
          deactivateLayout(container);
        });
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
