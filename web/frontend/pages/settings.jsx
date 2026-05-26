import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Select,
  Button,
  FormLayout,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";

export default function Settings() {
  const [primaryColor, setPrimaryColor] = useState("#008060");
  const [language, setLanguage] = useState("en");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const handleColorChange = useCallback((value) => setPrimaryColor(value), []);
  const handleLanguageChange = useCallback((value) => setLanguage(value), []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const { settings } = await response.json();
          if (settings.primaryColor) setPrimaryColor(settings.primaryColor);
          if (settings.language) setLanguage(settings.language);
        }
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        setIsFetching(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        body: JSON.stringify({ primaryColor, language }),
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        shopify.toast.show("Settings saved successfully");
      } else {
        shopify.toast.show("Failed to save settings", { isError: true });
      }
    } catch (err) {
      console.error("Save error", err);
      shopify.toast.show("An error occurred while saving", { isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <Page title="App Settings">
        <Layout>
          <Layout.Section>
            <Card>
              <Text variant="bodyMd" as="p">Loading settings...</Text>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="App Settings"
      subtitle="Manage your global app configurations and defaults."
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Appearance
                </Text>
                <Text variant="bodyMd" as="p">
                  Customize the default colors used throughout your blog layout.
                </Text>
                <FormLayout>
                  <TextField
                    label="Primary Brand Color"
                    value={primaryColor}
                    onChange={handleColorChange}
                    autoComplete="off"
                    helpText="Hex color code (e.g., #008060)."
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Localization
                </Text>
                <Text variant="bodyMd" as="p">
                  Select the default language for your blog frontend.
                </Text>
                <Select
                  label="Default Language"
                  options={[
                    { label: "English", value: "en" },
                    { label: "Spanish", value: "es" },
                    { label: "French", value: "fr" },
                    { label: "German", value: "de" },
                  ]}
                  onChange={handleLanguageChange}
                  value={language}
                />
              </BlockStack>
            </Card>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" onClick={handleSave} loading={isLoading}>
                Save Settings
              </Button>
            </div>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
