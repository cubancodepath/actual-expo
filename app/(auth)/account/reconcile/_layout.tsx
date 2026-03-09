import { Stack } from 'expo-router';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { themedScreenOptions } from '../../../../src/presentation/navigation/screenOptions';

export default function ReconcileLayout() {
  const theme = useTheme();
  const screen = themedScreenOptions(theme);

  return (
    <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Reconcile Account' }} />
      <Stack.Screen name="amount" options={{ title: 'Enter Bank Balance' }} />
    </Stack>
  );
}
