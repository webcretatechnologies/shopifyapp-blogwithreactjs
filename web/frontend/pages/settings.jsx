/**
 * Settings — Blog appearance and behavior configuration, organized by tab:
 * Appearance, Content & Display, SEO, and Advanced.
 */
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Select,
  TextField,
  Divider,
  Toast,
  Frame,
  Box,
  Badge,
  Checkbox,
  Tabs,
  Banner,
  InlineGrid,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { metaRobotsActivateUrl } from "../utils/themeEmbedUtils";

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
  { label: "Full width", value: "full" },
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

const TOC_POSITION_OPTIONS = [
  { label: "Left sidebar", value: "left" },
  { label: "Right sidebar", value: "right" },
  { label: "Top of article", value: "top" },
  { label: "Floating sticky", value: "floating" },
];

const RELATED_POSTS_OPTIONS = ["2", "3", "4", "6"].map((n) => ({
  label: `${n} posts`,
  value: n,
}));

const TABS = [
  { id: "appearance", content: "Appearance" },
  { id: "content", content: "Content & display" },
  { id: "seo", content: "SEO" },
  { id: "advanced", content: "Advanced" },
];

// A single, reusable card-header pattern: title + optional trailing action/badge.
function SectionCard({ title, trailing, children }) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingSm">{title}</Text>
          {trailing}
        </InlineStack>
        <Divider />
        {children}
      </BlockStack>
    </Card>
  );
}

const DEFAULT_SETTINGS = {
  primaryColor: "#008060",
  secondaryColor: "#005bd3",
  textColor: "#202223",
  fontFamily: "system-ui",
  buttonRadius: "4",
  useThemeShadows: false,
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
};

