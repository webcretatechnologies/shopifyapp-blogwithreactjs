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

export default function BlockPicker() {
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

  const tabs = [
    {
      id: 'blocks',
      content: (
        <InlineStack align="center" blockAlign="center" gap="100">
          <Icon source={LayoutBlockIcon} /> Blocks
        </InlineStack>
      ),
    },
    {
      id: 'presets',
      content: (
        <InlineStack align="center" blockAlign="center" gap="100">
          <Icon source={MagicIcon} /> Presets
        </InlineStack>
      ),
    },
    {
      id: 'patterns',
      content: (
        <InlineStack align="center" blockAlign="center" gap="100">
          <Icon source={StarIcon} /> Saved
        </InlineStack>
      ),
    },
  ];

  return (
    <Box padding="400" paddingBlockEnd="0" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box paddingBlockEnd="300">
        <Box paddingBlockEnd="200">
          <Text variant="headingMd" as="h2">
            Add Content
          </Text>
        </Box>

        {/* Search Input */}
        <TextField
          placeholder="Search blocks & patterns..."
          value={searchQuery}
          onChange={(val) => setSearchQuery(val)}
          autoComplete="off"
          prefix={<Icon source={SearchIcon} tone="subdued" />}
          labelHidden
          label="Search blocks"
        />
      </Box>

      {/* Tab Buttons */}
      <Box paddingBlockEnd="300">
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} fitted />
      </Box>

      <Box paddingBlockEnd="400" style={{ flex: 1, overflowY: "auto" }}>
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
                  <Box key={category.label} paddingBlockEnd="400">
                    <Box paddingBlockEnd="200">
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--p-color-text-subdued)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {category.label}
                      </span>
                    </Box>
                    <InlineGrid columns={2} gap="200">
                      {filteredTypes.map((type) => {
                        const entry = BlockRegistry[type];
                        return (
                          <button
                            key={type}
                            onClick={() => handleAddBlock(type)}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                              minHeight: "68px",
                              background: "var(--p-color-bg-surface)",
                              border: "1px solid var(--p-color-border-subdued)",
                              borderRadius: "8px",
                              padding: "10px 6px",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "#008060";
                              e.currentTarget.style.background = "#f4f6f8";
                              e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "var(--p-color-border-subdued)";
                              e.currentTarget.style.background = "var(--p-color-bg-surface)";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
                            <div style={{ color: "#008060", display: "flex", alignItems: "center" }}>{entry.icon}</div>
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
          <Box style={{ display: "flex", flexDirection: "column", gap: "var(--p-space-300)" }}>
            {PRESET_TEMPLATES.filter((p) => !query || p.title.toLowerCase().includes(query)).map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleAddPreset(preset)}
                style={{
                  background: "var(--p-color-bg-surface)",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "var(--p-border-radius-200)",
                  padding: "var(--p-space-300)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--p-color-border-emphasis)";
                  e.currentTarget.style.boxShadow = "var(--p-shadow-100)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--p-color-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <Box paddingBlockEnd="100">
                  <InlineStack align="start" blockAlign="center" gap="200">
                    <div style={{ color: "var(--p-color-icon-success)" }}>
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
          <Box style={{ display: "flex", flexDirection: "column", gap: "var(--p-space-300)" }}>
            {loadingPatterns ? (
              <Box padding="800">
                <InlineStack align="center" blockAlign="center" gap="200">
                  <Spinner size="small" />
                  <Text tone="subdued">Loading patterns...</Text>
                </InlineStack>
              </Box>
            ) : patterns.length === 0 ? (
              <Box padding="800">
                <div style={{ textAlign: "center" }}>
                  <div style={{ marginBottom: "var(--p-space-200)", color: "var(--p-color-icon-subdued)" }}>
                    <Icon source={StarIcon} />
                  </div>
                  <Box paddingBlockEnd="100">
                    <Text variant="headingSm">No Saved Patterns Yet</Text>
                  </Box>
                  <Text variant="bodySm" tone="subdued">
                    Right-click any block or container on the canvas and choose "Save as Pattern" to store it here for your team.
                  </Text>
                </div>
              </Box>
            ) : (
              patterns
                .filter((p) => !query || p.name.toLowerCase().includes(query))
                .map((pattern) => (
                  <button
                    key={pattern.id}
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
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--p-color-border-emphasis)";
                      e.currentTarget.style.boxShadow = "var(--p-shadow-100)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--p-color-border)";
                      e.currentTarget.style.boxShadow = "none";
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
    </Box>
  );
}
