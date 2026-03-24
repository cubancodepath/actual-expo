# Design System — Actual Budget Mobile

> Identity guide for the Actual Budget mobile app. Every design decision flows from this document.

---

## Color Palette

Five color families, each with a full 50–950 scale.

### Electric Indigo — Primary / Brand

The main accent. Used for CTAs, active states, links, and brand moments.

| Step | Hex |
|------|-----|
| 50 | `#f0e9fb` |
| 100 | `#e1d4f7` |
| 200 | `#c4a8f0` |
| 300 | `#a67de8` |
| 400 | `#8852e0` |
| 500 | `#6b26d9` |
| 600 | `#551fad` |
| 700 | `#401782` |
| 800 | `#2b0f57` |
| 900 | `#15082b` |
| 950 | `#0f051e` |

### Watermelon — Danger / Destructive

Negative amounts, delete actions, error states, overspending alerts.

| Step | Hex |
|------|-----|
| 50 | `#fde8ec` |
| 100 | `#fbd0da` |
| 200 | `#f6a2b4` |
| 300 | `#f2738f` |
| 400 | `#ee4469` |
| 500 | `#e91644` |
| 600 | `#bb1136` |
| 700 | `#8c0d29` |
| 800 | `#5d091b` |
| 900 | `#2f040e` |
| 950 | `#210309` |

### Golden Pollen — Warning / Attention

Budget alerts, approaching limits, pending states.

| Step | Hex |
|------|-----|
| 50 | `#fff9e5` |
| 100 | `#fff3cc` |
| 200 | `#ffe799` |
| 300 | `#ffdb66` |
| 400 | `#ffcf33` |
| 500 | `#ffc300` |
| 600 | `#cc9c00` |
| 700 | `#997500` |
| 800 | `#664e00` |
| 900 | `#332700` |
| 950 | `#241b00` |

### Carbon Black — Neutrals

Backgrounds, text, borders, disabled states. The backbone of the UI.

| Step | Hex |
|------|-----|
| 50 | `#f1f2f3` |
| 100 | `#e3e4e8` |
| 200 | `#c8cad0` |
| 300 | `#acafb9` |
| 400 | `#9194a1` |
| 500 | `#75798a` |
| 600 | `#5e616e` |
| 700 | `#464953` |
| 800 | `#2f3137` |
| 900 | `#17181c` |
| 950 | `#101113` |

### Jungle Green — Success / Positive

Positive amounts, savings goals met, sync complete, confirmations.

| Step | Hex |
|------|-----|
| 50 | `#e7fdf4` |
| 100 | `#d0fbe8` |
| 200 | `#a1f7d2` |
| 300 | `#71f4bb` |
| 400 | `#42f0a5` |
| 500 | `#13ec8e` |
| 600 | `#0fbd72` |
| 700 | `#0b8e55` |
| 800 | `#085e39` |
| 900 | `#042f1c` |
| 950 | `#032114` |

---

## Semantic Tokens

Mapped from the palette above. Components use these tokens — never raw hex values.

### Light Mode

| Token | Value | Source |
|-------|-------|--------|
| `background` | `#f1f2f3` | carbon-black-50 |
| `foreground` | `#101113` | carbon-black-950 |
| `foreground-secondary` | `#5e616e` | carbon-black-600 |
| `card` | `#ffffff` | white |
| `card-elevated` | `#ffffff` | white |
| `border` | `#c8cad0` | carbon-black-200 |
| `border-light` | `#e3e4e8` | carbon-black-100 |
| `muted` | `#9194a1` | carbon-black-400 |
| `primary` | `#6b26d9` | electric-indigo-500 |
| `primary-light` | `#c4a8f0` | electric-indigo-200 |
| `on-primary` | `#ffffff` | white |
| `danger` | `#e91644` | watermelon-500 |
| `danger-light` | `#f6a2b4` | watermelon-200 |
| `on-danger` | `#ffffff` | white |
| `success` | `#0fbd72` | jungle-green-600 |
| `success-light` | `#a1f7d2` | jungle-green-200 |
| `warning` | `#ffc300` | golden-pollen-500 |
| `warning-light` | `#ffe799` | golden-pollen-200 |
| `accent` | `#6b26d9` | electric-indigo-500 |
| `accent-foreground` | `#ffffff` | white |
| `surface` | `#ffffff` | white |
| `surface-secondary` | `#f1f2f3` | carbon-black-50 |
| `overlay` | `#ffffff` | white |
| `default` | `#e3e4e8` | carbon-black-100 |
| `default-foreground` | `#101113` | carbon-black-950 |
| `field-background` | `#ffffff` | white |
| `field-foreground` | `#101113` | carbon-black-950 |
| `field-placeholder` | `#9194a1` | carbon-black-400 |
| `field-border` | `transparent` | — |

