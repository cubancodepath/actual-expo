import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getSpreadsheet } from "../spreadsheet/instance";
import { sheetForMonth, envelopeBudget } from "../spreadsheet/bindings";
import { currentMonth } from "./date";
import { getCategories, getCategoryGroups } from "../categories";
import { getUncategorizedStats } from "../transactions";

let permissionGranted = false;

async function ensureBadgePermission(): Promise<boolean> {
  if (permissionGranted) return true;
  if (Platform.OS === "android") {
    permissionGranted = true;
    return true;
  }
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowBadge: true },
  });
  permissionGranted = status === "granted";
  return permissionGranted;
}

export async function updateAppBadge(): Promise<void> {
  const allowed = await ensureBadgePermission();
  if (!allowed) return;

  try {
    const ss = getSpreadsheet();
    const month = currentMonth();
    const sheet = sheetForMonth(month);

    const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);
    const expenseGroupIds = new Set(groups.filter((g) => !g.is_income).map((g) => g.id));

    let overspentCount = 0;
    for (const c of cats) {
      if (!expenseGroupIds.has(c.cat_group)) continue;
      const balance = (ss.getValue(sheet, envelopeBudget.catBalance(c.id)) as number) ?? 0;
      const carryover =
        ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === true ||
        ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === 1;
      if (balance < 0 && !carryover) overspentCount++;
    }

    const { count: uncategorizedCount } = await getUncategorizedStats();

    await Notifications.setBadgeCountAsync(overspentCount + uncategorizedCount);
  } catch {
    // DB may be unavailable during budget switch — ignore
  }
}
