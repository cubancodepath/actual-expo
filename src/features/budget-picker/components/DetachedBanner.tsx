import { useTranslation } from "react-i18next";
import { Alert } from "@/ui/molecules";

export function DetachedBanner() {
  const { t } = useTranslation("auth");

  return <Alert variant="warning" title={t("detachedHint")} />;
}
