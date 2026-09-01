import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { smartBackAction } from "../../utils/smartBack";
import CreateArticleWizard from "../../components/builder/CreateArticleWizard";
import { DateTime } from "luxon";
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
  TextField,
  Modal,
  ProgressBar,
  Tooltip,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  PlusIcon,
  ImportIcon,
  MenuHorizontalIcon,
  DuplicateIcon,
  ChatIcon,
  DeleteIcon,
} from "@shopify/polaris-icons";
import ConfirmActionModal from "../../components/ConfirmActionModal";
import UpgradePrompt from "../../components/UpgradePrompt";

const STATUS_BADGE_MAP = {
  published: "success",
  scheduled: "attention",
  draft: "info",
  failed: "critical",
};

const STATUS_LABEL_MAP = {
  published: "Published",
  scheduled: "Scheduled",
  draft: "Draft",
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



// ─── Clone Article Modal ───────────────────────────────────────────────────────
function CloneArticleModal({ open, title, onTitleChange, onConfirm, onCancel, loading }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Duplicate article"
      primaryAction={{
        content: "Duplicate article",
        onAction: onConfirm,
        loading,
        disabled: !title.trim(),
        icon: DuplicateIcon,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onCancel }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text variant="bodyMd" tone="subdued">
            A draft copy will be created. No Shopify sync will happen automatically.
          </Text>
          <TextField
            label="Article title"
            value={title}
            onChange={onTitleChange}
            autoComplete="off"
            autoFocus
            helpText="You can rename this before or after duplicating."
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ─── Post Action Popover ──────────────────────────────────────────────────────
function PostActionPopover({ post, onDelete, onClone, cloneEnabled }) {
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

  // Duplicate action — always first. Disabled (not hidden) when the plan doesn't include it, so
  // it's still discoverable as a thing this app can do — clicking a hidden feature that quietly
  // doesn't exist reads worse than seeing exactly why it's unavailable. Backend still enforces
  // this independently (POST /:id/clone checks clone_article) — this is UX, not the real gate.
  actionItems.push({
    content: "Duplicate",
    icon: DuplicateIcon,
    disabled: !cloneEnabled,
    helpText: cloneEnabled ? undefined : "Requires a plan upgrade",
    onAction: () => {
      togglePopoverActive();
      onClone();
    },
  });

  if (post?.shopifyArticle?.shopifyArticleId) {
    actionItems.push({
      content: "Manage comments",
      icon: ChatIcon,
      onAction: () => {
        togglePopoverActive();
        navigate(`/comments?article_id=${post.shopifyArticle.shopifyArticleId}`);
      },
    });
  }
  actionItems.push({
    content: "Delete",
    icon: DeleteIcon,
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
  const location = useLocation();
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [toastMessage, setToastMessage] = useState(null);

  // AI generations in flight. Polled rather than pushed: a generation outlives the wizard, so
  // the list is where its progress lives, and the merchant may well arrive here after a reload.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [aiJobs, setAiJobs] = useState([]);
  const [shopInfo, setShopInfo] = useState(null);
  const [shopifyBlogsMap, setShopifyBlogsMap] = useState({});

  // Real (unfiltered) article usage vs the plan's cap — `total` above reflects whatever
  // search/status/tag filters are active, so it can't be used to detect "at the limit".
  // Sourced from the same /api/billing/check the Plans page reads, so the two stay consistent.
  const [postCount, setPostCount] = useState(0);
  const [postLimit, setPostLimit] = useState(null);
  const [activePlan, setActivePlan] = useState("");

  // Delete confirmation modal state
  const [deleteTargetPost, setDeleteTargetPost] = useState(null);
  const [deleteFromShopifyChoice, setDeleteFromShopifyChoice] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

  // Clone modal state
  const [cloneTargetPost, setCloneTargetPost] = useState(null);
  const [cloneTitle, setCloneTitle] = useState("");
  const [isCloningLoading, setIsCloningLoading] = useState(false);

  const PER_PAGE = 20;

  // IndexFilters state
  const [itemStrings, setItemStrings] = useState(["All"]);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState(IndexFiltersMode.Default);
  const [queryValue, setQueryValue] = useState("");
  const [sortSelected, setSortSelected] = useState(["createdAt desc"]);
  
  // Seeded from the URL (e.g. Dashboard's "12 drafts" / "3 not synced" links use
  // /posts?status=draft or /posts?syncStatus=not_synced) so arriving from those links lands on
  // an already-filtered list instead of the unfiltered "All" view.
  const initialParams = new URLSearchParams(window.location.search);
  const [statusFilter, setStatusFilter] = useState(
    initialParams.get("status") ? [initialParams.get("status")] : []
  );
  const [syncFilter, setSyncFilter] = useState(
    initialParams.get("syncStatus") ? [initialParams.get("syncStatus")] : []
  );
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
      return data.posts || [];
    } catch {
      setToastMessage({ content: "Failed to load posts", error: true });
      return [];
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

  const [features, setFeatures] = useState({});
  useEffect(() => {
    fetch("/api/posts/plan/features")
      .then((r) => r.json())
      .then((d) => setFeatures(d.features || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/billing/check")
      .then((r) => r.json())
      .then((d) => {
        setPostCount(d.postCount || 0);
        setPostLimit(d.postLimit ?? null);
        setActivePlan(d.activePlan || "");
      })
      .catch(() => {});
  }, []);

  const postsAtLimit = postLimit !== null && postCount >= postLimit;
  const postsNearLimit = postLimit !== null && !postsAtLimit && postCount / postLimit >= 0.8;

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

  const handleClone = (post) => {
    setCloneTargetPost(post);
    setCloneTitle(`Copy of ${post.title}`);
  };

  const confirmClone = async () => {
    if (!cloneTargetPost) return;
    setIsCloningLoading(true);
    try {
      const res = await fetch(`/api/posts/${cloneTargetPost.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cloneTitle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToastMessage({ content: data.error || "Failed to duplicate article", error: true });
      } else {
        const newId = data.post?.id;
        setToastMessage({
          content: "Article duplicated successfully",
          action: newId ? { content: "Edit clone", onAction: () => navigate(`/posts/${newId}/edit`) } : undefined,
        });
        setCloneTargetPost(null);
        fetchPosts();
      }
    } catch {
      setToastMessage({ content: "Failed to duplicate article", error: true });
    } finally {
      setIsCloningLoading(false);
    }
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
            { label: "Scheduled", value: "scheduled" },
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

  // Poll only while something is actually running, and stop as soon as the last job settles -
  // an idle list page shouldn't sit there hitting the API every two seconds forever.
  const activeJobCount = aiJobs.filter((j) => j.status === "queued" || j.status === "running").length;
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/ai/jobs")
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          const jobs = d.jobs || [];
          // A job that just finished means the post row itself now has content - refetch so the
          // row stops showing a progress bar and starts showing the real article. Same list tells
          // us which jobs just crossed into "done" so we can surface a one-time success toast for
          // each (there's no more "notify me" email step, so this is the only in-app confirmation
          // a generation actually finished).
          const newlyFinished = jobs.filter(
            (j) => j.status === "done" && !aiJobs.find((p) => p.id === j.id && p.status === "done")
          );
          setAiJobs(jobs);
          if (newlyFinished.length > 0) {
            fetchPosts().then((freshPosts) => {
              newlyFinished.forEach((j) => {
                const post = (freshPosts || []).find((p) => p.id === j.postId);
                setToastMessage({ content: `"${post?.title || "Your article"}" is ready to edit` });
              });
            });
          }
        })
        .catch(() => {});
    load();
    if (activeJobCount === 0) return () => { cancelled = true; };
    const t = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobCount]);

  const jobForPost = (postId) => aiJobs.find((j) => j.postId === postId);

  // ─── Table Rows ────────────────────────────────────────────────────────

  const rowMarkup = posts.map((post, index) => {
    const job = jobForPost(post.id);
    const isGenerating = Boolean(job && (job.status === "queued" || job.status === "running"));
    return (
    <IndexTable.Row
      id={String(post.id)}
      key={post.id}
      position={index}
      onClick={() => {
        // The post row already exists mid-generation (so progress has something to attach to),
        // but its content is a half-written placeholder the AI job is still actively writing to -
        // opening the editor here would let a merchant's own edits race the job's own save and
        // have either one silently clobber the other.
        if (isGenerating) {
          setToastMessage({ content: "This article is still being generated - it'll be editable once it's ready." });
          return;
        }
        navigate(`/posts/${post.id}/edit`);
      }}
    >
      <IndexTable.Cell>
        <InlineStack gap="300" align="start" blockAlign="center" wrap={false}>
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
                flexShrink: 0,
              }}
            >
              📝
            </div>
          )}
          {/* A long title wrapping to a second line makes only that row disproportionately
              tall next to single-line rows — truncate to one line with an ellipsis instead,
              same fix as the Import from Shopify list. Needs an explicit max-width since a flex
              child otherwise just grows to fit its content, which defeats truncate entirely. */}
          <div style={{ maxWidth: 320, minWidth: 0 }}>
            <Text variant="bodyMd" fontWeight="semibold" truncate>
              {post.title}
            </Text>
          </div>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" tone="subdued">
          {(() => {
            // shopifyArticle only exists once the post has actually synced to Shopify - before
            // that (every draft, including every AI-generated one), the blog it's assigned to
            // lives on the post itself (blogId), set at creation and shown here the same way.
            const blogId = post.shopifyArticle?.shopifyBlogId || post.blogId;
            if (!blogId) return "—";
            return shopifyBlogsMap[String(blogId).replace("gid://shopify/Blog/", "")] || "—";
          })()}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="050">
          {(() => {
            if (isGenerating) {
              // While generation is in flight the post row is really a placeholder - it isn't
              // "Draft" in any meaningful sense yet (there's nothing to read or edit), so showing
              // that status next to a progress bar just adds a second, misleading signal.
              return (
                <div style={{ minWidth: 220 }}>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">{job.stage}</Text>
                    <ProgressBar progress={job.progress || 0} size="small" tone="primary" />
                  </BlockStack>
                </div>
              );
            }
            if (job && job.status === "failed") {
              return <Badge tone="critical">Generation failed</Badge>;
            }
            return (
              <>
                {post.aiWarning && (
                  <Tooltip content={post.aiWarning}>
                    <Badge tone="warning">Needs review</Badge>
                  </Tooltip>
                )}
                <Badge tone={STATUS_BADGE_MAP[post.status] || "info"}>
                  {STATUS_LABEL_MAP[post.status] || "Draft"}
                </Badge>
                {post.status === "scheduled" && post.publishedAt && (
                  <Text variant="bodySm" tone="subdued">
                    {DateTime.fromJSDate(new Date(post.publishedAt)).toFormat("MMM d, yyyy 'at' h:mm a")}
                  </Text>
                )}
              </>
            );
          })()}
        </BlockStack>
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
          <PostActionPopover
            post={post}
            onDelete={() => handleDelete(post)}
            onClone={() => handleClone(post)}
            cloneEnabled={!!features.clone_article?.enabled}
          />
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
    );
  });

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
        backAction={smartBackAction(navigate, location, "/dashboard", "Dashboard")}
        subtitle={
          shopInfo
            ? `${shopInfo.domain} · Plan: ${shopInfo.planKey?.toUpperCase() || "FREE"}`
            : ""
        }
        primaryAction={{
          content: "New article",
          icon: PlusIcon,
          disabled: postsAtLimit,
          onAction: () => setWizardOpen(true),
        }}
        secondaryActions={[
          {
            content: "Manage blogs",
            onAction: () => navigate("/blogs"),
          },
          {
            content: "Manage categories",
            onAction: () => navigate("/categories"),
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
          {(postsAtLimit || postsNearLimit) && (
            <Layout.Section>
              <UpgradePrompt
                requiredPlan={activePlan?.toLowerCase() === "free" ? "Starter" : "Pro"}
                title={
                  postsAtLimit
                    ? `You've reached your ${postLimit}-article limit on the ${activePlan || "current"} plan`
                    : `You're close to your ${postLimit}-article limit on the ${activePlan || "current"} plan`
                }
                description={
                  postsAtLimit
                    ? "Upgrade to create more articles."
                    : `${postCount} of ${postLimit} articles used.`
                }
              />
            </Layout.Section>
          )}
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
                      disabled: postsAtLimit,
                      onAction: () => navigate("/posts/new"),
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      {postsAtLimit
                        ? "You've reached your article limit on this plan — upgrade to create more."
                        : "Start by creating your first blog article, or try changing your filters."}
                    </p>
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

      {/* ─── Clone Article Modal ─── */}
      <CloneArticleModal
        open={Boolean(cloneTargetPost)}
        title={cloneTitle}
        onTitleChange={setCloneTitle}
        onConfirm={confirmClone}
        onCancel={() => { setCloneTargetPost(null); setCloneTitle(""); }}
        loading={isCloningLoading}
      />

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

      <CreateArticleWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onGenerated={(data) => {
          // Seed the job immediately rather than waiting for the next poll tick - a generation
          // that finishes in a couple of seconds would otherwise complete before this page's own
          // polling ever caught it as "active" (see CreateArticleWizard's startGeneration).
          if (data?.job) {
            setAiJobs((prev) => [data.job, ...prev.filter((j) => j.id !== data.job.id)]);
          }
          fetchPosts();
        }}
      />
    </Frame>
  );
}
