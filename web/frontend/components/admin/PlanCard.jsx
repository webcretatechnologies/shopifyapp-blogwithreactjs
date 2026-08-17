import { Card, Box, BlockStack, InlineStack, Text, Badge, Button } from "@shopify/polaris";
import { isLimitKey, planFeatureBucket, CUMULATIVE_TIER_BULLETS } from "./planLimitKeys";

/**
 * One SubscriptionPlan rendered as a card: name/slug, price/interval, trial period, live
 * subscriber count, active/inactive status, and the three grouped edit actions (Edit Core / Sync
 * Features / Sync Limits) plus a destructive Delete action — matches the reference "B2B Local"
 * super admin's plan-card pattern, backed by data that's actually live-synced to the merchant
 * billing page (not just cosmetically claimed).
 */
export default function PlanCard({ plan, features, onEditCore, onSyncFeatures, onSyncLimits, onDelete }) {
  const bucket = planFeatureBucket(plan.name);
  const bucketFeatures = features.filter((f) => f.plan === bucket);
  // Matches SyncFeaturesModal's own bullet count exactly (CUMULATIVE_TIER_BULLETS for this
  // bucket) — not the raw DB row count, so the badge and the modal it opens always agree.
  const featureCount = (CUMULATIVE_TIER_BULLETS[bucket] || []).length;
  const limitCount = bucketFeatures.filter((f) => isLimitKey(f.featureKey)).length;

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="050">
          <Text as="h3" variant="headingMd">{plan.title}</Text>
          <Text tone="subdued" variant="bodySm">slug: {plan.name}</Text>
        </BlockStack>

        {plan.description && (
          <Text tone="subdued" variant="bodySm">{plan.description}</Text>
        )}

        <InlineStack gap="100" blockAlign="baseline">
          <Text as="span" variant="heading2xl">
            ${Number(plan.price).toFixed(2)}
          </Text>
          <Text tone="subdued" variant="bodyMd">
            / {plan.interval === "ANNUAL" ? "Year" : "30 Days"}
          </Text>
        </InlineStack>

        <BlockStack gap="150">
          <Text variant="bodySm">Trial period: <Text as="span" fontWeight="semibold">{plan.trialDays || 0} Days</Text></Text>
          <Text variant="bodySm">Subscribed shops: <Text as="span" fontWeight="semibold">{plan.subscriberCount ?? 0} stores</Text></Text>
          <InlineStack gap="150" blockAlign="center">
            <Text variant="bodySm">Status:</Text>
            <Badge tone={plan.isActive ? "success" : "critical"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
          </InlineStack>
        </BlockStack>

        <Box paddingBlockStart="200">
          <BlockStack gap="200">
            <InlineStack gap="200" wrap>
              <Button onClick={() => onEditCore(plan)}>Edit Core</Button>
              <Button onClick={() => onSyncFeatures(plan)}>Sync Features ({featureCount})</Button>
              <Button onClick={() => onSyncLimits(plan)}>Sync Limits ({limitCount})</Button>
            </InlineStack>
            <Button variant="plain" tone="critical" onClick={() => onDelete(plan)}>
              Delete Billing Tier
            </Button>
          </BlockStack>
        </Box>
      </BlockStack>
    </Card>
  );
}
