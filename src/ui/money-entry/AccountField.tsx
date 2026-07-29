import { useState } from "react";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "heroui-native";
import { Landmark } from "lucide-react-native";
import { CloseButton } from "@/ui/CloseButton";
import { ScreenHeader, useScreenHeaderScroll } from "@/ui/ScreenHeader";
import { AccountSelectView } from "@/ui/entity-select/AccountSelectView";
import { FieldRow } from "./FieldRow";

type AccountFieldProps = {
  accountId: string | null;
  accountName: string;
  onSelect: (account: { id: string; name: string }) => void;
};

/** Account picker row + resizable bottom sheet, grouped by budget / off-budget. */
export function AccountField({ accountId, accountName, onSelect }: AccountFieldProps) {
  const { t } = useTranslation("transactions");
  const [open, setOpen] = useState(false);

  return (
    <>
      <FieldRow
        icon={Landmark}
        label={t("account")}
        value={accountName}
        placeholder={t("selectAccount")}
        onPress={() => setOpen(true)}
      />
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            snapPoints={["55%", "90%"]}
            enableDynamicSizing={false}
            enableOverDrag={false}
            contentContainerClassName="h-full px-0 pt-0"
          >
            <ScreenHeader.ScrollArea className="bg-transparent">
              <AccountSheetBody
                open={open}
                accountId={accountId}
                onSelect={(account) => {
                  onSelect(account);
                  setOpen(false);
                }}
              />
              <ScreenHeader.Floating>
                <ScreenHeader>
                  <ScreenHeader.Back>
                    <CloseButton onPress={() => setOpen(false)} />
                  </ScreenHeader.Back>
                  <ScreenHeader.Title>{t("account")}</ScreenHeader.Title>
                </ScreenHeader>
              </ScreenHeader.Floating>
            </ScreenHeader.ScrollArea>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}

/**
 * Sheet host around the shared {@link AccountSelectView}: owns the sheet's
 * scroll container and calls `useScreenHeaderScroll` (which needs the
 * `ScreenHeader.ScrollArea` context) to drive the floating header's blur.
 */
function AccountSheetBody({
  open,
  accountId,
  onSelect,
}: {
  open: boolean;
  accountId: string | null;
  onSelect: (account: { id: string; name: string }) => void;
}) {
  const { onScroll, contentPaddingTop } = useScreenHeaderScroll();

  return (
    <BottomSheetScrollView
      onScroll={onScroll}
      contentContainerStyle={{
        paddingTop: contentPaddingTop,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
    >
      {/* This host is a BottomSheet, whose canvas is `--overlay` — the same
          value as `--surface` in this theme. The groups step down a rung so
          they don't vanish into the sheet. */}
      <AccountSelectView
        variant="transparent"
        enabled={open}
        selectedAccountId={accountId}
        onPick={onSelect}
      />
    </BottomSheetScrollView>
  );
}
