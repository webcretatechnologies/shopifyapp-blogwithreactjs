import { createBlockExtension } from './createBlockExtension';
import { BuyButtonBlockPreview, BuyButtonBlockSettings } from '../../builder/blocks/BuyButtonBlock';

export const BuyButtonExtension = createBlockExtension({
  name: 'buyButton',
  title: 'Edit Buy Button',
  PreviewComponent: BuyButtonBlockPreview,
  SettingsComponent: BuyButtonBlockSettings,
  defaultAttributes: {
    product: null,
    layout: 'horizontal',
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
