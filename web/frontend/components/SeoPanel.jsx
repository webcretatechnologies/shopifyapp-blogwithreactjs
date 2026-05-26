/**
 * SeoPanel — Built-in SEO meta editor for blog posts.
 * Provides meta title, meta description, canonical URL with character counters and SEO score.
 */
import { useState } from "react";
import { Card, TextField, Text, BlockStack, InlineStack, Box, Divider, Badge } from "@shopify/polaris";

function SeoScore({ title, description }) {
  let score = 0;
  const issues = [];
  const tips = [];

  if (title && title.length >= 30 && title.length <= 60) score += 40;
  else if (title) { score += 15; issues.push("Title: ideal length is 30–60 characters"); }
  else issues.push("Missing meta title");

  if (description && description.length >= 100 && description.length <= 155) score += 40;
  else if (description) { score += 15; issues.push("Description: ideal length is 100–155 characters"); }
  else issues.push("Missing meta description");

  if (score >= 70) tips.push("Great SEO setup! 🎉");

  const color = score >= 70 ? "#008060" : score >= 40 ? "#f5a623" : "#d82c0d";
  const label = score >= 70 ? "Good" : score >= 40 ? "Needs Work" : "Poor";

  return (
    <div style={{ background: "#f9fafb", borderRadius: "8px", padding: "12px" }}>
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="bodySm" fontWeight="semibold">SEO Score</Text>
        <Badge tone={score >= 70 ? "success" : score >= 40 ? "attention" : "critical"}>
          {label} — {score}/80
        </Badge>
      </InlineStack>
      <div style={{ marginTop: "8px", background: "#e1e3e5", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
        <div style={{ height: "100%", background: color, width: `${(score / 80) * 100}%`, transition: "width 0.4s ease", borderRadius: "4px" }} />
      </div>
      {issues.length > 0 && (
        <BlockStack gap="100" style={{ marginTop: "8px" }}>
          {issues.map((issue, i) => (
            <Text key={i} variant="bodySm" tone="critical">⚠ {issue}</Text>
          ))}
        </BlockStack>
      )}
    </div>
  );
}

export default function SeoPanel({ data = {}, onChange }) {
  const update = (key) => (value) => onChange({ ...data, [key]: value });

  const titleLen = (data.metaTitle || "").length;
  const descLen = (data.metaDescription || "").length;

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          <InlineStack blockAlign="center" gap="200">
            <Text variant="headingMd">🔍 SEO Settings</Text>
          </InlineStack>
          <Divider />

          <SeoScore title={data.metaTitle} description={data.metaDescription} />

          <TextField
            label="Meta Title"
            value={data.metaTitle || ""}
            onChange={update("metaTitle")}
            placeholder="Page title for search engines..."
            autoComplete="off"
            helpText={
              <span style={{ color: titleLen > 60 ? "#d82c0d" : titleLen >= 30 ? "#008060" : "#6d7175" }}>
                {titleLen}/60 characters {titleLen > 60 ? "— too long!" : titleLen >= 30 ? "— good length ✓" : "— aim for 30–60"}
              </span>
            }
          />

          <TextField
            label="Meta Description"
            value={data.metaDescription || ""}
            onChange={update("metaDescription")}
            placeholder="Brief summary shown in search results..."
            multiline={3}
            autoComplete="off"
            helpText={
              <span style={{ color: descLen > 155 ? "#d82c0d" : descLen >= 100 ? "#008060" : "#6d7175" }}>
                {descLen}/155 characters {descLen > 155 ? "— too long!" : descLen >= 100 ? "— good length ✓" : "— aim for 100–155"}
              </span>
            }
          />

          <TextField
            label="Canonical URL"
            value={data.canonicalUrl || ""}
            onChange={update("canonicalUrl")}
            placeholder="https://your-store.myshopify.com/blogs/..."
            autoComplete="off"
            helpText="Override the default canonical URL (optional)"
          />

          <Divider />
          <Text variant="headingSm">Open Graph (Social Sharing)</Text>

          <TextField
            label="OG Title"
            value={data.ogTitle || ""}
            onChange={update("ogTitle")}
            placeholder="Title for Facebook / LinkedIn..."
            autoComplete="off"
            helpText="Defaults to meta title if empty"
          />

          <TextField
            label="OG Description"
            value={data.ogDescription || ""}
            onChange={update("ogDescription")}
            placeholder="Description for social share previews..."
            multiline={2}
            autoComplete="off"
          />

          <TextField
            label="OG Image URL"
            value={data.ogImage || ""}
            onChange={update("ogImage")}
            placeholder="https://..."
            autoComplete="off"
            helpText="Recommended: 1200×630px image"
          />
        </BlockStack>
      </Box>
    </Card>
  );
}
