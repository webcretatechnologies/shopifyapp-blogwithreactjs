/**
 * Settings — Blog appearance and behavior configuration, organized by tab:
 * Appearance, Content & Display, SEO, and Advanced.
 */
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Select,
  TextField,
  FormLayout,
  Divider,
  Toast,
  Frame,
  Box,
  Badge,
  Checkbox,
  Tabs,
  Banner,
  InlineGrid,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  DataTable,
  Spinner,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { TitleBar } from "@shopify/app-bridge-react";
import { smartBackAction } from "../utils/smartBack";
import { metaRobotsActivateUrl } from "../utils/themeEmbedUtils";
import EmbedRequirementBanner from "../components/EmbedRequirementBanner";
import UpgradePrompt from "../components/UpgradePrompt";
import ConfirmActionModal from "../components/ConfirmActionModal";
import ShopifyFilePicker from "../components/ShopifyFilePicker";
import { APP_NAME } from "../utils/appName";

const LAYOUT_OPTIONS = [
  { label: "Full width", value: "full" },
  { label: "Custom width", value: "custom" },
  { label: "Centered (max 800px)", value: "centered" },
  { label: "Narrow (max 640px)", value: "narrow" },
];

const CUSTOM_WIDTH_MIN = 320;
const CUSTOM_WIDTH_MAX = 2400;

/** Returns an error message when custom width is required and invalid; otherwise null. */
function getCustomWidthError(blogLayout, rawWidth) {
  if (blogLayout !== "custom") return null;
  const trimmed = String(rawWidth ?? "").trim();
  if (!trimmed) return `Enter a width between ${CUSTOM_WIDTH_MIN} and ${CUSTOM_WIDTH_MAX} px.`;
  if (!/^\d+$/.test(trimmed)) return "Width must be a whole number of pixels.";
  const n = parseInt(trimmed, 10);
  if (n < CUSTOM_WIDTH_MIN || n > CUSTOM_WIDTH_MAX) {
    return `Width must be between ${CUSTOM_WIDTH_MIN} and ${CUSTOM_WIDTH_MAX} px.`;
  }
  return null;
}

const RELATED_POSTS_OPTIONS = ["2", "3", "4", "6", "8", "12"].map((n) => ({
  label: `${n} posts`,
  value: n,
}));

const RELATED_LAYOUT_OPTIONS = [
  { label: "Grid", value: "grid" },
  { label: "List", value: "list" },
  { label: "Slider", value: "slider" },
];

const RELATED_SOURCE_OPTIONS = [
  { label: "Smart match (category + tags)", value: "smart" },
  { label: "Same category", value: "category" },
  { label: "Random", value: "random" },
  { label: "Manual only", value: "manual" },
];

const SIDEBAR_POSITION_OPTIONS = [
  { label: "Right", value: "right" },
  { label: "Left", value: "left" },
];

const SIDEBAR_WIDTH_OPTIONS = [
  { label: "280 px", value: "280" },
  { label: "320 px", value: "320" },
  { label: "360 px", value: "360" },
];

const BLOG_LISTING_LAYOUTS = [
  { value: "featured_2", label: "Featured + 2 columns", hint: "First post full width, rest in two columns" },
  { value: "featured_left", label: "Featured left", hint: "Large post on the left, two stacked on the right" },
  { value: "featured_right", label: "Featured right", hint: "Two stacked on the left, large post on the right" },
  { value: "magazine", label: "Magazine", hint: "Wide featured post, then a 3-column grid" },
  { value: "grid_2", label: "2-column grid", hint: "Every post the same size" },
  { value: "grid_3", label: "3-column grid", hint: "Compact cards in three columns" },
  { value: "list", label: "List", hint: "Stacked rows, image on the left" },
];

function ListingLayoutMock({ layout }) {
  const box = (span = 1, tall = false) => (
    <div
      style={{
        gridColumn: span === 2 ? "span 2" : "auto",
        height: tall ? 28 : 18,
        borderRadius: 4,
        background: "#d2d5d8",
      }}
    />
  );
  const wrap = (cols, children) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 4,
      }}
    >
      {children}
    </div>
  );
  if (layout === "list") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", gap: 4 }}>
            <div style={{ width: 22, height: 16, borderRadius: 3, background: "#d2d5d8", flexShrink: 0 }} />
            <div style={{ flex: 1, height: 16, borderRadius: 3, background: "#e1e3e5" }} />
          </div>
        ))}
      </div>
    );
  }
  if (layout === "featured_left") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gridTemplateRows: "1fr 1fr", gap: 4, height: 40 }}>
        <div style={{ gridRow: "span 2", borderRadius: 3, background: "#d2d5d8" }} />
        {box()}
        {box()}
      </div>
    );
  }
  if (layout === "featured_right") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gridTemplateRows: "1fr 1fr", gap: 4, height: 40 }}>
        {box()}
        <div style={{ gridColumn: 2, gridRow: "1 / span 2", borderRadius: 3, background: "#d2d5d8" }} />
        {box()}
      </div>
    );
  }
  if (layout === "magazine") {
    return wrap(3, [box(2), box(), box(), box(), box()]);
  }
  if (layout === "grid_3") return wrap(3, [box(), box(), box(), box(), box(), box()]);
  if (layout === "grid_2") return wrap(2, [box(), box(), box(), box()]);
  return wrap(2, [box(2, true), box(), box()]);
}

const DEFAULT_SIDEBAR_WIDGETS = [
  { id: "related_1", type: "related_posts", enabled: true, settings: { title: "Related posts", count: 4, sourceMode: "smart" } },
  {
    id: "categories_1",
    type: "categories",
    enabled: true,
    settings: {
      title: "Categories",
      showCounts: true,
      showPosts: true,
      maxPosts: 3,
      sort: "name",
      includeCategoryIds: [],
    },
  },
  {
    id: "products_1",
    type: "products",
    enabled: false,
    settings: {
      title: "Products",
      source: "post_products",
      maxItems: 3,
      showImage: true,
      showPrice: true,
      ctaLabel: "View product",
      productHandles: [],
      productIds: [],
    },
  },
  {
    id: "rich_1",
    type: "rich_text",
    enabled: false,
    settings: { title: "About", body: "", style: "default", linkUrl: "", buttonText: "" },
  },
  {
    id: "cta_1",
    type: "image_cta",
    enabled: false,
    settings: {
      title: "",
      imageUrl: "",
      linkUrl: "",
      buttonText: "Learn more",
      caption: "",
      altText: "",
      openInNewTab: false,
      showButton: true,
      layout: "stacked",
    },
  },
];

const IMAGE_CTA_LAYOUTS = [
  { value: "stacked", label: "Stacked", hint: "Photo, then button" },
  { value: "overlay", label: "Overlay", hint: "Button on the photo" },
];

const CATEGORY_SORT_OPTIONS = [
  { label: "Name (A–Z)", value: "name" },
  { label: "Most posts", value: "count" },
];

const CATEGORY_MAX_POSTS_OPTIONS = ["1", "2", "3", "4", "5", "6"].map((n) => ({
  label: `${n} post${n === "1" ? "" : "s"}`,
  value: n,
}));

const PRODUCT_MAX_ITEMS_OPTIONS = ["1", "2", "3", "4", "5", "6"].map((n) => ({
  label: `${n} product${n === "1" ? "" : "s"}`,
  value: n,
}));

const PRODUCT_SOURCE_OPTIONS = [
  { label: "Products on this post", value: "post_products" },
  { label: "Manual picks", value: "manual" },
];

const RICH_TEXT_STYLES = [
  { value: "default", label: "Plain", hint: "Simple note" },
  { value: "callout", label: "Callout", hint: "Accent bar" },
  { value: "quote", label: "Quote", hint: "Italic excerpt" },
];

function richTextPreviewCopy(body) {
  const text = String(body || "").trim();
  return text || "Kitchen stories, recipes, and tips from our shop.";
}

