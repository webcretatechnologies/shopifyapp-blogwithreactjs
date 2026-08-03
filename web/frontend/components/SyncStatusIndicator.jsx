import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  Badge,
  Text,
  InlineStack,
  BlockStack,
  Spinner,
  Banner,
  Box,
  Button,
  Divider,
  Icon,
  Tooltip
} from "@shopify/polaris";
import {
  RefreshIcon,
  StoreIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ExternalIcon,
  ClockIcon
} from "@shopify/polaris-icons";

const POLL_INTERVAL_MS = 10_000;

const SYNC_STATE_CONFIG = {
  in_sync:              { label: "In Sync",           tone: "success", description: "All changes are synced to Shopify." },
  linked:               { label: "Linked",            tone: "info",    description: "Connected to Shopify article." },
  pending_app_push:     { label: "Pending Push",      tone: "warning", description: "Local edits waiting to sync." },
  pending_shopify_pull: { label: "Pending Pull",      tone: "warning", description: "Shopify updates waiting to sync." },
  conflict:             { label: "Conflict",          tone: "critical",description: "Conflicting edits detected." },
  error:                { label: "Sync Error",        tone: "critical",description: "Unable to reach Shopify." },
  external_edit:        { label: "External Edit",     tone: "warning", description: "Edited directly on Shopify." },
  remote_missing:       { label: "Missing on Shopify",tone: "critical",description: "Article not found on Shopify." },
};

function formatRelativeTime(dateStr) {
  if (!dateStr) return "Never";
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
      // Silent catch for best-effort polling
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!postId) return;
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [postId, poll]);

  useEffect(() => {
    if (initialArticle) setArticle(initialArticle);
  }, [initialArticle]);

  // Unlinked state layout
  if (!article) {
    return (
      <Card padding="400">
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Box
                padding="150"
                borderRadius="200"
                style={{ backgroundColor: "var(--p-color-bg-surface-tertiary)" }}
              >
                <Icon source={StoreIcon} tone="subdued" />
              </Box>
              <Text variant="headingSm" as="h2">Shopify Sync</Text>
            </InlineStack>
            <Badge tone="attention">Not Synced</Badge>
          </InlineStack>

          <Box
            padding="300"
            borderRadius="200"
            style={{ backgroundColor: "var(--p-color-bg-surface-secondary)" }}
          >
            <Text variant="bodySm" tone="subdued" as="p">
              This article is not linked to a Shopify blog yet. Select a target blog under Organization to enable sync.
            </Text>
          </Box>
        </BlockStack>
      </Card>
    );
  }

  const syncState = article.syncState || "linked";
  const stateConfig = SYNC_STATE_CONFIG[syncState] || {
    label: syncState,
    tone: "info",
    description: "Status unknown"
  };

  const isDegraded = article.structureDegraded;
  const hasError = article.lastError;
  const isConflict = syncState === "conflict" || syncState === "external_edit";

  const shopUrl = window.shopify?.config?.shop || "";
  const shopifyArticleUrl = article.shopifyArticleId && shopUrl
    ? `https://${shopUrl}/admin/articles/${article.shopifyArticleId.replace(/[^0-9]/g, '')}`
    : null;

  return (
    <Card padding="400">
      <BlockStack gap="300">
        {/* Card Header */}
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Box
              padding="150"
              borderRadius="200"
              style={{
                backgroundColor: stateConfig.tone === "success"
                  ? "var(--p-color-bg-fill-success-secondary, #eafbe7)"
                  : "var(--p-color-bg-surface-tertiary)"
              }}
            >
              <Icon
                source={stateConfig.tone === "success" ? CheckCircleIcon : StoreIcon}
                tone={stateConfig.tone === "success" ? "success" : "subdued"}
              />
            </Box>
            <Text variant="headingSm" as="h2">Shopify Sync</Text>
          </InlineStack>

          <InlineStack gap="150" blockAlign="center">
            <Tooltip content="Refresh status">
              <Button
                variant="tertiary"
                icon={RefreshIcon}
                loading={loading}
                onClick={poll}
                accessibilityLabel="Refresh sync status"
              />
            </Tooltip>
          </InlineStack>
        </InlineStack>

        {/* Primary Status Banner Box */}
        <Box
          padding="300"
          borderRadius="200"
          style={{
            backgroundColor: "var(--p-color-bg-surface-secondary)",
            border: "1px solid var(--p-color-border-subdued)"
          }}
        >
          <BlockStack gap="150">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="150" blockAlign="center">
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: stateConfig.tone === "success"
                      ? "#2e7d32"
                      : stateConfig.tone === "warning"
                      ? "#ed6c02"
                      : "#d32f2f"
                  }}
                />
                <Text variant="bodyMd" fontWeight="semibold">
                  {stateConfig.label}
                </Text>
              </InlineStack>
              <Badge tone={article.status === "published" ? "success" : "attention"} size="small">
                {article.status === "published" ? "Published" : "Draft"}
              </Badge>
            </InlineStack>
            <Text variant="bodySm" tone="subdued">
              {stateConfig.description}
            </Text>
          </BlockStack>
        </Box>

        <Divider />

        {/* Sync Details Grid */}
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="bodySm" tone="subdued">Sync Mode</Text>
            <Badge tone={article.syncMode === "managed_by_app" ? "success" : "info"} size="small">
              {article.syncMode === "managed_by_app" ? "Managed by App" : "External Sync"}
            </Badge>
          </InlineStack>

          {article.lastSyncDirection && (
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodySm" tone="subdued">Direction</Text>
              <Text variant="bodySm" fontWeight="medium">
                {article.lastSyncDirection === "app_to_shopify" ? "App → Shopify" : "Shopify → App"}
              </Text>
            </InlineStack>
          )}

          <InlineStack align="space-between" blockAlign="center">
            <Text variant="bodySm" tone="subdued">Last Synced</Text>
            <InlineStack gap="100" blockAlign="center">
              <Icon source={ClockIcon} tone="subdued" />
              <Text variant="bodySm" fontWeight="medium">
                {formatRelativeTime(article.syncedAt)}
              </Text>
            </InlineStack>
          </InlineStack>
        </BlockStack>

        {/* Warning Banner for External Edits */}
        {(isDegraded || isConflict) && (
          <Banner tone="warning" title="External Edits Detected">
            <Text variant="bodySm">
              Direct modifications were detected on Shopify. Saving will overwrite theme changes with your visual layout.
            </Text>
          </Banner>
        )}

        {/* Error Banner */}
        {hasError && (
          <Banner tone="critical" title="Sync Issue">
            <Text variant="bodySm">{hasError}</Text>
          </Banner>
        )}

        {/* Action button if Shopify article exists */}
        {shopifyArticleUrl && (
          <Box paddingBlockStart="100">
            <Button
              fullWidth
              variant="tertiary"
              icon={ExternalIcon}
              onClick={() => window.open(shopifyArticleUrl, "_blank")}
            >
              View in Shopify Admin
            </Button>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}
