# Plan: Migrar `runOnJS` → `scheduleOnRN` (Reanimated 4.x)

## Contexto

Reanimated 4.x deprecó `runOnJS` (re-exportado desde `react-native-reanimated` por backward compat). El reemplazo es `scheduleOnRN` de `react-native-worklets` (ya instalado v0.7.4). El API cambió: los argumentos ya no se pasan como invocación separada.

```diff
- import { runOnJS } from 'react-native-reanimated';
- runOnJS(fn)();        // sin args
- runOnJS(fn)(arg);     // con args
+ import { scheduleOnRN } from 'react-native-worklets';
+ scheduleOnRN(fn);          // sin args
+ scheduleOnRN(fn, arg);     // con args
```

## Archivos a modificar (4 archivos, 13 call sites)

### 1. `src/presentation/components/molecules/SwipeableRow.tsx` (8 call sites)
- Línea 5: cambiar import de `react-native-reanimated` → `react-native-worklets`
- Línea 90: `runOnJS(handleDelete)()` → `scheduleOnRN(handleDelete)`
- Línea 104: `runOnJS(handleSwipeRight)()` → `scheduleOnRN(handleSwipeRight)`
- Líneas 131,134,138,148,151,155: `runOnJS(mediumHaptic)()` / `runOnJS(lightHaptic)()` → `scheduleOnRN(mediumHaptic)` / `scheduleOnRN(lightHaptic)`

### 2. `src/presentation/components/molecules/UndoToast.tsx` (3 call sites)
- Línea 9: cambiar import de `react-native-reanimated` → `react-native-worklets`
- Línea 38: `runOnJS(clearNotification)()` → `scheduleOnRN(clearNotification)`
- Línea 46: `runOnJS(clearNotification)()` → `scheduleOnRN(clearNotification)`
- Línea 84: `runOnJS(dismiss)()` → `scheduleOnRN(dismiss)`

### 3. `src/presentation/components/budget/MonthSelector.tsx` (1 call site)
- Línea 7: cambiar import de `react-native-reanimated` → `react-native-worklets`
- Línea 51: `runOnJS(goToMonth)(direction as -1 | 1)` → `scheduleOnRN(goToMonth, direction as -1 | 1)`

### 4. `app/(public)/local-setup.tsx` (1 call site)
- Línea 15: cambiar import de `react-native-reanimated` → `react-native-worklets`
- Línea 329: `runOnJS(onTransitionDone)()` → `scheduleOnRN(onTransitionDone)`

## Patrón de migración

Todos los call sites caen en 2 categorías:

**A. Sin argumentos (12 de 13):** `runOnJS(fn)()` → `scheduleOnRN(fn)`
**B. Con argumentos (1 de 13):** `runOnJS(fn)(arg)` → `scheduleOnRN(fn, arg)` (MonthSelector línea 51)

Caso especial — callback de `withTiming`/`withSpring`:
```diff
- withTiming(0, { duration: 180 }, () => { runOnJS(fn)(); });
+ withTiming(0, { duration: 180 }, () => { scheduleOnRN(fn); });
```
Esto es válido porque los callbacks de `withTiming`/`withSpring` ya ejecutan en el UI thread (son worklets implícitos).

## No se necesitan otros cambios de Reanimated 4.x

- `useAnimatedGestureHandler` — no se usa (ya usa Gesture.Pan() de RNGH v2)
- `useWorkletCallback` — no se usa
- `useScrollViewOffset` — no se usa
- `addWhitelistedNativeProps/UIProps` — no se usa
- `combineTransition` — no se usa
- `restDisplacementThreshold/restSpeedThreshold` — no se usa
- `react-native-worklets/plugin` en babel — no hay `babel.config.js` (Expo usa app config)
- `withSpring` duration — solo usa physics-based configs (damping/stiffness), no duration

## Verificación

1. `npx tsc --noEmit` — debe compilar limpio
2. Verificar que no quede ningún `runOnJS` importado desde `react-native-reanimated`:
   `grep -r "runOnJS" src/ app/` — debe dar 0 resultados
3. Test manual:
   - SwipeableRow: swipe left para eliminar, swipe right, verificar haptics
   - UndoToast: crear/eliminar transacción, verificar toast aparece y desaparece
   - MonthSelector: swipe horizontal para cambiar mes
   - local-setup: navegar por las pantallas del wizard con transiciones
