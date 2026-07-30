import { useState, useEffect, useCallback } from "react";
import { BlockRegistry, BLOCK_CATEGORIES, createBlock, normalizeBlockType } from "./BlockRegistry";
import { useBuilderStore } from "./store/useBuilderStore";
import { 
  Box, 
  Tabs, 
  TextField, 
  Text, 
  InlineGrid, 
  Icon, 
  Spinner,
  InlineStack
} from "@shopify/polaris";
import { 
  SearchIcon, 
  LayoutBlockIcon, 
  MagicIcon, 
  StarIcon,
  ThemeTemplateIcon,
  DeleteIcon,
  PlusIcon,
  ListBulletedIcon
} from "@shopify/polaris-icons";
import { nanoid } from "./store/nanoid";
import LayersPanel from "./sidebar/LayersPanel";
import { useDraggable } from "@dnd-kit/core";

function DraggableBlockItem({ type, entry, onClick, isRailMode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `new-block-${type}`,
    data: { isNew: true, type, settings: entry.defaultSettings },
  });

  const pointerListeners = { ...listeners };
  delete pointerListeners.onKeyDown;

  return (
    <button
      ref={setNodeRef}
      {...pointerListeners}
      {...attributes}
      type="button"
      onClick={onClick}
      aria-label={`Add ${entry.label}`}
      style={isRailMode ? {
        width: "36px",
        height: "36px",
        borderRadius: "6px",
        border: "1px solid var(--p-color-border-subdued)",
        background: "var(--p-color-bg-surface)",
        color: "#008060",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: isDragging ? "grabbing" : "grab",
        transition: "all 0.15s ease",
        outline: "none",
        opacity: isDragging ? 0.5 : 1,
      } : {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        minHeight: "72px",
        background: "var(--p-color-bg-surface)",
        border: "1px solid var(--p-color-border)",
        borderRadius: "8px",
        padding: "10px 6px",
        cursor: isDragging ? "grabbing" : "grab",
        transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
        outline: "none",
        opacity: isDragging ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (isDragging) return;
        e.currentTarget.style.borderColor = "#008060";
        e.currentTarget.style.background = isRailMode ? "#f4f6f8" : "#f4f8f6";
        if (!isRailMode) {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,128,96,0.1)";
        }
      }}
      onMouseLeave={(e) => {
        if (isDragging) return;
        e.currentTarget.style.borderColor = isRailMode ? "var(--p-color-border-subdued)" : "var(--p-color-border)";
        e.currentTarget.style.background = "var(--p-color-bg-surface)";
        if (!isRailMode) {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "none";
        }
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "#008060";
        e.currentTarget.style.boxShadow = "0 0 0 2px rgba(0,128,96,0.2)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = isRailMode ? "var(--p-color-border-subdued)" : "var(--p-color-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {isRailMode ? (
        <div style={{ display: "flex", alignItems: "center", color: "#008060" }}>
          {entry.icon}
        </div>
      ) : (
        <>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: "#e8f5f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#008060",
            }}
          >
            {entry.icon}
          </div>
          <Text variant="bodySm" alignment="center" fontWeight="medium">
            {entry.label}
          </Text>
        </>
      )}
    </button>
  );
}

