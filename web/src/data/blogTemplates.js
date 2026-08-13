/**
 * Curated library of full-page Blog Templates for the drag & drop Builder.
 *
 * Each template is a tree of Builder blocks (see BlockRegistry.jsx on the frontend for the
 * canonical type/settings reference). Only the settings that matter for the template's content
 * are specified here — normalizeBlocksAst() (BlockRegistry.jsx) merges every block's settings
 * over that block type's registry defaults and assigns ids, so omitted fields (colors, radii,
 * button labels, etc.) safely fall back to the shop's current defaults / theme-synced values at
 * the moment the template is applied, rather than baking in stale values.
 *
 * Design constraints (confirmed against the live builder):
 *  - Product-referencing blocks (BuyButton, ProductGrid, ProductSlider, Collection, ProductCard)
 *    ship empty/unbound (`manualProducts: []`, `product: null`, `collectionHandle: ""`) — there is
 *    no safe "auto-pick a product" default that works for every shop, so the merchant picks their
 *    own product(s)/collection right after applying the template.
 *  - Image/HeroSection.backgroundImage ship with `src`/`backgroundImage: ""` for the same reason
 *    (no app-owned image host) — the merchant uploads or picks from Shopify Files.
 *  - Copy is written as ready-to-publish placeholder content (not "lorem ipsum"), so a merchant
 *    who only swaps in their product and a couple of images has a genuinely usable article.
 */

const doc = (paragraphs) => ({
  type: "doc",
  content: paragraphs.map((p) => ({
    type: "paragraph",
    content: p ? [{ type: "text", text: p }] : undefined,
  })),
});

const section = (settings, children) => ({
  type: "Section",
  settings: settings || {},
  children,
});

const columns = (count, children, gap) => ({
  type: "ColumnLayout",
  settings: { columns: count, gap: gap || "24px" },
  children: children.map((col) => ({ type: "Column", settings: { width: "100%" }, children: col })),
});

const heading = (text, level = 2, extra) => ({ type: "Heading", settings: { text, level, ...extra }, children: [] });
const rich = (paragraphs, extra) => ({ type: "RichText", settings: { content: doc(paragraphs), ...extra }, children: [] });
const image = (alt, extra) => ({ type: "Image", settings: { src: "", alt, ...extra }, children: [] });
const spacer = (height = "32px") => ({ type: "Spacer", settings: { height }, children: [] });
const divider = () => ({ type: "Divider", settings: {}, children: [] });
const callout = (settings) => ({ type: "Callout", settings, children: [] });
const button = (text, extra) => ({ type: "ButtonBlock", settings: { text, ...extra }, children: [] });
const faq = (title, items, extra) => ({ type: "FaqBlock", settings: { title, items, ...extra }, children: [] });
const toc = (extra) => ({ type: "TableOfContents", settings: extra || {}, children: [] });
const buyButton = (extra) => ({ type: "BuyButton", settings: { product: null, ...extra }, children: [] });
const productGrid = (extra) => ({ type: "ProductGrid", settings: { manualProducts: [], ...extra }, children: [] });
const productSlider = (extra) => ({ type: "ProductSlider", settings: { manualProducts: [], ...extra }, children: [] });
const collectionBlock = (extra) => ({ type: "Collection", settings: { collectionHandle: "", ...extra }, children: [] });
const hero = (extra) => ({ type: "HeroSection", settings: { backgroundImage: "", ...extra }, children: [] });
const table = (rows, cols, tableData, hasHeader = true) => ({ type: "Table", settings: { rows, cols, tableData, hasHeader }, children: [] });

let faqIdCounter = 0;
const faqItem = (question, answer) => ({ id: `faq_${++faqIdCounter}`, question, answer });

