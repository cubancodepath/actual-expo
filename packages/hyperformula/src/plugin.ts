/**
 * FunctionPlugin base class + argument metadata, mirroring the slice of
 * HyperFormula's plugin SDK that Actual's CustomFunctionsPlugin (and our own
 * built-in plugins) use: `runFunction`, `metadata`, `this.config.context`, and
 * argument coercion driven by `FunctionArgumentType` + optionalArg/defaultValue.
 */

import {
  CoercionContext,
  coerceScalarToBoolean,
  coerceScalarToNumber,
  coerceScalarToString,
} from "./coercion";
import { CellError, ErrorType } from "./errors";
import { Ast } from "./parser";
import { InterpreterState } from "./typings/interpreter/InterpreterState";
import {
  ArraySize,
  EmptyValue,
  InternalScalarValue,
  InterpreterValue,
  SimpleRangeValue,
  isSimpleRangeValue,
} from "./values";

export enum FunctionArgumentType {
  STRING = "STRING",
  NUMBER = "NUMBER",
  BOOLEAN = "BOOLEAN",
  SCALAR = "SCALAR",
  NOERROR = "NOERROR",
  RANGE = "RANGE",
  INTEGER = "INTEGER",
  ANY = "ANY",
}

export type FunctionArgument = {
  argumentType: FunctionArgumentType;
  defaultValue?: InternalScalarValue;
  optionalArg?: boolean;
  minValue?: number;
  maxValue?: number;
  lessThan?: number;
  greaterThan?: number;
};

export type FunctionMetadata = {
  method: string;
  parameters?: FunctionArgument[];
  repeatLastArgs?: number;
  sizeOfResultArrayMethod?: string;
  expandRanges?: boolean;
};

export type ImplementedFunctions = Record<string, FunctionMetadata>;

export type FunctionTranslationsPackage = Record<string, Record<string, string>>;

/** What the interpreter exposes to plugins. */
export interface EngineInterpreter {
  readonly config: EngineConfig;
  readonly coercionCtx: CoercionContext;
  evaluateAst(ast: Ast, state: InterpreterState): InterpreterValue;
}

export type EngineConfig = {
  context?: unknown;
  language: string;
  localeLang?: string;
  licenseKey?: string;
  dateFormats: string[];
  caseSensitive: boolean;
};

export abstract class FunctionPlugin {
  static implementedFunctions: ImplementedFunctions;
  static aliases?: Record<string, string>;

  protected readonly interpreter: EngineInterpreter;
  protected readonly config: EngineConfig;

  constructor(interpreter: EngineInterpreter) {
    this.interpreter = interpreter;
    this.config = interpreter.config;
  }

  protected evaluateAst(ast: Ast, state: InterpreterState): InterpreterValue {
    return this.interpreter.evaluateAst(ast, state);
  }

  protected metadata(name: string): FunctionMetadata {
    const fns = (this.constructor as typeof FunctionPlugin).implementedFunctions;
    const m = fns[name];
    if (m === undefined) {
      throw new Error(`No metadata for function ${name}.`);
    }
    return m;
  }

  /**
   * Evaluate + coerce arguments per metadata, then call the implementation.
   * Returns the impl result, a CellError, or a SimpleRangeValue.
   */
  protected runFunction = (
    args: Ast[],
    state: InterpreterState,
    metadata: FunctionMetadata,
    impl: (...values: any[]) => InterpreterValue,
  ): InterpreterValue => {
    const evaluated: InterpreterValue[] = metadata.expandRanges
      ? this.expandArgs(args, state)
      : args.map((a) => this.evaluateAst(a, state));

    const argMetadata = this.buildArgMetadata(evaluated.length, metadata);

    if (!this.isArgCountValid(argMetadata, evaluated.length)) {
      return new CellError(ErrorType.NA, "Wrong number of arguments");
    }

    const coerced: any[] = [];
    for (let i = 0; i < argMetadata.length; i++) {
      const m = argMetadata[i];
      const raw = i < evaluated.length ? evaluated[i] : undefined;

      if (raw === undefined) {
        if (m.defaultValue !== undefined) {
          coerced.push(m.defaultValue);
        } else {
          coerced.push(undefined);
        }
        continue;
      }

      const c = this.coerceToType(raw, m);
      if (c === undefined) {
        if (m.optionalArg) {
          coerced.push(undefined);
          continue;
        }
        return new CellError(ErrorType.VALUE, "Wrong type of argument");
      }
      if (c instanceof CellError && m.argumentType !== FunctionArgumentType.SCALAR) {
        return c;
      }
      coerced.push(c);
    }

    return impl(...coerced);
  };

