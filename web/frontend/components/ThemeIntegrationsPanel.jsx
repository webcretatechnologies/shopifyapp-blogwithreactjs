/**
 * Settings → Theme Integrations
 *
 * One-click deep links into the theme editor with the exact app embed
 * pre-activated (Shopify activateAppId). Merchant only clicks Save.
 */
import { Banner, Badge, BlockStack, Button, Card, Divider, InlineStack, Text, Spinner } from "@shopify/polaris";
import { APP_NAME } from "../utils/appName";
import {
  analyticsTrackerActivateUrl,
  browseThemesUrl,
  metaRobotsActivateUrl,
} from "../utils/themeEmbedUtils";

function openThemeEmbed(url) {
  if (!url || url === "#") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function IntegrationRow({ title, description, installed, unsupported, shop, embedUrl }) {
  return (
    <InlineStack align="space-between" blockAlign="center" wrap gap="300">
      <BlockStack gap="050">
        <Text as="h3" variant="headingSm">
          {title}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {description}
        </Text>
      </BlockStack>
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        {unsupported ? (
          <Badge tone="critical">Unavailable</Badge>
        ) : installed ? (
          <Badge tone="success">Installed</Badge>
        ) : (
          <Badge tone="attention">Action required</Badge>
        )}
        {unsupported ? (
          <Button onClick={() => openThemeEmbed(browseThemesUrl(shop))}>Browse themes</Button>
        ) : installed ? (
          <Button onClick={() => openThemeEmbed(embedUrl)}>Open in Theme</Button>
        ) : (
          <Button variant="primary" onClick={() => openThemeEmbed(embedUrl)}>
            Enable in Theme
          </Button>
        )}
      </InlineStack>
    </InlineStack>
  );
}

export default function ThemeIntegrationsPanel({
  shop = "",
  analyticsActive = null,
  metaRobotsActive = null,
  themeSupportsAppEmbeds = true,
  isChecking = false,
}) {
  const unsupported = themeSupportsAppEmbeds === false;
  const checking = isChecking || analyticsActive === null || metaRobotsActive === null;
  const analyticsUrl = analyticsTrackerActivateUrl(shop);
  const metaUrl = metaRobotsActivateUrl(shop);

  return (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">
        Theme Integrations
      </Text>

      <Banner tone="info">
        Click <Text as="span" fontWeight="semibold">Enable in Theme</Text> to open the Theme
        Editor with that embed already selected and turned on for preview — then click{" "}
        <Text as="span" fontWeight="semibold">Save</Text>. No searching through App embeds.
      </Banner>

      {unsupported && (
        <Banner tone="critical" title="Your theme doesn't support app embeds">
          App embeds require an Online Store 2.0 theme. Switch themes to enable analytics tracking
          and per-article meta robots controls.
        </Banner>
      )}

      <Card>
        {checking && !unsupported ? (
          <InlineStack gap="200" blockAlign="center">
            <Spinner size="small" />
            <Text as="p" variant="bodyMd" tone="subdued">
              Scanning active theme…
            </Text>
          </InlineStack>
        ) : (
          <BlockStack gap="300">
            <IntegrationRow
              title={`${APP_NAME} Analytics Tracker`}
              description="Tracks live blog views, referrers, and product attribution. Also powers blog listing layouts on the storefront."
              installed={!!analyticsActive}
              unsupported={unsupported}
              shop={shop}
              embedUrl={analyticsUrl}
            />
            <Divider />
            <IntegrationRow
              title="Blog Meta Robots"
              description="Applies each article's Index/Noindex and Follow/Nofollow settings on the live page."
              installed={!!metaRobotsActive}
              unsupported={unsupported}
              shop={shop}
              embedUrl={metaUrl}
            />
          </BlockStack>
        )}
      </Card>
    </BlockStack>
  );
}
