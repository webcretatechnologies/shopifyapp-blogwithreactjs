import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  IndexFilters,
  IndexFiltersMode,
  Text,
  Badge,
  Button,
  EmptyState,
  Spinner,
  ChoiceList,
  Toast,
  Frame,
  Thumbnail,
  Box,
  InlineStack,
  BlockStack,
  Popover,
  ActionList,
  TextField
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  PlusIcon,
  ImportIcon,
  MenuHorizontalIcon
} from "@shopify/polaris-icons";
import ConfirmActionModal from "../../components/ConfirmActionModal";

const STATUS_BADGE_MAP = {
  published: "success",
  draft: "info",
  failed: "critical",
};

function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `${mins} minute${mins > 1 ? "s" : ""} ago`;
  }
  if (diffInSeconds < 86400) {
    const hrs = Math.floor(diffInSeconds / 3600);
    return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  }
  if (diffInSeconds < 172800) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const parseTags = (input) => {
  if (!input) return [];
  const tagArray = Array.isArray(input) ? input : String(input).split(",");
  const result = [];
  tagArray.forEach((item) => {
    if (typeof item === "string") {
      item.split(",").forEach((subItem) => {
        const trimmed = subItem.trim();
        if (trimmed && !result.includes(trimmed)) {
          result.push(trimmed);
        }
      });
    }
  });
  return result;
};



function PostActionPopover({ post, onDelete }) {
  const navigate = useNavigate();
  const [popoverActive, setPopoverActive] = useState(false);

  const togglePopoverActive = useCallback(
    () => setPopoverActive((active) => !active),
    [],
  );

  const activator = (
    <Button
      variant="plain"
      icon={MenuHorizontalIcon}
      onClick={togglePopoverActive}
      accessibilityLabel="More actions"
    />
  );

  const actionItems = [];
  if (post?.shopifyArticle?.shopifyArticleId) {
    actionItems.push({
      content: "Manage comments",
      onAction: () => {
        togglePopoverActive();
        navigate(`/comments?article_id=${post.shopifyArticle.shopifyArticleId}`);
      },
    });
  }
  actionItems.push({
    content: "Delete",
    destructive: true,
    onAction: () => {
      togglePopoverActive();
      onDelete();
    },
  });

  return (
    <Popover
      active={popoverActive}
      activator={activator}
      autofocusTarget="first-node"
      onClose={togglePopoverActive}
      preferredAlignment="right"
    >
      <ActionList
        actionRole="menuitem"
        items={actionItems}
      />
    </Popover>
  );
}