export default function BlockPicker({ isRailMode = false }) {
  const [selectedTab, setSelectedTab] = useState(0); // 0: blocks, 1: layers
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleSwitchTab = (e) => {
      const tabIndex = typeof e.detail === "number" ? e.detail : 0;
      setSelectedTab(tabIndex);
    };
    window.addEventListener("builder:switch-tab", handleSwitchTab);
    return () => window.removeEventListener("builder:switch-tab", handleSwitchTab);
  }, []);

  const addBlock = useBuilderStore((s) => s.addBlock);
  const selectedBlockId = useBuilderStore((s) => s.selectedBlockId);
  const blocksById = useBuilderStore((s) => s.blocksById);

  const handleAddBlock = (type) => {
    let targetParentId = null;
    if (selectedBlockId && blocksById[selectedBlockId]) {
      const sel = blocksById[selectedBlockId];
      const entry = BlockRegistry[normalizeBlockType(sel.type)];
      if (entry?.allowsChildren && sel.type !== "ColumnLayout") {
        targetParentId = sel.id;
      } else if (sel.parentId) {
        const parent = blocksById[sel.parentId];
        const parentEntry = parent ? BlockRegistry[normalizeBlockType(parent.type)] : null;
        if (parentEntry?.allowsChildren && parent.type !== "ColumnLayout") {
          targetParentId = parent.id;
        }
      }
    }

    const { defaultSettings } = BlockRegistry[type] || {};
    addBlock(type, defaultSettings || {}, targetParentId);
  };

  const query = searchQuery.toLowerCase().trim();

  const tabDefs = [
    { id: 'blocks', label: 'Blocks', icon: LayoutBlockIcon },
    { id: 'layers', label: 'Layers', icon: ListBulletedIcon },
  ];

  // ── Render 48px Icon Rail Mode ──
  if (isRailMode) {
    return (
      <div
        style={{
          width: "48px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "8px 4px",
          background: "var(--p-color-bg-surface-secondary)",
          borderRight: "1px solid var(--p-color-border-secondary)",
          boxSizing: "border-box",
        }}
      >
        {/* Pinned Tab Header Icons (Visually Separated) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            paddingBottom: "8px",
            marginBottom: "8px",
            borderBottom: "1px solid var(--p-color-border)",
            width: "100%",
            alignItems: "center",
          }}
        >
          {tabDefs.map((tab, idx) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(idx)}
              aria-label={`Tab: ${tab.label}`}
              title={tab.label}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "6px",
                border: "none",
                background: selectedTab === idx ? "#008060" : "transparent",
                color: selectedTab === idx ? "#ffffff" : "var(--p-color-icon)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Icon source={tab.icon} />
            </button>
          ))}
        </div>

        {/* Scrollable Block / Content Icons List */}
        <div
          style={{
            flex: 1,
            width: "100%",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {selectedTab === 0 &&
            BLOCK_CATEGORIES.map((category) => (
              <div key={category.label} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <div
                  style={{
                    width: "20px",
                    height: "1px",
                    background: "var(--p-color-border-subdued)",
                    margin: "4px 0",
                  }}
                  title={category.label}
                />
                {category.types.map((type) => {
                  const entry = BlockRegistry[type];
                  if (!entry) return null;
                  return (
                    <DraggableBlockItem 
                      key={type} 
                      type={type} 
                      entry={entry} 
                      onClick={() => handleAddBlock(type)} 
                      isRailMode={true}
                    />
                  );
                })}
              </div>
            ))}
        </div>
      </div>
    );
  }

  // ── Standard Expanded Sidebar Mode ──

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--p-color-bg-surface-secondary)",
        padding: "20px 20px 0 20px",
        boxSizing: "border-box",
      }}
    >
      {/* Custom Sleek Scrollbar Styles */}
      <style>{`
        .block-picker-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .block-picker-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .block-picker-scroll::-webkit-scrollbar-thumb {
          background: var(--p-color-border);
          border-radius: 4px;
        }
        .block-picker-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--p-color-border-emphasis);
        }
      `}</style>

      {/* Header & Search */}
      <Box paddingBlockEnd="200">
        <Box paddingBlockEnd="200">
          <Text variant="headingSm" as="h3" fontWeight="bold">
            Add Content
          </Text>
        </Box>

        {/* Search Input with Clear Button */}
        <TextField
          placeholder="Search blocks & patterns..."
          value={searchQuery}
          onChange={(val) => setSearchQuery(val)}
          autoComplete="off"
          prefix={<Icon source={SearchIcon} tone="subdued" />}
          clearButton={Boolean(searchQuery)}
          onClearButtonClick={() => setSearchQuery("")}
          labelHidden
          label="Search blocks"
          selectTextOnFocus
        />
      </Box>

      {/* Segmented Control Tab Buttons (Never collapses into "More views") */}
      <Box paddingBlockEnd="250">
        <div
          style={{
            display: "flex",
            background: "var(--p-color-bg-surface)",
            border: "1px solid var(--p-color-border)",
            borderRadius: "8px",
            padding: "3px",
            gap: "2px",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          {tabDefs.map((tab, idx) => (
            <button
              id={`builder-tab-${tab.id}`}
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(idx)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                padding: "6px 4px",
                borderRadius: "6px",
                border: "none",
                background: selectedTab === idx ? "#008060" : "transparent",
                color: selectedTab === idx ? "#ffffff" : "var(--p-color-text-subdued)",
                fontSize: "12px",
                fontWeight: selectedTab === idx ? 600 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
                outline: "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", transform: "scale(0.85)" }}>
                <Icon source={tab.icon} tone={selectedTab === idx ? undefined : "subdued"} />
              </div>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </Box>

      {/* Content Area */}
      <Box paddingBlockEnd="300" style={{ flex: 1, overflowY: "auto", paddingRight: "8px", paddingBottom: "20px" }} className="block-picker-scroll">
        {/* ── Blocks View ── */}
        {selectedTab === 0 && (
          <Box>
            {(() => {
              let totalRendered = 0;
              const categoryElements = BLOCK_CATEGORIES.map((category) => {
                const filteredTypes = category.types.filter((type) => {
                  const entry = BlockRegistry[type];
                  if (!entry) return false;
                  if (!query) return true;
                  return (
                    entry.label.toLowerCase().includes(query) ||
                    type.toLowerCase().includes(query) ||
                    category.label.toLowerCase().includes(query)
                  );
                });

                if (filteredTypes.length === 0) return null;
                totalRendered += filteredTypes.length;

                return (
                  <Box key={category.label} paddingBlockEnd="300">
                    <Box paddingBlockEnd="150" paddingInlineStart="050" paddingBlockStart="100">
                      <Text variant="bodyXs" tone="subdued" fontWeight="bold" as="span" style={{ textTransform: "uppercase", letterSpacing: "0.8px" }}>
                        {category.label}
                      </Text>
                    </Box>
                    <InlineGrid columns={2} gap="300">
                      {filteredTypes.map((type) => {
                        const entry = BlockRegistry[type];
                        return (
                          <DraggableBlockItem 
                            key={type} 
                            type={type} 
                            entry={entry} 
                            onClick={() => handleAddBlock(type)} 
                          />
                        );
                      })}
                    </InlineGrid>
                  </Box>
                );
              });

              if (totalRendered === 0 && query) {
                return (
                  <Box padding="500">
                    <Text alignment="center" tone="subdued">
                      No blocks match "{searchQuery}"
                    </Text>
                  </Box>
                );
              }

              return categoryElements;
            })()}
          </Box>
        )}

        {selectedTab === 1 && (
          <Box padding="0">
            <LayersPanel />
          </Box>
        )}
      </Box>
    </div>
  );
}
