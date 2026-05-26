import ReactApexChart from "react-apexcharts";
import { Card, Text, Box, BlockStack } from "@shopify/polaris";

export default function DeviceChart({ breakdown = { desktop: 0, mobile: 0, tablet: 0 } }) {
  const total = breakdown.desktop + breakdown.mobile + breakdown.tablet;

  const series = [breakdown.desktop, breakdown.mobile, breakdown.tablet];
  const labels = ["Desktop", "Mobile", "Tablet"];

  const options = {
    chart: {
      type: "donut",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
      toolbar: { show: false },
    },
    colors: ["#008060", "#005bd3", "#9ca3af"],
    labels,
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: {
      theme: "light",
      y: { formatter: (val) => `${val} visits` },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "70%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Visits",
              fontSize: "12px",
              fontWeight: "600",
              color: "#6d7175",
              formatter: () => total.toLocaleString(),
            },
          },
        },
      },
    },
    states: {
      hover: { filter: { type: "none" } },
    },
  };

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <Text variant="headingMd">Device Breakdown</Text>
          <div style={{ maxWidth: "260px", margin: "0 auto" }}>
            <ReactApexChart
              options={options}
              series={series}
              type="donut"
              height={220}
            />
          </div>
          <BlockStack gap="200">
            {[
              { label: "Desktop", value: breakdown.desktop, color: "#008060" },
              { label: "Mobile", value: breakdown.mobile, color: "#005bd3" },
              { label: "Tablet", value: breakdown.tablet, color: "#9ca3af" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: color,
                    }}
                  />
                  <Text variant="bodySm">{label}</Text>
                </div>
                <Text variant="bodySm" fontWeight="semibold">
                  {total > 0 ? `${Math.round((value / total) * 100)}%` : "—"}
                </Text>
              </div>
            ))}
          </BlockStack>
        </BlockStack>
      </Box>
    </Card>
  );
}
