/**
 * Synthetic source id for the unallocated "To Budget" pool when it is offered as
 * a funding source (cover-overspent flow). Never collides with real category ids.
 */
export const TO_BUDGET_ID = "__to_budget__";

/** Placeholder handler for budget actions that aren't wired up yet. */
export const noop = () => {};
