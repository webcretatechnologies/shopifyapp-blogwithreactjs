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
  PlusIcon 
} from "@shopify/polaris-icons";
import { nanoid } from "./store/nanoid";

const PRESET_TEMPLATES = [
  {
    id: "hero-with-cta",
    title: "Hero Banner + CTA",
    description: "High-impact heading, subtitle, and primary action button.",
    blocks: [
      { type: "Heading", settings: { text: "Welcome to Our Brand", level: 1, align: "center", color: "#111827" } },
      { type: "Paragraph", settings: { text: "Discover our latest collection crafted with premium materials.", align: "center", color: "#4b5563" } },
      { type: "Button", settings: { label: "Shop Now", url: "/collections/all", align: "center", variant: "primary" } },
    ],
  },
  {
    id: "feature-grid",
    title: "3-Feature Highlights",
    description: "Column layout showcasing key selling points or values.",
    blocks: [
      { type: "Heading", settings: { text: "Why Choose Us", level: 2, align: "center" } },
      {
        type: "ColumnLayout",
        settings: { columns: 3, gap: "16px" },
        children: [
          { type: "Column", children: [{ type: "Heading", settings: { text: "Free Shipping", level: 3 } }, { type: "Paragraph", settings: { text: "On all orders over $50" } }] },
          { type: "Column", children: [{ type: "Heading", settings: { text: "24/7 Support", level: 3 } }, { type: "Paragraph", settings: { text: "Dedicated customer service" } }] },
          { type: "Column", children: [{ type: "Heading", settings: { text: "30-Day Returns", level: 3 } }, { type: "Paragraph", settings: { text: "Hassle-free money back guarantee" } }] },
        ],
      },
    ],
  },
];

/**
 * Regenerates nanoid IDs recursively for a raw block tree so that inserting
 * a pattern multiple times never produces duplicate ID keys in the store.
 */
function regenerateBlockIds(node) {
  const newId = nanoid();
  const children = Array.isArray(node.children) ? node.children.map(regenerateBlockIds) : [];
  return {
    ...node,
    id: newId,
    children,
  };
}

