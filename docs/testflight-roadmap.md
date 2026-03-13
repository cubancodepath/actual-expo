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

### 2.1 Accessibility labels en componentes interactivos
- **Componentes sin labels**:
  - `Button.tsx` — agregar accessibilityLabel desde title prop
  - `IconButton.tsx` — agregar accessibilityLabel requerido
  - `Icon.tsx` — agregar accessibilityLabel opcional
  - `SearchBar.tsx` — agregar accessibilityLabel al TextInput
  - `SyncBadge.tsx` — agregar accessibilityLabel con estado
  - `ListItem.tsx` — agregar accessibilityRole="button" cuando es pressable
- **Donde**: `src/presentation/components/atoms/` y `molecules/`

### 2.2 Reduced motion support
- **Que**: Solo UndoToast respeta `useReducedMotion()`
- **Agregar a**:
  - `SwipeableRow.tsx`
  - `ProgressBar.tsx`
  - `CircularProgress.tsx`
  - Animaciones de collapse en budget groups
- **Que hacer**: Usar `useReducedMotion()` de react-native-reanimated, skip animaciones si true

### 2.3 Form validation visual
- **Que**: TextInputs no muestran estados de error visualmente
- **Que hacer**: Agregar prop `error` a inputs que muestre borde rojo + texto de error debajo
- **Pantallas afectadas**: Login, new account, new transaction, budget setup wizard

### 2.4 keyboardShouldPersistTaps en FlatLists
- **Que**: Tapping fuera del keyboard en listas no funciona correctamente
- **Donde**: CategoryPickerList, PayeePickerList, y cualquier FlatList con SearchBar
- **Que hacer**: Agregar `keyboardShouldPersistTaps="handled"`

---

## FASE 3 — EXPERIENCIA DE USUARIO (Semana 2 de TestFlight)
Estimado: 2-3 dias

### 3.1 Loading skeletons para listas
- **Que**: Listas muestran vacio mientras cargan datos
- **Donde**: Accounts list, transactions list, budget screen, categories, payees
- **Que hacer**: Crear componente `SkeletonRow` reutilizable con animated shimmer

### 3.2 Crash reporting
- **Que**: Sin telemetria de crashes en produccion
- **Que hacer**: Integrar Sentry o Bugsnag via plugin Expo
- **Config**: Solo para builds de produccion, no development

### 3.3 Resolver TODOs en pantallas
- **12 archivos con TODOs** (no son blockers pero mejoran la experiencia):
  - `account/settings.tsx`
  - `settings/budget.tsx`
  - `budget/notes.tsx`
  - `budget/new-category.tsx`, `new-group.tsx`, `rename-category.tsx`
  - `budget/quick-edit-category.tsx`, `edit-group.tsx`
  - `transaction/new.tsx`, `payee-picker.tsx`
  - `schedule/[id].tsx`, `schedule/new.tsx`

### 3.4 Implementar mergePayees()
- **Que**: Infraestructura existe (payee_mapping table) pero falta la funcion
- **Donde**: `src/payees/index.ts`
- **Que hacer**: Implementar merge con actualizacion de transacciones asociadas

---

## FASE 4 — INFRAESTRUCTURA (Semana 3+)
Estimado: 2-3 dias

### 4.1 CI/CD Pipeline
- **Que**: No hay GitHub Actions ni automatizacion
- **Que hacer**:
  - Workflow para type-check + tests en PR
  - Workflow para EAS Build en merge a develop
  - Workflow para TestFlight submit en merge a main

### 4.2 Certificate pinning (opcional)
- **Que**: App confia en CAs del sistema — aceptable para beta, mejorar para produccion
- **Que hacer**: Evaluar expo-certificate-pinning o similar

### 4.3 Payee locations
- **Que**: Tabla existe pero sin funciones de query/update
- **Cuando**: Cuando se implemente feature de auto-categorizacion por ubicacion

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
- [ ] App abre correctamente en dispositivo real
- [ ] Login flow funciona
- [ ] Sync con servidor funciona
- [ ] Budget view carga correctamente
- [ ] Crear/editar transaccion funciona
- [ ] Light/dark mode funciona
- [ ] App no crashea en cold start
