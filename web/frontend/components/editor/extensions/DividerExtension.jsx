import { createBlockExtension } from './createBlockExtension';
import { DividerBlockPreview, DividerBlockSettings } from '../blocks/DividerBlock';

export const DividerExtension = createBlockExtension({
  name: 'dividerBlock',
  title: 'Edit Divider',
  PreviewComponent: DividerBlockPreview,
  SettingsComponent: DividerBlockSettings,
  defaultAttributes: {
    style: 'solid',
    thickness: '1px',
    color: '#e1e3e5',
    margin: '20px',
  }
});
