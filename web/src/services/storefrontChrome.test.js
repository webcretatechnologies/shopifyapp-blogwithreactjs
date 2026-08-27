import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  storefrontChromeMissing,
  stripStorefrontChrome,
  isChromeOnlySanitization,
} from "./storefrontChrome.js";

const COMPILED = `
<script src="https://app.example/related-posts.js" defer></script>
<script src="https://app.example/sidebar.js" defer></script>
<div class="blogger-custom-header" data-custom-header data-shop="x.myshopify.com"></div>
<div class="blogger-article-layout blogger-article-layout--sidebar-right blogger-article-layout--sidebar-pending">
  <div class="blogger-article-main">
    <div class="blogger-article-container">
      <p data-block-id="1">Hello kitchen</p>
      <div class="blogger-related-posts" data-related-posts data-post-id="9" data-shop="x.myshopify.com"></div>
    </div>
  </div>
  <aside class="blogger-article-sidebar" data-blog-sidebar data-post-id="9" data-shop="x.myshopify.com"><div class="blogger-sidebar-loading"></div></aside>
</div>
<div class="blogger-custom-footer" data-custom-footer data-shop="x.myshopify.com"></div>
<div class="blogger-powered-by-badge" data-branding-badge data-shop="x.myshopify.com"></div>
`;

const SANITIZED = `
<div class="blogger-custom-header"></div>
<div class="blogger-article-layout blogger-article-layout--sidebar-right blogger-article-layout--sidebar-pending">
  <div class="blogger-article-main">
    <div class="blogger-article-container">
      <p>Hello kitchen</p>
    </div>
  </div>
</div>
`;

describe("storefrontChromeMissing", () => {
  it("is false when compiled chrome is present", () => {
    assert.equal(storefrontChromeMissing(COMPILED, { sidebarEnabled: true }), false);
  });

  it("is true when scripts and sidebar aside are gone but pending layout remains", () => {
    assert.equal(storefrontChromeMissing(SANITIZED, { sidebarEnabled: true }), true);
  });

  it("does not require sidebar markers when sidebar is off", () => {
    const html = `
      <script src="/related-posts.js"></script>
      <div class="blogger-custom-header"></div>
      <div class="blogger-related-posts"></div>
      <p>Hi</p>
      <div class="blogger-custom-footer"></div>
      <div class="blogger-powered-by-badge"></div>
    `;
    assert.equal(storefrontChromeMissing(html, { sidebarEnabled: false }), false);
  });
});

describe("isChromeOnlySanitization", () => {
  it("treats Shopify stripping scripts/data-*/aside as chrome-only", () => {
    assert.equal(isChromeOnlySanitization(COMPILED, SANITIZED), true);
  });

  it("treats a real text edit as a content change", () => {
    const edited = SANITIZED.replace("Hello kitchen", "Hello bathroom");
    assert.equal(isChromeOnlySanitization(COMPILED, edited), false);
  });
});

describe("stripStorefrontChrome", () => {
  it("leaves merchant paragraph text", () => {
    assert.match(stripStorefrontChrome(COMPILED), /Hello kitchen/);
    assert.doesNotMatch(stripStorefrontChrome(COMPILED), /sidebar\.js/);
  });
});
