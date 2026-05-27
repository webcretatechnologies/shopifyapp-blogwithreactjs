import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import {
  Card,
  TextField,
  Button,
  FormLayout,
  Text,
  Banner,
  BlockStack,
  InlineStack,
  Grid,
  IndexTable,
  Badge,
  Modal,
  Select,
  Checkbox,
  Box,
  Divider,
  ProgressBar,
  Tabs,
  Toast,
  Frame,
} from "@shopify/polaris";
import {
  LayoutDashboard,
  Store,
  Settings,
  Mail,
  FileText,
  LogOut,
  Shield,
  Download,
  Send,
  Eye,
  Trash2,
  RefreshCw,
  Info,
  CheckCircle,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import ConfirmActionModal from "../components/ConfirmActionModal";

const DownloadIcon = (props) => <Download size={16} {...props} />;
const TrashIcon = (props) => <Trash2 size={16} {...props} />;
const RefreshIcon = (props) => <RefreshCw size={16} {...props} />;
const SendIcon = (props) => <Send size={16} {...props} />;

export default function Admin() {
  const [token, setToken] = useState(
    localStorage.getItem("super_admin_token") || "",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [successToast, setSuccessToast] = useState("");
  const [loading, setLoading] = useState(false);

  // Active section state
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get("tab") || "dashboard";
  
  const setActiveSection = useCallback((section) => {
    setSearchParams((prev) => {
      prev.set("tab", section);
      return prev;
    });
  }, [setSearchParams]);

  // Dashboard Stats
  const [metrics, setMetrics] = useState({
    totalShops: 0,
    activeShops: 0,
    deactivatedShops: 0,
    newThisMonth: 0,
    churnedThisMonth: 0,
    mrr: 0,
    arr: 0,
    planBreakdown: { free: 0, starter: 0, pro: 0, business: 0 },
  });
  const [monthlyChartData, setMonthlyChartData] = useState([]);
  const [recentShops, setRecentShops] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);

  // Stores Auditor
  const [stores, setStores] = useState([]);
  const [storesTotal, setStoresTotal] = useState(0);
  const [storesSearch, setStoresSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("installedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [storesPage, setStoresPage] = useState(1);

  // Pricing & Billing
  const [pricingEnabled, setPricingEnabled] = useState(true);
  const [billingTestMode, setBillingTestMode] = useState(true);
  const [features, setFeatures] = useState([]);
  const [selectedPlanTab, setSelectedPlanTab] = useState(0);
  const planTabKeys = ["free", "starter", "pro", "business"];
  const [dynamicPlans, setDynamicPlans] = useState([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);

  // Email Center
  const [emailSubTab, setEmailSubTab] = useState(0); // 0 = send bulk, 1 = logs
  const [recipientType, setRecipientType] = useState("all");
  const [recipientPlanId, setRecipientPlanId] = useState("starter");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [templates, setTemplates] = useState({});
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [emails, setEmails] = useState([]);
  const [emailsTotal, setEmailsTotal] = useState(0);
  const [emailsPage, setEmailsPage] = useState(1);

  // Activities Log Tab
  const [activities, setActivities] = useState([]);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [activitiesPage, setActivitiesPage] = useState(1);

  // Chat support states
  const [chatHistory, setChatHistory] = useState({});
  const [selectedChatRoom, setSelectedChatRoom] = useState("");
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Modal: Plan Override
  const [overrideModalActive, setOverrideModalActive] = useState(false);
  const [selectedStoreDomain, setSelectedStoreDomain] = useState("");
  const [overridePlan, setOverridePlan] = useState("Blogger Pro");
  const [overrideExpiry, setOverrideExpiry] = useState("");

  // Modal: Store Detail Auditor
  const [detailModalActive, setDetailModalActive] = useState(false);
  const [storeDetail, setStoreDetail] = useState(null);
  const [storeLogs, setStoreLogs] = useState([]);

  // Modal: Custom Single Store Email
  const [singleEmailModalActive, setSingleEmailModalActive] = useState(false);
  const [singleEmailSubject, setSingleEmailSubject] = useState("");
  const [singleEmailBody, setSingleEmailBody] = useState("");
  const [singleEmailValidation, setSingleEmailValidation] = useState("");

  // Confirm action modal state (replaces native confirm())
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [bulkEmailValidation, setBulkEmailValidation] = useState("");

  const handleLogout = () => {
    localStorage.removeItem("super_admin_token");
    setToken("");
    setError(null);
  };

  const openConfirmAction = (config) => setConfirmAction(config);
  const closeConfirmAction = () => {
    if (confirmLoading) return;
    setConfirmAction(null);
  };

  const showToast = (message) => {
    setSuccessToast(message);
  };

  const handleLogin = async () => {
    if (!password) {
      setError("Password is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/admin-api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
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

  // Helper fetcher
  const adminFetch = useCallback(
    async (path, options = {}) => {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      };
      const res = await fetch(path, { ...options, headers });
      if (res.status === 401) {
        handleLogout();
        throw new Error("Session expired. Please log in again.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    },
    [token],
  );

  // Load Dashboard Data
  const loadDashboard = useCallback(async () => {
    try {
      const data = await adminFetch("/admin-api/dashboard");
      setMetrics(data.metrics);
      setMonthlyChartData(data.monthlyChartData || []);
      setRecentShops(data.recentShops || []);
      setRecentActivities(data.recentActivities || []);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch]);

  // Load Stores Auditor
  const loadStores = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams({
        search: storesSearch,
        statusFilter,
        planFilter,
        dateFrom,
        dateTo,
        sortBy,
        sortDir,
        page: storesPage.toString(),
        limit: "20",
      });
      const data = await adminFetch(
        `/admin-api/stores?${queryParams.toString()}`,
      );
      setStores(data.stores || []);
      setStoresTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    }
  }, [
    adminFetch,
    storesSearch,
    statusFilter,
    planFilter,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    storesPage,
  ]);

  // Load Pricing & Plan Features settings
  const loadPricingAndFeatures = useCallback(async () => {
    try {
      const settingsData = await adminFetch("/admin-api/settings");
      setPricingEnabled(settingsData.pricingEnabled);
      setBillingTestMode(settingsData.billingTestMode !== false); // default true

      const featuresData = await adminFetch("/admin-api/pricing/features");
      setFeatures(featuresData.features || []);

      const plansData = await adminFetch("/admin-api/pricing/plans");
      setDynamicPlans(plansData.plans || []);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch]);

  // Save modified Plan Feature limits
  const handleFeatureUpdate = async (featureId, enabled, limit) => {
    try {
      await adminFetch(`/admin-api/pricing/features/${featureId}`, {
        method: "POST",
        body: JSON.stringify({ enabled, limit }),
      });
      showToast("Feature limits updated successfully");
      loadPricingAndFeatures();
    } catch (err) {
      setError(err.message);
    }
  };

  // Reset plan features to default presets
  const handleResetFeatures = () => {
    openConfirmAction({
      type: "reset_features",
      title: "Restore default feature limits?",
      body: "All custom feature rules will be overwritten and restored to system defaults.",
      confirmText: "Restore defaults",
      confirmTone: "critical",
    });
  };

  // Dynamic Plan Management
  const handleSavePlan = async () => {
    if (!editingPlan.name || !editingPlan.title) {
      setError("Name and Title are required.");
      return;
    }
    try {
      const isNew = !editingPlan.id;
      const url = isNew ? "/admin-api/pricing/plans" : `/admin-api/pricing/plans/${editingPlan.id}`;
      const method = isNew ? "POST" : "PUT";
      
      const payload = {
        ...editingPlan,
        price: parseFloat(editingPlan.price),
        features: typeof editingPlan.features === "string" ? editingPlan.features.split("\n").filter(Boolean) : editingPlan.features,
      };

      await adminFetch(url, { method, body: JSON.stringify(payload) });
      showToast(`Plan ${isNew ? 'created' : 'updated'} successfully`);
      setShowPlanModal(false);
      loadPricingAndFeatures();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePlan = (id) => {
    openConfirmAction({
      type: "delete_plan",
      payload: { id },
      title: "Delete this plan?",
      body: "This action is irreversible and the plan will be permanently removed.",
      confirmText: "Delete plan",
      confirmTone: "critical",
    });
  };

  // Load Email Templates presets
  const loadTemplates = useCallback(async () => {
    try {
      const data = await adminFetch("/admin-api/emails/templates");
      setTemplates(data.templates || {});
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch]);

  // Load Sent Email Logs
  const loadEmails = useCallback(async () => {
    try {
      const data = await adminFetch(
        `/admin-api/emails?page=${emailsPage}&limit=20`,
      );
      setEmails(data.emails || []);
      setEmailsTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch, emailsPage]);

  // Load System Activities
  const loadActivities = useCallback(async () => {
    try {
      const data = await adminFetch(
        `/admin-api/activities?page=${activitiesPage}&limit=20`,
      );
      setActivities(data.activities || []);
      setActivitiesTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch, activitiesPage]);

  // Load Active Chat Support Rooms
  const loadChats = useCallback(async () => {
    try {
      const data = await adminFetch("/admin-api/chats");
      setChatHistory(data.chats || {});
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch]);

  // Reply to target chat room
  const handleReplySubmit = async () => {
    if (!replyText.trim() || !selectedChatRoom) return;
    setIsSendingReply(true);
    try {
      await adminFetch(`/admin-api/chats/${selectedChatRoom}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: replyText }),
      });
      setReplyText("");
      await loadChats();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Connect to Socket.io for the selected chat room
  useEffect(() => {
    if (!selectedChatRoom) return;

    const socketConnection = io({
      path: "/chat-socket",
      transports: ["websocket"],
    });

    socketConnection.on("connect", () => {
      socketConnection.emit("join_room", { room: selectedChatRoom });
    });

    socketConnection.on("new_message", (msg) => {
      setChatHistory((prev) => {
        const room = msg.room || selectedChatRoom;
        const currentMsgs = prev[room] || [];
        if (
          currentMsgs.some(
            (m) => m.timestamp === msg.timestamp && m.text === msg.text,
          )
        ) {
          return prev;
        }
        return {
          ...prev,
          [room]: [...currentMsgs, msg],
        };
      });
    });

    socketConnection.on("history", (history) => {
      setChatHistory((prev) => ({
        ...prev,
        [selectedChatRoom]: history,
      }));
    });

    return () => {
      socketConnection.disconnect();
    };
  }, [selectedChatRoom]);

  // Handle plan override submission
  const handleOverrideSubmit = async () => {
    try {
      await adminFetch(`/admin-api/stores/${selectedStoreDomain}/override`, {
        method: "POST",
        body: JSON.stringify({
          plan: overridePlan,
          expiresAt: overrideExpiry || null,
        }),
      });
      setOverrideModalActive(false);
      showToast(`Overrode plan for ${selectedStoreDomain} successfully`);
      loadStores();
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  // Confirm action executor — dispatches based on type
  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      switch (confirmAction.type) {
        case "reset_features":
          await adminFetch("/admin-api/pricing/features/reset", { method: "POST" });
          showToast("Plan features restored to system defaults");
          loadPricingAndFeatures();
          break;
        case "delete_plan":
          await adminFetch(`/admin-api/pricing/plans/${confirmAction.payload.id}`, { method: "DELETE" });
          showToast("Plan deleted successfully");
          loadPricingAndFeatures();
          break;
        case "soft_deactivate_store":
          await adminFetch(`/admin-api/stores/${confirmAction.payload.domain}/deactivate`, { method: "POST" });
          showToast(`Soft deactivated ${confirmAction.payload.domain}`);
          loadStores();
          loadDashboard();
          break;
        case "force_delete_store":
          await adminFetch(`/admin-api/stores/${confirmAction.payload.domain}/delete`, { method: "POST" });
          showToast(`Force deleted store ${confirmAction.payload.domain} from app database`);
          loadStores();
          loadDashboard();
          break;
      }
      setConfirmAction(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmLoading(false);
    }
  };

  // Soft Deactivate store
  const handleSoftDeactivateStore = (domain) => {
    openConfirmAction({
      type: "soft_deactivate_store",
      payload: { domain },
      title: `Deactivate ${domain}?`,
      body: `This will set the store as uninstalled and send a deactivation notification email.`,
      confirmText: "Deactivate store",
      confirmTone: "warning",
    });
  };

  // Reactivate store
  const handleReactivateStore = async (domain) => {
    try {
      await adminFetch(`/admin-api/stores/${domain}/reactivate`, {
        method: "POST",
      });
      showToast(`Reactivated store ${domain} and sent confirmation email`);
      loadStores();
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  // Force cascade delete store from database
  const handleForceDeleteStore = (domain) => {
    openConfirmAction({
      type: "force_delete_store",
      payload: { domain },
      title: `Force delete ${domain}?`,
      body: (
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">This permanently removes the store from the app database.</Text>
          <Text as="p" variant="bodyMd">It will also cascade delete all posts, sessions, plan entries, overrides, and related configurations.</Text>
          <Text as="p" variant="bodyMd" tone="critical" fontWeight="bold">This cannot be undone.</Text>
        </BlockStack>
      ),
      confirmText: "Force delete",
      confirmTone: "critical",
    });
  };

  // View detailed metrics and logs of store
  const handleViewStoreDetail = async (domain) => {
    try {
      const data = await adminFetch(`/admin-api/stores/${domain}`);
      setStoreDetail(data.store);
      setStoreLogs(data.logs || []);
      setDetailModalActive(true);
    } catch (err) {
      setError(err.message);
    }
  };

  // Send single custom email
  const handleSendSingleEmail = async () => {
    if (!singleEmailSubject.trim() || !singleEmailBody.trim()) {
      setSingleEmailValidation("Subject and body are required.");
      return;
    }
    setSingleEmailValidation("");
    try {
      await adminFetch(`/admin-api/stores/${selectedStoreDomain}/email`, {
        method: "POST",
        body: JSON.stringify({
          subject: singleEmailSubject,
          body: singleEmailBody,
        }),
      });
      setSingleEmailModalActive(false);
      setSingleEmailSubject("");
      setSingleEmailBody("");
      setSingleEmailValidation("");
      showToast(`Email successfully sent to ${selectedStoreDomain}`);
    } catch (err) {
      setError(err.message);
    }
  };

  // Send Bulk Email
  const handleSendBulkEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      setBulkEmailValidation("Subject and body are required.");
      return;
    }
    setBulkEmailValidation("");
    try {
      const data = await adminFetch("/admin-api/emails/send-bulk", {
        method: "POST",
        body: JSON.stringify({
          recipientType,
          recipientPlanId: recipientPlanId,
          subject: emailSubject,
          body: emailBody,
          templateKey: selectedTemplateKey,
        }),
      });
      showToast(data.message || "Bulk email sent successfully");
      setEmailSubject("");
      setEmailBody("");
      setBulkEmailValidation("");
      setSelectedTemplateKey("");
    } catch (err) {
      setError(err.message);
    }
  };

  // Apply Email Template Preset
  const handleLoadTemplate = (key) => {
    setSelectedTemplateKey(key);
    setBulkEmailValidation("");
    const tpl = templates[key];
    if (tpl) {
      setEmailSubject(tpl.subject);
      setEmailBody(tpl.body);
    } else {
      setEmailSubject("");
      setEmailBody("");
    }
  };

  // Trigger CSV Download for stores auditor
  const handleExportStoresCsv = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch("/admin-api/stores/export", { headers });
      if (!res.ok) throw new Error("CSV Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stores-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err.message);
    }
  };

  // Trigger CSV Download for monthly revenue reports
  const handleExportRevenueCsv = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch("/admin-api/revenue/export", { headers });
      if (!res.ok) throw new Error("Revenue Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `revenue-${new Date().getFullYear()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle pricing settings toggle
  const handlePricingToggle = async (checked) => {
    try {
      const data = await adminFetch("/admin-api/settings", {
        method: "POST",
        body: JSON.stringify({ pricingEnabled: checked }),
      });
      setPricingEnabled(data.pricingEnabled);
      showToast(`Global pricing set to ${checked ? "Active" : "Disabled"}`);
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTestModeToggle = async (checked) => {
    try {
      await adminFetch("/admin-api/settings", {
        method: "POST",
        body: JSON.stringify({ billingTestMode: checked }),
      });
      setBillingTestMode(checked);
      showToast(`Billing test mode set to ${checked ? "Active" : "Disabled"}`);
    } catch (err) {
      setError(err.message);
    }
  };

  // Effect to load relevant data depending on active section/pages
  useEffect(() => {
    if (!token) return;

    if (activeSection === "dashboard") loadDashboard();
    if (activeSection === "stores") loadStores();
    if (activeSection === "pricing") loadPricingAndFeatures();
    if (activeSection === "emails") {
      if (emailSubTab === 0) loadTemplates();
      if (emailSubTab === 1) loadEmails();
    }
    if (activeSection === "activities") loadActivities();
    if (activeSection === "chats") {
      loadChats();
      const interval = setInterval(loadChats, 4000);
      return () => clearInterval(interval);
    }
  }, [
    token,
    activeSection,
    storesSearch,
    statusFilter,
    planFilter,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    storesPage,
    emailSubTab,
    emailsPage,
    activitiesPage,
    loadDashboard,
    loadStores,
    loadPricingAndFeatures,
    loadTemplates,
    loadEmails,
    loadActivities,
    loadChats,
  ]);

  // Login view if session token is empty
  if (!token) {
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
                    Blogger Console
                  </Text>
                </InlineStack>
                <Text variant="bodyMd" tone="subdued" alignment="center">
                  Authenticate with system credentials to access the
                  administrative supervisor portal.
                </Text>
                <FormLayout>
                  <TextField
                    label="Supervisor Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLogin();
                    }}
                  />
                  <Button
                    variant="primary"
                    onClick={handleLogin}
                    loading={loading}
                    fullWidth
                  >
                    Login to supervisor account
                  </Button>
                </FormLayout>
              </BlockStack>
            </Card>
          </BlockStack>
        </div>
      </div>
    );
  }

  // Get dynamic header names
  const getSectionTitle = () => {
    switch (activeSection) {
      case "dashboard":
        return "Console Dashboard";
      case "stores":
        return "Stores Audit Auditor";
      case "pricing":
        return "Pricing & Plan Features";
      case "emails":
        return "Mailing & Broadcast Center";
      case "chats":
        return "Live Support Chat Desk";
      case "activities":
        return "Supervisor Activity Logs";
      default:
        return "Dashboard";
    }
  };

  const toastMarkup = successToast ? (
    <Toast content={successToast} onDismiss={() => setSuccessToast("")} />
  ) : null;

  return (
    <Frame>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          backgroundColor: "#f6f8fa",
          color: "#202223",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* ─── SIDEBAR NAVIGATION ─── */}
        <div
          style={{
            width: "260px",
            backgroundColor: "#ffffff",
            borderRight: "1px solid #e1e3e5",
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            height: "100vh",
            left: 0,
            top: 0,
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "24px 20px",
              borderBottom: "1px solid #e1e3e5",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <Shield size={24} color="#008060" />
            <Text variant="headingMd" as="span">
              <span style={{ color: "#202223", fontWeight: 700 }}>Blogger</span>
              <span
                style={{
                  color: "#008060",
                  fontSize: "12px",
                  marginLeft: "4px",
                  padding: "2px 6px",
                  background: "#e2f1eb",
                  borderRadius: "4px",
                }}
              >
                Admin
              </span>
            </Text>
          </div>

          {/* Nav Items */}
          <div style={{ flexGrow: 1, padding: "24px 12px" }}>
            <BlockStack gap="150">
              {[
                {
                  id: "dashboard",
                  label: "Dashboard Overview",
                  icon: LayoutDashboard,
                },
                { id: "stores", label: "Stores Auditor", icon: Store },
                { id: "pricing", label: "Pricing & Features", icon: Settings },
                { id: "emails", label: "Email Center", icon: Mail },
                {
                  id: "chats",
                  label: "Live Support Chats",
                  icon: MessageSquare,
                },
                {
                  id: "activities",
                  label: "Supervisor Activity",
                  icon: FileText,
                },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "100%",
                      padding: "12px 14px",
                      border: "none",
                      borderRadius: "8px",
                      backgroundColor: isActive ? "#008060" : "transparent",
                      color: isActive ? "#ffffff" : "#4a4d50",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "500",
                      transition: "all 0.2s ease-in-out",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        e.currentTarget.style.backgroundColor = "#f1f2f4";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <Icon size={18} />
                    {item.label}
                  </button>
                );
              })}
            </BlockStack>
          </div>

          {/* Footer logout */}
          <div style={{ padding: "20px", borderTop: "1px solid #e1e3e5" }}>
            <button
              onClick={handleLogout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "12px 14px",
                border: "none",
                borderRadius: "8px",
                backgroundColor: "transparent",
                color: "#bf0711",
                textAlign: "left",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              <LogOut size={18} />
              Logout Session
            </button>
          </div>
        </div>

        {/* ─── MAIN APP PAGE BODY ─── */}
        <div
          style={{
            flexGrow: 1,
            marginLeft: "260px",
            display: "flex",
            flexDirection: "column",
            minHeight: "100vh",
          }}
        >
          {/* Header bar */}
          <header
            style={{
              height: "64px",
              backgroundColor: "#ffffff",
              borderBottom: "1px solid #e1e3e5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 32px",
              position: "sticky",
              top: 0,
              zIndex: 90,
            }}
          >
            <Text variant="headingLg" as="h1">
              <span style={{ color: "#202223" }}>{getSectionTitle()}</span>
            </Text>
            <InlineStack gap="300" align="center">
              <Badge tone="success">Active System Credentials</Badge>
            </InlineStack>
          </header>

          {/* Content container */}
          <main style={{ padding: "32px", flexGrow: 1 }}>
            <BlockStack gap="500">
              {error && (
                <Banner tone="critical" onDismiss={() => setError(null)}>
                  {error}
                </Banner>
              )}

              {/* ──────────────────────────────────────────────────────── */}
              {/* SECTION: DASHBOARD */}
              {/* ──────────────────────────────────────────────────────── */}
              {activeSection === "dashboard" && (
                <BlockStack gap="500">
                  {/* Cards metrics */}
                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                      <Card>
                        <Box padding="400">
                          <Text variant="headingSm" tone="subdued">
                            Active / Total Installs
                          </Text>
                          <Box paddingBlockStart="200">
                            <Text variant="heading2xl" as="p">
                              <span
                                style={{ color: "#10b981", fontWeight: 700 }}
                              >
                                {metrics.activeShops}
                              </span>
                              <span
                                style={{
                                  color: "#6b7280",
                                  fontSize: "16px",
                                  marginLeft: "6px",
                                }}
                              >
                                / {metrics.totalShops} stores
                              </span>
                            </Text>
                          </Box>
                        </Box>
                      </Card>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                      <Card>
                        <Box padding="400">
                          <Text variant="headingSm" tone="subdued">
                            Monthly Installs / Churns
                          </Text>
                          <Box paddingBlockStart="200">
                            <Text variant="heading2xl" as="p">
                              <span
                                style={{ color: "#3b82f6", fontWeight: 700 }}
                              >
                                +{metrics.newThisMonth}
                              </span>
                              <span
                                style={{
                                  color: "#ef4444",
                                  fontWeight: 700,
                                  marginLeft: "12px",
                                }}
                              >
                                -{metrics.churnedThisMonth}
                              </span>
                            </Text>
                          </Box>
                        </Box>
                      </Card>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                      <Card>
                        <Box padding="400">
                          <Text variant="headingSm" tone="subdued">
                            Monthly Recurring Revenue (MRR)
                          </Text>
                          <Box paddingBlockStart="200">
                            <Text variant="heading2xl" as="p">
                              <span
                                style={{ color: "#ffffff", fontWeight: 700 }}
                              >
                                ${metrics.mrr.toFixed(2)}
                              </span>
                              <span
                                style={{
                                  color: "#6b7280",
                                  fontSize: "14px",
                                  marginLeft: "8px",
                                }}
                              >
                                ARR: ${metrics.arr.toFixed(2)}
                              </span>
                            </Text>
                          </Box>
                        </Box>
                      </Card>
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                      <Card>
                        <Box padding="400">
                          <Text variant="headingSm" tone="subdued">
                            Billing Gating Settings
                          </Text>
                          <Box paddingBlockStart="200">
                            <InlineStack align="space-between" alignY="center">
                              <Badge
                                tone={pricingEnabled ? "success" : "warning"}
                              >
                                {pricingEnabled
                                  ? "Shopify Billing Active"
                                  : "Bypassed / Free Mode"}
                              </Badge>
                              <Button
                                size="micro"
                                onClick={() => setActiveSection("pricing")}
                              >
                                Edit
                              </Button>
                            </InlineStack>
                          </Box>
                        </Box>
                      </Card>
                    </Grid.Cell>
                  </Grid>

                  {/* Plan breakdown charts */}
                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
                      <Card>
                        <Box padding="450">
                          <BlockStack gap="400">
                            <Text variant="headingMd" as="h3">
                              Active Plan Distributions
                            </Text>
                            {[
                              {
                                key: "free",
                                label: "Free Plan",
                                val: metrics.planBreakdown.free,
                                total: metrics.activeShops || 1,
                                color: "#9ca3af",
                              },
                              {
                                key: "starter",
                                label: "Blogger Starter ($4.99)",
                                val: metrics.planBreakdown.starter,
                                total: metrics.activeShops || 1,
                                color: "#60a5fa",
                              },
                              {
                                key: "pro",
                                label: "Blogger Pro ($9.99)",
                                val: metrics.planBreakdown.pro,
                                total: metrics.activeShops || 1,
                                color: "#10b981",
                              },
                              {
                                key: "business",
                                label: "Blogger Business ($19.99)",
                                val: metrics.planBreakdown.business,
                                total: metrics.activeShops || 1,
                                color: "#a78bfa",
                              },
                            ].map((p) => {
                              const pct = Math.round((p.val / p.total) * 100);
                              return (
                                <BlockStack gap="100" key={p.key}>
                                  <InlineStack align="space-between">
                                    <Text variant="bodySm" fontWeight="bold">
                                      {p.label}
                                    </Text>
                                    <Text variant="bodySm" tone="subdued">
                                      {p.val} stores ({pct}%)
                                    </Text>
                                  </InlineStack>
                                  <ProgressBar
                                    progress={pct}
                                    size="small"
                                    tone={
                                      p.key === "free"
                                        ? "default"
                                        : p.key === "starter"
                                          ? "info"
                                          : p.key === "pro"
                                            ? "success"
                                            : "attention"
                                    }
                                  />
                                </BlockStack>
                              );
                            })}
                          </BlockStack>
                        </Box>
                      </Card>
                    </Grid.Cell>

                    <Grid.Cell columnSpan={{ xs: 6, sm: 8, md: 8, lg: 8 }}>
                      <Card>
                        <Box padding="450">
                          <BlockStack gap="300">
                            <InlineStack align="space-between" alignY="center">
                              <Text variant="headingMd" as="h3">
                                Monthly Churn & Signups (
                                {new Date().getFullYear()})
                              </Text>
                              <Button
                                icon={DownloadIcon}
                                onClick={handleExportRevenueCsv}
                                size="slim"
                              >
                                Export Revenue Report
                              </Button>
                            </InlineStack>
                            <IndexTable
                              resourceName={{ singular: "row", plural: "rows" }}
                              itemCount={monthlyChartData.length}
                              headings={[
                                { title: "Month" },
                                { title: "New Installs" },
                                { title: "Churned Stores" },
                                { title: "Estimated Revenue" },
                              ]}
                              selectable={false}
                            >
                              {monthlyChartData.map((row, index) => (
                                <IndexTable.Row
                                  id={String(index)}
                                  key={index}
                                  position={index}
                                >
                                  <IndexTable.Cell>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      {row.month}
                                    </Text>
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    <span
                                      style={{
                                        color: "#60a5fa",
                                        fontWeight: 600,
                                      }}
                                    >
                                      +{row.installs}
                                    </span>
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    <span
                                      style={{
                                        color: "#f87171",
                                        fontWeight: 600,
                                      }}
                                    >
                                      -{row.churned}
                                    </span>
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    <Text fontWeight="bold">
                                      ${row.revenue.toFixed(2)}
                                    </Text>
                                  </IndexTable.Cell>
                                </IndexTable.Row>
                              ))}
                            </IndexTable>
                          </BlockStack>
                        </Box>
                      </Card>
                    </Grid.Cell>
                  </Grid>

                  {/* Recent Installations and Actions */}
                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                      <Card>
                        <Box padding="450">
                          <BlockStack gap="300">
                            <Text variant="headingMd" as="h3">
                              Recent Merchant Onboarding
                            </Text>
                            <IndexTable
                              resourceName={{
                                singular: "store",
                                plural: "stores",
                              }}
                              itemCount={recentShops.length}
                              headings={[
                                { title: "Domain" },
                                { title: "Email" },
                                { title: "Plan" },
                                { title: "Installed" },
                              ]}
                              selectable={false}
                            >
                              {recentShops.map((shop, index) => (
                                <IndexTable.Row
                                  id={String(shop.id)}
                                  key={shop.id}
                                  position={index}
                                >
                                  <IndexTable.Cell>
                                    <Text variant="bodyMd" fontWeight="bold">
                                      {shop.domain}
                                    </Text>
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    {shop.email}
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    <Badge
                                      tone={
                                        shop.planKey === "free"
                                          ? "default"
                                          : "info"
                                      }
                                    >
                                      {shop.planKey}
                                    </Badge>
                                  </IndexTable.Cell>
                                  <IndexTable.Cell>
                                    {new Date(
                                      shop.installedAt,
                                    ).toLocaleDateString()}
                                  </IndexTable.Cell>
                                </IndexTable.Row>
                              ))}
                            </IndexTable>
                          </BlockStack>
                        </Box>
                      </Card>
                    </Grid.Cell>

                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                      <Card>
                        <Box padding="450">
                          <BlockStack gap="300">
                            <Text variant="headingMd" as="h3">
                              Supervisor Activity Log Feed
                            </Text>
                            <div
                              style={{ maxHeight: "280px", overflowY: "auto" }}
                            >
                              <BlockStack gap="300">
                                {recentActivities.length === 0 ? (
                                  <Text tone="subdued">
                                    No recent system activities found.
                                  </Text>
                                ) : (
                                  recentActivities.map((act) => (
                                    <div
                                      key={act.id}
                                      style={{
                                        display: "flex",
                                        gap: "12px",
                                        borderBottom: "1px solid #e1e3e5",
                                        paddingBottom: "10px",
                                      }}
                                    >
                                      <Info
                                        size={16}
                                        color="#008060"
                                        style={{
                                          flexShrink: 0,
                                          marginTop: "2px",
                                        }}
                                      />
                                      <div>
                                        <Text variant="bodySm" tone="subdued">
                                          {new Date(
                                            act.createdAt,
                                          ).toLocaleString()}
                                        </Text>
                                        <Text variant="bodyMd">
                                          {act.action}
                                        </Text>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </BlockStack>
                            </div>
                          </BlockStack>
                        </Box>
                      </Card>
                    </Grid.Cell>
                  </Grid>
                </BlockStack>
              )}

              {/* ──────────────────────────────────────────────────────── */}
              {/* SECTION: STORES AUDITOR */}
              {/* ──────────────────────────────────────────────────────── */}
              {activeSection === "stores" && (
                <Card>
                  <Box padding="400">
                    <BlockStack gap="400">
                      {/* Search and Filters grid */}
                      <Grid>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 2 }}>
                          <TextField
                            placeholder="Domain keyword..."
                            value={storesSearch}
                            onChange={(val) => {
                              setStoresSearch(val);
                              setStoresPage(1);
                            }}
                            autoComplete="off"
                            label="Search Stores"
                          />
                        </Grid.Cell>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 2 }}>
                          <Select
                            label="Status"
                            options={[
                              { label: "All Stores", value: "all" },
                              { label: "Active", value: "active" },
                              { label: "Deactivated", value: "deactivated" },
                            ]}
                            value={statusFilter}
                            onChange={(val) => {
                              setStatusFilter(val);
                              setStoresPage(1);
                            }}
                          />
                        </Grid.Cell>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 2 }}>
                          <Select
                            label="Plan Key"
                            options={[
                              { label: "All Plans", value: "all" },
                              { label: "Free tier", value: "free" },
                              {
                                label: "Blogger Starter",
                                value: "Blogger Starter",
                              },
                              { label: "Blogger Pro", value: "Blogger Pro" },
                              {
                                label: "Blogger Business",
                                value: "Blogger Business",
                              },
                            ]}
                            value={planFilter}
                            onChange={(val) => {
                              setPlanFilter(val);
                              setStoresPage(1);
                            }}
                          />
                        </Grid.Cell>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                          <InlineStack gap="200" align="space-between">
                            <div style={{ width: "47%" }}>
                              <TextField
                                label="Date From"
                                type="date"
                                value={dateFrom}
                                onChange={(val) => {
                                  setDateFrom(val);
                                  setStoresPage(1);
                                }}
                                autoComplete="off"
                              />
                            </div>
                            <div style={{ width: "47%" }}>
                              <TextField
                                label="Date To"
                                type="date"
                                value={dateTo}
                                onChange={(val) => {
                                  setDateTo(val);
                                  setStoresPage(1);
                                }}
                                autoComplete="off"
                              />
                            </div>
                          </InlineStack>
                        </Grid.Cell>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                          <div
                            style={{
                              display: "flex",
                              height: "100%",
                              alignItems: "flex-end",
                              gap: "10px",
                            }}
                          >
                            <Button
                              icon={DownloadIcon}
                              onClick={handleExportStoresCsv}
                            >
                              Export CSV
                            </Button>
                            <Button onClick={loadStores} variant="primary">
                              Apply
                            </Button>
                          </div>
                        </Grid.Cell>
                      </Grid>

                      {/* Main Table */}
                      <IndexTable
                        resourceName={{ singular: "store", plural: "stores" }}
                        itemCount={stores.length}
                        headings={[
                          { title: "Domain" },
                          { title: "Email" },
                          { title: "Plan" },
                          { title: "Override" },
                          { title: "Installed" },
                          { title: "Status" },
                          { title: "Actions" },
                        ]}
                        selectable={false}
                      >
                        {stores.map((s, index) => (
                          <IndexTable.Row
                            id={String(s.id)}
                            key={s.id}
                            position={index}
                          >
                            <IndexTable.Cell>
                              <Text variant="bodyMd" fontWeight="bold">
                                {s.domain}
                              </Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>{s.email}</IndexTable.Cell>
                            <IndexTable.Cell>
                              <Badge
                                tone={s.planKey === "free" ? "default" : "info"}
                              >
                                {s.planKey}
                              </Badge>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              {s.hasOverride ? (
                                <Badge tone="attention">
                                  Yes ({s.overridePlan})
                                </Badge>
                              ) : (
                                <Text tone="subdued">None</Text>
                              )}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              {new Date(s.installedAt).toLocaleDateString()}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              {s.uninstalledAt ? (
                                <Badge tone="critical">
                                  Deactivated (
                                  {new Date(
                                    s.uninstalledAt,
                                  ).toLocaleDateString()}
                                  )
                                </Badge>
                              ) : (
                                <Badge tone="success">Active</Badge>
                              )}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <InlineStack gap="150">
                                <Button
                                  size="slim"
                                  onClick={() =>
                                    handleViewStoreDetail(s.domain)
                                  }
                                >
                                  Detail
                                </Button>
                                <Button
                                  size="slim"
                                  onClick={() => {
                                    setSelectedStoreDomain(s.domain);
                                    setOverridePlan(s.planKey);
                                    setOverrideExpiry(
                                      s.overrideExpiresAt
                                        ? new Date(s.overrideExpiresAt)
                                            .toISOString()
                                            .split("T")[0]
                                        : "",
                                    );
                                    setOverrideModalActive(true);
                                  }}
                                >
                                  Override
                                </Button>
                                <Button
                                  size="slim"
                                  onClick={() => {
                                    setSelectedStoreDomain(s.domain);
                                    setSingleEmailModalActive(true);
                                  }}
                                >
                                  Email
                                </Button>
                                {s.uninstalledAt ? (
                                  <Button
                                    size="slim"
                                    tone="success"
                                    onClick={() =>
                                      handleReactivateStore(s.domain)
                                    }
                                  >
                                    Reactivate
                                  </Button>
                                ) : (
                                  <Button
                                    size="slim"
                                    tone="destructive"
                                    onClick={() =>
                                      handleSoftDeactivateStore(s.domain)
                                    }
                                  >
                                    Deactivate
                                  </Button>
                                )}
                                <Button
                                  size="slim"
                                  tone="destructive"
                                  variant="primary"
                                  icon={TrashIcon}
                                  onClick={() =>
                                    handleForceDeleteStore(s.domain)
                                  }
                                />
                              </InlineStack>
                            </IndexTable.Cell>
                          </IndexTable.Row>
                        ))}
                      </IndexTable>

                      {/* Pagination Controls */}
                      {storesTotal > 20 && (
                        <InlineStack align="center" gap="400">
                          <Button
                            disabled={storesPage === 1}
                            onClick={() =>
                              setStoresPage((p) => Math.max(p - 1, 1))
                            }
                          >
                            Prev
                          </Button>
                          <Text variant="bodyMd">
                            Page {storesPage} of {Math.ceil(storesTotal / 20)}
                          </Text>
                          <Button
                            disabled={storesPage * 20 >= storesTotal}
                            onClick={() => setStoresPage((p) => p + 1)}
                          >
                            Next
                          </Button>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Box>
                </Card>
              )}

              {/* ──────────────────────────────────────────────────────── */}
              {/* SECTION: PRICING & PLAN FEATURES */}
              {/* ──────────────────────────────────────────────────────── */}
              {activeSection === "pricing" && (
                <BlockStack gap="500">
                  <Card>
                    <Box padding="500">
                      <BlockStack gap="400">
                        <Text variant="headingLg" as="h3">
                          Global Billing Gating
                        </Text>
                        <Text variant="bodyMd" tone="subdued">
                          Configure whether merchants are redirected to Shopify
                          App Subscription charge authorization requests. When
                          disabled, merchants are bypass-gated to selected tiers
                          for free.
                        </Text>
                        <Divider />
                        <Checkbox
                          label="Enable Shopify Billing & Subscriptions"
                          checked={pricingEnabled}
                          onChange={handlePricingToggle}
                          helpText="Checked: redirects to live Shopify subscription flow. Unchecked: bypasses billing requests, treating paid tiers as active."
                        />
                        <Checkbox
                          label="Enable Billing Test Mode"
                          checked={billingTestMode}
                          onChange={handleTestModeToggle}
                          helpText="Checked: all charges are test charges (no real money). Unchecked: real charges will apply."
                        />
                      </BlockStack>
                    </Box>
                  </Card>

                  <Card>
                    <Box padding="500">
                      <BlockStack gap="400">
                        <InlineStack align="space-between" alignY="center">
                          <div>
                            <Text variant="headingLg" as="h3">
                              Subscription Plans (Dynamic Pricing)
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              Manage plans available to merchants. Changes here will immediately reflect on the billing page.
                            </Text>
                          </div>
                          <Button variant="primary" onClick={() => {
                            setEditingPlan({ name: "", title: "", price: "0.00", currency: "USD", interval: "EVERY_30_DAYS", description: "", features: "", isActive: true, sortOrder: 0 });
                            setShowPlanModal(true);
                          }}>
                            Create Plan
                          </Button>
                        </InlineStack>
                        <Divider />
                        <IndexTable
                          resourceName={{ singular: "plan", plural: "plans" }}
                          itemCount={dynamicPlans.length}
                          headings={[
                            { title: "Plan Name" },
                            { title: "Display Title" },
                            { title: "Price" },
                            { title: "Status" },
                            { title: "Actions" },
                          ]}
                          selectable={false}
                        >
                          {dynamicPlans.map((plan, index) => (
                            <IndexTable.Row key={plan.id} id={plan.id} position={index}>
                              <IndexTable.Cell>{plan.name}</IndexTable.Cell>
                              <IndexTable.Cell>{plan.title}</IndexTable.Cell>
                              <IndexTable.Cell>${plan.price} {plan.currency}</IndexTable.Cell>
                              <IndexTable.Cell>
                                <Badge tone={plan.isActive ? "success" : "critical"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
                              </IndexTable.Cell>
                              <IndexTable.Cell>
                                <InlineStack gap="200">
                                  <Button size="micro" onClick={() => {
                                    setEditingPlan({ ...plan, features: Array.isArray(plan.features) ? plan.features.join("\n") : "" });
                                    setShowPlanModal(true);
                                  }}>Edit</Button>
                                  <Button size="micro" tone="critical" onClick={() => handleDeletePlan(plan.id)}>Delete</Button>
                                </InlineStack>
                              </IndexTable.Cell>
                            </IndexTable.Row>
                          ))}
                        </IndexTable>
                      </BlockStack>
                    </Box>
                  </Card>

                  <Card>
                    <Box padding="500">
                      <BlockStack gap="400">
                        <InlineStack align="space-between" alignY="center">
                          <div>
                            <Text variant="headingLg" as="h3">
                              Dynamic Feature Gates & Limits Configuration
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              Modify limits or enable/disable components per
                              plan level dynamically in the database.
                            </Text>
                          </div>
                          <InlineStack gap="200">
                            <Button
                              tone="critical"
                              onClick={handleResetFeatures}
                              icon={RefreshIcon}
                            >
                              Reset to Defaults
                            </Button>
                          </InlineStack>
                        </InlineStack>

                        <Divider />

                        {/* Plan selection sub-tabs */}
                        <Tabs
                          tabs={[
                            { id: "free", content: "Free tier" },
                            { id: "starter", content: "Blogger Starter" },
                            { id: "pro", content: "Blogger Pro" },
                            { id: "business", content: "Blogger Business" },
                          ]}
                          selected={selectedPlanTab}
                          onSelect={setSelectedPlanTab}
                        />

                        {/* Feature grid table for the active selected tab */}
                        <IndexTable
                          resourceName={{
                            singular: "feature",
                            plural: "features",
                          }}
                          itemCount={
                            features.filter(
                              (f) => f.plan === planTabKeys[selectedPlanTab],
                            ).length
                          }
                          headings={[
                            { title: "Feature Identifier Key" },
                            { title: "Gating Status" },
                            { title: "Usage/Count Limit" },
                            { title: "Action" },
                          ]}
                          selectable={false}
                        >
                          {features
                            .filter(
                              (f) => f.plan === planTabKeys[selectedPlanTab],
                            )
                            .map((feat, idx) => {
                              return (
                                <FeatureRow
                                  key={feat.id}
                                  feat={feat}
                                  idx={idx}
                                  onSave={handleFeatureUpdate}
                                />
                              );
                            })}
                        </IndexTable>
                      </BlockStack>
                    </Box>
                  </Card>
                </BlockStack>
              )}

              {/* ──────────────────────────────────────────────────────── */}
              {/* SECTION: EMAIL CENTER */}
              {/* ──────────────────────────────────────────────────────── */}
              {activeSection === "emails" && (
                <BlockStack gap="500">
                  <Tabs
                    tabs={[
                      { id: "send", content: "Send Broadcast Email" },
                      { id: "logs", content: "Sent Mail Audit Logs" },
                    ]}
                    selected={emailSubTab}
                    onSelect={setEmailSubTab}
                  />

                  {/* SUBTAB 0: SEND BULK CUSTOM EMAIL */}
                  {emailSubTab === 0 && (
                    <Card>
                      <Box padding="500">
                        <FormLayout>
                          <Grid>
                            <Grid.Cell
                              columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}
                            >
                              <Select
                                label="Target Recipients Group"
                                options={[
                                  {
                                    label: "All Database Stores",
                                    value: "all",
                                  },
                                  {
                                    label: "Active Installations Only",
                                    value: "active",
                                  },
                                  {
                                    label: "Deactivated / Churned Stores Only",
                                    value: "deactivated",
                                  },
                                  {
                                    label: "Target By Active Plan Level",
                                    value: "by_plan",
                                  },
                                ]}
                                value={recipientType}
                                onChange={setRecipientType}
                              />
                            </Grid.Cell>
                            {recipientType === "by_plan" && (
                              <Grid.Cell
                                columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}
                              >                  <Select
                    label="Target Plan Level"
                    options={[
                      { label: "Free tier", value: "free" },
                      {
                        label: "Blogger Starter",
                        value: "starter",
                      },
                      { label: "Blogger Pro", value: "pro" },
                      {
                        label: "Blogger Business",
                        value: "business",
                      },
                    ]}
                    value={recipientPlanId}
                    onChange={setRecipientPlanId}
                  />
                </Grid.Cell>
              )}
              {bulkEmailValidation && (
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                  <Banner tone="warning" onDismiss={() => setBulkEmailValidation("")}>
                    <p>{bulkEmailValidation}</p>
                  </Banner>
                </Grid.Cell>
              )}
              <Grid.Cell
                              columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}
                            >
                              <Select
                                label="Load Email Preset Template"
                                options={[
                                  {
                                    label: "Custom Message (Empty Template)",
                                    value: "",
                                  },
                                  {
                                    label: "Welcome New Shop Presets",
                                    value: "welcome",
                                  },
                                  {
                                    label: "Deactivation Supervisor Warning",
                                    value: "deactivation_notice",
                                  },
                                  {
                                    label: "Pro Gating / Plan Upgrade Promo",
                                    value: "plan_upgrade_prompt",
                                  },
                                  {
                                    label: "Billing Payment Failed Notice",
                                    value: "payment_failed",
                                  },
                                  {
                                    label: "Monthly Blogger Newsletter",
                                    value: "monthly_newsletter",
                                  },
                                ]}
                                value={selectedTemplateKey}
                                onChange={handleLoadTemplate}
                              />
                            </Grid.Cell>
                          </Grid>

                          <TextField
                            label="Email Subject Line"
                            value={emailSubject}
                            onChange={setEmailSubject}
                            autoComplete="off"
                            placeholder="e.g. Action Required: Your subscription status"
                          />

                          <TextField
                            label="Email Message Content"
                            value={emailBody}
                            onChange={setEmailBody}
                            multiline={8}
                            autoComplete="off"
                            helpText="Personalization variables supported: {shop_name} (the domain domain name), {domain} (identical to domain name), {app_name} (Blogger)."
                          />

                          <InlineStack align="end">
                            <Button
                              variant="primary"
                              icon={SendIcon}
                              onClick={handleSendBulkEmail}
                            >
                              Dispatch Broadcast Message
                            </Button>
                          </InlineStack>
                        </FormLayout>
                      </Box>
                    </Card>
                  )}

                  {/* SUBTAB 1: AUDIT MAILING LOGS */}
                  {emailSubTab === 1 && (
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="400">
                          <IndexTable
                            resourceName={{
                              singular: "email",
                              plural: "emails",
                            }}
                            itemCount={emails.length}
                            headings={[
                              { title: "Recipient Email" },
                              { title: "Store Domain" },
                              { title: "Subject Line" },
                              { title: "Template Key" },
                              { title: "Delivery Status" },
                              { title: "Sent At" },
                            ]}
                            selectable={false}
                          >
                            {emails.map((e, index) => (
                              <IndexTable.Row
                                id={String(e.id)}
                                key={e.id}
                                position={index}
                              >
                                <IndexTable.Cell>
                                  <Text variant="bodyMd" fontWeight="bold">
                                    {e.recipientEmail}
                                  </Text>
                                </IndexTable.Cell>
                                <IndexTable.Cell>
                                  {e.recipientDomain || "System/Internal"}
                                </IndexTable.Cell>
                                <IndexTable.Cell>{e.subject}</IndexTable.Cell>
                                <IndexTable.Cell>{e.template}</IndexTable.Cell>
                                <IndexTable.Cell>
                                  <Badge
                                    tone={
                                      e.status === "sent"
                                        ? "success"
                                        : "critical"
                                    }
                                  >
                                    {e.status}
                                  </Badge>
                                </IndexTable.Cell>
                                <IndexTable.Cell>
                                  {new Date(e.createdAt).toLocaleString()}
                                </IndexTable.Cell>
                              </IndexTable.Row>
                            ))}
                          </IndexTable>

                          {/* Pagination */}
                          {emailsTotal > 20 && (
                            <InlineStack align="center" gap="400">
                              <Button
                                disabled={emailsPage === 1}
                                onClick={() =>
                                  setEmailsPage((p) => Math.max(p - 1, 1))
                                }
                              >
                                Prev
                              </Button>
                              <Text variant="bodyMd">
                                Page {emailsPage} of{" "}
                                {Math.ceil(emailsTotal / 20)}
                              </Text>
                              <Button
                                disabled={emailsPage * 20 >= emailsTotal}
                                onClick={() => setEmailsPage((p) => p + 1)}
                              >
                                Next
                              </Button>
                            </InlineStack>
                          )}
                        </BlockStack>
                      </Box>
                    </Card>
                  )}
                </BlockStack>
              )}

              {/* ──────────────────────────────────────────────────────── */}
              {/* SECTION: AUDIT LOGS */}
              {/* ──────────────────────────────────────────────────────── */}
              {activeSection === "activities" && (
                <Card>
                  <Box padding="400">
                    <BlockStack gap="400">
                      <IndexTable
                        resourceName={{ singular: "log", plural: "logs" }}
                        itemCount={activities.length}
                        headings={[
                          { title: "Supervisor Action Date & Time" },
                          { title: "Activity Detail / Change Description" },
                          { title: "Modified Object" },
                          { title: "Target Ref ID" },
                        ]}
                        selectable={false}
                      >
                        {activities.map((a, index) => (
                          <IndexTable.Row
                            id={String(a.id)}
                            key={a.id}
                            position={index}
                          >
                            <IndexTable.Cell>
                              {new Date(a.createdAt).toLocaleString()}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Text variant="bodyMd" fontWeight="bold">
                                {a.action}
                              </Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              {a.targetType || "setting"}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              {a.targetId || "N/A"}
                            </IndexTable.Cell>
                          </IndexTable.Row>
                        ))}
                      </IndexTable>

                      {/* Pagination */}
                      {activitiesTotal > 20 && (
                        <InlineStack align="center" gap="400">
                          <Button
                            disabled={activitiesPage === 1}
                            onClick={() =>
                              setActivitiesPage((p) => Math.max(p - 1, 1))
                            }
                          >
                            Prev
                          </Button>
                          <Text variant="bodyMd">
                            Page {activitiesPage} of{" "}
                            {Math.ceil(activitiesTotal / 20)}
                          </Text>
                          <Button
                            disabled={activitiesPage * 20 >= activitiesTotal}
                            onClick={() => setActivitiesPage((p) => p + 1)}
                          >
                            Next
                          </Button>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Box>
                </Card>
              )}

              {/* ──────────────────────────────────────────────────────── */}
              {/* SECTION: LIVE CHATS */}
              {/* ──────────────────────────────────────────────────────── */}
              {activeSection === "chats" && (
                <Grid>
                  {/* Active Rooms List */}
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 4, lg: 4 }}>
                    <Card>
                      <Box padding="400">
                        <BlockStack gap="300">
                          <Text variant="headingMd">Conversations</Text>
                          <Divider />
                          {Object.keys(chatHistory).length === 0 ? (
                            <Box padding="400" align="center">
                              <Text variant="bodyMd" tone="subdued">
                                No active chat sessions
                              </Text>
                            </Box>
                          ) : (
                            <BlockStack gap="150">
                              {Object.keys(chatHistory).map((room) => {
                                const msgs = chatHistory[room] || [];
                                const lastMsg = msgs[msgs.length - 1];
                                const isSelected = selectedChatRoom === room;
                                return (
                                  <div
                                    key={room}
                                    onClick={() => setSelectedChatRoom(room)}
                                    style={{
                                      padding: "12px",
                                      borderRadius: "8px",
                                      border: "1px solid",
                                      borderColor: isSelected
                                        ? "#008060"
                                        : "#e1e3e5",
                                      backgroundColor: isSelected
                                        ? "#e2f1eb"
                                        : "#ffffff",
                                      cursor: "pointer",
                                      transition: "all 0.15s ease-in-out",
                                    }}
                                  >
                                    <BlockStack gap="100">
                                      <InlineStack align="space-between">
                                        <Text
                                          variant="bodySm"
                                          fontWeight="bold"
                                          tone={isSelected ? "success" : "base"}
                                        >
                                          {room.replace("shop_", "")}
                                        </Text>
                                        {msgs.length > 0 && (
                                          <Badge size="small" tone="info">
                                            {msgs.length} msg
                                          </Badge>
                                        )}
                                      </InlineStack>
                                      {lastMsg && (
                                        <Text
                                          variant="bodyXs"
                                          tone="subdued"
                                          truncate
                                        >
                                          {lastMsg.senderName || lastMsg.sender}
                                          : {lastMsg.text || lastMsg.message}
                                        </Text>
                                      )}
                                    </BlockStack>
                                  </div>
                                );
                              })}
                            </BlockStack>
                          )}
                        </BlockStack>
                      </Box>
                    </Card>
                  </Grid.Cell>

                  {/* Active Chat Conversation View */}
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 8, lg: 8 }}>
                    <Card>
                      <Box padding="400">
                        {selectedChatRoom ? (
                          <BlockStack gap="400">
                            <InlineStack align="space-between">
                              <Text variant="headingMd">
                                Room: {selectedChatRoom.replace("shop_", "")}
                              </Text>
                              <Button
                                size="slim"
                                icon={RefreshIcon}
                                onClick={loadChats}
                              >
                                Refresh
                              </Button>
                            </InlineStack>
                            <Divider />

                            {/* Messages area */}
                            <div
                              style={{
                                height: "350px",
                                overflowY: "auto",
                                padding: "16px",
                                background: "#f9fafb",
                                borderRadius: "8px",
                                border: "1px solid #e1e3e5",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              {(chatHistory[selectedChatRoom] || []).length ===
                              0 ? (
                                <Box padding="800" align="center">
                                  <Text variant="bodyMd" tone="subdued">
                                    No messages in this room yet.
                                  </Text>
                                </Box>
                              ) : (
                                (chatHistory[selectedChatRoom] || []).map(
                                  (msg, i) => {
                                    const isSupport = msg.sender === "Support";
                                    return (
                                      <div
                                        key={i}
                                        style={{
                                          display: "flex",
                                          justifyContent: isSupport
                                            ? "flex-end"
                                            : "flex-start",
                                          marginBottom: "4px",
                                        }}
                                      >
                                        <div
                                          style={{
                                            maxWidth: "75%",
                                            padding: "8px 12px",
                                            borderRadius: isSupport
                                              ? "12px 12px 2px 12px"
                                              : "12px 12px 12px 2px",
                                            backgroundColor: isSupport
                                              ? "#008060"
                                              : "#ffffff",
                                            color: isSupport
                                              ? "#ffffff"
                                              : "#202223",
                                            border: isSupport
                                              ? "none"
                                              : "1px solid #e1e3e5",
                                            boxShadow:
                                              "0 1px 2px rgba(0,0,0,0.05)",
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontSize: "10px",
                                              fontWeight: "bold",
                                              color: isSupport
                                                ? "rgba(255,255,255,0.85)"
                                                : "#6d7175",
                                              marginBottom: "2px",
                                            }}
                                          >
                                            {msg.senderName || msg.sender}
                                          </div>
                                          <Text variant="bodyMd">
                                            {msg.text || msg.message}
                                          </Text>
                                          {msg.timestamp && (
                                            <div
                                              style={{
                                                fontSize: "9px",
                                                opacity: 0.6,
                                                marginTop: "4px",
                                                textAlign: "right",
                                              }}
                                            >
                                              {new Date(
                                                msg.timestamp,
                                              ).toLocaleTimeString()}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  },
                                )
                              )}
                            </div>

                            {/* Reply Input Form */}
                            <FormLayout>
                              <InlineStack gap="300" blockAlign="end">
                                <div style={{ flexGrow: 1 }}>
                                  <TextField
                                    label="Reply message"
                                    value={replyText}
                                    onChange={setReplyText}
                                    placeholder="Type your support reply here..."
                                    autoComplete="off"
                                    disabled={isSendingReply}
                                  />
                                </div>
                                <Button
                                  variant="primary"
                                  loading={isSendingReply}
                                  onClick={handleReplySubmit}
                                >
                                  Send Reply
                                </Button>
                              </InlineStack>
                            </FormLayout>
                          </BlockStack>
                        ) : (
                          <Box padding="800" align="center">
                            <Text variant="headingMd" tone="subdued">
                              Select a conversation from the sidebar to start
                              chatting
                            </Text>
                          </Box>
                        )}
                      </Box>
                    </Card>
                  </Grid.Cell>
                </Grid>
              )}
            </BlockStack>
          </main>
        </div>

        {/* ─── MODAL: OVERRIDE PLAN ─── */}
        <Modal
          open={overrideModalActive}
          onClose={() => setOverrideModalActive(false)}
          title={`Override Plan Gating for ${selectedStoreDomain}`}
          primaryAction={{
            content: "Save Override Configuration",
            onAction: handleOverrideSubmit,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setOverrideModalActive(false),
            },
          ]}
        >
          <Modal.Section>
          <FormLayout>
            {singleEmailValidation && (
              <Banner tone="warning" onDismiss={() => setSingleEmailValidation("")}>
                <p>{singleEmailValidation}</p>
              </Banner>
            )}
            <Select
                label="Target Custom Gating Plan Level"
                options={[
                  { label: "Blogger Starter", value: "Blogger Starter" },
                  { label: "Blogger Pro", value: "Blogger Pro" },
                  { label: "Blogger Business", value: "Blogger Business" },
                  { label: "Free tier", value: "free" },
                ]}
                value={overridePlan}
                onChange={setOverridePlan}
              />
              <TextField
                label="Bypass Expiry Date (YYYY-MM-DD)"
                value={overrideExpiry}
                onChange={setOverrideExpiry}
                placeholder="e.g. 2026-12-31"
                autoComplete="off"
                helpText="Leave completely blank for permanent indefinite overrides."
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* ─── MODAL: STORE DETAIL AUDITOR ─── */}
        <Modal
          open={detailModalActive}
          onClose={() => {
            setDetailModalActive(false);
            setStoreDetail(null);
          }}
          title={`Auditing Domain details: ${storeDetail?.domain || ""}`}
          primaryAction={{
            content: "Close details",
            onAction: () => {
              setDetailModalActive(false);
              setStoreDetail(null);
            },
          }}
        >
          <Modal.Section>
            {storeDetail && (
              <BlockStack gap="400">
                <Grid>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                    <Card>
                      <Box padding="300">
                        <Text variant="headingSm" tone="subdued">
                          DB Primary ID
                        </Text>
                        <Text variant="headingMd">{storeDetail.id}</Text>
                      </Box>
                    </Card>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                    <Card>
                      <Box padding="300">
                        <Text variant="headingSm" tone="subdued">
                          Active Tier
                        </Text>
                        <Text variant="headingMd">{storeDetail.planKey}</Text>
                      </Box>
                    </Card>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                    <Card>
                      <Box padding="300">
                        <Text variant="headingSm" tone="subdued">
                          Owner Email
                        </Text>
                        <Text variant="headingMd">{storeDetail.email}</Text>
                      </Box>
                    </Card>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                    <Card>
                      <Box padding="300">
                        <Text variant="headingSm" tone="subdued">
                          Onboard Date
                        </Text>
                        <Text variant="headingMd">
                          {new Date(
                            storeDetail.installedAt,
                          ).toLocaleDateString()}
                        </Text>
                      </Box>
                    </Card>
                  </Grid.Cell>
                </Grid>

                <Grid>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
                    <Card>
                      <Box padding="300">
                        <Text variant="bodyMd" fontWeight="bold">
                          Published Content Metrics
                        </Text>
                        <Box paddingBlockStart="200">
                          <BlockStack gap="150">
                            <InlineStack align="space-between">
                              <Text>Total Posts Count:</Text>
                              <Text fontWeight="bold">
                                {storeDetail.postsCount}
                              </Text>
                            </InlineStack>
                            <InlineStack align="space-between">
                              <Text>Total Categories Count:</Text>
                              <Text fontWeight="bold">
                                {storeDetail.categoriesCount}
                              </Text>
                            </InlineStack>
                            <InlineStack align="space-between">
                              <Text>Total Tag references:</Text>
                              <Text fontWeight="bold">
                                {storeDetail.tagsCount}
                              </Text>
                            </InlineStack>
                          </BlockStack>
                        </Box>
                      </Box>
                    </Card>
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 8, md: 8, lg: 8 }}>
                    <Card>
                      <Box padding="300">
                        <Text variant="bodyMd" fontWeight="bold">
                          Recent Specific Audit Log
                        </Text>
                        <Box paddingBlockStart="200">
                          {storeLogs.length === 0 ? (
                            <Text tone="subdued">
                              No supervisor logs recorded for this store.
                            </Text>
                          ) : (
                            storeLogs.map((log) => (
                              <div
                                key={log.id}
                                style={{
                                  borderBottom: "1px solid #e1e3e5",
                                  paddingBottom: "6px",
                                  marginBottom: "6px",
                                }}
                              >
                                <Text variant="bodySm" tone="subdued">
                                  {new Date(log.createdAt).toLocaleString()}
                                </Text>
                                <Text>{log.action}</Text>
                              </div>
                            ))
                          )}
                        </Box>
                      </Box>
                    </Card>
                  </Grid.Cell>
                </Grid>
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>

        {/* ─── MODAL: SINGLE EMAIL COMPOSER ─── */}
        <Modal
          open={singleEmailModalActive}
          onClose={() => setSingleEmailModalActive(false)}
          title={`Compose supervisor email to ${selectedStoreDomain}`}
          primaryAction={{
            content: "Send Email",
            onAction: handleSendSingleEmail,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setSingleEmailModalActive(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Subject Line"
                value={singleEmailSubject}
                onChange={setSingleEmailSubject}
                autoComplete="off"
                placeholder="e.g. Feedback regarding your Blogger posts layout"
              />
              <TextField
                label="Message Content Body"
                value={singleEmailBody}
                onChange={setSingleEmailBody}
                multiline={6}
                autoComplete="off"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Dynamic Plan Modal */}
        {showPlanModal && editingPlan && (
          <Modal
            open={showPlanModal}
            onClose={() => setShowPlanModal(false)}
            title={editingPlan.id ? "Edit Subscription Plan" : "Create Subscription Plan"}
            primaryAction={{
              content: "Save Plan",
              onAction: handleSavePlan,
            }}
            secondaryActions={[
              {
                content: "Cancel",
                onAction: () => setShowPlanModal(false),
              },
            ]}
          >
            <Modal.Section>
              <FormLayout>
                <FormLayout.Group>
                  <TextField label="GraphQL Identifier (name)" value={editingPlan.name} onChange={(v) => setEditingPlan({ ...editingPlan, name: v })} autoComplete="off" helpText="e.g. 'Blogger Starter' (must match Shopify's internal name if migrating)" />
                  <TextField label="Display Title" value={editingPlan.title} onChange={(v) => setEditingPlan({ ...editingPlan, title: v })} autoComplete="off" helpText="e.g. 'Starter'" />
                </FormLayout.Group>
                <FormLayout.Group>
                  <TextField label="Price" value={String(editingPlan.price)} onChange={(v) => setEditingPlan({ ...editingPlan, price: v })} type="number" autoComplete="off" />
                  <TextField label="Currency" value={editingPlan.currency} onChange={(v) => setEditingPlan({ ...editingPlan, currency: v })} autoComplete="off" />
                </FormLayout.Group>
                <FormLayout.Group>
                  <TextField label="Billing Interval" value={editingPlan.interval} onChange={(v) => setEditingPlan({ ...editingPlan, interval: v })} autoComplete="off" helpText="EVERY_30_DAYS or ANNUAL" />
                  <TextField label="Sort Order" value={String(editingPlan.sortOrder)} onChange={(v) => setEditingPlan({ ...editingPlan, sortOrder: parseInt(v) || 0 })} type="number" autoComplete="off" />
                </FormLayout.Group>
                <TextField label="Description" value={editingPlan.description || ""} onChange={(v) => setEditingPlan({ ...editingPlan, description: v })} multiline={2} autoComplete="off" />
                <TextField label="Features (one per line)" value={editingPlan.features} onChange={(v) => setEditingPlan({ ...editingPlan, features: v })} multiline={4} autoComplete="off" />
                <Checkbox label="Is Active?" checked={editingPlan.isActive} onChange={(v) => setEditingPlan({ ...editingPlan, isActive: v })} />
              </FormLayout>
            </Modal.Section>
          </Modal>
        )}

        {/* Toast success notifier */}
        {toastMarkup}

        {/* ─── CONFIRM ACTION MODAL (replaces native confirm()) ─── */}
        {confirmAction && (
          <ConfirmActionModal
            open={!!confirmAction}
            title={confirmAction.title}
            body={confirmAction.body}
            confirmText={confirmAction.confirmText || "Confirm"}
            confirmTone={confirmAction.confirmTone || "primary"}
            loading={confirmLoading}
            onConfirm={handleConfirmAction}
            onClose={closeConfirmAction}
          />
        )}
      </div>
    </Frame>
  );
}

// Subcomponent: Inline Row Editing helper for features auditor
function FeatureRow({ feat, idx, onSave }) {
  const [enabled, setEnabled] = useState(feat.enabled);
  const [limit, setLimit] = useState(
    feat.limit === null ? "" : String(feat.limit),
  );
  const [isDirty, setIsDirty] = useState(false);

  const handleSave = () => {
    const finalLimit = limit.trim() === "" ? null : parseInt(limit, 10);
    onSave(feat.id, enabled, finalLimit);
    setIsDirty(false);
  };

  return (
    <IndexTable.Row id={String(feat.id)} position={idx}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold">
          {feat.featureKey}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Checkbox
          label="Component Enabled"
          checked={enabled}
          onChange={(val) => {
            setEnabled(val);
            setIsDirty(true);
          }}
        />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <TextField
          label="Usage Limit"
          labelHidden
          placeholder="Unlimited (null)"
          value={limit}
          onChange={(val) => {
            setLimit(val);
            setIsDirty(true);
          }}
          autoComplete="off"
          type="number"
        />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Button
          disabled={!isDirty}
          onClick={handleSave}
          variant={isDirty ? "primary" : "default"}
          size="slim"
        >
          Save
        </Button>
      </IndexTable.Cell>
    </IndexTable.Row>
  );
}
