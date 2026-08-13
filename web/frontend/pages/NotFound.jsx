import { Card, EmptyState, Page } from "@shopify/polaris";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { notFoundImage } from "../assets";

export default function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Page backAction={{ content: "Dashboard", onAction: () => navigate("/dashboard") }}>
      <Card>
        <EmptyState heading={t("NotFound.heading")} image={notFoundImage}>
          <p>{t("NotFound.description")}</p>
        </EmptyState>
      </Card>
    </Page>
  );
}
