/**
 * Advanced Settings Page — Font family, global colors, blog layout,
 * default language, Table of Contents, and global color settings.
 */
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Select,
  TextField, Divider, Toast, Frame, Spinner, Box, Badge, Checkbox,
} from "@shopify/polaris";
import { SaveIcon } from "@shopify/polaris-icons";
import { useState, useEffect, useCallback } from "react";

const FONT_OPTIONS = [
  { label: "System Default", value: "system-ui" },
  { label: "Inter", value: "'Inter', sans-serif" },
  { label: "Roboto", value: "'Roboto', sans-serif" },
  { label: "Open Sans", value: "'Open Sans', sans-serif" },
  { label: "Lato", value: "'Lato', sans-serif" },
  { label: "Poppins", value: "'Poppins', sans-serif" },
  { label: "Merriweather (Serif)", value: "'Merriweather', serif" },
  { label: "Playfair Display (Serif)", value: "'Playfair Display', serif" },
  { label: "Source Code Pro (Mono)", value: "'Source Code Pro', monospace" },
];

const LAYOUT_OPTIONS = [
  { label: "Full Width", value: "full" },
  { label: "Centered (max 800px)", value: "centered" },
  { label: "Narrow (max 640px)", value: "narrow" },
];

const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Arabic (RTL)", value: "ar" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Spanish", value: "es" },
  { label: "Japanese", value: "ja" },
  { label: "Chinese (Simplified)", value: "zh" },
  { label: "Portuguese", value: "pt" },
  { label: "Dutch", value: "nl" },
  { label: "Italian", value: "it" },
];

