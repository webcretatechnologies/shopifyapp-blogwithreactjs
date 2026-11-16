import { APP_NAME } from "./src/utils/appName.js";

/**
 * Public pricing page for the Shopify App Store "more pricing information" URL.
 * Served without auth. Amounts default to the seed values; the /pricing route may
 * override them with live SubscriptionPlan / AiCreditPack rows.
 */

export const DEFAULT_PRICING = {
  plans: [
    {
      key: "free",
      title: "Free",
      priceLabel: "$0",
      periodLabel: "to install",
      yearlyLabel: null,
      description: "Start writing and publishing with core tools.",
      features: [
        "Up to 2 articles (lifetime)",
        "2 AI credits (lifetime)",
        "1 saved template",
        "Drag-and-drop post editor",
        "SEO title and description",
        "Views and visitor analytics",
        "Blog comments and blog import",
        "21 blog templates and theme color sync",
      ],
    },
    {
      key: "starter",
      title: "Starter",
      priceLabel: "$14.99",
      periodLabel: "every 30 days",
      yearlyLabel: "$99.99 / year",
      description: "Grow your blog with product blocks and two-way sync.",
      features: [
        "Everything in Free",
        "Up to 30 articles per month",
        "15 AI credits per month",
        "10 saved templates",
        "Shopify product blocks",
        "Two-way sync with Shopify articles",
        "Meta robots and rich snippets",
        "Custom CSS, related posts, listing layouts",
        "Clone article and remove Powered by badge",
      ],
    },
    {
      key: "pro",
      title: "Pro",
      priceLabel: "$29.99",
      periodLabel: "every 30 days",
      yearlyLabel: "$199.99 / year",
      description: "Full content, SEO, translation, and order analytics.",
      features: [
        "Everything in Starter",
        "Unlimited articles",
        "40 AI credits per month",
        "Unlimited saved templates",
        "Schedule posts for later",
        "Multi-language post translation",
        "Hide sections by device",
        "XML sitemap and blog sidebar",
        "Custom header and footer code",
        "Order and revenue analytics",
      ],
      highlighted: true,
    },
  ],
  packs: [
    { credits: 5, priceLabel: "$4.99", note: "Small pack" },
    { credits: 20, priceLabel: "$9.99", note: "Most popular" },
    { credits: 50, priceLabel: "$19.99", note: "Best value" },
  ],
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(amount, currency = "USD") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Map live DB rows onto the public page shape. Falls back to DEFAULT_PRICING when a tier
 * is missing so the App Store URL never renders an empty page.
 */
export function buildPricingFromDb({ plans = [], packs = [] } = {}) {
  const byName = Object.fromEntries(plans.map((p) => [p.name, p]));
  const currency = byName["Starter Plan"]?.currency || byName["Pro Plan"]?.currency || "USD";

  const starterMonthly = byName["Starter Plan"];
  const starterAnnual = byName["Starter Plan Annual"];
  const proMonthly = byName["Pro Plan"];
  const proAnnual = byName["Pro Plan Annual"];

  const result = {
    plans: DEFAULT_PRICING.plans.map((plan) => {
      if (plan.key === "starter" && starterMonthly) {
        return {
          ...plan,
          priceLabel: money(starterMonthly.price, starterMonthly.currency || currency),
          periodLabel: "every 30 days",
          yearlyLabel: starterAnnual
            ? `${money(starterAnnual.price, starterAnnual.currency || currency)} / year`
            : plan.yearlyLabel,
        };
      }
      if (plan.key === "pro" && proMonthly) {
        return {
          ...plan,
          priceLabel: money(proMonthly.price, proMonthly.currency || currency),
          periodLabel: "every 30 days",
          yearlyLabel: proAnnual
            ? `${money(proAnnual.price, proAnnual.currency || currency)} / year`
            : plan.yearlyLabel,
        };
      }
      return plan;
    }),
    packs:
      packs.length > 0
        ? packs
            .filter((p) => p.isActive !== false)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((p, i) => ({
              credits: p.credits,
              priceLabel: money(p.price, p.currency || currency),
              note: i === 1 ? "Most popular" : i === 2 ? "Best value" : "Small pack",
            }))
        : DEFAULT_PRICING.packs,
  };

  return result;
}

export function renderPricingPageHtml(pricing = DEFAULT_PRICING) {
  const plans = pricing.plans || DEFAULT_PRICING.plans;
  const packs = pricing.packs || DEFAULT_PRICING.packs;
  const year = new Date().getFullYear();

  const planCards = plans
    .map((plan) => {
      const features = (plan.features || [])
        .map((f) => `<li>${escapeHtml(f)}</li>`)
        .join("");
      const yearly = plan.yearlyLabel
        ? `<p class="plan-yearly">${escapeHtml(plan.yearlyLabel)}</p>`
        : "";
      const badge = plan.highlighted ? `<span class="badge">Recommended</span>` : "";
      return `
        <article class="plan${plan.highlighted ? " plan--featured" : ""}">
          ${badge}
          <h2>${escapeHtml(plan.title)}</h2>
          <p class="plan-price"><span class="amount">${escapeHtml(plan.priceLabel)}</span> <span class="period">${escapeHtml(plan.periodLabel)}</span></p>
          ${yearly}
          <p class="plan-desc">${escapeHtml(plan.description)}</p>
          <ul>${features}</ul>
        </article>`;
    })
    .join("");

  const packCards = packs
    .map(
      (pack) => `
        <article class="pack">
          <p class="pack-note">${escapeHtml(pack.note)}</p>
          <h3>${escapeHtml(String(pack.credits))} credits</h3>
          <p class="pack-price">${escapeHtml(pack.priceLabel)}</p>
          <p class="pack-meta">One-time · never expires</p>
        </article>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pricing — ${escapeHtml(APP_NAME)}</title>
<meta name="description" content="Subscription plans and optional one-time AI credit packs for ${escapeHtml(APP_NAME)}. All charges are billed through Shopify.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #14201b;
    --muted: #5a6a62;
    --paper: #f4f7f4;
    --card: #ffffff;
    --line: #d7e0da;
    --accent: #0f6b4c;
    --accent-soft: #e6f3ec;
    --shadow: 0 18px 40px rgba(20, 32, 27, 0.08);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    background:
      radial-gradient(circle at top left, rgba(15, 107, 76, 0.08), transparent 36%),
      linear-gradient(180deg, #eef4f0 0%, var(--paper) 42%, #e8efe9 100%);
    font-family: "Outfit", system-ui, sans-serif;
    line-height: 1.55;
  }
  .wrap {
    width: min(1120px, calc(100% - 40px));
    margin: 0 auto;
    padding: 56px 0 88px;
  }
  .hero {
    max-width: 720px;
    margin-bottom: 40px;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  h1 {
    margin: 18px 0 12px;
    font-family: "Fraunces", Georgia, serif;
    font-size: clamp(2.2rem, 4vw, 3.4rem);
    line-height: 1.08;
    font-weight: 700;
  }
  .lede {
    margin: 0;
    color: var(--muted);
    font-size: 1.08rem;
    max-width: 58ch;
  }
  .section-title {
    margin: 56px 0 8px;
    font-family: "Fraunces", Georgia, serif;
    font-size: 1.7rem;
  }
  .section-copy {
    margin: 0 0 24px;
    color: var(--muted);
    max-width: 62ch;
  }
  .plans {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }
  .plan, .pack {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 22px;
    padding: 28px 24px;
    box-shadow: var(--shadow);
  }
  .plan--featured {
    border-color: rgba(15, 107, 76, 0.35);
    background: linear-gradient(180deg, #ffffff 0%, #f3faf6 100%);
  }
  .badge {
    display: inline-block;
    margin-bottom: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--accent);
    color: white;
    font-size: 12px;
    font-weight: 600;
  }
  .plan h2, .pack h3 {
    margin: 0 0 10px;
    font-size: 1.45rem;
  }
  .plan-price {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .amount {
    font-family: "Fraunces", Georgia, serif;
    font-size: 2.2rem;
    font-weight: 700;
  }
  .period, .plan-yearly, .plan-desc, .pack-meta, .pack-note {
    color: var(--muted);
  }
  .plan-yearly {
    margin: 6px 0 0;
    font-size: 0.95rem;
  }
  .plan-desc {
    margin: 14px 0 18px;
    min-height: 3.1em;
  }
  .plan ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .plan li {
    position: relative;
    padding: 8px 0 8px 22px;
    border-top: 1px solid var(--line);
    font-size: 0.95rem;
  }
  .plan li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 15px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  .packs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }
  .pack-note {
    margin: 0 0 8px;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .pack-price {
    margin: 0;
    font-family: "Fraunces", Georgia, serif;
    font-size: 2rem;
    font-weight: 700;
  }
  .pack-meta {
    margin: 8px 0 0;
    font-size: 0.92rem;
  }
  .note {
    margin-top: 36px;
    padding: 22px 24px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid var(--line);
  }
  .note h2 {
    margin: 0 0 8px;
    font-size: 1.15rem;
  }
  .note p {
    margin: 0;
    color: var(--muted);
  }
  .note a { color: var(--accent); }
  footer {
    margin-top: 40px;
    color: var(--muted);
    font-size: 0.9rem;
  }
  @media (max-width: 900px) {
    .plans, .packs { grid-template-columns: 1fr; }
    .wrap { width: min(1120px, calc(100% - 28px)); padding-top: 36px; }
  }
</style>
</head>
<body>
  <main class="wrap">
    <header class="hero">
      <span class="eyebrow">${escapeHtml(APP_NAME)}</span>
      <h1>Pricing built for blogs that sell</h1>
      <p class="lede">SmartBlog plans unlock AI drafting, SEO, product-ready posts, and Insights that show what drives orders. Add optional AI credit packs when you need more drafts. Every charge is billed through Shopify.</p>
    </header>

    <h2 class="section-title">Subscription plans</h2>
    <p class="section-copy">Upgrade or downgrade anytime from Plans &amp; Billing inside the app. Development stores can test paid plans without a charge when enabled.</p>
    <section class="plans" aria-label="Subscription plans">
      ${planCards}
    </section>

    <h2 class="section-title">Optional AI credit packs</h2>
    <p class="section-copy">One-time purchases that top up your AI writing allowance. Credits never expire and stack on top of your plan’s included credits. Buy them from Plans &amp; Billing after install.</p>
    <section class="packs" aria-label="AI credit packs">
      ${packCards}
    </section>

    <aside class="note">
      <h2>Billing notes</h2>
      <p>All subscription and one-time charges go through the Shopify Billing API. There are no separate invoices or off-platform payments for app charges. Plan names and included AI credits match what you see in the app. For support, use the contact email on the App Store listing.</p>
    </aside>

    <footer>
      <p>© ${year} ${escapeHtml(APP_NAME)}. <a href="/privacy-policy">Privacy policy</a></p>
    </footer>
  </main>
</body>
</html>`;
}
