import { createBlockExtension } from './createBlockExtension';
import { ProductGridBlockPreview, ProductGridBlockSettings } from '../blocks/ProductGridBlock';

export const LegacyProductSwitcherExtension = createBlockExtension({
  name: 'product_switcher',
  title: 'Edit Product Switcher (Legacy)',
  PreviewComponent: ProductGridBlockPreview,
  SettingsComponent: ProductGridBlockSettings,
  defaultAttributes: {
    title: 'Choose Product',
    titleAlign: 'center',
    searchQuery: '',
    manualProducts: [],
    columns: '3',
    maxProducts: '3',
    cardStyle: 'border',
    gap: '16px',
    showPrice: true,
    showButton: true,
    buttonText: 'Select',
    buttonColor: '#202223',
  }
});

export const LegacyProductSliderExtension = createBlockExtension({
  name: 'product_slider',
  title: 'Edit Product Slider (Legacy)',
  PreviewComponent: ProductGridBlockPreview,
  SettingsComponent: ProductGridBlockSettings,
  defaultAttributes: {
    title: 'Featured Products',
    titleAlign: 'left',
    searchQuery: '',
    manualProducts: [],
    columns: '4',
    maxProducts: '12',
    cardStyle: 'shadow',
    gap: '16px',
    showPrice: true,
    showButton: true,
    buttonText: 'Add to Cart',
    buttonColor: '#008060',
  }
});
