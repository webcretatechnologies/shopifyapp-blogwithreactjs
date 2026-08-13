import { formatPrice } from "../utils/priceUtils.js";

/**
 * BlockRenderer Service
 * Converts JSON block data into HTML strings for the storefront.
 * Full port of Laravel's App\\Services\\BlockRenderer
 */
class BlockRenderer {
  constructor(shopDomain = "", options = {}) {
    this.shopDomain = shopDomain;
    this.options = {
      productSliderPosition: options.product_slider_position || "none",
      productSliderSeedProductId: options.product_slider_seed_product_id || null,
      productSliderSource: options.product_slider_source || "recommendations",
      productSliderConfig: options.product_slider_config || {},
      productSliderProducts: options.product_slider_products || [],
      customCss: options.custom_css || "",
      customJs: options.custom_js || "",
      storeCurrency: options.storeCurrency || "USD",
      ...options,
    };
    this.ajaxInjected = false;
    this.sliderScriptInjected = false;
  }

  static render(blocks, shopDomain = "", options = {}) {
    const renderer = new BlockRenderer(shopDomain, options);
    return renderer.renderBlocks(blocks);
  }

  /** Resolve currency for a product setting object. */
  resolveCurrency(s) {
    return s?.currency || this.options.storeCurrency || "USD";
  }

  renderBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return "";
    const parts = blocks.map((block) => this.renderBlock(block));
    let html = parts.join("\n");

    // Inject Ajax add-to-cart script if needed
    if (this.ajaxInjected) {
      html += "\n" + BlockRenderer.ajaxAddToCartScript();
    }

    // Wrap with product slider if position is top/bottom/both
    html = this.appendProductSliderWrappers(html, blocks);

    // Inject related product slider script if needed
    if (this.sliderScriptInjected) {
      html += "\n" + BlockRenderer.relatedProductSliderScriptBlock();
    }

    // Inject custom CSS/JS
    if (this.options.customCss) {
      html += `\n<style>\n${this.options.customCss}\n</style>`;
    }
    if (this.options.customJs) {
      html += `\n<script>\n${this.options.customJs}\n</script>`;
    }

