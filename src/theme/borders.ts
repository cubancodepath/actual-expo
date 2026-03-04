export const borderRadius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const borderWidth = {
  thin: 0.5,
  default: 1,
  thick: 2,
} as const;

export type BorderRadius = typeof borderRadius;
export type BorderWidth = typeof borderWidth;
