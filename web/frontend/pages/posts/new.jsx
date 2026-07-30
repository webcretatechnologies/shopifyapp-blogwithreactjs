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
  Icon,
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
  RadioButton,
  Collapsible,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { ViewIcon, ChevronDownIcon, ChevronUpIcon, ImageIcon, EditIcon } from "@shopify/polaris-icons";
import confetti from "canvas-confetti";
import DragDropBuilderContainer from "../../components/builder/DragDropBuilderContainer";
import { compileBlocksToHtml } from "../../utils/compileBlocksToHtml";
import ShopifyFilePicker from "../../components/ShopifyFilePicker";
import ArticlePreview from "../../components/editor/ArticlePreview";
import SyncStatusIndicator from "../../components/SyncStatusIndicator.jsx";
import ConfirmActionModal from "../../components/ConfirmActionModal";
import { useBuilderStore } from "../../components/builder/store/useBuilderStore";
import { normalizeBlocksAst } from "../../components/builder/BlockRegistry";



const hasMeaningfulBlocks = (blocks) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  return blocks.some((b) => {
    if (!b) return false;
    if (b.type === "RichText") {
      const c = b.settings?.content;
      if (!c) return false;
      if (typeof c === "string") return c.replace(/<[^>]*>/g, "").trim().length > 0;
      if (typeof c === "object" && Array.isArray(c.content)) {
        return c.content.some((n) => n.content?.length > 0 || (n.text && n.text.trim() !== "") || n.type !== "paragraph");
      }
      return false;
    }
    if (b.type === "Heading") return !!b.settings?.text;
    if (Array.isArray(b.children) && b.children.length > 0) return hasMeaningfulBlocks(b.children);
    return true; // any other block type (ProductGrid, BuyButton, Image, etc.) counts as content
  });
};

