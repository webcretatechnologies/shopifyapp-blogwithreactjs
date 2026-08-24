import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  BlockStack,
  Text,
  Badge,
  Button,
  InlineStack,
  EmptyState,
  Spinner,
  Box,
  Divider,
  Popover,
  ActionList,
  Modal,
  Collapsible,
  Banner,
  Toast
} from "@shopify/polaris";
import { MenuHorizontalIcon, ChevronDownIcon, ChevronUpIcon, ExternalIcon } from "@shopify/polaris-icons";

const STATUS_BADGE_MAP = {
  published: { tone: "success", label: "Approved" },
  approved: { tone: "success", label: "Approved" },
  pending: { tone: "warning", label: "Not Approved" },
  unapproved: { tone: "warning", label: "Not Approved" },
  not_approved: { tone: "warning", label: "Not Approved" },
  spam: { tone: "critical", label: "Spam" },
};

export default function ArticleComments({ articleId }) {
  const navigate = useNavigate();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [protectedDataRequired, setProtectedDataRequired] = useState(false);
  const [toast, setToast] = useState({ active: false, content: "", error: false });

  // Delete modal state
  const [deleteModalActive, setDeleteModalActive] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState(null);

  const fetchComments = useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    setProtectedDataRequired(false);
    try {
      const res = await window.fetch(`/api/comments?article_id=${articleId}`);
      if (!res.ok) throw new Error("Failed to fetch article comments");
      const data = await res.json();
      if (data.protectedDataRequired) {
        setProtectedDataRequired(true);
        setComments([]);
      } else {
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    if (open) {
      fetchComments();
    }
  }, [fetchComments, open]);

  // Initial fetch to get count if not open
  useEffect(() => {
    if (articleId && !open && comments.length === 0) {
      fetchComments();
    }
  }, [articleId]);

  const getSuccessMessage = (action) => {
    switch (action) {
      case "approve":
        return "Comment approved";
      case "spam":
        return "Comment marked as spam";
      case "not_spam":
        return "Comment removed from spam";
      case "delete":
        return "Comment deleted";
      default:
        return "Comment updated successfully";
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
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to moderate comment");
      
      setToast({ active: true, content: getSuccessMessage(action), error: false });
      fetchComments();
    } catch (err) {
      console.error(err);
      setToast({ active: true, content: err.message || "Failed to update comment", error: true });
      setLoading(false);
    }
  };

  const handleToggle = useCallback(() => setOpen((o) => !o), []);

  if (!articleId) return null; // Don't show if not synced to Shopify

  const pendingCount = comments.filter(c => {
    const s = (c.status || "").toLowerCase();
    return s === "unapproved" || s === "not_approved" || s === "pending";
  }).length;

  return (
    <Card padding="0">
      <Box padding="400">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <Text variant="headingMd" as="h2">Comments</Text>
              {pendingCount > 0 ? (
                <Badge tone="warning">{pendingCount} pending</Badge>
              ) : (
                <Badge tone="info">{comments.length} total</Badge>
              )}
            </InlineStack>
            <Button
              variant="plain"
              icon={open ? ChevronUpIcon : ChevronDownIcon}
              onClick={handleToggle}
              accessibilityLabel={open ? "Hide comments" : "Show comments"}
            />
          </InlineStack>

          <Button
            size="micro"
            variant="tertiary"
            icon={ExternalIcon}
            onClick={() => navigate(`/comments?article_id=${articleId}`)}
          >
            Manage Comments Page
          </Button>
        </BlockStack>
      </Box>

      <Collapsible open={open} id="article-comments-collapsible" transition={{ duration: "200ms", timingFunction: "ease-in-out" }}>
        <Divider />
        <Box padding="400">
          {protectedDataRequired ? (
            <Banner tone="warning" title="Protected Customer Data permission required">
              <Text as="p">
                To manage comments, please enable "Protected customer data access" in your Shopify Partner Dashboard under App Setup.
              </Text>
            </Banner>
          ) : loading && comments.length === 0 ? (
            <BlockStack inlineAlign="center" padding="400">
              <Spinner size="small" />
            </BlockStack>
          ) : comments.length === 0 ? (
            <EmptyState
              heading="No comments yet"
              image=""
            >
              <Text variant="bodyMd" tone="subdued">There are no comments on this article.</Text>
            </EmptyState>
          ) : (
            <BlockStack gap="400">
              {comments.map((comment, index) => {
                const normalizedStatus = (comment.status || "unapproved").toLowerCase();
                const badgeInfo = STATUS_BADGE_MAP[normalizedStatus] || { tone: "info", label: comment.status || "Pending" };
                return (
                  <React.Fragment key={comment.id}>
                    {index > 0 && <Divider />}
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text fontWeight="semibold" as="span">{comment.author?.name || "Customer"}</Text>
                          {comment.author?.email && (
                            <Text variant="bodySm" tone="subdued" as="span">{comment.author.email}</Text>
                          )}
                        </BlockStack>
                        <Badge tone={badgeInfo.tone}>
                          {badgeInfo.label}
                        </Badge>
                      </InlineStack>
                      
                      <Box>
                        <div
                          style={{
                            fontSize: "14px",
                            color: "var(--p-color-text)",
                            wordBreak: "break-word"
                          }}
                          dangerouslySetInnerHTML={{ __html: comment.bodyHtml }} 
                        />
                      </Box>
                      
                      <InlineStack gap="200" align="end">
                        {(normalizedStatus === "unapproved" || normalizedStatus === "not_approved" || normalizedStatus === "pending") && (
                          <Button size="micro" onClick={() => handleModerate("approve", [comment.id])}>Approve</Button>
                        )}
                        {normalizedStatus !== "spam" ? (
                          <Button size="micro" onClick={() => handleModerate("spam", [comment.id])}>Spam</Button>
                        ) : (
                          <Button size="micro" onClick={() => handleModerate("not_spam", [comment.id])}>Not spam</Button>
                        )}
                        <CommentActionPopover
                          onDelete={() => {
                            setCommentToDelete(comment.id);
                            setDeleteModalActive(true);
                          }}
                        />
                      </InlineStack>
                    </BlockStack>
                  </React.Fragment>
                );
              })}
            </BlockStack>
          )}
        </Box>
      </Collapsible>

      <Modal
        open={deleteModalActive}
        onClose={() => setDeleteModalActive(false)}
        title="Delete comment?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: () => {
            if (commentToDelete) {
              handleModerate("delete", [commentToDelete]);
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
            Are you sure you want to delete this comment? This action cannot be undone.
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
    </Card>
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
