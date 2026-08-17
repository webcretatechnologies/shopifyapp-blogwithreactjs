/**
 * SettingsPanel.jsx
 *
 * The right sidebar in the Builder. When a block is selected, shows
 * the appropriate form controls via SettingsControls plus a universal
 * Visibility section (hide-on-device toggles).
 *
 * Debounce strategy:
 *   - Continuous inputs (color pickers, range sliders) call updateBlockSettingsLive
 *     on every change — this updates the canvas immediately but does NOT create an
 *     undo entry. Once the user stops interacting (150ms silence), the debounced
 *     updateBlockSettings fires and commits the final value to the undo stack.
 *   - Discrete inputs (text fields, dropdowns, checkboxes) skip the live path and
 *     commit directly via updateBlockSettings (one undo entry per change).
 */

import { useCallback, useRef, useState, useEffect } from "react";
import { useBuilderStore } from "../store/useBuilderStore";
import SettingsControls from "./SettingsControls";
import { BlockRegistry } from "../BlockRegistry";
import UpgradePrompt from "../../UpgradePrompt";
import { 
  Box, 
  InlineStack, 
  Text, 
  Button, 
  Checkbox, 
  Icon 
} from "@shopify/polaris";
import { 
  XIcon, 
  SettingsIcon, 
  DesktopIcon, 
  TabletIcon, 
  MobileIcon,
  DeleteIcon
} from "@shopify/polaris-icons";

function useDebouncedCommit(id, delayMs = 150) {
  const timerRef = useRef(null);
  const updateBlockSettings = useBuilderStore((s) => s.updateBlockSettings);
  const updateBlockSettingsLive = useBuilderStore((s) => s.updateBlockSettingsLive);

  const handleLive = useCallback(
    (patch) => {
      // Immediately update the canvas without touching undo history
      updateBlockSettingsLive(id, patch);
      // Schedule a debounced commit to undo history
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        updateBlockSettings(id, patch);
      }, delayMs);
    },
    [id, delayMs, updateBlockSettings, updateBlockSettingsLive]
  );

  const handleCommit = useCallback(
    (patch) => {
      clearTimeout(timerRef.current);
      updateBlockSettings(id, patch);
    },
    [id, updateBlockSettings]
  );

  return { handleLive, handleCommit };
}

