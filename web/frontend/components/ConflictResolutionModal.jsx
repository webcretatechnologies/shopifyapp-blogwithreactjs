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
  ButtonGroup,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Spinner,
  Scrollable,
  RadioButton,
} from "@shopify/polaris";

/**
 * Escape HTML for safe rendering inside <pre>.
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
  const localLabel = conflict.local === null || conflict.local === undefined ? "—" : String(conflict.local).substring(0, 500);
  const remoteLabel = conflict.remote === null || conflict.remote === undefined ? "—" : String(
    field === "content"
      ? (conflict.remote?.storefrontHtml || "[Structured content from Shopify]")
      : conflict.remote
  ).substring(0, 500);

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
                {escapeHtml(localLabel)}
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
                {escapeHtml(remoteLabel)}
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
  const [error, setError] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolutions, setResolutions] = useState({});

  const fetchConflictData = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch the full diff
      const diffRes = await fetch(`/api/posts/${postId}/conflict-diff`);
      if (!diffRes.ok) {
        const data = await diffRes.json();
        throw new Error(data.error || "Failed to fetch diff");
      }
      const diffData = await diffRes.json();
      setDiff(diffData.diff);

      // Try to fetch the conflict payload (stored in DB via sync-status)
      const statusRes = await fetch(`/api/posts/${postId}/sync-status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        // We need the post to get conflictPayload — load post
        const postRes = await fetch(`/api/posts/${postId}`);
        if (postRes.ok) {
          const postData = await postRes.json();
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
      for (const [field, data] of Object.entries(diffData.diff)) {
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
      setError(err.message);
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
      setError(null);
      setResolving(false);
      setResolutions({});
    }
  }, [open, postId, fetchConflictData]);

  const handleFieldResolution = useCallback((field, choice) => {
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

    // Submit resolution
    setResolving(true);
    try {
      const res = await fetch(`/api/posts/${postId}/resolve-conflict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions: allSame }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resolution failed");
      onResolved?.({
        resolution: choice,
        message: data.message,
        resolutions: allSame,
      });
    } catch (err) {
      setError(`Failed to resolve: ${err.message}`);
    } finally {
      setResolving(false);
    }
  }, [postId, conflictPayload, onResolved]);

  const handleResolveSelected = useCallback(async () => {
    setResolving(true);
    try {
      const res = await fetch(`/api/posts/${postId}/resolve-conflict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resolution failed");
      onResolved?.({
        resolution: "selected",
        message: data.message,
        resolutions,
      });
    } catch (err) {
      setError(`Failed to resolve: ${err.message}`);
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
      primaryAction={
        <ButtonGroup>
          <Button
            tone="critical"
            loading={resolving}
            disabled={resolving || conflictFields.length === 0}
            onClick={handleResolveSelected}
          >
            Apply Selected ({conflictFields.filter((f) => resolutions[f] === "local").length} local, {conflictFields.filter((f) => resolutions[f] === "remote").length} remote)
          </Button>
        </ButtonGroup>
      }
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
        ) : error ? (
          <Banner tone="critical">
            <p>{error}</p>
            <Button onClick={fetchConflictData}>Retry</Button>
          </Banner>
        ) : conflictFields.length === 0 ? (
          <Text variant="bodyMd" tone="subdued" as="p">
            No conflicts detected. This post may have been resolved already.
          </Text>
        ) : (
          <BlockStack gap="400">
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
