/**
 * The HyperFormula facade — the public engine object. Implements only the API
 * surface Actual calls (see rules/action.ts and reports formula cards):
 *
 *   HyperFormula.buildEmpty(config)
 *     → addSheet / getSheetId / addNamedExpression / setCellContents
 *     → getCellValue / getSheetValues → destroy
 *
 * A single sheet with a single formula cell is the only pattern exercised, but
 * the storage model supports multiple sheets/cells and spilled array results.
 */

import { parseDateToSerial } from "./dates";
import { CellError, DetailedCellError, ERROR_DISPLAY, ErrorType } from "./errors";
import { registerBuiltinPlugins } from "./functions";
import { PluginClass, registerFunctionPlugin as registryRegister } from "./function-registry";
import { Interpreter } from "./interpreter";
import { LanguageDefinition } from "./i18n/enUS";
import { EngineConfig, FunctionTranslationsPackage } from "./plugin";
import { Ast, parseFormula } from "./parser";
import {
  EmptyValue,
  InternalScalarValue,
  RawScalarValue,
  SimpleRangeValue,
  isSimpleRangeValue,
} from "./values";

export type SimpleCellAddress = { sheet: number; col: number; row: number };

export type BuildConfig = {
  licenseKey?: string;
  language?: string;
  localeLang?: string;
  dateFormats?: string[];
  caseSensitive?: boolean;
  context?: unknown;
};

/** What getCellValue / getSheetValues return to callers. */
export type ExportedCellValue = number | string | boolean | null | DetailedCellError;

type CellContent =
  | { kind: "formula"; body: string; ast?: Ast }
  | { kind: "literal"; value: InternalScalarValue };

const DEFAULT_DATE_FORMATS = ["DD/MM/YYYY", "YYYY-MM-DD", "YYYY/MM/DD"];

let builtinsRegistered = false;
function ensureBuiltins(): void {
  if (!builtinsRegistered) {
    registerBuiltinPlugins();
    builtinsRegistered = true;
  }
}

export class HyperFormula {
  private static languages = new Map<string, LanguageDefinition>();

  private config: EngineConfig;
  private sheetIds = new Map<string, number>();
  private sheetNames = new Map<number, string>();
  private nextSheetId = 0;
  private namedExpressions = new Map<string, InternalScalarValue>();
  // sheetId → (row,col key) → content
  private cells = new Map<number, Map<string, CellContent>>();
  private destroyed = false;

  private constructor(config: EngineConfig) {
    this.config = config;
  }

  // ── Static API ───────────────────────────────────────────────────────────

  static getRegisteredLanguagesCodes(): string[] {
    return Array.from(HyperFormula.languages.keys());
  }

  static registerLanguage(code: string, definition: LanguageDefinition): void {
    HyperFormula.languages.set(code, definition);
  }

  static registerFunctionPlugin(
    pluginClass: PluginClass,
    translations?: FunctionTranslationsPackage,
  ): void {
    ensureBuiltins();
    registryRegister(pluginClass, translations);
  }

  static buildEmpty(config: BuildConfig = {}): HyperFormula {
    ensureBuiltins();
    return new HyperFormula({
      context: config.context,
      language: config.language ?? "enUS",
      localeLang: config.localeLang,
      licenseKey: config.licenseKey,
      dateFormats: config.dateFormats ?? DEFAULT_DATE_FORMATS,
      caseSensitive: config.caseSensitive ?? false,
    });
  }

  // ── Sheets ───────────────────────────────────────────────────────────────

  addSheet(name?: string): string {
    this.assertAlive();
    const sheetName = name ?? `Sheet${this.nextSheetId + 1}`;
    if (this.sheetIds.has(sheetName)) {
      throw new Error(`Sheet named "${sheetName}" already exists`);
    }
    const id = this.nextSheetId++;
    this.sheetIds.set(sheetName, id);
    this.sheetNames.set(id, sheetName);
    this.cells.set(id, new Map());
    return sheetName;
  }

  getSheetId(name: string): number | undefined {
    return this.sheetIds.get(name);
  }

  getSheetName(id: number): string | undefined {
    return this.sheetNames.get(id);
  }

  // ── Named expressions ──────────────────────────────────────────────────────

  addNamedExpression(name: string, value: RawScalarValue): void {
    this.assertAlive();
    this.namedExpressions.set(name.toLowerCase(), this.parseRawScalar(value));
  }

  // ── Cell contents ──────────────────────────────────────────────────────────

