import { Fragment, useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Stack } from "expo-router";
import { Button, ListGroup, Separator, Typography } from "heroui-native";
import { EmptyState } from "heroui-native-pro";
import { unhideItems } from "@/core/server/budget";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { PickerCheckbox } from "@/ui/picker/PickerRow";
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

/**
 * One group's worth of hidden things, laid out like every other grouped list in
 * the app: the group name is a header *outside* the card (`EditPlanGroup`'s
 * shape), and the card holds the category rows.
 *
 * The header carries the group's own checkbox, and only when the group is hidden
 * — for a visible group there is nothing about the group to undo, and the name is
 * there to say where its categories would come back to.
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
    <View>
      {/* Same header as every other grouped list — see EditPlanGroup. Kept as
          one plain View in both cases so the type can't drift between a group
          that offers a checkbox and one that doesn't. */}
      <View className="flex-row items-center gap-3 px-1 pb-1 pt-4 mb-1">
        {section.isGroupHidden ? (
          // On a header there is no row to tap, so the box is its own control
          // (the onPress makes it interactive). Transparent because it sits on
          // the page background, where the default fill reads as a floating
          // white square — and with a ring of its own, because the field-width
          // hairline in the field-border tone is tuned for cards and vanishes
          // against the canvas.
          <PickerCheckbox
            isSelected={selection.groups.has(section.groupId)}
            onPress={onToggleGroup}
            className="ml-3 bg-transparent border border-muted"
          />
        ) : null}
        <Typography className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
          {section.groupName}
        </Typography>
      </View>

      {section.categories.length > 0 ? (
        <ListGroup className="overflow-hidden rounded-2xl">
          {section.categories.map((cat, i) => (
            <Fragment key={cat.id}>
              {i > 0 ? <Separator className="mx-4" /> : null}
              <ListGroup.Item onPress={() => onToggleCategory(cat.id)}>
                <ListGroup.ItemPrefix>
                  {/* The whole row is the tap target; the box is visual only. */}
                  <PickerCheckbox isSelected={selection.categories.has(cat.id)} />
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{cat.name}</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
              </ListGroup.Item>
            </Fragment>
          ))}
        </ListGroup>
      ) : null}
    </View>
  );
}

/**
 * Everything hidden, and the way back. Reached from the "N hidden categories"
 * row on the budget table and in the plan editor.
 *
 * ## Divergence from upstream
 *
 * This screen has no counterpart. Upstream keeps hidden things reachable in
 * place: a `budget.showHiddenCategories` pref, toggled from the budget page menu,
 * makes hidden groups and categories reappear inline at 50% opacity, and each
 * row's own menu flips its own flag. Nothing ever becomes unreachable, so there
 * is nothing to go looking for.
 *
 * This port never implemented that. The pref is still declared at
 * `core/types/prefs.ts` and **nobody reads it**; what shipped instead was a
 * synthetic `__hidden__` bucket that dropped hidden *groups* on the floor, which
 * made hiding a group a one-way door — its details sheet unreachable, and no code
 * path anywhere that set a group's `hidden` back to `0`. This screen replaces
 * that mechanism rather than complementing it.
 *
 * That leaves a loose end worth naming: a **synced** pref that does nothing is a
 * trap for whoever reads it next. Either implement it or delete it.
 *
 * Selection is multi-shot on purpose — hiding tends to happen in sweeps, so
 * un-hiding should too. What a tick actually means is {@link unhideItems}' call.
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
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: t("hiddenCategories") }} />

      <ScrollView
        // The native bar is translucent and the list floats under it; this is
        // what supplies the top inset (same as NativePickerScreen).
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        // Bottom padding clears the FAB, so the last row is never stuck under
        // it; flexGrow lets the empty state centre itself in the viewport.
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 120,
        }}
      >
        {body}
      </ScrollView>

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
    </View>
  );
}
