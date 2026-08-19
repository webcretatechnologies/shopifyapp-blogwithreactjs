// Thin client for Shopify's Partner API (partners.shopify.com/api/... — distinct from the
// per-merchant Admin API this app otherwise uses). Requires organization-level credentials that
// only an Organization Owner can generate (Partners Dashboard → Settings → Partner API clients),
// so these are separate app-wide env vars, not derived from any merchant session.
//
// Currently used only to pull real RelationshipUninstalled events (Shopify's own uninstall
// reason/description, collected from the merchant at uninstall time) for the "Why They
// Uninstall" admin report — this app has no other Partner-level data (payouts, transactions)
// wired up, and none of that is implied by adding this client.
const PARTNER_API_TOKEN = process.env.PARTNER_API_TOKEN;
const PARTNER_ORGANIZATION_ID = process.env.PARTNER_ORGANIZATION_ID;
const PARTNER_APP_ID = process.env.PARTNER_APP_ID;

export function partnerApiConfigured() {
  return Boolean(PARTNER_API_TOKEN && PARTNER_ORGANIZATION_ID && PARTNER_APP_ID);
}

async function partnerGraphQL(query, variables) {
  const res = await fetch(`https://partners.shopify.com/${PARTNER_ORGANIZATION_ID}/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": PARTNER_API_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Partner API returned ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join("; "));
  return data.data;
}

const UNINSTALL_EVENTS_QUERY = `
  query UninstallEvents($appId: ID!, $first: Int!) {
    app(id: $appId) {
      events(first: $first, types: [RELATIONSHIP_UNINSTALLED]) {
        edges {
          node {
            __typename
            occurredAt
            ... on RelationshipUninstalled {
              reason
              description
              shop {
                myshopifyDomain
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Real uninstall reasons/descriptions straight from Shopify's own post-uninstall survey — not
 * anything this app collects itself. Returns { configured: false } when Partner API credentials
 * aren't set (rather than throwing), so callers can render an honest "not connected yet" state.
 */
export async function fetchUninstallEvents(limit = 50) {
  if (!partnerApiConfigured()) return { configured: false, events: [] };

  const data = await partnerGraphQL(UNINSTALL_EVENTS_QUERY, { appId: PARTNER_APP_ID, first: limit });
  const edges = data?.app?.events?.edges || [];
  const events = edges
    .map((e) => e.node)
    .filter((n) => n.__typename === "RelationshipUninstalled")
    .map((n) => ({
      shopDomain: n.shop?.myshopifyDomain || "Unknown",
      reason: n.reason || "Not specified",
      description: n.description || null,
      occurredAt: n.occurredAt,
    }));

  return { configured: true, events };
}
