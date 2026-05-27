/**
 * ArticleSyncService
 * Centralized service for 2-way synchronization between app posts and Shopify articles.
 * Handles hash-based echo suppression, sync logging, and structured sync operations.
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import shopify from "../../shopify.js";
import { EditorContentCompiler } from "./EditorContentCompiler.js";
import { ShopifyArticleParser } from "./ShopifyArticleParser.js";

const prisma = new PrismaClient();

/**
 * Maximum depth for recursive webhook handling (ARTICLES_UPDATE → ARTICLES_CREATE fallback).
 */
const MAX_WEBHOOK_DEPTH = 3;

let _webhookDepth = 0;

/**
 * Metafield namespace/key for storing editor source data on Shopify articles.
 * Used to detect app-managed articles and preserve structured content on inbound webhooks.
 */
const METAFIELD_NAMESPACE = "blog_app";
const METAFIELD_KEY = "source";
const METAFIELD_TYPE = "json";

/**
 * Compute a deterministic hash from article content fields.
 * Used for echo suppression: if outbound hash matches inbound hash, we know
 * the webhook is just an echo of our own push.
 *
 * The `image` parameter is normalized: if an object with `.src`, extract `src`;
 * if a plain string, use it directly; otherwise null.
 */
function computeContentHash(fields) {
  const rawImage = fields.image;
  const imageSrc = rawImage && typeof rawImage === "object" && rawImage.src
    ? rawImage.src
    : typeof rawImage === "string"
      ? rawImage
      : null;

  const normalized = {
    title: (fields.title || "").trim(),
    body_html: (fields.body_html || "").trim(),
    author: (fields.author || "").trim(),
    published: !!fields.published,
    published_at: fields.published_at || null,
    tags: (Array.isArray(fields.tags) ? fields.tags.sort() : (fields.tags || "").split(",").map(t => t.trim()).filter(Boolean).sort()).join(","),
    image: imageSrc,
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

/**
 * Log a sync event to the ArticleSyncLog table.
 */
async function logSyncEvent({
  shopId,
  postId = null,
  shopifyArticleId = null,
  direction,
  eventType,
  status,
  message = null,
  localHash = null,
  remoteHash = null,
  payload = null,
}) {
  try {
    await prisma.articleSyncLog.create({
      data: {
        shopId,
        postId,
        shopifyArticleId,
        direction,
        eventType,
        status,
        message,
        localHash,
        remoteHash,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
      },
    });
  } catch (err) {
    console.error("Failed to log sync event:", err);
  }
}

/**
 * Build the metafield source data payload for the editor's structured content.
 */
function buildSourceMetafieldPayload(post, sourceHash) {
  return {
    metafield: {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      type: METAFIELD_TYPE,
      value: JSON.stringify({
        version: 1,
        sourceHash,
        contentJson: post.contentJson || [],
        contentHtml: post.contentHtml || "",
        syncMode: "managed_by_app",
        lastPushAt: new Date().toISOString(),
      }),
    },
  };
}

/**
 * Write (create or update) the source metafield on a Shopify article.
 * Stores the editor's structured content so inbound webhooks can detect
 * app-managed articles and preserve structure.
 */
async function writeSourceMetafield(restClient, blogId, articleId, post, sourceHash) {
  try {
    const shopifyLink = await prisma.shopifyArticle.findUnique({ where: { postId: post.id } });
    const metafieldPayload = buildSourceMetafieldPayload(post, sourceHash);

    if (shopifyLink?.sourceMetafieldId) {
      // Update existing metafield
      const result = await restClient.put({
        path: `blogs/${blogId}/articles/${articleId}/metafields/${shopifyLink.sourceMetafieldId}`,
        data: metafieldPayload,
        type: "application/json",
      });

      if (result.body?.metafield?.id) {
        await prisma.shopifyArticle.update({
          where: { postId: post.id },
          data: { sourceMetafieldId: String(result.body.metafield.id) },
        });
      }
    } else {
      // Create new metafield
      const result = await restClient.post({
        path: `blogs/${blogId}/articles/${articleId}/metafields`,
        data: metafieldPayload,
        type: "application/json",
      });

      if (result.body?.metafield?.id) {
        await prisma.shopifyArticle.update({
          where: { postId: post.id },
          data: { sourceMetafieldId: String(result.body.metafield.id) },
        });
      }
    }
  } catch (err) {
    // Metafield write failure is non-fatal — log and continue
    console.warn(`[ArticleSyncService] Failed to write source metafield for post ${post.id}:`, err.message);
  }
}

/**
 * Read the source metafield from a Shopify article.
 * Returns null if no metafield exists (article was created externally).
 */
async function readSourceMetafield(restClient, blogId, articleId) {
  try {
    // First, list metafields to find ours
    const listResult = await restClient.get({
      path: `blogs/${blogId}/articles/${articleId}/metafields`,
    });

    const metafields = listResult.body?.metafields || [];
    const sourceMetafield = metafields.find(
      (m) => m.namespace === METAFIELD_NAMESPACE && m.key === METAFIELD_KEY
    );

    if (!sourceMetafield) {
      return null;
    }

    // Parse the JSON value
    let parsed;
    try {
      parsed = typeof sourceMetafield.value === "string"
        ? JSON.parse(sourceMetafield.value)
        : sourceMetafield.value;
    } catch {
      return null;
    }

    return {
      metafieldId: sourceMetafield.id,
      ...parsed,
    };
  } catch (err) {
    console.warn(`[ArticleSyncService] Failed to read source metafield for article ${articleId}:`, err.message);
    return null;
  }
}

/**
 * Push a post from the app to Shopify.
 * Handles create vs update, writes metafield source, tracks hashes for echo suppression.
 */
async function pushPostToShopify(postId, { publishMode = false } = {}) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      shopifyArticle: true,
      tags: { include: { tag: true } },
      shop: true,
    },
  });

  if (!post) {
    throw new Error(`Post ${postId} not found`);
  }

  const shopifyLink = post.shopifyArticle;
  if (!shopifyLink?.shopifyBlogId) {
    throw new Error("Post is not linked to a Shopify blog");
  }

  // Find a valid session for this shop
  const session = await shopify.config.sessionStorage.findSessionsByShop(post.shop.domain);
  const validSession = session?.find(s => s.accessToken);
  if (!validSession) {
    throw new Error(`No active Shopify session for ${post.shop.domain}`);
  }

  const graphqlClient = new shopify.api.clients.Graphql({ session: validSession });
  const restClient = new shopify.api.clients.Rest({ session: validSession });

  // Compile content for storefront
  const storefrontHtml = await EditorContentCompiler.compileForStorefront(
    post.contentHtml || "",
    validSession,
    graphqlClient,
    post.shop.domain
  );

  // Build tag string
  const tagNames = post.tags
    ? post.tags.map((pt) => pt.tag?.name).filter(Boolean).join(", ")
    : "";

  const published = publishMode ? true : post.status === "published";

  const articleData = {
    article: {
      title: post.title,
      body_html: storefrontHtml,
      author: post.author || "Admin",
      published,
      tags: tagNames,
      ...(post.featuredImage ? { image: { src: post.featuredImage } } : {}),
    },
  };

  // Compute outbound hash for echo suppression
  const outboundHash = computeContentHash({
    title: post.title,
    body_html: storefrontHtml,
    author: post.author || "Admin",
    published,
    tags: tagNames,
    image: post.featuredImage,
  });

  // Compute source hash (what the app considers canonical)
  const sourceHash = computeContentHash({
    title: post.title,
    body_html: post.contentHtml || "",
    author: post.author || "",
    published,
    tags: tagNames,
    image: post.featuredImage,
  });

  let articleId = shopifyLink.shopifyArticleId;
  let remoteUpdatedAt = null;

  if (articleId) {
    // Update existing article on Shopify
    const result = await restClient.put({
      path: `blogs/${shopifyLink.shopifyBlogId}/articles/${articleId}`,
      data: articleData,
      type: "application/json",
    });
    remoteUpdatedAt = result.body?.article?.updated_at || null;
  } else {
    // Create new article on Shopify
    const result = await restClient.post({
      path: `blogs/${shopifyLink.shopifyBlogId}/articles`,
      data: articleData,
      type: "application/json",
    });
    articleId = String(result.body?.article?.id);
    remoteUpdatedAt = result.body?.article?.updated_at || null;
    if (!articleId) {
      throw new Error("Shopify did not return an article ID");
    }
  }

  // Update sync tracking metadata first (before metafield write)
  await prisma.shopifyArticle.upsert({
    where: { postId: post.id },
    create: {
      postId: post.id,
      shopifyArticleId: String(articleId),
      shopifyBlogId: String(shopifyLink.shopifyBlogId),
      status: published ? "published" : "draft",
      syncedAt: new Date(),
      syncState: "in_sync",
      syncMode: "managed_by_app",
      lastSyncDirection: "app_to_shopify",
      lastSourceHash: sourceHash,
      lastOutboundHash: outboundHash,
      lastRemoteUpdatedAt: remoteUpdatedAt ? new Date(remoteUpdatedAt) : null,
      lastError: null,
    },
    update: {
      shopifyArticleId: String(articleId),
      status: published ? "published" : "draft",
      syncedAt: new Date(),
      syncState: "in_sync",
      syncMode: "managed_by_app",
      lastSyncDirection: "app_to_shopify",
      lastSourceHash: sourceHash,
      lastOutboundHash: outboundHash,
      lastRemoteUpdatedAt: remoteUpdatedAt ? new Date(remoteUpdatedAt) : null,
      lastError: null,
    },
  });

  // Write source metafield to preserve structured content
  // (runs after upsert so writeSourceMetafield can update sourceMetafieldId without being overwritten)
  await writeSourceMetafield(restClient, shopifyLink.shopifyBlogId, articleId, post, sourceHash);

  // Log the sync event
  await logSyncEvent({
    shopId: post.shopId,
    postId: post.id,
    shopifyArticleId: String(articleId),
    direction: "app_to_shopify",
    eventType: shopifyLink.shopifyArticleId ? "update" : "create",
    status: "applied",
    message: `Successfully synced post "${post.title}" to Shopify`,
    localHash: sourceHash,
    remoteHash: outboundHash,
  });

  return { success: true, articleId, syncedAt: new Date() };
}

