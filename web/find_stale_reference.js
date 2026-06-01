import { PrismaClient } from "@prisma/client";
import shopify from "./shopify.js";

const prisma = new PrismaClient();

async function run() {
  const shopDomain = "rajiv-market-shop.myshopify.com";
  try {
    const sessions = await shopify.config.sessionStorage.findSessionsByShop(shopDomain);
    const session = sessions?.find(s => s.accessToken);
    if (!session) {
      console.log(`No active session for shop ${shopDomain}`);
      return;
    }
    
    console.log(`Checking theme assets for ${shopDomain}...`);
    const client = new shopify.api.clients.Rest({ session });
    
    // Get themes
    const themesReq = await client.get({ path: "themes" });
    const mainTheme = themesReq.body.themes.find((t) => t.role === "main");
    if (!mainTheme) {
      console.log("No main theme found.");
      return;
    }
    console.log(`Main theme: ${mainTheme.name} (ID: ${mainTheme.id})`);
    
    // Get assets
    const assetsReq = await client.get({ path: `themes/${mainTheme.id}/assets` });
    const assets = assetsReq.body.assets || [];
    console.log(`Found ${assets.length} assets. Searching contents...`);
    
    for (const asset of assets) {
      // Only check text/liquid files to be fast
      if (asset.key.endsWith(".liquid") || asset.key.endsWith(".json") || asset.key.endsWith(".js") || asset.key.endsWith(".css")) {
        try {
          const detailReq = await client.get({
            path: `themes/${mainTheme.id}/assets`,
            query: { "asset[key]": asset.key }
          });
          const value = detailReq.body.asset.value || "";
          if (value.includes("trycloudflare.com") || value.includes("determination-minor")) {
            console.log(`FOUND MATCH in asset: ${asset.key}`);
            console.log(value.substring(value.indexOf("trycloudflare.com") - 50, value.indexOf("trycloudflare.com") + 100));
          }
        } catch (err) {
          // ignore read errors for binary/large assets
        }
      }
    }
  } catch (e) {
    console.error(`Error:`, e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
