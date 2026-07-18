import { useRouter } from "expo-router";
import { useSelector } from "@tanstack/react-store";
import { PayeeSelectView } from "@/ui/entity-select/PayeeSelectView";
import { useScheduleFormContext } from "../context/ScheduleFormProvider";

/** The schedule form's payee picker: PayeeSelectView wired to the shared form. */
export function SchedulePayeePicker() {
  const router = useRouter();
  const { form, actions } = useScheduleFormContext();
  const payeeId = useSelector(form.store, (s) => s.values.payeeId);
  const payeeName = useSelector(form.store, (s) => s.values.payeeName);

  return (
    <PayeeSelectView
      selectedPayeeId={payeeId}
      selectedPayeeName={payeeName}
      onPick={(payee) => {
        if (payee === null) {
          actions.selectPayee({ id: null, name: "" });
        } else {
          actions.selectPayee(payee);
          router.back();
        }
      }}
    />
  );
}
