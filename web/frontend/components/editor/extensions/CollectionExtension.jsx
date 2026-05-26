import { createBlockExtension } from './createBlockExtension';
import { CollectionBlockPreview, CollectionBlockSettings } from '../../builder/blocks/CollectionBlock';

export const CollectionExtension = createBlockExtension({
  name: 'collection',
  title: 'Edit Collection',
  PreviewComponent: CollectionBlockPreview,
  SettingsComponent: CollectionBlockSettings,
  defaultAttributes: {
    heading: '',
    collectionHandle: '',
    layout: 'grid',
    columns: '3',
    maxProducts: '8',
    showTitle: true,
    showViewAll: true,
    showPrice: true,
    showButton: true,
    buttonText: 'Shop Now',
    buttonColor: '#008060',
  }
});
