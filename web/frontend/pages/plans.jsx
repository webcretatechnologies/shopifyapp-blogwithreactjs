import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Badge,
  Grid,
  Divider,
  List,
} from "@shopify/polaris";
import { useState, useEffect } from "react";

export default function Plans() {
  const [activePlan, setActivePlan] = useState("");
  const [dynamicPlans, setDynamicPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch active plan
    fetch("/api/billing/check")
      .then((res) => res.json())
      .then((data) => {
        setActivePlan(data.activePlan || "free");
      });

    // Fetch dynamic plans
    fetch("/api/billing/plans")
      .then((res) => res.json())
      .then((data) => {
        setDynamicPlans(data.plans || []);
        setIsLoading(false);
      });
  }, []);

  const handleSubscribe = async (planName) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/billing/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planName }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.confirmationUrl) {
          // Redirect the top-level frame to the confirmation URL
          window.open(data.confirmationUrl, "_top");
        } else if (data.isFree) {
          setActivePlan("free");
          setIsLoading(false);
        }
      } else {
        const errorData = await response.json();
        console.error("Failed to request subscription:", errorData);
        alert(errorData.error || "Failed to process subscription.");
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  return (
    <Page title="Plans & Billing">
      <BlockStack gap="500">
        <Text variant="bodyLg" tone="subdued">
          Choose the best plan that fits your business needs. You can upgrade or downgrade at any time.
        </Text>
        <Divider />
        <Layout>
          <Layout.Section>
            {isLoading && dynamicPlans.length === 0 ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                <Text variant="headingMd" tone="subdued">Loading available plans...</Text>
              </div>
            ) : (
              <Grid>
                {dynamicPlans.map((tier) => (
                  <Grid.Cell
                    key={tier.name}
                    columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}
                  >
                    <Card background={activePlan === tier.name ? "bg-surface-success" : "bg-surface"}>
                      <BlockStack gap="400">
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingMd">
                            {tier.title}
                            {activePlan === tier.name && (
                              <span style={{ marginLeft: "8px" }}>
                                <Badge tone="success">Active</Badge>
                              </span>
                            )}
                          </Text>
                          <Text as="p" tone="subdued">
                            {tier.description}
                          </Text>
                        </BlockStack>

                        <Text as="p" variant="headingXl">
                          ${tier.price} <Text as="span" variant="bodyMd" tone="subdued">/ {tier.interval === "ANNUAL" ? "yr" : "mo"}</Text>
                        </Text>

                        <Divider />

                        <List type="bullet">
                          {Array.isArray(tier.features) && tier.features.map((feature, i) => (
                            <List.Item key={i}>{feature}</List.Item>
                          ))}
                        </List>

                        <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
                          <Button
                            fullWidth
                            size="large"
                            variant={activePlan === tier.name ? "plain" : "primary"}
                            disabled={activePlan === tier.name || isLoading}
                            onClick={() => handleSubscribe(tier.name)}
                          >
                            {activePlan === tier.name
                              ? "Current Plan"
                              : tier.name.toLowerCase().includes("free") || Number(tier.price) === 0
                                ? "Downgrade"
                                : "Upgrade"}
                          </Button>
                        </div>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>
                ))}
              </Grid>
            )}
          </Layout.Section>
        </Layout>
        {/* Add bottom padding buffer */}
        <div style={{ paddingBottom: "40px" }} />
      </BlockStack>
    </Page>
  );
}
