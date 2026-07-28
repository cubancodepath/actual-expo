import { Fragment, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Switch, Typography, useThemeColor } from "heroui-native";
import { ChevronRight } from "lucide-react-native";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import { getCurrency } from "@/core/shared/currencies";
import { useSurfaceLevel } from "@/ui/surface-level";

/** Row with a current value that drills into a picker sub-screen. */
function NavValueRow({
  title,
  value,
  onPress,
  muted,
}: {
  title: string;
  value: string;
  onPress: () => void;
  muted: string;
}) {
  return (
    <ListGroup.Item onPress={onPress}>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{title}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <View className="flex-row items-center gap-1">
          <Typography className="text-sm text-muted">{value}</Typography>
          <ChevronRight size={18} color={muted} />
        </View>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

/**
 * Currency group (upstream's Currency section, adapted to mobile drill-down):
 * Default Currency, and — only once a currency is set — Symbol Position and
 * "Add space between amount and symbol". Rendered only behind the `currency`
 * experimental flag (gated by the parent screen).
 */
export function CurrencyGroup() {
  const { itemVariant } = useSurfaceLevel();
  const router = useRouter();
  const { t } = useTranslation("settings");
  const muted = useThemeColor("muted");

  const [code] = useSyncedPref("defaultCurrencyCode");
  const [position] = useSyncedPref("currencySymbolPosition");
  const [space, setSpace] = useSyncedPref("currencySpaceBetweenAmountAndSymbol");

  const hasCurrency = !!code;
  const currency = getCurrency(code || "");
  const currencyValue = hasCurrency ? `${currency.code} (${currency.symbol})` : t("currencyNone");
  const positionValue =
    (position || "before") === "after" ? t("positionAfter") : t("positionBefore");

  const wrap = (child: ReactNode, first: boolean) => (
    <Fragment>
      {!first && <Separator className="mx-4" />}
      {child}
    </Fragment>
  );

  return (
    <>
      <ListGroup variant={itemVariant}>
        {wrap(
          <NavValueRow
            title={t("defaultCurrency")}
            value={currencyValue}
            muted={muted}
            onPress={() => router.push("/(auth)/settings/currency")}
          />,
          true,
        )}
        {hasCurrency &&
          wrap(
            <NavValueRow
              title={t("symbolPosition")}
              value={positionValue}
              muted={muted}
              onPress={() => router.push("/(auth)/settings/symbol-position")}
            />,
            false,
          )}
        {hasCurrency &&
          wrap(
            <ListGroup.Item>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t("addSpace")}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <Switch
                  isSelected={space === "true"}
                  onSelectedChange={(v) => void setSpace(v ? "true" : "false")}
                />
              </ListGroup.ItemSuffix>
            </ListGroup.Item>,
            false,
          )}
      </ListGroup>

      <Typography className="mt-3 ml-2 text-sm text-muted">{t("currencyNote")}</Typography>
    </>
  );
}
