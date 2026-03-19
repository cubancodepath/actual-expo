/**
 * Global spreadsheet instance.
 *
 * Single instance shared across the app. Created once, cleared on budget switch.
 */

import { Spreadsheet } from "./spreadsheet";

let _instance: Spreadsheet | null = null;

export function getSpreadsheet(): Spreadsheet {
  if (!_instance) {
    _instance = new Spreadsheet();
  }
  return _instance;
}

export function resetSpreadsheet(): void {
  _instance?.clear();
  _instance = null;
}
