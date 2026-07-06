/**
 * Typed node-attribute helpers.
 *
 * Content is persisted as HTML (editor.getHTML()), so every attribute must
 * survive a render -> parse round trip. Tiptap's default behavior serializes
 * attrs as same-named HTML attributes and parses them back as raw strings,
 * which corrupts booleans/numbers and collides with real HTML attributes
 * (e.g. an attr named `style`). These helpers serialize each attr to an
 * explicit `data-*` attribute and coerce types on parse.
 */

const toKebab = (key) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export function strAttr(key, defaultValue = "", attrName = null) {
  const name = attrName || `data-${toKebab(key)}`;
  return {
    default: defaultValue,
    parseHTML: (el) => {
      const val = el.getAttribute(name);
      return val === null ? defaultValue : val;
    },
    renderHTML: (attrs) => ({ [name]: attrs[key] }),
  };
}

export function numAttr(key, defaultValue = 0, attrName = null) {
  const name = attrName || `data-${toKebab(key)}`;
  return {
    default: defaultValue,
    parseHTML: (el) => {
      const val = parseFloat(el.getAttribute(name));
      return Number.isFinite(val) ? val : defaultValue;
    },
    renderHTML: (attrs) => ({ [name]: String(attrs[key]) }),
  };
}

export function boolAttr(key, defaultValue = false, attrName = null) {
  const name = attrName || `data-${toKebab(key)}`;
  return {
    default: defaultValue,
    parseHTML: (el) => {
      const val = el.getAttribute(name);
      return val === null ? defaultValue : val === "true";
    },
    renderHTML: (attrs) => ({ [name]: String(attrs[key]) }),
  };
}
