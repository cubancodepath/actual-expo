import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button, useThemeColor } from "heroui-native";
import { Plus } from "lucide-react-native";

interface AddTransactionFabProps {
  /** When set, the new transaction is pre-filled for this account. */
  accountId?: string;
  /** Distance from the bottom edge (px). Defaults to clear the tab bar. */
  bottom?: number;
}

/**
 * Floating action button that opens the new-transaction flow. Built on the
 * HeroUI Button (primary/accent, icon-only, circular) as a single-action FAB —
 * the HeroUI Pro FAB component isn't in a published release yet, and a menu
 * isn't needed here since this is a single direct action.
 */
export function AddTransactionFab({ accountId, bottom = 100 }: AddTransactionFabProps) {
  const router = useRouter();
  const accentForeground = useThemeColor("accent-foreground");

  function handlePress() {
    router.push({
      pathname: "/(auth)/transaction/new",
      params: accountId ? { accountId } : undefined,
    });
  }

  return (
    <View style={{ position: "absolute", bottom, right: 20 }}>
      <Button
        isIconOnly
        onPress={handlePress}
        className="h-14 w-14 rounded-full shadow-lg"
        accessibilityLabel="Add transaction"
      >
        <Plus size={26} color={accentForeground} />
      </Button>
    </View>
  );
}
