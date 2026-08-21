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
  FormLayout,
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
import { TitleBar } from "@shopify/app-bridge-react";
import { smartBackAction } from "../utils/smartBack";
import { metaRobotsActivateUrl } from "../utils/themeEmbedUtils";
import EmbedRequirementBanner from "../components/EmbedRequirementBanner";
import UpgradePrompt from "../components/UpgradePrompt";
import ConfirmActionModal from "../components/ConfirmActionModal";
import { APP_NAME } from "../utils/appName";

const LAYOUT_OPTIONS = [
  { label: "Full width", value: "full" },
  { label: "Custom width", value: "custom" },
  { label: "Centered (max 800px)", value: "centered" },
  { label: "Narrow (max 640px)", value: "narrow" },
];

const CUSTOM_WIDTH_MIN = 320;
const CUSTOM_WIDTH_MAX = 2400;

/** Returns an error message when custom width is required and invalid; otherwise null. */
function getCustomWidthError(blogLayout, rawWidth) {
  if (blogLayout !== "custom") return null;
  const trimmed = String(rawWidth ?? "").trim();
  if (!trimmed) return `Enter a width between ${CUSTOM_WIDTH_MIN} and ${CUSTOM_WIDTH_MAX} px.`;
  if (!/^\d+$/.test(trimmed)) return "Width must be a whole number of pixels.";
  const n = parseInt(trimmed, 10);
  if (n < CUSTOM_WIDTH_MIN || n > CUSTOM_WIDTH_MAX) {
    return `Width must be between ${CUSTOM_WIDTH_MIN} and ${CUSTOM_WIDTH_MAX} px.`;
  }
  return null;
}

const RELATED_POSTS_OPTIONS = ["2", "3", "4", "6", "8", "12"].map((n) => ({
  label: `${n} posts`,
  value: n,
}));

const RELATED_LAYOUT_OPTIONS = [
  { label: "Grid", value: "grid" },
  { label: "List", value: "list" },
  { label: "Slider", value: "slider" },
];

const RELATED_SOURCE_OPTIONS = [
  { label: "Smart match (category + tags)", value: "smart" },
  { label: "Same category", value: "category" },
  { label: "Random", value: "random" },
  { label: "Manual only", value: "manual" },
];

const SIDEBAR_POSITION_OPTIONS = [
  { label: "Right", value: "right" },
  { label: "Left", value: "left" },
];

const SIDEBAR_WIDTH_OPTIONS = [
  { label: "280 px", value: "280" },
  { label: "320 px", value: "320" },
  { label: "360 px", value: "360" },
];

const DEFAULT_SIDEBAR_WIDGETS = [
  { id: "related_1", type: "related_posts", enabled: true, settings: { title: "Related posts", count: 4 } },
  {
    id: "categories_1",
    type: "categories",
    enabled: true,
    settings: {
      title: "Categories",
      showCounts: true,
      showPosts: true,
      maxPosts: 3,
      sort: "name",
      includeCategoryIds: [],
    },
  },
  { id: "products_1", type: "products", enabled: false, settings: { title: "Products", source: "post_products", maxItems: 3, ctaLabel: "View product" } },
  { id: "rich_1", type: "rich_text", enabled: false, settings: { title: "", body: "" } },
  { id: "cta_1", type: "image_cta", enabled: false, settings: { title: "", imageUrl: "", linkUrl: "", buttonText: "Learn more" } },
];

const CATEGORY_SORT_OPTIONS = [
  { label: "Name (A–Z)", value: "name" },
  { label: "Most posts", value: "count" },
];

const CATEGORY_MAX_POSTS_OPTIONS = ["1", "2", "3", "4", "5", "6"].map((n) => ({
  label: `${n} post${n === "1" ? "" : "s"}`,
  value: n,
}));

function parseSidebarWidgets(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* fall through */
  }
  return DEFAULT_SIDEBAR_WIDGETS;
}

