import shopify from "../../shopify.js";
import { isFeatureEnabled } from "./PlanFeatureService.js";

export const THEME_LISTING_LAYOUT = "theme";

const PAID_LISTING_LAYOUTS = new Set([
  "featured_2",
  "featured_left",
  "featured_right",
  "magazine",
  "grid_2",
  "grid_3",
  "list",
]);

export function listingLayoutForPlan(planKey, savedLayout) {
  if (!isFeatureEnabled(planKey, "listing_layout")) return THEME_LISTING_LAYOUT;
  const layout = String(savedLayout || "featured_2").toLowerCase();
  return PAID_LISTING_LAYOUTS.has(layout) ? layout : "featured_2";
}

/** Storefront listing CSS should use the theme as-is on Free. */
export function isThemeDefaultListing(layout) {
  const value = String(layout || "").toLowerCase();
  return !value || value === THEME_LISTING_LAYOUT || value === "default";
}

export async function writeListingLayoutMetafield(session, layoutValue) {
  if (!session) return;
  const value = PAID_LISTING_LAYOUTS.has(String(layoutValue).toLowerCase())
    ? String(layoutValue).toLowerCase()
    : THEME_LISTING_LAYOUT;
  const client = new shopify.api.clients.Graphql({ session });
  const shopData = await client.request(`query { shop { id } }`);
  const shopGid = shopData.data?.shop?.id;
  if (!shopGid) {
    throw new Error("Could not resolve shop id for listing_layout metafield");
  }
  const result = await client.request(
    `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: "blog_app",
            key: "listing_layout",
            type: "single_line_text_field",
            value,
          },
        ],
      },
    }
  );
  const userErrors = result.data?.metafieldsSet?.userErrors;
  if (userErrors?.length) {
    throw new Error(
      userErrors.map((e) => e.message).filter(Boolean).join("; ") || "listing_layout metafieldsSet failed"
    );
  }
}
