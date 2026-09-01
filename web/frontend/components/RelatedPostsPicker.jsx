/**
 * RelatedPostsPicker.jsx
 *
 * Manual "Related posts" override for the post editor. No Shopify-native resource picker exists
 * for internal blog articles (App Bridge's resourcePicker only covers products/collections/files),
 * so this is a custom search-and-pick component hitting this app's own GET /api/posts?search=...
 * endpoint, matching the UX of Magefan SEO Blog Writer's own "Search for a post..." field.
 *
 * Leaving the selection empty falls back to the automatic same-category/shared-tag algorithm
 * (see RelatedPostsService.js) — this component only manages the manual override.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Autocomplete, Icon, InlineStack, Tag, Text, Thumbnail, BlockStack } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

export default function RelatedPostsPicker({ value = [], onChange, excludePostId = null, requireManual = false }) {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const selectedIds = useMemo(() => new Set(value.map((p) => p.id)), [value]);

  const runSearch = useCallback(async (query) => {
    if (!query || !query.trim()) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: query, status: "published", per_page: "10" });
      const res = await fetch(`/api/posts?${params.toString()}`);
      const data = await res.json();
      const results = (data.posts || [])
        .filter((p) => p.id !== excludePostId && !selectedIds.has(p.id))
        .map((p) => ({ value: String(p.id), label: p.title, post: p }));
      setOptions(results);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [excludePostId, selectedIds]);

  const handleInputChange = useCallback((val) => {
    setInputValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 300);
  }, [runSearch]);

  const handleSelect = useCallback((selected) => {
    const id = parseInt(selected[0], 10);
    const option = options.find((o) => o.post.id === id);
    if (option) {
      onChange([...value, option.post]);
    }
    setInputValue("");
    setOptions([]);
  }, [options, value, onChange]);

  const handleRemove = useCallback((id) => {
    onChange(value.filter((p) => p.id !== id));
  }, [value, onChange]);

  const textField = (
    <Autocomplete.TextField
      onChange={handleInputChange}
      label="Related posts"
      labelHidden
      value={inputValue}
      prefix={<Icon source={SearchIcon} />}
      placeholder="Search for a post..."
      autoComplete="off"
      helpText={
        requireManual
          ? "Search and add the articles that should appear as related posts on the storefront."
          : "Optional. When set, these picks override automatic related posts for this article."
      }
    />
  );

  return (
    <BlockStack gap="200">
      <Autocomplete
        options={options}
        selected={[]}
        onSelect={handleSelect}
        loading={loading}
        textField={textField}
      />
      {value.length > 0 && (
        <InlineStack gap="200" wrap>
          {value.map((post) => (
            <Tag key={post.id} onRemove={() => handleRemove(post.id)}>
              <InlineStack gap="100" blockAlign="center" wrap={false}>
                {post.featuredImage && (
                  <Thumbnail source={post.featuredImage} alt="" size="extraSmall" />
                )}
                <div style={{ maxWidth: 200, minWidth: 0 }}>
                  <Text as="span" variant="bodySm" truncate>{post.title}</Text>
                </div>
              </InlineStack>
            </Tag>
          ))}
        </InlineStack>
      )}
    </BlockStack>
  );
}
