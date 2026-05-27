/**
 * ArticleSyncService
 * Centralized service for 2-way synchronization between app posts and Shopify articles.
 *
 * Uses baseline-based field-level three-way merge:
 *   - Base = last synced snapshot (per-field values + hashes)
 *   - Local = current app state
 *   - Remote = current Shopify/webhook state
 *   - Auto-merges non-conflicting field changes
 *   - Raises field-level conflict only when same field changed on both sides differently
 *   - Push merged result back to Shopify when local changes need to converge
 *
 * For content comparison, local uses editorHtml (raw) and remote uses storefrontHtml (compiled).
 * The baseline stores both representations so they can be compared independently.
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import shopify from "../../shopify.js";
import { EditorContentCompiler } from "./EditorContentCompiler.js";
import { ShopifyArticleParser } from "./ShopifyArticleParser.js";

const prisma = new PrismaClient();

const MAX_WEBHOOK_DEPTH = 3;
let _webhookDepth = 0;

// Reconciliation rate limiting (Shopify has no ARTICLES_* webhooks — polling is primary)
const RECONCILE_DELAY_MS = 250;
const RECONCILE_SKIP_RECENT_MINUTES = 1;
const RECONCILE_INTERVAL_MINUTES = 1;
const POLL_RECONCILE_COOLDOWN_MS = 12_000;

const _pollReconcileLastRun = new Map();

const METAFIELD_NAMESPACE = "blog_app";
const METAFIELD_KEY = "source";
const METAFIELD_TYPE = "json";

// ─── Scalar fields we merge independently ─────────────────────────────────────
const SCALAR_FIELDS = ["title", "author", "status", "tags", "featuredImage"];

/** True when a field hash differs from the last-synced baseline. */
function changedFromBase(currentHash, baseHash) {
  if (!baseHash) return false;
  return currentHash !== baseHash;
}

