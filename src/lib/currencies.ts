/**
 * Currency data — ported from Actual Budget's loot-core/shared/currencies.ts.
 *
 * Number formats and symbol placement based on CLDR (Common Locale Data Repository) /
 * LDML (Locale Data Markup Language) locale conventions and Intl.NumberFormat standards.
 *
 * References:
 * https://www.localeplanet.com/icu/decimal-symbols.html
 * https://www.localeplanet.com/api/auto/currencymap.html
 */

import type { NumberFormatType } from './format';

export type SvgSymbolData = {
  viewBox: [number, number, number, number];
  paths: string[];
};

export type Currency = {
  code: string;
  symbol: string;
  name: string;
  decimalPlaces: number;
  numberFormat: NumberFormatType;
  symbolFirst: boolean;
  svgSymbol?: SvgSymbolData;
};

// prettier-ignore
export const currencies: Currency[] = [
  { code: '', name: 'None', symbol: '', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true,
    svgSymbol: { viewBox: [0, 0, 344.84, 299.91], paths: ['M342.14,140.96l2.7,2.54v-7.72c0-17-11.92-30.84-26.56-30.84h-23.41C278.49,36.7,222.69,0,139.68,0c-52.86,0-59.65,0-109.71,0,0,0,15.03,12.63,15.03,52.4v52.58h-27.68c-5.38,0-10.43-2.08-14.61-6.01l-2.7-2.54v7.72c0,17.01,11.92,30.84,26.56,30.84h18.44s0,29.99,0,29.99h-27.68c-5.38,0-10.43-2.07-14.61-6.01l-2.7-2.54v7.71c0,17,11.92,30.82,26.56,30.82h18.44s0,54.89,0,54.89c0,38.65-15.03,50.06-15.03,50.06h109.71c85.62,0,139.64-36.96,155.38-104.98h32.46c5.38,0,10.43,2.07,14.61,6l2.7,2.54v-7.71c0-17-11.92-30.83-26.56-30.83h-18.9c.32-4.88.49-9.87.49-15s-.18-10.11-.51-14.99h28.17c5.37,0,10.43,2.07,14.61,6.01ZM89.96,15.01h45.86c61.7,0,97.44,27.33,108.1,89.94l-153.96.02V15.01ZM136.21,284.93h-46.26v-89.98l153.87-.02c-9.97,56.66-42.07,88.38-107.61,90ZM247.34,149.96c0,5.13-.11,10.13-.34,14.99l-157.04.02v-29.99l157.05-.02c.22,4.84.33,9.83.33,15Z'] } },
  { code: 'ARS', name: 'Argentinian Peso', symbol: 'Arg$', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: true },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: true },
  { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br', decimalPlaces: 2, numberFormat: 'space-comma', symbolFirst: false },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr.', decimalPlaces: 2, numberFormat: 'apostrophe-dot', symbolFirst: true },
  { code: 'CNY', name: 'Yuan Renminbi', symbol: '¥', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'COP', name: 'Colombian Peso', symbol: 'Col$', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: true },
  { code: 'CRC', name: 'Costa Rican Colón', symbol: '₡', decimalPlaces: 2, numberFormat: 'space-comma', symbolFirst: true },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimalPlaces: 2, numberFormat: 'space-comma', symbolFirst: false },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: false },
  { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'ج.م', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: false },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: false },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'GTQ', name: 'Guatemalan Quetzal', symbol: 'Q', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimalPlaces: 2, numberFormat: 'space-comma', symbolFirst: false },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: true },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2, numberFormat: 'comma-dot-in', symbolFirst: true },
  { code: 'JMD', name: 'Jamaican Dollar', symbol: 'J$', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimalPlaces: 0, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs.', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'MDL', name: 'Moldovan Leu', symbol: 'L', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: false },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł', decimalPlaces: 2, numberFormat: 'space-comma', symbolFirst: false },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'ر.ق', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: false },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: false },
  { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: false },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimalPlaces: 2, numberFormat: 'space-comma', symbolFirst: false },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'ر.س', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: false },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimalPlaces: 2, numberFormat: 'space-comma', symbolFirst: false },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimalPlaces: 2, numberFormat: 'dot-comma', symbolFirst: true },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', decimalPlaces: 2, numberFormat: 'space-comma', symbolFirst: false },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, numberFormat: 'comma-dot', symbolFirst: true },
  { code: 'UZS', name: 'Uzbek Soum', symbol: 'UZS', decimalPlaces: 2, numberFormat: 'space-comma', symbolFirst: false },
];

export function getCurrency(code: string): Currency {
  return currencies.find((c) => c.code === code) || currencies[0];
}
