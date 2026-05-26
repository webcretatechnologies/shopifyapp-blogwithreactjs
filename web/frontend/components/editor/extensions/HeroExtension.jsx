import { createBlockExtension } from './createBlockExtension';
import { HeroBlockPreview, HeroBlockSettings } from '../blocks/HeroBlock';

export const HeroExtension = createBlockExtension({
  name: 'heroBlock',
  title: 'Edit Hero Block',
  PreviewComponent: HeroBlockPreview,
  SettingsComponent: HeroBlockSettings,
  defaultAttributes: {
    heading: '',
    subheading: '',
    backgroundImage: '',
    backgroundOverlay: true,
    overlayColor: '#000000',
    overlayOpacity: 0.4,
    align: 'center',
    minHeight: '400px',
    textColor: '#ffffff',
    showCta: true,
    ctaText: '',
    ctaUrl: '/',
    ctaColor: '#008060',
    ctaTextColor: '#ffffff',
  }
});
