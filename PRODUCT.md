# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Android is a confirmed commitment, not an aspiration: every surface from here on is designed to hold up in both iOS and Material idioms, and no iOS-only affordance ships without an Android equivalent.

Current implementation is iOS-only and diverges from this commitment — `app.config.ts` declares `platforms: ["ios"]`, `supportsTablet: false`, iOS deployment target 26.0, and iOS-specific plugins (`@bacons/apple-targets`, `expo-quick-actions`). An `android/` directory exists but is not a shipping target today. Treat this gap as work to be done, not as evidence against the recorded platform.

Phone-first. Tablet is not a target.

## Users

**Primary: existing Actual Budget self-hosters.** People who already run their own Actual Budget server and use the web or desktop client, adding a mobile client to the setup they already have. Onboarding may assume a server exists and a budget file exists — the first-run job is _connect_, not _learn zero-based budgeting_.

Their situation is mobile and interstitial: standing at a register, in a car, on a couch, on a plane. The jobs they come to the phone for are (1) capture a transaction in seconds before forgetting it, (2) check whether there is money left in a category before spending, (3) glance at account balances and the month's shape. Deep budget restructuring stays a desktop job; the phone must not require it.

Discretion matters in these moments — the product ships a privacy mode that blurs all amounts on one tap, because the usage scene is public.

## Product Purpose

A mobile client for Actual Budget: envelope (zero-based) budgeting where every dollar is assigned a job before it is spent, on a device that is already in the user's hand at the moment money moves.

It exists because the self-hosted Actual Budget stack had no first-class native mobile surface. Success is that a user's phone becomes the place transactions get entered and balances get checked — not a read-only mirror of the desktop.

Data lives in SQLite on the device and works fully offline; sync to the user's own server is CRDT-based and optionally encrypted with AES-256-GCM so the server stores only ciphertext.

## Positioning

Open-source, MIT-licensed, $0/month, no subscription tier, no ads, no data collection, and no vendor server — it syncs only to infrastructure the user controls. A commercial budgeting app cannot truthfully copy the combination of _your server, your data, offline-first, and free_.

It is an independent project. It is not officially affiliated with Actual Budget, though it is wire-compatible with the Actual Budget server.

## Operating Context

- Requires a self-hosted Actual Budget server (PikaPods, Docker, or Fly.io; roughly 10–15 minutes to set up). Server setup happens outside this product.
- Auth paths in the product: password and OpenID; a local-only setup path exists for use without a cloud target.
- Everyday loops: enter a transaction (with a calculator keyboard toolbar for math in place), assign or move money between categories, cover overspending, reconcile an account against a statement, review scheduled and recurring transactions, read reports.
- Offline is normal, not an error state. Sync runs when connectivity returns; the product deliberately ships no persistent sync indicator.
- Multi-currency, multiple date and number formats, symbol position, and first-day-of-week are user-configurable — layouts must survive all of them.
- English and Spanish ship today (react-i18next).

## Capabilities and Constraints

Confirmed capabilities:

- Zero-based/envelope budgeting with category goals, progress, carryover, hold, and cover-overspending flows
- Fast transaction entry with calculator toolbar; splits; auto-category rules applied from the user's server-side rules
- Scheduled and recurring transactions with status tracking
- Account registers, account creation/closing, reconciliation, search
- Reports: Net Worth, Cash Flow, Spending by Category, Savings Rate, Money Buffer, with interactive charts
- Privacy mode (blur all amounts)
- Light and dark theme following the system
- Rules screen is view + delete only; creating and editing rules is not implemented

**Design authority relative to upstream — the load-bearing constraint.** The interface is free: labels, groupings, flows, navigation, and the mental models the UI presents may diverge from Actual Budget web wherever mobile is better served. The _model_ is not free. Entities, calculation semantics, AQL, the CRDT message format, and the sync wire protocol are upstream's and non-negotiable, because divergence breaks sync with the user's server. Rename a concept in the UI; never invent one the server cannot store.

Other durable technical constraints:

