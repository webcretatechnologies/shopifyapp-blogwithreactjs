import { useState, useCallback } from "react";
import {
  Button,
  Popover,
  DatePicker,
  Icon,
  TextField,
  Box,
  ActionList,
} from "@shopify/polaris";
import { CalendarIcon, ArrowRightIcon } from "@shopify/polaris-icons";

function parseDate(str) {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  return null;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const PRESETS = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Last 90 days", "Last 12 months", "Custom"];

function getPresetRange(preset) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  switch (preset) {
    case "Today":
      return { start: new Date(end), end: new Date(end) };
    case "Yesterday": {
      const yesterday = new Date(end);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: yesterday };
    }
    case "Last 7 days": {
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { start, end: new Date(end) };
    }
    case "Last 30 days": {
      const start = new Date(end);
      start.setDate(start.getDate() - 29);
      return { start, end: new Date(end) };
    }
    case "Last 90 days": {
      const start = new Date(end);
      start.setDate(start.getDate() - 89);
      return { start, end: new Date(end) };
    }
    case "Last 12 months": {
      const start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      start.setDate(start.getDate() + 1);
      return { start, end: new Date(end) };
    }
    default:
      return null;
  }
}

// Matches a range against every preset (used to figure out which preset — if any — the
// currently *committed* value corresponds to, so the trigger button can show "Last 30 days"
// instead of a raw date span whenever possible).
function matchPreset(range) {
  if (!range?.start || !range?.end) return null;
  for (const preset of PRESETS) {
    if (preset === "Custom") continue;
    const presetRange = getPresetRange(preset);
    if (
      presetRange &&
      formatDate(presetRange.start) === formatDate(range.start) &&
      formatDate(presetRange.end) === formatDate(range.end)
    ) {
      return preset;
    }
  }
  return null;
}

/**
 * Shopify-admin-style date range picker — Popover + DatePicker + TextField + ActionList, the
 * same composition Shopify's own (now-retired) "date picking" pattern documentation specified.
 * Ported from a working implementation in another project; adapted from that project's
 * URL-searchParams-based state (Remix) to a plain controlled `value`/`onChange` component, since
 * this app's Analytics pages hold the date range in component state, not the URL.
 */
export function DateRangeFilter({ value, onChange }) {
  const [popoverActive, setPopoverActive] = useState(false);

  const [month, setMonth] = useState(value.start.getMonth());
  const [year, setYear] = useState(value.start.getFullYear());
  const [selectedDates, setSelectedDates] = useState(value);
  const [activePreset, setActivePreset] = useState(() => matchPreset(value) || "Custom");

  const handleOpen = useCallback(() => {
    setSelectedDates(value);
    setMonth(value.start.getMonth());
    setYear(value.start.getFullYear());
    setActivePreset(matchPreset(value) || "Custom");
    setPopoverActive(true);
  }, [value]);

  const handleClose = useCallback(() => setPopoverActive(false), []);

  const handlePresetSelect = (preset) => {
    setActivePreset(preset);
    if (preset === "Custom") return;
    const range = getPresetRange(preset);
    if (range) {
      setSelectedDates(range);
      setMonth(range.start.getMonth());
      setYear(range.start.getFullYear());
    }
  };

  const handleMonthChange = useCallback((m, y) => {
    setMonth(m);
    setYear(y);
  }, []);

  const apply = useCallback(() => {
    if (selectedDates.start && selectedDates.end && selectedDates.start <= selectedDates.end) {
      onChange(selectedDates);
    }
    setPopoverActive(false);
  }, [selectedDates, onChange]);

  const clear = useCallback(() => {
    const range = getPresetRange("Last 30 days");
    onChange(range);
    setPopoverActive(false);
  }, [onChange]);

  const committedPreset = matchPreset(value);
  const buttonLabel = committedPreset || `${formatDate(value.start)} to ${formatDate(value.end)}`;

  const activator = (
    <Button onClick={popoverActive ? handleClose : handleOpen} icon={CalendarIcon}>
      {buttonLabel}
    </Button>
  );

  return (
    <Popover active={popoverActive} activator={activator} onClose={handleClose} fluidContent sectioned={false} preferredAlignment="left">
      <div style={{ display: "flex", width: "700px" }}>
        <div style={{ borderRight: "1px solid var(--p-color-border-secondary)", width: "160px", flexShrink: 0 }}>
          <Box padding="200">
            <ActionList
              actionRole="menuitem"
              items={PRESETS.map((p) => ({
                content: p,
                onAction: () => handlePresetSelect(p),
                active: activePreset === p,
              }))}
            />
          </Box>
        </div>

        <div style={{ flex: 1, padding: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
              <div style={{ width: "200px" }}>
                <TextField
                  label="Starting"
                  labelHidden
                  autoComplete="off"
                  value={formatDate(selectedDates.start)}
                  onChange={(v) => {
                    const d = parseDate(v);
                    if (d) {
                      setSelectedDates((prev) => ({ ...prev, start: d }));
                      setMonth(d.getMonth());
                      setYear(d.getFullYear());
                    }
                    setActivePreset("Custom");
                  }}
                />
              </div>
              <Icon source={ArrowRightIcon} tone="subdued" />
              <div style={{ width: "200px" }}>
                <TextField
                  label="Ending"
                  labelHidden
                  autoComplete="off"
                  value={formatDate(selectedDates.end)}
                  onChange={(v) => {
                    const d = parseDate(v);
                    if (d) setSelectedDates((prev) => ({ ...prev, end: d }));
                    setActivePreset("Custom");
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <DatePicker
                month={month}
                year={year}
                multiMonth
                allowRange
                selected={selectedDates}
                onChange={(val) => {
                  setSelectedDates(val);
                  setActivePreset("Custom");
                }}
                onMonthChange={handleMonthChange}
                disableDatesAfter={(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })()}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <Button onClick={clear}>Clear</Button>
              <Button onClick={handleClose}>Cancel</Button>
              <Button variant="primary" onClick={apply}>Apply</Button>
            </div>
          </div>
        </div>
      </div>
    </Popover>
  );
}

export default DateRangeFilter;
export { formatDate as toISODateString };
