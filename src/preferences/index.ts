import { first, runQuery } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import { PREFERENCE_DEFAULTS, type PreferenceKey } from './types';

export async function getPreference(key: PreferenceKey): Promise<string> {
  const row = await first<{ value: string }>(
    'SELECT value FROM preferences WHERE id = ?',
    [key],
  );
  return row?.value ?? PREFERENCE_DEFAULTS[key];
}

export async function getAllPreferences(): Promise<Record<PreferenceKey, string>> {
  const rows = await runQuery<{ id: string; value: string }>(
    'SELECT id, value FROM preferences WHERE id IN (?, ?, ?, ?)',
    ['dateFormat', 'numberFormat', 'firstDayOfWeekIdx', 'hideFraction'],
  );
  const result = { ...PREFERENCE_DEFAULTS };
  for (const row of rows) {
    if (row.id in result) {
      result[row.id as PreferenceKey] = row.value;
    }
  }
  return result;
}

export async function setPreference(key: PreferenceKey, value: string): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: 'preferences',
      row: key,
      column: 'value',
      value,
    },
  ]);
}
