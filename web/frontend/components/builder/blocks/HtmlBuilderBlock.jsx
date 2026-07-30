/** HtmlBuilderBlock.jsx */
import { Icon } from "@shopify/polaris";
import { CodeAddIcon } from "@shopify/polaris-icons";

export function HtmlBuilderPreview({ block }) {
  const code = block?.settings?.code;
  
  if (!code) {
    return (
      <div
        style={{
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          color: "#6d7175",
          backgroundColor: "#f4f6f8",
          border: "1px dashed #c9cccf",
          borderRadius: "4px",
          width: "100%",
          boxSizing: "border-box"
        }}
      >
        <Icon source={CodeAddIcon} color="subdued" />
        <span style={{ fontSize: "13px", fontWeight: 500 }}>Empty HTML block</span>
      </div>
    );
  }

  return (
    <div 
      style={{ opacity: 0.8 }}
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
export default HtmlBuilderPreview;
