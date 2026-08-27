/**
 * Detects when Shopify's article editor has stripped app-owned storefront chrome
 * (scripts, sidebar shell, related-posts placeholder, header/footer, badge) while
 * leaving merchant article content intact. Used by ArticleSyncService so auto-restore
 * can re-push compiled HTML from local builder JSON without treating sanitizer damage
 * as a merchant content edit.
 */
import * as cheerio from "cheerio";

const SIDEBAR_PENDING_ACTIVE =
  /^blogger-article-layout--sidebar-(pending|active|left|right)$/;

/**
 * True when expected live-feature markers are absent from Shopify body_html.
 * Related-posts placeholders/scripts are always expected for app-managed articles.
 * Sidebar markers are required only when the shop/post has the sidebar turned on.
 */
export function storefrontChromeMissing(html, { sidebarEnabled = false } = {}) {
  const s = String(html || "");
  if (!s) return true;
  if (!/related-posts\.js/i.test(s)) return true;
  if (!/blogger-related-posts/.test(s)) return true;
  if (!/blogger-custom-header/.test(s)) return true;
  if (!/blogger-custom-footer/.test(s)) return true;
  if (!/blogger-powered-by-badge/.test(s)) return true;
  if (sidebarEnabled) {
    if (!/sidebar\.js/i.test(s)) return true;
    if (!/blogger-article-layout/.test(s)) return true;
    if (!/blogger-article-sidebar/.test(s)) return true;
  }
  return false;
}

/**
 * Strip app chrome so two HTML snapshots can be compared as merchant content only.
 */
export function stripStorefrontChrome(html) {
  const $ = cheerio.load(String(html || ""), null, false);
  $("script, style, link").remove();
  $(".blogger-article-sidebar, [data-blog-sidebar]").remove();
  $(".blogger-related-posts, [data-related-posts]").remove();
  $(".blogger-custom-header, [data-custom-header]").remove();
  $(".blogger-custom-footer, [data-custom-footer]").remove();
  $(".blogger-powered-by-badge, [data-branding-badge]").remove();
  $(".blogger-article-main").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  $(".blogger-article-layout").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  $("*").each((_, el) => {
    if (!el.attribs) return;
    for (const attr of Object.keys(el.attribs)) {
      if (attr.startsWith("data-")) delete el.attribs[attr];
    }
    if (el.attribs.class) {
      el.attribs.class = el.attribs.class
        .split(/\s+/)
        .filter((c) => !SIDEBAR_PENDING_ACTIVE.test(c))
        .join(" ")
        .trim();
      if (!el.attribs.class) delete el.attribs.class;
    }
  });
  return $.html()
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when local compiled HTML and Shopify body_html differ only by app chrome
 * (scripts, data-*, asides, layout wrappers). Real text/structure edits return false.
 */
export function isChromeOnlySanitization(localHtml, remoteHtml) {
  const a = stripStorefrontChrome(localHtml);
  const b = stripStorefrontChrome(remoteHtml);
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a === b;
}
