/**
 * componentRegistry.js
 *
 * The CORE of the builder system.
 * Maps block type strings → their metadata, components, and defaults.
 *
 * Architecture:
 * - Each entry declares: preview component, settings component, default props, metadata
 * - PageBuilder, BuilderToolbar, AI generation, and SSR all read from this single source
 * - Unknown types fall back to legacy BlockPreview/BlockSettings (backward compat)
 *
 * To add a new block type:
 * 1. Create components/builder/blocks/YourBlock/index.js
 * 2. Add an entry below
 * That's it — toolbar, settings panel, and canvas all update automatically.
 */

// ── Content blocks ────────────────────────────────────────────────────────────
import { TextBlockPreview, TextBlockSettings } from '../blocks/TextBlock/index.jsx';
import { HeadingBlockPreview, HeadingBlockSettings } from '../blocks/HeadingBlock/index.jsx';

// ── Marketing blocks ──────────────────────────────────────────────────────────
import { HeroBlockPreview, HeroBlockSettings } from '../blocks/HeroBlock/index.jsx';
import { CTAButtonBlockPreview, CTAButtonBlockSettings } from '../blocks/CTAButtonBlock/index.jsx';

// ── Media blocks ──────────────────────────────────────────────────────────────
import { ImageBlockPreview, ImageBlockSettings } from '../blocks/ImageBlock/index.jsx';
import { VideoBlockPreview, VideoBlockSettings } from '../blocks/VideoBlock/index.jsx';

// ── Layout blocks ─────────────────────────────────────────────────────────────
import { DividerBlockPreview, DividerBlockSettings } from '../blocks/DividerBlock/index.jsx';
import { SpacerBlockPreview, SpacerBlockSettings } from '../blocks/SpacerBlock/index.jsx';

// ── Shopify Commerce blocks ───────────────────────────────────────────────────
import { ProductGridBlockPreview, ProductGridBlockSettings } from '../blocks/ProductGridBlock/index.jsx';
import { CollectionBlockPreview, CollectionBlockSettings } from '../blocks/CollectionBlock/index.jsx';
import { BuyButtonBlockPreview, BuyButtonBlockSettings } from '../blocks/BuyButtonBlock/index.jsx';

// ── Category display order ────────────────────────────────────────────────────
export const CATEGORY_ORDER = ['marketing', 'content', 'media', 'shopify', 'layout'];

export const CATEGORY_LABELS = {
  marketing: 'Marketing',
  content:   'Content',
  media:     'Media',
  layout:    'Layout',
  shopify:   'Shopify Commerce',
};

/**
 * @typedef {Object} BlockRegistryEntry
 * @property {React.ComponentType} PreviewComponent  - shown in builder canvas
 * @property {React.ComponentType} SettingsComponent - shown in right panel
 * @property {string}   category     - 'content' | 'layout' | 'shopify' | 'marketing' | 'media'
 * @property {string}   label        - human readable name
 * @property {string}   icon         - emoji icon for toolbar
 * @property {string[]} keywords     - for future search / AI
 * @property {number}   version      - current schema version for migrations
 * @property {Function} defaultProps - factory fn returning default block shape
 */

