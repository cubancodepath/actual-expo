---
name: Actual Expo
description: A calm, local-first financial instrument for making confident budget decisions on mobile.
colors:
  background-light: "oklch(97.02% 0.006 286.11)"
  background-dark: "oklch(12% 0.006 286.11)"
  surface-dark: "oklch(21.03% 0.012 286.11)"
  surface-secondary-light: "oklch(95.24% 0.009 286.11)"
  surface-secondary-dark: "oklch(25.7% 0.009 286.11)"
  surface-tertiary-light: "oklch(93.73% 0.009 286.11)"
  surface-tertiary-dark: "oklch(27.21% 0.009 286.11)"
  measured-electric-violet: "oklch(65.69% 0.1759 286.11)"
  muted-light: "oklch(55.17% 0.012 286.11)"
  muted-dark: "oklch(70.5% 0.012 286.11)"
  border-light: "oklch(90% 0.006 286.11)"
  border-dark: "oklch(28% 0.006 286.11)"
  separator-light: "oklch(92% 0.006 286.11)"
  separator-dark: "oklch(25% 0.006 286.11)"
  positive-light: "oklch(58% 0.17 122.94)"
  positive-dark: "oklch(82% 0.2 122.94)"
  warning-light: "oklch(78.19% 0.1584 72.32)"
  warning-dark: "oklch(83.69% 0.1643 84.43)"
  danger-light: "oklch(65.32% 0.2328 25.73)"
  danger-dark: "oklch(69.4% 0.1918 11.32)"
  chart-blue: "oklch(70% 0.14 220)"
  chart-teal: "oklch(72% 0.15 160)"
  chart-amber: "oklch(80% 0.14 85)"
  chart-magenta: "oklch(70% 0.15 330)"
  chart-green: "oklch(75% 0.12 120)"
typography:
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  body-medium:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.4
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  field: "12px"
  card: "16px"
  control: "9999px"
  menu: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.measured-electric-violet}"
    textColor: "#ffffff"
    typography: "{typography.body-medium}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  button-secondary:
    backgroundColor: "{colors.surface-secondary-light}"
    textColor: "#18181b"
    typography: "{typography.body-medium}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  input-field:
    backgroundColor: "{colors.surface-dark}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    height: "48px"
    padding: "12px"
  financial-signal-positive:
    backgroundColor: "{colors.positive-light}"
    textColor: "#ffffff"
    typography: "{typography.body-medium}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  floating-tab-selected:
    backgroundColor: "{colors.measured-electric-violet}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    size: "44px 56px"
    padding: "0"
---

# Design System: Actual Expo

## Overview

**Creative North Star: "The Quiet Financial Instrument"**

Actual Expo is designed like a precise financial instrument that belongs in the hand:
calm, legible, responsive, and confident without becoming loud. The interface keeps
the canvas quiet so the user's money, categories, and state changes remain the visual
authority. Its visual character comes from cool tonal surfaces, strong numeric rhythm,
and a single measured electric violet tint for interaction and selection.

The system is tactile and deliberate rather than ornamental. Rounded controls make
frequent actions feel forgiving, while lists, separators, and aligned columns keep
budget information scannable. Light and dark appearances are first-class: the same
semantic hierarchy survives by changing tonal values, not by inverting a light palette.

**Key Characteristics:**
- Calm, cool-neutral canvases with semantic tonal layering.
- Inter typography that stays quiet while financial values carry emphasis.
- Violet reserved for interaction, selection, and focused product identity.
- Rounded touch controls paired with flat, full-width financial list surfaces.
- Financial meaning expressed through positive, warning, danger, and chart roles.

## Colors

The palette is a cool near-neutral field with one focused violet tint and a restrained
semantic signal palette. Colors are defined in OKLCH and resolve through HeroUI/Uniwind
theme variables for light and dark appearance.

### Primary
- **Measured Electric Violet** (`oklch(65.69% 0.1759 286.11)`): The interactive tint for selected navigation, primary actions, focus, and the brand's most important active state.

### Secondary
- **Positive Green** (`oklch(58% 0.17 122.94)` light, `oklch(82% 0.2 122.94)` dark): Readable positive financial state such as money ready to assign or income.
- **Warning Amber** (`oklch(78.19% 0.1584 72.32)` light, `oklch(83.69% 0.1643 84.43)` dark): Caution and attention states without implying failure.
- **Danger Red** (`oklch(65.32% 0.2328 25.73)` light, `oklch(69.4% 0.1918 11.32)` dark): Overspending, invalid, or destructive financial states.

