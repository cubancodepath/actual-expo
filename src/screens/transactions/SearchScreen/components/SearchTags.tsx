import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { TagGroup, useThemeColor } from "heroui-native";
import { Copyright } from "lucide-react-native";
import { iconForTokenKind } from "../tokenIcons";
import { STATUS_LABEL_KEYS, tokenKey, type SearchToken } from "../searchTokens";

interface SearchTagsProps {
  tokens: SearchToken[];
  /** Remove the tokens whose `tokenKey` is in `keys`. */
  onRemove: (keys: Set<string | number>) => void;
}

/**
 * The active filters as removable accent tags in a single horizontally
 * scrollable row below the search bar — the row never wraps, so the header
 * keeps its height no matter how many filters are active. Each tag leads with
 * the icon its filter kind uses across the transaction screens.
 */
export function SearchTags({ tokens, onRemove }: SearchTagsProps) {
  const { t } = useTranslation("transactions");
  const accent = useThemeColor("accent");
  const accentForeground = useThemeColor("accent-foreground");

  if (tokens.length === 0) return null;

  function tokenLabel(token: SearchToken): string {
    switch (token.type) {
      case "text":
        return t("search.tokenText", { text: token.value });
      case "status":
        return t(STATUS_LABEL_KEYS[token.value]);
      case "account":
        return t("search.tokenAccount", { name: token.accountName });
      case "category":
        return t("search.tokenCategory", { name: token.categoryName });
      case "payee":
        return t("search.tokenPayee", { name: token.payeeName });
      case "tag":
        return t("tag", { name: token.tagName });
      case "uncategorized":
        return t("uncategorized");
    }
  }

  function tokenIcon(token: SearchToken) {
    // "Cleared" is a faked filled variant: fill with the foreground, stroke in
    // the tag's accent background — same trick as the row's indicator.
    if (token.type === "status" && token.value === "cleared") {
      return <Copyright size={15} color={accent} fill={accentForeground} />;
    }
    const Icon = iconForTokenKind(token.type, token.type === "status" ? token.value : undefined);
    return <Icon size={14} color={accentForeground} />;
  }

  return (
    <TagGroup size="md" onRemove={onRemove} className="pb-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-3 gap-2"
      >
        <TagGroup.List className="flex-row gap-2">
          {tokens.map((token) => (
            <TagGroup.Item
              key={tokenKey(token)}
              id={tokenKey(token)}
              className="bg-accent border-accent gap-1.5"
            >
              {tokenIcon(token)}
              <TagGroup.ItemLabel numberOfLines={1} className="text-accent-foreground">
                {tokenLabel(token)}
              </TagGroup.ItemLabel>
              <TagGroup.ItemRemoveButton iconProps={{ color: accentForeground }} />
            </TagGroup.Item>
          ))}
        </TagGroup.List>
      </ScrollView>
    </TagGroup>
  );
}
