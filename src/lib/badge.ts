import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useBudgetStore } from '../stores/budgetStore';
import { getUncategorizedStats } from '../transactions';

let permissionGranted = false;

async function ensureBadgePermission(): Promise<boolean> {
  if (permissionGranted) return true;
  if (Platform.OS === 'android') {
    permissionGranted = true;
    return true;
  }
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowBadge: true },
  });
  permissionGranted = status === 'granted';
  return permissionGranted;
}

export async function updateAppBadge(): Promise<void> {
  const allowed = await ensureBadgePermission();
  if (!allowed) return;

  const data = useBudgetStore.getState().data;
  const overspentCount = data
    ? data.groups
        .filter((g) => !g.is_income)
        .flatMap((g) => g.categories)
        .filter((c) => c.balance < 0 && !c.carryover).length
    : 0;

  const { count: uncategorizedCount } = await getUncategorizedStats();

  await Notifications.setBadgeCountAsync(overspentCount + uncategorizedCount);
}
