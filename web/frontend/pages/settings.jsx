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
  DataTable,
  Spinner,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { smartBackAction } from "../utils/smartBack";
import { metaRobotsActivateUrl } from "../utils/themeEmbedUtils";
import EmbedRequirementBanner from "../components/EmbedRequirementBanner";
import UpgradePrompt from "../components/UpgradePrompt";
import ConfirmActionModal from "../components/ConfirmActionModal";
import { APP_NAME } from "../utils/appName";

const LAYOUT_OPTIONS = [
  { label: "Full width", value: "full" },
  { label: "Centered (max 800px)", value: "centered" },
  { label: "Narrow (max 640px)", value: "narrow" },
];

const RELATED_POSTS_OPTIONS = ["2", "3", "4", "6"].map((n) => ({
  label: `${n} posts`,
  value: n,
}));

const TABS = [
  { id: "appearance", content: "Appearance" },
  { id: "content", content: "Content & display" },
  { id: "seo", content: "SEO" },
  { id: "sitemap", content: "Sitemap & Indexing" },
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
  buttonRadius: "4",
  blogLayout: "centered",
  showReadingTime: true,
  showAuthor: true,
  showPublishedDate: true,
  showRelatedPosts: true,
  relatedPostsCount: "3",
  defaultAuthor: "",
  customHeaderCode: "",
  customFooterCode: "",
  showPoweredByBadge: false,
};

