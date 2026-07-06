# Blog Builder — Issue Tracker

Deep review of the Tiptap blog builder (editor, custom nodes, backend compiler, publish pipeline).
Statuses: 🔴 OPEN · 🟡 IN PROGRESS · ✅ FIXED (verified) · ⏸ DEFERRED

Verification methods used (rerunnable: `bash web/scratch/editor-tests/run.sh`):
- **Build**: `npm run build` (vite) in `web/frontend` must pass.
- **Compiler test**: node script compiling sample HTML for each block through `EditorContentCompiler` and asserting output.
- **Static round-trip reasoning**: parseHTML/renderHTML symmetry check per node.

---

## Critical — data corruption (HTML round-trip on save → reopen)

### BB-001 — `style` attribute collision corrupts ButtonBlock & DividerBlock ✅ FIXED
**Files:** `web/frontend/components/editor/nodes/ButtonBlock/ButtonBlock.js`, `DividerBlock/DividerBlock.js`
Node attrs named `style` ("filled"/"solid") merge with the inline CSS `style` attribute via `mergeAttributes` → serialized as `style="filled; text-align:..."`. On reopen, the attr parses back as the full CSS string. Buttons flip to outlined/wrong colors; dividers lose their line style.
**Fix plan:** rename attr to `variant`; serialize ALL node attrs as explicit `data-*` attributes with typed parse/render helpers.

### BB-002 — Boolean attrs round-trip as truthy strings ✅ FIXED
**Files:** `ButtonBlock.js` (`fullWidth`), `ProductCard.js` (`showImage`, `showPrice`, `showButton`)
`false` serializes as `attr="false"`, parses back as string `"false"` (truthy). Buttons become full-width; ProductCard toggles can never persist "off". Numbers also come back as strings.
**Fix plan:** typed `data-*` attribute helpers (bool/int coercion on parse).

