/**
 * Action class — validates and executes rule actions.
 * Ported from loot-core/src/server/rules/action.ts.
 *
 * Formulas are evaluated with our Hermes-safe `hyperformula` package (a drop-in
 * re-implementation of the HyperFormula API subset Actual uses — the real one
 * stack-overflows on Hermes). Templates use Handlebars.
 *
 * Numeric results follow upstream: formulas are treated as dollars, so a numeric
 * result is rescaled to integer cents with `amountToInteger` (×100) before it is
 * written to the field. Pair raw integer-cent fields (e.g. `amount`) with
 * `INTEGER_TO_AMOUNT(...)` inside the formula to work in dollars end to end.
 */

import * as Handlebars from "handlebars";
import { format, isValid, parseISO } from "date-fns";
import { HyperFormula } from "hyperformula";
import enUS from "hyperformula/i18n/languages/enUS";

// Ensure helpers are registered
import "./handlebars-helpers";
import {
  CustomFunctionsPlugin,
  customFunctionsTranslations,
} from "@/core/shared/formulas/customFunctions";
import { amountToInteger } from "@/core/shared/util";
import { assert, FIELD_TYPES } from "./rule-utils";

if (!HyperFormula.getRegisteredLanguagesCodes().includes("enUS")) {
  HyperFormula.registerLanguage("enUS", enUS);
}
HyperFormula.registerFunctionPlugin(CustomFunctionsPlugin, customFunctionsTranslations);

const ACTION_OPS = [
  "set",
  "set-split-amount",
  "link-schedule",
  "prepend-notes",
  "append-notes",
  "delete-transaction",
] as const;
type ActionOperator = (typeof ACTION_OPS)[number];

