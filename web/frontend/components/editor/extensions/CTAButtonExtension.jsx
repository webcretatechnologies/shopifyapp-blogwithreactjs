import { createBlockExtension } from './createBlockExtension';
import { CTAButtonBlockPreview, CTAButtonBlockSettings } from '../../builder/blocks/CTAButtonBlock';

export const CTAButtonExtension = createBlockExtension({
  name: 'ctaButton',
  title: 'Edit CTA Button',
  PreviewComponent: CTAButtonBlockPreview,
  SettingsComponent: CTAButtonBlockSettings,
  defaultAttributes: {
    text: 'Shop Now',
    url: '',
    align: 'center',
    color: '#008060',
    textColor: '#ffffff',
    size: 'medium',
    borderRadius: '6px',
  }
});
