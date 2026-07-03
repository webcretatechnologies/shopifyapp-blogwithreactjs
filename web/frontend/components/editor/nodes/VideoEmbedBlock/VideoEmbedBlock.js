import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import VideoEmbedBlockView from "./VideoEmbedBlockView";

export const VideoEmbedBlock = Node.create({
  name: "videoEmbedBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      url: { default: "" },
      provider: { default: "" },
      width: { default: "100%" },
      aspectRatio: { default: "16:9" }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="videoEmbedBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    let iframeSrc = HTMLAttributes.url;
    if (HTMLAttributes.provider === 'youtube' && !iframeSrc.includes('embed')) {
      const videoId = iframeSrc.split('v=')[1]?.split('&')[0] || iframeSrc.split('youtu.be/')[1];
      if (videoId) iframeSrc = `https://www.youtube.com/embed/${videoId}`;
    }

    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "videoEmbedBlock", style: `width: ${HTMLAttributes.width}; margin: 1rem auto;` }), 
      ["div", { style: `position: relative; padding-bottom: ${HTMLAttributes.aspectRatio === '16:9' ? '56.25%' : '75%'}; height: 0; overflow: hidden;` }, 
        ["iframe", { 
          src: iframeSrc, 
          style: "position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;", 
          allowfullscreen: "true",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        }]
      ]
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedBlockView);
  },
});
