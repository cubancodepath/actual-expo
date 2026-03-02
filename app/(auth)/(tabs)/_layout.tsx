import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
}

function AddButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/(auth)/account/new')}
      style={{ paddingHorizontal: 16, paddingVertical: 8 }}
      hitSlop={8}
    >
      <Text style={{ color: '#3b82f6', fontSize: 28, lineHeight: 30, fontWeight: '300' }}>+</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1e293b' },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#64748b',
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#f1f5f9',
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accounts',
          headerRight: () => <AddButton />,
          tabBarIcon: ({ focused }) => <TabIcon icon="🏦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Budget',
          tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
