import { Fragment, useState } from "react";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { BottomSheet, ListGroup, Separator, useThemeColor } from "heroui-native";
import { Check, Landmark } from "lucide-react-native";
import type { Account } from "@/core/domain/accounts/types";
import { FieldRow } from "../FieldRow";

type AccountFieldProps = {
  accountId: string | null;
  accountName: string;
  accounts: Account[];
  onSelect: (account: { id: string; name: string }) => void;
};

/** Account picker row + bottom sheet. */
export function AccountField({ accountId, accountName, accounts, onSelect }: AccountFieldProps) {
  const { t } = useTranslation("transactions");
  const [open, setOpen] = useState(false);
  const accent = useThemeColor("accent");
  const visible = accounts.filter((a) => !a.closed);

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
            snapPoints={["55%"]}
            enableDynamicSizing={false}
            enableOverDrag={false}
            contentContainerClassName="h-full"
          >
            <BottomSheet.Title className="mb-3">{t("account")}</BottomSheet.Title>
            <BottomSheetScrollView>
              <ListGroup>
                {visible.map((a, i) => (
                  <Fragment key={a.id}>
                    {i > 0 ? <Separator className="mx-4" /> : null}
                    <ListGroup.Item
                      onPress={() => {
                        onSelect({ id: a.id, name: a.name });
                        setOpen(false);
                      }}
                    >
                      <ListGroup.ItemContent>
                        <ListGroup.ItemTitle>{a.name}</ListGroup.ItemTitle>
                      </ListGroup.ItemContent>
                      {a.id === accountId ? (
                        <ListGroup.ItemSuffix>
                          <Check size={18} color={accent} />
                        </ListGroup.ItemSuffix>
                      ) : null}
                    </ListGroup.Item>
                  </Fragment>
                ))}
              </ListGroup>
            </BottomSheetScrollView>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
