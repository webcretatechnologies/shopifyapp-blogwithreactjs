import { useState, useEffect } from "react";
import ReactApexChart from "react-apexcharts";
import {
  Card,
  Text,
  Box,
  InlineStack,
  BlockStack,
  Select,
} from "@shopify/polaris";

export default function AnalyticsChart({
  data = [],
  title = "Views",
  color = "#008060",
  series: seriesProp,
  chartType = "area",
}) {
  // Use series if provided; otherwise build from color prop for backward compat
  const series = seriesProp || [{ key: "views", label: "Views", color }];
  const [period, setPeriod] = useState("30");

  const filtered = data.slice(-parseInt(period));

  const chartSeries = series.map((s) => ({
    name: s.label,
    data: filtered.map((d) => d[s.key] || 0),
  }));
  const chartColors = series.map((s) => s.color);

  const totals = series.map((s) => ({
    label: s.label,
    total: filtered.reduce((sum, d) => sum + (d[s.key] || 0), 0),
  }));

  const options = {
    chart: {
      type: chartType,
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
      sparkline: { enabled: false },
      animations: { enabled: true, speed: 600 },
    },
    colors: chartColors,
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.02,
        stops: [0, 100],
      },
    },
    stroke: { curve: "smooth", width: chartSeries.length > 1 ? [2, 2, 2] : 2 },
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
          <Select
            label=""
            labelHidden
            options={[
              { label: "Last 7 days", value: "7" },
              { label: "Last 30 days", value: "30" },
              { label: "Last 90 days", value: "90" },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </InlineStack>
        <div style={{ marginTop: "16px" }}>
          <ReactApexChart
            options={options}
            series={chartSeries}
            type={chartType === "bar" ? "bar" : "area"}
            height={260}
          />
        </div>
      </Box>
    </Card>
  );
}
