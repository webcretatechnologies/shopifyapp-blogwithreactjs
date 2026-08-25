/**
 * ConflictResolutionModal — Field-level diff view and resolution for sync conflicts.
 * Shows which specific fields have conflicts and lets the user resolve each field independently.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Spinner,
  Scrollable,
  RadioButton,
} from "@shopify/polaris";

/**
 * Format a label for the field name (capitalize, add spaces).
 */
function formatFieldName(field) {
  const map = {
    title: "Title",
    author: "Author",
    status: "Status",
    tags: "Tags",
    featuredImage: "Featured Image",
    featuredImageAlt: "Image Alt Text",
    metaTitle: "SEO Meta Title",
    metaDescription: "SEO Meta Description",
    content: "Content",
  };
  return map[field] || field.charAt(0).toUpperCase() + field.slice(1);
}

/**
 * Format a value for display in the diff view.
 */
function formatValue(field, value) {
  if (value === null || value === undefined) return "—";
  if (field === "status") return value === "published" ? "Published" : "Draft";
  if (field === "featuredImage") return value || "None";
  if (field === "tags" && Array.isArray(value)) return value.join(", ") || "None";
  if (field === "tags" && typeof value === "string") return value || "None";
  if (field === "content" && typeof value === "object") {
    if (value.storefrontHtml) return `${value.storefrontHtml.substring(0, 200)}...`;
    if (value.editorHtml) return `${value.editorHtml.substring(0, 200)}...`;
    return "[Structured content]";
  }
  return String(value);
}

/**
 * Single-field resolution row — shows local vs remote with radio buttons to choose.
 */
