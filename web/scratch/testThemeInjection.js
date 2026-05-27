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
  const themeId = activeTheme.id;
  console.log("Active Theme ID:", themeId);

  // Let's try PUT to themes/${themeId}/assets.json
  try {
    const res = await client.put({
      path: `themes/${themeId}/assets.json`,
      data: {
        asset: {
          key: "assets/blogger-custom-settings.css",
          value: "/* test */"
        }
      }
    });
    console.log("PUT to assets.json success status:", res.status);
  } catch (err) {
    console.error("PUT to assets.json failed:", err.message);
  }

  // Let's try PUT to themes/${themeId}/assets
  try {
    const res = await client.put({
      path: `themes/${themeId}/assets`,
      data: {
        asset: {
          key: "assets/blogger-custom-settings.css",
          value: "/* test */"
        }
      }
    });
    console.log("PUT to assets success status:", res.status);
  } catch (err) {
    console.error("PUT to assets failed:", err.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
