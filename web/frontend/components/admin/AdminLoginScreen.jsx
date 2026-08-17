import { Card, TextField, Button, FormLayout, Text, Banner, BlockStack, InlineStack, Icon } from "@shopify/polaris";
import { Shield } from "lucide-react";
import { ViewIcon, HideIcon } from "@shopify/polaris-icons";
import { APP_NAME } from "../../utils/appName";

/** Pre-auth screen for the Super Admin panel — shown whenever there's no valid session token. */
export default function AdminLoginScreen({
  email, setEmail, password, setPassword, showPassword, setShowPassword,
  error, setError, loading, onLogin,
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f6f8fa",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "440px", padding: "20px" }}>
        <BlockStack gap="400">
          {error && (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          )}
          <Card padding="600">
            <BlockStack gap="500">
              <InlineStack align="center" gap="200">
                <Shield size={36} color="#10b981" />
                <Text variant="headingXl" as="h1">
                  {APP_NAME} Console
                </Text>
              </InlineStack>
              <Text variant="bodyMd" tone="subdued" alignment="center">
                Sign in to manage stores, plans, and billing.
              </Text>
              <FormLayout>
                <TextField
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="email"
                />
                <TextField
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  suffix={
                    <div
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ cursor: "pointer", display: "flex", alignItems: "center", padding: "0 4px" }}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      <Icon source={showPassword ? HideIcon : ViewIcon} tone="subdued" />
                    </div>
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onLogin();
                  }}
                />
                <Button variant="primary" onClick={onLogin} loading={loading} fullWidth>
                  Sign in
                </Button>
              </FormLayout>
            </BlockStack>
          </Card>
        </BlockStack>
      </div>
    </div>
  );
}
