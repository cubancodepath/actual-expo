/**
 * Registers the enUS language and the custom-functions plugin on the formula
 * engine. Idempotent — safe to call from every entry point that evaluates
 * formulas (rules actions, Reports formula cards). Mirrors upstream's
 * desktop-client `bootstrapHyperFormula`.
 */

import { HyperFormula } from "hyperformula";
import enUS from "hyperformula/i18n/languages/enUS";

import { CustomFunctionsPlugin, customFunctionsTranslations } from "./customFunctions";

let done = false;

export function bootstrapFormulas(): void {
  if (done) return;
  if (!HyperFormula.getRegisteredLanguagesCodes().includes("enUS")) {
    HyperFormula.registerLanguage("enUS", enUS);
  }
  HyperFormula.registerFunctionPlugin(CustomFunctionsPlugin, customFunctionsTranslations);
  done = true;
}