    return html;
  }

  renderBlock(block) {
    if (!block || !block.type) return "";
    const s = block.settings || block;
    switch (block.type) {
      case "heading":
        return this.renderHeading(s);
      case "text":
        return this.renderText(s);
      case "image":
        return this.renderImage(s);
      case "image_text":
        return this.renderImageText(s);
      case "video":
        return this.renderVideo(s);
      case "divider":
        return this.renderDivider(s);
      case "button":
      case "cta_button":
        return this.renderButton(s);
      case "list":
        return this.renderList(s);
      case "faq":
        return this.renderFaq(s);
      case "table":
        return this.renderTable(s);
      case "product":
        return this.renderProduct(s);
      case "product_text":
        return this.renderProductText(s);
      case "product_sidebar":
        return this.renderProductSidebar(s);
      case "product_switcher":
        return this.renderProductSwitcher(s);
      case "product_slider":
        return this.renderProductSlider(s);
      case "featured_product":
        return this.renderFeaturedProduct(s);
      case "blog":
        return this.renderBlog(s);
      case "countdown":
        return this.renderCountdown(s);
      case "reviews":
        return this.renderReviews(s);
      case "hero":
        return this.renderHero(s);
      case "announcement":
        return this.renderAnnouncement(s);
      case "spacer":
        return this.renderSpacer(s);
      case "html":
        return this.renderCustomHtml(s);
      default:
        if (s.data && typeof s.data === "string" && s.data.trim()) {
          return `<p>${this.esc(s.data)}</p>\n`;
        }
        return "";
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Check if a variant is salable (available for purchase).
   */
  static variantSalable(block) {
    const vid = String(block.variant_id || block.variantId || "").trim();
    if (!vid) return true;
    const va = block.variant_available ?? block.variantAvailable ?? null;
    if (va === false || va === 0 || va === "0" || va === "false") {
      return false;
    }
    return true;
  }

  /**
   * Normalize YouTube/Vimeo URLs to embed-safe URLs.
   */
  static normalizeVideoEmbedUrl(url) {
    if (!url || typeof url !== "string") return null;
    url = url.trim();
    if (!url) return null;

    // Pasted full <iframe> snippet: extract src
    const iframeMatch = url.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
    if (iframeMatch) {
      url = iframeMatch[1].trim();
    }

    if (/javascript:/i.test(url)) return null;

    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url.replace(/^\/+/, "");
    }

    // Vimeo player URL
    const vimeoPlayer = url.match(/^https?:\/\/player\.vimeo\.com\/video\/(\d+)/i);
    if (vimeoPlayer) return `https://player.vimeo.com/video/${vimeoPlayer[1]}`;

    // Vimeo page URL
    const vimeoPage = url.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)\b/i);
    if (vimeoPage) return `https://player.vimeo.com/video/${vimeoPage[1]}`;

    // YouTube embed URL
    const ytEmbed = url.match(/^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})\b/i);
    if (ytEmbed) {
      const querySuffix = BlockRenderer.getYoutubeQuerySuffix(url);
      return `https://www.youtube.com/embed/${ytEmbed[1]}${querySuffix}`;
    }

    // YouTube watch, shorts, live, youtu.be
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})\b/i);
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }

    return null;
  }

  static getYoutubeQuerySuffix(url) {
    try {
      const parsed = new URL(url);
      if (parsed.search) return parsed.search;
    } catch (e) { /* ignore */ }
    return "";
  }



  /**
   * Find the first product block's product_id for use as slider seed.
   */
  static firstProductBlockSeedId(blocks) {
    const productTypes = ["product", "product_text", "product_sidebar", "featured_product"];
    for (const block of blocks) {
      if (!block || !block.type) continue;
      const s = block.settings || block;
      if (block.type === "product_switcher") {
        const sections = Array.isArray(s.sections) ? s.sections : [];
        for (const sec of sections) {
          const p = sec.product || {};
          const id = String(p.product_id || p.shopifyProductId || "").trim();
          if (id) return id;
        }
      }
      if (productTypes.includes(block.type)) {
        const id = String(s.product_id || s.shopifyProductId || "").trim();
        if (id) return id;
      }
    }
    return null;
  }

  // ─── Block Renderers ──────────────────────────────────────────────────────

  renderHeading(s) {
    const levelStr = String(s.level || "2");
    const level = parseInt(levelStr.replace(/\D/g, ""), 10) || 2;
    const text = this.esc(s.text || s.content || "");
    const align = s.align || "left";
    return `<h${level} class="blog-heading blog-heading--h${level}" style="text-align:${align}">${text}</h${level}>`;
  }

  renderText(s) {
    let content = s.content || s.text || s.data || "";
    if (!content.trim()) return "";

    const style = s.style || "normal";
    const isHtml = s.isHtml === true || s.isHtml === "true" || s.isHtml === 1;

    let html;
    if (isHtml) {
      html = content;
    } else {
      html = this.esc(content);
    }

    if (style === "bold") html = `<strong>${html}</strong>`;
    if (style === "italic") html = `<em>${html}</em>`;

    return `<p>${html}</p>\n`;
  }

  renderList(s) {
    const items = Array.isArray(s.items) ? s.items : [];
    if (!items.length) return "";
    const ordered = s.ordered === true || s.ordered === "true" || s.listType === "ol";
    const tag = ordered ? "ol" : "ul";
    const listStyle = ordered
      ? "list-style-type:decimal;padding-left:28px;margin:12px 0;line-height:1.7;"
      : "list-style-type:disc;padding-left:28px;margin:12px 0;line-height:1.7;";
    const rows = items
      .map((i) => {
        const text = typeof i === "string" ? i : i.text || i.content || "";
        return `<li style="margin:4px 0;">${text}</li>`;
      })
      .join("\n");
    return `<${tag} style="${listStyle}">\n${rows}\n</${tag}>\n`;
  }

  renderTable(s) {
    const headers = Array.isArray(s.headers) ? s.headers : [];
    const rows = Array.isArray(s.rows) ? s.rows : [];
    if (!headers.length && !rows.length) return "";

    const thHtml = headers.length
      ? `<thead><tr>${headers.map((h) => `<th style="border:1px solid #e1e3e5;padding:10px 14px;background:#f6f6f7;text-align:left;font-weight:700;color:#202223;">${this.esc(h)}</th>`).join("")}</tr></thead>`
      : "";
    const tbHtml = rows.length
      ? `<tbody>${rows
          .map((row) => {
            const cells = Array.isArray(row) ? row : [];
            return `<tr>${cells.map((c) => `<td style="border:1px solid #e1e3e5;padding:10px 14px;color:#202223;">${this.esc(String(c))}</td>`).join("")}</tr>`;
          })
          .join("")}</tbody>`
      : "";

    return `<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;">${thHtml}${tbHtml}</table>\n`;
  }

  renderImage(s) {
    const src = this.esc(s.src || s.url || "");
    if (!src) return "";
    const alt = this.esc(s.alt || s.caption || "");
    const width = Math.max(120, Math.min(1400, parseInt(s.width || "900", 10) || 900));
    const height = Math.max(80, Math.min(1000, parseInt(s.height || "420", 10) || 420));
    return `<p><img src="${src}" alt="${alt}" style="width:${width}px;height:${height}px;max-width:100%;object-fit:cover;border-radius:8px;" loading="lazy" /></p>\n`;
  }

  renderImageText(s) {
    const src = this.esc(s.src || s.image || s.url || "");
    const alt = this.esc(s.alt || "");
    const text = s.text || s.content || s.data || "";
    const heading = s.heading ? `<h3>${this.esc(s.heading)}</h3>` : "";
    const width = Math.max(120, Math.min(900, parseInt(s.width || "420", 10) || 420));
    const height = Math.max(80, Math.min(800, parseInt(s.height || "320", 10) || 320));

    const imgTag = src
      ? `<img src="${src}" alt="${alt}" style="width:${width}px;height:${height}px;max-width:100%;object-fit:cover;border-radius:8px;display:block;" loading="lazy" />`
      : "";

    const blockData = this.escAttr(JSON.stringify(s));
    return `<div data-blog-app-block="image_text" data-blog-app-data="${blockData}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;align-items:center;margin:20px 0;">${imgTag ? `<div>${imgTag}</div>` : ""}<div>${heading}${text}</div></div>\n`;
  }

  renderVideo(s) {
    const url = s.url || s.src || "";
    const embedUrl = BlockRenderer.normalizeVideoEmbedUrl(url);
    if (!embedUrl) return "";

    const src = this.esc(embedUrl);
    const blockData = this.escAttr(JSON.stringify(s));
    return `<div data-blog-app-block="video" data-blog-app-data="${blockData}" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;">\n`
      + `<iframe src="${src}" title="Video" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin"></iframe>\n`
      + `</div>\n`;
  }

  renderDivider(s) {
    const style = s.style || "solid";
    return `<hr style="border:none;border-top:2px solid #e1e3e5;margin:24px 0;" class="blog-divider blog-divider--${style}" />\n`;
  }

  renderButton(s) {
    const text = this.esc(s.text || s.label || "Click Here");
    const url = this.esc(s.url || s.href || "#");
    const style = s.style || "primary";
    const align = s.align || "left";
    const bgColor = s.color || (style === "primary" ? "#1a1a1a" : "#fff");
    const textColor = s.textColor || (style === "primary" ? "#fff" : "#1a1a1a");

    const blockData = this.escAttr(JSON.stringify(s));
    return `<div data-blog-app-block="button" data-blog-app-data="${blockData}" style="text-align:${align}">\n`
      + `<p><a href="${url}" style="display:inline-block;background:${bgColor};color:${textColor};padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">${text}</a></p>\n`
      + `</div>\n`;
  }

  renderFaq(s) {
    const items = Array.isArray(s.items) ? s.items : (s.question ? [s] : []);
    if (!items.length) return "";

    const html = items
      .map((item, i) => {
        const question = this.esc(item.question || "");
        const answer = item.answer || item.content || "";
        return `<details style="width:100%;">\n`
          + `<summary style="padding:16px 20px;cursor:pointer;font-weight:700;color:#1a1a1a;display:flex;justify-content:space-between;align-items:center;list-style:none;outline:none;-webkit-tap-highlight-color:transparent;">\n`
          + `<span style="padding-right:15px;line-height:1.4;">${question}</span>\n`
          + `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink:0;color:#6d7175;transition:transform 0.2s;"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="1.67" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`
          + `</summary>\n`
          + `<style>details[open] summary svg { transform: rotate(180deg); } summary::-webkit-details-marker { display:none; }</style>\n`
          + `<div style="padding:0 20px 20px;font-size:15px;line-height:1.6;color:#4a5568;">\n`
          + `<div style="border-top:1px solid #f1f2f4;padding-top:16px;">${answer}</div>\n`
          + `</div>\n`
          + `</details>`;
      })
      .join("\n");

    return `<div data-blog-app-block="faq" style="margin:16px 0;border:1px solid #e1e3e5;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">\n${html}\n</div>\n`;
  }

  /**
   * Render a product card. Supports floating (text wrapping) and alignment.
   */
  renderProduct(s) {
    const handle = this.esc(s.handle || s.shopifyProductId || "");
    const title = this.esc(s.title || s.product_title || "Product");
    const image = this.esc(s.image || s.src || "");
    const currency = this.resolveCurrency(s);
    const price = s.price != null ? formatPrice(s.price, currency) : "";
    const compareAt = s.compare_at_price ?? s.compareAtPrice ?? null;
    const variantId = String(s.variant_id || s.variantId || "").trim();
    const salable = BlockRenderer.variantSalable(s);

    if (!handle) return "";

    const baseUrl = this.shopDomain ? `https://${this.shopDomain}` : "";
    const productUrl = `${baseUrl}/products/${handle}` + (variantId ? `?variant=${variantId}` : "");

    const cartIcon = `<svg aria-hidden="true" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.2 6H19M7 13h12M10 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"/></svg>`;

    let addToCartBtn;
    if (variantId) {
      if (salable) {
        addToCartBtn = `<button type="button" data-ajax-add-to-cart data-product-title="${this.escAttr(title)}" data-variant-id="${this.escAttr(variantId)}" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;border:none;cursor:pointer;width:100%;">${cartIcon}<span>Add to Cart</span></button>`;
        this.ajaxInjected = true;
      } else {
        addToCartBtn = `<button type="button" disabled aria-disabled="true" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#9ca3af;color:#fff;padding:10px 18px;border-radius:12px;font-weight:700;font-size:14px;border:none;cursor:not-allowed;width:100%;opacity:0.95;">${cartIcon}<span>Out of stock</span></button>`;
      }
    } else {
      addToCartBtn = `<a href="${productUrl}" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">${cartIcon}<span>View product</span></a>`;
    }

    const imgTag = image
      ? `<img src="${image}" alt="${title}" style="width:100%;height:220px;object-fit:cover;border-radius:10px 10px 0 0;display:block;" loading="lazy" />`
      : `<div style="width:100%;height:220px;background:#f1f2f4;border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:center;"><span style="color:#999;">No Image</span></div>`;

    let priceHtml = `<div style="display:flex;gap:8px;align-items:baseline;margin:0 0 14px;">\n`;
    if (price) priceHtml += `<span style="font-size:14px;color:#008060;font-weight:700;">${price}</span>`;
    if (compareAt != null && compareAt !== "") {
      priceHtml += `<span style="font-size:12px;color:#9ca3af;text-decoration:line-through;">${formatPrice(compareAt, currency)}</span>`;
    }
    priceHtml += `</div>`;

    const cardInner = `<div style="border:1px solid #e1e3e5;border-radius:12px;overflow:hidden;max-width:320px;width:100%;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.06);">\n`
      + imgTag
      + `<div style="padding:16px;">\n`
      + `<a href="${productUrl}" style="text-decoration:none;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#202223;">${title}</p></a>\n`
      + priceHtml
      + addToCartBtn
      + `</div></div>`;

    const align = (s.align || "center").toLowerCase();
    const isFloat = s.float === true || s.float === "true";

    if (isFloat && align !== "center") {
      const floatSide = align === "left" ? "left" : "right";
      const margin = align === "left" ? "0 24px 16px 0" : "0 0 16px 24px";
      const blockData = this.escAttr(JSON.stringify(s));
      return `<div data-blog-app-block="product" data-blog-app-data="${blockData}" style="float:${floatSide};margin:${margin};width:100%;max-width:300px;clear:${floatSide};">\n${cardInner}\n</div>`;
    }

    const justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
    const blockData = this.escAttr(JSON.stringify(s));
    return `<div data-blog-app-block="product" data-blog-app-data="${blockData}" style="display:flex;justify-content:${justifyContent};width:100%;margin:20px 0;clear:both;">\n${cardInner}\n</div>\n`;
  }

  renderProductText(s) {
    const handle = this.esc(s.handle || s.shopifyProductId || "");
    const title = this.esc(s.title || s.product_title || "Product");
    const text = s.text || s.description || s.content || "";
    const image = this.esc(s.image || s.src || "");
    const variantId = String(s.variant_id || s.variantId || "").trim();
    const salable = BlockRenderer.variantSalable(s);
    const currency = this.resolveCurrency(s);
    const price = s.price != null ? formatPrice(s.price, currency) : "";
    const compareAt = s.compare_at_price ?? s.compareAtPrice ?? null;

    if (!handle) return "";

    const baseUrl = this.shopDomain ? `https://${this.shopDomain}` : "";
    const productUrl = `${baseUrl}/products/${handle}` + (variantId ? `?variant=${variantId}` : "");

    const cartIcon = `<svg aria-hidden="true" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.2 6H19M7 13h12M10 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"/></svg>`;

    let addToCartBtn;
    if (variantId) {
      if (salable) {
        addToCartBtn = `<button type="button" data-ajax-add-to-cart data-product-title="${this.escAttr(title)}" data-variant-id="${this.escAttr(variantId)}" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;border:none;cursor:pointer;width:100%;">${cartIcon}<span>Add to Cart</span></button>`;
        this.ajaxInjected = true;
      } else {
        addToCartBtn = `<button type="button" disabled aria-disabled="true" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#9ca3af;color:#fff;padding:10px 18px;border-radius:12px;font-weight:700;font-size:14px;border:none;cursor:not-allowed;width:100%;opacity:0.95;">${cartIcon}<span>Out of stock</span></button>`;
      }
    } else {
      addToCartBtn = `<a href="${productUrl}" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">${cartIcon}<span>View product</span></a>`;
    }

    let priceHtml = `<div style="display:flex;gap:8px;align-items:baseline;margin:0 0 12px;">\n`;
    if (price) priceHtml += `<span style="font-size:14px;color:#008060;font-weight:700;">${price}</span>`;
    if (compareAt != null && compareAt !== "") {
      priceHtml += `<span style="font-size:12px;color:#9ca3af;text-decoration:line-through;">${formatPrice(compareAt, currency)}</span>`;
    }
    priceHtml += `</div>`;

    const width = Math.max(120, Math.min(900, parseInt(s.width || "420", 10) || 420));
    const height = Math.max(80, Math.min(800, parseInt(s.height || "320", 10) || 320));

    const imgTag = image
      ? `<img src="${image}" alt="${title}" style="width:${width}px;height:${height}px;max-width:100%;object-fit:cover;display:block;" loading="lazy" />`
      : `<div style="width:${width}px;height:${height}px;max-width:100%;background:#f1f2f4;display:flex;align-items:center;justify-content:center;"><span style="color:#999;">No Image</span></div>`;

    const blockData = this.escAttr(JSON.stringify(s));
    return `<div data-blog-app-block="product_text" data-blog-app-data="${blockData}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;align-items:center;border:1px solid #e1e3e5;border-radius:12px;overflow:hidden;margin:20px 0;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.06);">\n`
      + `<div>${imgTag}</div>\n`
      + `<div style="padding:20px;">\n`
      + `<a href="${productUrl}" style="text-decoration:none;"><p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#202223;">${title}</p></a>\n`
      + priceHtml
      + (text ? `<div style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#4a5568;">${text}</div>\n` : "")
      + addToCartBtn
      + `</div></div>\n`;
  }

  /**
   * Sticky sidebar product card with vertical/horizontal layout, left/right/below positioning.
   */
  renderProductSidebar(s) {
    const handle = this.esc(s.handle || s.shopifyProductId || "");
    const title = this.esc(s.title || s.product_title || "Product");
    const image = this.esc(s.image || s.src || "");
    const text = s.text || s.description || s.content || s.data || "";
    const currency = this.resolveCurrency(s);
    const price = s.price != null ? formatPrice(s.price, currency) : "";
    const compareAt = s.compare_at_price ?? s.compareAtPrice ?? null;
    const variantId = String(s.variant_id || s.variantId || "").trim();
    const salable = BlockRenderer.variantSalable(s);
    const sectionTitle = this.esc(s.title || "");

    if (!handle) return "";

    const baseUrl = this.shopDomain ? `https://${this.shopDomain}` : "";
    const productUrl = `${baseUrl}/products/${handle}` + (variantId ? `?variant=${variantId}` : "");

    const cartIcon = `<svg aria-hidden="true" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.2 6H19M7 13h12M10 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"/></svg>`;

    let sidebarAddToCart;
    if (variantId) {
      if (salable) {
        sidebarAddToCart = `<button type="button" data-ajax-add-to-cart data-product-title="${this.escAttr(title)}" data-variant-id="${this.escAttr(variantId)}" style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:#121212;color:#fff;padding:12px 14px;border-radius:8px;font-weight:600;font-size:14px;line-height:1.2;border:none;cursor:pointer;font-family:system-ui,-apple-system,sans-serif;">${cartIcon}<span>Add to cart</span></button>`;
        this.ajaxInjected = true;
      } else {
        sidebarAddToCart = `<button type="button" disabled aria-disabled="true" style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:#9ca3af;color:#fff;padding:12px 14px;border-radius:8px;font-weight:600;font-size:14px;line-height:1.2;border:none;cursor:not-allowed;font-family:system-ui,-apple-system,sans-serif;opacity:0.95;">${cartIcon}<span>Out of stock</span></button>`;
      }
    } else {
      sidebarAddToCart = `<a href="${productUrl}" style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:#121212;color:#fff;padding:12px 14px;border-radius:8px;font-weight:600;font-size:14px;line-height:1.2;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;">${cartIcon}<span>View product</span></a>`;
    }

    let priceHtmlCompact = `<div style="display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline;margin:0 0 12px;font-family:system-ui,-apple-system,sans-serif;">\n`;
    if (price) priceHtmlCompact += `<span style="font-size:15px;color:#008060;font-weight:700;">${price}</span>`;
    if (compareAt != null && compareAt !== "") {
      priceHtmlCompact += `<span style="font-size:13px;color:#8c9196;text-decoration:line-through;">${formatPrice(compareAt, currency)}</span>`;
    }
    priceHtmlCompact += `</div>`;

    // Build sidebar card
    const side = (s.side || "right").toLowerCase();
    const cardStyle = (s.card_style || "vertical").toLowerCase();
    const cardMaxPx = cardStyle === "horizontal" ? "400" : "300";

    const sidebarCardImgVertical = image
      ? `<img src="${image}" alt="${title}" style="width:100%;height:240px;object-fit:cover;display:block;" loading="lazy" />`
      : `<div style="width:100%;height:240px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:13px;color:#8c9196;font-family:system-ui,-apple-system,sans-serif;">No image</div>`;

    const sidebarCardInnerVertical = `<div style="border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.06);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">\n`
      + sidebarCardImgVertical
      + `<div style="padding:14px 16px 16px;">\n`
      + `<a href="${productUrl}" style="text-decoration:none;color:inherit;display:block;"><p style="margin:0 0 12px;font-size:14px;line-height:1.45;font-weight:600;color:#121212;">${title}</p></a>\n`
      + priceHtmlCompact
      + sidebarAddToCart
      + `</div></div>`;

    const sidebarCardImgHorizontal = image
      ? `<img src="${image}" alt="${title}" style="width:100%;height:100%;min-height:170px;object-fit:cover;display:block;" loading="lazy" />`
      : `<div style="width:100%;min-height:170px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:12px;color:#8c9196;font-family:system-ui,-apple-system,sans-serif;">No image</div>`;

    const sidebarCardInnerHorizontal = `<div style="border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.06);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">\n`
      + `<div style="display:flex;flex-direction:row;align-items:stretch;">\n`
      + `<div style="flex:0 0 44%;max-width:200px;min-width:110px;align-self:stretch;">${sidebarCardImgHorizontal}</div>\n`
      + `<div style="flex:1;min-width:0;padding:12px 14px 14px;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;">\n`
      + `<a href="${productUrl}" style="text-decoration:none;color:inherit;display:block;"><p style="margin:0 0 8px;font-size:13px;line-height:1.35;font-weight:600;color:#121212;">${title}</p></a>\n`
      + priceHtmlCompact
      + sidebarAddToCart
      + `</div></div></div>`;

    const sidebarCardInner = cardStyle === "horizontal" ? sidebarCardInnerHorizontal : sidebarCardInnerVertical;

    const contentTitle = sectionTitle ? `<h2 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#202223;line-height:1.3;">${sectionTitle}</h2>` : "";
    const contentBody = text ? `<div style="font-size:16px;line-height:1.6;color:#374151;">${text}</div>` : "";

    const blockData = this.escAttr(JSON.stringify(s));

    if (side === "below") {
      return `<div data-blog-app-block="product_sidebar" data-blog-app-data="${blockData}" style="display:flex;flex-direction:column;gap:28px;align-items:stretch;margin:24px 0;">\n`
        + `<div style="width:100%;box-sizing:border-box;">${contentTitle}${contentBody}</div>\n`
        + `<div style="width:100%;max-width:${cardMaxPx}px;margin:0 auto;box-sizing:border-box;">${sidebarCardInner}</div>\n`
        + `</div>\n`;
    }

    const contentHtml = `<div style="flex:1 1 280px;min-width:min(100%,240px);">${contentTitle}${contentBody}</div>`;
    const cardHtml = `<div style="position:sticky;top:24px;align-self:start;width:100%;max-width:${cardMaxPx}px;min-width:min(100%,240px);justify-self:${side === "left" ? "start" : "end"};">${sidebarCardInner}</div>`;

    return `<div data-blog-app-block="product_sidebar" data-blog-app-data="${blockData}" style="display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start;margin:24px 0;">\n`
      + (side === "left" ? `${cardHtml}\n${contentHtml}` : `${contentHtml}\n${cardHtml}`)
      + `</div>\n`;
  }

  /**
   * Scroll-based product switcher with IntersectionObserver sticky card.
   */
  renderProductSwitcher(s) {
    const sections = Array.isArray(s.sections) ? s.sections : [];
    if (!sections.length) return "";

    const baseUrl = this.shopDomain ? `https://${this.shopDomain}` : "";
    const switchId = "ps_" + Math.random().toString(36).substring(2, 12);
    const blockData = this.escAttr(JSON.stringify(s));
    const baseUrlAttr = this.escAttr(baseUrl);
    const storeCurrency = this.options.storeCurrency || "USD";

    let html = `<div data-blog-app-block="product_switcher" data-blog-app-data="${blockData}" data-blog-base-url="${baseUrlAttr}" data-store-currency="${storeCurrency}" id="${switchId}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px;align-items:start;margin:22px 0;">\n`;
    html += `<div style="min-width:0;">\n`;

    const productData = [];

    sections.forEach((sec, idx) => {
      const secTitle = this.esc(sec.title || `Point ${idx + 1}`);
      const secBody = sec.body || sec.content || "";
      const p = sec.product || null;

      let pointProductHtml = "";
      if (p) {
        const pCurrency = p.currency || this.options.storeCurrency || 'USD';
        const pTitle = this.esc(p.product_title || p.title || "Product");
        const pPrice = p.price != null ? formatPrice(p.price, pCurrency) : "";
        const pCompare = p.compare_at_price ?? p.compareAtPrice ?? null;
        const pImage = this.esc(p.image || p.src || "");
        const pHandle = this.esc(p.handle || p.shopifyProductId || "");
        const pVariantId = String(p.variant_id || p.variantId || "").trim();
        const pSalable = BlockRenderer.variantSalable({
          variant_id: pVariantId,
          variant_available: p.variant_available ?? p.variantAvailable ?? null,
        });

        productData.push({
          product_title: p.product_title || p.title || "",
          price: p.price != null ? String(p.price) : "",
          compare_at_price: p.compare_at_price ?? p.compareAtPrice ?? "",
          image: p.image || "",
          handle: p.handle || "",
          variant_id: pVariantId,
          variant_available: pSalable,
        });

        const pUrl = `${baseUrl}/products/${pHandle}` + (pVariantId ? `?variant=${pVariantId}` : "");

        const cartIcon = `<svg aria-hidden="true" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.2 6H19M7 13h12M10 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"/></svg>`;

        let pBtn;
        if (pVariantId) {
          if (pSalable) {
            pBtn = `<button type="button" data-ajax-add-to-cart data-product-title="${this.escAttr(pTitle)}" data-variant-id="${this.escAttr(pVariantId)}" style="display:block;width:100%;text-align:center;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;border:none;cursor:pointer;">${cartIcon}<span>Add to Cart</span></button>`;
            this.ajaxInjected = true;
          } else {
            pBtn = `<button type="button" disabled aria-disabled="true" style="display:block;width:100%;text-align:center;background:#9ca3af;color:#fff;padding:10px 18px;border-radius:12px;font-weight:700;font-size:14px;border:none;cursor:not-allowed;opacity:0.95;">${cartIcon}<span>Out of stock</span></button>`;
          }
        } else {
          pBtn = `<a href="${pUrl}" style="display:block;text-align:center;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">${cartIcon}<span>View product</span></a>`;
        }

        let pPriceHtml = `<div style="display:flex;gap:8px;align-items:baseline;margin:0 0 12px;">\n`;
        if (pPrice) pPriceHtml += `<span style="font-size:14px;color:#008060;font-weight:700;">${pPrice}</span>`;
        if (pCompare != null && pCompare !== "") {
          pPriceHtml += `<span style="font-size:12px;color:#9ca3af;text-decoration:line-through;">${formatPrice(pCompare, pCurrency)}</span>`;
        }
        pPriceHtml += `</div>`;

        const pImgHtml = pImage
          ? `<img src="${pImage}" alt="${pTitle}" style="width:100%;height:180px;object-fit:cover;display:block;" loading="lazy" />`
          : `<div style="width:100%;height:180px;background:#f1f2f4;display:flex;align-items:center;justify-content:center;"><span style="color:#999;">No Image</span></div>`;

        pointProductHtml = `<div class="blog-switcher-mobile-product" style="display:none;margin:16px 0;border:1px solid #e1e3e5;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.05);">\n`
          + pImgHtml
          + `<div style="padding:16px;">\n`
          + `<a href="${pUrl}" style="text-decoration:none;font-family:sans-serif;"><p style="margin:0 0 6px;font-size:15px;font-weight:800;color:#202223;">${pTitle}</p></a>\n`
          + pPriceHtml
          + pBtn
          + `</div></div>\n`;
      } else {
        productData.push(null);
      }

      html += `<div style="margin:0 0 24px;" data-switch-point="${idx}">\n`;
      html += `<h3 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#202223;">${secTitle}</h3>\n`;
      html += `<div style="font-size:16px;line-height:1.7;color:#4a5568;">${secBody}</div>\n`;
      html += pointProductHtml;
      html += `</div>\n`;
    });

    html += `</div>\n`;

    // Sticky card shell (updated via JS)
    html += `<div class="blog-switcher-desktop-sticky" style="position:sticky;top:24px;align-self:start;max-width:360px;justify-self:end;">\n`
      + `<div style="border:1px solid #e1e3e5;border-radius:12px;overflow:hidden;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.06);background:#fff;">\n`
      + `<div data-switch-card></div>\n`
      + `</div></div>\n`;

    // Mobile: show inline product cards, hide sticky
    html += `<style>\n`
      + `@media (max-width:767px) {\n`
      + `  .blog-switcher-desktop-sticky { display: none !important; }\n`
      + `  .blog-switcher-mobile-product { display: block !important; }\n`
      + `}\n`
      + `</style>\n`;

    html += `</div>\n`;

    // IntersectionObserver JS for switching the sticky card
    const json = JSON.stringify(productData);
    const safeJson = json.replace(/<\//g, '\\u003C/');

    html += `<script>(function(){\n`
      + `var root=document.getElementById('${switchId}'); if(!root) return;\n`
      + `var baseUrl=root.getAttribute('data-blog-base-url')||'';\n`
      + `var products=${safeJson};\n`
      + `var card=root.querySelector('[data-switch-card]'); if(!card) return;\n`
      + `var points=[].slice.call(root.querySelectorAll('[data-switch-point]'));\n`
      + `var activeIdx=0;\n`
      + `var storeCurrency=root.getAttribute('data-store-currency')||'USD';\n`
      + `function fmtPrice(amount){if(amount==null||amount==='')return'';var n=parseFloat(amount);if(isNaN(n))return'';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:storeCurrency,minimumFractionDigits:2,maximumFractionDigits:2}).format(n);}catch(e){return storeCurrency+' '+n.toFixed(2);}}\n`
      + `function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}\n`
      + `function cardHtml(p){\n`
      + ` if(!p){return '<div style="padding:16px;color:#6b7280;font-size:13px;font-weight:600;">Select products for each point.</div>';}\n`
      + ` var img=p.image?('<img src="'+esc(p.image)+'" style="width:100%;height:220px;object-fit:cover;display:block;" loading="lazy"/>'):'<div style="width:100%;height:220px;background:#f1f2f4;display:flex;align-items:center;justify-content:center;"><span style="color:#999;">No Image</span></div>';\n`
      + ` var url=baseUrl+'/products/'+esc(p.handle||'')+(p.variant_id?('?variant='+esc(p.variant_id)):'');\n`
      + ` var priceHtml=p.price?('<div style="display:flex;gap:8px;align-items:baseline;margin:0 0 14px;"><span style="font-size:14px;color:#008060;font-weight:700;">'+fmtPrice(p.price)+'</span>'+(p.compare_at_price?'<span style="font-size:12px;color:#9ca3af;text-decoration:line-through;">'+fmtPrice(p.compare_at_price)+'</span>':'')+'</div>'):'';\n`
      + ` var canAdd=p.variant_id&&(p.variant_available!==false&&p.variant_available!==0&&p.variant_available!=='0'&&p.variant_available!=='false');\n`
      + ` var pt=esc(p.product_title||'Product');\n`
      + ` var btn=p.variant_id?(canAdd?'<button type="button" data-ajax-add-to-cart data-product-title="'+pt+'" data-variant-id="'+esc(p.variant_id)+'" style="display:block;width:100%;text-align:center;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;border:none;cursor:pointer;">Add to Cart</button>':'<button type="button" disabled aria-disabled="true" style="display:block;width:100%;text-align:center;background:#9ca3af;color:#fff;padding:10px 18px;border-radius:12px;font-weight:700;font-size:14px;border:none;cursor:not-allowed;opacity:0.95;">Out of stock</button>'):'<a href="'+url+'" style="display:block;text-align:center;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">View product</a>';\n`
      + ` return img+'<div style="padding:16px;">'+'<a href="'+url+'" style="text-decoration:none;"><p style="margin:0 0 6px;font-size:15px;font-weight:800;color:#202223;">'+esc(p.product_title||'Product')+'</p></a>'+priceHtml+btn+'</div>';\n`
      + `}\n`
      + `function setActive(i){if(i===activeIdx&&card.innerHTML!=='')return;activeIdx=i;card.innerHTML=cardHtml(products[i]);}\n`
      + `setActive(0);\n`
      + `if(!('IntersectionObserver' in window))return;\n`
      + `var io=new IntersectionObserver(function(entries){\n`
      + `  entries.forEach(function(e){\n`
      + `    if(e.isIntersecting){\n`
      + `      var i=parseInt(e.target.getAttribute('data-switch-point')||'0',10);\n`
      + `      if(!isNaN(i))setActive(i);\n`
      + `    }\n`
      + `  });\n`
      + `},{rootMargin:'-20% 0px -70% 0px',threshold:0});\n`
      + `points.forEach(function(el){io.observe(el);});\n`
      + `})();</script>\n`;

    this.ajaxInjected = true; // product switcher may need ajax
    return html;
  }

  /**
   * Featured product block - "Featured Here" style card with badge, stars, CTA.
   */
  renderFeaturedProduct(s) {
    const handle = this.esc(s.handle || s.shopifyProductId || "");
    const title = this.esc(s.title || s.product_title || "Product");
    const image = this.esc(s.image || s.src || "");
    const text = s.text || s.description || s.content || s.data || "";
    const currency = this.resolveCurrency(s);
    const price = s.price != null ? formatPrice(s.price, currency) : "";
    const compareAt = s.compare_at_price ?? s.compareAtPrice ?? null;
    const variantId = String(s.variant_id || s.variantId || "").trim();
    const salable = BlockRenderer.variantSalable(s);
    const sectionTitle = this.esc(s.title || "");
    const badge = this.esc(s.badge || "FEATURED HERE");

    if (!handle) return "";

    const baseUrl = this.shopDomain ? `https://${this.shopDomain}` : "";
    const productUrl = `${baseUrl}/products/${handle}` + (variantId ? `?variant=${variantId}` : "");

    const cardImg = image
      ? `<img src="${image}" alt="${title}" style="width:100%;height:180px;object-fit:cover;display:block;" loading="lazy" />`
      : `<div style="width:100%;height:180px;background:#f1f2f4;display:flex;align-items:center;justify-content:center;"><span style="color:#999;">No Image</span></div>`;

    const stars = `<div style="display:flex;gap:2px;color:#f59e0b;margin:10px 0 12px;">${"<span style='font-size:14px;line-height:1;'>★</span>".repeat(5)}</div>`;

    const priceRow = price
      ? `<div style="display:flex;gap:8px;align-items:baseline;margin:0 0 14px;">\n`
        + `<span style="font-size:14px;color:#202223;font-weight:800;">${price}</span>`
        + (compareAt != null && compareAt !== "" ? `<span style="font-size:12px;color:#9ca3af;text-decoration:line-through;">${formatPrice(compareAt, currency)}</span>` : "")
        + `</div>`
      : "";

    let addToCartBtn;
    if (variantId) {
      if (salable) {
        addToCartBtn = `<button type="button" data-ajax-add-to-cart data-product-title="${this.escAttr(title)}" data-variant-id="${this.escAttr(variantId)}" style="display:block;width:100%;text-align:center;background:#c75a2a;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px;border:none;cursor:pointer;">Add to cart</button>`;
        this.ajaxInjected = true;
      } else {
        addToCartBtn = `<button type="button" disabled aria-disabled="true" style="display:block;width:100%;text-align:center;background:#9ca3af;color:#fff;padding:10px 16px;border-radius:10px;font-weight:800;font-size:14px;border:none;cursor:not-allowed;opacity:0.95;">Out of stock</button>`;
      }
    } else {
      addToCartBtn = `<a href="${productUrl}" style="display:block;text-align:center;background:#c75a2a;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px;">View product</a>`;
    }

    const cardHtml = `<div style="max-width:360px;justify-self:end;">\n`
      + `<div style="border:1px solid #e1e3e5;border-radius:12px;overflow:hidden;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.06);background:#fff;">\n`
      + `<div style="padding:14px 16px 0;">\n`
      + `<div style="font-size:10px;letter-spacing:.14em;font-weight:800;color:#6b7280;">${badge}</div>\n`
      + `</div>\n`
      + `<div style="padding:10px 16px 16px;">\n`
      + cardImg
      + `<div style="margin-top:12px;">\n`
      + `<a href="${productUrl}" style="text-decoration:none;"><div style="margin:0 0 6px;font-size:13px;font-weight:900;color:#202223;line-height:1.25;">${title}</div></a>\n`
      + stars
      + priceRow
      + addToCartBtn
      + `</div></div></div></div>`;

    const contentTitle = sectionTitle ? `<h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#202223;line-height:1.3;">${sectionTitle}</h2>` : "";
    const contentBody = text ? `<div style="font-size:16px;line-height:1.6;color:#374151;">${text}</div>` : "";
    const contentHtml = `<div style="min-width:0;">${contentTitle}${contentBody}</div>`;

    const blockData = this.escAttr(JSON.stringify(s));
    return `<div data-blog-app-block="featured_product" data-blog-app-data="${blockData}" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px;align-items:start;margin:22px 0;">\n`
      + contentHtml + "\n"
      + cardHtml + "\n"
      + `</div>\n`;
  }

  /**
   * Product slider block.
   */
  renderProductSlider(s) {
    const titleText = this.esc(s.title || "");
    const source = (s.source || "manual") === "recommendations" ? "recommendations" : "manual";
    const products = Array.isArray(s.products) ? s.products : [];
    const config = typeof s.config === "object" && s.config ? s.config : {};

    let seed = "";
    if (source === "recommendations") {
      seed = String(s.seed_product_id || s.seedProductId || "").trim();
    }

    const sliderHtml = this.productSliderPlaceholder("inline", seed, products, config, source);
    const heading = titleText ? `<h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#202223;">${titleText}</h2>` : "";

    this.sliderScriptInjected = true;

    const blockData = this.escAttr(JSON.stringify(s));
    return `<div data-blog-app-block="product_slider" data-blog-app-data="${blockData}" style="margin:18px 0;">\n${heading}${sliderHtml}\n</div>\n`;
  }

  renderBlog(s) {
    const title = this.esc(s.title || "Related Articles");
    const count = parseInt(s.count || "3", 10) || 3;
    return `<div class="blog-related-articles" data-count="${count}">\n`
      + `<h3>${title}</h3>\n`
      + `<!-- Related articles will be loaded dynamically -->\n`
      + `</div>\n`;
  }

  renderCountdown(s) {
    const target = this.esc(s.target_date || "");
    const heading = this.esc(s.heading || "Offer ends in:");
    return `<div class="blog-countdown" data-target="${target}">\n`
      + `<p class="blog-countdown__heading">${heading}</p>\n`
      + `<div class="blog-countdown__timer"></div>\n`
      + `</div>\n`;
  }

  renderReviews(s) {
    const productHandle = this.esc(s.product_handle || "");
    return `<div class="blog-reviews" data-product="${productHandle}">\n`
      + `<!-- Reviews widget -->\n`
      + `</div>\n`;
  }

  renderHero(s) {
    const heading = this.esc(s.heading || "");
    const subheading = this.esc(s.subheading || "");
    const image = this.esc(s.image || "");
    const ctaText = this.esc(s.cta_text || "");
    const ctaUrl = this.esc(s.cta_url || "#");
    const bgStyle = image ? `style="background-image:url(${image})"` : "";
    return `<div class="blog-hero" ${bgStyle}>\n`
      + `<div class="blog-hero__content">\n`
      + (heading ? `<h2>${heading}</h2>\n` : "")
      + (subheading ? `<p>${subheading}</p>\n` : "")
      + (ctaText ? `<a href="${ctaUrl}" class="blog-button blog-button--primary">${ctaText}</a>\n` : "")
      + `</div></div>\n`;
  }

  renderAnnouncement(s) {
    const text = this.esc(s.text || "");
    const bgColor = s.bg_color || s.bgColor || "#000";
    const textColor = s.text_color || s.textColor || "#fff";
    return `<div class="blog-announcement" style="background-color:${bgColor};color:${textColor}">${text}</div>\n`;
  }

  renderSpacer(s) {
    const height = parseInt(s.height || "30", 10) || 30;
    return `<div class="blog-spacer" style="height:${height}px"></div>\n`;
  }

  renderCustomHtml(s) {
    return s.code || s.html || "";
  }

  // ─── Slider Infrastructure ────────────────────────────────────────────────

  appendProductSliderWrappers(innerHtml, blocks) {
    const position = this.options.productSliderPosition || "none";
    let source = this.options.productSliderSource || "recommendations";
    const products = Array.isArray(this.options.productSliderProducts) ? this.options.productSliderProducts : [];
    const config = this.options.productSliderConfig || {};

    const hasInlineSlider = Array.isArray(blocks) && blocks.some((b) => b && b.type === "product_slider");

    let seed = String(this.options.productSliderSeedProductId || "").trim();
    if (!seed) {
      seed = BlockRenderer.firstProductBlockSeedId(blocks) || "";
    }

    // If products are explicitly provided, treat as manual regardless of source setting
    if (source !== "manual" && products.length > 0) {
      source = "manual";
    }
    const manualActive = source === "manual" && products.length > 0;
    const sliderActive = ["top", "bottom", "both"].includes(position) && (manualActive || seed !== "");
    const needsSliderScript = sliderActive || hasInlineSlider;

    if (!needsSliderScript) {
      return innerHtml;
    }

    this.sliderScriptInjected = true;

    if (hasInlineSlider || !sliderActive) {
      return innerHtml;
    }

    const top = (position === "top" || position === "both") ? this.productSliderPlaceholder("top", seed, products, config, source) : "";
    const bottom = (position === "bottom" || position === "both") ? this.productSliderPlaceholder("bottom", seed, products, config, source) : "";

    return top + innerHtml + bottom;
  }

  productSliderPlaceholder(slot, seedProductId, products = [], config = {}, source = "recommendations") {
    const slotAttr = this.esc(slot);
    const seedAttr = this.esc(seedProductId);
    const sourceAttr = this.esc(source);

    let productsJson = "";
    if (source === "manual" && products.length > 0) {
      productsJson = this.escAttr(JSON.stringify(Object.values(products)));
    }
    const configJson = this.escAttr(JSON.stringify(config || {}));

    // No-JS fallback: horizontal scroller for manual products
    let fallbackSlides = "";
    if (source === "manual" && products.length > 0) {
      fallbackSlides += '<div class="swiper-wrapper" style="display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px;scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;">\n';
      for (const p of Object.values(products)) {
        const pTitle = this.esc(String(p.title || p.product_title || ""));
        const pHandle = this.esc(String(p.handle || ""));
        const pCurrency = p.currency || this.options.storeCurrency || 'USD';
        const pFormattedPrice = p.price != null ? formatPrice(p.price, pCurrency) : "";
        const pImage = String(p.image || "");
        const pVariantId = String(p.variant_id || "");
        const pSalable = BlockRenderer.variantSalable(p);

        const pImgTag = pImage
          ? `<img loading="lazy" src="${this.esc(pImage)}" alt="${pTitle}" style="width:100%;height:180px;object-fit:cover;display:block;" />`
          : `<div style="width:100%;height:180px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#6b7280;font-weight:700;font-size:12px;">No image</div>`;

        let pBtn;
        if (pVariantId) {
          if (pSalable) {
            pBtn = `<button type="button" data-ajax-add-to-cart data-product-title="${this.escAttr(pTitle)}" data-variant-id="${this.escAttr(pVariantId)}" style="display:inline-block;margin-top:8px;width:100%;text-align:center;background:#111827;color:#fff;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13px;border:none;cursor:pointer;">Add to cart</button>`;
          } else {
            pBtn = `<button type="button" disabled aria-disabled="true" style="display:inline-block;margin-top:8px;width:100%;text-align:center;background:#9ca3af;color:#fff;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13px;border:none;cursor:not-allowed;opacity:0.95;">Out of stock</button>`;
          }
        } else {
          pBtn = `<a href="/products/${pHandle}" style="display:inline-block;margin-top:8px;width:100%;text-align:center;background:#111827;color:#fff;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13px;text-decoration:none;">View product</a>`;
        }

        fallbackSlides += `<div class="swiper-slide" style="flex:0 0 240px;scroll-snap-align:start;box-sizing:border-box;">\n`
          + `<div style="border:1px solid #e3e3e3;border-radius:10px;overflow:hidden;background:#fff;height:100%;">\n`
          + pImgTag
          + `<div style="padding:10px 12px 12px;">\n`
          + `<div style="font-weight:800;font-size:14px;line-height:1.25;">${pTitle}</div>\n`
          + (pFormattedPrice ? `<div style="margin-top:6px;font-weight:700;color:#008060;">${pFormattedPrice}</div>\n` : "")
          + pBtn
          + `</div></div></div>\n`;
      }
      fallbackSlides += '</div>\n';
    }

    return `<div class="blog-app-slider-root" data-blog-app-slider-slot="${slotAttr}" data-seed-product-id="${seedAttr}" data-slider-source="${sourceAttr}" data-products-json="${productsJson}" data-config-json="${configJson}" style="margin:22px 0;">\n`
      + `<div style="display:flex;align-items:stretch;gap:8px;">\n`
      + `<button type="button" class="blog-app-swiper-prev" aria-label="Previous" style="flex:0 0 auto;align-self:center;border:1px solid #c9cccf;border-radius:10px;padding:8px 10px;background:#fff;cursor:pointer;font-size:16px;line-height:1;">&#8592;</button>\n`
      + `<div class="swiper blog-app-related-swiper" style="flex:1;min-width:0;width:100%;">\n`
      + (fallbackSlides || '<div class="swiper-wrapper"></div>')
      + `</div>\n`
      + `<button type="button" class="blog-app-swiper-next" aria-label="Next" style="flex:0 0 auto;align-self:center;border:1px solid #c9cccf;border-radius:10px;padding:8px 10px;background:#fff;cursor:pointer;font-size:16px;line-height:1;">&#8594;</button>\n`
      + `</div>\n`
      + `<div class="blog-app-slider-dots swiper-pagination" style="position:relative;margin-top:12px;"></div>\n`
      + `</div>\n`;
  }

  // ─── Injected Scripts ─────────────────────────────────────────────────────

  static ajaxAddToCartScript() {
    return `<script>\n`
      + `(function(){\n`
      + `if(window.__blog_app_ajax_add_init)return;window.__blog_app_ajax_add_init=true;\n`

      + `function blogAppStorefrontToast(message,kind){\n`
      + `var root=document.getElementById('blog-app-storefront-toast');\n`
      + `if(!root){\n`
      + `root=document.createElement('div');root.id='blog-app-storefront-toast';\n`
      + `root.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483640;max-width:min(360px,calc(100vw-32px));pointer-events:none;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:system-ui,-apple-system,sans-serif;';\n`
      + `document.body.appendChild(root);}\n`
      + `var el=document.createElement('div');el.setAttribute('role','status');\n`
      + `var ok=kind==='success';\n`
      + `el.style.cssText=ok?'pointer-events:auto;background:#15803d;color:#fff;padding:12px 16px;border-radius:10px;font-weight:600;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.18);':'pointer-events:auto;background:#991b1b;color:#fff;padding:12px 16px;border-radius:10px;font-weight:600;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.18);';\n`
      + `el.textContent=String(message||'');\n`
      + `root.appendChild(el);\n`
      + `setTimeout(function(){el.style.transition='opacity .3s ease';el.style.opacity='0';},ok?3000:4800);\n`
      + `setTimeout(function(){try{el.remove();}catch(e){}},ok?3300:5100);\n`
      + `}\n`

      + `function blogCartSectionFields(){\n`
      + `var drawer=document.querySelector('cart-drawer');\n`
      + `if(!drawer||typeof drawer.getSectionsToRender!=='function')return null;\n`
      + `var list=drawer.getSectionsToRender();var ids=[];\n`
      + `for(var i=0;i<list.length;i++){if(list[i]&&list[i].id)ids.push(list[i].id);}\n`
      + `if(!ids.length)return null;\n`
      + `return{sections:ids.join(','),sections_url:window.location.pathname};}\n`

      + `async function addToCart(variantId){\n`
      + `var body={items:[{id:Number(variantId),quantity:1}]};\n`
      + `var sec=blogCartSectionFields();\n`
      + `if(sec){body.sections=sec.sections;body.sections_url=sec.sections_url;}\n`
      + `var res=await fetch('/cart/add.js',{\n`
      + `method:'POST',\n`
      + `headers:{'Content-Type':'application/json',Accept:'application/json'},\n`
      + `body:JSON.stringify(body)});\n`
      + `var data=null;try{data=await res.json();}catch(e){}\n`
      + `if(!res.ok){var msg='Add to cart failed';if(data)msg=data.description||data.message||msg;var err=new Error(msg);err.__blogStatus=res.status;err.__blogBody=data;throw err;}\n`
      + `return data;}\n`

      + `async function blogPublishCartChrome(cart){\n`
      + `try{document.documentElement.dispatchEvent(new CustomEvent('cart:updated',{bubbles:true,detail:{cart:cart}}));\n`
      + `document.documentElement.dispatchEvent(new CustomEvent('cart:update',{bubbles:true,detail:{cart:cart}}));\n`
      + `document.dispatchEvent(new CustomEvent('cart:refresh',{bubbles:true,detail:{cart:cart}}));}catch(e1){}\n`
      + `var n=cart.item_count;var label=n>99?'99+':String(n);\n`
      + `var selectors=['.cart-count-bubble span','#cart-icon-bubble .visually-hidden','[data-cart-count]','.header__icon--cart .cart-count-bubble span','#CartCount span','cart-notification .count-bubble span'];\n`
      + `selectors.forEach(function(sel){document.querySelectorAll(sel).forEach(function(el){if(el&&el.closest&&el.closest('cart-drawer'))return;try{el.textContent=label;}catch(e2){}});});}\n`

      + `async function blogPublishCartAfterAdd(data){\n`
      + `var drawer=document.querySelector('cart-drawer');\n`
      + `if(drawer&&data&&data.sections&&typeof drawer.renderContents==='function'){try{drawer.renderContents(data);drawer.classList.remove('is-empty');return;}catch(e){}}\n`
      + `var cart=await fetch('/cart.js',{headers:{Accept:'application/json'}}).then(function(r){return r.json();});\n`
      + `await blogPublishCartChrome(cart);}\n`

      + `window.BlogAppCart={fetchCart:function(){return fetch('/cart.js',{headers:{Accept:'application/json'}}).then(function(r){return r.json();});},\n`
      + `addLine:function(variantId,quantity){quantity=quantity||1;return fetch('/cart/add.js',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({items:[{id:Number(variantId),quantity:Number(quantity)}]})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw j;return j;});});},\n`
      + `updateLines:function(updates){return fetch('/cart/update.js',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({updates:updates})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw j;return j;});});},\n`
      + `changeLine:function(lineItemKey,quantity){return fetch('/cart/change.js',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({id:String(lineItemKey),quantity:Number(quantity)})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw j;return j;});});},\n`
      + `refreshChrome:blogPublishCartChrome,};\n`

      + `document.addEventListener('click',async function(e){\n`
      + `var t=e.target;if(!t||!t.closest)return;\n`
      + `var btn=t.closest('[data-ajax-add-to-cart]');if(!btn)return;\n`
      + `var id=btn.getAttribute('data-variant-id');\n`
      + `if(!id){\n`
      + `var handle=btn.getAttribute('data-product-handle');\n`
      + `if(handle){try{var pj=await fetch('/products/'+encodeURIComponent(handle)+'.js',{headers:{Accept:'application/json'}}).then(function(r){return r.json();});var vars=(pj&&pj.variants)?pj.variants:[];var picked=null;for(var i=0;i<vars.length;i++){if(vars[i]&&vars[i].available){picked=vars[i];break;}}if(!picked&&vars[0])picked=vars[0];if(picked&&picked.id){id=String(picked.id);btn.setAttribute('data-variant-id',id);}}catch(e3){}}}\n`
      + `if(!id)return;if(btn.dataset.blogAddProcessing==='1')return;\n`
      + `e.preventDefault();e.stopPropagation();\n`
      + `var productTitle=btn.getAttribute('data-product-title')||'Product';\n`
      + `btn.dataset.blogAddProcessing='1';var oldHtml=btn.innerHTML;\n`
      + `btn.disabled=true;btn.style.opacity='0.85';btn.innerHTML='Adding...';\n`
      + `try{var data=await addToCart(id);await blogPublishCartAfterAdd(data);btn.innerHTML='Added';blogAppStorefrontToast('\\u2713 '+productTitle+' added to cart!','success');setTimeout(function(){btn.innerHTML=oldHtml;},1200);}catch(err){console.warn('[BlogApp] Add to cart failed',err);btn.innerHTML=oldHtml;blogAppStorefrontToast('Unable to add \\u2014 this product may be out of stock.','error');}finally{delete btn.dataset.blogAddProcessing;btn.disabled=false;btn.style.opacity='';}\n`
      + `},true);})();</script>\n`;
  }

  static relatedProductSliderScriptBlock() {
    return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />\n`
      + `<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js" defer></script>\n`
      + `<script>\n`
      + `(function(){\n`
      + `if(window.__blogAppRelatedSliderInit)return;window.__blogAppRelatedSliderInit=true;\n`
      + `function qs(root,sel){return(root||document).querySelector(sel);}\n`
      + `function qsa(root,sel){return[].slice.call((root||document).querySelectorAll(sel));}\n`
      + `function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;');}\n`
      + `function mountSwiper(el,products){\n`
      + `if(!window.Swiper||!el)return;\n`
      + `var swEl=qs(el,'.blog-app-related-swiper');\n`
      + `var wrap=swEl?qs(swEl,'.swiper-wrapper'):null;\n`
      + `if(!swEl||!wrap)return;\n`
      + `try{if(el.__blogAppSwiper&&typeof el.__blogAppSwiper.destroy==='function'){el.__blogAppSwiper.destroy(true,true);}}catch(e0){}\n`
      + `el.__blogAppSwiper=null;\n`
      + `wrap.style.display='flex';wrap.style.gap='0';wrap.style.overflow='visible';\n`
      + `wrap.innerHTML=products.map(function(p){try{if(!p)return '';\n`
      + `var isManual=!!(p&&(p.variant_id||p.image||p.compare_at_price!=null||p.variant_available!=null));\n`
      + `var title=isManual?(p.title||p.product_title||''):(p.title||'');\n`
      + `var handle=p.handle||'';\n`
      + `var vid=isManual?(p.variant_id?String(p.variant_id):''):((p.variants&&p.variants[0]&&p.variants[0].id)?String(p.variants[0].id):'');\n`
      + `var price=isManual?(p.price!=null?String(p.price):''):((p.variants&&p.variants[0]&&p.variants[0].price)?String(p.variants[0].price):'');\n`
      + `var compareAt=isManual&&p.compare_at_price!=null?String(p.compare_at_price):'';\n`
      + `var img='';\n`
      + `if(isManual){img=(typeof p.image==='string')?p.image:'';}else{if(typeof p.featured_image==='string')img=p.featured_image;else if(p.featured_image&&p.featured_image.src)img=p.featured_image.src;else if(p.images&&p.images[0]&&p.images[0].src)img=p.images[0].src;else if(p.image&&p.image.src)img=p.image.src;}\n`
      + `var salable=true;\n`
      + `if(isManual&&p.variant_id){salable=!(p.variant_available===false||p.variant_available===0||p.variant_available==='0'||p.variant_available==='false');}\n`
      + `var btn='';\n`
      + `if(vid){btn=salable?'<button type=\"button\" data-ajax-add-to-cart data-product-title=\"'+esc(title)+'\" data-variant-id=\"'+esc(String(vid))+'\" style=\"margin-top:8px;width:100%;background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13px;cursor:pointer;\">Add to cart</button>':'<button type=\"button\" disabled aria-disabled=\"true\" style=\"margin-top:8px;width:100%;background:#9ca3af;color:#fff;border:none;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13px;cursor:not-allowed;opacity:0.95;\">Out of stock</button>';}else{btn=handle?'<button type=\"button\" data-ajax-add-to-cart data-product-title=\"'+esc(title)+'\" data-product-handle=\"'+esc(handle)+'\" style=\"margin-top:8px;width:100%;background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 10px;font-weight:700;font-size:13px;cursor:pointer;\">Add to cart</button>':'<a href=\"/products/'+esc(handle)+'\" style=\"display:inline-block;margin-top:8px;font-weight:700;font-size:13px;\">View product</a>';}\n`
      + `var priceHtml=price?'<div style=\"margin-top:6px;font-weight:700;color:#008060;\">'+esc(price)+'</div>':'';\n`
      + `if(compareAt){priceHtml='<div style=\"display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-top:6px;\">'+'<div style=\"font-weight:700;color:#008060;\">'+esc(price)+'</div>'+'<div style=\"font-weight:700;color:#9ca3af;text-decoration:line-through;font-size:12px;\">'+esc(compareAt)+'</div>'+'</div>';}\n`
      + `return '<div class=\"swiper-slide\" style=\"box-sizing:border-box;padding:6px;height:auto;flex-shrink:0;\">'+'<div style=\"border:1px solid #e3e3e3;border-radius:10px;overflow:hidden;background:#fff;height:100%;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,0.05);\">'+(img?'<img loading=\"lazy\" src=\"'+esc(img)+'\" alt=\"'+esc(title)+'\" style=\"width:100%;height:180px;object-fit:cover;display:block;max-width:100%;\"/>':'')+'<div style=\"padding:12px;flex:1;display:flex;flex-direction:column;justify-content:space-between;\">'+'<div><div style=\"font-weight:700;font-size:14px;line-height:1.3;color:#111827;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:2.6em;\">'+esc(title)+'</div>'+priceHtml+'</div>'+btn+'</div></div></div>';}catch(err){console.warn('[BlogApp] Slide render failed',err);return '';}}).join('');\n`
      + `var dots=qs(el,'.blog-app-slider-dots');\n`
      + `var cfg={};\n`
      + `try{var rawCfg=el.getAttribute('data-config-json')||'{}';cfg=JSON.parse(rawCfg)||{};}catch(e){cfg={};}\n`
      + `var showArrows=cfg.showArrows!==false;var showDots=cfg.showDots!==false;\n`
      + `var autoplay=cfg.autoplay?{delay:Number(cfg.autoplayDelay||3500),disableOnInteraction:false,pauseOnMouseEnter:true}:false;\n`
      + `var mobile=Number(cfg.mobile||1.08);var desktop=Number(cfg.desktop||3);var tablet=2.2;\n`
      + `var prevEl=qs(el,'.blog-app-swiper-prev');var nextEl=qs(el,'.blog-app-swiper-next');\n`
      + `if(prevEl)prevEl.style.display=showArrows?'':'none';if(nextEl)nextEl.style.display=showArrows?'':'none';\n`
      + `if(dots)dots.style.display=showDots?'':'none';\n`
      + `var init=function(){if(!window.Swiper)return;try{swEl.style.width='100%';swEl.style.overflow='hidden';}catch(e1){}\n`
      + `el.__blogAppSwiper=new Swiper(swEl,{slidesPerView:mobile,slidesPerGroup:1,spaceBetween:12,autoplay:autoplay||undefined,watchOverflow:true,centeredSlides:false,roundLengths:true,navigation:showArrows?{prevEl:prevEl,nextEl:nextEl}:undefined,pagination:(dots&&showDots)?{el:dots,clickable:true}:undefined,observer:true,observeParents:true,watchSlidesProgress:true,breakpoints:{640:{slidesPerView:Math.max(1.5,Math.min(tablet,desktop))},1024:{slidesPerView:desktop}},on:{init:function(){try{this.update();}catch(e2){}},resize:function(){try{this.update();}catch(e3){}}}});};\n`
      + `try{requestAnimationFrame(init);}catch(e4){init();}};\n`
      + `async function loadForRoot(el){\n`
      + `var manual=el.getAttribute('data-slider-source')==='manual';\n`
      + `if(manual){try{var raw=el.getAttribute('data-products-json')||'[]';var products=JSON.parse(raw)||[];if(!products.length){el.style.display='none';return;}function tryMountManual(){if(!window.Swiper)return setTimeout(tryMountManual,50);mountSwiper(el,products);}tryMountManual();return;}catch(e){console.warn('[BlogApp] Manual slider parse failed',e);}}\n`
      + `var seed=el.getAttribute('data-seed-product-id');if(!seed)return;\n`
      + `var url='/recommendations/products.json?product_id='+encodeURIComponent(seed)+'&limit=20&intent=related';\n`
      + `try{var res=await fetch(url,{headers:{Accept:'application/json'}});var data=await res.json();var products=(data&&data.products)?data.products:[];if(!products.length){el.style.display='none';return;}function tryMount(){if(!window.Swiper)return setTimeout(tryMount,50);mountSwiper(el,products);}tryMount();}catch(e){console.warn('[BlogApp] Related product slider failed',e);el.style.display='none';}}\n`
      + `function boot(){qsa(document,'.blog-app-slider-root').forEach(loadForRoot);}\n`
      + `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();})();</script>\n`;
  }

  // ─── Escaping ─────────────────────────────────────────────────────────────

  esc(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /** Escape for HTML attribute values (double-quoted). */
  escAttr(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

export { BlockRenderer };
export default BlockRenderer;
