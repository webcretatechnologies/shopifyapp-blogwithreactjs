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
  List
} from "@shopify/polaris";
import { useState, useEffect } from "react";

export default function Plans() {
  const [activePlan, setActivePlan] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/check")
      .then((res) => res.json())
      .then((data) => {
        setActivePlan(data.activePlan || "free");
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
          window.open(data.confirmationUrl, '_top');
        } else if (data.isFree) {
          setActivePlan("free");
          setIsLoading(false);
        }
      } else {
        console.error("Failed to request subscription");
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const planTiers = [
    {
      name: "free",
      title: "Free",
      price: "$0",
      description: "Basic features to get started.",
      features: ["Up to 10 articles", "Standard templates", "Basic support"],
    },
    {
      name: "Blogger Starter",
      title: "Starter",
      price: "$4.99/mo",
      description: "Perfect for growing blogs.",
      features: ["Up to 50 articles", "Premium templates", "Priority support", "No branding"],
    },
    {
      name: "Blogger Pro",
      title: "Pro",
      price: "$9.99/mo",
      description: "For professional content creators.",
      features: ["Unlimited articles", "All templates", "24/7 support", "Custom CSS/JS"],
    },
    {
      name: "Blogger Business",
      title: "Business",
      price: "$19.99/mo",
      description: "Advanced features for enterprises.",
      features: ["Unlimited everything", "Dedicated account manager", "White-glove onboarding"],
    }
  ];

  return (
    <Page title="Plans & Billing">
      <Layout>
        <Layout.Section>
          <Grid>
            {planTiers.map((tier) => (
              <Grid.Cell key={tier.name} columnSpan={{xs: 6, sm: 6, md: 3, lg: 3, xl: 3}}>
                <Card>
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
                    
                    <Text as="p" variant="headingLg">
                      {tier.price}
                    </Text>

                    <Divider />

                    <List type="bullet">
                      {tier.features.map((feature, i) => (
                        <List.Item key={i}>{feature}</List.Item>
                      ))}
                    </List>

                    <Button
                      fullWidth
                      variant={activePlan === tier.name ? "plain" : "primary"}
                      disabled={activePlan === tier.name || isLoading}
                      onClick={() => handleSubscribe(tier.name)}
                    >
                      {activePlan === tier.name ? "Current Plan" : (tier.name === 'free' ? "Downgrade" : "Upgrade")}
                    </Button>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            ))}
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
