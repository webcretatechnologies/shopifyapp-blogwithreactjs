// Verifies every node type the toolbar inserts exists in the editor schema.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.DOMParser = dom.window.DOMParser;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
const matchMediaStub = () => ({ matches: false, media: "", addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false });
dom.window.matchMedia = matchMediaStub;
global.matchMedia = matchMediaStub;

const run = async () => {
  const { getSchema } = await import("@tiptap/core");
  const fs = await import("fs");
  const src = fs.readFileSync("./components/editor/TiptapEditor.jsx", "utf8");

  // Reconstruct the same extension list the editor registers
  const { default: StarterKit } = await import("@tiptap/starter-kit");
  const { Underline } = await import("@tiptap/extension-underline");
  const { ResizableImage } = await import("./components/editor/extensions/ResizableImage");
  const { Link } = await import("@tiptap/extension-link");
  const { Placeholder } = await import("@tiptap/extension-placeholder");
  const { TextAlign } = await import("@tiptap/extension-text-align");
  const { TextStyle } = await import("@tiptap/extension-text-style");
  const { Color } = await import("@tiptap/extension-color");
  const { Highlight } = await import("@tiptap/extension-highlight");
  const { Youtube } = await import("@tiptap/extension-youtube");
  const { Table } = await import("@tiptap/extension-table");
  const { TableRow } = await import("@tiptap/extension-table-row");
  const { CustomTableHeader, CustomTableCell } = await import("./components/editor/extensions/tableExtensions");
  const { ColumnLayout } = await import("./components/editor/nodes/ColumnLayout/ColumnLayout");
  const { Column } = await import("./components/editor/nodes/ColumnLayout/Column");
  const { ProductCard } = await import("./components/editor/nodes/ProductCard/ProductCard");
  const { ImageBlock } = await import("./components/editor/nodes/ImageBlock/ImageBlock");
  const { DividerBlock } = await import("./components/editor/nodes/DividerBlock/DividerBlock");
  const { CalloutBlock } = await import("./components/editor/nodes/CalloutBlock/CalloutBlock");
  const { VideoEmbedBlock } = await import("./components/editor/nodes/VideoEmbedBlock/VideoEmbedBlock");
  const { ButtonBlock } = await import("./components/editor/nodes/ButtonBlock/ButtonBlock");
  const { HtmlBlock } = await import("./components/editor/nodes/HtmlBlock/HtmlBlock");
  const { BuyButtonExtension } = await import("./components/editor/extensions/BuyButtonExtension");
  const { ProductGridExtension } = await import("./components/editor/extensions/ProductGridExtension");
  const { CollectionExtension } = await import("./components/editor/extensions/CollectionExtension");
  const { CTAButtonExtension } = await import("./components/editor/extensions/CTAButtonExtension");
  const { HeroExtension } = await import("./components/editor/extensions/HeroExtension");
  const { VideoExtension } = await import("./components/editor/extensions/VideoExtension");
  const { SpacerExtension } = await import("./components/editor/extensions/SpacerExtension");
  const { ProductSliderExtension } = await import("./components/editor/extensions/ProductSliderExtension");
  const { LegacyProductCardExtension, LegacyStickyProductExtension, LegacyFeaturedProductExtension } = await import("./components/editor/extensions/LegacyBuyButtonExtensions");
  const { LegacyProductSwitcherExtension } = await import("./components/editor/extensions/LegacyProductGridExtensions");

  const extensions = [
    StarterKit.configure({ link: false, underline: false }),
    Underline, ResizableImage.configure({ inline: false }), Link, Placeholder.configure({ placeholder: "x" }),
    TextStyle, Color, Highlight.configure({ multicolor: true }), TextAlign.configure({ types: ["heading", "paragraph"] }),
    Youtube.configure({ width: "100%", height: 400 }), Table.configure({ resizable: true }), TableRow, CustomTableHeader, CustomTableCell,
    ColumnLayout, Column, ProductCard, ImageBlock, DividerBlock, CalloutBlock, VideoEmbedBlock, ButtonBlock, HtmlBlock,
    BuyButtonExtension, ProductGridExtension, CollectionExtension, CTAButtonExtension, HeroExtension, VideoExtension,
    SpacerExtension, ProductSliderExtension, LegacyProductCardExtension, LegacyStickyProductExtension,
    LegacyFeaturedProductExtension, LegacyProductSwitcherExtension,
  ];

  const schema = getSchema(extensions);

  // Every insertContent({ type: 'X' }) in the toolbar source
  const inserted = [...src.matchAll(/insertContent\(\{\s*\n?\s*type: '([^']+)'/g)].map((m) => m[1]);
  const unique = [...new Set(inserted)];
  let failures = 0;
  for (const t of unique) {
    if (schema.nodes[t]) console.log(`  PASS toolbar type registered: ${t}`);
    else { console.log(`  FAIL toolbar type MISSING from schema: ${t}`); failures++; }
  }
  console.log(`\nChecked ${unique.length} toolbar-inserted types against schema (${Object.keys(schema.nodes).length} nodes registered)`);
  console.log(failures === 0 ? "ALL SCHEMA CHECKS PASSED" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
