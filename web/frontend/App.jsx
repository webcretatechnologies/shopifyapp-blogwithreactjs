import { BrowserRouter } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NavMenu } from "@shopify/app-bridge-react";
import Routes from "./Routes";
import { QueryProvider, PolarisProvider } from "./components";

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
              <a href="/posts">Articles</a>
              <a href="/posts/new">New Article</a>
              <a href="/posts/wizard">Wizard</a>
              <a href="/posts/import">Import</a>
              <a href="/plans">Plans & Billing</a>
              <a href="/settings">Settings</a>
              <a href="/support">Support</a>
            </NavMenu>
          )}
          <Routes pages={pages} />
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
