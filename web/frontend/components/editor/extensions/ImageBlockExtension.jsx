import { createBlockExtension } from './createBlockExtension';
import { ImageBlockPreview, ImageBlockSettings } from '../../builder/blocks/ImageBlock';

export const ImageBlockExtension = createBlockExtension({
  name: 'imageBlock',
  title: 'Edit Image Block',
  PreviewComponent: ImageBlockPreview,
  SettingsComponent: ImageBlockSettings,
  defaultAttributes: {
    src: '',
    alt: '',
    caption: '',
    width: '100%',
    align: 'center',
    borderRadius: '0px',
    linkUrl: '',
  }
});
