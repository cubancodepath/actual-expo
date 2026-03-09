import { Stack } from 'expo-router';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { themedScreenOptions } from '../../../src/presentation/navigation/screenOptions';

export default function TransactionLayout() {
  const theme = useTheme();
  const screen = themedScreenOptions(theme);

  return (
    <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="new" options={{ title: 'New Transaction' }} />
      <Stack.Screen name="payee-picker" options={{ headerShown: false }} />
      <Stack.Screen name="category-picker" options={{ headerShown: false }} />
      <Stack.Screen name="account-picker" options={{ headerShown: false }} />
      <Stack.Screen name="split" options={{ title: 'Split Transaction' }} />
      <Stack.Screen name="split-category-picker" options={{ title: 'Category' }} />
      <Stack.Screen name="recurrence" options={{ headerShown: false }} />
      <Stack.Screen name="recurrence-custom" options={{ headerShown: false }} />
      <Stack.Screen
        name="tags"
        options={{
          title: 'Tags',
          presentation: 'formSheet',
          sheetAllowedDetents: [0.5, 1.0],
        }}
      />
    </Stack>
  );
}
