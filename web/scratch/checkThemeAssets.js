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
  
  console.log("Active Theme:", activeTheme);
  
  const assetsResponse = await client.get({
    path: `themes/${activeTheme.id}/assets`
  });
  
  console.log("All Assets count:", assetsResponse.body.assets.length);
  
  const customCssAsset = assetsResponse.body.assets.find(a => a.key === "assets/blogger-custom-settings.css");
  console.log("custom CSS asset info:", customCssAsset);
  
  if (customCssAsset) {
    const valRes = await client.get({
      path: `themes/${activeTheme.id}/assets`,
      query: { "asset[key]": "assets/blogger-custom-settings.css" }
    });
    console.log("Custom CSS value:\n", valRes.body.asset.value);
  }

  // Check templates/article.json or templates/article.liquid
  const articleJson = assetsResponse.body.assets.find(a => a.key === "templates/article.json" || a.key === "templates/article.liquid");
  console.log("Article Template info:", articleJson);

  // Let's also check sections/main-article.liquid if Dawn theme
  const mainArticle = assetsResponse.body.assets.find(a => a.key === "sections/main-article.liquid");
  console.log("Main Article Section info:", mainArticle);
}

main().catch(console.error).finally(() => prisma.$disconnect());