export default function SettingsPanel() {
  const selectedBlockId = useBuilderStore((s) => s.selectedBlockId);
  const selectedBlockIds = useBuilderStore((s) => s.selectedBlockIds) || [];
  const selectedBlock = useBuilderStore((s) => (selectedBlockId ? s.blocksById[selectedBlockId] : null));
  const updateBlockSettings = useBuilderStore((s) => s.updateBlockSettings);
  const clearSelection = useBuilderStore((s) => s.clearSelection);
  const requestDeleteSelectedBlocks = useBuilderStore((s) => s.requestDeleteSelectedBlocks);
  const deviceMode = useBuilderStore((s) => s.deviceMode);
  const onUpgradeClick = useBuilderStore((s) => s.onUpgradeClick);

  const { handleLive, handleCommit } = useDebouncedCommit(selectedBlockId);

  // device_visibility is a Pro-tier gate — the editor previously let every plan set
  // hideOnMobile/hideOnDesktop with no indication it wouldn't actually apply on the real
  // published page for non-Pro shops (see EditorContentCompiler.js's deviceVisibilityEntitled
  // enforcement, which now silently drops these flags server-side for Free/Starter). Disabling
  // the controls here just makes that restriction visible instead of surprising.
  const [deviceVisibilityEntitled, setDeviceVisibilityEntitled] = useState(true);
  useEffect(() => {
    fetch("/api/posts/plan/features")
      .then((r) => r.json())
      .then((d) => setDeviceVisibilityEntitled(!!d.features?.device_visibility?.enabled))
      .catch(() => {});
  }, []);

  if (selectedBlockIds.length > 1) {
    return (
      <Box padding="600" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--p-space-400)" }}>
          <div style={{ background: "#fef2f2", borderRadius: "50%", padding: "var(--p-space-400)", color: "#d32f2f" }}>
            <Icon source={DeleteIcon} />
          </div>
          <Text variant="headingMd" as="h3">{selectedBlockIds.length} Blocks Selected</Text>
          <Text variant="bodyMd" tone="subdued">
            You have selected {selectedBlockIds.length} blocks. You can delete all of them at the same time or clear selection.
          </Text>
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            <Button variant="tertiary" onClick={clearSelection}>
              Deselect All
            </Button>
            <Button tone="critical" variant="primary" icon={DeleteIcon} onClick={requestDeleteSelectedBlocks}>
              Delete {selectedBlockIds.length} Blocks
            </Button>
          </div>
        </div>
      </Box>
    );
  }

  if (!selectedBlock) {
    return (
      <Box padding="800">
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--p-space-300)" }}>
          <div style={{ background: "var(--p-color-bg-surface-secondary)", borderRadius: "50%", padding: "var(--p-space-300)", color: "var(--p-color-icon-subdued)" }}>
            <Icon source={SettingsIcon} />
          </div>
          <Text variant="headingSm" as="h3">No block selected</Text>
          <Text variant="bodySm" tone="subdued">
            Click any block on the canvas or check items in the Layers panel to select and edit.
          </Text>
        </div>
      </Box>
    );
  }

  const registryEntry = BlockRegistry[selectedBlock.type];
  const settings = selectedBlock.settings || {};

  const deviceIcon = deviceMode === "mobile" ? <Icon source={MobileIcon} /> : deviceMode === "tablet" ? <Icon source={TabletIcon} /> : <Icon source={DesktopIcon} />;

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <Box padding="300" borderBlockEndWidth="025" borderColor="border-secondary" background="bg-surface-secondary">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack align="start" blockAlign="center" gap="200">
            <div style={{ color: "var(--p-color-icon-success)" }}>
              {registryEntry?.icon}
            </div>
            <Text variant="headingMd" as="h3">
              {registryEntry?.label || selectedBlock.type}
            </Text>
          </InlineStack>

          <Button
            variant="tertiary"
            icon={XIcon}
            onClick={clearSelection}
            accessibilityLabel="Deselect block"
          />
        </InlineStack>
      </Box>

      {/* Block-specific controls */}
      <div style={{ padding: "var(--p-space-400)", overflowY: "auto", flex: 1 }}>
        <SettingsControls
          block={selectedBlock}
          onChange={handleCommit}
          onChangeLive={handleLive}
        />

        {/* ── Visibility Section ── */}
        <Box paddingBlockStart="400">
          <div style={{ borderTop: "1px solid var(--p-color-border-secondary)", paddingTop: "var(--p-space-400)" }}>
            <Box paddingBlockEnd="300">
              <InlineStack align="start" blockAlign="center" gap="100">
                <span style={{ color: "var(--p-color-icon-subdued)" }}>
                  {deviceIcon}
                </span>
                <Text variant="headingSm" tone="subdued" as="h4">
                  VISIBILITY
                </Text>
              </InlineStack>
            </Box>

            {!deviceVisibilityEntitled && (
              <Box paddingBlockEnd="300">
                <UpgradePrompt
                  onUpgrade={onUpgradeClick || undefined}
                  requiredPlan="Pro"
                  title="Hide-on-device is a Pro feature"
                  description="These controls take effect on your published articles once you upgrade."
                />
              </Box>
            )}

            <Box style={{ display: "flex", flexDirection: "column", gap: "var(--p-space-200)" }}>
              {[
                { key: "hideOnDesktop", label: "Hide on Desktop", icon: DesktopIcon },
                { key: "hideOnTablet",  label: "Hide on Tablet",  icon: TabletIcon },
                { key: "hideOnMobile",  label: "Hide on Mobile",  icon: MobileIcon },
              ].map(({ key, label, icon }) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: settings[key] ? "var(--p-color-bg-surface-critical)" : "transparent",
                    border: settings[key] ? "1px solid var(--p-color-border-critical)" : "1px solid transparent",
                    borderRadius: "var(--p-border-radius-200)",
                    padding: "var(--p-space-200) var(--p-space-300)",
                    transition: "all 0.1s ease",
                  }}
                >
                  <Checkbox
                    label={
                      <span style={{ display: "flex", alignItems: "center", gap: "var(--p-space-150)", color: settings[key] ? "var(--p-color-text-critical)" : "var(--p-color-text)" }}>
                        <Icon source={icon} tone={settings[key] ? "critical" : "base"} />
                        {label}
                      </span>
                    }
                    checked={!!settings[key]}
                    disabled={!deviceVisibilityEntitled}
                    onChange={(newChecked) => updateBlockSettings(selectedBlock.id, { [key]: newChecked })}
                  />
                </div>
              ))}
            </Box>

            <Box paddingBlockStart="200">
              <Text tone="subdued" variant="bodySm">
                Hidden blocks still appear in the editor with an overlay. They are fully hidden on the live storefront.
              </Text>
            </Box>
          </div>
        </Box>
      </div>
    </Box>
  );
}
