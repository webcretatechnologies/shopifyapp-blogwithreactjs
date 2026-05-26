import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Button,
  Spinner,
  BlockStack,
  InlineStack,
  Modal,
  TextField,
  Banner,
  Grid
} from "@shopify/polaris";
import { useNavigate } from "react-router-dom";

export default function Wizard() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTemplate, setActiveTemplate] = useState(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wizard/templates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch templates");
      setTemplates(data.templates);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!title) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/wizard/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: activeTemplate.id, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create article");
      
      navigate(`/posts/${data.post_id}/edit`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
      setActiveTemplate(null);
    }
  };

  return (
    <Page
      breadcrumbs={[{ content: "Dashboard", onAction: () => navigate("/posts") }]}
      title="Create with Template Wizard"
      subtitle="Select a pre-designed layout to jumpstart your content."
    >
      <BlockStack gap="400">
        {error && (
          <Banner title="Error" tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem" }}>
            <Spinner size="large" />
          </div>
        ) : (
          <Grid>
            {templates.map((tpl) => (
              <Grid.Cell key={tpl.id} columnSpan={{xs: 6, sm: 6, md: 4, lg: 4, xl: 4}}>
                <Card padding="400">
                  <BlockStack gap="400">
                    <div
                      style={{
                        height: "150px",
                        background: "#f4f6f8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "8px",
                        border: "1px solid #dfe3e8"
                      }}
                    >
                      {/* We'd normally render the tpl.preview image here. We'll use a placeholder for now */}
                      <Text variant="headingMd" tone="subdued">{tpl.name}</Text>
                    </div>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h3">{tpl.name}</Text>
                        {tpl.badge && <Badge tone="info">{tpl.badge}</Badge>}
                      </InlineStack>
                      <Button fullWidth onClick={() => setActiveTemplate(tpl)}>Use Template</Button>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            ))}
          </Grid>
        )}

        {activeTemplate && (
          <Modal
            open={!!activeTemplate}
            onClose={() => setActiveTemplate(null)}
            title={`Create new: ${activeTemplate.name}`}
            primaryAction={{
              content: "Create Article",
              onAction: handleCreate,
              loading: creating,
              disabled: !title,
            }}
            secondaryActions={[
              {
                content: "Cancel",
                onAction: () => setActiveTemplate(null),
                disabled: creating,
              },
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Text>Enter a title for your new article.</Text>
                <TextField
                  label="Article Title"
                  value={title}
                  onChange={setTitle}
                  autoComplete="off"
                  autoFocus
                />
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}
      </BlockStack>
    </Page>
  );
}
