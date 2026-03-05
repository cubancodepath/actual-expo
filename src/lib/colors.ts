/**
 * Color utility helpers.
 *
 * These operate on the raw hex strings stored in the theme's color tokens.
 * Do NOT use hex string concatenation (`color + '20'`) elsewhere — it silently
 * breaks if the token is ever expressed as rgba() or a 3-char hex shorthand.
 */

/**
 * Apply an alpha channel to a 6-character hex color string.
 *
 * @param hex   A 6-character hex color, e.g. "#8719e0". The leading "#" is required.
 * @param alpha Opacity in the range 0–1 (e.g. 0.15 for 15%).
 * @returns     An rgba() string suitable for React Native's backgroundColor.
 *
 * @example
 *   withOpacity(colors.primary, 0.15)  →  "rgba(135, 25, 224, 0.15)"
 */
export function withOpacity(hex: string, alpha: number): string {
  // Strip leading '#' if present
  const clean = hex.replace('#', '');

  // Support 3-char shorthand by expanding: "f0a" → "ff00aa"
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  const a = Math.min(1, Math.max(0, alpha));

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
