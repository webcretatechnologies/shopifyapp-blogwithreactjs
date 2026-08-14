import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Page,
  Layout,
  Card,
  Select,
  IndexTable,
  IndexFilters,
  IndexFiltersMode,
  Text,
  Badge,
  Button,
  Spinner,
  BlockStack,
  InlineStack,
  Banner,
  EmptyState,
  Box,
  Frame,
  Toast,
  ChoiceList,
  Thumbnail,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate, useLocation } from "react-router-dom";
import { smartBackAction } from "../../utils/smartBack";
import { ImportIcon, ArrowLeftIcon } from "@shopify/polaris-icons";
import ConfirmActionModal from "../../components/ConfirmActionModal";

const PER_PAGE = 20;

export default function ArticleImporter() {
  const navigate = useNavigate();
  const location = useLocation();

  // ─── Blog selection ───────────────────────────────────────────────────────
  const [blogs, setBlogs] = useState([]);
  const [selectedBlog, setSelectedBlog] = useState("");
  const [loadingBlogs, setLoadingBlogs] = useState(true);

  // ─── Articles (full list, fetched once per blog) ──────────────────────────
  const [allArticles, setAllArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // ─── Import state ─────────────────────────────────────────────────────────
  const [importingId, setImportingId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [error, setError] = useState(null);
  const [confirmArticle, setConfirmArticle] = useState(null); // article pending import confirmation
  const [confirmError, setConfirmError] = useState(null);

  // ─── IndexFilters state ───────────────────────────────────────────────────
  const [mode, setMode] = useState(IndexFiltersMode.Default);
  const [queryValue, setQueryValue] = useState("");
  const [sortSelected, setSortSelected] = useState(["publishedAt desc"]);
  const [publishStatusFilter, setPublishStatusFilter] = useState([]);
  const [importStatusFilter, setImportStatusFilter] = useState([]);

  // ─── Pagination ───────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);

  // ─── Fetch Blogs ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchBlogs = async () => {
      setLoadingBlogs(true);
      try {
        const res = await fetch("/api/import/blogs");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setBlogs(data.blogs || []);
        if (data.blogs?.length > 0) {
          setSelectedBlog(String(data.blogs[0].id));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingBlogs(false);
      }
    };
    fetchBlogs();
  }, []);

  // ─── Fetch Articles whenever blog changes ─────────────────────────────────
  useEffect(() => {
    if (!selectedBlog) return;
    const fetchArticles = async () => {
      setLoadingArticles(true);
      setAllArticles([]);
      setPage(1);
      setQueryValue("");
      setPublishStatusFilter([]);
      setImportStatusFilter([]);
      try {
        const res = await fetch(`/api/import/articles?blog_id=${selectedBlog}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setAllArticles(data.articles || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingArticles(false);
      }
    };
    fetchArticles();
  }, [selectedBlog]);

  // ─── Import handlers ──────────────────────────────────────────────────────
  // Import writes real data (creates a Post + links it to the live Shopify article) and can't be
  // undone with a single click, so it goes through a confirmation step first — requestImport just
  // opens the modal; confirmImport does the actual work once the merchant confirms.
  const requestImport = (article) => {
    setConfirmError(null);
    setConfirmArticle(article);
  };

  const cancelImport = () => {
    setConfirmArticle(null);
    setConfirmError(null);
  };

  const confirmImport = async () => {
    if (!confirmArticle) return;
    const articleId = confirmArticle.id;
    setImportingId(articleId);
    setConfirmError(null);
    try {
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blog_id: selectedBlog, article_id: articleId }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = text;
        try { errMsg = JSON.parse(text).error || text; } catch (_) {}
        throw new Error(errMsg || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      setConfirmArticle(null);
      setToastMessage({
        content: "Article imported successfully!",
        action: { content: "Edit article", onAction: () => navigate(`/posts/${data.post_id}/edit`) },
      });
      // Mark the article as imported in local state
      setAllArticles((prev) =>
        prev.map((a) => (String(a.id) === String(articleId) ? { ...a, is_imported: true } : a))
      );
    } catch (err) {
      // Surfaced inside the modal, not the page banner behind it — the modal overlay would
      // otherwise hide a page-level error and make the failure look like nothing happened.
      setConfirmError(err.message);
    } finally {
      setImportingId(null);
    }
  };

  // ─── Client-side filtering + sorting ──────────────────────────────────────
  const filteredArticles = useMemo(() => {
    let items = [...allArticles];

    // Search filter
    if (queryValue.trim()) {
      const q = queryValue.toLowerCase();
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.author || "").toLowerCase().includes(q)
      );
    }

    // Publish status filter (independent)
    if (publishStatusFilter.length > 0) {
      const val = publishStatusFilter[0];
      if (val === "published") items = items.filter((a) => a.published_at);
      if (val === "draft") items = items.filter((a) => !a.published_at);
    }

    // Import status filter (independent)
    if (importStatusFilter.length > 0) {
      const val = importStatusFilter[0];
      if (val === "imported") items = items.filter((a) => a.is_imported);
      if (val === "not_imported") items = items.filter((a) => !a.is_imported);
    }

    // Sorting — split "publishedAt desc" → key=publishedAt, dir=desc
    const [sortKey, sortDir] = sortSelected[0].split(" ");
    items.sort((a, b) => {
      let aVal, bVal;
      if (sortKey === "title") {
        aVal = a.title?.toLowerCase() || "";
        bVal = b.title?.toLowerCase() || "";
      } else if (sortKey === "author") {
        aVal = (a.author || "").toLowerCase();
        bVal = (b.author || "").toLowerCase();
      } else {
        // publishedAt — drafts (no date) sort to the end
        aVal = a.published_at ? new Date(a.published_at).getTime() : (sortDir === "asc" ? Infinity : -Infinity);
        bVal = b.published_at ? new Date(b.published_at).getTime() : (sortDir === "asc" ? Infinity : -Infinity);
      }
      if (sortDir === "asc") return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });

    return items;
  }, [allArticles, queryValue, publishStatusFilter, importStatusFilter, sortSelected]);

  // ─── Pagination slice ─────────────────────────────────────────────────────
  const totalFiltered = filteredArticles.length;
  const paginatedArticles = filteredArticles.slice(
    (page - 1) * PER_PAGE,
    page * PER_PAGE
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [queryValue, publishStatusFilter, importStatusFilter, sortSelected]);

  // ─── IndexFilters config ──────────────────────────────────────────────────
  // NOTE: Polaris requires the `asc` variant to come FIRST in each label group
  // so the direction toggle arrows work correctly.
  const sortOptions = [
    { label: "Date published", value: "publishedAt asc", directionLabel: "Oldest first" },
    { label: "Date published", value: "publishedAt desc", directionLabel: "Newest first" },
    { label: "Title", value: "title asc", directionLabel: "A–Z" },
    { label: "Title", value: "title desc", directionLabel: "Z–A" },
    { label: "Author", value: "author asc", directionLabel: "A–Z" },
    { label: "Author", value: "author desc", directionLabel: "Z–A" },
  ];

  const filters = [
    {
      key: "publishStatus",
      label: "Publish status",
      filter: (
        <ChoiceList
          title="Publish status"
          titleHidden
          choices={[
            { label: "Published", value: "published" },
            { label: "Draft", value: "draft" },
          ]}
          selected={publishStatusFilter}
          onChange={setPublishStatusFilter}
          allowMultiple={false}
        />
      ),
      shortcut: true,
    },
    {
      key: "importStatus",
      label: "Import status",
      filter: (
        <ChoiceList
          title="Import status"
          titleHidden
          choices={[
            { label: "Already imported", value: "imported" },
            { label: "Not yet imported", value: "not_imported" },
          ]}
          selected={importStatusFilter}
          onChange={setImportStatusFilter}
          allowMultiple={false}
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = [];
  if (publishStatusFilter.length > 0) {
    const labelMap = { published: "Published", draft: "Draft" };
    appliedFilters.push({
      key: "publishStatus",
      label: `Status: ${labelMap[publishStatusFilter[0]] || publishStatusFilter[0]}`,
      onRemove: () => setPublishStatusFilter([]),
    });
  }
  if (importStatusFilter.length > 0) {
    const labelMap = { imported: "Already imported", not_imported: "Not yet imported" };
    appliedFilters.push({
      key: "importStatus",
      label: `Import: ${labelMap[importStatusFilter[0]] || importStatusFilter[0]}`,
      onRemove: () => setImportStatusFilter([]),
    });
  }

  const blogOptions = blogs.map((b) => ({ label: b.title, value: String(b.id) }));

  // ─── Table rows ───────────────────────────────────────────────────────────
  const rowMarkup = paginatedArticles.map((article, index) => {
    const { id, title, author, published_at, is_imported, image, image_alt } = article;
    const isPublished = Boolean(published_at);

    return (
      <IndexTable.Row id={String(id)} key={id} position={index}>
        {/* Title */}
        <IndexTable.Cell>
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            {image ? (
              <Thumbnail source={image} alt={image_alt || title} size="small" />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: isPublished ? "#e8f5e9" : "#f1f2f3",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                {isPublished ? "📄" : "📝"}
              </div>
            )}
            {/* Long titles were wrapping to a second line, making that row disproportionately
                tall and visually broken next to single-line rows — truncate to one line with
                an ellipsis instead, same as every other admin table in this app. Needs an
                explicit max-width since a flex child otherwise just grows to fit its content,
                which defeats truncate entirely. */}
            <div style={{ maxWidth: 320, minWidth: 0 }}>
              <Text variant="bodyMd" fontWeight="semibold" truncate>
                {title}
              </Text>
            </div>
          </InlineStack>
        </IndexTable.Cell>

        {/* Author */}
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued">
            {author || "—"}
          </Text>
        </IndexTable.Cell>

        {/* Publish Status */}
        <IndexTable.Cell>
          <Badge tone={isPublished ? "success" : "info"}>
            {isPublished ? "Published" : "Draft"}
          </Badge>
        </IndexTable.Cell>

        {/* Published date */}
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued">
            {published_at
              ? new Date(published_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "—"}
          </Text>
        </IndexTable.Cell>

        {/* Import status */}
        <IndexTable.Cell>
          {is_imported ? (
            <Badge tone="success" progress="complete">
              Imported
            </Badge>
          ) : (
            <Text variant="bodySm" tone="subdued">
              —
            </Text>
          )}
        </IndexTable.Cell>

        {/* Action */}
        <IndexTable.Cell>
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              size="slim"
              icon={ImportIcon}
              loading={importingId === id}
              disabled={is_imported || (importingId !== null && importingId !== id)}
              onClick={() => requestImport(article)}
            >
              {is_imported ? "Imported" : "Import"}
            </Button>
          </div>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Frame>
      <TitleBar title="Import from Shopify" />

      {toastMessage && (
        <Toast
          content={toastMessage.content}
          error={toastMessage.error}
          action={toastMessage.action}
          onDismiss={() => setToastMessage(null)}
          duration={6000}
        />
      )}

      <ConfirmActionModal
        open={!!confirmArticle}
        title="Import this article?"
        body={
          confirmArticle
            ? `"${confirmArticle.title}" will be copied into the visual editor as a new post, ready to edit. This doesn't change or remove anything on Shopify.`
            : ""
        }
        confirmText="Import article"
        confirmTone="primary"
        onConfirm={confirmImport}
        onCancel={cancelImport}
        loading={importingId !== null}
        error={confirmError}
      />

      <Page
        backAction={smartBackAction(navigate, location, "/posts", "Articles")}
        title="Import from Shopify"
        subtitle="Select articles from your existing Shopify blogs to import into the visual editor."
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {error && (
                <Banner
                  title="Import Error"
                  tone="critical"
                  onDismiss={() => setError(null)}
                >
                  {error}
                </Banner>
              )}

              {/* ─── Blog Selector Card ─── */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingSm" fontWeight="semibold">
                    Select Blog
                  </Text>
                  {loadingBlogs ? (
                    <InlineStack align="center">
                      <Spinner size="small" />
                    </InlineStack>
                  ) : blogs.length === 0 ? (
                    <Banner tone="warning">
                      No Shopify blogs found. Please create a blog in your
                      Shopify Admin first.
                    </Banner>
                  ) : (
                    <Select
                      label="Blog"
                      labelHidden
                      options={blogOptions}
                      value={selectedBlog}
                      onChange={(val) => setSelectedBlog(val)}
                    />
                  )}
                  {selectedBlog && !loadingArticles && (
                    <Text variant="bodySm" tone="subdued">
                      {totalFiltered.toLocaleString()} article
                      {totalFiltered !== 1 ? "s" : ""} found
                      {queryValue || publishStatusFilter.length > 0 || importStatusFilter.length > 0
                        ? " (filtered)"
                        : ` in this blog`}
                    </Text>
                  )}
                </BlockStack>
              </Card>

              {/* ─── Articles Table ─── */}
              {selectedBlog && (
                <Card padding="0">
                  <IndexFilters
                    canCreateNewView={false}
                    sortOptions={sortOptions}
                    sortSelected={sortSelected}
                    queryValue={queryValue}
                    queryPlaceholder="Search articles by title or author..."
                    onQueryChange={(val) => setQueryValue(val)}
                    onQueryClear={() => setQueryValue("")}
                    onSort={setSortSelected}
                    primaryAction={null}
                    cancelAction={{
                      onAction: () => {},
                      disabled: false,
                      loading: false,
                    }}
                    tabs={[{ content: "All articles", id: "all-articles-0" }]}
                    selected={0}
                    onSelect={() => {}}
                    filters={filters}
                    appliedFilters={appliedFilters}
                    onClearAll={() => {
                      setQueryValue("");
                      setPublishStatusFilter([]);
                      setImportStatusFilter([]);
                    }}
                    mode={mode}
                    setMode={setMode}
                  />

                  {loadingArticles ? (
                    <Box padding="800" align="center">
                      <BlockStack gap="400" align="center">
                        <Spinner />
                        <Text variant="bodySm" tone="subdued">
                          Loading articles from Shopify…
                        </Text>
                      </BlockStack>
                    </Box>
                  ) : paginatedArticles.length === 0 ? (
                    <Box padding="800">
                      <EmptyState
                        heading={
                          queryValue || publishStatusFilter.length > 0 || importStatusFilter.length > 0
                            ? "No articles match your filters"
                            : "No articles found in this blog"
                        }
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        action={
                          queryValue || publishStatusFilter.length > 0 || importStatusFilter.length > 0
                            ? {
                                content: "Clear filters",
                                onAction: () => {
                                  setQueryValue("");
                                  setPublishStatusFilter([]);
                                  setImportStatusFilter([]);
                                },
                              }
                            : undefined
                        }
                      >
                        <p>
                          {queryValue || publishStatusFilter.length > 0 || importStatusFilter.length > 0
                            ? "Try adjusting your search or filter criteria."
                            : "This blog has no articles yet. Create some in your Shopify Admin."}
                        </p>
                      </EmptyState>
                    </Box>
                  ) : (
                    <IndexTable
                      resourceName={{ singular: "article", plural: "articles" }}
                      itemCount={paginatedArticles.length}
                      headings={[
                        { title: "Article" },
                        { title: "Author" },
                        { title: "Status" },
                        { title: "Published" },
                        { title: "Imported" },
                        { title: "", hidden: true },
                      ]}
                      selectable={false}
                      pagination={{
                        hasNext: page * PER_PAGE < totalFiltered,
                        hasPrevious: page > 1,
                        onNext: () => setPage((p) => p + 1),
                        onPrevious: () => setPage((p) => p - 1),
                        label: `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, totalFiltered)} of ${totalFiltered}`,
                      }}
                    >
                      {rowMarkup}
                    </IndexTable>
                  )}
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