- Hermes runtime forced reimplementation of the core (CRDT, sync, spreadsheet, encryption, AQL, formula engine) — upstream dependencies like better-sqlite3, HyperFormula, WebCrypto, and PEG.js do not run there. `packages/hyperformula` is an in-repo Hermes-safe replacement.
- `src/core/` is domain logic with no React, UI, or react-query imports. Platform capabilities cross a named seam (`core/platform/`).
- Stack: Expo 55, React Native 0.83, React 19, Expo Router (file routes under `app/`), Zustand 5, TanStack Query 5, expo-sqlite with raw SQL, Sentry.
- UI is HeroUI Native throughout `src/screens/` and `src/ui/`; the `src/features/` and `src/design-system/` strangler migration is finished and those directories are gone. `ARCHITECTURE.md` is the source of truth for folder organization.

Explicitly undecided / not yet available:

- Bank sync and automatic transaction import (GoCardless / SimpleFIN) — stated as the top priority for the next major release
- OFX/QFX/CSV import
- Tracking-budget write path and UI (the calculation engine supports it; screens still assume envelope bindings)
- Payee location features (permission-gated GPS is scaffolded; the feature set is unbuilt)

## Brand Commitments

- Name: **Actual Budget Mobile**. Dev variant ships as "Actual (Dev)".
- Voice, as established in shipped store copy: plain, concrete, and unembellished; it states what the product does and openly names what it does not do yet ("What's not in v1.0 (being honest)"). Future copy must not oversell or quietly drop the honesty about missing bank sync.
- Independence from the upstream Actual Budget project must remain stated, not implied.
- Existing assets: `assets/icon.png`, `assets/splash-icon.png` (splash background `#8719E0`), App Store screenshots in `assets/appstore-screenshots/final/` and `assets/screenshots/`.
- An incumbent visual system exists and is recorded in `DESIGN.md` (HeroUI Native tokens, Inter, accent `#8B7CF6`). Product-side this is evidence, not a commitment; visual decisions belong to design work, not to this file.

## Evidence on Hand

- Real shipped App Store copy and screenshots: `docs/app-store-connect-metadata.md`, `assets/appstore-screenshots/final/`
- Source of truth documents: `ARCHITECTURE.md`, `CLAUDE.md`, `DESIGN.md`, `docs/PARITY-PLAN.md`, `docs/aql-parity.md`, `docs/architecture-differences.md`, `docs/feature-roadmap.md`, `docs/upstream-map.md`
- Public repository: https://github.com/cubancodepath/actual-expo — MIT
- Privacy policy URL: https://actual.cubancodepath.com/privacy
- Pinned upstream revision: `UPSTREAM_VERSION` (`0b239e0a6`)

Absences future work must not fabricate: there are no testimonials, no user counts for this app, no benchmarks, no press, and no pricing (it is free). The "tens of thousands of people" figure in store copy refers to the upstream Actual Budget project, not to this client, and must not be reattributed.

## Product Principles

1. **The phone is the capture surface.** Optimize for the seconds-long interaction at the point of spending; never require a desktop-scale operation to finish a mobile-scale task.
2. **Offline is the normal state.** Nothing may present itself as broken, pending, or degraded merely because there is no connection.
3. **Free in the interface, faithful in the model.** Diverge from upstream's UI wherever mobile is better served; never diverge from its data model, calculations, or wire format.
4. **Discretion is a feature, not a setting.** The product is used in public. Amounts must be concealable at any moment without losing navigability.
5. **Say what is not there.** The product's credibility rests on not overstating itself; missing capabilities are named, not hidden.

## Accessibility & Inclusion

Committed requirements that future design must preserve:

- **Dynamic Type / system text scaling.** Layouts must hold at large system text sizes without clipping, truncating amounts, or breaking row alignment. This is currently unmet: no `allowFontScaling` handling exists anywhere in `src/`.
- **WCAG AA contrast** for text and controls, including privacy-mode blur states and overspent/negative states, in both light and dark themes.

VoiceOver completeness was not committed as a requirement. Current coverage is partial (accessibility labels appear in roughly a dozen source files) — treat it as undecided rather than as either a promise or a non-goal.
