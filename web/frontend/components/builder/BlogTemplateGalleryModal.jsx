import { useEffect, useState } from "react";
import { Modal, TextField, InlineGrid, Box, Text, BlockStack, InlineStack, Spinner, EmptyState, Icon } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import TemplateThumbnail from "./TemplateThumbnail";

/**
 * Full-page "Blog Templates" picker. Lists the curated template library (GET /api/blog-templates),
 * and on selection fetches the full block tree (GET /api/blog-templates/:key) and hands it back to
 * the caller via onApply(blocks) — the caller is responsible for normalizing/hydrating the builder.
 */
export default function BlogTemplateGalleryModal({ open, onClose, onApply }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applyingKey, setApplyingKey] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/blog-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = templates.filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
  });

  const handleSelect = async (key) => {
    setApplyingKey(key);
    try {
      const res = await fetch(`/api/blog-templates/${key}`);
      const data = await res.json();
      if (data.template?.blocks) {
        onApply(data.template.blocks);
        onClose();
      }
    } catch (err) {
      console.error("Failed to load template", err);
    } finally {
      setApplyingKey(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Choose a blog template" large>
      <Modal.Section>
        <BlockStack gap="400">
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

          {loading ? (
            <Box padding="800">
              <InlineStack align="center"><Spinner size="small" /></InlineStack>
            </Box>
          ) : filtered.length === 0 ? (
            <EmptyState heading="No templates match your search" image="">
              <p>Try a different search term.</p>
            </EmptyState>
          ) : (
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
              {filtered.map((t) => (
                <div
                  key={t.key}
                  style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid #e3e1de", background: "#fff" }}
                >
                  <div
                    style={{
                      background: t.accent || "#303030",
                      color: "#fff",
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <Text variant="headingSm" as="h3" tone="text-inverse">{t.name}</Text>
                    {t.badge && (
                      <span style={{ background: "rgba(255,255,255,0.92)", color: t.accent || "#303030", fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px", flexShrink: 0 }}>
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <Box padding="300">
                    <BlockStack gap="200">
                      <TemplateThumbnail accent={t.accent} preview={t.preview} />
                      <Text tone="subdued" variant="bodySm">{t.description}</Text>
                      <Box paddingBlockStart="100">
                        <button
                          onClick={() => handleSelect(t.key)}
                          disabled={applyingKey !== null}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid #303030",
                            background: "#303030",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: applyingKey !== null ? "default" : "pointer",
                            opacity: applyingKey !== null && applyingKey !== t.key ? 0.5 : 1,
                          }}
                        >
                          {applyingKey === t.key ? "Applying…" : "Use this template"}
                        </button>
                      </Box>
                    </BlockStack>
                  </Box>
                </div>
              ))}
            </InlineGrid>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
