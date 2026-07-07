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

// Note: there is no legacy product_slider extension here — that name is
// owned by the current ProductSliderExtension.jsx. A previous duplicate
// extension of the same name existed in this file but was never registered
// in TiptapEditor.jsx; it was removed since a second Node.create() with an
// identical `name` would collide with the real one the moment both got
// imported.
