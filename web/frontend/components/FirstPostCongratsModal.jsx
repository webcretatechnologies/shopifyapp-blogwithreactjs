import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, BlockStack, Text } from "@shopify/polaris";
import confetti from "canvas-confetti";

/**
 * Shown once, the first time a shop's post count reaches 1 — regardless of whether that post was
 * written from scratch, generated with AI, or imported from Shopify. Every creation path computes
 * `isFirstPost` server-side (see web/src/utils/firstPost.js) and the caller just passes it through.
 */
export default function FirstPostCongratsModal({ open, postId, onClose }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#008060", "#00a97c", "#005bd3", "#f5a623", "#e44d26"],
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#008060", "#00a97c", "#005bd3", "#f5a623", "#e44d26"],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [open]);

  const goToEditor = () => {
    onClose();
    if (postId) navigate(`/posts/${postId}/edit`);
  };

  return (
    <Modal
      open={open}
      onClose={goToEditor}
      title="🎉 Congratulations!"
      primaryAction={{ content: "Start Editing", onAction: goToEditor }}
    >
      <Modal.Section>
        <BlockStack gap="400" align="center">
          <div style={{ fontSize: "50px", textAlign: "center", marginTop: "12px" }}>🏆</div>
          <Text variant="headingLg" as="h2" alignment="center">
            You've created your first blog post!
          </Text>
          <Text variant="bodyMd" as="p" alignment="center" tone="subdued">
            Amazing job! Your first blog post has been successfully created.
            You can now publish it to your store, add products to it, or keep
            editing the content.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
