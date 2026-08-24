import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { smartBackAction } from "../../utils/smartBack";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  IndexFilters,
  IndexFiltersMode,
  useIndexResourceState,
  Text,
  Badge,
  Button,
  EmptyState,
  Spinner,
  Toast,
  Frame,
  Box,
  InlineStack,
  BlockStack,
  Popover,
  ActionList,
  Modal,
  ChoiceList,
  Banner
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { MenuHorizontalIcon } from "@shopify/polaris-icons";

const STATUS_BADGE_MAP = {
  published: { tone: "success", label: "Approved" },
  approved: { tone: "success", label: "Approved" },
  pending: { tone: "warning", label: "Not Approved" },
  unapproved: { tone: "warning", label: "Not Approved" },
  not_approved: { tone: "warning", label: "Not Approved" },
  spam: { tone: "critical", label: "Spam" },
};

function formatRelativeTime(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? "s" : ""} ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "").trim();
}

export default function Comments() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const articleIdParam = searchParams.get("article_id");

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [protectedDataRequired, setProtectedDataRequired] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [queryValue, setQueryValue] = useState("");
  const [statusFilter, setStatusFilter] = useState(["all"]);
  const [toast, setToast] = useState({ active: false, content: "", error: false });

  // Delete modal state
  const [deleteModalActive, setDeleteModalActive] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setProtectedDataRequired(false);
    setNetworkError(false);
    try {
      const queryParams = new URLSearchParams();
      if (queryValue) queryParams.append("search", queryValue);
      if (statusFilter[0] && statusFilter[0] !== "all") {
        queryParams.append("status", statusFilter[0]);
      }
      if (articleIdParam) {
        queryParams.append("article_id", articleIdParam);
      }
      
      const res = await window.fetch(`/api/comments?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data = await res.json();
      
      if (data.protectedDataRequired) {
        setProtectedDataRequired(true);
        setComments([]);
      } else {
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error("Comments fetch error:", err);
      setNetworkError(true);
      setToast({ active: true, content: "Network error loading comments", error: true });
    } finally {
      setLoading(false);
    }
  }, [queryValue, statusFilter, articleIdParam]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const getSuccessMessage = (action, count) => {
    const isPlural = count > 1;
    switch (action) {
      case "approve":
        return isPlural ? `${count} comments approved` : "Comment approved";
      case "spam":
        return isPlural ? `${count} comments marked as spam` : "Comment marked as spam";
      case "not_spam":
        return isPlural ? `${count} comments removed from spam` : "Comment removed from spam";
      case "delete":
        return isPlural ? `${count} comments deleted` : "Comment deleted";
      default:
        return "Comments updated successfully";
    }
  };

  const handleModerate = async (action, ids) => {
    setLoading(true);
    try {
      const res = await window.fetch("/api/comments/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to moderate comments");
      
      const successMsg = getSuccessMessage(action, ids.length);
      setToast({ active: true, content: successMsg, error: false });
      fetchComments();
    } catch (err) {
      console.error(err);
      setToast({ active: true, content: err.message || `Failed to update comments`, error: true });
      setLoading(false);
    }
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(comments);

  const performBulkAction = (action) => {
    handleModerate(action, selectedResources);
    clearSelection();
  };

  const promotedBulkActions = [
    {
      content: "Approve",
      onAction: () => performBulkAction("approve"),
    },
    {
      content: "Mark as spam",
      onAction: () => performBulkAction("spam"),
    },
    {
      content: "Unmark as spam",
      onAction: () => performBulkAction("not_spam"),
    },
    {
      content: "Delete",
      destructive: true,
      onAction: () => {
        setCommentToDelete({ isBulk: true });
        setDeleteModalActive(true);
      },
    },
  ];

  const itemTabs = [
    {
      id: "all",
      content: "All",
      panelID: "all-comments-panel",
    },
    {
      id: "pending",
      content: "Pending",
      panelID: "pending-comments-panel",
    },
    {
      id: "approved",
      content: "Approved",
      panelID: "approved-comments-panel",
    },
    {
      id: "spam",
      content: "Spam",
      panelID: "spam-comments-panel",
    },
  ];

  const [selectedTab, setSelectedTab] = useState(0);

  const handleTabSelect = useCallback((tabIndex) => {
    setSelectedTab(tabIndex);
    const tabId = itemTabs[tabIndex].id;
    if (tabId === "all") {
      setStatusFilter(["all"]);
    } else if (tabId === "pending") {
      setStatusFilter(["unapproved"]);
    } else if (tabId === "approved") {
      setStatusFilter(["published"]);
    } else if (tabId === "spam") {
      setStatusFilter(["spam"]);
    }
  }, []);

  useEffect(() => {
    const currentStatus = statusFilter[0];
    if (currentStatus === "all" || !currentStatus) {
      setSelectedTab(0);
    } else if (currentStatus === "unapproved" || currentStatus === "pending" || currentStatus === "not_approved") {
      setSelectedTab(1);
    } else if (currentStatus === "published" || currentStatus === "approved") {
      setSelectedTab(2);
    } else if (currentStatus === "spam") {
      setSelectedTab(3);
    }
  }, [statusFilter]);

  const handleQueryValueRemove = useCallback(() => setQueryValue(""), []);
  const handleClearAll = useCallback(() => {
    handleQueryValueRemove();
    setStatusFilter(["all"]);
    setSelectedTab(0);
  }, [handleQueryValueRemove]);

  const [mode, setMode] = useState(IndexFiltersMode.Filtering);
  
  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "All", value: "all" },
            { label: "Not Approved", value: "unapproved" },
            { label: "Approved", value: "published" },
            { label: "Spam", value: "spam" },
          ]}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = [];
  if (statusFilter[0] && statusFilter[0] !== "all") {
    appliedFilters.push({
      key: "status",
      label: `Status: ${statusFilter[0]}`,
      onRemove: () => setStatusFilter(["all"]),
    });
  }

  const rowMarkup = comments.map(
    ({ id, bodyHtml, author, status, createdAt, publishedAt, article }, index) => {
      const normalizedStatus = (status || "unapproved").toLowerCase();
      const badgeInfo = STATUS_BADGE_MAP[normalizedStatus] || { tone: "info", label: status || "Pending" };

      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={selectedResources.includes(id)}
          position={index}
        >
          {/* Comment body */}
          <IndexTable.Cell>
            <Box maxWidth="350px">
              <Text variant="bodyMd" as="span">
                {stripHtml(bodyHtml)}
              </Text>
            </Box>
          </IndexTable.Cell>

          {/* Comment by (Author Name & Email) */}
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Text fontWeight="semibold" as="span">
                {author?.name || "Anonymous"}
              </Text>
              {author?.email && (
                <Text variant="bodySm" tone="subdued" as="span">
                  {author.email}
                </Text>
              )}
            </BlockStack>
          </IndexTable.Cell>

          {/* Date */}
          <IndexTable.Cell>
            <Text variant="bodySm" tone="subdued" as="span">
              {formatRelativeTime(createdAt || publishedAt)}
            </Text>
          </IndexTable.Cell>

          {/* Blog post */}
          <IndexTable.Cell>
            <div style={{ maxWidth: 220, minWidth: 0 }}>
              <Text fontWeight="medium" as="span" truncate>
                {article?.title || "Unknown Article"}
              </Text>
            </div>
          </IndexTable.Cell>

          {/* Status */}
          <IndexTable.Cell>
            <Badge tone={badgeInfo.tone}>
              {badgeInfo.label}
            </Badge>
          </IndexTable.Cell>

          {/* Actions */}
          <IndexTable.Cell>
            <InlineStack gap="200" align="end">
              {normalizedStatus === "unapproved" || normalizedStatus === "not_approved" || normalizedStatus === "pending" ? (
                <Button size="micro" onClick={() => handleModerate("approve", [id])}>Approve</Button>
              ) : null}
              
              {normalizedStatus !== "spam" ? (
                <Button size="micro" onClick={() => handleModerate("spam", [id])}>Spam</Button>
              ) : (
                <Button size="micro" onClick={() => handleModerate("not_spam", [id])}>Not spam</Button>
              )}

              <CommentActionPopover
                onDelete={() => {
                  setCommentToDelete({ isBulk: false, id });
                  setDeleteModalActive(true);
                }}
              />
            </InlineStack>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    }
  );

  return (
    <Frame>
      <Page
        title="Comments"
        backAction={smartBackAction(navigate, location, "/posts", "Articles")}
        subtitle={articleIdParam ? "Filtered by specific article" : "Manage all article comments across your store"}
        fullWidth
      >
        <TitleBar title="Comments" />
        <Layout>
          {networkError && (
            <Layout.Section>
              <Banner
                title="Connection lost or network changed"
                tone="warning"
                action={{
                  content: "Retry Loading Comments",
                  onAction: fetchComments,
                }}
              >
                <p>The connection to the server was temporarily interrupted. Click retry to reload comments.</p>
              </Banner>
            </Layout.Section>
          )}

          {protectedDataRequired && (
            <Layout.Section>
              <Banner
                title="Shopify permission required: protected customer data access"
                tone="warning"
              >
                <BlockStack gap="200">
                  <Text as="p">
                    Shopify classifies blog comments as Protected Customer Data. To list and moderate comments in this embedded app, your app needs Protected Customer Data approval in the Shopify Partner Dashboard.
                  </Text>
                  <Text as="p" fontWeight="bold">
                    How to enable in 1 minute:
                  </Text>
                  <ol style={{ paddingLeft: "20px", margin: 0 }}>
                    <li>Open your <strong>Shopify Partner Dashboard</strong>.</li>
                    <li>Go to <strong>Apps</strong> &gt; Select <strong>Blogger React - Local</strong> (or your app) &gt; <strong>App setup</strong>.</li>
                    <li>Scroll down to <strong>Protected customer data access</strong>.</li>
                    <li>Click <strong>Select protected customer data fields</strong>, check <strong>Customer name, email and address</strong>, and click <strong>Save</strong>.</li>
                  </ol>
                </BlockStack>
              </Banner>
            </Layout.Section>
          )}

          {articleIdParam && (
            <Layout.Section>
              <Banner
                title="Showing comments for a single article"
                action={{
                  content: "Show All Comments",
                  onAction: () => navigate("/comments"),
                }}
                onDismiss={() => navigate("/comments")}
              >
                <p>You are viewing comments scoped to a specific blog article.</p>
              </Banner>
            </Layout.Section>
          )}

          <Layout.Section>
            <Card padding="0">
              <IndexFilters
                queryValue={queryValue}
                queryPlaceholder="Search comments or articles"
                onQueryChange={setQueryValue}
                onQueryClear={handleQueryValueRemove}
                onClearAll={handleClearAll}
                cancelAction={{
                  onAction: () => {},
                  disabled: false,
                  loading: false,
                }}
                tabs={itemTabs}
                selected={selectedTab}
                onSelect={handleTabSelect}
                canCreateNewView={false}
                filters={filters}
                appliedFilters={appliedFilters}
                mode={mode}
                setMode={setMode}
              />
              <IndexTable
                resourceName={{ singular: "comment", plural: "comments" }}
                itemCount={comments.length}
                selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                onSelectionChange={handleSelectionChange}
                promotedBulkActions={promotedBulkActions}
                headings={[
                  { title: "Comment" },
                  { title: "Comment by" },
                  { title: "Date" },
                  { title: "Blog post" },
                  { title: "Status" },
                  { title: "", alignment: "end" },
                ]}
                loading={loading}
                emptyState={
                  loading ? (
                    <EmptyState heading="Loading comments...">
                      <Spinner />
                    </EmptyState>
                  ) : networkError ? (
                    <EmptyState
                      heading="Unable to load comments"
                      action={{
                        content: "Retry",
                        onAction: fetchComments,
                      }}
                    >
                      <p>The network request was interrupted. Please click retry to reload.</p>
                    </EmptyState>
                  ) : (
                    <EmptyState heading="No comments found">
                      <p>There are no comments matching your request.</p>
                    </EmptyState>
                  )
                }
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>

        <Modal
          open={deleteModalActive}
          onClose={() => setDeleteModalActive(false)}
          title="Delete comments?"
          primaryAction={{
            content: "Delete",
            destructive: true,
            onAction: () => {
              if (commentToDelete?.isBulk) {
                performBulkAction("delete");
              } else if (commentToDelete?.id) {
                handleModerate("delete", [commentToDelete.id]);
              }
              setDeleteModalActive(false);
            },
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setDeleteModalActive(false),
            },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to delete {commentToDelete?.isBulk ? "these comments" : "this comment"}? This action cannot be undone.
            </Text>
          </Modal.Section>
        </Modal>
        
        {toast.active && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={() => setToast({ ...toast, active: false })}
          />
        )}
      </Page>
    </Frame>
  );
}

function CommentActionPopover({ onDelete }) {
  const [popoverActive, setPopoverActive] = useState(false);
  const togglePopoverActive = useCallback(() => setPopoverActive((active) => !active), []);

  return (
    <Popover
      active={popoverActive}
      activator={
        <Button
          variant="plain"
          icon={MenuHorizontalIcon}
          onClick={togglePopoverActive}
          accessibilityLabel="More actions"
        />
      }
      onClose={togglePopoverActive}
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