const SAVE_BAR_ID = "settings-save-bar";

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Snapshot of the last-loaded/last-saved settings — the baseline the contextual save bar
  // compares against to decide whether there are unsaved changes, and what Discard reverts to.
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [metaRobotsActive, setMetaRobotsActive] = useState(null); // null = checking
  const [isSyncingTheme, setIsSyncingTheme] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);

  const set = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings: saved }) => {
        if (saved) {
          const merged = { ...DEFAULT_SETTINGS, ...saved };
          setSettings(merged);
          setOriginalSettings(merged);
        }
      })
      .catch(() => {})
      .finally(() => setIsFetching(false));
  }, []);

  useEffect(() => {
    fetch("/api/settings/meta-robots-status")
      .then((r) => r.json())
      .then((data) => setMetaRobotsActive(!!data.active))
      .catch(() => setMetaRobotsActive(false));
  }, []);

  const handleSyncFromTheme = async () => {
    setIsSyncingTheme(true);
    try {
      const res = await fetch("/api/settings/theme-style-tokens");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read your theme's colors.");

      // fontFamily is best-effort (Shopify font IDs don't map 1:1 to CSS font names) — only
      // applied if its humanized name matches one of the selectable options by label, so we
      // never silently set an unusable/unlisted CSS value.
      const matchedFont = data.fontFamily
        ? FONT_OPTIONS.find((f) => f.label.toLowerCase() === data.fontFamily.toLowerCase())
        : null;

      // Shape (button/card corner radius + shadow) — same fail-soft posture as colors: only
      // applied when the theme's schema confirmed the value, otherwise the existing setting
      // is left untouched. The shadow checkbox is only meaningful (and only offered) when the
      // theme is confirmed shadowless — a theme that does use shadows needs no override.
      const shape = data.shape || {};

      setSettings((s) => ({
        ...s,
        primaryColor: data.colors?.primary || s.primaryColor,
        secondaryColor: data.colors?.secondary || s.secondaryColor,
        textColor: data.colors?.text || s.textColor,
        fontFamily: matchedFont ? matchedFont.value : s.fontFamily,
        buttonRadius: typeof shape.buttonRadius === "number" ? String(shape.buttonRadius) : s.buttonRadius,
        useThemeShadows: shape.hasShadow === false ? true : s.useThemeShadows,
      }));
      setToast({
        content: `Pulled colors and shape from "${data.themeName}" — review below, then Save Settings to apply`,
      });
    } catch (err) {
      setToast({ content: err.message, error: true });
    } finally {
      setIsSyncingTheme(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Save failed");
      setOriginalSettings(settings);
      setToast({ content: "Settings saved successfully" });
      if (window.shopify?.saveBar) {
        try { await window.shopify.saveBar.hide(SAVE_BAR_ID); } catch (e) { }
      }
    } catch {
      setToast({ content: "Failed to save settings", error: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setSettings(originalSettings);
    if (window.shopify?.saveBar) {
      window.shopify.saveBar.hide(SAVE_BAR_ID).catch(() => { });
    }
  };

  // <ui-save-bar> is rendered unconditionally below (per Shopify's documented pattern) —
  // shopify.saveBar.show()/hide() is the *only* thing that controls its visibility. Mounting
  // it conditionally on isDirty and also imperatively calling show()/hide() at the same time
  // races the DOM mount against the API call; this was the actual bug.
  useEffect(() => {
    if (isFetching || !window.shopify?.saveBar) return;
    if (isDirty) {
      window.shopify.saveBar.show(SAVE_BAR_ID).catch(() => { });
    } else {
      window.shopify.saveBar.hide(SAVE_BAR_ID).catch(() => { });
    }
  }, [isDirty, isFetching]);

  useEffect(() => {
    return () => {
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide(SAVE_BAR_ID).catch(() => { });
      }
    };
  }, []);

  if (isFetching) {
    return (
      <Frame>
        <SkeletonPage title="Settings">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={5} />
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </SkeletonPage>
      </Frame>
    );
  }

  return (
    <Frame>
      {/* Rendered unconditionally, per Shopify's documented Save Bar pattern — visibility is
          controlled solely by shopify.saveBar.show()/hide() in the effect above, not by
          mounting/unmounting this element. */}
      <ui-save-bar id={SAVE_BAR_ID}>
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </ui-save-bar>

      {isDirty && !window.shopify && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999,
            backgroundColor: "#1a1a1a",
            color: "#ffffff",
            padding: "12px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "14px", color: "#ffffff" }}>
            Unsaved changes
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button onClick={handleDiscard}>Discard</Button>
            <Button variant="primary" loading={isSaving} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          content={toast.content}
          error={toast.error}
          onDismiss={() => setToast(null)}
        />
      )}
      <Page
        title="Settings"
        subtitle="Configure global blog appearance and behavior"
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab} fitted />
            </Card>
          </Layout.Section>
        </Layout>

        <Box paddingBlockStart="400">
          <Layout>
            {/* ─── Appearance ─────────────────────────────────────── */}
            {selectedTab === 0 && (
              <>
                <Layout.Section>
                  <SectionCard
                    title="Branding & colors"
                    trailing={
                      <Button onClick={handleSyncFromTheme} loading={isSyncingTheme}>
                        Sync from theme
                      </Button>
                    }
                  >
                    <InlineStack gap="500" wrap>
                      <div style={{ flex: 1, minWidth: 0 }}>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Primary color
                        </Text>
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          <Box
                            borderRadius="200"
                            borderWidth="025"
                            borderColor="border"
                            overflowX="hidden"
                            overflowY="hidden"
                          >
                            <input
                              type="color"
                              aria-label="Primary color"
                              value={settings.primaryColor}
                              onChange={(e) => set("primaryColor")(e.target.value)}
                              style={{
                                display: "block",
                                width: 44,
                                height: 44,
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            />
                          </Box>
                          <Box minWidth="0" width="100%">
                            <TextField
                              label="Primary color"
                              labelHidden
                              value={settings.primaryColor}
                              onChange={set("primaryColor")}
                              autoComplete="off"
                            />
                          </Box>
                        </InlineStack>
                      </BlockStack>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Secondary color
                        </Text>
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          <Box
                            borderRadius="200"
                            borderWidth="025"
                            borderColor="border"
                            overflowX="hidden"
                            overflowY="hidden"
                          >
                            <input
                              type="color"
                              aria-label="Secondary color"
                              value={settings.secondaryColor}
                              onChange={(e) => set("secondaryColor")(e.target.value)}
                              style={{
                                display: "block",
                                width: 44,
                                height: 44,
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            />
                          </Box>
                          <Box minWidth="0" width="100%">
                            <TextField
                              label="Secondary color"
                              labelHidden
                              value={settings.secondaryColor}
                              onChange={set("secondaryColor")}
                              autoComplete="off"
                            />
                          </Box>
                        </InlineStack>
                      </BlockStack>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Font color
                        </Text>
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          <Box
                            borderRadius="200"
                            borderWidth="025"
                            borderColor="border"
                            overflowX="hidden"
                            overflowY="hidden"
                          >
                            <input
                              type="color"
                              aria-label="Font color"
                              value={settings.textColor}
                              onChange={(e) => set("textColor")(e.target.value)}
                              style={{
                                display: "block",
                                width: 44,
                                height: 44,
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            />
                          </Box>
                          <Box minWidth="0" width="100%">
                            <TextField
                              label="Font color"
                              labelHidden
                              value={settings.textColor}
                              onChange={set("textColor")}
                              autoComplete="off"
                            />
                          </Box>
                        </InlineStack>
                      </BlockStack>
                      </div>
                    </InlineStack>

                    <InlineStack gap="500" wrap blockAlign="start">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <TextField
                          label="Button corner radius (px)"
                          type="number"
                          min={0}
                          max={40}
                          value={settings.buttonRadius}
                          onChange={set("buttonRadius")}
                          autoComplete="off"
                          helpText="Applied to new Button, FAQ, and Product Card blocks"
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingTop: "22px" }}>
                        <Checkbox
                          label="Match theme's flat/shadowless style"
                          checked={settings.useThemeShadows}
                          onChange={set("useThemeShadows")}
                          helpText="Only meaningful if your theme uses no shadows on buttons/cards"
                        />
                      </div>
                    </InlineStack>

                    <Box
                      padding="400"
                      background="bg-subdued"
                      borderRadius="200"
                      borderWidth="025"
                      borderColor="border"
                    >
                      <BlockStack gap="300">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Preview
                        </Text>
                        {/* Plain elements here, deliberately: these render arbitrary merchant-
                            picked hex colors at runtime, which Polaris's fixed design tokens
                            can't express — Box/Text don't forward a style prop for dynamic color. */}
                        <div style={{ display: "flex", gap: "8px" }}>
                          <div
                            style={{
                              background: settings.primaryColor,
                              padding: "8px 16px",
                              borderRadius: `${settings.buttonRadius}px`,
                              color: "#fff",
                              fontSize: "13px",
                              fontWeight: 600,
                            }}
                          >
                            Primary button
                          </div>
                          <div
                            style={{
                              background: settings.secondaryColor,
                              padding: "8px 16px",
                              borderRadius: `${settings.buttonRadius}px`,
                              color: "#fff",
                              fontSize: "13px",
                              fontWeight: 600,
                            }}
                          >
                            Secondary
                          </div>
                          <div
                            style={{
                              border: `2px solid ${settings.primaryColor}`,
                              padding: "8px 16px",
                              borderRadius: `${settings.buttonRadius}px`,
                              color: settings.primaryColor,
                              fontSize: "13px",
                              fontWeight: 600,
                            }}
                          >
                            Outline
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: settings.textColor }}>
                          Sample body text in your font color
                        </p>
                      </BlockStack>
                    </Box>
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard title="Typography & layout">
                    <Select
                      label="Blog font family"
                      options={FONT_OPTIONS}
                      value={settings.fontFamily}
                      onChange={set("fontFamily")}
                      helpText="Applied to article content on the storefront"
                    />
                    <Box
                      padding="300"
                      background="bg-subdued"
                      borderRadius="200"
                      borderWidth="025"
                      borderColor="border"
                    >
                      <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">
                        Preview
                      </Text>
                      <Box paddingBlockStart="150">
                        <p
                          style={{
                            fontFamily: settings.fontFamily,
                            fontSize: "15px",
                            margin: 0,
                            lineHeight: "1.7",
                          }}
                        >
                          The quick brown fox jumps over the lazy dog.{" "}
                          <strong>Bold text.</strong> <em>Italic text.</em>
                        </p>
                      </Box>
                    </Box>
                    <Select
                      label="Blog article layout"
                      options={LAYOUT_OPTIONS}
                      value={settings.blogLayout}
                      onChange={set("blogLayout")}
                      helpText="Controls the maximum content width on the storefront"
                    />
                    <TextField
                      label="Posts per page"
                      type="number"
                      value={settings.blogPostsPerPage}
                      onChange={set("blogPostsPerPage")}
                      min={1}
                      max={50}
                      autoComplete="off"
                      helpText="Number of articles shown per page on the blog index"
                    />
                  </SectionCard>
                </Layout.Section>
              </>
            )}

            {/* ─── Content & display ──────────────────────────────── */}
            {selectedTab === 1 && (
              <>
                <Layout.Section>
                  <SectionCard title="Language & localization">
                    <Select
                      label="Default blog language"
                      options={LANGUAGE_OPTIONS}
                      value={settings.language}
                      onChange={set("language")}
                      helpText="Used for new articles. Translations can be managed per-article."
                    />
                    {settings.language === "ar" && (
                      <Banner tone="warning">
                        Arabic is a right-to-left (RTL) language. The blog layout will
                        automatically switch to RTL mode.
                      </Banner>
                    )}
                    <TextField
                      label="Default author name"
                      value={settings.defaultAuthor}
                      onChange={set("defaultAuthor")}
                      placeholder="Your name or store name..."
                      helpText="Pre-filled in the author field for new articles"
                      autoComplete="off"
                    />
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard title="Article display options">
                    <InlineGrid columns={2} gap="300">
                      <Checkbox
                        label="Show reading time"
                        checked={settings.showReadingTime}
                        onChange={set("showReadingTime")}
                      />
                      <Checkbox
                        label="Show author name"
                        checked={settings.showAuthor}
                        onChange={set("showAuthor")}
                      />
                      <Checkbox
                        label="Show published date"
                        checked={settings.showPublishedDate}
                        onChange={set("showPublishedDate")}
                      />
                      <Checkbox
                        label="Show related posts"
                        checked={settings.showRelatedPosts}
                        onChange={set("showRelatedPosts")}
                      />
                      <Checkbox
                        label="Enable table of contents (TOC)"
                        checked={settings.showToc}
                        onChange={set("showToc")}
                      />
                    </InlineGrid>
                    {settings.showToc && (
                      <Box paddingInlineStart="600">
                        <Select
                          label="TOC position"
                          options={TOC_POSITION_OPTIONS}
                          value={settings.tocPosition}
                          onChange={set("tocPosition")}
                        />
                      </Box>
                    )}
                    {settings.showRelatedPosts && (
                      <Box paddingInlineStart="600">
                        <Select
                          label="Number of related posts"
                          options={RELATED_POSTS_OPTIONS}
                          value={settings.relatedPostsCount}
                          onChange={set("relatedPostsCount")}
                        />
                      </Box>
                    )}
                  </SectionCard>
                </Layout.Section>
              </>
            )}

            {/* ─── SEO ─────────────────────────────────────────────── */}
            {selectedTab === 2 && (
              <Layout.Section>
                <SectionCard
                  title="Meta robots"
                  trailing={
                    <>
                      {metaRobotsActive === null && <Badge>Checking…</Badge>}
                      {metaRobotsActive === true && <Badge tone="success">Active</Badge>}
                      {metaRobotsActive === false && <Badge tone="attention">Not activated</Badge>}
                    </>
                  }
                >
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Lets each article's editor control search engine indexing (Index/Noindex,
                    Follow/Nofollow). Activate this once for your store — every article's
                    setting then applies automatically, no further setup.
                  </Text>
                  {metaRobotsActive === false && (
                    <InlineStack align="end">
                      <Button
                        variant="primary"
                        url={metaRobotsActivateUrl(window.shopify?.config?.shop || "")}
                        target="_blank"
                      >
                        Activate now
                      </Button>
                    </InlineStack>
                  )}
                </SectionCard>
              </Layout.Section>
            )}

            {/* ─── Advanced ────────────────────────────────────────── */}
            {selectedTab === 3 && (
              <Layout.Section>
                <SectionCard
                  title="Custom code injection"
                  trailing={<Badge tone="attention">Advanced</Badge>}
                >
                  <TextField
                    label="Custom header code"
                    value={settings.customHeaderCode}
                    onChange={set("customHeaderCode")}
                    multiline={4}
                    placeholder="<!-- Paste custom CSS or JavaScript to show above every article -->"
                    autoComplete="off"
                    helpText="Added at the top of every blog article's content. Note: this is part of the article body, not your theme's <head> — apps aren't permitted to edit theme files directly."
                    monospaced
                  />
                  <TextField
                    label="Custom footer code"
                    value={settings.customFooterCode}
                    onChange={set("customFooterCode")}
                    multiline={4}
                    placeholder="<!-- Paste custom scripts to show below every article -->"
                    autoComplete="off"
                    helpText="Added at the end of every blog article's content."
                    monospaced
                  />
                </SectionCard>
              </Layout.Section>
            )}
          </Layout>
        </Box>
      </Page>
    </Frame>
  );
}
