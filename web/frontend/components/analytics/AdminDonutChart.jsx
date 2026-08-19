import ReactApexChart from "react-apexcharts";
import { Card, Text, Box, BlockStack } from "@shopify/polaris";

const DEFAULT_PALETTE = ["#008060", "#5C6AC4", "#EEC200", "#DE3618", "#919EAB"];

// Donut/pie companion to AnalyticsChart.jsx — same ApexCharts conventions (fontFamily, header
// layout) for a chart shape AnalyticsChart doesn't support (line/area/bar only).
export default function AdminDonutChart({ title = "Distribution", data = [], height = 260 }) {
  const labels = data.map((d) => d.label);
  const series = data.map((d) => d.value);
  const colors = data.map((d, i) => d.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]);
  const total = series.reduce((sum, v) => sum + v, 0);

  const options = {
    chart: {
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
      animations: { enabled: true, speed: 600 },
    },
    labels,
    colors,
    legend: { position: "bottom", fontSize: "12px", markers: { width: 10, height: 10 } },
    dataLabels: { enabled: false },
    tooltip: { theme: "light", y: { formatter: (val) => `${val}` } },
    plotOptions: {
      pie: {
        donut: {
          labels: {
            show: true,
            total: {
              show: true,
              label: "Total",
              formatter: () => total.toLocaleString(),
            },
          },
        },
      },
    },
  };

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <Text variant="headingMd">{title}</Text>
          {total === 0 ? (
            <Text tone="subdued">No data yet.</Text>
          ) : (
            <ReactApexChart options={options} series={series} type="donut" height={height} />
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}
