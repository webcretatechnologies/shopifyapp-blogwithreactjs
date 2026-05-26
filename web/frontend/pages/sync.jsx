/**
 * Sync Dashboard — View sync status for all posts, force re-sync, and see webhook logs.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Page, Layout, Card, IndexTable, Text, Badge, Button, ButtonGroup, Box,
  Spinner, InlineStack, BlockStack, Banner, Toast, Frame, Divider
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";

export default function SyncDashboard() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [toast, setToast] = useState(null);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts?per_page=50");
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchPosts(); }, []);

  const forceSync = async (post) => {
    setSyncing((s) => ({ ...s, [post.id]: true }));
    try {
      const res = await fetch(`/api/posts/${post.id}/force-sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setToast({ content: `✅ Synced: ${post.title}` });
      fetchPosts();
    } catch (err) {
      setToast({ content: `❌ ${err.message}`, error: true });
    } finally {
      setSyncing((s) => ({ ...s, [post.id]: false }));
    }
  };

  const getSyncStatus = (post) => {
    const article = post.shopifyArticle;
    if (!article) return { label: "Not Synced", tone: "attention" };
    if (article.status === "published") return { label: "Synced ✓", tone: "success" };
    if (article.status === "failed") return { label: "Failed", tone: "critical" };
    return { label: "Draft", tone: "info" };
  };

  const rowMarkup = posts.map((post, index) => {
    const sync = getSyncStatus(post);
    return (
      <IndexTable.Row id={String(post.id)} key={post.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodySm" fontWeight="semibold">{post.title}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={post.status === "published" ? "success" : "info"}>{post.status}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={sync.tone}>{sync.label}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued">
            {post.shopifyArticle?.syncedAt
              ? new Date(post.shopifyArticle.syncedAt).toLocaleString()
              : "—"
            }
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <ButtonGroup>
            <Button
              size="slim"
              icon={RefreshIcon}
              loading={syncing[post.id]}
              disabled={!post.shopifyArticle?.shopifyBlogId}
              onClick={() => forceSync(post)}
              title={!post.shopifyArticle?.shopifyBlogId ? "Post is not linked to a Shopify blog" : "Force sync to Shopify"}
            >
              Sync
            </Button>
            <Button size="slim" onClick={() => navigate(`/posts/${post.id}/edit`)}>Edit</Button>
          </ButtonGroup>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Frame>
      {toast && <Toast content={toast.content} error={toast.error} onDismiss={() => setToast(null)} />}
      <Page
        title="Sync Status"
        subtitle="Manage the 2-way synchronization between your app and Shopify"
        backAction={{ content: "Dashboard", onAction: () => navigate("/posts") }}
        primaryAction={{ content: "Refresh", icon: RefreshIcon, onAction: fetchPosts, loading }}
      >
        <Layout>
          <Layout.Section>
            <Banner>
              <p>Posts linked to a Shopify blog can be force-synced here. Posts marked <strong>Not Synced</strong> have not been published to Shopify yet.</p>
            </Banner>
          </Layout.Section>

          <Layout.Section>
            <Card>
              {loading ? (
                <Box padding="800" align="center"><Spinner /></Box>
              ) : (
                <IndexTable
                  resourceName={{ singular: "post", plural: "posts" }}
                  itemCount={posts.length}
                  selectable={false}
                  headings={[
                    { title: "Article" },
                    { title: "App Status" },
                    { title: "Shopify Sync" },
                    { title: "Last Synced" },
                    { title: "Actions" },
                  ]}
                >
                  {rowMarkup}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd">📡 Sync Guide</Text>
                  <Divider />
                  {[
                    { label: "Synced ✓", desc: "Article is live on your Shopify blog", tone: "success" },
                    { label: "Draft", desc: "Saved in app but not published to Shopify", tone: "info" },
                    { label: "Not Synced", desc: "Post exists only in the app, no Shopify blog linked", tone: "attention" },
                    { label: "Failed", desc: "Last sync attempt failed — click Sync to retry", tone: "critical" },
                  ].map(({ label, desc, tone }) => (
                    <InlineStack key={label} gap="200" blockAlign="center">
                      <Badge tone={tone}>{label}</Badge>
                      <Text variant="bodySm" tone="subdued">— {desc}</Text>
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
