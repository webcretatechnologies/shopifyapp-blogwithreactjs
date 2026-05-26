import { createBlockExtension } from './createBlockExtension';
import { ProductGridBlockPreview, ProductGridBlockSettings } from '../../builder/blocks/ProductGridBlock';

export const ProductGridExtension = createBlockExtension({
  name: 'productGrid',
  title: 'Edit Product Grid',
  PreviewComponent: ProductGridBlockPreview,
  SettingsComponent: ProductGridBlockSettings,
  defaultAttributes: {
    title: '',
    titleAlign: 'left',
    searchQuery: '',
    manualProducts: [],
    columns: '3',
    maxProducts: '12',
    cardStyle: 'shadow',
    gap: '16px',
    showPrice: true,
    showButton: true,
    buttonText: 'Add to Cart',
    buttonColor: '#008060',
  }
});
