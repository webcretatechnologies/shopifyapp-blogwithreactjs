/**
 * CollectionBlock — Shows products from a Shopify collection.
 *
 * Features:
 * - Select collection from dropdown (fetched live)
 * - Live preview of collection products
 * - Configurable layout: grid or horizontal scroll
 * - Configurable columns, max products, button text/color
 */
import { useState } from 'react';
import { BlockStack, TextField, Select, Text, Checkbox, Spinner } from '@shopify/polaris';
import { useShopifyCollections, useCollectionProducts } from '../../../../hooks/useShopifyProducts.js';

// ── Preview ───────────────────────────────────────────────────────────────────

export function CollectionBlockPreview({ block }) {
  const handle = block.collectionHandle || '';
  const limit = parseInt(block.maxProducts || '8');
  const { collection, products, isLoading } = useCollectionProducts(handle, limit);

  if (!handle) {
    return (
      <div style={{
        padding: '32px 16px', textAlign: 'center',
        border: '2px dashed #e1e3e5', borderRadius: '8px',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
        <Text variant="bodyMd" tone="subdued">Select a collection in the settings panel</Text>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spinner size="small" />
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#6d7175' }}>Loading collection…</div>
      </div>
    );
  }

  const layout = block.layout || 'grid';
  const cols = parseInt(block.columns || '3');
  const showPrice = block.showPrice !== false;
  const showButton = block.showButton !== false;

  return (
    <div>
      {/* Collection header */}
      {(block.showTitle !== false) && (
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: block.titleAlign || 'space-between', gap: '16px' }}>
          <div>
            {block.heading && (
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#202223' }}>
                {block.heading}
              </h3>
            )}
            {!block.heading && collection?.title && (
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#202223' }}>
                {collection.title}
              </h3>
            )}
          </div>
          {block.showViewAll !== false && collection?.handle && (
            <span style={{
              fontSize: '13px', color: '#2c6ecb', fontWeight: '500', cursor: 'pointer',
              padding: '6px 12px', border: '1px solid #2c6ecb', borderRadius: '6px',
            }}>
              View All →
            </span>
          )}
        </div>
      )}

      {/* Products */}
      {layout === 'scroll' ? (
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
          {products.map(p => (
            <div key={p.shopifyProductId} style={{ minWidth: '180px', maxWidth: '200px', flexShrink: 0 }}>
              <CollectionProductCard product={p} showPrice={showPrice} showButton={showButton} buttonColor={block.buttonColor || '#008060'} buttonText={block.buttonText || 'Shop Now'} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px' }}>
          {products.map(p => (
            <CollectionProductCard key={p.shopifyProductId} product={p} showPrice={showPrice} showButton={showButton} buttonColor={block.buttonColor || '#008060'} buttonText={block.buttonText || 'Shop Now'} />
          ))}
        </div>
      )}

      {products.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#6d7175' }}>
          No products found in this collection.
        </div>
      )}
    </div>
  );
}

function CollectionProductCard({ product, showPrice, showButton, buttonColor, buttonText }) {
  return (
    <div style={{ borderRadius: '10px', border: '1px solid #e1e3e5', overflow: 'hidden', background: '#fff' }}>
      {product.image ? (
        <img src={product.image} alt={product.title} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', aspectRatio: '1', background: '#f1f2f3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🖼</div>
      )}
      <div style={{ padding: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#202223', marginBottom: '4px', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {product.title}
        </div>
        {showPrice && product.price && (
          <div style={{ fontSize: '13px', color: '#008060', fontWeight: '700', marginBottom: '6px' }}>
            ${parseFloat(product.price).toFixed(2)}
          </div>
        )}
        {showButton && (
          <div style={{ padding: '6px', background: buttonColor, color: '#fff', borderRadius: '5px', fontSize: '12px', fontWeight: '600', textAlign: 'center' }}>
            {buttonText}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function CollectionBlockSettings({ block, onUpdate }) {
  const [search, setSearch] = useState('');
  const { collections, isLoading: loadingCollections } = useShopifyCollections(search);

  const collectionOptions = [
    { label: '— Select a collection —', value: '' },
    ...collections.map(c => ({
      label: `${c.title} (${c.productsCount} products)`,
      value: c.handle,
    })),
  ];

  return (
    <BlockStack gap="300">
      <TextField
        label="Custom Heading (optional)"
        value={block.heading || ''}
        onChange={v => onUpdate({ heading: v })}
        placeholder="Leave blank to use collection title"
        autoComplete="off"
      />
      <TextField
        label="Search collections"
        value={search}
        onChange={setSearch}
        placeholder="Type to filter…"
        autoComplete="off"
      />
      {loadingCollections ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Spinner size="small" />
          <Text variant="bodySm" tone="subdued">Loading collections…</Text>
        </div>
      ) : (
        <Select
          label="Collection"
          options={collectionOptions}
          value={block.collectionHandle || ''}
          onChange={v => onUpdate({ collectionHandle: v })}
        />
      )}
      <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '12px' }}>
        <Text variant="bodyMd" fontWeight="semibold">Layout</Text>
      </div>
      <Select
        label="Layout Style"
        options={[{ label: 'Grid', value: 'grid' }, { label: 'Horizontal Scroll', value: 'scroll' }]}
        value={block.layout || 'grid'}
        onChange={v => onUpdate({ layout: v })}
      />
      {block.layout !== 'scroll' && (
        <Select
          label="Columns"
          options={[{ label: '2', value: '2' }, { label: '3', value: '3' }, { label: '4', value: '4' }]}
          value={block.columns || '3'}
          onChange={v => onUpdate({ columns: v })}
        />
      )}
      <Select
        label="Max Products"
        options={['4','6','8','12','16'].map(v => ({ label: v, value: v }))}
        value={block.maxProducts || '8'}
        onChange={v => onUpdate({ maxProducts: v })}
      />
      <div style={{ borderTop: '1px solid #e1e3e5', paddingTop: '12px' }}>
        <Text variant="bodyMd" fontWeight="semibold">Display</Text>
      </div>
      <Checkbox label="Show collection title" checked={block.showTitle !== false} onChange={v => onUpdate({ showTitle: v })} />
      <Checkbox label="Show 'View All' link" checked={block.showViewAll !== false} onChange={v => onUpdate({ showViewAll: v })} />
      <Checkbox label="Show price" checked={block.showPrice !== false} onChange={v => onUpdate({ showPrice: v })} />
      <Checkbox label="Show button" checked={block.showButton !== false} onChange={v => onUpdate({ showButton: v })} />
      {block.showButton !== false && (
        <TextField label="Button Text" value={block.buttonText || 'Shop Now'} onChange={v => onUpdate({ buttonText: v })} autoComplete="off" />
      )}
    </BlockStack>
  );
}
