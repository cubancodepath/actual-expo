/**
 * Registers every built-in plugin through the same path Actual's custom plugin
 * uses. Called once, lazily, from HyperFormula.buildEmpty / registerFunctionPlugin.
 */

import { registerFunctionPlugin } from "../function-registry";
import { DatePlugin } from "./date";
import { FinancialPlugin } from "./financial";
import { InfoPlugin } from "./info";
import { LogicalPlugin } from "./logical";
import { LookupPlugin } from "./lookup";
import { MathPlugin } from "./math";
import { StatisticsPlugin } from "./statistics";
import { TextPlugin } from "./text";

export function registerBuiltinPlugins(): void {
  for (const plugin of [
    MathPlugin,
    LogicalPlugin,
    TextPlugin,
    DatePlugin,
    StatisticsPlugin,
    LookupPlugin,
    InfoPlugin,
    FinancialPlugin,
  ]) {
    registerFunctionPlugin(plugin);
  }
}
