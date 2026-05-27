/**
 * JsonLdService
 * Generates JSON-LD structured data for blog posts (Article / BlogPosting schema).
 */
export default class JsonLdService {
  /**
   * Generate a JSON-LD script tag for a blog post.
   * @param {Object} post - The serialized post object
   * @param {string} shopDomain - The shop's myshopify.com domain
   * @param {Object} options
   * @param {Object} [options.settings] - Shop settings (blogLayout, etc.)
   * @returns {string} HTML <script type="application/ld+json"> tag
   */
  static generatePostSchema(post, shopDomain, options = {}) {
    const baseUrl = shopDomain ? `https://${shopDomain}` : "";
    const url = post.slug
      ? `${baseUrl}/blogs/blog/${post.slug}`
      : baseUrl;

    const schema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.metaTitle || post.title || "",
      description: post.metaDescription || post.excerpt || "",
      url,
      ...(post.featuredImage && {
        image: {
          "@type": "ImageObject",
          url: post.featuredImage,
        },
      }),
      ...(post.publishedAt && {
        datePublished: new Date(post.publishedAt).toISOString(),
      }),
      dateModified: post.updatedAt
        ? new Date(post.updatedAt).toISOString()
        : new Date(post.createdAt).toISOString(),
      ...(post.author && {
        author: {
          "@type": "Person",
          name: post.author,
        },
      }),
      publisher: {
        "@type": "Organization",
        name: shopDomain ? shopDomain.replace(".myshopify.com", "") : "Blog",
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": url,
      },
    };

    // If there are products featured in the post, add them as mentions
    if (Array.isArray(post.products) && post.products.length > 0) {
      schema.mentions = post.products.slice(0, 5).map((p) => ({
        "@type": "Product",
        name: p.title || "",
        ...(p.image && { image: p.image }),
        ...(p.price && {
          offers: {
            "@type": "Offer",
            price: p.price,
            priceCurrency: p.currency || options.currency || "USD",
          },
        }),
      }));
    }

    return schema;
  }

  /**
   * Render the JSON-LD as an HTML <script> tag.
   */
  static renderPostSchema(post, shopDomain, options = {}) {
    const schema = JsonLdService.generatePostSchema(post, shopDomain, options);
    return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
  }
}