export const BLOG_TEMPLATES = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "product-review",
    name: "Product Review",
    description: "An honest, structured single-product review — hero, verdict up front, pros & cons, and a direct add-to-cart.",
    category: "Commerce",
    thumbnail: "⭐",
    accent: "#2c6e49",
    badge: "Popular",
    preview: { hero: true, lines: 3, hasProducts: true },
    blocks: [
      hero({
        heading: "Our Honest Review: [Product Name]",
        subheading: "We tested it for 30 days — here's exactly what we found.",
        minHeight: "360px",
        showCta: true,
        ctaText: "Shop This Product",
        ctaUrl: "/",
      }),
      section({ paddingTop: "40px", paddingBottom: "16px" }, [
        toc({ title: "In This Review" }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("The Quick Verdict", 2),
        callout({
          type: "info",
          title: "Bottom line",
          body: "Replace this with your one-sentence verdict — who it's best for and the single biggest reason to buy (or skip) it.",
          emoji: "✅",
        }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("What It Is & Who It's For", 2),
        rich([
          "Give a short, plain-English overview of the product — what it does, what problem it solves, and the type of customer it's built for.",
        ]),
        image("Product in use"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Pros & Cons", 2),
        columns(2, [
          [
            heading("👍 What we liked", 3),
            rich(["First standout strength.", "Second standout strength.", "Third standout strength."]),
          ],
          [
            heading("👎 What could be better", 3),
            rich(["One honest limitation worth mentioning.", "A second, minor drawback."]),
          ],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("How It Performed", 2),
        rich([
          "Walk through your real testing experience in 2-3 short paragraphs — first impressions, day-to-day use, and how it held up over time.",
        ]),
      ]),
      section({ backgroundColor: "#f6f6f7", paddingTop: "32px", paddingBottom: "32px", borderRadius: "12px" }, [
        heading("Ready to Try It?", 2, { align: "center" }),
        buyButton({ layout: "horizontal", showDescription: true }),
      ]),
      section({ paddingTop: "24px", paddingBottom: "24px" }, [
        faq("Common Questions", [
          faqItem("Is this worth the price?", "Answer honestly based on the value you found during testing versus the cost."),
          faqItem("How does it compare to alternatives?", "Briefly compare against the 1-2 closest competing products."),
          faqItem("What's the return policy?", "Summarize your store's return/refund policy for this product."),
        ]),
      ]),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "how-to-guide",
    name: "How-To Guide",
    description: "A numbered, skimmable step-by-step tutorial with a table of contents and a related-products close.",
    category: "Educational",
    thumbnail: "📋",
    accent: "#1d4ed8",
    badge: null,
    preview: { lines: 4, hasSteps: true, hasProducts: true },
    blocks: [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("How to [Achieve a Specific Result]", 1),
        rich(["A one-paragraph promise of what the reader will be able to do by the end of this guide, and roughly how long it takes."]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        toc({ title: "What You'll Learn" }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("What You'll Need", 2),
        rich(["List the tools, products, or materials required before starting."]),
      ]),
      divider(),
      section({ paddingTop: "16px", paddingBottom: "16px" }, [
        heading("Step 1: [Action]", 3),
        rich(["Explain the first step clearly and specifically."]),
        image("Step 1"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 2: [Action]", 3),
        rich(["Explain the second step clearly and specifically."]),
        image("Step 2"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 3: [Action]", 3),
        rich(["Explain the third step clearly and specifically."]),
        callout({
          type: "tip",
          title: "Pro tip",
          body: "Share one insider tip that makes this step easier or avoids a common mistake.",
          emoji: "💡",
        }),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 4: [Action]", 3),
        rich(["Explain the final step and what success looks like."]),
        image("Finished result"),
      ]),
      divider(),
      section({ paddingTop: "16px", paddingBottom: "24px" }, [
        heading("Common Mistakes to Avoid", 2),
        rich(["Mistake #1 and how to avoid it.", "Mistake #2 and how to avoid it."]),
      ]),
      section({ backgroundColor: "#f6f6f7", paddingTop: "32px", paddingBottom: "32px", borderRadius: "12px" }, [
        heading("Everything You Need for This Project", 2, { align: "center" }),
        productGrid({ title: "", columns: "3", maxProducts: "3" }),
      ]),
      section({ paddingTop: "24px", paddingBottom: "24px" }, [
        faq("Frequently Asked Questions", [
          faqItem("How long does this take?", "Give a realistic time estimate."),
          faqItem("Can beginners do this?", "Address the skill level required."),
        ]),
      ]),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "top-picks-listicle",
    name: "Top Picks Listicle",
    description: "A ranked \"best of\" roundup — repeatable numbered sections, each with an image, blurb, and product card.",
    category: "Commerce",
    thumbnail: "🏆",
    accent: "#b45309",
    badge: "Popular",
    preview: { hero: true, columns: 2, lines: 2, hasProducts: true },
    blocks: [
      hero({
        heading: "[Number] Best [Products] for [Use Case] in 2026",
        subheading: "Hand-picked and tested — here are our top recommendations.",
        minHeight: "320px",
        showCta: false,
      }),
      section({ paddingTop: "32px", paddingBottom: "8px" }, [
        rich(["A short intro explaining how you chose these picks and what to look for when comparing them."]),
        toc({ title: "Jump to a Pick" }),
      ]),
      ...[1, 2, 3].map((n) =>
        section({ paddingTop: "24px", paddingBottom: "24px" }, [
          heading(`${n}. [Product Name] — Best for [Specific Reason]`, 2),
          columns(2, [
            [image(`Pick ${n}`)],
            [
              rich(["Why this one made the list — the single biggest reason it stands out for this use case."]),
              buyButton({ layout: "vertical", showPrice: true }),
            ],
          ]),
        ])
      ),
      divider(),
      section({ backgroundColor: "#f6f6f7", paddingTop: "32px", paddingBottom: "32px", borderRadius: "12px" }, [
        heading("Shop the Full Collection", 2, { align: "center" }),
        collectionBlock({ heading: "", layout: "grid", columns: "3", maxProducts: "6" }),
      ]),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "buying-guide",
    name: "Buying Guide",
    description: "Helps undecided shoppers choose — a spec comparison table, pros/cons, and a clear recommendation.",
    category: "Commerce",
    thumbnail: "🧭",
    accent: "#334155",
    badge: null,
    preview: { lines: 2, hasTable: true, hasProducts: true },
    blocks: [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("The Complete Buying Guide to [Category]", 1),
        rich(["An overview of what makes a good [category] product and what this guide will help the reader decide."]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [toc({ title: "In This Guide" })]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Key Things to Look For", 2),
        rich(["Factor #1 to consider and why it matters.", "Factor #2 to consider and why it matters.", "Factor #3 to consider and why it matters."]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Compare at a Glance", 2),
        table(4, 3, [
          ["Option", "Best For", "Price Range"],
          ["[Product A]", "Beginners", "$"],
          ["[Product B]", "Everyday use", "$$"],
          ["[Product C]", "Enthusiasts", "$$$"],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Our Recommendation", 2),
        columns(2, [
          [heading("👍 Choose this if…", 3), rich(["Describe the ideal customer for your top recommendation."])],
          [heading("👎 Skip this if…", 3), rich(["Describe who should look elsewhere and why."])],
        ]),
      ]),
      section({ backgroundColor: "#f6f6f7", paddingTop: "32px", paddingBottom: "32px", borderRadius: "12px" }, [
        heading("Shop Our Top Picks", 2, { align: "center" }),
        productGrid({ columns: "3", maxProducts: "6" }),
      ]),
      section({ paddingTop: "24px", paddingBottom: "24px" }, [
        faq("Buying Guide FAQ", [
          faqItem("What's the most important factor to consider?", "Name the single most important decision factor."),
          faqItem("Do I need the most expensive option?", "Address whether spending more is actually worth it."),
        ]),
      ]),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "brand-story",
    name: "Brand Story",
    description: "A narrative, editorial-style post for founder stories, brand milestones, or behind-the-scenes features.",
    category: "Editorial",
    thumbnail: "📖",
    accent: "#7c2d92",
    badge: "New",
    preview: { hero: true, columns: 2, lines: 2 },
    blocks: [
      hero({
        heading: "[Headline That Tells the Story]",
        subheading: "An inside look at how it all started.",
        minHeight: "420px",
        overlayOpacity: 0.45,
        showCta: false,
      }),
      section({ paddingTop: "40px", paddingBottom: "8px", maxWidth: "760px" }, [
        rich(["Open with a hook — a moment, a problem, or a question that pulls the reader in."]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px", maxWidth: "760px" }, [
        columns(2, [
          [image("Behind the scenes")],
          [rich(["Continue the story — the turning point, the decision, or the challenge that shaped what came next."])],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px", maxWidth: "760px" }, [
        callout({
          type: "quote",
          title: "",
          body: "\"A short, memorable quote from the founder or team goes here.\"",
          emoji: "💬",
        }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px", maxWidth: "760px" }, [
        rich(["Bring it to today — what the brand looks like now, and what's ahead."]),
      ]),
      spacer("24px"),
      section({ backgroundColor: "#f6f6f7", paddingTop: "32px", paddingBottom: "32px", borderRadius: "12px" }, [
        heading("Discover the Collection", 2, { align: "center" }),
        productSlider({ maxProducts: "8" }),
      ]),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "product-launch",
    name: "New Product Launch",
    description: "Announces a new product with a bold hero, feature highlights, and a strong first-buyer call to action.",
    category: "Commerce",
    thumbnail: "🚀",
    accent: "#be123c",
    badge: "New",
    preview: { hero: true, lines: 2, hasProducts: true },
    blocks: [
      hero({
        heading: "Introducing [Product Name]",
        subheading: "[One line that captures why it matters]",
        minHeight: "420px",
        showCta: true,
        ctaText: "Shop Now",
        ctaUrl: "/",
      }),
      section({ paddingTop: "40px", paddingBottom: "16px" }, [
        heading("Why We Made This", 2, { align: "center" }),
        rich(["Explain the gap or problem this product was built to solve, in the brand's voice."]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("What Makes It Different", 2),
        columns(3, [
          [heading("Feature One", 3), rich(["A short, benefit-focused description."])],
          [heading("Feature Two", 3), rich(["A short, benefit-focused description."])],
          [heading("Feature Three", 3), rich(["A short, benefit-focused description."])],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        image("Product hero shot"),
      ]),
      section({ backgroundColor: "#f6f6f7", paddingTop: "32px", paddingBottom: "32px", borderRadius: "12px" }, [
        heading("Be Among the First to Own It", 2, { align: "center" }),
        buyButton({ layout: "horizontal", showBadge: true, badge: "NEW" }),
      ]),
      section({ paddingTop: "24px", paddingBottom: "24px" }, [
        faq("Launch FAQ", [
          faqItem("When does it ship?", "Give shipping/availability details."),
          faqItem("Is it available in-store too?", "Clarify availability channels."),
        ]),
      ]),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "gift-guide",
    name: "Seasonal Gift Guide",
    description: "A browsable, occasion-based gift guide organized into shoppable categories — built for holiday traffic.",
    category: "Commerce",
    thumbnail: "🎁",
    accent: "#0f766e",
    badge: "Popular",
    preview: { hero: true, lines: 1, hasProducts: true },
    blocks: [
      hero({
        heading: "The [Season/Holiday] Gift Guide",
        subheading: "Something for everyone on your list.",
        minHeight: "340px",
        showCta: false,
      }),
      section({ paddingTop: "32px", paddingBottom: "8px" }, [
        rich(["A short, warm intro setting up how the guide is organized (by recipient, price, or category)."]),
        toc({ title: "Shop by Category" }),
      ]),
      section({ paddingTop: "16px", paddingBottom: "24px" }, [
        heading("🎀 Gifts Under $50", 2),
        productGrid({ columns: "4", maxProducts: "4" }),
      ]),
      section({ paddingTop: "0px", paddingBottom: "24px" }, [
        heading("💝 Gifts They'll Actually Use", 2),
        productGrid({ columns: "4", maxProducts: "4" }),
      ]),
      section({ paddingTop: "0px", paddingBottom: "24px" }, [
        heading("✨ Splurge-Worthy Picks", 2),
        productGrid({ columns: "4", maxProducts: "4" }),
      ]),
      section({ backgroundColor: "#f6f6f7", paddingTop: "28px", paddingBottom: "28px", borderRadius: "12px" }, [
        heading("Still Not Sure What to Get?", 2, { align: "center" }),
        button("Shop Gift Cards", { alignment: "center", url: "/" }),
      ]),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "faq-support-article",
    name: "FAQ / Support Article",
    description: "A focused help-center-style article — clear intro, a large FAQ accordion, and a contact fallback.",
    category: "Educational",
    thumbnail: "❓",
    accent: "#4338ca",
    badge: null,
    preview: { lines: 2, hasFaq: true },
    blocks: [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("[Topic] — Frequently Asked Questions", 1),
        rich(["A short, reassuring intro that tells the reader this article answers their most common questions about [topic]."]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        faq("", [
          faqItem("Question one?", "A clear, complete answer."),
          faqItem("Question two?", "A clear, complete answer."),
          faqItem("Question three?", "A clear, complete answer."),
          faqItem("Question four?", "A clear, complete answer."),
          faqItem("Question five?", "A clear, complete answer."),
        ], { firstOpen: true }),
      ]),
      divider(),
      section({ backgroundColor: "#f6f6f7", paddingTop: "28px", paddingBottom: "28px", borderRadius: "12px" }, [
        heading("Still Have Questions?", 2, { align: "center" }),
        rich(["Our team is happy to help — reach out and we'll get back to you shortly."]),
        button("Contact Support", { alignment: "center", url: "/pages/contact" }),
      ]),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "versus-comparison",
    name: "Product A vs. Product B",
    description: "A head-to-head comparison that helps shoppers choose between two options — spec table plus a clear winner per category.",
    category: "Commerce",
    thumbnail: "⚖️",
    accent: "#9a3412",
    badge: null,
    preview: { columns: 2, hasTable: true },
    blocks: [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("[Product A] vs. [Product B]: Which Should You Buy?", 1),
        rich(["A quick summary of the two products being compared and who this comparison is written for."]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        columns(2, [
          [image("Product A"), heading("[Product A]", 3, { align: "center" }), buyButton({ layout: "vertical" })],
          [image("Product B"), heading("[Product B]", 3, { align: "center" }), buyButton({ layout: "vertical" })],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Spec-by-Spec Comparison", 2),
        table(5, 3, [
          ["Feature", "[Product A]", "[Product B]"],
          ["Price", "$", "$"],
          ["Best for", "Beginners", "Enthusiasts"],
          ["Key feature", "Describe it", "Describe it"],
          ["Warranty", "1 year", "2 years"],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Where Each One Wins", 2),
        columns(2, [
          [heading("[Product A] wins on…", 3), rich(["The category where Product A is the better choice, and why."])],
          [heading("[Product B] wins on…", 3), rich(["The category where Product B is the better choice, and why."])],
        ]),
      ]),
      section({ backgroundColor: "#f6f6f7", paddingTop: "32px", paddingBottom: "32px", borderRadius: "12px" }, [
        heading("Our Final Verdict", 2, { align: "center" }),
        callout({
          type: "info",
          title: "The bottom line",
          body: "State plainly which product you'd recommend overall, and for whom the other is still the better pick.",
          emoji: "🏁",
        }),
      ]),
      section({ paddingTop: "24px", paddingBottom: "24px" }, [
        faq("Comparison FAQ", [
          faqItem("Can I use both together?", "Address whether the two products are complementary or mutually exclusive."),
          faqItem("Which one is better for beginners?", "Give a direct recommendation."),
        ]),
      ]),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "recipe-diy-tutorial",
    name: "Recipe / DIY Tutorial",
    description: "An ingredients-and-steps format for recipes, DIY projects, or craft tutorials — with a shoppable materials list.",
    category: "Educational",
    thumbnail: "🧾",
    accent: "#15803d",
    badge: "New",
    preview: { hasTable: true, hasSteps: true },
    blocks: [
      hero({
        heading: "[Recipe or Project Name]",
        subheading: "Prep time: [X] min · Total time: [Y] min · Difficulty: [Easy/Medium/Hard]",
        minHeight: "320px",
        showCta: false,
      }),
      section({ paddingTop: "32px", paddingBottom: "8px" }, [
        rich(["A short, appetizing (or exciting) intro to what the reader is about to make."]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("What You'll Need", 2),
        table(5, 2, [
          ["Item", "Quantity"],
          ["[Ingredient / material 1]", "1"],
          ["[Ingredient / material 2]", "1"],
          ["[Ingredient / material 3]", "1"],
          ["[Ingredient / material 4]", "1"],
        ]),
        productGrid({ title: "Shop the Materials", columns: "4", maxProducts: "4" }),
      ]),
      divider(),
      ...[1, 2, 3, 4].map((n) =>
        section({ paddingTop: "16px", paddingBottom: "16px" }, [
          heading(`Step ${n}`, 3),
          rich(["Describe this step clearly, including any timing or technique details."]),
          image(`Step ${n}`),
        ])
      ),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        callout({
          type: "tip",
          title: "Pro tip",
          body: "Share one tip that helps the result turn out better.",
          emoji: "💡",
        }),
      ]),
      section({ backgroundColor: "#f6f6f7", paddingTop: "28px", paddingBottom: "28px", borderRadius: "12px" }, [
        heading("You'll Also Love", 2, { align: "center" }),
        productSlider({ maxProducts: "8" }),
      ]),
    ],
  },
];

export function getBlogTemplateSummaries() {
  return BLOG_TEMPLATES.map(({ key, name, description, category, thumbnail, accent, badge, preview }) => ({
    key,
    name,
    description,
    category,
    thumbnail,
    accent: accent || "#303030",
    badge: badge || null,
    preview: preview || {},
  }));
}

export function getBlogTemplateByKey(key) {
  return BLOG_TEMPLATES.find((t) => t.key === key) || null;
}
