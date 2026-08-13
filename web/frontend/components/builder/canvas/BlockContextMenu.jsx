/**
 * BlockContextMenu.jsx
 *
 * A position-aware floating context menu that appears on right-click of any
 * CanvasNode. Provides the same actions as the floating toolbar for users who
 * prefer a right-click workflow.
 */

import { useBuilderStore } from "../store/useBuilderStore";
import { Popover, ActionList } from "@shopify/polaris";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  DuplicateIcon,
  ClipboardIcon,
  DeleteIcon,
  SelectIcon
} from "@shopify/polaris-icons";

export default function BlockContextMenu({ blockId, x, y, onClose }) {
  const deleteBlock = useBuilderStore((s) => s.deleteBlock);
  const duplicateBlock = useBuilderStore((s) => s.duplicateBlock);
  const moveBlockUp = useBuilderStore((s) => s.moveBlockUp);
  const moveBlockDown = useBuilderStore((s) => s.moveBlockDown);
  const selectBlock = useBuilderStore((s) => s.selectBlock);
  const blocksById = useBuilderStore((s) => s.blocksById);

  const block = blocksById[blockId];
  const hasParent = !!block?.parentId;

  const handleCopy = async () => {
    try {
      const { denormalizeAst } = await import("../store/normalize");
      const state = useBuilderStore.getState();
      const ast = denormalizeAst(state.blocksById, [blockId]);
      await navigator.clipboard.writeText(JSON.stringify({ __builderBlock: true, data: ast[0] }));
    } catch (_) { /* clipboard unavailable */ }
    onClose();
  };

  const sections = [];

  const moveSection = [];
  if (hasParent) {
    moveSection.push({
      content: "Select Parent",
      icon: SelectIcon,
      onAction: () => {
        selectBlock(block.parentId);
        onClose();
      },
    });
  }
  moveSection.push(
    {
      content: "Move Up",
      icon: ChevronUpIcon,
      onAction: () => {
        moveBlockUp(blockId);
        onClose();
      },
    },
    {
      content: "Move Down",
      icon: ChevronDownIcon,
      onAction: () => {
        moveBlockDown(blockId);
        onClose();
      },
    }
  );

  sections.push({ items: moveSection });

  const actionSection = [
    {
      content: "Duplicate",
      icon: DuplicateIcon,
      onAction: () => {
        duplicateBlock(blockId);
        onClose();
      },
    },
    {
      content: "Copy",
      icon: ClipboardIcon,
      onAction: handleCopy,
    },
  ];

  sections.push({ items: actionSection });

  sections.push({
    items: [
      {
        content: "Delete",
        icon: DeleteIcon,
        destructive: true,
        onAction: () => {
          deleteBlock(blockId);
          onClose();
        },
      },
    ],
  });

  // Virtual activator placed at the exact cursor position
  const activator = (
    <div
      style={{
        position: "fixed",
        top: y,
        left: x,
        width: 1,
        height: 1,
        pointerEvents: "none",
        zIndex: 999999, // Ensure it's above other elements if needed
      }}
    />
  );

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Popover
        active={true}
        activator={activator}
        onClose={onClose}
        autofocusTarget="first-node"
        preferredAlignment="left"
      >
        <ActionList actionRole="menuitem" sections={sections} />
      </Popover>
    </div>
  );
}
