import { useState, useEffect } from "react";
import { Card, Box, Text, BlockStack, InlineStack, ProgressBar, Button, Icon, Divider } from "@shopify/polaris";
import { CheckCircleIcon, XIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { useNavigate } from "react-router-dom";
import { metaRobotsActivateUrl, analyticsTrackerActivateUrl } from "../utils/themeEmbedUtils";
import { APP_NAME } from "../utils/appName";

// Fixed width for the leading icon/number column so every row's title text starts at the exact
// same x-position, regardless of whether that row shows a numbered circle or a checkmark icon.
const LEAD_COLUMN_WIDTH = "28px";

export default function SetupGuide({ shop, isExtensionActive, isMetaRobotsActive, themeSupportsAppEmbeds, hasPosts, onCreatePost }) {
  const navigate = useNavigate();
  const [isDismissed, setIsDismissed] = useState(true); // default true to prevent flicker before useEffect runs
  const [expandedId, setExpandedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [userCollapsedId, setUserCollapsedId] = useState(null);

  useEffect(() => {
    // sessionStorage (not localStorage): a dismissed-but-still-incomplete requirement resurfaces
    // on the merchant's next admin session instead of staying hidden forever.
    setIsDismissed(sessionStorage.getItem('blogger_setup_dismissed') === '1');
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem('blogger_setup_dismissed', '1');
    setIsDismissed(true);
  };

  // A theme that doesn't support app embeds at all can't be fixed by clicking "enable" — the
  // toggle doesn't exist for it. Steer the merchant toward switching themes instead.
  const embedUnsupportedCopy = themeSupportsAppEmbeds === false;

  const steps = [
    {
      id: 1,
      title: `Activate ${APP_NAME} Analytics on your storefront`,
      description: embedUnsupportedCopy
        ? "Your current theme doesn't support app embeds (requires Online Store 2.0). Switch to an Online Store 2.0 theme to enable live visitor tracking."
        : "Enable the Blog Analytics Tracker App Embed in your Theme Editor to start collecting live visitor data.",
      actionLabel: embedUnsupportedCopy ? "Browse themes" : "Enable tracking",
      action: () => {
        window.open(
          embedUnsupportedCopy
            ? `https://${shop}/admin/themes`
            // Pre-activates the block via activateAppId, same trick as meta robots below — the
            // merchant lands with the toggle already on and just clicks Save, instead of having
            // to find "Blog Analytics Tracker" among every other app embed themselves.
            : analyticsTrackerActivateUrl(shop),
          '_blank'
        );
      },
      isCompleted: isExtensionActive
    },
    {
      id: 2,
      title: "Activate Meta Robots on your storefront",
      description: embedUnsupportedCopy
        ? "Your current theme doesn't support app embeds (requires Online Store 2.0), so per-article Index/Noindex settings can't take effect yet."
        : "Enable the Blog Meta Robots app embed so each article's Index/Noindex setting takes effect on the live page.",
      actionLabel: embedUnsupportedCopy ? "Browse themes" : "Activate now",
      action: () => {
        window.open(embedUnsupportedCopy ? `https://${shop}/admin/themes` : metaRobotsActivateUrl(shop), '_blank');
      },
      isCompleted: isMetaRobotsActive
    },
    {
      id: 3,
      title: "Create your first blog post",
      description: "Write and publish your first article to start engaging with your customers.",
      actionLabel: "Create post",
      action: () => {
        if (onCreatePost) onCreatePost();
        else navigate("/posts/new");
      },
      isCompleted: hasPosts
    }
  ];

  const completedSteps = steps.filter(s => s.isCompleted).length;
  const progress = (completedSteps / steps.length) * 100;

  // The first not-yet-completed step auto-expands; the merchant can click any other incomplete
  // step to switch focus (accordion — one step open at a time, matching Shopify's own setup
  // guide behavior), or collapse the active one to scan titles only.
  const firstIncomplete = steps.find((s) => !s.isCompleted)?.id ?? null;
  const activeId = expandedId ?? (userCollapsedId === firstIncomplete ? null : firstIncomplete);

  const toggleStep = (step) => {
    if (step.isCompleted) return;
    if (activeId === step.id) {
      setUserCollapsedId(step.id);
      setExpandedId(null);
    } else {
      setUserCollapsedId(null);
      setExpandedId(step.id);
    }
  };

  // Hide once dismissed or fully completed — a finished guide is just clutter.
  if (isDismissed || completedSteps === steps.length) return null;

  return (
    <BlockStack gap="300">
      <Text variant="headingLg" as="h2">Get started with Blogger React!</Text>
      {/* One flat card containing the whole list, rows separated by hairline Dividers — matches
          Shopify's own setup-guide composition. The previous version nested a bordered, shadowed
          Box for every row inside the outer Card, which read as "boxes stacked inside a box"
          rather than one cohesive list. */}
      <Card padding="0">
        <Box padding="400" paddingBlockEnd="300">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h3">Setup guide</Text>
              <InlineStack gap="300" blockAlign="center">
                <Text variant="bodySm" tone="subdued">{completedSteps} of {steps.length} tasks complete</Text>
                <Button variant="plain" icon={XIcon} onClick={handleDismiss} accessibilityLabel="Dismiss setup guide" />
              </InlineStack>
            </InlineStack>
            <ProgressBar progress={progress} size="small" tone="primary" />
          </BlockStack>
        </Box>

        <BlockStack gap="0">
          {steps.map((step, index) => {
            const isActive = !step.isCompleted && activeId === step.id;
            const isPast = step.isCompleted;
            const isClickable = !isPast;

            return (
              <div key={step.id}>
                {index > 0 && <Divider />}
                <div
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onClick={isClickable ? () => toggleStep(step) : undefined}
                  onKeyDown={
                    isClickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleStep(step);
                          }
                        }
                      : undefined
                  }
                  onMouseEnter={() => isClickable && setHoveredId(step.id)}
                  onMouseLeave={() => setHoveredId((id) => (id === step.id ? null : id))}
                  style={{ cursor: isClickable ? "pointer" : "default", outline: "none" }}
                >
                  <Box
                    padding="400"
                    background={
                      isPast ? undefined : hoveredId === step.id || isActive ? 'bg-surface-secondary' : undefined
                    }
                  >
                    <InlineStack align="space-between" blockAlign="start" wrap={false} gap="300">
                      <InlineStack align="start" gap="300" blockAlign="start" wrap={false}>
                        <Box minWidth={LEAD_COLUMN_WIDTH} paddingBlockStart="025">
                          <InlineStack align="center" blockAlign="center">
                            {isPast ? (
                              <Icon source={CheckCircleIcon} tone="success" />
                            ) : (
                              <Box
                                background={isActive ? 'bg-fill-inverse' : 'bg-fill-tertiary'}
                                borderRadius="full"
                                minWidth="24px"
                                minHeight="24px"
                              >
                                <InlineStack align="center" blockAlign="center">
                                  <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Text
                                      variant="bodySm"
                                      fontWeight="bold"
                                      tone={isActive ? 'text-inverse' : undefined}
                                    >
                                      {step.id}
                                    </Text>
                                  </div>
                                </InlineStack>
                              </Box>
                            )}
                          </InlineStack>
                        </Box>

                        <BlockStack gap="200">
                          <Text
                            variant="bodyMd"
                            as="h4"
                            fontWeight={isActive ? "semibold" : "medium"}
                            tone={isPast ? "subdued" : undefined}
                          >
                            {step.title}
                          </Text>

                          {isActive && (
                            <BlockStack gap="300">
                              <Text variant="bodySm" tone="subdued">{step.description}</Text>
                              <div>
                                <Button
                                  variant="primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    step.action();
                                  }}
                                >
                                  {step.actionLabel}
                                </Button>
                              </div>
                            </BlockStack>
                          )}
                        </BlockStack>
                      </InlineStack>

                      {isClickable && (
                        <Box paddingBlockStart="025">
                          <Icon source={isActive ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
                        </Box>
                      )}
                    </InlineStack>
                  </Box>
                </div>
              </div>
            );
          })}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
