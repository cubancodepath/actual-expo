import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { useSyncStore } from "../../../src/stores/syncStore";

// ---------------------------------------------------------------------------
// Sync status badge — shown in every tab's header right
// ---------------------------------------------------------------------------

function SyncBadge() {
  const { status, sync } = useSyncStore();
  const { colors } = useTheme();
  const [showSuccess, setShowSuccess] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === "success") {
      setShowSuccess(true);
      timer.current = setTimeout(() => setShowSuccess(false), 3000);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status]);

  if (status === "syncing") {
    return (
      <View style={{ paddingRight: 14 }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (status === "error") {
    return (
      <Pressable onPress={sync} hitSlop={10} style={{ paddingRight: 14 }}>
        <Ionicons name="alert-circle" size={20} color={colors.negative} />
      </Pressable>
    );
  }

  if (showSuccess) {
    return (
      <View style={{ paddingRight: 14 }}>
        <Ionicons name="checkmark-circle" size={20} color={colors.positive} />
      </View>
    );
  }

  return null;
}

function AddButton() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push("/(auth)/account/new")}
      style={{ paddingHorizontal: 16, paddingVertical: 8 }}
      hitSlop={8}
    >
      <Ionicons name="add" size={28} color={colors.primary} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      initialRouteName="budget"
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.navBackground,
          borderTopColor: colors.navBorder,
        },
        tabBarActiveTintColor: colors.navItemActive,
        tabBarInactiveTintColor: colors.navItemInactive,
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: colors.headerText,
        headerShadowVisible: false,
        headerRight: () => <SyncBadge />,
      }}
    >
      <Tabs.Screen
        name="accounts"
        options={{
          title: "Accounts",
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <SyncBadge />
              <AddButton />
            </View>
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: "Budget",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pie-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="spending"
        options={{
          title: "Spending",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="swap-horizontal-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