function FieldResolutionRow({ field, conflict, resolution, onChange }) {
  // React text nodes escape automatically — use formatValue (not String()+escapeHtml) so
  // content objects and HTML compare as readable text, not "[object Object]" / "&lt;...".
  const localLabel = formatValue(field, conflict.local).substring(0, 500);
  const remoteLabel = formatValue(field, conflict.remote).substring(0, 500);

  return (
    <Box
      padding="300"
      borderWidth="1"
      borderColor="border-warning"
      borderRadius="100"
      background="bg-warning-subdued"
    >
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center">
          <Text variant="headingSm" fontWeight="semibold">
            {formatFieldName(field)}
          </Text>
          <Badge tone="critical" size="small">Conflict</Badge>
        </InlineStack>

        <InlineStack gap="400" wrap={false} align="space-between">
          {/* Local option */}
          <Box padding="200" borderRadius="075" background="bg-surface" minWidth="200">
            <BlockStack gap="100">
              <InlineStack gap="100" blockAlign="center">
                <RadioButton
                  label=""
                  name={`field-${field}`}
                  checked={resolution === "local"}
                  onChange={() => onChange(field, "local")}
                  id={`${field}-local`}
                />
                <Text variant="bodyXs" tone="subdued" as="span">Local</Text>
              </InlineStack>
              <Box
                as="pre"
                padding="150"
                background="bg-surface-secondary"
                borderRadius="075"
                style={{ fontSize: "12px", lineHeight: "1.4", maxHeight: "120px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {localLabel}
              </Box>
            </BlockStack>
          </Box>

          {/* Remote option */}
          <Box padding="200" borderRadius="075" background="bg-surface" minWidth="200">
            <BlockStack gap="100">
              <InlineStack gap="100" blockAlign="center">
                <RadioButton
                  label=""
                  name={`field-${field}`}
                  checked={resolution === "remote"}
                  onChange={() => onChange(field, "remote")}
                  id={`${field}-remote`}
                />
                <Text variant="bodyXs" tone="subdued" as="span">Shopify</Text>
              </InlineStack>
              <Box
                as="pre"
                padding="150"
                background="bg-surface-secondary"
                borderRadius="075"
                style={{ fontSize: "12px", lineHeight: "1.4", maxHeight: "120px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {remoteLabel}
              </Box>
            </BlockStack>
          </Box>
        </InlineStack>
      </BlockStack>
    </Box>
  );
}

export default function ConflictResolutionModal({ open, postId, postTitle, onClose, onResolved }) {
  const [conflictPayload, setConflictPayload] = useState(null);
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolutions, setResolutions] = useState({});

  const fetchConflictData = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      // Fetch the full diff
      const diffRes = await fetch(`/api/posts/${postId}/conflict-diff`);
      const diffData = await diffRes.json().catch(() => ({}));
      if (!diffRes.ok) {
        throw new Error(diffData.error || "Failed to fetch diff");
      }
      setDiff(diffData.diff);

      // Try to fetch the conflict payload (stored in DB via sync-status)
      const statusRes = await fetch(`/api/posts/${postId}/sync-status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json().catch(() => ({}));
        // We need the post to get conflictPayload — load post
        const postRes = await fetch(`/api/posts/${postId}`);
        if (postRes.ok) {
          const postData = await postRes.json().catch(() => ({}));
          const cp = postData.post?.shopifyArticle?.conflictPayload;
          if (cp?.fields) {
            setConflictPayload(cp);

            // Initialize resolutions from conflict fields — default all to "local"
            const initialResolutions = {};
            for (const field of Object.keys(cp.fields)) {
              initialResolutions[field] = "local";
            }
            setResolutions(initialResolutions);
            return;
          }
        }
      }

      // Fallback: build conflict fields from diff
      const changedFields = {};
      const diffFields =
        diffData.diff && typeof diffData.diff === "object" ? diffData.diff : {};
      for (const [field, data] of Object.entries(diffFields)) {
        if (data.changed && field !== "updatedAt") {
          changedFields[field] = {
            base: null,
            local: data.local,
            remote: data.remote,
          };
        }
      }
      if (Object.keys(changedFields).length > 0) {
        setConflictPayload({ fields: changedFields });
        const initial = {};
        for (const field of Object.keys(changedFields)) {
          initial[field] = "local";
        }
        setResolutions(initial);
      }
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (open && postId) {
      fetchConflictData();
    } else {
      setConflictPayload(null);
      setDiff(null);
      setLoadError(null);
      setActionError(null);
      setResolving(false);
      setResolutions({});
    }
  }, [open, postId, fetchConflictData]);

  const handleFieldResolution = useCallback((field, choice) => {
    setActionError(null);
    setResolutions((prev) => ({ ...prev, [field]: choice }));
  }, []);

  const handleResolveAll = useCallback(async (choice) => {
    // Set all fields to the same choice
    if (!conflictPayload?.fields) return;
    const allSame = {};
    for (const field of Object.keys(conflictPayload.fields)) {
      allSame[field] = choice;
    }
    setResolutions(allSame);
    setActionError(null);

    // Submit resolution
    setResolving(true);
    try {
      const res = await fetch(`/api/posts/${postId}/resolve-conflict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions: allSame }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Resolution failed");
      onResolved?.({
        resolution: choice,
        message: data.message,
        resolutions: allSame,
      });
    } catch (err) {
      setActionError(`Failed to resolve: ${err.message}`);
    } finally {
      setResolving(false);
    }
  }, [postId, conflictPayload, onResolved]);

  const handleResolveSelected = useCallback(async () => {
    setResolving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/resolve-conflict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Resolution failed");
      onResolved?.({
        resolution: "selected",
        message: data.message,
        resolutions,
      });
    } catch (err) {
      // Keep the per-field UI and the merchant's picks — do not swap to a load-error
      // screen that Retry would refetch and reset every field back to "local".
      setActionError(`Failed to resolve: ${err.message}`);
    } finally {
      setResolving(false);
    }
  }, [postId, resolutions, onResolved]);

  const conflictFields = conflictPayload?.fields ? Object.keys(conflictPayload.fields) : [];
  const allLocal = conflictFields.every((f) => resolutions[f] === "local");
  const allRemote = conflictFields.every((f) => resolutions[f] === "remote");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <InlineStack gap="200" blockAlign="center">
          <Text variant="headingLg">⚠️ Conflict: {postTitle || "Loading..."}</Text>
          {conflictFields.length > 0 && (
            <Badge tone="critical">{conflictFields.length} field{conflictFields.length !== 1 ? "s" : ""}</Badge>
          )}
        </InlineStack>
      }
      titleHidden={false}
      large
      primaryAction={{
        content: `Apply Selected (${conflictFields.filter((f) => resolutions[f] === "local").length} local, ${conflictFields.filter((f) => resolutions[f] === "remote").length} remote)`,
        onAction: handleResolveSelected,
        loading: resolving,
        disabled: resolving || conflictFields.length === 0 || loading || !!loadError,
        destructive: true,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
          disabled: resolving,
        },
      ]}
    >
      <Modal.Section>
        {loading ? (
          <Box padding="800" align="center">
            <Spinner />
            <Box padding="200">
              <Text variant="bodyMd" tone="subdued" as="p">
                Loading conflict details...
              </Text>
            </Box>
          </Box>
        ) : loadError ? (
          <Banner tone="critical">
            <p>{loadError}</p>
            <Button onClick={fetchConflictData}>Retry</Button>
          </Banner>
        ) : conflictFields.length === 0 ? (
          <Text variant="bodyMd" tone="subdued" as="p">
            No conflicts detected. This post may have been resolved already.
          </Text>
        ) : (
          <BlockStack gap="400">
            {actionError && (
              <Banner tone="critical" onDismiss={() => setActionError(null)}>
                <p>{actionError}</p>
              </Banner>
            )}
            <Banner tone="warning">
              <BlockStack gap="200">
                <Text variant="bodyMd" fontWeight="semibold" as="p">
                  Per-field conflict resolution
                </Text>
                <Text variant="bodySm" as="p">
                  For each field below, choose whether to keep the <strong>Local</strong> (app) version
                  or the <strong>Shopify</strong> (remote) version. Fields not in conflict will be auto-merged.
                  After resolving, the final result will be pushed to Shopify.
                </Text>
              </BlockStack>
            </Banner>

            {/* Quick actions */}
            <Box padding="200" background="bg-surface-secondary" borderRadius="100">
              <InlineStack gap="200" blockAlign="center" wrap={false}>
                <Text variant="bodySm" tone="subdued" as="span">Quick apply to all:</Text>
                <Button
                  size="slim"
                  variant={allLocal ? "primary" : "tertiary"}
                  onClick={() => {
                    const all = {};
                    conflictFields.forEach((f) => { all[f] = "local"; });
                    setActionError(null);
                    setResolutions(all);
                  }}
                >
                  All Local
                </Button>
                <Button
                  size="slim"
                  variant={allRemote ? "primary" : "tertiary"}
                  onClick={() => {
                    const all = {};
                    conflictFields.forEach((f) => { all[f] = "remote"; });
                    setActionError(null);
                    setResolutions(all);
                  }}
                >
                  All Shopify
                </Button>
              </InlineStack>
            </Box>

            {/* Per-field resolution rows */}
            <Scrollable style={{ maxHeight: "500px" }}>
              <BlockStack gap="300">
                {conflictFields.map((field) => {
                  const fieldConflict = conflictPayload.fields[field];
                  return (
                    <FieldResolutionRow
                      key={field}
                      field={field}
                      conflict={fieldConflict}
                      resolution={resolutions[field] || "local"}
                      onChange={handleFieldResolution}
                    />
                  );
                })}
              </BlockStack>
            </Scrollable>
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
}
