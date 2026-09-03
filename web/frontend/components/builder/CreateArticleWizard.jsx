import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Modal,
  Box,
  Text,
  TextField,
  Select,
  BlockStack,
  InlineStack,
  InlineGrid,
  Banner,
  Badge,
  Spinner,
  Icon,
  Tabs,
  Checkbox,
} from "@shopify/polaris";
import { SearchIcon, ComposeIcon, MagicIcon, CheckCircleIcon } from "@shopify/polaris-icons";
import TemplateGalleryCard from "./TemplateGalleryCard";
import { useShopifyProducts } from "../../hooks/useShopifyProducts";
import { TemplatePreviewBody, ensureWideModalCss } from "./TemplatePreviewModal";
import ShopifyRichTextEditor from "../editor/ShopifyRichTextEditor";

/**
 * CreateArticleWizard — the "New article" flow.
 *
 *   1. Template   — the library, your saved templates, or blank
 *   2. Settings   — title, blog/category, author, handle
 *   3. Method     — write it yourself, or let AI adapt your content into the template
 *   4. Brief      — (AI only) what the article is about
 *
 * Picking "write it yourself" hands off to the existing editor with the template pre-applied,
 * so nothing about that path changes. Picking AI creates the draft server-side and returns the
 * merchant to the list, where the row shows generation progress - a generation outlives the
 * modal, so it can't be something you have to sit and watch.
 *
 * AI is unavailable on a blank template on purpose: there's no layout to adapt content into.
 */

const CATEGORIES = ["All", "Commerce", "Educational", "Editorial", "Seasonal", "Industry"];

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";

const STEPS = ["Select a template", "Add post settings", "Choose your method", "Describe your article"];

// Same character set slugify() above produces - lowercase letters/numbers separated by single
// hyphens, no leading/trailing hyphen. A handle that doesn't match this isn't just "not filled
// in" (that's a separate, plain empty check) - it's a URL that would break on the storefront.
const isValidHandle = (h) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(h || "").trim());

// The brief field holds HTML now (a rich text editor, not a plain textarea) - an empty editor's
// getHTML() comes back as "<p></p>", which is truthy for a plain .trim() check and would leave
// "Create blog post" enabled on nothing but an empty paragraph tag.
const briefHasContent = (html) => String(html || "").replace(/<[^>]*>/g, "").trim().length > 0;