/**
 * Handle an inbound webhook event from Shopify.
 * Uses hash-based echo suppression to avoid infinite loops.
 * Parses Shopify HTML into structured blocks when possible.
 */
async function handleArticleWebhook(topic, shopDomain, body) {
  if (_webhookDepth >= MAX_WEBHOOK_DEPTH) {
    console.error(`[ArticleSyncService] Max webhook recursion depth reached for ${topic} on ${shopDomain}`);
    _webhookDepth = 0;
    return;
  }
  _webhookDepth++;
  try {
    return await _handleArticleWebhookInner(topic, shopDomain, body);
  } finally {
    _webhookDepth--;
  }
}

async function _handleArticleWebhookInner(topic, shopDomain, body) {
  const payload = typeof body === "string" ? JSON.parse(body) : body;
  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) {
    console.warn(`[ArticleSyncService] No shop found for domain: ${shopDomain}`);
    return;
  }

  const shopifyArticleId = String(payload.id);

  switch (topic) {
    case "ARTICLES_CREATE": {
      // Dedup check
      const existingLink = await prisma.shopifyArticle.findFirst({
        where: { shopifyArticleId },
      });
      if (existingLink) {
        await logSyncEvent({
          shopId: shop.id,
          shopifyArticleId,
          direction: "shopify_to_app",
          eventType: "webhook",
          status: "skipped_duplicate",
          message: "ARTICLES_CREATE skipped: article already linked",
        });
        return;
      }

      // Compute inbound hash
      const inboundHash = computeContentHash(payload);

      // Parse Shopify HTML into blocks
      const parsed = ShopifyArticleParser.parse(payload.body_html || "");

      // Create local post
      const post = await prisma.post.create({
        data: {
          shopId: shop.id,
          title: payload.title,
          slug: payload.handle || String(payload.id),
          status: payload.published_at ? "published" : "draft",
          author: payload.author || null,
          contentHtml: parsed.rawEditorHtml || payload.body_html || "",
          contentJson: parsed.blocks,
          featuredImage: payload.image?.src || null,
          publishedAt: payload.published_at ? new Date(payload.published_at) : null,
        },
      });

      // Link and create sync metadata
      await prisma.shopifyArticle.create({
        data: {
          postId: post.id,
          shopifyArticleId,
          shopifyBlogId: String(payload.blog_id),
          status: payload.published_at ? "published" : "draft",
          syncedAt: new Date(),
          syncState: "in_sync",
          syncMode: "external_html",
          lastSyncDirection: "shopify_to_app",
          lastInboundHash: inboundHash,
          lastRemoteUpdatedAt: payload.updated_at ? new Date(payload.updated_at) : null,
          structureDegraded: parsed.structureDegraded,
        },
      });

      // Process tags
      if (payload.tags) {
        const tagNames = payload.tags.split(",").map(t => t.trim()).filter(Boolean);
        for (const tagName of tagNames) {
          const slug = tagName.toLowerCase().replace(/\s+/g, "-");
          const tagRec = await prisma.tag.upsert({
            where: { shopId_slug: { shopId: shop.id, slug } },
            create: { shopId: shop.id, name: tagName, slug },
            update: {},
          });
          await prisma.postTag.upsert({
            where: { postId_tagId: { postId: post.id, tagId: tagRec.id } },
            create: { postId: post.id, tagId: tagRec.id },
            update: {},
          });
        }
      }

      await logSyncEvent({
        shopId: shop.id,
        postId: post.id,
        shopifyArticleId,
        direction: "shopify_to_app",
        eventType: "webhook",
        status: "applied",
        message: `ARTICLES_CREATE: Created local post "${post.title}" from Shopify article`,
        remoteHash: inboundHash,
      });
      break;
    }

    case "ARTICLES_UPDATE": {
      const link = await prisma.shopifyArticle.findFirst({
        where: { shopifyArticleId },
        include: { post: true },
      });
      if (!link) {
        // Article not linked — auto-create a local post for true 2-way sync
        await logSyncEvent({
          shopId: shop.id,
          shopifyArticleId,
          direction: "shopify_to_app",
          eventType: "webhook",
          status: "error",
          message: "ARTICLES_UPDATE: No local link found, auto-creating...",
        });
        // Treat as create
        return handleArticleWebhook("ARTICLES_CREATE", shopDomain, body);
      }

      // Echo suppression: compute inbound hash and compare
      const inboundHash = computeContentHash(payload);

      if (inboundHash === link.lastOutboundHash) {
        // This is an echo from our own push — skip
        await logSyncEvent({
          shopId: shop.id,
          postId: link.postId,
          shopifyArticleId,
          direction: "shopify_to_app",
          eventType: "webhook",
          status: "skipped_echo",
          message: "ARTICLES_UPDATE skipped: inbound hash matches last outbound hash (echo)",
          localHash: link.lastOutboundHash,
          remoteHash: inboundHash,
        });
        return;
      }

      if (inboundHash === link.lastInboundHash) {
        // Duplicate webhook delivery — skip
        await logSyncEvent({
          shopId: shop.id,
          postId: link.postId,
          shopifyArticleId,
          direction: "shopify_to_app",
          eventType: "webhook",
          status: "skipped_duplicate",
          message: "ARTICLES_UPDATE skipped: duplicate inbound hash",
          localHash: link.lastInboundHash,
          remoteHash: inboundHash,
        });
        return;
      }

      // ── Read source metafield to detect app-managed articles ────────────
      // If the metafield exists, the article was created by this app and we
      // can reconstruct structured content from it.
      let sourceMetafieldData = null;
      let sessionForMetafield = null;

      try {
        const sessions = await shopify.config.sessionStorage.findSessionsByShop(shop.domain);
        sessionForMetafield = sessions?.find(s => s.accessToken);
        if (sessionForMetafield && link.shopifyArticleId && link.shopifyBlogId) {
          const restClient = new shopify.api.clients.Rest({ session: sessionForMetafield });
          sourceMetafieldData = await readSourceMetafield(
            restClient,
            link.shopifyBlogId,
            link.shopifyArticleId
          );

          // Store the metafield ID locally if found
          if (sourceMetafieldData?.metafieldId) {
            await prisma.shopifyArticle.update({
              where: { id: link.id },
              data: { sourceMetafieldId: String(sourceMetafieldData.metafieldId) },
            });
          }
        }
      } catch (err) {
        console.warn(`[ArticleSyncService] Failed to read metafield for ${shopifyArticleId}:`, err.message);
      }

      // Determine syncMode based on whether metafield exists
      const hasSourceMetafield = !!sourceMetafieldData;
      const syncMode = hasSourceMetafield ? "managed_by_app" : "external_html";

      // If the metafield exists, the article is app-managed — use the metafield's
      // structured content (contentJson/contentHtml) as the canonical source.
      // This preserves editor blocks even if Shopify modifies the compiled HTML.
      const contentPreservedByMetafield = hasSourceMetafield;

      // Attempt to preserve structure by checking if local source is unchanged
      const currentSourceHash = computeContentHash({
        title: link.post.title,
        body_html: link.post.contentHtml || "",
        author: link.post.author || "",
        published: link.post.status === "published",
        tags: link.post.tags?.map(pt => pt.tag?.name).join(",") || "",
        image: link.post.featuredImage || null,
      });

      // Check for conflict: both sides changed since last sync
      const localChanged = currentSourceHash !== link.lastSourceHash;
      const remoteChanged = inboundHash !== link.lastInboundHash;

      // Parse Shopify HTML into blocks (only used if metafield doesn't preserve structure)
      const parsed = ShopifyArticleParser.parse(payload.body_html || "");

      let newContentHtml = parsed.rawEditorHtml || payload.body_html || "";
      let newContentJson = parsed.blocks;
      let newStatus = payload.published_at ? "published" : "draft";
      let structureDegraded = parsed.structureDegraded;
      let syncState = "in_sync";

      // If metafield preserved content, use the canonical source data
      if (contentPreservedByMetafield) {
        newContentHtml = sourceMetafieldData.contentHtml || newContentHtml;
        newContentJson = sourceMetafieldData.contentJson || newContentJson;
        structureDegraded = false;
      }

      // Determine which version wins — if both sides changed, raise conflict for manual resolution
      if (localChanged && remoteChanged && inboundHash !== link.lastOutboundHash) {
        // Both changed — set conflict state for manual resolution
        syncState = "conflict";
        // Keep local content in place (don't overwrite with Shopify version)
        newContentHtml = link.post.contentHtml || "";
        newContentJson = link.post.contentJson || [];
        structureDegraded = link.structureDegraded;
        await logSyncEvent({
          shopId: shop.id,
          postId: link.postId,
          shopifyArticleId,
          direction: "shopify_to_app",
          eventType: "webhook",
          status: "conflict",
          message: `Conflict detected for "${link.post.title}": both local and Shopify changed since last sync. Needs manual resolution.`,
          localHash: currentSourceHash,
          remoteHash: inboundHash,
        });
      }

      // Update local post
      const updateData = {
        title: payload.title,
        slug: payload.handle || link.post.slug,
        status: newStatus,
        author: payload.author || null,
        featuredImage: payload.image?.src || null,
        publishedAt: payload.published_at ? new Date(payload.published_at) : null,
      };

      // Only overwrite content if not in conflict or pending_app_push
      if (syncState !== "pending_app_push" && syncState !== "conflict") {
        updateData.contentHtml = newContentHtml;
        updateData.contentJson = newContentJson;
      }

      await prisma.post.update({
        where: { id: link.postId },
        data: updateData,
      });

      // Update sync tracking
      const syncUpdateData = {
        status: newStatus,
        syncedAt: new Date(),
        syncState,
        syncMode,
        lastSyncDirection: (syncState === "pending_app_push" || syncState === "conflict") ? "app_to_shopify" : "shopify_to_app",
        lastInboundHash: inboundHash,
        lastRemoteUpdatedAt: payload.updated_at ? new Date(payload.updated_at) : null,
        structureDegraded,
        sourceMetafieldId: sourceMetafieldData?.metafieldId
          ? String(sourceMetafieldData.metafieldId)
          : undefined,
        lastError: syncState === "conflict"
          ? `Conflict: both local and Shopify changed. Remote hash: ${inboundHash.substring(0, 12)}… Local hash: ${currentSourceHash.substring(0, 12)}…`
          : syncState === "pending_app_push"
            ? "Local changes preserved over Shopify changes"
            : null,
      };

      // Remove undefined fields to avoid overwriting with null
      Object.keys(syncUpdateData).forEach((k) => syncUpdateData[k] === undefined && delete syncUpdateData[k]);

      await prisma.shopifyArticle.update({
        where: { id: link.id },
        data: syncUpdateData,
      });

      if (syncState === "in_sync" && !remoteChanged) {
        // Nothing changed — skip logging
      } else if (syncState !== "pending_app_push" && syncState !== "conflict") {
        await logSyncEvent({
          shopId: shop.id,
          postId: link.postId,
          shopifyArticleId,
          direction: "shopify_to_app",
          eventType: "webhook",
          status: "applied",
          message: `ARTICLES_UPDATE: Applied Shopify changes to post "${link.post.title}"`,
          localHash: currentSourceHash,
          remoteHash: inboundHash,
        });
      }
      break;
    }

    case "ARTICLES_DELETE": {
      const link = await prisma.shopifyArticle.findFirst({
        where: { shopifyArticleId },
        include: { post: true },
      });
      if (!link) {
        await logSyncEvent({
          shopId: shop.id,
          shopifyArticleId,
          direction: "shopify_to_app",
          eventType: "webhook",
          status: "skipped_duplicate",
          message: "ARTICLES_DELETE skipped: no local link found",
        });
        return;
      }

      const postTitle = link.post?.title || "Unknown";

      // Delete local post (cascades to ShopifyArticle)
      await prisma.post.delete({ where: { id: link.postId } });

      await logSyncEvent({
        shopId: shop.id,
        postId: link.postId,
        shopifyArticleId,
        direction: "shopify_to_app",
        eventType: "webhook",
        status: "applied",
        message: `ARTICLES_DELETE: Deleted local post "${postTitle}"`,
      });
      break;
    }

    default:
      console.warn(`[ArticleSyncService] Unknown webhook topic: ${topic}`);
  }
}

