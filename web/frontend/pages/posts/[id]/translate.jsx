import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Button,
  Select,
  TextField,
  Divider,
  Toast,
  Frame,
  Spinner,
  Box,
  Banner,
  ContextualSaveBar,
} from "@shopify/polaris";
import { ArrowLeftIcon, LanguageIcon, AlertCircleIcon } from "@shopify/polaris-icons";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";

// Helper component for side-by-side field translation
function TranslationRow({ title, originalContent, isHtml, children }) {
  return (
    <BlockStack gap="300">
      <Text variant="headingSm" as="h3">{title}</Text>
      <InlineGrid columns={['oneHalf', 'oneHalf']} gap="400" alignItems="start">
        {/* Original Content Box */}
        <Box 
          padding="300" 
          background="bg-surface-secondary" 
          borderRadius="200"
          borderWidth="025"
          borderColor="border-subdued"
        >
          {isHtml ? (
            <div 
              style={{ maxHeight: '400px', overflowY: 'auto', fontSize: '14px', lineHeight: '1.5' }}
              dangerouslySetInnerHTML={{ __html: originalContent || "<p><em>No content provided.</em></p>" }} 
            />
          ) : (
            <Text as="p" tone={originalContent ? "base" : "subdued"} breakWord>
              {originalContent || "No content provided."}
            </Text>
          )}
        </Box>
        {/* Translated Content Box */}
        <Box>
          {children}
        </Box>
      </InlineGrid>
    </BlockStack>
  );
}