  setCellContents(address: SimpleCellAddress, contents: RawScalarValue[][]): void {
    this.assertAlive();
    for (let r = 0; r < contents.length; r++) {
      const row = contents[r];
      for (let c = 0; c < row.length; c++) {
        this.setCell(address.sheet, address.row + r, address.col + c, row[c]);
      }
    }
  }

  private setCell(sheet: number, row: number, col: number, raw: RawScalarValue): void {
    const grid = this.cells.get(sheet);
    if (!grid) {
      throw new Error(`Unknown sheet id ${sheet}`);
    }
    const key = `${row},${col}`;
    if (typeof raw === "string" && raw.startsWith("=")) {
      grid.set(key, { kind: "formula", body: raw.slice(1) });
    } else {
      grid.set(key, { kind: "literal", value: this.parseRawScalar(raw) });
    }
  }

  getCellValue(address: SimpleCellAddress): ExportedCellValue {
    this.assertAlive();
    const value = this.computeCell(address.sheet, address.row, address.col);
    if (value === undefined) {
      return null;
    }
    if (isSimpleRangeValue(value)) {
      return this.exportScalar(value.topLeft());
    }
    return this.exportScalar(value);
  }

  /** Full sheet values as a rectangular grid, spilling any array results. */
  getSheetValues(sheet: number): ExportedCellValue[][] {
    this.assertAlive();
    const grid = this.cells.get(sheet);
    if (!grid) {
      return [];
    }

    const placed = new Map<string, InternalScalarValue>();
    let maxRow = -1;
    let maxCol = -1;

    for (const key of grid.keys()) {
      const [row, col] = key.split(",").map(Number);
      const value = this.computeCell(sheet, row, col);
      if (value === undefined) {
        continue;
      }
      if (isSimpleRangeValue(value)) {
        for (let r = 0; r < value.height(); r++) {
          for (let c = 0; c < value.width(); c++) {
            const rr = row + r;
            const cc = col + c;
            placed.set(`${rr},${cc}`, value.data[r][c]);
            maxRow = Math.max(maxRow, rr);
            maxCol = Math.max(maxCol, cc);
          }
        }
      } else {
        placed.set(`${row},${col}`, value);
        maxRow = Math.max(maxRow, row);
        maxCol = Math.max(maxCol, col);
      }
    }

    const out: ExportedCellValue[][] = [];
    for (let r = 0; r <= maxRow; r++) {
      const row: ExportedCellValue[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const v = placed.get(`${r},${c}`);
        row.push(v === undefined ? null : this.exportScalar(v));
      }
      out.push(row);
    }
    return out;
  }

  destroy(): void {
    this.destroyed = true;
    this.sheetIds.clear();
    this.sheetNames.clear();
    this.namedExpressions.clear();
    this.cells.clear();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private computeCell(
    sheet: number,
    row: number,
    col: number,
  ): InternalScalarValue | SimpleRangeValue | undefined {
    const grid = this.cells.get(sheet);
    const content = grid?.get(`${row},${col}`);
    if (!content) {
      return undefined;
    }
    if (content.kind === "literal") {
      return content.value;
    }
    if (!content.ast) {
      try {
        content.ast = parseFormula(content.body);
      } catch (err) {
        // A parse failure surfaces as a generic error.
        return new CellError(ErrorType.ERROR, err instanceof Error ? err.message : String(err));
      }
    }
    const interpreter = new Interpreter(this.config, this.namedExpressions);
    return interpreter.evaluateAst(content.ast, {});
  }

  private exportScalar(value: InternalScalarValue | undefined): ExportedCellValue {
    if (value === undefined || value === EmptyValue) {
      return null;
    }
    if (value instanceof CellError) {
      return new DetailedCellError(value, ERROR_DISPLAY[value.type]);
    }
    return value;
  }

  private parseRawScalar(raw: RawScalarValue): InternalScalarValue {
    if (raw === null || raw === undefined) {
      return EmptyValue;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      return raw;
    }
    // string
    if (raw === "") {
      return "";
    }
    const lower = raw.toLowerCase();
    if (lower === "true") {
      return true;
    }
    if (lower === "false") {
      return false;
    }
    // Numeric string → number.
    const trimmed = raw.trim();
    if (trimmed !== "" && !Number.isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
    // Date string matching a configured format → serial.
    const serial = parseDateToSerial(raw, this.config.dateFormats);
    if (serial !== undefined) {
      return serial;
    }
    return raw;
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("HyperFormula instance has been destroyed");
    }
  }
}
