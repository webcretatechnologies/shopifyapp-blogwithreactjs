import { Banner, Text, Button } from "@shopify/polaris";

/**
 * Contextual "you must configure this outside our settings page" banner for a theme app embed
 * requirement. Shown at the point where the missing configuration actually causes visible
 * confusion (e.g. the Analytics Revenue card, the Settings SEO tab) rather than only in a
 * dismissible onboarding checklist a merchant may never see again.
 *
 * Renders nothing once `active` is true — only actionable states are worth screen space.
 */
export default function EmbedRequirementBanner({
  active,
  themeSupportsAppEmbeds,
  activateUrl,
  featureName,
  whatBreaks,
}) {
  if (active) return null;

  if (!themeSupportsAppEmbeds) {
    return (
      <Banner tone="critical" title={`${featureName} isn't available on your current theme`}>
        <Text as="p">
          Your theme doesn't support app embeds (this requires an Online Store 2.0 theme). {whatBreaks}
          {" "}Switching to an Online Store 2.0 theme will make this available.
        </Text>
      </Banner>
    );
  }

  return (
    <Banner tone="warning" title={`${featureName} requires one-time setup in your theme`}>
      <Text as="p">{whatBreaks} Enable the app embed in your theme editor to turn this on.</Text>
      <div style={{ marginTop: "8px" }}>
        <Button onClick={() => window.open(activateUrl, "_blank")}>Enable now</Button>
      </div>
    </Banner>
  );
}
