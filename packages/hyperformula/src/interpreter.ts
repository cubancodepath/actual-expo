/**
 * Tree-walking interpreter. Errors are values (CellError) that propagate through
 * operators and functions — IFERROR/ISERROR intercept them. Unknown functions
 * and named expressions become #NAME?.
 *
 * The walk shares the parser's bounded-recursion property: formulas are shallow,
 * and the parser already rejects pathological nesting, so the interpreter can
 * never be driven deeper than MAX_DEPTH levels.
 */

import {
  CoercionContext,
  coerceScalarToNumber,
  coerceScalarToString,
  compareScalars,
} from "./coercion";
import { CellError, ErrorType } from "./errors";
import { getFunctionEntry, PluginInstanceCache } from "./function-registry";
import { EngineConfig, EngineInterpreter } from "./plugin";
import { Ast, AstNodeType } from "./parser";
import { InterpreterState } from "./typings/interpreter/InterpreterState";
import {
  EmptyValue,
  InternalScalarValue,
  InterpreterValue,
  SimpleRangeValue,
  isSimpleRangeValue,
} from "./values";

const ARITHMETIC = new Set([
  AstNodeType.PLUS_OP,
  AstNodeType.MINUS_OP,
  AstNodeType.TIMES_OP,
  AstNodeType.DIV_OP,
  AstNodeType.POWER_OP,
]);

const COMPARISON = new Set([
  AstNodeType.EQUALS_OP,
  AstNodeType.NOT_EQUAL_OP,
  AstNodeType.GREATER_THAN_OP,
  AstNodeType.LESS_THAN_OP,
  AstNodeType.GREATER_THAN_OR_EQUAL_OP,
  AstNodeType.LESS_THAN_OR_EQUAL_OP,
]);

export class Interpreter implements EngineInterpreter {
  readonly coercionCtx: CoercionContext;
  private readonly pluginCache: PluginInstanceCache;

  constructor(
    readonly config: EngineConfig,
    private readonly namedExpressions: Map<string, InternalScalarValue>,
  ) {
    this.coercionCtx = {
      dateFormats: config.dateFormats,
      caseSensitive: config.caseSensitive,
    };
    this.pluginCache = new PluginInstanceCache(this);
  }

  evaluateAst(ast: Ast, state: InterpreterState): InterpreterValue {
    switch (ast.type) {
      case AstNodeType.NUMBER:
        return ast.value;
      case AstNodeType.STRING:
        return ast.value;
      case AstNodeType.EMPTY:
        return EmptyValue;
      case AstNodeType.ERROR:
        return ast.error;
      case AstNodeType.NAMED_EXPRESSION: {
        const key = ast.expressionName.toLowerCase();
        if (this.namedExpressions.has(key)) {
          return this.namedExpressions.get(key)!;
        }
        return new CellError(ErrorType.NAME, `Unknown name: ${ast.expressionName}`);
      }
      case AstNodeType.PARENTHESIS:
        return this.evaluateAst(ast.expression, state);
      case AstNodeType.ARRAY:
        return this.evaluateArray(ast, state);
      case AstNodeType.FUNCTION_CALL:
        return this.evaluateFunction(ast, state);
      case AstNodeType.MINUS_UNARY_OP:
      case AstNodeType.PLUS_UNARY_OP:
      case AstNodeType.PERCENT_OP:
        return this.evaluateUnary(ast.type, this.evalToScalar(ast.value, state));
      default:
        return this.evaluateBinary(ast, state);
    }
  }

  private evaluateFunction(
    ast: Extract<Ast, { type: AstNodeType.FUNCTION_CALL }>,
    state: InterpreterState,
  ): InterpreterValue {
    const entry = getFunctionEntry(ast.procedureName);
    if (!entry) {
      return new CellError(ErrorType.NAME, `Unknown function: ${ast.procedureName}`);
    }
    const instance = this.pluginCache.get(entry.pluginClass);
    const method = (instance as unknown as Record<string, unknown>)[entry.metadata.method];
    if (typeof method !== "function") {
      return new CellError(ErrorType.NAME, `Unknown function: ${ast.procedureName}`);
    }
    return (method as (a: Ast, s: InterpreterState) => InterpreterValue).call(instance, ast, state);
  }

