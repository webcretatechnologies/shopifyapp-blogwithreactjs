import React, { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";

export function FaqBuilderBlockPreview({ block }) {
  const settings = block.settings || {};
  const title = settings.title || "Frequently Asked Questions";
  const titleAlign = settings.titleAlign || "left";
  const layout = settings.layout || "accordion"; // 'accordion' | 'grid'
  const items = Array.isArray(settings.items) && settings.items.length > 0
    ? settings.items
    : [
        {
          id: "faq_1",
          question: "What is your return policy?",
          answer: "We offer a 30-day money-back guarantee on all eligible products. Items must be in original condition.",
        },
        {
          id: "faq_2",
          question: "How long does shipping take?",
          answer: "Standard shipping takes 3-5 business days. Express shipping takes 1-2 business days.",
        },
        {
          id: "faq_3",
          question: "Do you ship internationally?",
          answer: "Yes, we ship to over 50 countries worldwide. International shipping rates are calculated at checkout.",
        },
      ];

  const accentColor = settings.accentColor || "#008060";
  const backgroundColor = settings.backgroundColor || "#ffffff";
  const borderColor = settings.borderColor || "#e1e3e5";
  const borderRadius = typeof settings.borderRadius === "number" ? settings.borderRadius : 8;
  const firstOpen = settings.firstOpen !== false;

  // Track expanded items state for accordion preview
  const [openItems, setOpenItems] = useState(() => {
    const initial = {};
    if (firstOpen && items.length > 0) {
      initial[items[0].id || "faq_1"] = true;
    }
    return initial;
  });

  const toggleItem = (id) => {
    setOpenItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div
      style={{
        padding: "4px 0",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {title && (
        <h2
          style={{
            margin: "0 0 20px 0",
            textAlign: titleAlign,
            fontSize: "22px",
            fontWeight: 700,
            color: "#202223",
          }}
        >
          {title}
        </h2>
      )}

      {layout === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {items.map((item, idx) => (
            <div
              key={item.id || idx}
              style={{
                backgroundColor: backgroundColor,
                border: `1px solid ${borderColor}`,
                borderRadius: `${borderRadius}px`,
                padding: "18px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <HelpCircle size={18} color={accentColor} style={{ flexShrink: 0, marginTop: "2px" }} />
                <h4
                  style={{
                    margin: 0,
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "#202223",
                    lineHeight: 1.4,
                  }}
                >
                  {item.question || "Untitled Question"}
                </h4>
              </div>
              <p
                style={{
                  margin: 0,
                  paddingLeft: "28px",
                  fontSize: "14px",
                  color: "#6d7175",
                  lineHeight: 1.6,
                }}
              >
                {item.answer || "Answer goes here..."}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {items.map((item, idx) => {
            const itemId = item.id || `faq_${idx}`;
            const isOpen = !!openItems[itemId];

            return (
              <div
                key={itemId}
                style={{
                  backgroundColor: backgroundColor,
                  border: `1px solid ${borderColor}`,
                  borderRadius: `${borderRadius}px`,
                  overflow: "hidden",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  boxShadow: isOpen ? "0 2px 8px rgba(0,0,0,0.06)" : "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(itemId)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "14px 18px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    outline: "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: isOpen ? accentColor : "#202223",
                      lineHeight: 1.4,
                      transition: "color 0.2s ease",
                    }}
                  >
                    {item.question || "Untitled Question"}
                  </span>
                  <div style={{ color: isOpen ? accentColor : "#6d7175", flexShrink: 0 }}>
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </button>

                {isOpen && (
                  <div
                    style={{
                      padding: "0 18px 16px 18px",
                      borderTop: `1px solid ${borderColor}`,
                      marginTop: "-2px",
                      paddingTop: "12px",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: "14px",
                        color: "#4a4a4a",
                        lineHeight: 1.6,
                      }}
                    >
                      {item.answer || "Answer goes here..."}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