function parseRemoteUpdatedAt(payload) {
  if (!payload?.updated_at) return null;
  const d = new Date(payload.updated_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isRemoteNewerThanLastSync(remoteUpdatedAt, link) {
  if (!remoteUpdatedAt || !link?.lastRemoteUpdatedAt) return !!remoteUpdatedAt;
  return remoteUpdatedAt.getTime() > link.lastRemoteUpdatedAt.getTime();
}

function localEditedSinceLastSync(post, link) {
  if (!post?.updatedAt || !link?.syncedAt) return true;
  return post.updatedAt.getTime() > link.syncedAt.getTime() + 1000;
}

// ══════════════════════════════════════════════════════════════════════════════
//  HASH HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute a single-field hash for three-way merge comparison.
 */
function fieldHash(value) {
  const normalized = value === null || value === undefined
    ? "__NULL__"
    : typeof value === "string"
      ? value.trim()
      : JSON.stringify(value);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Compute a composite content hash from article fields (legacy, for echo suppression).
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

// ══════════════════════════════════════════════════════════════════════════════
//  STATE NORMALIZATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize the current local post into field-level comparison format.
 */
function normalizeLocalState(post, tagNames) {
  return {
    title: post.title || "",
    author: post.author || "",
    status: (post.status === "published") ? "published" : "draft",
    tags: tagNames || "",
    featuredImage: post.featuredImage || null,
    content: {
      editorHtml: post.contentHtml || "",
      contentJson: post.contentJson || [],
    },
  };
}

/**
 * Normalize a Shopify webhook / REST payload into field-level comparison format.
 */
function normalizeRemoteState(payload) {
  const remoteTags = (payload.tags || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .sort()
    .join(",");
  return {
    title: payload.title || "",
    author: payload.author || "",
    status: payload.published_at ? "published" : "draft",
    tags: remoteTags,
    featuredImage: payload.image?.src || null,
    content: {
      storefrontHtml: payload.body_html || "",
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  BASELINE SNAPSHOT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build a version-2 baseline snapshot from the current local state + compiled HTML.
 * This snapshot becomes the "base" for future three-way merges.
 */
function buildBaselineSnapshot(localState, storefrontHtml, revision) {
  const f = (v) => fieldHash(v);
  return {
    version: 2,
    revision,
    syncedAt: new Date().toISOString(),
    fields: {
      title:       { value: localState.title,       hash: f(localState.title) },
      author:      { value: localState.author,      hash: f(localState.author) },
      status:      { value: localState.status,      hash: f(localState.status) },
      tags:        { value: localState.tags,        hash: f(localState.tags) },
      featuredImage: { value: localState.featuredImage, hash: f(localState.featuredImage) },
      content: {
        editorHtml:      { value: localState.content.editorHtml, hash: f(localState.content.editorHtml) },
        contentJson:      { hash: f(JSON.stringify(localState.content.contentJson)) },
        storefrontHtml:   { value: storefrontHtml, hash: f(storefrontHtml) },
      },
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  THREE-WAY MERGE ENGINE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Perform a field-level three-way merge.
 *
 * @param {Object|null}  base   – lastSyncedSnapshot.fields (or null for legacy articles)
 * @param {Object}       local  – normalized local state (from normalizeLocalState)
 * @param {Object}       remote – normalized remote state (from normalizeRemoteState)
 * @returns {{ merged: Object, conflicts: Object, needsPushBack: boolean }}
 *
 * merged    – { field: { value, source } }  – the resolved value per field
 * conflicts – { field: { base, local, remote } } – fields with same-field disagreement
 * needsPushBack – true when local-won fields need to be pushed to Shopify
 */
function threeWayMerge(base, local, remote, { localEditedSinceSync = false } = {}) {
  const merged = {};
  const conflicts = {};

  // Legacy articles without a baseline: compare local vs remote directly.
  if (!base?.fields) {
    for (const field of SCALAR_FIELDS) {
      const localHash = fieldHash(local[field]);
      const remoteHash = fieldHash(remote[field]);
      if (localHash === remoteHash) {
        merged[field] = { value: local[field], source: "both" };
      } else if (localEditedSinceSync) {
        merged[field] = { value: local[field], source: "local" };
      } else {
        merged[field] = { value: remote[field], source: "remote" };
      }
    }

    const localContentHash = fieldHash(local.content.editorHtml);
    const remoteContentHash = fieldHash(remote.content.storefrontHtml);
    if (localContentHash === remoteContentHash) {
      merged.content = { value: local.content, source: "both" };
    } else if (localEditedSinceSync) {
      merged.content = { value: local.content, source: "local" };
    } else {
      merged.content = { value: null, source: "remote", needsParse: true };
    }

    const needsPushBack = localEditedSinceSync
      && Object.values(merged).some(m => m.source === "local");
    return { merged, conflicts, needsPushBack };
  }

  // ── Scalar fields ───────────────────────────────────────────────
  for (const field of SCALAR_FIELDS) {
    const localHash  = fieldHash(local[field]);
    const remoteHash = fieldHash(remote[field]);
    const baseHash   = base?.fields?.[field]?.hash;

    const localChanged  = changedFromBase(localHash, baseHash);
    const remoteChanged = changedFromBase(remoteHash, baseHash);

    if (!localChanged && !remoteChanged) {
      merged[field] = { value: local[field], source: "base" };
    } else if (localChanged && !remoteChanged) {
      merged[field] = { value: local[field], source: "local" };
    } else if (!localChanged && remoteChanged) {
      merged[field] = { value: remote[field], source: "remote" };
    } else {
      // Both changed
      if (localHash === remoteHash) {
        merged[field] = { value: local[field], source: "both" };
      } else {
        conflicts[field] = {
          base:   base?.fields?.[field]?.value ?? null,
          local:  local[field],
          remote: remote[field],
        };
        merged[field] = { value: local[field], source: "conflict" };
      }
    }
  }

  // ── Content field (dual representation) ─────────────────────────
  const localContentHash   = fieldHash(local.content.editorHtml);
  const remoteContentHash  = fieldHash(remote.content.storefrontHtml);
  const baseEditorHash     = base?.fields?.content?.editorHtml?.hash;
  const baseStorefrontHash = base?.fields?.content?.storefrontHtml?.hash;

  const localContentChanged  = changedFromBase(localContentHash, baseEditorHash);
  const remoteContentChanged = changedFromBase(remoteContentHash, baseStorefrontHash);

  if (!localContentChanged && !remoteContentChanged) {
    merged.content = { value: local.content, source: "base" };
  } else if (localContentChanged && !remoteContentChanged) {
    merged.content = { value: local.content, source: "local" };
  } else if (!localContentChanged && remoteContentChanged) {
    // Remote content changed but local didn't — accept remote, mark as needing parse
    merged.content = { value: null, source: "remote", needsParse: true };
  } else {
    // Both changed
    if (localContentHash === fieldHash(remote.content.storefrontHtml)) {
      // Same change (converged) — keep local
      merged.content = { value: local.content, source: "both" };
    } else {
      conflicts.content = {
        base: {
          editorHtml:    base?.fields?.content?.editorHtml?.value ?? null,
          storefrontHtml: base?.fields?.content?.storefrontHtml?.value ?? null,
        },
        local:  local.content,
        remote: { storefrontHtml: remote.content.storefrontHtml },
      };
      merged.content = { value: local.content, source: "conflict" };
    }
  }

  // Push back only when the app was edited since last sync and local-only fields won.
  const needsPushBack = localEditedSinceSync
    && Object.values(merged).some(m => m.source === "local");

  return { merged, conflicts, needsPushBack };
}

/**
 * Apply merge results to produce final post update data.
 * For remote-only content: parses the storefront HTML into editor blocks.
 */
function applyMergedResult(merged, conflicts, post, remotePayload) {
  const hasConflicts = Object.keys(conflicts).length > 0;
  const syncState = hasConflicts ? "conflict" : "in_sync";

  // Build post update
  const postUpdate = {
    title: merged.title.value,
    status: merged.status.value,
    author: merged.author.value || null,
    featuredImage: merged.featuredImage.value,
    publishedAt: merged.status.source === "remote"
      ? (remotePayload?.published_at ? new Date(remotePayload.published_at) : (merged.status.value === "published" ? new Date() : null))
      : (post.publishedAt || (merged.status.value === "published" ? new Date() : null)),
  };

  // Derive slug — when title won "remote", use remote handle; otherwise keep local slug / regenerate
  if (merged.title.source === "remote") {
    postUpdate.slug = remotePayload?.handle || post.slug;
  } else {
    // Keep existing slug (slug regeneration on title change is handled at UI level)
    postUpdate.slug = post.slug;
  }

  // Determine if remote tags should be applied
  const applyRemoteTags = merged.tags.source === "remote";
  const remoteTagNames = applyRemoteTags
    ? remotePayload?.tags
      ? remotePayload.tags.split(",").map(t => t.trim()).filter(Boolean)
      : []
    : null;

  // Handle content
  let newContentHtml = post.contentHtml;
  let newContentJson = post.contentJson;
  let structureDegraded = false;

  if (merged.content.source === "remote") {
    const htmlToParse = merged.content.needsParse
      ? remotePayload?.body_html || ""
      : merged.content.value?.storefrontHtml || "";
    const parsed = ShopifyArticleParser.parse(htmlToParse);
    newContentHtml = parsed.rawEditorHtml || htmlToParse;
    newContentJson = parsed.blocks;
    structureDegraded = parsed.structureDegraded;
  } else if (merged.content.source === "local" || merged.content.source === "base" || merged.content.source === "both") {
    newContentHtml = merged.content.value?.editorHtml ?? newContentHtml;
    newContentJson = merged.content.value?.contentJson ?? newContentJson;
  }

  // Only overwrite content if not in conflict
  if (!hasConflicts) {
    postUpdate.contentHtml = newContentHtml;
    postUpdate.contentJson = newContentJson;
  }

  return { postUpdate, syncState, hasConflicts, structureDegraded, remoteTagNames, applyRemoteTags };
}

// ══════════════════════════════════════════════════════════════════════════════
//  METAFIELD / SYNC MARKER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Write a lightweight v2 sync marker metafield on a Shopify article.
 * Contains only hashes + revision — NOT full content (that lives in our DB).
 *
 * @param {Object} restClient - Shopify REST client
 * @param {string} blogId - Shopify blog ID
 * @param {string} articleId - Shopify article ID
 * @param {Object} baseline - The baseline snapshot object
 * @param {number} postId - Local app post ID (for DB lookup)
 */
async function writeSyncMarker(restClient, blogId, articleId, baseline, postId) {
  try {
    const shopifyLink = await prisma.shopifyArticle.findUnique({
      where: { postId },
    });
    if (!shopifyLink) return;

    const markerPayload = {
      metafield: {
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: METAFIELD_TYPE,
        value: JSON.stringify({
          version: 2,
          managedBy: "blog_app",
          mode: "baseline_sync",
          revision: baseline.revision,
          lastSyncedAt: baseline.syncedAt,
          hashes: {
            title:          baseline.fields.title.hash,
            author:         baseline.fields.author.hash,
            status:         baseline.fields.status.hash,
            tags:           baseline.fields.tags.hash,
            featuredImage:  baseline.fields.featuredImage.hash,
            editorHtml:     baseline.fields.content.editorHtml.hash,
            contentJson:    baseline.fields.content.contentJson.hash,
            storefrontHtml: baseline.fields.content.storefrontHtml.hash,
          },
          capabilities: { fieldLevelMerge: true, structuredSourceAvailable: true },
        }),
      },
    };

    if (shopifyLink.sourceMetafieldId) {
      const result = await restClient.put({
        path: `blogs/${blogId}/articles/${articleId}/metafields/${shopifyLink.sourceMetafieldId}`,
        data: markerPayload,
        type: "application/json",
      });
      if (result.body?.metafield?.id) {
        await prisma.shopifyArticle.update({
          where: { id: shopifyLink.id },
          data: { sourceMetafieldId: String(result.body.metafield.id) },
        });
      }
    } else {
      const result = await restClient.post({
        path: `blogs/${blogId}/articles/${articleId}/metafields`,
        data: markerPayload,
        type: "application/json",
      });
      if (result.body?.metafield?.id) {
        await prisma.shopifyArticle.update({
          where: { id: shopifyLink.id },
          data: { sourceMetafieldId: String(result.body.metafield.id) },
        });
      }
    }
  } catch (err) {
    console.warn(`[ArticleSyncService] Failed to write sync marker for article ${articleId}:`, err.message);
  }
}

/**
 * Read the sync marker metafield from a Shopify article.
 * Returns null if no metafield exists (article is external).
 */
async function readSyncMarker(restClient, blogId, articleId) {
  try {
    const listResult = await restClient.get({
      path: `blogs/${blogId}/articles/${articleId}/metafields`,
    });
    const metafields = listResult.body?.metafields || [];
    const sourceMetafield = metafields.find(
      (m) => m.namespace === METAFIELD_NAMESPACE && m.key === METAFIELD_KEY
    );
    if (!sourceMetafield) return null;

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
    console.warn(`[ArticleSyncService] Failed to read sync marker for article ${articleId}:`, err.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOGGING
// ══════════════════════════════════════════════════════════════════════════════

async function logSyncEvent({
  shopId, postId = null, shopifyArticleId = null,
  direction, eventType, status, message = null,
  localHash = null, remoteHash = null, payload = null,
}) {
  try {
    await prisma.articleSyncLog.create({
      data: {
        shopId, postId, shopifyArticleId, direction, eventType, status,
        message, localHash, remoteHash,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
      },
    });
  } catch (err) {
    console.error("Failed to log sync event:", err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PUSH (APP → SHOPIFY)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Push a post from the app to Shopify.
 * After success, writes a baseline snapshot + v2 sync marker metafield.
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

  if (!post) throw new Error(`Post ${postId} not found`);
  const shopifyLink = post.shopifyArticle;
  if (!shopifyLink?.shopifyBlogId) throw new Error("Post is not linked to a Shopify blog");

  const session = await shopify.config.sessionStorage.findSessionsByShop(post.shop.domain);
  const validSession = session?.find(s => s.accessToken);
  if (!validSession) throw new Error(`No active Shopify session for ${post.shop.domain}`);

  const graphqlClient = new shopify.api.clients.Graphql({ session: validSession });
  const restClient = new shopify.api.clients.Rest({ session: validSession });

  // Compile content for storefront
  const storefrontHtml = await EditorContentCompiler.compileForStorefront(
    post.contentHtml || "", validSession, graphqlClient, post.shop.domain
  );

  // Tag string
  const tagNames = post.tags
    ? post.tags.map((pt) => pt.tag?.name).filter(Boolean).join(", ")
    : "";
  const published = publishMode ? true : post.status === "published";

  // Compute outbound hash for echo suppression
  const outboundHash = computeContentHash({
    title: post.title,
    body_html: storefrontHtml,
    author: post.author || "Admin",
    published,
    tags: tagNames,
    image: post.featuredImage,
  });

  let articleId = shopifyLink.shopifyArticleId;
  let remoteUpdatedAt = null;

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

  if (articleId) {
    const result = await restClient.put({
      path: `blogs/${shopifyLink.shopifyBlogId}/articles/${articleId}`,
      data: articleData,
      type: "application/json",
    });
    remoteUpdatedAt = result.body?.article?.updated_at || null;
  } else {
    const result = await restClient.post({
      path: `blogs/${shopifyLink.shopifyBlogId}/articles`,
      data: articleData,
      type: "application/json",
    });
    articleId = String(result.body?.article?.id);
    remoteUpdatedAt = result.body?.article?.updated_at || null;
    if (!articleId) throw new Error("Shopify did not return an article ID");
  }

  // Compute next revision
  const nextRevision = (shopifyLink.syncRevision || 0) + 1;

  // Build normalized local state + baseline snapshot
  const localState = normalizeLocalState(post, tagNames);
  const baseline = buildBaselineSnapshot(localState, storefrontHtml, nextRevision);

  // Update sync tracking with baseline
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
      lastOutboundHash: outboundHash,
      lastRemoteUpdatedAt: remoteUpdatedAt ? new Date(remoteUpdatedAt) : null,
      lastError: null,
      syncRevision: nextRevision,
      lastSyncedSnapshot: baseline,
    },
    update: {
      shopifyArticleId: String(articleId),
      status: published ? "published" : "draft",
      syncedAt: new Date(),
      syncState: "in_sync",
      syncMode: "managed_by_app",
      lastSyncDirection: "app_to_shopify",
      lastOutboundHash: outboundHash,
      lastRemoteUpdatedAt: remoteUpdatedAt ? new Date(remoteUpdatedAt) : null,
      lastError: null,
      syncRevision: nextRevision,
      lastSyncedSnapshot: baseline,
    },
  });

  // Write lightweight v2 sync marker metafield
  await writeSyncMarker(restClient, shopifyLink.shopifyBlogId, articleId, baseline, post.id);

  await logSyncEvent({
    shopId: post.shopId,
    postId: post.id,
    shopifyArticleId: String(articleId),
    direction: "app_to_shopify",
    eventType: shopifyLink.shopifyArticleId ? "update" : "create",
    status: "applied",
    message: `Successfully synced post "${post.title}" to Shopify (rev ${nextRevision})`,
  });

  return { success: true, articleId, syncedAt: new Date(), revision: nextRevision };
}

/**
 * After the user saves in the app, merge with the latest Shopify state then push.
 * Prevents overwriting Shopify-only edits when both sides changed different fields.
 */
async function syncAfterLocalEdit(postId, { publishMode = false } = {}) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      shopifyArticle: true,
      tags: { include: { tag: true } },
      shop: true,
    },
  });

  if (!post?.shopifyArticle?.shopifyBlogId) {
    throw new Error("Post is not linked to a Shopify blog");
  }

  const session = await shopify.config.sessionStorage.findSessionsByShop(post.shop.domain);
  const validSession = session?.find(s => s.accessToken);
  if (!validSession) throw new Error(`No active Shopify session for ${post.shop.domain}`);

  const client = new shopify.api.clients.Rest({ session: validSession });
  let remote = null;

  if (post.shopifyArticle.shopifyArticleId) {
    try {
      const response = await client.get({
        path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
      });
      remote = response.body?.article || null;
    } catch (err) {
      console.warn(`[ArticleSyncService] Could not fetch remote article for post ${postId}:`, err.message);
    }
  }

  if (!remote) {
    return pushPostToShopify(postId, { publishMode });
  }

  const localTagStr = post.tags
    ? post.tags.map(pt => pt.tag?.name).filter(Boolean).sort().join(",")
    : "";
  const localState = normalizeLocalState(post, localTagStr);
  const remoteState = normalizeRemoteState(remote);
  const baseFields = post.shopifyArticle.lastSyncedSnapshot?.fields || null;
  const { merged, conflicts } = threeWayMerge(
    baseFields,
    localState,
    remoteState,
    { localEditedSinceSync: true }
  );

  if (Object.keys(conflicts).length > 0) {
    const conflictPayload = {
      version: 1,
      revision: post.shopifyArticle.syncRevision || 0,
      createdAt: new Date().toISOString(),
      fields: conflicts,
    };

    await prisma.shopifyArticle.update({
      where: { postId: post.id },
      data: {
        syncState: "conflict",
        conflictPayload,
        lastError: `Conflict on: ${Object.keys(conflicts).join(", ")}`,
      },
    });

    await logSyncEvent({
      shopId: post.shopId,
      postId: post.id,
      shopifyArticleId: post.shopifyArticle.shopifyArticleId,
      direction: "app_to_shopify",
      eventType: "update",
      status: "conflict",
      message: `Save blocked by field conflict: ${Object.keys(conflicts).join(", ")}`,
      payload: conflictPayload,
    });

    return { success: false, status: "conflict", conflicts: Object.keys(conflicts) };
  }

  const { postUpdate, structureDegraded, remoteTagNames, applyRemoteTags } =
    applyMergedResult(merged, {}, post, remote);

  await prisma.post.update({
    where: { id: post.id },
    data: postUpdate,
  });

  if (applyRemoteTags && remoteTagNames?.length > 0) {
    await prisma.postTag.deleteMany({ where: { postId: post.id } });
    for (const tagName of remoteTagNames) {
      const slug = tagName.toLowerCase().replace(/\s+/g, "-");
      const tagRec = await prisma.tag.upsert({
        where: { shopId_slug: { shopId: post.shopId, slug } },
        create: { shopId: post.shopId, name: tagName, slug },
        update: {},
      });
      await prisma.postTag.upsert({
        where: { postId_tagId: { postId: post.id, tagId: tagRec.id } },
        create: { postId: post.id, tagId: tagRec.id },
        update: {},
      });
    }
  }

  if (structureDegraded) {
    await prisma.shopifyArticle.update({
      where: { postId: post.id },
      data: { structureDegraded: true },
    });
  }

  return pushPostToShopify(postId, { publishMode });
}

/**
 * Poll-driven reconcile for a single post (throttled). Used by the editor sync indicator.
 */
async function pollReconcilePost(postId) {
  const now = Date.now();
  const lastRun = _pollReconcileLastRun.get(postId) || 0;
  if (now - lastRun < POLL_RECONCILE_COOLDOWN_MS) {
    return { status: "throttled" };
  }
  _pollReconcileLastRun.set(postId, now);
  return reconcilePost(postId);
}

// ══════════════════════════════════════════════════════════════════════════════
//  WEBHOOK HANDLING
// ══════════════════════════════════════════════════════════════════════════════

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
    // ─── ARTICLES_CREATE ───────────────────────────────────────────
    case "ARTICLES_CREATE": {
      const existingLink = await prisma.shopifyArticle.findFirst({
        where: { shopifyArticleId },
      });
      if (existingLink) {
        await logSyncEvent({
          shopId: shop.id, shopifyArticleId,
          direction: "shopify_to_app", eventType: "webhook",
          status: "skipped_duplicate",
          message: "ARTICLES_CREATE skipped: article already linked",
        });
        return;
      }

      const parsed = ShopifyArticleParser.parse(payload.body_html || "");

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

      // Build tag string for baseline
      const tagsSorted = (payload.tags || "")
        .split(",").map(t => t.trim()).filter(Boolean).sort().join(",");

      // Build initial baseline from remote state
      const remoteState = normalizeRemoteState(payload);
      remoteState.content.editorHtml = parsed.rawEditorHtml || payload.body_html || "";
      remoteState.content.contentJson = parsed.blocks;
      const initialBaseline = buildBaselineSnapshot(remoteState, payload.body_html || "", 1);

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
          lastInboundHash: computeContentHash(payload),
          lastRemoteUpdatedAt: payload.updated_at ? new Date(payload.updated_at) : null,
          structureDegraded: parsed.structureDegraded,
          syncRevision: 1,
          lastSyncedSnapshot: initialBaseline,
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
        shopId: shop.id, postId: post.id, shopifyArticleId,
        direction: "shopify_to_app", eventType: "webhook",
        status: "applied",
        message: `ARTICLES_CREATE: Created local post "${post.title}" from Shopify article`,
      });
      break;
    }

    // ─── ARTICLES_UPDATE ───────────────────────────────────────────
    case "ARTICLES_UPDATE": {
      const link = await prisma.shopifyArticle.findFirst({
        where: { shopifyArticleId },
        include: { post: true },
      });
      if (!link) {
        await logSyncEvent({
          shopId: shop.id, shopifyArticleId,
          direction: "shopify_to_app", eventType: "webhook",
          status: "error",
          message: "ARTICLES_UPDATE: No local link found, auto-creating...",
        });
        return handleArticleWebhook("ARTICLES_CREATE", shopDomain, body);
      }

      // ── Echo suppression ────────────────────────────────────────
      const inboundHash = computeContentHash(payload);
      const remoteUpdatedAt = parseRemoteUpdatedAt(payload);
      const remoteIsNewer = isRemoteNewerThanLastSync(remoteUpdatedAt, link);

      if (inboundHash === link.lastOutboundHash && !remoteIsNewer) {
        await logSyncEvent({
          shopId: shop.id, postId: link.postId, shopifyArticleId,
          direction: "shopify_to_app", eventType: "webhook",
          status: "skipped_echo",
          message: "ARTICLES_UPDATE skipped: inbound hash matches last outbound hash (echo)",
        });
        return;
      }

      // ── Duplicate suppression ───────────────────────────────────
      if (inboundHash === link.lastInboundHash) {
        await logSyncEvent({
          shopId: shop.id, postId: link.postId, shopifyArticleId,
          direction: "shopify_to_app", eventType: "webhook",
          status: "skipped_duplicate",
          message: "ARTICLES_UPDATE skipped: duplicate inbound hash",
        });
        return;
      }

      // ── Read sync marker from Shopify ───────────────────────────
      let syncMarker = null;
      try {
        const sessions = await shopify.config.sessionStorage.findSessionsByShop(shop.domain);
        const sessionForMarker = sessions?.find(s => s.accessToken);
        if (sessionForMarker && link.shopifyArticleId && link.shopifyBlogId) {
          const restClient = new shopify.api.clients.Rest({ session: sessionForMarker });
          syncMarker = await readSyncMarker(restClient, link.shopifyBlogId, link.shopifyArticleId);

          if (syncMarker?.metafieldId) {
            await prisma.shopifyArticle.update({
              where: { id: link.id },
              data: { sourceMetafieldId: String(syncMarker.metafieldId) },
            });
          }
        }
      } catch (err) {
        console.warn(`[ArticleSyncService] Failed to read sync marker for ${shopifyArticleId}:`, err.message);
      }

      const hasSyncMarker = !!syncMarker;
      const syncMode = hasSyncMarker ? "managed_by_app" : "external_html";

      // ── Load tag names from local post ──────────────────────────
      const localTags = await prisma.postTag.findMany({
        where: { postId: link.postId },
        include: { tag: true },
      });
      const localTagStr = localTags.map(pt => pt.tag?.name).filter(Boolean).sort().join(",");

      // ── Normalize states ────────────────────────────────────────
      const localState = normalizeLocalState(link.post, localTagStr);
      const remoteState = normalizeRemoteState(payload);

      // ── Three-way merge ─────────────────────────────────────────
      const baseFields = link.lastSyncedSnapshot?.fields || null;
      const localWasEdited = localEditedSinceLastSync(link.post, link);
      const { merged, conflicts, needsPushBack } = threeWayMerge(
        baseFields,
        localState,
        remoteState,
        { localEditedSinceSync: localWasEdited }
      );

      // ── Apply merge result ──────────────────────────────────────
      const { postUpdate, syncState, hasConflicts, structureDegraded, remoteTagNames, applyRemoteTags } =
        applyMergedResult(merged, conflicts, link.post, payload);

      // Update local post
      await prisma.post.update({
        where: { id: link.postId },
        data: postUpdate,
      });

      // ── Apply tags if remote won ─────────────────────────────────
      if (applyRemoteTags && remoteTagNames && remoteTagNames.length > 0) {
        // Remove existing tags and add remote tags
        await prisma.postTag.deleteMany({ where: { postId: link.postId } });
        for (const tagName of remoteTagNames) {
          const slug = tagName.toLowerCase().replace(/\s+/g, "-");
          const tagRec = await prisma.tag.upsert({
            where: { shopId_slug: { shopId: shop.id, slug } },
            create: { shopId: shop.id, name: tagName, slug },
            update: {},
          });
          await prisma.postTag.upsert({
            where: { postId_tagId: { postId: link.postId, tagId: tagRec.id } },
            create: { postId: link.postId, tagId: tagRec.id },
            update: {},
          });
        }
      }

      // ── Build conflict payload if needed ────────────────────────
      let conflictPayload = null;
      if (hasConflicts) {
        conflictPayload = {
          version: 1,
          revision: link.syncRevision || 0,
          createdAt: new Date().toISOString(),
          fields: conflicts,
        };
      }

      // ── Update sync tracking ────────────────────────────────────
      const syncUpdateData = {
        status: postUpdate.status,
        syncedAt: new Date(),
        syncState,
        syncMode,
        lastSyncDirection: syncState === "conflict" ? "app_to_shopify" : "shopify_to_app",
        lastInboundHash: inboundHash,
        lastRemoteUpdatedAt: payload.updated_at ? new Date(payload.updated_at) : null,
        structureDegraded,
        conflictPayload,
        lastError: hasConflicts
          ? `Conflict on: ${Object.keys(conflicts).join(", ")}`
          : null,
      };

      await prisma.shopifyArticle.update({
        where: { id: link.id },
        data: syncUpdateData,
      });

      // ── Log the event ───────────────────────────────────────────
      if (hasConflicts) {
        await logSyncEvent({
          shopId: shop.id, postId: link.postId, shopifyArticleId,
          direction: "shopify_to_app", eventType: "webhook",
          status: "conflict",
          message: `Field-level conflict for "${link.post.title}": ${Object.keys(conflicts).join(", ")}`,
          payload: conflictPayload,
        });
      } else {
        await logSyncEvent({
          shopId: shop.id, postId: link.postId, shopifyArticleId,
          direction: "shopify_to_app", eventType: "webhook",
          status: "applied",
          message: needsPushBack
            ? `ARTICLES_UPDATE: Merged remote changes, pushing local back to Shopify for "${link.post.title}"`
            : `ARTICLES_UPDATE: Applied remote changes to "${link.post.title}"`,
        });
      }

      // ── Push merged result back if needed ───────────────────────
      // Push back immediately so the baseline snapshot is updated before responding.
      // The echo suppression (lastOutboundHash comparison) prevents infinite loops.
      if (needsPushBack && !hasConflicts) {
        try {
          await pushPostToShopify(link.postId, {
            publishMode: postUpdate.status === "published",
          });
        } catch (err) {
          console.warn(`[ArticleSyncService] Post-merge push back failed for ${link.postId}:`, err.message);
        }
      }

      break;
    }

    // ─── ARTICLES_DELETE ───────────────────────────────────────────
    case "ARTICLES_DELETE": {
      const link = await prisma.shopifyArticle.findFirst({
        where: { shopifyArticleId },
        include: { post: true },
      });
      if (!link) {
        await logSyncEvent({
          shopId: shop.id, shopifyArticleId,
          direction: "shopify_to_app", eventType: "webhook",
          status: "skipped_duplicate",
          message: "ARTICLES_DELETE skipped: no local link found",
        });
        return;
      }

      const postTitle = link.post?.title || "Unknown";
      await prisma.post.delete({ where: { id: link.postId } });

      await logSyncEvent({
        shopId: shop.id, postId: link.postId, shopifyArticleId,
        direction: "shopify_to_app", eventType: "webhook",
        status: "applied",
        message: `ARTICLES_DELETE: Deleted local post "${postTitle}"`,
      });
      break;
    }

    default:
      console.warn(`[ArticleSyncService] Unknown webhook topic: ${topic}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  RECONCILE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Helper: wait for a given number of milliseconds (rate limiting).
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Reconcile a single post — fetch current state from Shopify and compare with local.
 * Uses the webhook handler to field-level merge.
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
  if (!validSession) return { status: "no_session" };

  try {
    const client = new shopify.api.clients.Rest({ session: validSession });
    const response = await client.get({
      path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
    });

    const remote = response.body?.article;
    if (!remote) {
      await prisma.shopifyArticle.update({
        where: { postId: post.id },
        data: { syncState: "remote_missing" },
      });
      return { status: "remote_missing" };
    }

    const inboundHash = computeContentHash(remote);
    const link = post.shopifyArticle;
    const remoteUpdatedAt = parseRemoteUpdatedAt(remote);
    const remoteIsNewer = isRemoteNewerThanLastSync(remoteUpdatedAt, link);

    if (!remoteIsNewer) {
      if (inboundHash === link.lastOutboundHash || inboundHash === link.lastInboundHash) {
        return { status: "in_sync" };
      }
    }

    if (remoteIsNewer || (inboundHash !== link.lastInboundHash && inboundHash !== link.lastOutboundHash)) {
      await handleArticleWebhook("ARTICLES_UPDATE", post.shop.domain, JSON.stringify(remote));

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

// ══════════════════════════════════════════════════════════════════════════════
//  BACKGROUND RECONCILIATION SCHEDULER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Reconcile all linked posts for a given shop.
 * Fetches each Shopify article and compares with local state.
 */
async function reconcileAllLinkedPosts(shopDomain) {
  try {
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) return { status: "shop_not_found" };

    const linkedPosts = await prisma.post.findMany({
      where: {
        shopId: shop.id,
        shopifyArticle: { isNot: null },
      },
      include: { shopifyArticle: true },
      take: 100,
    });

    const results = [];
    const recentCutoff = new Date(Date.now() - RECONCILE_SKIP_RECENT_MINUTES * 60 * 1000);
    for (const post of linkedPosts) {
      if (post.updatedAt && post.updatedAt > recentCutoff) {
        results.push({ postId: post.id, title: post.title, status: "skipped_recently_edited" });
        continue;
      }
      try {
        const result = await reconcilePost(post.id);
        results.push({ postId: post.id, title: post.title, status: result.status });
      } catch (err) {
        results.push({ postId: post.id, title: post.title, status: "error", error: err.message });
      }
      await delay(RECONCILE_DELAY_MS);
    }
    return results;
  } catch (err) {
    console.error(`[Reconciliation] Failed for shop ${shopDomain}:`, err.message);
    return [];
  }
}

/**
 * Reconcile all shops that have linked posts.
 * Called periodically by the scheduler.
 */
async function reconcileAllShops() {
  try {
    const shops = await prisma.shop.findMany({
      where: {
        uninstalledAt: null,
        posts: {
          some: {
            shopifyArticle: { isNot: null },
          },
        },
      },
      select: { domain: true },
    });

    console.log(`[Reconciliation] Starting reconciliation for ${shops.length} shops`);
    for (const shop of shops) {
      try {
        await reconcileAllLinkedPosts(shop.domain);
      } catch (err) {
        console.error(`[Reconciliation] Error for shop ${shop.domain}:`, err.message);
      }
      await delay(RECONCILE_DELAY_MS);
    }
    console.log(`[Reconciliation] Completed for ${shops.length} shops`);
  } catch (err) {
    console.error(`[Reconciliation] Error:`, err.message);
  }
}

/**
 * Start the background reconciliation scheduler.
 * Runs reconciliation every N minutes.
 * @param {number} intervalMinutes - How often to run (default 5)
 */
function startReconciliationScheduler(intervalMinutes = RECONCILE_INTERVAL_MINUTES) {
  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[Reconciliation] Scheduler started, running every ${intervalMinutes} minutes`);

  // Run once immediately on startup
  reconcileAllShops().catch(err => {
    console.error(`[Reconciliation] Initial run failed:`, err.message);
  });

  // Then run on the interval
  setInterval(() => {
    reconcileAllShops().catch(err => {
      console.error(`[Reconciliation] Scheduled run failed:`, err.message);
    });
  }, intervalMs);
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

export const ArticleSyncService = {
  pushPostToShopify,
  syncAfterLocalEdit,
  handleArticleWebhook,
  reconcilePost,
  pollReconcilePost,
  reconcileAllShops,
  reconcileAllLinkedPosts,
  startReconciliationScheduler,
  computeContentHash,
  logSyncEvent,
  threeWayMerge,
  normalizeLocalState,
  normalizeRemoteState,
  buildBaselineSnapshot,
  fieldHash,
};
