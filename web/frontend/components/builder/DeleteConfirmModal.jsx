import React from "react";
import { Modal, Text } from "@shopify/polaris";
import { useBuilderStore } from "./store/useBuilderStore";

export default function DeleteConfirmModal() {
  const isDeleteModalOpen = useBuilderStore((s) => s.isDeleteModalOpen);
  const pendingDeleteBlockIds = useBuilderStore((s) => s.pendingDeleteBlockIds) || [];
  const confirmDelete = useBuilderStore((s) => s.confirmDelete);
  const cancelDelete = useBuilderStore((s) => s.cancelDelete);
  const blocksById = useBuilderStore((s) => s.blocksById);

  if (!isDeleteModalOpen) return null;

  const count = pendingDeleteBlockIds.length;
  const firstBlock = count === 1 ? blocksById[pendingDeleteBlockIds[0]] : null;
  const blockName = firstBlock ? firstBlock.type : "block";

  const title = count > 1 ? `Delete ${count} selected blocks?` : `Delete ${blockName}?`;
  const primaryText = count > 1 ? `Delete ${count} blocks` : "Delete block";
  const bodyText = count > 1
    ? `Are you sure you want to delete these ${count} selected blocks and their content? This action can be undone using Ctrl + Z.`
    : `Are you sure you want to delete this ${blockName}? This action can be undone using Ctrl + Z.`;

  return (
    <Modal
      open={isDeleteModalOpen}
      onClose={cancelDelete}
      title={title}
      primaryAction={{
        content: primaryText,
        destructive: true,
        onAction: confirmDelete,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: cancelDelete,
        },
      ]}
    >
      <Modal.Section>
        <Text as="p" variant="bodyMd">
          {bodyText}
        </Text>
      </Modal.Section>
    </Modal>
  );
}
