/**
 * BuyButtonBlock — Single product buy/CTA block.
 *
 * Features:
 * - Shopify Resource Picker to select a product
 * - Shows product image, title, price, description snippet
 * - "Add to Cart" or "Buy Now" button that links to the product page
 * - Layout: horizontal (image + details) or vertical (stacked)
 * - Fully configurable colors, button text, image size
 */
import { BlockStack, TextField, Select, Text, Checkbox } from '@shopify/polaris';

// ── Preview ───────────────────────────────────────────────────────────────────

export function BuyButtonBlockPreview({ block }) {
  const product = block.product;
  const layout = block.layout || 'horizontal';
  const btnColor = block.buttonColor || '#008060';
  const btnText = block.buttonText || 'Add to Cart';

  if (!product?.title) {
    return (
      <div style={{
        padding: '32px 16px', textAlign: 'center',
        border: '2px dashed #e1e3e5', borderRadius: '8px',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>🛒</div>
        <Text variant="bodyMd" tone="subdued">Pick a product in the settings panel</Text>
      </div>
    );
  }

  if (layout === 'vertical') {
    return (
      <div style={{
        borderRadius: '12px',
        border: '1px solid #e1e3e5',
        overflow: 'hidden',
        background: '#fff',
        maxWidth: block.maxWidth || '320px',
        margin: '0 auto',
      }}>
        {product.image && (
          <img src={product.image} alt={product.title} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ padding: '16px' }}>
          {block.showBadge && block.badge && (
            <span style={{ fontSize: '11px', background: '#ffd700', color: '#202223', padding: '2px 8px', borderRadius: '12px', fontWeight: '700', marginBottom: '8px', display: 'inline-block' }}>
              {block.badge}
            </span>
          )}
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#202223', marginBottom: '6px' }}>{product.title}</div>
          {block.showDescription && product.description && (
            <div style={{ fontSize: '13px', color: '#6d7175', marginBottom: '10px', lineHeight: 1.5 }}>{product.description}</div>
          )}
          {block.showPrice && product.price && (
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#008060', marginBottom: '12px' }}>
              ${parseFloat(product.price).toFixed(2)}
            </div>
          )}
          <a href={`/products/${product.handle}`} style={{
            display: 'block', padding: '12px', background: btnColor, color: '#fff',
            borderRadius: '8px', textAlign: 'center', fontWeight: '600', fontSize: '14px',
            textDecoration: 'none', cursor: 'default',
          }}>
            {btnText}
          </a>
        </div>
      </div>
    );
  }

  // Horizontal layout (default)
  return (
    <div style={{
      display: 'flex',
      gap: '20px',
      alignItems: 'center',
      padding: '20px',
      borderRadius: '12px',
      border: '1px solid #e1e3e5',
      background: '#fff',
    }}>
      {product.image && (
        <img src={product.image} alt={product.title}
          style={{
            width: block.imageSize || '120px',
            height: block.imageSize || '120px',
            objectFit: 'cover',
            borderRadius: '8px',
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {block.showBadge && block.badge && (
          <span style={{ fontSize: '10px', background: '#ffd700', color: '#202223', padding: '2px 8px', borderRadius: '12px', fontWeight: '700', marginBottom: '6px', display: 'inline-block' }}>
            {block.badge}
          </span>
        )}
        <div style={{ fontSize: '16px', fontWeight: '700', color: '#202223', marginBottom: '4px' }}>{product.title}</div>
        {block.showDescription && product.description && (
          <div style={{ fontSize: '13px', color: '#6d7175', marginBottom: '8px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {product.description}
          </div>
        )}
        {block.showPrice && product.price && (
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#008060', marginBottom: '10px' }}>
            ${parseFloat(product.price).toFixed(2)}
          </div>
        )}
        <a href={`/products/${product.handle}`} style={{
          display: 'inline-block', padding: '10px 20px', background: btnColor, color: '#fff',
          borderRadius: '6px', fontWeight: '600', fontSize: '13px', textDecoration: 'none', cursor: 'default',
        }}>
          {btnText}
        </a>
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function BuyButtonBlockSettings({ block, onUpdate }) {
  const handlePickProduct = async () => {
    if (!window.shopify?.resourcePicker) return;
    const selection = await window.shopify.resourcePicker({ type: 'product', multiple: false });
    if (selection?.[0]) {
      const p = selection[0];
      onUpdate({
        product: {
          shopifyProductId: p.id,
          title: p.title,
          handle: p.handle,
          image: p.images?.[0]?.originalSrc || null,
          price: p.variants?.[0]?.price || null,
          variantId: p.variants?.[0]?.id || null,
          description: p.descriptionHtml?.replace(/<[^>]+>/g, '').slice(0, 200) || '',
        },
      });
    }
  };

  const product = block.product;

  return (
    <BlockStack gap="300">
      {/* Product picker */}
      <button
        type="button"
        onClick={handlePickProduct}
        style={{
          width: '100%', padding: '10px', border: '1px solid #c9cccf',
          borderRadius: '6px', background: product ? '#f9fafb' : '#fff',
          cursor: 'pointer', fontSize: '13px', textAlign: 'left',
        }}
      >
        {product ? (
          <span>✅ <strong>{product.title}</strong> — ${parseFloat(product.price || 0).toFixed(2)}</span>
        ) : (
          <span>🛒 Pick a Product from Shopify</span>
        )}
      </button>
      {product && (
        <button
          type="button"
          onClick={() => onUpdate({ product: null })}
          style={{ fontSize: '12px', color: '#d72c0d', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          ✕ Remove product
        </button>
      )}

      <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '12px' }}>
        <Text variant="bodyMd" fontWeight="semibold">Button</Text>
      </div>
      <TextField
        label="Button Text"
        value={block.buttonText || 'Add to Cart'}
        onChange={v => onUpdate({ buttonText: v })}
        autoComplete="off"
      />
      <div>
        <Text variant="bodySm" fontWeight="semibold">Button Color</Text>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
          <input type="color" value={block.buttonColor || '#008060'} onChange={e => onUpdate({ buttonColor: e.target.value })}
            style={{ width: 36, height: 36, border: '1px solid #c9cccf', borderRadius: '4px', cursor: 'pointer', padding: 0 }} />
          <input type="text" value={block.buttonColor || '#008060'} onChange={e => onUpdate({ buttonColor: e.target.value })}
            style={{ flex: 1, padding: '6px 10px', border: '1px solid #c9cccf', borderRadius: '6px', fontSize: '13px' }} />
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '12px' }}>
        <Text variant="bodyMd" fontWeight="semibold">Layout</Text>
      </div>
      <Select
        label="Layout"
        options={[{ label: 'Horizontal', value: 'horizontal' }, { label: 'Vertical Card', value: 'vertical' }]}
        value={block.layout || 'horizontal'}
        onChange={v => onUpdate({ layout: v })}
      />
      {block.layout === 'horizontal' && (
        <Select
          label="Image Size"
          options={[{ label: 'Small (80px)', value: '80px' }, { label: 'Medium (120px)', value: '120px' }, { label: 'Large (160px)', value: '160px' }]}
          value={block.imageSize || '120px'}
          onChange={v => onUpdate({ imageSize: v })}
        />
      )}
      {block.layout === 'vertical' && (
        <Select
          label="Max Width"
          options={[{ label: '280px', value: '280px' }, { label: '320px', value: '320px' }, { label: '400px', value: '400px' }, { label: '100%', value: '100%' }]}
          value={block.maxWidth || '320px'}
          onChange={v => onUpdate({ maxWidth: v })}
        />
      )}

      <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '12px' }}>
        <Text variant="bodyMd" fontWeight="semibold">Display</Text>
      </div>
      <Checkbox label="Show price" checked={block.showPrice !== false} onChange={v => onUpdate({ showPrice: v })} />
      <Checkbox label="Show description snippet" checked={block.showDescription === true} onChange={v => onUpdate({ showDescription: v })} />
      <Checkbox label="Show badge" checked={block.showBadge === true} onChange={v => onUpdate({ showBadge: v })} />
      {block.showBadge && (
        <TextField
          label="Badge Text"
          value={block.badge || 'FEATURED'}
          onChange={v => onUpdate({ badge: v })}
          autoComplete="off"
        />
      )}
    </BlockStack>
  );
}