export default function CreateArticleWizard({ open, onClose, onGenerated, initialSelected = null }) {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // step 1
  const [templates, setTemplates] = useState([]);
  const [shopTemplates, setShopTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(null); // { kind: 'library'|'shop'|'blank', template }
  const [previewing, setPreviewing] = useState(null);
  const [features, setFeatures] = useState({});

  // step 2
  const [title, setTitle] = useState("");
  const [shopifyBlogId, setShopifyBlogId] = useState("");
  const [author, setAuthor] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [shopifyBlogs, setShopifyBlogs] = useState([]);
  const [blogsLoading, setBlogsLoading] = useState(true);

  // step 3/4
  const [method, setMethod] = useState("manual");
  const [brief, setBrief] = useState("");
  const [credits, setCredits] = useState(null);
  const [linkedProducts, setLinkedProducts] = useState([]);
  const [colorsOn, setColorsOn] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");

  useEffect(() => {
    ensureWideModalCss();
  }, []);

  // Reopening the modal (after closing it with the X, or by mistake) picks up exactly where the
  // merchant left off - same step, same template, same title and brief - the way Bloggle's does.
  // Nothing here clears any of that; only a genuine "start a new article" clears the form, via
  // resetWizard() below, called after a successful "write it yourself" hand-off or AI submission.
  const resetWizard = useCallback(() => {
    setStep(0);
    setTab(0);
    setError("");
    setSelected(null);
    setPreviewing(null);
    setTitle("");
    setShopifyBlogId("");
    setAuthor("");
    setHandle("");
    setHandleTouched(false);
    setMethod("manual");
    setBrief("");
    setLinkedProducts([]);
    setColorsOn(false);
    setPrimaryColor("#000000");
    setBackgroundColor("#FFFFFF");
    setQuery("");
    setCategory("All");
  }, []);

  // The Blog Templates library page opens this wizard with a template already chosen (from its
  // own gallery/preview) rather than making the merchant pick it again on step 0 - this is the
  // only thing that skips ahead; every other step (settings, method, brief) still runs in full.
  useEffect(() => {
    if (open && initialSelected) {
      setSelected(initialSelected);
      setStep(1);
    }
  }, [open, initialSelected]);

  useEffect(() => {
    if (!open) {
      // The preview-a-template overlay is transient in-modal navigation, not progress worth
      // resuming - closing while previewing shouldn't reopen straight back into that overlay.
      setPreviewing(null);
      return;
    }
    setLoading(true);
    setBlogsLoading(true);
    Promise.all([
      fetch("/api/blog-templates").then((r) => r.json()).then((d) => setTemplates(d.templates || [])).catch(() => setTemplates([])),
      fetch("/api/blog-templates/mine").then((r) => r.json()).then((d) => setShopTemplates(d.templates || [])).catch(() => setShopTemplates([])),
      // Reaching the Blog field only ever needed step 0 to actually take some time to click
      // through, which almost always outlasted this fetch - opening the wizard pre-selected
      // (from the Blog Templates library) can reach step 1 practically instantly, arriving well
      // before this resolves. Clicking an empty, still-loading native <select> open and then
      // having its options mutate under it (this fetch landing while the popup is open) is what
      // was closing the dropdown the instant it opened - blogsLoading lets StepSettings keep the
      // field disabled until there's real data for a click to land on.
      fetch("/api/posts/shopify/blogs")
        .then((r) => r.json())
        .then((d) => setShopifyBlogs(d.blogs || []))
        .catch(() => setShopifyBlogs([]))
        .finally(() => setBlogsLoading(false)),
      fetch("/api/ai/credits").then((r) => r.json()).then(setCredits).catch(() => setCredits(null)),
      // Library templates marked "paid" (t.tier) are gated the same way the standalone Blog
      // Templates library page gates them - without this the wizard let a Free-plan shop pick
      // and use any premium template, since only the server's GET /:key rejected it (silently,
      // after the fact, leaving the merchant with an empty article instead of a clear block).
      fetch("/api/posts/plan/features")
        .then((r) => r.json())
        .then((d) => setFeatures(d.features || {}))
        .catch(() => setFeatures({})),
      // Same "Settings → Content & display → Default author name" prefill the editor itself
      // applies for brand-new posts - the wizard shouldn't ask twice for what Settings already knows.
      // Guarded so a resumed session with an already-typed author is never overwritten.
      fetch("/api/settings").then((r) => r.json()).then((d) => {
        const defaultAuthor = d.settings?.defaultAuthor;
        if (defaultAuthor) setAuthor((a) => (a ? a : defaultAuthor));
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [open]);

  // The handle tracks the title until the merchant edits it themselves.
  useEffect(() => {
    if (!handleTouched) setHandle(title ? slugify(title) : "");
  }, [title, handleTouched]);

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

  const filteredShopTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shopTemplates;
    return shopTemplates.filter((t) => {
      return (
        (t.name || "").toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q)
      );
    });
  }, [shopTemplates, query]);

  const isBlank = selected?.kind === "blank";
  const outOfCredits = Boolean(credits && credits.limit != null && (credits.remaining ?? 0) <= 0);
  const premiumOn = Boolean(features.templates_premium?.enabled);
  const isLocked = (kind, template) => kind === "library" && template?.tier === "paid" && !premiumOn;

  // "Write it yourself" used to just navigate to /posts/new with the template/prefill in router
  // state and leave the actual post creation for whenever the merchant got around to clicking
  // Save - so a wizard that had already collected the title, blog, author, handle and template
  // still handed back an unsaved draft with a save bar, as if none of that had been asked yet.
  // This now creates the real post immediately, with the template already applied, and opens the
  // editor already in "editing an existing post" mode. needsAutoSave:true reuses the same silent
  // first-open save the AI-generation path already relies on, so contentHtml gets compiled and
  // the save bar never appears for something the merchant just finished configuring.
  const goToEditor = useCallback(async () => {
    if (isLocked(selected?.kind, selected?.template)) {
      setError("This template is available on Starter and above. Please upgrade to use it.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      let blocks = [];
      if (selected?.kind === "library") {
        const res = await fetch(`/api/blog-templates/${selected.template.key}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Could not create the article.");
          setSubmitting(false);
          return;
        }
        const data = await res.json();
        blocks = data.template?.blocks || [];
      } else if (selected?.kind === "shop") {
        const res = await fetch(`/api/blog-templates/mine/${selected.template.id}`);
        const data = await res.json();
        blocks = data.template?.blocks || [];
      }

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: handle || slugify(title),
          author: author || null,
          blogId: shopifyBlogId || null,
          contentJson: blocks,
          editorMode: "builder",
          status: "draft",
          needsAutoSave: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create the article.");
        return;
      }
      resetWizard();
      onClose();
      navigate(`/posts/${data.post.id}/edit`, { state: { isFirstPost: Boolean(data.isFirstPost) } });
    } catch {
      setError("Could not create the article.");
    } finally {
      setSubmitting(false);
    }
  }, [selected, title, shopifyBlogId, author, handle, navigate, onClose, resetWizard, premiumOn]);

  const startGeneration = useCallback(async () => {
    if (isLocked(selected?.kind, selected?.template)) {
      setError("This template is available on Starter and above. Please upgrade to use it.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          title,
          blogId: shopifyBlogId || null,
          author: author || null,
          slug: handle || slugify(title),
          templateKey: selected?.kind === "library" ? selected.template.key : null,
          templateBlocks: selected?.kind === "shop" ? selected.template.blocks : null,
          products: linkedProducts,
          colors: colorsOn ? { primaryColor, backgroundColor } : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start generation.");
        return;
      }
      // The wizard is a modal inside the list page itself, not a separate route, so navigating
      // to "/posts" doesn't remount anything or trigger a refetch on its own. Handing the job
      // straight to the list page (rather than relying on it to notice on its own polling cycle)
      // is what makes a draft show up immediately - a generation that finishes in a couple of
      // seconds would otherwise complete before the list's poll ever caught it as "active".
      onGenerated?.(data);
      resetWizard();
      onClose();
    } catch {
      setError("Could not start generation.");
    } finally {
      setSubmitting(false);
    }
  }, [brief, title, shopifyBlogId, author, handle, selected, linkedProducts, colorsOn, primaryColor, backgroundColor, onGenerated, onClose, resetWizard, premiumOn]);

  // ── Footer actions per step ────────────────────────────────────────────────
  const primary = (() => {
    if (previewing) {
      return {
        content: "Use this template",
        onAction: () => {
          setSelected(previewing);
          setPreviewing(null);
          setStep(1);
        },
      };
    }
    if (step === 0) {
      return { content: "Next", disabled: !selected, onAction: () => setStep(1) };
    }
    if (step === 1) {
      return {
        content: "Next",
        disabled: !title.trim() || !shopifyBlogId || !author.trim() || !handle.trim() || !isValidHandle(handle),
        onAction: () => setStep(2),
      };
    }
    if (step === 2) {
      return method === "ai"
        ? { content: "Next", onAction: () => setStep(3) }
        : { content: "Create article", onAction: goToEditor, loading: submitting, disabled: submitting };
    }
    return {
      content: credits?.limit == null ? "Create blog post" : "Create blog post (1 credit)",
      onAction: startGeneration,
      loading: submitting,
      disabled: !briefHasContent(brief) || outOfCredits || submitting,
    };
  })();

  const secondary = previewing
    ? [{ content: "Back to templates", onAction: () => setPreviewing(null) }]
    : step > 0
      ? [{ content: "Previous", onAction: () => setStep(step - 1), disabled: submitting }]
      : [];

  const templateName =
    selected?.kind === "blank" ? "Blank template" : selected?.template?.name || "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="large"
      title={previewing ? previewing.template.name : "Create new article"}
      primaryAction={primary}
      secondaryActions={secondary}
    >
      <Modal.Section>
        <div data-template-gallery>
          <BlockStack gap="400">
            {!previewing && (
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" tone="subdued">
                  {`Step ${step + 1} of ${method === "ai" ? 4 : 3}`}
                </Text>
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  {STEPS[step]}
                </Text>
                {templateName && step > 0 && <Badge>{templateName}</Badge>}
              </InlineStack>
            )}

            {error && (
              <Banner tone="critical" onDismiss={() => setError("")}>
                {error}
              </Banner>
            )}

            {previewing ? (
              <TemplatePreviewBody template={previewing.template} />
            ) : loading && step === 0 ? (
              // Only step 0 depends on the refreshed template/shop-template lists - blocking every
              // other step behind a spinner on reopen would hide a resumed title/brief for no reason.
              <Box padding="800">
                <InlineStack align="center">
                  <Spinner size="large" />
                </InlineStack>
              </Box>
            ) : step === 0 ? (
              <StepTemplate
                {...{
                  tab,
                  setTab,
                  query,
                  setQuery,
                  category,
                  setCategory,
                  filtered,
                  filteredShopTemplates,
                  shopTemplates,
                  selected,
                  setSelected,
                  setPreviewing,
                  isLocked,
                  onLockedClick: () => {
                    resetWizard();
                    onClose();
                    navigate("/plans");
                  },
                }}
              />
            ) : step === 1 ? (
              <StepSettings
                {...{
                  title,
                  setTitle,
                  shopifyBlogId,
                  setShopifyBlogId,
                  shopifyBlogs,
                  blogsLoading,
                  author,
                  setAuthor,
                  handle,
                  setHandle,
                  setHandleTouched,
                }}
              />
            ) : step === 2 ? (
              <StepMethod {...{ method, setMethod, isBlank, credits, outOfCredits }} />
            ) : (
              <StepBrief
                {...{
                  brief, setBrief, credits, outOfCredits, templateName,
                  linkedProducts, setLinkedProducts,
                  colorsOn, setColorsOn,
                  primaryColor, setPrimaryColor,
                  backgroundColor, setBackgroundColor,
                }}
              />
            )}
          </BlockStack>
        </div>
      </Modal.Section>
    </Modal>
  );
}

/* ── Step 1 ─────────────────────────────────────────────────────────────────── */
function StepTemplate({
  tab, setTab, query, setQuery, category, setCategory,
  filtered, filteredShopTemplates, shopTemplates, selected, setSelected, setPreviewing,
  isLocked, onLockedClick,
}) {
  const pick = (kind, template) => {
    if (isLocked(kind, template)) {
      onLockedClick?.();
      return;
    }
    setSelected({ kind, template });
  };
  // Library templates are keyed by `key` and shop templates by `id`, and neither carries the
  // other field. Comparing both with an OR made every library card match on
  // `undefined === undefined`, so picking one template marked them all selected.
  const idOf = (kind, template) => (kind === "shop" ? template?.id : template?.key);
  const isSelected = (kind, template) =>
    selected?.kind === kind &&
    (kind === "blank" || (idOf(kind, template) != null && idOf(kind, selected.template) === idOf(kind, template)));

  return (
    <BlockStack gap="300">
      <Tabs
        tabs={[
          { id: "library", content: "Template library" },
          { id: "mine", content: `My templates (${shopTemplates.length})` },
        ]}
        selected={tab}
        onSelect={setTab}
      />
      <TextField
        label="Search templates"
        labelHidden
        placeholder="Search templates (e.g. review, guide, recipe)"
        prefix={<Icon source={SearchIcon} />}
        value={query}
        onChange={setQuery}
        autoComplete="off"
        clearButton
        onClearButtonClick={() => setQuery("")}
      />
      {tab === 0 && (
        <InlineStack gap="200" wrap>
          {CATEGORIES.map((name) => (
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
            </button>
          ))}
        </InlineStack>
      )}

      <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="400">
        {tab === 0 && (
          <SelectableCard selected={isSelected("blank")} onClick={() => pick("blank", null)}>
            <BlockStack gap="200" inlineAlign="center">
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%", background: "#eee",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, color: "#8a8a8a",
                }}
              >
                +
              </div>
              <Text variant="headingSm" as="h3" tone="subdued">
                Blank template
              </Text>
              <Text variant="bodySm" as="p" tone="subdued" alignment="center">
                Start from an empty canvas
              </Text>
            </BlockStack>
          </SelectableCard>
        )}
        {(tab === 0 ? filtered : filteredShopTemplates).map((t) => {
          const kind = tab === 0 ? "library" : "shop";
          return (
            <div key={t.key || t.id} style={{ position: "relative" }}>
              <div
                style={{
                  outline: isSelected(kind, t) ? "2px solid #303030" : "none",
                  outlineOffset: 2,
                  borderRadius: 12,
                }}
              >
                <TemplateGalleryCard
                  template={t}
                  locked={isLocked(kind, t)}
                  showAction
                  actionLabel={isSelected(kind, t) ? "Selected" : "Select"}
                  onUse={() => pick(kind, t)}
                />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewing({ kind, template: t });
                }}
                style={{
                  // Locked cards already show a "🔒 Starter+" badge in this same top-right
                  // corner (TemplateGalleryCard) - stacking this button on top of it hid the
                  // lock badge entirely, so a premium template looked identical to a free one.
                  position: "absolute", top: isLocked(kind, t) ? 44 : 10, right: 10, zIndex: 3,
                  background: "rgba(255,255,255,0.94)", border: "1px solid #e3e1de",
                  borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Preview
              </button>
            </div>
          );
        })}
      </InlineGrid>
    </BlockStack>
  );
}

function SelectableCard({ selected, onClick, children }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        borderRadius: 12,
        border: selected ? "2px solid #303030" : "1.5px dashed #c9c7c4",
        background: "#fafaf9",
        cursor: "pointer",
        minHeight: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

/* ── Step 2 ─────────────────────────────────────────────────────────────────── */
function StepSettings({
  title, setTitle, shopifyBlogId, setShopifyBlogId, shopifyBlogs, blogsLoading,
  author, setAuthor, handle, setHandle, setHandleTouched,
}) {
  const selectedBlog = shopifyBlogs.find((b) => String(b.id) === String(shopifyBlogId));
  const noBlogsExist = !blogsLoading && shopifyBlogs.length === 0;
  const handleTrimmed = handle.trim();
  // Empty-but-untouched required fields just get the requiredIndicator (a quiet asterisk) and
  // block Next, the same silent-disable Article title already used - flagging every blank field
  // red the instant the step loads would make a brand-new form look broken before anyone's typed
  // anything. A malformed handle is different: it's an active mistake, not an unfilled field, so
  // it gets a real inline error.
  const handleInvalid = handleTrimmed.length > 0 && !isValidHandle(handleTrimmed);

  return (
    <BlockStack gap="400">
      <TextField
        label="Article title"
        value={title}
        onChange={setTitle}
        autoComplete="off"
        placeholder="e.g. The 7 best yoga poses for beginners"
        helpText="Used as the H1 on most themes, so it matters for SEO."
        requiredIndicator
      />
      <Select
        label="Blog"
        disabled={blogsLoading}
        options={
          blogsLoading
            ? [{ label: "Loading blogs…", value: "" }]
            : [
                { label: shopifyBlogs.length ? "Select a blog" : "No blogs found", value: "" },
                ...shopifyBlogs.map((b) => ({ label: b.title, value: String(b.id) })),
              ]
        }
        value={shopifyBlogId}
        onChange={setShopifyBlogId}
        requiredIndicator
        helpText={
          blogsLoading
            ? undefined
            : noBlogsExist
              ? "No blogs on this store yet - you can create one from the full editor's Blog field."
              : "Needed before this article can be published to Shopify."
        }
      />
      <TextField
        label="Author"
        value={author}
        onChange={setAuthor}
        autoComplete="off"
        placeholder="Who's writing this?"
        requiredIndicator
      />
      <TextField
        label="Article handle"
        value={handle}
        onChange={(v) => {
          setHandleTouched(true);
          setHandle(v);
        }}
        autoComplete="off"
        prefix={`/blogs/${selectedBlog?.handle || "…"}/`}
        requiredIndicator
        error={
          handleInvalid
            ? "Use only lowercase letters, numbers and hyphens - no spaces or symbols."
            : undefined
        }
        helpText={handleInvalid ? undefined : "The article URL is a strong SEO signal - keep your keywords in it."}
      />
    </BlockStack>
  );
}

/* ── Step 3 ─────────────────────────────────────────────────────────────────── */
function StepMethod({ method, setMethod, isBlank, credits, outOfCredits }) {
  const aiDisabled = outOfCredits;
  return (
    <BlockStack gap="300">
      <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
        <MethodCard
          selected={method === "manual"}
          onClick={() => setMethod("manual")}
          title="Write it yourself"
          body="Open the template in the editor and fill it in. Everything is already laid out - blocks, sample photos and placeholder copy."
          art={<ManualArt />}
        />
        <MethodCard
          selected={method === "ai"}
          disabled={aiDisabled}
          onClick={() => !aiDisabled && setMethod("ai")}
          title="Let AI write it for you"
          badge="Beta"
          body={
            isBlank
              ? "Describe what the article is about and the AI builds it from scratch - headings, text and image slots for you to fill in."
              : "Describe what the article is about and the AI fills your chosen template with real copy, keeping its layout, colours and photos."
          }
          art={<AiArt />}
          note={
            outOfCredits
              ? `You've used all ${credits?.limit} AI credits on the ${credits?.plan} plan.`
              : credits?.limit != null
                ? `${credits.remaining} of ${credits.limit} AI credits left`
                : null
          }
        />
      </InlineGrid>
    </BlockStack>
  );
}

// A dotted-grid card with a small "document + cursor" glyph — evokes an empty layout waiting
// to be typed into, without pulling in an image asset for what's just app chrome.
function ManualArt() {
  return (
    <div
      style={{
        position: "relative",
        height: 132,
        borderRadius: "10px 10px 0 0",
        background:
          "radial-gradient(circle, #d7d3cd 1px, transparent 1px) 0 0/16px 16px, #fafaf9",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 22,
          left: "50%",
          transform: "translateX(-50%)",
          width: 88,
          height: 66,
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 6px 16px rgba(30,30,26,0.12)",
          padding: "12px 10px",
        }}
      >
        <div style={{ height: 6, width: "70%", background: "#e3e1de", borderRadius: 3, marginBottom: 8 }} />
        <div style={{ height: 5, width: "90%", background: "#ececea", borderRadius: 3, marginBottom: 5 }} />
        <div style={{ height: 5, width: "60%", background: "#ececea", borderRadius: 3 }} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 14,
          right: "28%",
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "#fff",
          border: "1px solid #e3e1de",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 10px rgba(30,30,26,0.1)",
        }}
      >
        <Icon source={ComposeIcon} tone="base" />
      </div>
    </div>
  );
}

// A purple gradient card with drifting sparkle dots — the same visual shorthand for "AI" that
// the reference product uses, built with layered radial-gradients instead of a shipped image.
function AiArt() {
  return (
    <div
      style={{
        position: "relative",
        height: 132,
        borderRadius: "10px 10px 0 0",
        background: "linear-gradient(135deg, #6a3df5 0%, #9b3df0 55%, #d63dc9 100%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.55) 1.5px, transparent 1.5px)",
          backgroundSize: "22px 22px",
          backgroundPosition: "4px 10px",
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          width: 92,
          height: 68,
          background: "rgba(255,255,255,0.96)",
          borderRadius: 8,
          boxShadow: "0 10px 22px rgba(35,10,60,0.28)",
          padding: "12px 10px",
        }}
      >
        <div style={{ height: 6, width: "65%", background: "#e2d6fb", borderRadius: 3, marginBottom: 8 }} />
        <div style={{ height: 5, width: "88%", background: "#efe8fd", borderRadius: 3, marginBottom: 5 }} />
        <div style={{ height: 5, width: "55%", background: "#efe8fd", borderRadius: 3 }} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: "26%",
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.96)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 14px rgba(35,10,60,0.25)",
        }}
      >
        <Icon source={MagicIcon} tone="magic" />
      </div>
    </div>
  );
}

function MethodCard({ selected, disabled, onClick, title, body, badge, note, art }) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        position: "relative",
        border: selected ? "2px solid #303030" : "1px solid #e3e1de",
        borderRadius: 12,
        background: "#fff",
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: selected ? "0 0 0 4px rgba(48,48,48,0.08)" : "none",
        transition: "box-shadow 120ms ease, border-color 120ms ease, transform 120ms ease",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {selected && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#fff",
            display: "flex",
            zIndex: 1,
          }}
        >
          <Icon source={CheckCircleIcon} tone="success" />
        </div>
      )}
      {art}
      <Box padding="400">
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingMd">
              {title}
            </Text>
            {badge && <Badge tone="magic">{badge}</Badge>}
          </InlineStack>
          <Text as="p" tone="subdued">
            {body}
          </Text>
          {note && (
            <Text as="p" variant="bodySm" tone={disabled ? "critical" : "subdued"}>
              {note}
            </Text>
          )}
        </BlockStack>
      </Box>
    </div>
  );
}

