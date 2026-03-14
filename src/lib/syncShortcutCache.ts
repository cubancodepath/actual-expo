import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import { useAccountsStore } from '../stores/accountsStore';
import { useCategoriesStore } from '../stores/categoriesStore';

const APP_GROUP =
  Constants.expoConfig?.ios?.entitlements?.['com.apple.security.application-groups']?.[0]
  ?? 'group.com.cubancodepath.actual';

let storage: ExtensionStorage | null = null;

function getStorage(): ExtensionStorage {
  if (!storage) storage = new ExtensionStorage(APP_GROUP);
  return storage;
}

export function syncShortcutCache(): void {
  if (Platform.OS !== 'ios') return;

  try {
    const s = getStorage();

    const accounts = useAccountsStore
      .getState()
      .accounts.filter((a) => !a.closed && !a.tombstone)
      .map((a) => ({ id: a.id, name: a.name ?? '' }));

    const { categories, groups } = useCategoriesStore.getState();

    const filteredCategories = categories
      .filter((c) => !c.hidden && !c.tombstone && !c.is_income)
      .map((c) => ({ id: c.id, name: c.name ?? '', groupId: c.cat_group ?? '' }));

    const filteredGroups = groups
      .filter((g) => !g.hidden && !g.tombstone && !g.is_income)
      .map((g) => ({ id: g.id, name: g.name ?? '' }));

    s.set('accounts', accounts);
    s.set('categories', filteredCategories);
    s.set('categoryGroups', filteredGroups);
  } catch (e) {
    if (__DEV__) console.warn('[syncShortcutCache] failed:', e);
  }
}
