import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { TitleBar } from "@shopify/app-bridge-react";
import AiCreditTitleAction from "../../../components/AiCreditTitleAction";
import { smartBackAction } from "../../../utils/smartBack";
import PostThumbnail from "../../../components/common/PostThumbnail";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  TextField,
  Text,
  Badge,
  Button,
  Box,
  IndexTable,
  Toast,
  Frame,
  Modal,
  SkeletonPage,
  SkeletonBodyText,
} from "@shopify/polaris";

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const STATUS_TONE = {
  published: "success",
  scheduled: "attention",
  draft: "info",
  failed: "critical",
};

function formatUpdatedAt(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EditCategory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [category, setCategory] = useState(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [toastMessage, setToastMessage] = useState(null);
  const saveBarId = "category-edit-save-bar";
  const isSavingRef = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/categories/${id}`);
      const data = await res.json();
      if (!res.ok || !data.category) throw new Error(data.error || "Category not found");
      setCategory(data.category);
      setName(data.category.name);
      setSlug(data.category.slug);
    } catch (err) {
      // Skeleton below has no Toast — pass the error to the list page so it actually shows.
      navigate("/categories", {
        replace: true,
        state: { toast: { content: err.message || "Couldn't load category", error: true } },
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // Category creation lands here directly; consume its one-time success toast
  // from navigation state, then clear the state so it cannot reappear on refresh.
  useEffect(() => {
    const incoming = location.state?.toast;
    if (!incoming?.content) return;
    setToastMessage(incoming);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location, navigate]);

  const dirty = category && (name.trim() !== category.name || slug !== category.slug);

  const hideSaveBar = async () => {
    if (!window.shopify?.saveBar) return;
    try {
      await window.shopify.saveBar.hide(saveBarId);
    } catch (e) {}
  };

  const leaveCategory = async (destination, options) => {
    await hideSaveBar();
    navigate(destination, options);
  };

  const handleSave = async () => {
    if (isSavingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setToastMessage({ content: "Name is required", error: true });
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save category");
      setCategory({ ...category, ...data.category });
      setName(data.category.name);
      setSlug(data.category.slug);
      await hideSaveBar();
      setToastMessage({ content: "Category saved" });
    } catch (err) {
      setToastMessage({ content: err.message, error: true });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (category) {
      setName(category.name);
      setSlug(category.slug);
    }
    void hideSaveBar();
  };

  // Keep the custom element mounted at all times. Shopify's saveBar.show()/hide()
  // controls visibility; conditional mounting races that imperative call and can
  // leave the admin chrome stuck or missing after a field change.
  useEffect(() => {
    if (isLoading || !window.shopify?.saveBar) return;
    const action = dirty ? window.shopify.saveBar.show(saveBarId) : window.shopify.saveBar.hide(saveBarId);
    action?.catch(() => {});
  }, [dirty, isLoading]);

  useEffect(() => () => { void hideSaveBar(); }, []);

  const handleDelete = async () => {
    if (confirmName !== category?.name) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't delete category");
      await leaveCategory("/categories", {
        state: { toast: { content: `Deleted “${category.name}”` } },
      });
    } catch (err) {
      setToastMessage({ content: err.message, error: true });
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
      setConfirmName("");
    }
  };

  if (isLoading || !category) {
    return (
      <SkeletonPage primaryAction>
        <Layout>
          <Layout.Section>
            <Card>
              <SkeletonBodyText lines={4} />
            </Card>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  return (
    <Frame>
      <TitleBar title={category.name}>
        <AiCreditTitleAction />
        <button variant="breadcrumb" onClick={() => leaveCategory("/categories")}>
          Categories
        </button>
      </TitleBar>
      <ui-save-bar id={saveBarId}>
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined} disabled={isSaving ? "" : undefined}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </ui-save-bar>
      {dirty && !window.shopify && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, backgroundColor: "#1a1a1a", color: "#ffffff", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>Unsaved changes</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button onClick={handleDiscard}>Discard</Button>
            <Button variant="primary" loading={isSaving} onClick={handleSave}>Save</Button>
          </div>
        </div>
      )}
      {toastMessage && (
        <Toast
          content={toastMessage.content}
          error={toastMessage.error}
          onDismiss={() => setToastMessage(null)}
        />
      )}
      <Page
        title={category.name}
        backAction={smartBackAction(leaveCategory, location, "/categories", "Categories")}
        primaryAction={{
          content: "Save",
          onAction: handleSave,
          loading: isSaving,
          disabled: !dirty,
        }}
        secondaryActions={[
          {
            content: "Delete",
            destructive: true,
            onAction: () => {
              setConfirmName("");
              setDeleteOpen(true);
            },
          },
        ]}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Name"
                  value={name}
                  onChange={setName}
                  autoComplete="off"
                  maxLength={80}
                  showCharacterCount
                />
                <TextField
                  label="Category archive URL"
                  value={slug}
                  onChange={(v) => setSlug(slugify(v))}
                  autoComplete="off"
                  prefix="blogs/{blog-handle}/tagged/"
                  helpText="Changing the handle updates the Shopify tag on the next Save & Sync. Replace {blog-handle} with the handle of the blog that contains the article. Existing tagged archive URLs that used the old handle will stop matching until then."
                />
                <Text as="p" variant="bodySm" tone="subdued">
                  {category.postCount} post{category.postCount === 1 ? "" : "s"} assigned. Used
                  for related posts (Same category) and the sidebar Categories widget.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section>
            <Card padding="0">
              <Box padding="400" paddingBlockEnd="200">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">
                    Assigned posts
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {category.postCount === 0
                      ? "No articles are assigned to this category yet."
                      : `${category.postCount} article${category.postCount === 1 ? "" : "s"} assigned to this category.`}
                  </Text>
                </BlockStack>
              </Box>
              {category.posts?.length ? (
                <IndexTable
                  resourceName={{ singular: "article", plural: "articles" }}
                  itemCount={category.posts.length}
                  selectedItemsCount={0}
                  onSelectionChange={() => {}}
                  selectable={false}
                  headings={[{ title: "Article" }, { title: "Status" }, { title: "Last updated" }]}
                >
                  {category.posts.map((post, index) => (
                    <IndexTable.Row
                      id={String(post.id)}
                      key={post.id}
                      position={index}
                      onClick={() => navigate(`/posts/${post.id}/edit`)}
                    >
                      <IndexTable.Cell>
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <PostThumbnail src={post.featuredImage} alt="" />
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {post.title}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              /{post.slug}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={STATUS_TONE[post.status] || "info"}>
                          {post.status ? `${post.status.charAt(0).toUpperCase()}${post.status.slice(1)}` : "Draft"}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {formatUpdatedAt(post.updatedAt)}
                        </Text>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              ) : (
                <Box padding="400" paddingBlockStart="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Assign this category from an article editor to group related posts and show it in your storefront category archive.
                  </Text>
                </Box>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      <Modal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setConfirmName("");
        }}
        title={`Delete “${category.name}”?`}
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDelete,
          loading: isDeleting,
          disabled: confirmName !== category.name,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setDeleteOpen(false);
              setConfirmName("");
            },
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Posts keep their content but lose this category. Empty categories never appear in the
            sidebar.
          </Text>
          <div style={{ marginTop: 12 }}>
            <TextField
              label={
                <>
                  Type <Text as="span" fontWeight="bold">{category.name}</Text> to confirm
                </>
              }
              value={confirmName}
              onChange={setConfirmName}
              autoComplete="off"
            />
          </div>
        </Modal.Section>
      </Modal>
    </Frame>
  );
}
