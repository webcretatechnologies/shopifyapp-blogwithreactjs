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
  EmptyState,
  Icon,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { SearchIcon, PlusIcon } from "@shopify/polaris-icons";
import TemplateThumbnail from "../../components/builder/TemplateThumbnail";
import UpgradePrompt from "../../components/UpgradePrompt";

function TemplateCard({ accent, badge, name, description, preview, onUse, locked }) {
  return (
    <div
      style={{
        borderRadius: "10px",
        overflow: "hidden",
        border: "1px solid #e3e1de",
        background: "#fff",
        cursor: "pointer",
        position: "relative",
        transition: "box-shadow 120ms ease, transform 120ms ease",
      }}
      onClick={onUse}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
    >
      <div
        style={{
          background: accent,
          color: "#fff",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <Text variant="headingSm" as="h3" tone="text-inverse">{name}</Text>
        {locked ? (
          <span
            style={{
              background: "rgba(255,255,255,0.92)",
              color: accent,
              fontSize: "11px",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "999px",
              flexShrink: 0,
            }}
          >
            Starter+
          </span>
        ) : badge && (
          <span
            style={{
              background: "rgba(255,255,255,0.92)",
              color: accent,
              fontSize: "11px",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "999px",
              flexShrink: 0,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <Box padding="300">
        <BlockStack gap="200">
          <TemplateThumbnail accent={accent} preview={preview} />
          <Text tone="subdued" variant="bodySm">{description}</Text>
        </BlockStack>
      </Box>
    </div>
  );
}

function BlankTemplateCard({ onUse }) {
  return (
    <div
      style={{
        borderRadius: "10px",
        border: "1.5px dashed #c9c7c4",
        background: "#fafaf9",
        cursor: "pointer",
        minHeight: "212px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onUse}
    >
      <BlockStack gap="200" inlineAlign="center">
        <Box background="bg-fill-secondary" borderRadius="full" padding="200">
          <Icon source={PlusIcon} tone="subdued" />
        </Box>
        <Text variant="headingSm" as="h3" tone="subdued">Blank template</Text>
      </BlockStack>
    </div>
  );
}

/**
 * Dedicated "Blog Templates" library page (sidebar nav item) — the curated library shipped with
 * the app (GET /api/blog-templates). Selecting a card jumps into a new post pre-built from that
 * content (pages/posts/new.jsx reads location.state.templateKey on mount).
 */
export default function BlogTemplatesLibrary() {
  const navigate = useNavigate();
  const location = useLocation();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [features, setFeatures] = useState({});

  // Same article_limit awareness as the Articles list page — a template/blank start doesn't
  // create a Post row by itself (that only happens on Save inside the builder), but letting a
  // merchant build out a whole article only to hit the cap at Save is a bad experience, so this
  // page warns upfront and routes "at limit" clicks to /plans instead of into the builder.
  const [postCount, setPostCount] = useState(0);
  const [postLimit, setPostLimit] = useState(null);
  const [activePlan, setActivePlan] = useState("");

  useEffect(() => {
    fetch("/api/blog-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
    fetch("/api/posts/plan/features")
      .then((r) => r.json())
      .then((d) => setFeatures(d.features || {}))
      .catch(() => {});
    fetch("/api/billing/check")
      .then((r) => r.json())
      .then((d) => {
        setPostCount(d.postCount || 0);
        setPostLimit(d.postLimit ?? null);
        setActivePlan(d.activePlan || "");
      })
      .catch(() => {});
  }, []);

  const postsAtLimit = postLimit !== null && postCount >= postLimit;
  const postsNearLimit = postLimit !== null && !postsAtLimit && postCount / postLimit >= 0.8;

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }, [templates, query]);

  const useTemplate = (key, locked) => {
    if (locked) return; // upgrade banner explains why; card itself no-ops rather than erroring
    if (postsAtLimit) { navigate("/plans"); return; }
    navigate("/posts/new", { state: { templateKey: key } });
  };
  const useBlank = () => {
    if (postsAtLimit) { navigate("/plans"); return; }
    navigate("/posts/new");
  };

  return (
    <Page
      fullWidth
      title="Blog templates"
      backAction={smartBackAction(navigate, location, "/dashboard", "Dashboard")}
      subtitle="Pre-built, professionally structured layouts for the drag & drop builder — pick one to start a new post."
    >
      <TitleBar title="Blog templates" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {(postsAtLimit || postsNearLimit) && (
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
            )}
            <Card padding="0">
              <Box padding="400">
                <TextField
                  label="Search templates"
                  labelHidden
                  placeholder="Search templates (e.g. review, guide, launch, recipe)"
                  prefix={<Icon source={SearchIcon} />}
                  value={query}
                  onChange={setQuery}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setQuery("")}
                />
              </Box>
            </Card>

            {loading ? (
              <Box padding="800">
                <InlineStack align="center"><Spinner size="large" /></InlineStack>
              </Box>
            ) : filteredTemplates.length === 0 && query ? (
              <Card>
                <EmptyState heading="No templates match your search" image="">
                  <p>Try a different search term.</p>
                </EmptyState>
              </Card>
            ) : (
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
                <BlankTemplateCard onUse={useBlank} />
                {filteredTemplates.map((t) => {
                  const locked = t.tier === "paid" && !features.templates_premium?.enabled;
                  return (
                    <TemplateCard
                      key={t.key}
                      accent={t.accent}
                      badge={t.badge}
                      name={t.name}
                      description={t.description}
                      preview={t.preview}
                      locked={locked}
                      onUse={() => useTemplate(t.key, locked)}
                    />
                  );
                })}
              </InlineGrid>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
