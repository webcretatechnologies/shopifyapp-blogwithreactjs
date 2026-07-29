/**
 * BlockRegistry.jsx
 *
 * Central registry of every block type in the Builder.
 * Each entry defines:
 *   label           — display name shown in the block picker
 *   icon            — JSX icon element
 *   category        — 'layout' | 'content' | 'commerce' | 'media' | 'legacy'
 *   allowsChildren  — true for Section (the only container block)
 *   defaultSettings — initial settings when a new block of this type is created
 *   PreviewComponent — React component for the canvas preview
 *     Props: { block: { id, type, settings }, isSelected }
 *
 * Commerce block PreviewComponents reuse the existing *BlockPreview components
 * that already ship with the classic editor blocks — zero duplication.
 */

import { Icon } from "@shopify/polaris";
import {
  LayoutSectionIcon,
  CartIcon,
  ProductListIcon,
  CollectionIcon,
  ButtonIcon,
  ButtonPressIcon,
  ImageWithTextOverlayIcon,
  LayoutColumns2Icon,
  PlayCircleIcon,
  CodeAddIcon,
  MeasurementSizeIcon,
  SettingsIcon,
  DragHandleIcon,
  LightbulbIcon,
  TextTitleIcon,
  DataTableIcon,
  TextAlignLeftIcon,
} from "@shopify/polaris-icons";

// -- Reuse existing block preview/settings components from the classic editor --
import {
  BuyButtonBlockPreview,
  BuyButtonBlockSettings,
} from "../editor/blocks/BuyButtonBlock";
import {
  ProductGridBlockPreview,
  ProductGridBlockSettings,
} from "../editor/blocks/ProductGridBlock";
import {
  CollectionBlockPreview,
  CollectionBlockSettings,
} from "../editor/blocks/CollectionBlock";
import {
  ProductSliderBlockPreview,
  ProductSliderBlockSettings,
} from "../editor/blocks/ProductSliderBlock";
import {
  CTAButtonBlockPreview,
  CTAButtonBlockSettings,
} from "../editor/blocks/CTAButtonBlock";
import {
  HeroBlockPreview,
  HeroBlockSettings,
} from "../editor/blocks/HeroBlock";
import {
  VideoBlockPreview,
  VideoBlockSettings,
} from "../editor/blocks/VideoBlock";
import {
  SpacerBlockPreview,
  SpacerBlockSettings,
} from "../editor/blocks/SpacerBlock";

// -- Builder-specific block previews (defined below) --
import { SectionBlockPreview } from "./blocks/core/SectionBlock";
import { RichTextBlockPreview } from "./blocks/RichTextBlock";
import { HeadingBlockPreview } from "./blocks/HeadingBlock";
import { DividerBlockPreview } from "./blocks/DividerBlock";
import { SpacerBuilderPreview } from "./blocks/SpacerBuilderBlock";
import { ImageBuilderPreview } from "./blocks/ImageBuilderBlock";
import { HtmlBuilderPreview } from "./blocks/HtmlBuilderBlock";