function currentDay(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export class Action {
  field: string | null;
  op: ActionOperator;
  options: Record<string, unknown> | undefined;
  rawValue: unknown;
  type: string;
  value: unknown;

  private handlebarsTemplate?: Handlebars.TemplateDelegate;

  constructor(op: string, field: string | null, value: unknown, options?: Record<string, unknown>) {
    assert(
      ACTION_OPS.includes(op as ActionOperator),
      "internal",
      `Invalid action operation: ${op}`,
    );

    const typedOp = op as ActionOperator;

    if (typedOp === "set") {
      const typeName = FIELD_TYPES.get(field ?? "");
      assert(typeName, "internal", `Invalid field for action: ${field}`);
      this.field = field;
      this.type = typeName;

      if (options?.template) {
        this.handlebarsTemplate = Handlebars.compile(options.template as string, {
          noEscape: true,
        });
        try {
          this.handlebarsTemplate({});
        } catch {
          assert(false, "invalid-template", "Invalid Handlebars template");
        }
      }
    } else if (typedOp === "set-split-amount") {
      this.field = null;
      this.type = "number";
    } else if (typedOp === "link-schedule") {
      this.field = null;
      this.type = "id";
    } else if (typedOp === "prepend-notes" || typedOp === "append-notes") {
      this.field = "notes";
      this.type = "id";
    } else {
      this.field = null;
      this.type = "string";
    }

    if (field === "account") {
      assert(value, "no-null", `Field cannot be empty: ${field}`);
    }

    this.op = typedOp;
    this.rawValue = value;
    this.value = value;
    this.options = options;
  }

  exec(object: Record<string, unknown>): void {
    switch (this.op) {
      case "set":
        if (this.options?.formula) {
          try {
            if (!object._ruleErrors) object._ruleErrors = [];
            const errors = object._ruleErrors as string[];

            const result = this.executeFormulaSync(this.options.formula as string, object);

            switch (this.type) {
              case "number": {
                const numValue = typeof result === "number" ? result : parseFloat(String(result));
                if (isNaN(numValue)) {
                  errors.push(
                    `Formula for "${this.field}" must produce a numeric value. Got: ${JSON.stringify(result)}`,
                  );
                } else {
                  object[this.field!] = numValue;
                }
                break;
              }
              case "string":
                object[this.field!] = String(result);
                break;
              case "date": {
                const parsed = parseISO(String(result));
                if (parsed && isValid(parsed)) {
                  object[this.field!] = format(parsed, "yyyy-MM-dd");
                } else {
                  errors.push(
                    `Formula for "${this.field}" must produce a valid date. Got: ${JSON.stringify(result)}`,
                  );
                }
                break;
              }
              case "boolean":
                object[this.field!] =
                  typeof result === "boolean" ? result : String(result).toLowerCase() === "true";
                break;
              default:
                break;
            }
          } catch (err) {
            const errors = (object._ruleErrors ?? []) as string[];
            object._ruleErrors = errors;
            errors.push(
              `Error executing formula for "${this.field}": ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        } else if (this.handlebarsTemplate) {
          object[this.field!] = this.handlebarsTemplate({
            ...object,
            today: currentDay(),
          });

          // Handlebars always returns a string — convert based on type
          switch (this.type) {
            case "number": {
              const numValue = parseFloat(object[this.field!] as string);
              object[this.field!] = isNaN(numValue) ? 0 : numValue;
              break;
            }
            case "date": {
              const parsed = parseISO(object[this.field!] as string);
              if (parsed && isValid(parsed)) {
                object[this.field!] = format(parsed, "yyyy-MM-dd");
              } else {
                console.error(
                  `[rules] Invalid date from template for "${this.field}":`,
                  object[this.field!],
                );
                object[this.field!] = "9999-12-31";
              }
              break;
            }
            case "boolean":
              object[this.field!] = object[this.field!] === "true";
              break;
          }
        } else {
          object[this.field!] = this.value;
        }

        if (this.field === "payee_name") {
          object.payee = "new";
        }
        break;

      case "set-split-amount":
        switch ((this.options as Record<string, unknown>)?.method) {
          case "fixed-amount":
            object.amount = this.value;
            break;
          case "formula":
            if (!object._ruleErrors) object._ruleErrors = [];
            if (!this.options?.formula) {
              (object._ruleErrors as string[]).push(
                "Formula method selected but no formula specified",
              );
              break;
            }
            try {
              const result = this.executeFormulaSync(this.options.formula as string, object);
              const numValue = typeof result === "number" ? result : parseFloat(String(result));
              if (isNaN(numValue)) {
                (object._ruleErrors as string[]).push(
                  `Formula for split amount must produce numeric. Got: ${JSON.stringify(result)}`,
                );
              } else {
                object.amount = numValue;
              }
            } catch (err) {
              (object._ruleErrors as string[]).push(
                `Error in split formula: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
            break;
        }
        break;

      case "link-schedule":
        object.schedule = this.value;
        break;

      case "prepend-notes":
        object[this.field!] = object[this.field!]
          ? `${this.value}${object[this.field!]}`
          : this.value;
        break;

      case "append-notes":
        object[this.field!] = object[this.field!]
          ? `${object[this.field!]}${this.value}`
          : this.value;
        break;

      case "delete-transaction":
        object.tombstone = 1;
        break;
    }
  }

  /**
   * Evaluate a `=…` formula against a transaction. Transaction fields become
   * named expressions; the formula lives in a single cell (A1). Mirrors
   * upstream's HyperFormula flow, backed by the Hermes-safe engine.
   */
  private executeFormulaSync(formula: string, transaction: Record<string, unknown>): unknown {
    if (!formula || !formula.startsWith("=")) {
      throw new Error("Formula must start with =");
    }

    let hfInstance: HyperFormula | null = null;
    try {
      hfInstance = HyperFormula.buildEmpty({
        licenseKey: "gpl-v3",
        language: "enUS",
        dateFormats: ["DD/MM/YYYY", "YYYY-MM-DD", "YYYY/MM/DD"],
        context: {
          balanceOfPrefetch:
            (transaction._balanceOfPrefetched as Map<string, number> | undefined) ?? new Map(),
        },
      });

      const sheetName = hfInstance.addSheet("Sheet1");
      const sheetId = hfInstance.getSheetId(sheetName);
      if (sheetId === undefined) {
        throw new Error("Failed to create sheet");
      }

      const fieldValues: Record<string, unknown> = {
        ...transaction,
        today: currentDay(),
        account_name: (transaction._account_name as string) || "",
        category_name: (transaction._category_name as string) || "",
      };

      for (const key of Object.keys(fieldValues)) {
        if (key === "_balanceOfPrefetched") continue;
        const raw = fieldValues[key];
        const cellValue =
          raw === undefined || raw === null || typeof raw === "object"
            ? ""
            : (raw as string | number | boolean);
        hfInstance.addNamedExpression(key, cellValue);
      }

      hfInstance.setCellContents({ sheet: sheetId, col: 0, row: 0 }, [[formula]]);
      const cellValue = hfInstance.getCellValue({ sheet: sheetId, col: 0, row: 0 });

      if (cellValue && typeof cellValue === "object" && "type" in cellValue) {
        throw new Error(`Formula error: ${cellValue.message}`);
      }

      // Upstream semantics: a numeric result is a dollar amount, rescaled to
      // integer cents. The Math.round(...*100)/100 guards float noise before
      // amountToInteger multiplies by 100.
      if (typeof cellValue === "number") {
        return amountToInteger(Math.round(cellValue * 100) / 100);
      }

      return cellValue;
    } finally {
      try {
        hfInstance?.destroy();
      } catch (err) {
        console.error("[rules] Error destroying formula engine instance:", err);
      }
    }
  }

  serialize(): Record<string, unknown> {
    return {
      op: this.op,
      field: this.field,
      value: this.value,
      type: this.type,
      ...(this.options ? { options: this.options } : {}),
    };
  }
}