function patchSidebarWidget(widgetsJson, index, patch) {
  const list = parseSidebarWidgets(widgetsJson);
  if (!list[index]) return widgetsJson;
  list[index] = {
    ...list[index],
    ...patch,
    settings: { ...(list[index].settings || {}), ...(patch.settings || {}) },
  };
  return JSON.stringify(list);
}

const TABS = [
  { id: "appearance", content: "Appearance" },
  { id: "content", content: "Content & display" },
  { id: "seo", content: "SEO & Sitemap" },
  { id: "advanced", content: "Advanced" },
];

// A single, reusable card-header pattern: title + optional trailing action/badge.
function SectionCard({ title, trailing, children }) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap={false} gap="300">
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
  blogLayoutCustomWidth: "1200",
  showReadingTime: true,
  showAuthor: true,
  showPublishedDate: true,
  showRelatedPosts: true,
  relatedPostsCount: "3",
  relatedPostsLayout: "grid",
  relatedPostsSourceMode: "smart",
  blogSidebarEnabled: false,
  blogSidebarPosition: "right",
  blogSidebarWidth: "320",
  blogSidebarWidgets: JSON.stringify(DEFAULT_SIDEBAR_WIDGETS),
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
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [categoryBusyId, setCategoryBusyId] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  const set = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  const customWidthError = getCustomWidthError(
    settings.blogLayout,
    settings.blogLayoutCustomWidth
  );
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

  const loadCategories = () => {
    setCategoriesLoading(true);
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  };

  useEffect(() => {
    if (selectedTab === 1 && features.blog_sidebar?.enabled) {
      loadCategories();
    }
  }, [selectedTab, features.blog_sidebar?.enabled]);

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

  const updateSidebarWidget = (index, patch) => {
    set("blogSidebarWidgets")(patchSidebarWidget(settings.blogSidebarWidgets, index, patch));
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't create category");
      setNewCategoryName("");
      setToast({ content: `Created “${data.category?.name || name}”` });
      loadCategories();
    } catch (err) {
      setToast({ content: err.message, error: true });
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleRenameCategory = async (id) => {
    const name = editingCategoryName.trim();
    if (!name) return;
    setCategoryBusyId(id);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't rename category");
      setEditingCategoryId(null);
      setEditingCategoryName("");
      setToast({ content: "Category renamed" });
      loadCategories();
    } catch (err) {
      setToast({ content: err.message, error: true });
    } finally {
      setCategoryBusyId(null);
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete?.id) return;
    const id = categoryToDelete.id;
    setCategoryBusyId(id);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't delete category");
      setCategoryToDelete(null);
      setToast({ content: "Category deleted" });
      // Drop deleted id from any Categories widget include filter
      const list = parseSidebarWidgets(settings.blogSidebarWidgets).map((w) => {
        if (w.type !== "categories") return w;
        const ids = Array.isArray(w.settings?.includeCategoryIds)
          ? w.settings.includeCategoryIds.filter((x) => parseInt(x, 10) !== id)
          : [];
        return { ...w, settings: { ...(w.settings || {}), includeCategoryIds: ids } };
      });
      setSettings((s) => ({ ...s, blogSidebarWidgets: JSON.stringify(list) }));
      loadCategories();
    } catch (err) {
      setToast({ content: err.message, error: true });
    } finally {
      setCategoryBusyId(null);
    }
  };

  const handleSave = async () => {
    const widthError = getCustomWidthError(
      settings.blogLayout,
      settings.blogLayoutCustomWidth
    );
    if (widthError) {
      setToast({ content: widthError, error: true });
      return false;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      setOriginalSettings(settings);
      setToast({ content: "Settings saved successfully" });
      if (window.shopify?.saveBar) {
        try { await window.shopify.saveBar.hide(SAVE_BAR_ID); } catch (e) { }
      }
      return true;
    } catch (err) {
      setToast({ content: err.message || "Failed to save settings", error: true });
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
      <TitleBar title="Settings" />
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
      <ConfirmActionModal
        open={!!categoryToDelete}
        title={categoryToDelete ? `Delete “${categoryToDelete.name}”?` : "Delete category?"}
        body="Posts in this category will keep their content but lose the category assignment. Empty categories never appear in the sidebar."
        confirmText="Delete"
        confirmTone="critical"
        onConfirm={handleDeleteCategory}
        onCancel={() => setCategoryToDelete(null)}
        loading={categoryBusyId === categoryToDelete?.id}
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
                    <BlockStack gap="400">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Set brand colors used by new blog blocks. Sync from theme to pull
                        colors from your live Shopify theme, then save.
                      </Text>

                      {!features.theme_style_sync?.enabled && (
                        <UpgradePrompt
                          onUpgrade={handleUpgradeNow}
                          requiredPlan="Starter"
                          title="Theme color sync — Starter feature"
                          description="Pull primary, secondary, and text colors from your active Shopify theme in one click."
                        />
                      )}

                      <FormLayout>
                        <FormLayout.Group>
                          <TextField
                            label="Primary color"
                            type="color"
                            value={settings.primaryColor}
                            onChange={set("primaryColor")}
                            autoComplete="off"
                          />
                          <TextField
                            label="Secondary color"
                            type="color"
                            value={settings.secondaryColor}
                            onChange={set("secondaryColor")}
                            autoComplete="off"
                          />
                          <TextField
                            label="Font color"
                            type="color"
                            value={settings.textColor}
                            onChange={set("textColor")}
                            autoComplete="off"
                          />
                        </FormLayout.Group>

                        {/* One field in a 3-column group keeps radius at ~1/3 width
                            (Polaris FormLayout.Group equal columns). */}
                        <FormLayout.Group>
                          <TextField
                            label="Button corner radius"
                            type="number"
                            min={0}
                            max={40}
                            suffix="px"
                            value={settings.buttonRadius}
                            onChange={set("buttonRadius")}
                            autoComplete="off"
                            helpText="Applied to new Button, FAQ, and Product Card blocks"
                          />
                          <div />
                          <div />
                        </FormLayout.Group>
                      </FormLayout>

                      <Box
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                        borderWidth="025"
                        borderColor="border"
                      >
                        <BlockStack gap="300">
                          <Text as="h3" variant="headingSm">
                            Preview
                          </Text>
                          <InlineStack gap="300" wrap>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                background: settings.primaryColor,
                                padding: "8px 16px",
                                borderRadius: `${Number(settings.buttonRadius) || 0}px`,
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: 1.25,
                              }}
                            >
                              Primary
                            </span>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                background: settings.secondaryColor,
                                padding: "8px 16px",
                                borderRadius: `${Number(settings.buttonRadius) || 0}px`,
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: 1.25,
                              }}
                            >
                              Secondary
                            </span>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                background: "transparent",
                                border: `var(--p-border-width-025) solid ${settings.primaryColor}`,
                                padding: "8px 16px",
                                borderRadius: `${Number(settings.buttonRadius) || 0}px`,
                                color: settings.primaryColor,
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: 1.25,
                              }}
                            >
                              Outline
                            </span>
                          </InlineStack>
                          <Text as="p" variant="bodyMd">
                            <span style={{ color: settings.textColor }}>
                              Sample body text in your font color
                            </span>
                          </Text>
                        </BlockStack>
                      </Box>
                    </BlockStack>
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
                    {settings.blogLayout === "custom" && (
                      <TextField
                        label="Custom width"
                        type="number"
                        min={CUSTOM_WIDTH_MIN}
                        max={CUSTOM_WIDTH_MAX}
                        suffix="px"
                        value={String(settings.blogLayoutCustomWidth ?? "1200")}
                        onChange={set("blogLayoutCustomWidth")}
                        error={customWidthError || undefined}
                        helpText={`Required. Must be between ${CUSTOM_WIDTH_MIN} and ${CUSTOM_WIDTH_MAX} pixels.`}
                        autoComplete="off"
                      />
                    )}
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
                        <BlockStack gap="300">
                          <Select
                            label="Number of related posts"
                            options={RELATED_POSTS_OPTIONS}
                            value={settings.relatedPostsCount}
                            onChange={set("relatedPostsCount")}
                          />
                          <Select
                            label="Layout"
                            options={RELATED_LAYOUT_OPTIONS}
                            value={settings.relatedPostsLayout || "grid"}
                            onChange={set("relatedPostsLayout")}
                            helpText="Grid, list, or slider on the storefront related-posts block."
                          />
                          <Select
                            label="Default source"
                            options={RELATED_SOURCE_OPTIONS}
                            value={settings.relatedPostsSourceMode || "smart"}
                            onChange={set("relatedPostsSourceMode")}
                            helpText="Posts can override this in the editor. Manual only uses posts you pick on each article."
                          />
                        </BlockStack>
                      </Box>
                    )}
                  </SectionCard>
                </Layout.Section>

                <Layout.Section>
                  <SectionCard
                    title="Blog sidebar"
                    trailing={
                      features.blog_sidebar?.enabled ? null : <Badge>Starter+</Badge>
                    }
                  >
                    {!features.blog_sidebar?.enabled && (
                      <UpgradePrompt
                        feature="Blog sidebar"
                        message="A two-column article layout with related posts, categories, products, and promo widgets is available on Starter and above."
                        onUpgrade={handleUpgradeNow}
                      />
                    )}
                    <Checkbox
                      label="Enable blog sidebar"
                      checked={!!settings.blogSidebarEnabled && settings.blogSidebarEnabled !== "false"}
                      onChange={(v) => set("blogSidebarEnabled")(v)}
                      disabled={!features.blog_sidebar?.enabled}
                      helpText="Shows a left or right column on synced articles. Enable, then Save & Sync published posts (or use Apply layout below) so the sidebar placeholder exists."
                    />
                    {features.blog_sidebar?.enabled &&
                      !!settings.blogSidebarEnabled &&
                      settings.blogSidebarEnabled !== "false" && (
                        <BlockStack gap="400">
                          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                            <Select
                              label="Position"
                              options={SIDEBAR_POSITION_OPTIONS}
                              value={settings.blogSidebarPosition || "right"}
                              onChange={set("blogSidebarPosition")}
                            />
                            <Select
                              label="Width"
                              options={SIDEBAR_WIDTH_OPTIONS}
                              value={settings.blogSidebarWidth || "320"}
                              onChange={set("blogSidebarWidth")}
                            />
                          </InlineGrid>

                          <Divider />
                          <Text as="h3" variant="headingSm">
                            Categories
                          </Text>
                          <Banner tone="info">
                            <p>
                              Assign a category on each post. Category slugs sync as Shopify tags so
                              archive links work after Save &amp; Sync (or Apply sidebar layout below).
                              Nested post links in the sidebar work even before a resync.
                            </p>
                          </Banner>
                          <InlineStack gap="200" blockAlign="end" wrap={false}>
                            <div style={{ flex: 1, minWidth: 160 }}>
                              <TextField
                                label="New category"
                                labelHidden
                                placeholder="e.g. Recipes"
                                value={newCategoryName}
                                onChange={setNewCategoryName}
                                autoComplete="off"
                                disabled={creatingCategory}
                              />
                            </div>
                            <Button
                              variant="primary"
                              onClick={handleCreateCategory}
                              loading={creatingCategory}
                              disabled={!newCategoryName.trim()}
                            >
                              Add
                            </Button>
                          </InlineStack>
                          {categoriesLoading ? (
                            <InlineStack gap="200" blockAlign="center">
                              <Spinner size="small" />
                              <Text as="span" variant="bodySm" tone="subdued">
                                Loading categories…
                              </Text>
                            </InlineStack>
                          ) : categories.length === 0 ? (
                            <Text as="p" variant="bodySm" tone="subdued">
                              No categories yet. Create one above, then assign it on each post in the editor.
                            </Text>
                          ) : (
                            <BlockStack gap="200">
                              {categories.map((cat) => (
                                <InlineStack
                                  key={cat.id}
                                  align="space-between"
                                  blockAlign="center"
                                  wrap
                                  gap="200"
                                >
                                  {editingCategoryId === cat.id ? (
                                    <InlineStack gap="200" blockAlign="end" wrap={false}>
                                      <div style={{ minWidth: 140 }}>
                                        <TextField
                                          label="Name"
                                          labelHidden
                                          value={editingCategoryName}
                                          onChange={setEditingCategoryName}
                                          autoComplete="off"
                                          disabled={categoryBusyId === cat.id}
                                        />
                                      </div>
                                      <Button
                                        size="slim"
                                        variant="primary"
                                        loading={categoryBusyId === cat.id}
                                        onClick={() => handleRenameCategory(cat.id)}
                                        disabled={!editingCategoryName.trim()}
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="slim"
                                        onClick={() => {
                                          setEditingCategoryId(null);
                                          setEditingCategoryName("");
                                        }}
                                        disabled={categoryBusyId === cat.id}
                                      >
                                        Cancel
                                      </Button>
                                    </InlineStack>
                                  ) : (
                                    <BlockStack gap="050">
                                      <InlineStack gap="200" blockAlign="center">
                                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                                          {cat.name}
                                        </Text>
                                        <Badge>
                                          {cat.postCount} published
                                        </Badge>
                                      </InlineStack>
                                      <Text as="span" variant="bodySm" tone="subdued">
                                        slug: {cat.slug}
                                      </Text>
                                    </BlockStack>
                                  )}
                                  {editingCategoryId !== cat.id && (
                                    <InlineStack gap="100">
                                      <Button
                                        size="slim"
                                        onClick={() => {
                                          setEditingCategoryId(cat.id);
                                          setEditingCategoryName(cat.name);
                                        }}
                                      >
                                        Rename
                                      </Button>
                                      <Button
                                        size="slim"
                                        tone="critical"
                                        onClick={() => setCategoryToDelete(cat)}
                                      >
                                        Delete
                                      </Button>
                                    </InlineStack>
                                  )}
                                </InlineStack>
                              ))}
                            </BlockStack>
                          )}

                          <Divider />
                          <Text as="h3" variant="headingSm">
                            Widgets
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            When the Related posts widget is on, related cards appear in the sidebar only (not at the bottom).
                          </Text>
                          {parseSidebarWidgets(settings.blogSidebarWidgets).map((widget, idx) => (
                            <Card key={widget.id || idx}>
                              <BlockStack gap="300">
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {widget.type === "related_posts"
                                      ? "Related posts"
                                      : widget.type === "categories"
                                        ? "Categories"
                                        : widget.type === "products"
                                          ? "Products"
                                          : widget.type === "rich_text"
                                            ? "Rich text"
                                            : widget.type === "image_cta"
                                              ? "Image / CTA"
                                              : widget.type}
                                  </Text>
                                  <InlineStack gap="200">
                                    <Button
                                      size="slim"
                                      disabled={idx === 0}
                                      onClick={() => {
                                        const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                        if (idx <= 0) return;
                                        const next = [...list];
                                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                        set("blogSidebarWidgets")(JSON.stringify(next));
                                      }}
                                    >
                                      Up
                                    </Button>
                                    <Button
                                      size="slim"
                                      disabled={idx >= parseSidebarWidgets(settings.blogSidebarWidgets).length - 1}
                                      onClick={() => {
                                        const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                        if (idx >= list.length - 1) return;
                                        const next = [...list];
                                        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                        set("blogSidebarWidgets")(JSON.stringify(next));
                                      }}
                                    >
                                      Down
                                    </Button>
                                    <Checkbox
                                      label="On"
                                      labelHidden
                                      checked={!!widget.enabled}
                                      onChange={(checked) => {
                                        const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                        list[idx] = { ...list[idx], enabled: checked };
                                        set("blogSidebarWidgets")(JSON.stringify(list));
                                      }}
                                    />
                                  </InlineStack>
                                </InlineStack>
                                {widget.enabled && (
                                  <BlockStack gap="200">
                                    <TextField
                                      label="Title"
                                      value={widget.settings?.title || ""}
                                      onChange={(title) => {
                                        const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                        list[idx] = {
                                          ...list[idx],
                                          settings: { ...(list[idx].settings || {}), title },
                                        };
                                        set("blogSidebarWidgets")(JSON.stringify(list));
                                      }}
                                      autoComplete="off"
                                    />
                                    {widget.type === "related_posts" && (
                                      <Select
                                        label="Count"
                                        options={RELATED_POSTS_OPTIONS}
                                        value={String(widget.settings?.count || 4)}
                                        onChange={(count) => {
                                          const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                          list[idx] = {
                                            ...list[idx],
                                            settings: {
                                              ...(list[idx].settings || {}),
                                              count: parseInt(count, 10),
                                            },
                                          };
                                          set("blogSidebarWidgets")(JSON.stringify(list));
                                        }}
                                      />
                                    )}
                                    {widget.type === "rich_text" && (
                                      <TextField
                                        label="Body"
                                        value={widget.settings?.body || ""}
                                        onChange={(body) => {
                                          const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                          list[idx] = {
                                            ...list[idx],
                                            settings: { ...(list[idx].settings || {}), body },
                                          };
                                          set("blogSidebarWidgets")(JSON.stringify(list));
                                        }}
                                        multiline={3}
                                        autoComplete="off"
                                      />
                                    )}
                                    {widget.type === "image_cta" && (
                                      <>
                                        <TextField
                                          label="Image URL"
                                          value={widget.settings?.imageUrl || ""}
                                          onChange={(imageUrl) => {
                                            const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                            list[idx] = {
                                              ...list[idx],
                                              settings: { ...(list[idx].settings || {}), imageUrl },
                                            };
                                            set("blogSidebarWidgets")(JSON.stringify(list));
                                          }}
                                          autoComplete="off"
                                        />
                                        <TextField
                                          label="Link URL"
                                          value={widget.settings?.linkUrl || ""}
                                          onChange={(linkUrl) => {
                                            const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                            list[idx] = {
                                              ...list[idx],
                                              settings: { ...(list[idx].settings || {}), linkUrl },
                                            };
                                            set("blogSidebarWidgets")(JSON.stringify(list));
                                          }}
                                          autoComplete="off"
                                        />
                                        <TextField
                                          label="Button text"
                                          value={widget.settings?.buttonText || ""}
                                          onChange={(buttonText) => {
                                            const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                            list[idx] = {
                                              ...list[idx],
                                              settings: { ...(list[idx].settings || {}), buttonText },
                                            };
                                            set("blogSidebarWidgets")(JSON.stringify(list));
                                          }}
                                          autoComplete="off"
                                        />
                                      </>
                                    )}
                                    {widget.type === "products" && (
                                      <>
                                        <Select
                                          label="Source"
                                          options={[
                                            { label: "Products on this post", value: "post_products" },
                                            { label: "Manual product IDs", value: "manual" },
                                          ]}
                                          value={widget.settings?.source || "post_products"}
                                          onChange={(source) => {
                                            const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                            list[idx] = {
                                              ...list[idx],
                                              settings: { ...(list[idx].settings || {}), source },
                                            };
                                            set("blogSidebarWidgets")(JSON.stringify(list));
                                          }}
                                        />
                                        {widget.settings?.source === "manual" && (
                                          <TextField
                                            label="Product handles (comma-separated)"
                                            value={(widget.settings?.productHandles || []).join(", ")}
                                            onChange={(raw) => {
                                              const productHandles = raw
                                                .split(",")
                                                .map((s) => s.trim())
                                                .filter(Boolean);
                                              const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                              list[idx] = {
                                                ...list[idx],
                                                settings: { ...(list[idx].settings || {}), productHandles },
                                              };
                                              set("blogSidebarWidgets")(JSON.stringify(list));
                                            }}
                                            helpText="Enter Shopify product handles, e.g. blue-t-shirt, winter-hat"
                                            autoComplete="off"
                                          />
                                        )}
                                        <Select
                                          label="Max items"
                                          options={["1", "2", "3", "4", "6"].map((n) => ({
                                            label: n,
                                            value: n,
                                          }))}
                                          value={String(widget.settings?.maxItems || 3)}
                                          onChange={(maxItems) => {
                                            const list = parseSidebarWidgets(settings.blogSidebarWidgets);
                                            list[idx] = {
                                              ...list[idx],
                                              settings: {
                                                ...(list[idx].settings || {}),
                                                maxItems: parseInt(maxItems, 10),
                                              },
                                            };
                                            set("blogSidebarWidgets")(JSON.stringify(list));
                                          }}
                                        />
                                      </>
                                    )}
                                    {widget.type === "categories" && (
                                      <BlockStack gap="200">
                                        <Checkbox
                                          label="Show post counts"
                                          checked={widget.settings?.showCounts !== false}
                                          onChange={(showCounts) =>
                                            updateSidebarWidget(idx, { settings: { showCounts } })
                                          }
                                        />
                                        <Checkbox
                                          label="Show recent posts under each category"
                                          checked={widget.settings?.showPosts !== false}
                                          onChange={(showPosts) =>
                                            updateSidebarWidget(idx, { settings: { showPosts } })
                                          }
                                          helpText="Direct article links so visitors can open posts even before tag archives fill in."
                                        />
                                        {widget.settings?.showPosts !== false && (
                                          <Select
                                            label="Max posts per category"
                                            options={CATEGORY_MAX_POSTS_OPTIONS}
                                            value={String(widget.settings?.maxPosts ?? 3)}
                                            onChange={(maxPosts) =>
                                              updateSidebarWidget(idx, {
                                                settings: { maxPosts: parseInt(maxPosts, 10) },
                                              })
                                            }
                                          />
                                        )}
                                        <Select
                                          label="Sort categories"
                                          options={CATEGORY_SORT_OPTIONS}
                                          value={
                                            String(widget.settings?.sort || "name").toLowerCase() ===
                                            "count"
                                              ? "count"
                                              : "name"
                                          }
                                          onChange={(sort) =>
                                            updateSidebarWidget(idx, { settings: { sort } })
                                          }
                                        />
                                        {categories.length > 0 && (
                                          <BlockStack gap="100">
                                            <Text as="p" variant="bodyMd">
                                              Include only these categories (optional)
                                            </Text>
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              Leave all unchecked to show every category that has published posts.
                                            </Text>
                                            {categories.map((cat) => {
                                              const selected = Array.isArray(
                                                widget.settings?.includeCategoryIds
                                              )
                                                ? widget.settings.includeCategoryIds.map((x) =>
                                                    parseInt(x, 10)
                                                  )
                                                : [];
                                              const checked = selected.includes(cat.id);
                                              return (
                                                <Checkbox
                                                  key={cat.id}
                                                  label={`${cat.name} (${cat.postCount})`}
                                                  checked={checked}
                                                  onChange={(on) => {
                                                    const next = on
                                                      ? [...selected, cat.id]
                                                      : selected.filter((id) => id !== cat.id);
                                                    updateSidebarWidget(idx, {
                                                      settings: { includeCategoryIds: next },
                                                    });
                                                  }}
                                                />
                                              );
                                            })}
                                          </BlockStack>
                                        )}
                                      </BlockStack>
                                    )}
                                  </BlockStack>
                                )}
                              </BlockStack>
                            </Card>
                          ))}
                          <Button
                            onClick={async () => {
                              try {
                                const res = await fetch("/api/settings/apply-sidebar-layout", {
                                  method: "POST",
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.error || "Failed");
                                setToast({
                                  content: `Applied layout to ${data.updated || 0} published post(s).`,
                                });
                              } catch (e) {
                                setToast({ content: e.message || "Apply failed", error: true });
                              }
                            }}
                          >
                            Apply sidebar layout to all published posts
                          </Button>
                        </BlockStack>
                      )}
                  </SectionCard>
                </Layout.Section>
              </>
            )}

            {/* ─── SEO & Sitemap ───────────────────────────────────── */}
            {selectedTab === 2 && (
              <>
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
            {selectedTab === 3 && (
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
                    helpText="Applies live within seconds of saving — no need to resync individual posts."
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
