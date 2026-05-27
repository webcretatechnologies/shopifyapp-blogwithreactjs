/**
 * Sync Dashboard — View sync status for all posts, force re-sync, reconcile, and see sync logs.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  ButtonGroup,
  Box,
  Spinner,
  InlineStack,
  BlockStack,
  Banner,
  Toast,
  Frame,
  Divider,
  Tabs,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";

const SYNC_STATE_MAP = {
  in_sync: { label: "In Sync", tone: "success" },
  linked: { label: "Linked", tone: "info" },
  pending_app_push: { label: "Pending App Push", tone: "warning" },
  pending_shopify_pull: { label: "Pending Shopify Pull", tone: "warning" },
  error: { label: "Error", tone: "critical" },
  external_edit: { label: "External Edit", tone: "warning" },
  remote_missing: { label: "Remote Missing", tone: "critical" },
};

const SYNC_MODE_MAP = {
  managed_by_app: { label: "Managed", tone: "success" },
  external_html: { label: "External", tone: "info" },
};

export default function SyncDashboard() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [syncing, setSyncing] = useState({});
  const [toast, setToast] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [syncLogs, setSyncLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const tabs = [
    { id: "posts", content: "Posts" },
    { id: "logs", content: "Sync Logs" },
  ];

  const showToast = useCallback((content, error = false) => {
    setToast({ content, error });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts?per_page=50");
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSyncLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/posts/sync-logs?limit=100");
      const data = await res.json();
      setSyncLogs(data.logs || []);
    } catch {
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (selectedTab === 1) {
      fetchSyncLogs();
    }
  }, [selectedTab, fetchSyncLogs]);

  const forceSync = useCallback(async (post) => {
    setSyncing((s) => ({ ...s, [post.id]: true }));
    try {
      const res = await fetch(`/api/posts/${post.id}/force-sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      showToast(`✅ Synced: ${post.title}`);
      fetchPosts();
    } catch (err) {
      showToast(`❌ ${err.message}`, true);
    } finally {
      setSyncing((s) => ({ ...s, [post.id]: false }));
    }
  }, [showToast, fetchPosts]);

  const handleReconcile = useCallback(async () => {
    setReconciling(true);
    try {
      const res = await fetch("/api/posts/reconcile", {
        method: "POST",
      });
      const data = await res.json();
      const syncedCount = (data.results || []).filter(
        (r) => r.status === "reconciled" || r.status === "in_sync"
      ).length;
      const errorRows = (data.results || []).filter((r) => r.status === "error");
      const errors = errorRows.length;
      showToast(
        `✅ Reconciliation complete: ${syncedCount} checked${errors ? `, ${errors} errors` : ""}`
      );
      if (errors) {
        const first = errorRows[0];
        showToast(`❌ Reconcile error: ${first?.title || first?.postId} — ${first?.error || "Unknown error"}`, true);
      }
      fetchPosts();
    } catch (err) {
      showToast(`❌ Reconciliation failed: ${err.message}`, true);
    } finally {
      setReconciling(false);
    }
  }, [showToast, fetchPosts]);

  const getSyncStateBadge = (post) => {
    const article = post.shopifyArticle;
    if (!article) {
      return { label: "Not Linked", tone: "attention" };
    }
    const state = SYNC_STATE_MAP[article.syncState];
    if (state) return state;
    if (article.status === "published") return { label: "Published", tone: "success" };
    return { label: "Draft", tone: "info" };
  };

  const getDirectionBadge = (post) => {
    const direction = post.shopifyArticle?.lastSyncDirection;
    if (!direction) return null;
    return direction === "app_to_shopify"
      ? { label: "App → Shopify", tone: "info" }
      : { label: "Shopify → App", tone: "highlight" };
  };

  const rowMarkup = posts.map((post, index) => {
    const syncState = getSyncStateBadge(post);
    const directionBadge = getDirectionBadge(post);
    const isDegraded = post.shopifyArticle?.structureDegraded;
    const hasError = post.shopifyArticle?.lastError;
    const isSyncing = syncing[post.id];

    return (
      <IndexTable.Row
        id={String(post.id)}
        key={post.id}
        position={index}
      >
        <IndexTable.Cell>
          <Text variant="bodySm" fontWeight="semibold">
            {post.title}
            {isDegraded && (
              <Text variant="bodySm" tone="critical"> ⚠️</Text>
            )}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={post.status === "published" ? "success" : "info"}>
            {post.status}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="100">
            <Badge tone={syncState.tone}>{syncState.label}</Badge>
            {post.shopifyArticle?.syncMode && (
              <Badge tone={SYNC_MODE_MAP[post.shopifyArticle.syncMode]?.tone || "info"}>
                {SYNC_MODE_MAP[post.shopifyArticle.syncMode]?.label || post.shopifyArticle.syncMode}
              </Badge>
            )}
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {directionBadge ? (
            <Badge tone={directionBadge.tone}>{directionBadge.label}</Badge>
          ) : (
            <Text variant="bodySm" tone="subdued">—</Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued">
            {post.shopifyArticle?.syncedAt
              ? new Date(post.shopifyArticle.syncedAt).toLocaleString()
              : "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <ButtonGroup>
            <Button
              size="slim"
              icon={RefreshIcon}
              loading={isSyncing}
              disabled={!post.shopifyArticle?.shopifyBlogId}
              onClick={() => forceSync(post)}
              title={
                !post.shopifyArticle?.shopifyBlogId
                  ? "Post is not linked to a Shopify blog"
                  : "Force sync to Shopify"
              }
            >
              Sync
            </Button>
            <Button
              size="slim"
              onClick={() => navigate(`/posts/${post.id}/edit`)}
            >
              Edit
            </Button>
          </ButtonGroup>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const logRowMarkup = syncLogs.map((log, index) => {
    const statusColors = {
      applied: "success",
      skipped_echo: "info",
      skipped_duplicate: "info",
      conflict: "critical",
      error: "critical",
    };
    return (
      <IndexTable.Row id={String(log.id)} key={log.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued">
            {new Date(log.createdAt).toLocaleString()}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={log.direction === "app_to_shopify" ? "info" : "highlight"}>
            {log.direction}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge>{log.eventType}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={statusColors[log.status] || "info"}>
            {log.status}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodySm">{log.message || "—"}</Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });    return (
    <Frame>
      {toast && (
        <Toast
          content={toast.content}
          error={toast.error}
          onDismiss={dismissToast}
        />
      )}
      <Page
        title="Sync Status"
        subtitle="Manage the 2-way synchronization between your app and Shopify"
        backAction={{
          content: "Dashboard",
          onAction: () => navigate("/posts"),
        }}
        primaryAction={{
          content: reconciling ? "Reconciling..." : "Reconcile All",
          onAction: handleReconcile,
          loading: reconciling,
        }}
        secondaryActions={[
          {
            content: "Refresh",
            icon: RefreshIcon,
            onAction: () => {
              fetchPosts();
              if (selectedTab === 1) fetchSyncLogs();
            },
            loading,
          },
        ]}
      >
        <Layout>
          <Layout.Section>
            <Banner>
              <p>
                Posts linked to a Shopify blog are synchronized in both directions.
                Use <strong>Force Sync</strong> to push app content to Shopify,
                or <strong>Reconcile All</strong> to check each post against Shopify
                and catch any changes.
                The sync uses baseline field-level merge and surfaces only true same-field conflicts.
              </p>
            </Banner>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <Tabs
                tabs={tabs}
                selected={selectedTab}
                onSelect={setSelectedTab}
              />
              {selectedTab === 0 ? (
                loading ? (
                  <Box padding="800" align="center">
                    <Spinner />
                  </Box>
                ) : (
                  <IndexTable
                    resourceName={{ singular: "post", plural: "posts" }}
                    itemCount={posts.length}
                    selectable={false}
                    headings={[
                      { title: "Article" },
                      { title: "App Status" },
                      { title: "Sync State" },
                      { title: "Direction" },
                      { title: "Last Synced" },
                      { title: "Actions" },
                    ]}
                  >
                    {rowMarkup}
                  </IndexTable>
                )
              ) : logsLoading ? (
                <Box padding="800" align="center">
                  <Spinner />
                </Box>
              ) : (
                <IndexTable
                  resourceName={{ singular: "log", plural: "logs" }}
                  itemCount={syncLogs.length}
                  selectable={false}
                  headings={[
                    { title: "Time" },
                    { title: "Direction" },
                    { title: "Event" },
                    { title: "Status" },
                    { title: "Message" },
                  ]}
                >
                  {logRowMarkup}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd">📡 Sync States Guide</Text>
                  <Divider />
                  {[
                    {
                      label: "In Sync",
                      desc: "App and Shopify are in agreement",
                      tone: "success",
                    },
                    {
                      label: "Linked",
                      desc: "Post is linked to a Shopify blog, not yet synced",
                      tone: "info",
                    },
                    {
                      label: "Pending App Push",
                      desc: "Local changes need to be pushed to Shopify",
                      tone: "warning",
                    },
                    {
                      label: "Pending Shopify Pull",
                      desc: "Shopify has newer changes to pull into the app",
                      tone: "warning",
                    },
                    {
                      label: "External Edit",
                      desc: "Article was edited directly in Shopify, blocks may be degraded",
                      tone: "warning",
                    },
                    {
                      label: "Remote Missing",
                      desc: "Article no longer exists on Shopify",
                      tone: "critical",
                    },
                  ].map(({ label, desc, tone }) => (
                    <InlineStack key={label} gap="200" blockAlign="center">
                      <Badge tone={tone}>{label}</Badge>
                      <Text variant="bodySm" tone="subdued">
                        — {desc}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
