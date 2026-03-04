import { Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { MonthSelector } from '../../../../src/presentation/components/budget/MonthSelector';

export default function BudgetStack() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: colors.headerText,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <MonthSelector />,
          headerLeft: () => (
            <Pressable
              onPress={() => router.push('/(auth)/budget/edit')}
              hitSlop={8}
              style={{ paddingLeft: 4 }}
            >
              <SymbolView name="long.text.page.and.pencil" tintColor={colors.headerText} size={22} />
            </Pressable>
          ),
        }}
      />
    </Stack>
  );
}
