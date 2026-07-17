import { Fragment } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheet, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { SINGLETON_TYPES, type DisplayTemplateType } from "@/core/domain/goals";
import {
  CALCULATED_TYPE_ORDER,
  KNOWN_AMOUNT_TYPE_ORDER,
  OPTION_TYPE_ORDER,
  displayTypeMeta,
} from "../displayTypeMeta";

/**
 * Type catalogue for adding (or changing) an automation. Split the same way
 * the list is: the types that budget money, then the ones that cap or observe
 * what the others budget.
 *
 * A category can only hold one cap, one refill, one remainder and one
 * long-term goal, so those disable once used.
 */
export function GoalTypePickerSheet({
  isOpen,
  onOpenChange,
  usedTypes,
  selectedType,
  onSelect,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display types already present on the category. */
  usedTypes: ReadonlySet<DisplayTemplateType>;
  /** When changing an existing automation, its current type (stays selectable). */
  selectedType?: DisplayTemplateType;
  onSelect: (type: DisplayTemplateType) => void;
}) {
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");

  const isDisabled = (type: DisplayTemplateType) =>
    type !== selectedType && SINGLETON_TYPES.has(type) && usedTypes.has(type);

  const renderSection = (title: string, types: DisplayTemplateType[]) => (
    <View className="mb-3">
      <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
        {title}
      </Typography>
      <ListGroup>
        {types.map((type, i) => {
          const meta = displayTypeMeta[type];
          const Icon = meta.icon;
          const disabled = isDisabled(type);
          return (
            <Fragment key={type}>
              {i > 0 ? <Separator className="mx-4" /> : null}
              <ListGroup.Item
                disabled={disabled}
                className={disabled ? "opacity-50" : undefined}
                onPress={() => {
                  onSelect(type);
                  onOpenChange(false);
                }}
              >
                <ListGroup.ItemPrefix>
                  <View className="w-6 items-center justify-center">
                    <Icon size={18} color={disabled ? muted : foreground} />
                  </View>
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>{t(meta.labelKey)}</ListGroup.ItemTitle>
                  <Typography className="text-sm text-muted">
                    {disabled ? t("goals.alreadyAdded") : t(meta.descriptionKey)}
                  </Typography>
                </ListGroup.ItemContent>
              </ListGroup.Item>
            </Fragment>
          );
        })}
      </ListGroup>
    </View>
  );

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content backgroundClassName="bg-background">
          <View className="px-4 pb-4">
            <Typography className="mb-3 text-center text-lg font-semibold text-foreground">
              {t("goals.changeTypeTitle")}
            </Typography>
            {renderSection(t("goals.sectionKnown"), KNOWN_AMOUNT_TYPE_ORDER)}
            {renderSection(t("goals.sectionCalculate"), CALCULATED_TYPE_ORDER)}
            {renderSection(t("goals.sectionOptions"), OPTION_TYPE_ORDER)}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