### BB-003 — CalloutBlock duplicates its emoji on every save/reopen ✅ FIXED
**File:** `CalloutBlock/CalloutBlock.js`
parseHTML rule lacks `contentElement`, so the rendered emoji `<span>` is re-parsed into the inline content each cycle.
**Fix plan:** add `contentElement: '.callout-content'` (and same hardening for ImageBlock's figcaption).

### BB-020 — DividerBlock swallowed by StarterKit's HorizontalRule on reload ✅ FIXED
**File:** `DividerBlock/DividerBlock.js` *(discovered by the round-trip test, existed before this work)*
StarterKit's generic `hr` parse rule outranked `hr[data-type="dividerBlock"]`, so every saved divider degraded to a plain horizontal rule on reopen (all styling lost).
**Fix:** `priority: 100` on the DividerBlock parse rule.

---

## Critical — editor broken

### BB-004 — 12 toolbar buttons throw; legacy articles mangled on open ✅ FIXED
**File:** `web/frontend/components/editor/TiptapEditor.jsx` (extensions list vs toolbar)
Toolbar inserts `buyButton`, `productGrid`, `collection`, `ctaButton`, `heroBlock`, `videoBlock`, `spacerBlock`, `product`, `product_sidebar`, `featured_product`, `product_switcher`, `product_slider` — none registered → `insertContent` throws RangeError. Existing articles containing these blocks lose their block data on next save.
**Fix plan:** re-register all legacy extensions that don't collide with new nodes (new `imageBlock`/`dividerBlock` intentionally replace the legacy ones of the same name).

### BB-019 — New nodes unreachable (no toolbar buttons) ✅ FIXED
**File:** `TiptapEditor.jsx`
`calloutBlock`, `buttonBlock`, `htmlBlock`, `columnLayout`, `videoEmbedBlock`, `productCard` have no insert UI at all.
**Fix plan:** add a "New Blocks" toolbar group inserting each node.

---

## Critical — published articles broken on storefront

`EditorContentCompiler.compile()` only handles legacy block types; the new nodes fall through.

### BB-005 — ProductCard publishes as an empty `<div>` ✅ FIXED
**Files:** `ProductCard.js` (renderHTML has no children), `web/src/services/EditorContentCompiler.js`
**Fix plan:** compiler case `productCard` rendering full card HTML (image, title, price, compare-at, button → links to `/products/{handle}`).

### BB-006 — HtmlBlock publishes as nothing ✅ FIXED
**Files:** `HtmlBlock.js`, `EditorContentCompiler.js`
Code lives only in `data-html` (URI-encoded); compiler never decodes it.
**Fix plan:** compiler case `htmlBlock` decoding `data-html` and injecting the raw HTML/Liquid.

### BB-007 — Column layouts collapse to stacked divs on storefront ✅ FIXED
**Files:** `ColumnLayout.js`, `Column.js`, `EditorContentCompiler.js` (`generateStyles`)
Layout relies on `.tiptap-column-layout` flex CSS that exists only in the admin editor CSS. No responsive stacking either.
**Fix plan:** emit flex styles in compiled output + add column CSS (with mobile stacking media query) to `generateStyles()`.

### BB-008 — VideoEmbedBlock: Vimeo/Loom embeds dead; youtu.be `?si=` broken ✅ FIXED
**Files:** `VideoEmbedBlock.js`, `VideoEmbedBlockView.jsx`, `EditorContentCompiler.js`
renderHTML converts only YouTube watch URLs (naive `split('v=')`); query strings on `youtu.be` links break the ID; Shorts unsupported; Vimeo/Loom raw URLs get X-Frame-Options-refused; empty URL still renders an iframe.
**Fix plan:** shared robust `getVideoEmbedUrl()` util (YouTube incl. shorts/youtu.be, Vimeo, Loom) used by node view, renderHTML, and compiler; placeholder when URL empty.

### BB-009 — ImageBlock link setting does nothing ✅ FIXED
**File:** `ImageBlock.js`
`linkUrl`/`linkTarget` attrs are editable but renderHTML never wraps the `<img>` in an `<a>`; compiler skips `<figure>` elements.
**Fix plan:** wrap image in anchor in renderHTML when `linkUrl` set.

---

## Major — UX / incomplete features

### BB-010 — No drag handle: "drag & drop" builder has no drag UI ✅ FIXED
**File:** `TiptapEditor.jsx`
`DragHandle` from `@tiptap/extension-drag-handle-react` imported but never rendered.
**Fix plan:** render `<DragHandle>` with grip icon + CSS.

### BB-011 — Floating block toolbars invisible AND intercept clicks ✅ FIXED
**Files:** all 8 node views + `TiptapEditor.css`
Toolbars sit at `opacity: 0` 36px above each block, revealed only by hovering the invisible strip itself; meanwhile they block clicks on the line above (zIndex 10, active pointer events). ProductCard's full-card invisible overlay swallows all pointer events.
**Fix plan:** CSS-driven: `.tiptap-block-toolbar { opacity:0; pointer-events:none }` shown on wrapper `:hover`/selection; remove JS onMouseEnter hacks; replace ProductCard overlay with corner buttons.

### BB-012 — ColumnLayout: "3/4 cols" crashes, reduce shows alert(), widths never rebalance ✅ FIXED
**File:** `ColumnLayoutView.jsx`
`schema.nodes.column.create({...})` without content violates `block+` → throws; `rebalanceColumns` is an empty stub → widths total >100% → overflow; reducing cols = `alert()`.
**Fix plan:** use `createAndFill`; implement true set-column-count (moving content from removed columns); rebalance widths in the same transaction.

### BB-013 — Column resize: breaks 100% total, floods undo, no unmount cleanup ✅ FIXED
**File:** `ColumnView.jsx`
Drag updates only own width (neighbor untouched); every mousemove dispatches a transaction into undo history; listeners leak if unmounted mid-drag.
**Fix plan:** resize pairs (this column + next sibling) via editor transaction; add `addToHistory` metadata during drag with final commit; cleanup on unmount.

### BB-014 — ProductCard product selection is a mock ✅ FIXED
**File:** `ProductCardView.jsx`
Hardcoded "Select Mock Product" button.
**Fix plan:** wire `window.shopify.resourcePicker({ type: 'product' })` (same pattern as BuyButtonBlock).

### BB-015 — ImageBlock placeholder not wired to ShopifyFilePicker ✅ FIXED
**File:** `ImageBlockView.jsx`
"Click to add image" only opens a URL-paste modal.
**Fix plan:** open `ShopifyFilePicker` from placeholder + settings.

---

## Minor / hardening

### BB-016 — HtmlBlock: decode crash + unsanitized admin preview ✅ FIXED
**File:** `HtmlBlock.js`, `HtmlBlockView.jsx`
`decodeURIComponent` throws on malformed `data-html` (editor crash on load); preview `dangerouslySetInnerHTML` executes arbitrary markup in admin context.
**Fix plan:** try/catch decode; strip `<script>` + inline event handlers in the admin preview (storefront output stays raw — embedding HTML is the block's purpose; Shopify sanitizes article HTML server-side).

### BB-017 — `setContent(content, false)` uses Tiptap v2 signature ✅ FIXED
**File:** `TiptapEditor.jsx`
v3 expects an options object; works today by accident.
**Fix plan:** `setContent(content, { emitUpdate: false })`.

### BB-018 — Tiptap version skew in package.json ✅ FIXED
**File:** `web/frontend/package.json`
`@tiptap/react`, `pm`, `starter-kit`, `extension-underline` at `^3.23.6`; all other extensions `^3.26.0`.
**Fix plan:** align ranges to `^3.26.0` (verify installed versions already satisfy).

---

## Change log

| Date | Issue(s) | Result |
|------|----------|--------|
| 2026-07-03 | — | Tracker created; baseline `vite build` passes (6.5s) |
| 2026-07-03 | BB-001, BB-002, BB-003, BB-009, BB-020 | All node attrs now serialize as typed `data-*` attributes via `nodes/attrHelpers.js`; `style`→`variant`/`lineStyle` renames; callout `contentElement`; imageBlock `<a>` wrap; divider parse priority. **Verified:** vite build + headless jsdom round-trip suite (render→parse→render stable, typed attrs preserved) — all 40 assertions pass. |
| 2026-07-03 | BB-004, BB-019 | Re-registered 12 legacy extensions; added legacy-compat parse rules so old div-based imageBlock/dividerBlock content migrates to the new nodes; added 6 toolbar buttons for the new blocks (callout, button, 2-column layout, video embed, HTML, product card). **Verified:** vite build + headless schema check — all 20 toolbar-inserted types resolve in the schema. |
| 2026-07-03 | BB-005, BB-006, BB-007, BB-008 | Compiler: new `renderProductCard`/`renderHtmlBlock`/`renderVideoEmbed` cases; kebab-case `data-*` → camelCase attr mapping; Loom + YouTube Shorts in `getEmbedUrl`; column CSS + mobile stacking in `generateStyles`. Also fixed a latent bug where unhandled container divs were re-serialized, detaching nested blocks (e.g. productCard inside a column) before they compiled. **Verified:** node compiler test suite — 19 assertions pass, incl. nested-block regression test. |
| 2026-07-03 | BB-010, BB-011 | DragHandle now rendered with grip icon (drag & drop works); block toolbars converted to CSS-driven `.tiptap-block:hover > .tiptap-block-toolbar` pattern — hidden toolbars are now `pointer-events: none` so they no longer intercept clicks; ProductCard's full-card overlay replaced with corner Edit/× buttons. **Verified:** vite build passes; grep confirms zero JS opacity handlers remain in node views. |
| 2026-07-03 | BB-012, BB-013 | ColumnLayout `setColumns` rebuilt: single-transaction replaceWith, `createAndFill` for new columns, content of removed columns merged into the last kept one, widths rebalanced; alert() removed. Column resize now adjusts the adjacent column (pair always sums constant), commits ONE transaction on mouseup (single undo step), live preview via local state, listener cleanup on unmount, handle hidden on last column. **Verified:** headless column-operations suite (expand 2→4, reduce 4→2, doc.check(), single-step transaction) — all pass. |
| 2026-07-03 | BB-014, BB-015 | ProductCard "Select Product" now opens `window.shopify.resourcePicker` and maps id/title/handle/image/price/compareAtPrice (same pattern as BuyButtonBlock); ImageBlock placeholder and settings now open ShopifyFilePicker ("Browse Shopify Files"). **Verified:** vite build; picker result mapping cross-checked against BuyButtonBlock's working implementation. |
| 2026-07-03 | BB-016, BB-017, BB-018 | HtmlBlock: `decodeURIComponent` wrapped in try/catch, `html` attr no longer leaks raw into an `html=` attribute, admin preview sanitized (script tags, on* handlers, javascript: URLs stripped — stored value untouched); `setContent` migrated to v3 options object; all `@tiptap/*` deps pinned to exact 3.26.0 (npm install; single `@tiptap/core`/`pm` instance in tree). **Verified:** vite build + all four test suites re-run green on the aligned tree. |
| 2026-07-03 | — | Test suites persisted to `web/scratch/editor-tests/` (`bash web/scratch/editor-tests/run.sh`): roundtrip (40 assertions), schema (20), columns (12), compiler (19). Full run green. |
