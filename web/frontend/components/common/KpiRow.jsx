import {
  Card,
  Box,
  InlineGrid,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  SkeletonDisplayText,
  Icon,
  Link,
} from "@shopify/polaris";
import { ArrowUpIcon, ArrowDownIcon, LockIcon } from "@shopify/polaris-icons";
import { useNavigate } from "react-router-dom";

function TrendBadge({ trend }) {
  if (trend === undefined || trend === null) return null;
  if (trend === 0) return <Badge>0%</Badge>;
  const up = trend > 0;
  // A % change against a very small baseline (e.g. 4 views -> 102 views = +2450%) is
  // mathematically correct but reads as broken/noisy on a dashboard — cap the displayed value
  // rather than showing four-digit trend badges.
  const magnitude = Math.abs(trend);
  const displayValue = magnitude > 999 ? "999+" : magnitude;
  return (
    <Badge tone={up ? "success" : "critical"} icon={up ? ArrowUpIcon : ArrowDownIcon}>
      {`${displayValue}%`}
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
 *
 * `items[i].locked` — blurs just that cell's value (keeping the label and the card's overall
 * shape intact, unlike wrapping the whole row in a card-level overlay) with a small "Upgrade"
 * link underneath. Deliberately not the full LockedOverlay treatment here — a floating card with
 * its own button inside a single narrow grid column would overflow/crowd its neighbors, exactly
 * the failure mode UpgradePrompt.jsx's docblock documents from an earlier attempt.
 *
 * `items[i].onClick` — makes just that cell clickable (e.g. Dashboard's "3 drafts" tile linking
 * to the filtered post list), without changing the row's visual style — this is deliberately the
 * one KPI presentation used everywhere in the app (Analytics, Dashboard, per-post analytics), so
 * a clickable variant stays a style prop here rather than a separately-styled component.
 */
export default function KpiRow({ items = [], loading = false }) {
  const navigate = useNavigate();
  return (
    <Card padding="0">
      <InlineGrid columns={{ xs: 2, md: items.length || 1 }} gap="0">
        {items.map((item, i) => (
          <div
            key={item.label}
            {...(item.onClick
              ? {
                  role: "button",
                  tabIndex: 0,
                  onClick: item.onClick,
                  onKeyDown: (e) => e.key === "Enter" && item.onClick(),
                  style: { cursor: "pointer" },
                }
              : {})}
          >
          <Box
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
              ) : item.locked ? (
                <BlockStack gap="050">
                  <div
                    style={{
                      filter: "blur(4px)",
                      WebkitFilter: "blur(4px)",
                      userSelect: "none",
                      lineHeight: 1,
                    }}
                    aria-hidden="true"
                  >
                    <Text variant="headingXl" as="p" fontWeight="bold">
                      {item.value ?? "—"}
                    </Text>
                  </div>
                  <InlineStack gap="100" blockAlign="center" wrap={false}>
                    <span style={{ display: "flex", width: "14px", height: "14px" }}>
                      <Icon source={LockIcon} tone="subdued" />
                    </span>
                    <Link removeUnderline onClick={() => navigate("/plans")}>
                      <Text variant="bodySm">Upgrade</Text>
                    </Link>
                  </InlineStack>
                </BlockStack>
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
          </div>
        ))}
      </InlineGrid>
    </Card>
  );
}
