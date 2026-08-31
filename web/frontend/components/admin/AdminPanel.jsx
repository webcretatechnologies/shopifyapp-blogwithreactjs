import { useEffect, useState } from "react";
import { Box, BlockStack, InlineStack, Text, Badge, Banner, Toast, Frame } from "@shopify/polaris";
import AdminLoginScreen from "./AdminLoginScreen";
import AdminSidebar from "./AdminSidebar";
import DashboardModule from "./modules/DashboardModule";
import PlatformAnalyticsModule from "./modules/PlatformAnalyticsModule";
import StoresModule from "./modules/StoresModule";
import PricingModule from "./modules/PricingModule";
import CouponsModule from "./modules/CouponsModule";
import ActivityModule from "./modules/ActivityModule";
import { createAdminFetch } from "../../utils/adminApi";

export const ADMIN_SECTIONS = ["dashboard", "analytics", "stores", "pricing", "coupons", "activities"];

const SECTION_TITLES = {
  dashboard: "Console Dashboard",
  analytics: "Platform Analytics",
  stores: "Stores Audit Auditor",
  pricing: "Plans & Billing",
  coupons: "Billing Coupons",
  activities: "Supervisor Activity Logs",
};

// Display-only JWT decode (the token is already trusted — issued by this same server — so this
// is purely for showing "Signed in as X" in the header, not a security boundary).
function decodeAdminEmailFromToken(jwt) {
  try {
    const payload = jwt.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded.email || null;
  } catch {
    return null;
  }
}

/**
 * Super Admin panel shell — pre-auth login screen, then sidebar + header + one module at a time.
 * Each module (./modules/*) owns its own data/state/confirm-modals; this shell only provides the
 * shared primitives (adminFetch, showToast, setError) and which module is currently active, so
 * modules stay independently testable/reusable rather than one 2500-line cross-coupled file.
 *
 * `activeSection` and `onNavigate` are owned by the caller (pages/admin/[tab].jsx), which is what
 * gives each module a real, bookmarkable, shareable URL (/admin/dashboard, /admin/stores, ...)
 * instead of one fixed /admin?tab=... query string.
 */
export default function AdminPanel({ activeSection, onNavigate }) {
  const [token, setToken] = useState(localStorage.getItem("super_admin_token") || "");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setErrorMessage] = useState(null);
  const [successToast, setSuccessToast] = useState("");
  const [loading, setLoading] = useState(false);
  // Bumped on every notification, even when the text repeats — two identical failures in a row
  // are two events, and the second one has to restart the timer rather than ride out the first's.
  const [notificationNonce, setNotificationNonce] = useState(0);

  const setError = (message) => {
    setErrorMessage(message);
    setNotificationNonce((n) => n + 1);
  };

  // Error banners used to sit there until someone clicked the ✕ — a failed save from twenty
  // minutes ago still on screen reads as a live failure. Both notifications now clear
  // themselves: errors after 8s (long enough to read a sentence), success toasts on Polaris's
  // own 5s timer. Manual dismiss still works, and a new message restarts the clock rather than
  // inheriting the previous one's remaining time.
  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setErrorMessage(null), 8000);
    return () => clearTimeout(t);
  }, [error, notificationNonce]);

  useEffect(() => {
    if (!successToast) return undefined;
    // Belt and braces: if this Toast ever renders outside the Frame that drives its timer, the
    // message would otherwise stay up forever.
    const t = setTimeout(() => setSuccessToast(""), 6000);
    return () => clearTimeout(t);
  }, [successToast, notificationNonce]);

  const handleLogout = () => {
    localStorage.removeItem("super_admin_token");
    setToken("");
    setErrorMessage(null);
  };

  const showToast = (message) => {
    setSuccessToast(message);
    setNotificationNonce((n) => n + 1);
  };

  const adminFetch = createAdminFetch(token, handleLogout);

  const handleLogin = async () => {
    if (!loginEmail || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/admin-api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("super_admin_token", data.token);
      setToken(data.token);
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AdminLoginScreen
        email={loginEmail}
        setEmail={setLoginEmail}
        password={password}
        setPassword={setPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        error={error}
        setError={setError}
        loading={loading}
        onLogin={handleLogin}
      />
    );
  }

  // key remounts the Toast on a repeat message so Polaris restarts its own 5s countdown.
  const toastMarkup = successToast ? (
    <Toast key={notificationNonce} content={successToast} onDismiss={() => setSuccessToast("")} />
  ) : null;

  return (
    <Frame>
      <Box background="bg-surface-secondary" minHeight="100vh" color="text">
        {/* Plain flex div, not Polaris <InlineStack>/<Box flex="1">: Box has no real "flex"
            prop (it was silently ignored), so the content column never stretched to fill the
            remaining width next to the sidebar, leaving a large empty gap on the right. */}
        <div style={{ display: "flex", width: "100%", minHeight: "100vh" }}>
          <AdminSidebar activeSection={activeSection} onSelect={onNavigate} onLogout={handleLogout} />

          <div style={{ flex: "1 1 0%", minWidth: 0, display: "flex", flexDirection: "column" }}>
            <Box background="bg-surface" padding="400" borderBlockEndWidth="025" borderColor="border">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingLg" as="h1">
                  <span style={{ color: "#202223" }}>{SECTION_TITLES[activeSection] || "Dashboard"}</span>
                </Text>
                <InlineStack gap="300" align="center">
                  <Badge tone="success">
                    {`Signed in as ${loginEmail || decodeAdminEmailFromToken(token) || "Super Admin"}`}
                  </Badge>
                </InlineStack>
              </InlineStack>
            </Box>

            <main style={{ padding: "32px", flexGrow: 1, width: "100%" }}>
              {/* Reference admin UIs cap content well short of the browser edge on wide screens
                  — full-bleed cards read as unfinished, not spacious, once the viewport gets past
                  a normal laptop width. margin:auto centers the capped column in the remaining
                  space next to the sidebar, so the breathing room reads as a balanced margin on
                  both sides instead of a lopsided gap only on the right. */}
              <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
                <BlockStack gap="500">
                  {error && (
                    <Banner tone="critical" onDismiss={() => setError(null)}>
                      {error}
                    </Banner>
                  )}

                  <DashboardModule
                  active={activeSection === "dashboard"}
                  token={token}
                  adminFetch={adminFetch}
                  setError={setError}
                />
                <PlatformAnalyticsModule
                  active={activeSection === "analytics"}
                  adminFetch={adminFetch}
                  setError={setError}
                />
                <StoresModule
                  active={activeSection === "stores"}
                  token={token}
                  adminFetch={adminFetch}
                  showToast={showToast}
                  setError={setError}
                />
                <PricingModule
                  active={activeSection === "pricing"}
                  adminFetch={adminFetch}
                  showToast={showToast}
                  setError={setError}
                />
                <CouponsModule
                  active={activeSection === "coupons"}
                  token={token}
                  adminFetch={adminFetch}
                  showToast={showToast}
                  setError={setError}
                />
                <ActivityModule
                  active={activeSection === "activities"}
                  adminFetch={adminFetch}
                  setError={setError}
                />
                </BlockStack>
              </div>
            </main>
          </div>

          {toastMarkup}
        </div>
      </Box>
    </Frame>
  );
}
