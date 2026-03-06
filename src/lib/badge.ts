// TODO: re-enable when Apple Developer account is active and expo-notifications is reinstalled
//
// import * as Notifications from 'expo-notifications';
// import { Platform } from 'react-native';
// import { useBudgetStore } from '../stores/budgetStore';
//
// let permissionGranted = false;
//
// async function ensureBadgePermission(): Promise<boolean> {
//   if (permissionGranted) return true;
//   if (Platform.OS === 'android') {
//     permissionGranted = true;
//     return true;
//   }
//   const { status } = await Notifications.requestPermissionsAsync({
//     ios: { allowBadge: true },
//   });
//   permissionGranted = status === 'granted';
//   return permissionGranted;
// }
//
// export async function updateAppBadge(): Promise<void> {
//   const allowed = await ensureBadgePermission();
//   if (!allowed) return;
//
//   const data = useBudgetStore.getState().data;
//   if (!data) {
//     await Notifications.setBadgeCountAsync(0);
//     return;
//   }
//   const overspentCount = data.groups
//     .filter((g) => !g.is_income)
//     .flatMap((g) => g.categories)
//     .filter((c) => c.balance < 0 && !c.carryover).length;
//   await Notifications.setBadgeCountAsync(overspentCount);
// }

export async function updateAppBadge(): Promise<void> {
  // no-op until expo-notifications is reinstalled
}