  private expandArgs(args: Ast[], state: InterpreterState): InterpreterValue[] {
    const out: InterpreterValue[] = [];
    for (const a of args) {
      const v = this.evaluateAst(a, state);
      if (isSimpleRangeValue(v)) {
        for (const s of v.valuesFromTopLeftCorner()) {
          out.push(s);
        }
      } else {
        out.push(v);
      }
    }
    return out;
  }

  private buildArgMetadata(count: number, metadata: FunctionMetadata): FunctionArgument[] {
    const params = metadata.parameters ? [...metadata.parameters] : [];
    const repeat = metadata.repeatLastArgs;
    if (repeat !== undefined && Number.isInteger(repeat) && repeat > 0) {
      while (count > params.length) {
        params.push(...params.slice(params.length - repeat));
      }
    }
    return params;
  }

  private isArgCountValid(argMetadata: FunctionArgument[], count: number): boolean {
    if (count > argMetadata.length) {
      return false;
    }
    if (count < argMetadata.length) {
      return argMetadata.slice(count).every((m) => m?.optionalArg || m?.defaultValue !== undefined);
    }
    return true;
  }

  private coerceToType(value: InterpreterValue, m: FunctionArgument): any | undefined {
    let scalar: InternalScalarValue;

    if (isSimpleRangeValue(value)) {
      if (
        m.argumentType === FunctionArgumentType.RANGE ||
        m.argumentType === FunctionArgumentType.ANY
      ) {
        return value;
      }
      const tl = value.topLeft();
      if (tl === undefined) {
        return undefined;
      }
      scalar = tl;
    } else {
      scalar = value;
    }

    switch (m.argumentType) {
      case FunctionArgumentType.NUMBER:
      case FunctionArgumentType.INTEGER: {
        const n = coerceScalarToNumber(scalar, this.interpreter.coercionCtx);
        if (n instanceof CellError) {
          return n;
        }
        if (m.maxValue !== undefined && n > m.maxValue) {
          return new CellError(ErrorType.NUM, "Value too large");
        }
        if (m.minValue !== undefined && n < m.minValue) {
          return new CellError(ErrorType.NUM, "Value too small");
        }
        if (m.lessThan !== undefined && n >= m.lessThan) {
          return new CellError(ErrorType.NUM, "Value too large");
        }
        if (m.greaterThan !== undefined && n <= m.greaterThan) {
          return new CellError(ErrorType.NUM, "Value too small");
        }
        if (m.argumentType === FunctionArgumentType.INTEGER && !Number.isInteger(n)) {
          return Math.trunc(n);
        }
        return n;
      }
      case FunctionArgumentType.STRING:
        return coerceScalarToString(scalar);
      case FunctionArgumentType.BOOLEAN:
        return coerceScalarToBoolean(scalar);
      case FunctionArgumentType.SCALAR:
      case FunctionArgumentType.NOERROR:
      case FunctionArgumentType.ANY:
        return scalar;
      case FunctionArgumentType.RANGE:
        if (scalar instanceof CellError) {
          return scalar;
        }
        return SimpleRangeValue.onlyValues([[scalar]]);
      default:
        return scalar;
    }
  }
}

export { ArraySize, EmptyValue, SimpleRangeValue };
