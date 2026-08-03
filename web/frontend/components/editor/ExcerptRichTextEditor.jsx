/**
 * ExcerptRichTextEditor.jsx
 *
 * Wrapper around the common ShopifyRichTextEditor component specifically for Article Excerpts.
 */

import React from "react";
import ShopifyRichTextEditor from "./ShopifyRichTextEditor";

export default function ExcerptRichTextEditor(props) {
  return (
    <ShopifyRichTextEditor
      placeholder="Add a summary..."
      minHeight="120px"
      {...props}
    />
  );
}
