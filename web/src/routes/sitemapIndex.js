/**
 * Sitemap routes (PUBLIC — no session auth required)
 *
 * Shopify's native /sitemap.xml already includes every published article automatically — this
 * doesn't replace that. It exists to cover what the native sitemap can't do: it includes every
 * published article regardless of a post's `metaRobotsNoindex`/`excludeFromSitemap` flags, with
 * no way to remove an entry. This endpoint is the "clean" sitemap merchants submit to Search
 * Console/Bing instead.
 *
 * Covers EVERY published article across every blog on the shop — not just posts created through
 * this app — fetched live from Shopify's Admin API, since articles added directly in Shopify
 * admin (or predating this app's install) have no row in our own Post table. The noindex/exclude
 * flags only apply to articles we actually manage (matched by shopifyArticleId); every other
 * article is included by default since we have no signal to exclude it.
 *
 * Accessed cross-domain from Shopify storefronts / search engine crawlers, so this must be
 * mounted BEFORE any Shopify session validation middleware — same placement as tracking.js and
 * publicStyles.js.
 *
 *   GET /sitemap-index.xml?shop=<shop-domain>
 */
import express from "express";
import { prisma } from "../../shopify.js";
import shopify from "../../shopify.js";

const router = express.Router();

// ─── Abuse guard ──────────────────────────────────────────────────────────
// Public endpoint that, on cache miss, makes several paginated Admin API calls to enumerate every
// blog/article on the shop — a short in-process cache bounds how often that happens per shop,
// same pattern as publicStyles.js's cssCache.
const CACHE_TTL_MS = 90 * 1000;
const sitemapCache = new Map(); // shopDomain -> { xml, expiresAt }

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** All blogs on the shop, as [{ id, handle }]. Shops realistically have a handful of blogs, so a
 * single page (first: 50) covers virtually every case without needing cursor pagination here. */
async function fetchAllBlogs(client) {
  const res = await client.request(
    `query GetBlogs { blogs(first: 50) { edges { node { id handle } } } }`
  );
  return (res.data?.blogs?.edges || []).map((e) => ({
    id: e.node.id.match(/\d+$/)?.[0],
    handle: e.node.handle,
  }));
}

/** All published articles in one blog, as [{ id, handle, updatedAt }], paginated. The `articles`
 * connection has no server-side published-status filter argument — filter client-side via
 * `isPublished` instead. */
async function fetchPublishedArticles(client, blogGid) {
  const articles = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await client.request(
      `query GetArticles($blogId: ID!, $after: String) {
        blog(id: $blogId) {
          articles(first: 250, after: $after) {
            edges { node { id handle updatedAt isPublished } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { variables: { blogId: blogGid, after: cursor } }
    );
    const connection = res.data?.blog?.articles;
    if (!connection) break;

    for (const edge of connection.edges) {
      if (!edge.node.isPublished) continue;
      articles.push({
        id: edge.node.id.match(/\d+$/)?.[0],
        handle: edge.node.handle,
        updatedAt: edge.node.updatedAt,
      });
    }

    hasNextPage = connection.pageInfo?.hasNextPage;
    cursor = connection.pageInfo?.endCursor;
  }

  return articles;
}

router.get("/sitemap-index.xml", async (req, res) => {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120");

  const shopDomain = String(req.query.shop || "").trim();
  if (!shopDomain) {
    res.status(400).send("<!-- missing ?shop= parameter -->");
    return;
  }

  const cached = sitemapCache.get(shopDomain);
  if (cached && cached.expiresAt > Date.now()) {
    res.send(cached.xml);
    return;
  }

  const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`;

  try {
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) {
      // Same empty shape as a known shop with zero articles — an unknown-shop 404 vs. a known-shop
      // empty sitemap would otherwise let someone probe which myshopify.com domains have this app
      // installed just by trying different ?shop= values.
      res.send(emptyXml);
      return;
    }

    const session = await prisma.session.findFirst({ where: { shop: shopDomain, isOnline: false } });
    if (!session) {
      res.send(emptyXml);
      return;
    }

    const client = new shopify.api.clients.Graphql({
      session: { shop: session.shop, accessToken: session.accessToken, isOnline: false },
    });

    // Which articles we manage, and whether they're flagged noindex/excluded — keyed by
    // shopifyArticleId. Articles with no entry here (not managed by this app) are included by
    // default; we have no basis to exclude something we don't know about.
    const managedArticles = await prisma.shopifyArticle.findMany({
      where: { post: { shopId: shop.id } },
      select: {
        shopifyArticleId: true,
        post: { select: { metaRobotsNoindex: true, excludeFromSitemap: true } },
      },
    });
    const exclusionMap = new Map(
      managedArticles
        .filter((a) => a.shopifyArticleId)
        .map((a) => [a.shopifyArticleId, !!(a.post?.metaRobotsNoindex || a.post?.excludeFromSitemap)])
    );

    const blogs = await fetchAllBlogs(client);
    const urlEntries = [];

    for (const blog of blogs) {
      if (!blog.id || !blog.handle) continue;
      const articles = await fetchPublishedArticles(client, `gid://shopify/Blog/${blog.id}`);
      for (const article of articles) {
        if (!article.id || !article.handle) continue;
        if (exclusionMap.get(article.id)) continue; // noindex'd or individually excluded

        const loc = `https://${shopDomain}/blogs/${blog.handle}/${article.handle}`;
        const lastmod = (article.updatedAt ? new Date(article.updatedAt) : new Date()).toISOString();
        urlEntries.push(`  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`);
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join("\n")}\n</urlset>\n`;

    sitemapCache.set(shopDomain, { xml, expiresAt: Date.now() + CACHE_TTL_MS });
    res.send(xml);
  } catch (err) {
    console.error("GET /sitemap-index.xml error:", err);
    res.status(500).send("<!-- error generating sitemap -->");
  }
});

export default router;
