export type FeatureFlag =
  | 'goalTemplatesEnabled'
  | 'goalTemplatesUIEnabled'
  | 'actionTemplating'
  | 'formulaMode'
  | 'currency'
  | 'crossoverReport'
  | 'customThemes'
  | 'budgetAnalysisReport'
  | 'payeeLocations';

export const FEATURE_FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  goalTemplatesEnabled: false,
  goalTemplatesUIEnabled: false,
  actionTemplating: false,
  formulaMode: false,
  currency: false,
  crossoverReport: false,
  customThemes: false,
  budgetAnalysisReport: false,
  payeeLocations: false,
};

export const ALL_FEATURE_FLAGS = Object.keys(
  FEATURE_FLAG_DEFAULTS,
) as FeatureFlag[];

export const FEATURE_FLAG_LABELS: Record<
  FeatureFlag,
  { title: string; subtitle?: string }
> = {
  goalTemplatesEnabled: {
    title: 'Goal Templates',
    subtitle: 'Enable goal template processing',
  },
  goalTemplatesUIEnabled: {
    title: 'Budget Automations UI',
    subtitle: 'Visual UI for goal templates',
  },
  actionTemplating: { title: 'Rule Action Templating' },
  formulaMode: {
    title: 'Formula Mode',
    subtitle: 'Excel-like formula cards & rule formulas',
  },
  currency: { title: 'Currency Support' },
  crossoverReport: { title: 'Crossover Report' },
  customThemes: { title: 'Custom Themes' },
  budgetAnalysisReport: { title: 'Budget Analysis Report' },
  payeeLocations: { title: 'Payee Locations' },
};
