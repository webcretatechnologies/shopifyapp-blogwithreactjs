import { Card, Text, Box, InlineStack, BlockStack, Divider, ProgressBar, Icon } from "@shopify/polaris";
import { CartIcon, CreditCardIcon, CheckCircleIcon, CheckIcon } from "@shopify/polaris-icons";

export default function FunnelChart({ funnel = [] }) {
  if (!funnel.length) return null;
  const maxCount = Math.max(...funnel.map((f) => f.count), 1);
  const lastIndex = funnel.length - 1;

  return (
    <div style={{ height: "100%", display: "grid" }}>
    <Card>
      <Box padding="400" minHeight="360px">
        <BlockStack gap="300">
          <Text variant="headingMd" as="h3">Conversion funnel</Text>
          <Divider />
          <BlockStack gap="200">
            {funnel.map((stage, i) => {
              const pct = (stage.count / maxCount) * 100;
              const dropPct =
                i > 0 && funnel[i - 1].count > 0
                  ? ((1 - stage.count / funnel[i - 1].count) * 100).toFixed(1)
                  : null;
              const arrow = i < lastIndex ? "↓" : "";
              const stageIcon = [CartIcon, CreditCardIcon, CheckCircleIcon][i];
              const isLast = i === lastIndex;
              return (
                <div key={stage.stage}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Box
                        background={isLast ? "bg-success-subdued" : i === 0 ? "bg-info-subdued" : "bg-subdued"}
                        borderRadius="200"
                        padding="150"
                      >
                        <Icon source={stageIcon || CheckIcon} tone={isLast ? "success" : i === 0 ? "info" : "subdued"} />
                      </Box>
                      <BlockStack gap="025">
                        <Text variant="bodySm" fontWeight="semibold">
                          {stage.stage}
                        </Text>
                        {dropPct && parseFloat(dropPct) > 0 && (
                          <Text variant="bodyXs" tone="critical">
                            {arrow} {dropPct}% drop
                          </Text>
                        )}
                      </BlockStack>
                    </InlineStack>
                    <Text variant="bodySm" fontWeight="bold">
                      {stage.count.toLocaleString()}
                    </Text>
                  </InlineStack>
                  <div style={{ marginTop: 6 }}>
                    <ProgressBar
                      progress={Math.round(pct)}
                      size="small"
                      tone={isLast ? "success" : i === 0 ? "primary" : "highlight"}
                    />
                  </div>
                </div>
              );
            })}
          </BlockStack>
        </BlockStack>
      </Box>
    </Card>
    </div>
  );
}