### Tertiary
- **Chart Blue** (`oklch(70% 0.14 220)`): A distinct report series.
- **Chart Teal** (`oklch(72% 0.15 160)`): A distinct report series.
- **Chart Amber** (`oklch(80% 0.14 85)`): A distinct report series.
- **Chart Magenta** (`oklch(70% 0.15 330)`): A distinct report series.
- **Chart Green** (`oklch(75% 0.12 120)`): A distinct report series.

### Neutral
- **Light Canvas** (`oklch(97.02% 0.006 286.11)`): The primary light-mode screen background.
- **Dark Canvas** (`oklch(12% 0.006 286.11)`): The primary dark-mode screen background.
- **Dark Surface** (`oklch(21.03% 0.012 286.11)`): The primary dark-mode container and field surface.
- **Secondary Surface** (`oklch(95.24% 0.009 286.11)` light, `oklch(25.7% 0.009 286.11)` dark): Tonal step for secondary controls and grouped content.
- **Tertiary Surface** (`oklch(93.73% 0.009 286.11)` light, `oklch(27.21% 0.009 286.11)` dark): A further tonal step for layered UI.
- **Muted Text** (`oklch(55.17% 0.012 286.11)` light, `oklch(70.5% 0.012 286.11)` dark): Supporting labels, inactive icons, and secondary information.
- **Border** (`oklch(90% 0.006 286.11)` light, `oklch(28% 0.006 286.11)` dark): Quiet field and container boundaries.
- **Separator** (`oklch(92% 0.006 286.11)` light, `oklch(25% 0.006 286.11)` dark): List-row dividers.

### Named Rules
**The One Tint Rule.** Violet is a signal, not decoration. Keep it for actions,
selection, focus, and the active navigation destination; let financial semantic colors
carry financial meaning.

## Typography

**Display Font:** Inter (with system-ui fallback)

**Body Font:** Inter (with system-ui fallback)

**Label/Mono Font:** Inter; no separate mono face is established.

**Character:** Inter is warm utility: neutral enough for dense financial records, but
with enough human softness to make frequent mobile decisions feel approachable. Weight
does the hierarchy work; the interface does not rely on decorative type treatments.

### Hierarchy
- **Title** (600, 18px, 1.3): Centered screen titles and important compact headings.
- **Body** (400, 16px, 1.4): Category names, field values, and readable app content.
- **Body Medium** (500, 16px, 1.4): Actions, selected labels, and controls that need a little more authority.
- **Label** (600, 11px, 1.2, wide tracking): Budget column labels and compact metadata; use uppercase only where the existing screen pattern does.
- **Financial Value** (500-700, screen-local size): Amounts may step up in size or weight when they are the decision being made, while retaining Inter and semantic color.

### Named Rules
**The Quiet Type Rule.** Typography should clarify the ledger, never compete with it.
Use weight, alignment, and numeric columns before adding size or expressive styling.

## Layout

The app uses safe-area-aware, full-width mobile screens with a compact spacing rhythm
based on 4px increments. Screen content commonly uses 16px horizontal insets; grouped
financial surfaces may run edge to edge inside those insets so row separators and
numeric columns align cleanly.

Budget screens favor vertical scanability: a compact header, an actionable summary
bar, collapsible groups, and full-width category rows. Section headers sit outside
their row surface, while the rows themselves form a continuous list. Numeric columns
are aligned to fixed widths and right-justified. Bottom navigation and floating actions
reserve safe-area space and must never cover editable content or the keyboard.

On iOS, preserve native tab/navigation behavior, edge-swipe back, sheets, and safe-area
insets. On Android, use the adaptive navigation treatment already established by the
floating tab bar and honor system back and IME insets. Controls remain at least 44px
high in the incumbent touch language; platform-specific minimums take precedence.

## Elevation & Depth

This is a tonal-first system. Background, surface, secondary surface, and tertiary
surface do most of the depth work. Borders and separators are quiet structural marks,
not decoration. Shadows are reserved for elements that genuinely float above content:
the floating tab bar, FABs, lifted long-press previews, and overlays. Do not turn every
card into a raised object.

### Shadow Vocabulary
- **Floating navigation:** semantic `shadow-overlay` on the rounded tab-bar surface.
- **Primary floating action:** semantic `shadow-lg` on the circular add-transaction action.
- **Lifted interaction:** semantic `shadow-overlay` on the long-press menu preview.
- **Field affordance:** platform-aware `shadow-field` on iOS and a restrained `shadow-sm` on Android where the component defines it.