const SAVE_BAR_ID = "settings-save-bar";

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Snapshot of the last-loaded/last-saved settings — the baseline the contextual save bar
  // compares against to decide whether there are unsaved changes, and what Discard reverts to.
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [metaRobotsActive, setMetaRobotsActive] = useState(null); // null = checking
  const [themeSupportsAppEmbeds, setThemeSupportsAppEmbeds] = useState(true);
  const [isSyncingTheme, setIsSyncingTheme] = useState(false);
  const [selectedTab, setSelectedTab] = useState(() => {
    const tabParam = searchParams.get("tab");
    const idx = TABS.findIndex((t) => t.id === tabParam);
    return idx >= 0 ? idx : 0;
  });
  const [sitemapStatus, setSitemapStatus] = useState(null);
  const [isLoadingSitemap, setIsLoadingSitemap] = useState(true);
  const [features, setFeatures] = useState({});
  const [showUpgradeSaveConfirm, setShowUpgradeSaveConfirm] = useState(false);
  const [isSavingForUpgrade, setIsSavingForUpgrade] = useState(false);

  const set = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  // Same problem/fix as posts/new.jsx's handleUpgradeNow: the default UpgradePrompt behavior
  // (navigate("/plans") directly) left the contextual save bar stuck visible on the Billing page
  // afterward, since a route change doesn't unmount it. Ask before discarding unsaved settings
  // rather than silently losing them, since Billing is enough of a detour that it shouldn't be a
  // surprise.
  const handleUpgradeNow = () => {
    if (isDirty) {
      setShowUpgradeSaveConfirm(true);
    } else {
      navigate("/plans");
    }
  };

  const confirmSaveThenUpgrade = async () => {
    setIsSavingForUpgrade(true);
    try {
      const ok = await handleSave();
      if (ok) {
        setShowUpgradeSaveConfirm(false);
        navigate("/plans");
      }
    } finally {
      setIsSavingForUpgrade(false);
    }
  };

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

  const fetchMetaRobotsStatus = () => {
    fetch("/api/shop/setup-status")
      .then((r) => r.json())
      .then((data) => {
        setMetaRobotsActive(!!data.metaRobots?.active);
        setThemeSupportsAppEmbeds(data.themeSupportsAppEmbeds !== false);
      })
      .catch(() => setMetaRobotsActive(false));
  };

  useEffect(() => {
    fetchMetaRobotsStatus();
    fetch("/api/posts/plan/features")
      .then((r) => r.json())
      .then((d) => setFeatures(d.features || {}))
      .catch(() => {});
  }, []);

  // Re-check silently when the merchant switches back from the theme editor tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchMetaRobotsStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    fetch("/api/settings/sitemap-status")
      .then((r) => r.json())
      .then((data) => setSitemapStatus(data))
      .catch(() => setSitemapStatus({ sitemapUrl: "", posts: [] }))
      .finally(() => setIsLoadingSitemap(false));
  }, []);

  const handleSyncFromTheme = async () => {
    setIsSyncingTheme(true);
    try {
      const res = await fetch("/api/settings/theme-style-tokens");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read your theme's colors.");

      // Shape (button corner radius) — same fail-soft posture as colors: only applied when
      // the theme's schema confirmed the value, otherwise the existing setting is left untouched.
      // Font is no longer synced here at all — it's fetched live from the theme at publish
      // time (EditorContentCompiler.compileForStorefront), not a stored/editable setting.
      const shape = data.shape || {};

      setSettings((s) => ({
        ...s,
        primaryColor: data.colors?.primary || s.primaryColor,
        secondaryColor: data.colors?.secondary || s.secondaryColor,
        textColor: data.colors?.text || s.textColor,
        buttonRadius: typeof shape.buttonRadius === "number" ? String(shape.buttonRadius) : s.buttonRadius,
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
      return true;
    } catch {
      setToast({ content: "Failed to save settings", error: true });
      return false;
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
      <ConfirmActionModal
        open={showUpgradeSaveConfirm}
        title="Save changes before upgrading?"
        body="You have unsaved settings. Save them before going to the Billing page, or cancel to keep editing."
        confirmText="Save & Continue"
        confirmTone="primary"
        onConfirm={confirmSaveThenUpgrade}
        onCancel={() => setShowUpgradeSaveConfirm(false)}
        loading={isSavingForUpgrade}
      />
      <Page
        title="Settings"
        backAction={smartBackAction(navigate, location, "/dashboard", "Dashboard")}
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
                      <Button
                        onClick={handleSyncFromTheme}
                        loading={isSyncingTheme}
                        disabled={!features.theme_style_sync?.enabled}
                      >
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
                    <Box
                      padding="300"
                      background="bg-subdued"
                      borderRadius="200"
                      borderWidth="025"
                      borderColor="border"
                    >
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        Blog font family
                      </Text>
                      <Box paddingBlockStart="100">
                        <Text as="p" tone="subdued" variant="bodySm">
                          Automatically matched to your store's active theme — no setup needed.
                          Change your theme's font in the theme editor and your blog content
                          picks it up on the next save.
                        </Text>
                      </Box>
                    </Box>
                    <Select
                      label="Blog article layout"
                      options={LAYOUT_OPTIONS}
                      value={settings.blogLayout}
                      onChange={set("blogLayout")}
                      helpText="Controls the maximum content width on the storefront"
                    />
                  </SectionCard>
                </Layout.Section>
              </>
            )}

            {/* ─── Content & display ──────────────────────────────── */}
            {selectedTab === 1 && (
              <>
                <Layout.Section>
                  <SectionCard title="Author defaults">
                    <TextField
                      label="Default author name"
                      value={settings.defaultAuthor}
                      onChange={set("defaultAuthor")}
                      placeholder="Your name or store name..."
                      helpText="Pre-filled in the author field for new articles, and used as the byline on any article whose own author field is left blank."
                      autoComplete="off"
                    />
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard title="Article display options">
                    <Text tone="subdued" variant="bodySm">
                      Reading time, author, and published date control a byline this app adds
                      inside the article content. If your theme already shows its own date or
                      author near the title (common on Dawn and similar themes), that's rendered
                      by the theme itself and isn't affected by these toggles.
                    </Text>
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
                    </InlineGrid>
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
                    <EmbedRequirementBanner
                      active={false}
                      themeSupportsAppEmbeds={themeSupportsAppEmbeds}
                      activateUrl={metaRobotsActivateUrl(window.shopify?.config?.shop || "")}
                      featureName="Search engine indexing controls"
                      whatBreaks="Per-article Index/Noindex and Follow/Nofollow settings won't take effect on the live storefront."
                    />
                  )}
                </SectionCard>
              </Layout.Section>
            )}

            {/* ─── Sitemap & Indexing ──────────────────────────────── */}
            {selectedTab === 3 && (
              <>
                <Layout.Section>
                  <SectionCard title="Sitemap">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Shopify automatically includes every published article in its own sitemap.xml —
                      but it can't exclude noindex'd or individually-excluded posts from that. This is
                      a second, "clean" sitemap containing only your indexable, non-excluded posts.
                    </Text>
                    <Banner tone="warning">
                      Submit the URL below to Google Search Console / Bing Webmaster Tools instead
                      of Shopify's sitemap.xml — the "Exclude from XML sitemap" toggle on a post
                      only has an effect on this sitemap, not Shopify's own.
                    </Banner>
                    {sitemapStatus && (
                      <InlineStack gap="200" blockAlign="center" wrap={false}>
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <TextField
                            label="Sitemap URL"
                            labelHidden
                            value={sitemapStatus.sitemapUrl}
                            readOnly
                            autoComplete="off"
                          />
                        </Box>
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText(sitemapStatus.sitemapUrl);
                            setToast({ content: "Sitemap URL copied" });
                          }}
                        >
                          Copy
                        </Button>
                      </InlineStack>
                    )}
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard title="Post indexing status">
                    {isLoadingSitemap && (
                      <InlineStack align="center">
                        <Spinner size="small" />
                      </InlineStack>
                    )}
                    {!isLoadingSitemap && sitemapStatus && sitemapStatus.posts.length === 0 && (
                      <Text as="p" tone="subdued">No published posts yet.</Text>
                    )}
                    {!isLoadingSitemap && sitemapStatus && sitemapStatus.posts.length > 0 && (
                      <DataTable
                        columnContentTypes={["text", "text", "text", "text"]}
                        headings={["Post", "Sitemap", "Meta description", "Last synced"]}
                        rows={sitemapStatus.posts.map((p) => [
                          p.title,
                          p.inSitemap
                            ? <Badge key={`idx-${p.id}`} tone="success">In sitemap</Badge>
                            : <Badge key={`idx-${p.id}`} tone="attention">{p.noindex ? "Noindex — excluded" : "Excluded"}</Badge>,
                          p.hasMetaDescription
                            ? <Badge key={`meta-${p.id}`} tone="success">Present</Badge>
                            : <Badge key={`meta-${p.id}`} tone="warning">Missing</Badge>,
                          p.syncedAt ? new Date(p.syncedAt).toLocaleString() : "Not synced",
                        ])}
                      />
                    )}
                  </SectionCard>
                </Layout.Section>
              </>
            )}

            {/* ─── Advanced ────────────────────────────────────────── */}
            {selectedTab === 4 && (
              <>
              <Layout.Section>
                <SectionCard
                  title="Custom code injection"
                  trailing={<Badge tone="attention">Advanced</Badge>}
                >
                  {!features.custom_code_injection?.enabled && (
                    <UpgradePrompt
                      onUpgrade={handleUpgradeNow}
                      requiredPlan="Pro"
                      title="Custom Global Header & Footer is a Pro feature"
                      description="Inject your own CSS or JavaScript above and below every published article."
                    />
                  )}
                  <TextField
                    label="Custom header code"
                    value={settings.customHeaderCode}
                    onChange={set("customHeaderCode")}
                    multiline={4}
                    disabled={!features.custom_code_injection?.enabled}
                    placeholder="<!-- Paste custom CSS or JavaScript to show above every article -->"
                    autoComplete="off"
                    helpText="Shown at the top of every published article, and applies live within seconds of saving — no need to resync individual posts. Note: this is part of the article body, not your theme's <head> — apps aren't permitted to edit theme files directly."
                    monospaced
                  />
                  <TextField
                    label="Custom footer code"
                    value={settings.customFooterCode}
                    onChange={set("customFooterCode")}
                    multiline={4}
                    disabled={!features.custom_code_injection?.enabled}
                    placeholder="<!-- Paste custom scripts to show below every article -->"
                    autoComplete="off"
                    helpText="Shown at the end of every published article, and applies live within seconds of saving — no need to resync individual posts."
                    monospaced
                  />
                </SectionCard>
              </Layout.Section>

              <Layout.Section>
                <SectionCard title="Branding">
                  {!features.remove_branding?.enabled && (
                    <UpgradePrompt
                      onUpgrade={handleUpgradeNow}
                      requiredPlan="Starter"
                      title={`Remove the "Powered by ${APP_NAME}" badge`}
                      description="Control whether it's shown on your published articles."
                    />
                  )}
                  <Checkbox
                    label={`Show "Powered by ${APP_NAME}" badge on published articles`}
                    checked={features.remove_branding?.enabled ? settings.showPoweredByBadge : true}
                    disabled={!features.remove_branding?.enabled}
                    onChange={set("showPoweredByBadge")}
                    helpText="Your plan lets you remove this badge — it's hidden by default. Check this if you'd like to keep showing it anyway."
                  />
                </SectionCard>
              </Layout.Section>

              <Layout.Section>
                <SectionCard title="Sync status">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    View the 2-way sync state for every post, force re-sync individual posts to
                    Shopify, resync everything at once, and review the sync log.
                  </Text>
                  <InlineStack align="end">
                    <Button onClick={() => navigate("/sync")}>
                      Open Sync Status
                    </Button>
                  </InlineStack>
                </SectionCard>
              </Layout.Section>
              </>
            )}
          </Layout>
        </Box>
      </Page>
    </Frame>
  );
}
