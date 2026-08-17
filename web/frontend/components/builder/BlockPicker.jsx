import { useState, useEffect, useCallback } from "react";
import { BlockRegistry, BLOCK_CATEGORIES, createBlock, normalizeBlockType, applyThemeColorDefaults, applyThemeShapeDefaults } from "./BlockRegistry";
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
  ListBulletedIcon,
  LockIcon
} from "@shopify/polaris-icons";
import { nanoid } from "./store/nanoid";
import LayersPanel from "./sidebar/LayersPanel";
import { useDraggable } from "@dnd-kit/core";

// Maps an insertable block type to the PlanFeature key that gates it on the real published page
// (EditorContentCompiler.js — see its device_visibility/toc/faq/product-family enforcement).
// Before this, the picker let every plan drag in any block with zero indication that a
// lower-tier shop's copy of it would silently compile to nothing at Save & Sync — a merchant
// could build an entire section around a FAQ block on Free and only discover it never rendered
// after publishing. Types not listed here have no gate (available at every plan).
const BLOCK_TYPE_GATE = {
  TableOfContents: "toc",
  FaqBlock: "faq",
  BuyButton: "product",
  ProductGrid: "product_switcher",
  ProductSlider: "product_slider",
};

function DraggableBlockItem({ type, entry, onClick, isRailMode, locked }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `new-block-${type}`,
    data: { isNew: true, type, settings: entry.defaultSettings },
    disabled: locked,
  });

  const pointerListeners = locked ? {} : { ...listeners };
  delete pointerListeners.onKeyDown;

  return (
    <button
      ref={setNodeRef}
      {...pointerListeners}
      {...attributes}
      type="button"
      onClick={onClick}
      aria-label={locked ? `${entry.label} — requires a plan upgrade` : `Add ${entry.label}`}
      title={locked ? "This feature isn't included on your current plan. Upgrade to unlock it." : undefined}
      style={isRailMode ? {
        width: "36px",
        height: "36px",
        borderRadius: "6px",
        border: "1px solid var(--p-color-border-subdued)",
        background: "var(--p-color-bg-surface)",
        color: locked ? "var(--p-color-icon-disabled)" : "#008060",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: locked ? "not-allowed" : (isDragging ? "grabbing" : "grab"),
        transition: "all 0.15s ease",
        outline: "none",
        opacity: locked ? 0.5 : (isDragging ? 0.5 : 1),
        position: "relative",
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
        cursor: locked ? "not-allowed" : (isDragging ? "grabbing" : "grab"),
        transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
        outline: "none",
        opacity: locked ? 0.55 : (isDragging ? 0.5 : 1),
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (isDragging || locked) return;
        e.currentTarget.style.borderColor = "#008060";
        e.currentTarget.style.background = isRailMode ? "#f4f6f8" : "#f4f8f6";
        if (!isRailMode) {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,128,96,0.1)";
        }
      }}
      onMouseLeave={(e) => {
        if (isDragging || locked) return;
        e.currentTarget.style.borderColor = isRailMode ? "var(--p-color-border-subdued)" : "var(--p-color-border)";
        e.currentTarget.style.background = "var(--p-color-bg-surface)";
        if (!isRailMode) {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "none";
        }
      }}
      onFocus={(e) => {
        if (locked) return;
        e.currentTarget.style.borderColor = "#008060";
        e.currentTarget.style.boxShadow = "0 0 0 2px rgba(0,128,96,0.2)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = isRailMode ? "var(--p-color-border-subdued)" : "var(--p-color-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {locked && (
        <div
          style={{
            position: "absolute",
            top: isRailMode ? "-4px" : "4px",
            right: isRailMode ? "-4px" : "4px",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            background: "var(--p-color-bg-surface-secondary)",
            border: "1px solid var(--p-color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--p-color-icon-subdued)",
          }}
        >
          <Icon source={LockIcon} />
        </div>
      )}
      {isRailMode ? (
        <div style={{ display: "flex", alignItems: "center", color: locked ? "var(--p-color-icon-disabled)" : "#008060" }}>
          {entry.icon}
        </div>
      ) : (
        <>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: locked ? "var(--p-color-bg-surface-secondary)" : "#e8f5f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: locked ? "var(--p-color-icon-disabled)" : "#008060",
            }}
          >
            {entry.icon}
          </div>
          <Text variant="bodySm" alignment="center" fontWeight="medium" tone={locked ? "subdued" : undefined}>
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

  // Which gated block types this shop's plan doesn't include — drives the locked/disabled state
  // below. Fetched once per mount; Sync Features changes an admin makes take effect on this
  // shop's next editor load, same freshness as every other plan-gated UI in the app.
  const [lockedTypes, setLockedTypes] = useState(new Set());
  useEffect(() => {
    fetch("/api/posts/plan/features")
      .then((r) => r.json())
      .then((d) => {
        const locked = new Set();
        for (const [type, gateKey] of Object.entries(BLOCK_TYPE_GATE)) {
          if (!d.features?.[gateKey]?.enabled) locked.add(type);
        }
        setLockedTypes(locked);
      })
      .catch(() => {});
  }, []);

  const handleAddBlock = async (type) => {
    if (lockedTypes.has(type)) return; // gated for this plan — refuse to insert, same as the
    // real compiler will refuse to render it if bypassed some other way
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

    // Re-pull the shop's current theme-synced settings right before creating the block,
    // rather than relying solely on the one-time fetch at page mount — settings saved in
    // another tab/session, or a stale mount that never re-ran, would otherwise silently be
    // missed. Fails soft: on any error, falls back to whatever defaults are already patched.
    try {
      const res = await fetch("/api/settings");
      const { settings } = await res.json();
      if (settings?.primaryColor || settings?.secondaryColor || settings?.textColor) {
        applyThemeColorDefaults({
          primaryColor: settings.primaryColor,
          secondaryColor: settings.secondaryColor,
          textColor: settings.textColor,
        });
      }
      if (settings?.buttonRadius !== undefined) {
        applyThemeShapeDefaults({ buttonRadius: settings.buttonRadius });
      }
    } catch {}

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
                      locked={lockedTypes.has(type)}
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
                            locked={lockedTypes.has(type)}
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
