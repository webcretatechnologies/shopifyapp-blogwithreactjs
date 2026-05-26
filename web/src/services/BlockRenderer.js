/**
 * BlockRenderer Service
 * Converts JSON block data into HTML strings for the storefront.
 * Ported from Laravel's App\Services\BlockRenderer
 */

export class BlockRenderer {
  constructor(shopDomain = "", options = {}) {
    this.shopDomain = shopDomain;
    this.options = {
      productSliderPosition: options.product_slider_position || "none",
      ...options,
    };
    this.productSliderHtml = "";
    this.customCss = "";
    this.customJs = "";
  }

  static render(blocks, shopDomain = "", options = {}) {
    const renderer = new BlockRenderer(shopDomain, options);
    return renderer.renderBlocks(blocks);
  }

  renderBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return "";
    const parts = blocks.map((block) => this.renderBlock(block));
    return parts.join("\n");
  }

  renderBlock(block) {
    if (!block || !block.type) return "";
    switch (block.type) {
      case "heading":
        return this.renderHeading(block);
      case "text":
        return this.renderText(block);
      case "image":
        return this.renderImage(block);
      case "image_text":
        return this.renderImageText(block);
      case "video":
        return this.renderVideo(block);
      case "divider":
        return this.renderDivider(block);
      case "button":
        return this.renderButton(block);
      case "list":
        return this.renderList(block);
      case "faq":
        return this.renderFaq(block);
      case "table":
        return this.renderTable(block);
      case "product":
        return this.renderProduct(block);
      case "product_text":
        return this.renderProductText(block);
      case "product_slider":
        return this.renderProductSlider(block);
      case "featured_product":
        return this.renderFeaturedProduct(block);
      case "blog":
        return this.renderBlog(block);
      case "countdown":
        return this.renderCountdown(block);
      case "reviews":
        return this.renderReviews(block);
      case "hero":
        return this.renderHero(block);
      case "announcement":
        return this.renderAnnouncement(block);
      case "spacer":
        return this.renderSpacer(block);
      case "html":
        return this.renderCustomHtml(block);
      default:
        return "";
    }
  }

  renderHeading(block) {
    const s = block.settings || {};
    const level = parseInt(s.level || "2");
    const text = this.esc(s.text || "");
    const align = s.align || "left";
    return `<h${level} class="blog-heading blog-heading--h${level}" style="text-align:${align}">${text}</h${level}>`;
  }

  renderText(block) {
    const s = block.settings || {};
    const content = s.content || s.text || "";
    return `<div class="blog-text">${content}</div>`;
  }

  renderImage(block) {
    const s = block.settings || {};
    const src = this.esc(s.src || s.url || "");
    const alt = this.esc(s.alt || "");
    const caption = s.caption || "";
    const align = s.align || "center";
    if (!src) return "";
    return `<figure class="blog-image blog-image--${align}">
  <img src="${src}" alt="${alt}" loading="lazy" />
  ${caption ? `<figcaption>${this.esc(caption)}</figcaption>` : ""}
</figure>`;
  }

  renderImageText(block) {
    const s = block.settings || {};
    const src = this.esc(s.src || s.image || "");
    const imagePosition = s.image_position || "left";
    const text = s.text || s.content || "";
    const heading = s.heading ? `<h3>${this.esc(s.heading)}</h3>` : "";
    return `<div class="blog-image-text blog-image-text--${imagePosition}">
  <div class="blog-image-text__image"><img src="${src}" alt="" loading="lazy" /></div>
  <div class="blog-image-text__content">${heading}${text}</div>
</div>`;
  }

  renderVideo(block) {
    const s = block.settings || {};
    const url = s.url || s.src || "";
    if (url.includes("youtube") || url.includes("youtu.be")) {
      const videoId = this.extractYouTubeId(url);
      if (videoId) {
        return `<div class="blog-video blog-video--youtube">
  <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe>
</div>`;
      }
    }
    if (url.includes("vimeo")) {
      const videoId = url.split("/").pop();
      return `<div class="blog-video blog-video--vimeo">
  <iframe src="https://player.vimeo.com/video/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe>
</div>`;
    }
    return `<div class="blog-video"><video src="${this.esc(url)}" controls preload="metadata"></video></div>`;
  }

  renderDivider(block) {
    const s = block.settings || {};
    const style = s.style || "solid";
    return `<hr class="blog-divider blog-divider--${style}" />`;
  }

  renderButton(block) {
    const s = block.settings || {};
    const text = this.esc(s.text || s.label || "Click here");
    const url = this.esc(s.url || s.href || "#");
    const style = s.style || "primary";
    const align = s.align || "left";
    return `<div class="blog-button-wrapper" style="text-align:${align}">
  <a href="${url}" class="blog-button blog-button--${style}">${text}</a>
</div>`;
  }

  renderList(block) {
    const s = block.settings || {};
    const items = s.items || [];
    const ordered = s.ordered || false;
    const tag = ordered ? "ol" : "ul";
    const rows = items.map((i) => `  <li>${this.esc(typeof i === "string" ? i : i.text || "")}</li>`).join("\n");
    return `<${tag} class="blog-list blog-list--${ordered ? "ordered" : "unordered"}">\n${rows}\n</${tag}>`;
  }

  renderFaq(block) {
    const s = block.settings || {};
    const items = s.items || [];
    const html = items
      .map(
        (item, i) => `<details class="blog-faq__item" id="faq-${i}">
  <summary class="blog-faq__question">${this.esc(item.question || "")}</summary>
  <div class="blog-faq__answer">${item.answer || ""}</div>
</details>`
      )
      .join("\n");
    return `<div class="blog-faq">${html}</div>`;
  }

  renderTable(block) {
    const s = block.settings || {};
    const headers = s.headers || [];
    const rows = s.rows || [];
    const headerHtml = headers.length
      ? `<thead><tr>${headers.map((h) => `<th>${this.esc(h)}</th>`).join("")}</tr></thead>`
      : "";
    const bodyHtml = rows.length
      ? `<tbody>${rows
          .map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${this.esc(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody>`
      : "";
    return `<div class="blog-table-wrapper"><table class="blog-table">${headerHtml}${bodyHtml}</table></div>`;
  }

  renderProduct(block) {
    const s = block.settings || {};
    const handle = this.esc(s.handle || "");
    const title = this.esc(s.title || "");
    const image = this.esc(s.image || "");
    const price = s.price ? `$${parseFloat(s.price).toFixed(2)}` : "";
    if (!handle) return "";
    return `<div class="blog-product-card" data-handle="${handle}">
  ${image ? `<a href="/products/${handle}"><img src="${image}" alt="${title}" loading="lazy" /></a>` : ""}
  <div class="blog-product-card__info">
    <h4><a href="/products/${handle}">${title}</a></h4>
    ${price ? `<span class="blog-product-card__price">${price}</span>` : ""}
    <a href="/products/${handle}" class="blog-product-card__btn">View Product</a>
  </div>
</div>`;
  }

  renderProductText(block) {
    const s = block.settings || {};
    const handle = this.esc(s.handle || "");
    const title = this.esc(s.title || "");
    const text = s.text || s.description || "";
    const image = this.esc(s.image || "");
    const imagePosition = s.image_position || "right";
    if (!handle) return "";
    return `<div class="blog-product-text blog-product-text--${imagePosition}">
  ${image ? `<div class="blog-product-text__image"><img src="${image}" alt="${title}" loading="lazy" /></div>` : ""}
  <div class="blog-product-text__content">
    <h3>${title}</h3>
    <div>${text}</div>
    <a href="/products/${handle}" class="blog-button blog-button--primary">Shop Now</a>
  </div>
</div>`;
  }

  renderProductSlider(block) {
    const s = block.settings || {};
    const products = s.products || [];
    if (!products.length) return "";
    const slides = products
      .map(
        (p) => `<div class="blog-slider__slide">
    <a href="/products/${this.esc(p.handle || "")}">
      <img src="${this.esc(p.image || "")}" alt="${this.esc(p.title || "")}" loading="lazy" />
    </a>
    <div class="blog-slider__info">
      <p>${this.esc(p.title || "")}</p>
      ${p.price ? `<span>$${parseFloat(p.price).toFixed(2)}</span>` : ""}
    </div>
  </div>`
      )
      .join("");
    return `<div class="blog-product-slider" data-autoplay="${s.autoplay || false}">
  <div class="blog-slider__track">${slides}</div>
</div>`;
  }

  renderFeaturedProduct(block) {
    const s = block.settings || {};
    const handle = this.esc(s.handle || "");
    if (!handle) return "";
    return `<div class="blog-featured-product" data-handle="${handle}">
  <!-- Shopify will hydrate this section via section rendering API -->
</div>`;
  }

  renderBlog(block) {
    const s = block.settings || {};
    const title = this.esc(s.title || "Related Articles");
    const count = parseInt(s.count || "3");
    return `<div class="blog-related-articles" data-count="${count}">
  <h3>${title}</h3>
  <!-- Related articles will be loaded dynamically -->
</div>`;
  }

  renderCountdown(block) {
    const s = block.settings || {};
    const target = this.esc(s.target_date || "");
    const heading = this.esc(s.heading || "Offer ends in:");
    return `<div class="blog-countdown" data-target="${target}">
  <p class="blog-countdown__heading">${heading}</p>
  <div class="blog-countdown__timer"></div>
</div>`;
  }

  renderReviews(block) {
    const s = block.settings || {};
    const productHandle = this.esc(s.product_handle || "");
    return `<div class="blog-reviews" data-product="${productHandle}">
  <!-- Reviews widget -->
</div>`;
  }

  renderHero(block) {
    const s = block.settings || {};
    const heading = this.esc(s.heading || "");
    const subheading = this.esc(s.subheading || "");
    const image = this.esc(s.image || "");
    const ctaText = this.esc(s.cta_text || "");
    const ctaUrl = this.esc(s.cta_url || "#");
    return `<div class="blog-hero" style="${image ? `background-image:url(${image})` : ""}">
  <div class="blog-hero__content">
    ${heading ? `<h2>${heading}</h2>` : ""}
    ${subheading ? `<p>${subheading}</p>` : ""}
    ${ctaText ? `<a href="${ctaUrl}" class="blog-button blog-button--primary">${ctaText}</a>` : ""}
  </div>
</div>`;
  }

  renderAnnouncement(block) {
    const s = block.settings || {};
    const text = this.esc(s.text || "");
    const bgColor = s.bg_color || "#000";
    const textColor = s.text_color || "#fff";
    return `<div class="blog-announcement" style="background-color:${bgColor};color:${textColor}">${text}</div>`;
  }

  renderSpacer(block) {
    const s = block.settings || {};
    const height = parseInt(s.height || "30");
    return `<div class="blog-spacer" style="height:${height}px"></div>`;
  }

  renderCustomHtml(block) {
    const s = block.settings || {};
    return s.html || "";
  }

  extractYouTubeId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

export default BlockRenderer;
