import { JSDOM } from "jsdom";

const htmlInput = `
<p>The quality of fragrance plays a major role in how a room feels. Cheap synthetic fragrances can smell harsh and overpowering, while premium natural-inspired aromas feel smooth, calming, and luxurious.</p>
<p>AAURAM focuses on balanced fragrance blends that create comfort without overwhelming the senses. This makes every experience feel more relaxing and enjoyable.</p>
<p>Good fragrance quality helps create:</p>
<h2>Created for a Divine Fragrance Experience</h2>
<p>AAURAM believes fragrance should improve your lifestyle, not overpower it. Every dhoop cone is carefully designed to create a soothing and elegant aroma experience.</p>
<p>Instead of using overly strong chemical scents, Aauram focuses on natural-inspired fragrance blends that feel refined and authentic.</p>
<h3>What Makes Aauram Different:</h3>
<ul>
  <li>Smooth and balanced fragrance</li>
  <li>Long-lasting aroma</li>
  <li>Premium presentation</li>
  <li>Elegant fragrance combinations</li>
  <li>Suitable for modern homes and traditional rituals</li>
</ul>
<p>These qualities make Aauram dhoop cones feel more luxurious and mindful than ordinary fragrance products.</p>
<h2>Premium Fragrances That Match Every Mood</h2>
<p>AAURAM offers a variety of fragrances designed for different moods and moments.</p>
<h3>Royal Oudh Cones</h3>
`;

const jsdom = new JSDOM();
const { window } = jsdom;
const { document, Node } = window;

const parseHtmlToBlocks = (html) => {
  if (!html || html.trim() === "" || html === "undefined") return [];
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const blocks = [];
  
  const appendTextBlock = (contentHtmlStr) => {
    if (!contentHtmlStr || contentHtmlStr.trim() === "") return;
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === "text") {
      lastBlock.content = (lastBlock.content || "") + contentHtmlStr;
    } else {
      blocks.push({
        id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "text",
        content: contentHtmlStr
      });
    }
  };

  const children = Array.from(doc.body.childNodes);
  console.log("Total children found in body:", children.length);
  
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim() !== "") {
        appendTextBlock(`<p>${node.textContent}</p>`);
      }
      continue;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      
      if (/^h[1-6]$/.test(tagName)) {
        blocks.push({
          id: `block_heading`,
          type: "heading",
          content: node.innerHTML,
          level: tagName,
          align: node.style?.textAlign || "left",
          color: node.style?.color || "#202223"
        });
      } else if (tagName === "img") {
        blocks.push({
          id: `block_image`,
          type: "image",
          src: node.getAttribute("src") || "",
          alt: node.getAttribute("alt") || "",
          width: node.style?.width || "100%",
          caption: ""
        });
      } else if (tagName === "hr") {
        blocks.push({
          id: `block_divider`,
          type: "divider",
          style: "solid",
          color: node.style?.borderTopColor || "#e1e3e5",
          margin: "20px"
        });
      } else if (tagName === "a" && (node.style?.display === "inline-block" || node.style?.padding)) {
        blocks.push({
          id: `block_cta`,
          type: "cta_button",
          text: node.textContent || "Button",
          url: node.getAttribute("href") || "#",
          align: node.parentElement?.style?.textAlign || "center",
          color: node.style?.backgroundColor || "#008060",
          textColor: node.style?.color || "#fff"
        });
      } else if (tagName === "div" && node.style?.height) {
        blocks.push({
          id: `block_spacer`,
          type: "spacer",
          height: node.style?.height
        });
      } else if (tagName === "p" && node.innerHTML.includes("Product:")) {
        const text = node.textContent;
        const parts = text.split("Product:");
        const title = parts[1] ? parts[1].trim() : "Product";
        blocks.push({
          id: `block_product`,
          type: "product",
          title: title,
          shopifyProductId: "",
          image: "",
          price: "",
          handle: "",
          variantId: ""
        });
      } else if (tagName === "br") {
        continue;
      } else {
        appendTextBlock(node.outerHTML);
      }
    }
  }
  
  return blocks;
};

try {
  const blocks = parseHtmlToBlocks(htmlInput);
  console.log("Blocks generated successfully:", JSON.stringify(blocks, null, 2));
} catch (err) {
  console.error("Error during parsing:", err);
}
