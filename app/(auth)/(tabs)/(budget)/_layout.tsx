import { Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
              <Ionicons name="create-outline" size={22} color={colors.headerText} />
            </Pressable>
          ),
        }}
      />
    </Stack>
  );
}
