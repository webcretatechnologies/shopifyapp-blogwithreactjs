import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { TitleBar } from "@shopify/app-bridge-react";
import AiCreditTitleAction from "../../components/AiCreditTitleAction";
import { smartBackAction } from "../../utils/smartBack";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Text,
  Button,
  Toast,
  Frame,
} from "@shopify/polaris";

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function NewCategory() {
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const saveBarId = "category-new-save-bar";
  const isSavingRef = useRef(false);

  const isDirty = Boolean(name.trim());

  const hideSaveBar = async () => {
    if (!window.shopify?.saveBar) return;
    try {
      await window.shopify.saveBar.hide(saveBarId);
    } catch (e) {}
  };

  const leaveCategory = async (destination) => {
    await hideSaveBar();
    navigate(destination);
  };

  const handleName = (value) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSave = async () => {
    if (isSavingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setToastMessage({ content: "Name is required", error: true });
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, slug: slug.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't create category");
      await hideSaveBar();
      navigate(`/categories/${data.category.id}/edit`, {
        replace: true,
        state: { toast: { content: `Created “${data.category.name}”` } },
      });
    } catch (err) {
      setToastMessage({ content: err.message, error: true });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setName("");
    setSlug("");
    setSlugTouched(false);
    void hideSaveBar();
  };

  // Keep the custom element mounted at all times. Shopify's saveBar.show()/hide()
  // controls visibility; conditional mounting races that imperative call and can
  // leave the admin chrome stuck or missing after a field change.
  useEffect(() => {
    if (!window.shopify?.saveBar) return;
    const action = isDirty ? window.shopify.saveBar.show(saveBarId) : window.shopify.saveBar.hide(saveBarId);
    action?.catch(() => {});
  }, [isDirty]);

  useEffect(() => () => { void hideSaveBar(); }, []);

  return (
    <Frame>
      <TitleBar title="Add category">
        <AiCreditTitleAction />
        <button variant="breadcrumb" onClick={() => leaveCategory("/categories")}>
          Categories
        </button>
      </TitleBar>
      <ui-save-bar id={saveBarId}>
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined} disabled={isSaving ? "" : undefined}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </ui-save-bar>
      {isDirty && !window.shopify && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, backgroundColor: "#1a1a1a", color: "#ffffff", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>Unsaved changes</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button onClick={handleDiscard}>Discard</Button>
            <Button variant="primary" loading={isSaving} onClick={handleSave}>Save</Button>
          </div>
        </div>
      )}
      {toastMessage && (
        <Toast
          content={toastMessage.content}
          error={toastMessage.error}
          onDismiss={() => setToastMessage(null)}
        />
      )}
      <Page
        title="Add category"
        backAction={smartBackAction(leaveCategory, location, "/categories", "Categories")}
        primaryAction={{
          content: "Save",
          onAction: handleSave,
          loading: isSaving,
          disabled: !name.trim(),
        }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Name"
                  value={name}
                  onChange={handleName}
                  autoComplete="off"
                  maxLength={80}
                  showCharacterCount
                />
                <TextField
                  label="Category archive URL"
                  value={slug}
                  onChange={(v) => {
                    setSlugTouched(true);
                    setSlug(slugify(v));
                  }}
                  autoComplete="off"
                  prefix="blogs/{blog-handle}/tagged/"
                  helpText="The handle is synced as a Shopify tag after Save & Sync. Replace {blog-handle} with the handle of the blog that contains the article."
                />
                <Text as="p" variant="bodySm" tone="subdued">
                  Assign this category on each article from the editor. Used for related posts
                  (Same category) and the sidebar Categories widget.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
