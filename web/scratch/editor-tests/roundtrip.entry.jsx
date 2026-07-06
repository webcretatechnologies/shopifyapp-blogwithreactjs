// Round-trip verification: render -> parse -> render must be stable
// and attrs must survive with correct types.
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
  const { generateHTML, generateJSON } = await import("@tiptap/core");
  const { default: StarterKit } = await import("@tiptap/starter-kit");
  const { ButtonBlock } = await import("./components/editor/nodes/ButtonBlock/ButtonBlock");
  const { DividerBlock } = await import("./components/editor/nodes/DividerBlock/DividerBlock");
  const { CalloutBlock } = await import("./components/editor/nodes/CalloutBlock/CalloutBlock");
  const { ImageBlock } = await import("./components/editor/nodes/ImageBlock/ImageBlock");
  const { VideoEmbedBlock } = await import("./components/editor/nodes/VideoEmbedBlock/VideoEmbedBlock");
  const { ProductCard } = await import("./components/editor/nodes/ProductCard/ProductCard");
  const { HtmlBlock } = await import("./components/editor/nodes/HtmlBlock/HtmlBlock");
  const { ColumnLayout } = await import("./components/editor/nodes/ColumnLayout/ColumnLayout");
  const { Column } = await import("./components/editor/nodes/ColumnLayout/Column");

  const extensions = [
    StarterKit.configure({ link: false, underline: false }),
    ButtonBlock, DividerBlock, CalloutBlock, ImageBlock,
    VideoEmbedBlock, ProductCard, HtmlBlock, ColumnLayout, Column,
  ];

  let failures = 0;
  const check = (label, cond, detail = "") => {
    if (cond) console.log(`  PASS ${label}`);
    else { failures++; console.log(`  FAIL ${label} ${detail}`); }
  };

  const roundtrip = (name, nodeJson, assertAttrs) => {
    console.log(`\n== ${name} ==`);
    const doc = { type: "doc", content: [nodeJson] };
    const html1 = generateHTML(doc, extensions);
    const json2 = generateJSON(html1, extensions);
    const html2 = generateHTML(json2, extensions);
    check("html stable", html1 === html2, `\n    h1: ${html1}\n    h2: ${html2}`);
    const parsed = json2.content?.[0];
    check("node type kept", parsed?.type === nodeJson.type, `got ${parsed?.type}`);
    if (assertAttrs && parsed) {
      for (const [k, v] of Object.entries(assertAttrs)) {
        const got = parsed.attrs?.[k];
        check(`attr ${k} === ${JSON.stringify(v)}`, JSON.stringify(got) === JSON.stringify(v), `got ${JSON.stringify(got)} (${typeof got})`);
      }
    }
    return json2;
  };

  roundtrip("buttonBlock", {
    type: "buttonBlock",
    attrs: { text: "Buy now", url: "https://x.co", target: "_blank", variant: "outlined", color: "#ff0000", textColor: "#ffffff", size: "large", alignment: "center", borderRadius: 12, fullWidth: false },
  }, { variant: "outlined", borderRadius: 12, fullWidth: false, alignment: "center" });

  roundtrip("dividerBlock", {
    type: "dividerBlock",
    attrs: { lineStyle: "dashed", color: "#123456", thickness: 3, spacing: 40 },
  }, { lineStyle: "dashed", thickness: 3, spacing: 40 });

  const calloutJson = roundtrip("calloutBlock", {
    type: "calloutBlock",
    attrs: { type: "warning", emoji: "⚠️", backgroundColor: "#fffbeb", borderColor: "#f59e0b" },
    content: [{ type: "text", text: "Careful here" }],
  }, { type: "warning", emoji: "⚠️" });
  const calloutText = (calloutJson.content?.[0]?.content || []).map((n) => n.text).join("");
  if (calloutText === "Careful here") console.log("  PASS emoji not duplicated into content");
  else { console.log(`  FAIL content mutated: ${JSON.stringify(calloutText)}`); failures++; }

  roundtrip("imageBlock (linked)", {
    type: "imageBlock",
    attrs: { src: "https://cdn/img.png", alt: "A pic", width: "50%", alignment: "right", borderRadius: 8, linkUrl: "https://shop.co/p", linkTarget: "_blank" },
    content: [{ type: "text", text: "My caption" }],
  }, { src: "https://cdn/img.png", width: "50%", borderRadius: 8, linkUrl: "https://shop.co/p" });

  const html = generateHTML({ type: "doc", content: [{ type: "imageBlock", attrs: { src: "s.png", linkUrl: "https://l.ink" }, content: [] }] }, extensions);
  check("imageBlock renders <a> wrap", html.includes('<a href="https://l.ink"'), html);

  roundtrip("videoEmbedBlock", {
    type: "videoEmbedBlock",
    attrs: { url: "https://youtu.be/dQw4w9WgXcQ?si=abc123", provider: "youtube", width: "75%", aspectRatio: "16:9" },
  }, { url: "https://youtu.be/dQw4w9WgXcQ?si=abc123", width: "75%" });

  const vHtml = generateHTML({ type: "doc", content: [{ type: "videoEmbedBlock", attrs: { url: "https://youtu.be/dQw4w9WgXcQ?si=abc123" } }] }, extensions);
  check("youtu.be?si= converts to /embed/ID", vHtml.includes("youtube.com/embed/dQw4w9WgXcQ"), vHtml);
  const vHtml2 = generateHTML({ type: "doc", content: [{ type: "videoEmbedBlock", attrs: { url: "https://vimeo.com/76979871" } }] }, extensions);
  check("vimeo converts to player.vimeo", vHtml2.includes("player.vimeo.com/video/76979871"), vHtml2);
  const vHtml3 = generateHTML({ type: "doc", content: [{ type: "videoEmbedBlock", attrs: { url: "" } }] }, extensions);
  check("empty url renders no iframe", !vHtml3.includes("<iframe"), vHtml3);

  roundtrip("productCard", {
    type: "productCard",
    attrs: { productId: "gid://shopify/Product/1", title: "Tee", price: "$10", imageUrl: "i.png", compareAtPrice: "$20", handle: "tee", buttonText: "Grab it", buttonColor: "#000000", showImage: false, showPrice: true, showButton: false, layout: "horizontal", borderRadius: 4, borderColor: "#cccccc", backgroundColor: "#fafafa" },
  }, { showImage: false, showButton: false, showPrice: true, layout: "horizontal", borderRadius: 4, handle: "tee" });

  roundtrip("htmlBlock", {
    type: "htmlBlock",
    attrs: { html: '<div class="x">Hi & <b>there</b> 100%</div>' },
  }, { html: '<div class="x">Hi & <b>there</b> 100%</div>' });

  roundtrip("columnLayout", {
    type: "columnLayout",
    attrs: { columns: 2 },
    content: [
      { type: "column", attrs: { width: 30 }, content: [{ type: "paragraph", content: [{ type: "text", text: "left" }] }] },
      { type: "column", attrs: { width: 70 }, content: [{ type: "paragraph", content: [{ type: "text", text: "right" }] }] },
    ],
  }, { columns: 2 });

  console.log(failures === 0 ? "\nALL ROUND-TRIP TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
