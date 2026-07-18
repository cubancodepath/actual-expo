import { useTranslation } from "react-i18next";
import { useThemeColor } from "heroui-native";
import { EmptyState } from "heroui-native-pro";
import { Search } from "lucide-react-native";

/** Empty state once a search ran and matched nothing. */
export function NoSearchResults() {
  const { t } = useTranslation("transactions");
  const muted = useThemeColor("muted");
  return (
    <EmptyState className="py-16">
      <EmptyState.Header>
        <EmptyState.Media variant="icon">
          <Search size={20} color={muted} />
        </EmptyState.Media>
        <EmptyState.Title>{t("search.noResultsTitle")}</EmptyState.Title>
        <EmptyState.Description>{t("search.noResultsDescription")}</EmptyState.Description>
      </EmptyState.Header>
    </EmptyState>
  );
}
