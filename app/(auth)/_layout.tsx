import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="account/new"
        options={{
          title: 'New Account',
          presentation: 'modal',
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#f1f5f9',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="account/[id]"
        options={{
          title: '',
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#f1f5f9',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="account/settings"
        options={{
          title: 'Account Settings',
          presentation: 'modal',
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#f1f5f9',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="transaction/new"
        options={{
          title: 'New Transaction',
          presentation: 'modal',
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#f1f5f9',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="categories"
        options={{
          title: 'Manage Categories',
          presentation: 'modal',
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#f1f5f9',
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