/**
 * Reconcile a single post — fetch current state from Shopify and compare with local.
 * This is a lightweight reconciliation used by the periodic job or manual button.
 */
async function reconcilePost(postId) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      shopifyArticle: true,
      tags: { include: { tag: true } },
      shop: true,
    },
  });

  if (!post || !post.shopifyArticle?.shopifyArticleId || !post.shopifyArticle?.shopifyBlogId) {
    return { status: "not_linked" };
  }

  const session = await shopify.config.sessionStorage.findSessionsByShop(post.shop.domain);
  const validSession = session?.find(s => s.accessToken);
  if (!validSession) {
    return { status: "no_session" };
  }

  try {
    const client = new shopify.api.clients.Rest({ session: validSession });
    const response = await client.get({
      path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
    });

    const remote = response.body?.article;
    if (!remote) {
      // Article missing on Shopify
      await prisma.shopifyArticle.update({
        where: { postId: post.id },
        data: { syncState: "remote_missing" },
      });
      return { status: "remote_missing" };
    }

    const inboundHash = computeContentHash(remote);
    const link = post.shopifyArticle;

    if (inboundHash === link.lastOutboundHash && inboundHash === link.lastInboundHash) {
      // Already in sync
      return { status: "in_sync" };
    }

    if (inboundHash !== link.lastInboundHash && inboundHash !== link.lastOutboundHash) {
      // Remote has changes we haven't seen — pull them in
      await handleArticleWebhook("ARTICLES_UPDATE", post.shop.domain, JSON.stringify(remote));

      // Check if the webhook set the post to conflict state
      const updatedLink = await prisma.shopifyArticle.findUnique({
        where: { postId: post.id },
        select: { syncState: true },
      });

      if (updatedLink?.syncState === "conflict") {
        return { status: "conflict" };
      }

      return { status: "reconciled" };
    }

    return { status: "no_action_needed" };
  } catch (err) {
    console.error(`Reconciliation failed for post ${postId}:`, err);
    return { status: "error", error: err.message };
  }
}

export const ArticleSyncService = {
  pushPostToShopify,
  handleArticleWebhook,
  reconcilePost,
  computeContentHash,
  logSyncEvent,
};
