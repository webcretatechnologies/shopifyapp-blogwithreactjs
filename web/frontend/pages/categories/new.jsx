import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { TitleBar } from "@shopify/app-bridge-react";
import { smartBackAction } from "../../utils/smartBack";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Text,
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

  const handleName = (value) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setToastMessage({ content: "Name is required", error: true });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, slug: slug.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't create category");
      navigate(`/categories/${data.category.id}/edit`, { replace: true });
    } catch (err) {
      setToastMessage({ content: err.message, error: true });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Frame>
      <TitleBar title="Add category">
        <button variant="breadcrumb" onClick={() => navigate("/categories")}>
          Categories
        </button>
      </TitleBar>
      {toastMessage && (
        <Toast
          content={toastMessage.content}
          error={toastMessage.error}
          onDismiss={() => setToastMessage(null)}
        />
      )}
      <Page
        title="Add category"
        backAction={smartBackAction(navigate, location, "/categories", "Categories")}
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
                  label="Handle"
                  value={slug}
                  onChange={(v) => {
                    setSlugTouched(true);
                    setSlug(slugify(v));
                  }}
                  autoComplete="off"
                  helpText="Synced as a Shopify tag after Save & Sync so archive links like /blogs/…/tagged/this-handle work."
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