export default function Settings() {
  const [settings, setSettings] = useState({
    primaryColor: "#008060",
    secondaryColor: "#005bd3",
    fontFamily: "system-ui",
    blogLayout: "centered",
    language: "en",
    showToc: false,
    tocPosition: "left",
    showReadingTime: true,
    showAuthor: true,
    showPublishedDate: true,
    showRelatedPosts: true,
    relatedPostsCount: "3",
    blogPostsPerPage: "10",
    defaultAuthor: "",
    customHeaderCode: "",
    customFooterCode: "",
  });
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const set = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings: saved }) => {
        if (saved) setSettings((s) => ({ ...s, ...saved }));
      })
      .catch(() => {})
      .finally(() => setIsFetching(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Save failed");
      setToast({ content: "✅ Settings saved successfully" });
    } catch {
      setToast({ content: "❌ Failed to save settings", error: true });
    } finally {
      setIsSaving(false);
    }
  };

  if (isFetching) {
    return <Frame><Page><Box padding="800" align="center"><Spinner /></Box></Page></Frame>;
  }

  return (
    <Frame>
      {toast && <Toast content={toast.content} error={toast.error} onDismiss={() => setToast(null)} />}
      <Page
        title="Settings"
        subtitle="Configure global blog appearance and behavior"
        primaryAction={{ content: "Save Settings", icon: SaveIcon, loading: isSaving, onAction: handleSave }}
      >
        <Layout>

          {/* ─── Branding & Colors ─────────────────────────────── */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd">🎨 Branding & Colors</Text>
                  <Divider />
                  <InlineStack gap="500" wrap={false}>
                    <BlockStack gap="200" style={{ flex: 1 }}>
                      <Text variant="bodySm" fontWeight="semibold">Primary Color</Text>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <input
                          type="color"
                          value={settings.primaryColor}
                          onChange={(e) => set("primaryColor")(e.target.value)}
                          style={{ width: 44, height: 44, border: "1px solid #c9cccf", borderRadius: "8px", cursor: "pointer", padding: 0 }}
                        />
                        <TextField
                          label=""
                          labelHidden
                          value={settings.primaryColor}
                          onChange={set("primaryColor")}
                          autoComplete="off"
                        />
                      </div>
                    </BlockStack>
                    <BlockStack gap="200" style={{ flex: 1 }}>
                      <Text variant="bodySm" fontWeight="semibold">Secondary Color</Text>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <input
                          type="color"
                          value={settings.secondaryColor}
                          onChange={(e) => set("secondaryColor")(e.target.value)}
                          style={{ width: 44, height: 44, border: "1px solid #c9cccf", borderRadius: "8px", cursor: "pointer", padding: 0 }}
                        />
                        <TextField
                          label=""
                          labelHidden
                          value={settings.secondaryColor}
                          onChange={set("secondaryColor")}
                          autoComplete="off"
                        />
                      </div>
                    </BlockStack>
                  </InlineStack>

                  {/* Live Preview */}
                  <div style={{ padding: "16px", borderRadius: "8px", border: "1px solid #e1e3e5", background: "#f9fafb" }}>
                    <Text variant="bodySm" tone="subdued">Color Preview</Text>
                    <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                      <div style={{ background: settings.primaryColor, padding: "8px 20px", borderRadius: "6px", color: "#fff", fontSize: "13px", fontWeight: "600" }}>Primary Button</div>
                      <div style={{ background: settings.secondaryColor, padding: "8px 20px", borderRadius: "6px", color: "#fff", fontSize: "13px", fontWeight: "600" }}>Secondary</div>
                      <div style={{ border: `2px solid ${settings.primaryColor}`, padding: "8px 20px", borderRadius: "6px", color: settings.primaryColor, fontSize: "13px", fontWeight: "600" }}>Outline</div>
                    </div>
                  </div>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* ─── Typography & Layout ──────────────────────────── */}
          <Layout.Section variant="oneHalf">
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd">🔤 Typography & Layout</Text>
                  <Divider />
                  <Select
                    label="Blog Font Family"
                    options={FONT_OPTIONS}
                    value={settings.fontFamily}
                    onChange={set("fontFamily")}
                    helpText="Applied to article content on the storefront"
                  />
                  <div style={{ padding: "12px", borderRadius: "6px", border: "1px solid #e1e3e5", background: "#f9fafb" }}>
                    <p style={{ fontFamily: settings.fontFamily, fontSize: "15px", margin: 0, lineHeight: "1.7" }}>
                      The quick brown fox jumps over the lazy dog. <strong>Bold text.</strong> <em>Italic text.</em>
                    </p>
                  </div>
                  <Select
                    label="Blog Article Layout"
                    options={LAYOUT_OPTIONS}
                    value={settings.blogLayout}
                    onChange={set("blogLayout")}
                  />
                  <TextField
                    label="Posts Per Page"
                    type="number"
                    value={settings.blogPostsPerPage}
                    onChange={set("blogPostsPerPage")}
                    min="1"
                    max="50"
                    autoComplete="off"
                  />
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* ─── Language & Localization ──────────────────────── */}
          <Layout.Section variant="oneHalf">
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd">🌍 Language & Localization</Text>
                  <Divider />
                  <Select
                    label="Default Blog Language"
                    options={LANGUAGE_OPTIONS}
                    value={settings.language}
                    onChange={set("language")}
                    helpText="Used for new articles. Translations can be managed per-article."
                  />
                  {settings.language === "ar" && (
                    <div style={{ padding: "10px 14px", background: "#fff8e1", border: "1px solid #f5a623", borderRadius: "6px", fontSize: "13px" }}>
                      ⚠️ Arabic is a right-to-left (RTL) language. The blog layout will automatically switch to RTL mode.
                    </div>
                  )}
                  <TextField
                    label="Default Author Name"
                    value={settings.defaultAuthor}
                    onChange={set("defaultAuthor")}
                    placeholder="Your name or store name..."
                    helpText="Pre-filled in the author field for new articles"
                    autoComplete="off"
                  />
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* ─── Article Display Options ───────────────────────── */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd">📋 Article Display Options</Text>
                  <Divider />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                    <Checkbox label="Show Reading Time" checked={settings.showReadingTime} onChange={set("showReadingTime")} />
                    <Checkbox label="Show Author Name" checked={settings.showAuthor} onChange={set("showAuthor")} />
                    <Checkbox label="Show Published Date" checked={settings.showPublishedDate} onChange={set("showPublishedDate")} />
                    <Checkbox label="Show Related Posts" checked={settings.showRelatedPosts} onChange={set("showRelatedPosts")} />
                    <Checkbox label="Enable Table of Contents (TOC)" checked={settings.showToc} onChange={set("showToc")} />
                  </div>
                  {settings.showToc && (
                    <Select
                      label="TOC Position"
                      options={[
                        { label: "Left sidebar", value: "left" },
                        { label: "Right sidebar", value: "right" },
                        { label: "Top of article", value: "top" },
                        { label: "Floating sticky", value: "floating" },
                      ]}
                      value={settings.tocPosition}
                      onChange={set("tocPosition")}
                    />
                  )}
                  {settings.showRelatedPosts && (
                    <Select
                      label="Number of Related Posts"
                      options={["2", "3", "4", "6"].map((n) => ({ label: `${n} posts`, value: n }))}
                      value={settings.relatedPostsCount}
                      onChange={set("relatedPostsCount")}
                    />
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* ─── Custom Code Injection ─────────────────────────── */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd">💻 Custom Code Injection</Text>
                    <Badge tone="attention">Advanced</Badge>
                  </InlineStack>
                  <Divider />
                  <TextField
                    label="Custom Header Code"
                    value={settings.customHeaderCode}
                    onChange={set("customHeaderCode")}
                    multiline={4}
                    placeholder="<!-- Paste custom CSS or JavaScript for the <head> section -->"
                    autoComplete="off"
                    helpText="Injected into the <head> of every blog article"
                    monospaced
                  />
                  <TextField
                    label="Custom Footer Code"
                    value={settings.customFooterCode}
                    onChange={set("customFooterCode")}
                    multiline={4}
                    placeholder="<!-- Paste custom scripts for the end of <body> -->"
                    autoComplete="off"
                    helpText="Injected before </body> on every blog article"
                    monospaced
                  />
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* ─── Save Button (bottom) ──────────────────────────── */}
          <Layout.Section>
            <InlineStack align="end">
              <Button variant="primary" size="large" loading={isSaving} onClick={handleSave} icon={SaveIcon}>
                Save All Settings
              </Button>
            </InlineStack>
          </Layout.Section>

        </Layout>
      </Page>
    </Frame>
  );
}
