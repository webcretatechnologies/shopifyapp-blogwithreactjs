import { Modal, Text, Banner, BlockStack, Checkbox, Box, Button } from "@shopify/polaris";

/**
 * ConfirmActionModal — A premium Polaris confirmation modal that replaces
 * native window.confirm() / window.alert() throughout the admin panel.
 *
 * Props:
 * - open, title, body (string or JSX), confirmText, confirmTone ("critical"|"warning"|"primary")
 * - onConfirm, onCancel, loading
 * - optional checkbox: { label, checked, onChange, helpText? }
 */
export default function ConfirmActionModal({
  open,
  title,
  body,
  confirmText = "Confirm",
  confirmTone = "primary",
  onConfirm,
  onCancel,
  loading = false,
  checkbox,
}) {
  const isDestructive = confirmTone === "critical";

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onCancel}
      title={title}
      primaryAction={{
        content: confirmText,
        destructive: isDestructive,
        loading,
        disabled: loading,
        onAction: onConfirm,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          disabled: loading,
          onAction: onCancel,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          {confirmTone === "critical" && (
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">
                This action cannot be undone.
              </Text>
            </Banner>
          )}
          {confirmTone === "warning" && (
            <Banner tone="warning">
              <Text as="p" variant="bodyMd">
                Please review the details before proceeding.
              </Text>
            </Banner>
          )}

          {/* Body can be string or JSX */}
          {typeof body === "string" ? (
            <Text as="p" variant="bodyMd">
              {body}
            </Text>
          ) : (
            body
          )}

          {/* Optional checkbox (e.g. "Also delete from Shopify") */}
          {checkbox && (
            <Box paddingBlockStart="200">
              <Checkbox
                label={checkbox.label}
                checked={checkbox.checked}
                onChange={checkbox.onChange}
                helpText={checkbox.helpText}
              />
            </Box>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
