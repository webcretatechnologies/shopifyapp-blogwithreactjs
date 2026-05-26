import { Card, Text, Box, BlockStack, InlineStack, ProgressBar, Divider } from "@shopify/polaris";

const SOURCE_LABELS = {
  google: "Google",
  facebook: "Facebook",
  twitter: "Twitter / X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  pinterest: "Pinterest",
  youtube: "YouTube",
  search: "Other Search",
  email: "Email",
  direct: "Direct",
  internal: "Internal",
  other: "Other",
};

const SOURCE_COLORS = {
  google: "#4285F4",
  facebook: "#1877F2",
  twitter: "#1DA1F2",
  linkedin: "#0A66C2",
  instagram: "#E4405F",
  pinterest: "#BD081C",
  youtube: "#FF0000",
  search: "#6b7280",
  email: "#EA4335",
  direct: "#008060",
  internal: "#9ca3af",
  other: "#6d7175",
};

export default function TopSources({ sources = [] }) {
  const total = sources.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <Text variant="headingMd">Traffic Sources</Text>
          {sources.length === 0 ? (
            <Text tone="subdued" variant="bodySm">
              No traffic data yet.
            </Text>
          ) : (
            <BlockStack gap="200">
              {sources.map(({ name, count }) => {
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={name}>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor:
                              SOURCE_COLORS[name] || "#6d7175",
                          }}
                        />
                        <Text variant="bodySm">
                          {SOURCE_LABELS[name] || name}
                        </Text>
                      </InlineStack>
                      <Text variant="bodySm" fontWeight="semibold">
                        {count.toLocaleString()} ({Math.round(pct)}%)
                      </Text>
                    </InlineStack>
                    <div style={{ marginTop: 4 }}>
                      <ProgressBar
                        progress={Math.round(pct)}
                        size="small"
                        tone={pct > 50 ? "primary" : "subdued"}
                      />
                    </div>
                  </div>
                );
              })}
            </BlockStack>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}
