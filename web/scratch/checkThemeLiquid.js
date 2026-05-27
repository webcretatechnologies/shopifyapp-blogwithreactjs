import shopify, { prisma } from "../shopify.js";

async function main() {
  const session = await shopify.config.sessionStorage.loadSession("offline_rajiv-market-shop.myshopify.com");
  const client = new shopify.api.clients.Rest({ session });
  
  const themesResponse = await client.get({ path: "themes" });
  const themes = themesResponse.body?.themes || [];
  const activeTheme = themes.find((t) => t.role === "main");
  if (!activeTheme) {
    console.log("No active theme");
    return;
  }
  
  const layoutResponse = await client.get({
    path: `themes/${activeTheme.id}/assets`,
    query: { "asset[key]": "layout/theme.liquid" }
  });

  const value = layoutResponse.body.asset.value;
  console.log("Includes blogger-custom-settings.css?", value.includes("blogger-custom-settings.css"));
  
  // Print lines around blogger-custom-settings.css if it exists
  if (value.includes("blogger-custom-settings.css")) {
    const lines = value.split("\n");
    const idx = lines.findIndex(l => l.includes("blogger-custom-settings.css"));
    console.log("Around stylesheet tag:\n", lines.slice(Math.max(0, idx - 5), idx + 6).join("\n"));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
