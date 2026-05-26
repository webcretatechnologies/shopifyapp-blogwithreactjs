/**
 * ThemeInjectionService — Inject custom fonts, color presets, layouts, and custom code
 * into Shopify merchant theme stylesheets and layout/theme.liquid via the Asset API.
 */
import shopify from "../../shopify.js";

export default class ThemeInjectionService {
  /**
   * Persists custom branding, typography, layout, and HTML/CSS/JS code blocks to active Shopify theme.
   * @param {Object} session - Shopify Session context
   * @param {Object} settings - Settings key-value mapping
   */
  static async injectSettings(session, settings) {
    try {
      const client = new shopify.api.clients.Rest({ session });
      const themesResponse = await client.get({ path: "themes" });
      const themes = themesResponse.body?.themes || [];
      const activeTheme = themes.find((t) => t.role === "main");

      if (!activeTheme) {
        console.error("ThemeInjectionService: No active theme found.");
        return false;
      }

      const themeId = activeTheme.id;

      // 1. Generate CSS rules representing the custom color settings, layout width, fonts
      const cssContent = `/* Blogger App Custom Settings Stylesheet */
:root {
  --blogger-primary-color: ${settings.primaryColor || "#008060"};
  --blogger-secondary-color: ${settings.secondaryColor || "#005bd3"};
  --blogger-font-family: ${settings.fontFamily || "system-ui"};
  --blogger-layout-width: ${settings.blogLayout === "centered" ? "800px" : settings.blogLayout === "narrow" ? "640px" : "100%"};
}

.blogger-article-container {
  max-width: var(--blogger-layout-width) !important;
  margin-left: auto !important;
  margin-right: auto !important;
  font-family: var(--blogger-font-family) !important;
  padding-bottom: 80px !important;
  margin-bottom: 80px !important;
}

/* Ensure template article and blog pages have bottom space */
body.template-article,
body.template-blog,
.shopify-section-blog-posts,
.shopify-section-article {
  padding-bottom: 80px !important;
  margin-bottom: 80px !important;
}

.blogger-primary-btn {
  background-color: var(--blogger-primary-color) !important;
  border-color: var(--blogger-primary-color) !important;
}

.blogger-secondary-btn {
  background-color: var(--blogger-secondary-color) !important;
  border-color: var(--blogger-secondary-color) !important;
}

.blogger-reading-time {
  display: ${settings.showReadingTime === false || settings.showReadingTime === "false" ? "none !important" : "inline-block"};
}

.blogger-author {
  display: ${settings.showAuthor === false || settings.showAuthor === "false" ? "none !important" : "inline-block"};
}

.blogger-published-date {
  display: ${settings.showPublishedDate === false || settings.showPublishedDate === "false" ? "none !important" : "inline-block"};
}

.blogger-related-posts {
  display: ${settings.showRelatedPosts === false || settings.showRelatedPosts === "false" ? "none !important" : "block"};
}

.blogger-toc {
  display: ${settings.showToc === false || settings.showToc === "false" ? "none !important" : "block"};
  float: ${settings.tocPosition === "left" ? "left" : settings.tocPosition === "right" ? "right" : "none"};
}
`;

      // 2. Upload assets/blogger-custom-settings.css
      await client.put({
        path: `themes/${themeId}/assets`,
        data: {
          asset: {
            key: "assets/blogger-custom-settings.css",
            value: cssContent,
          },
        },
      });

      // 3. Inject styling hook and custom HTML header/footer scripts to layout/theme.liquid
      const layoutResponse = await client.get({
        path: `themes/${themeId}/assets`,
        query: { "asset[key]": "layout/theme.liquid" },
      });

      let themeLiquid = layoutResponse.body?.asset?.value || "";
      if (themeLiquid) {
        let isModified = false;

        // Inject stylesheet link if not present
        if (!themeLiquid.includes("blogger-custom-settings.css")) {
          const stylesheetTag = `\n  {{ 'blogger-custom-settings.css' | asset_url | stylesheet_tag }}`;
          const headCloseTag = "</head>";
          if (themeLiquid.includes(headCloseTag)) {
            themeLiquid = themeLiquid.replace(headCloseTag, `${stylesheetTag}\n${headCloseTag}`);
            isModified = true;
          }
        }

        // Custom headers/footers injection
        const customHeader = settings.customHeaderCode || "";
        const customFooter = settings.customFooterCode || "";

        // Remove old custom block tags if present
        const startHeaderTag = "<!-- BLOGGER_CUSTOM_HEADER_START -->";
        const endHeaderTag = "<!-- BLOGGER_CUSTOM_HEADER_END -->";
        if (themeLiquid.includes(startHeaderTag)) {
          const regex = new RegExp(`${startHeaderTag}[\\s\\S]*?${endHeaderTag}`, "g");
          themeLiquid = themeLiquid.replace(regex, "");
          isModified = true;
        }

        const startFooterTag = "<!-- BLOGGER_CUSTOM_FOOTER_START -->";
        const endFooterTag = "<!-- BLOGGER_CUSTOM_FOOTER_END -->";
        if (themeLiquid.includes(startFooterTag)) {
          const regex = new RegExp(`${startFooterTag}[\\s\\S]*?${endFooterTag}`, "g");
          themeLiquid = themeLiquid.replace(regex, "");
          isModified = true;
        }

        // Insert new custom header code
        if (customHeader) {
          const headerBlock = `\n${startHeaderTag}\n${customHeader}\n${endHeaderTag}\n`;
          const headCloseTag = "</head>";
          if (themeLiquid.includes(headCloseTag)) {
            themeLiquid = themeLiquid.replace(headCloseTag, `${headerBlock}${headCloseTag}`);
            isModified = true;
          }
        }

        // Insert new custom footer code
        if (customFooter) {
          const footerBlock = `\n${startFooterTag}\n${customFooter}\n${endFooterTag}\n`;
          const bodyCloseTag = "</body>";
          if (themeLiquid.includes(bodyCloseTag)) {
            themeLiquid = themeLiquid.replace(bodyCloseTag, `${footerBlock}${bodyCloseTag}`);
            isModified = true;
          }
        }

        if (isModified) {
          await client.put({
            path: `themes/${themeId}/assets`,
            data: {
              asset: {
                key: "layout/theme.liquid",
                value: themeLiquid,
              },
            },
          });
        }
      }

      return true;
    } catch (err) {
      console.error("ThemeInjectionService Error:", err);
      return false;
    }
  }
}
