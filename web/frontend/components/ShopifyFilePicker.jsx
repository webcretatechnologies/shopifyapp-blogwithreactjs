import { useState, useEffect, useCallback } from "react";
import { Modal, Grid, Card, Thumbnail, Spinner, Banner, TextField, Button, InlineStack, BlockStack, Text } from "@shopify/polaris";

export default function ShopifyFilePicker({ open, onClose, onSelect }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [after, setAfter] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);

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
      setFiles(prev => [...prev, ...(data.files || [])]);
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Select an image from Shopify"
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error && <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>}
          
          <InlineStack gap="200" align="space-between">
             <div style={{ flex: 1 }}>
               <TextField
                 value={query}
                 onChange={handleSearch}
                 placeholder="Search files..."
                 autoComplete="off"
                 clearButton
                 onClearButtonClick={() => { setQuery(""); setTimeout(() => loadInitial(), 0); }}
                 onKeyPress={(e) => { if(e.key === "Enter") handleSearchSubmit(); }}
               />
             </div>
             <Button onClick={handleSearchSubmit}>Search</Button>
          </InlineStack>

          {loading ? (
            <div style={{ textAlign: "center", padding: "2rem" }}><Spinner /></div>
          ) : files.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <Text tone="subdued">No images found.</Text>
            </div>
          ) : (
            <Grid>
              {files.map((file) => (
                <Grid.Cell key={file.id} columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                  <div 
                     style={{ cursor: "pointer", border: "1px solid #dfe3e8", borderRadius: "8px", overflow: "hidden" }}
                     onClick={() => {
                        onSelect(file.url);
                        onClose();
                     }}
                  >
                     <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6f8" }}>
                        <img src={file.url} alt={file.alt} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                     </div>
                  </div>
                </Grid.Cell>
              ))}
            </Grid>
          )}

          {hasNextPage && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <Button onClick={loadMore} loading={fetchingMore}>Load More</Button>
            </div>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