/** Mini storefront mock of the sidebar rich-text widget — used as style tiles + live preview. */
function RichTextWidgetMock({
  title,
  body,
  style = "default",
  buttonText,
  showButton,
  primary = "#008060",
  textColor = "#202223",
  radius = 4,
  compact = false,
}) {
  const isCallout = style === "callout";
  const isQuote = style === "quote";
  const pad = compact ? 10 : 14;
  const bodyStyle = {
    margin: 0,
    fontSize: compact ? 11 : 13,
    lineHeight: 1.5,
    color: textColor,
    whiteSpace: "pre-wrap",
    fontStyle: isQuote ? "italic" : "normal",
  };
  const boxStyle = {
    ...(isCallout
      ? {
          background: "#f6f6f7",
          borderRadius: 8,
          padding: compact ? "8px 10px" : "10px 12px",
          borderLeft: `3px solid ${primary}`,
        }
      : isQuote
        ? {
            padding: compact ? "2px 0 2px 10px" : "2px 0 2px 12px",
            borderLeft: `3px solid ${primary}`,
          }
        : {}),
  };
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e1e3e5",
        borderRadius: 10,
        padding: pad,
        textAlign: "left",
      }}
    >
      {title ? (
        <div
          style={{
            fontWeight: 600,
            fontSize: compact ? 12 : 14,
            marginBottom: compact ? 8 : 10,
            color: textColor,
          }}
        >
          {title}
        </div>
      ) : null}
      <div style={boxStyle}>
        <p style={bodyStyle}>{richTextPreviewCopy(body)}</p>
        {showButton ? (
          <span
            style={{
              display: "inline-block",
              marginTop: compact ? 8 : 12,
              padding: compact ? "5px 10px" : "7px 12px",
              background: primary,
              color: "#fff",
              borderRadius: Number(radius) || 4,
              fontSize: compact ? 10 : 12,
              fontWeight: 600,
              fontStyle: "normal",
            }}
          >
            {buttonText || "Learn more"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SidebarOnBlogPreview({ children, position = "right", width = "320" }) {
  const sidebarFirst = String(position).toLowerCase() === "left";
  const sidebarPx = Math.min(360, Math.max(240, parseInt(width, 10) || 320));
  const columns = sidebarFirst
    ? `${sidebarPx}px minmax(0, 1fr)`
    : `minmax(0, 1fr) ${sidebarPx}px`;
  const article = (
    <div
      style={{
        padding: 16,
        background: "#fff",
        borderRight: sidebarFirst ? "none" : "1px solid #e1e3e5",
        borderLeft: sidebarFirst ? "1px solid #e1e3e5" : "none",
      }}
    >
      <Text as="p" variant="bodySm" tone="subdued">
        Article
      </Text>
      <div
        style={{
          height: 10,
          width: "78%",
          background: "#e1e3e5",
          borderRadius: 4,
          margin: "10px 0 8px",
        }}
      />
      <div style={{ height: 8, width: "100%", background: "#f1f2f3", borderRadius: 4, marginBottom: 6 }} />
      <div
        style={{
          height: 8,
          width: "92%",
          background: "#f1f2f3",
          borderRadius: 4,
          marginBottom: 6,
        }}
      />
      <div style={{ height: 8, width: "64%", background: "#f1f2f3", borderRadius: 4 }} />
    </div>
  );
  const sidebar = <div style={{ padding: 12 }}>{children}</div>;
  return (
    <BlockStack gap="200">
      <Text as="p" variant="bodySm" tone="subdued">
        How it looks on the blog (sample content)
      </Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: columns,
          gap: 0,
          border: "1px solid #e1e3e5",
          borderRadius: 10,
          overflow: "hidden",
          background: "#f6f6f7",
        }}
      >
        {sidebarFirst ? (
          <>
            {sidebar}
            {article}
          </>
        ) : (
          <>
            {article}
            {sidebar}
          </>
        )}
      </div>
    </BlockStack>
  );
}

const SAMPLE_RELATED = [
  "Stainless vs glass measuring cups",
  "How to store spices so they last",
  "Letter punch sets for kitchen tins",
  "Best dough dockers for pizza night",
  "Incense placement in a pooja room",
  "A baker’s guide to mixing bowls",
  "Choosing a rolling pin that lasts",
  "Weeknight masala for busy kitchens",
  "Cast iron vs carbon steel pans",
  "How to bloom spices for dal",
  "Gift sets for bakers",
  "Cleaning wooden spoons the right way",
];

const SAMPLE_CATEGORIES = [
  {
    name: "Recipes",
    count: 8,
    posts: [
      "Weeknight masala for busy kitchens",
      "How to bloom spices for dal",
      "A baker’s guide to mixing bowls",
      "Gift sets for bakers",
      "Cast iron vs carbon steel pans",
      "Cleaning wooden spoons the right way",
    ],
  },
  {
    name: "Kitchen tools",
    count: 5,
    posts: [
      "Stainless vs glass measuring cups",
      "Best dough dockers for pizza night",
      "Choosing a rolling pin that lasts",
      "Letter punch sets for kitchen tins",
      "How to store spices so they last",
      "Incense placement in a pooja room",
    ],
  },
];

const SAMPLE_PRODUCTS = [
  { title: "1/4\" Letter Punch Sets", price: "$24.00" },
  { title: "Cast iron dosa tawa", price: "$38.00" },
  { title: "Hand-forged dough docker", price: "$19.00" },
  { title: "Spice mill — brass", price: "$22.00" },
  { title: "Beech rolling pin", price: "$16.00" },
  { title: "Glass measuring cup set", price: "$14.00" },
];

function RelatedPostsWidgetMock({ title, count = 4, textColor = "#202223", hideTitle = false, compact = false }) {
  const wanted = Math.min(12, Math.max(1, parseInt(count, 10) || 4));
  const n = hideTitle || compact ? Math.min(compact ? 3 : 3, wanted) : wanted;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e1e3e5",
        borderRadius: 10,
        padding: hideTitle || compact ? 8 : 14,
        textAlign: "left",
      }}
    >
      {hideTitle ? null : (
        <div style={{ fontWeight: 600, fontSize: compact ? 12 : 14, marginBottom: compact ? 8 : 10, color: textColor }}>
          {title || "Related posts"}
        </div>
      )}
      {SAMPLE_RELATED.slice(0, n).map((label) => (
        <div
          key={label}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: "linear-gradient(135deg, #e8eeea 0%, #d4ddd4 100%)",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.35,
              color: textColor,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoriesWidgetMock({
  title,
  showCounts = true,
  showPosts = true,
  maxPosts = 3,
  textColor = "#202223",
  compact = false,
}) {
  const rows = compact ? SAMPLE_CATEGORIES.slice(0, 2) : SAMPLE_CATEGORIES;
  const n = Math.min(compact ? 2 : 6, Math.max(1, parseInt(maxPosts, 10) || 3));
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e1e3e5",
        borderRadius: 10,
        padding: compact ? 8 : 14,
        textAlign: "left",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: compact ? 12 : 14, marginBottom: compact ? 8 : 10, color: textColor }}>
        {title || "Categories"}
      </div>
      {rows.map((c) => (
        <div key={c.name} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: textColor }}>
            {c.name}
            {showCounts ? (
              <span style={{ fontWeight: 500, opacity: 0.65, fontSize: 12 }}>
                {" "}
                ({c.count ?? 0})
              </span>
            ) : null}
          </div>
          {showPosts && (c.posts || []).slice(0, n).map((p) => (
            <div
              key={p}
              style={{
                fontSize: 12,
                marginTop: 4,
                paddingLeft: 10,
                borderLeft: "2px solid #e1e3e5",
                color: textColor,
                opacity: 0.9,
              }}
            >
              {p}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ProductsWidgetMock({
  title,
  maxItems = 3,
  showImage = true,
  showPrice = true,
  ctaLabel = "View product",
  source = "post_products",
  primary = "#008060",
  textColor = "#202223",
  compact = false,
}) {
  const n = Math.min(compact ? 2 : 6, Math.max(1, parseInt(maxItems, 10) || 3));
  const items = SAMPLE_PRODUCTS.slice(0, n);
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e1e3e5",
        borderRadius: 10,
        padding: compact ? 8 : 14,
        textAlign: "left",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: compact ? 12 : 14, marginBottom: 4, color: textColor }}>
        {title || "Products"}
      </div>
      <div style={{ fontSize: 11, color: "#6d7175", marginBottom: 10 }}>
        {source === "manual" ? "Your picks" : "From this post"}
      </div>
      {items.map((item, i) => (
        <div key={`${item.title}-${i}`} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          {showImage ? (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 6,
                background: "linear-gradient(135deg, #e8eeea 0%, #d4ddd4 100%)",
                flexShrink: 0,
              }}
            />
          ) : null}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: textColor }}>{item.title}</div>
            {showPrice ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: primary }}>{item.price}</div>
            ) : null}
            {ctaLabel ? (
              <div
                style={{
                  fontSize: 11,
                  color: primary,
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                {ctaLabel}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ImageCtaSamplePhoto({ height = 88, showLabel = true }) {
  return (
    <div
      style={{
        height,
        borderRadius: 8,
        background: "linear-gradient(135deg, #c5d5c8 0%, #8fa894 50%, #6b7f72 100%)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        padding: 8,
        fontSize: 11,
        color: "#fff",
        fontWeight: 600,
      }}
    >
      {showLabel ? "Sample image" : null}
    </div>
  );
}

function ImageCtaButtonMock({ label, primary, radius, compact }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: compact ? "5px 10px" : "7px 12px",
        background: primary,
        color: "#fff",
        borderRadius: Number(radius) || 4,
        fontSize: compact ? 10 : 12,
        fontWeight: 600,
      }}
    >
      {label || "Learn more"}
    </span>
  );
}

function ImageCtaWidgetMock({
  title,
  imageUrl,
  buttonText,
  caption,
  layout = "stacked",
  showButton = true,
  primary = "#008060",
  textColor = "#202223",
  radius = 4,
  compact = false,
}) {
  const isOverlay = layout === "overlay";
  const pad = compact ? 10 : 14;
  const imgH = compact ? 64 : 96;
  const captionText = String(caption || "").trim() || "Spring bakeware — 20% off";
  const photo = imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      style={{
        width: "100%",
        height: imgH,
        objectFit: "cover",
        borderRadius: isOverlay ? 0 : 8,
        display: "block",
      }}
    />
  ) : (
    <ImageCtaSamplePhoto height={imgH} showLabel={!isOverlay} />
  );
  const button = showButton ? (
    <ImageCtaButtonMock
      label={buttonText}
      primary={primary}
      radius={radius}
      compact={compact}
    />
  ) : null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e1e3e5",
        borderRadius: 10,
        padding: pad,
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: compact ? 12 : 14,
          marginBottom: compact ? 8 : 10,
          color: textColor,
        }}
      >
        {title || "This week in the shop"}
      </div>
      {isOverlay ? (
        <div style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
          {photo}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: compact ? "10px 8px 8px" : "14px 10px 10px",
              background: "linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,.08))",
            }}
          >
            <div
              style={{
                color: "#fff",
                fontSize: compact ? 11 : 12,
                fontWeight: 600,
                marginBottom: button ? 8 : 0,
                lineHeight: 1.35,
              }}
            >
              {captionText}
            </div>
            {button}
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>{photo}</div>
          <div
            style={{
              fontSize: compact ? 11 : 12,
              lineHeight: 1.35,
              color: textColor,
              opacity: 0.85,
              marginBottom: button ? 10 : 0,
            }}
          >
            {captionText}
          </div>
          {button}
        </>
      )}
    </div>
  );
}

function ImageCtaImageField({ imageUrl, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasImage = !!String(imageUrl || "").trim();
  return (
    <BlockStack gap="200">
      <Text as="p" variant="bodyMd">
        Image
      </Text>
      {hasImage ? (
        <BlockStack gap="200">
          <div
            style={{
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid #e1e3e5",
            }}
          >
            <img
              src={imageUrl}
              alt=""
              style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }}
            />
          </div>
          <InlineStack gap="200">
            <Button onClick={() => setPickerOpen(true)}>Change image</Button>
            <Button tone="critical" onClick={() => onChange("")}>
              Remove
            </Button>
          </InlineStack>
        </BlockStack>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          style={{
            width: "100%",
            margin: 0,
            padding: "22px 12px",
            cursor: "pointer",
            background: "#f6f6f7",
            border: "1px dashed #c9cccf",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          <Text as="span" variant="bodySm" fontWeight="semibold">
            Choose from Shopify files
          </Text>
          <br />
          <Text as="span" variant="bodySm" tone="subdued">
            Browse your library or upload a new photo
          </Text>
        </button>
      )}
      <TextField
        label="Image URL"
        value={imageUrl || ""}
        onChange={onChange}
        placeholder="https://"
        helpText={
          hasImage
            ? "You can also paste a CDN link."
            : "Or paste a link if the photo isn’t in your Shopify library."
        }
        autoComplete="off"
      />
      <ShopifyFilePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => onChange(url || "")}
      />
    </BlockStack>
  );
}

function ImageCtaLayoutPicker({
  value,
  onChange,
  title,
  imageUrl,
  buttonText,
  caption,
  showButton,
  primary,
  textColor,
  radius,
  position,
  width,
}) {
  const selected = value === "overlay" ? "overlay" : "stacked";
  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodySm" fontWeight="medium">
        Layout
      </Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {IMAGE_CTA_LAYOUTS.map((opt) => {
          const isOn = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={isOn}
              style={{
                margin: 0,
                padding: 8,
                cursor: "pointer",
                background: isOn ? "#f1f8f5" : "#fff",
                border: `2px solid ${isOn ? primary : "#e1e3e5"}`,
                borderRadius: 10,
                boxShadow: isOn ? `0 0 0 1px ${primary}` : "none",
              }}
            >
              <ImageCtaWidgetMock
                title={title}
                imageUrl={imageUrl}
                buttonText={buttonText}
                caption={caption}
                layout={opt.value}
                showButton={showButton}
                primary={primary}
                textColor={textColor}
                radius={radius}
                compact
              />
              <div style={{ marginTop: 8, textAlign: "left" }}>
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  {opt.label}
                </Text>
                <br />
                <Text as="span" variant="bodySm" tone="subdued">
                  {opt.hint}
                </Text>
              </div>
            </button>
          );
        })}
      </div>
      <SidebarOnBlogPreview position={position} width={width}>
        <ImageCtaWidgetMock
          title={title}
          imageUrl={imageUrl}
          buttonText={buttonText}
          caption={caption}
          layout={selected}
          showButton={showButton}
          primary={primary}
          textColor={textColor}
          radius={radius}
        />
      </SidebarOnBlogPreview>
    </BlockStack>
  );
}

