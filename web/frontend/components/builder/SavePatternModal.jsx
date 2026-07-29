import { useState, useCallback } from "react";
import { useBuilderStore } from "./store/useBuilderStore";
import { denormalizeAst } from "./store/normalize";
import { Modal, TextField, Text, Banner } from "@shopify/polaris";

export default function SavePatternModal({ blockId, onClose, onSuccess }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const blocksById = useBuilderStore((s) => s.blocksById);
  const targetBlock = blocksById[blockId];

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError("Pattern name is required");
      return;
    }
    setError("");
    setIsSaving(true);

    try {
      // Denormalize block subtree into full AST node
      const astSubtree = denormalizeAst(blocksById, [blockId]);
      const patternData = astSubtree[0];

      const res = await fetch("/api/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          blocks: patternData,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save pattern");
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [name, description, blocksById, blockId, onClose, onSuccess]);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Save as Reusable Pattern"
      primaryAction={{
        content: "Save Pattern",
        onAction: handleSave,
        loading: isSaving,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--p-space-400)" }}>
          {error && (
            <Banner tone="critical" onDismiss={() => setError("")}>
              <p>{error}</p>
            </Banner>
          )}

          <TextField
            label="Pattern Name"
            value={name}
            onChange={setName}
            autoComplete="off"
            placeholder="e.g. Callout Banner, Hero Section"
            autoFocus
            requiredIndicator
          />

          <TextField
            label="Description (optional)"
            value={description}
            onChange={setDescription}
            autoComplete="off"
            placeholder="Describe when or where to use this pattern..."
            multiline={3}
          />

          <Banner tone="info">
            <Text as="p" variant="bodyMd">
              Saving block type <Text as="strong" variant="bodyMd" fontWeight="bold">{targetBlock?.type || "selected block"}</Text> and its contents to your store's pattern library.
            </Text>
          </Banner>
        </div>
      </Modal.Section>
    </Modal>
  );
}
