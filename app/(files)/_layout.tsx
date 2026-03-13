import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/presentation/providers/ThemeProvider';
import { themedScreenOptions } from '../../src/presentation/navigation/screenOptions';

export default function FilesLayout() {
  const theme = useTheme();
  const { t } = useTranslation('auth');

  return (
    <Stack screenOptions={themedScreenOptions(theme)}>
      <Stack.Screen name="files" options={{ title: t('openBudget') }} />
      <Stack.Screen name="new-budget" options={{ headerShown: false }} />
    </Stack>
  );
}