function RichTextStylePicker({
  value,
  onChange,
  title,
  body,
  buttonText,
  showButton,
  primary,
  textColor,
  radius,
  position,
  width,
}) {
  const selected = value || "default";
  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodySm" fontWeight="medium">
        Style
      </Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {RICH_TEXT_STYLES.map((opt) => {
          const isOn = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={isOn}
              style={{
                margin: 0,
                padding: 8,
                cursor: "pointer",
                background: isOn ? "#f1f8f5" : "#fff",
                border: `2px solid ${isOn ? primary : "#e1e3e5"}`,
                borderRadius: 10,
                boxShadow: isOn ? `0 0 0 1px ${primary}` : "none",
              }}
            >
              <RichTextWidgetMock
                title={title || "About"}
                body={body}
                style={opt.value}
                buttonText={buttonText}
                showButton={showButton}
                primary={primary}
                textColor={textColor}
                radius={radius}
                compact
              />
              <div style={{ marginTop: 8, textAlign: "left" }}>
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  {opt.label}
                </Text>
                <br />
                <Text as="span" variant="bodySm" tone="subdued">
                  {opt.hint}
                </Text>
              </div>
            </button>
          );
        })}
      </div>
      <SidebarOnBlogPreview position={position} width={width}>
        <RichTextWidgetMock
          title={title || "About"}
          body={body}
          style={selected}
          buttonText={buttonText}
          showButton={showButton}
          primary={primary}
          textColor={textColor}
          radius={radius}
        />
      </SidebarOnBlogPreview>
    </BlockStack>
  );
}

function parseSidebarWidgets(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* fall through */
  }
  return DEFAULT_SIDEBAR_WIDGETS;
}

const UNIQUE_WIDGET_TYPES = new Set(["related_posts", "recent_posts", "categories", "products"]);

const WIDGET_TYPE_LABELS = {
  related_posts: "Related posts",
  recent_posts: "Recent posts",
  categories: "Categories",
  products: "Products",
  rich_text: "Rich text",
  image_cta: "Image / CTA",
};

const SOURCE_MODE_LABELS = {
  smart: "Smart match",
  category: "Same category",
  random: "Random",
  manual: "Manual picks",
};

function widgetTypeLabel(type) {
  return WIDGET_TYPE_LABELS[type] || type;
}

function createSidebarWidget(type) {
  const id = `${type}_${Date.now()}`;
  if (type === "related_posts") {
    return { id, type, enabled: true, settings: { title: "Related posts", count: 4, sourceMode: "smart" } };
  }
  if (type === "recent_posts") {
    return { id, type, enabled: true, settings: { title: "Recent posts", count: 4 } };
  }
  if (type === "categories") {
    return {
      id,
      type,
      enabled: true,
      settings: {
        title: "Categories",
        showCounts: true,
        showPosts: true,
        maxPosts: 3,
        sort: "name",
        includeCategoryIds: [],
      },
    };
  }
  if (type === "products") {
    return {
      id,
      type,
      enabled: true,
      settings: {
        title: "Products",
        source: "post_products",
        maxItems: 3,
        showImage: true,
        showPrice: true,
        ctaLabel: "View product",
        productHandles: [],
        productIds: [],
        productTitles: [],
        productImages: [],
      },
    };
  }
  if (type === "rich_text") {
    return { id, type, enabled: true, settings: { title: "About", body: "", style: "default", linkUrl: "", buttonText: "" } };
  }
  return {
    id,
    type: "image_cta",
    enabled: true,
    settings: {
      title: "",
      imageUrl: "",
      linkUrl: "",
      buttonText: "Learn more",
      caption: "",
      altText: "",
      openInNewTab: false,
      showButton: true,
      layout: "stacked",
    },
  };
}

function widgetSummary(widget) {
  const s = widget.settings || {};
  if (!widget.enabled) return "Off";
  if (widget.type === "related_posts") {
    return `${s.count || 4} posts · ${SOURCE_MODE_LABELS[s.sourceMode] || SOURCE_MODE_LABELS.smart}`;
  }
  if (widget.type === "recent_posts") return `${s.count || 4} latest posts`;
  if (widget.type === "categories") {
    return s.showPosts !== false ? `With recent posts` : "Names only";
  }
  if (widget.type === "products") {
    if (s.source === "manual") {
      const n = Array.isArray(s.productHandles) ? s.productHandles.length : 0;
      return n ? `${n} picked` : "No products picked";
    }
    return "From each post";
  }
  if (widget.type === "rich_text") {
    const has = String(s.body || "").trim();
    return has ? (s.style === "callout" ? "Callout" : s.style === "quote" ? "Quote" : "Note") : "Add your text";
  }
  if (widget.type === "image_cta") {
    if (!String(s.imageUrl || "").trim()) return "Add a photo";
    return s.layout === "overlay" ? "Overlay" : "Stacked";
  }
  return "On";
}

function SidebarWidgetPreview({ widget, settings, compact = false }) {
  const s = widget.settings || {};
  const primary = settings.primaryColor || "#008060";
  const textColor = settings.textColor || "#202223";
  const radius = settings.buttonRadius;
  if (widget.type === "related_posts" || widget.type === "recent_posts") {
    return (
      <RelatedPostsWidgetMock
        title={s.title || (widget.type === "recent_posts" ? "Recent posts" : "Related posts")}
        count={s.count || 4}
        textColor={textColor}
        compact={compact}
      />
    );
  }
  if (widget.type === "categories") {
    return (
      <CategoriesWidgetMock
        title={s.title || "Categories"}
        showCounts={s.showCounts !== false}
        showPosts={s.showPosts !== false}
        maxPosts={s.maxPosts ?? 3}
        textColor={textColor}
        compact={compact}
      />
    );
  }
  if (widget.type === "products") {
    return (
      <ProductsWidgetMock
        title={s.title || "Products"}
        maxItems={s.maxItems ?? 3}
        showImage={s.showImage !== false}
        showPrice={s.showPrice !== false}
        ctaLabel={s.ctaLabel ?? "View product"}
        source={s.source || "post_products"}
        primary={primary}
        textColor={textColor}
        compact={compact}
      />
    );
  }
  if (widget.type === "rich_text") {
    return (
      <RichTextWidgetMock
        title={s.title || "About"}
        body={s.body}
        style={s.style || "default"}
        buttonText={s.buttonText}
        showButton={!!String(s.linkUrl || "").trim()}
        primary={primary}
        textColor={textColor}
        radius={radius}
        compact={compact}
      />
    );
  }
  if (widget.type === "image_cta") {
    return (
      <ImageCtaWidgetMock
        title={s.title}
        imageUrl={s.imageUrl}
        buttonText={s.buttonText}
        caption={s.caption}
        layout={s.layout || "stacked"}
        showButton={s.showButton !== false}
        primary={primary}
        textColor={textColor}
        radius={radius}
        compact={compact}
      />
    );
  }
  return null;
}

function CombinedSidebarPreview({ widgets, settings, position = "right", width = "320" }) {
  const on = (widgets || []).filter((w) => w && w.enabled);
  const sidebarFirst = String(position).toLowerCase() === "left";
  const sidebarPx = Math.min(360, Math.max(240, parseInt(width, 10) || 320));
  const columns = sidebarFirst
    ? `${sidebarPx}px minmax(0, 1fr)`
    : `minmax(0, 1fr) ${sidebarPx}px`;
  const article = (
    <div
      style={{
        padding: 16,
        background: "#fff",
        borderRight: sidebarFirst ? "none" : "1px solid #e1e3e5",
        borderLeft: sidebarFirst ? "1px solid #e1e3e5" : "none",
        minHeight: "100%",
      }}
    >
      <Text as="p" variant="bodySm" tone="subdued">
        Article
      </Text>
      <div style={{ height: 10, width: "78%", background: "#e1e3e5", borderRadius: 4, margin: "10px 0 8px" }} />
      <div style={{ height: 8, width: "100%", background: "#f1f2f3", borderRadius: 4, marginBottom: 6 }} />
      <div style={{ height: 8, width: "92%", background: "#f1f2f3", borderRadius: 4, marginBottom: 6 }} />
      <div style={{ height: 8, width: "64%", background: "#f1f2f3", borderRadius: 4, marginBottom: 6 }} />
      <div style={{ height: 8, width: "88%", background: "#f1f2f3", borderRadius: 4, marginBottom: 6 }} />
      <div style={{ height: 8, width: "70%", background: "#f1f2f3", borderRadius: 4 }} />
    </div>
  );
  const sidebar = (
    <div
      style={{
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: sidebarPx,
        maxWidth: "100%",
        boxSizing: "border-box",
        background: "#f6f6f7",
      }}
    >
      <Text as="p" variant="bodySm" tone="subdued">
        {sidebarPx} px
      </Text>
      {on.length ? (
        on.map((w) => (
          <SidebarWidgetPreview key={w.id || w.type} widget={w} settings={settings} compact />
        ))
      ) : (
        <Text as="p" variant="bodySm" tone="subdued">
          No widgets are on yet. Turn one on below.
        </Text>
      )}
    </div>
  );
  return (
    <BlockStack gap="200">
      <Text as="p" variant="bodySm" tone="subdued">
        Full sidebar preview · {sidebarPx} px {sidebarFirst ? "left" : "right"} · {on.length}{" "}
        widget{on.length === 1 ? "" : "s"} (sample content)
      </Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: columns,
          alignItems: "stretch",
          gap: 0,
          border: "1px solid #e1e3e5",
          borderRadius: 10,
          overflow: "hidden",
          background: "#f6f6f7",
        }}
      >
        {sidebarFirst ? (
          <>
            {sidebar}
            {article}
          </>
        ) : (
          <>
            {article}
            {sidebar}
          </>
        )}
      </div>
    </BlockStack>
  );
}

function patchSidebarWidget(widgetsJson, index, patch) {
  const list = parseSidebarWidgets(widgetsJson);
  if (!list[index]) return widgetsJson;
  list[index] = {
    ...list[index],
    ...patch,
    settings: { ...(list[index].settings || {}), ...(patch.settings || {}) },
  };
  return JSON.stringify(list);
}

const TABS = [
  { id: "appearance", content: "Appearance" },
  { id: "content", content: "Content & display" },
  { id: "seo", content: "SEO & sitemap" },
  { id: "advanced", content: "Advanced" },
];

// A single, reusable card-header pattern: title + optional trailing action/badge.
function SectionCard({ title, trailing, children }) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap={false} gap="300">
          <Text as="h2" variant="headingSm">{title}</Text>
          {trailing}
        </InlineStack>
        <Divider />
        {children}
      </BlockStack>
    </Card>
  );
}

const DEFAULT_SETTINGS = {
  primaryColor: "#008060",
  secondaryColor: "#005bd3",
  textColor: "#202223",
  buttonRadius: "4",
  blogLayout: "centered",
  blogLayoutCustomWidth: "1200",
  showReadingTime: true,
  showAuthor: true,
  showPublishedDate: true,
  showRelatedPosts: true,
  relatedPostsCount: "3",
  relatedPostsLayout: "grid",
  relatedPostsSourceMode: "smart",
  blogSidebarEnabled: false,
  blogSidebarPosition: "right",
  blogSidebarWidth: "320",
  blogSidebarHideOnMobile: false,
  blogSidebarSticky: true,
  blogListingLayout: "featured_2",
  blogSidebarWidgets: JSON.stringify(DEFAULT_SIDEBAR_WIDGETS),
  defaultAuthor: "",
  customHeaderCode: "",
  customFooterCode: "",
  showPoweredByBadge: false,
};

