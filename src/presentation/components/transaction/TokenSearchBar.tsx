import { useRef } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import type { SearchToken, StatusFilter } from "../../../transactions/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<StatusFilter, string> = {
  cleared: "Cleared",
  uncleared: "Uncleared",
  reconciled: "Reconciled",
  unreconciled: "Unreconciled",
};

function tokenLabel(t: SearchToken): string {
  switch (t.type) {
    case "status":
      return STATUS_LABELS[t.value];
    case "account":
      return `Account: ${t.accountName}`;
    case "category":
      return `Category: ${t.categoryName}`;
    case "payee":
      return `Payee: ${t.payeeName}`;
    case "tag":
      return `Tag: #${t.tagName}`;
    case "uncategorized":
      return "Uncategorized";
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TokenSearchBarProps {
  text: string;
  onChangeText: (text: string) => void;
  tokens: SearchToken[];
  onRemoveToken: (index: number) => void;
  onClear: () => void;
  onFocusChange: (focused: boolean) => void;
  onSubmit: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  noHorizontalMargin?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TokenSearchBar({
  text,
  onChangeText,
  tokens,
  onRemoveToken,
  onClear,
  onFocusChange,
  onSubmit,
  inputRef: externalRef,
  noHorizontalMargin,
}: TokenSearchBarProps) {
  const { colors, spacing, borderRadius: br } = useTheme();
  const internalRef = useRef<TextInput>(null);
  const ref = externalRef ?? internalRef;

  const hasContent = text.length > 0 || tokens.length > 0;

  function handleKeyPress(e: { nativeEvent: { key: string } }) {
    if (e.nativeEvent.key === "Backspace" && text === "" && tokens.length > 0) {
      onRemoveToken(tokens.length - 1);
    }
  }

  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.inputBackground,
        borderRadius: br.full,
        marginHorizontal: noHorizontalMargin ? 0 : spacing.md,
        marginVertical: spacing.sm,
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
        paddingVertical: spacing.sm,
        minHeight: 44,
        gap: spacing.xs,
      }}
    >
      <Ionicons name="search" size={16} color={colors.textMuted} />

      {tokens.map((t, i) => (
        <Pressable
          key={`${t.type}-${i}`}
          onPress={() => onRemoveToken(i)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexShrink: 1,
            backgroundColor: colors.primary,
            borderRadius: br.full,
            paddingLeft: spacing.sm,
            paddingRight: spacing.xs,
            paddingVertical: spacing.xxs,
            gap: 2,
          }}
        >
          <Text
            variant="captionSm"
            color="#fff"
            style={{ fontWeight: "600", flexShrink: 1 }}
            numberOfLines={1}
          >
            {tokenLabel(t)}
          </Text>
          <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.7)" />
        </Pressable>
      ))}

      <TextInput
        ref={ref}
        value={text}
        onChangeText={onChangeText}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        onKeyPress={handleKeyPress}
        onSubmitEditing={onSubmit}
        placeholder={tokens.length > 0 ? "" : "Search transactions"}
        placeholderTextColor={colors.textMuted}
        style={{
          flex: 1,
          minWidth: 40,
          fontSize: 15,
          color: colors.textPrimary,
          paddingVertical: 4,
        }}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      {hasContent && (
        <Pressable
          onPress={onClear}
          hitSlop={8}
          style={{
            padding: spacing.xs,
          }}
        >
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}
