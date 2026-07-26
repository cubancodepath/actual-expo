import { Fragment, useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, ListGroup, Separator, Typography } from "heroui-native";
import { EmptyState } from "heroui-native-pro";
import { EyeOff } from "lucide-react-native";
import { useThemeColor } from "heroui-native";
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

/**
 * One group's worth of hidden things.
 *
 * A hidden group gets the checkbox on its own header, and its categories are
 * listed underneath as context without one: their own flag is already `false`,
 * so ticking them would change nothing — `buildBudgetSections` drops the whole
 * group before it looks at them. The exception is a category that is *also*
 * hidden in its own right, which does need its own tick.
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
  const { t } = useTranslation("budget");
  const muted = useThemeColor("muted");

  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-2 px-1 pb-1">
        <Typography className="flex-1 text-xs font-semibold uppercase text-muted" numberOfLines={1}>
          {section.groupName}
        </Typography>
        {section.isGroupHidden ? (
          <EyeOff size={14} color={muted} accessibilityLabel={t("hiddenGroupNote")} />
        ) : null}
      </View>

      {section.isGroupHidden ? (
        <>
          <ListGroup className="mb-1 overflow-hidden rounded-2xl">
            <ListGroup.Item onPress={onToggleGroup}>
              <ListGroup.ItemPrefix>
                <View pointerEvents="none">
                  <Checkbox isSelected={selection.groups.has(section.groupId)}>
                    <Checkbox.Indicator />
                  </Checkbox>
                </View>
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t("showGroup")}</ListGroup.ItemTitle>
                <ListGroup.ItemDescription>{t("hiddenGroupNote")}</ListGroup.ItemDescription>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          </ListGroup>
        </>
      ) : null}

      {section.categories.length > 0 ? (
        <ListGroup className="overflow-hidden rounded-2xl">
          {section.categories.map((cat, i) => {
            // Only a category hidden in its own right can be shown on its own.
            const selectable = cat.isHiddenItself;
            return (
              <Fragment key={cat.id}>
                {i > 0 ? <Separator className="mx-4" /> : null}
                <ListGroup.Item
                  onPress={selectable ? () => onToggleCategory(cat.id) : undefined}
                  className={selectable ? undefined : "opacity-50"}
                >
                  <ListGroup.ItemPrefix>
                    <View className="w-5 items-center justify-center">
                      {selectable ? (
                        <View pointerEvents="none">
                          <Checkbox isSelected={selection.categories.has(cat.id)}>
                            <Checkbox.Indicator />
                          </Checkbox>
                        </View>
                      ) : null}
                    </View>
                  </ListGroup.ItemPrefix>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle numberOfLines={1}>{cat.name}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                </ListGroup.Item>
              </Fragment>
            );
          })}
        </ListGroup>
      ) : null}
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
