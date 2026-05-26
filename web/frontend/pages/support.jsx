import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  FormLayout,
  Text,
  Banner,
  BlockStack,
  InlineStack,
  Icon
} from "@shopify/polaris";
import { EmailIcon, ChatIcon } from "@shopify/polaris-icons";
import { useNavigate } from "react-router-dom";

export default function Support() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!subject || !message) {
      setError("Please fill out the subject and message.");
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, rating }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit feedback");
      
      setSuccess(true);
      setSubject("");
      setMessage("");
      setRating("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page
      breadcrumbs={[{ content: "Dashboard", onAction: () => navigate("/posts") }]}
      title="Support & Feedback"
      subtitle="Need help or want to suggest a feature? Let us know!"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {error && (
              <Banner tone="critical" onDismiss={() => setError(null)}>
                {error}
              </Banner>
            )}
            
            {success && (
              <Banner tone="success" onDismiss={() => setSuccess(false)}>
                Thank you for your feedback! Our support team will review it shortly.
              </Banner>
            )}

            <Card padding="400">
              <FormLayout>
                <TextField
                  label="Subject"
                  value={subject}
                  onChange={setSubject}
                  placeholder="e.g. Bug report, Feature request, Help needed..."
                  autoComplete="off"
                />
                
                <TextField
                  label="Message"
                  value={message}
                  onChange={setMessage}
                  placeholder="Please describe your issue or suggestion in detail..."
                  multiline={5}
                  autoComplete="off"
                />

                <TextField
                  label="How would you rate the app so far? (Optional)"
                  type="number"
                  min="1"
                  max="5"
                  value={rating}
                  onChange={setRating}
                  placeholder="1 to 5"
                  autoComplete="off"
                />

                <div style={{ marginTop: "1rem" }}>
                  <Button variant="primary" onClick={handleSubmit} loading={loading}>
                    Submit Request
                  </Button>
                </div>
              </FormLayout>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card padding="400">
              <BlockStack gap="300">
                <Text variant="headingMd">Contact Methods</Text>
                
                <InlineStack gap="300" blockAlign="center">
                  <Icon source={EmailIcon} tone="base" />
                  <Text as="p">
                    <strong>Email Support</strong><br />
                    <a href="mailto:support@webcreta.com">support@webcreta.com</a>
                  </Text>
                </InlineStack>

                <InlineStack gap="300" blockAlign="center">
                  <Icon source={ChatIcon} tone="base" />
                  <Text as="p">
                    <strong>Live Chat</strong><br />
                    Available 9 AM - 6 PM EST
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>
            
            <Card padding="400">
              <BlockStack gap="300">
                <Text variant="headingMd">Documentation</Text>
                <Text as="p">
                  Check out our detailed guides to get the most out of the Blog App.
                </Text>
                <Button fullWidth onClick={() => window.open('https://help.webcreta.com', '_blank')}>
                  Visit Help Center
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
