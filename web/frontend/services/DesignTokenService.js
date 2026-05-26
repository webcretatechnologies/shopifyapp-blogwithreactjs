/**
 * DesignTokenService.js
 *
 * Central system for managing CSS variables (design tokens).
 * Enables the Visual Commerce CMS to adapt to merchant's Shopify theme settings.
 */

export const DesignTokenService = {
  // Default values
  tokens: {
    '--vc-primary-color': '#008060',
    '--vc-font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    '--vc-border-radius': '6px',
    '--vc-text-color': '#202223',
  },

  /**
   * Inject tokens as CSS variables on the document root
   */
  applyTokens(customTokens = {}) {
    const merged = { ...this.tokens, ...customTokens };
    const root = document.documentElement;

    Object.entries(merged).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  },

  /**
   * Load tokens from the server (e.g. merchant preferences from database)
   */
  async loadFromServer() {
    try {
      // In a real implementation, you might fetch from /api/settings/theme
      // const res = await fetch('/api/settings/theme');
      // const data = await res.json();
      // this.applyTokens(data.tokens);
    } catch (e) {
      console.warn('[DesignTokenService] Failed to load theme tokens:', e);
    }
  }
};
