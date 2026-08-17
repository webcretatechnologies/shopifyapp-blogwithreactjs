import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { smartBackAction } from "../../utils/smartBack";
import UpgradePrompt from "../../components/UpgradePrompt";
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
  InlineStack,
  Popover,
  ActionList,
  Frame
} from "@shopify/polaris";
import {
  PlusIcon,
  MenuHorizontalIcon
} from "@shopify/polaris-icons";
import { Modal } from "@shopify/polaris";

function BlogActionPopover({ blog, onDelete }) {
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
        items={[
          {
            content: "Delete",
            destructive: true,
            onAction: () => {
              togglePopoverActive();
              onDelete();
            },
          },
        ]}
      />
    </Popover>
  );
}

export default function Blogs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [blogs, setBlogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Delete confirmation modal state
  const [deleteTargetBlog, setDeleteTargetBlog] = useState(null);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [confirmBlogName, setConfirmBlogName] = useState("");

  // IndexFilters state
  const [itemStrings, setItemStrings] = useState(["All"]);
  const [selected, setSelected] = useState(0);
  const [queryValue, setQueryValue] = useState("");
  const [sortSelected, setSortSelected] = useState(["updatedAt desc"]);
  const [mode, setMode] = useState(IndexFiltersMode.Default);

  const fetchBlogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/posts/shopify/blogs");
      const data = await res.json();
      let fetchedBlogs = data.blogs || [];

      // Sorting
      if (sortSelected.length > 0) {
        const [key, direction] = sortSelected[0].split(" ");
        fetchedBlogs.sort((a, b) => {
          if (key === "title") {
            return direction === "asc"
              ? a.title.localeCompare(b.title)
              : b.title.localeCompare(a.title);
          }
          if (key === "updatedAt") {
            const dateA = new Date(a.updatedAt || 0).getTime();
            const dateB = new Date(b.updatedAt || 0).getTime();
            return direction === "asc" ? dateA - dateB : dateB - dateA;
          }
          return 0;
        });
      }
      
      // Search filtering
      if (queryValue) {
        const lowerQuery = queryValue.toLowerCase();
        fetchedBlogs = fetchedBlogs.filter(
          (blog) =>
            blog.title.toLowerCase().includes(lowerQuery) ||
            (blog.handle && blog.handle.toLowerCase().includes(lowerQuery))
        );
      }

      setBlogs(fetchedBlogs);
    } catch (err) {
      setToastMessage({ content: "Failed to load blogs", error: true });
    } finally {
      setIsLoading(false);
    }
  }, [queryValue, sortSelected]);

  useEffect(() => {
    fetchBlogs();
  }, [fetchBlogs]);

  // max_blogs is a numeric per-plan cap (Free 1, Starter 3, Pro unlimited) already enforced
  // server-side (POST /shopify/blogs) — this was previously invisible in the UI: a merchant at
  // the cap would only find out by clicking "Add blog", filling out the whole form, and getting
  // a generic error toast on submit. Now shown proactively as a usage count and a disabled
  // "Add blog" button once reached.
  const [blogLimit, setBlogLimit] = useState(null);
  useEffect(() => {
    fetch("/api/posts/plan/features")
      .then((r) => r.json())
      .then((d) => setBlogLimit(d.features?.max_blogs?.limit ?? null))
      .catch(() => {});
  }, []);
  const atBlogLimit = blogLimit !== null && blogs.length >= blogLimit;

  const handleDelete = (blog) => {
    setDeleteTargetBlog(blog);
    setConfirmBlogName("");
  };

  const showToast = useCallback((content, isError = false) => {
    if (window.shopify?.toast) {
      window.shopify.toast.show(content, { isError });
    } else {
      setToastMessage({ content, error: isError });
    }
  }, []);

  const confirmDeleteBlog = async () => {
    if (!deleteTargetBlog) return;
    setIsDeleteConfirming(true);
    try {
      const res = await fetch(`/api/posts/shopify/blogs/${deleteTargetBlog.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast("Blog deleted successfully");
        fetchBlogs();
      } else {
        const errData = await res.json();
        showToast(errData.error || "Failed to delete blog", true);
      }
    } catch (err) {
      showToast("Error deleting blog", true);
    } finally {
      setIsDeleteConfirming(false);
      setDeleteTargetBlog(null);
    }
  };

  // --- IndexFilters Configuration ---
  const sortOptions = [
    { label: "Title (A-Z)", value: "title asc", directionLabel: "A-Z" },
    { label: "Title (Z-A)", value: "title desc", directionLabel: "Z-A" },
    { label: "Oldest updated", value: "updatedAt asc", directionLabel: "Oldest" },
    { label: "Newest updated", value: "updatedAt desc", directionLabel: "Newest" },
  ];

  // We have no filters for Blogs yet, keeping it empty like Manage Comments if not needed, but we keep the structure.
  const filters = [];

  const appliedFilters = [];
  
  const handleQueryClear = useCallback(() => setQueryValue(""), []);
  const handleClearAll = useCallback(() => {
    setQueryValue("");
  }, []);

  const resourceName = {
    singular: "blog",
    plural: "blogs",
  };

  const rowMarkup = blogs.map((blog, index) => {
    const policyMap = {
      CLOSED: "Disabled",
      DISABLED: "Disabled",
      MODERATED: "Pending moderation",
      AUTO_PUBLISHED: "Allowed",
      ALLOWED: "Allowed"
    };

    return (
      <IndexTable.Row
        id={blog.id}
        key={blog.id}
        position={index}
        onClick={() => navigate(`/blogs/${blog.id}/edit`)}
      >
        <IndexTable.Cell>
          <div style={{ maxWidth: 320, minWidth: 0 }}>
            <Text variant="bodyMd" fontWeight="bold" as="span" truncate>
              {blog.title}
            </Text>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued">
            {policyMap[blog.commentPolicy] || "Disabled"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued">
            {blog.updatedAt ? new Date(blog.updatedAt).toLocaleDateString() : "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div onClick={(e) => e.stopPropagation()}>
            <BlogActionPopover blog={blog} onDelete={() => handleDelete(blog)} />
          </div>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Frame>
      <Page
      title="Blogs"
      backAction={smartBackAction(navigate, location, "/posts", "Articles")}
      primaryAction={{
        content: "Add blog",
        onAction: () => navigate("/blogs/new"),
        disabled: atBlogLimit,
      }}
    >
      <Layout>
        {atBlogLimit && (
          <Layout.Section>
            <UpgradePrompt
              requiredPlan="Starter"
              title={`You've reached your plan's limit of ${blogLimit} blog${blogLimit === 1 ? "" : "s"}`}
              description="Upgrade your plan to create more blogs."
            />
          </Layout.Section>
        )}
        <Layout.Section>
          <Card padding="0">
            <IndexFilters
              sortOptions={sortOptions}
              sortSelected={sortSelected}
              queryValue={queryValue}
              queryPlaceholder="Search blogs"
              onQueryChange={setQueryValue}
              onQueryClear={handleQueryClear}
              onSort={setSortSelected}
              tabs={itemStrings.map((item, index) => ({
                content: item,
                index,
                onAction: () => setSelected(index),
                id: `${item}-${index}`,
                isLocked: index === 0,
              }))}
              selected={selected}
              onSelect={setSelected}
              canCreateNewView={false}
              filters={filters}
              appliedFilters={appliedFilters}
              onClearAll={handleClearAll}
              mode={mode}
              setMode={setMode}
              hideFilters
            />

            <IndexTable
              resourceName={resourceName}
              itemCount={blogs.length}
              selectedItemsCount={0}
              onSelectionChange={() => {}}
              selectable={false}
              headings={[
                { title: "Title" },
                { title: "Comments" },
                { title: "Updated" },
                { title: "", hidden: true }, // Actions
              ]}
              loading={isLoading}
              emptyState={
                !isLoading && (
                  <EmptyState
                    heading="Manage your blogs"
                    action={atBlogLimit ? undefined : { content: "Add blog", onAction: () => navigate("/blogs/new") }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Blogs are a great way to build a community around your products and brand.</p>
                  </EmptyState>
                )
              }
            >
              {rowMarkup}
            </IndexTable>
            {blogs.length > 0 && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--p-color-text-subdued)' }}>
                <Text variant="bodySm" as="p">
                  Blogs are a great way to build a community around your products and brand.
                </Text>
              </div>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={!!deleteTargetBlog}
        onClose={() => setDeleteTargetBlog(null)}
        title="Delete blog?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: confirmDeleteBlog,
          loading: isDeleteConfirming,
          disabled: confirmBlogName !== deleteTargetBlog?.title
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteTargetBlog(null)
          }
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete this blog? This action cannot be undone, and will permanently delete all articles associated with it from Shopify.
          </Text>
          <div style={{ marginTop: '16px' }}>
            <Text as="p" tone="subdued">
              To confirm deletion, type <b>{deleteTargetBlog?.title}</b> below:
            </Text>
            <div style={{ marginTop: '8px' }}>
              <input
                type="text"
                value={confirmBlogName}
                onChange={(e) => setConfirmBlogName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--p-color-border)',
                  borderRadius: '4px',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          </div>
        </Modal.Section>
      </Modal>

      {toastMessage && (
        <Toast
          content={toastMessage.content}
          error={toastMessage.error}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </Page>
    </Frame>
  );
}
