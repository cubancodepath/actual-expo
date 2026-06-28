// Component height tokens (Apple HIG: 44pt minimum touch target)

export const sizes = {
  /** Small control height (compact buttons, tags) */
  controlSm: 30,
  /** Medium control height (default buttons) */
  controlMd: 36,
  /** Standard control height (large buttons, inputs, pills) */
  control: 48,
} as const;

export type Sizes = typeof sizes;
