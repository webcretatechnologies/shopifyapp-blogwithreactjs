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
import * as cheerio from "cheerio";
import shopify from "../../shopify.js";
import { EditorContentCompiler } from "./EditorContentCompiler.js";
import { ShopifyArticleParser } from "./ShopifyArticleParser.js";
import BlockRenderer from "./BlockRenderer.js";
import { ensureTrackingKey } from "./AnalyticsTrackingService.js";
import JsonLdService from "./JsonLdService.js";
import { isFeatureEnabled } from "./PlanFeatureService.js";

const prisma = new PrismaClient();

// ─── App public URL for tracking pixel ───────────────────────────────────────
const APP_URL = process.env.HOST || process.env.APP_URL || `https://${process.env.SHOPIFY_APP_HOST || "localhost:3000"}`;

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
const META_ROBOTS_METAFIELD_KEY = "meta_robots";

/** Combines noindex/nofollow flags into a robots directive string. Always explicit — whatever the merchant selects is what renders. */
function computeMetaRobotsDirective(noindex, nofollow) {
  return `${noindex ? "noindex" : "index"}, ${nofollow ? "nofollow" : "follow"}`;
}

/**
 * Shopify article tags for outbound sync.
 * App "categories" are Post.categoryId only — they are not Shopify tags unless we push them.
 * The storefront Categories widget links to /blogs/{handle}/tagged/{slug}, so the category
 * slug must be included here or those archives stay empty while counts still reflect category posts.
 */
function collectOutboundTagNames(post) {
  const names = new Set();
  for (const pt of post.tags || []) {
    const n = (pt?.tag?.name || (typeof pt === "string" ? pt : "")).trim();
    if (n) names.add(n);
  }
  const catSlug = post.category?.slug?.trim();
  if (catSlug) names.add(catSlug);
  return Array.from(names);
}

function formatOutboundTags(post) {
  return collectOutboundTagNames(post).join(", ");
}

// ══════════════════════════════════════════════════════════════════════════════
//  GRAPHQL ID / SHAPE ADAPTERS
//
//  The DB stores bare numeric Shopify IDs (as it always has). The GraphQL
//  Admin API speaks in GIDs (gid://shopify/Article/123). These helpers convert
//  at the boundary so the numeric IDs already persisted for existing synced
//  articles keep working without a data migration.
// ══════════════════════════════════════════════════════════════════════════════

function toArticleGid(id) {
  const numeric = String(id).match(/\d+$/)?.[0] || id;
  return `gid://shopify/Article/${numeric}`;
}

function toBlogGid(id) {
  const numeric = String(id).match(/\d+$/)?.[0] || id;
  return `gid://shopify/Blog/${numeric}`;
}

function numericIdFromGid(gid) {
  return String(gid || "").match(/\d+$/)?.[0] || null;
}

/**
 * Adapts a GraphQL Article object into the REST-article shape the rest of
 * this file's merge/normalize logic already expects (it was written against
 * webhook payloads, which remain REST-shaped regardless of which API this
 * app uses for its own outbound calls).
 */
function articleFromGraphQL(article) {
  if (!article) return null;
  return {
    id: numericIdFromGid(article.id),
    title: article.title || "",
    body_html: article.body || "",
    author: article.author?.name || "",
    tags: Array.isArray(article.tags) ? article.tags.join(", ") : "",
    image: article.image?.url ? { src: article.image.url, alt: article.image.altText ?? null } : null,
    handle: article.handle || "",
    // Not gated on isPublished: a scheduled-but-not-yet-live article has isPublished:false
    // but a future publishedAt (the scheduled instant) — losing that here would make
    // scheduling invisible to the reconciliation/merge engine.
    published_at: article.publishedAt || null,
    isScheduled: !article.isPublished && !!article.publishedAt && new Date(article.publishedAt) > new Date(),
    updated_at: article.updatedAt || null,
    blog_id: article.blog?.id ? numericIdFromGid(article.blog.id) : null,
    // Now wired into the real two-way merge (OPTIONAL_REMOTE_FIELDS below) — only available via
    // this GraphQL adapter, never on a raw Shopify webhook payload (REST-shaped, no metafields),
    // which is exactly why these go through OPTIONAL_REMOTE_FIELDS instead of SCALAR_FIELDS: a
    // routine webhook-triggered merge must not see "undefined" here and mistake it for "remote
    // cleared this field."
    meta_title: article.titleTag?.value ?? null,
    meta_description: article.descriptionTag?.value ?? null,
  };
}

