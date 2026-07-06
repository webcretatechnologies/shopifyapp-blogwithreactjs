import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import VideoEmbedBlockView from "./VideoEmbedBlockView";
import { strAttr } from "../attrHelpers";
import { getVideoEmbedUrl } from "../../utils/videoEmbed";

export const VideoEmbedBlock = Node.create({
  name: "videoEmbedBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      url: strAttr("url", ""),
      provider: strAttr("provider", ""),
      width: strAttr("width", "100%"),
      aspectRatio: strAttr("aspectRatio", "16:9"),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="videoEmbedBlock"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs;
    const wrapper = mergeAttributes(HTMLAttributes, { "data-type": "videoEmbedBlock", style: `width: ${attrs.width}; margin: 1rem auto;` });

    if (!attrs.url) {
      return ["div", wrapper];
    }

    return ["div", wrapper,
      ["div", { style: `position: relative; padding-bottom: ${attrs.aspectRatio === "16:9" ? "56.25%" : "75%"}; height: 0; overflow: hidden;` },
        ["iframe", {
          src: getVideoEmbedUrl(attrs.url),
          style: "position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;",
          allowfullscreen: "true",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
        }],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedBlockView);
  },
});
