import { Fragment, useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, ListGroup, Separator } from "heroui-native";
import { EmptyState } from "heroui-native-pro";
import { unhideItems } from "@/core/server/budget";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useHiddenItems, type HiddenSection } from "@/screens/budget/hooks/useHiddenItems";

/** Which kind of row a selected id refers to — they take different mutations. */
type Selection = { categories: Set<string>; groups: Set<string> };

const EMPTY: Selection = { categories: new Set(), groups: new Set() };

function count(selection: Selection): number {
  return selection.categories.size + selection.groups.size;
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** A checkbox that doesn't fight the row it sits in for the tap. */
function RowCheckbox({ isSelected }: { isSelected: boolean }) {
  return (
    <View pointerEvents="none">
      <Checkbox isSelected={isSelected}>
        <Checkbox.Indicator />
      </Checkbox>
    </View>
  );
}

/**
 * One group's worth of hidden things: the group as the first row, its categories
 * under it, every row tickable.
 *
 * The group row only gets a checkbox when the group itself is hidden — for a
 * visible group there is nothing about the group to undo, and it's there to say
 * where its categories would come back to.
 *
 * Picking a category out of a hidden group is allowed and means what it looks
 * like: the group reappears holding just that category. `unhideItems` does the
 * pinning that makes it true.
 */
function HiddenGroupSection({
  section,
  selection,
  onToggleGroup,
  onToggleCategory,
}: {
  section: HiddenSection;
  selection: Selection;
  onToggleGroup: () => void;
  onToggleCategory: (id: string) => void;
}) {
  return (
    <View className="mb-3">
      <ListGroup className="overflow-hidden rounded-2xl">
        <ListGroup.Item onPress={section.isGroupHidden ? onToggleGroup : undefined}>
          <ListGroup.ItemPrefix>
            <View className="w-5 items-center justify-center">
              {section.isGroupHidden ? (
                <RowCheckbox isSelected={selection.groups.has(section.groupId)} />
              ) : null}
            </View>
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle className="font-semibold" numberOfLines={1}>
              {section.groupName}
            </ListGroup.ItemTitle>
          </ListGroup.ItemContent>
        </ListGroup.Item>

        {section.categories.map((cat) => (
          <Fragment key={cat.id}>
            <Separator className="mx-4" />
            <ListGroup.Item onPress={() => onToggleCategory(cat.id)}>
              <ListGroup.ItemPrefix>
                <View className="w-5 items-center justify-center">
                  <RowCheckbox isSelected={selection.categories.has(cat.id)} />
                </View>
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>{cat.name}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          </Fragment>
        ))}
      </ListGroup>
    </View>
  );
}

/**
 * Everything hidden, and the way back.
 *
 * Reached from the plan editor's "N hidden categories" row. It exists because
 * hiding used to be a one-way door for *groups*: the budget screens skip a
 * hidden group entirely, so its details sheet was unreachable and nothing in the
 * app ever set a group's `hidden` back to false.
 *
 * Selection is multi-shot on purpose — hiding tends to happen in sweeps, so
 * un-hiding should too.
 */
export function HiddenCategoriesScreen() {
  const { t } = useTranslation("budget");
  const insets = useSafeAreaInsets();
  const { sections, isLoading } = useHiddenItems();
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [saving, setSaving] = useState(false);

  const selected = count(selection);

  const toggleGroup = useCallback((id: string) => {
    setSelection((s) => ({ ...s, groups: toggle(s.groups, id) }));
  }, []);

  const toggleCategory = useCallback((id: string) => {
    setSelection((s) => ({ ...s, categories: toggle(s.categories, id) }));
  }, []);

  const unhide = useCallback(async () => {
    if (selected === 0 || saving) return;
    setSaving(true);
    try {
      // One core call, so the whole sweep is a single undo step and a single
      // spreadsheet recompute — see unhideItems.
      await unhideItems({
        categoryIds: [...selection.categories],
        groupIds: [...selection.groups],
      });
      setSelection(EMPTY);
    } catch (e) {
      emitErrorEvent(e);
    } finally {
      setSaving(false);
    }
  }, [selected, saving, selection]);

  const body = useMemo(() => {
    if (isLoading) return null;
    if (sections.length === 0) {
      return (
        <View className="flex-1 items-center justify-center px-8 py-16">
          <EmptyState>
            <EmptyState.Header>
              <EmptyState.Title>{t("noHiddenCategoriesTitle")}</EmptyState.Title>
              <EmptyState.Description>{t("noHiddenCategoriesMessage")}</EmptyState.Description>
            </EmptyState.Header>
          </EmptyState>
        </View>
      );
    }
    return sections.map((section) => (
      <HiddenGroupSection
        key={section.groupId}
        section={section}
        selection={selection}
        onToggleGroup={() => toggleGroup(section.groupId)}
        onToggleCategory={toggleCategory}
      />
    ));
  }, [isLoading, sections, selection, t, toggleGroup, toggleCategory]);

  return (
    <ScreenHeader.ScrollArea>
      {/* Bottom padding clears the FAB, so the last row is never stuck under it. */}
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}
      >
        {body}
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        {/* ScreenHeader adds no safe-area padding of its own — its other call
            sites sit inside a modal card that already clears the status bar.
            This screen is a plain push, so it pays for its own, the way
            SettingsScreen does. */}
        <View style={{ height: insets.top }} />
        <ScreenHeader>
          <ScreenHeader.Back />
          <ScreenHeader.Title>{t("hiddenCategories")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>

      {/* Labelled FAB, the CoverSourceScreen pattern — only once there's
          something to act on. */}
      {selected > 0 ? (
        <View className="absolute right-5" style={{ bottom: insets.bottom + 24 }}>
          <Button
            isDisabled={saving}
            onPress={() => void unhide()}
            className="h-14 rounded-full px-8 shadow-lg"
          >
            <Button.Label>{t("unhideSelected", { count: selected })}</Button.Label>
          </Button>
        </View>
      ) : null}
    </ScreenHeader.ScrollArea>
  );
}
