/**
 * DragDropBuilderContainer.jsx
 *
 * The root component for the new Drag & Drop Builder mode.
 * Orchestrates the three-pane layout:
 *   [ BlockPicker | BuilderCanvas | SettingsPanel ]
 * Also provides the top bar with Undo/Redo controls.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Card, Box, Button, ButtonGroup, InlineStack, TextField, Text, Tooltip, Icon } from "@shopify/polaris";
import { 
  UndoIcon, 
  RedoIcon, 
  DesktopIcon, 
  TabletIcon, 
  MobileIcon, 
  MaximizeIcon, 
  MinimizeIcon, 
  LayoutSidebarLeftIcon, 
  LayoutSidebarRightIcon, 
  ViewIcon, 
  SaveIcon, 
  PlusIcon, 
  MinusCircleIcon 
} from "@shopify/polaris-icons";

import { useBuilderStore } from "./store/useBuilderStore";
import BlockPicker from "./BlockPicker";
import BuilderCanvas from "./canvas/BuilderCanvas";
import SettingsPanel from "./settings/SettingsPanel";
import BreadcrumbBar from "./canvas/BreadcrumbBar";

export default function DragDropBuilderContainer({
  initialBlocksAst,
  onChange,
  postTitle,
  onTitleChange,
  onSave,
  onPreview,
  isSaving,
  isPreviewLoading,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);

  const hydrate = useBuilderStore((s) => s.hydrate);
  const blocksById = useBuilderStore((s) => s.blocksById);
  const rootIds = useBuilderStore((s) => s.rootIds);
  const getBlocksAst = useBuilderStore((s) => s.getBlocksAst);
  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);
  const canUndo = useBuilderStore((s) => s.canUndo());
  const canRedo = useBuilderStore((s) => s.canRedo());
  const selectedBlockId = useBuilderStore((s) => s.selectedBlockId);
  const clearSelection = useBuilderStore((s) => s.clearSelection);
  const deleteBlock = useBuilderStore((s) => s.deleteBlock);
  const duplicateBlock = useBuilderStore((s) => s.duplicateBlock);
  const addBlock = useBuilderStore((s) => s.addBlock);
  // deviceMode and zoomLevel now live in the store so CanvasNode/SettingsPanel can read
  // them without prop-drilling through BuilderCanvas.
  const deviceMode = useBuilderStore((s) => s.deviceMode);
  const setDeviceMode = useBuilderStore((s) => s.setDeviceMode);
  const zoomLevel = useBuilderStore((s) => s.zoomLevel);
  const setZoomLevel = useBuilderStore((s) => s.setZoomLevel);

  // Keyboard shortcuts
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const handleKeyDown = async (e) => {
      const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable;
      const cmdOrCtrl = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        clearSelection();
        return;
      }

      if (cmdOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSaveRef.current?.();
        return;
      }

      if (isInput) return;

      if (cmdOrCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (selectedBlockId) {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          deleteBlock(selectedBlockId);
          return;
        }

        if (cmdOrCtrl && e.key.toLowerCase() === "d") {
          e.preventDefault();
          duplicateBlock(selectedBlockId);
          return;
        }
        
        if (cmdOrCtrl && e.key.toLowerCase() === "c") {
          e.preventDefault();
          const ast = getBlocksAst();
          const findInAst = (nodes, id) => {
            for (const n of nodes) {
              if (n.id === id) return n;
              if (n.children && n.children.length) {
                const found = findInAst(n.children, id);
                if (found) return found;
              }
            }
            return null;
          };
          const nodeToCopy = findInAst(ast, selectedBlockId);
          if (nodeToCopy) {
            try {
              await navigator.clipboard.writeText(JSON.stringify({ __builderBlock: true, data: nodeToCopy }));
            } catch (err) {
              console.error("Clipboard copy failed", err);
            }
          }
          return;
        }
      }

      if (cmdOrCtrl && e.key.toLowerCase() === "v") {
        try {
          const text = await navigator.clipboard.readText();
          if (!text) return;
          const parsed = JSON.parse(text);
          if (parsed.__builderBlock && parsed.data && parsed.data.type) {
            e.preventDefault();
            // We use addBlock which will create a new ID and append to root or selected parent
            const state = useBuilderStore.getState();
            const parentId = selectedBlockId && state.blocksById[selectedBlockId]?.childrenIds ? selectedBlockId : null;
            addBlock(parsed.data.type, parsed.data.settings, parentId);
          }
        } catch (err) {
          // not valid json, ignore
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, selectedBlockId, clearSelection, deleteBlock, duplicateBlock, undo, redo, getBlocksAst, addBlock]);

  // Hydrate store whenever initialBlocksAst changes from parent, but guard against echo updates
  const lastInitialBlocksRef = useRef(null);
  useEffect(() => {
    const jsonStr = JSON.stringify(initialBlocksAst || []);
    if (lastInitialBlocksRef.current === null) {
      lastInitialBlocksRef.current = jsonStr;
      hydrate(initialBlocksAst || []);
      return;
    }
    if (lastInitialBlocksRef.current !== jsonStr) {
      lastInitialBlocksRef.current = jsonStr;
      hydrate(initialBlocksAst);
    }
  }, [initialBlocksAst, hydrate]);

  // Sync back to parent (the new.jsx page) whenever blocks change
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const isFirstBlockSyncRef = useRef(true);
  useEffect(() => {
    if (isFirstBlockSyncRef.current) {
      isFirstBlockSyncRef.current = false;
      return;
    }
    const ast = getBlocksAst();
    lastInitialBlocksRef.current = JSON.stringify(ast || []);
    onChangeRef.current?.(ast);
  }, [blocksById, rootIds, getBlocksAst]);

  const containerStyle = isFullscreen
    ? {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 999999,
        background: "var(--p-color-bg-surface-secondary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }
    : {
        display: "flex",
        flexDirection: "column",
        height: "760px",
        minHeight: "650px",
        border: "1px solid var(--p-color-border)",
        borderRadius: "var(--p-border-radius-200)",
        background: "var(--p-color-bg-surface)",
        overflow: "hidden",
        boxShadow: "var(--p-shadow-100)",
      };

  const builderUI = (
    <div style={containerStyle}>
      {/* ── Top Bar ── */}
      <Box padding="300" borderBlockEndWidth="025" borderColor="border-secondary" background="bg-surface">
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          {/* Left Controls: Sidebar toggles & Title */}
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <Tooltip content={showLeftSidebar ? "Hide Blocks Sidebar" : "Show Blocks Sidebar"}>
              <Button
                variant="tertiary"
                icon={LayoutSidebarLeftIcon}
                onClick={() => setShowLeftSidebar(!showLeftSidebar)}
                tone={showLeftSidebar ? "success" : undefined}
              />
            </Tooltip>

            {isFullscreen && onTitleChange ? (
              <div style={{ width: "280px" }}>
                <TextField
                  placeholder="Article Title..."
                  value={postTitle || ""}
                  onChange={(val) => onTitleChange(val)}
                  autoComplete="off"
                  labelHidden
                  label="Title"
                />
              </div>
            ) : (
              <Text variant="bodyMd" fontWeight="semibold">
                Visual Drag & Drop Studio
              </Text>
            )}
          </InlineStack>

          {/* Center Controls: Device Switcher + Zoom */}
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <ButtonGroup variant="segmented">
              <Button
                pressed={deviceMode === "desktop"}
                icon={DesktopIcon}
                onClick={() => setDeviceMode("desktop")}
              >
                Desktop
              </Button>
              <Button
                pressed={deviceMode === "tablet"}
                icon={TabletIcon}
                onClick={() => setDeviceMode("tablet")}
              >
                Tablet
              </Button>
              <Button
                pressed={deviceMode === "mobile"}
                icon={MobileIcon}
                onClick={() => setDeviceMode("mobile")}
              >
                Mobile
              </Button>
            </ButtonGroup>

            {/* Zoom Controls */}
            <ButtonGroup variant="segmented">
              <Button
                icon={MinusCircleIcon}
                onClick={() => setZoomLevel(zoomLevel - 0.25)}
                disabled={zoomLevel <= 0.5}
                accessibilityLabel="Zoom out"
              />
              <Button disabled>
                <span style={{ minWidth: "40px", display: "inline-block", textAlign: "center" }}>
                  {Math.round(zoomLevel * 100)}%
                </span>
              </Button>
              <Button
                icon={PlusIcon}
                onClick={() => setZoomLevel(zoomLevel + 0.25)}
                disabled={zoomLevel >= 1.5}
                accessibilityLabel="Zoom in"
              />
            </ButtonGroup>
          </InlineStack>
          
          {/* Right Controls: Undo / Redo / Preview / Save / Fullscreen */}
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <ButtonGroup variant="segmented">
              <Button
                icon={UndoIcon}
                disabled={!canUndo}
                onClick={undo}
                accessibilityLabel="Undo"
              >
                Undo
              </Button>
              <Button
                icon={RedoIcon}
                disabled={!canRedo}
                onClick={redo}
                accessibilityLabel="Redo"
              >
                Redo
              </Button>
            </ButtonGroup>

            {isFullscreen && onPreview && (
              <Button
                icon={ViewIcon}
                disabled={isPreviewLoading}
                onClick={onPreview}
              >
                {isPreviewLoading ? "Loading..." : "Preview"}
              </Button>
            )}

            {isFullscreen && onSave && (
              <Button
                variant="primary"
                icon={SaveIcon}
                disabled={isSaving}
                onClick={onSave}
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </Button>
            )}

            {/* Fullscreen Toggle */}
            <Button
              variant="secondary"
              icon={isFullscreen ? MinimizeIcon : MaximizeIcon}
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? "Exit Fullscreen" : "Full Screen Studio"}
            </Button>

            <Tooltip content={showRightSidebar ? "Hide Settings Panel" : "Show Settings Panel"}>
              <Button
                variant="tertiary"
                icon={LayoutSidebarRightIcon}
                onClick={() => setShowRightSidebar(!showRightSidebar)}
                tone={showRightSidebar ? "success" : undefined}
              />
            </Tooltip>
          </InlineStack>
        </InlineStack>
      </Box>

      {/* ── Three-Pane Layout ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Pane: Block Picker */}
        {showLeftSidebar && (
          <div style={{ width: "280px", borderRight: "1px solid var(--p-color-border-secondary)", background: "var(--p-color-bg-surface-secondary)", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <BlockPicker />
          </div>
        )}

        {/* Center Pane: Breadcrumb + Canvas */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", background: "var(--p-color-bg-surface-tertiary)" }}>
          <BreadcrumbBar />
          <div style={{ flex: 1, overflow: "hidden", transform: `scale(${zoomLevel})`, transformOrigin: "top center" }}>
            <BuilderCanvas deviceMode={deviceMode} />
          </div>
        </div>

        {/* Right Pane: Settings */}
        {showRightSidebar && (
          <div style={{ width: "300px", borderLeft: "1px solid var(--p-color-border-secondary)", background: "var(--p-color-bg-surface)", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <SettingsPanel />
          </div>
        )}
      </div>
    </div>
  );

  if (isFullscreen) {
    return createPortal(builderUI, document.body);
  }

  return builderUI;
}
