import fs from "fs";

let content = fs.readFileSync("web/frontend/pages/posts/new.jsx", "utf-8");

// 1. Remove imports
content = content.replace(/import TiptapEditor from "\.\.\/\.\.\/components\/editor\/TiptapEditor";\n/, "");
content = content.replace(/import \{ fromDataAttrName \} from "\.\.\/\.\.\/utils\/blockAttrCasing";\n/, "");
content = content.replace(/import \{ astToTiptapDoc, tiptapDocToAst \} from "\.\.\/\.\.\/utils\/jsonConverter";\n/, "");

// 2. Remove tiptapJson state
content = content.replace(/  \/\/ New state to hold Tiptap's working JSON document while in Classic mode\n  const \[tiptapJson, setTiptapJson\] = useState\(null\);\n/, "");

// 3. Update loadPost tiptapJson
content = content.replace(/      useBuilderStore\.getState\(\)\.hydrate\(normalizedBlocks\);\n      setTiptapJson\(astToTiptapDoc\(normalizedBlocks\)\);\n/, "      useBuilderStore.getState().hydrate(normalizedBlocks);\n");

// 4. Update buildPayload
content = content.replace(/    const finalAst = post\.editorMode === "wysiwyg" && tiptapJson \n      \? tiptapDocToAst\(tiptapJson\) \n      : \(builderBlocks && builderBlocks\.length > 0 \? builderBlocks : post\.contentJson \|\| \[\]\);/g, "    const finalAst = builderBlocks && builderBlocks.length > 0 ? builderBlocks : post.contentJson || [];");

// 5. Update handlePreviewClick
content = content.replace(/      const finalAst = post\.editorMode === "wysiwyg" && tiptapJson \n        \? tiptapDocToAst\(tiptapJson\) \n        : post\.contentJson \|\| \[\];/g, "      const finalAst = post.contentJson || [];");

// 6. Remove handleModeSwitch
content = content.replace(/  const handleModeSwitch = \(mode\) => \{[\s\S]*?    setPost\(\(p\) => \(\{ \.\.\.p, editorMode: mode \}\)\);\n  \};\n/g, "");

// 7. Update rendering
const renderTargetRegex = /                      <Text variant="headingSm" tone="subdued">Content<\/Text>\n                      <ButtonGroup segmented>[\s\S]*?                      <\/ButtonGroup>/;
content = content.replace(renderTargetRegex, '                      <Text variant="headingSm" tone="subdued">Content</Text>');

const builderRenderRegex = /                    \{post\.editorMode === "builder" \? \(\n                      <DragDropBuilderContainer\n([\s\S]*?)                      \/>\n                    \) : \(\n                      <TiptapEditor\n([\s\S]*?)                      \/>\n                    \)\}/;

content = content.replace(builderRenderRegex, `                      <DragDropBuilderContainer\n$1                      />`);

// 8. Update originalPost reset in resetForm
content = content.replace(/      setTiptapJson\(astToTiptapDoc\(originalPost\.contentJson \|\| \[\]\)\);\n/g, "");
// And setTiptapJson(astToTiptapDoc(post.contentJson || [])) in handleDiscard
content = content.replace(/      const doc = astToTiptapDoc\(post\.contentJson \|\| \[\]\);\n      setTiptapJson\(doc\);\n/g, "");

fs.writeFileSync("web/frontend/pages/posts/new.jsx", content);
console.log("new.jsx updated");
