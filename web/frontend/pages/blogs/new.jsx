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
  Button,
  PageActions,
  Frame
} from "@shopify/polaris";
import { EditIcon } from "@shopify/polaris-icons";

export default function NewBlog() {
  const navigate = useNavigate();

  const [blogData, setBlogData] = useState({
    title: "",
    handle: "",
    commentPolicy: "MODERATED",
    templateSuffix: "",
    seoTitle: "",
    seoDescription: ""
  });

  const [seoExpanded, setSeoExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const isDirty = blogData.title.trim().length > 0;

  const handleField = (field) => (value) => {
    setBlogData((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (window.shopify?.saveBar) {
      if (isDirty) {
        window.shopify.saveBar.show("blog-new-save-bar").catch(() => {});
      } else {
        window.shopify.saveBar.hide("blog-new-save-bar").catch(() => {});
      }
    }
    // Cleanup on unmount
    return () => {
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide("blog-new-save-bar").catch(() => {});
      }
    };
  }, [isDirty]);

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
      const res = await fetch("/api/posts/shopify/blogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(blogData)
      });
      const data = await res.json();
      if (res.ok) {
        if (window.shopify?.saveBar) {
          try { await window.shopify.saveBar.hide("blog-new-save-bar"); } catch (e) {}
        }
        showToast("Blog created successfully");
        navigate(`/blogs`);
      } else {
        if (window.shopify?.saveBar) {
          try { await window.shopify.saveBar.hide("blog-new-save-bar"); } catch (e) {}
        }
        showToast(data.error || "Failed to create blog", true);
      }
    } catch (err) {
      if (window.shopify?.saveBar) {
        try { await window.shopify.saveBar.hide("blog-new-save-bar"); } catch (e) {}
      }
      showToast("Network error", true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Frame>
      <Page
      backAction={{ content: "Blogs", onAction: () => navigate("/blogs") }}
      title="Add blog"
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
                    <TextField
                      label="URL handle"
                      value={blogData.handle}
                      onChange={handleField("handle")}
                      prefix="blogs/"
                      helpText={`https://${window.shopify?.config?.shop || "your-store.myshopify.com"}/blogs/${blogData.handle || ""}`}
                      autoComplete="off"
                    />
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
        <ui-save-bar id="blog-new-save-bar">
          <button
            variant="primary"
            onClick={handleSave}
            loading={isSaving ? "" : undefined}
            disabled={isSaving ? "" : undefined}
          >
            Save
          </button>
          <button onClick={() => {
            setBlogData({
              title: "",
              handle: "",
              commentPolicy: "MODERATED",
              templateSuffix: "",
              seoTitle: "",
              seoDescription: ""
            });
          }}>Discard</button>
        </ui-save-bar>
      )}

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
