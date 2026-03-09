/**
 * Goal/template module — barrel re-exports.
 *
 * Pure functions (parsing, inference, serialization) live in `./parse`.
 * DB/CRDT persistence functions live in `./persist`.
 * This barrel re-exports both for backward compatibility.
 */

export { parseGoalDef, inferGoalFromDef, templateToNoteLine, templatesToNoteText } from './parse';
export { getGoalTemplates, setGoalTemplates, setGoalResult } from './persist';
