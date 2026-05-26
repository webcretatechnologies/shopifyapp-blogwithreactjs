import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Page,
  Layout,
  Card,
  TextField,
  Select,
  Button,
  ButtonGroup,
  Badge,
  Banner,
  Toast,
  Frame,
  Spinner,
  Checkbox,
  Box,
  Text,
  InlineStack,
  BlockStack,
  Divider,
  Tag,
  Tooltip,
  Modal,
  ResourceList,
  ResourceItem,
  Thumbnail,
  DropZone,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import TiptapEditor from "../../components/editor/TiptapEditor";
import ShopifyFilePicker from "../../components/ShopifyFilePicker";

export default function PostEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [post, setPost] = useState({
    title: "",
    slug: "",
    excerpt: "",
    status: "draft",
    author: "",
    featuredImage: "",
    contentJson: [],
    customCss: "",
    productSliderPosition: "none",
  });
  const [contentHtml, setContentHtml] = useState("");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [shopifyBlogId, setShopifyBlogId] = useState("");
  const [shopifyBlogs, setShopifyBlogs] = useState([]);
  const [features, setFeatures] = useState({});
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFromShopify, setDeleteFromShopify] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);

  // Load existing post
  const loadPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${id}`);
      if (!res.ok) throw new Error("Post not found");
      const data = await res.json();
      setPost(data.post);
      setContentHtml(data.post.contentHtml || "");
      setTags(data.post.tags || []);
      setFeatures(data.features || {});
      setShopifyBlogId(data.post.shopifyArticle?.shopifyBlogId || "");
      setSelectedProducts(data.post.products || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // Load Shopify blogs and features
  const loadShopifyBlogs = async () => {
    try {
      const [blogsRes, featuresRes] = await Promise.all([
        fetch("/api/posts/shopify/blogs"),
        fetch("/api/posts/plan/features"),
      ]);
      const blogsData = await blogsRes.json();
      const featData = await featuresRes.json();
      setShopifyBlogs(blogsData.blogs || []);
      if (!isEditing) setFeatures(featData.features || {});
    } catch {}
  };

  useEffect(() => {
    loadShopifyBlogs();
    if (isEditing) loadPost();
  }, [isEditing, loadPost]);

  const handleField = (field) => (value) => setPost((p) => ({ ...p, [field]: value }));

  const generateSlug = (title) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

  const handleTitleChange = (value) => {
    setPost((p) => ({ ...p, title: value, slug: generateSlug(value) }));
  };

  const handleOpenPicker = async () => {
    if (!window.shopify?.resourcePicker) return;
    const selection = await window.shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: selectedProducts.map(p => ({ id: p.shopifyProductId })),
    });
    
    if (selection) {
      const products = selection.map((p) => ({
        shopifyProductId: p.id,
        title: p.title,
        handle: p.handle,
        image: p.images?.[0]?.originalSrc || null,
        price: p.variants?.[0]?.price || null,
        variantId: p.variants?.[0]?.id || null,
      }));
      setSelectedProducts(products);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t) => setTags((prev) => prev.filter((x) => x !== t));

  const handleImageUpload = async (file) => {
    setIsUploadingImage(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/posts/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setPost((p) => ({ ...p, featuredImage: data.url }));
        setToast({ content: "Image uploaded successfully" });
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDropZoneDrop = useCallback(
    (_dropFiles, acceptedFiles, _rejectedFiles) => {
      if (acceptedFiles.length > 0) {
        handleImageUpload(acceptedFiles[0]);
      }
    },
    []
  );

  const buildPayload = () => ({
    ...post,
    contentHtml,
    tags,
    blogId: shopifyBlogId || undefined,
    productSliderProducts: selectedProducts,
  });

  const handleSave = async (status) => {
    if (!post.title) {
      setError("Article title is required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = { ...buildPayload(), status: status || post.status };
      const url = isEditing ? `/api/posts/${id}` : "/api/posts";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      setToast({ content: "Article saved successfully" });
      if (!isEditing && data.post?.id) {
        navigate(`/posts/${data.post.id}/edit`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!shopifyBlogId) {
      setError("Please select a Shopify blog to publish to.");
      return;
    }
    setIsPublishing(true);
    setError(null);
    try {
      // First save
      await handleSave("published");

      const postId = id;
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId: shopifyBlogId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");

      setToast({ content: "Article published to Shopify! 🎉" });
      setPost((p) => ({ ...p, status: "published" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    setIsUnpublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${id}/unpublish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unpublish failed");

      setToast({ content: "Article unpublished from Shopify." });
      setPost((p) => ({ ...p, status: "draft" }));
      // Reload post to update shopifyArticle nested data
      loadPost();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUnpublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete this article?${deleteFromShopify ? " It will also be DELETED from Shopify." : ""} This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/posts/${id}?deleteFromShopify=${deleteFromShopify}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      navigate("/posts");
    } catch (err) {
      setError(err.message);
      setIsDeleting(false);
    }
  };

  const blogOptions = [
    { label: "— Select a blog —", value: "" },
    ...shopifyBlogs.map((b) => ({ label: b.title, value: String(b.id) })),
  ];

  const sliderPositionOptions = [
    { label: "None", value: "none" },
    { label: "Top of article", value: "top" },
    { label: "Bottom of article", value: "bottom" },
    { label: "Both", value: "both" },
  ];

  if (isLoading) {
    return (
      <Frame>
        <Page>
          <Box padding="800" align="center">
            <Spinner />
          </Box>
        </Page>
      </Frame>
    );
  }

  const statusBadge = post.status === "published"
    ? <Badge tone="success">Published</Badge>
    : <Badge tone="info">Draft</Badge>;

  return (
    <Frame>
      <TitleBar title={isEditing ? "Edit Article" : "New Article"} />
      {toast && (
        <Toast content={toast.content} onDismiss={() => setToast(null)} />
      )}
      <Page
        title={isEditing ? `Edit: ${post.title || "Article"}` : "New Article"}
        titleMetadata={statusBadge}
        backAction={{ content: "Articles", onAction: () => navigate("/") }}
        primaryAction={{
          content: isSaving ? "Saving..." : "Save Draft",
          loading: isSaving,
          onAction: () => handleSave("draft"),
        }}
        secondaryActions={[
          {
            content: isPublishing ? "Publishing..." : "Publish to Shopify",
            loading: isPublishing,
            onAction: handlePublish,
            tone: "success",
          },
        ]}
      >
        <Layout>
          {error && (
            <Layout.Section>
              <Banner tone="critical" onDismiss={() => setError(null)}>
                {error}
              </Banner>
            </Layout.Section>
          )}

          {/* ─── Main Content ───────────────────────────────────── */}
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <TextField
                    label="Article Title"
                    value={post.title}
                    onChange={handleTitleChange}
                    placeholder="Enter article title..."
                    autoComplete="off"
                  />
                  <TextField
                    label="URL Slug"
                    value={post.slug}
                    onChange={handleField("slug")}
                    prefix="/"
                    helpText="Auto-generated from title"
                    autoComplete="off"
                  />
                  <TextField
                    label="Excerpt / Meta Description"
                    value={post.excerpt || ""}
                    onChange={handleField("excerpt")}
                    multiline={3}
                    placeholder="Brief description for SEO..."
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">Content</Text>
                  <TiptapEditor
                    content={contentHtml}
                    onChange={setContentHtml}
                    placeholder="Write your article content here..."
                    uploadUrl="/api/posts/upload"
                  />
                </BlockStack>
              </Card>

              {/* Custom CSS (plan-gated) */}
              {features.custom_css?.enabled && (
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd">Custom CSS</Text>
                    <TextField
                      label=""
                      value={post.customCss || ""}
                      onChange={handleField("customCss")}
                      multiline={6}
                      placeholder="/* Add custom styles for this article */"
                      monospaced
                      autoComplete="off"
                    />
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>

          {/* ─── Sidebar ─────────────────────────────────────────── */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Publishing */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">Publishing</Text>
                  <Select
                    label="Status"
                    options={[
                      { label: "Draft", value: "draft" },
                      { label: "Published", value: "published" },
                    ]}
                    value={post.status}
                    onChange={handleField("status")}
                  />
                  <Select
                    label="Publish to Shopify Blog"
                    options={blogOptions}
                    value={shopifyBlogId}
                    onChange={setShopifyBlogId}
                    helpText="Select which Shopify blog to push this article to"
                  />
                  <ButtonGroup fullWidth>
                    <Button
                      onClick={() => handleSave("draft")}
                      loading={isSaving}
                    >
                      Save Draft
                    </Button>
                    <Button
                      variant="primary"
                      tone="success"
                      onClick={handlePublish}
                      loading={isPublishing}
                      disabled={!shopifyBlogId}
                    >
                      Publish
                    </Button>
                  </ButtonGroup>
                  {isEditing && post.status === "published" && (
                    <Button
                      fullWidth
                      onClick={handleUnpublish}
                      loading={isUnpublishing}
                      tone="critical"
                      variant="plain"
                    >
                      Unpublish from Shopify
                    </Button>
                  )}
                </BlockStack>
              </Card>

              {/* Article Settings */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">Article Settings</Text>
                  <TextField
                    label="Author"
                    value={post.author || ""}
                    onChange={handleField("author")}
                    autoComplete="off"
                  />
                  <BlockStack gap="200">
                    <Text variant="bodyMd">Featured Image</Text>
                    <DropZone onDrop={handleDropZoneDrop} allowMultiple={false} accept="image/*">
                      {isUploadingImage ? (
                        <Box padding="400" align="center">
                          <Spinner size="small" />
                        </Box>
                      ) : (
                        <DropZone.FileUpload />
                      )}
                    </DropZone>
                    <Button fullWidth onClick={() => setShowFilePicker(true)}>Browse Shopify Images</Button>
                    {post.featuredImage && (
                      <div style={{ position: "relative", marginTop: "8px" }}>
                        <img
                          src={post.featuredImage}
                          alt="Featured"
                          style={{ width: "100%", borderRadius: 8, maxHeight: 150, objectFit: "cover" }}
                        />
                        <div style={{ position: "absolute", top: 8, right: 8 }}>
                          <Button size="micro" onClick={() => handleField("featuredImage")("")} tone="critical">
                            Remove
                          </Button>
                        </div>
                      </div>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Tags */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd">Tags</Text>
                  <InlineStack gap="200">
                    {tags.map((tag) => (
                      <Tag key={tag} onRemove={() => removeTag(tag)}>{tag}</Tag>
                    ))}
                  </InlineStack>
                  <InlineStack gap="200">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label=""
                        labelHidden
                        value={tagInput}
                        onChange={setTagInput}
                        placeholder="Add tag..."
                        onKeyPress={(e) => e.key === "Enter" && addTag()}
                        autoComplete="off"
                      />
                    </div>
                    <Button onClick={addTag}>Add</Button>
                  </InlineStack>
                </BlockStack>
              </Card>

              {/* Product Slider (plan-gated) */}
              {features.product_slider?.enabled && (
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd">Product Slider</Text>
                    <Select
                      label="Slider Position"
                      options={sliderPositionOptions}
                      value={post.productSliderPosition}
                      onChange={handleField("productSliderPosition")}
                    />
                    {post.productSliderPosition !== "none" && (
                      <>
                        <Text tone="subdued" variant="bodySm">
                          {selectedProducts.length} products selected
                        </Text>
                        <Button
                          onClick={handleOpenPicker}
                          fullWidth
                        >
                          {selectedProducts.length ? "Change Products" : "Select Products"}
                        </Button>
                        {selectedProducts.length > 0 && (
                          <BlockStack gap="200">
                            {selectedProducts.slice(0, 3).map((p) => (
                              <InlineStack key={p.shopifyProductId || p.id} gap="200" blockAlign="center">
                                {p.image && <Thumbnail source={p.image} size="small" alt={p.title} />}
                                <Text variant="bodySm">{p.title}</Text>
                              </InlineStack>
                            ))}
                            {selectedProducts.length > 3 && (
                              <Text tone="subdued" variant="bodySm">+{selectedProducts.length - 3} more</Text>
                            )}
                          </BlockStack>
                        )}
                      </>
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* Shopify Sync Status */}
              {post.shopifyArticle && (
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd">Shopify Sync</Text>
                    <InlineStack gap="200" align="space-between">
                      <Text tone="subdued" variant="bodySm">Status</Text>
                      <Badge tone={post.shopifyArticle.status === "published" ? "success" : "attention"}>
                        {post.shopifyArticle.status}
                      </Badge>
                    </InlineStack>
                    {post.shopifyArticle.syncedAt && (
                      <Text tone="subdued" variant="bodySm">
                        Last synced: {new Date(post.shopifyArticle.syncedAt).toLocaleString()}
                      </Text>
                    )}
                  </BlockStack>
                </Card>
              )}

              {isEditing && (
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" tone="critical">Danger Zone</Text>
                    <Text tone="subdued" variant="bodySm">Delete this article entirely. This action is irreversible.</Text>
                    {post.status === "published" && (
                       <Checkbox
                         label="Also delete this article from my Shopify store"
                         checked={deleteFromShopify}
                         onChange={setDeleteFromShopify}
                       />
                    )}
                    <Button tone="critical" loading={isDeleting} onClick={handleDelete}>Delete Article</Button>
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>

      <ShopifyFilePicker
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={(url) => setPost(p => ({ ...p, featuredImage: url }))}
      />
    </Frame>
  );
}