### Named Rules
**The Tonal First Rule.** If a surface can be understood through a tonal step, do not
add a shadow. Shadows explain floating behavior, not hierarchy by default.

## Shapes

The form language is gently rounded and touch-forward. Frequent controls, pills, chips,
FABs, tab destinations, and icon buttons use full rounding. Larger grouped containers
use a 16px silhouette; menus and fields use a medium 12px silhouette. Budget category
lists intentionally use square outer edges when they are continuous full-width rows,
so their separators read as one ledger rather than a stack of cards.

Borders are quiet and semantic. Prefer tonal separation and internal spacing before
adding an outline. Clip overflowing list content to the container radius. Highlights
and pressed states follow the same rounded silhouette as the control they affect.

## Components

### Buttons
- **Shape:** Full-round controls for primary actions and icon buttons (`9999px`); height and hit area must support comfortable mobile touch.
- **Primary:** Violet background with a contrasting foreground; use for the main action of a screen or focused flow.
- **Hover / Focus:** Native pressed/highlight feedback and visible focus treatment; do not depend on hover for meaning.
- **Secondary / Ghost / Tertiary:** Tonal secondary surfaces or transparent controls with foreground/muted text; use when the action is supportive or navigational.

### Chips
- **Style:** Rounded, compact financial signals with semantic positive, danger, or balanced color; secondary chips use a tonal surface and foreground text.
- **State:** Use selected/active color to communicate a current financial state, not merely to decorate a label. Large summary chips may stretch full width and justify amount against label.

### Cards / Containers
- **Corner Style:** 16px for grouped cards and lists; square outer edges for continuous budget ledger rows.
- **Background:** `surface`, `surface-secondary`, or `surface-tertiary` by tonal depth; never invent per-screen surfaces.
- **Shadow Strategy:** Flat at rest; semantic shadow only for floating or lifted elements.
- **Border:** Use `border` or `separator` sparingly for fields and row divisions.
- **Internal Padding:** Common rhythm is 12px to 16px, with 16px screen insets.

### Inputs / Fields
- **Style:** HeroUI Native `TextField`/`Input` patterns with semantic field background, a 12px field radius, 48px minimum height, and labels outside the field.
- **Focus:** Semantic border/outline and platform-aware field treatment; focus must remain visible in light and dark themes.
- **Error / Disabled:** Use the danger semantic role for errors and muted/disabled contrast for unavailable fields. Preserve the label and explain the correction.

### Navigation
- **Style:** Native stack and tabs where the platform provides them. Android's custom floating tab bar is a rounded tonal surface with 6px inner padding and 44px by 56px destinations.
- **Default:** Inactive destinations use muted icon color and transparent background.
- **Active:** The selected destination uses the violet tint, contrasting icon foreground, and a full-round selection shape.
- **Mobile treatment:** Keep the tab bar above the safe-area inset with a fade behind it; never obscure scrollable or keyboard-driven content.

### Budget Summary Bar
The ready-to-assign indicator is a signature component: a full-width, large rounded
financial chip that makes the next decision obvious. Positive assignable money uses
the positive role; over-assignment uses danger. A secondary held-money chip sits below
it when relevant. Tapping opens the bottom-sheet action menu rather than silently
performing a destructive or irreversible operation.

## Do's and Don'ts

### Do:
- **Do** use the semantic HeroUI/Uniwind tokens from `global.css` so light and dark themes stay coherent.
- **Do** reserve measured electric violet for interactive focus, selection, and primary action.
- **Do** align money values in stable right-justified columns and let numeric emphasis carry the hierarchy.
- **Do** use tonal surfaces before shadows and keep floating elevation meaningful.
- **Do** preserve native navigation, safe areas, edge-swipe back, sheets, and platform touch conventions.
- **Do** keep financial signals semantic: positive for healthy/assignable, danger for over/invalid, warning for caution.

### Don't:
- **Don't** introduce gradients, decorative color washes, or per-screen accent colors into the quiet financial canvas.
- **Don't** turn every list group into a raised card; continuous ledger rows should read as one surface.
- **Don't** use raw hex colors where semantic light/dark tokens already exist.
- **Don't** use hover-only affordances or controls smaller than the platform's accessible touch target.
- **Don't** replace native iOS/Android navigation and system gestures with web-shaped interaction patterns.
- **Don't** use color alone to communicate financial state; pair it with labels, amounts, or icons.
