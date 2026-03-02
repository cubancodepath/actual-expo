import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = 'actual-prefs';

export type Prefs = {
  serverUrl: string;
  token: string;
  fileId: string;
  groupId: string;
  encryptKeyId?: string;
  lastSyncedTimestamp?: string;
};

export async function loadPrefs(): Promise<Partial<Prefs>> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Prefs>;
  } catch {
    return {};
  }
}

export async function savePrefs(prefs: Partial<Prefs>): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