/** @type {Record<string, BlockRegistryEntry>} */
export const componentRegistry = {

  // ── Marketing ─────────────────────────────────────────────────────
  hero: {
    PreviewComponent:  HeroBlockPreview,
    SettingsComponent: HeroBlockSettings,
    category:    'marketing',
    label:       'Hero Section',
    icon:        '🦸',
    keywords:    ['hero', 'banner', 'header', 'landing', 'featured', 'full-width'],
    version:     1,
    defaultProps: () => ({
      type:              'hero',
      version:           1,
      heading:           'Welcome to Our Store',
      subheading:        'Discover our latest collection',
      backgroundImage:   '',
      backgroundOverlay: true,
      overlayOpacity:    0.4,
      overlayColor:      '#000000',
      textColor:         '#ffffff',
      align:             'center',
      minHeight:         '400px',
      ctaText:           'Shop Now',
      ctaUrl:            '/',
      ctaColor:          '#008060',
      ctaTextColor:      '#ffffff',
      showCta:           true,
    }),
  },

  cta_button: {
    PreviewComponent:  CTAButtonBlockPreview,
    SettingsComponent: CTAButtonBlockSettings,
    category:    'marketing',
    label:       'CTA Button',
    icon:        '⬛',
    keywords:    ['cta', 'button', 'call to action', 'link', 'shop now'],
    version:     1,
    defaultProps: () => ({
      type:         'cta_button',
      version:      1,
      text:         'Shop Now',
      url:          '/',
      align:        'center',
      color:        '#008060',
      textColor:    '#ffffff',
      size:         'medium',
      borderRadius: '6px',
    }),
  },

  // ── Content ───────────────────────────────────────────────────────
  heading: {
    PreviewComponent:  HeadingBlockPreview,
    SettingsComponent: HeadingBlockSettings,
    category:    'content',
    label:       'Heading',
    icon:        'H',
    keywords:    ['heading', 'title', 'h1', 'h2', 'h3', 'section title'],
    version:     1,
    defaultProps: () => ({
      type:    'heading',
      version: 1,
      content: 'Your Heading',
      level:   'h2',
      align:   'left',
      color:   '#202223',
    }),
  },

  text: {
    PreviewComponent:  TextBlockPreview,
    SettingsComponent: TextBlockSettings,
    category:    'content',
    label:       'Rich Text',
    icon:        '¶',
    keywords:    ['text', 'paragraph', 'content', 'rich text', 'body', 'wysiwyg'],
    version:     1,
    defaultProps: () => ({
      type:    'text',
      version: 1,
      content: '<p>Your paragraph text goes here.</p>',
    }),
  },

  // ── Media ─────────────────────────────────────────────────────────
  image: {
    PreviewComponent:  ImageBlockPreview,
    SettingsComponent: ImageBlockSettings,
    category:    'media',
    label:       'Image',
    icon:        '🖼',
    keywords:    ['image', 'photo', 'media', 'picture', 'banner', 'graphic'],
    version:     1,
    defaultProps: () => ({
      type:         'image',
      version:      1,
      src:          '',
      alt:          '',
      caption:      '',
      width:        '100%',
      align:        'center',
      borderRadius: '0px',
      linkUrl:      '',
    }),
  },

  video: {
    PreviewComponent:  VideoBlockPreview,
    SettingsComponent: VideoBlockSettings,
    category:    'media',
    label:       'Video Embed',
    icon:        '▶️',
    keywords:    ['video', 'youtube', 'vimeo', 'embed', 'media'],
    version:     1,
    defaultProps: () => ({
      type:        'video',
      version:     1,
      url:         '',
      caption:     '',
      aspectRatio: '56.25%',
      maxWidth:    '100%',
    }),
  },

  // ── Layout ────────────────────────────────────────────────────────
  divider: {
    PreviewComponent:  DividerBlockPreview,
    SettingsComponent: DividerBlockSettings,
    category:    'layout',
    label:       'Divider',
    icon:        '─',
    keywords:    ['divider', 'separator', 'hr', 'rule', 'line'],
    version:     1,
    defaultProps: () => ({
      type:      'divider',
      version:   1,
      style:     'solid',
      thickness: '1px',
      color:     '#e1e3e5',
      margin:    '20px',
    }),
  },

  spacer: {
    PreviewComponent:  SpacerBlockPreview,
    SettingsComponent: SpacerBlockSettings,
    category:    'layout',
    label:       'Spacer',
    icon:        '⬜',
    keywords:    ['spacer', 'space', 'gap', 'padding', 'whitespace'],
    version:     1,
    defaultProps: () => ({
      type:    'spacer',
      version: 1,
      height:  '40px',
    }),
  },

  // ── Shopify Commerce ──────────────────────────────────────────────
  product_grid: {
    PreviewComponent:  ProductGridBlockPreview,
    SettingsComponent: ProductGridBlockSettings,
    category:    'shopify',
    label:       'Product Grid',
    icon:        '🛍',
    keywords:    ['product', 'grid', 'shop', 'catalog', 'products', 'ecommerce'],
    version:     1,
    defaultProps: () => ({
      type:         'product_grid',
      version:      1,
      title:        'Our Products',
      searchQuery:  '',
      manualProducts: [],
      columns:      '3',
      maxProducts:  '6',
      cardStyle:    'shadow',
      gap:          '16px',
      showPrice:    true,
      showButton:   true,
      buttonText:   'Add to Cart',
      buttonColor:  '#008060',
    }),
  },

  collection: {
    PreviewComponent:  CollectionBlockPreview,
    SettingsComponent: CollectionBlockSettings,
    category:    'shopify',
    label:       'Collection',
    icon:        '📦',
    keywords:    ['collection', 'category', 'products', 'shop', 'browse'],
    version:     1,
    defaultProps: () => ({
      type:             'collection',
      version:          1,
      collectionHandle: '',
      heading:          '',
      layout:           'grid',
      columns:          '3',
      maxProducts:      '8',
      showTitle:        true,
      showViewAll:      true,
      showPrice:        true,
      showButton:       true,
      buttonText:       'Shop Now',
      buttonColor:      '#008060',
    }),
  },

  buy_button: {
    PreviewComponent:  BuyButtonBlockPreview,
    SettingsComponent: BuyButtonBlockSettings,
    category:    'shopify',
    label:       'Buy Button',
    icon:        '🛒',
    keywords:    ['buy', 'button', 'product', 'single', 'add to cart', 'feature', 'cta'],
    version:     1,
    defaultProps: () => ({
      type:        'buy_button',
      version:     1,
      product:     null,
      layout:      'horizontal',
      imageSize:   '120px',
      maxWidth:    '100%',
      buttonText:  'Add to Cart',
      buttonColor: '#008060',
      showPrice:   true,
      showDescription: false,
      showBadge:   false,
      badge:       'FEATURED',
    }),
  },
};

