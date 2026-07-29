# Reports Surface Brief

## Job and Audience

- **Mode:** Operate
- **Audience:** A budget owner checking household finances during a normal day or weekly review.
- **Job:** Get a fast, trustworthy read on what changed and whether the financial plan is on track.

## Outcome and Proof

- The first viewport should help the user identify one meaningful change, concern, or confirmation.
- Success is not exhaustive analysis; it is leaving with one clear next decision.
- Use only the real dashboard data and calculations already represented by Actual Budget widgets.
- Do not invent financial benchmarks, recommendations, or explanatory claims that the data does not support.

## Selected Direction

- **Visual authority:** Preserve the established "Quiet Financial Instrument" system: cool tonal surfaces, Inter typography, measured violet for interaction, semantic financial colors, and restrained elevation.
- **Structural thesis:** A pulse-first dashboard: the most decision-relevant summary and change signals lead, followed by trend context and then lower-urgency detail.
- **Sequence:** Screen title and current context, highest-value summary/change signal, trend cards, calendar or detailed analysis, notes and unsupported items.
- **Focal moment:** The first meaningful financial delta or trajectory signal, expressed with its label, time range, comparison basis, and accessible non-color explanation.
- **Implementation consequence:** Keep the dashboard as a real widget-driven render, but make ordering, card headers, date context, and states carry more hierarchy than decorative chart treatment.

## Scope and Boundaries

- **Breadth:** Production-ready completion of the existing reports dashboard and its widget states.
- **Interactivity:** Read-only overview. Cards may expose context or truthful status, but do not become editors or interactive analytical workspaces in this pass.
- **Target:** `src/screens/reports/ReportsScreen/` and its existing report-local components, data adapters, hooks, and localization where needed.
- **Preserve:** Actual widget types, financial calculations, comparison semantics, local-first/offline behavior, localization, native navigation, and the user-defined dashboard model.
- **Anti-goals:** No generic analytics dashboard, no fabricated recommendations, no decorative chart gallery, no replacing native navigation with web-shaped controls, and no card-level editing flow.

## States and Ranges

- **Widget count:** Support a short dashboard through a dense dashboard; the current model is a single-column list of multiple widgets and must remain usable at both extremes.
- **Time ranges:** Existing product language includes this month, last month, year to date, last year, all time, and last 30 days. Preserve each widget's actual range and comparison basis.
- **Loading:** Show stable widget-sized skeletons without implying that unavailable data is zero.
- **Empty or incomplete:** Explain when a widget lacks enough history, including Age of Money's incomplete-data state, without alarming language.
- **Unsupported:** Clearly label widgets not available on mobile and formula widgets not available on mobile; keep their place and identity understandable.
- **Deleted or invalid:** Preserve the card boundary and state that the report was deleted or could not load.
- **Error:** Isolate failures to the affected widget so the rest of the dashboard remains useful.
- **Appearance:** Design and verify light and dark themes, large text, safe areas, and reduced-motion behavior.

## Interaction and Layout

- Use the existing safe-area-aware scroll surface and floating header pattern.
- Retain a single-column mobile composition; prioritize vertical scanability over simultaneous comparison of many cards.
- Give each card a clear title, date/range description, comparison basis where relevant, and one dominant reading.
- Put legends and secondary series in supporting roles; do not make users decode color before understanding the headline.
- Keep financial values aligned and legible, with semantic colors paired with text or icon meaning.
- Use native scrolling, pull-to-refresh, platform navigation, and system motion conventions.
- Use the pulse-first order for new dashboards or dashboards without a saved order. Once a user has a saved order, preserve it exactly and never reorder cards silently.

## Constraints and Open Decisions

- **Platform:** Adaptive mobile; honor iOS safe areas, Dynamic Type, edge-swipe back, sheets, and native transitions, while honoring Android system back, edge-to-edge insets, and 48dp touch targets.
- **Framework:** Expo/React Native, Expo Router, HeroUI Native/Pro, Skia-backed charts, i18next, and the existing report data layer.
- **Accessibility:** Never rely on chart color alone. Provide readable labels, values, comparison text, and accessible status for unsupported/error states. Exact accessibility audit criteria remain open.
- **Localization:** English and Spanish are supported; card titles, ranges, units, dates, and empty/error copy must remain translatable and avoid layout assumptions.
- **Ordering decision:** Pulse-first is the deterministic initial default; an existing saved dashboard order always takes precedence.
