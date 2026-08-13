import { Card, Text, Box, InlineStack, BlockStack, Divider, ProgressBar, Icon } from "@shopify/polaris";
import { ViewIcon, CartIcon, CreditCardIcon, CheckCircleIcon, CheckIcon } from "@shopify/polaris-icons";

export default function FunnelChart({ funnel = [] }) {
  if (!funnel.length) return null;
  const maxCount = Math.max(...funnel.map((f) => f.count), 1);

  return (
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
              const arrow = i < funnel.length - 1 ? "↓" : "";
              const stageIcon = [ViewIcon, CartIcon, CreditCardIcon, CheckCircleIcon][i];
              return (
                <div key={stage.stage}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Box
                        background={i === 3 ? "bg-success-subdued" : i === 0 ? "bg-info-subdued" : "bg-subdued"}
                        borderRadius="200"
                        padding="150"
                      >
                        <Icon source={stageIcon || CheckIcon} tone={i === 3 ? "success" : i === 0 ? "info" : "subdued"} />
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
                      tone={i === 3 ? "success" : i === 0 ? "primary" : "highlight"}
                    />
                  </div>
                </div>
              );
            })}
          </BlockStack>
        </BlockStack>
      </Box>
    </Card>
  );
}
