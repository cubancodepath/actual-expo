import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableFeedback, Typography, useThemeColor } from "heroui-native";
import { suggestionToToken, type Suggestion } from "../suggestionEngine";
import { iconForTokenKind } from "../tokenIcons";
import { STATUS_LABEL_KEYS, type SearchToken } from "../searchTokens";

interface SearchSuggestionsProps {
  suggestions: Suggestion[];
  onSelect: (token: SearchToken) => void;
}

/**
 * Autocomplete rows shown under the search bar while it's focused. The list is
 * short by construction (see `buildSuggestions`), so it renders flat — no
 * scrolling.
 */
export function SearchSuggestions({ suggestions, onSelect }: SearchSuggestionsProps) {
  const { t: tr } = useTranslation("transactions");
  const muted = useThemeColor("muted");
  const background = useThemeColor("background");

  if (suggestions.length === 0) return null;

  function labelFor(s: Suggestion): string {
    switch (s.kind) {
      case "text":
        return tr("search.anythingContains", { text: s.value });
      case "status":
        return tr(STATUS_LABEL_KEYS[s.value]);
      case "account":
        return tr("accountIs", { name: s.name });
      case "category":
        return tr("categoryIs", { name: s.name });
      case "payee":
        return tr("payeeIs", { name: s.name });
      case "tag":
        return tr("tag", { name: s.name });
      case "uncategorized":
        return tr("uncategorized");
    }
  }

  return (
    <View>
      {suggestions.map((s, i) => {
        const Icon = iconForTokenKind(s.kind, s.kind === "status" ? s.value : undefined);
        // "Cleared" gets the faked filled variant, like the row's indicator.
        const isFilled = s.kind === "status" && s.value === "cleared";
        return (
          <PressableFeedback key={`${s.kind}-${i}`} onPress={() => onSelect(suggestionToToken(s))}>
            <View className="flex-row items-center gap-3 px-5 py-3">
              {isFilled ? (
                <Icon size={18} color={background} fill={muted} />
              ) : (
                <Icon size={18} color={muted} />
              )}
              <Typography className="text-base text-foreground" numberOfLines={1}>
                {labelFor(s)}
              </Typography>
            </View>
          </PressableFeedback>
        );
      })}
    </View>
  );
}
