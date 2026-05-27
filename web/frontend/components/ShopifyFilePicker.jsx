import { useState, useEffect, useCallback, useRef } from "react";
import {
  Grid,
  Spinner,
  Banner,
  TextField,
  Button,
  InlineStack,
  BlockStack,
  Text,
} from "@shopify/polaris";

export default function ShopifyFilePicker({ open, onClose, onSelect }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [after, setAfter] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef(null);

  const fetchFiles = useCallback(async (cursor = null, search = "") => {
    try {
      const q = new URLSearchParams();
      if (cursor) q.append("after", cursor);
      if (search) q.append("query", search);

      const res = await fetch(`/api/posts/shopify/files?${q.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load files");

      return data;
    } catch (err) {
      throw err;
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFiles(null, query);
      setFiles(data.files || []);
      setHasNextPage(data.pageInfo?.hasNextPage || false);
      setAfter(data.pageInfo?.endCursor || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchFiles, query]);

  useEffect(() => {
    if (open) {
      loadInitial();
    }
  }, [open, loadInitial]);

  const loadMore = async () => {
    if (!hasNextPage || !after || fetchingMore) return;
    setFetchingMore(true);
    try {
      const data = await fetchFiles(after, query);
      setFiles((prev) => [...prev, ...(data.files || [])]);
      setHasNextPage(data.pageInfo?.hasNextPage || false);
      setAfter(data.pageInfo?.endCursor || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetchingMore(false);
    }
  };

  const handleSearch = (val) => {
    setQuery(val);
  };

  const handleSearchSubmit = () => {
    loadInitial();
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/posts/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      
      // Immediately select the newly uploaded file and close the modal.
      // This works gracefully even if the upload fell back to local storage.
      if (data.url) {
        onSelect(data.url);
        onClose();
      } else {
        await loadInitial();
      }
    } catch (err) {
      setError("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onEsc = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          border: "1px solid #e1e3e5",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            background: "#fff",
            borderBottom: "1px solid #e1e3e5",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <Text variant="headingMd" as="h2">Select an image from Shopify</Text>
          <Button onClick={onClose}>Close</Button>
        </div>

        <div style={{ padding: "16px" }}>
          <BlockStack gap="400">
            {error && (
              <Banner tone="critical" onDismiss={() => setError(null)}>
                {error}
              </Banner>
            )}

            <InlineStack gap="200" align="space-between">
              <div style={{ flex: 1 }}>
                <TextField
                  value={query}
                  onChange={handleSearch}
                  placeholder="Search files..."
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => {
                    setQuery("");
                    setTimeout(() => loadInitial(), 0);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") handleSearchSubmit();
                  }}
                />
              </div>
              <Button onClick={handleSearchSubmit}>Search</Button>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleUpload}
              />
              <Button
                primary
                onClick={() => fileInputRef.current?.click()}
                loading={uploading}
              >
                Add media
              </Button>
            </InlineStack>

            {loading ? (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <Spinner />
              </div>
            ) : files.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <Text tone="subdued">No images found.</Text>
              </div>
            ) : (
              <Grid>
                {files.map((file) => (
                  <Grid.Cell
                    key={file.id}
                    columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}
                  >
                    <div
                      style={{
                        cursor: "pointer",
                        border: "1px solid #dfe3e8",
                        borderRadius: "8px",
                        overflow: "hidden",
                      }}
                      onClick={() => {
                        onSelect(file.url);
                        onClose();
                      }}
                    >
                      <div
                        style={{
                          height: "120px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#f4f6f8",
                        }}
                      >
                        <img
                          src={file.url}
                          alt={file.alt}
                          style={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    </div>
                  </Grid.Cell>
                ))}
              </Grid>
            )}

            {hasNextPage && (
              <div style={{ textAlign: "center", marginTop: "1rem" }}>
                <Button onClick={loadMore} loading={fetchingMore}>
                  Load More
                </Button>
              </div>
            )}
          </BlockStack>
        </div>
      </div>
    </div>
  );
}
