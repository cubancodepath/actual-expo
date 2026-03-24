import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "./Text";
import { TagPill } from "./TagPill";
import { parseNotes } from "@core/tags";
import type { Tag } from "@core/tags/types";

export interface NotesWithTagsProps {
  notes: string;
  tags?: Tag[];
}

export function NotesWithTags({ notes, tags = [] }: NotesWithTagsProps) {
  const { colors, spacing } = useTheme();
  const segments = parseNotes(notes);

  // No tags found — render plain text like before
  if (segments.length === 1 && segments[0].type === "text") {
    return (
      <Text
        variant="caption"
        color={colors.textMuted}
        numberOfLines={1}
        style={{ fontStyle: "italic", marginTop: spacing.xxs }}
      >
        {notes}
      </Text>
    );
  }

  // Build a tag color lookup
  const tagColorMap = new Map(tags.map((t) => [t.tag, t.color]));

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        marginTop: spacing.xxs,
        gap: 2,
      }}
    >
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <Text
            key={i}
            variant="caption"
            color={colors.textMuted}
            numberOfLines={1}
            style={{ fontStyle: "italic" }}
          >
            {seg.content}
          </Text>
        ) : (
          <TagPill key={i} tagName={seg.tagName} color={tagColorMap.get(seg.tagName)} />
        ),
      )}
    </View>
  );
}
