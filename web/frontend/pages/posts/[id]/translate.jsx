import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Select,
  TextField, Divider, Toast, Frame, Spinner, Box, Badge, Banner
} from "@shopify/polaris";
import { SaveIcon, ArrowLeftIcon, LanguageIcon } from "@shopify/polaris-icons";
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

const LOCALES = [
  { label: "Arabic (ar)", value: "ar" },
  { label: "French (fr)", value: "fr" },
  { label: "German (de)", value: "de" },
  { label: "Spanish (es)", value: "es" },
  { label: "Japanese (ja)", value: "ja" },
  { label: "Chinese (zh)", value: "zh" },
  { label: "Portuguese (pt)", value: "pt" },
  { label: "Dutch (nl)", value: "nl" },
  { label: "Italian (it)", value: "it" },
];

export default function PostTranslationPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [translations, setTranslations] = useState([]);
  const [selectedLocale, setSelectedLocale] = useState("ar");
  const [toast, setToast] = useState(null);

  // Translation Form Fields
  const [translatedTitle, setTranslatedTitle] = useState("");
  const [translatedExcerpt, setTranslatedExcerpt] = useState("");
  const [translatedContent, setTranslatedContent] = useState("");
  const [translatedMetaTitle, setTranslatedMetaTitle] = useState("");
  const [translatedMetaDesc, setTranslatedMetaDesc] = useState("");

  const loadTranslations = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${id}/translations`);
      const data = await res.json();
      setTranslations(data.translations || []);
    } catch {}
  }, [id]);

  useEffect(() => {
    async function loadPost() {
      try {
        const res = await fetch(`/api/posts/${id}`);
        const data = await res.json();
        setPost(data.post);
      } catch {
      } finally {
        setIsLoading(false);
      }
    }
    loadPost();
    loadTranslations();
  }, [id, loadTranslations]);

  // Sync translation form fields when active locale changes
  useEffect(() => {
    const found = translations.find((t) => t.locale === selectedLocale);
    if (found) {
      setTranslatedTitle(found.title || "");
      setTranslatedExcerpt(found.excerpt || "");
      setTranslatedContent(found.contentHtml || "");
      setTranslatedMetaTitle(found.metaTitle || "");
      setTranslatedMetaDesc(found.metaDescription || "");
    } else {
      setTranslatedTitle("");
      setTranslatedExcerpt("");
      setTranslatedContent("");
      setTranslatedMetaTitle("");
      setTranslatedMetaDesc("");
    }
  }, [selectedLocale, translations]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/posts/${id}/translations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: selectedLocale,
          title: translatedTitle,
          excerpt: translatedExcerpt,
          contentHtml: translatedContent,
          metaTitle: translatedMetaTitle,
          metaDescription: translatedMetaDesc,
        }),
      });
      if (!res.ok) throw new Error("Save translation failed");
      setToast({ content: "✅ Translation saved successfully" });
      await loadTranslations();
    } catch {
      setToast({ content: "❌ Failed to save translation", error: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoTranslate = () => {
    if (!post) return;
    setToast({ content: "🪄 Simulating Auto-Translate..." });
    // Simulate auto-translate using a mock service delay
    setTimeout(() => {
      setTranslatedTitle(`[Translated ${selectedLocale.toUpperCase()}] ${post.title}`);
      setTranslatedExcerpt(`[Translated ${selectedLocale.toUpperCase()}] ${post.excerpt || ""}`);
      setTranslatedContent(`[Translated ${selectedLocale.toUpperCase()}]\n${post.contentHtml || ""}`);
      setTranslatedMetaTitle(`[Translated ${selectedLocale.toUpperCase()}] ${post.metaTitle || ""}`);
      setTranslatedMetaDesc(`[Translated ${selectedLocale.toUpperCase()}] ${post.metaDescription || ""}`);
      setToast({ content: "✨ Auto-translation generated!" });
    }, 800);
  };

  if (isLoading) {
    return (
      <Frame>
        <Page><Box padding="800" align="center"><Spinner /></Box></Page>
      </Frame>
    );
  }

  if (!post) {
    return (
      <Frame>
        <Page title="Post Not Found">
          <Banner tone="critical">The requested article could not be loaded.</Banner>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      {toast && <Toast content={toast.content} error={toast.error} onDismiss={() => setToast(null)} />}
      <Page
        backAction={{ content: "Back to Edit", onAction: () => navigate(`/posts/${id}/edit`), icon: ArrowLeftIcon }}
        title={`Translate: ${post.title}`}
        subtitle="Manage multi-language translations of this article for storefront localization"
        primaryAction={{ content: "Save Translation", icon: SaveIcon, loading: isSaving, onAction: handleSave }}
      >
        <Layout>
          {/* Left panel: Original post Reference */}
          <Layout.Section variant="oneHalf">
            <BlockStack gap="400">
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd">📝 Original Content (English)</Text>
                    <Divider />
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="bold">Title</Text>
                      <Text variant="bodyMd">{post.title}</Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="bold">Excerpt</Text>
                      <Text variant="bodyMd" tone="subdued">{post.excerpt || "No excerpt added."}</Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="bold">Content HTML Preview</Text>
                      <div
                        style={{
                          maxHeight: "300px",
                          overflowY: "auto",
                          padding: "12px",
                          border: "1px solid #e1e3e5",
                          borderRadius: "6px",
                          fontSize: "14px",
                          lineHeight: "1.6",
                          background: "#f9fafb",
                        }}
                        dangerouslySetInnerHTML={{ __html: post.contentHtml || "" }}
                      />
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Right panel: Target Translation Form */}
          <Layout.Section variant="oneHalf">
            <BlockStack gap="400">
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd">🌍 Localized Content</Text>
                      <Button size="slim" icon={LanguageIcon} onClick={handleAutoTranslate}>Auto-Translate</Button>
                    </InlineStack>
                    <Divider />
                    <Select
                      label="Target Language"
                      options={LOCALES}
                      value={selectedLocale}
                      onChange={setSelectedLocale}
                    />
                    <TextField
                      label="Translated Title"
                      value={translatedTitle}
                      onChange={setTranslatedTitle}
                      autoComplete="off"
                    />
                    <TextField
                      label="Translated Excerpt"
                      value={translatedExcerpt}
                      onChange={setTranslatedExcerpt}
                      multiline={3}
                      autoComplete="off"
                    />
                    <TextField
                      label="Translated Content HTML"
                      value={translatedContent}
                      onChange={setTranslatedContent}
                      multiline={8}
                      autoComplete="off"
                      monospaced
                    />
                  </BlockStack>
                </Box>
              </Card>

              {/* Translation SEO Meta Card */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    <Text variant="headingMd">🔍 Localized SEO Settings</Text>
                    <Divider />
                    <TextField
                      label="Meta Title"
                      value={translatedMetaTitle}
                      onChange={setTranslatedMetaTitle}
                      maxLength={70}
                      showCharacterCount
                      autoComplete="off"
                    />
                    <TextField
                      label="Meta Description"
                      value={translatedMetaDesc}
                      onChange={setTranslatedMetaDesc}
                      maxLength={160}
                      showCharacterCount
                      multiline={3}
                      autoComplete="off"
                    />
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
