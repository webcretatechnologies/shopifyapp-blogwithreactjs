import { Text, BlockStack } from "@shopify/polaris";
import { LayoutDashboard, Store, Settings, Ticket, FileText, LogOut, Shield } from "lucide-react";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard Overview", icon: LayoutDashboard },
  { id: "stores", label: "Stores Auditor", icon: Store },
  { id: "pricing", label: "Pricing & Features", icon: Settings },
  { id: "coupons", label: "Coupons", icon: Ticket },
  { id: "activities", label: "Supervisor Activity", icon: FileText },
];

export default function AdminSidebar({ activeSection, onSelect, onLogout }) {
  return (
    <div
      style={{
        width: "260px",
        backgroundColor: "var(--p-color-bg-surface)",
        borderRight: "1px solid var(--p-color-border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      <div
        style={{
          padding: "24px 20px",
          borderBottom: "1px solid #e1e3e5",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Shield size={24} color="#008060" />
        <Text variant="headingMd" as="span">
          <span style={{ color: "#202223", fontWeight: 700 }}>Blogger</span>
          <span
            style={{
              color: "#008060",
              fontSize: "12px",
              marginLeft: "4px",
              padding: "2px 6px",
              background: "#e2f1eb",
              borderRadius: "4px",
            }}
          >
            Admin
          </span>
        </Text>
      </div>

      <div style={{ flexGrow: 1, padding: "24px 12px" }}>
        <BlockStack gap="150">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                  padding: "12px 14px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: isActive ? "#f1f8f5" : "transparent",
                  color: isActive ? "#008060" : "#4a4d50",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: isActive ? "600" : "500",
                  transition: "all 0.2s ease-in-out",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "#f1f2f4";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </BlockStack>
      </div>

      <div style={{ padding: "20px", borderTop: "1px solid #e1e3e5" }}>
        <button
          onClick={onLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            width: "100%",
            padding: "12px 14px",
            border: "none",
            borderRadius: "8px",
            backgroundColor: "transparent",
            color: "#bf0711",
            textAlign: "left",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          <LogOut size={18} />
          Log out
        </button>
      </div>
    </div>
  );
}

export { NAV_ITEMS };