/* ── Step 4 ─────────────────────────────────────────────────────────────────── */
function StepBrief({
  brief, setBrief, credits, outOfCredits, templateName,
  linkedProducts, setLinkedProducts,
  colorsOn, setColorsOn,
  primaryColor, setPrimaryColor,
  backgroundColor, setBackgroundColor,
}) {
  const MAX = 30000;
  // A rough character count for display only - the field holds HTML now, so this strips tags
  // rather than counting markup as content. Nothing here truncates: a hard cut on the raw HTML
  // string would land mid-tag and corrupt it, and the point of the brief is to let the merchant
  // write as much as they need, not to police it against a fixed budget.
  const plainLength = brief.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().length;
  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="p" variant="bodyMd" fontWeight="medium">
          What should this article be about?
        </Text>
        <ShopifyRichTextEditor
          value={brief}
          onChange={setBrief}
          placeholder="e.g. Paneer tikka recipe blog post - add anything you want included: ingredients, the story behind the dish, which of your products to mention."
          minHeight="200px"
        />
        <InlineStack align="space-between">
          <Text as="p" variant="bodySm" tone="subdued">
            Write as little or as much as you like - the AI reads all of it, together with the title
            you already gave it, to write every section of the {templateName || "chosen"} layout.
          </Text>
          <Text as="p" variant="bodySm" tone={plainLength > MAX ? "critical" : "subdued"}>
            {plainLength.toLocaleString()} characters
          </Text>
        </InlineStack>
      </BlockStack>

      <Text as="h3" variant="headingSm">
        Customize generation <Text as="span" tone="subdued" variant="bodySm">(optional)</Text>
      </Text>

      <LinkProductsPanel products={linkedProducts} setProducts={setLinkedProducts} />

      <ColorsPanel
        enabled={colorsOn}
        setEnabled={setColorsOn}
        primaryColor={primaryColor}
        setPrimaryColor={setPrimaryColor}
        backgroundColor={backgroundColor}
        setBackgroundColor={setBackgroundColor}
      />

      {outOfCredits ? (
        <Banner tone="warning" title={`You've used all ${credits?.limit} AI credits`}>
          <p>Buy more credits, upgrade your plan, or write this one yourself in the editor.</p>
        </Banner>
      ) : (
        credits?.limit != null && (
          <Text as="p" variant="bodySm" tone="subdued">
            {`This uses 1 of your ${credits?.remaining ?? 0} remaining AI credits on the ${credits?.plan || ""} plan.`}
          </Text>
        )
      )}
    </BlockStack>
  );
}

