import { Stack } from 'expo-router';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { themedScreenOptions } from '../../../src/presentation/navigation/screenOptions';

export default function TransactionLayout() {
  const theme = useTheme();
  const screen = themedScreenOptions(theme);

  return (
    <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="new" options={{ title: 'New Transaction' }} />
      <Stack.Screen name="payee-picker" options={{ title: 'Payee' }} />
      <Stack.Screen name="category-picker" options={{ title: 'Category' }} />
      <Stack.Screen name="account-picker" options={{ title: 'Account' }} />
    </Stack>
  );
}
