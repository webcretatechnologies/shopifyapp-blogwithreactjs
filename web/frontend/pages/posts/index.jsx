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
import {
  PlusIcon,
  EditIcon,
  DeleteIcon,
  ImportIcon,
} from "@shopify/polaris-icons";
import ConfirmActionModal from "../../components/ConfirmActionModal";

const STATUS_BADGE_MAP = {
  published: "success",
  draft: "info",
  failed: "critical",
};

export default function Articles() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [page, setPage] = useState(1);
  const [toastMessage, setToastMessage] = useState(null);
  const [shopInfo, setShopInfo] = useState(null);

  // Delete confirmation modal state
  const [deleteTargetPost, setDeleteTargetPost] = useState(null);
  const [deleteFromShopifyChoice, setDeleteFromShopifyChoice] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

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

  useEffect(() => {
    fetchPosts();
    fetchShop();
  }, [fetchPosts]);

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
    ? [
        {
          key: "status",
          label: `Status: ${statusFilter[0]}`,
          onRemove: () => setStatusFilter([]),
        },
      ]
    : [];

  const rowMarkup = posts.map((post, index) => (
    <IndexTable.Row id={String(post.id)} key={post.id} position={index}>
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
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="semibold">
              {post.title}
            </Text>
            {post.category && (
              <Text variant="bodySm" tone="subdued">
                {post.category.name}
              </Text>
            )}
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="100">
          <Badge tone={STATUS_BADGE_MAP[post.status] || "attention"}>
            {post.status}
          </Badge>
          {post.shopifyArticle?.status === "published" && (
            <Badge tone="success" progress="complete">
              Synced
            </Badge>
          )}
        </InlineStack>
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
            content: "Import from Shopify",
            icon: ImportIcon,
            onAction: () => navigate("/posts/import"),
          },
        ]}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <Filters
                queryValue={searchValue}
                queryPlaceholder="Search articles..."
                filters={filters}
                appliedFilters={appliedFilters}
                onQueryChange={(v) => {
                  setSearchValue(v);
                  setPage(1);
                }}
                onQueryClear={() => {
                  setSearchValue("");
                  setPage(1);
                }}
                onClearAll={() => {
                  setStatusFilter([]);
                  setSearchValue("");
                }}
              />
              {isLoading ? (
                <Box padding="800" align="center">
                  <Spinner />
                </Box>
              ) : posts.length === 0 ? (
                <EmptyState
                  heading="No articles yet"
                  action={{
                    content: "Create Article",
                    onAction: () => navigate("/posts/new"),
                  }}
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
