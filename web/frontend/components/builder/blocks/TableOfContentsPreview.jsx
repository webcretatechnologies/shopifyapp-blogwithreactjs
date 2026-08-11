import { useMemo } from "react";
import { useBuilderStore } from "../store/useBuilderStore";
import { denormalizeAst } from "../store/normalize";
import { extractHeadingsFromAst } from "../../../utils/headingSlugUtils";

function buildTocTree(headings) {
  if (!Array.isArray(headings) || headings.length === 0) return { rootNodes: [], minLevel: 2 };
  
  const minLevel = Math.min(...headings.map((h) => h.level));
  const rootNodes = [];
  const stack = [];

  headings.forEach((h) => {
    const node = { ...h, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      rootNodes.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  });

  return { rootNodes, minLevel };
}

function RenderTocList({ items, minLevel, listStyle, textColor, isRoot = true }) {
  if (!items || items.length === 0) return null;

  const ListTag = listStyle === "numbered" ? "ol" : "ul";

  return (
    <ListTag
      style={{
        margin: 0,
        paddingLeft: isRoot ? (listStyle === "numbered" ? "20px" : "18px") : "20px",
        marginTop: isRoot ? 0 : "6px",
        marginBottom: isRoot ? 0 : "2px",
        listStyleType: listStyle === "numbered" ? (isRoot ? "decimal" : "lower-alpha") : (isRoot ? "disc" : "circle"),
      }}
    >
      {items.map((item) => {
        const isMain = item.level === minLevel;
        return (
          <li key={item.id} style={{ fontSize: "14px", margin: "6px 0", display: "list-item" }}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                const targetEl = document.getElementById(item.id);
                if (targetEl) {
                  targetEl.scrollIntoView({ behavior: "smooth" });
                }
              }}
              style={{
                color: textColor,
                textDecoration: "none",
                fontWeight: isMain ? 600 : 400,
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              {item.text}
            </a>
            {item.children && item.children.length > 0 && (
              <RenderTocList
                items={item.children}
                minLevel={minLevel}
                listStyle={listStyle}
                textColor={textColor}
                isRoot={false}
              />
            )}
          </li>
        );
      })}
    </ListTag>
  );
}

export function TableOfContentsPreview({ block }) {
  const settings = block?.settings || {};
  const title = settings.title || "Table of Contents";
  const levels = settings.levels || [2, 3];
  const listStyle = settings.listStyle || "bullet";
  const collapsible = Boolean(settings.collapsible);
  const textColor = settings.textColor || "#202223";

  const blocksById = useBuilderStore((s) => s.blocksById);
  const rootIds = useBuilderStore((s) => s.rootIds);

  const headings = useMemo(() => {
    const ast = denormalizeAst(blocksById, rootIds);
    return extractHeadingsFromAst(ast, levels);
  }, [blocksById, rootIds, levels]);

  const { rootNodes, minLevel } = useMemo(() => buildTocTree(headings), [headings]);

  if (headings.length === 0) {
    return (
      <div
        style={{
          padding: "16px 20px",
          background: "#f9fafb",
          border: "1px dashed #c9cccf",
          borderRadius: "8px",
          textAlign: "center",
          color: "#6d7175",
          margin: "12px 0",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px", color: "#202223" }}>
          {title}
        </div>
        <div style={{ fontSize: "13px" }}>
          No headings found — add an H2 or H3 to populate this list
        </div>
      </div>
    );
  }

  const listContent = (
    <RenderTocList
      items={rootNodes}
      minLevel={minLevel}
      listStyle={listStyle}
      textColor={textColor}
      isRoot={true}
    />
  );

  return (
    <div
      style={{
        padding: "16px 20px",
        background: "#f4f6f8",
        border: "1px solid #e1e3e5",
        borderRadius: "8px",
        margin: "16px 0",
      }}
    >
      {collapsible ? (
        <details open style={{ cursor: "pointer" }}>
          <summary style={{
            outline: "none",
            userSelect: "none",
            fontWeight: 700,
            fontSize: "16px",
            color: textColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            listStyle: "none",
            gap: "8px",
          }}>
            <span>{title}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ width: 20, height: 20, flexShrink: 0, transition: "transform 0.25s ease" }}
            >
              <polyline points="5 8 10 13 15 8" />
            </svg>
          </summary>
          <div style={{ marginTop: "12px" }}>{listContent}</div>
        </details>
      ) : (
        <div>
          <div style={{ fontWeight: 700, fontSize: "16px", color: textColor, marginBottom: "12px" }}>
            {title}
          </div>
          {listContent}
        </div>
      )}
    </div>
  );
}
