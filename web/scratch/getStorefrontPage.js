import fetch from "node-fetch";
import fs from "fs";

async function main() {
  const url = "https://rajiv-market-shop.myshopify.com/password";
  const params = new URLSearchParams();
  params.append("form_type", "storefront_password");
  params.append("utf8", "✓");
  params.append("password", "1");

  // Post password to get session cookie
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString(),
    redirect: "manual"
  });

  const cookies = res.headers.raw()["set-cookie"] || [];
  const cookieHeader = cookies.map(c => c.split(";")[0]).join("; ");
  console.log("Cookie Header:", cookieHeader);

  // Fetch the article storefront page using the cookie
  const articleUrl = "https://rajiv-market-shop.myshopify.com/blogs/news/test-template";
  const articleRes = await fetch(articleUrl, {
    headers: {
      "Cookie": cookieHeader
    }
  });

  const html = await articleRes.text();
  console.log("Article Response Status:", articleRes.status);
  console.log("HTML length:", html.length);
  console.log("Does it contain 'Hello':", html.includes("Hello"));
  console.log("Does it contain 'dividerBlock':", html.includes("dividerBlock"));
  console.log("Does it contain 'product':", html.includes("product"));
  
  fs.writeFileSync("/var/www/html/Laravel Shopify App/Blog App/ShopifyBlogReactApp/web/scratch/article_storefront.html", html);
  console.log("Storefront HTML saved to web/scratch/article_storefront.html");
}

main().catch(console.error);
