import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Select,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  Button,
  Spinner,
  BlockStack,
  InlineStack,
  Banner
} from "@shopify/polaris";
import { useNavigate } from "react-router-dom";
import { ImportIcon } from "@shopify/polaris-icons";

export default function ArticleImporter() {
  const navigate = useNavigate();
  const [blogs, setBlogs] = useState([]);
  const [selectedBlog, setSelectedBlog] = useState("");
  const [articles, setArticles] = useState([]);
  const [loadingBlogs, setLoadingBlogs] = useState(true);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [importingId, setImportingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBlogs();
  }, []);

  const fetchBlogs = async () => {
    setLoadingBlogs(true);
    try {
      const res = await fetch("/api/import/blogs");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setBlogs(data.blogs || []);
      if (data.blogs && data.blogs.length > 0) {
        setSelectedBlog(String(data.blogs[0].id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingBlogs(false);
    }
  };

  useEffect(() => {
    if (selectedBlog) {
      fetchArticles(selectedBlog);
    }
  }, [selectedBlog]);

  const fetchArticles = async (blogId) => {
    setLoadingArticles(true);
    try {
      const res = await fetch(`/api/import/articles?blog_id=${blogId}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setArticles(data.articles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingArticles(false);
    }
  };

  const handleImport = async (articleId) => {
    setImportingId(articleId);
    setError(null);
    try {
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blog_id: selectedBlog, article_id: articleId }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = text;
        try {
          const parsed = JSON.parse(text);
          errMsg = parsed.error || text;
        } catch (_) {}
        throw new Error(errMsg || `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      navigate(`/posts/${data.post_id}/edit`);
    } catch (err) {
      setError(err.message);
      setImportingId(null);
    }
  };

  const blogOptions = blogs.map((b) => ({ label: b.title, value: String(b.id) }));

  return (
    <Page
      breadcrumbs={[{ content: "Dashboard", onAction: () => navigate("/posts") }]}
      title="Import from Shopify Blog"
      subtitle="Select an existing article to import and edit in the visual builder."
    >
      <BlockStack gap="400">
        {error && (
          <Banner title="Import Error" tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card padding="400">
              <BlockStack gap="400">
                {loadingBlogs ? (
                  <InlineStack align="center"><Spinner size="small" /></InlineStack>
                ) : blogs.length === 0 ? (
                  <Text as="p">No Shopify Blogs found. Please create a blog in your Shopify admin first.</Text>
                ) : (
                  <Select
                    label="Select Blog"
                    options={blogOptions}
                    value={selectedBlog}
                    onChange={setSelectedBlog}
                  />
                )}
              </BlockStack>
            </Card>

            {selectedBlog && (
              <Card padding="0">
                {loadingArticles ? (
                  <div style={{ padding: "2rem", textAlign: "center" }}>
                    <Spinner size="large" />
                  </div>
                ) : (
                  <ResourceList
                    resourceName={{ singular: "article", plural: "articles" }}
                    items={articles}
                    renderItem={(item) => {
                      const { id, title, author, published_at, is_imported } = item;
                      return (
                        <ResourceItem id={id} onClick={() => {}} persistActions>
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <Text variant="bodyMd" fontWeight="bold" as="h3">
                                {title}
                              </Text>
                              <Text variant="bodySm" tone="subdued">
                                By {author || "Unknown"} • {published_at ? new Date(published_at).toLocaleDateString() : "Draft"}
                              </Text>
                            </BlockStack>
                            <InlineStack gap="300" blockAlign="center">
                              {is_imported ? (
                                <Badge tone="success">Imported</Badge>
                              ) : null}
                              <Button
                                size="slim"
                                icon={ImportIcon}
                                loading={importingId === id}
                                disabled={importingId !== null && importingId !== id}
                                onClick={() => handleImport(id)}
                              >
                                Import
                              </Button>
                            </InlineStack>
                          </InlineStack>
                        </ResourceItem>
                      );
                    }}
                  />
                )}
              </Card>
            )}
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
