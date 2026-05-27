import { createBlockExtension } from './createBlockExtension';
import { ProductSliderBlockPreview, ProductSliderBlockSettings } from '../blocks/ProductSliderBlock';

export const ProductSliderExtension = createBlockExtension({
  name: 'product_slider',
  title: 'Edit Product Slider',
  PreviewComponent: ProductSliderBlockPreview,
  SettingsComponent: ProductSliderBlockSettings,
  defaultAttributes: {
    title: '',
    titleAlign: 'left',
    searchQuery: '',
    manualProducts: [],
    cardStyle: 'shadow',
    gap: '16px',
    showPrice: true,
    showButton: true,
    buttonText: 'Add to Cart',
    buttonColor: '#008060',
  }
});
