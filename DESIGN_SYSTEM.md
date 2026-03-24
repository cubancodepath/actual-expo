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
  atoms/       ← Smallest building blocks
  molecules/   ← Composed atoms
  organisms/   ← Complex compositions
  index.ts     ← Barrel export
```

**Rules:**
- Import from `@/ui` (barrel) — never deep-import from atom/molecule paths
- Atoms: zero business logic, purely visual, max 1–2 props beyond styling
- Molecules: compose 2+ atoms, may accept data props but no store access
- Organisms: may access stores, compose molecules, screen-specific but reusable

### Atoms

| Component | Source | Brand customization |
|-----------|--------|---------------------|
| `Button` | HeroUI wrap | `rounded-lg` (14px), compound: `Button.Label` |
| `Card` | HeroUI wrap | `rounded-xl` (20px), compound: `Card.Header`, `Card.Body`, `Card.Footer`, `Card.Title`, `Card.Description` |
| `TextField` | HeroUI re-export | Also exports: `Input`, `Label`, `Description`, `FieldError` |
| `Icon` | Lucide wrap | Props: `name`, `size` (default 20), `themeColor` (default "foreground"), `color` (raw override) |
| `Badge` | Custom | Variants: default, primary, danger, success, warning. Light/dark text contrast |
| `Avatar` | Custom | Sizes: sm (32px), md (40px), lg (56px). Shows initials from label |
| `Chip` | HeroUI wrap | `rounded-sm` (8px), `bg-accent`, white text. Compound: `Chip.Label`, `Chip.CloseButton` |
| `Divider` | Custom | 1px line using `bg-separator` |
| `Switch` | HeroUI wrap | Compound: `Switch.Thumb`, `Switch.StartContent`, `Switch.EndContent` |
| `Spinner` | HeroUI wrap | Props: `themeColor` (default "accent"), `color` (raw override) |
| `Skeleton` | HeroUI re-export | Also exports: `SkeletonGroup` |

### Molecules

| Component | Description | Key props |
|-----------|-------------|-----------|
| `SearchBar` | HeroUI SearchField wrap with `rounded-md` | `value`, `onChange`, `placeholder` |
| `ListItem` | Pressable row with icon, title, subtitle, trailing, chevron | `icon`, `title`, `subtitle`, `trailing`, `showChevron`, `onPress` |
| `EmptyState` | Centered layout with icon, text, and optional action button | `icon` (IconName), `title`, `description`, `actionLabel`, `onAction` |
| `SectionHeader` | Title with optional action link | `title`, `action`, `onAction` |

### Theme Color Access

```tsx
// In Icon — use themeColor prop
<Icon name="Wallet" themeColor="accent" />

