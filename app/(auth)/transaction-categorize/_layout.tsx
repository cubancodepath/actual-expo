import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { SurfaceLevel } from "@/ui/surface-level";
import { CategorizeProvider } from "@/screens/transactions/CategorizeScreen/context/CategorizeProvider";

export default function TransactionCategorizeLayout() {
  // Presented as a card `modal` from `(auth)/_layout.tsx`, so this stack floats
  // over the visible parent — `sheet`, not `screen`.
  const { sheet } = useStackOptions();

  return (
    <CategorizeProvider>
      <SurfaceLevel context="sheet">
        <Stack screenOptions={{ ...sheet, headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="split-amounts" />
          <Stack.Screen name="add-category" />
        </Stack>
      </SurfaceLevel>
    </CategorizeProvider>
  );
}
