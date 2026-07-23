import { useState } from "react";
import { View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { BottomSheet, Button, Chip, Input, useThemeColor } from "heroui-native";
import { Plus, Tags as TagsIcon } from "lucide-react-native";
import { extractTagsFromNotes } from "@/core/shared/tags";
import type { Tag } from "@/core/types/models";
import { FieldRow } from "@/ui/money-entry/FieldRow";

type TagsFieldProps = {
  notes: string;
  tags: Tag[];
  onChangeNotes: (notes: string) => void;
};

/** Tags picker row + bottom sheet. Tags are persisted inside `notes` as `#tag`. */
export function TagsField({ notes, tags, onChangeNotes }: TagsFieldProps) {
  const { t } = useTranslation("transactions");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const accent = useThemeColor("accent");

  const current = extractTagsFromNotes(notes);
  const rowValue = current.length ? current.map((x) => `#${x}`).join(" ") : "";
  const all = Array.from(
    new Set([...tags.filter((x) => !x.tombstone).map((x) => x.tag), ...current]),
  );

  const setTags = (next: string[]) => {
    const plain = notes.replace(/\s?(?<!#)#([^#\s]+)/g, "").trim();
    const suffix = next.map((x) => `#${x}`).join(" ");
    onChangeNotes(plain ? `${plain} ${suffix}` : suffix);
  };
  const toggle = (tag: string) => {
    const set = new Set(current);
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    setTags([...set]);
  };
  const addDraft = () => {
    const v = draft.trim().replace(/^#/, "");
    if (!v) return;
    if (!current.includes(v)) setTags([...current, v]);
    setDraft("");
  };

  return (
    <>
      <FieldRow
        icon={TagsIcon}
        label={t("tags")}
        value={rowValue}
        placeholder={t("tags")}
        onPress={() => setOpen(true)}
      />
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            snapPoints={["60%"]}
            enableDynamicSizing={false}
            enableOverDrag={false}
            keyboardBehavior="extend"
            contentContainerClassName="h-full"
          >
            <BottomSheet.Title className="mb-3">{t("tags")}</BottomSheet.Title>
            <View className="mb-3 flex-row items-center gap-2">
              <Input
                value={draft}
                onChangeText={setDraft}
                placeholder={t("addTag")}
                className="flex-1"
                onSubmitEditing={addDraft}
                autoCapitalize="none"
              />
              <Button size="sm" variant="secondary" isIconOnly onPress={addDraft}>
                <Plus size={20} color={accent} />
              </Button>
            </View>
            <BottomSheetScrollView keyboardShouldPersistTaps="handled">
              <View className="flex-row flex-wrap gap-2">
                {all.map((tag) => {
                  const on = current.includes(tag);
                  return (
                    <Chip
                      key={tag}
                      variant={on ? "primary" : "secondary"}
                      color={on ? "accent" : "default"}
                      onPress={() => toggle(tag)}
                    >
                      <Chip.Label>#{tag}</Chip.Label>
                    </Chip>
                  );
                })}
              </View>
            </BottomSheetScrollView>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