// ── Registry helper functions ─────────────────────────────────────────────────

/** Get registry entry for a block type. Returns null for unregistered types. */
export function getBlockMeta(type) {
  return componentRegistry[type] ?? null;
}

/** Check if a block type is handled by the new registry. */
export function isRegisteredBlock(type) {
  return type in componentRegistry;
}

/** Get all registry entries grouped by category for the toolbar. */
export function getBlocksByCategory() {
  const groups = {};
  for (const [type, meta] of Object.entries(componentRegistry)) {
    if (!groups[meta.category]) groups[meta.category] = [];
    groups[meta.category].push({ type, ...meta });
  }
  return groups;
}

/** Search blocks by label or keywords (for future AI / search UI). */
export function searchBlocks(query) {
  if (!query) {
    return Object.entries(componentRegistry).map(([type, meta]) => ({ type, ...meta }));
  }
  const q = query.toLowerCase();
  return Object.entries(componentRegistry)
    .filter(([, meta]) =>
      meta.label.toLowerCase().includes(q) ||
      meta.keywords.some(k => k.includes(q))
    )
    .map(([type, meta]) => ({ type, ...meta }));
}

/**
 * Phase 5: AI Generation Architecture
 * Exports the schema for all blocks.
 * An LLM can use this JSON to understand the available block types and construct a page.
 */
export function generateRegistrySchema() {
  const schema = {};
  for (const [type, meta] of Object.entries(componentRegistry)) {
    // Generate default props to figure out the shape
    const defaultProps = meta.defaultProps ? meta.defaultProps() : {};
    schema[type] = {
      label: meta.label,
      category: meta.category,
      keywords: meta.keywords,
      version: meta.version,
      schemaShape: defaultProps,
    };
  }
  return schema;
}