### Dark Mode

| Token | Value | Source |
|-------|-------|--------|
| `background` | `#101113` | carbon-black-950 |
| `foreground` | `#f1f2f3` | carbon-black-50 |
| `foreground-secondary` | `#9194a1` | carbon-black-400 |
| `card` | `#17181c` | carbon-black-900 |
| `card-elevated` | `#2f3137` | carbon-black-800 |
| `border` | `#464953` | carbon-black-700 |
| `border-light` | `#2f3137` | carbon-black-800 |
| `muted` | `#75798a` | carbon-black-500 |
| `primary` | `#8852e0` | electric-indigo-400 |
| `primary-light` | `#401782` | electric-indigo-700 |
| `on-primary` | `#ffffff` | white |
| `danger` | `#ee4469` | watermelon-400 |
| `danger-light` | `#5d091b` | watermelon-800 |
| `on-danger` | `#ffffff` | white |
| `success` | `#13ec8e` | jungle-green-500 |
| `success-light` | `#085e39` | jungle-green-800 |
| `warning` | `#ffcf33` | golden-pollen-400 |
| `warning-light` | `#664e00` | golden-pollen-800 |
| `accent` | `#8852e0` | electric-indigo-400 |
| `accent-foreground` | `#ffffff` | white |
| `surface` | `#17181c` | carbon-black-900 |
| `surface-secondary` | `#2f3137` | carbon-black-800 |
| `overlay` | `#17181c` | carbon-black-900 |
| `default` | `#2f3137` | carbon-black-800 |
| `default-foreground` | `#f1f2f3` | carbon-black-50 |
| `field-background` | `#17181c` | carbon-black-900 |
| `field-foreground` | `#f1f2f3` | carbon-black-50 |
| `field-placeholder` | `#75798a` | carbon-black-500 |
| `field-border` | `transparent` | — |

---

## Border Radius — Super-ellipse

Friendly and rounded without feeling childish. The "Airbnb / CashApp" feel.

| Token | Value | Typical usage |
|-------|-------|---------------|
| `rounded-xs` | 4px | Small indicators, tags |
| `rounded-sm` | 8px | Badges, chips |
| `rounded-md` | 12px | Inputs, small cards |
| `rounded-lg` | 14px | Buttons |
| `rounded-xl` | 20px | Cards |
| `rounded-2xl` | 24px | Bottom sheets, modals |
| `rounded-full` | 9999px | Avatars, pills |

---

## Spacing & Layout (base 4px)

A constrained spacing scale keeps the UI uniform. All paddings, margins, and gaps must use these values.

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `0.5` | 2px | Hairline gaps, icon nudges |
| `1` | 4px | Tight inner padding |
| `1.5` | 6px | Compact element spacing |
| `2` | 8px | Default inner padding, inline gaps |
| `3` | 12px | Small card padding, between related elements |
| `4` | 16px | Standard padding, section gaps |
| `5` | 20px | Medium padding |
| `6` | 24px | Screen horizontal padding, card padding |
| `8` | 32px | Section separation |
| `10` | 40px | Large section gaps |
| `12` | 48px | Major section breaks |
| `16` | 64px | Hero spacing |
| `20` | 80px | Maximum spacing |

### Layout Defaults

| Context | Value | Class |
|---------|-------|-------|
| Screen horizontal padding | 24px | `px-6` |
| Card inner padding | 16px | `p-4` |
| Gap between list items | 8px | `gap-2` |
| Gap between sections | 24–32px | `gap-6` / `gap-8` |
| Gap between form fields | 16px | `gap-4` |
| Icon-to-text spacing | 8px | `gap-2` |

---

## Typography — Outfit

Clean, modern, with circular letterforms that feel approachable. Great legibility for numbers at small sizes.

### Font Family

| Weight | File name | CSS token |
|--------|-----------|-----------|
| Regular (400) | `Outfit-Regular` | `font-sans` |
| Medium (500) | `Outfit-Medium` | `font-sans-medium` |
| SemiBold (600) | `Outfit-SemiBold` | `font-sans-semibold` |
| Bold (700) | `Outfit-Bold` | `font-sans-bold` |

### Type Scale