const I = (source) => (
  <Icon source={source} />
);

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const BlockRegistry = {
  // ── Layout ──────────────────────────────────────────────────────────────
  Section: {
    label: "Section",
    icon: I(LayoutSectionIcon),
    category: "layout",
    allowsChildren: true,
    defaultSettings: {
      backgroundColor: "#ffffff",
      paddingTop: "40px",
      paddingBottom: "40px",
      paddingLeft: "24px",
      paddingRight: "24px",
      maxWidth: "100%",
      borderRadius: "0px",
    },
    PreviewComponent: SectionBlockPreview,
  },

  ColumnLayout: {
    label: "Columns",
    icon: <Icon source={LayoutColumns2Icon} />,
    category: "layout",
    allowsChildren: true,
    defaultSettings: {
      columns: 2,
      gap: "16px",
    },
    PreviewComponent: ({ block }) => (
      <div style={{ padding: "4px 8px 0" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#8c9196", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Columns Container ({block.children?.length || block.settings?.columns || 2} Columns)
        </div>
      </div>
    ),
  },

  Column: {
    label: "Column",
    icon: <Icon source={LayoutColumns2Icon} />,
    category: "layout",
    allowsChildren: true,
    defaultSettings: {
      width: "100%",
    },
    PreviewComponent: () => null,
  },

  // ── Content ─────────────────────────────────────────────────────────────
  RichText: {
    label: "Text",
    icon: <Icon source={TextAlignLeftIcon} />,
    category: "content",
    allowsChildren: false,
    defaultSettings: {
      content: { type: "doc", content: [{ type: "paragraph" }] },
    },
    PreviewComponent: RichTextBlockPreview,
  },

  Heading: {
    label: "Heading",
    icon: <Icon source={TextTitleIcon} />,
    category: "content",
    allowsChildren: false,
    defaultSettings: {
      text: "Your Heading",
      level: 2,
      align: "left",
      color: "#202223",
      fontSize: "",
    },
    PreviewComponent: HeadingBlockPreview,
  },

  Divider: {
    label: "Divider",
    icon: <Icon source={DragHandleIcon} />,
    category: "content",
    allowsChildren: false,
    defaultSettings: {
      style: "solid",
      color: "#e1e3e5",
      thickness: "1px",
      width: "100%",
      marginTop: "16px",
      marginBottom: "16px",
    },
    PreviewComponent: DividerBlockPreview,
  },

  Spacer: {
    label: "Spacer",
    icon: <Icon source={MeasurementSizeIcon} />,
    category: "content",
    allowsChildren: false,
    defaultSettings: { height: "40px" },
    PreviewComponent: SpacerBuilderPreview,
  },

  Callout: {
    label: "Callout",
    icon: <Icon source={LightbulbIcon} />,
    category: "content",
    allowsChildren: false,
    defaultSettings: {
      type: "info",
      title: "Did you know?",
      body: "Add a callout message here.",
      emoji: "💡",
      backgroundColor: "#fdfbc8",
      borderColor: "#eab308",
    },
    PreviewComponent: ({ block }) => (
      <div
        style={{
          backgroundColor: block.settings.backgroundColor || "#fdfbc8",
          borderLeft: `4px solid ${block.settings.borderColor || "#eab308"}`,
          padding: "12px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          borderRadius: "4px",
        }}
      >
        <span style={{ fontSize: "24px" }}>{block.settings.emoji || "💡"}</span>
        <div>
          <strong style={{ display: "block", marginBottom: "4px" }}>{block.settings.title}</strong>
          <span style={{ color: "#4a4a4a" }}>{block.settings.body}</span>
        </div>
      </div>
    ),
  },

  Image: {
    label: "Image",
    icon: <Icon source={ImageWithTextOverlayIcon} />,
    category: "media",
    allowsChildren: false,
    defaultSettings: {
      src: "",
      alt: "",
      width: "100%",
      alignment: "center",
      borderRadius: 0,
      linkUrl: "",
      linkTarget: "_self",
      caption: "",
    },
    PreviewComponent: ImageBuilderPreview,
  },

  // ── Media ────────────────────────────────────────────────────────────────
  VideoEmbed: {
    label: "Video",
    icon: <Icon source={PlayCircleIcon} />,
    category: "media",
    allowsChildren: false,
    defaultSettings: {
      url: "",
      caption: "",
      aspectRatio: "56.25%",
      maxWidth: "100%",
    },
    PreviewComponent: ({ block }) => (
      <VideoBlockPreview block={block.settings} isSelected={false} />
    ),
  },

  VideoBlock: {
    label: "Video Player",
    icon: <Icon source={PlayCircleIcon} />,
    category: "media",
    allowsChildren: false,
    defaultSettings: {
      url: "",
      caption: "",
      aspectRatio: "56.25%",
      maxWidth: "100%",
    },
    PreviewComponent: ({ block }) => (
      <VideoBlockPreview block={block.settings} isSelected={false} />
    ),
  },

  Html: {
    label: "HTML / Liquid",
    icon: <Icon source={CodeAddIcon} />,
    category: "content",
    allowsChildren: false,
    defaultSettings: { code: "" },
    PreviewComponent: HtmlBuilderPreview,
  },

  // ── Commerce ─────────────────────────────────────────────────────────────
  BuyButton: {
    label: "Buy Button",
    icon: <Icon source={CartIcon} />,
    category: "commerce",
    allowsChildren: false,
    defaultSettings: {
      product: null,
      layout: "horizontal",
      imageSize: "120px",
      maxWidth: "320px",
      showPrice: true,
      showDescription: false,
      showBadge: false,
      badge: "FEATURED",
      buttonText: "Add to Cart",
      buttonColor: "#008060",
    },
    PreviewComponent: ({ block }) => (
      <BuyButtonBlockPreview block={block.settings} isSelected={false} />
    ),
  },

  ProductGrid: {
    label: "Product Grid",
    icon: <Icon source={ProductListIcon} />,
    category: "commerce",
    allowsChildren: false,
    defaultSettings: {
      title: "",
      titleAlign: "left",
      searchQuery: "",
      manualProducts: [],
      columns: "3",
      maxProducts: "12",
      cardStyle: "shadow",
      gap: "16px",
      showPrice: true,
      showButton: true,
      buttonText: "Add to Cart",
      buttonColor: "#008060",
    },
    PreviewComponent: ({ block }) => (
      <ProductGridBlockPreview block={block.settings} isSelected={false} />
    ),
  },

  Collection: {
    label: "Collection",
    icon: <Icon source={CollectionIcon} />,
    category: "commerce",
    allowsChildren: false,
    defaultSettings: {
      heading: "",
      collectionHandle: "",
      layout: "grid",
      columns: "3",
      maxProducts: "8",
      showTitle: true,
      showViewAll: true,
      showPrice: true,
      showButton: true,
      buttonText: "Shop Now",
      buttonColor: "#008060",
    },
    PreviewComponent: ({ block }) => (
      <CollectionBlockPreview block={block.settings} isSelected={false} />
    ),
  },

  ProductSlider: {
    label: "Product Slider",
    icon: <Icon source={SettingsIcon} />,
    category: "commerce",
    allowsChildren: false,
    defaultSettings: {
      title: "",
      titleAlign: "left",
      searchQuery: "",
      manualProducts: [],
      cardStyle: "shadow",
      gap: "16px",
      showPrice: true,
      showButton: true,
      buttonText: "Add to Cart",
      buttonColor: "#008060",
    },
    PreviewComponent: ({ block }) => (
      <ProductSliderBlockPreview block={block.settings} isSelected={false} />
    ),
  },

  CTAButton: {
    label: "CTA Button",
    icon: <Icon source={ButtonIcon} />,
    category: "commerce",
    allowsChildren: false,
    defaultSettings: {
      text: "Shop Now",
      url: "",
      align: "center",
      color: "#008060",
      textColor: "#ffffff",
      size: "medium",
      borderRadius: "6px",
    },
    PreviewComponent: ({ block }) => (
      <CTAButtonBlockPreview block={block.settings} isSelected={false} />
    ),
  },

  HeroSection: {
    label: "Hero Section",
    icon: <Icon source={LayoutSectionIcon} />,
    category: "commerce",
    allowsChildren: false,
    defaultSettings: {
      heading: "",
      subheading: "",
      backgroundImage: "",
      backgroundOverlay: true,
      overlayColor: "#000000",
      overlayOpacity: 0.4,
      align: "center",
      minHeight: "400px",
      textColor: "#ffffff",
      showCta: true,
      ctaText: "Shop Now",
      ctaUrl: "/",
      ctaColor: "#008060",
      ctaTextColor: "#ffffff",
    },
    PreviewComponent: ({ block }) => (
      <HeroBlockPreview block={block.settings} isSelected={false} />
    ),
  },

  ProductCard: {
    label: "Product Card",
    icon: <Icon source={ProductListIcon} />,
    category: "commerce",
    allowsChildren: false,
    defaultSettings: {
      productId: "",
      title: "Sample Product",
      price: "19.99",
      imageUrl: "",
      layout: "vertical",
      showImage: true,
      showPrice: true,
      showButton: true,
      buttonText: "Add to Cart",
      buttonColor: "#008060",
      borderRadius: 8,
      borderColor: "#e1e3e5",
    },
    PreviewComponent: ({ block }) => (
      <div style={{ padding: "8px 0", textAlign: block.settings.layout === 'vertical' ? 'center' : 'left' }}>
        {block.settings.showImage && <div style={{ height: "150px", background: block.settings.imageUrl ? `url(${block.settings.imageUrl}) center/contain no-repeat` : "#f4f6f8", marginBottom: "16px" }} />}
        <h3 style={{ margin: "0 0 8px" }}>{block.settings.title}</h3>
        {block.settings.showPrice && <p style={{ fontWeight: "bold", margin: "0 0 16px" }}>${block.settings.price}</p>}
        {block.settings.showButton && <button style={{ background: block.settings.buttonColor, color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", cursor: "pointer", width: block.settings.layout === 'vertical' ? '100%' : 'auto' }}>{block.settings.buttonText}</button>}
      </div>
    ),
  },

  ButtonBlock: {
    label: "Button",
    icon: <Icon source={ButtonPressIcon} />,
    category: "commerce",
    allowsChildren: false,
    defaultSettings: {
      text: "Click Here",
      url: "",
      alignment: "center",
      backgroundColor: "#000000",
      textColor: "#ffffff",
      borderRadius: 4,
    },
    PreviewComponent: ({ block }) => (
      <div style={{ textAlign: block.settings.alignment, padding: "4px 0" }}>
        <button style={{ background: block.settings.backgroundColor, color: block.settings.textColor, padding: "10px 20px", border: "none", borderRadius: `${block.settings.borderRadius}px`, fontWeight: "bold" }}>
          {block.settings.text}
        </button>
      </div>
    ),
  },

  Table: {
    label: "Table",
    icon: <Icon source={DataTableIcon} />,
    category: "content",
    allowsChildren: false,
    defaultSettings: {
      rows: 3,
      cols: 3,
      hasHeader: true,
      tableData: [
        ["Header 1", "Header 2", "Header 3"],
        ["Cell", "Cell", "Cell"],
        ["Cell", "Cell", "Cell"],
        ["Cell", "Cell", "Cell"],
      ],
    },
    PreviewComponent: ({ block }) => {
      const data = block.settings.tableData || [];
      const hasHeader = block.settings.hasHeader;
      
      let theadRows = [];
      let tbodyRows = [];
      
      if (data.length > 0) {
        if (hasHeader) {
          theadRows = [data[0]];
          tbodyRows = data.slice(1);
        } else {
          tbodyRows = data;
        }
      }

      return (
        <div style={{ padding: "4px 0", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e1e3e5" }}>
            {theadRows.length > 0 && (
              <thead>
                {theadRows.map((row, rIndex) => (
                  <tr key={`th-${rIndex}`}>
                    {row.map((cell, cIndex) => (
                      <th key={cIndex} style={{ border: "1px solid #e1e3e5", padding: "8px", background: "#f4f6f8" }}>
                        <div dangerouslySetInnerHTML={{ __html: cell || "Header" }} />
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
            )}
            <tbody>
              {tbodyRows.map((row, rIndex) => (
                <tr key={`tb-${rIndex}`}>
                  {row.map((cell, cIndex) => (
                    <td key={cIndex} style={{ border: "1px solid #e1e3e5", padding: "8px" }}>
                      <div dangerouslySetInnerHTML={{ __html: cell || "Cell" }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All block types grouped by category for the block picker. */
export const BLOCK_CATEGORIES = [
  {
    label: "Layout",
    types: ["Section", "ColumnLayout"],
  },
  {
    label: "Content",
    types: ["RichText", "Heading", "Divider", "Spacer", "Callout", "Html", "Table"],
  },
  {
    label: "Media",
    types: ["Image", "VideoEmbed", "VideoBlock"],
  },
  {
    label: "Commerce",
    types: [
      "BuyButton",
      "ProductGrid",
      "Collection",
      "ProductSlider",
      "ProductCard",
      "CTAButton",
      "ButtonBlock",
      "HeroSection",
    ],
  },
];

/** Create a fresh block object for a given type. */
export function createBlock(type) {
  const resolvedType = normalizeBlockType(type);
  const entry = BlockRegistry[resolvedType];
  if (!entry) throw new Error(`Unknown block type: ${type}`);

  let children = [];
  if (resolvedType === "ColumnLayout") {
    const timestamp = Date.now();
    children = [
      { id: `block_${timestamp}_col1`, type: "Column", settings: {}, children: [] },
      { id: `block_${timestamp}_col2`, type: "Column", settings: {}, children: [] },
    ];
  }

  return {
    type: resolvedType,
    settings: JSON.parse(JSON.stringify(entry.defaultSettings)),
    children,
  };
}

// ---------------------------------------------------------------------------
// Type Alias Mapping & AST Normalizer
// ---------------------------------------------------------------------------

export const TYPE_ALIAS_MAP = {
  heading: "Heading",
  text: "RichText",
  paragraph: "RichText",
  richtext: "RichText",
  richText: "RichText",
  section: "Section",
  columns: "ColumnLayout",
  columnLayout: "ColumnLayout",
  column_layout: "ColumnLayout",
  column: "Column",
  Column: "Column",
  divider: "Divider",
  dividerBlock: "Divider",
  spacer: "Spacer",
  spacerBlock: "Spacer",
  callout: "Callout",
  calloutBlock: "Callout",
  image: "Image",
  imageBlock: "Image",
  video: "VideoEmbed",
  videoBlock: "VideoEmbed",
  videoEmbed: "VideoEmbed",
  videoEmbedBlock: "VideoEmbed",
  video_embed: "VideoEmbed",
  html: "Html",
  htmlBlock: "Html",
  liquid: "Html",
  html_liquid: "Html",
  buyButton: "BuyButton",
  buy_button: "BuyButton",
  productGrid: "ProductGrid",
  product_grid: "ProductGrid",
  product_sidebar: "ProductGrid",
  product: "ProductGrid",
  product_switcher: "ProductGrid",
  productCard: "ProductCard",
  product_card: "ProductCard",
  featured_product: "BuyButton",
  productSlider: "ProductSlider",
  product_slider: "ProductSlider",
  collection: "Collection",
  ctaButton: "CTAButton",
  cta_button: "CTAButton",
  buttonBlock: "CTAButton",
  headingBlock: "Heading",
  hero: "HeroSection",
  heroBlock: "HeroSection",
  heroSection: "HeroSection",
  hero_section: "HeroSection",
};

export function normalizeBlockType(type) {
  if (!type) return "RichText";
  if (BlockRegistry[type]) return type;
  if (TYPE_ALIAS_MAP[type]) return TYPE_ALIAS_MAP[type];
  const lower = type.toLowerCase();
  for (const key of Object.keys(BlockRegistry)) {
    if (key.toLowerCase() === lower) return key;
  }
  return type;
}

export function normalizeBlock(rawBlock) {
  if (!rawBlock || typeof rawBlock !== "object") return null;

  const type = normalizeBlockType(rawBlock.type);
  const entry = BlockRegistry[type] || BlockRegistry.RichText;
  const defaultSettings = entry.defaultSettings || {};

  let settings = { ...defaultSettings };

  // If block already has settings object
  if (rawBlock.settings && typeof rawBlock.settings === "object") {
    settings = { ...settings, ...rawBlock.settings };
  }

  // Handle flat legacy fields based on resolved type
  if (type === "Heading") {
    if (rawBlock.content || rawBlock.text) settings.text = rawBlock.text || rawBlock.content;
    if (rawBlock.level) {
      settings.level = typeof rawBlock.level === "string" 
        ? parseInt(rawBlock.level.replace(/\D/g, "")) || 2 
        : rawBlock.level;
    }
    if (rawBlock.align) settings.align = rawBlock.align;
    if (rawBlock.color) settings.color = rawBlock.color;
  } else if (type === "RichText") {
    if (rawBlock.content && !rawBlock.settings?.content) {
      settings.content = rawBlock.content;
    }
  } else if (type === "ProductGrid") {
    if (rawBlock.product && (!settings.manualProducts || !settings.manualProducts.length)) {
      settings.manualProducts = [rawBlock.product];
    }
    if (rawBlock.manualProducts) settings.manualProducts = rawBlock.manualProducts;
    if (rawBlock.title) settings.title = rawBlock.title;
    if (rawBlock.searchQuery) settings.searchQuery = rawBlock.searchQuery;
    if (rawBlock.columns) settings.columns = String(rawBlock.columns);
  } else if (type === "Image") {
    if (rawBlock.src) settings.src = rawBlock.src;
    if (rawBlock.alt) settings.alt = rawBlock.alt;
    if (rawBlock.width) settings.width = rawBlock.width;
    if (rawBlock.caption) settings.caption = rawBlock.caption;
  } else if (type === "Divider") {
    if (rawBlock.style) settings.style = rawBlock.style;
    if (rawBlock.color) settings.color = rawBlock.color;
    if (rawBlock.margin) {
      settings.marginTop = rawBlock.margin;
      settings.marginBottom = rawBlock.margin;
    }
  } else if (type === "Spacer") {
    if (rawBlock.height) settings.height = rawBlock.height;
  } else if (type === "Callout") {
    if (rawBlock.title) settings.title = rawBlock.title;
    if (rawBlock.body) settings.body = rawBlock.body;
    if (rawBlock.emoji) settings.emoji = rawBlock.emoji;
  } else if (type === "Html") {
    if (rawBlock.code || rawBlock.content) settings.code = rawBlock.code || rawBlock.content;
  } else if (type === "ColumnLayout") {
    if (rawBlock.columns) settings.columns = parseInt(rawBlock.columns) || 2;
    if (rawBlock.gap) settings.gap = rawBlock.gap;
  }

  const children = Array.isArray(rawBlock.children)
    ? rawBlock.children.map(normalizeBlock).filter(Boolean)
    : [];

  return {
    id: rawBlock.id || `block_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    settings,
    children,
  };
}

export function normalizeBlocksAst(blocks) {
  if (!blocks) return [];
  if (typeof blocks === "string") {
    try {
      blocks = JSON.parse(blocks);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(blocks)) return [];
  return blocks.map(normalizeBlock).filter(Boolean);
}