/**
 * Products are resolved through /shopify/products/by-ids before they're sent, because the search
 * results don't carry a variant id and a product block without one renders an "Add to cart" that
 * can't actually add - the exact failure that endpoint exists to prevent.
 */
function LinkProductsPanel({ products, setProducts }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { products: results, isLoading } = useShopifyProducts(open ? search : "", 10);

  // /api/posts/shopify/products returns each result's identity as `shopifyProductId`, not `id` -
  // every comparison below used to read `p.id`, which is always undefined on a raw search result.
  // Since the one product already picked also got stored with `id: undefined`, `undefined ===
  // undefined` matched every other row too, disabling the entire list the moment one was picked.
  const add = async (p) => {
    if (products.some((x) => x.id === p.shopifyProductId)) return;
    let resolved = {
      id: p.shopifyProductId,
      shopifyProductId: p.shopifyProductId,
      title: p.title,
      handle: p.handle,
      image: p.image,
      price: p.price,
      variantId: p.variantId,
    };
    if (!resolved.variantId) {
      try {
        const res = await fetch("/api/posts/shopify/products/by-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [p.shopifyProductId] }),
        });
        const data = await res.json();
        if (data.products?.[0]) resolved = { ...resolved, ...data.products[0], id: p.shopifyProductId };
      } catch {
        /* keep the search result; the block still renders, just without a variant */
      }
    }
    setProducts((prev) => (prev.some((x) => x.id === resolved.id) ? prev : [...prev, resolved]));
  };

  return (
    <Panel
      title="Link products"
      subtitle="Fill the template's product blocks with your own catalog"
      open={open}
      onToggle={() => setOpen(!open)}
      badge={products.length ? `${products.length} selected` : null}
    >
      <BlockStack gap="300">
        <TextField
          label="Search products"
          labelHidden
          placeholder="Search by product title"
          prefix={<Icon source={SearchIcon} />}
          value={search}
          onChange={setSearch}
          autoComplete="off"
          clearButton
          onClearButtonClick={() => setSearch("")}
        />

        {products.length > 0 && (
          <InlineStack gap="200" wrap>
            {products.map((p) => (
              <span
                key={p.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "#f4f4f3", border: "1px solid #eceae7", borderRadius: 6,
                  padding: "3px 6px 3px 8px", fontSize: 12, fontWeight: 600,
                }}
              >
                {p.title}
                <button
                  type="button"
                  aria-label={`Remove ${p.title}`}
                  onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))}
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            ))}
          </InlineStack>
        )}

        {isLoading ? (
          <InlineStack align="center"><Spinner size="small" /></InlineStack>
        ) : (
          search.trim() && (
            <BlockStack gap="100">
              {results.slice(0, 6).map((p) => {
                const alreadyAdded = products.some((x) => x.id === p.shopifyProductId);
                return (
                <button
                  key={p.shopifyProductId}
                  type="button"
                  onClick={() => add(p)}
                  disabled={alreadyAdded}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "6px 8px", border: "1px solid #e3e1de", borderRadius: 8,
                    background: alreadyAdded ? "#f6f6f7" : "#fff",
                    cursor: alreadyAdded ? "default" : "pointer",
                    textAlign: "left",
                  }}
                >
                  {p.image && (
                    <img src={p.image} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
                  )}
                  <Text as="span" variant="bodySm">{p.title}</Text>
                </button>
                );
              })}
              {results.length === 0 && (
                <Text as="p" variant="bodySm" tone="subdued">No products match that search.</Text>
              )}
            </BlockStack>
          )
        )}

        <Text as="p" variant="bodySm" tone="subdued">
          Leave this empty and the template keeps its sample products, which you can bind in the
          editor afterwards.
        </Text>
      </BlockStack>
    </Panel>
  );
}

