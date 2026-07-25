import { Fragment, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Menu, Separator, Typography, useThemeColor } from "heroui-native";
import { CirclePlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react-native";
import { EnvelopeSheet } from "@/screens/budget/components/EnvelopeSheet";
import { SingleInputSheet } from "@/screens/budget/components/SingleInputSheet";
import { HIDDEN_GROUP_ID, useBudgetSections } from "@/screens/budget/hooks/useBudgetSections";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";
import {
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  updateCategoryGroup,
} from "@/core/server/budget";
import { ConfirmDialog, type ConfirmRequest } from "@/ui/feedback/ConfirmDialog";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { Money } from "@/ui/Money";

// Placeholder figures. The layout landed before the bindings did, so these are
// deliberately fixed and named — swapping each for a real spreadsheet read is a
// one-line change once we settle on what this screen should total.
const PLACEHOLDER_HERO_CENTS = 0;
const PLACEHOLDER_ASSIGNED_CENTS = 0;
const PLACEHOLDER_AVAILABLE_CENTS = 0;

/**
 * One group in the plan editor: a header row outside the card (name + actions)
 * over a card of its category names. Unlike the budget table's groups these
 * don't collapse — the whole point of this screen is seeing the plan at once.
 */
function EditPlanGroup({
  section,
  onAddCategory,
  onRename,
  onDelete,
}: {
  section: BudgetSection;
  onAddCategory: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");
  // The hidden bucket is synthetic, not a real group — there's nothing to add
  // a category to and no group to edit, so it gets the header without actions.
  const isSynthetic = section.id === HIDDEN_GROUP_ID;

  return (
    <View>
      <View className="flex-row items-center gap-1 px-1 pb-1 pt-4">
        <Typography className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
          {section.name}
        </Typography>
        {!isSynthetic && (
          <>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              onPress={onAddCategory}
              accessibilityLabel={t("addGroupAccessibility", { name: section.name })}
            >
              <CirclePlus size={18} color={foreground} />
            </Button>
            <Menu>
              <Menu.Trigger asChild>
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  accessibilityLabel={t("editGroupAccessibility", { name: section.name })}
                >
                  <MoreHorizontal size={18} color={foreground} />
                </Button>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Overlay />
                <Menu.Content presentation="popover" width={220} placement="bottom" align="end">
                  <Menu.Item className="gap-3" onPress={onRename}>
                    <Pencil size={18} color={foreground} />
                    <Menu.ItemTitle>{t("renameGroup")}</Menu.ItemTitle>
                  </Menu.Item>
                  <Menu.Item className="gap-3" onPress={onDelete}>
                    <Trash2 size={18} color={danger} />
                    <Menu.ItemTitle>{t("deleteGroup")}</Menu.ItemTitle>
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
          </>
        )}
      </View>

      {section.categories.length > 0 && (
        <ListGroup className="overflow-hidden rounded-2xl">
          {section.categories.map((cat, i) => (
            <Fragment key={cat.id}>
              {i > 0 ? <Separator className="mx-4" /> : null}
              <ListGroup.Item>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{cat.name}</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
              </ListGroup.Item>
            </Fragment>
          ))}
        </ListGroup>
      )}
    </View>
  );
}

/** What the single-input sheet is currently doing, if anything. */
type SheetIntent =
  | { kind: "new-category"; group: BudgetSection }
  | { kind: "new-group" }
  | { kind: "rename-group"; group: BudgetSection };

/**
 * Plan editor: the whole set of groups and categories on one screen, for
 * restructuring rather than budgeting. Built on the move-money
 * {@link EnvelopeSheet} — accent hero (this screen's figure tracks no good/bad
 * state), a summary card pinned in its curve, and the group list scrolling
 * underneath it.
 */
export function EditBudgetScreen() {
  const { t } = useTranslation("budget");
  const insets = useSafeAreaInsets();
  const { sections, isLoading } = useBudgetSections();
  const foreground = useThemeColor("foreground");
  const [intent, setIntent] = useState<SheetIntent | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  function requestDeleteGroup(section: BudgetSection) {
    const count = section.categories.length;
    setConfirm({
      title: t("deleteGroupTitle"),
      description:
        count > 0
          ? t("deleteGroupMessageWithCategories", {
              name: section.name,
              count,
              suffix: count === 1 ? "y" : "ies",
            })
          : t("deleteGroupMessageEmpty", { name: section.name }),
      actions: [
        {
          label: t("delete"),
          isDestructive: true,
          onPress: () => {
            void deleteCategoryGroup(section.id);
            setConfirm(null);
          },
        },
      ],
    });
  }

  return (
    <EnvelopeSheet tone="accent" presentation="push">
      <EnvelopeSheet.Backdrop />

      <EnvelopeSheet.Body contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View className="gap-2 px-4">
          {!isLoading &&
            sections.map((section) => (
              <EditPlanGroup
                key={section.id}
                section={section}
                onAddCategory={() => setIntent({ kind: "new-category", group: section })}
                onRename={() => setIntent({ kind: "rename-group", group: section })}
                onDelete={() => requestDeleteGroup(section)}
              />
            ))}

          {!isLoading && (
            <Button
              variant="tertiary"
              className="mt-4"
              onPress={() => setIntent({ kind: "new-group" })}
            >
              <CirclePlus size={18} color={foreground} />
              <Button.Label>{t("addGroup")}</Button.Label>
            </Button>
          )}
        </View>
      </EnvelopeSheet.Body>

      {/* The card that cuts the hero. Pinned, not scrolled: it's a summary of the
          plan as a whole, so it stays put while the groups move under it. */}
      <EnvelopeSheet.Pinned>
        <View className="px-4">
          <ListGroup className="overflow-hidden rounded-2xl shadow-md">
            <ListGroup.Item>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t("columnBudgeted")}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <Money
                  cents={PLACEHOLDER_ASSIGNED_CENTS}
                  tone="plain"
                  className="text-base font-semibold"
                />
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
            <Separator className="mx-4" />
            <ListGroup.Item>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t("columnAvailable")}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <Money
                  cents={PLACEHOLDER_AVAILABLE_CENTS}
                  tone="plain"
                  className="text-base font-semibold"
                />
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </ListGroup>
        </View>
      </EnvelopeSheet.Pinned>

      <EnvelopeSheet.Hero>
        <EnvelopeSheet.Title>{t("editBudget")}</EnvelopeSheet.Title>
        <EnvelopeSheet.Amount cents={PLACEHOLDER_HERO_CENTS} />
      </EnvelopeSheet.Hero>

      <EnvelopeSheet.Close>
        <ScreenHeader.Back />
      </EnvelopeSheet.Close>

      {/* One sheet for all three text prompts; `intent` picks the copy and the
          action, so the target and the open state can't disagree. */}
      <SingleInputSheet
        target={
          intent == null
            ? null
            : { id: intent.kind === "new-group" ? "new-group" : intent.group.id + intent.kind }
        }
        title={
          intent?.kind === "new-group"
            ? t("addGroup")
            : intent?.kind === "rename-group"
              ? t("renameGroup")
              : t("addCategory")
        }
        label={intent?.kind === "new-category" ? t("categoryNameLabel") : t("groupNameLabel")}
        placeholder={
          intent?.kind === "new-category" ? t("newCategoryPlaceholder") : t("newGroupPlaceholder")
        }
        submitLabel={t("save")}
        initialValue={intent?.kind === "rename-group" ? intent.group.name : ""}
        onSubmit={async (value) => {
          if (intent == null) return;
          if (intent.kind === "new-category") {
            // is_income comes from the group being added to — a category in the
            // income group must be an income category.
            await createCategory({
              name: value,
              groupId: intent.group.id,
              isIncome: intent.group.is_income,
            });
          } else if (intent.kind === "new-group") {
            await createCategoryGroup({ name: value });
          } else {
            await updateCategoryGroup(intent.group.id, { name: value });
          }
          setIntent(null);
        }}
        onClose={() => setIntent(null)}
      />

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </EnvelopeSheet>
  );
}
