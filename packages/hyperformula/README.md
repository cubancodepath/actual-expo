# hyperformula (Hermes-safe re-implementation)

> **This is NOT the [HyperFormula](https://hyperformula.handsontable.com/) engine
> published on npm.** It is a small, dependency-free, clean-room re-implementation
> of the _subset_ of HyperFormula's public API that Actual's "Excel formulas"
> feature relies on (rule `formula` actions and Reports Formula cards).

## Why it exists

The real HyperFormula parses formulas with [Chevrotain](https://chevrotain.io/),
whose recursive-descent generated parser overflows the native call stack on
**Hermes** (React Native's engine caps native frames at ~128). That makes the npm
package unusable on device. This package provides the identical API surface Actual
calls, backed by a hand-written tokenizer + bounded recursive-descent parser that
never approaches the Hermes frame limit.

## Scope

Implemented to match HyperFormula behaviour:

- Static: `HyperFormula.getRegisteredLanguagesCodes()`, `registerLanguage()`,
  `registerFunctionPlugin()`, `buildEmpty(config)`.
- Instance: `addSheet`, `getSheetId`, `addNamedExpression`, `setCellContents`,
  `getCellValue`, `getSheetValues`, `destroy`.
- Plugin SDK: `FunctionPlugin`, `SimpleRangeValue`, `CellError`,
  `DetailedCellError`, `EmptyValue`, `ErrorType`, `FunctionArgumentType`,
  `ArraySize`, plus the `InterpreterState` / `ProcedureAst` types.
- The ~117 built-in functions documented for Actual's formula feature.

Out of scope (Actual does not use it): multi-cell references, cross-sheet refs,
CRUD/undo, array arithmetic/vectorization beyond spilled function results,
volatile-cell recalculation, and the ~280 other HyperFormula built-ins.

## Provenance & licence

Function semantics were derived by reading HyperFormula v3.3.0 source
(`hyperformula-master/` in this workspace). Because it derives from GPLv3 source,
this package is licensed **GPL-3.0-only** — consistent with the `licenseKey:
'gpl-v3'` Actual already passes to `buildEmpty`.

**Zero runtime dependencies** is a hard rule: nothing third-party may reach Hermes
through this package.
