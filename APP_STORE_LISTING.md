# Shopify App Store Listing Content

Draft copy for the Partner Dashboard listing form. Review and adjust before publishing —
placeholders are marked `[ ]`.

---

## App name

Blogger — Visual Blog Builder & SEO

*(Must match the name configured in the Partner Dashboard / `shopify.app.toml`. Avoid marketing
text or special characters per Shopify's naming requirements — keep this short and factual.)*

## Tagline (one line, ~70 characters max)

Drag-and-drop blog builder with SEO, analytics, and native Shopify sync.

## Category

Marketing → Content marketing *(or "Store design" — confirm against Shopify's current category
list in the Partner Dashboard, as exact taxonomy changes over time)*

## App introduction (1–2 sentences, shown at the top of the listing)

Build and publish blog posts visually — no code, no theme editing — with a real drag-and-drop
editor, built-in SEO tools, and product blocks that turn content into sales, fully synced with
Shopify's native blog.

## App details (longer description)

Turn your Shopify blog into a real content and SEO channel — without writing HTML or touching
your theme.

**Visual Drag & Drop Builder**
Build blog posts block-by-block: headings, rich text, images, video, tables, FAQs, callouts, and
layout blocks like sections and multi-column rows. Preview instantly on desktop, tablet, and
mobile, and hide any block on specific devices.

**Sell directly from your content**
Embed real products right inside your posts — Buy Buttons, product grids, sliders, collections,
featured product blocks, and a product sidebar — all pulling live pricing and inventory from your
store, no manual updates needed.

**Built-in SEO, not an afterthought**
Meta titles and descriptions, canonical URLs, Open Graph tags, meta robots controls, JSON-LD rich
snippets, an auto-generated XML sitemap, and a Table of Contents block with anchor links and
smooth scrolling — all built into every post.

**Stays in sync with Shopify**
Two-way sync with Shopify's native blog articles: edit in the app or directly in Shopify admin,
and changes reconcile automatically. Nothing is locked into a proprietary format — your content
lives as real Shopify articles.

**Know what's working**
Built-in analytics track views, unique visitors, and which posts actually drive orders — attributed
directly to the blog post that sent the customer to checkout.

**Reach more customers**
Translate posts into every language your store supports, manually or with one-click
auto-translate, without leaving the block structure of your original post behind.

**Related posts, comments, and templates**
Automatic or manually-curated related posts, a lightweight comment moderation dashboard, and a
library of ready-to-use blog templates to start from instead of a blank page.

## Key benefits (bulleted, shown as a scannable list in the listing)

- No-code visual editor — build posts the same way you'd build a page, block by block
- Real two-way sync with Shopify's native blog — never locked in
- Embed live products (Buy Button, grids, sliders, collections) directly in content
- Full on-page SEO toolkit: meta tags, canonical URLs, rich snippets, sitemap
- Built-in analytics with order attribution back to individual posts
- Multi-language translation, manual or automatic
- Hide any block per device (mobile / tablet / desktop)
- Works with your existing theme — no theme code edits required

## Pricing

*(Must exactly match what's configured in the Partner Dashboard's pricing section — this app uses
the Shopify Billing API via `appSubscriptionCreate`, not external billing.)*

| Plan | Price | Highlights |
|---|---|---|
| Free | $0/mo | Visual builder, up to [ N ] articles, basic SEO, automatic related posts, comment moderation |
| Starter | $[ X ]/mo | Everything in Free, plus: higher/unlimited article limit, manual sync actions, scheduled publishing, manual related posts, advanced SEO (OG tags, canonical URL), custom CSS, product blocks |
| Pro | $[ Y ]/mo | Everything in Starter, plus: translations, custom global header/footer code, advanced analytics, remove branding, device-based visibility controls, XML sitemap controls |

*Confirm exact price points and feature-per-tier wording against the live pricing page before
submission — this table should mirror `plans.jsx` / the Partner Dashboard exactly.*

## Support

- **Support email:** `[ support@yourdomain.com ]`
- **Support URL (optional):** `[ https://yourdomain.com/support ]`

## Privacy policy URL

`https://[ your-production-domain ]/privacy-policy`

*(Served by the app itself — see `web/privacyPolicyContent.js` and the `/privacy-policy` route
in `web/index.js`. Publicly accessible, no login required. Update the domain once deployed.)*

## Screenshots (minimum required by Shopify — confirm current count in Partner Dashboard)

Suggested shots to capture once the app is live on a demo store:

1. The visual drag-and-drop builder canvas with a few blocks placed (hero shot)
2. The block picker sidebar showing available content and commerce blocks
3. A published blog post on the live storefront with an embedded product block
4. The SEO panel (meta title/description, rich snippet, sitemap controls)
5. The analytics dashboard showing views/visitors/conversions
6. The Translate Article page showing a non-English translation
7. Settings page (appearance / content display options)

*(Actual screenshots must be captured from a real running instance — not included here.)*

## App icon

`[ 1200×1200px PNG, no transparency, per Shopify's icon requirements ]`

## Demo store / test instructions for reviewers

`[ Provide a link to a demo store or a note describing how to reach a fully set-up blog post for
review, since app functionality centers on content that needs to exist to be evaluated. ]`

---

## Notes for whoever finalizes this listing

- Replace every `[ ]` placeholder before submitting.
- Pricing table must be word-for-word consistent with the in-app pricing page and the Partner
  Dashboard's billing configuration — Shopify checks for this.
- The "Data protection details" questionnaire in the Partner Dashboard must accurately describe
  what's in the Privacy Policy above (order-attribution cart attribute, anonymous analytics
  events, no customer PII stored).