export default function PostTranslationPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translations, setTranslations] = useState([]);
  const [storeLocales, setStoreLocales] = useState([]);
  
  // Selected locale for translation
  const [selectedLocale, setSelectedLocale] = useState("");
  const [toast, setToast] = useState(null);

  // Form Fields
  const [translatedTitle, setTranslatedTitle] = useState("");
  const [translatedExcerpt, setTranslatedExcerpt] = useState("");
  const [translatedContent, setTranslatedContent] = useState("");
  const [translatedMetaTitle, setTranslatedMetaTitle] = useState("");
  const [translatedMetaDesc, setTranslatedMetaDesc] = useState("");

  // Track if changes have been made (dirty state)
  const [isDirty, setIsDirty] = useState(false);

  const loadTranslations = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${id}/translations`);
      const data = await res.json();
      setTranslations(data.translations || []);
    } catch {}
  }, [id]);

  const loadLocales = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/shopify/locales`);
      const data = await res.json();
      const mappedLocales = (data.locales || []).map(l => ({
        label: `${l.name} (${l.locale})`,
        value: l.locale,
      }));
      setStoreLocales(mappedLocales);
      if (mappedLocales.length > 0) {
        setSelectedLocale(mappedLocales[0].value);
      }
    } catch {}
  }, []);

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
    loadLocales();
  }, [id, loadTranslations, loadLocales]);

  // Load existing translation into form when locale changes
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
    setIsDirty(false); // Reset dirty state on language change
  }, [selectedLocale, translations]);

  // Handlers for input changes (marks form as dirty)
  const handleFieldChange = (setter) => (value) => {
    setter(value);
    setIsDirty(true);
  };

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
      setIsDirty(false);
      await loadTranslations();
    } catch {
      setToast({ content: "❌ Failed to save translation", error: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (!post || !selectedLocale) return;
    setToast({ content: "🪄 Translating content..." });
    setIsTranslating(true);
    
    try {
      const res = await fetch(`/api/posts/${id}/translate-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: selectedLocale }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Auto-translate failed");
      
      setToast({ content: "✨ Translation generated and saved successfully!" });
      
      // Update UI fields
      if (data.translation) {
        setTranslatedTitle(data.translation.title || "");
        setTranslatedExcerpt(data.translation.excerpt || "");
        setTranslatedContent(data.translation.contentHtml || "");
        setTranslatedMetaTitle(data.translation.metaTitle || "");
        setTranslatedMetaDesc(data.translation.metaDescription || "");
        setIsDirty(false); // It's saved immediately by the backend
      }
      
      await loadTranslations();
    } catch (err) {
      setToast({ content: `❌ ${err.message}`, error: true });
    } finally {
      setIsTranslating(false);
    }
  };

  if (isLoading) {
    return (
      <Frame>
        <Page>
          <Box padding="800" align="center">
            <Spinner />
          </Box>
        </Page>
      </Frame>
    );
  }

  if (!post) {
    return (
      <Frame>
        <Page title="Post Not Found">
          <Banner tone="critical">
            The requested article could not be loaded.
          </Banner>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      {toast && (
        <Toast
          content={toast.content}
          error={toast.error}
          onDismiss={() => setToast(null)}
        />
      )}
      
      {/* Contextual Save Bar for unsaved changes */}
      {isDirty && (
        <ContextualSaveBar
          message="Unsaved translation changes"
          saveAction={{
            onAction: handleSave,
            loading: isSaving,
          }}
          discardAction={{
            onAction: () => {
              // Re-trigger the useEffect to reload original fields
              const found = translations.find((t) => t.locale === selectedLocale);
              setTranslatedTitle(found?.title || "");
              setTranslatedExcerpt(found?.excerpt || "");
              setTranslatedContent(found?.contentHtml || "");
              setTranslatedMetaTitle(found?.metaTitle || "");
              setTranslatedMetaDesc(found?.metaDescription || "");
              setIsDirty(false);
            },
          }}
        />
      )}

      <Page
        backAction={{
          content: "Back to Edit",
          onAction: () => navigate(`/posts/${id}/edit`),
          icon: ArrowLeftIcon,
        }}
        title="Translate Post"
        subtitle={`Translating: ${post.title}`}
      >
        <Layout>
          {/* Header Context Bar */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Box width="300px">
                    <Select
                      label="Target Language"
                      labelHidden
                      options={storeLocales}
                      value={selectedLocale}
                      onChange={(newLocale) => {
                        if (isDirty) {
                          // Note: In a production app, we'd show a modal here to warn about unsaved changes.
                          // For simplicity, we just discard and switch.
                        }
                        setSelectedLocale(newLocale);
                      }}
                      disabled={storeLocales.length === 0}
                    />
                  </Box>
                  <Button
                    icon={LanguageIcon}
                    onClick={handleAutoTranslate}
                    loading={isTranslating}
                    disabled={storeLocales.length === 0}
                  >
                    Auto-Translate this Language
                  </Button>
                </InlineStack>
                {storeLocales.length === 0 && (
                  <Banner tone="warning" icon={AlertCircleIcon}>
                    No active secondary languages found in your store. Add and publish languages in your Shopify Settings.
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Core Fields */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Content</Text>
                
                <TranslationRow title="Title" originalContent={post.title} isHtml={false}>
                  <TextField
                    label="Translated Title"
                    labelHidden
                    value={translatedTitle}
                    onChange={handleFieldChange(setTranslatedTitle)}
                    autoComplete="off"
                  />
                </TranslationRow>

                <Divider />

                <TranslationRow title="Excerpt" originalContent={post.excerpt} isHtml={false}>
                  <TextField
                    label="Translated Excerpt"
                    labelHidden
                    value={translatedExcerpt}
                    onChange={handleFieldChange(setTranslatedExcerpt)}
                    multiline={3}
                    autoComplete="off"
                  />
                </TranslationRow>

                <Divider />

                <TranslationRow title="Content (HTML)" originalContent={post.contentHtml} isHtml={true}>
                  <TextField
                    label="Translated Content HTML"
                    labelHidden
                    value={translatedContent}
                    onChange={handleFieldChange(setTranslatedContent)}
                    multiline={12}
                    autoComplete="off"
                    monospaced
                  />
                </TranslationRow>

              </BlockStack>
            </Card>
          </Layout.Section>

          {/* SEO Fields */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Search Engine Optimization</Text>
                
                <TranslationRow title="Meta Title" originalContent={post.metaTitle || post.title} isHtml={false}>
                  <TextField
                    label="Translated Meta Title"
                    labelHidden
                    value={translatedMetaTitle}
                    onChange={handleFieldChange(setTranslatedMetaTitle)}
                    maxLength={70}
                    showCharacterCount
                    autoComplete="off"
                  />
                </TranslationRow>

                <Divider />

                <TranslationRow title="Meta Description" originalContent={post.metaDescription || post.excerpt} isHtml={false}>
                  <TextField
                    label="Translated Meta Description"
                    labelHidden
                    value={translatedMetaDesc}
                    onChange={handleFieldChange(setTranslatedMetaDesc)}
                    maxLength={160}
                    showCharacterCount
                    multiline={3}
                    autoComplete="off"
                  />
                </TranslationRow>

              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
