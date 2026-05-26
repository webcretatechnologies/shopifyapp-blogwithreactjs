import { createBlockExtension } from './createBlockExtension';
import { BuyButtonBlockPreview, BuyButtonBlockSettings } from '../../builder/blocks/BuyButtonBlock';

export const LegacyProductCardExtension = createBlockExtension({
  name: 'product',
  title: 'Edit Product Card (Legacy)',
  PreviewComponent: BuyButtonBlockPreview,
  SettingsComponent: BuyButtonBlockSettings,
  defaultAttributes: {
    product: null,
    layout: 'vertical',
    imageSize: '120px',
    maxWidth: '320px',
    showPrice: true,
    showDescription: false,
    showBadge: false,
    badge: 'FEATURED',
    buttonText: 'Add to Cart',
    buttonColor: '#008060',
  }
});

export const LegacyStickyProductExtension = createBlockExtension({
  name: 'product_sidebar',
  title: 'Edit Sticky Product (Legacy)',
  PreviewComponent: BuyButtonBlockPreview,
  SettingsComponent: BuyButtonBlockSettings,
  defaultAttributes: {
    product: null,
    layout: 'vertical',
    imageSize: '120px',
    maxWidth: '320px',
    showPrice: true,
    showDescription: false,
    showBadge: true,
    badge: 'STICKY',
    buttonText: 'Add to Cart',
    buttonColor: '#008060',
  }
});

export const LegacyFeaturedProductExtension = createBlockExtension({
  name: 'featured_product',
  title: 'Edit Featured Product (Legacy)',
  PreviewComponent: BuyButtonBlockPreview,
  SettingsComponent: BuyButtonBlockSettings,
  defaultAttributes: {
    product: null,
    layout: 'horizontal',
    imageSize: '160px',
    maxWidth: '100%',
    showPrice: true,
    showDescription: true,
    showBadge: true,
    badge: 'FEATURED',
    buttonText: 'Buy Now',
    buttonColor: '#008060',
  }
});