export default function BlockPicker({ isRailMode = false }) {
  const [selectedTab, setSelectedTab] = useState(0); // 0: blocks, 1: presets, 2: patterns
  const [searchQuery, setSearchQuery] = useState("");
  const [patterns, setPatterns] = useState([]);
  const [loadingPatterns, setLoadingPatterns] = useState(false);

  const addBlock = useBuilderStore((s) => s.addBlock);
  const selectedBlockId = useBuilderStore((s) => s.selectedBlockId);
  const blocksById = useBuilderStore((s) => s.blocksById);
  const normalizeAstAndHydrate = useBuilderStore((s) => s.normalizeAstAndHydrate);

  // Fetch patterns from backend database
  const fetchPatterns = useCallback(async () => {
    setLoadingPatterns(true);
    try {
      const res = await fetch("/api/patterns");
      if (res.ok) {
        const data = await res.json();
        setPatterns(data.patterns || []);
      }
    } catch (_) {
      /* ignore fetch errors */
    } finally {
      setLoadingPatterns(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTab === 2) {
      fetchPatterns();
    }
  }, [selectedTab, fetchPatterns]);

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

  const handleAddPreset = (preset) => {
    preset.blocks.forEach((templateBlock) => {
      const newBlock = createBlock(templateBlock.type);
      newBlock.settings = { ...newBlock.settings, ...templateBlock.settings };
      addBlock(newBlock.type, newBlock.settings);
    });
  };

  const handleAddPattern = (pattern) => {
    if (!pattern.blocks) return;

    // Deep clone and generate fresh IDs
    const freshRoot = regenerateBlockIds(pattern.blocks);

    // Convert existing store to AST, append fresh pattern AST, and re-hydrate normalized store
    const currentAst = useBuilderStore.getState().getBlocksAst();
    const updatedAst = [...currentAst, freshRoot];
    normalizeAstAndHydrate(updatedAst);
  };

  const handleDeletePattern = async (e, patternId) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/patterns/${patternId}`, { method: "DELETE" });
      if (res.ok) {
        setPatterns((prev) => prev.filter((p) => p.id !== patternId));
      }
    } catch (_) {}
  };

  const query = searchQuery.toLowerCase().trim();

  const tabDefs = [
    { id: 'blocks', label: 'Blocks', icon: LayoutBlockIcon },
    { id: 'presets', label: 'Presets', icon: MagicIcon },
    { id: 'patterns', label: 'Saved', icon: StarIcon },
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
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleAddBlock(type)}
                      aria-label={`Add ${entry.label}`}
                      title={entry.label}
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "6px",
                        border: "1px solid var(--p-color-border-subdued)",
                        background: "var(--p-color-bg-surface)",
                        color: "#008060",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#008060";
                        e.currentTarget.style.background = "#f4f6f8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--p-color-border-subdued)";
                        e.currentTarget.style.background = "var(--p-color-bg-surface)";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center" }}>{entry.icon}</div>
                    </button>
                  );
                })}
              </div>
            ))}

          {selectedTab === 1 &&
            PRESET_TEMPLATES.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleAddPreset(preset)}
                aria-label={`Add Preset: ${preset.title}`}
                title={preset.title}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "6px",
                  border: "1px solid var(--p-color-border)",
                  background: "var(--p-color-bg-surface)",
                  color: "#008060",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Icon source={ThemeTemplateIcon} />
              </button>
            ))}

          {selectedTab === 2 &&
            patterns.map((pattern) => (
              <button
                key={pattern.id}
                type="button"
                onClick={() => handleAddPattern(pattern)}
                aria-label={`Add Pattern: ${pattern.name}`}
                title={pattern.name}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "6px",
                  border: "1px solid var(--p-color-border)",
                  background: "var(--p-color-bg-surface)",
                  color: "#008060",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Icon source={StarIcon} />
              </button>
            ))}
        </div>
      </div>
    );
  }

  // ── Standard Expanded Sidebar Mode ──
  const tabs = tabDefs.map((tab) => ({
    id: tab.id,
    content: (
      <InlineStack align="center" blockAlign="center" gap="100">
        <Icon source={tab.icon} /> {tab.label}
      </InlineStack>
    ),
  }));

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
                          <button
                            key={type}
                            type="button"
                            onClick={() => handleAddBlock(type)}
                            style={{
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
                              cursor: "pointer",
                              transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
                              outline: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "#008060";
                              e.currentTarget.style.background = "#f4f8f6";
                              e.currentTarget.style.transform = "translateY(-1px)";
                              e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,128,96,0.1)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "var(--p-color-border)";
                              e.currentTarget.style.background = "var(--p-color-bg-surface)";
                              e.currentTarget.style.transform = "none";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = "#008060";
                              e.currentTarget.style.boxShadow = "0 0 0 2px rgba(0,128,96,0.2)";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = "var(--p-color-border)";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
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
                          </button>
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

        {/* ── Presets View ── */}
        {selectedTab === 1 && (
          <Box style={{ display: "flex", flexDirection: "column", gap: "var(--p-space-200)" }}>
            {PRESET_TEMPLATES.filter((p) => !query || p.title.toLowerCase().includes(query)).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleAddPreset(preset)}
                style={{
                  background: "var(--p-color-bg-surface)",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "var(--p-border-radius-200)",
                  padding: "var(--p-space-300)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  outline: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--p-color-border-emphasis)";
                  e.currentTarget.style.boxShadow = "var(--p-shadow-100)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--p-color-border)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "none";
                }}
              >
                <Box paddingBlockEnd="100">
                  <InlineStack align="start" blockAlign="center" gap="200">
                    <div style={{ color: "var(--p-color-icon-success)", display: "flex", alignItems: "center" }}>
                      <Icon source={ThemeTemplateIcon} />
                    </div>
                    <Text variant="headingSm" as="h4">
                      {preset.title}
                    </Text>
                  </InlineStack>
                </Box>
                <Text variant="bodySm" tone="subdued">
                  {preset.description}
                </Text>
              </button>
            ))}
          </Box>
        )}

        {/* ── Saved Patterns View (Backend Persisted) ── */}
        {selectedTab === 2 && (
          <Box style={{ display: "flex", flexDirection: "column", gap: "var(--p-space-200)" }}>
            {loadingPatterns ? (
              <Box padding="600">
                <InlineStack align="center" blockAlign="center" gap="200">
                  <Spinner size="small" />
                  <Text tone="subdued">Loading patterns...</Text>
                </InlineStack>
              </Box>
            ) : patterns.length === 0 ? (
              <Box padding="600">
                <div style={{ textAlign: "center" }}>
                  <div style={{ marginBottom: "var(--p-space-200)", color: "var(--p-color-icon-subdued)" }}>
                    <Icon source={StarIcon} />
                  </div>
                  <Box paddingBlockEnd="100">
                    <Text variant="headingSm">No Saved Patterns Yet</Text>
                  </Box>
                  <Text variant="bodySm" tone="subdued">
                    Right-click any block on the canvas and choose "Save as Pattern" to store it here.
                  </Text>
                </div>
              </Box>
            ) : (
              patterns
                .filter((p) => !query || p.name.toLowerCase().includes(query))
                .map((pattern) => (
                  <button
                    key={pattern.id}
                    type="button"
                    onClick={() => handleAddPattern(pattern)}
                    style={{
                      background: "var(--p-color-bg-surface)",
                      border: "1px solid var(--p-color-border)",
                      borderRadius: "var(--p-border-radius-200)",
                      padding: "var(--p-space-300)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      position: "relative",
                      display: "block",
                      width: "100%",
                      outline: "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--p-color-border-emphasis)";
                      e.currentTarget.style.boxShadow = "var(--p-shadow-100)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--p-color-border)";
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <Box paddingBlockEnd="100">
                      <InlineStack align="space-between" blockAlign="center" wrap={false}>
                        <InlineStack align="start" blockAlign="center" gap="100">
                          <div style={{ color: "var(--p-color-icon-success)" }}>
                            <Icon source={StarIcon} />
                          </div>
                          <Text variant="headingSm" as="h4">
                            {pattern.name}
                          </Text>
                        </InlineStack>
                        <button
                          type="button"
                          title="Delete pattern"
                          onClick={(e) => handleDeletePattern(e, pattern.id)}
                          style={{ background: "none", border: "none", color: "var(--p-color-icon-subdued)", cursor: "pointer", padding: "2px" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--p-color-icon-critical)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--p-color-icon-subdued)")}
                        >
                          <Icon source={DeleteIcon} />
                        </button>
                      </InlineStack>
                    </Box>

                    {pattern.description && (
                      <Box paddingBlockEnd="100">
                        <Text variant="bodySm" tone="subdued">
                          {pattern.description}
                        </Text>
                      </Box>
                    )}

                    <InlineStack align="start" blockAlign="center" gap="025">
                      <div style={{ color: "var(--p-color-icon-success)" }}>
                        <Icon source={PlusIcon} />
                      </div>
                      <Text variant="bodySm" tone="success" fontWeight="medium">
                        Click to insert on canvas
                      </Text>
                    </InlineStack>
                  </button>
                ))
            )}
          </Box>
        )}
      </Box>
    </div>
  );
}