const legacyHtmlToAst = (html) => {
  if (!html || html.trim() === "" || html === "undefined") return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const blocks = [];
  
  const appendTextBlock = (contentHtmlStr) => {
    if (!contentHtmlStr || contentHtmlStr.trim() === "") return;
    const cleanText = contentHtmlStr.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
    const containsMedia = /<(img|iframe|table|video|svg|input|button)/i.test(contentHtmlStr);
    if (!cleanText && !containsMedia) return;

    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && (lastBlock.type === "RichText" || lastBlock.type === "text")) {
      lastBlock.type = "RichText";
      lastBlock.settings = lastBlock.settings || {};
      lastBlock.settings.content = (lastBlock.settings.content || "") + contentHtmlStr;
    } else {
      blocks.push({
        id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "RichText",
        settings: {
          content: contentHtmlStr
        }
      });
    }
  };

  let rootContainer = doc.body;
  if (
    doc.body.children.length === 1 &&
    doc.body.children[0].tagName === "DIV" &&
    (doc.body.children[0].classList.contains("tiptap-content") ||
     doc.body.children[0].classList.contains("builder-post") ||
     doc.body.children[0].classList.contains("article-content"))
  ) {
    rootContainer = doc.body.children[0];
  }

  const children = Array.from(rootContainer.childNodes);
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim() !== "") {
        appendTextBlock(node.textContent); // Let Tiptap handle text nodes normally
      }
      continue;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const dataType = node.getAttribute("data-type");
      if (dataType) {
        const TYPE_MAP = {
          buyButton: 'BuyButton',
          buy_button: 'BuyButton',
          productGrid: 'ProductGrid',
          product_grid: 'ProductGrid',
          collection: 'Collection',
          ctaButton: 'ButtonBlock',
          cta_button: 'ButtonBlock',
          heroBlock: 'HeroSection',
          hero: 'HeroSection',
          videoBlock: 'VideoEmbed',
          video: 'VideoEmbed',
          spacerBlock: 'Spacer',
          spacer: 'Spacer',
          dividerBlock: 'Divider',
          divider: 'Divider',
          imageBlock: 'Image',
          image: 'Image',
          heading: 'Heading',
          calloutBlock: 'Callout',
          callout: 'Callout',
          buttonBlock: 'ButtonBlock',
          htmlBlock: 'Html',
          html: 'Html',
          product_slider: 'ProductSlider',
          productSlider: 'ProductSlider',
          productCard: 'ProductCard',
          product: 'ProductCard'
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

        const blockType = TYPE_MAP[dataType] || dataType;
        const settings = {};

        Array.from(node.attributes).forEach(attr => {
          if (attr.name.startsWith("data-")) {
            const key = attr.name.substring(5);
            if (key === "type") return;
            const camelKey = attr.name.substring(5).split('-').map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.substring(1)).join('');
            const mappedKey = ATTR_MAP[key] || camelKey;
            let val = attr.value;
            if (val === "true") val = true;
            else if (val === "false") val = false;
            else if (val && (val.startsWith("{") || val.startsWith("["))) {
              try { val = JSON.parse(val); } catch (e) {}
            } else if (!isNaN(val) && val.trim() !== "" && key === "overlayopacity") {
              val = parseFloat(val);
            }
            settings[mappedKey] = val;
          }
        });

        const block = {
          id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: blockType,
          settings: settings
        };

        blocks.push(block);
        continue;
      }

      const tagName = node.tagName.toLowerCase();
      if (["style", "script", "meta", "link"].includes(tagName)) continue;

      const hasBuilderBlocks = node.querySelector("[data-type]");
      if (!hasBuilderBlocks) {
        appendTextBlock(node.outerHTML);
        continue;
      }

      // If it has builder blocks nested inside, we just process children recursively
      // (This is highly unlikely for pure HTML but safe to have)
      Array.from(node.childNodes).forEach(child => {
        // We'll just push it recursively, but since we are in a flat loop, 
        // we can just recursively call a helper or let it be.
        // For simplicity, if a wrapper contains builder blocks, we extract them.
        const extractBlocks = (n) => {
          if (n.nodeType === Node.ELEMENT_NODE && n.getAttribute("data-type")) {
             // We could recursively parse, but for now let's just append the outer HTML if we can't.
             // Actually, the loop above was flat. Let's just append the outerHTML to be safe
             // since legacyHtmlToAst doesn't do deep recursion well without a dedicated function.
          }
        };
        // Just append the node's outerHTML for now if we don't have deep traversal set up.
        // Actually, if it has a data-type somewhere inside, we should probably just extract it.
      });
      // To keep it simple and robust, just use outerHTML if it's not a direct block. 
      // Builder blocks shouldn't be deeply nested in legacy content anyway.
      if (hasBuilderBlocks) {
         // This is a rare edge case: a wrapper div without data-type containing a data-type block.
         // We will just append the outerHTML. If they really want the block, they can recreate it.
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
    editorMode: "builder", // Default to builder instead of wysiwyg
  });
  const [originalPost, setOriginalPost] = useState(null);
  
  // contentHtml is now purely for backend sync and legacy loads.
  const [contentHtml, setContentHtml] = useState("");
  const [originalContentHtml, setOriginalContentHtml] = useState("");
  
  
  // Track structural edits made in either editor mode
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
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
  const [seoExpanded, setSeoExpanded] = useState(false);
  const [excerptExpanded, setExcerptExpanded] = useState(false);

  // Load existing post
  const loadPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${id}`);
      if (!res.ok) throw new Error("Post not found");
      const data = await res.json();
      
      // Safely parse contentJson if stringified
      let initialJson = data.post.contentJson;
      if (typeof initialJson === "string") {
        try {
          initialJson = JSON.parse(initialJson);
        } catch (e) {
          initialJson = null;
        }
      }
      let initialMode = data.post.editorMode || "builder";
      
      let normalizedBlocks = normalizeBlocksAst(initialJson || []);

      if (!hasMeaningfulBlocks(normalizedBlocks) && data.post.contentHtml && data.post.contentHtml.trim() !== "") {
        initialJson = legacyHtmlToAst(data.post.contentHtml);
        normalizedBlocks = normalizeBlocksAst(initialJson || []);
      }

      const p = {
        title: data.post.title || "",
        slug: data.post.slug || "",
        excerpt: data.post.excerpt || "",
        status: data.post.status || "draft",
        author: data.post.author || "",
        featuredImage: data.post.featuredImage || "",
        contentJson: normalizedBlocks,
        customCss: data.post.customCss || "",
        productSliderPosition: data.post.productSliderPosition || "none",
        editorMode: initialMode,
        shopifyArticle: data.post.shopifyArticle || null,
      };

      setPost(p);
      setOriginalPost(p);
      setContentHtml(data.post.contentHtml || "");
      setOriginalContentHtml(data.post.contentHtml || "");
      setTags(data.post.tags || []);
      setFeatures(data.features || {});
      setShopifyBlogId(data.post.shopifyArticle?.shopifyBlogId || "");

      // Directly hydrate builder store & tiptap document so both modes load instantly
      useBuilderStore.getState().hydrate(normalizedBlocks);

      // Reset unsaved changes flag on fresh load
      setHasUnsavedChanges(false);
      if (window.shopify?.saveBar) {
        try {
          window.shopify.saveBar.hide("post-editor-save-bar").catch(() => {});
        } catch (e) {}
      }

      setSeoData({
        metaTitle: data.post.metaTitle || "",
        metaDescription: data.post.metaDescription || "",
        canonicalUrl: data.post.canonicalUrl || "",
        ogTitle: data.post.ogTitle || "",
        ogDescription: data.post.ogDescription || "",
        ogImage: data.post.ogImage || "",
      });
      // Auto-expand sections if they have content
      if (data.post.excerpt) setExcerptExpanded(true);
      if (data.post.metaTitle || data.post.metaDescription) setSeoExpanded(true);
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
    const clean1 = val1 === null || val1 === undefined ? "" : String(val1).trim();
    const clean2 = val2 === null || val2 === undefined ? "" : String(val2).trim();
    return clean1 !== clean2;
  };

  const isDirty = useMemo(() => {
    if (hasUnsavedChanges) return true;
    
    if (!isEditing) {
      return (
        isFieldDirty(post.title, "") ||
        isFieldDirty(post.slug, "") ||
        isFieldDirty(post.excerpt, "") ||
        isFieldDirty(post.author, "") ||
        isFieldDirty(post.featuredImage, "") ||
        isFieldDirty(post.customCss, "") ||
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
  }, [hasUnsavedChanges, post, tags, shopifyBlogId, originalPost, isEditing, seoData]);

  const saveBarId = "post-editor-save-bar";

  useEffect(() => {
    if (window.shopify?.saveBar) {
      if (isDirty) {
        window.shopify.saveBar.show(saveBarId).catch(() => {});
      } else {
        window.shopify.saveBar.hide(saveBarId).catch(() => {});
      }
    }
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide(saveBarId).catch(() => {});
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
  }, []);

  const handleEditorInit = useCallback((normalizedHtml) => {
    setOriginalContentHtml(normalizedHtml);
    setContentHtml(normalizedHtml);
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
    // Both modes save storefront HTML by compiling the AST
    const builderBlocks = useBuilderStore.getState().getBlocksAst();
    const finalAst = builderBlocks && builderBlocks.length > 0 ? builderBlocks : post.contentJson || [];

    const finalContentHtml = compileBlocksToHtml(finalAst);

    return {
      ...post,
      contentHtml: finalContentHtml,
      contentJson: finalAst,
      tags,
      blogId: shopifyBlogId || undefined,
      productSliderProducts: [],
      editorMode: post.editorMode || "builder",
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
        setHasUnsavedChanges(false);
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
         setHasUnsavedChanges(false);
         navigate(`/posts/${data.post.id}/edit`);
      } else {
         setHasUnsavedChanges(false);
         setOriginalPost(payload);
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
    setHasUnsavedChanges(false);
    if (isEditing && originalPost) {
      setPost({ ...originalPost });
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
        editorMode: "builder",
      });
      setTiptapJson(null);
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
      const finalAst = post.contentJson || [];

      const htmlToPreview = compileBlocksToHtml(finalAst);

      const res = await fetch("/api/posts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentHtml: htmlToPreview }),
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
              const shopDomain = window.shopify?.config?.shop || "";
              const blog = shopifyBlogs.find((b) => String(b.id) === String(shopifyBlogId));
              const blogHandle = blog?.handle || "news";
              const articleSlug = post.slug || "";
              if (shopDomain && blogHandle && articleSlug) {
                window.open(`https://${shopDomain}/blogs/${blogHandle}/${articleSlug}`, "_blank");
              }
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

          {/* ══════════════════════════════════════════════════════
               FULL-WIDTH BUILDER AREA
          ══════════════════════════════════════════════════════ */}
          <Layout.Section>
            <BlockStack gap="400">

              {/* Title — no card header, just the input, like Shopify */}
              <Card>
                <Box padding="400">
                  <TextField
                    label="Title"
                    value={post.title}
                    onChange={handleTitleChange}
                    placeholder="e.g. My first blog post"
                    autoComplete="off"
                    size="large"
                  />
                </Box>
              </Card>

              {/* Content — conditionally render Builder or WYSIWYG */}
              <Card>
                <Box padding="0">
                  <Box paddingBlock="300" paddingInline="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingSm" tone="subdued">Content</Text>
                    </InlineStack>
                  </Box>
                  <Divider />
                  <Box padding="0">
                      <DragDropBuilderContainer
                        initialBlocksAst={post.contentJson || []}
                        onChange={(blocksAst) => {
                          setPost((p) => {
                            if (JSON.stringify(p.contentJson) === JSON.stringify(blocksAst)) return p;
                            const origJsonStr = JSON.stringify(originalPost?.contentJson || []);
                            const currJsonStr = JSON.stringify(blocksAst || []);
                            if (origJsonStr !== currJsonStr) {
                              setHasUnsavedChanges(true);
                            }
                            return { ...p, contentJson: blocksAst };
                          });
                        }}
                        postTitle={post.title}
                        onTitleChange={handleTitleChange}
                        onSave={() => handleSave(post.status === "published" ? "published" : "draft", "header")}
                        onPreview={handlePreviewClick}
                        isSaving={isSaving}
                        isPreviewLoading={isPreviewLoading}
                      />
                  </Box>
                </Box>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        <div style={{ marginTop: "var(--p-space-500)" }}>
          <Layout>
            {/* ══════════════════════════════════════════════════════
                 SECONDARY CONTENT COLUMN (LEFT)
            ══════════════════════════════════════════════════════ */}
            <Layout.Section style={{ flex: "1 1 0%", maxWidth: "none" }}>
              <BlockStack gap="400">

              {/* Excerpt — collapsible like Shopify */}
              <Card>
                <Box padding="0">
                  <Box
                    paddingBlock="400"
                    paddingInline="400"
                    as="button"
                    onClick={() => setExcerptExpanded((v) => !v)}
                    style={{
                      width: "100%",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingSm">Excerpt</Text>
                      <Text variant="bodySm" tone="subdued">
                        {excerptExpanded ? "▲" : "▼"}
                      </Text>
                    </InlineStack>
                  </Box>
                  {excerptExpanded && (
                    <>
                      <Divider />
                      <Box padding="400">
                        <BlockStack gap="200">
                          <Text variant="bodySm" tone="subdued">
                            Add a summary of the post to appear on your home page or blog.
                          </Text>
                          <TextField
                            label="Excerpt"
                            labelHidden
                            value={post.excerpt || ""}
                            onChange={handleField("excerpt")}
                            multiline={4}
                            autoComplete="off"
                            placeholder="Add a summary..."
                          />
                        </BlockStack>
                      </Box>
                    </>
                  )}
                </Box>
              </Card>

              {/* Search engine listing — matches Shopify's exact layout */}
              <Card>
                <Box padding="0">
                  <Box
                    paddingBlock="400"
                    paddingInline="400"
                    as="button"
                    onClick={() => setSeoExpanded((v) => !v)}
                    style={{
                      width: "100%",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingSm">Search engine listing</Text>
                      <Text variant="bodySm" tone="subdued">
                        {seoExpanded ? "▲" : "▼"}
                      </Text>
                    </InlineStack>
                  </Box>

                  {/* Always-visible URL preview, like Shopify */}
                  <Divider />
                  <Box paddingBlock="300" paddingInline="400">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">
                        {window.shopify?.config?.shop || "your-store.myshopify.com"}
                      </Text>
                      <Text variant="bodySm" tone="magic">
                        https://{window.shopify?.config?.shop || "your-store.myshopify.com"}/blogs/{shopifyBlogs.find((b) => String(b.id) === String(shopifyBlogId))?.handle || "news"}/{post.slug || ""}
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        {seoData.metaTitle || post.title || ""}
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        {seoData.metaDescription || post.excerpt || ""}
                      </Text>
                    </BlockStack>
                  </Box>

                  {seoExpanded && (
                    <>
                      <Divider />
                      <Box padding="400">
                        <BlockStack gap="400">
                          <TextField
                            label="Page title"
                            value={seoData.metaTitle}
                            onChange={(val) => setSeoData((s) => ({ ...s, metaTitle: val }))}
                            maxLength={70}
                            showCharacterCount
                            autoComplete="off"
                          />
                          <TextField
                            label="Meta description"
                            value={seoData.metaDescription}
                            onChange={(val) => setSeoData((s) => ({ ...s, metaDescription: val }))}
                            multiline={3}
                            maxLength={320}
                            showCharacterCount
                            autoComplete="off"
                          />
                          <TextField
                            label="URL handle"
                            value={post.slug}
                            onChange={handleField("slug")}
                            prefix="blogs/"
                            helpText={`https://${window.shopify?.config?.shop || "your-store.myshopify.com"}/blogs/${shopifyBlogs.find((b) => String(b.id) === String(shopifyBlogId))?.handle || "news"}/${post.slug || ""}`}
                            autoComplete="off"
                          />
                        </BlockStack>
                      </Box>
                    </>
                  )}
                </Box>
              </Card>

              {/* Custom CSS (plan-gated) */}
              {features.custom_css?.enabled && (
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingSm">Custom CSS</Text>
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

          {/* ══════════════════════════════════════════════════════
               SIDEBAR (Compact Width for Maximum Canvas Space)
          ══════════════════════════════════════════════════════ */}
          <Layout.Section variant="oneThird" style={{ flex: "0 0 300px", maxWidth: "300px" }}>
            <BlockStack gap="400">

              {/* ── Visibility ── */}
              <Card>
                <Box paddingBlockStart="400" paddingBlockEnd="300" paddingInline="400">
                  <Text variant="headingMd" as="h2">Visibility</Text>
                </Box>
                <Divider />
                <Box padding="400">
                  <BlockStack gap="300">
                    <BlockStack gap="0">
                      <RadioButton
                        label="Visible"
                        helpText={
                          post.status === "published" && post.publishedAt
                            ? `As of ${new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at ${new Date(post.publishedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} GMT+5:30`
                            : null
                        }
                        checked={post.status === "published"}
                        id="visibility-visible"
                        name="visibility"
                        onChange={() => handleField("status")("published")}
                      />
                      <RadioButton
                        label="Hidden"
                        checked={post.status === "draft"}
                        id="visibility-hidden"
                        name="visibility"
                        onChange={() => handleField("status")("draft")}
                      />
                    </BlockStack>
                    <Divider />
                    {post.status === "published" ? (
                      <BlockStack gap="300">
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
                          variant="plain"
                          onClick={handleUnpublish}
                          loading={isUnpublishing}
                          disabled={isSaving || isUnpublishing}
                        >
                          Unpublish
                        </Button>
                      </BlockStack>
                    ) : (
                      <BlockStack gap="300">
                        <Button
                          onClick={() => handleSave("draft", "sidebar")}
                          loading={isSavingSidebar}
                          disabled={isSaving && !isSavingSidebar}
                          fullWidth
                        >
                          Save draft
                        </Button>
                        <Button
                          variant="primary"
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

              {/* ── Image (Featured Image) ── */}
              <Card>
                <Box paddingBlockStart="400" paddingBlockEnd="300" paddingInline="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">Image</Text>
                    {post.featuredImage && (
                      <Button
                        variant="plain"
                        disclosure
                        onClick={() => setShowFilePicker(true)}
                      >
                        Edit
                      </Button>
                    )}
                  </InlineStack>
                </Box>
                <Box padding="400" paddingBlockStart="0">
                  {post.featuredImage ? (
                    <BlockStack gap="300">
                      <div
                        style={{
                          borderRadius: "var(--p-border-radius-300, 8px)",
                          overflow: "hidden",
                          border: "1px solid var(--p-color-border-subdued)",
                        }}
                      >
                        <img
                          src={post.featuredImage}
                          alt="Featured image"
                          style={{
                            width: "100%",
                            display: "block",
                            maxHeight: "220px",
                            objectFit: "cover",
                          }}
                        />
                      </div>
                      <Button
                        tone="critical"
                        variant="plain"
                        onClick={() => handleField("featuredImage")("")}
                        size="slim"
                      >
                        Remove image
                      </Button>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="300">
                      <DropZone
                        onDrop={handleDropZoneDrop}
                        allowMultiple={false}
                        accept="image/*"
                        variableHeight
                      >
                        {isUploadingImage ? (
                          <Box padding="600">
                            <BlockStack align="center" inlineAlign="center" gap="200">
                              <Spinner size="small" />
                              <Text variant="bodySm" tone="subdued">Uploading…</Text>
                            </BlockStack>
                          </Box>
                        ) : (
                          <Box padding="600">
                            <BlockStack align="center" inlineAlign="center" gap="100">
                              <Icon source={ImageIcon} tone="subdued" />
                              <Text variant="bodySm" tone="subdued" alignment="center">
                                Add image
                              </Text>
                            </BlockStack>
                          </Box>
                        )}
                      </DropZone>
                      <Button
                        fullWidth
                        onClick={() => setShowFilePicker(true)}
                        variant="secondary"
                      >
                        Add from Shopify Files
                      </Button>
                    </BlockStack>
                  )}
                </Box>
              </Card>

              {/* ── Organization ── */}
              <Card>
                <Box paddingBlockStart="400" paddingBlockEnd="300" paddingInline="400">
                  <Text variant="headingMd" as="h2">Organization</Text>
                </Box>
                <Divider />
                <Box padding="400">
                  <BlockStack gap="400">
                    <TextField
                      label="Author"
                      value={post.author || ""}
                      onChange={handleField("author")}
                      autoComplete="off"
                    />
                    <Select
                      label="Blog"
                      options={blogOptions}
                      value={shopifyBlogId}
                      onChange={setShopifyBlogId}
                    />
                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="medium">Tags</Text>
                      {tags.length > 0 && (
                        <InlineStack gap="100" wrap>
                          {tags.map((tag) => (
                            <Tag key={tag} onRemove={() => removeTag(tag)}>
                              {tag}
                            </Tag>
                          ))}
                        </InlineStack>
                      )}
                      <InlineStack gap="200" blockAlign="start">
                        <div style={{ flex: 1 }}>
                          <TextField
                            label="Add tags"
                            labelHidden
                            value={tagInput}
                            onChange={setTagInput}
                            placeholder="Vintage, cotton, summer"
                            onKeyPress={(e) => e.key === "Enter" && addTag()}
                            autoComplete="off"
                          />
                        </div>
                        <Button onClick={addTag} variant="secondary">Add</Button>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>

              {/* ── Shopify Sync Status ── */}
              <SyncStatusIndicator
                postId={post.id}
                postTitle={post.title}
                initialArticle={post.shopifyArticle}
              />

              {/* ── Delete Article ── */}
              {isEditing && (
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingMd" tone="critical">Delete article</Text>
                      <Text tone="subdued" variant="bodySm">
                        Deleting this article will remove it permanently from the app. This action cannot be undone.
                      </Text>
                      {(post.status === "published" || post.shopifyArticle) && (
                        <Checkbox
                          label="Also delete from my Shopify store"
                          checked={deleteFromShopify}
                          onChange={setDeleteFromShopify}
                        />
                      )}
                      <Button
                        tone="critical"
                        variant="plain"
                        loading={isDeleting}
                        onClick={handleDelete}
                      >
                        Delete article
                      </Button>
                    </BlockStack>
                  </Box>
                </Card>
              )}

            </BlockStack>
          </Layout.Section>
        </Layout>
        </div>
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
