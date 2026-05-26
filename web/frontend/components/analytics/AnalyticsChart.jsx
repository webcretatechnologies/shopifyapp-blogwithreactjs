import { useState, useEffect } from "react";
import ReactApexChart from "react-apexcharts";
import { Card, Text, Box, InlineStack, BlockStack, Select } from "@shopify/polaris";

export default function AnalyticsChart({ data = [], title = "Views", color = "#008060" }) {
  const [period, setPeriod] = useState("30");

  const filtered = data.slice(-parseInt(period));

  const series = [{ name: "Views", data: filtered.map((d) => d.views || 0) }];

  const options = {
    chart: {
      type: "area",
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
      sparkline: { enabled: false },
      animations: { enabled: true, speed: 600 },
    },
    colors: [color],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.02,
        stops: [0, 100],
      },
    },
    stroke: { curve: "smooth", width: 2 },
    grid: {
      borderColor: "#e1e3e5",
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
    },
    xaxis: {
      categories: filtered.map((d) => {
        const date = new Date(d.date);
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
      y: { formatter: (val) => `${val} views` },
    },
    dataLabels: { enabled: false },
    markers: { size: 0 },
  };

  return (
    <Card>
      <Box padding="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text variant="headingMd">{title}</Text>
            <Text variant="bodySm" tone="subdued">
              Total: {filtered.reduce((sum, d) => sum + (d.views || 0), 0).toLocaleString()} views
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
            series={series}
            type="area"
            height={220}
          />
        </div>
      </Box>
    </Card>
  );
}
