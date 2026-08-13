import { Card, Text, Box, InlineStack, BlockStack, Divider } from "@shopify/polaris";

export default function CountryBreakdown({ countries = [] }) {
  if (!countries.length) return null;
  const total = countries.reduce((s, c) => s + c.count, 0);

  return (
    <div style={{ height: "100%", display: "grid" }}>
    <Card>
      <Box padding="400" minHeight="240px">
        <BlockStack gap="300">
          <Text variant="headingMd" as="h3">Top countries</Text>
          <Divider />
          {countries.slice(0, 8).map(({ code, count }) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
            const flag = code
              ? code
                  .toUpperCase()
                  .replace(/./g, (c) =>
                    String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)
                  )
              : "🌐";
            return (
              <InlineStack key={code} align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: "16px" }}>{flag}</span>
                  <Text variant="bodySm">{code || "Unknown"}</Text>
                </InlineStack>
                <Text variant="bodySm" fontWeight="semibold">
                  {count.toLocaleString()} ({pct}%)
                </Text>
              </InlineStack>
            );
          })}
        </BlockStack>
      </Box>
    </Card>
    </div>
  );
}
