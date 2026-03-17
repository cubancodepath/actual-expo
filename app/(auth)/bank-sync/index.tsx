import { useLocalSearchParams, useRouter } from "expo-router";
import { BankSyncWizard } from "@/presentation/components/bank-sync/BankSyncWizard";

export default function BankSyncScreen() {
  const { localAccountId, mode, offbudget } = useLocalSearchParams<{
    localAccountId?: string;
    mode?: string;
    offbudget?: string;
  }>();
  const router = useRouter();

  return (
    <BankSyncWizard
      localAccountId={localAccountId}
      mode={(mode as "link" | "create") ?? "link"}
      offbudget={offbudget === "1"}
      onClose={() => router.back()}
      onAccountCreated={() => router.dismiss(2)}
    />
  );
}
