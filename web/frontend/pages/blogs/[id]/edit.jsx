import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Text,
  Box,
  InlineStack,
  Divider,
  RadioButton,
  Select,
  Toast,
  PageActions,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  Frame
} from "@shopify/polaris";
import { Modal, Button } from "@shopify/polaris";
import { EditIcon, DeleteIcon } from "@shopify/polaris-icons";

export default function EditBlog() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [blogData, setBlogData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [seoExpanded, setSeoExpanded] = useState(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmBlogName, setConfirmBlogName] = useState("");

  const fetchBlog = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/posts/shopify/blogs/${id}`);
      const data = await res.json();
      if (res.ok && data.blog) {
        setBlogData(data.blog);
        setOriginalData(JSON.parse(JSON.stringify(data.blog)));
      } else {
        setToastMessage({ content: "Blog not found", error: true });
        navigate("/blogs");
      }
    } catch (err) {
      setToastMessage({ content: "Error fetching blog", error: true });
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchBlog();
  }, [fetchBlog]);

  const isDirty = originalData && blogData && JSON.stringify(originalData) !== JSON.stringify(blogData);

  useEffect(() => {
    if (window.shopify?.saveBar) {
      if (isDirty) {
        window.shopify.saveBar.show("blog-edit-save-bar").catch(() => {});
      } else {
        window.shopify.saveBar.hide("blog-edit-save-bar").catch(() => {});
      }
    }
    // Cleanup on unmount
    return () => {
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide("blog-edit-save-bar").catch(() => {});
      }
    };
  }, [isDirty]);

  const handleField = (field) => (value) => {
    setBlogData((prev) => ({ ...prev, [field]: value }));
  };

  const showToast = useCallback((content, isError = false) => {
    if (window.shopify?.toast) {
      window.shopify.toast.show(content, { isError });
    } else {
      setToastMessage({ content, error: isError });
    }
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/posts/shopify/blogs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(blogData)
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Blog updated successfully");
        setOriginalData(JSON.parse(JSON.stringify(blogData)));
        if (window.shopify?.saveBar) {
          window.shopify.saveBar.hide("blog-edit-save-bar").catch(() => {});
        }
      } else {
        showToast(data.error || "Failed to update blog", true);
        if (window.shopify?.saveBar) {
          window.shopify.saveBar.hide("blog-edit-save-bar").catch(() => {});
        }
      }
    } catch (err) {
      showToast("Network error", true);
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide("blog-edit-save-bar").catch(() => {});
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/posts/shopify/blogs/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        showToast("Blog deleted successfully");
        navigate("/blogs");
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to delete blog", true);
      }
    } catch (err) {
      showToast("Network error", true);
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  if (isLoading || !blogData) {
    return (
      <SkeletonPage primaryAction>
        <Layout>
          <Layout.Section>
            <Card>
              <SkeletonBodyText lines={2} />
            </Card>
            <Card>
              <SkeletonBodyText lines={6} />
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <SkeletonBodyText lines={4} />
            </Card>
            <Card>
              <SkeletonBodyText lines={2} />
            </Card>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  return (
    <Frame>
      <Page
      backAction={{ content: "Blogs", onAction: () => navigate("/blogs") }}
      title={blogData?.title || originalData?.title || "Edit blog"}
      secondaryActions={[
        {
          content: "View",
          onAction: () => {
            const shopUrl = window.shopify?.config?.shop || "your-store.myshopify.com";
            window.open(`https://${shopUrl}/blogs/${blogData.handle || "news"}`, "_blank");
          }
        }
      ]}
      actionGroups={[
        {
          title: "More actions",
          actions: [
            {
              content: "Delete blog",
              destructive: true,
              icon: DeleteIcon,
              onAction: () => {
                setConfirmBlogName("");
                setIsDeleteModalOpen(true);
              }
            }
          ]
        }
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card padding="400">
              <TextField
                label="Title"
                value={blogData.title}
                onChange={handleField("title")}
                maxLength={255}
                showCharacterCount
                autoComplete="off"
              />
            </Card>

            <Card padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingSm">Search engine listing</Text>
                <Button 
                  variant="plain" 
                  icon={EditIcon} 
                  onClick={() => setSeoExpanded((v) => !v)}
                  accessibilityLabel="Edit search engine listing"
                />
              </InlineStack>

              <Box paddingBlockStart="400">
                <BlockStack gap="100">
                  <Text variant="bodyMd">
                    {window.shopify?.config?.shop ? window.shopify.config.shop.replace('.myshopify.com', '') : "Rajiv market shop"}
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    https://{window.shopify?.config?.shop || "your-store.myshopify.com"} › blogs › {blogData.handle || (blogData.title ? blogData.title.toLowerCase().replace(/\s+/g, '-') : "news")}
                  </Text>
                  <span style={{ color: '#005bd3', fontSize: '18px', paddingTop: '2px', display: 'block' }}>
                    {blogData.seoTitle || blogData.title || ""}
                  </span>
                  {blogData.seoDescription && (
                    <Text variant="bodySm" tone="subdued">
                      {blogData.seoDescription}
                    </Text>
                  )}
                </BlockStack>
              </Box>

              {seoExpanded && (
                <Box paddingBlockStart="400">
                  <BlockStack gap="400">
                    <TextField
                      label="Page title"
                      value={blogData.seoTitle}
                      onChange={handleField("seoTitle")}
                      maxLength={70}
                      showCharacterCount
                      autoComplete="off"
                    />
                    <TextField
                      label="Meta description"
                      value={blogData.seoDescription}
                      onChange={handleField("seoDescription")}
                      multiline={3}
                      maxLength={160}
                      showCharacterCount
                      autoComplete="off"
                    />
                    <div className="url-handle-field">
                      <style>{`
                        .url-handle-field .Polaris-TextField__Prefix {
                          margin-inline-end: 0px !important;
                          padding-inline-end: 0px !important;
                        }
                        .url-handle-field input.Polaris-TextField__Input {
                          padding-inline-start: 0px !important;
                        }
                      `}</style>
                      <TextField
                        label="URL handle"
                        value={blogData.handle}
                        onChange={handleField("handle")}
                        prefix="blogs/"
                        helpText={`https://${window.shopify?.config?.shop || "your-store.myshopify.com"}/blogs/${blogData.handle || ""}`}
                        autoComplete="off"
                      />
                    </div>
                  </BlockStack>
                </Box>
              )}
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card padding="400">
              <BlockStack gap="300">
                <Text variant="headingSm">Comments</Text>
                <BlockStack gap="200">
                  <RadioButton
                    label="Disabled"
                    checked={blogData.commentPolicy === "CLOSED" || blogData.commentPolicy === "DISABLED"}
                    id="CLOSED"
                    name="commentPolicy"
                    onChange={() => handleField("commentPolicy")("CLOSED")}
                  />
                  <RadioButton
                    label="Allowed, pending moderation"
                    checked={blogData.commentPolicy === "MODERATED"}
                    id="MODERATED"
                    name="commentPolicy"
                    onChange={() => handleField("commentPolicy")("MODERATED")}
                  />
                  <RadioButton
                    label="Allowed"
                    checked={blogData.commentPolicy === "AUTO_PUBLISHED" || blogData.commentPolicy === "ALLOWED"}
                    id="AUTO_PUBLISHED"
                    name="commentPolicy"
                    onChange={() => handleField("commentPolicy")("AUTO_PUBLISHED")}
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {isDirty && (
        <ui-save-bar id="blog-edit-save-bar">
          <button
            variant="primary"
            onClick={handleSave}
            loading={isSaving ? "" : undefined}
            disabled={isSaving ? "" : undefined}
          >
            Save
          </button>
          <button onClick={() => {
            if (originalData) setBlogData(JSON.parse(JSON.stringify(originalData)));
          }}>Discard</button>
        </ui-save-bar>
      )}

      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete blog?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDelete,
          loading: isDeleting,
          disabled: confirmBlogName !== originalData?.title
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setIsDeleteModalOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete this blog? This action cannot be undone, and will permanently delete all articles associated with it from Shopify.
          </Text>
          <div style={{ marginTop: '16px' }}>
            <Text as="p" tone="subdued">
              To confirm deletion, type <b>{originalData?.title}</b> below:
            </Text>
            <div style={{ marginTop: '8px' }}>
              <input
                type="text"
                value={confirmBlogName}
                onChange={(e) => setConfirmBlogName(e.target.value)}
                placeholder={originalData?.title}
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
