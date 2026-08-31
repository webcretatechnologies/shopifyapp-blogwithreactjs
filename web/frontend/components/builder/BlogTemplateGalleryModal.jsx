import { useEffect, useMemo, useState } from "react";
import { Modal, TextField, InlineGrid, Box, Text, BlockStack, InlineStack, Spinner, Button, Icon, Tabs, Banner } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import TemplateGalleryCard from "./TemplateGalleryCard";
import { TemplatePreviewBody, ensureWideModalCss } from "./TemplatePreviewModal";

// Same wording as the Blog templates page (pages/templates/index.jsx) so a merchant
// who learns the categories in one place recognises them in the other.
const CATEGORIES = [
  { name: "All", blurb: "Every layout in the library." },
  { name: "Commerce", blurb: "Articles that sell a product or collection inside the post." },
  { name: "Educational", blurb: "Answer questions and teach - the posts that earn search traffic." },
  { name: "Editorial", blurb: "Brand-led storytelling: founder stories, lookbooks, customer proof." },
  { name: "Seasonal", blurb: "Campaign moments - holidays, gifting, end-of-season pushes." },
  { name: "Industry", blurb: "Ready-to-publish articles for a niche - beauty, fitness, home & garden, food." },
];

export default function BlogTemplateGalleryModal({ open, onClose, onApply, confirmIfDirty }) {
  const [templates, setTemplates] = useState([]);
  const [shopTemplates, setShopTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applyingKey, setApplyingKey] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [tab, setTab] = useState(0);
  const [features, setFeatures] = useState({});
  const [error, setError] = useState("");
  // Polaris doesn't stack modals, so the gallery swaps to the full preview in place
  // rather than opening a second one — applying still replaces the current content,
  // so the merchant sees the whole layout before committing to it.
  const [preview, setPreview] = useState(null);
  const [templateLimit, setTemplateLimit] = useState(null);

  useEffect(() => {
    ensureWideModalCss();
  }, []);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/blog-templates").then((r) => r.json()).then((d) => setTemplates(d.templates || [])),
      fetch("/api/blog-templates/mine")
        .then((r) => r.json())
        .then((d) => {
          setShopTemplates(d.templates || []);
          setTemplateLimit(d.limit ?? null);
        })
        .catch(() => setShopTemplates([])),
      fetch("/api/posts/plan/features").then((r) => r.json()).then((d) => setFeatures(d.features || {})).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [open]);

  const premiumOn = Boolean(features.templates_premium?.enabled);

  const filtered = useMemo(() => {
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

  const filteredMine = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shopTemplates;
    return shopTemplates.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q)
    );
  }, [shopTemplates, query]);

  // No window.confirm here: the preview step below is the confirmation, and it warns in a
  // Polaris banner when there's existing content to replace.
  const applyBlocks = (blocks) => {
    onApply(blocks);
    onClose();
    return true;
  };

  const handleSelect = async (key, locked) => {
    if (locked) {
      setError("This template is available on Starter and above.");
      return;
    }
    setApplyingKey(key);
    setError("");
    try {
      const res = await fetch(`/api/blog-templates/${key}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load template.");
        return;
      }
      if (data.template?.blocks) applyBlocks(data.template.blocks);
    } catch (err) {
      setError("Failed to load template.");
    } finally {
      setApplyingKey(null);
    }
  };

  const handleSelectMine = async (id) => {
    setApplyingKey(`shop-${id}`);
    setError("");
    try {
      const res = await fetch(`/api/blog-templates/mine/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load template.");
        return;
      }
      if (data.template?.blocks) applyBlocks(data.template.blocks);
    } catch (err) {
      setError("Failed to load template.");
    } finally {
      setApplyingKey(null);
    }
  };

  const usePreviewed = () => {
    if (!preview) return;
    if (preview.shopId) handleSelectMine(preview.shopId);
    else handleSelect(preview.template.key, preview.locked);
  };

  if (preview) {
    const busy = applyingKey === preview.template.key || applyingKey === `shop-${preview.shopId}`;
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={preview.template.name}
        size="large"
        primaryAction={{
          content: preview.locked
            ? "Starter plan required"
            : confirmIfDirty
              ? "Replace content with this template"
              : "Use this template",
          onAction: usePreviewed,
          loading: busy,
          disabled: preview.locked,
        }}
        secondaryActions={[
          { content: "Back to templates", onAction: () => setPreview(null), disabled: busy },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {error && (
              <Banner tone="warning" onDismiss={() => setError("")}>
                {error}
              </Banner>
            )}
            {confirmIfDirty && !preview.locked && (
              <Banner tone="warning" title="This replaces the article you have open">
                <p>
                  The blocks and copy currently in the editor are swapped for this template.
                  Ctrl + Z won't bring them back - applying a template clears the undo history -
                  but nothing reaches your article until you save.
                </p>
              </Banner>
            )}
            <TemplatePreviewBody template={preview.template} locked={preview.locked} />
          </BlockStack>
        </Modal.Section>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Choose a blog template" size="large">
      <Modal.Section>
        <div data-template-gallery>
        <BlockStack gap="400">
          <Tabs
            tabs={[
              { id: "library", content: "Library" },
              {
                id: "mine",
                content:
                  templateLimit != null
                    ? `My templates (${shopTemplates.length}/${templateLimit})`
                    : `My templates (${shopTemplates.length})`,
              },
            ]}
            selected={tab}
            onSelect={setTab}
          />
          <TextField
            label="Search templates"
            labelHidden
            placeholder="Search templates (e.g. review, guide, launch)"
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
                {" Choosing one replaces the current content - hover a card to see the whole layout first."}
              </Text>
            </BlockStack>
          )}
          {error && (
            <Banner tone="warning" onDismiss={() => setError("")}>
              {error}
            </Banner>
          )}

          {loading ? (
            <Box padding="800">
              <InlineStack align="center"><Spinner size="small" /></InlineStack>
            </Box>
          ) : tab === 1 ? (
            filteredMine.length === 0 ? (
              <Box padding="600">
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="h3" variant="headingMd">
                    You haven't saved a template yet
                  </Text>
                  <Box maxWidth="420px">
                    <Text as="p" tone="subdued" alignment="center">
                      Save an article you've built from the editor's more-actions menu and it shows
                      up here, ready to reuse.
                    </Text>
                  </Box>
                  <Button onClick={() => setTab(0)}>Browse the library</Button>
                </BlockStack>
              </Box>
            ) : (
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
                {filteredMine.map((t) => (
                  <TemplateGalleryCard
                    key={t.id}
                    template={{
                      ...t,
                      style: t.style || { accent: t.accent || "#303030", tocBg: t.accent || "#303030", tocFg: "#fff" },
                      preview: t.preview || { hero: "gradient", toc: true },
                    }}
                    applying={applyingKey === `shop-${t.id}`}
                    showAction
                    actionLabel="Preview template"
                    onUse={() =>
                      setPreview({
                        template: { ...t, category: t.category || "My template" },
                        locked: false,
                        shopId: t.id,
                      })
                    }
                  />
                ))}
              </InlineGrid>
            )
          ) : filtered.length === 0 ? (
            <Box padding="600">
              <BlockStack gap="200" inlineAlign="center">
                <Text as="h3" variant="headingMd">
                  No templates match your search
                </Text>
                <Box maxWidth="420px">
                  <Text as="p" tone="subdued" alignment="center">
                    {`Try a broader term, or clear the search to see all ${templates.length} layouts.`}
                  </Text>
                </Box>
                <Button
                  onClick={() => {
                    setQuery("");
                    setCategory("All");
                  }}
                >
                  Clear search
                </Button>
              </BlockStack>
            </Box>
          ) : (
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
              {filtered.map((t) => {
                const locked = t.tier === "paid" && !premiumOn;
                return (
                  <TemplateGalleryCard
                    key={t.key}
                    template={t}
                    locked={locked}
                    applying={applyingKey === t.key}
                    showAction
                    actionLabel="Preview template"
                    onUse={() => setPreview({ template: t, locked })}
                  />
                );
              })}
            </InlineGrid>
          )}
        </BlockStack>
        </div>
      </Modal.Section>
    </Modal>
  );
}
