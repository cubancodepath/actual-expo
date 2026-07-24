// Faithful port of loot-core src/server/aql/schema-helpers.ts.
// Type conversion + row conforming between AQL values and DB representation:
// date↔YYYYMMDD integer, boolean↔0/1, json↔string.
import { fromDateRepr, toDateRepr } from "@/core/server/models";
import { dayFromDate } from "@/core/shared/months";

export type FieldDesc = {
  type: string;
  ref?: string;
  required?: boolean;
  default?: unknown;
};
export type TableSchema = Record<string, FieldDesc>;
export type Schema = Record<string, TableSchema>;
export type SchemaConfig = {
  views?: Record<string, { fields?: Record<string, string> }>;
  [key: string]: unknown;
};

function isRequired(name: string, fieldDesc: FieldDesc) {
  return fieldDesc.required || name === "id";
}

// This doesn't just convert, it casts. See integer handling.
export function convertInputType(value: unknown, type: string): unknown {
  if (value === undefined) {
    throw new Error("Query value cannot be undefined");
  } else if (value === null) {
    if (type === "boolean") {
      return 0;
    }

    return null;
  }

  switch (type) {
    case "date":
      if (value instanceof Date) {
        return toDateRepr(dayFromDate(value));
      } else if (
        typeof value !== "string" ||
        value.match(/^\d{4}-\d{2}-\d{2}$/) == null ||
        value < "1995-01-01"
      ) {
        throw new Error("Invalid date: " + value);
      }

      return toDateRepr(value);
    case "date-month":
      return toDateRepr((value as string).slice(0, 7));
    case "date-year":
      return toDateRepr((value as string).slice(0, 4));
    case "boolean":
      return value ? 1 : 0;
    case "id":
      if (typeof value !== "string" && value !== null) {
        throw new Error("Invalid id, must be string: " + value);
      }
      return value;
    case "integer":
      if (typeof value === "number" && Number.isInteger(value)) {
        return value;
      } else {
        throw new Error("Can't convert to integer: " + JSON.stringify(value));
      }
    case "json":
      return JSON.stringify(value);
    default:
  }
  return value;
}

export function convertOutputType(value: unknown, type: string): unknown {
  if (value === null) {
    if (type === "boolean") {
      return false;
    }
    return null;
  }

  switch (type) {
    case "date":
      return fromDateRepr(value as number);
    case "date-month":
      return fromDateRepr(value as number).slice(0, 7);
    case "date-year":
      return fromDateRepr(value as number).slice(0, 4);
    case "boolean":
      return value === 1;
    case "json":
    case "json/fallback":
      try {
        return JSON.parse(value as string);
      } catch {
        return type === "json/fallback" ? value : null;
      }
    default:
  }

  return value;
}

export function conform(
  schema: Schema,
  schemaConfig: SchemaConfig,
  table: string,
  obj: Record<string, unknown>,
  { skipNull = false }: { skipNull?: boolean } = {},
): Record<string, unknown> {
  const tableSchema = schema[table];
  if (tableSchema == null) {
    throw new Error(`Table "${table}" does not exist`);
  }

  const views = schemaConfig.views || {};

  // Rename fields if necessary
  const fieldRef = (field: string) => {
    if (views[table] && views[table].fields) {
      return views[table].fields![field] || field;
    }
    return field;
  };

  return Object.fromEntries(
    Object.keys(obj)
      .map((field): [string, unknown] | null => {
        // Fields that start with an underscore are ignored
        if (field[0] === "_") {
          return null;
        }

        const fieldDesc = tableSchema[field];
        if (fieldDesc == null) {
          throw new Error(
            `Field "${field}" does not exist on table ${table}: ${JSON.stringify(obj)}`,
          );
        }

        if (isRequired(field, fieldDesc) && obj[field] == null) {
          throw new Error(`"${field}" is required for table "${table}": ${JSON.stringify(obj)}`);
        }

        // treat undefined as missing
        if (obj[field] === undefined) {
          return null;
        }

        // This option removes null values (see `convertForInsert`)
        if (skipNull && obj[field] == null) {
          return null;
        }

        return [fieldRef(field), convertInputType(obj[field], fieldDesc.type)];
      })
      .filter((entry): entry is [string, unknown] => entry != null),
  );
}

export function convertForInsert(
  schema: Schema,
  schemaConfig: SchemaConfig,
  table: string,
  rawObj: Record<string, unknown>,
): Record<string, unknown> {
  const obj = { ...rawObj };

  const tableSchema = schema[table];
  if (tableSchema == null) {
    throw new Error(`Error inserting: table "${table}" does not exist`);
  }

  // Inserting checks all the fields in the table and adds any default
  // values necessary
  Object.keys(tableSchema).forEach((field) => {
    const fieldDesc = tableSchema[field];

    if (obj[field] == null) {
      if (fieldDesc.default !== undefined) {
        obj[field] =
          typeof fieldDesc.default === "function" ? fieldDesc.default() : fieldDesc.default;
      } else if (isRequired(field, fieldDesc)) {
        throw new Error(`"${field}" is required for table "${table}": ${JSON.stringify(obj)}`);
      }
    }
  });

  return conform(schema, schemaConfig, table, obj, { skipNull: true });
}

export function convertForUpdate(
  schema: Schema,
  schemaConfig: SchemaConfig,
  table: string,
  rawObj: Record<string, unknown>,
): Record<string, unknown> {
  const obj = { ...rawObj };

  const tableSchema = schema[table];
  if (tableSchema == null) {
    throw new Error(`Error updating: table "${table}" does not exist`);
  }

  return conform(schema, schemaConfig, table, obj);
}

export function convertFromSelect(
  schema: Schema,
  schemaConfig: SchemaConfig,
  table: string,
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const tableSchema = schema[table];
  if (tableSchema == null) {
    throw new Error(`Table "${table}" does not exist`);
  }

  const fields = Object.keys(tableSchema);
  const result: Record<string, unknown> = {};
  for (let i = 0; i < fields.length; i++) {
    const fieldName = fields[i];
    const fieldDesc = tableSchema[fieldName];

    result[fieldName] = convertOutputType(obj[fieldName], fieldDesc.type);
  }
  return result;
}
