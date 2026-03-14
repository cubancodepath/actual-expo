# TestFlight Roadmap — Actual Budget Expo

## Estado Actual (Auditoría 2026-03-13)

### Lo que funciona bien
- 80+ pantallas completamente implementadas
- CRDT sync funcional con Merkle tree diff y retries
- AES-256-GCM encryption completa
- Auth flow robusto (3-tier guards: public → files → auth)
- CRUD completo: accounts, budgets, categories, payees, transactions, schedules, tags
- Theme system (light/dark) con design tokens
- i18n configurado (en/es) con react-i18next
- Split transactions, transfers, reconciliation
- Budget goals, carryover, transfers entre categorias
- Undo system
- Quick actions (iOS Shortcuts)
- Error boundary en root
- TypeScript strict — 0 errores

### Lo que necesita trabajo
Ver fases abajo organizadas por prioridad.

---

## FASE 0 — BLOCKERS (Sin esto no se sube a TestFlight)
Estimado: 1-2 dias

### ~~0.1 Crear eas.json~~ COMPLETADO
- Creado con perfiles development, preview, production
- autoIncrement habilitado en production
- Build local via `eas build --local`

### ~~0.2 Cambiar Bundle ID~~ COMPLETADO
- Cambiado de `com.anonymous.actual-expo` a `com.cubancodepath.actual`
- App groups actualizados en entitlements y syncShortcutCache
- appleTeamId configurado: `8668UQNRKV`

### 0.3 Verificar iOS Signing
- **Que**: Certificados, provisioning profiles, y entitlements deben coincidir
- **Donde**: Apple Developer Portal + Xcode
- **Que hacer**:
  - Registrar App ID con bundle ID correcto
  - Crear/verificar Distribution Certificate
  - Crear Provisioning Profile para App Store (TestFlight)
  - Verificar que entitlements (app groups) coincidan con capabilities del portal

### 0.4 Primer build de prueba
- **Que**: Verificar que `eas build --local --platform ios --profile preview` compila sin errores
- **Que hacer**: Resolver cualquier error de build nativo

---

## FASE 1 — CALIDAD DE PRODUCCION (Antes del primer TestFlight)
Estimado: 2-3 dias

### ~~1.1 Limpiar console.log de produccion~~ COMPLETADO
- 16 statements envueltos en `if (__DEV__)` en 8 archivos
- ErrorBoundary console.error mantenido intencionalmente

### ~~1.2 Fix Spacer component~~ COMPLETADO
- Removido `width: 1` / `height: 1` de la dimension cruzada

### ~~1.3 Corregir shadow opacity~~ NO NECESARIO
- `colors.shadow` ya tiene alpha incluido (light: 0.12, dark: 0.4)
- `shadowOpacity: 1` es correcto con este patron

### ~~1.4 Extraer strings hardcodeados a i18n~~ COMPLETADO
- 5 strings de BudgetFileRow + 2 titulos de Spending extraidos
- Traducciones en/es agregadas en `fileState.*`

### ~~1.5 Version management~~ COMPLETADO
- `autoIncrement: true` configurado en eas.json perfil production

---

## FASE 2 — ACCESIBILIDAD Y PULIDO (Primera semana de TestFlight)
Estimado: 2-3 dias

### ~~2.1 Accessibility labels en componentes interactivos~~ COMPLETADO
- Button, IconButton, Icon, SearchBar, SyncBadge, ListItem, SwipeableRow
- Labels i18n en EN/ES (`a11y.*` keys)
- Iconos decorativos marcados como `accessible={false}`

### ~~2.2 Reduced motion support~~ COMPLETADO
- `useReducedMotion()` agregado a ProgressBar, CircularProgress, SwipeableRow
- Animaciones se saltan cuando el usuario tiene movimiento reducido activado

### 2.3 Form validation visual
- **Que**: TextInputs no muestran estados de error visualmente
- **Que hacer**: Agregar prop `error` a inputs que muestre borde rojo + texto de error debajo
- **Pantallas afectadas**: Login, new account, new transaction, budget setup wizard

### ~~2.4 keyboardShouldPersistTaps en FlatLists~~ COMPLETADO
- CategoryPickerList ya lo tenia implementado

---

## FASE 3 — EXPERIENCIA DE USUARIO (Semana 2 de TestFlight)
Estimado: 2-3 dias

### ~~3.1 Loading skeletons para listas~~ COMPLETADO
- Componente `Skeleton` atom con animación de pulso (respeta reduced motion)
- Variantes: AccountList, BudgetList, TransactionList, PayeesList, CategoriesList
- Integrado en accounts, budget, spending, account detail

### ~~3.2 Crash reporting~~ COMPLETADO
- `@sentry/react-native` integrado con plugin Expo
- Solo habilitado en producción (`enabled: !__DEV__`)
- ErrorBoundary reporta a Sentry con component stack
- Expo Router navigation instrumentation para tracing
- DSN configurado, source maps via SENTRY_AUTH_TOKEN en .env.local

### ~~3.3 Resolver TODOs en pantallas~~ NO NECESARIO
- 0 TODOs encontrados en los 12 archivos — ya resueltos

### ~~3.4 Implementar mergePayees()~~ COMPLETADO
- `mergePayees()` implementado via `payee_mapping` redirects (patrón Actual Budget)
- Acción `merge()` agregada al payeesStore
- `confirmMerge` en payees.tsx actualizado para usar el merge correcto

---

## FASE 4 — INFRAESTRUCTURA (Semana 3+)
Estimado: 2-3 dias

### ~~4.1 CI/CD Pipeline~~ COMPLETADO
- GitHub Actions workflow `.github/workflows/pr-check.yml`
- Trigger: push/PR a `develop`
- Steps: `npm ci` → `tsc --noEmit` → `vitest run`
- Builds se hacen localmente con `eas build --local` (sin costos EAS)

### 4.3 Payee locations — DIFERIDO (próxima versión)
- **Que**: Tabla existe pero sin funciones de query/update
- **Cuando**: Siguiente release de TestFlight

---

## Checklist Pre-Submit TestFlight

- [x] eas.json creado con perfil production
- [x] Bundle ID actualizado (com.cubancodepath.actual)
- [ ] iOS signing verificado (cert + profile + entitlements)
- [ ] Build exitoso: `eas build --local --platform ios --profile production`
- [x] Console.log limpiados de produccion
- [x] Spacer component corregido
- [x] Shadow opacity — no necesario (ya correcto)
- [x] Strings de BudgetFileRow en i18n
- [x] `npx tsc --noEmit` — 0 errores
- [x] App abre correctamente en dispositivo real
- [x] Login flow funciona
- [x] Sync con servidor funciona
- [x] Budget view carga correctamente
- [x] Crear/editar transaccion funciona
- [x] Light/dark mode funciona
- [x] App no crashea en cold start
