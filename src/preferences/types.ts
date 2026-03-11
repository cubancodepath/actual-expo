export type DateFormatOption =
  | 'MM/dd/yyyy'
  | 'dd/MM/yyyy'
  | 'yyyy-MM-dd'
  | 'MM.dd.yyyy'
  | 'dd.MM.yyyy'
  | 'dd-MM-yyyy';

export type NumberFormatOption =
  | 'comma-dot'
  | 'dot-comma'
  | 'space-comma'
  | 'apostrophe-dot';

export type PreferenceKey =
  | 'dateFormat'
  | 'numberFormat'
  | 'firstDayOfWeekIdx'
  | 'hideFraction'
  | 'defaultCurrencyCode'
  | 'currencySymbolPosition'
  | 'currencySpaceBetweenAmountAndSymbol'
  | 'defaultCurrencyCustomSymbol';

export const PREFERENCE_DEFAULTS: Record<PreferenceKey, string> = {
  dateFormat: 'MM/dd/yyyy',
  numberFormat: 'comma-dot',
  firstDayOfWeekIdx: '0',
  hideFraction: 'false',
  defaultCurrencyCode: '',
  currencySymbolPosition: 'before',
  currencySpaceBetweenAmountAndSymbol: 'false',
  defaultCurrencyCustomSymbol: '',
};

export const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string; example: string }[] = [
  { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY', example: '03/04/2026' },
  { value: 'dd/MM/yyyy', label: 'DD/MM/YYYY', example: '04/03/2026' },
  { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD', example: '2026-03-04' },
  { value: 'MM.dd.yyyy', label: 'MM.DD.YYYY', example: '03.04.2026' },
  { value: 'dd.MM.yyyy', label: 'DD.MM.YYYY', example: '04.03.2026' },
  { value: 'dd-MM-yyyy', label: 'DD-MM-YYYY', example: '04-03-2026' },
];

export const NUMBER_FORMAT_OPTIONS: { value: NumberFormatOption; label: string; example: string }[] = [
  { value: 'comma-dot', label: 'Comma & Dot', example: '1,000.33' },
  { value: 'dot-comma', label: 'Dot & Comma', example: '1.000,33' },
  { value: 'space-comma', label: 'Space & Comma', example: '1 000,33' },
  { value: 'apostrophe-dot', label: 'Apostrophe & Dot', example: "1'000.33" },
];

export const DAY_OF_WEEK_OPTIONS: { value: string; label: string }[] = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];
