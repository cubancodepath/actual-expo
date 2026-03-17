import { useLocalSearchParams, useRouter } from "expo-router";
import { BankSyncWizard } from "@/presentation/components/bank-sync/BankSyncWizard";

export default function BankSyncScreen() {
  const { localAccountId } = useLocalSearchParams<{ localAccountId: string }>();
  const router = useRouter();

  return (
    <BankSyncWizard
      localAccountId={localAccountId}
      onClose={() => router.back()}
    />
  );
}
