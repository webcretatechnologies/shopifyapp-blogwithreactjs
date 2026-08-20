import { BlockStack, InlineStack, Text, Thumbnail, ProgressBar, Badge } from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";

const POST_STATUS_BADGE = {
  scheduled: { tone: "attention", label: "Scheduled" },
  draft: { tone: "info", label: "Draft" },
};

/**
 * Ranked "top posts" rows — same composition Shopify Admin Analytics uses for
 * Top products (thumbnail + title + metric + bar relative to the leader).
 *
 * Bar uses tone="success" (Polaris --p-color-bg-fill-success, #047B5D) so it
 * sits in the same green as views / Publish Cadence (#008060). tone="primary"
 * is brand fill in Polaris 13 — charcoal #303030, the new admin button color.
 *
 * Status is exception-only: ranking widgets do not repeat "Published"/"Active"
 * on every row the way a resource index does.
 */
export default function TopPerformingPostsList({ posts = [], onSelectPost, extraContent }) {
  const maxViews = Math.max(...posts.map((post) => post.views || 0), 1);

  return (
    <BlockStack gap="300">
      {posts.map((post, index) => {
        const views = post.views || 0;
        const pct = Math.round((views / maxViews) * 100);
        const barProgress = views > 0 ? Math.max(pct, 4) : 0;
        const status = POST_STATUS_BADGE[post.status];

        return (
          <div
            key={post.id}
            role="button"
            tabIndex={0}
            aria-label={`${post.title || "Untitled"}, ${views.toLocaleString()} views`}
            onClick={() => onSelectPost?.(post)}
            onKeyDown={(e) => e.key === "Enter" && onSelectPost?.(post)}
            style={{ cursor: "pointer" }}
          >
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <div style={{ flexShrink: 0 }}>
                <Thumbnail
                  source={post.featuredImage || ImageIcon}
                  alt=""
                  size="extraSmall"
                />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <BlockStack gap="100">
                  <InlineStack align="space-between" blockAlign="center" wrap={false} gap="200">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <InlineStack gap="100" blockAlign="center" wrap={false}>
                        <div style={{ minWidth: 0 }}>
                          <Text variant="bodySm" fontWeight="semibold" truncate as="span">
                            {post.title || "Untitled"}
                          </Text>
                        </div>
                        {status && (
                          <Badge size="small" tone={status.tone}>
                            {status.label}
                          </Badge>
                        )}
                      </InlineStack>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <Text variant="bodySm" tone="subdued" as="span" numeric>
                        {views.toLocaleString()} views
                      </Text>
                    </div>
                  </InlineStack>
                  <ProgressBar progress={barProgress} size="small" tone="success" />
                  {extraContent?.(post, index)}
                </BlockStack>
              </div>
            </InlineStack>
          </div>
        );
      })}
    </BlockStack>
  );
}
