import { Stack } from 'expo-router';
import { useTheme } from '../../src/presentation/providers/ThemeProvider';
import { themedScreenOptions } from '../../src/presentation/navigation/screenOptions';

export default function FilesLayout() {
  const theme = useTheme();

  return (
    <Stack screenOptions={themedScreenOptions(theme)}>
      <Stack.Screen name="files" options={{ title: 'Open Budget' }} />
      <Stack.Screen name="new-budget" options={{ headerShown: false }} />
    </Stack>
  );
}
