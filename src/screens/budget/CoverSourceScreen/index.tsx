import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button } from "heroui-native";
import { EnvelopeSheet } from "@/screens/budget/components/EnvelopeSheet";
import { TransferEntryList } from "@/screens/budget/components/TransferEntryList";
import { useTransferFlow } from "@/screens/budget/hooks/useTransferFlow";
import { AmountKeyboard } from "@/ui/amount-keyboard";

/**
 * Cover-source screen: pick funding sources and how much to take from each to
 * cover an overspent category. A {@link useTransferFlow} pinned to `"to"` — money
 * only ever comes in — inside an {@link EnvelopeSheet} whose hero shows what's
 * still missing, tinted danger while money is needed and success once covered.
 */
export function CoverSourceScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { catId, catName, balance } = useLocalSearchParams<{
    catId: string;
    catName: string;
    balance: string;
  }>();

  const flow = useTransferFlow({
    catId,
    catName,
    balanceCents: Number(balance),
    direction: "to",
    pickerTitle: t("coverOverspendingFrom"),
  });

  const isCovered = flow.projected >= 0 && flow.entries.length > 0;

  return (
    <EnvelopeSheet tone={isCovered ? "success" : "danger"}>
      <EnvelopeSheet.Backdrop />

      <EnvelopeSheet.Body
        ref={flow.scrollRef}
        {...flow.scrollProps}
        contentContainerStyle={{ paddingBottom: flow.bottomPadding }}
      >
        <View className="gap-2 px-4">
          <TransferEntryList
            entries={flow.entries}
            flow="gives"
            editingId={flow.editingId}
            onPressAmount={flow.onPressAmount}
            onAddCategory={flow.handleAddCategory}
          />
        </View>
      </EnvelopeSheet.Body>

      <EnvelopeSheet.Hero>
        <EnvelopeSheet.Title>{catName}</EnvelopeSheet.Title>
        <EnvelopeSheet.Amount cents={flow.projected} />
      </EnvelopeSheet.Hero>

      <EnvelopeSheet.Close onPress={() => router.back()} />

      {/* Cover as a labelled FAB (AddTransactionFab pattern), hidden while the
          amount pad is open. */}
      {flow.editingId == null && (
        <EnvelopeSheet.Fab>
          <Button
            isDisabled={flow.total === 0 || flow.saving}
            // Closes cover-source + cover-overspent.
            onPress={() => flow.handleSave(() => router.dismiss(2))}
            className="h-14 rounded-full px-8 shadow-lg"
          >
            <Button.Label>{t(flow.saving ? "coveringEllipsis" : "cover")}</Button.Label>
          </Button>
        </EnvelopeSheet.Fab>
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
    </EnvelopeSheet>
  );
}
