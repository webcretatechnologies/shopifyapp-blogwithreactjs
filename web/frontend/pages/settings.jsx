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
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <div style={{ flexGrow: 1 }}>
                      <TextField
                        label="Primary Brand Color"
                        value={primaryColor}
                        onChange={handleColorChange}
                        autoComplete="off"
                        helpText="Hex color code (e.g., #008060)."
                      />
                    </div>
                    <div style={{ marginTop: "12px" }}>
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => handleColorChange(e.target.value)}
                        style={{
                          width: "38px",
                          height: "38px",
                          padding: "0",
                          border: "1px solid #c9cccf",
                          borderRadius: "4px",
                          cursor: "pointer",
                          backgroundColor: "transparent"
                        }}
                      />
                    </div>
                  </div>
                  
                  <div style={{ marginTop: "10px" }}>
                    <Text variant="bodySm" tone="subdued">Color Presets:</Text>
                    <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                      {[
                        { label: "Shopify Green", value: "#008060" },
                        { label: "Ocean Blue", value: "#005ea2" },
                        { label: "Indigo Accent", value: "#4f46e5" },
                        { label: "Crimson Red", value: "#d91e18" },
                        { label: "Charcoal Slate", value: "#2c3e50" }
                      ].map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => handleColorChange(preset.value)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 10px",
                            border: `1px solid ${primaryColor === preset.value ? "#008060" : "#c9cccf"}`,
                            borderRadius: "4px",
                            backgroundColor: primaryColor === preset.value ? "#f0fdf4" : "#ffffff",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: primaryColor === preset.value ? "bold" : "normal",
                            color: primaryColor === preset.value ? "#15803d" : "#202223",
                            transition: "all 0.2s ease"
                          }}
                        >
                          <span
                            style={{
                              width: "12px",
                              height: "12px",
                              borderRadius: "50%",
                              backgroundColor: preset.value,
                              display: "inline-block",
                              border: "1px solid rgba(0,0,0,0.1)"
                            }}
                          />
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
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