const SAVE_BAR_ID = "settings-save-bar";

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Snapshot of the last-loaded/last-saved settings — the baseline the contextual save bar
  // compares against to decide whether there are unsaved changes, and what Discard reverts to.
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [metaRobotsActive, setMetaRobotsActive] = useState(null); // null = checking
  const [themeSupportsAppEmbeds, setThemeSupportsAppEmbeds] = useState(true);
  const [isSyncingTheme, setIsSyncingTheme] = useState(false);
  const [selectedTab, setSelectedTab] = useState(() => {
    const tabParam = searchParams.get("tab");
    const idx = TABS.findIndex((t) => t.id === tabParam);
    return idx >= 0 ? idx : 0;
  });
  const [sitemapStatus, setSitemapStatus] = useState(null);
  const [isLoadingSitemap, setIsLoadingSitemap] = useState(true);
  const [features, setFeatures] = useState({});
  const [showUpgradeSaveConfirm, setShowUpgradeSaveConfirm] = useState(false);
  const [isSavingForUpgrade, setIsSavingForUpgrade] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [categoryBusyId, setCategoryBusyId] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [expandedWidgetId, setExpandedWidgetId] = useState(null);
  const [addWidgetType, setAddWidgetType] = useState("image_cta");
  const [showApplyLayoutConfirm, setShowApplyLayoutConfirm] = useState(false);
  const [isApplyingLayout, setIsApplyingLayout] = useState(false);

  const set = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  const customWidthError = getCustomWidthError(
    settings.blogLayout,
    settings.blogLayoutCustomWidth
  );
  const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings);
  const sidebarWidgets = parseSidebarWidgets(settings.blogSidebarWidgets);
  const sidebarOn =
    !!settings.blogSidebarEnabled && settings.blogSidebarEnabled !== "false";
  const relatedInSidebar = sidebarOn && sidebarWidgets.some((w) => w.type === "related_posts" && w.enabled);

  // Same problem/fix as posts/new.jsx's handleUpgradeNow: the default UpgradePrompt behavior
  // (navigate("/plans") directly) left the contextual save bar stuck visible on the Billing page
  // afterward, since a route change doesn't unmount it. Ask before discarding unsaved settings
  // rather than silently losing them, since Billing is enough of a detour that it shouldn't be a
  // surprise.
  const handleUpgradeNow = () => {
    if (isDirty) {
      setShowUpgradeSaveConfirm(true);
    } else {
      navigate("/plans");
    }
  };

  const confirmSaveThenUpgrade = async () => {
    setIsSavingForUpgrade(true);
    try {
      const ok = await handleSave();
      if (ok) {
        setShowUpgradeSaveConfirm(false);
        navigate("/plans");
      }
    } finally {
      setIsSavingForUpgrade(false);
    }
  };

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings: saved }) => {
        if (saved) {
          const merged = { ...DEFAULT_SETTINGS, ...saved };
          setSettings(merged);
          setOriginalSettings(merged);
        }
      })
      .catch(() => {})
      .finally(() => setIsFetching(false));
  }, []);

  const fetchMetaRobotsStatus = () => {
    fetch("/api/shop/setup-status")
      .then((r) => r.json())
      .then((data) => {
        setMetaRobotsActive(!!data.metaRobots?.active);
        setThemeSupportsAppEmbeds(data.themeSupportsAppEmbeds !== false);
      })
      .catch(() => setMetaRobotsActive(false));
  };

  useEffect(() => {
    fetchMetaRobotsStatus();
    fetch("/api/posts/plan/features")
      .then((r) => r.json())
      .then((d) => setFeatures(d.features || {}))
      .catch(() => {});
  }, []);

  const loadCategories = () => {
    setCategoriesLoading(true);
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  };

  useEffect(() => {
    if (selectedTab === 1 && features.blog_sidebar?.enabled) {
      loadCategories();
    }
  }, [selectedTab, features.blog_sidebar?.enabled]);

  // Re-check silently when the merchant switches back from the theme editor tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchMetaRobotsStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    fetch("/api/settings/sitemap-status")
      .then((r) => r.json())
      .then((data) => setSitemapStatus(data))
      .catch(() => setSitemapStatus({ sitemapUrl: "", posts: [] }))
      .finally(() => setIsLoadingSitemap(false));
  }, []);

  const handleSyncFromTheme = async () => {
    setIsSyncingTheme(true);
    try {
      const res = await fetch("/api/settings/theme-style-tokens");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read your theme's colors.");

      // Shape (button corner radius) — same fail-soft posture as colors: only applied when
      // the theme's schema confirmed the value, otherwise the existing setting is left untouched.
      // Font is no longer synced here at all — it's fetched live from the theme at publish
      // time (EditorContentCompiler.compileForStorefront), not a stored/editable setting.
      const shape = data.shape || {};

      setSettings((s) => ({
        ...s,
        primaryColor: data.colors?.primary || s.primaryColor,
        secondaryColor: data.colors?.secondary || s.secondaryColor,
        textColor: data.colors?.text || s.textColor,
        buttonRadius: typeof shape.buttonRadius === "number" ? String(shape.buttonRadius) : s.buttonRadius,
      }));
      setToast({
        content: `Pulled colors and shape from "${data.themeName}" — review below, then Save Settings to apply`,
      });
    } catch (err) {
      setToast({ content: err.message, error: true });
    } finally {
      setIsSyncingTheme(false);
    }
  };

  const updateSidebarWidget = (index, patch) => {
    setSettings((s) => ({
      ...s,
      blogSidebarWidgets: patchSidebarWidget(s.blogSidebarWidgets, index, patch),
    }));
  };

  const moveSidebarWidget = (index, dir) => {
    const list = [...sidebarWidgets];
    const nextIdx = index + dir;
    if (nextIdx < 0 || nextIdx >= list.length) return;
    [list[index], list[nextIdx]] = [list[nextIdx], list[index]];
    set("blogSidebarWidgets")(JSON.stringify(list));
  };

  const addSidebarWidget = () => {
    const type = addWidgetType || "image_cta";
    if (UNIQUE_WIDGET_TYPES.has(type) && sidebarWidgets.some((w) => w.type === type)) {
      setToast({ content: `${widgetTypeLabel(type)} is already in the sidebar.`, error: true });
      return;
    }
    const next = [...sidebarWidgets, createSidebarWidget(type)];
    set("blogSidebarWidgets")(JSON.stringify(next));
    setExpandedWidgetId(next[next.length - 1].id);
    setAddWidgetType("image_cta");
  };

  const removeSidebarWidget = (index) => {
    const list = sidebarWidgets.filter((_, i) => i !== index);
    set("blogSidebarWidgets")(JSON.stringify(list.length ? list : DEFAULT_SIDEBAR_WIDGETS));
    setExpandedWidgetId(null);
  };

  const applySidebarLayout = async () => {
    setIsApplyingLayout(true);
    try {
      if (isDirty) {
        const saved = await handleSave();
        if (!saved) return;
      }
      const res = await fetch("/api/settings/apply-sidebar-layout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't apply layout");
      setShowApplyLayoutConfirm(false);
      setToast({ content: `Updated the sidebar column on ${data.updated || 0} published post(s).` });
    } catch (e) {
      setToast({ content: e.message || "Apply failed", error: true });
    } finally {
      setIsApplyingLayout(false);
    }
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't create category");
      setNewCategoryName("");
      setToast({ content: `Created “${data.category?.name || name}”` });
      loadCategories();
    } catch (err) {
      setToast({ content: err.message, error: true });
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleRenameCategory = async (id) => {
    const name = editingCategoryName.trim();
    if (!name) return;
    setCategoryBusyId(id);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't rename category");
      setEditingCategoryId(null);
      setEditingCategoryName("");
      setToast({ content: "Category renamed" });
      loadCategories();
    } catch (err) {
      setToast({ content: err.message, error: true });
    } finally {
      setCategoryBusyId(null);
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete?.id) return;
    const id = categoryToDelete.id;
    setCategoryBusyId(id);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't delete category");
      setCategoryToDelete(null);
      setToast({ content: "Category deleted" });
      // Drop deleted id from any Categories widget include filter
      const list = parseSidebarWidgets(settings.blogSidebarWidgets).map((w) => {
        if (w.type !== "categories") return w;
        const ids = Array.isArray(w.settings?.includeCategoryIds)
          ? w.settings.includeCategoryIds.filter((x) => parseInt(x, 10) !== id)
          : [];
        return { ...w, settings: { ...(w.settings || {}), includeCategoryIds: ids } };
      });
      setSettings((s) => ({ ...s, blogSidebarWidgets: JSON.stringify(list) }));
      loadCategories();
    } catch (err) {
      setToast({ content: err.message, error: true });
    } finally {
      setCategoryBusyId(null);
    }
  };

  const handleSave = async () => {
    const widthError = getCustomWidthError(
      settings.blogLayout,
      settings.blogLayoutCustomWidth
    );
    if (widthError) {
      setToast({ content: widthError, error: true });
      return false;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      setOriginalSettings(settings);
      setToast({ content: "Settings saved successfully" });
      if (window.shopify?.saveBar) {
        try { await window.shopify.saveBar.hide(SAVE_BAR_ID); } catch (e) { }
      }
      return true;
    } catch (err) {
      setToast({ content: err.message || "Failed to save settings", error: true });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setSettings(originalSettings);
    if (window.shopify?.saveBar) {
      window.shopify.saveBar.hide(SAVE_BAR_ID).catch(() => { });
    }
  };

  // <ui-save-bar> is rendered unconditionally below (per Shopify's documented pattern) —
  // shopify.saveBar.show()/hide() is the *only* thing that controls its visibility. Mounting
  // it conditionally on isDirty and also imperatively calling show()/hide() at the same time
  // races the DOM mount against the API call; this was the actual bug.
  useEffect(() => {
    if (isFetching || !window.shopify?.saveBar) return;
    if (isDirty) {
      window.shopify.saveBar.show(SAVE_BAR_ID).catch(() => { });
    } else {
      window.shopify.saveBar.hide(SAVE_BAR_ID).catch(() => { });
    }
  }, [isDirty, isFetching]);

  useEffect(() => {
    return () => {
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide(SAVE_BAR_ID).catch(() => { });
      }
    };
  }, []);

  if (isFetching) {
    return (
      <Frame>
        <SkeletonPage title="Settings">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={5} />
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </SkeletonPage>
      </Frame>
    );
  }

  return (
    <Frame>
      <TitleBar title="Settings" />
      {/* Rendered unconditionally, per Shopify's documented Save Bar pattern — visibility is
          controlled solely by shopify.saveBar.show()/hide() in the effect above, not by
          mounting/unmounting this element. */}
      <ui-save-bar id={SAVE_BAR_ID}>
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </ui-save-bar>

      {isDirty && !window.shopify && (
        <div
          style={{
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
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "14px", color: "#ffffff" }}>
            Unsaved changes
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button onClick={handleDiscard}>Discard</Button>
            <Button variant="primary" loading={isSaving} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          content={toast.content}
          error={toast.error}
          onDismiss={() => setToast(null)}
        />
      )}
      <ConfirmActionModal
        open={showUpgradeSaveConfirm}
        title="Save changes before upgrading?"
        body="You have unsaved settings. Save them before going to the Billing page, or cancel to keep editing."
        confirmText="Save & Continue"
        confirmTone="primary"
        onConfirm={confirmSaveThenUpgrade}
        onCancel={() => setShowUpgradeSaveConfirm(false)}
        loading={isSavingForUpgrade}
      />
      <ConfirmActionModal
        open={showApplyLayoutConfirm}
        title="Apply sidebar layout to published posts?"
        body="This re-syncs every published post so the extra column exists in the article HTML. Widget content already updates when you save. Continue only if older posts are still missing the sidebar column."
        confirmText="Save & apply"
        confirmTone="primary"
        onConfirm={applySidebarLayout}
        onCancel={() => setShowApplyLayoutConfirm(false)}
        loading={isApplyingLayout}
      />
      <ConfirmActionModal
        open={!!categoryToDelete}
        title={categoryToDelete ? `Delete “${categoryToDelete.name}”?` : "Delete category?"}
        body="Posts in this category will keep their content but lose the category assignment. Empty categories never appear in the sidebar."
        confirmText="Delete"
        confirmTone="critical"
        onConfirm={handleDeleteCategory}
        onCancel={() => setCategoryToDelete(null)}
        loading={categoryBusyId === categoryToDelete?.id}
      />
      <Page
        title="Settings"
        backAction={smartBackAction(navigate, location, "/dashboard", "Dashboard")}
        subtitle="Configure global blog appearance and behavior"
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab} fitted />
            </Card>
          </Layout.Section>
        </Layout>

        <Box paddingBlockStart="400">
          <Layout>
            {/* ─── Appearance ─────────────────────────────────────── */}
            {selectedTab === 0 && (
              <>
                <Layout.Section>
                  <SectionCard
                    title="Branding & colors"
                    trailing={
                      <Button
                        onClick={handleSyncFromTheme}
                        loading={isSyncingTheme}
                        disabled={!features.theme_style_sync?.enabled}
                      >
                        Sync from theme
                      </Button>
                    }
                  >
                    <BlockStack gap="400">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Set brand colors used by new blog blocks. Sync from theme to pull
                        colors from your live Shopify theme, then save.
                      </Text>

                      {!features.theme_style_sync?.enabled && (
                        <UpgradePrompt
                          onUpgrade={handleUpgradeNow}
                          requiredPlan="Starter"
                          title="Theme color sync — Starter feature"
                          description="Pull primary, secondary, and text colors from your active Shopify theme in one click."
                        />
                      )}

                      <FormLayout>
                        <FormLayout.Group>
                          <TextField
                            label="Primary color"
                            type="color"
                            value={settings.primaryColor}
                            onChange={set("primaryColor")}
                            autoComplete="off"
                          />
                          <TextField
                            label="Secondary color"
                            type="color"
                            value={settings.secondaryColor}
                            onChange={set("secondaryColor")}
                            autoComplete="off"
                          />
                          <TextField
                            label="Font color"
                            type="color"
                            value={settings.textColor}
                            onChange={set("textColor")}
                            autoComplete="off"
                          />
                        </FormLayout.Group>

                        {/* One field in a 3-column group keeps radius at ~1/3 width
                            (Polaris FormLayout.Group equal columns). */}
                        <FormLayout.Group>
                          <TextField
                            label="Button corner radius"
                            type="number"
                            min={0}
                            max={40}
                            suffix="px"
                            value={settings.buttonRadius}
                            onChange={set("buttonRadius")}
                            autoComplete="off"
                            helpText="Applied to new Button, FAQ, and Product Card blocks"
                          />
                          <div />
                          <div />
                        </FormLayout.Group>
                      </FormLayout>

                      <Box
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                        borderWidth="025"
                        borderColor="border"
                      >
                        <BlockStack gap="300">
                          <Text as="h3" variant="headingSm">
                            Preview
                          </Text>
                          <InlineStack gap="300" wrap>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                background: settings.primaryColor,
                                padding: "8px 16px",
                                borderRadius: `${Number(settings.buttonRadius) || 0}px`,
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: 1.25,
                              }}
                            >
                              Primary
                            </span>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                background: settings.secondaryColor,
                                padding: "8px 16px",
                                borderRadius: `${Number(settings.buttonRadius) || 0}px`,
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: 1.25,
                              }}
                            >
                              Secondary
                            </span>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                background: "transparent",
                                border: `var(--p-border-width-025) solid ${settings.primaryColor}`,
                                padding: "8px 16px",
                                borderRadius: `${Number(settings.buttonRadius) || 0}px`,
                                color: settings.primaryColor,
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: 1.25,
                              }}
                            >
                              Outline
                            </span>
                          </InlineStack>
                          <Text as="p" variant="bodyMd">
                            <span style={{ color: settings.textColor }}>
                              Sample body text in your font color
                            </span>
                          </Text>
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard title="Typography & layout">
                    <Box
                      padding="300"
                      background="bg-subdued"
                      borderRadius="200"
                      borderWidth="025"
                      borderColor="border"
                    >
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        Blog font family
                      </Text>
                      <Box paddingBlockStart="100">
                        <Text as="p" tone="subdued" variant="bodySm">
                          Automatically matched to your store's active theme — no setup needed.
                          Change your theme's font in the theme editor and your blog content
                          picks it up on the next save.
                        </Text>
                      </Box>
                    </Box>
                    <Select
                      label="Blog article layout"
                      options={LAYOUT_OPTIONS}
                      value={settings.blogLayout}
                      onChange={set("blogLayout")}
                      helpText="Controls the maximum content width on the storefront"
                    />
                    {settings.blogLayout === "custom" && (
                      <TextField
                        label="Custom width"
                        type="number"
                        min={CUSTOM_WIDTH_MIN}
                        max={CUSTOM_WIDTH_MAX}
                        suffix="px"
                        value={String(settings.blogLayoutCustomWidth ?? "1200")}
                        onChange={set("blogLayoutCustomWidth")}
                        error={customWidthError || undefined}
                        helpText={`Required. Must be between ${CUSTOM_WIDTH_MIN} and ${CUSTOM_WIDTH_MAX} pixels.`}
                        autoComplete="off"
                      />
                    )}
                  </SectionCard>
                </Layout.Section>
              </>
            )}

            {/* ─── Content & display ──────────────────────────────── */}
            {selectedTab === 1 && (
              <>
                <Layout.Section>
                  <SectionCard title="Author defaults">
                    <TextField
                      label="Default author name"
                      value={settings.defaultAuthor}
                      onChange={set("defaultAuthor")}
                      placeholder="Your name or store name..."
                      helpText="Pre-filled in the author field for new articles, and used as the byline on any article whose own author field is left blank."
                      autoComplete="off"
                    />
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard title="Article display options">
                    <Text tone="subdued" variant="bodySm">
                      Reading time, author, and published date control a byline this app adds
                      inside the article content. If your theme already shows its own date or
                      author near the title (common on Dawn and similar themes), that's rendered
                      by the theme itself and isn't affected by these toggles.
                    </Text>
                    <InlineGrid columns={2} gap="300">
                      <Checkbox
                        label="Show reading time"
                        checked={settings.showReadingTime}
                        onChange={set("showReadingTime")}
                      />
                      <Checkbox
                        label="Show author name"
                        checked={settings.showAuthor}
                        onChange={set("showAuthor")}
                      />
                      <Checkbox
                        label="Show published date"
                        checked={settings.showPublishedDate}
                        onChange={set("showPublishedDate")}
                      />
                      <Checkbox
                        label="Show related posts at the bottom of the article"
                        checked={settings.showRelatedPosts}
                        onChange={set("showRelatedPosts")}
                        helpText={
                          relatedInSidebar
                            ? "The sidebar Related posts widget is on, so this bottom block stays hidden on the live blog."
                            : undefined
                        }
                      />
                    </InlineGrid>
                    {relatedInSidebar ? (
                      <Banner tone="info">
                        <p>
                          Related posts appear in the sidebar. Change how many posts and how they’re
                          chosen on the Related posts widget below. The bottom-of-article block is
                          hidden while that widget is on.
                        </p>
                      </Banner>
                    ) : settings.showRelatedPosts ? (
                      <Box paddingInlineStart="600">
                        <BlockStack gap="300">
                          <Select
                            label="Number of related posts"
                            options={RELATED_POSTS_OPTIONS}
                            value={settings.relatedPostsCount}
                            onChange={set("relatedPostsCount")}
                          />
                          <Select
                            label="Layout"
                            options={RELATED_LAYOUT_OPTIONS}
                            value={settings.relatedPostsLayout || "grid"}
                            onChange={set("relatedPostsLayout")}
                            helpText="Grid, list, or slider under the article."
                          />
                          <Select
                            label="How posts are chosen"
                            options={RELATED_SOURCE_OPTIONS}
                            value={settings.relatedPostsSourceMode || "smart"}
                            onChange={set("relatedPostsSourceMode")}
                            helpText="Posts can override this in the editor. Manual only uses posts you pick on each article."
                          />
                        </BlockStack>
                      </Box>
                    ) : null}
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard
                    title="Blog listing page"
                    trailing={
                      features.listing_layout?.enabled ? null : <Badge>Starter+</Badge>
                    }
                  >
                    <Text as="p" variant="bodySm" tone="subdued">
                      Controls the News / blog index (the page that lists all posts), not the
                      individual article. Save settings, then refresh the listing on your store.
                      {!features.listing_layout?.enabled
                        ? " On Free, the storefront uses your theme's default blog layout."
                        : ""}
                    </Text>
                    {!features.listing_layout?.enabled && (
                      <UpgradePrompt
                        requiredPlan="Starter"
                        title="Listing layout is a Starter feature"
                        description="Grid, list, magazine, and featured mosaic layouts for the blog index are available on Starter and above."
                        onUpgrade={handleUpgradeNow}
                      />
                    )}
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      Layout
                    </Text>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {BLOG_LISTING_LAYOUTS.map((opt) => {
                        const isOn = (settings.blogListingLayout || "featured_2") === opt.value;
                        const primary = settings.primaryColor || "#008060";
                        const canPick = !!features.listing_layout?.enabled;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={!canPick}
                            onClick={() => canPick && set("blogListingLayout")(opt.value)}
                            style={{
                              margin: 0,
                              padding: 10,
                              cursor: canPick ? "pointer" : "not-allowed",
                              opacity: canPick ? 1 : 0.55,
                              textAlign: "left",
                              background: isOn ? "#f1f8f5" : "#fff",
                              border: `2px solid ${isOn ? primary : "#e1e3e5"}`,
                              borderRadius: 10,
                              boxShadow: isOn ? `0 0 0 1px ${primary}` : "none",
                            }}
                          >
                            <ListingLayoutMock layout={opt.value} />
                            <div style={{ marginTop: 8 }}>
                              <Text as="span" variant="bodySm" fontWeight="semibold">
                                {opt.label}
                              </Text>
                              <br />
                              <Text as="span" variant="bodySm" tone="subdued">
                                {opt.hint}
                              </Text>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard
                    title="Blog sidebar"
                    trailing={
                      features.blog_sidebar?.enabled ? null : <Badge>Pro+</Badge>
                    }
                  >
                    {!features.blog_sidebar?.enabled && (
                      <UpgradePrompt
                        requiredPlan="Pro"
                        title="Blog sidebar is a Pro feature"
                        description="A two-column article layout with related posts, categories, products, and promo widgets is available on Pro and above."
                        onUpgrade={handleUpgradeNow}
                      />
                    )}
                    <Checkbox
                      label="Show a sidebar on blog posts"
                      checked={!!settings.blogSidebarEnabled && settings.blogSidebarEnabled !== "false"}
                      onChange={(v) => set("blogSidebarEnabled")(v)}
                      disabled={!features.blog_sidebar?.enabled}
                      helpText="Adds a column beside the article for related posts, categories, products, and promos."
                    />
                    {features.blog_sidebar?.enabled &&
                      !!settings.blogSidebarEnabled &&
                      settings.blogSidebarEnabled !== "false" && (
                        <BlockStack gap="400">
                          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                            <Select
                              label="Position"
                              options={SIDEBAR_POSITION_OPTIONS}
                              value={settings.blogSidebarPosition || "right"}
                              onChange={set("blogSidebarPosition")}
                            />
                            <Select
                              label="Width"
                              options={SIDEBAR_WIDTH_OPTIONS}
                              value={settings.blogSidebarWidth || "320"}
                              onChange={set("blogSidebarWidth")}
                            />
                          </InlineGrid>
                          <Checkbox
                            label="Keep the sidebar visible while scrolling (desktop)"
                            checked={settings.blogSidebarSticky !== false && settings.blogSidebarSticky !== "false"}
                            onChange={set("blogSidebarSticky")}
                          />
                          <Checkbox
                            label="Hide the sidebar on phones"
                            checked={!!settings.blogSidebarHideOnMobile && settings.blogSidebarHideOnMobile !== "false"}
                            onChange={set("blogSidebarHideOnMobile")}
                            helpText="On phones the sidebar stacks under the article by default. Turn this on to hide it there."
                          />

                          <CombinedSidebarPreview
                            widgets={sidebarWidgets}
                            settings={settings}
                            position={settings.blogSidebarPosition || "right"}
                            width={settings.blogSidebarWidth || "320"}
                          />

                          <Banner tone="info">
                            <p>
                              Save settings to update widget content on the live blog. If older posts
                              are still missing the extra column, use Apply layout at the bottom once.
                            </p>
                          </Banner>

                          <Divider />
                          <InlineStack align="space-between" blockAlign="center" wrap>
                            <Text as="h3" variant="headingSm">
                              Categories
                            </Text>
                            <Button onClick={() => navigate("/categories")}>Manage categories</Button>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Create and rename categories on the Categories page. Assign a category on
                            each post. Choose which ones appear in the Categories widget below.
                          </Text>
                          {categories.length === 0 && !categoriesLoading ? (
                            <Text as="p" variant="bodySm" tone="subdued">
                              No categories yet. Add some on the Categories page, then assign them on posts.
                            </Text>
                          ) : null}

                          <Divider />
                          <Text as="h3" variant="headingSm">
                            Widgets
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Turn a widget on to show it. Open it to edit. Related posts in the sidebar
                            replace the block under the article.
                          </Text>
                          {sidebarWidgets.map((widget, idx) => (
                            <Card key={widget.id || idx}>
                              <BlockStack gap="300">
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "auto minmax(0, 1fr) auto",
                                    alignItems: "center",
                                    columnGap: 12,
                                    rowGap: 8,
                                  }}
                                >
                                  <Button
                                    variant="plain"
                                    onClick={() =>
                                      setExpandedWidgetId((id) =>
                                        id === widget.id ? null : widget.id
                                      )
                                    }
                                    disclosure={expandedWidgetId === widget.id ? "up" : "down"}
                                  >
                                    {expandedWidgetId === widget.id ? "Hide" : "Edit"}
                                  </Button>
                                  <BlockStack gap="050">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                                      {widgetTypeLabel(widget.type)}
                                    </Text>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      {widgetSummary(widget)}
                                    </Text>
                                  </BlockStack>
                                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                                    <Button
                                      size="slim"
                                      disabled={idx === 0}
                                      onClick={() => moveSidebarWidget(idx, -1)}
                                    >
                                      Up
                                    </Button>
                                    <Button
                                      size="slim"
                                      disabled={idx >= sidebarWidgets.length - 1}
                                      onClick={() => moveSidebarWidget(idx, 1)}
                                    >
                                      Down
                                    </Button>
                                    <Checkbox
                                      label="Show on blog"
                                      checked={!!widget.enabled}
                                      onChange={(checked) => {
                                        updateSidebarWidget(idx, { enabled: checked });
                                      }}
                                    />
                                    {(widget.type === "image_cta" ||
                                      widget.type === "rich_text" ||
                                      widget.type === "recent_posts" ||
                                      sidebarWidgets.length > 1) && (
                                      <Button
                                        size="slim"
                                        tone="critical"
                                        onClick={() => removeSidebarWidget(idx)}
                                      >
                                        Remove
                                      </Button>
                                    )}
                                  </InlineStack>
                                </div>
                                {expandedWidgetId === widget.id && (
                                  <BlockStack gap="200">
                                    <TextField
                                      label="Title"
                                      value={widget.settings?.title || ""}
                                      onChange={(title) => {
                                        const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                        list[idx] = {
                                          ...list[idx],
                                          settings: { ...(list[idx].settings || {}), title },
                                        };
                                        set("blogSidebarWidgets")(JSON.stringify(list));
                                      }}
                                      helpText={
                                        widget.type === "image_cta"
                                          ? "Shown above the promo. Leave blank to hide."
                                          : undefined
                                      }
                                      autoComplete="off"
                                    />
                                    {widget.type === "related_posts" && (
                                      <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          These cards appear beside the article. How they’re chosen
                                          is the shop default; a post can still override it in the editor.
                                        </Text>
                                        <Select
                                          label="How many posts"
                                          options={RELATED_POSTS_OPTIONS}
                                          value={String(widget.settings?.count || 4)}
                                          onChange={(count) => {
                                            const n = parseInt(count, 10);
                                            setSettings((s) => ({
                                              ...s,
                                              relatedPostsCount: String(n),
                                              blogSidebarWidgets: patchSidebarWidget(
                                                s.blogSidebarWidgets,
                                                idx,
                                                { settings: { count: n } }
                                              ),
                                            }));
                                          }}
                                        />
                                        <Select
                                          label="How posts are chosen"
                                          options={RELATED_SOURCE_OPTIONS}
                                          value={
                                            widget.settings?.sourceMode ||
                                            settings.relatedPostsSourceMode ||
                                            "smart"
                                          }
                                          onChange={(sourceMode) => {
                                            setSettings((s) => ({
                                              ...s,
                                              relatedPostsSourceMode: sourceMode,
                                              blogSidebarWidgets: patchSidebarWidget(
                                                s.blogSidebarWidgets,
                                                idx,
                                                { settings: { sourceMode } }
                                              ),
                                            }));
                                          }}
                                          helpText="Smart match uses category and tags. Manual only uses posts you pick on each article."
                                        />
                                        <SidebarOnBlogPreview
                                          position={settings.blogSidebarPosition}
                                          width={settings.blogSidebarWidth}
                                        >
                                          <RelatedPostsWidgetMock
                                            title={widget.settings?.title || "Related posts"}
                                            count={widget.settings?.count || 4}
                                            textColor={settings.textColor}
                                          />
                                        </SidebarOnBlogPreview>
                                      </BlockStack>
                                    )}
                                    {widget.type === "recent_posts" && (
                                      <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Newest published articles from this blog, same order as
                                          Manage posts. The article you’re reading is left out, so
                                          visitors aren’t sent back to the same page. This is not
                                          Related posts — that widget picks similar articles by
                                          category and tags.
                                        </Text>
                                        <Select
                                          label="How many posts"
                                          options={RELATED_POSTS_OPTIONS}
                                          value={String(widget.settings?.count || 4)}
                                          onChange={(count) =>
                                            updateSidebarWidget(idx, {
                                              settings: { count: parseInt(count, 10) },
                                            })
                                          }
                                        />
                                        <SidebarOnBlogPreview
                                          position={settings.blogSidebarPosition}
                                          width={settings.blogSidebarWidth}
                                        >
                                          <RelatedPostsWidgetMock
                                            title={widget.settings?.title || "Recent posts"}
                                            count={widget.settings?.count || 4}
                                            textColor={settings.textColor}
                                          />
                                        </SidebarOnBlogPreview>
                                      </BlockStack>
                                    )}
                                    {widget.type === "rich_text" && (
                                      <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          A short note, bio, or promo beside the article. Line breaks
                                          are kept. Add an optional button if you want a link.
                                        </Text>
                                        <TextField
                                          label="Body"
                                          value={widget.settings?.body || ""}
                                          onChange={(body) =>
                                            updateSidebarWidget(idx, { settings: { body } })
                                          }
                                          multiline={6}
                                          maxLength={2000}
                                          showCharacterCount
                                          placeholder="e.g. Kitchen stories, recipes, and tips from our shop."
                                          autoComplete="off"
                                        />
                                        <RichTextStylePicker
                                          value={widget.settings?.style || "default"}
                                          onChange={(style) =>
                                            updateSidebarWidget(idx, { settings: { style } })
                                          }
                                          title={widget.settings?.title}
                                          body={widget.settings?.body}
                                          buttonText={widget.settings?.buttonText}
                                          showButton={!!String(widget.settings?.linkUrl || "").trim()}
                                          primary={settings.primaryColor || "#008060"}
                                          textColor={settings.textColor || "#202223"}
                                          radius={settings.buttonRadius}
                                          position={settings.blogSidebarPosition}
                                          width={settings.blogSidebarWidth}
                                        />
                                        <TextField
                                          label="Button link (optional)"
                                          value={widget.settings?.linkUrl || ""}
                                          onChange={(linkUrl) =>
                                            updateSidebarWidget(idx, { settings: { linkUrl } })
                                          }
                                          placeholder="https://"
                                          autoComplete="off"
                                        />
                                        {String(widget.settings?.linkUrl || "").trim() ? (
                                          <TextField
                                            label="Button text"
                                            value={widget.settings?.buttonText || ""}
                                            onChange={(buttonText) =>
                                              updateSidebarWidget(idx, { settings: { buttonText } })
                                            }
                                            placeholder="Learn more"
                                            autoComplete="off"
                                          />
                                        ) : null}
                                      </BlockStack>
                                    )}
                                    {widget.type === "image_cta" && (
                                      <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          A photo promo beside the article — a sale, collection, or
                                          newsletter. The preview always shows sample content so you
                                          can judge the layout before you add a photo.
                                        </Text>
                                        <ImageCtaImageField
                                          imageUrl={widget.settings?.imageUrl || ""}
                                          onChange={(imageUrl) =>
                                            updateSidebarWidget(idx, { settings: { imageUrl } })
                                          }
                                        />
                                        <TextField
                                          label="Caption (optional)"
                                          value={widget.settings?.caption || ""}
                                          onChange={(caption) =>
                                            updateSidebarWidget(idx, { settings: { caption } })
                                          }
                                          placeholder="Spring bakeware — 20% off"
                                          helpText="Short line under the photo, or on top of it in Overlay."
                                          maxLength={120}
                                          showCharacterCount
                                          autoComplete="off"
                                        />
                                        <TextField
                                          label="Alt text"
                                          value={widget.settings?.altText || ""}
                                          onChange={(altText) =>
                                            updateSidebarWidget(idx, { settings: { altText } })
                                          }
                                          placeholder="Describe the photo"
                                          helpText="Read by screen readers. If blank, the caption or title is used."
                                          maxLength={200}
                                          autoComplete="off"
                                        />
                                        <TextField
                                          label="Link"
                                          value={widget.settings?.linkUrl || ""}
                                          onChange={(linkUrl) =>
                                            updateSidebarWidget(idx, { settings: { linkUrl } })
                                          }
                                          placeholder="https:// or /collections/sale"
                                          helpText="Where the photo and button go. Collection, product, page, or any URL."
                                          autoComplete="off"
                                        />
                                        <Checkbox
                                          label="Open link in a new tab"
                                          checked={!!widget.settings?.openInNewTab}
                                          onChange={(openInNewTab) =>
                                            updateSidebarWidget(idx, { settings: { openInNewTab } })
                                          }
                                        />
                                        <Checkbox
                                          label="Show a button"
                                          checked={widget.settings?.showButton !== false}
                                          onChange={(showButton) =>
                                            updateSidebarWidget(idx, { settings: { showButton } })
                                          }
                                          helpText="Off = photo-only. The photo still uses the link above."
                                        />
                                        {widget.settings?.showButton !== false && (
                                          <TextField
                                            label="Button text"
                                            value={widget.settings?.buttonText || ""}
                                            onChange={(buttonText) =>
                                              updateSidebarWidget(idx, { settings: { buttonText } })
                                            }
                                            placeholder="Learn more"
                                            autoComplete="off"
                                          />
                                        )}
                                        <ImageCtaLayoutPicker
                                          value={widget.settings?.layout || "stacked"}
                                          onChange={(layout) =>
                                            updateSidebarWidget(idx, { settings: { layout } })
                                          }
                                          title={widget.settings?.title}
                                          imageUrl={widget.settings?.imageUrl}
                                          buttonText={widget.settings?.buttonText}
                                          caption={widget.settings?.caption}
                                          showButton={widget.settings?.showButton !== false}
                                          primary={settings.primaryColor || "#008060"}
                                          textColor={settings.textColor}
                                          radius={settings.buttonRadius}
                                          position={settings.blogSidebarPosition}
                                          width={settings.blogSidebarWidth}
                                        />
                                      </BlockStack>
                                    )}
                                    {widget.type === "products" && (
                                      <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Attach products on the post (editor), or pick shop-wide products for Manual.
                                          Sidebar uses your catalog cache—re-pick or re-save post products if images/prices look stale.
                                        </Text>
                                        <Select
                                          label="Source"
                                          options={PRODUCT_SOURCE_OPTIONS}
                                          value={widget.settings?.source || "post_products"}
                                          onChange={(source) =>
                                            updateSidebarWidget(idx, { settings: { source } })
                                          }
                                        />
                                        {widget.settings?.source === "manual" && (
                                          <BlockStack gap="200">
                                            <InlineStack gap="200" wrap>
                                              <Button
                                                onClick={async () => {
                                                  if (!window.shopify?.resourcePicker) {
                                                    setToast({
                                                      content: "Product picker is only available inside Shopify admin.",
                                                      error: true,
                                                    });
                                                    return;
                                                  }
                                                  try {
                                                    const handles = Array.isArray(widget.settings?.productHandles)
                                                      ? widget.settings.productHandles.filter(Boolean)
                                                      : [];
                                                    let ids = Array.isArray(widget.settings?.productIds)
                                                      ? widget.settings.productIds.filter(Boolean)
                                                      : [];

                                                    // Older saves only stored handles — resolve GIDs so the picker pre-selects them
                                                    if (handles.length && ids.length !== handles.length) {
                                                      try {
                                                        const q = handles
                                                          .map((h) => `handle:${String(h).trim()}`)
                                                          .join(" OR ");
                                                        const res = await fetch(
                                                          `/api/posts/shopify/products?query=${encodeURIComponent(q)}&limit=${Math.max(handles.length, 1)}`
                                                        );
                                                        if (res.ok) {
                                                          const data = await res.json();
                                                          const byHandle = new Map(
                                                            (data.products || []).map((p) => [
                                                              p.handle,
                                                              p.shopifyProductId,
                                                            ])
                                                          );
                                                          ids = handles
                                                            .map((h) => byHandle.get(h))
                                                            .filter(Boolean);
                                                        }
                                                      } catch {
                                                        /* open picker without preselection if lookup fails */
                                                      }
                                                    }

                                                    const selectionIds = ids.map((id) => {
                                                      const s = String(id);
                                                      return {
                                                        id: s.startsWith("gid://")
                                                          ? s
                                                          : `gid://shopify/Product/${s}`,
                                                      };
                                                    });

                                                    const selection = await window.shopify.resourcePicker({
                                                      type: "product",
                                                      multiple: true,
                                                      selectionIds,
                                                    });
                                                    // Cancel / empty: leave existing picks alone
                                                    if (!selection?.length) return;
                                                    const productHandles = [];
                                                    const productIds = [];
                                                    const productTitles = [];
                                                    const productImages = [];
                                                    const seen = new Set();
                                                    for (const p of selection) {
                                                      const handle = p?.handle;
                                                      if (!handle || seen.has(handle)) continue;
                                                      seen.add(handle);
                                                      productHandles.push(handle);
                                                      if (p.id) productIds.push(String(p.id));
                                                      productTitles.push(p.title || handle);
                                                      const img =
                                                        p.images?.[0]?.originalSrc ||
                                                        p.images?.[0]?.src ||
                                                        p.featuredImage?.url ||
                                                        "";
                                                      productImages.push(img);
                                                    }
                                                    updateSidebarWidget(idx, {
                                                      settings: { productHandles, productIds, productTitles, productImages },
                                                    });
                                                  } catch (e) {
                                                    if (e?.message !== "cancelled" && e?.code !== "CANCELLED") {
                                                      setToast({
                                                        content: e?.message || "Couldn't open product picker",
                                                        error: true,
                                                      });
                                                    }
                                                  }
                                                }}
                                              >
                                                Pick products
                                              </Button>
                                              {(widget.settings?.productHandles || []).length > 0 && (
                                                <Button
                                                  tone="critical"
                                                  onClick={() =>
                                                    updateSidebarWidget(idx, {
                                                      settings: { productHandles: [], productIds: [], productTitles: [], productImages: [] },
                                                    })
                                                  }
                                                >
                                                  Clear
                                                </Button>
                                              )}
                                            </InlineStack>
                                            {(widget.settings?.productHandles || []).length > 0 ? (
                                              <BlockStack gap="100">
                                                {(widget.settings.productHandles || []).map((handle, handleIdx) => (
                                                  <InlineStack
                                                    key={handle}
                                                    align="space-between"
                                                    blockAlign="center"
                                                    gap="200"
                                                  >
                                                    <InlineStack gap="200" blockAlign="center">
                                                      {widget.settings?.productImages?.[handleIdx] ? (
                                                        <img
                                                          src={widget.settings.productImages[handleIdx]}
                                                          alt=""
                                                          style={{
                                                            width: 36,
                                                            height: 36,
                                                            objectFit: "cover",
                                                            borderRadius: 6,
                                                          }}
                                                        />
                                                      ) : (
                                                        <div
                                                          style={{
                                                            width: 36,
                                                            height: 36,
                                                            borderRadius: 6,
                                                            background: "#f1f2f3",
                                                          }}
                                                        />
                                                      )}
                                                      <BlockStack gap="050">
                                                        <Text as="span" variant="bodySm" fontWeight="semibold">
                                                          {widget.settings?.productTitles?.[handleIdx] || handle}
                                                        </Text>
                                                        <Text as="span" variant="bodySm" tone="subdued">
                                                          {handle}
                                                        </Text>
                                                      </BlockStack>
                                                    </InlineStack>
                                                    <Button
                                                      size="slim"
                                                      onClick={() => {
                                                        const handles = widget.settings?.productHandles || [];
                                                        const ids = Array.isArray(widget.settings?.productIds)
                                                          ? widget.settings.productIds
                                                          : [];
                                                        updateSidebarWidget(idx, {
                                                          settings: {
                                                            productHandles: handles.filter((h) => h !== handle),
                                                            productIds: ids.filter((_, i) => i !== handleIdx),
                                                            productTitles: (widget.settings?.productTitles || []).filter((_, i) => i !== handleIdx),
                                                            productImages: (widget.settings?.productImages || []).filter((_, i) => i !== handleIdx),
                                                          },
                                                        });
                                                      }}
                                                    >
                                                      Remove
                                                    </Button>
                                                  </InlineStack>
                                                ))}
                                              </BlockStack>
                                            ) : (
                                              <Text as="p" variant="bodySm" tone="subdued">
                                                No products selected yet.
                                              </Text>
                                            )}
                                          </BlockStack>
                                        )}
                                        <Select
                                          label="Max items"
                                          options={PRODUCT_MAX_ITEMS_OPTIONS}
                                          value={String(widget.settings?.maxItems ?? 3)}
                                          onChange={(maxItems) =>
                                            updateSidebarWidget(idx, {
                                              settings: { maxItems: parseInt(maxItems, 10) },
                                            })
                                          }
                                        />
                                        <Checkbox
                                          label="Show images"
                                          checked={widget.settings?.showImage !== false}
                                          onChange={(showImage) =>
                                            updateSidebarWidget(idx, { settings: { showImage } })
                                          }
                                        />
                                        <Checkbox
                                          label="Show price"
                                          checked={widget.settings?.showPrice !== false}
                                          onChange={(showPrice) =>
                                            updateSidebarWidget(idx, { settings: { showPrice } })
                                          }
                                        />
                                        <TextField
                                          label="CTA label"
                                          value={widget.settings?.ctaLabel ?? "View product"}
                                          onChange={(ctaLabel) =>
                                            updateSidebarWidget(idx, { settings: { ctaLabel } })
                                          }
                                          helpText="Leave blank to hide the CTA line; the card still links to the product."
                                          autoComplete="off"
                                        />
                                        <SidebarOnBlogPreview
                                          position={settings.blogSidebarPosition}
                                          width={settings.blogSidebarWidth}
                                        >
                                          <ProductsWidgetMock
                                            title={widget.settings?.title || "Products"}
                                            maxItems={widget.settings?.maxItems ?? 3}
                                            showImage={widget.settings?.showImage !== false}
                                            showPrice={widget.settings?.showPrice !== false}
                                            ctaLabel={widget.settings?.ctaLabel ?? "View product"}
                                            source={widget.settings?.source || "post_products"}
                                            primary={settings.primaryColor || "#008060"}
                                            textColor={settings.textColor}
                                          />
                                        </SidebarOnBlogPreview>
                                      </BlockStack>
                                    )}
                                    {widget.type === "categories" && (
                                      <BlockStack gap="200">
                                        <Checkbox
                                          label="Show post counts"
                                          checked={widget.settings?.showCounts !== false}
                                          onChange={(showCounts) =>
                                            updateSidebarWidget(idx, { settings: { showCounts } })
                                          }
                                        />
                                        <Checkbox
                                          label="Show recent posts under each category"
                                          checked={widget.settings?.showPosts !== false}
                                          onChange={(showPosts) =>
                                            updateSidebarWidget(idx, { settings: { showPosts } })
                                          }
                                          helpText="Direct article links so visitors can open posts even before tag archives fill in."
                                        />
                                        {widget.settings?.showPosts !== false && (
                                          <Select
                                            label="Max posts per category"
                                            options={CATEGORY_MAX_POSTS_OPTIONS}
                                            value={String(widget.settings?.maxPosts ?? 3)}
                                            onChange={(maxPosts) =>
                                              updateSidebarWidget(idx, {
                                                settings: { maxPosts: parseInt(maxPosts, 10) },
                                              })
                                            }
                                          />
                                        )}
                                        <Select
                                          label="Sort categories"
                                          options={CATEGORY_SORT_OPTIONS}
                                          value={
                                            String(widget.settings?.sort || "name").toLowerCase() ===
                                            "count"
                                              ? "count"
                                              : "name"
                                          }
                                          onChange={(sort) =>
                                            updateSidebarWidget(idx, { settings: { sort } })
                                          }
                                        />
                                        {categories.length > 0 && (
                                          <BlockStack gap="100">
                                            <Text as="p" variant="bodyMd">
                                              Include only these categories (optional)
                                            </Text>
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              Leave all unchecked to show every category that has published posts.
                                            </Text>
                                            {categories.map((cat) => {
                                              const selected = Array.isArray(
                                                widget.settings?.includeCategoryIds
                                              )
                                                ? widget.settings.includeCategoryIds.map((x) =>
                                                    parseInt(x, 10)
                                                  )
                                                : [];
                                              const checked = selected.includes(cat.id);
                                              return (
                                                <Checkbox
                                                  key={cat.id}
                                                  label={`${cat.name} (${cat.postCount})`}
                                                  checked={checked}
                                                  onChange={(on) => {
                                                    const next = on
                                                      ? [...selected, cat.id]
                                                      : selected.filter((id) => id !== cat.id);
                                                    updateSidebarWidget(idx, {
                                                      settings: { includeCategoryIds: next },
                                                    });
                                                  }}
                                                />
                                              );
                                            })}
                                          </BlockStack>
                                        )}
                                        <SidebarOnBlogPreview
                                          position={settings.blogSidebarPosition}
                                          width={settings.blogSidebarWidth}
                                        >
                                          <CategoriesWidgetMock
                                            title={widget.settings?.title || "Categories"}
                                            showCounts={widget.settings?.showCounts !== false}
                                            showPosts={widget.settings?.showPosts !== false}
                                            maxPosts={widget.settings?.maxPosts ?? 3}
                                            textColor={settings.textColor}
                                          />
                                        </SidebarOnBlogPreview>
                                      </BlockStack>
                                    )}
                                  </BlockStack>
                                )}
                              </BlockStack>
                            </Card>
                          ))}
                          <Divider />
                          <Text as="h3" variant="headingSm">
                            Add a widget
                          </Text>
                          <InlineStack gap="200" blockAlign="end" wrap>
                            <div style={{ minWidth: 180 }}>
                              <Select
                                label="Widget type"
                                labelHidden
                                options={[
                                  { label: "Image / CTA", value: "image_cta" },
                                  { label: "Rich text", value: "rich_text" },
                                  !sidebarWidgets.some((w) => w.type === "recent_posts") && {
                                    label: "Recent posts",
                                    value: "recent_posts",
                                  },
                                  !sidebarWidgets.some((w) => w.type === "related_posts") && {
                                    label: "Related posts",
                                    value: "related_posts",
                                  },
                                  !sidebarWidgets.some((w) => w.type === "categories") && {
                                    label: "Categories",
                                    value: "categories",
                                  },
                                  !sidebarWidgets.some((w) => w.type === "products") && {
                                    label: "Products",
                                    value: "products",
                                  },
                                ].filter(Boolean)}
                                value={addWidgetType}
                                onChange={setAddWidgetType}
                              />
                            </div>
                            <Button onClick={addSidebarWidget}>Add widget</Button>
                          </InlineStack>

                          <Divider />
                          <Text as="p" variant="bodySm" tone="subdued">
                            Widget content updates after you save. Use this only if published posts
                            still show one column (the empty sidebar placeholder is missing).
                          </Text>
                          <Button onClick={() => setShowApplyLayoutConfirm(true)}>
                            Apply layout to published posts
                          </Button>
                        </BlockStack>
                      )}
                  </SectionCard>
                </Layout.Section>
              </>
            )}

            {/* ─── SEO & Sitemap ───────────────────────────────────── */}
            {selectedTab === 2 && (
              <>
                <Layout.Section>
                  <SectionCard
                    title="Meta robots"
                    trailing={
                      <>
                        {metaRobotsActive === null && <Badge>Checking…</Badge>}
                        {metaRobotsActive === true && <Badge tone="success">Active</Badge>}
                        {metaRobotsActive === false && <Badge tone="attention">Not activated</Badge>}
                      </>
                    }
                  >
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Lets each article's editor control search engine indexing (Index/Noindex,
                      Follow/Nofollow). Activate this once for your store — every article's
                      setting then applies automatically, no further setup.
                    </Text>
                    {metaRobotsActive === false && (
                      <EmbedRequirementBanner
                        active={false}
                        themeSupportsAppEmbeds={themeSupportsAppEmbeds}
                        activateUrl={metaRobotsActivateUrl(window.shopify?.config?.shop || "")}
                        featureName="Search engine indexing controls"
                        whatBreaks="Per-article Index/Noindex and Follow/Nofollow settings won't take effect on the live storefront."
                      />
                    )}
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard title="Sitemap">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Shopify automatically includes every published article in its own sitemap.xml —
                      but it can't exclude noindex'd or individually-excluded posts from that. This is
                      a second, "clean" sitemap containing only your indexable, non-excluded posts.
                    </Text>
                    <Banner tone="warning">
                      Submit the URL below to Google Search Console / Bing Webmaster Tools instead
                      of Shopify's sitemap.xml — the "Exclude from XML sitemap" toggle on a post
                      only has an effect on this sitemap, not Shopify's own.
                    </Banner>
                    {sitemapStatus && (
                      <InlineStack gap="200" blockAlign="center" wrap={false}>
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <TextField
                            label="Sitemap URL"
                            labelHidden
                            value={sitemapStatus.sitemapUrl}
                            readOnly
                            autoComplete="off"
                          />
                        </Box>
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText(sitemapStatus.sitemapUrl);
                            setToast({ content: "Sitemap URL copied" });
                          }}
                        >
                          Copy
                        </Button>
                      </InlineStack>
                    )}
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard title="Post indexing status">
                    {isLoadingSitemap && (
                      <InlineStack align="center">
                        <Spinner size="small" />
                      </InlineStack>
                    )}
                    {!isLoadingSitemap && sitemapStatus && sitemapStatus.posts.length === 0 && (
                      <Text as="p" tone="subdued">No published posts yet.</Text>
                    )}
                    {!isLoadingSitemap && sitemapStatus && sitemapStatus.posts.length > 0 && (
                      <DataTable
                        columnContentTypes={["text", "text", "text", "text"]}
                        headings={["Post", "Sitemap", "Meta description", "Last synced"]}
                        rows={sitemapStatus.posts.map((p) => [
                          p.title,
                          p.inSitemap
                            ? <Badge key={`idx-${p.id}`} tone="success">In sitemap</Badge>
                            : <Badge key={`idx-${p.id}`} tone="attention">{p.noindex ? "Noindex — excluded" : "Excluded"}</Badge>,
                          p.hasMetaDescription
                            ? <Badge key={`meta-${p.id}`} tone="success">Present</Badge>
                            : <Badge key={`meta-${p.id}`} tone="warning">Missing</Badge>,
                          p.syncedAt ? new Date(p.syncedAt).toLocaleString() : "Not synced",
                        ])}
                      />
                    )}
                  </SectionCard>
                </Layout.Section>
              </>
            )}

            {/* ─── Advanced ────────────────────────────────────────── */}
            {selectedTab === 3 && (
              <>
              <Layout.Section>
                <SectionCard
                  title="Custom code injection"
                  trailing={<Badge tone="attention">Advanced</Badge>}
                >
                  {!features.custom_code_injection?.enabled && (
                    <UpgradePrompt
                      onUpgrade={handleUpgradeNow}
                      requiredPlan="Pro"
                      title="Custom global header and footer is a Pro feature"
                      description="Inject your own CSS or JavaScript above and below every published article."
                    />
                  )}
                  <TextField
                    label="Custom header code"
                    value={settings.customHeaderCode}
                    onChange={set("customHeaderCode")}
                    multiline={4}
                    disabled={!features.custom_code_injection?.enabled}
                    placeholder="<!-- Paste custom CSS or JavaScript to show above every article -->"
                    autoComplete="off"
                    helpText="Shown at the top of every published article, and applies live within seconds of saving — no need to resync individual posts. Note: this is part of the article body, not your theme's <head> — apps aren't permitted to edit theme files directly."
                    monospaced
                  />
                  <TextField
                    label="Custom footer code"
                    value={settings.customFooterCode}
                    onChange={set("customFooterCode")}
                    multiline={4}
                    disabled={!features.custom_code_injection?.enabled}
                    placeholder="<!-- Paste custom scripts to show below every article -->"
                    autoComplete="off"
                    helpText="Shown at the end of every published article, and applies live within seconds of saving — no need to resync individual posts."
                    monospaced
                  />
                </SectionCard>
              </Layout.Section>

              <Layout.Section>
                <SectionCard title="Branding">
                  {!features.remove_branding?.enabled && (
                    <UpgradePrompt
                      onUpgrade={handleUpgradeNow}
                      requiredPlan="Starter"
                      title={`Remove the "Powered by ${APP_NAME}" badge`}
                      description="Control whether it's shown on your published articles."
                    />
                  )}
                  <Checkbox
                    label={`Show "Powered by ${APP_NAME}" badge on published articles`}
                    checked={features.remove_branding?.enabled ? settings.showPoweredByBadge : true}
                    disabled={!features.remove_branding?.enabled}
                    onChange={set("showPoweredByBadge")}
                    helpText="Applies live within seconds of saving — no need to resync individual posts."
                  />
                </SectionCard>
              </Layout.Section>

              <Layout.Section>
                <SectionCard title="Sync status">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    View the 2-way sync state for every post, force re-sync individual posts to
                    Shopify, resync everything at once, and review the sync log.
                  </Text>
                  <InlineStack align="end">
                    <Button onClick={() => navigate("/sync")}>
                      Open sync status
                    </Button>
                  </InlineStack>
                </SectionCard>
              </Layout.Section>
              </>
            )}
          </Layout>
        </Box>
      </Page>
    </Frame>
  );
}
