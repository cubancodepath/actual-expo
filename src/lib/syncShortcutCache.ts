import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import Constants from "expo-constants";
import { getAccounts } from "@core/accounts";
import { getCategories, getCategoryGroups } from "@core/categories";

const APP_GROUP =
  Constants.expoConfig?.ios?.entitlements?.["com.apple.security.application-groups"]?.[0] ??
  "group.com.cubancodepath.actual";

let storage: ExtensionStorage | null = null;

function getStorage(): ExtensionStorage {
  if (!storage) storage = new ExtensionStorage(APP_GROUP);
  return storage;
}

export async function syncShortcutCache(): Promise<void> {
  if (Platform.OS !== "ios") return;

  try {
    const s = getStorage();

    const [allAccounts, allCategories, allGroups] = await Promise.all([
      getAccounts(),
      getCategories(),
      getCategoryGroups(),
    ]);

    const accounts = allAccounts
      .filter((a) => !a.closed && !a.tombstone)
      .map((a) => ({ id: a.id, name: a.name ?? "" }));

    const filteredCategories = allCategories
      .filter((c) => !c.hidden && !c.tombstone && !c.is_income)
      .map((c) => ({ id: c.id, name: c.name ?? "", groupId: c.cat_group ?? "" }));

    const filteredGroups = allGroups
      .filter((g) => !g.hidden && !g.tombstone && !g.is_income)
      .map((g) => ({ id: g.id, name: g.name ?? "" }));

    s.set("accounts", accounts);
    s.set("categories", filteredCategories);
    s.set("categoryGroups", filteredGroups);
  } catch (e) {
    if (__DEV__) console.warn("[syncShortcutCache] failed:", e);
  }
}
