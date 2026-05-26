import { createBlockExtension } from './createBlockExtension';
import { SpacerBlockPreview, SpacerBlockSettings } from '../blocks/SpacerBlock';

export const SpacerExtension = createBlockExtension({
  name: 'spacerBlock',
  title: 'Edit Spacer Block',
  PreviewComponent: SpacerBlockPreview,
  SettingsComponent: SpacerBlockSettings,
  defaultAttributes: {
    height: '40px',
  }
});
