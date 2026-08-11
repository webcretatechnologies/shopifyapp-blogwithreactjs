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
  Combobox,
  Listbox,
  DatePicker,
  Popover,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { ViewIcon, ChevronDownIcon, ChevronUpIcon, ImageIcon, EditIcon, CalendarIcon } from "@shopify/polaris-icons";
import { DateTime } from "luxon";
import confetti from "canvas-confetti";
import DragDropBuilderContainer from "../../components/builder/DragDropBuilderContainer";
import { compileBlocksToHtml } from "../../utils/compileBlocksToHtml";
import ShopifyFilePicker from "../../components/ShopifyFilePicker";
import ArticlePreview from "../../components/editor/ArticlePreview";
import SyncStatusIndicator from "../../components/SyncStatusIndicator.jsx";
import ConfirmActionModal from "../../components/ConfirmActionModal";
import { useBuilderStore } from "../../components/builder/store/useBuilderStore";
import { normalizeBlocksAst, applyThemeColorDefaults, applyThemeShapeDefaults } from "../../components/builder/BlockRegistry";
import ExcerptRichTextEditor from "../../components/editor/ExcerptRichTextEditor";
import ShopifyRichTextEditor from "../../components/editor/ShopifyRichTextEditor";
import ArticleComments from "../../components/comments/ArticleComments";
import { metaRobotsActivateUrl } from "../../utils/themeEmbedUtils";

const stripHtml = (html) => {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "").trim();
};

const RICH_SNIPPET_OPTIONS = [
  { label: "Blog posting", value: "BlogPosting" },
  { label: "Article", value: "Article" },
  { label: "News article", value: "NewsArticle" },
  { label: "None", value: "None" },
];

const META_ROBOTS_OPTIONS = [
  { label: "Index, Follow", value: "INDEX_FOLLOW" },
  { label: "Noindex, Follow", value: "NOINDEX_FOLLOW" },
  { label: "Index, Nofollow", value: "INDEX_NOFOLLOW" },
  { label: "Noindex, Nofollow", value: "NOINDEX_NOFOLLOW" },
];

const metaRobotsValueFromFlags = (noindex, nofollow) => {
  if (noindex && nofollow) return "NOINDEX_NOFOLLOW";
  if (noindex) return "NOINDEX_FOLLOW";
  if (nofollow) return "INDEX_NOFOLLOW";
  return "INDEX_FOLLOW";
};



