import { Card, EmptyState, Page } from "@shopify/polaris";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { notFoundImage } from "../assets";
import { smartBackAction } from "../utils/smartBack";

export default function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Page backAction={smartBackAction(navigate, location, "/dashboard", "Dashboard")}>
      <Card>
        <EmptyState heading={t("NotFound.heading")} image={notFoundImage}>
          <p>{t("NotFound.description")}</p>
        </EmptyState>
      </Card>
    </Page>
  );
}
