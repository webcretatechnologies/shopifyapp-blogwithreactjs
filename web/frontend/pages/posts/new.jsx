import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { ViewIcon } from "@shopify/polaris-icons";
import confetti from "canvas-confetti";
import TiptapEditor from "../../components/editor/TiptapEditor";
import ShopifyFilePicker from "../../components/ShopifyFilePicker";
import ArticlePreview from "../../components/editor/ArticlePreview";
import SyncStatusIndicator from "../../components/SyncStatusIndicator.jsx";
import ConfirmActionModal from "../../components/ConfirmActionModal";


const parseHtmlToBlocks = (html) => {
  if (!html || html.trim() === "" || html === "undefined") return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const blocks = [];
  
  const appendTextBlock = (contentHtmlStr) => {
    if (!contentHtmlStr || contentHtmlStr.trim() === "") return;
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === "text") {
      lastBlock.content = (lastBlock.content || "") + contentHtmlStr;
    } else {
      blocks.push({
        id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "text",
        content: contentHtmlStr
      });
    }
  };

  const children = Array.from(doc.body.childNodes);
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim() !== "") {
        appendTextBlock(`<p>${node.textContent}</p>`);
      }
      continue;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const dataType = node.getAttribute("data-type");
      if (dataType) {
        const TYPE_MAP = {
          buyButton: 'buy_button',
          productGrid: 'product_grid',
          collection: 'collection',
          ctaButton: 'cta_button',
          heroBlock: 'hero',
          videoBlock: 'video',
          spacerBlock: 'spacer',
          dividerBlock: 'divider',
          imageBlock: 'image',
          product: 'product',
          product_sidebar: 'product_sidebar',
          featured_product: 'featured_product',
          product_switcher: 'product_switcher',
          product_slider: 'product_slider'
        };

        const ATTR_MAP = {
          buttontext: 'buttonText',
          buttoncolor: 'buttonColor',
          imagesize: 'imageSize',
          showprice: 'showPrice',
          showdescription: 'showDescription',
          showbadge: 'showBadge',
          product: 'product',
          layout: 'layout',
          version: 'version',
          title: 'title',
          columns: 'columns',
          maxproducts: 'maxProducts',
          cardstyle: 'cardStyle',
          gap: 'gap',
          showbutton: 'showButton',
          manualproducts: 'manualProducts',
          searchquery: 'searchQuery',
          collection: 'collection',
          limit: 'limit',
          text: 'text',
          url: 'url',
          align: 'align',
          color: 'color',
          textcolor: 'textColor',
          size: 'size',
          borderradius: 'borderRadius',
          heading: 'heading',
          subheading: 'subheading',
          backgroundimage: 'backgroundImage',
          backgroundoverlay: 'backgroundOverlay',
          overlaycolor: 'overlayColor',
          overlayopacity: 'overlayOpacity',
          minheight: 'minHeight',
          showcta: 'showCta',
          ctatext: 'ctaText',
          ctaurl: 'ctaUrl',
          ctacolor: 'ctaColor',
          ctatextcolor: 'ctaTextColor',
          caption: 'caption',
          aspectratio: 'aspectRatio',
          maxwidth: 'maxWidth',
          height: 'height',
          style: 'style',
          thickness: 'thickness',
          margin: 'margin',
          src: 'src',
          alt: 'alt',
          width: 'width',
          linkurl: 'linkUrl',
          titlealign: 'titleAlign'
        };

        const block = {
          id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: TYPE_MAP[dataType] || dataType
        };

        Array.from(node.attributes).forEach(attr => {
          if (attr.name.startsWith("data-")) {
            const key = attr.name.substring(5);
            if (key === "type") return;
            const mappedKey = ATTR_MAP[key] || key;
            let val = attr.value;
            if (val === "true") val = true;
            else if (val === "false") val = false;
            else if (val && (val.startsWith("{") || val.startsWith("["))) {
              try { val = JSON.parse(val); } catch (e) {}
            } else if (!isNaN(val) && val.trim() !== "" && key === "overlayopacity") {
              val = parseFloat(val);
            }
            block[mappedKey] = val;
          }
        });

        blocks.push(block);
        continue;
      }

      const tagName = node.tagName.toLowerCase();
      
      if (/^h[1-6]$/.test(tagName)) {
        blocks.push({
          id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "heading",
          content: node.innerHTML,
          level: tagName,
          align: node.style?.textAlign || "left",
          color: node.style?.color || "#202223"
        });
      } else if (tagName === "img") {
        blocks.push({
          id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "image",
          src: node.getAttribute("src") || "",
          alt: node.getAttribute("alt") || "",
          width: node.style?.width || "100%",
          caption: ""
        });
      } else if (tagName === "hr") {
        blocks.push({
          id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "divider",
          style: "solid",
          color: node.style?.borderTopColor || "#e1e3e5",
          margin: "20px"
        });
      } else if (tagName === "a" && (node.style?.display === "inline-block" || node.style?.padding)) {
        blocks.push({
          id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "cta_button",
          text: node.textContent || "Button",
          url: node.getAttribute("href") || "#",
          align: node.parentElement?.style?.textAlign || "center",
          color: node.style?.backgroundColor || "#008060",
          textColor: node.style?.color || "#fff"
        });
      } else if (tagName === "div" && node.style?.height) {
        blocks.push({
          id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "spacer",
          height: node.style?.height
        });
      } else if (tagName === "p" && node.innerHTML.includes("Product:")) {
        const text = node.textContent;
        const parts = text.split("Product:");
        const title = parts[1] ? parts[1].trim() : "Product";
        blocks.push({
          id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "product",
          title: title,
          shopifyProductId: "",
          image: "",
          price: "",
          handle: "",
          variantId: ""
        });
      } else if (tagName === "br") {
        continue;
      } else {
        appendTextBlock(node.outerHTML);
      }
    }
  }
  
  return blocks;
};

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
  const [originalPost, setOriginalPost] = useState(null);
  const [contentHtml, setContentHtml] = useState("");
  const [originalContentHtml, setOriginalContentHtml] = useState("");
  const contentHtmlSyncedRef = useRef(false);
  const isFirstRender = useRef(true);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [shopifyBlogId, setShopifyBlogId] = useState("");
  const [shopifyBlogs, setShopifyBlogs] = useState([]);
  const [features, setFeatures] = useState({});
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingHeader, setIsSavingHeader] = useState(false);
  const [isSavingSidebar, setIsSavingSidebar] = useState(false);
  const [isSavingSaveBar, setIsSavingSaveBar] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteFromShopify, setDeleteFromShopify] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showCongratsModal, setShowCongratsModal] = useState(false);
  const [newPostId, setNewPostId] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [seoData, setSeoData] = useState({
    metaTitle: "",
    metaDescription: "",
    canonicalUrl: "",
    ogTitle: "",
    ogDescription: "",
    ogImage: "",
  });

  // Load existing post
  const loadPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${id}`);
      if (!res.ok) throw new Error("Post not found");
      const data = await res.json();
      setPost(data.post);
      setOriginalPost(data.post);
      setContentHtml(data.post.contentHtml || "");
      setOriginalContentHtml(data.post.contentHtml || "");
      contentHtmlSyncedRef.current = false;
      setTags(data.post.tags || []);
      setFeatures(data.features || {});
      setShopifyBlogId(data.post.shopifyArticle?.shopifyBlogId || "");


      setSeoData({
        metaTitle: data.post.metaTitle || "",
        metaDescription: data.post.metaDescription || "",
        canonicalUrl: data.post.canonicalUrl || "",
        ogTitle: data.post.ogTitle || "",
        ogDescription: data.post.ogDescription || "",
        ogImage: data.post.ogImage || "",
      });
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

  const isFieldDirty = (val1, val2) => {
    const clean1 = val1 === null || val1 === undefined ? "" : val1;
    const clean2 = val2 === null || val2 === undefined ? "" : val2;
    return clean1 !== clean2;
  };

  const isDirty = useMemo(() => {
    if (!isEditing) {
      return (
        isFieldDirty(post.title, "") ||
        isFieldDirty(post.slug, "") ||
        isFieldDirty(post.excerpt, "") ||
        isFieldDirty(post.author, "") ||
        isFieldDirty(post.featuredImage, "") ||
        isFieldDirty(post.customCss, "") ||
        isFieldDirty(contentHtml, "") ||
        tags.length > 0 ||
        isFieldDirty(shopifyBlogId, "") ||
        isFieldDirty(seoData.metaTitle, "") ||
        isFieldDirty(seoData.metaDescription, "") ||
        isFieldDirty(seoData.canonicalUrl, "") ||
        isFieldDirty(seoData.ogTitle, "") ||
        isFieldDirty(seoData.ogDescription, "") ||
        isFieldDirty(seoData.ogImage, "")
      );
    }
    if (!originalPost) return false;
    const o = originalPost;
    const isPostDirty =
      isFieldDirty(post.title, o.title) ||
      isFieldDirty(post.slug, o.slug) ||
      isFieldDirty(post.excerpt, o.excerpt) ||
      isFieldDirty(post.author, o.author) ||
      isFieldDirty(post.featuredImage, o.featuredImage) ||
      isFieldDirty(post.customCss, o.customCss) ||
      isFieldDirty(contentHtml, originalContentHtml) ||
      isFieldDirty(shopifyBlogId, o.shopifyArticle?.shopifyBlogId) ||
      isFieldDirty(seoData.metaTitle, o.metaTitle) ||
      isFieldDirty(seoData.metaDescription, o.metaDescription) ||
      isFieldDirty(seoData.canonicalUrl, o.canonicalUrl) ||
      isFieldDirty(seoData.ogTitle, o.ogTitle) ||
      isFieldDirty(seoData.ogDescription, o.ogDescription) ||
      isFieldDirty(seoData.ogImage, o.ogImage);

    const originalTags = o.tags || [];
    const isTagsDirty =
      tags.length !== originalTags.length ||
      !tags.every((t) => originalTags.includes(t));

    return isPostDirty || isTagsDirty;
  }, [post, contentHtml, originalContentHtml, tags, shopifyBlogId, originalPost, isEditing, seoData]);

  const saveBarId = "post-editor-save-bar";

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (window.shopify?.saveBar) {
      if (isDirty) {
        window.shopify.saveBar.show(saveBarId).catch((e) => console.log("SaveBar show error:", e.message));
      } else {
        window.shopify.saveBar.hide(saveBarId).catch((e) => console.log("SaveBar hide error:", e.message));
      }
    }
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide(saveBarId).catch((e) => console.log("SaveBar clean-up hide error:", e.message));
      }
    };
  }, []);

  const handleField = (field) => (value) =>
    setPost((p) => ({ ...p, [field]: value }));

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

  const handleContentChange = useCallback((newHtml) => {
    setContentHtml(newHtml);
    if (!contentHtmlSyncedRef.current) {
      setOriginalContentHtml(newHtml);
      contentHtmlSyncedRef.current = true;
    }
  }, []);





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
    [],
  );

  const buildPayload = () => {
    return {
      ...post,
      contentHtml: contentHtml,
      contentJson: parseHtmlToBlocks(contentHtml),
      tags,
      blogId: shopifyBlogId || undefined,
      productSliderProducts: [],
      editorMode: "wysiwyg",
      ...seoData,
    };
  };

  const handleSave = async (status, source = "general") => {
    if (!post.title) {
      setError("Article title is required.");
      return;
    }
    if (source === "header") setIsSavingHeader(true);
    else if (source === "sidebar") setIsSavingSidebar(true);
    else if (source === "savebar") setIsSavingSaveBar(true);

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
        if (data.isFirstPost) {
          setNewPostId(data.post.id);
          setShowCongratsModal(true);
          // 🎉 Fire confetti!
          const duration = 3000;
          const end = Date.now() + duration;
          const frame = () => {
            confetti({
              particleCount: 5,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
              colors: ["#008060", "#00a97c", "#005bd3", "#f5a623", "#e44d26"],
            });
            confetti({
              particleCount: 5,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
              colors: ["#008060", "#00a97c", "#005bd3", "#f5a623", "#e44d26"],
            });
            if (Date.now() < end) requestAnimationFrame(frame);
          };
          frame();
        } else {
          navigate(`/posts/${data.post.id}/edit`);
        }
      } else if (!isEditing) {
         navigate(`/posts/${data.post.id}/edit`);
      } else {
         loadPost();
      }
      return data.post?.id || id;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsSaving(false);
      setIsSavingHeader(false);
      setIsSavingSidebar(false);
      setIsSavingSaveBar(false);
    }
  };

  const handleDiscard = () => {
    contentHtmlSyncedRef.current = false;
    if (isEditing && originalPost) {
      setPost(originalPost);
      setContentHtml(originalPost.contentHtml || "");
      setOriginalContentHtml(originalPost.contentHtml || "");
      setTags(originalPost.tags || []);
      setShopifyBlogId(originalPost.shopifyArticle?.shopifyBlogId || "");
      setSeoData({
        metaTitle: originalPost.metaTitle || "",
        metaDescription: originalPost.metaDescription || "",
        canonicalUrl: originalPost.canonicalUrl || "",
        ogTitle: originalPost.ogTitle || "",
        ogDescription: originalPost.ogDescription || "",
        ogImage: originalPost.ogImage || "",
      });
    } else {
      setPost({
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
      setContentHtml("");
      setOriginalContentHtml("");
      setTags([]);
      setShopifyBlogId("");
      setSeoData({
        metaTitle: "",
        metaDescription: "",
        canonicalUrl: "",
        ogTitle: "",
        ogDescription: "",
        ogImage: "",
      });
    }
  };

  const handlePreviewClick = async () => {
    setIsPreviewLoading(true);
    try {
      const res = await fetch("/api/posts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentHtml }),
      });
      const data = await res.json();
      if (data.contentHtml) {
        setPreviewHtml(data.contentHtml);
        setShowPreview(true);
      } else {
        setToast({ content: "Failed to generate preview" });
      }
    } catch (e) {
      console.error("Preview failed:", e);
      setToast({ content: "Error generating preview" });
    } finally {
      setIsPreviewLoading(false);
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
      const savedPostId = await handleSave("published");
      const postId = id || savedPostId;
      if (!postId) return; // if save failed
      
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

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteArticle = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/posts/${id}?deleteFromShopify=${deleteFromShopify}`,
        { method: "DELETE" },
      );
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



  if (isLoading) {
    return (
      <Frame>
        <Page fullWidth>
          <Box padding="800" align="center">
            <Spinner />
          </Box>
        </Page>
      </Frame>
    );
  }

  const statusBadge =
    post.status === "published" ? (
      <Badge tone="success">Published</Badge>
    ) : (
      <Badge tone="info">Draft</Badge>
    );

  return (
    <Frame>
      <ui-save-bar id={saveBarId}>
        <button
          variant="primary"
          onClick={() => handleSave(post.status === "published" ? "published" : "draft", "savebar")}
          loading={isSavingSaveBar ? "" : undefined}
        >
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </ui-save-bar>
      <TitleBar title={isEditing ? `Edit: ${post.title || "Article"}` : "New Article"}>
        <button variant="breadcrumb" onClick={() => navigate("/")}>
          Articles
        </button>
        <button
          variant="primary"
          onClick={() => handleSave(post.status === "published" ? "published" : "draft", "header")}
          disabled={isSaving}
        >
          {isSavingHeader ? "Saving..." : (post.status === "published" ? "Save & Sync" : "Save Draft")}
        </button>
        {isEditing && (
          <button onClick={() => navigate(`/posts/${id}/translate`)}>
            Translate Article
          </button>
        )}
        <button onClick={handlePreviewClick} disabled={isPreviewLoading}>
          {isPreviewLoading ? "Loading Preview..." : "Preview"}
        </button>
        {post.status === "published" ? (
          <button onClick={handleUnpublish} disabled={isUnpublishing}>
            {isUnpublishing ? "Unpublishing..." : "Unpublish"}
          </button>
        ) : (
          <button onClick={handlePublish} disabled={isPublishing || !shopifyBlogId}>
            {isPublishing ? "Publishing..." : "Publish to Shopify"}
          </button>
        )}
        {post.status === "published" && (
          <button
            onClick={() => {
              const shopUrl = `https://${window.shopify?.config?.shop || ""}`;
              window.open(`${shopUrl}/blogs/news/${post.handle}`, "_blank");
            }}
          >
            View on Storefront
          </button>
        )}
      </TitleBar>
      {toast && (
        <Toast content={toast.content} onDismiss={() => setToast(null)} />
      )}
      <Page
        fullWidth
        title={isEditing ? `Edit: ${post.title || "Article"}` : "New Article"}
        titleMetadata={statusBadge}
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
              {/* Article Details */}
              <Card>
                <Box padding="500">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Article Details</Text>
                    <Divider />
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
                  </BlockStack>
                </Box>
              </Card>

              {/* Content Card */}
              <Card>
                <Box padding="500">
                  <BlockStack gap="300">
                    <Text variant="headingMd">Content</Text>
                    <Divider />
                    <TiptapEditor
                      content={contentHtml}
                      onChange={handleContentChange}
                      placeholder="Write your article content here..."
                      uploadUrl="/api/posts/upload"
                    />
                  </BlockStack>
                </Box>
              </Card>


              {/* Custom CSS (plan-gated) */}
              {features.custom_css?.enabled && (
                <Card>
                  <Box padding="500">
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
                  </Box>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>

          {/* ─── Sidebar ─────────────────────────────────────────── */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              
              {/* Publishing */}
              <Card>
                <Box padding="500">
                  <BlockStack gap="300">
                    <Text variant="headingMd">Publishing</Text>
                    <Divider />
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
                    {post.status === "published" ? (
                      <BlockStack gap="200">
                        <Button
                          variant="primary"
                          onClick={() => handleSave("published", "sidebar")}
                          loading={isSavingSidebar}
                          disabled={isSaving && !isSavingSidebar}
                          fullWidth
                        >
                          Save & Sync
                        </Button>
                        <Button
                          tone="critical"
                          onClick={handleUnpublish}
                          loading={isUnpublishing}
                          disabled={isSaving || isUnpublishing}
                          fullWidth
                        >
                          Unpublish
                        </Button>
                      </BlockStack>
                    ) : (
                      <BlockStack gap="200">
                        <Button
                          onClick={() => handleSave("draft", "sidebar")}
                          loading={isSavingSidebar}
                          disabled={isSaving && !isSavingSidebar}
                          fullWidth
                        >
                          Save Draft
                        </Button>
                        <Button
                          variant="primary"
                          tone="success"
                          onClick={handlePublish}
                          loading={isPublishing}
                          disabled={isSaving || isPublishing || !shopifyBlogId}
                          fullWidth
                        >
                          Publish
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                </Box>
              </Card>

              {/* Organization & Settings */}
              <Card>
                <Box padding="500">
                  <BlockStack gap="400">
                    <Text variant="headingMd">Organization & settings</Text>
                    <Divider />
                    
                    <TextField
                      label="Author"
                      value={post.author || ""}
                      onChange={handleField("author")}
                      autoComplete="off"
                    />

                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold">Featured Image</Text>
                      <DropZone
                        onDrop={handleDropZoneDrop}
                        allowMultiple={false}
                        accept="image/*"
                      >
                        {isUploadingImage ? (
                          <Box padding="400" align="center">
                            <Spinner size="small" />
                          </Box>
                        ) : (
                          <DropZone.FileUpload />
                        )}
                      </DropZone>
                      <Button fullWidth onClick={() => setShowFilePicker(true)}>
                        Browse Shopify Images
                      </Button>
                      {post.featuredImage && (
                        <div style={{ position: "relative", marginTop: "8px" }}>
                          <img
                            src={post.featuredImage}
                            alt="Featured"
                            style={{
                              width: "100%",
                              borderRadius: 8,
                              maxHeight: 150,
                              objectFit: "cover",
                            }}
                          />
                          <div style={{ position: "absolute", top: 8, right: 8 }}>
                            <Button
                              size="micro"
                              onClick={() => handleField("featuredImage")("")}
                              tone="critical"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      )}
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold">Tags</Text>
                      {tags.length > 0 && (
                        <InlineStack gap="200">
                          {tags.map((tag) => (
                            <Tag key={tag} onRemove={() => removeTag(tag)}>
                              {tag}
                            </Tag>
                          ))}
                        </InlineStack>
                      )}
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
                  </BlockStack>
                </Box>
              </Card>



              {/* Shopify Sync Status — real-time indicator */}
              <SyncStatusIndicator
                postId={post.id}
                postTitle={post.title}
                initialArticle={post.shopifyArticle}
              />

              {isEditing && (
                <div style={{
                  border: "1px solid var(--p-color-border-critical, #fd8888)",
                  backgroundColor: "var(--p-color-bg-surface-critical-subdued, #fff5f5)",
                  borderRadius: "8px",
                  padding: "16px"
                }}>
                  <BlockStack gap="200">
                    <Text variant="headingMd" tone="critical">
                      Danger Zone
                    </Text>
                    <Text tone="subdued" variant="bodySm">
                      Delete this article entirely. This action is irreversible.
                    </Text>
                    {post.status === "published" && (
                      <Checkbox
                        label="Also delete this article from my Shopify store"
                        checked={deleteFromShopify}
                        onChange={setDeleteFromShopify}
                      />
                    )}
                    <Button
                      tone="critical"
                      loading={isDeleting}
                      onClick={handleDelete}
                    >
                      Delete Article
                    </Button>
                  </BlockStack>
                </div>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>

        <ShopifyFilePicker
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={(url) => setPost((p) => ({ ...p, featuredImage: url }))}
      />      {/* ─── Delete Confirmation Modal ─── */}
      <ConfirmActionModal
        open={showDeleteConfirm}
        title="Delete this article?"
        body={
          <Text as="p" variant="bodyMd">
            This article will be permanently deleted from the app.{" "}
            <strong>This cannot be undone.</strong>
          </Text>
        }
        confirmText="Delete article"
        confirmTone="critical"
        onConfirm={confirmDeleteArticle}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteFromShopify(false);
        }}
        loading={isDeleting}
        checkbox={
          post.status === "published" || post.shopifyArticle?.status === "published"
            ? {
                label:
                  "Also delete this article permanently from my Shopify store",
                checked: deleteFromShopify,
                onChange: setDeleteFromShopify,
              }
            : undefined
        }
      />

      {showPreview && (
        <ArticlePreview  
          open={showPreview}
          onClose={() => setShowPreview(false)}
          title={post.title}
          author={post.author}
          featuredImage={post.featuredImage}
          contentHtml={previewHtml || contentHtml}
        />
      )}

      <Modal
        open={showCongratsModal}
        onClose={() => {
          setShowCongratsModal(false);
          if (newPostId) {
            navigate(`/posts/${newPostId}/edit`);
          }
        }}
        title="🎉 Congratulations!"
        primaryAction={{
          content: "Start Editing",
          onAction: () => {
            setShowCongratsModal(false);
            if (newPostId) {
              navigate(`/posts/${newPostId}/edit`);
            }
          },
        }}
      >
        <Modal.Section>
          <BlockStack gap="400" align="center">
            <div style={{ fontSize: "50px", textAlign: "center" }}>🏆</div>
            <Text variant="headingLg" as="h2" alignment="center">
              You've created your first blog post!
            </Text>
            <Text variant="bodyMd" as="p" alignment="center" tone="subdued">
              Amazing job! Your first blog post has been successfully created.
              You can now publish it to your store, add products to it, or keep
              editing the content.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Frame>
  );
}
