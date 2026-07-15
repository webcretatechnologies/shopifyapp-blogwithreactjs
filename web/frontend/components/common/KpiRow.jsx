import {
  Card,
  Box,
  InlineGrid,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  SkeletonDisplayText,
} from "@shopify/polaris";
import { ArrowUpIcon, ArrowDownIcon } from "@shopify/polaris-icons";

function TrendBadge({ trend }) {
  if (trend === undefined || trend === null) return null;
  if (trend === 0) return <Badge>0%</Badge>;
  const up = trend > 0;
  return (
    <Badge tone={up ? "success" : "critical"} icon={up ? ArrowUpIcon : ArrowDownIcon}>
      {`${Math.abs(trend)}%`}
    </Badge>
  );
}

/**
 * Flat KPI summary row — a single Card divided into equal-width cells
 * (label + bold value + optional trend badge), separated by vertical
 * dividers. Follows Shopify's metrics-card composition for app homepages.
 *
 * `items[i].trend` — percent change vs. the previous period. Pass `null`
 * (or omit) when there is no meaningful baseline to compare against.
 */
export default function KpiRow({ items = [], loading = false }) {
  return (
    <Card padding="0">
      <InlineGrid columns={{ xs: 2, md: items.length || 1 }} gap="0">
        {items.map((item, i) => (
          <Box
            key={item.label}
            padding="400"
            borderColor="border"
            borderInlineStartWidth={i === 0 ? "0" : "025"}
          >
            <BlockStack gap="150">
              <Text variant="bodySm" tone="subdued">
                {item.label}
              </Text>
              {loading ? (
                <SkeletonDisplayText size="small" />
              ) : (
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  <Text variant="headingXl" as="p" fontWeight="bold">
                    {item.value ?? "—"}
                  </Text>
                  <TrendBadge trend={item.trend} />
                </InlineStack>
              )}
            </BlockStack>
          </Box>
        ))}
      </InlineGrid>
    </Card>
  );
}
