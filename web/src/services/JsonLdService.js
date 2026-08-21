/**
 * JsonLdService
 * Generates JSON-LD structured data for blog posts.
 * Supported types: BlogPosting, Article, NewsArticle, Recipe,
 * Product, Review, VideoObject, Event, SoftwareApplication.
 */

const ARTICLE_TYPES = new Set(["BlogPosting", "Article", "NewsArticle"]);

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function firstProduct(post) {
  if (!Array.isArray(post.products) || post.products.length === 0) return null;
  return post.products[0];
}

function minutesToIsoDuration(minutes) {
  const total = parseInt(minutes, 10);
  if (!Number.isFinite(total) || total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `PT${h}H${m}M`;
  if (h > 0) return `PT${h}H`;
  return `PT${m}M`;
}

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function availabilityUrl(value) {
  const map = {
    InStock: "https://schema.org/InStock",
    OutOfStock: "https://schema.org/OutOfStock",
    PreOrder: "https://schema.org/PreOrder",
    LimitedAvailability: "https://schema.org/LimitedAvailability",
  };
  return map[value] || map.InStock;
}

export default class JsonLdService {
  static generatePostSchema(post, shopDomain, options = {}) {
    if (post.richSnippetType === "None") return null;

    const baseUrl = shopDomain ? `https://${shopDomain}` : "";
    const url = post.slug
      ? `${baseUrl}/blogs/blog/${post.slug}`
      : baseUrl;

    const schemaType = post.richSnippetType || "BlogPosting";
    const data = asObject(post.richSnippetData);

    switch (schemaType) {
      case "Recipe":
        return JsonLdService.generateRecipeSchema(post, shopDomain, url, options, data);
      case "Product":
        return JsonLdService.generateProductSchema(post, shopDomain, url, options, data);
      case "Review":
        return JsonLdService.generateReviewSchema(post, shopDomain, url, options, data);
      case "VideoObject":
        return JsonLdService.generateVideoSchema(post, shopDomain, url, options, data);
      case "Event":
        return JsonLdService.generateEventSchema(post, shopDomain, url, options, data);
      case "SoftwareApplication":
        return JsonLdService.generateSoftwareAppSchema(post, shopDomain, url, options, data);
      default:
        if (!ARTICLE_TYPES.has(schemaType)) {
          return JsonLdService.generateArticleSchema(post, shopDomain, url, options, "BlogPosting");
        }
        return JsonLdService.generateArticleSchema(post, shopDomain, url, options, schemaType);
    }
  }

  static generateArticleSchema(post, shopDomain, url, options, schemaType) {
    const schema = {
      "@context": "https://schema.org",
      "@type": schemaType,
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

    JsonLdService.attachProductMentions(schema, post, options);
    return schema;
  }

  static generateRecipeSchema(post, shopDomain, url, options, data = {}) {
    const imageUrl = post.featuredImage || post.ogImage || null;
    const tags = Array.isArray(post.tags)
      ? post.tags.map((t) => (typeof t === "string" ? t : t?.name)).filter(Boolean)
      : [];

    const schema = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: post.metaTitle || post.title || "",
      description: post.metaDescription || post.excerpt || "",
      url,
      ...(imageUrl && { image: [imageUrl] }),
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
      ...(tags.length > 0 && { keywords: tags.join(", ") }),
      ...(data.prepTimeMinutes && {
        prepTime: minutesToIsoDuration(data.prepTimeMinutes),
      }),
      ...(data.cookTimeMinutes && {
        cookTime: minutesToIsoDuration(data.cookTimeMinutes),
      }),
      ...(data.totalTimeMinutes && {
        totalTime: minutesToIsoDuration(data.totalTimeMinutes),
      }),
      ...(data.recipeYield && { recipeYield: String(data.recipeYield) }),
      publisher: {
        "@type": "Organization",
        name: shopDomain ? shopDomain.replace(".myshopify.com", "") : "Blog",
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": url,
      },
    };

    JsonLdService.attachProductMentions(schema, post, options);
    return schema;
  }

  static generateProductSchema(post, shopDomain, url, options, data = {}) {
    const linked = firstProduct(post);
    const name = data.productName || linked?.title || post.metaTitle || post.title || "";
    const image = linked?.image || post.featuredImage || post.ogImage || null;
    const price = data.price || linked?.price || null;
    const currency = data.currency || linked?.currency || options.currency || "USD";
    const sku = data.sku || linked?.sku || null;
    const brand = data.brand || null;

    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name,
      description: post.metaDescription || post.excerpt || "",
      url,
      ...(image && { image: [image] }),
      ...(sku && { sku: String(sku) }),
      ...(brand && {
        brand: {
          "@type": "Brand",
          name: brand,
        },
      }),
      ...(price && {
        offers: {
          "@type": "Offer",
          url,
          price: String(price),
          priceCurrency: currency,
          availability: availabilityUrl(data.availability || "InStock"),
        },
      }),
    };
  }

  static generateReviewSchema(post, shopDomain, url, options, data = {}) {
    const linked = firstProduct(post);
    const ratingValue = parseFloat(data.ratingValue);
    const bestRating = parseFloat(data.bestRating) || 5;
    const worstRating = parseFloat(data.worstRating) || 1;
    const itemType = data.itemReviewedType || "Product";
    const itemName =
      data.itemReviewedName || linked?.title || post.metaTitle || post.title || "";
    const itemImage = linked?.image || post.featuredImage || null;

    const schema = {
      "@context": "https://schema.org",
      "@type": "Review",
      name: post.metaTitle || post.title || "",
      reviewBody: data.reviewBody || post.metaDescription || post.excerpt || "",
      url,
      ...(post.publishedAt && {
        datePublished: new Date(post.publishedAt).toISOString(),
      }),
      ...(post.author && {
        author: {
          "@type": "Person",
          name: post.author,
        },
      }),
      itemReviewed: {
        "@type": itemType,
        name: itemName,
        ...(itemImage && { image: itemImage }),
      },
    };

    if (Number.isFinite(ratingValue) && ratingValue > 0) {
      schema.reviewRating = {
        "@type": "Rating",
        ratingValue: String(ratingValue),
        bestRating: String(bestRating),
        worstRating: String(worstRating),
      };
    }

    return schema;
  }

  static generateVideoSchema(post, shopDomain, url, options, data = {}) {
    const contentUrl = data.videoUrl || null;
    const embedUrl = data.embedUrl || null;
    const thumbnail = data.thumbnailUrl || post.featuredImage || post.ogImage || null;
    const duration = data.durationMinutes
      ? minutesToIsoDuration(data.durationMinutes)
      : null;
    const uploadDate =
      toIsoDate(data.uploadDate) ||
      (post.publishedAt ? new Date(post.publishedAt).toISOString() : null);

    return {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: post.metaTitle || post.title || "",
      description: post.metaDescription || post.excerpt || "",
      ...(thumbnail && { thumbnailUrl: thumbnail }),
      ...(uploadDate && { uploadDate }),
      ...(duration && { duration }),
      ...(contentUrl && { contentUrl }),
      ...(embedUrl && { embedUrl }),
      ...(url && { url }),
    };
  }

  static generateEventSchema(post, shopDomain, url, options, data = {}) {
    const startDate = toIsoDate(data.eventStartDate);
    const endDate = toIsoDate(data.eventEndDate);
    const isOnline = data.eventLocationType === "VirtualLocation";
    const locationName = data.eventLocation || shopDomain?.replace(".myshopify.com", "") || "Online";

    return {
      "@context": "https://schema.org",
      "@type": "Event",
      name: post.metaTitle || post.title || "",
      description: post.metaDescription || post.excerpt || "",
      url,
      ...(post.featuredImage && { image: [post.featuredImage] }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      eventAttendanceMode: isOnline
        ? "https://schema.org/OnlineEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: isOnline
        ? {
            "@type": "VirtualLocation",
            url: data.eventUrl || url,
          }
        : {
            "@type": "Place",
            name: locationName,
            ...(data.eventAddress && {
              address: {
                "@type": "PostalAddress",
                streetAddress: data.eventAddress,
              },
            }),
          },
      ...(post.author && {
        organizer: {
          "@type": "Organization",
          name: post.author,
        },
      }),
    };
  }

  static generateSoftwareAppSchema(post, shopDomain, url, options, data = {}) {
    const price = data.appPrice || null;
    const currency = data.appCurrency || options.currency || "USD";
    const ratingValue = parseFloat(data.ratingValue);

    const schema = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: data.appName || post.metaTitle || post.title || "",
      description: post.metaDescription || post.excerpt || "",
      url,
      ...(post.featuredImage && { image: post.featuredImage }),
      ...(data.appCategory && { applicationCategory: data.appCategory }),
      ...(data.operatingSystem && { operatingSystem: data.operatingSystem }),
      offers: {
        "@type": "Offer",
        price: price != null && price !== "" ? String(price) : "0",
        priceCurrency: currency,
      },
    };

    if (Number.isFinite(ratingValue) && ratingValue > 0) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: String(ratingValue),
        bestRating: String(data.bestRating || 5),
        ratingCount: String(data.ratingCount || 1),
      };
    }

    return schema;
  }

  static attachProductMentions(schema, post, options = {}) {
    if (!Array.isArray(post.products) || post.products.length === 0) return;
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

  static renderPostSchema(post, shopDomain, options = {}) {
    const schema = JsonLdService.generatePostSchema(post, shopDomain, options);
    if (!schema) return "";
    return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
  }
}
