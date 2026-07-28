import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Check } from "lucide-react-native";
import {
  allowedCustomModes,
  fixedConfigFromTemplate,
  templateFromFixedConfig,
  type FixedMode,
  type FixedTemplate,
} from "@/screens/budget/goals";
import type { Template } from "@/core/types/models";
import { formatCents } from "@/core/shared/util";
import { useSurfaceLevel } from "@/ui/surface-level";

/**
 * "Next time I want to…" — what the goal does each period. Three readings of
 * the same amount: add it on top of whatever is left, top the category back
 * up to it, or set it aside to spend down over a window. Behind the scenes
 * they are different templates (periodic vs by vs spend), which is why it's a
 * pane and not a switch: the description is the product.
 */
export function FixedModePane({
  template,
  preferCustom = false,
  onChange,
  onDone,
}: {
  template: FixedTemplate;
  /**
   * Read the template as Custom even when its shape is a preset — set when
   * the editor that opened this pane was on the Custom segment, so the
   * offered modes match what it showed.
   */
  preferCustom?: boolean;
  onChange: (next: Template) => void;
  /** Return to the editor pane. */
  onDone: () => void;
}) {
  const { itemVariant } = useSurfaceLevel();
  const { t } = useTranslation("budget");
  const accent = useThemeColor("accent");

  const config = fixedConfigFromTemplate(template, preferCustom || template.type === "spend");
  const amount = formatCents(config.amountCents);
  const isYearly = config.segment === "yearly";

  const allowed: FixedMode[] =
    config.segment === "custom" ? allowedCustomModes(config.repeat) : ["setAside", "refill"];

  const pick = (mode: FixedMode) => {
    if (mode !== config.mode) {
      onChange(templateFromFixedConfig({ ...config, mode }, template));
    }
    onDone();
  };

  // Yearly reads differently: it's about what next year does with what's
  // already in the pot — start over from zero, or keep building toward it.
  const allOptions: { mode: FixedMode; title: string; description: string }[] = [
    {
      mode: "setAside",
      title: t("goals.fixed.setAside", { amount }),
      description: t(isYearly ? "goals.fixed.setAsideYearlyHint" : "goals.fixed.setAsideHint"),
    },
    {
      mode: "refill",
      title: t("goals.fixed.refillUpTo", { amount }),
      description: t(isYearly ? "goals.fixed.refillYearlyHint" : "goals.fixed.refillUpToHint"),
    },
    {
      mode: "spend",
      title: t("goals.fixed.spendDown", { amount }),
      description: t("goals.fixed.spendDownHint"),
    },
  ];
  const options = allOptions.filter((option) => allowed.includes(option.mode));

  return (
    <View className="px-4 pb-8">
      <ListGroup variant={itemVariant}>
        {options.map((option, i) => (
          <View key={option.mode}>
            {i > 0 ? <Separator className="mx-4" /> : null}
            <ListGroup.Item onPress={() => pick(option.mode)}>
              <ListGroup.ItemPrefix>
                <View className="w-5 items-center justify-center">
                  {config.mode === option.mode ? <Check size={18} color={accent} /> : null}
                </View>
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{option.title}</ListGroup.ItemTitle>
                <Typography className="text-sm text-muted">{option.description}</Typography>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          </View>
        ))}
      </ListGroup>
    </View>
  );
}
