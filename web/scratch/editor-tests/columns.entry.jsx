// Exercises the exact node operations ColumnLayoutView.setColumns performs:
// createAndFill for new columns, Fragment.append for merges, replaceWith.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.DOMParser = dom.window.DOMParser;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
const matchMediaStub = () => ({ matches: false, media: "", addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false });
dom.window.matchMedia = matchMediaStub;
global.matchMedia = matchMediaStub;

const run = async () => {
  const { getSchema } = await import("@tiptap/core");
  const { EditorState } = await import("@tiptap/pm/state");
  const { default: StarterKit } = await import("@tiptap/starter-kit");
  const { ColumnLayout } = await import("./components/editor/nodes/ColumnLayout/ColumnLayout");
  const { Column } = await import("./components/editor/nodes/ColumnLayout/Column");

  const schema = getSchema([StarterKit, ColumnLayout, Column]);
  let failures = 0;
  const check = (label, cond, detail = "") => {
    if (cond) console.log(`  PASS ${label}`);
    else { failures++; console.log(`  FAIL ${label}\n    ${detail}`); }
  };

  const p = (text) => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  const col = (width, ...paras) => schema.nodes.column.create({ width }, paras);
  const layout = (cols) => schema.nodes.columnLayout.create({ columns: cols.length }, cols);

  // mirrors ColumnLayoutView.setColumns
  const setColumns = (state, pos, node, count) => {
    const colCount = node.childCount;
    const width = Math.round((100 / count) * 100) / 100;
    const newColumns = [];
    for (let i = 0; i < count; i++) {
      if (i < colCount) {
        let content = node.child(i).content;
        if (i === count - 1 && count < colCount) {
          for (let j = count; j < colCount; j++) content = content.append(node.child(j).content);
        }
        newColumns.push(schema.nodes.column.create({ width }, content));
      } else {
        newColumns.push(schema.nodes.column.createAndFill({ width }));
      }
    }
    const newLayout = node.type.create({ ...node.attrs, columns: count }, newColumns);
    return state.tr.replaceWith(pos, pos + node.nodeSize, newLayout);
  };

  // doc: [columnLayout at pos 0]
  const doc2 = schema.nodes.doc.create(null, [layout([col(50, p("left")), col(50, p("right"))])]);
  let state = EditorState.create({ schema, doc: doc2 });

  // 2 -> 4 (the old code crashed here: column.create() without content)
  let tr = setColumns(state, 0, state.doc.child(0), 4);
  let after = state.apply(tr);
  let lay = after.doc.child(0);
  console.log("== expand 2 -> 4 ==");
  check("4 columns", lay.childCount === 4, `got ${lay.childCount}`);
  check("doc valid", (after.doc.check(), true));
  check("existing content kept", lay.child(0).textContent === "left" && lay.child(1).textContent === "right");
  check("widths rebalanced to 25", lay.child(0).attrs.width === 25 && lay.child(3).attrs.width === 25, JSON.stringify([0,1,2,3].map(i => lay.child(i).attrs.width)));
  check("new columns filled with paragraph", lay.child(2).childCount === 1 && lay.child(2).child(0).type.name === "paragraph");

  // 4 -> 2 (old code: alert() placeholder). Content of removed cols must merge.
  const doc4 = schema.nodes.doc.create(null, [layout([col(25, p("a")), col(25, p("b")), col(25, p("c")), col(25, p("d"))])]);
  state = EditorState.create({ schema, doc: doc4 });
  tr = setColumns(state, 0, state.doc.child(0), 2);
  after = state.apply(tr);
  lay = after.doc.child(0);
  console.log("== reduce 4 -> 2 ==");
  check("2 columns", lay.childCount === 2, `got ${lay.childCount}`);
  check("doc valid", (after.doc.check(), true));
  check("col A kept", lay.child(0).textContent === "a");
  check("removed content merged into last kept column", lay.child(1).textContent === "bcd", lay.child(1).textContent);
  check("widths rebalanced to 50", lay.child(0).attrs.width === 50 && lay.child(1).attrs.width === 50);

  // single undo step: replaceWith produces one step
  check("single-transaction change", tr.steps.length === 1, `${tr.steps.length} steps`);

  console.log(failures === 0 ? "\nALL COLUMN TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
