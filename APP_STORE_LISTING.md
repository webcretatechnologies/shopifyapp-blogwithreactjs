# Shopify App Store listing

Paste-ready copy for the Partner Dashboard. Lengths match Shopify’s listing limits:
app name 30, app card subtitle under 62, introduction 100, details 500, each feature 80.
Prices and plan bullets match the defaults in `web/prisma/seed.js` and
`web/src/services/PlanFeatureService.js`. If a Super Admin has changed live prices or
limits, use those live values instead.

Do not put prices, review quotes, or statistics in the introduction, details, features, or images.

## App name (30)

SmartBlog – AI, SEO & Insights

Must match `shopify.app.production.toml`. The dev name “SmartBlog – AI, SEO Local” is not the listing name.

## App card subtitle (59)

Publish blog posts in a visual editor, without theme edits.

## App introduction (76)

Write posts in a visual editor and see which ones lead shoppers to checkout.

## App details (381)

Build posts in a drag-and-drop editor and publish them as native Shopify articles. Add headings, images, video, FAQs, and product blocks that use your store prices. Set meta titles, descriptions, canonical URLs, and structured data. See views and which posts are tied to orders. Translate posts into your store languages, start from templates, and sync edits with the Shopify blog.

## Feature list (5 maximum, each under 80)

1. Drag-and-drop editor for headings, images, video, tables, and FAQs
2. Publish each post as a native Shopify blog article
3. Embed live products, collections, and buy buttons in a post
4. Set meta titles, descriptions, canonical URLs, and structured data
5. See post views and which posts are connected to orders

Translations, templates, scheduling, and device visibility stay in App details and in the Pro plan. They do not get their own feature row.

## Search terms (5)

1. blog builder
2. SEO
3. translations
4. analytics
5. templates

## Category and eligibility

- Primary category: Store design › Content › Blogs
- Content creation: Drag-and-drop editor, Templates, AI generation
- SEO: Meta tags, Rich snippets
- Display options: Layouts, Featured posts
- Sales channel: Online Store is required
- App UI language: English only. Post translation is a storefront feature, not an admin-UI language
- Integrations: leave empty. Do not list Shopify

## Pricing

Billing method: Recurring charge, with a free plan. No free trial. All charges go through Shopify Billing.

Show plans from lowest to highest. Yearly prices are the annual charge, not a per-month figure.

### Free — $0

- Up to 2 articles (lifetime)
- 2 AI credits (lifetime, does not refresh)
- 1 saved template
- Drag-and-drop builder
- Basic SEO meta title and description
- Analytics for views and visitors
- Blog comments
- Import from the store’s existing Shopify blogs
- 21 blog templates
- Theme color sync
- “Powered by” badge shown

### Starter — $14.99 every 30 days, or $99.99 per year

Everything in Free, plus:

- Up to 30 articles per month
- 15 AI credits per month
- 10 saved templates
- Shopify product blocks
- FAQ block and table of contents
- Two-way sync with Shopify articles
- Meta robots and rich snippets
- Custom CSS
- Related posts and listing layout
- Clone article
- Remove the “Powered by” badge

### Pro — $29.99 every 30 days, or $199.99 per year

Everything in Starter, plus:

- Unlimited articles
- 40 AI credits per month
- Unlimited saved templates
- Blog post scheduling
- Multi-language post translation
- Hide sections by device
- Blog sidebar
- XML sitemap
- Custom header and footer code
- Advanced analytics, including orders tied to a post

### Additional charges

One-time AI credit packs, billed with Shopify’s one-time charge. Purchased credits do not expire and stack on the plan allowance.

- 5 credits — $4.99
- 20 credits — $9.99
- 50 credits — $19.99

## Links still needed before submit

- Support email: not set in the repo. The privacy policy tells merchants to use the listing’s support channel
- Privacy policy URL: `https://blogapp-dev.boxtasks.com/privacy-policy`
- More pricing information URL: `https://blogapp-dev.boxtasks.com/pricing`
- Demo store URL: a development store opened on a published post that shows a product block

## Desktop screenshots

Use these six files from the Drive folder. Each is already 1600×900. Leave Mobile and Point of Sale empty.

1. Image-1.png — Drag-and-drop blog editor with content and product blocks
2. Image-7.png — Blog template library for reviews, roundups, and comparisons
3. Image-2.png — SEO title, description, rich snippet, and sitemap fields
4. Image-6.png — Blog listing layouts with a related-posts sidebar
5. Image-5.png — Blog posts synced with native Shopify articles
6. Image-8.png — Schedule a blog post to publish on a later date

Do not upload Image-3.png. It shows a revenue figure and funnel counts, which Shopify rejects in listing images. Do not upload Image-4.png until the “128 with AI” figure is removed.
