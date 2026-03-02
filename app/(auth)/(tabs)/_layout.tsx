import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSyncStore } from '../../../src/stores/syncStore';

// ---------------------------------------------------------------------------
// Sync status badge — shown in every tab's header right
// ---------------------------------------------------------------------------

function SyncBadge() {
  const { status, error, sync } = useSyncStore();
  // Auto-hide the success checkmark after 3 s
  const [showSuccess, setShowSuccess] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === 'success') {
      setShowSuccess(true);
      timer.current = setTimeout(() => setShowSuccess(false), 3000);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [status]);

  if (status === 'syncing') {
    return (
      <View style={{ paddingRight: 14 }}>
        <ActivityIndicator size="small" color="#60a5fa" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <Pressable onPress={sync} hitSlop={10} style={{ paddingRight: 14 }}>
        <Text style={{ color: '#f87171', fontSize: 18 }}>⚠</Text>
      </Pressable>
    );
  }

  if (showSuccess) {
    return (
      <View style={{ paddingRight: 14 }}>
        <Text style={{ color: '#4ade80', fontSize: 16, fontWeight: '700' }}>✓</Text>
      </View>
    );
  }

  return null;
}

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

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

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
        headerRight: () => <SyncBadge />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accounts',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <SyncBadge />
              <AddButton />
            </View>
          ),
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
