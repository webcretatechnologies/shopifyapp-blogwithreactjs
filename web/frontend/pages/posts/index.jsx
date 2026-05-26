import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  useIndexResourceState,
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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { PlusIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";

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

  const fetchShop = async () => {
    try {
      const res = await fetch("/api/shop");
      const data = await res.json();
      setShopInfo(data.shop);
    } catch {}
  };

  useEffect(() => { fetchPosts(); fetchShop(); }, [fetchPosts]);

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
    } catch {
      setToastMessage({ content: "Delete failed", error: true });
    }
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(posts.map((p) => String(p.id)));

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
    <IndexTable.Row
      id={String(post.id)}
      key={post.id}
      selected={selectedResources.includes(String(post.id))}
      position={index}
    >
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
        <Badge tone={STATUS_BADGE_MAP[post.status] || "attention"}>
          {post.status}
        </Badge>
        {post.shopifyArticle?.status === "published" && (
          <Badge tone="success" progress="complete"> Synced</Badge>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" tone="subdued">
          {post.tags?.join(", ") || "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" tone="subdued">
          {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <ButtonGroup>
          <Button
            size="slim"
            icon={EditIcon}
            onClick={() => navigate(`/posts/${post.id}/edit`)}
          >
            Edit
          </Button>
          <Button
            size="slim"
            tone="critical"
            icon={DeleteIcon}
            onClick={() => handleDelete(post)}
          >
            Delete
          </Button>
        </ButtonGroup>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Frame>
      <TitleBar title="Blog Articles" />
      {toastMessage && (
        <Toast
          content={toastMessage.content}
          error={toastMessage.error}
          onDismiss={() => setToastMessage(null)}
        />
      )}
      <Page
        title="Blog Articles"
        subtitle={`${total} total articles`}
        primaryAction={{
          content: "New Article",
          icon: PlusIcon,
          onAction: () => navigate("/posts/new"),
        }}
      >
        <Layout>
          {shopInfo && (
            <Layout.Section>
              <Card>
                <Box padding="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="headingMd">Welcome to Blogger</Text>
                      <Text tone="subdued">Plan: <Badge>{shopInfo.planKey?.toUpperCase() || "FREE"}</Badge></Text>
                    </BlockStack>
                    <Button onClick={() => navigate("/posts/new")} variant="primary">
                      Create Your First Article
                    </Button>
                  </InlineStack>
                </Box>
              </Card>
            </Layout.Section>
          )}
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
                <Box padding="800" align="center">
                  <Spinner />
                </Box>
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
                  selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Article" },
                    { title: "Status" },
                    { title: "Tags" },
                    { title: "Created" },
                    { title: "Actions" },
                  ]}
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