  private evaluateArray(
    ast: Extract<Ast, { type: AstNodeType.ARRAY }>,
    state: InterpreterState,
  ): InterpreterValue {
    const data: InternalScalarValue[][] = ast.args.map((row) =>
      row.map((el) => this.evalToScalar(el, state)),
    );
    return SimpleRangeValue.onlyValues(data);
  }

  /** Evaluate an AST and reduce any range to its top-left scalar. */
  private evalToScalar(ast: Ast, state: InterpreterState): InternalScalarValue {
    const v = this.evaluateAst(ast, state);
    if (isSimpleRangeValue(v)) {
      const tl = v.topLeft();
      return tl === undefined ? EmptyValue : tl;
    }
    return v;
  }

  private evaluateUnary(type: AstNodeType, value: InternalScalarValue): InterpreterValue {
    const n = coerceScalarToNumber(value, this.coercionCtx);
    if (n instanceof CellError) {
      return n;
    }
    if (type === AstNodeType.MINUS_UNARY_OP) {
      return -n;
    }
    if (type === AstNodeType.PERCENT_OP) {
      return n / 100;
    }
    return n;
  }

  private evaluateBinary(ast: Ast, state: InterpreterState): InterpreterValue {
    if (ast.type === AstNodeType.NUMBER || ast.type === AstNodeType.STRING || !("left" in ast)) {
      // Shouldn't happen — evaluateAst routes only binary nodes here.
      return new CellError(ErrorType.ERROR, "Invalid expression");
    }

    const left = this.evalToScalar(ast.left, state);
    const right = this.evalToScalar(ast.right, state);

    if (ARITHMETIC.has(ast.type)) {
      const ln = coerceScalarToNumber(left, this.coercionCtx);
      if (ln instanceof CellError) {
        return ln;
      }
      const rn = coerceScalarToNumber(right, this.coercionCtx);
      if (rn instanceof CellError) {
        return rn;
      }
      return this.arithmetic(ast.type, ln, rn);
    }

    if (ast.type === AstNodeType.CONCATENATE_OP) {
      const ls = coerceScalarToString(left);
      if (ls instanceof CellError) {
        return ls;
      }
      const rs = coerceScalarToString(right);
      if (rs instanceof CellError) {
        return rs;
      }
      return ls + rs;
    }

    if (COMPARISON.has(ast.type)) {
      const cmp = compareScalars(left, right, this.coercionCtx);
      if (cmp instanceof CellError) {
        return cmp;
      }
      return this.comparison(ast.type, cmp);
    }

    return new CellError(ErrorType.ERROR, "Unknown operator");
  }

  private arithmetic(type: AstNodeType, a: number, b: number): InterpreterValue {
    switch (type) {
      case AstNodeType.PLUS_OP:
        return a + b;
      case AstNodeType.MINUS_OP:
        return a - b;
      case AstNodeType.TIMES_OP:
        return a * b;
      case AstNodeType.DIV_OP:
        if (b === 0) {
          return new CellError(ErrorType.DIV_BY_ZERO, "Division by zero");
        }
        return a / b;
      case AstNodeType.POWER_OP: {
        const r = Math.pow(a, b);
        if (Number.isNaN(r) || !Number.isFinite(r)) {
          return new CellError(ErrorType.NUM, "Invalid power");
        }
        return r;
      }
      default:
        return new CellError(ErrorType.ERROR, "Unknown operator");
    }
  }

  private comparison(type: AstNodeType, cmp: number): boolean {
    switch (type) {
      case AstNodeType.EQUALS_OP:
        return cmp === 0;
      case AstNodeType.NOT_EQUAL_OP:
        return cmp !== 0;
      case AstNodeType.GREATER_THAN_OP:
        return cmp > 0;
      case AstNodeType.LESS_THAN_OP:
        return cmp < 0;
      case AstNodeType.GREATER_THAN_OR_EQUAL_OP:
        return cmp >= 0;
      case AstNodeType.LESS_THAN_OR_EQUAL_OP:
        return cmp <= 0;
      default:
        return false;
    }
  }
}