// Anywhere else — use useThemeColor hook
import { useThemeColor } from "@/ui";
const color = useThemeColor("accent");
```

### Organisms (planned)

- `TransactionRow` — transaction list item with amount, category, date
- `AccountCard` — account summary with balance
- `BudgetCategoryRow` — budget progress with bar

---

## Voice & Tone

### Brand Personality: "Playful Precision"

A high-precision financial tool wrapped in a human, approachable interface. We take the user's money seriously, but we don't take ourselves too seriously.

| Dimension | Our approach |
|-----------|-------------|
| **Sentiment** | Trustworthy + warm. Finances are stressful — we reduce that stress |
| **Inspiration** | Coinbase's cleanliness meets Airbnb's warmth |
| **Visual bridge** | Electric Indigo as the energy, large corner radii for friendliness, 4px grid for engineering rigor |

### Voice: "The Trusted Sidekick"

We are a close financial coach who understands the user's habits — not a cold ATM or a lecture. We walk alongside the user, not ahead of them.

**In English:** We use "you" and "your." Direct address, second person, conversational.
**In Spanish:** We use "tú" not "usted." First-person plural when appropriate ("vamos", "ajustemos").

### Tone Rules

Tone shifts depending on the moment. The voice stays the same — the intensity changes.

| Principle | What it means | When to apply |
|-----------|---------------|---------------|
| **Approachable** | Human language for technical processes. Short sentences. No jargon. | Everywhere — this is the default |
| **Actionable** | Every message suggests what to do next. Lead with the action, not the problem. | Errors, empty states, confirmations |
| **Encouraging** | Celebrate progress. Frame setbacks as adjustable, not failures. | Budget alerts, milestones, overspending |
| **Transparent** | Drop the warmth. Be direct, brief, precise. State the fact and the fix. | Critical failures, data loss risk, security |

### We Never...

- Blame the user ("You entered the wrong password" → "That password didn't work")
- Use technical jargon without context ("Error 500" → "Something went wrong on the server")
- Use passive voice in errors ("The connection was lost" → "We couldn't reach your server")
- Use ALL CAPS for emphasis (use bold or color instead)
- Make light of data loss or financial mistakes
- Say "please" excessively — one "please" per screen max; it starts to sound desperate

### UI Copy Dictionary

Reference examples showing how our voice applies across states. English is the primary language; Spanish translations follow the same principles.

#### Errors

| Context | Instead of | Write |
|---------|-----------|-------|
| Network failure | "Connection error" | "We couldn't reach your server. Check your connection and try again." |
| Wrong password | "Authentication failed" | "That password didn't work. Try again." |
| Sync failure | "Sync error" | "Sync failed. Your data is safe locally — we'll try again soon." |
| Server down | "Server error 500" | "Something went wrong on the server. Try again in a moment." |
| Save failure | "Write operation failed" | "Couldn't save your changes. Try again." |

**Error formula:** [What happened] + [Reassurance if needed] + [What to do next].

#### Empty States

| Context | Instead of | Write |
|---------|-----------|-------|
| No transactions | "No data" | "No transactions yet. Add your first transaction to get started." |
| No payees | "No payees found" | "No payees yet. Payees are created when you add transactions." |
| No budgets | "No files" | "No budgets found. Create a new budget to get started." |
| No search results | "0 results" | "No matching transactions. Try different search terms or filters." |
| Dashboard no data | "Insufficient data" | "Keep adding transactions — we need a bit more data to calculate your buffer." |

**Empty state formula:** [Acknowledge the emptiness without drama] + [Suggest the next action].

#### Success & Confirmation

| Context | Instead of | Write |
|---------|-----------|-------|
| Sync complete | "Synchronization successful" | "Synced" (status indicator, not a message) |
| Transaction saved | "Record created" | (Silent success — return to list. No toast needed.) |
| Transaction deleted | "Deletion complete" | "Transaction deleted" + Undo option |
| Budget created | "File created successfully" | Navigate directly to the new budget |

**Success formula:** Keep it minimal. The best success state is the result itself, not a message about the result. Use brief confirmations only for destructive or async actions.

#### Confirmations (Destructive Actions)

| Context | Instead of | Write |
|---------|-----------|-------|
| Delete transaction | "Are you sure?" | "Delete this transaction?" |
| Delete synced budget | "Confirm deletion" | '"{{name}}" is synced with the server.' + action buttons |
| Delete local budget | "Confirm deletion" | 'Delete "{{name}}"? This cannot be undone.' |
| Log out | "End session?" | "Disconnect from this server? Your local data stays on this device, but you'll need to reconnect to sync." |
| Delete payee with data | "Warning: associated records exist" | "This payee has transactions. Reassign them to: [picker]" |

**Confirmation formula:** [What will happen] + [Consequence if irreversible] + [Clear action buttons: specific verb, not "Yes/No"].

#### Loading & Progress

| Context | Instead of | Write |
|---------|-----------|-------|
| Connecting to server | "Connecting..." | "Looking for your server..." |
| Opening budget | "Loading file..." | "Opening budget..." |
| Downloading from server | "Downloading..." | "Downloading budget..." |
| Generic loading | "Please wait" | "Loading..." |
| Syncing | "Synchronizing data" | "Syncing" (a11y label) |

**Loading formula:** Use present participle + object. Keep it under 4 words. Use ellipsis (...) to indicate ongoing action.

#### Onboarding & First-Time Moments

| Context | Copy |
|---------|------|
| App tagline | "Your budget, your way." |
| Server URL prompt | "Your server" (label) + "Enter your server address to get started." (helper) |
| First budget | "My Budget" (default name) |
| Create prompt | "Or start fresh with a new budget" |
| Encryption setup | "Encrypts all sync data end-to-end. You'll need this password on every device you use." |

**Onboarding formula:** State the benefit or outcome, not the feature. Reduce choices. One action per screen.

#### Budget-Specific Language

| Context | Instead of | Write |
|---------|-----------|-------|
| Over budget | "Category limit reached" | "Overspent Categories" (section header) |
| Money available | "Remaining budget" | "To Budget" |
| Monthly comparison | "Month-over-month delta" | "vs last month" |
| Savings metric | "Savings percentage" | "Savings Rate" + "The percentage of your income you saved this month." |
| Buffer metric | "Days of expenses covered" | "Money Buffer" + "How many days of spending your income covers before you need new money." |

### Terminology Conventions

Consistent terms across the entire app. Once chosen, never mix alternatives.

| Concept | We say | We don't say |
|---------|--------|-------------|
| Authentication | "Log in" / "Log out" | "Sign in" / "Sign out" |
| Server connection | "Connect" / "Disconnect" | "Link" / "Unlink" |
| Budget files | "Budget" | "File", "Budget file" (except in technical contexts) |
| Removing data | "Delete" | "Remove" (except for list items where "Remove" means detach) |
| Undoing | "Undo" | "Revert", "Roll back" |
| Sync upload | "Sync to Server" | "Upload to server" (except re-upload: "Upload to Server") |
| Categories | "Category" / "Group" | "Subcategory" / "Parent category" |
| Recipients | "Payee" | "Merchant", "Vendor", "Recipient" |
| Money movement | "Transfer" | "Move money" (except budget context: "Move to Category") |
| Encryption | "Encryption password" | "Encryption key", "Secret" |

### Spanish Adaptation Notes

The Spanish locale follows the same voice principles with these adjustments:

- **"Tú" form throughout.** Never "usted."
- **"Entrar" for log in**, not "Iniciar sesión."
- **"Inténtalo de nuevo"** is the standard retry phrase.
- **"Esta acción no se puede deshacer"** for irreversible actions.
- **First-person plural** ("ajustemos", "vamos") is appropriate in encouraging contexts but not in errors — errors stay direct and user-addressed.
- **Avoid calques.** Don't translate English idioms literally. "Give your money a job" becomes "Dale un trabajo a tu dinero" or similar natural phrasing.