export default function Articles() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [toastMessage, setToastMessage] = useState(null);
  const [shopInfo, setShopInfo] = useState(null);
  const [shopifyBlogsMap, setShopifyBlogsMap] = useState({});

  // Delete confirmation modal state
  const [deleteTargetPost, setDeleteTargetPost] = useState(null);
  const [deleteFromShopifyChoice, setDeleteFromShopifyChoice] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

  const PER_PAGE = 20;

  // IndexFilters state
  const [itemStrings, setItemStrings] = useState(["All"]);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState(IndexFiltersMode.Default);
  const [queryValue, setQueryValue] = useState("");
  const [sortSelected, setSortSelected] = useState(["createdAt desc"]);
  
  const [statusFilter, setStatusFilter] = useState([]);
  const [syncFilter, setSyncFilter] = useState([]);
  const [tagFilter, setTagFilter] = useState("");

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sortKey, sortDirection] = sortSelected[0].split(" ");
      const params = new URLSearchParams({ page, per_page: PER_PAGE });
      if (statusFilter.length > 0) params.set("status", statusFilter[0]);
      if (syncFilter.length > 0) params.set("syncStatus", syncFilter[0]);
      if (tagFilter) params.set("tags", tagFilter);
      if (queryValue) params.set("search", queryValue);
      if (sortKey) {
        params.set("sortKey", sortKey);
        params.set("sortDirection", sortDirection);
      }
      
      const res = await fetch(`/api/posts?${params}`);
      const data = await res.json();
      setPosts(data.posts || []);
      setTotal(data.total || 0);
    } catch {
      setToastMessage({ content: "Failed to load posts", error: true });
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, syncFilter, tagFilter, queryValue, sortSelected]);

  const fetchShop = async () => {
    try {
      const res = await fetch("/api/shop");
      const data = await res.json();
      setShopInfo(data.shop);
    } catch {}
  };

  useEffect(() => {
    fetchPosts();
    fetchShop();
    fetchShopifyBlogs();
  }, [fetchPosts]);

  const fetchShopifyBlogs = async () => {
    try {
      const res = await fetch("/api/posts/shopify/blogs");
      const data = await res.json();
      const map = {};
      if (data.blogs) {
        data.blogs.forEach((b) => {
          map[String(b.id)] = b.title;
          map[String(b.id).replace("gid://shopify/Blog/", "")] = b.title;
        });
      }
      setShopifyBlogsMap(map);
    } catch {}
  };

  const handleDelete = (post) => {
    setDeleteTargetPost(post);
    setDeleteFromShopifyChoice(false);
  };

  const confirmDeletePost = async () => {
    if (!deleteTargetPost) return;
    setIsDeleteConfirming(true);
    try {
      await fetch(
        `/api/posts/${deleteTargetPost.id}?deleteFromShopify=${deleteFromShopifyChoice}`,
        { method: "DELETE" },
      );
      setToastMessage({ content: "Article deleted" });
      setDeleteTargetPost(null);
      fetchPosts();
    } catch {
      setToastMessage({ content: "Delete failed", error: true });
    } finally {
      setIsDeleteConfirming(false);
    }
  };

  // ─── IndexFilters Configuration ──────────────────────────────────────────

  const sortOptions = [
    { label: "Date created", value: "createdAt asc", directionLabel: "Oldest" },
    { label: "Date created", value: "createdAt desc", directionLabel: "Newest" },
    { label: "Title", value: "title asc", directionLabel: "A-Z" },
    { label: "Title", value: "title desc", directionLabel: "Z-A" },
    { label: "Status", value: "status asc", directionLabel: "Ascending" },
    { label: "Status", value: "status desc", directionLabel: "Descending" },
  ];

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
          selected={statusFilter || []}
          onChange={setStatusFilter}
          allowMultiple={false}
        />
      ),
      shortcut: true,
    },
    {
      key: "syncStatus",
      label: "Sync status",
      filter: (
        <ChoiceList
          title="Sync status"
          titleHidden
          choices={[
            { label: "Synced", value: "synced" },
            { label: "Not synced", value: "not_synced" },
          ]}
          selected={syncFilter || []}
          onChange={setSyncFilter}
          allowMultiple={false}
        />
      ),
    },
    {
      key: "tags",
      label: "Tags",
      filter: (
        <TextField
          label="Tags"
          value={tagFilter}
          onChange={setTagFilter}
          autoComplete="off"
          labelHidden
          placeholder="Filter by tags"
        />
      ),
    },
  ];

  const appliedFilters = [];
  if (statusFilter && statusFilter.length > 0) {
    appliedFilters.push({
      key: "status",
      label: `Status: ${statusFilter[0]}`,
      onRemove: () => setStatusFilter([]),
    });
  }
  if (syncFilter && syncFilter.length > 0) {
    appliedFilters.push({
      key: "syncStatus",
      label: `Sync: ${syncFilter[0]}`,
      onRemove: () => setSyncFilter([]),
    });
  }
  if (tagFilter) {
    appliedFilters.push({
      key: "tags",
      label: `Tag: ${tagFilter}`,
      onRemove: () => setTagFilter(""),
    });
  }

  // ─── Table Rows ────────────────────────────────────────────────────────

  const rowMarkup = posts.map((post, index) => (
    <IndexTable.Row
      id={String(post.id)}
      key={post.id}
      position={index}
      onClick={() => navigate(`/posts/${post.id}/edit`)}
    >
      <IndexTable.Cell>
        <InlineStack gap="300" align="start" blockAlign="center">
          {post.featuredImage ? (
            <Thumbnail
              source={post.featuredImage}
              alt={post.title}
              size="small"
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                background: "#f1f2f3",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              📝
            </div>
          )}
          <Text variant="bodyMd" fontWeight="semibold">
            {post.title}
          </Text>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" tone="subdued">
          {post.shopifyArticle?.shopifyBlogId ? (shopifyBlogsMap[post.shopifyArticle.shopifyBlogId.replace("gid://shopify/Blog/", "")] || "—") : "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={STATUS_BADGE_MAP[post.status] || "info"}>
          {post.status === "published" ? "Published" : "Draft"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {post.shopifyArticle?.status === "published" ? (
          <Badge tone="info" progress="complete">Synced</Badge>
        ) : (
          <Text variant="bodySm" tone="subdued">—</Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {post.tags && parseTags(post.tags).length > 0 ? (
          <InlineStack gap="100">
            {parseTags(post.tags).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </InlineStack>
        ) : (
          <Text variant="bodySm" tone="subdued">—</Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" tone="subdued">
          {post.createdAt ? timeAgo(post.createdAt) : "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div onClick={(e) => e.stopPropagation()}>
          <PostActionPopover post={post} onDelete={() => handleDelete(post)} />
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Frame>
      <TitleBar title="Articles" />
      {toastMessage && (
        <Toast
          content={toastMessage.content}
          error={toastMessage.error}
          onDismiss={() => setToastMessage(null)}
        />
      )}
      <Page
        title="Articles"
        subtitle={
          shopInfo
            ? `${shopInfo.domain} · Plan: ${shopInfo.planKey?.toUpperCase() || "FREE"}`
            : ""
        }
        primaryAction={{
          content: "New Article",
          icon: PlusIcon,
          onAction: () => navigate("/posts/new"),
        }}
        secondaryActions={[
          {
            content: "Manage blogs",
            onAction: () => navigate("/blogs"),
          },
          {
            content: "Manage comments",
            onAction: () => navigate("/comments"),
          },
          {
            content: "Import from Shopify",
            icon: ImportIcon,
            onAction: () => navigate("/posts/import"),
          },
        ]}
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <IndexFilters
                canCreateNewView={false}
                sortOptions={sortOptions}
                sortSelected={sortSelected}
                queryValue={queryValue}
                queryPlaceholder="Search articles..."
                onQueryChange={setQueryValue}
                onQueryClear={() => setQueryValue("")}
                onSort={setSortSelected}
                primaryAction={null}
                cancelAction={{
                  onAction: () => {},
                  disabled: false,
                  loading: false,
                }}
                tabs={itemStrings.map((item, index) => ({
                  content: item,
                  id: `${item}-${index}`,
                }))}
                selected={selected}
                onSelect={setSelected}
                filters={filters}
                appliedFilters={appliedFilters}
                onClearAll={() => {
                  setStatusFilter([]);
                  setSyncFilter([]);
                  setTagFilter("");
                  setQueryValue("");
                }}
                mode={mode}
                setMode={setMode}
              />
              
              {isLoading ? (
                <Box padding="800" align="center">
                  <Spinner />
                </Box>
              ) : posts.length === 0 ? (
                <Box padding="800">
                  <EmptyState
                    heading="No articles found"
                    action={{
                      content: "Create Article",
                      onAction: () => navigate("/posts/new"),
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Start by creating your first blog article, or try changing your filters.</p>
                  </EmptyState>
                </Box>
              ) : (
                <IndexTable
                  resourceName={{ singular: "article", plural: "articles" }}
                  itemCount={posts.length}
                  headings={[
                    { title: "Article" },
                    { title: "Blog" },
                    { title: "Status" },
                    { title: "Sync" },
                    { title: "Tags" },
                    { title: "Created" },
                    { title: "", hidden: true }, // For kebab actions
                  ]}
                  selectable={false}
                  pagination={{
                    hasNext: page * PER_PAGE < total,
                    hasPrevious: page > 1,
                    onNext: () => setPage(p => p + 1),
                    onPrevious: () => setPage(p => p - 1),
                  }}
                >
                  {rowMarkup}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {/* ─── Delete Confirmation Modal ─── */}
      <ConfirmActionModal
        open={Boolean(deleteTargetPost)}
        title={`Delete ${deleteTargetPost?.title || "article"}?`}
        body={
          <Text as="p" variant="bodyMd">
            This article will be permanently deleted from the app.{" "}
            <strong>This cannot be undone.</strong>
          </Text>
        }
        confirmText="Delete article"
        confirmTone="critical"
        onConfirm={confirmDeletePost}
        onCancel={() => {
          setDeleteTargetPost(null);
          setDeleteFromShopifyChoice(false);
        }}
        loading={isDeleteConfirming}
        checkbox={
          deleteTargetPost &&
          (deleteTargetPost.status === "published" ||
            deleteTargetPost.shopifyArticle?.status === "published")
            ? {
                label:
                  "Also delete this article permanently from your live Shopify store",
                checked: deleteFromShopifyChoice,
                onChange: setDeleteFromShopifyChoice,
              }
            : undefined
        }
      />
    </Frame>
  );
}
