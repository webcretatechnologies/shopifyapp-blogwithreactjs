# WYSIWYG Editor — End-to-End Block Audit

**Scope:** Every block/format available in the Tiptap editor (`web/frontend/components/editor/TiptapEditor.jsx`), traced through all three surfaces:

1. **Editor** — how it looks/behaves while writing (`nodes/*View.jsx`, `extensions/*.jsx`, `blocks/*/index.jsx`)
2. **Preview** — the "Live Preview" modal (`ArticlePreview.jsx`), which calls `POST /api/posts/preview` → `EditorContentCompiler.compileForStorefront()`
3. **Live Store** — the HTML actually pushed to Shopify as the Article's `body_html` via `ArticleSyncService` → also `EditorContentCompiler.compileForStorefront()`

**Key architectural fact:** Preview and Live Store run through the exact same compiler function, so they are pixel-identical to each other except for the merchant's theme CSS. Any bug in the compiler affects both identically. The real risk surface is **Editor vs. (Preview+Live)** — the editor is a separate React/Tiptap rendering path that can drift from what the compiler actually produces.

**Methodology / honesty note:** No live Shopify store or authenticated browser session is available in this environment. Verification used: (a) full static read of every node definition, editor NodeView, and the corresponding `EditorContentCompiler` code path; (b) **actually running** `EditorContentCompiler.compile()`/`compileForStorefront()` in Node against realistic sample HTML for each block type and inspecting the real output (not guessed); (c) rendering that real output in headless Chrome and screenshotting it, including at a 375px mobile width, to catch layout bugs a code read alone would miss. This does not cover theme-specific CSS collisions on a real store, only what the compiler itself controls (which is nearly everything, since almost every block inlines its own styles for exactly this reason).

Legend: ✅ verified & good · ⚠️ works but has issues · 🔴 confirmed bug

---

## Top issues, ranked

| Priority | Issue | Blocks affected | Status |
|---|---|---|---|
| 1 | Editor rendered columns stacked instead of side-by-side | Grid/Column Layout | ✅ **Fixed** (this session, earlier) |
| 2 | Divider's on-screen spacing was exactly **half** of what actually published | Divider Block | ✅ **Fixed** — `DividerBlockView.jsx` padding now matches `DividerBlock.js` renderHTML margin exactly |
| 3 | Product Grid / Collection used a fixed CSS Grid with **no mobile breakpoint** — confirmed by screenshot to crush into ~85px unusable cards on a 375px phone | Product Grid, Collection | ✅ **Fixed** — added `.blogger-product-grid` class + breakpoints (2-col ≤640px, 1-col ≤420px), re-verified by screenshot at 375px and 600px |
| 4 | New "Product Card" node hardcoded a `$` price prefix and never applied store-currency formatting, unlike every other commerce block | Product Card (🛍) | ✅ **Fixed** — now stores raw price + resolved currency and calls `formatPrice()` in both the editor and compiler; verified a EUR product now renders `€29.99` |
| 5 | Two live Tiptap nodes both declared `name: 'product_slider'`; only one was registered, but the unregistered duplicate was a landmine | Product Slider vs. dead `LegacyProductSliderExtension` | ✅ **Fixed** — dead duplicate deleted, comment left explaining why |
| 6 | Toolbar mislabeled the fully-current Product Slider block as "(Legacy)" | Product Slider | ✅ **Fixed** — moved to the Commerce Blocks group, relabeled "Insert Product Slider" |
| 6b | Four toolbar buttons (Buy Button + 3 "legacy" presets) insert the *identical* underlying block with only different starting defaults | Buy Button family | ⚠️ **Not changed** — this is a bigger toolbar-redesign decision (collapsing 4 buttons into 1 with a preset picker) rather than a bug fix; flagged for a product decision, not applied unilaterally |
| 7 | Compiler `case` branches (`dividerBlock`, `imageBlock`) are dead code — unreachable for current node markup, only fire for pre-migration content | dividerBlock, imageBlock compiler paths | ✅ **Documented** — added inline comments explaining exactly when each fires, left the code in place for backward compatibility with old articles |
| 8 | Manually-picked products in Product Grid/Slider/Buy Button freeze price & image at insert time; only search-query-driven blocks refresh live | Product Grid, Product Slider, Buy Button | ⚠️ **Not changed** — would need a live GraphQL re-resolve step by `shopifyProductId` at compile time; flagged as a follow-up, not applied since it's a behavior change worth confirming (e.g. what should happen if the product was deleted) rather than a pure bug |
| 9 | `ImageBlockView`'s floating toolbar didn't center over the block like every sibling block does | Image Block | ✅ **Fixed** — added matching `left: 50%; transform: translateX(-50%)` |

