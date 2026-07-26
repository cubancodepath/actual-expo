import { useTranslation } from "react-i18next";
import { NameSheet } from "@/screens/budget/components/NameSheet";
import { createCategory, createCategoryGroup } from "@/core/server/budget";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";

/**
 * What the sheet is creating, if anything. `null` closes it — the target and the
 * open state are the same value, so they can't disagree.
 */
export type NewItemIntent = { kind: "category"; group: BudgetSection } | { kind: "group" };

/**
 * The "create a thing" prompt, for both a category inside a group and a
 * top-level group. One sheet with the copy swapped, rather than two nearly
 * identical ones.
 *
 * Has a `submitLabel`, so nothing is written until the user presses it — an
 * abandoned draft must never create anything.
 */
export function NewItemSheet({
  intent,
  onClose,
}: {
  intent: NewItemIntent | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("budget");
  const isGroup = intent?.kind === "group";

  return (
    <NameSheet
      target={intent == null ? null : { id: isGroup ? "group" : intent.group.id }}
      title={isGroup ? t("newCategoryGroup") : t("addCategory")}
      label={isGroup ? t("groupNameLabel") : t("categoryNameLabel")}
      placeholder={isGroup ? t("newGroupPlaceholder") : t("newCategoryPlaceholder")}
      submitLabel={t("save")}
      autoFocus
      onSave={async (name) => {
        if (intent == null) return;
        if (intent.kind === "group") {
          await createCategoryGroup({ name });
        } else {
          // is_income comes from the group being added to — a category in the
          // income group must be an income category.
          await createCategory({
            name,
            groupId: intent.group.id,
            isIncome: intent.group.is_income,
          });
        }
        onClose();
      }}
      onClose={onClose}
    />
  );
}
