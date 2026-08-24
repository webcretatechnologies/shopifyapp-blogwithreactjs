import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { TitleBar } from "@shopify/app-bridge-react";
import { smartBackAction } from "../../../utils/smartBack";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Text,
  Toast,
  Frame,
  Modal,
  SkeletonPage,
  SkeletonBodyText,
} from "@shopify/polaris";

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function EditCategory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [category, setCategory] = useState(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [toastMessage, setToastMessage] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/categories/${id}`);
      const data = await res.json();
      if (!res.ok || !data.category) throw new Error(data.error || "Category not found");
      setCategory(data.category);
      setName(data.category.name);
      setSlug(data.category.slug);
    } catch (err) {
      // Skeleton below has no Toast — pass the error to the list page so it actually shows.
      navigate("/categories", {
        replace: true,
        state: { toast: { content: err.message || "Couldn't load category", error: true } },
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = category && (name.trim() !== category.name || slug !== category.slug);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setToastMessage({ content: "Name is required", error: true });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save category");
      setCategory({ ...category, ...data.category });
      setName(data.category.name);
      setSlug(data.category.slug);
      setToastMessage({ content: "Category saved" });
    } catch (err) {
      setToastMessage({ content: err.message, error: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirmName !== category?.name) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't delete category");
      navigate("/categories");
    } catch (err) {
      setToastMessage({ content: err.message, error: true });
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
      setConfirmName("");
    }
  };

  if (isLoading || !category) {
    return (
      <SkeletonPage primaryAction>
        <Layout>
          <Layout.Section>
            <Card>
              <SkeletonBodyText lines={4} />
            </Card>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  return (
    <Frame>
      <TitleBar title={category.name}>
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
        title={category.name}
        backAction={smartBackAction(navigate, location, "/categories", "Categories")}
        primaryAction={{
          content: "Save",
          onAction: handleSave,
          loading: isSaving,
          disabled: !dirty,
        }}
        secondaryActions={[
          {
            content: "Delete",
            destructive: true,
            onAction: () => {
              setConfirmName("");
              setDeleteOpen(true);
            },
          },
        ]}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Name"
                  value={name}
                  onChange={setName}
                  autoComplete="off"
                  maxLength={80}
                  showCharacterCount
                />
                <TextField
                  label="Handle"
                  value={slug}
                  onChange={(v) => setSlug(slugify(v))}
                  autoComplete="off"
                  helpText="Changing the handle updates the Shopify tag on the next Save & Sync. Existing tagged archive URLs that used the old handle will stop matching until then."
                />
                <Text as="p" variant="bodySm" tone="subdued">
                  {category.postCount} post{category.postCount === 1 ? "" : "s"} assigned. Used
                  for related posts (Same category) and the sidebar Categories widget.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      <Modal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setConfirmName("");
        }}
        title={`Delete “${category.name}”?`}
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDelete,
          loading: isDeleting,
          disabled: confirmName !== category.name,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setDeleteOpen(false);
              setConfirmName("");
            },
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Posts keep their content but lose this category. Empty categories never appear in the
            sidebar.
          </Text>
          <div style={{ marginTop: 12 }}>
            <TextField
              label={`Type ${category.name} to confirm`}
              value={confirmName}
              onChange={setConfirmName}
              autoComplete="off"
            />
          </div>
        </Modal.Section>
      </Modal>
    </Frame>
  );
}
