import { BrowserRouter } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NavMenu } from "@shopify/app-bridge-react";
import Routes from "./Routes";
import { QueryProvider, PolarisProvider } from "./components";
import { Box } from "@shopify/polaris";

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
              <a href="/dashboard" rel="home" />
              <a href="/posts">{t("Navigation.managePosts")}</a>
              <a href="/posts/import">Import</a>
              <a href="/templates">Blog Templates</a>
              <a href="/sync">Sync Status</a>
              <a href="/comments">Comments</a>
              <a href="/analytics">Analytics</a>
              <a href="/plans">{t("Navigation.pricingPlans")}</a>
              <a href="/settings">{t("Navigation.settings")}</a>
            </NavMenu>
          )}
          {isAdminPath ? (
            <Routes pages={pages} />
          ) : (
            <Box paddingBlockEnd="1600">
              <Routes pages={pages} />
            </Box>
          )}
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
