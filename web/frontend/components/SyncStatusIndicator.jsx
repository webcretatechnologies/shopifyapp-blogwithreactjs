/**
 * SyncStatusIndicator — Real-time sync status indicator for the post editor.
 * Polls the backend and shows sync state badge and last synced time.
 * Uses baseline field-level merge with conflict detection.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  Badge,
  Text,
  InlineStack,
  BlockStack,
  Spinner,
  Banner,
} from "@shopify/polaris";

const POLL_INTERVAL_MS = 10_000; // 10 seconds

const SYNC_STATE_CONFIG = {
  in_sync:              { label: "In Sync",           tone: "success" },
  linked:               { label: "Linked",            tone: "info" },
  pending_app_push:     { label: "Pending App Push",  tone: "warning" },
  pending_shopify_pull: { label: "Pending Pull",      tone: "warning" },
  conflict:             { label: "Conflict",          tone: "critical" },
  error:                { label: "Error",             tone: "critical" },
  external_edit:        { label: "External Edit",     tone: "warning" },
  remote_missing:       { label: "Missing on Shopify",tone: "critical" },
};

function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function SyncStatusIndicator({ postId, initialArticle, postTitle = "" }) {
  const [article, setArticle] = useState(initialArticle || null);
  const [loading, setLoading] = useState(false);
  const [lastPollTime, setLastPollTime] = useState(null);
  const intervalRef = useRef(null);

  // ── Poll sync status ────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/sync-status`);
      if (res.ok) {
        const data = await res.json();
        setArticle(data.shopifyArticle);
        setLastPollTime(Date.now());
      }
    } catch {
      // Silent — polling is best-effort
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // Periodic polling (also handles initial fetch)
  useEffect(() => {
    if (!postId) return;
    poll(); // Immediate first poll
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [postId, poll]);

  // Update when initialArticle changes (e.g. after save)
  useEffect(() => {
    if (initialArticle) setArticle(initialArticle);
  }, [initialArticle]);



  // ── Determine display state ─────────────────────────────────────────────
  if (!article) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text variant="headingMd" as="h3">Shopify Sync</Text>
          <Text variant="bodySm" tone="subdued" as="p">
            Not linked to a Shopify blog yet. Select a blog in Publishing to connect.
          </Text>
        </BlockStack>
      </Card>
    );
  }

  const syncState = article.syncState || "linked";
  const stateConfig = SYNC_STATE_CONFIG[syncState] || { label: syncState, tone: "info", icon: null };
  const isDegraded = article.structureDegraded;
  const hasError = article.lastError;

  return (
    <Card>
        <BlockStack gap="250">
          {/* Header row */}
          <InlineStack gap="200" blockAlign="center" align="space-between">
            <Text variant="headingMd" as="h3">Shopify Sync</Text>
            {loading && <Spinner size="small" />}
          </InlineStack>

          {/* Sync state badge */}
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={stateConfig.tone}>{stateConfig.label}</Badge>

            {/* Sync mode badge */}
            {article.syncMode && (
            <Badge tone={article.syncMode === "managed_by_app" ? "success" : "info"} size="small">
              {article.syncMode === "managed_by_app" ? "Managed" : "External"}
            </Badge>
          )}
          </InlineStack>

          {/* Shopify status */}
          <InlineStack gap="200" blockAlign="center">
            <Text variant="bodySm" tone="subdued" as="span">
              Shopify status:
            </Text>
            <Badge tone={article.status === "published" ? "success" : "attention"} size="small">
              {article.status}
            </Badge>
          </InlineStack>

          {/* Last synced time */}
          {article.syncedAt && (
            <Text variant="bodySm" tone="subdued" as="p">
              Last synced {formatRelativeTime(article.syncedAt)}
              {lastPollTime && (
                <span> · checked {formatRelativeTime(lastPollTime)}</span>
              )}
            </Text>
          )}

          {/* Degraded warning */}
          {isDegraded && (
            <Banner tone="warning">
              <Text variant="bodySm" as="p">
                Structure degraded — blocks parsed from HTML.
              </Text>
            </Banner>
          )}

          {/* Error */}
          {hasError && (
            <Text variant="bodySm" tone="critical" as="p">
              {hasError}
            </Text>
          )}

          {/* Sync direction indicator */}
          {article.lastSyncDirection && (
            <InlineStack gap="100" blockAlign="center">
              <Text variant="bodyXs" tone="subdued" as="span">
                Last sync:
              </Text>
              <Badge tone={article.lastSyncDirection === "app_to_shopify" ? "info" : "highlight"} size="small">
                {article.lastSyncDirection === "app_to_shopify" ? "App → Shopify" : "Shopify → App"}
              </Badge>
            </InlineStack>
          )}
        </BlockStack>
    </Card>
  );
}