---

## 1. Text formatting marks

| # | Block | Editor | Preview/Live | Notes |
|---|-------|--------|---------------|-------|
| 1 | Bold / Italic / Underline / Strikethrough | ✅ | ✅ | Standard StarterKit/Tiptap marks, serialize to `<strong>/<em>/<u>/<s>`. No custom code, no risk. |
| 2 | Text color | ✅ | ✅ | `@tiptap/extension-color` writes inline `style="color:"` — renders identically everywhere since it's plain inline CSS. |
| 3 | Highlight | ✅ | ✅ | `multicolor: true`, writes `<mark style="background-color:">`. Fine. |
| 4 | Inline code | ✅ | ✅ | Standard `<code>`, styled by both `TiptapEditor.css` and `ArticlePreview`'s `.blogger-preview-content code` — live site relies on theme's own `code` styling (no inline style emitted), which is the one place a merchant's theme could visually diverge from Preview. Minor, expected trade-off. |
| 5 | Link | ✅ | ✅ | Modal-based URL entry, `openOnClick: false` (correct — clicking a link while editing text shouldn't navigate). |

## 2. Block-level text structure

| # | Block | Editor | Preview/Live | Notes |
|---|-------|--------|---------------|-------|
| 6 | Heading H1–H3 / Paragraph | ✅ | ✅ | Standard. |
| 7 | Align left/center/right | ✅ | ✅ | `TextAlign` on heading+paragraph, writes inline `style="text-align:"`. |
| 8 | Bullet / Numbered list | ✅ | ✅ | Standard. |
| 9 | Blockquote | ✅ | ✅ | Standard; styled via CSS class in both editor and preview. |
| 10 | Horizontal rule (native, from StarterKit) | ✅ | ✅ | Distinct from the custom "Divider Block" (#23) — StarterKit's plain `<hr>` has no toolbar for styling, which is fine, it's the "quick" option. |
| 11 | Code block | ✅ | ✅ | Standard `<pre><code>`. |

## 3. Media & tables

| # | Block | Editor | Preview/Live | Notes |
|---|-------|--------|---------------|-------|
| 12 | Image upload/select (ResizableImage) | ✅ | ✅ | Custom resize-handle NodeView (`extensions/ResizableImage.jsx`) writing `width`/`height` node attrs straight onto the `<img>`; simple and correct, no compiler involvement needed. |
| 13 | YouTube/Vimeo embed | ✅ | ✅ | `@tiptap/extension-youtube` emits a real `<iframe>` at parse time already, so editor and live are the same markup. |
| 14 | Table (+ full row/col/merge/header/bg toolbar) | ✅ | ✅ | Standard `@tiptap/extension-table` family with custom cell background attribute; the `generateStyles()` global CSS block styles `.blogger-article-container table` for the live site, and `ArticlePreview`'s scoped CSS mirrors those same rules closely. Reasonable parity. |

## 4. New custom block nodes (`components/editor/nodes/`)

| # | Block | Editor | Preview/Live | Notes |
|---|-------|--------|---------------|-------|
| 15 | **Grid/Column Layout** | ✅ | ✅ | **Fixed this session.** Root cause: Tiptap's `ReactNodeViewRenderer` inserts a hidden raw `<div data-node-view-content-react>` *inside* whatever `<NodeViewContent>` renders — the flex CSS was targeting the wrong (outer) element, so columns stacked vertically in the editor despite rendering correctly on the live site. Fixed by targeting `.column-layout-wrapper > [data-node-view-content] > [data-node-view-content-react]` directly; verified with a before/after headless-Chrome screenshot. Also removed two now-dead workaround attempts (a `useEffect` DOM-injection hack, a mistargeted inline `<style>` block). |
| 16 | Image Block (caption/border/link) | ✅ | ✅ | Renders as a `<figure>`, so it falls *outside* the compiler's `div[data-type]` selector entirely and passes through untouched — which is actually correct here because its own `renderHTML` already emits complete, self-contained markup including the real rich-text caption. The compiler's `imageBlock` case (`EditorContentCompiler.js:209`) is dead code for this node — it only fires for pre-migration `<div data-type="imageBlock">` markup from the old `ImageBlockExtension`. |
| 17 | **Divider Block** | ✅ | ✅ | **Fixed.** `DividerBlockView.jsx` padding now reads `${attrs.spacing}px 0`, matching `DividerBlock.js`'s renderHTML margin exactly. |
| 18 | Callout Block (info/warning/tip/success/error) | ✅ | ✅ | Editor NodeView and `renderHTML` build the exact same flex row (emoji + content), no nested-contentDOM issue here because there's only one text child, not multiple block-level children needing a row layout. |
| 19 | Video Embed Block (YouTube/Vimeo/Loom) | ✅ | ✅ | Editor and compiler both call the shared `getVideoEmbedUrl`/`getEmbedUrl` parsers; compiled version additionally adds `border-radius`/`background:#000` polish the editor preview lacks — cosmetic only. |
| 20 | Custom Button Block | ✅ | ✅ | `renderHTML` and the NodeView compute the exact same `getButtonStyles()` — genuinely shared function, can't drift. Best-engineered of the new nodes for this reason. |
| 21 | HTML/Liquid Block | ✅ (by design) | ✅ | Editor sanitizes only its own *preview* pane (strips `<script>`, event handlers, `javascript:`); the stored value and storefront output are deliberately left raw, since embedding raw HTML/Liquid is the feature's whole purpose. See suggestion below re: access control. |
| 22 | Product Card (new node, 🛍) | ✅ | ✅ | **Currency bug fixed** (see "Top issues" #4). Still duplicates ~80% of what "Buy Button" already does with a smaller feature set (no description field) — a consolidation candidate, not a bug. |

## 5. Commerce & layout extensions (`components/editor/extensions/` + `blocks/`)

All eight of these share one factory, `createBlockExtension.jsx`, which is a clean design: a single `NodeView` renders a live `PreviewComponent` both inline in the editor *and* inside its own settings modal, so what you see while configuring is what you see in the document — good UX pattern, no drift by construction for anything that doesn't also depend on the compiler for server-side data.

| # | Block | Editor | Preview/Live | Notes |
|---|-------|--------|---------------|-------|
| 23 | Buy Button | ✅ | ✅ | Best of the commerce blocks: live `useShopifyStoreCurrency()` hook + `formatPrice()` used consistently in both the editor preview and `EditorContentCompiler.renderBuyButton`. Resource-picker driven. |
| 24 | Product Grid | ✅ | ✅ | **Mobile breakpoint fixed** — grid now carries a `.blogger-product-grid` class collapsing to 2 columns ≤640px and 1 column ≤420px. Re-verified by screenshot: a 4-column grid at 375px now stacks to a full-width single column instead of crushing into ~85px cards. |
| 25 | Collection block | ✅ | ✅ | Same fix applies (shares the same `.blogger-product-grid` class in its `layout: "grid"` mode). Its `layout: "scroll"` mode was already fine, since horizontal scroll containers don't need a breakpoint. |
| 26 | CTA Button | ✅ | ✅ | Simple, consistent, no data-fetch risk. |
| 27 | Hero Section | ✅ | ✅ | Editor preview (`HeroBlock/index.jsx`) and `EditorContentCompiler.renderHero` build near-identical containers (same gradient fallback, same overlay math, same alignment logic) — good parity. |
| 28 | Video (legacy-named `videoBlock` extension, distinct from #19) | ✅ | ✅ | Functionally fine; see suggestion below about the naming collision with the newer Video **Embed** Block confusing authors. |
| 29 | Spacer | ✅ | ✅ | Trivial, correct; nice touch that the editor shows a labeled hashed placeholder instead of literal blank space (otherwise you couldn't see/select it). |
| 30 | Product Slider | ✅ | ✅ | Functionally fine (horizontal scroll, no grid-breakpoint issue). **Toolbar mislabel and dead-code duplicate both fixed** (see "Top issues" #5/#6) — now lives in the Commerce Blocks group as "Insert Product Slider", and `LegacyProductSliderExtension` (the unused name-colliding duplicate) has been removed. |

## 6. Legacy blocks

| # | Block | Editor | Preview/Live | Notes |
|---|-------|--------|---------------|-------|
| 31 | Product Card (legacy `product`) | ✅ | ✅ | Round-trips fine — it's the *same* `createBlockExtension`/`BuyButtonBlockPreview` machinery as "Buy Button" (#23), just different default attribute values (vertical layout, no badge). Not actually a different implementation. |
| 32 | Sticky Product (legacy `product_sidebar`) | ✅ | ✅ | Same underlying block as #23/#31 again, defaults tuned for a "STICKY" badge. |
| 33 | Featured Product (legacy `featured_product`) | ✅ | ✅ | Same underlying block once more, defaults tuned for horizontal layout + description shown. |
| 34 | Product Switcher (legacy `product_switcher`) | ✅ | ✅ | Reuses `ProductGridBlockPreview`/`Settings` — same Product Grid machinery, so it also picked up the **mobile-breakpoint fix from #24** automatically. |
| 35 | Product Slider (legacy `product_slider`) | ✅ | ✅ | The toolbar button previously labeled "(Legacy)" has been relabeled and moved (see "Top issues" #6); `LegacyProductSliderExtension`, the unused name-colliding dead code, has been deleted from `LegacyProductGridExtensions.jsx`. |

## 7. Editor chrome / meta features

| # | Feature | Status | Notes |
|---|-------|--------|---------------|
| 36 | Drag handle (reorder blocks) | ✅ | `@tiptap/extension-drag-handle-react`, standard. |
| 37 | Node range select (Alt+Arrow) | ✅ | Standard `@tiptap/extension-node-range`. |
| 38 | Undo/Redo | ✅ | Standard history commands, buttons correctly disable via `editor.can()`. |
| 39 | Raw HTML source editor toggle | ✅ | Textarea bound directly to `content`/`onChange` — works, though see suggestion below (no re-validation before switching back to WYSIWYG). |
| 40 | Placeholder text | ✅ | Standard. |

---

## Detailed findings

### ✅ Divider Block spacing bug — fixed
- Was: `DividerBlockView.jsx:16` used `padding: ${attrs.spacing / 2}px 0` while `DividerBlock.js:40`'s `renderHTML` used `margin: ${attrs.spacing}px 0` — editor showed half the actual published spacing.
- **Fix applied:** `DividerBlockView.jsx` now uses `padding: ${attrs.spacing}px 0`, matching the renderHTML value exactly, with a comment noting the two must stay in sync.

### ✅ Product Grid / Collection missing mobile breakpoint — fixed
- Was: `EditorContentCompiler.js` `renderProductGrid`/`renderCollection` (grid branch) emitted `display: grid; grid-template-columns: repeat(${cols}, 1fr);` with no accompanying media query — confirmed by screenshot to crush into ~85px cards at 375px width.
- **Fix applied:** both functions now add a `blogger-product-grid` class to the grid wrapper (`EditorContentCompiler.js`), and `generateStyles()` gained:
  ```css
  @media (max-width: 640px) {
    .blogger-article-container .blogger-product-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }
  @media (max-width: 420px) {
    .blogger-article-container .blogger-product-grid {
      grid-template-columns: 1fr !important;
    }
  }
  ```
- **Re-verified visually:** the same 4-product grid sample now renders as a clean single column at 375px and two columns at 600px (screenshots taken this session).

### ✅ Product Card (new node) ignored store currency — fixed
- Was: `ProductCardView.jsx:24` stored price as `` `$${variant.price}` `` at product-pick time — hardcoded `$`, frozen forever; `EditorContentCompiler.renderProductCard` printed it verbatim with no currency resolution, unlike every other commerce block.
- **Fix applied:** `ProductCard.js` gained a `currency` node attribute; `ProductCardView.jsx` now resolves the store currency via `useShopifyStoreCurrency()`, stores the raw numeric price, and formats it with `formatPrice()` for display; `EditorContentCompiler.renderProductCard` now resolves `attrs.currency || attrs._storeCurrency || "USD"` and calls `formatPrice()` for both price and compare-at-price.
- **Re-verified:** a sample Product Card with `currency: "EUR"` now compiles to `€29.99` instead of a hardcoded `$29.99`.
- **Not changed:** the node still duplicates most of "Buy Button"'s functionality with a smaller feature set — a consolidation candidate, but a product decision rather than a bug fix, so left as-is.

### ✅ Dead code / naming landmine — fixed
- `LegacyProductSliderExtension` (previously `LegacyProductGridExtensions.jsx:25`) declared `name: 'product_slider'` — identical to the live `ProductSliderExtension.jsx:5`. It was never imported anywhere, so there was no active collision today, but it was a duplicate-node-name landmine for the next person who "helpfully" re-added it.
- **Fix applied:** removed the dead export, left a comment explaining why no legacy `product_slider` extension exists in that file.
- **Left as documentation, not removed:** the compiler's `dividerBlock` (line ~178) and `imageBlock` (line ~209) `switch` cases are unreachable for current node output (new Divider is an `<hr>`, new Image Block is a `<figure>` — the loop only iterates `div[data-type]`) — they only exist to support pre-migration content. Added inline comments explaining exactly when each fires rather than deleting them, since old articles may still rely on that code path.

### ✅ Toolbar mislabeling — fixed / ⚠️ redundancy — flagged, not changed
- **Fixed:** Product Slider was labeled "(Legacy)" in the toolbar despite being the only registered, fully modern implementation. It's now in the Commerce Blocks group, labeled plainly "Insert Product Slider".
- **Not changed (flagged for a product decision):** four toolbar buttons — **Buy Button** 🛒, **Product Card (Legacy)** 🏷, **Sticky Product (Legacy)** 📌, **Featured Product (Legacy)** ⭐ — still all insert the exact same underlying block (`createBlockExtension` + `BuyButtonBlockPreview`/`Settings`), differing only in pre-filled defaults that are editable afterward anyway through the identical settings modal. Collapsing these into one "Buy Button" insert with a preset dropdown ("Standard / Sticky / Featured") would reduce toolbar clutter, but changes toolbar layout/muscle memory for existing users, so it wasn't applied without a product-owner call.

### ⚠️ Stale data risk for manually-picked products
- `renderProductGrid`/`renderProductSlider`/`renderBuyButton` use `attrs.manualProducts`/`attrs.product` completely as stored (price, image, title frozen at insert time) whenever the author manually picked products; only the `searchQuery` path re-fetches live via GraphQL at every compile.
- **Impact:** a merchant who manually curates a "Bestsellers" grid and later runs a sale or updates a product photo will see the blog article silently drift out of sync with the live catalog (wrong price shown, stale image) until they manually re-open and re-save the block.
- **Suggestion:** at minimum, re-resolve `title`/`price`/`image`/availability for manually-picked products by `shopifyProductId` at compile time (same GraphQL client is already in scope), falling back to the frozen values only if the product was deleted. This is the single highest-leverage trust fix for the commerce blocks, since stale prices directly affect purchase decisions.

### ⚠️ HTML/Liquid Block — access control
- By design this block injects completely unsanitized HTML/Liquid straight into the storefront (`EditorContentCompiler.renderHtmlBlock` just URL-decodes and returns it verbatim). That's the intended feature, not a bug, but the toolbar exposes it to anyone who can edit a blog post.
- **Suggestion:** gate this block's toolbar button and/or the whole node behind a staff/admin permission check if the app has any concept of writer vs. admin roles, since it's effectively unrestricted script injection into the merchant's live storefront.

### ✅ Minor polish (fixed)
- `ImageBlockView.jsx`'s floating toolbar positioned with `top: '-36px'` but no `left`/`transform: translateX(-50%)` centering, unlike every sibling block (Button/Callout/Divider/VideoEmbed all center their toolbar) — when the image itself was center- or right-aligned, the toolbar visually detached from it. **Fixed** — now matches the other blocks.

### ⚠️ Minor polish (not changed — flagged for follow-up)
- Raw HTML source-editor toggle (`TiptapEditor.jsx` `showHtml`) doesn't validate/parse the typed HTML before switching back to WYSIWYG — malformed HTML will be silently "corrected" by the browser's parser with no warning to the author. Consider a lightweight parse-and-warn step on toggle-off.

---

## What's already solid

- The **Buy Button**, **CTA Button**, **Hero**, **Callout**, and **Custom Button** blocks all have tight editor/live parity — either by sharing the exact same style-computation function, or by the compiler faithfully mirroring the editor's logic.
- The commerce blocks that use live `searchQuery` (Product Grid/Collection/Slider) correctly resolve fresh product data and store currency via GraphQL at compile time rather than trusting stale client-side state — good architecture where it's used.
- `HtmlBlockView`'s admin-preview sanitizer (stripping `<script>`/event handlers/`javascript:` only in the *editor's own preview pane*, while leaving the intentionally-raw storefront output untouched) is a thoughtful, correctly-scoped security boundary.
- The Column/Grid Layout fix applied this session is now verified working end-to-end.

## Fixes applied this session (build passes, all re-verified with real rendered output)

1. Column/Grid Layout editor stacking bug
2. Divider Block spacing (editor now matches published spacing exactly)
3. Product Grid / Collection mobile breakpoint (2-col ≤640px, 1-col ≤420px)
4. Product Card currency formatting (was hardcoded `$`, now respects store currency)
5. Removed dead-code `product_slider` name-collision landmine
6. Fixed Product Slider toolbar mislabel ("(Legacy)" → correctly grouped as current)
7. Documented (not removed) two dead compiler cases for legacy div-based content
8. Fixed Image Block floating toolbar centering

**Deliberately not changed** (flagged as product decisions, not bugs): consolidating the four Buy-Button-family toolbar buttons into one; re-resolving manually-picked product prices live at compile time; gating the HTML/Liquid block behind a permission check. These would change behavior/UX in ways worth a explicit go-ahead rather than a unilateral fix.
