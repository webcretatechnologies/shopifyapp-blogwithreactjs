/**
 * ProductGridBlock — Shows a grid of Shopify products.
 *
 * Features:
 * - Search products by query string or pick via Shopify Resource Picker
 * - Grid / List layout
 * - Configurable columns (2, 3, 4)
 * - Show/hide price, vendor, "Add to Cart" button
 * - Live product data from /api/posts/shopify/products
 * - Dynamic currency formatting based on store/product currency
 */
import { useState } from 'react';
import { BlockStack, TextField, Select, Text, Checkbox, Spinner, InlineStack } from '@shopify/polaris';
import { useShopifyProducts } from '../../../../hooks/useShopifyProducts.js';
import { useShopifyStoreCurrency } from '../../../../hooks/useShopifyProducts.js';
import { formatPrice } from '../../../../utils/priceUtils.js';

// ── Preview ───────────────────────────────────────────────────────────────────

export function ProductGridBlockPreview({ block }) {
  const s = block?.settings || block || {};
  const { storeCurrency } = useShopifyStoreCurrency();

  const displayProducts = s.manualProducts || [];
  const cols = parseInt(s.columns || '3') || 3;
  const showPrice = s.showPrice !== false;
  const showButton = s.showButton !== false;

  if (displayProducts.length === 0) {
    return (
      <div style={{
        padding: '24px 16px', textAlign: 'center',
        backgroundColor: '#f4f6f8', border: '1px dashed #c9cccf', borderRadius: '4px', boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛍</div>
        <Text variant="bodyMd" tone="subdued">No products selected — click "Pick Products from Shopify" in settings</Text>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {s.title && (
        <h3 style={{
          margin: '0 0 16px', fontSize: '20px', fontWeight: '700',
          color: s.titleColor || '#202223',
          textAlign: s.titleAlign || 'left',
        }}>
          {s.title}
        </h3>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: s.gap || '16px',
        width: '100%',
      }}>
        {displayProducts.slice(0, parseInt(s.maxProducts || '12')).map((p, idx) => (
          <ProductCard
            key={p.shopifyProductId || p.id || p.handle || `prod_${idx}`}
            product={p}
            showPrice={showPrice}
            showButton={showButton}
            cardStyle={s.cardStyle || 'shadow'}
            buttonColor={s.buttonColor || '#008060'}
            buttonText={s.buttonText || 'Add to Cart'}
            buttonRadius={s.buttonRadius ?? 6}
            storeCurrency={storeCurrency}
          />
        ))}
      </div>
    </div>
  );
}

function ProductCard({ product, showPrice, showButton, cardStyle, buttonColor, buttonText, buttonRadius, storeCurrency }) {
  const styles = {
    shadow: { borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', background: '#fff' },
    border: { borderRadius: '8px', border: '1px solid #e1e3e5', overflow: 'hidden', background: '#fff' },
    minimal: { padding: '4px' },
  };
  const currency = product.currency || storeCurrency;
  const pImgUrl = typeof product.image === 'string' ? product.image : (product.image?.url || product.featuredImage?.url || product.images?.[0]?.originalSrc || product.images?.[0]?.src || null);

  return (
    <div style={styles[cardStyle] || styles.shadow}>
      <div style={{ width: '100%', height: '180px', backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: '1px solid #f1f2f3' }}>
        {pImgUrl ? (
          <img
            src={pImgUrl}
            alt={product.title || ''}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }}
          />
        ) : (
          <span style={{ fontSize: '24px' }}>🖼</span>
        )}
      </div>
      <div style={{ padding: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#202223', marginBottom: '4px', lineHeight: 1.3 }}>
          {product.title}
        </div>
        {showPrice && product.price && (
          <div style={{ fontSize: '14px', color: 'var(--blogger-primary-color, #008060)', fontWeight: '700', marginBottom: '8px' }}>
            {formatPrice(product.price, currency)}
          </div>
        )}
        {showButton && (
          <div style={{
            padding: '8px 12px', background: buttonColor, color: '#fff',
            borderRadius: `${buttonRadius ?? 6}px`, fontSize: '13px', fontWeight: '600', textAlign: 'center',
            cursor: 'default',
          }}>
            {buttonText}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function ProductGridBlockSettings({ block, onUpdate }) {
  const { storeCurrency } = useShopifyStoreCurrency();

  const handlePickProducts = async () => {
    if (!window.shopify?.resourcePicker) return;
    const initialSelection = block.manualProducts?.map(p => {
      const rawId = p.shopifyProductId || p.id;
      if (!rawId) return null;
      const idStr = String(rawId);
      return { id: idStr.startsWith('gid://') ? idStr : `gid://shopify/Product/${idStr}` };
    }).filter(Boolean) || [];

    const selection = await window.shopify.resourcePicker({
      type: 'product',
      multiple: true,
      selectionIds: initialSelection,
    });
    if (selection) {
      const picked = selection.map(p => ({
        shopifyProductId: p.id,
        title: p.title,
        handle: p.handle,
        image: p.images?.[0]?.originalSrc || p.featuredImage?.url || null,
        price: p.variants?.[0]?.price || null,
        variantId: p.variants?.[0]?.id || null,
        currency: storeCurrency || 'USD',
      }));
      onUpdate({ manualProducts: picked });
    }
  };

  return (
    <BlockStack gap="300">
      <TextField
        label="Section Title"
        value={block.title || ''}
        onChange={v => onUpdate({ title: v })}
        placeholder="Featured Products"
        autoComplete="off"
      />
      <Select
        label="Title Alignment"
        options={[{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' }]}
        value={block.titleAlign || 'left'}
        onChange={v => onUpdate({ titleAlign: v })}
      />
      <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '12px' }}>
        <Text variant="bodyMd" fontWeight="semibold">Products</Text>
      </div>
      <button
        type="button"
        onClick={handlePickProducts}
        style={{
          width: '100%', padding: '8px', border: '1px solid #c9cccf',
          borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px',
        }}
      >
        🛍 Pick Products from Shopify
      </button>
      {block.manualProducts?.length > 0 && (
        <Text variant="bodySm" tone="subdued">{block.manualProducts.length} product(s) selected</Text>
      )}
      <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '12px' }}>
        <Text variant="bodyMd" fontWeight="semibold">Layout</Text>
      </div>
      <Select
        label="Columns"
        options={[{ label: '2 Columns', value: '2' }, { label: '3 Columns', value: '3' }, { label: '4 Columns', value: '4' }]}
        value={block.columns || '3'}
        onChange={v => onUpdate({ columns: v })}
      />
      <Select
        label="Max Products"
        options={['4','6','8','12','16','24'].map(v => ({ label: v, value: v }))}
        value={block.maxProducts || '12'}
        onChange={v => onUpdate({ maxProducts: v })}
      />
      <Select
        label="Card Style"
        options={[{ label: 'Shadow', value: 'shadow' }, { label: 'Border', value: 'border' }, { label: 'Minimal', value: 'minimal' }]}
        value={block.cardStyle || 'shadow'}
        onChange={v => onUpdate({ cardStyle: v })}
      />
      <TextField
        label="Gap between cards"
        value={block.gap || '16px'}
        onChange={v => onUpdate({ gap: v })}
        autoComplete="off"
      />
      <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '12px' }}>
        <Text variant="bodyMd" fontWeight="semibold">Display Options</Text>
      </div>
      <Checkbox
        label="Show price"
        checked={block.showPrice !== false}
        onChange={v => onUpdate({ showPrice: v })}
      />
      <Checkbox
        label="Show Add to Cart button"
        checked={block.showButton !== false}
        onChange={v => onUpdate({ showButton: v })}
      />
      {block.showButton !== false && (
        <>
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
          <TextField
            label="Button Corner Radius"
            type="number"
            value={String(block.buttonRadius ?? 6)}
            onChange={v => onUpdate({ buttonRadius: parseInt(v) || 0 })}
            autoComplete="off"
          />
        </>
      )}
    </BlockStack>
  );
}
