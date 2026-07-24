/**
 * Minimal enUS language pack. The real HyperFormula pack maps ~400 function
 * names and error strings; our engine registers built-ins by their canonical
 * English names and only needs `registerLanguage('enUS', enUS)` to succeed, so
 * an identity-ish stub is sufficient.
 */

export type LanguageDefinition = {
  langCode: string;
  functions?: Record<string, string>;
  errors?: Record<string, string>;
  ui?: Record<string, string>;
};

const enUS: LanguageDefinition = {
  langCode: "enUS",
  functions: {},
  errors: {
    DIV_BY_ZERO: "#DIV/0!",
    ERROR: "#ERROR!",
    NA: "#N/A",
    NAME: "#NAME?",
    NUM: "#NUM!",
    REF: "#REF!",
    VALUE: "#VALUE!",
    CYCLE: "#CYCLE!",
  },
};

export default enUS;
