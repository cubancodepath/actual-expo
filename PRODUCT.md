# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

People who manage personal or household finances with envelope budgeting, including
existing Actual Budget users and people discovering the product on mobile. They use
the app to maintain budgets, accounts, transactions, schedules, and related financial
records away from a desktop as well as at home.

## Product Purpose

This product is a native mobile client for Actual Budget. It helps people plan their
money, record and categorize transactions, review account activity, manage schedules,
and work with budget files from a mobile device. Success means users can make and
maintain meaningful budget decisions reliably on mobile without giving up control of
their financial data.

## Positioning

The product's differentiating mechanism is local-first control: budget data is held
locally and the product supports offline work, with optional server synchronization.
This is an Actual Budget client rather than a hosted budgeting service that requires
every interaction to depend on a network connection.

## Operating Context

Users work with budget files, accounts, categories, transactions, payees, schedules,
reports, and settings. Common mobile contexts include quick transaction capture,
checking available money, assigning or moving money, categorizing activity, and
reviewing financial state while away from a desktop. The current implementation uses
Expo/React Native, raw SQLite, CRDT-based synchronization, native iOS integrations,
and English and Spanish localization.

## Capabilities and Constraints

- Budget files can be created, selected, opened, changed, and managed locally.
- Users can manage budgets, categories, accounts, transactions, payees, schedules,
  reports, settings, and encryption-related flows.
- The app supports local-only use and optional synchronization with an Actual Budget
  server.
- The current codebase is an Expo 55 / React Native 0.83 application with Expo Router,
  HeroUI Native, SQLite, Zustand, and i18next.
- Existing product terminology should remain compatible with Actual Budget.
- English and Spanish are supported today.
- Android capability and parity are an open implementation decision; the intended
  product scope is adaptive mobile, but the repository currently provides strong
  evidence for iOS rather than a completed cross-platform experience.

## Brand Commitments

- The product name and repository identity are `actual-expo` and Actual Budget.
- Product voice and terminology should remain clear, practical, and compatible with
  Actual Budget's established vocabulary.

## Evidence on Hand

- The working application and route tree under `app/` and `src/screens/` document the
  implemented mobile workflows.
- `ARCHITECTURE.md` documents the screens-first structure and dependency boundaries.
- `src/i18n/locales/en/` and `src/i18n/locales/es/` contain the supported localization
  content.
- `src/core/` contains the local budget engine, SQLite database layer, encryption,
  synchronization, and domain logic.
- The repository does not provide confirmed customer testimonials, case studies,
  performance benchmarks, pricing claims, or Android parity evidence. Future work must
  not fabricate these.

## Product Principles

- Keep people in control of their financial data.
- Make core budgeting work dependable without a network connection.
- Preserve the meaning and terminology of Actual Budget workflows across mobile.
- Optimize for confident decisions and quick financial capture in real daily contexts.
- Treat synchronization as useful infrastructure, not as a prerequisite for using the
  product.

## Accessibility & Inclusion

The product should preserve accessible native mobile interaction patterns as it expands
to adaptive mobile platforms. Specific accessibility standards, assistive technology
requirements, and supported device ranges remain open decisions.
