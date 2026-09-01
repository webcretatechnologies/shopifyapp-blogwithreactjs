import { Badge, BlockStack, InlineGrid, InlineStack, Box, ProgressBar, Text } from "@shopify/polaris";

/**
 * The usage meters inside the Plan usage card — one per plan cap (articles, saved templates).
 *
 * Shared by the dashboard and the Plans & Billing page so the two can't drift: same wording,
 * same maths, same "unlimited means ∞ and an empty bar" convention. Laid out side by side in
 * one compact row rather than stacked grey panels, which is what let a second cap be added
 * without the card growing taller.
 *
 * A meter is `{ label, used, limit }`, where `limit: null` means unlimited.
 */

const tone = (atLimit, nearLimit) => (atLimit ? "critical" : nearLimit ? "warning" : "success");

function UsageMeter({ label, used = 0, limit = null, withDivider = false }) {
  const unlimited = limit == null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const atLimit = !unlimited && used >= limit;
  const nearLimit = !unlimited && !atLimit && pct >= 80;

  return (
    <Box
      borderInlineStartWidth={withDivider ? "025" : "0"}
      borderColor="border"
      paddingInlineStart={withDivider ? "500" : "0"}
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {label}
          </Text>
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {used}
            </Text>
            {unlimited ? (
              <Badge>Unlimited</Badge>
            ) : (
              <Badge tone={atLimit ? "critical" : nearLimit ? "warning" : undefined}>
                {`of ${limit}`}
              </Badge>
            )}
          </InlineStack>
        </InlineStack>

        <ProgressBar progress={pct} size="small" tone={tone(atLimit, nearLimit)} />

        <InlineStack align="space-between" blockAlign="baseline" gap="200">
          <Text as="span" variant="bodySm">
            <Text as="span" fontWeight="semibold">
              {used}
            </Text>
            <Text as="span" tone="subdued">
              {unlimited ? " used" : atLimit ? " — limit reached" : ` ${pct}% used`}
            </Text>
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {unlimited ? "∞" : `${Math.max(0, limit - used)} left`}
          </Text>
        </InlineStack>
      </BlockStack>
    </Box>
  );
}

export default function PlanUsageMeters({ meters = [] }) {
  const shown = meters.filter(Boolean);
  if (shown.length === 0) return null;

  return (
    // Three meters sit in one row on a wide card; two columns on tablet would strand the third
    // on a row of its own, so the count drives the breakpoints rather than a fixed 2.
    <InlineGrid
      columns={{ xs: 1, sm: Math.min(shown.length, 2), md: Math.min(shown.length, 3) }}
      gap="500"
    >
      {shown.map((meter, i) => (
        <UsageMeter key={meter.label} {...meter} withDivider={i > 0} />
      ))}
    </InlineGrid>
  );
}