const hasMeaningfulBlocks = (blocks) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  return blocks.some((b) => {
    if (!b) return false;
    if (b.type === "RichText") {
      const c = b.settings?.content;
      if (!c) return false;
      if (typeof c === "string") {
        const containsMedia = /<(img|iframe|table|video|svg|input|button)/i.test(c);
        return c.replace(/<[^>]*>/g, "").trim().length > 0 || containsMedia;
      }
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

  const generateId = () => `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const TYPE_MAP = {
    buyButton: 'BuyButton',
    buy_button: 'BuyButton',
    BuyButton: 'BuyButton',
    productGrid: 'ProductGrid',
    product_grid: 'ProductGrid',
    ProductGrid: 'ProductGrid',
    collection: 'Collection',
    Collection: 'Collection',
    ctaButton: 'ButtonBlock',
    cta_button: 'ButtonBlock',
    buttonBlock: 'ButtonBlock',
    ButtonBlock: 'ButtonBlock',
    heroBlock: 'HeroSection',
    hero: 'HeroSection',
    HeroSection: 'HeroSection',
    Hero: 'HeroSection',
    videoBlock: 'VideoEmbed',
    video: 'VideoEmbed',
    VideoEmbed: 'VideoEmbed',
    spacerBlock: 'Spacer',
    spacer: 'Spacer',
    Spacer: 'Spacer',
    dividerBlock: 'Divider',
    divider: 'Divider',
    Divider: 'Divider',
    imageBlock: 'Image',
    image: 'Image',
    Image: 'Image',
    heading: 'Heading',
    Heading: 'Heading',
    calloutBlock: 'Callout',
    callout: 'Callout',
    Callout: 'Callout',
    htmlBlock: 'Html',
    html: 'Html',
    Html: 'Html',
    product_slider: 'ProductSlider',
    productSlider: 'ProductSlider',
    ProductSlider: 'ProductSlider',
    productCard: 'ProductCard',
    product: 'ProductCard',
    ProductCard: 'ProductCard',
    toc: 'TableOfContents',
    tableOfContents: 'TableOfContents',
    table_of_contents: 'TableOfContents',
    TableOfContents: 'TableOfContents',
    faqBlock: 'FaqBlock',
    FaqBlock: 'FaqBlock',
    faq: 'FaqBlock',
    FAQ: 'FaqBlock',
    RichText: 'RichText',
    richtext: 'RichText',
    Section: 'Section',
    section: 'Section',
    ColumnLayout: 'ColumnLayout',
    columnLayout: 'ColumnLayout',
    column_layout: 'ColumnLayout',
    Column: 'Column',
    column: 'Column'
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
    titlealign: 'titleAlign',
    liststyle: 'listStyle',
    accentcolor: 'accentColor',
    backgroundcolor: 'backgroundColor',
    bordercolor: 'borderColor',
    paddingtop: 'paddingTop',
    paddingbottom: 'paddingBottom',
    paddingleft: 'paddingLeft',
    paddingright: 'paddingRight',
    firstopen: 'firstOpen',
    enableschema: 'enableSchema'
  };

  const parseFallbackSettings = (node, blockType) => {
    const settings = {};
    const style = node.getAttribute("style") || "";

    const parseStyle = (property) => {
      const regex = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
      const match = style.match(regex);
      return match ? match[1].trim() : "";
    };

    switch (blockType) {
      case "Heading": {
        settings.text = node.textContent?.trim() || "";
        const tag = node.tagName.toLowerCase();
        settings.level = parseInt(tag.replace("h", ""), 10) || 2;
        settings.align = parseStyle("text-align") || "left";
        settings.color = parseStyle("color") || "#202223";
        const fs = parseStyle("font-size");
        if (fs) settings.fontSize = fs;
        break;
      }
      case "RichText": {
        settings.content = node.innerHTML || "";
        break;
      }
      case "Section": {
        settings.backgroundColor = parseStyle("background-color") || "transparent";
        settings.maxWidth = parseStyle("max-width") || "100%";
        settings.borderRadius = parseStyle("border-radius") || "0px";
        const padding = parseStyle("padding") || "";
        if (padding) {
          const parts = padding.split(/\s+/);
          if (parts.length === 1) {
            settings.paddingTop = settings.paddingBottom = settings.paddingLeft = settings.paddingRight = parts[0];
          } else if (parts.length === 2) {
            settings.paddingTop = settings.paddingBottom = parts[0];
            settings.paddingLeft = settings.paddingRight = parts[1];
          } else if (parts.length === 4) {
            settings.paddingTop = parts[0];
            settings.paddingRight = parts[1];
            settings.paddingBottom = parts[2];
            settings.paddingLeft = parts[3];
          }
        }
        break;
      }
      case "ColumnLayout": {
        settings.gap = parseStyle("gap") || "16px";
        break;
      }
      case "Divider": {
        const hr = node.tagName.toLowerCase() === "hr" ? node : node.querySelector("hr");
        const hrStyle = hr ? (hr.getAttribute("style") || "") : "";
        const parseHrStyle = (property) => {
          const regex = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
          const match = hrStyle.match(regex);
          return match ? match[1].trim() : "";
        };
        const borderTop = parseHrStyle("border-top") || "";
        if (borderTop) {
          const parts = borderTop.split(/\s+/);
          if (parts.length >= 3) {
            settings.thickness = parts[0];
            settings.style = parts[1];
            settings.color = parts.slice(2).join(" ");
          }
        }
        settings.width = parseHrStyle("width") || "100%";
        break;
      }
      case "Spacer": {
        settings.height = parseStyle("height") || "40px";
        break;
      }
      case "Callout": {
        settings.backgroundColor = parseStyle("background-color") || "#fdfbc8";
        const borderLeft = parseStyle("border-left") || "";
        if (borderLeft) {
          const parts = borderLeft.split(/\s+/);
          settings.borderColor = parts.length >= 3 ? parts.slice(2).join(" ") : "";
        }
        const spans = Array.from(node.querySelectorAll("span"));
        settings.emoji = spans[0] ? spans[0].textContent?.trim() : "💡";
        settings.title = node.querySelector("strong")?.textContent?.trim() || "";
        settings.body = spans[1] ? spans[1].textContent?.trim() : "";
        break;
      }
      case "Image": {
        const img = node.querySelector("img");
        settings.src = img ? (img.getAttribute("src") || "") : "";
        settings.alt = img ? (img.getAttribute("alt") || "") : "";
        settings.width = img ? (img.style.width || "100%") : "100%";
        settings.height = img ? (img.style.height || "auto") : "auto";
        settings.align = parseStyle("text-align") || "center";
        settings.caption = node.querySelector("p")?.textContent?.trim() || "";
        settings.linkUrl = node.querySelector("a")?.getAttribute("href") || "";
        break;
      }
      case "VideoEmbed": {
        const iframe = node.querySelector("iframe");
        settings.url = iframe ? (iframe.getAttribute("src") || "") : "";
        settings.maxWidth = parseStyle("max-width") || "100%";
        break;
      }
      case "ButtonBlock":
      case "CTAButton": {
        const a = node.querySelector("a");
        const aStyle = a ? (a.getAttribute("style") || "") : "";
        const parseAStyle = (property) => {
          const regex = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
          const match = aStyle.match(regex);
          return match ? match[1].trim() : "";
        };
        settings.text = a ? (a.textContent?.trim() || "Click Here") : "Click Here";
        settings.url = a ? (a.getAttribute("href") || "#") : "#";
        settings.alignment = parseStyle("text-align") || "center";
        settings.backgroundColor = parseAStyle("background-color") || "#008060";
        settings.textColor = parseAStyle("color") || "#ffffff";
        settings.borderRadius = parseInt(parseAStyle("border-radius"), 10) || 6;
        break;
      }
      case "FaqBlock": {
        const titleEl = node.querySelector("h2");
        settings.title = titleEl ? titleEl.textContent.trim() : "";
        settings.layout = node.querySelector("details.builder-faq-item") ? "accordion" : "grid";
        settings.items = [];
        if (settings.layout === "accordion") {
          const details = Array.from(node.querySelectorAll("details.builder-faq-item"));
          details.forEach(det => {
            const qEl = det.querySelector(".faq-question-text") || det.querySelector("summary");
            const aEl = det.querySelector("div p") || det.querySelector("p");
            settings.items.push({
              question: qEl ? qEl.textContent.trim() : "",
              answer: aEl ? aEl.innerHTML.trim() : ""
            });
          });
        } else {
          const items = Array.from(node.querySelectorAll("div[style*='background-color']"));
          items.forEach(item => {
            const qEl = item.querySelector("h4");
            const aEl = item.querySelector("p");
            if (qEl || aEl) {
              settings.items.push({
                question: qEl ? qEl.textContent.trim() : "",
                answer: aEl ? aEl.innerHTML.trim() : ""
              });
            }
          });
        }
        break;
      }
      case "TableOfContents": {
        const isDetails = node.classList.contains("sp-toc-details") || node.tagName.toLowerCase() === "details";
        const tocContainer = isDetails ? node : node.querySelector(".sp-toc-block, .sp-toc-details");
        settings.title = tocContainer ? (tocContainer.querySelector("summary, div")?.textContent?.trim() || "Table of Contents") : "Table of Contents";
        settings.collapsible = isDetails;
        settings.listStyle = tocContainer?.querySelector("ol") ? "numbered" : "bullet";
        settings.levels = [2, 3];
        break;
      }
      case "Html": {
        settings.code = node.innerHTML || "";
        break;
      }
      case "Table": {
        const tableData = [];
        node.querySelectorAll("tr").forEach(tr => {
          const row = [];
          tr.querySelectorAll("th, td").forEach(td => {
            row.push(td.textContent?.trim() || "");
          });
          if (row.length) tableData.push(row);
        });
        settings.tableData = tableData;
        settings.hasHeader = node.querySelector("thead") !== null;
        break;
      }
      case "HeroSection": {
        settings.heading = node.querySelector("h1")?.textContent?.trim() || "";
        settings.subheading = node.querySelector("p")?.textContent?.trim() || "";
        settings.textColor = parseStyle("color") || "#ffffff";
        settings.minHeight = parseStyle("min-height") || "360px";
        const bgImgStyle = parseStyle("background-image") || "";
        if (bgImgStyle && bgImgStyle.includes("url(")) {
          const match = bgImgStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
          settings.backgroundImage = match ? match[1] : "";
        }
        const a = node.querySelector("a");
        settings.showCta = a !== null;
        if (settings.showCta) {
          settings.ctaText = a.textContent?.trim() || "";
          settings.ctaUrl = a.getAttribute("href") || "";
          const aStyle = a.getAttribute("style") || "";
          const parseAStyle = (property) => {
            const regex = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
            const match = aStyle.match(regex);
            return match ? match[1].trim() : "";
          };
          settings.ctaColor = parseAStyle("background") || parseAStyle("background-color") || "#008060";
          settings.ctaTextColor = parseAStyle("color") || "#ffffff";
        }
        break;
      }
      case "Collection":
      case "ProductSlider":
      case "ProductGrid": {
        settings.title = node.querySelector("h3")?.textContent?.trim() || "";
        settings.heading = settings.title;
        settings.manualProducts = [];
        node.querySelectorAll("div[style*='border']").forEach(pEl => {
          const title = pEl.querySelector("h4")?.textContent?.trim() || "";
          const imageUrl = pEl.querySelector("img")?.getAttribute("src") || "";
          const price = pEl.querySelector("p")?.textContent?.trim() || "";
          if (title || imageUrl) {
            settings.manualProducts.push({
              title,
              image: imageUrl,
              price: price.replace(/[₹$]/g, "")
            });
          }
        });
        break;
      }
      case "ProductCard": {
        settings.title = node.querySelector("h4")?.textContent?.trim() || "";
        settings.price = node.querySelector("p")?.textContent?.trim() || "";
        settings.imageUrl = node.querySelector("img")?.getAttribute("src") || "";
        break;
      }
      case "BuyButton": {
        const title = node.querySelector("h4")?.textContent?.trim() || "";
        const price = node.querySelector("p")?.textContent?.trim() || "";
        const image = node.querySelector("img")?.getAttribute("src") || "";
        settings.product = {
          title,
          price: price.replace(/[₹$]/g, ""),
          image
        };
        break;
      }
    }
    return settings;
  };

  const processNode = (node, targetBlocksArray = blocks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        targetBlocksArray.push({
          id: generateId(),
          type: "RichText",
          settings: { content: `<p>${node.textContent}</p>` }
        });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = node.tagName.toLowerCase();
    if (["style", "script", "meta", "link"].includes(tagName)) return;

    // 1. Check for explicit data-type attribute
    let dataType = node.getAttribute("data-type");
    if (!dataType) {
      if (node.classList.contains("builder-faq-block") || node.querySelector("details.builder-faq-item")) {
        dataType = "FaqBlock";
      } else if (node.classList.contains("sp-toc-block") || node.classList.contains("sp-toc-details") || node.querySelector(".sp-toc-block, .sp-toc-details")) {
        dataType = "TableOfContents";
      } else if (node.classList.contains("builder-richtext-wrapper")) {
        dataType = "RichText";
      } else if (node.classList.contains("builder-section")) {
        dataType = "Section";
      } else if (node.classList.contains("builder-column-layout")) {
        dataType = "ColumnLayout";
      } else if (node.classList.contains("builder-column")) {
        dataType = "Column";
      } else if (node.classList.contains("builder-divider") || node.tagName.toLowerCase() === "hr") {
        dataType = "Divider";
      } else if (node.classList.contains("builder-spacer")) {
        dataType = "Spacer";
      } else if (node.classList.contains("builder-callout")) {
        dataType = "Callout";
      } else if (node.classList.contains("builder-image-block")) {
        dataType = "Image";
      } else if (node.classList.contains("builder-video-embed")) {
        dataType = "VideoEmbed";
      } else if (node.classList.contains("builder-button-block")) {
        dataType = "ButtonBlock";
      } else if (node.classList.contains("builder-collection-block")) {
        dataType = "Collection";
      } else if (node.classList.contains("builder-product-slider")) {
        dataType = "ProductSlider";
      } else if (node.classList.contains("builder-product-grid")) {
        dataType = "ProductGrid";
      } else if (node.classList.contains("builder-product-card")) {
        dataType = "ProductCard";
      } else if (node.classList.contains("builder-cta-button")) {
        dataType = "CTAButton";
      } else if (node.classList.contains("builder-hero-section")) {
        dataType = "HeroSection";
      } else if (node.classList.contains("builder-buy-button")) {
        dataType = "BuyButton";
      } else if (node.classList.contains("builder-table-block")) {
        dataType = "Table";
      } else if (node.classList.contains("builder-heading-block")) {
        dataType = "Heading";
      } else if (node.classList.contains("builder-html-block") || node.classList.contains("custom-html-block")) {
        dataType = "Html";
      }
    }

    if (dataType) {
      const blockType = TYPE_MAP[dataType] || dataType;
      const settings = {};

      if (!node.getAttribute("data-type")) {
        Object.assign(settings, parseFallbackSettings(node, blockType));
      }

      Array.from(node.attributes).forEach(attr => {
        if (attr.name.startsWith("data-")) {
          const key = attr.name.substring(5);
          if (key === "type") return;
          const camelKey = key.split('-').map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.substring(1)).join('');
          const mappedKey = ATTR_MAP[key] || camelKey;
          let val = attr.value;
          if (val === "true") val = true;
          else if (val === "false") val = false;
          else if (val && (val.startsWith("{") || val.startsWith("["))) {
            try { val = JSON.parse(val); } catch (e) { }
          } else if (!isNaN(val) && val.trim() !== "" && key === "overlayopacity") {
            val = parseFloat(val);
          }
          settings[mappedKey] = val;
        }
      });

      if (blockType === "Heading" && !settings.text) {
        settings.text = node.textContent.trim();
      }
      if (blockType === "RichText" && !settings.content) {
        settings.content = node.innerHTML || node.outerHTML;
      }

      const createdBlock = {
        id: generateId(),
        type: blockType,
        settings: settings
      };

      if (blockType === "Section" || blockType === "ColumnLayout" || blockType === "Column") {
        createdBlock.children = [];
        targetBlocksArray.push(createdBlock);
        Array.from(node.childNodes).forEach(child => processNode(child, createdBlock.children));
        return;
      }

      targetBlocksArray.push(createdBlock);
      return;
    }

    // 2. Element without data-type: Inspect tag and convert to native block

    // A) Heading: <h1> - <h6>
    if (/^h[1-6]$/.test(tagName)) {
      const level = parseInt(tagName.charAt(1), 10);
      const text = node.textContent.trim();
      if (text) {
        blocks.push({
          id: generateId(),
          type: "Heading",
          settings: {
            text: text,
            level: level,
            align: node.style?.textAlign || "left"
          }
        });
      }
      return;
    }

    // B) Image: <img> or <figure> containing <img>
    if (tagName === "img") {
      const src = node.getAttribute("src");
      if (src) {
        blocks.push({
          id: generateId(),
          type: "Image",
          settings: {
            src: src,
            alt: node.getAttribute("alt") || "",
            width: node.getAttribute("width") || "100%",
            alignment: "center"
          }
        });
      }
      return;
    }

    if (tagName === "figure") {
      const img = node.querySelector("img");
      const figcaption = node.querySelector("figcaption");
      if (img && img.getAttribute("src")) {
        blocks.push({
          id: generateId(),
          type: "Image",
          settings: {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt") || "",
            caption: figcaption ? figcaption.textContent.trim() : "",
            width: "100%",
            alignment: "center"
          }
        });
        return;
      }
    }

    // C) Horizontal Rule: <hr>
    if (tagName === "hr") {
      blocks.push({
        id: generateId(),
        type: "Divider",
        settings: { style: "solid", thickness: "1px", color: "#e1e3e5" }
      });
      return;
    }

    // D) Table: <table>
    if (tagName === "table") {
      const tableData = [];
      const rows = Array.from(node.querySelectorAll("tr"));
      rows.forEach(tr => {
        const row = Array.from(tr.querySelectorAll("th, td")).map(td => td.textContent.trim());
        if (row.length > 0) tableData.push(row);
      });
      blocks.push({
        id: generateId(),
        type: "Table",
        settings: { tableData: tableData.length > 0 ? tableData : [["Header 1", "Header 2"], ["Data 1", "Data 2"]] }
      });
      return;
    }

    // E) Callout: <blockquote>
    if (tagName === "blockquote") {
      blocks.push({
        id: generateId(),
        type: "Callout",
        settings: {
          title: "",
          body: node.textContent.trim(),
          emoji: "💡",
          backgroundColor: "#fdfbc8",
          borderColor: "#eab308"
        }
      });
      return;
    }

    // F) Wrapper container <div> or <section> containing nested images/headings/blocks
    if (tagName === "div" || tagName === "section" || tagName === "article") {
      const hasChildElements = Array.from(node.childNodes).some(c => c.nodeType === Node.ELEMENT_NODE);
      if (hasChildElements) {
        Array.from(node.childNodes).forEach(child => processNode(child));
        return;
      }
    }

    // G) Paragraphs <p>, lists <ul>/<ol>, or other text markup
    // If the node itself contains an <img> inside a <p>, extract the image!
    if (node.querySelector && node.querySelector("img")) {
      Array.from(node.childNodes).forEach(child => processNode(child));
      return;
    }

    const htmlStr = node.outerHTML;
    if (htmlStr && htmlStr.trim() !== "") {
      const cleanText = htmlStr.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
      const containsMedia = /<(img|iframe|table|video|svg|input|button)/i.test(htmlStr);
      if (!cleanText && !containsMedia) return;

      blocks.push({
        id: generateId(),
        type: "RichText",
        settings: {
          content: htmlStr
        }
      });
    }
  };

  Array.from(rootContainer.childNodes).forEach(child => processNode(child));

  return blocks;
};

export const parseTags = (input) => {
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
  const blocksById = useBuilderStore((state) => state.blocksById);
  const rootIds = useBuilderStore((state) => state.rootIds);

  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [shopifyBlogId, setShopifyBlogId] = useState("");
  const [shopifyBlogs, setShopifyBlogs] = useState([]);
  const [quickCreateModalOpen, setQuickCreateModalOpen] = useState(false);
  const [newBlogTitle, setNewBlogTitle] = useState("");
  const [isCreatingBlog, setIsCreatingBlog] = useState(false);
  const [blogSearchValue, setBlogSearchValue] = useState("");
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
    metaRobotsNoindex: false,
    metaRobotsNofollow: false,
    richSnippetType: "BlogPosting",
  });
  const [seoExpanded, setSeoExpanded] = useState(false);
  const [themeTemplate, setThemeTemplate] = useState("default");
  const [metaRobotsActive, setMetaRobotsActive] = useState(null); // null = checking

  useEffect(() => {
    fetch("/api/settings/meta-robots-status")
      .then((r) => r.json())
      .then((data) => setMetaRobotsActive(!!data.active))
      .catch(() => setMetaRobotsActive(false));
  }, []);

  // ── Scheduling ──────────────────────────────────────────────
  const [shopTimezone, setShopTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [visibilityMode, setVisibilityMode] = useState("draft"); // draft | publish_now | schedule
  const [isSchedulePickerOpen, setIsSchedulePickerOpen] = useState(false);
  const [scheduleMonth, setScheduleMonth] = useState(new Date().getMonth());
  const [scheduleYear, setScheduleYear] = useState(new Date().getFullYear());
  const [scheduleDate, setScheduleDate] = useState(null); // JS Date, wall-clock in shop tz (date part only)
  const [scheduleTime, setScheduleTime] = useState("09:00"); // "HH:mm"
  const [isScheduling, setIsScheduling] = useState(false);
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);
  const [showScheduleLiveWarning, setShowScheduleLiveWarning] = useState(false);
  const [scheduleModalError, setScheduleModalError] = useState(null);

  useEffect(() => {
    fetch("/api/shop")
      .then((r) => r.json())
      .then((data) => {
        if (data.shop?.timezone) setShopTimezone(data.shop.timezone);
      })
      .catch(() => {});
  }, []);

  // Point new blocks' default brand/font color at the shop's configured settings (manually
  // set or theme-synced) instead of the static fallbacks. Already-placed blocks are untouched.
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings }) => {
        if (settings?.primaryColor || settings?.secondaryColor || settings?.textColor) {
          applyThemeColorDefaults({
            primaryColor: settings.primaryColor,
            secondaryColor: settings.secondaryColor,
            textColor: settings.textColor,
          });
        }
        if (settings?.buttonRadius !== undefined) {
          applyThemeShapeDefaults({ buttonRadius: settings.buttonRadius });
        }
      })
      .catch(() => {});
  }, []);

  // Keep the draft/publish_now/schedule radio in sync with the loaded post's actual status.
  useEffect(() => {
    if (post.status === "scheduled") setVisibilityMode("schedule");
    else if (post.status === "published") setVisibilityMode("publish_now");
    else setVisibilityMode("draft");
  }, [post.status]);

  const scheduledAtUtc = useMemo(() => {
    if (!scheduleDate) return null;
    const [hour, minute] = scheduleTime.split(":").map(Number);
    const dt = DateTime.fromObject(
      { year: scheduleDate.getFullYear(), month: scheduleDate.getMonth() + 1, day: scheduleDate.getDate(), hour, minute },
      { zone: shopTimezone }
    );
    return dt.isValid ? dt.toUTC().toISO() : null;
  }, [scheduleDate, scheduleTime, shopTimezone]);

  const isScheduledInPast = scheduledAtUtc ? new Date(scheduledAtUtc) <= new Date() : false;

  const formatInShopTz = (isoOrDate) => {
    if (!isoOrDate) return "";
    const dt = DateTime.fromJSDate(new Date(isoOrDate)).setZone(shopTimezone);
    return dt.isValid ? dt.toFormat("MMMM d, yyyy 'at' h:mm a") : "";
  };

  // Pre-fill the picker with the post's current schedule (e.g. when reopening to reschedule).
  useEffect(() => {
    if (post.status === "scheduled" && post.publishedAt) {
      const dt = DateTime.fromJSDate(new Date(post.publishedAt)).setZone(shopTimezone);
      if (dt.isValid) {
        setScheduleDate(new Date(dt.year, dt.month - 1, dt.day));
        setScheduleTime(dt.toFormat("HH:mm"));
        setScheduleMonth(dt.month - 1);
        setScheduleYear(dt.year);
      }
    }
  }, [post.status, post.publishedAt, shopTimezone]);

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

      // Hydrate builder store first so originalPost matches store AST representation
      useBuilderStore.getState().hydrate(normalizedBlocks);
      const hydratedBlocks = useBuilderStore.getState().getBlocksAst();

      const p = {
        title: data.post.title || "",
        slug: data.post.slug || "",
        excerpt: data.post.excerpt || "",
        status: data.post.status || "draft",
        publishedAt: data.post.publishedAt || null,
        author: data.post.author || "",
        featuredImage: data.post.featuredImage || "",
        contentJson: hydratedBlocks,
        customCss: data.post.customCss || "",
        productSliderPosition: data.post.productSliderPosition || "none",
        editorMode: initialMode,
        shopifyArticle: data.post.shopifyArticle || null,
        metaTitle: data.post.metaTitle || "",
        metaDescription: data.post.metaDescription || "",
        canonicalUrl: data.post.canonicalUrl || "",
        ogTitle: data.post.ogTitle || "",
        ogDescription: data.post.ogDescription || "",
        ogImage: data.post.ogImage || "",
        metaRobotsNoindex: !!data.post.metaRobotsNoindex,
        metaRobotsNofollow: !!data.post.metaRobotsNofollow,
        richSnippetType: data.post.richSnippetType || "BlogPosting",
      };

      const loadedTags = parseTags(data.post.tags);
      const postWithParsedTags = { ...p, tags: loadedTags };

      setPost(postWithParsedTags);
      setOriginalPost(postWithParsedTags);
      setContentHtml(data.post.contentHtml || "");
      setOriginalContentHtml(data.post.contentHtml || "");
      setTags(loadedTags);
      setFeatures(data.features || {});
      setShopifyBlogId(data.post.shopifyArticle?.shopifyBlogId || data.post.blogId || "");

      // Reset save bar on fresh load
      if (window.shopify?.saveBar) {
        try {
          window.shopify.saveBar.hide("post-editor-save-bar").catch(() => { });
        } catch (e) { }
      }

      setSeoData({
        metaTitle: data.post.metaTitle || "",
        metaDescription: data.post.metaDescription || "",
        canonicalUrl: data.post.canonicalUrl || "",
        ogTitle: data.post.ogTitle || "",
        ogDescription: data.post.ogDescription || "",
        ogImage: data.post.ogImage || "",
        metaRobotsNoindex: !!data.post.metaRobotsNoindex,
        metaRobotsNofollow: !!data.post.metaRobotsNofollow,
        richSnippetType: data.post.richSnippetType || "BlogPosting",
      });
      if (data.post.metaTitle || data.post.metaDescription || data.post.metaRobotsNoindex || data.post.metaRobotsNofollow || (data.post.richSnippetType && data.post.richSnippetType !== "BlogPosting")) setSeoExpanded(true);
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
    } catch { }
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

  const isBlocksDirty = useMemo(() => {
    const currentBlocks = useBuilderStore.getState().getBlocksAst();
    if (!isEditing) {
      return hasMeaningfulBlocks(currentBlocks);
    }
    if (!originalPost) return false;
    const origBlocks = originalPost.contentJson || [];
    return JSON.stringify(currentBlocks || []) !== JSON.stringify(origBlocks || []);
  }, [blocksById, rootIds, originalPost, isEditing]);

  const isDirty = useMemo(() => {
    if (isLoading) return false;
    if (isBlocksDirty) return true;

    if (!isEditing) {
      return (
        isFieldDirty(post.title, "") ||
        isFieldDirty(post.slug, "") ||
        isFieldDirty(post.excerpt, "") ||
        isFieldDirty(post.author, "") ||
        isFieldDirty(post.status, "draft") ||
        isFieldDirty(post.featuredImage, "") ||
        isFieldDirty(post.customCss, "") ||
        tags.length > 0 ||
        isFieldDirty(shopifyBlogId, "") ||
        isFieldDirty(seoData.metaTitle, "") ||
        isFieldDirty(seoData.metaDescription, "") ||
        isFieldDirty(seoData.canonicalUrl, "") ||
        isFieldDirty(seoData.ogTitle, "") ||
        isFieldDirty(seoData.ogDescription, "") ||
        isFieldDirty(seoData.ogImage, "") ||
        seoData.metaRobotsNoindex ||
        seoData.metaRobotsNofollow ||
        isFieldDirty(seoData.richSnippetType, "BlogPosting")
      );
    }
    if (!originalPost) return false;
    const o = originalPost;
    const origBlogId = o.shopifyArticle?.shopifyBlogId || o.blogId || "";
    const isPostDirty =
      isFieldDirty(post.title, o.title) ||
      isFieldDirty(post.slug, o.slug) ||
      isFieldDirty(post.excerpt, o.excerpt) ||
      isFieldDirty(post.author, o.author) ||
      isFieldDirty(post.status, o.status) ||
      isFieldDirty(post.featuredImage, o.featuredImage) ||
      isFieldDirty(post.customCss, o.customCss) ||
      isFieldDirty(shopifyBlogId, origBlogId) ||
      isFieldDirty(seoData.metaTitle, o.metaTitle) ||
      isFieldDirty(seoData.metaDescription, o.metaDescription) ||
      isFieldDirty(seoData.canonicalUrl, o.canonicalUrl) ||
      isFieldDirty(seoData.ogTitle, o.ogTitle) ||
      isFieldDirty(seoData.ogDescription, o.ogDescription) ||
      isFieldDirty(seoData.ogImage, o.ogImage) ||
      !!seoData.metaRobotsNoindex !== !!o.metaRobotsNoindex ||
      !!seoData.metaRobotsNofollow !== !!o.metaRobotsNofollow ||
      isFieldDirty(seoData.richSnippetType, o.richSnippetType || "BlogPosting");

    const originalTags = o.tags || [];
    const isTagsDirty =
      tags.length !== originalTags.length ||
      !tags.every((t) => originalTags.includes(t));

    return isPostDirty || isTagsDirty;
  }, [isBlocksDirty, post, tags, shopifyBlogId, originalPost, isEditing, seoData, isLoading]);

  const saveBarId = "post-editor-save-bar";

  // <ui-save-bar> is rendered unconditionally below (Shopify's documented pattern) —
  // shopify.saveBar.show()/hide() is the *only* thing that controls its visibility.
  // Previously this element was also conditionally mounted on isDirty, which raced the DOM
  // mount against the imperative API call — the actual cause of the save bar misbehaving.
  useEffect(() => {
    if (isLoading || !window.shopify?.saveBar) return;
    if (isDirty) {
      window.shopify.saveBar.show(saveBarId).catch(() => { });
    } else {
      window.shopify.saveBar.hide(saveBarId).catch(() => { });
    }
  }, [isDirty, isLoading]);

  useEffect(() => {
    return () => {
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide(saveBarId).catch(() => { });
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
    setPost((p) => {
      let newSlug = p.slug;
      if (originalPost && value === originalPost.title) {
        newSlug = originalPost.slug || generateSlug(value);
      } else if (!isEditing || !p.slug || (originalPost && p.slug === generateSlug(originalPost.title))) {
        newSlug = generateSlug(value);
      }
      return { ...p, title: value, slug: newSlug };
    });
  };

  const handleContentChange = useCallback((newHtml) => {
    setContentHtml(newHtml);
  }, []);

  const handleEditorInit = useCallback((normalizedHtml) => {
    setOriginalContentHtml(normalizedHtml);
    setContentHtml(normalizedHtml);
  }, []);





  const handleTagInputChange = (val) => {
    if (val.includes(",")) {
      const parts = val.split(",");
      const trailing = parts.pop();
      const newTags = parseTags(parts);
      if (newTags.length > 0) {
        setTags((prev) => parseTags([...prev, ...newTags]));
      }
      setTagInput(trailing.trimStart());
    } else {
      setTagInput(val);
    }
  };

  const addTag = () => {
    const newTags = parseTags(tagInput);
    if (newTags.length > 0) {
      setTags((prev) => parseTags([...prev, ...newTags]));
    }
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

    // publishedAt must never ride along on an ordinary save — it's only ever written by the
    // dedicated /publish endpoint (immediate publish or schedule), never as a side effect here.
    const { publishedAt: _publishedAt, ...postWithoutPublishedAt } = post;

    return {
      ...postWithoutPublishedAt,
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
        const currentSavedBlocks = useBuilderStore.getState().getBlocksAst();
        const updatedOriginalPost = {
          ...post,
          ...payload,
          tags: [...tags],
          shopifyArticle: { shopifyBlogId },
          contentJson: currentSavedBlocks,
        };
        setPost(updatedOriginalPost);
        setOriginalPost(updatedOriginalPost);
        setOriginalContentHtml(payload.contentHtml || "");
        if (window.shopify?.saveBar) {
          try { await window.shopify.saveBar.hide(saveBarId); } catch (e) { }
        }
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
    if (isEditing && originalPost) {
      setPost({ ...originalPost });
      useBuilderStore.getState().hydrate(originalPost.contentJson || []);
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
        metaRobotsNoindex: !!originalPost.metaRobotsNoindex,
        metaRobotsNofollow: !!originalPost.metaRobotsNofollow,
        richSnippetType: originalPost.richSnippetType || "BlogPosting",
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
      useBuilderStore.getState().hydrate([]);
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
        metaRobotsNoindex: false,
        metaRobotsNofollow: false,
        richSnippetType: "BlogPosting",
      });
    }
    if (window.shopify?.saveBar) {
      try { window.shopify.saveBar.hide(saveBarId); } catch (e) {}
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
      setPost((p) => ({ ...p, status: "published", publishedAt: new Date().toISOString() }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  // Shopify has no "stays live now, gets a new publish date later" state — an article is either
  // visible now, or hidden until a future instant. Scheduling an already-published article takes
  // it offline immediately (verified live against a real store), so that transition specifically
  // needs an explicit merchant confirmation rather than silently going dark.
  const doSchedule = async () => {
    setIsScheduling(true);
    setError(null);
    setScheduleModalError(null);
    try {
      const savedPostId = await handleSave("scheduled");
      const postId = id || savedPostId;
      if (!postId) {
        throw new Error("Couldn't save the article before scheduling. Please try again.");
      }

      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId: shopifyBlogId, scheduledAt: scheduledAtUtc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scheduling failed");

      setToast({ content: `Article scheduled for ${formatInShopTz(scheduledAtUtc)}` });
      setPost((p) => ({ ...p, status: "scheduled", publishedAt: scheduledAtUtc }));
      setIsSchedulePickerOpen(false);
      setShowScheduleLiveWarning(false);
    } catch (err) {
      setError(err.message);
      setScheduleModalError(err.message);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleSchedule = async () => {
    if (!shopifyBlogId) {
      setError("Please select a Shopify blog to publish to.");
      return;
    }
    if (!scheduledAtUtc) {
      setError("Please choose a date and time to schedule this article.");
      return;
    }
    if (new Date(scheduledAtUtc) <= new Date()) {
      setError("Scheduled date must be in the future.");
      return;
    }
    if (post.status === "published") {
      setShowScheduleLiveWarning(true);
      return;
    }
    await doSchedule();
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
    { label: "+ Create a new blog", value: "CREATE_NEW" }
  ];

  const handleBlogChange = (val) => {
    if (val === "CREATE_NEW") {
      setNewBlogTitle("");
      setQuickCreateModalOpen(true);
    } else {
      setShopifyBlogId(val);
    }
  };

  const handleQuickCreateBlog = async () => {
    if (!newBlogTitle.trim()) return;
    setIsCreatingBlog(true);
    try {
      const res = await fetch("/api/posts/shopify/blogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newBlogTitle,
          commentPolicy: "MODERATED",
          templateSuffix: ""
        })
      });
      const data = await res.json();
      if (res.ok && data.blog?.id) {
        setShopifyBlogs(prev => [...prev, { id: data.blog.id, title: newBlogTitle }]);
        setShopifyBlogId(String(data.blog.id));
        setToast({ content: `Created blog '${newBlogTitle}'` });
        setQuickCreateModalOpen(false);
      } else {
        setToast({ content: data.error || "Failed to create blog", error: true });
      }
    } catch (err) {
      setToast({ content: "Network error", error: true });
    } finally {
      setIsCreatingBlog(false);
    }
  };


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
      {/* Rendered unconditionally — see the effect above for why. */}
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

      {isDirty && !window.shopify && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 999,
          backgroundColor: "#1a1a1a",
          color: "#ffffff",
          padding: "12px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
        }}>
          <span style={{ fontWeight: 600, fontSize: "14px", color: "#ffffff" }}>
            Unsaved changes
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button onClick={handleDiscard}>Discard</Button>
            <Button variant="primary" loading={isSavingSaveBar} onClick={() => handleSave(post.status === "published" ? "published" : "draft", "savebar")}>
              Save
            </Button>
          </div>
        </div>
      )}
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
        {isEditing && post.shopifyArticle?.shopifyArticleId && (
          <button onClick={() => navigate(`/comments?article_id=${post.shopifyArticle.shopifyArticleId}`)}>
            Manage Comments
          </button>
        )}
        <button onClick={handlePreviewClick} disabled={isPreviewLoading}>
          {isPreviewLoading ? "Loading Preview..." : "Preview"}
        </button>
        {post.status === "published" ? (
          <button onClick={handleUnpublish} disabled={isUnpublishing}>
            {isUnpublishing ? "Unpublishing..." : "Unpublish"}
          </button>
        ) : post.status === "scheduled" ? (
          <>
            <button onClick={handlePublish} disabled={isPublishing || !shopifyBlogId}>
              {isPublishing ? "Publishing..." : "Publish now"}
            </button>
            <button onClick={handleUnpublish} disabled={isUnpublishing}>
              {isUnpublishing ? "Cancelling..." : "Cancel schedule"}
            </button>
          </>
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
        <Toast content={toast.content} error={toast.error} onDismiss={() => setToast(null)} />
      )}

      <Modal
        open={quickCreateModalOpen}
        onClose={() => setQuickCreateModalOpen(false)}
        title="Create a new blog"
        primaryAction={{
          content: 'Create',
          onAction: handleQuickCreateBlog,
          loading: isCreatingBlog,
          disabled: !newBlogTitle.trim()
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setQuickCreateModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <TextField
            label="Blog title"
            value={newBlogTitle}
            onChange={setNewBlogTitle}
            autoComplete="off"
            autoFocus
          />
        </Modal.Section>
      </Modal>

    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "San Francisco", "Segoe UI", Roboto, "Helvetica Neue", sans-serif' }}>
      <Page
        fullWidth
        backAction={{ content: "Articles", onAction: () => navigate("/posts") }}
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
              {/* Title — matching native Shopify Title card */}
              <Card>
                <Box padding="400">
                  <TextField
                    label="Title"
                    value={post.title}
                    onChange={handleTitleChange}
                    placeholder="e.g. What Makes Auram Dhoop Cones Truly Divine"
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
                      <Text variant="headingSm" as="h2">Content</Text>
                    </InlineStack>
                  </Box>
                  <Divider />
                  <Box padding="0">
                    <DragDropBuilderContainer
                      initialBlocksAst={post.contentJson || []}
                      onChange={(blocksAst) => {
                        setPost((p) => {
                          if (JSON.stringify(p.contentJson) === JSON.stringify(blocksAst)) return p;
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

                {/* Excerpt — matching native Shopify Rich Text Editor Excerpt card */}
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h2">Excerpt</Text>
                      <Text variant="bodySm" tone="subdued">
                        Add a summary of the post to appear on your home page or blog.
                      </Text>
                      <ExcerptRichTextEditor
                        value={post.excerpt || ""}
                        onChange={handleField("excerpt")}
                        placeholder="Add a summary..."
                      />
                    </BlockStack>
                  </Box>
                </Card>

                {/* Search engine listing — exact native Shopify design */}
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingSm" as="h2">Search engine listing</Text>
                        <Button
                          icon={EditIcon}
                          variant="tertiary"
                          onClick={() => setSeoExpanded((v) => !v)}
                          accessibilityLabel="Edit search engine listing"
                        />
                      </InlineStack>

                      {/* Google Search Snippet Preview Box matching Shopify screenshot 1 */}
                      <BlockStack gap="100">
                        <Text variant="bodySm" tone="subdued">
                          {window.shopify?.config?.shop ? window.shopify.config.shop.replace(".myshopify.com", "") : "rajiv market shop"}
                        </Text>
                        <Text variant="bodySm" tone="subdued">
                          https://{window.shopify?.config?.shop || "rajiv-market-shop.myshopify.com"} › blogs › {shopifyBlogs.find((b) => String(b.id) === String(shopifyBlogId))?.handle || "news"} › {post.slug || ""}
                        </Text>
                        <div style={{ color: "#1a0dab", fontSize: "18px", lineHeight: "24px", fontWeight: "400", cursor: "pointer" }}>
                          {seoData.metaTitle || post.title || "ABC Template"}
                        </div>
                        {seoData.metaDescription ? (
                          <div style={{ color: "#4d5156", fontSize: "14px", lineHeight: "20px", wordBreak: "break-word" }}>
                            {stripHtml(seoData.metaDescription)}
                          </div>
                        ) : null}
                      </BlockStack>

                      {seoExpanded && (
                        <>
                          <Divider />
                          <BlockStack gap="400">
                            {/* Page Title */}
                            <BlockStack gap="100">
                              <TextField
                                label="Page title"
                                value={seoData.metaTitle !== undefined && seoData.metaTitle !== "" ? seoData.metaTitle : (post.title || "")}
                                onChange={(val) => setSeoData((s) => ({ ...s, metaTitle: val }))}
                                maxLength={70}
                                autoComplete="off"
                              />
                              <Text variant="bodySm" tone="subdued">
                                {`${(seoData.metaTitle !== undefined && seoData.metaTitle !== "" ? seoData.metaTitle : (post.title || "")).length} of 70 characters used`}
                              </Text>
                            </BlockStack>

                            {/* Meta Description */}
                            <BlockStack gap="100">
                              <TextField
                                label="Meta description"
                                value={seoData.metaDescription || ""}
                                onChange={(val) => setSeoData((s) => ({ ...s, metaDescription: val }))}
                                multiline={4}
                                maxLength={160}
                                autoComplete="off"
                              />
                              <Text variant="bodySm" tone="subdued">
                                {`${(seoData.metaDescription || "").length} of 160 characters used`}
                              </Text>
                            </BlockStack>

                            {/* URL Handle */}
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
                                value={post.slug || ""}
                                onChange={handleField("slug")}
                                prefix={`blogs/${shopifyBlogs.find((b) => String(b.id) === String(shopifyBlogId))?.handle || "news"}/`}
                                helpText={`https://${window.shopify?.config?.shop || "rajiv-market-shop.myshopify.com"}/blogs/${shopifyBlogs.find((b) => String(b.id) === String(shopifyBlogId))?.handle || "news"}/${post.slug || ""}`}
                                autoComplete="off"
                              />
                            </div>

                            {/* Rich snippet / structured data */}
                            <BlockStack gap="100">
                              <Select
                                label="Rich snippet/structured data"
                                options={RICH_SNIPPET_OPTIONS}
                                value={seoData.richSnippetType}
                                onChange={(val) => setSeoData((s) => ({ ...s, richSnippetType: val }))}
                              />
                              <Text variant="bodySm" tone="subdued">
                                Controls the JSON-LD schema type published with this article for Google rich results. Choose "None" to disable structured data for this article.
                              </Text>
                            </BlockStack>

                            {/* Meta Robots */}
                            <BlockStack gap="100">
                              <Select
                                label="Meta robots"
                                options={META_ROBOTS_OPTIONS}
                                value={metaRobotsValueFromFlags(seoData.metaRobotsNoindex, seoData.metaRobotsNofollow)}
                                onChange={(val) => setSeoData((s) => ({
                                  ...s,
                                  metaRobotsNoindex: val.startsWith("NOINDEX"),
                                  metaRobotsNofollow: val.endsWith("NOFOLLOW"),
                                }))}
                              />
                              {metaRobotsActive === false ? (
                                <Banner tone="warning" title="One-time setup needed">
                                  <BlockStack gap="200">
                                    <Text variant="bodySm" as="p">
                                      Activate the "Blog Meta Robots" app embed so this selection
                                      renders on the live page. One click, applies to every
                                      article from then on.
                                    </Text>
                                    <InlineStack>
                                      <Button
                                        size="slim"
                                        url={metaRobotsActivateUrl(window.shopify?.config?.shop || "")}
                                        target="_blank"
                                      >
                                        Activate now
                                      </Button>
                                    </InlineStack>
                                  </BlockStack>
                                </Banner>
                              ) : (
                                <Text variant="bodySm" tone="subdued">
                                  Renders a matching &lt;meta name="robots"&gt; tag on the live article page.
                                </Text>
                              )}
                            </BlockStack>
                          </BlockStack>
                        </>
                      )}
                    </BlockStack>
                  </Box>
                </Card>

                {/* Custom CSS (plan-gated) */}
                {features.custom_css?.enabled && (
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="300">
                        <Text variant="headingSm" as="h2">Custom CSS</Text>
                        <TextField
                          label="Custom CSS"
                          labelHidden
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
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h2">Visibility</Text>
                      <BlockStack gap="200">
                        <RadioButton
                          label="Hidden (Draft)"
                          checked={visibilityMode === "draft"}
                          id="visibility-draft"
                          name="visibility"
                          onChange={() => { setVisibilityMode("draft"); handleField("status")("draft"); }}
                        />
                        <RadioButton
                          label="Publish immediately"
                          helpText={
                            post.status === "published" && post.publishedAt
                              ? `As of ${formatInShopTz(post.publishedAt)} (${shopTimezone})`
                              : null
                          }
                          checked={visibilityMode === "publish_now"}
                          id="visibility-publish-now"
                          name="visibility"
                          onChange={() => { setVisibilityMode("publish_now"); handleField("status")("published"); }}
                        />
                        <RadioButton
                          label="Schedule for later"
                          helpText={
                            post.status === "scheduled" && post.publishedAt
                              ? `Scheduled for ${formatInShopTz(post.publishedAt)} (${shopTimezone})`
                              : null
                          }
                          checked={visibilityMode === "schedule"}
                          id="visibility-schedule"
                          name="visibility"
                          onChange={() => setVisibilityMode("schedule")}
                        />
                      </BlockStack>

                      {visibilityMode === "schedule" && (
                        <BlockStack gap="200">
                          <Popover
                            active={isSchedulePickerOpen}
                            activator={
                              <Button
                                onClick={() => setIsSchedulePickerOpen((v) => !v)}
                                icon={CalendarIcon}
                                disclosure
                              >
                                {scheduleDate ? DateTime.fromJSDate(scheduleDate).toFormat("MMMM d, yyyy") : "Pick a date"}
                              </Button>
                            }
                            onClose={() => setIsSchedulePickerOpen(false)}
                          >
                            <Box padding="300">
                              <DatePicker
                                month={scheduleMonth}
                                year={scheduleYear}
                                selected={scheduleDate}
                                onMonthChange={(month, year) => { setScheduleMonth(month); setScheduleYear(year); }}
                                onChange={({ start }) => { setScheduleDate(start); setIsSchedulePickerOpen(false); }}
                                disableDatesBefore={(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })()}
                              />
                            </Box>
                          </Popover>
                          <TextField
                            label="Time"
                            type="time"
                            value={scheduleTime}
                            onChange={setScheduleTime}
                            autoComplete="off"
                            error={isScheduledInPast ? "This time has already passed." : undefined}
                          />
                          <Text variant="bodySm" tone={isScheduledInPast ? "critical" : "subdued"}>
                            {isScheduledInPast
                              ? "Pick a date and time that's still in the future — this one has already passed."
                              : scheduledAtUtc
                                ? `Will go live ${formatInShopTz(scheduledAtUtc)} (${shopTimezone})`
                                : "Pick a date and time above."}
                          </Text>
                          <Button
                            variant="primary"
                            onClick={handleSchedule}
                            loading={isScheduling}
                            disabled={!scheduledAtUtc || !shopifyBlogId || isScheduledInPast}
                          >
                            {post.status === "scheduled" ? "Update schedule" : "Schedule"}
                          </Button>
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Box>
                </Card>

                {/* ── Image (Featured Image) ── */}
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingSm" as="h2">Image</Text>
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
                          <div>
                            <Button
                              tone="critical"
                              variant="plain"
                              onClick={() => handleField("featuredImage")("")}
                              size="slim"
                            >
                              Remove image
                            </Button>
                          </div>
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
                    </BlockStack>
                  </Box>
                </Card>

                {/* ── Organization ── */}
                <Card>
                  <Box padding="400">
                    <BlockStack gap="400">
                      <Text variant="headingSm" as="h2">Organization</Text>
                      <TextField
                        label="Author"
                        value={post.author || ""}
                        onChange={handleField("author")}
                        autoComplete="off"
                      />
                      {/* Blog — Shopify-style searchable Combobox */}
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="medium" as="label">
                          Blog
                        </Text>
                        <Combobox
                          activator={
                            <Combobox.TextField
                              prefix={null}
                              onChange={(val) => setBlogSearchValue(val)}
                              label="Blog"
                              labelHidden
                              value={blogSearchValue !== "" ? blogSearchValue : (shopifyBlogs.find((b) => String(b.id) === String(shopifyBlogId))?.title || "")}
                              placeholder="Search blogs"
                              autoComplete="off"
                              onFocus={() => setBlogSearchValue("")}
                            />
                          }
                        >
                          {shopifyBlogs.length > 0 && (
                            <Listbox
                              onSelect={(val) => {
                                if (val === "CREATE_NEW") {
                                  setBlogSearchValue("");
                                  setNewBlogTitle("");
                                  setQuickCreateModalOpen(true);
                                } else {
                                  handleBlogChange(val);
                                  const selected = shopifyBlogs.find((b) => String(b.id) === val);
                                  setBlogSearchValue(selected?.title || "");
                                }
                              }}
                            >
                              {/* Blogs section header */}
                              <Listbox.Header>Blogs</Listbox.Header>

                              {/* Filtered blog list */}
                              {shopifyBlogs
                                .filter((b) =>
                                  !blogSearchValue ||
                                  b.title.toLowerCase().includes(blogSearchValue.toLowerCase())
                                )
                                .map((b) => (
                                  <Listbox.Option
                                    key={b.id}
                                    value={String(b.id)}
                                    selected={String(b.id) === String(shopifyBlogId)}
                                    accessibilityLabel={b.title}
                                  >
                                    <Listbox.TextOption selected={String(b.id) === String(shopifyBlogId)}>
                                      {b.title}
                                    </Listbox.TextOption>
                                  </Listbox.Option>
                                ))}

                              {/* Actions section */}
                              <Listbox.Header>Actions</Listbox.Header>
                              <Listbox.Option
                                value="CREATE_NEW"
                                accessibilityLabel="Create a new blog"
                              >
                                <Listbox.TextOption>
                                  + Create a new blog
                                </Listbox.TextOption>
                              </Listbox.Option>
                            </Listbox>
                          )}
                          {shopifyBlogs.length === 0 && (
                            <Listbox
                              onSelect={(val) => {
                                if (val === "CREATE_NEW") {
                                  setBlogSearchValue("");
                                  setNewBlogTitle("");
                                  setQuickCreateModalOpen(true);
                                }
                              }}
                            >
                              <Listbox.Header>Actions</Listbox.Header>
                              <Listbox.Option
                                value="CREATE_NEW"
                                accessibilityLabel="Create a new blog"
                              >
                                <Listbox.TextOption>
                                  + Create a new blog
                                </Listbox.TextOption>
                              </Listbox.Option>
                            </Listbox>
                          )}
                        </Combobox>
                      </BlockStack>
                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="medium">Tags</Text>
                        {parseTags(tags).length > 0 && (
                          <InlineStack gap="100" wrap>
                            {parseTags(tags).map((tag) => (
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
                              onChange={handleTagInputChange}
                              placeholder="Vintage, cotton, summer"
                              onKeyPress={(e) => e.key === "Enter" && addTag()}
                              autoComplete="off"
                            />
                          </div>
                          <Button onClick={addTag} variant="secondary">Add</Button>
                        </InlineStack>
                      </BlockStack>
                      <Select
                        label="Theme template"
                        options={[{ label: "Default blog post", value: "default" }]}
                        value={themeTemplate}
                        onChange={setThemeTemplate}
                      />
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
                        <Text variant="headingSm" tone="critical" as="h2">Delete article</Text>
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
                        <div>
                          <Button
                            tone="critical"
                            variant="secondary"
                            loading={isDeleting}
                            onClick={handleDelete}
                          >
                            Delete article
                          </Button>
                        </div>
                      </BlockStack>
                    </Box>
                  </Card>
                )}

              </BlockStack>
            </Layout.Section>
          </Layout>
        </div>
      </Page>
    </div>


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

      {/* ─── Schedule-a-live-article Warning Modal ─── */}
      <ConfirmActionModal
        open={showScheduleLiveWarning}
        title="This article is currently live"
        body={
          <Text as="p" variant="bodyMd">
            Scheduling it will take it <strong>offline immediately</strong> until{" "}
            {scheduledAtUtc ? formatInShopTz(scheduledAtUtc) : "the new date"} ({shopTimezone}) —
            Shopify doesn't support keeping an article live while a new publish date is pending.
          </Text>
        }
        confirmText="Take offline and schedule"
        confirmTone="critical"
        onConfirm={doSchedule}
        error={scheduleModalError}
        onCancel={() => { setShowScheduleLiveWarning(false); setScheduleModalError(null); }}
        loading={isScheduling}
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