function ColorsPanel({ enabled, setEnabled, primaryColor, setPrimaryColor, backgroundColor, setBackgroundColor }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title="Customize colors"
      subtitle="Override the template's own palette"
      open={open}
      onToggle={() => setOpen(!open)}
      badge={enabled ? "On" : null}
    >
      <BlockStack gap="300">
        <Checkbox
          label="Use my own colors instead of the template's"
          checked={enabled}
          onChange={setEnabled}
          helpText="Only recolors what the template already paints - headings, buttons, the contents panel and colored bands. Unpainted sections stay as they are."
        />
        {enabled && (
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
            <ColorField label="Primary color" value={primaryColor} onChange={setPrimaryColor} />
            <ColorField label="Band background" value={backgroundColor} onChange={setBackgroundColor} />
          </InlineGrid>
        )}
      </BlockStack>
    </Panel>
  );
}

function normalizeHexColor(val, fallback = "#000000") {
  if (typeof val !== "string") return fallback;
  const clean = val.trim();
  if (/^#?[0-9a-f]{6}$/i.test(clean)) {
    return (clean.startsWith("#") ? clean : `#${clean}`).toUpperCase();
  }
  if (/^#?[0-9a-f]{3}$/i.test(clean)) {
    const raw = clean.startsWith("#") ? clean.slice(1) : clean;
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toUpperCase();
  }
  return fallback;
}

