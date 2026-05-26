import { Card, Text, InlineStack, BlockStack, Box } from "@shopify/polaris";

export default function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendUp,
  color = "#008060",
}) {
  return (
    <Card padding="0">
      <Box padding="400">
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <Text variant="bodySm" tone="subdued">
              {title}
            </Text>
            <Text variant="heading2xl" as="p" fontWeight="bold">
              {value ?? "—"}
            </Text>
            {subtitle && (
              <Text variant="bodySm" tone="subdued">
                {subtitle}
              </Text>
            )}
            {trend !== undefined && (
              <InlineStack gap="100" blockAlign="center">
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: trendUp ? "#008060" : "#d82c0d",
                    backgroundColor: trendUp ? "#f0fdf4" : "#fff4f4",
                    padding: "2px 8px",
                    borderRadius: "12px",
                  }}
                >
                  {trendUp ? "↑" : "↓"} {Math.abs(trend)}%
                </span>
                <Text variant="bodySm" tone="subdued">
                  vs last month
                </Text>
              </InlineStack>
            )}
          </BlockStack>
          {icon && (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "10px",
                backgroundColor: `${color}18`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          )}
        </InlineStack>
      </Box>
    </Card>
  );
}
