import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button } from "heroui-native";
import { AmountSheet } from "@/screens/budget/components/AmountSheet";
import { TransferEntryList } from "@/screens/budget/components/TransferEntryList";
import { useTransferFlow, type TransferDirection } from "@/screens/budget/hooks/useTransferFlow";
import { AmountKeyboard } from "@/ui/amount-keyboard";
import { DirectionToggle } from "./components/DirectionToggle";

/** Hero height before its first onLayout measurement (title + amount + toggle). */
const HERO_HEIGHT_FALLBACK = 250;

/**
 * Move-money screen: move budgeted money between the category it was opened for
 * and one or more counterparts, in either direction. The same
 * {@link useTransferFlow} the cover sheet runs on, but with the direction under
 * the user's control, and an {@link AmountSheet} whose hero carries the toggle
 * and whose tint tracks the projected balance — danger when the category would
 * end up negative, success when positive, balanced at zero.
 */
export function MoveMoneyScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { catId, catName, balance } = useLocalSearchParams<{
    catId: string;
    catName: string;
    balance: string;
  }>();

  const balanceCents = Number(balance);
  // Overspent categories need money, everything else has some to give.
  const [direction, setDirection] = useState<TransferDirection>(balanceCents < 0 ? "to" : "from");

  const flow = useTransferFlow({
    catId,
    catName,
    balanceCents,
    direction,
    // Named for the counterparts: they're where the money comes from, or goes to.
    pickerTitle: t(direction === "to" ? "moveFrom" : "moveTo"),
  });

  const { projected } = flow;

  return (
    <AmountSheet
      status={projected < 0 ? "danger" : projected > 0 ? "success" : "balanced"}
      fallbackHeight={HERO_HEIGHT_FALLBACK}
    >
      <AmountSheet.Backdrop />

      <AmountSheet.Body
        ref={flow.scrollRef}
        {...flow.scrollProps}
        contentContainerStyle={{ paddingBottom: flow.bottomPadding }}
      >
        <View className="gap-2 px-4">
          <TransferEntryList
            entries={flow.entries}
            // Money coming INTO the category is money the rows give away.
            flow={direction === "to" ? "gives" : "receives"}
            editingId={flow.editingId}
            onPressAmount={flow.onPressAmount}
            onAddCategory={flow.handleAddCategory}
          />
        </View>
      </AmountSheet.Body>

      <AmountSheet.Hero>
        <AmountSheet.Title>{catName}</AmountSheet.Title>
        <AmountSheet.Amount cents={projected} />
        <View className="mt-2">
          <DirectionToggle value={direction} onChange={setDirection} />
        </View>
      </AmountSheet.Hero>

      <AmountSheet.Close onPress={() => router.back()} />

      {/* Move as a labelled FAB (AddTransactionFab pattern), hidden while the
          amount pad is open. */}
      {flow.editingId == null && (
        <View className="absolute bottom-8 right-5">
          <Button
            isDisabled={flow.total === 0 || flow.saving}
            onPress={() => flow.handleSave(() => router.back())}
            className="h-14 rounded-full px-8 shadow-lg"
          >
            <Button.Label>{t(flow.saving ? "movingEllipsis" : "move")}</Button.Label>
          </Button>
        </View>
      )}

      {/* Rows are their own triggers (tap switches), so no Overlay/DismissArea. */}
      <AmountKeyboard
        isOpen={flow.editingId != null}
        onClose={flow.closePad}
        value={flow.editingAmount}
        onValueChange={flow.setEditingAmount}
      >
        <AmountKeyboard.Portal>
          <AmountKeyboard.Panel onHeightChange={flow.onKeyboardHeightChange} />
        </AmountKeyboard.Portal>
      </AmountKeyboard>
    </AmountSheet>
  );
}
