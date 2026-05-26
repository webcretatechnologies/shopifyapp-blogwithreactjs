/**
 * useBlockSerializer.js
 *
 * Converts the block array (JSON schema) to a Shopify-compatible HTML string.
 * This HTML is what gets saved to `contentHtml` and pushed to Shopify's
 * `article.body_html` or `page.body_html`.
 *
 * Design:
 * - Each block type has a toHTML() function
 * - Registry blocks use their own serializer
 * - Unknown types fall back to simple HTML generation
 * - The output is clean, semantic HTML (no inline editor UI artifacts)
 */

/**
 * Serialize a full blocks array to HTML string.
 * @param {Array} blocks
 * @returns {string} HTML string
 */
export function serializeBlocksToHtml(blocks = []) {
  return blocks
    .map(blockToHtml)
    .filter(Boolean)
    .join('\n');
}

/**
 * Serialize a single block to HTML.
 * @param {Object} block
 * @returns {string}
 */
export function blockToHtml(block) {
  if (!block?.type) return '';

  switch (block.type) {
    // ── Registry blocks ───────────────────────────────────────────────
    case 'text':
      return block.content || '';

    case 'heading': {
      const tag = block.level || 'h2';
      const align = block.align && block.align !== 'left' ? ` style="text-align:${block.align};"` : '';
      const color = block.color && block.color !== '#202223' ? `;color:${block.color}` : '';
      const styleAttr = (align || color) ? ` style="text-align:${block.align || 'left'}${color}"` : '';
      return `<${tag}${styleAttr}>${escapeHtml(block.content || '')}</${tag}>`;
    }

    case 'hero': {
      const bg = block.backgroundImage
        ? `background-image:url('${block.backgroundImage}');background-size:cover;background-position:center;`
        : 'background:linear-gradient(135deg,#1a1a2e,#16213e);';
      const overlay = block.backgroundOverlay !== false && block.backgroundImage
        ? `<div style="position:absolute;inset:0;background:${hexToRgba(block.overlayColor || '#000', block.overlayOpacity ?? 0.4)};"></div>`
        : '';
      const cta = block.showCta !== false && block.ctaText
        ? `<a href="${block.ctaUrl || '/'}" style="display:inline-block;padding:12px 28px;background:${block.ctaColor || '#008060'};color:${block.ctaTextColor || '#ffffff'};border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;">${escapeHtml(block.ctaText)}</a>`
        : '';
      return `
<div style="position:relative;min-height:${block.minHeight || '400px'};display:flex;align-items:center;justify-content:${block.align === 'left' ? 'flex-start' : block.align === 'right' ? 'flex-end' : 'center'};${bg}padding:40px 32px;box-sizing:border-box;">
  ${overlay}
  <div style="position:relative;z-index:1;text-align:${block.align || 'center'};max-width:600px;width:100%;">
    ${block.heading ? `<h2 style="margin:0 0 12px;font-size:32px;font-weight:700;color:${block.textColor || '#ffffff'};line-height:1.2;">${escapeHtml(block.heading)}</h2>` : ''}
    ${block.subheading ? `<p style="margin:0 0 24px;font-size:16px;color:${block.textColor || '#ffffff'};opacity:0.85;line-height:1.6;">${escapeHtml(block.subheading)}</p>` : ''}
    ${cta}
  </div>
</div>`.trim();
    }

    case 'image': {
      if (!block.src) return '';
      const style = [
        `max-width:${block.width || '100%'}`,
        `width:${block.width || '100%'}`,
        'height:auto',
        block.borderRadius && block.borderRadius !== '0px' ? `border-radius:${block.borderRadius}` : '',
        block.align === 'center' ? 'display:block;margin:0 auto' : block.align === 'right' ? 'display:block;margin:0 0 0 auto' : 'display:block',
      ].filter(Boolean).join(';');
      const img = `<img src="${block.src}" alt="${escapeHtml(block.alt || '')}" style="${style}"/>`;
      const wrapped = block.linkUrl ? `<a href="${block.linkUrl}">${img}</a>` : img;
      const caption = block.caption ? `<p style="margin-top:8px;font-size:13px;color:#6d7175;font-style:italic;">${escapeHtml(block.caption)}</p>` : '';
      return `<div style="text-align:${block.align || 'center'};">${wrapped}${caption}</div>`;
    }

    // ── Legacy blocks (unchanged serialization) ───────────────────────
    case 'cta_button':
      return `<div style="text-align:${block.align || 'center'};margin:16px 0;">
  <a href="${block.url || '#'}" style="display:inline-block;padding:12px 24px;background:${block.color || '#008060'};color:${block.textColor || '#fff'};text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(block.text || 'Click here')}</a>
</div>`;

    case 'divider':
      return `<hr style="border:none;border-top:1px ${block.style || 'solid'} ${block.color || '#e1e3e5'};margin:${block.margin || '20px'} 0;"/>`;

    case 'spacer':
      return `<div style="height:${block.height || '40px'};"></div>`;

    case 'video':
      if (!block.url) return '';
      // Convert YouTube URL to embed
      const videoId = extractYouTubeId(block.url);
      if (videoId) {
        return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;">
  <iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allowfullscreen></iframe>
</div>`;
      }
      return `<p><a href="${block.url}">${block.url}</a></p>`;

    case 'html':
      return block.code || '';

    case 'product':
      if (!block.title) return '';
      return `<div style="display:flex;gap:16px;align-items:center;padding:16px;border:1px solid #e1e3e5;border-radius:8px;margin:16px 0;">
  ${block.image ? `<img src="${block.image}" alt="${escapeHtml(block.title)}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;"/>` : ''}
  <div>
    <strong>${escapeHtml(block.title)}</strong>
    ${block.price ? `<p style="color:#008060;margin:4px 0;">\$${block.price}</p>` : ''}
    ${block.handle ? `<a href="/products/${block.handle}" style="font-size:13px;color:#2c6ecb;">View Product →</a>` : ''}
  </div>
</div>`;

    case 'product_slider': {
      const products = block.products || [];
      if (products.length === 0) return '';
      return `<div style="margin:24px 0;">
  ${block.title ? `<h3 style="margin-bottom:16px;">${escapeHtml(block.title)}</h3>` : ''}
  <div style="display:flex;gap:16px;overflow-x:auto;padding-bottom:8px;">
    ${products.map(p => `
    <div style="min-width:200px;border:1px solid #e1e3e5;border-radius:8px;overflow:hidden;">
      ${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.title || '')}" style="width:100%;height:160px;object-fit:cover;"/>` : ''}
      <div style="padding:12px;">
        <strong style="font-size:14px;">${escapeHtml(p.title || '')}</strong>
        ${p.price ? `<p style="color:#008060;margin:4px 0;">$${p.price}</p>` : ''}
        ${p.handle ? `<a href="/products/${p.handle}" style="display:block;margin-top:8px;padding:6px 12px;background:#008060;color:#fff;text-decoration:none;border-radius:4px;text-align:center;font-size:13px;">Add to Cart</a>` : ''}
      </div>
    </div>`).join('')}
  </div>
</div>`;
    }

    // ── Phase 3: Shopify Commerce blocks ─────────────────────────────────
    case 'product_grid': {
      const gridProducts = block.manualProducts?.length > 0 ? block.manualProducts : [];
      if (gridProducts.length === 0 && !block.searchQuery) return '';
      const cols = parseInt(block.columns || '3');
      const btnColor = block.buttonColor || '#008060';
      const btnText = block.buttonText || 'Add to Cart';
      return `<div style="margin:24px 0;">
  ${block.title ? `<h3 style="margin:0 0 16px;font-size:20px;font-weight:700;text-align:${block.titleAlign || 'left'};">${escapeHtml(block.title)}</h3>` : ''}
  <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${block.gap || '16px'};">
    ${gridProducts.slice(0, parseInt(block.maxProducts || '12')).map(p => `
    <div style="border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;background:#fff;">
      ${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.title)}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;"/>` : ''}
      <div style="padding:12px;">
        <strong style="font-size:14px;display:block;margin-bottom:4px;">${escapeHtml(p.title)}</strong>
        ${block.showPrice !== false && p.price ? `<p style="color:#008060;font-weight:700;margin:0 0 8px;">$${parseFloat(p.price).toFixed(2)}</p>` : ''}
        ${block.showButton !== false && p.handle ? `<a href="/products/${p.handle}" style="display:block;padding:8px;background:${btnColor};color:#fff;text-decoration:none;border-radius:6px;text-align:center;font-weight:600;font-size:13px;">${escapeHtml(btnText)}</a>` : ''}
      </div>
    </div>`).join('')}
  </div>
</div>`;
    }

    case 'collection': {
      // Collection block produces a placeholder in HTML — live data is rendered on the storefront
      const collHandle = block.collectionHandle;
      if (!collHandle) return '';
      return `<div data-block-type="collection" data-collection-handle="${collHandle}" style="margin:24px 0;">
  ${block.heading ? `<h3 style="margin:0 0 16px;font-size:20px;font-weight:700;">${escapeHtml(block.heading)}</h3>` : ''}
  <p><a href="/collections/${collHandle}" style="color:#2c6ecb;">View Collection →</a></p>
</div>`;
    }

    case 'buy_button': {
      const product = block.product;
      if (!product?.title) return '';
      const btnColor = block.buttonColor || '#008060';
      const btnText = block.buttonText || 'Add to Cart';
      return `<div style="display:flex;gap:20px;align-items:center;padding:20px;border:1px solid #e1e3e5;border-radius:12px;margin:16px 0;">
  ${product.image ? `<img src="${product.image}" alt="${escapeHtml(product.title)}" style="width:${block.imageSize || '120px'};height:${block.imageSize || '120px'};object-fit:cover;border-radius:8px;flex-shrink:0;"/>` : ''}
  <div style="flex:1;">
    ${block.showBadge && block.badge ? `<span style="font-size:10px;background:#ffd700;color:#202223;padding:2px 8px;border-radius:12px;font-weight:700;margin-bottom:6px;display:inline-block;">${escapeHtml(block.badge)}</span>` : ''}
    <strong style="font-size:16px;display:block;margin-bottom:4px;">${escapeHtml(product.title)}</strong>
    ${block.showDescription && product.description ? `<p style="font-size:13px;color:#6d7175;margin:0 0 8px;">${escapeHtml(product.description)}</p>` : ''}
    ${block.showPrice !== false && product.price ? `<p style="font-size:18px;font-weight:700;color:#008060;margin:0 0 10px;">$${parseFloat(product.price).toFixed(2)}</p>` : ''}
    ${product.handle ? `<a href="/products/${product.handle}" style="display:inline-block;padding:10px 20px;background:${btnColor};color:#fff;border-radius:6px;font-weight:600;font-size:13px;text-decoration:none;">${escapeHtml(btnText)}</a>` : ''}
  </div>
</div>`;
    }

    default:
      return '';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hexToRgba(hex, opacity) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0,0,0,${opacity})`;
  return `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${opacity})`;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

/**
 * Hook wrapper for use in React components.
 */
export function useBlockSerializer() {
  return { serializeBlocksToHtml, blockToHtml };
}
