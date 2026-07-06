// Verifies EditorContentCompiler output for the new block types.
import { EditorContentCompiler } from "../src/services/EditorContentCompiler.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}\n    ${detail}`); }
};

const run = async () => {
  // productCard
  const cardHtml = await EditorContentCompiler.compile(
    `<div data-type="productCard" data-title="Cool Tee" data-price="$19.99" data-compare-at-price="$29.99" data-image-url="https://cdn/img.png" data-handle="cool-tee" data-button-text="Buy &amp; Save" data-button-color="#112233" data-show-image="true" data-show-price="true" data-show-button="true" data-layout="vertical" data-border-radius="10" data-border-color="#cccccc" data-background-color="#ffffff"></div>`
  );
  console.log("== productCard ==");
  check("title rendered", cardHtml.includes("Cool Tee"));
  check("links to product page", cardHtml.includes('href="/products/cool-tee"'), cardHtml);
  check("compare-at price rendered", cardHtml.includes("$29.99"));
  check("button text escaped", cardHtml.includes("Buy &amp; Save"));
  check("border radius applied", cardHtml.includes("border-radius: 10px"));

  // productCard with toggles off (booleans coerced)
  const cardOff = await EditorContentCompiler.compile(
    `<div data-type="productCard" data-title="Tee" data-price="$1" data-image-url="https://cdn/i.png" data-handle="t" data-show-image="false" data-show-price="false" data-show-button="false"></div>`
  );
  console.log("== productCard (toggles off) ==");
  check("image hidden", !cardOff.includes("<img"), cardOff);
  check("price hidden", !cardOff.includes("$1<"), cardOff);
  check("button hidden", !cardOff.includes("Add to Cart"), cardOff);

  // htmlBlock
  const encoded = encodeURIComponent('<div class="promo">Save 20% & <b>more</b></div>');
  const htmlBlockOut = await EditorContentCompiler.compile(
    `<div data-type="htmlBlock" data-html="${encoded}"></div>`
  );
  console.log("== htmlBlock ==");
  check("decoded html injected", htmlBlockOut.includes('<div class="promo">Save 20% &amp; <b>more</b></div>') || htmlBlockOut.includes('<div class="promo">Save 20% & <b>more</b></div>'), htmlBlockOut);

  // videoEmbedBlock
  const vids = await EditorContentCompiler.compile(
    `<div data-type="videoEmbedBlock" data-url="https://vimeo.com/76979871" data-aspect-ratio="16:9"></div>` +
    `<div data-type="videoEmbedBlock" data-url="https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184" data-aspect-ratio="4:3"></div>` +
    `<div data-type="videoEmbedBlock" data-url="https://youtube.com/shorts/dQw4w9WgXcQ"></div>`
  );
  console.log("== videoEmbedBlock ==");
  check("vimeo converted", vids.includes("player.vimeo.com/video/76979871"), vids);
  check("loom converted", vids.includes("loom.com/embed/0281766fa2d04bb788eaf19e65135184"), vids);
  check("shorts converted", vids.includes("youtube.com/embed/dQw4w9WgXcQ"), vids);
  check("4:3 aspect", vids.includes("padding-bottom: 75%"));

  // nested block inside columnLayout must still compile (detachment regression)
  const nested = await EditorContentCompiler.compile(
    `<div data-type="columnLayout" class="tiptap-column-layout" style="display: flex; gap: 16px;">` +
    `<div data-type="column" class="tiptap-column" style="flex: 50 50 0%;"><p>text</p></div>` +
    `<div data-type="column" class="tiptap-column" style="flex: 50 50 0%;">` +
    `<div data-type="productCard" data-title="Nested Product" data-price="$5" data-handle="nested"></div>` +
    `</div></div>`
  );
  console.log("== nested productCard in columns ==");
  check("nested card compiled", nested.includes("Nested Product") && nested.includes('href="/products/nested"'), nested);
  check("column flex preserved", nested.includes("flex: 50 50 0%"));

  // buttonBlock passthrough keeps its anchor markup
  const btn = await EditorContentCompiler.compile(
    `<div data-type="buttonBlock" data-text="Go" style="text-align: left;"><a href="https://x.co" style="display: inline-block;">Go</a></div>`
  );
  console.log("== buttonBlock passthrough ==");
  check("anchor preserved", btn.includes('<a href="https://x.co"'), btn);

  // generateStyles includes column CSS
  const styles = EditorContentCompiler.generateStyles({});
  console.log("== generateStyles ==");
  check("column layout css", styles.includes(".tiptap-column-layout"));
  check("mobile stacking", styles.includes("@media (max-width: 640px)") && styles.includes("flex: 1 1 100% !important"));

  console.log(failures === 0 ? "\nALL COMPILER TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
