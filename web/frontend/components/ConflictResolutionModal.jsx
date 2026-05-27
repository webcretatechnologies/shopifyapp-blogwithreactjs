/**
 * ConflictResolutionModal — Side-by-side diff view for sync conflicts.
 * Shows local vs remote (Shopify) content and lets the user choose which to keep.
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
  Divider,
  Tabs,
  Scrollable,
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
 * Simple word-diff: split by space, compare arrays, mark changed segments.
 * Returns HTML-safe string with <ins>/<del> markers.
 */
function wordDiffHtml(local, remote) {
  const localWords = (local || "").split(/\s+/);
  const remoteWords = (remote || "").split(/\s+/);
  const maxLen = Math.max(localWords.length, remoteWords.length);
  const result = [];

  for (let i = 0; i < maxLen; i++) {
    const lw = localWords[i] || "";
    const rw = remoteWords[i] || "";
    if (lw !== rw) {
      if (lw) result.push(`<del class="diff-removed">${escapeHtml(lw)}</del>`);
      if (rw) result.push(`<ins class="diff-added">${escapeHtml(rw)}</ins>`);
    } else {
      result.push(escapeHtml(lw));
    }
  }

  return result.join(" ");
}

/**
 * Field-level diff row: label, local value, remote value, and change indicator.
 */