function ColorField({ label, value, onChange }) {
  const pickerValue = normalizeHexColor(value, "#000000");

  return (
    <BlockStack gap="100">
      <Text as="span" variant="bodySm" fontWeight="semibold">{label}</Text>
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        <input
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={label}
          style={{ width: 36, height: 36, padding: 0, border: "1px solid #e3e1de", borderRadius: 6, cursor: "pointer", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField label={label} labelHidden value={value} onChange={onChange} autoComplete="off" />
        </div>
      </InlineStack>
    </BlockStack>
  );
}

/** Collapsible section, matching the "Customize AI generation" panels in the reference flow. */
function Panel({ title, subtitle, badge, open, onToggle, children }) {
  return (
    <div style={{ border: "1px solid #e3e1de", borderRadius: 10, overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          width: "100%", padding: "12px 14px", background: "#fafafa", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <BlockStack gap="050">
          <Text as="span" variant="bodyMd" fontWeight="semibold">{title}</Text>
          <Text as="span" variant="bodySm" tone="subdued">{subtitle}</Text>
        </BlockStack>
        <InlineStack gap="200" blockAlign="center">
          {badge && <Badge tone="info">{badge}</Badge>}
          <span aria-hidden style={{ fontSize: 12, color: "#6d7175" }}>{open ? "▲" : "▼"}</span>
        </InlineStack>
      </button>
      {open && <Box padding="400">{children}</Box>}
    </div>
  );
}
