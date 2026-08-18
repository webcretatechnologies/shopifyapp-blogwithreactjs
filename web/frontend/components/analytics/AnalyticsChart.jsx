import { useState, useEffect } from "react";
import ReactApexChart from "react-apexcharts";
import {
  Card,
  Text,
  Box,
  InlineStack,
  BlockStack,
  Select,
  Checkbox,
  Tooltip,
} from "@shopify/polaris";

// Lightens a "#rrggbb" color for the muted comparison-overlay line, without adding a color lib.
function fadeColor(hex, opacity) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const [, r, g, b] = m;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${opacity})`;
}

export default function AnalyticsChart({
  data = [],
  title = "Views",
  color = "#008060",
  series: seriesProp,
  chartType = "area",
  period: controlledPeriod,
  showPeriodSelector = true,
  compareData = null,
  showComparison = false,
  onToggleComparison = null,
  comparisonDisabled = false,
}) {
  // Use series if provided; otherwise build from color prop for backward compat
  const series = seriesProp || [{ key: "views", label: "Views", color }];
  const [internalPeriod, setInternalPeriod] = useState("30");
  // When the parent owns the date range (controlled), the internal selector is
  // typically hidden and the data is already scoped server-side.
  const period = controlledPeriod ?? internalPeriod;

  const filtered = data.slice(-parseInt(period));
  const compareActive = showComparison && Array.isArray(compareData) && compareData.length > 0;
  // Comparison is positional ("day N of this period" vs "day N of last period"), not
  // calendar-aligned — the backend already returns compareData zero-filled to the same length.
  const filteredCompare = compareActive ? compareData.slice(-filtered.length) : [];

  const chartSeries = [
    ...series.map((s) => ({
      name: s.label,
      data: filtered.map((d) => d[s.key] || 0),
    })),
    ...(compareActive
      ? series.map((s) => ({
          name: `${s.label} (previous period)`,
          data: filteredCompare.map((d) => d[s.key] || 0),
        }))
      : []),
  ];
  const chartColors = [
    ...series.map((s) => s.color),
    ...(compareActive ? series.map((s) => fadeColor(s.color, 0.55)) : []),
  ];
  const dashArray = [
    ...series.map(() => 0),
    ...(compareActive ? series.map(() => 6) : []),
  ];

  const totals = series.map((s) => ({
    label: s.label,
    total: filtered.reduce((sum, d) => sum + (d[s.key] || 0), 0),
  }));

  // Comparison overlays render as plain lines (no area fill) alongside the primary series —
  // keeps two overlapping gradient fills from turning into visual mud.
  const effectiveType = compareActive ? "line" : chartType;

  const options = {
    chart: {
      type: effectiveType,
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
      sparkline: { enabled: false },
      animations: { enabled: true, speed: 600 },
    },
    colors: chartColors,
    fill: compareActive
      ? { type: "solid", opacity: [...series.map(() => 1), ...series.map(() => 0)] }
      : {
          type: "gradient",
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.35,
            opacityTo: 0.02,
            stops: [0, 100],
          },
        },
    stroke: { curve: "smooth", width: chartSeries.length > 1 ? chartSeries.map(() => 2) : 2, dashArray },
    grid: {
      borderColor: "#e1e3e5",
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
    },
    xaxis: {
      categories: filtered.map((d) => {
        const date = new Date(d.date);
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }),
      labels: { style: { colors: "#6d7175", fontSize: "11px" } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: "#6d7175", fontSize: "11px" },
        formatter: (val) => Math.round(val),
      },
    },
    tooltip: {
      theme: "light",
      y: { formatter: (val) => `${val}` },
    },
    dataLabels: { enabled: false },
    markers: { size: chartSeries.length > 1 ? 3 : 0 },
    legend: chartSeries.length > 1 ? { position: "top", horizontalAlign: "right", fontSize: "12px", markers: { width: 10, height: 10 } } : { show: false },
  };

  return (
    <Card>
      <Box padding="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text variant="headingMd">{title}</Text>
            <Text variant="bodySm" tone="subdued">
              {totals.map((t, i) => (
                <span key={t.label}>
                  {i > 0 && " · "}
                  {t.label}: {t.total.toLocaleString()}
                </span>
              ))}
            </Text>
          </BlockStack>
          <InlineStack gap="400" blockAlign="center">
            {onToggleComparison && (comparisonDisabled || (Array.isArray(compareData) && compareData.length > 0)) && (
              comparisonDisabled ? (
                <Tooltip content="Upgrade to Pro to compare periods">
                  <Checkbox label="Show comparison" checked={false} disabled onChange={() => {}} />
                </Tooltip>
              ) : (
                <Checkbox
                  label="Show comparison"
                  checked={showComparison}
                  onChange={onToggleComparison}
                />
              )
            )}
            {showPeriodSelector && (
              <Select
                label="Date range"
                labelHidden
                options={[
                  { label: "Last 7 days", value: "7" },
                  { label: "Last 30 days", value: "30" },
                  { label: "Last 90 days", value: "90" },
                ]}
                value={period}
                onChange={setInternalPeriod}
              />
            )}
          </InlineStack>
        </InlineStack>
        <div
          style={{ marginTop: "16px" }}
          role="img"
          aria-label={`${title}: ${totals.map((t) => `${t.label} ${t.total.toLocaleString()}`).join(", ")} over the last ${filtered.length} days`}
        >
          <ReactApexChart
            options={options}
            series={chartSeries}
            type={effectiveType === "bar" ? "bar" : effectiveType === "line" ? "line" : "area"}
            height={260}
          />
        </div>
      </Box>
    </Card>
  );
}
