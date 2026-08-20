import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { TitleBar } from "@shopify/app-bridge-react";
import { smartBackAction } from "../../../utils/smartBack";
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
  const location = useLocation();
  const { id } = useParams();

  const [blogData, setBlogData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [seoExpanded, setSeoExpanded] = useState(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const saveBarRef = useRef(null);
  const saveBarId = "blog-edit-save-bar";
  // Skip the first run of the dirty-sync effect so the save bar can never
  // appear on a fresh page load — it only shows once the user actually edits.
  const isFirstRender = useRef(true);
  // Keep the latest handlers in refs so the save bar's raw DOM listeners
  // never call stale closures.
  const handleSaveRef = useRef(null);
  const handleDiscardRef = useRef(null);
  // Latest loaded data, for the bfcache restore handler (avoids re-subscribing
  // the window listener on every edit).
  const blogDataRef = useRef(null);
  blogDataRef.current = blogData;
  // Guards against duplicate save requests (e.g. the React onClick and the raw
  // DOM click listener both firing for a single click).
  const isSavingRef = useRef(false);

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
        // Store independent snapshots so blogData and originalData can never
        // drift apart (which would falsely mark the form as dirty on load).
        const snapshot = JSON.parse(JSON.stringify(data.blog));
        setBlogData(snapshot);
        setOriginalData(JSON.parse(JSON.stringify(snapshot)));
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

  const hideSaveBar = () => {
    if (window.shopify?.saveBar) {
      try {
        window.shopify.saveBar.hide(saveBarId);
      } catch (e) {}
    }
  };

  const showSaveBar = () => {
    if (window.shopify?.saveBar) {
      try {
        window.shopify.saveBar.show(saveBarId);
      } catch (e) {}
    }
  };

  const handleDiscard = () => {
    if (originalData) {
      setBlogData(JSON.parse(JSON.stringify(originalData)));
    }
    hideSaveBar();
  };
  handleDiscardRef.current = handleDiscard;

  // Sync the save bar visibility with the dirty state. The first render is
  // skipped so the bar never appears on mount / refresh — it is only shown
  // once the user actually makes a change.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isDirty) {
      showSaveBar();
    } else {
      hideSaveBar();
    }
  }, [isDirty]);

  // Reset the save bar once the blog has finished loading. On a refresh the
  // App Bridge may not have been ready for the very first hide() calls, so we
  // explicitly reset after the fetch settles to guarantee it stays hidden.
  useEffect(() => {
    if (!isLoading) {
      hideSaveBar();
    }
  }, [isLoading]);

  // Cleanup on unmount — never leave a save bar behind when navigating away.
  useEffect(() => {
    return () => {
      hideSaveBar();
    };
  }, []);

  // If the browser restores this page from its back/forward cache during a
  // refresh, re-fetch fresh data and hide the save bar so the page always
  // loads clean — the bar only reappears after the user actually edits.
  useEffect(() => {
    const onPageShow = (e) => {
      hideSaveBar();
      if (e.persisted && blogDataRef.current) {
        fetchBlog();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [fetchBlog]);

  // Wire up the save/discard events dispatched by the Shopify admin chrome.
  // The element only exists while isDirty, so (re)attach whenever it appears.
  // Handlers are always read from refs so they never go stale.
  useEffect(() => {
    const elem = saveBarRef.current;
    if (!elem) return;

    const onSave = () => { handleSaveRef.current(); };
    const onDiscard = () => { handleDiscardRef.current(); };
    const onClick = (e) => {
      const text = (e.target?.textContent || e.target?.innerText || "").toLowerCase();
      if (text.includes("discard")) {
        handleDiscardRef.current();
      } else if (text.includes("save")) {
        handleSaveRef.current();
      }
    };

    elem.addEventListener("save", onSave);
    elem.addEventListener("discard", onDiscard);
    elem.addEventListener("click", onClick);

    return () => {
      elem.removeEventListener("save", onSave);
      elem.removeEventListener("discard", onDiscard);
      elem.removeEventListener("click", onClick);
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
    if (isSavingRef.current) return;
    isSavingRef.current = true;
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
        hideSaveBar();
      } else {
        showToast(data.error || "Failed to update blog", true);
        hideSaveBar();
      }
    } catch (err) {
      showToast("Network error", true);
      hideSaveBar();
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };
  handleSaveRef.current = handleSave;

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
      <TitleBar title={blogData?.title || originalData?.title || "Edit blog"}>
        <button variant="breadcrumb" onClick={() => navigate("/blogs")}>
          Blogs
        </button>
      </TitleBar>
      {/* SaveBar is rendered ONLY while there are unsaved changes. Because the
          element does not exist in the DOM otherwise, it can never appear on a
          fresh page load or refresh. window.shopify.saveBar.show/hide stays in
          sync for the admin chrome. */}
      {isDirty && (
        <ui-save-bar id={saveBarId} ref={saveBarRef}>
          <button
            variant="primary"
            onClick={handleSave}
            loading={isSaving ? "" : undefined}
            disabled={isSaving ? "" : undefined}
          >
            Save
          </button>
          <button onClick={handleDiscard}>Discard</button>
        </ui-save-bar>
      )}

      <Page
      backAction={smartBackAction(navigate, location, "/blogs", "Blogs")}
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
