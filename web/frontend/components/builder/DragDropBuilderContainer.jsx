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
import { Card, Box, Button, ButtonGroup, InlineStack, TextField, Text, Tooltip, Icon, useBreakpoints } from "@shopify/polaris";
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
  MinusCircleIcon,
  XIcon
} from "@shopify/polaris-icons";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  rectIntersection,
  MeasuringStrategy,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useBuilderStore } from "./store/useBuilderStore";
import BlockPicker from "./BlockPicker";
import BuilderCanvas from "./canvas/BuilderCanvas";
import SettingsPanel from "./settings/SettingsPanel";
import DeleteConfirmModal from "./DeleteConfirmModal";
import BreadcrumbBar from "./canvas/BreadcrumbBar";
import CanvasNode from "./canvas/CanvasNode";
import { resolveDropTarget, getActiveCenterY } from "./utils/treeUtils";
import { BlockRegistry } from "./BlockRegistry";

export default function DragDropBuilderContainer({
  initialBlocksAst,
  onChange,
  postTitle,
  onTitleChange,
  onSave,
  onPreview,
  isSaving,
  isPreviewLoading,
  postStatus,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [mobileLeftDrawerOpen, setMobileLeftDrawerOpen] = useState(false);
  const [mobileRightDrawerOpen, setMobileRightDrawerOpen] = useState(false);

  const { mdDown, lgDown } = useBreakpoints();
  const isNarrow = mdDown; // < 768px
  const isMedium = lgDown && !mdDown; // 768px - 1039px

  const hydrate = useBuilderStore((s) => s.hydrate);
  const blocksById = useBuilderStore((s) => s.blocksById);
  const rootIds = useBuilderStore((s) => s.rootIds);
  const getBlocksAst = useBuilderStore((s) => s.getBlocksAst);
  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);
  const canUndo = useBuilderStore((s) => s.canUndo());
  const canRedo = useBuilderStore((s) => s.canRedo());
  const selectedBlockId = useBuilderStore((s) => s.selectedBlockId);
  const selectedBlockIds = useBuilderStore((s) => s.selectedBlockIds) || [];
  const clearSelection = useBuilderStore((s) => s.clearSelection);
  const deleteBlock = useBuilderStore((s) => s.deleteBlock);
  const deleteSelectedBlocks = useBuilderStore((s) => s.deleteSelectedBlocks);
  const requestDeleteSelectedBlocks = useBuilderStore((s) => s.requestDeleteSelectedBlocks);
  const duplicateBlock = useBuilderStore((s) => s.duplicateBlock);
  const addBlock = useBuilderStore((s) => s.addBlock);
  const deviceMode = useBuilderStore((s) => s.deviceMode);
  const setDeviceMode = useBuilderStore((s) => s.setDeviceMode);
  const zoomLevel = useBuilderStore((s) => s.zoomLevel);
  const setZoomLevel = useBuilderStore((s) => s.setZoomLevel);

  const [activeId, setActiveId] = useState(null);
  const activeBlock = useBuilderStore((s) => activeId && !String(activeId).startsWith("new-block-") ? s.blocksById[activeId] : null);

  // Exclude KeyboardSensor so sidebar native click/enter works normally
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const announcements = {
    onDragStart({ active }) {
      const type = active.data.current?.type || "Block";
      return `Picked up ${type}.`;
    },
    onDragOver({ active, over }) {
      if (over) return `Block over position ${over.id}.`;
      return "Block is over an invalid area.";
    },
    onDragEnd({ active, over }) {
      if (over) return `Block dropped at position ${over.id}.`;
      return "Block drag cancelled.";
    },
    onDragCancel() {
      return "Block drag cancelled.";
    }
  };

// Global pointer X/Y tracker for precise coordinates during drag events
if (typeof window !== "undefined" && !window.__lastPointerTracker) {
  window.__lastPointerTracker = true;
  window.addEventListener("pointermove", (e) => { 
    window.__lastPointerX = e.clientX; 
    window.__lastPointerY = e.clientY; 
  }, { passive: true });
}

  // Custom collision detection to guarantee a drop target for external & internal blocks
  const customCollisionDetection = (args) => {
    // 1. Safely extract all droppable container objects into a JS Array
    const allContainers = Array.from(
      args.droppableContainers?.values?.() || args.droppableContainers || []
    );

    // 2. Separate specific CanvasNode block containers from canvas-root
    const blockContainers = allContainers.filter(
      (c) => c && c.id !== "canvas-root" && !c.disabled
    );

    // Get pointer X and Y coordinates with 3-tier fallbacks
    const pointerX =
      args.pointerCoordinates?.x ||
      (typeof window !== "undefined" ? window.__lastPointerX : 0) || 0;

    const pointerY =
      args.pointerCoordinates?.y ||
      getActiveCenterY(args.active) ||
      (typeof window !== "undefined" ? window.__lastPointerY : 0) || 0;

    if (blockContainers.length > 0 && (pointerX > 0 || pointerY > 0)) {
      const directHits = [];

      // 3. Direct 2D (X/Y) hit: check if pointer is inside a block's bounding rect
      for (const c of blockContainers) {
        const node = c.node?.current || document.getElementById(c.id);
        const domRect = node?.getBoundingClientRect?.() || c.rect?.current;
        if (domRect && domRect.width > 0 && domRect.height > 0) {
          if (
            pointerX >= domRect.left &&
            pointerX <= domRect.right &&
            pointerY >= domRect.top &&
            pointerY <= domRect.bottom
          ) {
            const area = domRect.width * domRect.height;
            directHits.push({ container: c, rect: domRect, area });
          }
        }
      }

      // If we have direct 2D hits, pick the SMALLEST container (deepest nested child, e.g. Column over Section)
      if (directHits.length > 0) {
        directHits.sort((a, b) => a.area - b.area);
        const best = directHits[0];
        useBuilderStore.getState().setLastDropTarget({ id: best.container.id, rect: best.rect });
        return [{ id: best.container.id }];
      }

      // 4. Closest 2D center fallback (Euclidean distance)
      let closestContainer = null;
      let closestRect = null;
      let minDistance = Infinity;

      for (const c of blockContainers) {
        const node = c.node?.current || document.getElementById(c.id);
        const domRect = node?.getBoundingClientRect?.() || c.rect?.current;
        if (domRect && domRect.width > 0 && domRect.height > 0) {
          const centerX = domRect.left + domRect.width / 2;
          const centerY = domRect.top + domRect.height / 2;
          const dist = Math.hypot(pointerX - centerX, pointerY - centerY);

          if (dist < minDistance) {
            minDistance = dist;
            closestContainer = c;
            closestRect = domRect;
          }
        }
      }

      if (closestContainer) {
        useBuilderStore.getState().setLastDropTarget({ id: closestContainer.id, rect: closestRect });
        return [{ id: closestContainer.id }];
      }
    }

    // 5. Final fallback: empty canvas
    useBuilderStore.getState().setLastDropTarget({ id: "canvas-root", rect: null });
    return [{ id: "canvas-root" }];
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
    useBuilderStore.getState().setActiveDragId(event.active.id);
  };



  const handleDragEnd = (event) => {
    let { active, over } = event;
    setActiveId(null);
    useBuilderStore.getState().setActiveDragId(null);

    const state = useBuilderStore.getState();

    // Reconstruct over from lastDropTarget if dnd-kit reports null
    if (!over) {
      const fallbackTarget = state.lastDropTarget;
      if (!fallbackTarget) return;

      over = {
        id: fallbackTarget.id,
        rect: fallbackTarget.rect,
        data: {
          current: {
            isSection: fallbackTarget.id !== "canvas-root" && state.blocksById[fallbackTarget.id]?.type === "Section"
          }
        }
      };
    }

    const isNew = active.data.current?.isNew;

    // Handle drop on empty canvas
    if (over.id === "canvas-root") {
      if (isNew) {
        addBlock(active.data.current.type, active.data.current.settings, null, rootIds.length);
      } else {
        useBuilderStore.getState().moveBlock(active.id, null, rootIds.length);
      }
      return;
    }

    if (!isNew && active.id === over.id) return;

    const overIsSection = over.data.current?.isSection === true;

    // Determine above/below insertion using cursor vs hovered block center
    let isBelow = false;
    if (active && over?.rect) {
      const activeCenter = getActiveCenterY(active);
      const overCenter = over.rect.top + over.rect.height / 2;
      if (activeCenter > 0 && overCenter > 0) {
        isBelow = activeCenter > overCenter;
      }
    }

    const target = resolveDropTarget(state.blocksById, state.rootIds, active.id, over.id, overIsSection, isBelow);

    if (target) {
      if (isNew) {
        addBlock(active.data.current.type, active.data.current.settings, target.newParentId, target.newIndex);
      } else {
        useBuilderStore.getState().moveBlock(active.id, target.newParentId, target.newIndex);
      }
    }
  };

  // Symmetric auto-open & auto-close right settings drawer on block selection/deselection in narrow mode
  useEffect(() => {
    if (isNarrow) {
      if (selectedBlockId) {
        setMobileRightDrawerOpen(true);
      } else {
        setMobileRightDrawerOpen(false);
      }
    }
  }, [selectedBlockId, isNarrow]);

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
        if (mobileLeftDrawerOpen) {
          setMobileLeftDrawerOpen(false);
          return;
        }
        if (mobileRightDrawerOpen) {
          setMobileRightDrawerOpen(false);
          return;
        }
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

      if (selectedBlockId || selectedBlockIds.length > 0) {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          requestDeleteSelectedBlocks();
          return;
        }

        if (cmdOrCtrl && e.key.toLowerCase() === "d") {
          e.preventDefault();
          if (selectedBlockId) duplicateBlock(selectedBlockId);
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
          const targetId = selectedBlockId || selectedBlockIds[0];
          const nodeToCopy = targetId ? findInAst(ast, targetId) : null;
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
  }, [isFullscreen, selectedBlockId, selectedBlockIds, clearSelection, deleteBlock, deleteSelectedBlocks, duplicateBlock, undo, redo, getBlocksAst, addBlock]);

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
        zIndex: 100,
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

  let dragOverlayContent = null;
  if (activeId) {
    if (String(activeId).startsWith("new-block-")) {
      // It's a new block from the sidebar
      const type = activeId.replace("new-block-", "");
      const entry = BlockRegistry[type];
      if (entry) {
        dragOverlayContent = (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            width: "80px",
            height: "72px",
            background: "#fff",
            border: "2px solid #008060",
            borderRadius: "8px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
            transform: "scale(1.05) rotate(2deg)",
            pointerEvents: "none",
          }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e8f5f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#008060" }}>
              {entry.icon}
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600 }}>{entry.label}</span>
          </div>
        );
      }
    } else if (activeBlock) {
      // It's an existing block from the canvas
      dragOverlayContent = (
        <div style={{ 
          opacity: 0.95, 
          transform: "scale(1.02) rotate(1.5deg)", 
          pointerEvents: "none",
          boxShadow: "0 20px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
          borderRadius: "4px",
          background: "#fff"
        }}>
          <CanvasNode id={activeBlock.id} isGhost={true} />
        </div>
      );
    }
  }

  const builderUI = (
    <DndContext
      id="root-dnd-context"
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        useBuilderStore.getState().setActiveDragId(null);
      }}
      announcements={announcements}
    >
      <div style={containerStyle}>
      {/* ── Top Bar ── */}
      <Box padding="300" borderBlockEndWidth="025" borderColor="border-secondary" background="bg-surface">
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          {/* Left Controls: Sidebar toggles & Title */}
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <div style={{ display: "flex", alignItems: "center", lineHeight: 0 }}>
              <Tooltip activatorWrapper="div" content={showLeftSidebar ? "Hide Blocks Sidebar" : "Show Blocks Sidebar"}>
                <Button
                  variant="tertiary"
                  icon={LayoutSidebarLeftIcon}
                  onClick={() => setShowLeftSidebar(!showLeftSidebar)}
                  tone={showLeftSidebar ? "success" : undefined}
                />
              </Tooltip>
            </div>

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
                {isSaving ? "Saving..." : (postStatus === "published" ? "Save & Sync" : "Save Draft")}
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

            <div style={{ display: "flex", alignItems: "center", lineHeight: 0 }}>
              <Tooltip activatorWrapper="div" content={showRightSidebar ? "Hide Settings Panel" : "Show Settings Panel"}>
                <Button
                  variant="tertiary"
                  icon={LayoutSidebarRightIcon}
                  onClick={() => setShowRightSidebar(!showRightSidebar)}
                  tone={showRightSidebar ? "success" : undefined}
                />
              </Tooltip>
            </div>
          </InlineStack>
        </InlineStack>
      </Box>

      {/* ── Responsive Three-Pane Layout ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Left Pane: Block Picker (Wide & Medium Modes) */}
        {!isNarrow && showLeftSidebar && (
          <div
            style={{
              width: isMedium ? "48px" : "320px",
              borderRight: "1px solid var(--p-color-border-secondary)",
              background: "var(--p-color-bg-surface-secondary)",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              transition: "width 0.2s ease",
              zIndex: 10,
              position: "relative",
              boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
            }}
          >
            <BlockPicker isRailMode={isMedium} />
          </div>
        )}

        {/* Center Pane: Breadcrumb + Canvas */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", background: "var(--p-color-bg-surface-tertiary)" }}>
          <BreadcrumbBar />
          <div style={{ flex: 1, width: "100%", height: "100%", overflow: "auto", position: "relative" }}>
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "top center",
                width: zoomLevel > 1 ? `${100 / zoomLevel}%` : "100%",
                minHeight: zoomLevel > 1 ? `${100 / zoomLevel}%` : "100%",
                margin: "0 auto",
                transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <BuilderCanvas deviceMode={deviceMode} />
            </div>
          </div>

          {/* Floating Action Buttons (FAB) on Narrow Screen (<768px) */}
          {isNarrow && (
            <div
              style={{
                position: "absolute",
                bottom: "16px",
                left: "16px",
                right: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                pointerEvents: "none",
                zIndex: 50,
              }}
            >
              <div style={{ pointerEvents: "auto" }}>
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  onClick={() => setMobileLeftDrawerOpen(true)}
                  accessibilityLabel="Open block picker"
                >
                  Add Blocks
                </Button>
              </div>

              {selectedBlockId && (
                <div style={{ pointerEvents: "auto" }}>
                  <Button
                    variant="secondary"
                    icon={LayoutSidebarRightIcon}
                    onClick={() => setMobileRightDrawerOpen(!mobileRightDrawerOpen)}
                    accessibilityLabel="Toggle Settings"
                  >
                    Settings
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Pane: Settings (Wide & Medium Modes) */}
        {!isNarrow && showRightSidebar && (
          <div
            style={{
              width: isMedium ? "260px" : "300px",
              borderLeft: "1px solid var(--p-color-border-secondary)",
              background: "var(--p-color-bg-surface)",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              transition: "width 0.2s ease",
              zIndex: 10,
              position: "relative",
              boxShadow: "-2px 0 8px rgba(0,0,0,0.04)",
            }}
          >
            <SettingsPanel />
          </div>
        )}

        {/* ── Narrow Viewport (<768px): Left Block Picker Drawer Overlay ── */}
        {isNarrow && mobileLeftDrawerOpen && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1000, display: "flex" }}>
            {/* Backdrop */}
            <div
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
              onClick={() => setMobileLeftDrawerOpen(false)}
            />
            {/* Drawer */}
            <div
              style={{
                position: "relative",
                width: "280px",
                maxWidth: "85vw",
                height: "100%",
                background: "var(--p-color-bg-surface)",
                boxShadow: "4px 0 20px rgba(0,0,0,0.15)",
                display: "flex",
                flexDirection: "column",
                zIndex: 1001,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--p-color-border)" }}>
                <Text variant="headingSm">Block Picker</Text>
                <Button
                  variant="tertiary"
                  icon={XIcon}
                  onClick={() => setMobileLeftDrawerOpen(false)}
                  accessibilityLabel="Close block picker"
                />
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <BlockPicker />
              </div>
            </div>
          </div>
        )}

        {/* ── Narrow Viewport (<768px): Right Settings Drawer Overlay ── */}
        {isNarrow && mobileRightDrawerOpen && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
            {/* Backdrop */}
            <div
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
              onClick={() => setMobileRightDrawerOpen(false)}
            />
            {/* Drawer */}
            <div
              style={{
                position: "relative",
                width: "300px",
                maxWidth: "85vw",
                height: "100%",
                background: "var(--p-color-bg-surface)",
                boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
                display: "flex",
                flexDirection: "column",
                zIndex: 1001,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--p-color-border)" }}>
                <Text variant="headingSm">Block Settings</Text>
                <Button
                  variant="tertiary"
                  icon={XIcon}
                  onClick={() => setMobileRightDrawerOpen(false)}
                  accessibilityLabel="Close settings"
                />
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <SettingsPanel />
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
      
      <DragOverlay style={{ pointerEvents: "none" }} dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }) }}>
        {dragOverlayContent}
      </DragOverlay>
      <DeleteConfirmModal />
    </DndContext>
  );

  if (isFullscreen) {
    return createPortal(builderUI, document.body);
  }

  return builderUI;
}
