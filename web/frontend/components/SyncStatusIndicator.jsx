/**
 * SyncStatusIndicator — Real-time sync status indicator for the post editor.
 * Polls the backend, shows sync state badge, last synced time, and offers
 * inline conflict resolution without leaving the editor.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  Badge,
  Button,
  Text,
  InlineStack,
  BlockStack,
  Spinner,
  Banner,
} from "@shopify/polaris";
import { AlertTriangleIcon } from "@shopify/polaris-icons";
import ConflictResolutionModal from "./ConflictResolutionModal.jsx";

const POLL_INTERVAL_MS = 15_000; // 15 seconds

const SYNC_STATE_CONFIG = {
  in_sync:              { label: "In Sync",           tone: "success", icon: null },
  linked:               { label: "Linked",            tone: "info",    icon: null },
  pending_app_push:     { label: "Pending App Push",  tone: "warning", icon: null },
  pending_shopify_pull: { label: "Pending Pull",      tone: "warning", icon: null },
  conflict:             { label: "Conflict",          tone: "critical",icon: AlertTriangleIcon },
  error:                { label: "Error",             tone: "critical", icon: null },
  external_edit:        { label: "External Edit",     tone: "warning", icon: null },
  remote_missing:       { label: "Missing on Shopify",tone: "critical", icon: null },
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

  // ── Conflict modal state ──────────────────────────────────────────────
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [modalPostTitle, setModalPostTitle] = useState("");

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

  // ── Conflict resolution handler ─────────────────────────────────────────
  const handleConflictResolved = useCallback(({ resolution, message }) => {
    setConflictModalOpen(false);
    // Re-poll to fetch updated state
    setTimeout(poll, 500);
  }, [poll]);

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
  const isConflict = syncState === "conflict";
  const isDegraded = article.structureDegraded;
  const hasError = article.lastError;

  return (
    <>
      <ConflictResolutionModal
        open={conflictModalOpen}
        postId={postId}
        postTitle={modalPostTitle}
        onClose={() => setConflictModalOpen(false)}
        onResolved={handleConflictResolved}
      />
      <Card>
        <BlockStack gap="250">
          {/* Header row */}
          <InlineStack gap="200" blockAlign="center" align="space-between">
            <Text variant="headingMd" as="h3">Shopify Sync</Text>
            {loading && <Spinner size="small" />}
          </InlineStack>

          {/* Sync state badge */}
          <InlineStack gap="200" blockAlign="center">
            {isConflict ? (
              <Button
                variant="plain"
                tone="critical"
                icon={AlertTriangleIcon}
                onClick={() => {
                  setModalPostTitle(postTitle);
                  setConflictModalOpen(true);
                }}
              >
                {stateConfig.label}
              </Button>
            ) : (
              <Badge tone={stateConfig.tone}>{stateConfig.label}</Badge>
            )}

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
          {hasError && !isConflict && (
            <Text variant="bodySm" tone="critical" as="p">
              {hasError}
            </Text>
          )}

          {/* Conflict resolution CTA */}
          {isConflict && (
            <Button
              tone="critical"
              icon={AlertTriangleIcon}
              fullWidth
              onClick={() => {
                setModalPostTitle(postTitle);
                setConflictModalOpen(true);
              }}
            >
              Resolve Conflict Now
            </Button>
          )}

          {/* Sync direction indicator */}
          {article.lastSyncDirection && !isConflict && (
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
    </>
  );
}
