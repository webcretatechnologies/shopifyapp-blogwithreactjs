import { createBlockExtension } from './createBlockExtension';
import { VideoBlockPreview, VideoBlockSettings } from '../blocks/VideoBlock';

export const VideoExtension = createBlockExtension({
  name: 'videoBlock',
  title: 'Edit Video Block',
  PreviewComponent: VideoBlockPreview,
  SettingsComponent: VideoBlockSettings,
  defaultAttributes: {
    url: '',
    caption: '',
    aspectRatio: '56.25%',
    maxWidth: '100%',
  }
});
