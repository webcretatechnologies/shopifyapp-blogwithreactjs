import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Box,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Badge,
  Divider,
  List,
  Banner,
} from "@shopify/polaris";
import { compileBlocksToHtml } from "../../utils/compileBlocksToHtml";
import { ensurePreviewContentCss } from "../editor/previewContentCss";
import { normalizeBlocksAst } from "./BlockRegistry";
import { getTemplateChips, getTemplateScale, getTemplateFacts } from "../../utils/templateFacts";

/**
 * TemplatePreviewModal
 * --------------------
 * Picking a template used to drop the merchant straight into the editor with their
 * content replaced — a one-click, hard-to-undo commit made from a 250px card crop.
 * This shows the whole article first, compiled from the same tree the editor applies
 * (normalizeBlocksAst → compileBlocksToHtml), so "use this template" is a decision
 * rather than a surprise.
 *
 * The body is exported on its own because the in-editor gallery is already a Modal,
 * and Polaris doesn't stack modals — that surface swaps to this view in place.
 */

const CANVAS_WIDTH = 720;

/**
 * Polaris caps its large modal at 61.25rem (980px), which leaves the scaled article
 * fairly small next to the details column. `:has()` scopes the widening to the dialog
 * that actually contains a preview, so every other modal in the app keeps Polaris's
 * own sizing — and a browser without `:has()` support just gets the standard large
 * modal rather than a broken one.
 */
const WIDE_MODAL_CSS = `
.Polaris-Modal-Dialog__Modal:has([data-template-preview]),
.Polaris-Modal-Dialog__Modal:has([data-template-gallery]) {
  max-width: min(75rem, calc(100vw - 3rem));
}
.Polaris-Modal-Dialog__Modal.Polaris-Modal-Dialog--limitHeight:has([data-template-preview]),
.Polaris-Modal-Dialog__Modal.Polaris-Modal-Dialog--limitHeight:has([data-template-gallery]) {
  max-height: min(90vh, 50rem);
}
`;

export function ensureWideModalCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("blogger-template-preview-modal-css")) return;
  const el = document.createElement("style");
  el.id = "blogger-template-preview-modal-css";
  el.textContent = WIDE_MODAL_CSS;
  document.head.appendChild(el);
}

/** The full article, scaled to fit whatever column it lands in. */
function ScaledArticle({ blocks, accent }) {
  const frameRef = useRef(null);
  const pageRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    ensurePreviewContentCss();
  }, []);

  const html = useMemo(() => {
    try {
      return compileBlocksToHtml(normalizeBlocksAst(Array.isArray(blocks) ? blocks : []));
    } catch {
      return "";
    }
  }, [blocks]);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const page = pageRef.current;
    if (!frame || !page) return;
    const s = frame.clientWidth / CANVAS_WIDTH;
    setScale(s);
    setHeight(page.scrollHeight * s);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [html, measure]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => measure());
    if (frameRef.current) ro.observe(frameRef.current);
    if (pageRef.current) ro.observe(pageRef.current);
    // Images are data URIs, but the scaled height still settles a tick after paint.
    const t = setTimeout(measure, 200);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [measure]);

  return (
    <div ref={frameRef} style={{ position: "relative", height, background: "#fff" }}>
      <div
        ref={pageRef}
        style={{
          width: CANVAS_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          background: "#fff",
          "--blogger-primary-color": accent,
        }}
      >
        <div
          className="blogger-preview-content"
          style={{ padding: "32px 48px 56px" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

export function TemplatePreviewBody({ template, locked = false }) {
  const blocks = Array.isArray(template?.blocks) ? template.blocks : [];
  const accent = template?.accent || template?.style?.accent || "#303030";
  const chips = useMemo(() => getTemplateChips(blocks), [blocks]);
  const scale = useMemo(() => getTemplateScale(blocks), [blocks]);
  const facts = useMemo(() => getTemplateFacts(blocks), [blocks]);

  useEffect(() => {
    ensureWideModalCss();
  }, []);

  return (
    <div data-template-preview>
      <InlineGrid columns={{ xs: 1, md: ["twoThirds", "oneThird"] }} gap="400" alignItems="start">
        {/* ── The article itself ── */}
        <div
          style={{
            border: "1px solid #e3e1de",
            borderRadius: 12,
            overflow: "hidden",
            background: "#fff",
            maxHeight: "66vh",
            overflowY: "auto",
          }}
        >
          {blocks.length ? (
            <ScaledArticle blocks={blocks} accent={accent} />
          ) : (
            <Box padding="600">
              <Text tone="subdued" as="p">
                This template has no saved layout to preview.
              </Text>
            </Box>
          )}
        </div>

        {/* ── What it is ── */}
        <BlockStack gap="300">
          {locked && (
            <Banner tone="info" title="Available on Starter and above">
              <p>Upgrade to start articles from this template.</p>
            </Banner>
          )}

          <BlockStack gap="150">
            <InlineStack gap="200" blockAlign="center" wrap>
              {template?.category && <Badge>{template.category}</Badge>}
              {template?.badge && <Badge tone="info">{template.badge}</Badge>}
            </InlineStack>
            {template?.description && (
              <Text as="p" tone="subdued">
                {template.description}
              </Text>
            )}
            {scale && (
              <Text as="p" variant="bodySm" tone="subdued">
                {scale}
              </Text>
            )}
          </BlockStack>

          {chips.length > 0 && (
            <>
              <Divider />
              <BlockStack gap="150">
                <Text as="h3" variant="headingSm">
                  What's in it
                </Text>
                <InlineStack gap="100" wrap>
                  {chips.map((chip) => (
                    <span
                      key={chip}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#4a4a4a",
                        background: "#f4f4f3",
                        border: "1px solid #eceae7",
                        borderRadius: 6,
                        padding: "3px 8px",
                      }}
                    >
                      {chip}
                    </span>
                  ))}
                </InlineStack>
              </BlockStack>
            </>
          )}

          <Divider />
          <BlockStack gap="150">
            <Text as="h3" variant="headingSm">
              After you use it
            </Text>
            <List type="bullet">
              {facts.productBlocks > 0 && (
                <List.Item>Bind the product and collection blocks to your own catalog</List.Item>
              )}
              <List.Item>Rewrite the sample copy - it's a starting draft, not filler</List.Item>
              {facts.images > 0 && (
                <List.Item>
                  Swap the {facts.images} sample photo{facts.images === 1 ? "" : "s"} for your own
                </List.Item>
              )}
            </List>
          </BlockStack>
        </BlockStack>
      </InlineGrid>
    </div>
  );
}

export default function TemplatePreviewModal({
  open,
  template,
  locked = false,
  applying = false,
  onUse,
  onClose,
  actionLabel = "Use this template",
}) {
  if (!template) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={template.name}
      size="large"
      primaryAction={{
        content: locked ? "View plans" : actionLabel,
        onAction: onUse,
        loading: applying,
      }}
      secondaryActions={[{ content: "Back to templates", onAction: onClose, disabled: applying }]}
    >
      <Modal.Section>
        <TemplatePreviewBody template={template} locked={locked} />
      </Modal.Section>
    </Modal>
  );
}
