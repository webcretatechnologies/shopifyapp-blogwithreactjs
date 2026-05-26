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
  EmptyState,
  Spinner,
  Banner,
  Filters,
  ChoiceList,
  Toast,
  Frame,
  Thumbnail,
  Box,
  InlineStack,
  BlockStack,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { PlusIcon, EditIcon, DeleteIcon, ImportIcon, RefreshIcon } from "@shopify/polaris-icons";
import StatsCard from "../../components/analytics/StatsCard";
import AnalyticsChart from "../../components/analytics/AnalyticsChart";

const STATUS_BADGE_MAP = {
  published: "success",
  draft: "info",
  failed: "critical",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [page, setPage] = useState(1);
  const [toastMessage, setToastMessage] = useState(null);
  const [shopInfo, setShopInfo] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const PER_PAGE = 20;

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: PER_PAGE });
      if (statusFilter.length === 1) params.set("status", statusFilter[0]);
      if (searchValue) params.set("search", searchValue);
      const res = await fetch(`/api/posts?${params}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setTotal(data.total || 0);
    } catch {
      setToastMessage({ content: "Failed to load posts", error: true });
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, searchValue]);

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/posts/analytics/summary");
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {}
    finally { setAnalyticsLoading(false); }
  };

  const fetchShop = async () => {
    try {
      const res = await fetch("/api/shop");
      const data = await res.json();
      setShopInfo(data.shop);
    } catch {}
  };

  useEffect(() => { fetchPosts(); fetchShop(); fetchAnalytics(); }, [fetchPosts]);

  const handleDelete = async (post) => {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    let deleteFromShopify = false;
    if (post.status === "published" || post.shopifyArticle?.status === "published") {
      deleteFromShopify = confirm("Also delete this article permanently from your live Shopify store?");
    }
    try {
      await fetch(`/api/posts/${post.id}?deleteFromShopify=${deleteFromShopify}`, { method: "DELETE" });
      setToastMessage({ content: "Article deleted" });
      fetchPosts();
      fetchAnalytics();
    } catch {
      setToastMessage({ content: "Delete failed", error: true });
    }
  };

  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "Draft", value: "draft" },
            { label: "Published", value: "published" },
          ]}
          selected={statusFilter}
          onChange={setStatusFilter}
          allowMultiple={false}
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = statusFilter.length
    ? [{ key: "status", label: `Status: ${statusFilter[0]}`, onRemove: () => setStatusFilter([]) }]
    : [];

  const rowMarkup = posts.map((post, index) => (
    <IndexTable.Row id={String(post.id)} key={post.id} position={index}>
      <IndexTable.Cell>
        <InlineStack gap="300" align="start" blockAlign="center">
          {post.featuredImage ? (
            <Thumbnail source={post.featuredImage} alt={post.title} size="small" />
          ) : (
            <div style={{ width: 40, height: 40, background: "#f1f2f3", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              📝
            </div>
          )}
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="semibold">{post.title}</Text>
            {post.category && <Text variant="bodySm" tone="subdued">{post.category.name}</Text>}
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="100">
          <Badge tone={STATUS_BADGE_MAP[post.status] || "attention"}>{post.status}</Badge>
          {post.shopifyArticle?.status === "published" && (
            <Badge tone="success" progress="complete">Synced</Badge>
          )}
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" tone="subdued">{post.tags?.join(", ") || "—"}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" tone="subdued">
          {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <ButtonGroup>
          <Button size="slim" icon={EditIcon} onClick={() => navigate(`/posts/${post.id}/edit`)}>Edit</Button>
          <Button size="slim" tone="critical" icon={DeleteIcon} onClick={() => handleDelete(post)}>Delete</Button>
        </ButtonGroup>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const stats = analytics?.stats;

  return (
    <Frame>
      <TitleBar title="Blog Dashboard" />
      {toastMessage && (
        <Toast content={toastMessage.content} error={toastMessage.error} onDismiss={() => setToastMessage(null)} />
      )}
      <Page
        title="Blog Dashboard"
        subtitle={shopInfo ? `${shopInfo.domain} · Plan: ${shopInfo.planKey?.toUpperCase() || "FREE"}` : ""}
        primaryAction={{ content: "New Article", icon: PlusIcon, onAction: () => navigate("/posts/new") }}
        secondaryActions={[
          { content: "Import from Shopify", icon: ImportIcon, onAction: () => navigate("/posts/import") },
        ]}
      >
        <Layout>

          {/* ─── Stats Cards ─── */}
          <Layout.Section>
            {analyticsLoading ? (
              <Box padding="400" align="center"><Spinner /></Box>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                <StatsCard title="Total Articles" value={stats?.totalPosts ?? 0} icon="📝" color="#008060" />
                <StatsCard title="Published" value={stats?.published ?? 0} icon="✅" color="#00a97c" />
                <StatsCard title="Drafts" value={stats?.drafts ?? 0} icon="📋" color="#6d7175" />
                <StatsCard title="Total Views (30d)" value={(stats?.totalViews ?? 0).toLocaleString()} icon="👁" color="#005bd3" />
              </div>
            )}
          </Layout.Section>

          {/* ─── Analytics Chart ─── */}
          <Layout.Section>
            <AnalyticsChart
              data={analytics?.dailyViews || []}
              title="Blog Views — Last 30 Days"
              color="#008060"
            />
          </Layout.Section>

          {/* ─── Top Posts + Quick Actions ─── */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Quick Actions */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd">Quick Actions</Text>
                    <Divider />
                    <Button variant="primary" fullWidth onClick={() => navigate("/posts/new")}>
                      ✍️ &nbsp; Write New Article
                    </Button>
                    <Button fullWidth onClick={() => navigate("/posts/import")}>
                      📥 &nbsp; Import from Shopify
                    </Button>
                    <Button fullWidth onClick={() => navigate("/posts/wizard")}>
                      🧙 &nbsp; Article Setup Wizard
                    </Button>
                    <Button fullWidth onClick={() => { fetchPosts(); fetchAnalytics(); }} icon={RefreshIcon}>
                      Refresh Data
                    </Button>
                  </BlockStack>
                </Box>
              </Card>

              {/* Top Posts */}
              {analytics?.topPosts?.length > 0 && (
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingMd">🏆 Top Posts</Text>
                      <Divider />
                      {analytics.topPosts.map((p) => (
                        <InlineStack key={p.id} align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text variant="bodySm" fontWeight="semibold"
                              truncate
                              style={{ maxWidth: "180px" }}
                            >
                              {p.title || "Untitled"}
                            </Text>
                            <Badge tone={p.status === "published" ? "success" : "info"}>{p.status}</Badge>
                          </BlockStack>
                          <Text variant="bodySm" tone="subdued">{p.totalViews.toLocaleString()} views</Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </Box>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>

          {/* ─── Articles Table ─── */}
          <Layout.Section>
            <Card>
              <Filters
                queryValue={searchValue}
                queryPlaceholder="Search articles..."
                filters={filters}
                appliedFilters={appliedFilters}
                onQueryChange={(v) => { setSearchValue(v); setPage(1); }}
                onQueryClear={() => { setSearchValue(""); setPage(1); }}
                onClearAll={() => { setStatusFilter([]); setSearchValue(""); }}
              />
              {isLoading ? (
                <Box padding="800" align="center"><Spinner /></Box>
              ) : posts.length === 0 ? (
                <EmptyState
                  heading="No articles yet"
                  action={{ content: "Create Article", onAction: () => navigate("/posts/new") }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Start by creating your first blog article.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: "article", plural: "articles" }}
                  itemCount={posts.length}
                  headings={[
                    { title: "Article" },
                    { title: "Status" },
                    { title: "Tags" },
                    { title: "Created" },
                    { title: "Actions" },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>

        </Layout>
      </Page>
    </Frame>
  );
}
