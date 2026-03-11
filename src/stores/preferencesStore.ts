import { create } from 'zustand';
import { registerStore } from './storeRegistry';
import { getAllPreferences, setPreference } from '../preferences';
import { PREFERENCE_DEFAULTS, type PreferenceKey } from '../preferences/types';
import { setNumberFormat, setCurrencyConfig, type NumberFormatType } from '../lib/format';
import { setDateFormat } from '../lib/date';
import { getCurrency } from '../lib/currencies';

type PreferencesState = {
  dateFormat: string;
  numberFormat: string;
  firstDayOfWeekIdx: string;
  hideFraction: string;
  defaultCurrencyCode: string;
  currencySymbolPosition: string;
  currencySpaceBetweenAmountAndSymbol: string;
  defaultCurrencyCustomSymbol: string;
  load(): Promise<void>;
  set(key: PreferenceKey, value: string): Promise<void>;
};

/** Sync module-level formatters with current preferences. */
function applyFormatConfig(prefs: {
  numberFormat: string;
  hideFraction: string;
  dateFormat: string;
  defaultCurrencyCode: string;
  defaultCurrencyCustomSymbol: string;
  currencySymbolPosition: string;
  currencySpaceBetweenAmountAndSymbol: string;
}) {
  setNumberFormat({
    format: prefs.numberFormat as NumberFormatType,
    hideFraction: prefs.hideFraction === 'true',
  });
  setDateFormat(prefs.dateFormat);

  const currency = getCurrency(prefs.defaultCurrencyCode || '');
  const effectiveSymbol = prefs.defaultCurrencyCustomSymbol || currency.symbol;
  setCurrencyConfig({
    symbol: effectiveSymbol,
    svgSymbol: prefs.defaultCurrencyCustomSymbol ? undefined : currency.svgSymbol,
    position: (prefs.currencySymbolPosition || 'before') as 'before' | 'after',
    spaceBetween: prefs.currencySpaceBetweenAmountAndSymbol === 'true',
  });
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...PREFERENCE_DEFAULTS,

  async load() {
    const prefs = await getAllPreferences();
    set(prefs);
    applyFormatConfig(prefs);
  },

  async set(key, value) {
    // Apply format config BEFORE updating store state so that when
    // subscribers re-render, the formatters are already up to date.
    const next = { ...get(), [key]: value };
    applyFormatConfig(next);
    set({ [key]: value });
    await setPreference(key, value);
  },
}));

registerStore('preferences', ['preferences', 'prefs'], () =>
  usePreferencesStore.getState().load(),
);
