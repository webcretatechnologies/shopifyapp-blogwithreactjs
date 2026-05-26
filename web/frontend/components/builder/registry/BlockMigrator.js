/**
 * BlockMigrator.js
 *
 * Upgrades legacy blocks to the new componentRegistry schema.
 * This runs automatically when posts are loaded from the database.
 */
import { genBlockId } from '../../../stores/editorStore';

export function migrateBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];

  return blocks.map(block => {
    // Clone to avoid mutating original
    let upgraded = { ...block };

    // 1. Ensure ID exists
    if (!upgraded.id) {
      upgraded.id = genBlockId();
    }

    // 2. Migrate legacy 'product' to 'buy_button'
    if (upgraded.type === 'product') {
      upgraded = {
        id: upgraded.id,
        type: 'buy_button',
        version: 1,
        layout: 'horizontal',
        buttonText: 'Add to Cart',
        buttonColor: '#008060',
        imageSize: '80px', // legacy products used small images
        showPrice: true,
        showDescription: false,
        showBadge: false,
        product: {
          title: upgraded.title || '',
          handle: upgraded.handle || '',
          image: upgraded.image || '',
          price: upgraded.price || '',
          shopifyProductId: upgraded.shopifyProductId || '',
          variantId: upgraded.variantId || '',
        }
      };
    }

    // 3. Migrate legacy 'product_slider' to 'product_grid' (with scroll layout if possible, or just a grid)
    if (upgraded.type === 'product_slider') {
      upgraded = {
        id: upgraded.id,
        type: 'product_grid',
        version: 1,
        title: upgraded.title || 'Featured Products',
        columns: '3',
        maxProducts: '12',
        cardStyle: 'border',
        gap: '16px',
        showPrice: true,
        showButton: true,
        buttonText: 'Add to Cart',
        buttonColor: '#008060',
        manualProducts: (upgraded.products || []).map(p => ({
          title: p.title || '',
          handle: p.handle || '',
          image: p.image || '',
          price: p.price || '',
          shopifyProductId: p.shopifyProductId || '',
          variantId: p.variantId || '',
        })),
        searchQuery: '',
      };
    }

    return upgraded;
  });
}