function toArticleGraphQLInput({ title, body_html, author, published, tags, handle, image, summary, meta_title, meta_description, meta_robots, publishAt }) {
  const input = {
    title,
    body: body_html,
    author: { name: author || "Admin" },
    isPublished: !!published,
    handle,
  };

  // Native Shopify scheduling: isPublished:true + a future publishDate keeps the article
  // hidden until that instant, then Shopify reveals it automatically — no cron needed here.
  if (publishAt) {
    input.publishDate = publishAt;
  }

  if (summary !== undefined) {
    input.summary = summary || "";
  }
  
  const tagList = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : (tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
  // Always set tags (including []) so clearing/removing a synced category slug sticks on Shopify.
  if (tags !== undefined && tags !== null) {
    input.tags = tagList;
  }
  if (image?.src) input.image = { url: image.src, ...(image.altText ? { altText: image.altText } : {}) };

  const metafields = [];
  if (meta_title !== undefined) {
    metafields.push({
      namespace: "global",
      key: "title_tag",
      value: meta_title || "",
      type: "string",
    });
  }
  if (meta_description !== undefined) {
    metafields.push({
      namespace: "global",
      key: "description_tag",
      value: meta_description || "",
      type: "string",
    });
  }
  if (meta_robots) {
    metafields.push({
      namespace: METAFIELD_NAMESPACE,
      key: META_ROBOTS_METAFIELD_KEY,
      value: meta_robots,
      type: "single_line_text_field",
    });
  }
  if (metafields.length > 0) {
    input.metafields = metafields;
  }
  
  return input;
}

/** Fetches a single article by (numeric or GID) ID, returned in REST-article shape (or null). */
async function fetchArticleByGid(graphqlClient, articleId) {
  const result = await graphqlClient.request(`
    query GetArticle($id: ID!) {
      article(id: $id) {
        id
        title
        handle
        body
        author { name }
        image { url altText }
        tags
        isPublished
        publishedAt
        updatedAt
        blog { id }
        titleTag: metafield(namespace: "global", key: "title_tag") { value }
        descriptionTag: metafield(namespace: "global", key: "description_tag") { value }
      }
    }
  `, { variables: { id: toArticleGid(articleId) } });

  return articleFromGraphQL(result.data?.article || null);
}

// ─── Scalar fields we merge independently ─────────────────────────────────────
const SCALAR_FIELDS = ["title", "author", "status", "tags", "featuredImage", "featuredImageAlt", "slug"];

// Real two-way merged, same conflict-detection treatment as SCALAR_FIELDS — but only ever
// compared when the remote side actually supplied a value. Real Shopify webhooks are REST-shaped
// and never carry metafield data (title_tag/description_tag), only the GraphQL-based reconcile
// path (articleFromGraphQL) does — so on an ordinary webhook these come through as `undefined`,
// which must be treated as "this payload variant doesn't know," never as "remote cleared it."
const OPTIONAL_REMOTE_FIELDS = ["metaTitle", "metaDescription"];

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
 * Compute a hash for HTML fields that normalizes inter-tag whitespace.
 * This prevents false-positive external-edit detection when Shopify alters whitespace upon save.
 */
function htmlHash(value) {
  if (value === null || value === undefined) return crypto.createHash("sha256").update("__NULL__").digest("hex");
  const normalized = typeof value === "string" 
    ? value.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
    : JSON.stringify(value);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Strips every data-* attribute from HTML before hashing — Shopify strips data-* attributes
 * from body_html on save (confirmed live, see ShopifyArticleParser.js), so the HTML we push
 * (which carries data-* markers for hide-on-device, block identity, etc.) never byte-matches
 * what Shopify echoes back on the next fetch. Without this normalization, computeContentHash's
 * outbound and inbound hashes for the same unchanged content would differ on essentially every
 * article with real builder blocks, permanently breaking echo suppression and misclassifying
 * every push as if Shopify had just edited the article. Falls back to the raw string if parsing
 * fails, rather than throwing — hashing is a best-effort dedupe signal, not correctness-critical.
 */
function stripDataAttributesForHash(html) {
  if (!html) return "";
  try {
    const $ = cheerio.load(html, null, false);
    $("*").each((_, el) => {
      if (!el.attribs) return;
      Object.keys(el.attribs).forEach((attr) => {
        if (attr.startsWith("data-")) delete el.attribs[attr];
      });
    });
    return $.html();
  } catch {
    return html;
  }
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
    body_html: stripDataAttributesForHash((fields.body_html || "").trim()),
    author: (fields.author || "").trim(),
    published: !!fields.published,
    published_at: fields.published_at || null,
    tags: (Array.isArray(fields.tags) ? fields.tags.sort() : (fields.tags || "").split(",").map(t => t.trim()).filter(Boolean).sort()).join(","),
    image: imageSrc,
    handle: (fields.handle || fields.slug || "").trim(),
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
    status: post.status === "published" ? "published"
          : post.status === "scheduled" ? "scheduled"
          : "draft",
    tags: tagNames || "",
    featuredImage: post.featuredImage || null,
    featuredImageAlt: post.featuredImageAlt || null,
    slug: post.slug || "",
    metaTitle: post.metaTitle || "",
    metaDescription: post.metaDescription || "",
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
    status: payload.isScheduled ? "scheduled"
          : payload.published_at ? "published"
          : "draft",
    tags: remoteTags,
    featuredImage: payload.image?.src || null,
    // Real Shopify article webhook payloads (REST-shaped) do include image.alt directly — no
    // metafield lookup required, unlike meta_title/meta_description below — so this is safe to
    // treat the same as any other always-present SCALAR_FIELDS entry.
    featuredImageAlt: payload.image?.alt ?? null,
    slug: payload.handle || "",
    // Deliberately left as `undefined` (not coerced to "") when the payload doesn't carry it at
    // all — OPTIONAL_REMOTE_FIELDS' merge logic treats undefined as "this payload variant has no
    // opinion," distinct from an explicit empty string meaning "merchant cleared it in Shopify."
    metaTitle: payload.meta_title === undefined ? undefined : (payload.meta_title || ""),
    metaDescription: payload.meta_description === undefined ? undefined : (payload.meta_description || ""),
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
      featuredImage:    { value: localState.featuredImage,    hash: f(localState.featuredImage) },
      // Independent field now that it's part of the real two-way merge (SCALAR_FIELDS) — an
      // alt-text-only edit and an image-URL-only edit need to be distinguishable from each other,
      // not collapsed into one combined hash. pushPostToShopify's dirty-check (below) now checks
      // both hashes independently instead of relying on a single composite one.
      featuredImageAlt: { value: localState.featuredImageAlt, hash: f(localState.featuredImageAlt) },
      metaTitle:        { value: localState.metaTitle,        hash: f(localState.metaTitle) },
      metaDescription:  { value: localState.metaDescription,  hash: f(localState.metaDescription) },
      content: {
        editorHtml:      { value: localState.content.editorHtml, hash: f(localState.content.editorHtml), htmlHash: htmlHash(localState.content.editorHtml) },
        contentJson:     { hash: f(JSON.stringify(localState.content.contentJson)) },
        storefrontHtml:  { value: storefrontHtml, hash: f(storefrontHtml), htmlHash: htmlHash(storefrontHtml) },
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

    // This payload variant has no opinion on this field at all (real webhook, not a GraphQL
    // reconcile) — keep whatever local already has rather than comparing against `undefined`,
    // which would look identical to "remote wants to clear it." Marked "both" (not "local") so
    // this alone never spuriously triggers needsPushBack below on every routine webhook.
    for (const field of OPTIONAL_REMOTE_FIELDS) {
      if (remote[field] === undefined) {
        merged[field] = { value: local[field], source: "both" };
        continue;
      }
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

  // Same "undefined means this payload variant has no opinion" rule as the legacy branch above.
  // Resolved purely from local-vs-base, exactly as if remote hadn't changed at all this round —
  // NOT simply "use the stale baseline value," which would silently discard a genuine unpushed
  // local edit sitting between syncs, and NOT unconditionally "local," which would spuriously
  // mark this field as needing a push-back (triggering an unnecessary pushPostToShopify call) on
  // every single ordinary webhook even when nothing about it actually changed.
  for (const field of OPTIONAL_REMOTE_FIELDS) {
    if (remote[field] === undefined) {
      const localHash = fieldHash(local[field]);
      const baseHash = base?.fields?.[field]?.hash;
      const localChanged = changedFromBase(localHash, baseHash);
      merged[field] = localChanged
        ? { value: local[field], source: "local" }
        : { value: local[field], source: "base" };
      continue;
    }
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
  const localContentHash   = htmlHash(local.content.editorHtml);
  const remoteContentHash  = htmlHash(remote.content.storefrontHtml);
  const baseEditorHash     = base?.fields?.content?.editorHtml?.htmlHash || base?.fields?.content?.editorHtml?.hash;
  const baseStorefrontHash = base?.fields?.content?.storefrontHtml?.htmlHash || base?.fields?.content?.storefrontHtml?.hash;

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
    if (localContentHash === htmlHash(remote.content.storefrontHtml)) {
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
    featuredImageAlt: merged.featuredImageAlt.value || null,
    metaTitle: merged.metaTitle.value || null,
    metaDescription: merged.metaDescription.value || null,
    publishedAt: merged.status.source === "remote"
      ? (remotePayload?.published_at ? new Date(remotePayload.published_at) : (merged.status.value === "published" ? new Date() : null))
      : (post.publishedAt || (merged.status.value === "published" ? new Date() : null)),
  };

  postUpdate.slug = merged.slug.value;

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
 * @param {Object} graphqlClient - Shopify GraphQL client
 * @param {string} blogId - Shopify blog ID
 * @param {string} articleId - Shopify article ID
 * @param {Object} baseline - The baseline snapshot object
 * @param {number} postId - Local app post ID (for DB lookup)
 */
async function writeSyncMarker(graphqlClient, blogId, articleId, baseline, postId) {
  try {
    const shopifyLink = await prisma.shopifyArticle.findUnique({
      where: { postId },
    });
    if (!shopifyLink) return;

    const value = JSON.stringify({
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
    });

    // metafieldsSet upserts regardless of whether the metafield already
    // exists, so there's no separate create-vs-update branch needed here.
    const result = await graphqlClient.request(`
      mutation SetSyncMarker($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: toArticleGid(articleId),
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          type: METAFIELD_TYPE,
          value,
        }],
      },
    });

    const errors = result.data?.metafieldsSet?.userErrors;
    if (errors?.length > 0) {
      console.warn(`[ArticleSyncService] metafieldsSet userErrors for article ${articleId}:`, errors);
      return;
    }

    const metafieldId = result.data?.metafieldsSet?.metafields?.[0]?.id;
    if (metafieldId) {
      await prisma.shopifyArticle.update({
        where: { id: shopifyLink.id },
        data: { sourceMetafieldId: metafieldId },
      });
    }
  } catch (err) {
    console.warn(`[ArticleSyncService] Failed to write sync marker for article ${articleId}:`, err.message);
  }
}

/**
 * Read the sync marker metafield from a Shopify article.
 * Returns null if no metafield exists (article is external).
 */
async function readSyncMarker(graphqlClient, blogId, articleId) {
  try {
    const result = await graphqlClient.request(`
      query GetSyncMarker($id: ID!, $namespace: String!, $key: String!) {
        article(id: $id) {
          metafield(namespace: $namespace, key: $key) { id value }
        }
      }
    `, {
      variables: {
        id: toArticleGid(articleId),
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
      },
    });

    const sourceMetafield = result.data?.article?.metafield;
    if (!sourceMetafield) return null;

    let parsed;
    try {
      parsed = JSON.parse(sourceMetafield.value);
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
//  HTML COMPILATION
// ══════════════════════════════════════════════════════════════════════════════
export async function buildStorefrontHtmlForPost(post, rawHtml, validSession, graphqlClient, jsonLdOverrides = {}) {
  let storefrontHtml = await EditorContentCompiler.compileForStorefront(
    rawHtml, validSession, graphqlClient, post.shop.domain, post.id, post.customCss, post.author, post.publishedAt
  );

  let storeCurrency = "USD";
  try {
    const currencyRes = await graphqlClient.request(`
      query GetShopCurrency {
        shop { currencyCode }
      }
    `);
    storeCurrency = currencyRes.data?.shop?.currencyCode || "USD";
  } catch (cErr) {
    console.warn("[ArticleSyncService] Could not resolve store currency:", cErr.message);
  }

  const postProducts = post.products ? post.products.map(pp => ({
    id: pp.product.id,
    shopifyProductId: pp.product.shopifyProductId,
    title: pp.product.title,
    handle: pp.product.handle,
    image: pp.product.image,
    price: pp.product.price,
    compareAtPrice: pp.product.compareAtPrice,
    variantId: pp.product.variantId,
    variantAvailable: pp.product.variantAvailable,
  })) : [];

  const renderer = new BlockRenderer(post.shop.domain, {
    productSliderPosition: post.productSliderPosition || "none",
    productSliderSource: post.productSliderSource || "recommendations",
    productSliderConfig: post.productSliderConfig || {},
    productSliderProducts: postProducts,
    storeCurrency: storeCurrency,
  });

  storefrontHtml = renderer.appendProductSliderWrappers(storefrontHtml, post.contentJson);
  if (renderer.sliderScriptInjected) {
    storefrontHtml += "\n" + BlockRenderer.relatedProductSliderScriptBlock();
  }

  // ── Inject tracking pixel ──────────────────────────────────────────────
  const trackingKey = await ensureTrackingKey(post.id);
  // HOST already includes the protocol and is the actual configured variable in this app
  // (confirmed via .env/vite.config.js) — APP_URL/SHOPIFY_APP_HOST aren't set in this
  // environment and were silently falling back to "https://localhost:3000", unreachable from
  // a real storefront visitor's browser. Same fix as EditorContentCompiler.js's APP_URL.
  const appUrl = process.env.HOST || process.env.APP_URL || `https://${process.env.SHOPIFY_APP_HOST || "localhost:3000"}`;
  const shopDomain = post.shop?.domain || "";

  // Replace existing analytics block or append new one
  const analyticsBlockStart = "<!-- BLOG_ANALYTICS_START -->";
  const analyticsBlockEnd = "<!-- BLOG_ANALYTICS_END -->";
  // The bootstrap logic itself lives in an external file (GET /track/bootstrap.js) rather than
  // an inline <script> tag — Shopify's own admin blog article editor doesn't render/strip raw
  // <script> tags cleanly, leaving a large blank block-height gap in its place when merchants
  // open the post there. A <script src="..."> reference keeps body_html free of inline script
  // content while behaving identically (the external file reads its config from this tag's
  // data-* attributes via document.currentScript).
  const analyticsBlock = `${analyticsBlockStart}
<img src="${appUrl}/track/view.gif?k=${trackingKey}&shop=${encodeURIComponent(shopDomain)}" alt="" width="1" height="1" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;opacity:0;" aria-hidden="true" />
<script src="${appUrl}/track/bootstrap.js" data-key="${trackingKey}" data-shop="${shopDomain}" data-endpoint="${appUrl}" async></script>
${analyticsBlockEnd}`;

  if (storefrontHtml.includes(analyticsBlockStart)) {
    // Replace existing analytics block
    const analyticsRegex = new RegExp(
      `${analyticsBlockStart}[\\s\\S]*?${analyticsBlockEnd}`
    );
    storefrontHtml = storefrontHtml.replace(analyticsRegex, analyticsBlock);
  } else {
    // Append analytics block before closing </body> or at end
    const bodyEnd = storefrontHtml.lastIndexOf("</body>");
    if (bodyEnd >= 0) {
      storefrontHtml = storefrontHtml.slice(0, bodyEnd) + analyticsBlock + "\n" + storefrontHtml.slice(bodyEnd);
    } else {
      storefrontHtml += "\n" + analyticsBlock;
    }
  }

  // ── Inject JSON-LD structured data (Article / Recipe / Product / Review / Video / Event / App) ──
  // jsonLdOverrides carries translation-specific title/description when compiling a
  // translated locale, so the schema's headline/description match the rendered language.
  const jsonLdScript = JsonLdService.renderPostSchema(
    { ...post, ...jsonLdOverrides, products: postProducts },
    shopDomain
  );
  if (jsonLdScript) {
    storefrontHtml = `<!-- BLOG_JSONLD_START -->\n${jsonLdScript}\n<!-- BLOG_JSONLD_END -->\n` + storefrontHtml;
  }

  // ── "Powered by" branding badge — live placeholder, not baked HTML ─────────────
  // Same live-update pattern as EditorContentCompiler.js's header/footer/related-posts
  // placeholders: previously the entitlement + "showPoweredByBadge" setting were resolved here,
  // at sync time, and baked directly into body_html — so a plan change or a merchant flipping the
  // Settings checkbox had zero effect on any already-published post until it was individually
  // resynced (the exact complaint that led to the header/footer live-fetch rework). Now this only
  // emits an always-present placeholder; /branding.json (relatedPosts.js) resolves show/hide live
  // on every storefront page view via the shared bootstrap script, so a Settings change or plan
  // upgrade/downgrade applies everywhere instantly, with no resync.
  //
  // blogger-powered-by-badge is load-bearing, not cosmetic — ShopifyArticleParser's
  // _stripAppWrapper matches on this class to exclude the badge when reconciling Shopify's echoed
  // body_html back into contentJson. Without it (as it shipped originally, with no class/id/
  // attribute at all), the badge round-trips into a real, editable, deletable block in the
  // Builder canvas indistinguishable from merchant content — a merchant could select and delete
  // what they'd see as a stray text block, Save & Sync, and permanently strip their own "Powered
  // by" attribution without ever intending to. Same class of bug the byline (author/date/reading-
  // time) already had a fix for; this closes the same gap here.
  if (post.shop?.domain) {
    storefrontHtml += `\n<div class="blogger-powered-by-badge" data-branding-badge data-shop="${post.shop.domain}" style="text-align:center;padding:12px 0;font-size:12px;color:#8c9196;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"></div>`;
  }

  return storefrontHtml;
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
      category: true,
      shop: true,
      products: { include: { product: true }, orderBy: { position: "asc" } },
    },
  });

  if (!post) throw new Error(`Post ${postId} not found`);
  const shopifyLink = post.shopifyArticle;
  if (!shopifyLink?.shopifyBlogId) throw new Error("Post is not linked to a Shopify blog");

  const session = await shopify.config.sessionStorage.findSessionsByShop(post.shop.domain);
  const validSession = session?.find(s => s.accessToken);
  if (!validSession) throw new Error(`No active Shopify session for ${post.shop.domain}`);

  const graphqlClient = new shopify.api.clients.Graphql({ session: validSession });

  // Compile content for storefront
  let storefrontHtml = await buildStorefrontHtmlForPost(post, post.contentHtml || "", validSession, graphqlClient);

  // Merchant tags + category slug (so /blogs/.../tagged/{slug} matches Categories widget counts)
  const tagNames = formatOutboundTags(post);
  // Scheduling: Shopify rejects isPublished:true combined with a future publishDate
  // ("Can't set isPublished to true and also set a future publish date" — verified against
  // a live store). The correct combination is isPublished:false + a future publishDate;
  // Shopify flips isPublished to true itself once that instant passes.
  const isScheduled = !publishMode && post.status === "scheduled" && post.publishedAt && post.publishedAt > new Date();
  const published = publishMode ? true : (post.status === "published");
  const publishAt = isScheduled ? post.publishedAt.toISOString() : null;

  // Compute outbound hash for echo suppression
  const outboundHash = computeContentHash({
    title: post.title,
    body_html: storefrontHtml,
    author: post.author || "Admin",
    published,
    tags: tagNames,
    image: post.featuredImage,
    handle: post.slug,
  });

  let articleId = shopifyLink.shopifyArticleId;
  let remoteUpdatedAt = null;

  const metaRobotsDirective = computeMetaRobotsDirective(post.metaRobotsNoindex, post.metaRobotsNofollow);

  // Only send `image` when it's genuinely changed since the last successful sync (or this is a
  // brand-new article). Shopify's articleUpdate mutation treats a provided image.url as "fetch
  // and attach this as a new image" every time — even when the src is Shopify's own CDN URL
  // pointing at the article's own existing, unchanged image — which re-hosts it as a fresh file
  // with a new hash on every single sync. Confirmed live: after several routine resyncs of the
  // same unmodified post, the article's image URL had silently changed multiple times and the
  // post's stored `featuredImage` (whichever URL happened to be current when we last read it
  // back) eventually pointed at a file Shopify had already garbage-collected — a real 404 on the
  // Articles list thumbnail, not a one-off glitch. Re-sending an unchanged image was pure waste
  // and the actual root cause; only send it when there's a real change to make.
  // Checked independently (not one combined hash) now that featuredImage/featuredImageAlt are
  // both real, separately-tracked SCALAR_FIELDS in the two-way merge — either one differing from
  // its own baseline is enough reason to include `image` in this push.
  const previousFeaturedImageHash = shopifyLink.lastSyncedSnapshot?.fields?.featuredImage?.hash;
  const currentFeaturedImageHash = fieldHash(post.featuredImage || null);
  const previousFeaturedImageAltHash = shopifyLink.lastSyncedSnapshot?.fields?.featuredImageAlt?.hash;
  const currentFeaturedImageAltHash = fieldHash(post.featuredImageAlt || null);
  const featuredImageChanged =
    !shopifyLink.shopifyArticleId ||
    previousFeaturedImageHash !== currentFeaturedImageHash ||
    previousFeaturedImageAltHash !== currentFeaturedImageAltHash;

  const articleInput = toArticleGraphQLInput({
    title: post.title,
    body_html: storefrontHtml,
    author: post.author || "Admin",
    published,
    publishAt,
    tags: tagNames,
    handle: post.slug,
    image: featuredImageChanged && post.featuredImage ? { src: post.featuredImage, altText: post.featuredImageAlt || null } : null,
    summary: post.excerpt,
    meta_title: post.metaTitle,
    meta_description: post.metaDescription,
    meta_robots: metaRobotsDirective,
  });

  // resultingImageUrl: when we DID upload an image this push, Shopify re-hosts it under its own
  // CDN path (a new URL, not necessarily the src we sent) — capture that back so our own
  // post.featuredImage stays pointed at what Shopify actually serves, instead of silently
  // drifting from it (the actual root cause of the broken thumbnail this fix addresses).
  let resultingImageUrl;

  if (articleId) {
    const result = await graphqlClient.request(`
      mutation UpdateArticle($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { id updatedAt image { url } }
          userErrors { field message }
        }
      }
    `, { variables: { id: toArticleGid(articleId), article: articleInput } });

    const errors = result.data?.articleUpdate?.userErrors;
    if (errors?.length > 0) {
      throw new Error(`articleUpdate failed: ${errors.map(e => e.message).join("; ")}`);
    }
    remoteUpdatedAt = result.data?.articleUpdate?.article?.updatedAt || null;
    resultingImageUrl = result.data?.articleUpdate?.article?.image?.url;
  } else {
    const result = await graphqlClient.request(`
      mutation CreateArticle($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article { id updatedAt image { url } }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        article: { ...articleInput, blogId: toBlogGid(shopifyLink.shopifyBlogId) },
      },
    });

    const errors = result.data?.articleCreate?.userErrors;
    if (errors?.length > 0) {
      throw new Error(`articleCreate failed: ${errors.map(e => e.message).join("; ")}`);
    }
    articleId = numericIdFromGid(result.data?.articleCreate?.article?.id);
    remoteUpdatedAt = result.data?.articleCreate?.article?.updatedAt || null;
    resultingImageUrl = result.data?.articleCreate?.article?.image?.url;
    if (!articleId) throw new Error("Shopify did not return an article ID");
  }

  // Keep our own record pointed at whatever Shopify actually ended up serving, whether or not we
  // just uploaded a new one this push (featuredImageChanged false just means we didn't ask
  // Shopify to change anything — its current URL, returned on every query regardless, is still
  // the source of truth to store).
  if (resultingImageUrl && resultingImageUrl !== post.featuredImage) {
    await prisma.post.update({ where: { id: post.id }, data: { featuredImage: resultingImageUrl } });
    post.featuredImage = resultingImageUrl;
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
      status: isScheduled ? "scheduled" : (published ? "published" : "draft"),
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
      status: isScheduled ? "scheduled" : (published ? "published" : "draft"),
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
  await writeSyncMarker(graphqlClient, shopifyLink.shopifyBlogId, articleId, baseline, post.id);

  // Sync any saved translations for this post to Shopify
  await syncPostTranslationsToShopify(post.id, validSession, graphqlClient);

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
 * Sync saved post translations to Shopify via GraphQL translationsRegister mutation
 */
export async function syncPostTranslationsToShopify(postId, validSession, graphqlClient) {
  try {
    const shopifyArticle = await prisma.shopifyArticle.findUnique({
      where: { postId },
    });
    if (!shopifyArticle || !shopifyArticle.shopifyArticleId) return;

    const translations = await prisma.postTranslation.findMany({
      where: { postId },
    });
    if (!translations || translations.length === 0) return;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        shop: true,
        products: { include: { product: true }, orderBy: { position: "asc" } },
      },
    });

    const articleGid = `gid://shopify/Article/${shopifyArticle.shopifyArticleId}`;

    const queryRes = await graphqlClient.request(`
      query GetTranslatableResource($resourceId: ID!) {
        translatableResource(resourceId: $resourceId) {
          resourceId
          translatableContent {
            key
            value
            digest
            locale
          }
        }
      }
    `, { variables: { resourceId: articleGid } });

    const translatableContent = queryRes.data?.translatableResource?.translatableContent || [];
    const getDigest = (key) => translatableContent.find(c => c.key === key)?.digest;

    for (const translation of translations) {
      const translationsInput = [];
      const pushField = (key, val) => {
        const digest = getDigest(key);
        if (digest && val) {
          translationsInput.push({
            key,
            value: val,
            locale: translation.locale,
            translatableContentDigest: digest,
          });
        }
      };

      let translatedStorefrontHtml = translation.contentHtml || "";
      if (post) {
        translatedStorefrontHtml = await buildStorefrontHtmlForPost(
          post,
          translation.contentHtml || "",
          validSession,
          graphqlClient,
          {
            title: translation.title || post.title,
            metaTitle: translation.metaTitle || post.metaTitle,
            metaDescription: translation.metaDescription || post.metaDescription,
            excerpt: translation.excerpt || post.excerpt,
          }
        );
      }

      pushField("title", translation.title);
      pushField("body_html", translatedStorefrontHtml);
      pushField("summary_html", translation.excerpt);
      pushField("meta_title", translation.metaTitle);
      pushField("meta_description", translation.metaDescription);

      if (translationsInput.length > 0) {
        await graphqlClient.request(`
          mutation registerTranslations($resourceId: ID!, $translations: [TranslationInput!]!) {
            translationsRegister(resourceId: $resourceId, translations: $translations) {
              userErrors {
                field
                message
              }
            }
          }
        `, { variables: { resourceId: articleGid, translations: translationsInput } });
      }
    }
  } catch (err) {
    console.warn("[ArticleSyncService] Error syncing translations to Shopify:", err.message);
  }
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
      category: true,
      shop: true,
    },
  });

  if (!post?.shopifyArticle?.shopifyBlogId) {
    throw new Error("Post is not linked to a Shopify blog");
  }

  const session = await shopify.config.sessionStorage.findSessionsByShop(post.shop.domain);
  const validSession = session?.find(s => s.accessToken);
  if (!validSession) throw new Error(`No active Shopify session for ${post.shop.domain}`);

  const graphqlClient = new shopify.api.clients.Graphql({ session: validSession });
  let remote = null;

  if (post.shopifyArticle.shopifyArticleId) {
    try {
      remote = await fetchArticleByGid(graphqlClient, post.shopifyArticle.shopifyArticleId);
    } catch (err) {
      console.warn(`[ArticleSyncService] Could not fetch remote article for post ${postId}:`, err.message);
    }
  }

  if (!remote) {
    return pushPostToShopify(postId, { publishMode });
  }

  const localTagStr = formatOutboundTags(post);
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

  // 2-Way Sync ("sync_actions") is a Starter+ feature, already marketed as such on the pricing
  // page — but until now only the merchant-facing Force Sync button was actually gated by it; the
  // automatic Shopify -> App direction (this webhook handler) ran unconditionally regardless of
  // plan. A Free-plan shop is now fully cut off from automatic inbound sync: edits made directly
  // in Shopify's own admin no longer create/update/delete anything in our app on their own. This
  // is a deliberate reversal of this session's earlier "never gate ingestion, for data-integrity
  // reasons" decision — the resulting staleness (a Shopify-side edit not reflected here until the
  // shop upgrades) is accepted as intentional, not a bug. Once a shop upgrades, no catch-up
  // action is needed: the reconciliation scheduler (reconcileAllShops, every
  // RECONCILE_INTERVAL_MINUTES) naturally detects the accumulated drift on its next pass and
  // applies it normally, the same as any other missed webhook.
  if (!isFeatureEnabled(shop.planKey, "sync_actions")) {
    await logSyncEvent({
      shopId: shop.id, shopifyArticleId,
      direction: "shopify_to_app", eventType: "webhook",
      status: "skipped_free_plan",
      message: `${topic} skipped: 2-Way Sync is a Starter+ feature, shop is on ${shop.planKey}`,
    });
    return;
  }

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
          status: payload.isScheduled ? "scheduled" : (payload.published_at ? "published" : "draft"),
          author: payload.author || null,
          contentHtml: parsed.rawEditorHtml || payload.body_html || "",
          contentJson: parsed.blocks,
          featuredImage: payload.image?.src || null,
          featuredImageAlt: payload.image?.alt || null,
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
          status: payload.isScheduled ? "scheduled" : (payload.published_at ? "published" : "draft"),
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

      // Hash equality is checked unconditionally, not gated on `!remoteIsNewer` — writeSyncMarker
      // writes a metafield to the article right after every push, and Shopify bumps the article's
      // updatedAt when its metafields change. That made `remoteIsNewer` come back true on the very
      // next reconcile poll even though content was byte-identical to what we just pushed,
      // bypassing this echo check and misclassifying the sync as "edited directly in Shopify"
      // when nothing had actually changed. The content hash is the authoritative signal for
      // "did anything really change" — a timestamp bump from our own metafield write isn't that.
      if (inboundHash === link.lastOutboundHash) {
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
          const graphqlClient = new shopify.api.clients.Graphql({ session: sessionForMarker });
          syncMarker = await readSyncMarker(graphqlClient, link.shopifyBlogId, link.shopifyArticleId);

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
      } else if (!hasConflicts) {
        // A pure Shopify-side edit (no pending local edits to merge, so threeWayMerge saw no
        // need to push back) still needs to go back through our own compiler — Shopify's admin
        // blog article editor strips our data-* attributes and inline event handler attributes
        // on save (confirmed live), silently breaking related posts / custom header-footer /
        // the branding badge and leaving stray empty markup behind. Re-compiling and pushing the
        // now-reconciled content restores all of that automatically, with no merchant action
        // needed. Safe against ping-pong: the resulting Shopify webhook's hash will match this
        // push's lastOutboundHash and get skipped by echo suppression above, same guarantee the
        // needsPushBack branch above already relies on.
        try {
          await pushPostToShopify(link.postId, {
            publishMode: postUpdate.status === "published",
          });
        } catch (err) {
          console.warn(`[ArticleSyncService] Auto-restore push back failed for ${link.postId}:`, err.message);
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
    const graphqlClient = new shopify.api.clients.Graphql({ session: validSession });
    const remote = await fetchArticleByGid(graphqlClient, post.shopifyArticle.shopifyArticleId);

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

    // Hash equality checked unconditionally (not gated on `!remoteIsNewer`) — see the matching
    // comment in _handleArticleWebhookInner's echo suppression above. writeSyncMarker's metafield
    // write after every push bumps Shopify's article.updatedAt, so remoteIsNewer alone is not
    // reliable proof of a real edit; the content hash is.
    if (inboundHash === link.lastOutboundHash || inboundHash === link.lastInboundHash) {
      return { status: "in_sync" };
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
/**
 * Safety net for scheduled posts whose initial schedule-push to Shopify failed (network error,
 * transient Shopify error, etc). Rides the same reconciliation cadence — no dedicated scheduler.
 */
async function retryFailedSchedulePushes(shopId) {
  const failedScheduled = await prisma.post.findMany({
    where: {
      shopId,
      status: "scheduled",
      shopifyArticle: { syncState: "error" },
    },
    take: 20,
  });

  for (const post of failedScheduled) {
    try {
      await pushPostToShopify(post.id, { publishMode: false });
      console.log(`[Reconciliation] Retried failed schedule-push for post ${post.id}`);
    } catch (err) {
      console.error(`[Reconciliation] Retry of failed schedule-push for post ${post.id} still failing:`, err.message);
    }
    await delay(RECONCILE_DELAY_MS);
  }
}

async function reconcileAllLinkedPosts(shopDomain) {
  try {
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) return { status: "shop_not_found" };

    await retryFailedSchedulePushes(shop.id).catch((err) => {
      console.error(`[Reconciliation] retryFailedSchedulePushes failed for shop ${shopDomain}:`, err.message);
    });

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
  buildStorefrontHtmlForPost,
  pushPostToShopify,
  syncPostTranslationsToShopify,
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
  toArticleGid,
  toBlogGid,
  numericIdFromGid,
  articleFromGraphQL,
  fetchArticleByGid,
};