| Token | Size | Usage |
|-------|------|-------|
| `text-xs` | 12px | Captions, timestamps |
| `text-sm` | 14px | Secondary text, labels |
| `text-base` | 16px | Body text, list items |
| `text-lg` | 18px | Section headers |
| `text-xl` | 20px | Screen titles |
| `text-2xl` | 24px | Hero numbers (balances) |
| `text-3xl` | 30px | Large display numbers |
| `text-4xl` | 36px | Feature highlights |
| `text-5xl` | 48px | Onboarding headlines |
| `text-6xl` | 60px | Marketing / splash |
| `text-7xl` | 72px | Maximum display |

### Font Weight

| Token | Value | Usage |
|-------|-------|-------|
| `font-weight-regular` | 400 | Body text |
| `font-weight-medium` | 500 | Labels, emphasis |
| `font-weight-semibold` | 600 | Section headers, buttons |
| `font-weight-bold` | 700 | Titles, hero numbers |

### Line Height

| Token | Value | Usage |
|-------|-------|-------|
| `leading-none` | 1 | Single-line labels, badges |
| `leading-tight` | 1.25 | Headings, compact text |
| `leading-snug` | 1.375 | Subtitles |
| `leading-normal` | 1.5 | Body text (default) |
| `leading-relaxed` | 1.625 | Long-form descriptions |
| `leading-loose` | 2 | Spacious text blocks |

---

## Border Width

| Token | Value | Usage |
|-------|-------|-------|
| `border-0` | 0px | No border |
| `border` | 1px | Default borders (cards, inputs, dividers) |
| `border-2` | 2px | Active/focus state borders |
| `border-4` | 4px | Heavy emphasis borders |

---

## Opacity

| Token | Value | Usage |
|-------|-------|-------|
| `opacity-0` | 0 | Hidden |
| `opacity-5` | 0.05 | Subtle overlays |
| `opacity-10` | 0.1 | Light overlays |
| `opacity-20` | 0.2 | Disabled backgrounds |
| `opacity-30` | 0.3 | Soft backdrops |
| `opacity-50` | 0.5 | Disabled elements |
| `opacity-70` | 0.7 | Semi-visible |
| `opacity-80` | 0.8 | Slightly transparent |
| `opacity-90` | 0.9 | Near-opaque |
| `opacity-100` | 1 | Fully visible |

---

## Box Shadows (Elevation)

| Token | Usage |
|-------|-------|
| `shadow-none` | Flat elements |
| `shadow-sm` | Subtle card elevation |
| `shadow-md` | Elevated cards, dropdowns |
| `shadow-lg` | Modals, bottom sheets |

---

## Sizing

Fixed sizes for recurring UI elements.

| Token | Value | Usage |
|-------|-------|-------|
| `size-icon-sm` | 16px | Small inline icons |
| `size-icon` | 20px | Default icon size |
| `size-icon-lg` | 24px | Large icons, nav icons |
| `size-avatar-sm` | 32px | Small avatars (list items) |
| `size-avatar` | 40px | Default avatars |
| `size-avatar-lg` | 56px | Profile avatars |
| `size-touch` | 44px | Minimum touch target (Apple HIG) |

---

## Component Structure

All reusable UI lives in `src/ui/`, organized by atomic design:

```
src/ui/
  atoms/       ← Smallest building blocks (Button, Text, Input, Icon, Badge, Avatar, Divider)
  molecules/   ← Composed atoms (SearchBar, ListItem, Banner, EmptyState, FormField)
  organisms/   ← Complex compositions (TransactionRow, BudgetCard, AccountHeader)
  index.ts     ← Barrel export
```

**Rules:**
- Import from `@/ui` (barrel) — never deep-import from atom/molecule paths
- Atoms: zero business logic, purely visual, max 1–2 props beyond styling
- Molecules: compose 2+ atoms, may accept data props but no store access
- Organisms: may access stores, compose molecules, screen-specific but reusable

---

## Voice & Tone

We're a financial coach who's also a friend. Users feel stressed about money — our words should reduce that stress.

### Principles

- **Cercano**: Use "tú" not "usted". First-person plural ("vamos", "logramos").
- **Accionable**: Every message suggests a next step.
- **Positivo**: Celebrate progress, no matter how small.

### Examples

| Situation | Bad | Good |
|-----------|-----|------|
| Sync error | "Error de sincronización" | "Vaya, no pudimos conectar con tu servidor. ¿Reintentamos?" |
| Savings milestone | "Has ahorrado $500" | "¡Buen trabajo! Has ahorrado un 10% más este mes" |
| Empty state | "No hay transacciones" | "Aún no hay movimientos. Añade tu primera transacción" |
| Delete confirm | "¿Eliminar transacción?" | "¿Seguro que quieres eliminar esta transacción? No se puede deshacer" |
| Budget exceeded | "Presupuesto excedido" | "Te pasaste un poco en Comida. ¿Quieres ajustar?" |