function DiffRow({ label, localVal, remoteVal, changed, type = "text" }) {
  const displayLocal = type === "html" ? null : String(localVal ?? "—");
  const displayRemote = type === "html" ? null : String(remoteVal ?? "—");

  return (
    <Box
      padding="300"
      borderWidth="1"
      borderColor={changed ? "border-warning" : "border"}
      borderRadius="100"
      background={changed ? "bg-warning-subdued" : "bg-surface"}
    >
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center">
          <Text variant="headingSm" fontWeight="semibold">
            {label}
          </Text>
          {changed && (
            <Badge tone="critical" size="small">
              Changed
            </Badge>
          )}
        </InlineStack>
        <InlineStack gap="400" wrap={false}>
          <Box
            padding="200"
            borderRadius="075"
            background="bg-surface"
            minWidth="200"
            overflowX="auto"
          >
            {type === "html" ? (
              <BlockStack gap="100">
                <Text variant="bodyXs" tone="subdued" as="span">
                  Local ({localVal?.length || 0} chars)
                </Text>
                <Box
                  as="pre"
                  padding="200"
                  background="bg-surface-secondary"
                  borderRadius="075"
                  overflowX="auto"
                  style={{ fontSize: "11px", lineHeight: "1.4", maxHeight: "200px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {escapeHtml((localVal || "").substring(0, 1000))}
                </Box>
              </BlockStack>
            ) : (
              <BlockStack gap="100">
                <Text variant="bodyXs" tone="subdued" as="span">
                  Local
                </Text>
                <Text variant="bodyMd">{displayLocal}</Text>
              </BlockStack>
            )}
          </Box>
          {changed && (
            <Box
              padding="200"
              borderRadius="075"
              background="bg-surface"
              minWidth="200"
              overflowX="auto"
            >
              {type === "html" ? (
                <BlockStack gap="100">
                  <Text variant="bodyXs" tone="subdued" as="span">
                    Shopify ({remoteVal?.length || 0} chars)
                  </Text>
                  <Box
                    as="pre"
                    padding="200"
                    background="bg-surface-secondary"
                    borderRadius="075"
                    overflowX="auto"
                    style={{ fontSize: "11px", lineHeight: "1.4", maxHeight: "200px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {escapeHtml((remoteVal || "").substring(0, 1000))}
                  </Box>
                </BlockStack>
              ) : (
                <BlockStack gap="100">
                  <Text variant="bodyXs" tone="subdued" as="span">
                    Shopify
                  </Text>
                  <Text variant="bodyMd">{displayRemote}</Text>
                </BlockStack>
              )}
            </Box>
          )}
        </InlineStack>
        {type === "text" && changed && (
          <Text variant="bodyXs" tone="subdued" as="p">
            <span dangerouslySetInnerHTML={{
              __html: `Diff: ${wordDiffHtml(String(localVal ?? ""), String(remoteVal ?? ""))}`,
            }} />
          </Text>
        )}
      </BlockStack>
    </Box>
  );
}

export default function ConflictResolutionModal({ open, postId, postTitle, onClose, onResolved }) {
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolving, setResolving] = useState(null); // "local" | "remote" | null
  const [selectedTab, setSelectedTab] = useState(0);

  const fetchDiff = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/conflict-diff`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch diff");
      }
      const data = await res.json();
      setDiff(data.diff);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (open && postId) {
      fetchDiff();
    } else {
      setDiff(null);
      setError(null);
      setResolving(null);
    }
  }, [open, postId, fetchDiff]);

  const handleResolve = async (resolution) => {
    setResolving(resolution);
    try {
      const res = await fetch(`/api/posts/${postId}/resolve-conflict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resolution failed");
      onResolved?.({
        resolution,
        message: data.message,
        structureDegraded: data.structureDegraded,
      });
    } catch (err) {
      setError(`Failed to resolve: ${err.message}`);
    } finally {
      setResolving(null);
    }
  };

  const tabs = [
    { id: "overview", content: "Overview" },
    { id: "content", content: "Content Diff" },
  ];

  const changedFields = diff
    ? [
        { key: "title", label: "Title", changed: diff.title.changed },
        { key: "status", label: "Status", changed: diff.status.changed },
        { key: "author", label: "Author", changed: diff.author.changed },
        { key: "tags", label: "Tags", changed: diff.tags.changed },
        { key: "featuredImage", label: "Featured Image", changed: diff.featuredImage.changed },
        { key: "contentHtml", label: "Content", changed: diff.contentHtml.changed },
      ].filter((f) => f.changed)
    : [];

  const numChanges = changedFields.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <InlineStack gap="200" blockAlign="center">
          <Text variant="headingLg">⚠️ Conflict: {postTitle || "Loading..."}</Text>
          {diff && (
            <Badge tone="critical">{numChanges} field{numChanges !== 1 ? "s" : ""} changed</Badge>
          )}
        </InlineStack>
      }
      titleHidden={false}
      large
      primaryAction={
        <ButtonGroup>
          <Button
            tone="critical"
            loading={resolving === "local"}
            disabled={!!resolving}
            onClick={() => handleResolve("local")}
          >
            Keep Local
          </Button>
          <Button
            variant="primary"
            loading={resolving === "remote"}
            disabled={!!resolving}
            onClick={() => handleResolve("remote")}
          >
            Use Shopify Version
          </Button>
        </ButtonGroup>
      }
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
          disabled: !!resolving,
        },
      ]}
    >
      <Modal.Section>
        {loading ? (
          <Box padding="800" align="center">
            <Spinner />
            <Box padding="200">
              <Text variant="bodyMd" tone="subdued" as="p">
                Fetching diff from Shopify...
              </Text>
            </Box>
          </Box>
        ) : error ? (
          <Banner tone="critical">
            <p>{error}</p>
            <Button onClick={fetchDiff}>Retry</Button>
          </Banner>
        ) : !diff ? (
          <Text variant="bodyMd" tone="subdued" as="p">
            No diff data available.
          </Text>
        ) : (
          <BlockStack gap="400">
            <Banner tone="warning">
              <BlockStack gap="200">
                <Text variant="bodyMd" fontWeight="semibold" as="p">
                  Both the app and Shopify have changes since the last sync
                </Text>
                <Text variant="bodySm" as="p">
                  Review the differences below and choose which version to keep.
                  <br />
                  <strong>Keep Local</strong> — preserves your app edits and pushes them to Shopify.
                  <br />
                  <strong>Use Shopify Version</strong> — overwrites local content with what's on Shopify.
                </Text>
              </BlockStack>
            </Banner>

            <Tabs
              tabs={tabs}
              selected={selectedTab}
              onSelect={setSelectedTab}
            />

            {selectedTab === 0 ? (
              /* Overview tab — metadata fields */
              <Scrollable style={{ maxHeight: "400px" }}>
                <BlockStack gap="300">
                  <DiffRow
                    label="Title"
                    localVal={diff.title.local}
                    remoteVal={diff.title.remote}
                    changed={diff.title.changed}
                  />
                  <DiffRow
                    label="Status"
                    localVal={diff.status.local}
                    remoteVal={diff.status.remote}
                    changed={diff.status.changed}
                  />
                  <DiffRow
                    label="Author"
                    localVal={diff.author.local}
                    remoteVal={diff.author.remote}
                    changed={diff.author.changed}
                  />
                  <DiffRow
                    label="Tags"
                    localVal={(diff.tags.local || []).join(", ")}
                    remoteVal={(diff.tags.remote || []).join(", ")}
                    changed={diff.tags.changed}
                  />
                  <DiffRow
                    label="Featured Image"
                    localVal={diff.featuredImage.local || "None"}
                    remoteVal={diff.featuredImage.remote || "None"}
                    changed={diff.featuredImage.changed}
                  />
                </BlockStack>
              </Scrollable>
            ) : (
              /* Content tab — HTML diff */
              <BlockStack gap="300">
                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="100"
                >
                  <InlineStack gap="200" blockAlign="center">
                    <Badge>Local</Badge>
                    <Text variant="bodyXs" tone="subdued" as="span">
                      {(diff.contentHtml.local || "").length} characters
                    </Text>
                    <Badge tone="critical">Shopify</Badge>
                    <Text variant="bodyXs" tone="subdued" as="span">
                      {(diff.contentHtml.remote || "").length} characters
                    </Text>
                  </InlineStack>
                </Box>
                <Scrollable style={{ maxHeight: "500px" }}>
                  <Box
                    padding="400"
                    background="bg-surface"
                    borderRadius="100"
                    borderWidth="1"
                    borderColor="border"
                  >
                    <Box
                      as="pre"
                      style={{
                        fontSize: "12px",
                        lineHeight: "1.5",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontFamily: "monospace",
                      }}
                      dangerouslySetInnerHTML={{
                        __html: wordDiffHtml(
                          diff.contentHtml.local || "",
                          diff.contentHtml.remote || ""
                        ),
                      }}
                    />
                  </Box>
                </Scrollable>
                <style>{`
                  .diff-removed {
                    background: rgba(239, 68, 68, 0.15);
                    color: #b91c1c;
                    text-decoration: line-through;
                    border-radius: 3px;
                    padding: 1px 2px;
                  }
                  .diff-added {
                    background: rgba(34, 197, 94, 0.15);
                    color: #15803d;
                    border-radius: 3px;
                    padding: 1px 2px;
                  }
                `}</style>
              </BlockStack>
            )}
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
}
