/**
 * Converts a video page URL (YouTube / Vimeo / Loom) into an embeddable
 * iframe src. Returns the input unchanged when no provider matches
 * (e.g. an already-embeddable or self-hosted URL).
 *
 * Mirrors the server-side conversion in web/src/services/EditorContentCompiler.js.
 */
export function getVideoEmbedUrl(url) {
  if (!url) return "";

  // YouTube: watch, shorts, youtu.be, embed, /v/, /e/
  let match = url.match(
    /(?:youtube\.com\/(?:shorts\/|[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }

  match = url.match(
    /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/i
  );
  if (match && match[3]) {
    return `https://player.vimeo.com/video/${match[3]}`;
  }

  match = url.match(/loom\.com\/(?:share|embed)\/([a-f0-9]{32})/i);
  if (match && match[1]) {
    return `https://www.loom.com/embed/${match[1]}`;
  }

  return url;
}

export function getVideoProvider(url) {
  if (!url) return "";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  if (/loom\.com/i.test(url)) return "loom";
  return "generic";
}
