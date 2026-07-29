/** HtmlBuilderBlock.jsx */
import { Icon } from "@shopify/polaris";
import { CodeAddIcon } from "@shopify/polaris-icons";

export function HtmlBuilderPreview({ block }) {
  const code = block?.settings?.code;
  
  if (!code) {
    return (
      <div
        style={{
          padding: "8px 0",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#6d7175",
        }}
      >
        <Icon source={CodeAddIcon} color="subdued" />
        <span style={{ fontSize: "13px" }}>Empty HTML block</span>
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
