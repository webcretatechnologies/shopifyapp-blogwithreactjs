import shopify, { prisma } from "../shopify.js";
import { EditorContentCompiler } from "../src/services/EditorContentCompiler.js";
import fetch from "node-fetch";

async function main() {
  console.log("Loading offline session...");
  const session = await shopify.config.sessionStorage.loadSession("offline_rajiv-market-shop.myshopify.com");
  if (!session) {
    console.error("Session not found");
    return;
  }
  console.log("Session loaded successfully!");

  // Find a post with an associated shopifyArticle
  const post = await prisma.post.findFirst({
    where: {
      shopifyArticle: { isNot: null }
    },
    include: {
      shopifyArticle: true
    }
  });

  if (!post) {
    console.log("No synced post found in DB. Let's find any post or create a mock post...");
    // Find any post
    const anyPost = await prisma.post.findFirst();
    if (!anyPost) {
      console.log("No post found in DB at all");
      return;
    }
    console.log("Found post:", anyPost.title);
    return;
  }

  console.log("Found post:", post.title);
  console.log("Shopify Article Details:", post.shopifyArticle);

  // Let's force-compile for storefront
  console.log("Compiling content for storefront...");
  const compiledHtml = await EditorContentCompiler.compileForStorefront(
    post.contentHtml || "",
    session,
    null,
    "rajiv-market-shop.myshopify.com"
  );

  console.log("Compiled HTML Sample (first 500 chars):");
  console.log(compiledHtml.substring(0, 500));

  console.log("Pushing to Shopify...");
  const client = new shopify.api.clients.Rest({ session });
  const articlePayload = {
    article: {
      title: post.title,
      body_html: compiledHtml
    }
  };

  const response = await client.put({
    path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
    data: articlePayload,
    type: "application/json"
  });

  console.log("Shopify PUT Response status:", response.status);

  // Now, let's fetch storefront password first to get session cookie
  console.log("Logging into storefront to bypass password page...");
  const passwordUrl = "https://rajiv-market-shop.myshopify.com/password";
  const params = new URLSearchParams();
  params.append("form_type", "storefront_password");
  params.append("utf8", "✓");
  params.append("password", "1");

  const pwdRes = await fetch(passwordUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString(),
    redirect: "manual"
  });

  const cookies = pwdRes.headers.raw()["set-cookie"] || [];
  const cookieHeader = cookies.map(c => c.split(";")[0]).join("; ");
  console.log("Storefront login cookie header obtained.");

  // Fetch the article storefront page
  // Let's get article handle from Shopify API response
  const updatedArticle = response.body?.article;
  if (!updatedArticle) {
    console.error("Updated article not found in response");
    return;
  }

  // Find the blog handle first
  const blogRes = await client.get({
    path: `blogs/${post.shopifyArticle.shopifyBlogId}`
  });
  const blogHandle = blogRes.body?.blog?.handle || "news";
  const articleHandle = updatedArticle.handle;

  const articleStorefrontUrl = `https://rajiv-market-shop.myshopify.com/blogs/${blogHandle}/${articleHandle}`;
  console.log("Fetching storefront page:", articleStorefrontUrl);

  const storefrontRes = await fetch(articleStorefrontUrl, {
    headers: {
      "Cookie": cookieHeader
    }
  });

  const html = await storefrontRes.text();
  console.log("Storefront HTTP Status:", storefrontRes.status);
  console.log("Storefront HTML length:", html.length);
  
  const hasCustomStyles = html.includes("blogger-custom-styles");
  const hasContainer = html.includes("blogger-article-container");
  
  console.log("Verification results:");
  console.log("- Custom style block present:", hasCustomStyles);
  console.log("- Article container div present:", hasContainer);

  if (hasCustomStyles && hasContainer) {
    console.log("🎉 SUCCESS! Storefront asset bypass rendering verified!");
  } else {
    console.error("✗ FAILED: Storefront HTML missing required styling blocks!");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
