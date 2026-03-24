/**
 * Action class — validates and executes rule actions.
 * Ported from loot-core/src/server/rules/action.ts
 *
 * Uses Handlebars for templates and a lightweight formula evaluator
 * instead of HyperFormula (incompatible with Hermes).
 */

import * as Handlebars from "handlebars";
import { format, isValid, parseISO } from "date-fns";

// Ensure helpers are registered
import "./handlebars-helpers";
import { evaluateFormula, amountToInteger } from "./formula";
import { assert, FIELD_TYPES } from "./rule-utils";

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

            // Build variable map for formula
            const variables: Record<string, number> = {};
            for (const key of Object.keys(object)) {
              const val = object[key];
              if (typeof val === "number") variables[key] = val;
              else if (typeof val === "string") variables[key] = 0;
            }
            variables.today = 0; // placeholder

            const result = evaluateFormula(this.options.formula as string, variables);

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
              const variables: Record<string, number> = {};
              for (const key of Object.keys(object)) {
                if (typeof object[key] === "number") variables[key] = object[key] as number;
              }
              const result = evaluateFormula(this.options.formula as string, variables);
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
