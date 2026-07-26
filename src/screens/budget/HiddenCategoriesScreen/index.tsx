import { Fragment, useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  Button,
  Checkbox,
  ListGroup,
  Separator,
  Typography,
} from "heroui-native";
import { EmptyState } from "heroui-native-pro";
import { unhideItems } from "@/core/server/budget";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { ScreenHeader } from "@/ui/ScreenHeader";
import {
  useHiddenItems,
  type HiddenSection,
} from "@/screens/budget/hooks/useHiddenItems";

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
 * Inside a card row, where the whole row is the tap target — so the box must not
 * compete for the touch.
 */
function RowCheckbox({ isSelected }: { isSelected: boolean }) {
  return (
    <View pointerEvents="none">
      <Checkbox isSelected={isSelected} className="size-5 ">
        <Checkbox.Indicator />
      </Checkbox>
    </View>
  );
}

/**
 * On a group header there is no row to tap, so the box is its own control.
 *
 * It also sits on the page background rather than on a card, where the default
 * fill reads as a floating white square — hence transparent, leaning on the
 * border to define it.
 */
function HeaderCheckbox({
  isSelected,
  onPress,
}: {
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Checkbox
      isSelected={isSelected}
      onSelectedChange={onPress}
      className="size-5 bg-transparent ml-3"
    >
      <Checkbox.Indicator />
    </Checkbox>
  );
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
      <View className="flex-row items-center gap-3 px-1 pb-1 pt-4">
        {section.isGroupHidden ? (
          <HeaderCheckbox
            isSelected={selection.groups.has(section.groupId)}
            onPress={onToggleGroup}
          />
        ) : null}
        <Typography
          className="flex-1 text-sm font-semibold text-foreground"
          numberOfLines={1}
        >
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
                  <RowCheckbox isSelected={selection.categories.has(cat.id)} />
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>
                    {cat.name}
                  </ListGroup.ItemTitle>
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
              <EmptyState.Title>
                {t("noHiddenCategoriesTitle")}
              </EmptyState.Title>
              <EmptyState.Description>
                {t("noHiddenCategoriesMessage")}
              </EmptyState.Description>
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
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 120,
        }}
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
        <View
          className="absolute right-5"
          style={{ bottom: insets.bottom + 24 }}
        >
          <Button
            isDisabled={saving}
            onPress={() => void unhide()}
            className="h-14 rounded-full px-8 shadow-lg"
          >
            <Button.Label>
              {t("unhideSelected", { count: selected })}
            </Button.Label>
          </Button>
        </View>
      ) : null}
    </ScreenHeader.ScrollArea>
  );
}
