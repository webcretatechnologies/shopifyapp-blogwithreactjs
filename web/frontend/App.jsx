import { BrowserRouter } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NavMenu } from "@shopify/app-bridge-react";
import Routes from "./Routes";
import { QueryProvider, PolarisProvider } from "./components";
import ChatBubble from "./components/chat/ChatBubble";

export default function App() {
  const pages = import.meta.glob("./pages/**/!(*.test.[jt]sx)*.([jt]sx)", {
    eager: true,
  });
  const { t } = useTranslation();

  const isAdminPath = window.location.pathname.startsWith("/admin");

  return (
    <PolarisProvider>
      <BrowserRouter>
        <QueryProvider>
          {!isAdminPath && (
            <NavMenu>
              <a href="/" rel="home" />
              <a href="/posts">Dashboard</a>
              <a href="/posts/new">New Article</a>
              <a href="/analytics">Analytics</a>
              <a href="/sync">Sync Status</a>
              <a href="/posts/import">Import</a>
              <a href="/posts/wizard">Wizard</a>
              <a href="/plans">Plans &amp; Billing</a>
              <a href="/settings">Settings</a>
              <a href="/support">Support</a>
            </NavMenu>
          )}
          <div style={{ paddingBottom: "80px" }}>
            <Routes pages={pages} />
          </div>
          {/* Custom in-app chat bubble (shown on all pages) */}
          {!isAdminPath && <ChatBubble />}
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
