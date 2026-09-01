import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { smartBackAction } from "../../utils/smartBack";
import {
  Page,
  Layout,
  Card,
  Box,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  TextField,
  Spinner,
  Icon,
  Tabs,
  Button,
  Toast,
  Frame,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { SearchIcon, PageAddIcon } from "@shopify/polaris-icons";
import TemplateGalleryCard, { BlankTemplateCard } from "../../components/builder/TemplateGalleryCard";
import CreateArticleWizard from "../../components/builder/CreateArticleWizard";
import TemplatePreviewModal from "../../components/builder/TemplatePreviewModal";
import ConfirmActionModal from "../../components/ConfirmActionModal";
import UpgradePrompt from "../../components/UpgradePrompt";

// A category name on its own didn't tell a merchant what the group is for, so each
// carries the job it does. "All" groups the library by category instead of dropping
// 16 cards in one undifferentiated grid.
const CATEGORIES = [
  { name: "All", blurb: "Every layout in the library, grouped by what it's for." },
  { name: "Commerce", blurb: "Articles that sell a product or collection inside the post." },
  { name: "Educational", blurb: "Answer questions and teach - the posts that earn search traffic." },
  { name: "Editorial", blurb: "Brand-led storytelling: founder stories, lookbooks, customer proof." },
  { name: "Seasonal", blurb: "Campaign moments - holidays, gifting, end-of-season pushes." },
  { name: "Industry", blurb: "Ready-to-publish articles for a niche - beauty, fitness, home & garden, food." },
];

export default function BlogTemplatesLibrary() {
  const navigate = useNavigate();
  const location = useLocation();
  const [templates, setTemplates] = useState([]);
  const [shopTemplates, setShopTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [tab, setTab] = useState(0);
  const [features, setFeatures] = useState({});
  const [postCount, setPostCount] = useState(0);
  const [postLimit, setPostLimit] = useState(null);
  const [activePlan, setActivePlan] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  // Picking a card opens the full layout first — starting an article replaces content
  // and costs an article against the plan limit, so it shouldn't happen on one click
  // from a cropped thumbnail.
  const [preview, setPreview] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialSelected, setWizardInitialSelected] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [toastMessage, setToastMessage] = useState(null);
  const [templateUsage, setTemplateUsage] = useState({ limit: null, plan: "" });

  // Embedded in the admin, App Bridge owns the toast; the Polaris <Toast> below is the fallback
  // for when it isn't there (and needs the <Frame> this page is wrapped in).
  const showToast = (content, isError = false) => {
    if (window.shopify?.toast) {
      window.shopify.toast.show(content, { isError });
    } else {
      setToastMessage({ content, error: isError });
    }
  };

  const loadLibrary = () =>
    fetch("/api/blog-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => setTemplates([]));

  const loadMine = () =>
    fetch("/api/blog-templates/mine")
      .then((r) => r.json())
      .then((d) => {
        setShopTemplates(d.templates || []);
        // null limit = unlimited (Pro and above); the route sends the plan's own number.
        setTemplateUsage({ limit: d.limit ?? null, plan: d.plan || "" });
      })
      .catch(() => setShopTemplates([]));

  useEffect(() => {
    Promise.all([
      loadLibrary(),
      loadMine(),
      fetch("/api/posts/plan/features")
        .then((r) => r.json())
        .then((d) => setFeatures(d.features || {}))
        .catch(() => {}),
      fetch("/api/billing/check")
        .then((r) => r.json())
        .then((d) => {
          setPostCount(d.postCount || 0);
          setPostLimit(d.postLimit ?? null);
          setActivePlan(d.activePlan || "");
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const savedCount = shopTemplates.length;
  const templateLimit = templateUsage.limit;
  const templatesAtLimit = templateLimit != null && savedCount >= templateLimit;

  const postsAtLimit = postLimit !== null && postCount >= postLimit;
  const postsNearLimit = postLimit !== null && !postsAtLimit && postCount / postLimit >= 0.8;
  const premiumOn = Boolean(features.templates_premium?.enabled);

  const filteredLibrary = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q)
      );
    });
  }, [templates, query, category]);

  const categoryCounts = useMemo(() => {
    const counts = { All: templates.length };
    templates.forEach((t) => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return counts;
  }, [templates]);

  // Grouped only when the merchant hasn't narrowed things down — once they search or
  // pick a category the flat grid is the faster read.
  const groupedLibrary = useMemo(() => {
    if (category !== "All" || query.trim()) return null;
    return CATEGORIES.slice(1)
      .map((c) => ({ ...c, items: filteredLibrary.filter((t) => t.category === c.name) }))
      .filter((g) => g.items.length > 0);
  }, [filteredLibrary, category, query]);

  const filteredMine = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shopTemplates;
    return shopTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
    );
  }, [shopTemplates, query]);

  // Picking a template here used to skip straight to the editor - no blog, no author, no choice
  // between writing it yourself or letting AI adapt it, none of the steps the "+ New article"
  // wizard walks through elsewhere in the app. This now opens that exact same wizard with the
  // template already selected (so step 0, picking a layout, is skipped since it's already been
  // done here) rather than reimplementing a second, shorter version of it.
  const openWizardWith = (initialSelected) => {
    if (postsAtLimit) {
      navigate("/plans");
      return;
    }
    setWizardInitialSelected(initialSelected);
    setWizardOpen(true);
  };

  const useLibraryTemplate = (template, locked) => {
    if (locked) {
      navigate("/plans");
      return;
    }
    // The library's own summary list already carries each template's full block tree (it's
    // static in-memory data, not a DB blob worth trimming) - no extra fetch needed here.
    openWizardWith({ kind: "library", template });
  };

  const useShopTemplate = async (template) => {
    // Unlike the library, a saved template's list/preview summary deliberately omits its blocks
    // (real DB rows, trimmed for the list response) - fetch the real ones so AI generation (which
    // reads selected.template.blocks directly) has an actual tree to adapt, not an empty one.
    try {
      const res = await fetch(`/api/blog-templates/mine/${template.id}`);
      const data = await res.json();
      openWizardWith({ kind: "shop", template: data.template || template });
    } catch {
      openWizardWith({ kind: "shop", template });
    }
  };

  const useBlank = () => openWizardWith({ kind: "blank", template: null });

  const deleteShopTemplate = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    setDeleteError("");
    try {
      const res = await fetch(`/api/blog-templates/mine/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Could not delete this template. Please try again.");
        return;
      }
      const name = pendingDelete.name;
      await loadMine();
      setPendingDelete(null);
      showToast(`“${name}” deleted`);
    } catch {
      setDeleteError("Could not delete this template. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const renderLibraryCard = (t) => {
    const locked = t.tier === "paid" && !premiumOn;
    return (
      <TemplateGalleryCard
        key={t.key}
        template={t}
        locked={locked}
        showAction
        actionLabel="Preview template"
        onUse={() => setPreview({ template: t, locked })}
      />
    );
  };

  const confirmPreview = () => {
    if (!preview) return;
    const { template, locked } = preview;
    setPreview(null);
    if (template.id) useShopTemplate(template);
    else useLibraryTemplate(template, locked);
  };

  return (
    <Frame>
    <Page
      fullWidth
      title="Blog templates"
      backAction={smartBackAction(navigate, location, "/dashboard", "Dashboard")}
      subtitle="Pick a layout and it opens as a new draft article - blocks, sample images and placeholder copy included. Hover a card to scroll its full design."
    >
      <TitleBar title="Blog templates" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* One plan notice at a time. Two full-width warning banners — the article limit and
                the saved-template limit — used to stack on the same screen and push every
                template below the fold, which made the page read as an upgrade wall rather than
                a gallery. The saved-template one is only relevant while My templates is open, so
                it takes the slot there and the article one takes it everywhere else. */}
            {tab === 1 && templatesAtLimit ? (
              <UpgradePrompt
                requiredPlan={templateUsage.plan === "Free" ? "Starter" : "Pro"}
                title={`You've saved ${savedCount} of ${templateLimit} templates on the ${templateUsage.plan || "current"} plan`}
                description={
                  templateUsage.plan === "Free"
                    ? "Delete one to save another, or upgrade for 5 on Starter and unlimited on Pro."
                    : "Delete one to save another, or upgrade for unlimited saved templates."
                }
              />
            ) : postsAtLimit || postsNearLimit ? (
              <UpgradePrompt
                requiredPlan={activePlan?.toLowerCase() === "free" ? "Starter" : "Pro"}
                title={
                  postsAtLimit
                    ? `You've reached your ${postLimit}-article limit on the ${activePlan || "current"} plan`
                    : `You're close to your ${postLimit}-article limit on the ${activePlan || "current"} plan`
                }
                description={
                  postsAtLimit
                    ? "Upgrade to start a new article from a template."
                    : `${postCount} of ${postLimit} articles used.`
                }
              />
            ) : null}

            <Card padding="0">
              <Box padding="400">
                <BlockStack gap="300">
                  <Tabs
                    tabs={[
                      { id: "library", content: "Library" },
                      {
                        id: "mine",
                        content:
                          templateLimit != null
                            ? `My templates (${savedCount}/${templateLimit})`
                            : `My templates (${savedCount})`,
                      },
                    ]}
                    selected={tab}
                    onSelect={setTab}
                  />
                  <TextField
                    label="Search templates"
                    labelHidden
                    placeholder="Search templates (e.g. review, guide, gift, recipe)"
                    prefix={<Icon source={SearchIcon} />}
                    value={query}
                    onChange={setQuery}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setQuery("")}
                  />
                  {tab === 0 && (
                    <BlockStack gap="150">
                      <InlineStack gap="200" wrap>
                        {CATEGORIES.map(({ name }) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setCategory(name)}
                            style={{
                              border: "1px solid #d0d0d0",
                              background: category === name ? "#303030" : "#fff",
                              color: category === name ? "#fff" : "#303030",
                              borderRadius: 999,
                              padding: "4px 12px",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {name}
                            {categoryCounts[name] ? ` (${categoryCounts[name]})` : ""}
                          </button>
                        ))}
                      </InlineStack>
                      <Text tone="subdued" variant="bodySm" as="p">
                        {CATEGORIES.find((c) => c.name === category)?.blurb}
                      </Text>
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>

            {loading ? (
              <Box padding="800">
                <InlineStack align="center">
                  <Spinner size="large" />
                </InlineStack>
              </Box>
            ) : tab === 1 ? (
              <BlockStack gap="400">
                {templateLimit != null && savedCount > 0 && !templatesAtLimit && (
                  <Text as="p" tone="subdued" variant="bodySm">
                    {`${savedCount} of ${templateLimit} saved on the ${templateUsage.plan || "current"} plan.`}
                  </Text>
                )}
                {filteredMine.length === 0 ? (
                <Card>
                  <Box padding="800">
                    <BlockStack gap="400" inlineAlign="center">
                      <Box background="bg-surface-secondary" borderRadius="full" padding="400">
                        <Icon source={PageAddIcon} tone="subdued" />
                      </Box>
                      <BlockStack gap="200" inlineAlign="center">
                        <Text as="h2" variant="headingMd">
                          {query.trim() ? "No saved templates match your search" : "You haven't saved a template yet"}
                        </Text>
                        <Box maxWidth="460px">
                          <Text as="p" tone="subdued" alignment="center">
                            {query.trim()
                              ? "Try a different search term, or clear the search to see everything you've saved."
                              : "Build an article the way you like it, save it as a template, and it lands here - your blocks, your layout, your copy - ready to start the next one from."}
                          </Text>
                        </Box>
                      </BlockStack>
                      {query.trim() ? (
                        <Button onClick={() => setQuery("")}>Clear search</Button>
                      ) : (
                        <>
                          <InlineStack gap="200">
                            <Button variant="primary" onClick={() => setTab(0)}>
                              Browse the library
                            </Button>
                            <Button onClick={useBlank}>Start a blank article</Button>
                          </InlineStack>
                          <Box maxWidth="460px" paddingBlockStart="200">
                            <Divider />
                            <Box paddingBlockStart="300">
                              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                                To save one: open any article, then choose <b>Save as template</b> from
                                the editor's more-actions menu.
                              </Text>
                            </Box>
                          </Box>
                        </>
                      )}
                    </BlockStack>
                  </Box>
                </Card>
              ) : (
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
                  {filteredMine.map((t) => (
                    <div key={t.id} style={{ position: "relative" }}>
                      <TemplateGalleryCard
                        template={{
                          ...t,
                          style: t.style || { accent: t.accent || "#303030", tocBg: t.accent || "#303030", tocFg: "#fff" },
                          preview: t.preview || { hero: "gradient", toc: true },
                        }}
                        showAction
                        actionLabel="Preview template"
                        onUse={() =>
                          setPreview({
                            template: { ...t, category: t.category || "My template" },
                            locked: false,
                          })
                        }
                      />
                      <div style={{ position: "absolute", top: 8, right: 8 }}>
                        <Button
                          size="micro"
                          tone="critical"
                          loading={deletingId === t.id}
                          onClick={() => {
                            setDeleteError("");
                            setPendingDelete(t);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                      </div>
                    ))}
                  </InlineGrid>
                )}
              </BlockStack>
            ) : filteredLibrary.length === 0 ? (
              <Card>
                <Box padding="800">
                  <BlockStack gap="300" inlineAlign="center">
                    <Text as="h2" variant="headingMd">
                      No templates match your search
                    </Text>
                    <Box maxWidth="420px">
                      <Text as="p" tone="subdued" alignment="center">
                        {category === "All"
                          ? `Nothing in the library matches “${query.trim()}”. Try a broader term - “review”, “guide”, “gift”.`
                          : `Nothing in ${category} matches this search. It may be filed under another category.`}
                      </Text>
                    </Box>
                    <InlineStack gap="200">
                      {query.trim() && (
                        <Button variant="primary" onClick={() => setQuery("")}>
                          Clear search
                        </Button>
                      )}
                      {category !== "All" && (
                        <Button onClick={() => setCategory("All")}>Search all categories</Button>
                      )}
                    </InlineStack>
                  </BlockStack>
                </Box>
              </Card>
            ) : groupedLibrary ? (
              <BlockStack gap="600">
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
                  <BlankTemplateCard onUse={useBlank} />
                </InlineGrid>
                {groupedLibrary.map((group) => (
                  <BlockStack gap="300" key={group.name}>
                    <BlockStack gap="050">
                      <Text variant="headingMd" as="h2">
                        {group.name}
                        <Text as="span" tone="subdued" variant="headingMd">
                          {` (${group.items.length})`}
                        </Text>
                      </Text>
                      <Text tone="subdued" variant="bodySm" as="p">
                        {group.blurb}
                      </Text>
                    </BlockStack>
                    <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
                      {group.items.map((t) => renderLibraryCard(t))}
                    </InlineGrid>
                  </BlockStack>
                ))}
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <Text tone="subdued" variant="bodySm" as="p">
                  {`${filteredLibrary.length} template${filteredLibrary.length === 1 ? "" : "s"}`}
                  {query.trim() ? ` matching “${query.trim()}”` : ` in ${category}`}
                </Text>
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
                  <BlankTemplateCard onUse={useBlank} />
                  {filteredLibrary.map((t) => renderLibraryCard(t))}
                </InlineGrid>
              </BlockStack>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
      <Box paddingBlockEnd="800" />

      <ConfirmActionModal
        open={Boolean(pendingDelete)}
        title="Delete this template?"
        body={
          pendingDelete
            ? `“${pendingDelete.name}” will be removed from My templates. Articles you already created from it are not affected.`
            : ""
        }
        confirmText="Delete template"
        confirmTone="critical"
        loading={Boolean(deletingId)}
        error={deleteError}
        onConfirm={deleteShopTemplate}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteError("");
        }}
      />

      <TemplatePreviewModal
        open={Boolean(preview)}
        template={preview?.template}
        locked={Boolean(preview?.locked)}
        actionLabel={postsAtLimit ? "View plans" : "Use this template"}
        onUse={confirmPreview}
        onClose={() => setPreview(null)}
      />

      <CreateArticleWizard
        open={wizardOpen}
        initialSelected={wizardInitialSelected}
        onClose={() => {
          setWizardOpen(false);
          setWizardInitialSelected(null);
        }}
        onGenerated={() => {
          // This page has no job-progress row of its own - the list page already polls
          // /api/ai/jobs on its own mount, so handing off there is what actually shows the
          // merchant their generation running, the same progress bar "+ New article" gives.
          navigate("/posts?generating=1");
        }}
      />

      {toastMessage && (
        <Toast
          content={toastMessage.content}
          error={toastMessage.error}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </Page>
    </Frame>
  );
}
