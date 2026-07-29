# Auditoría técnica de diseño — 2026-07-28

> Generada con `/impeccable audit`. Auditoría **a nivel de código**, no crítica de diseño.
> Puntuada contra HIG **y** Material 3, porque `PRODUCT.md` registra `platform: adaptive`.
>
> Estado del repo en el momento de la auditoría: `UPSTREAM_VERSION` = `0b239e0a6`, app version 1.0.1,
> 214 archivos `.tsx` / 496 `.ts` en `src/`, 74 rutas en `app/`.

## Audit Health Score

| #         | Dimensión            | Score    | Hallazgo clave                                                                                                 |
| --------- | -------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 1         | Accessibility        | **1**    | El modo privacidad no oculta los montos a VoiceOver/TalkBack; la tabla de presupuesto no tiene labels ni roles |
| 2         | Performance          | **2**    | Budget y Accounts montan todas las filas en un `ScrollView` sin virtualizar                                    |
| 3         | Appearance & Theming | **3**    | Sistema de tokens oklch excelente, pero el esquema claro nunca se verificó en contraste                        |
| 4         | Platform Conformance | **2**    | iOS fluido; Android es una promesa sin implementación (nav pill propia, cero Material)                         |
| 5         | Adaptivity           | **1**    | `app.config.ts` no tiene bloque `android`; `platforms: ["ios"]`                                                |
| **Total** |                      | **9/20** | **Poor (major overhaul)**                                                                                      |

**Contexto obligatorio para leer ese 9.** Si la plataforma registrada fuera `ios`, este proyecto puntuaría
~11–12. El salto a 9 lo produce el compromiso `adaptive` registrado en `PRODUCT.md` el 2026-07-28: Android
pasó de "no aplica" a "dimensión evaluable y casi vacía". No es que el código haya empeorado; es que el
listón se movió. Lo que **no** depende de la plataforma —y es el problema real— es accesibilidad: ese 1
saldría igual en iOS puro.

---

## Platform Conformance Verdict

### iOS: pasa, con reservas

Esto no es una web portada. `NativeTabs` con SF Symbols reales, `formSheet` con detents por ruta, menús
contextuales, háptica, `FullWindowOverlay` para el teclado de montos, chequeo de liquid glass, safe-area en
26 archivos, shake-to-undo, quick actions. Un usuario fluido de iPhone confía en estas pantallas.

Reservas sistémicas:

1. **`headerShown: false` en prácticamente todas las rutas** (`app/(auth)/_layout.tsx`), sustituido por
   `ScreenHeader` propio. Se renuncia a large titles colapsables y al botón atrás nativo. El componente
   documenta bien por qué (vive dentro de tarjetas modales), pero el patrón se extendió a rutas que no son
   modales.
2. **Deriva de iconografía**: 97 archivos importan `lucide-react-native`, 3 importan `Ionicons`, 1 usa
   `expo-symbols`. HIG pide SF Symbols; hoy solo aparecen en la tab bar.
3. **Inter como cara de UI** en vez de SF Pro. Queda en P3 porque `DESIGN.md` lo fija y el brief manda —
   pero contra HIG es una desviación real y debe ser una decisión, no un descuido.

### Android: falla

No es un juicio sobre la calidad del código; es que la superficie no existe:

- `app.config.ts` **no tiene bloque `android`**. Sin `package`, sin `adaptiveIcon`, sin `edgeToEdge`. Y
  declara `platforms: ["ios"]`.
- La navegación Android es `FloatingTabBar`, una píldora flotante **solo-icono**. Material 3 pide
  `NavigationBar` con etiquetas para 3–5 destinos. El componente está bien hecho (tiene `accessibilityLabel`,
  `accessibilityState`, háptica, tokens) — pero es una tab bar con estética iOS puesta sobre Android:
  exactamente el "iOS app wearing Android's skin" del slop test de Material.
- Cero componentes Material. Sin snackbars, sin FAB Material, sin diálogos Material, sin elevación tonal.
- Predictive Back no se contempla en ningún sitio.
- `formSheet` + `sheetAllowedDetents` es iOS-only en react-native-screens; las ~10 rutas que dependen de
  detents degradan a modal completo en Android sin diseño alternativo.

Matiz honesto: `TABS` ya declara `md: AndroidSymbol` para cada destino y `FloatingTabBar` está pensado como
espejo del nativo. Hay intención adaptive en el código. Lo que falta es la ejecución.

---

## Executive Summary

- **Audit Health Score: 9/20** (Poor — major overhaul, leído contra `adaptive`)
- **Issues: 2 P0 · 6 P1 · 6 P2 · 3 P3**

Top 5:

1. **El modo privacidad no es privado con lector de pantalla.** `Money.tsx` renderiza el número con
   `opacity: 0` y lo tapa con el garabato. `opacity: 0` no saca el nodo del árbol de accesibilidad: VoiceOver
   lo lee en voz alta. El copy de la App Store promete "every number on every screen blurs instantly" — con
   VoiceOver activo, esa frase es falsa.
2. **La pantalla principal es inoperable con lector de pantalla.** `BudgetCategoryRow` no tiene
   `accessibilityLabel` ni `accessibilityRole`; cada fila se anuncia como tres textos sueltos sin decir cuál
   es Assigned y cuál Available, y el gesto de editar no se anuncia como botón.
3. **El tema claro nunca se verificó en contraste.** `muted` (86 usos) da 4.41:1 sobre `background`,
   `positive` 4.06:1, `danger` 3.57:1, y `accent-foreground` sobre `accent` — el texto de **todos** los
   botones primarios — da 3.24:1. El tema oscuro pasa holgado en todos los casos.
4. **Android no tiene configuración de build.** El compromiso adaptive no puede empezar hasta que exista el
   bloque `android`.
5. **Budget y Accounts no virtualizan.** Un archivo con 100 categorías monta 100 filas, cada una con 5
   suscripciones al spreadsheet.

---

## Detailed Findings by Severity

### [P0] El modo privacidad expone los montos al lector de pantalla

- **Location**: `src/ui/Money.tsx:104-111`, `src/ui/PrivacyScribble.tsx`
- **Category**: Accessibility
- **Impact**: Un usuario de VoiceOver/TalkBack activa "Hide Amounts" en público y el teléfono sigue
  pronunciando cada cantidad. La función que el producto vende como discreción falla exactamente para quien
  depende del audio, que es quien menos control tiene sobre quién le oye.
- **Guideline**: HIG Accessibility (lo oculto visualmente debe ocultarse del árbol de accesibilidad);
  Material Accessibility. Y el Principio de Producto 4 de `PRODUCT.md`.
- **Recommendation**: En la rama `blurred`, envolver el `numberValue` invisible con
  `accessibilityElementsHidden` (iOS) + `importantForAccessibility="no-hide-descendants"` (Android), y dar al
  contenedor un `accessibilityLabel` explícito tipo "Importe oculto". El garabato debe ser el elemento
  accesible, no el número.
- **Suggested command**: `/impeccable harden`

### [P0] La tabla de presupuesto no es navegable con lector de pantalla

- **Location**: `src/screens/budget/BudgetScreen/components/BudgetCategoryRow.tsx:66-97`,
  `IncomeCategoryRow.tsx`, `src/ui/lift-menu/LiftMenuRow.tsx`
- **Category**: Accessibility
- **Impact**: La fila se anuncia como tres nodos inconexos ("Comida", "120,00", "45,00") sin decir qué columna
  es cuál. El tap edita el importe asignado, pero no hay `accessibilityRole="button"` ni hint, así que la
  acción principal de la pantalla principal es invisible. Es el escenario "0 = screen reader unusable"
  aplicado a la superficie más importante del producto.
- **Guideline**: HIG — todo control interactivo necesita label, trait y estado.
- **Recommendation**: Colapsar cada fila en un solo elemento accesible con `accessibilityLabel` compuesto
  ("Comida, asignado 120 euros, disponible 45 euros"), `accessibilityRole="button"` y un `accessibilityHint`
  para la edición. Las columnas numéricas deben quedar ocultas individualmente para no duplicar la lectura.
- **Suggested command**: `/impeccable harden`

### [P1] 22 archivos con botones solo-icono sin etiqueta

- **Location**: `src/ui/ScreenHeader/ScreenHeader.tsx:44-51`, `src/ui/CloseButton.tsx`, y 20 más (lista
  completa en _Patterns_)
- **Category**: Accessibility
- **Impact**: `ScreenHeader.Back` y `CloseButton` son los controles compartidos de salida de casi toda
  pantalla modal. Sin label, VoiceOver anuncia "botón" a secas — el usuario no sabe si retrocede, cierra o
  descarta cambios.
- **Guideline**: HIG Accessibility; Material — todo `IconButton` requiere `contentDescription`.
- **Recommendation**: Empezar por los dos componentes compartidos (arreglarlos cubre la mayor parte de la
  superficie de golpe) y luego los 20 restantes. Considerar que `Button isIconOnly` sin `accessibilityLabel`
  falle en lint.
- **Suggested command**: `/impeccable harden`

### [P1] El esquema claro incumple el contraste AA comprometido

- **Location**: `global.css:16-33` (bloque `@variant light`)
- **Category**: Accessibility / Theming
- **Impact**: Cifras verificadas (fórmula WCAG 2.1 sobre los valores resueltos del tema):

  | Par                                                      | Ratio      | AA (4.5) |
  | -------------------------------------------------------- | ---------- | -------- |
  | `muted` sobre `background` — 86 usos                     | **4.41**   | falla    |
  | `muted` sobre `surface-secondary`                        | **4.18**   | falla    |
  | `positive` sobre `surface` — cada importe positivo       | **4.06**   | falla    |
  | `danger` sobre `surface` — 22 usos, incluye borrados     | **3.57**   | falla    |
  | `accent-foreground` sobre `accent` — todo botón primario | **3.24**   | falla    |
  | `balanced` sobre `surface`                               | **2.35**   | falla    |
  | Los mismos pares en modo oscuro                          | 6.79–12.06 | pasan    |

  El patrón es inequívoco: el tema oscuro se afinó, el claro se heredó. Y duele porque el comentario en
  `global.css:25` demuestra que el problema ya se había visto ("success is too light as text") y por eso
  existe `--positive` — solo que se quedó en 4.06 en vez de cruzar 4.5.

- **Guideline**: WCAG 2.1 AA (1.4.3), comprometido explícitamente en `PRODUCT.md`.
- **Caveat**: son cálculos sobre los valores resueltos del token, no medición en dispositivo. Texto grande
  (≥18.66px bold o ≥24px) solo necesita 3:1, así que los importes hero probablemente pasan. Los que fallan son
  los de cuerpo, que son la mayoría.
- **Recommendation**: Bajar la L de `muted`, `positive`, `danger` y `balanced` en el bloque claro hasta cruzar
  4.5:1 contra `background` (el peor caso, no contra `surface`). Para `accent-foreground` sobre `accent`:
  oscurecer el accent en modo claro o poner texto oscuro encima. Añadir un test que compute los ratios de los
  pares críticos y falle en CI.
- **Suggested command**: `/impeccable colorize`

### [P1] Android no tiene configuración de build

- **Location**: `app.config.ts:20-58`
- **Category**: Adaptivity / Conformance
- **Impact**: Con `platforms: ["ios"]` y sin bloque `android`, el compromiso adaptive no puede ni arrancar:
  falta `package`, `adaptiveIcon`, `edgeToEdge` y los permisos equivalentes a los `infoPlist` que sí están
  declarados para iOS.
- **Guideline**: Material 3 — edge-to-edge con window insets.
- **Recommendation**: Añadir el bloque `android` con `package`, `adaptiveIcon`, `edgeToEdge: true` y los
  permisos espejo de red local y ubicación. Es el desbloqueo previo a cualquier otro trabajo Android.
- **Suggested command**: `/impeccable adapt`

### [P1] La navegación Android es una píldora solo-icono, no una NavigationBar

- **Location**: `src/ui/navigation/FloatingTabBar.tsx:47-110`, `app/(auth)/(tabs)/_layout.tsx:30-45`
- **Category**: Conformance
- **Impact**: Sin etiquetas visibles, cuatro iconos abstractos (cartera / recibo / columnas / barras) obligan
  a adivinar. Material pide etiqueta al menos en el destino activo. Además el objetivo táctil es 44×56
  (`h-11 w-14`) frente al mínimo de 48dp — el `hitSlop={6}` lo salva justo, pero por accidente.
- **Guideline**: Material 3 — Navigation bar, 3–5 destinos con etiqueta; touch target 48dp.
- **Recommendation**: En Android, renderizar `NavigationBar` de Material con etiquetas e indicador de píldora
  en vez de replicar la estética flotante de iOS. `TABS` ya tiene el campo `md` con los Material Symbols
  listos.
- **Suggested command**: `/impeccable adapt`

### [P1] Budget y Accounts renderizan listas sin virtualizar

- **Location**: `src/screens/budget/BudgetScreen/index.tsx:273-315`,
  `src/screens/accounts/AccountsScreen/index.tsx:121`
- **Category**: Performance
- **Impact**: Todos los grupos y categorías se montan de golpe dentro de un `Animated.ScrollView`. Con ~100
  categorías son ~100 filas montadas y ~500 suscripciones al spreadsheet (`BudgetCategoryRow` abre 5 por
  fila). Encarece el arranque de la pantalla más visitada y la memoria en dispositivos modestos. Los
  registros de transacciones —las listas realmente ilimitadas— **sí** usan `LegendList`, así que el patrón
  correcto ya existe en la casa.
- **Recommendation**: Migrar a `LegendList` con secciones, o virtualizar por grupo. Cuidado: el acordeón con
  `AccordionLayoutTransition` y el `LiftMenu` dependen de medir frames, así que no es un swap mecánico.
- **Suggested command**: `/impeccable optimize`

### [P1] Columnas numéricas de ancho fijo contra Dynamic Type

- **Location**: `src/screens/budget/BudgetScreen/components/columns.tsx:5-6`
- **Category**: Accessibility / Adaptivity
- **Impact**: `COL_ASSIGNED = 96` y `COL_AVAILABLE = 104` son píxeles fijos. Buena noticia: no hay un solo
  `allowFontScaling={false}` en `src/`, así que el texto **sí** escala. Mala: al escalar, los importes
  desbordan o se recortan dentro de columnas que no crecen, y el nombre de categoría lleva `numberOfLines={1}`.
  A tamaños grandes la tabla se rompe justo donde el usuario necesita leer números.
- **Guideline**: HIG Dynamic Type; comprometido en `PRODUCT.md`.
- **Recommendation**: Derivar los anchos de columna del tamaño de fuente efectivo
  (`useWindowDimensions().fontScale`), o pasar la fila a layout vertical por encima de un umbral de escala.
- **Suggested command**: `/impeccable adapt`

### [P2] Tres sets de iconos conviviendo

- **Location**: 97 archivos con `lucide-react-native`, 3 con `@expo/vector-icons` (`SwipeableRow.tsx:14`), 1
  con `expo-symbols`
- **Category**: Conformance
- **Impact**: Lucide no está alineado a la línea base tipográfica ni responde a Dynamic Type como SF Symbols.
  Mezclar Ionicons con Lucide produce pesos e idiomas de trazo distintos en la misma pantalla.
- **Recommendation**: Unificar sobre SF Symbols en iOS / Material Symbols en Android, con Lucide como fallback
  único. Eliminar Ionicons primero: son 3 archivos.
- **Suggested command**: `/impeccable polish`

### [P2] `headerShown: false` global sustituye la barra de navegación nativa

- **Location**: `app/(auth)/_layout.tsx` (todas las rutas), `src/ui/ScreenHeader/ScreenHeader.tsx`
- **Category**: Conformance
- **Impact**: Sin large titles colapsables ni botón atrás nativo. El gesto de edge-swipe sigue vivo, pero el
  usuario pierde la señal visual de jerarquía. Justificado dentro de tarjetas modales, cuestionable en rutas
  empujadas.
- **Recommendation**: Devolver el header nativo a las rutas de tipo `screen`; reservar `ScreenHeader` para las
  que viven dentro de una tarjeta modal.
- **Suggested command**: `/impeccable polish`

### [P2] Los detents de `formSheet` no tienen equivalente Android

- **Location**: `src/lib/hooks/useStackOptions.ts:47-51` y ~10 rutas en `app/(auth)/_layout.tsx`
- **Category**: Adaptivity
- **Impact**: `cover-overspent` a 0.45 y `category-picker` a [0.5, 1.0] degradan a pantalla completa en
  Android, perdiendo el contexto de fondo que justifica el patrón.
- **Recommendation**: Mapear a `ModalBottomSheet` de Material con los mismos puntos de anclaje.
- **Suggested command**: `/impeccable adapt`

### [P2] Reduce Motion honrado en 4 de 7 componentes animados

- **Location**: lo respetan `SwipeableRow.tsx`, `BlinkingCursor.tsx`, `money-entry/AmountField.tsx`,
  `MoveMoneyScreen/components/DirectionToggle.tsx`; faltan los 3 restantes con `withTiming`/`useAnimatedStyle`
- **Category**: Accessibility
- **Impact**: Cobertura parcial es peor que ninguna para quien tiene sensibilidad al movimiento: la mitad de
  la app se calma y la otra mitad no.
- **Recommendation**: Extraer un hook compartido y aplicarlo a los 7. En Android, mapear también el ajuste
  "Quitar animaciones".
- **Suggested command**: `/impeccable animate`

### [P2] `DESIGN.md` no documenta los tokens propios

- **Location**: `DESIGN.md` vs `global.css:25-50`
- **Category**: Theming
- **Impact**: `--positive`, `--balanced`, `--chart-6..8`, `--chart-income/expense/neutral` existen en el tema y
  se usan en producto, pero el documento de diseño no los menciona. Quien lea `DESIGN.md` para elegir un color
  de importe llegará a `success`, que es precisamente el token que falla como texto.
- **Recommendation**: Regenerar la tabla de color incluyendo los tokens propios y por qué existen.
- **Suggested command**: `/impeccable document`

### [P2] Manejo de teclado sin estrategia Android

- **Location**: `src/screens/transactions/NewTransactionScreen/index.tsx:65`,
  `src/screens/auth/components/AuthShell.tsx:20`, `src/screens/schedules/ScheduleDetailScreen/index.tsx:97`,
  `src/screens/transactions/components/category-select/SplitAmountsView.tsx:155`,
  `src/ui/feedback/dialog/DialogHost.tsx:61`
- **Category**: Adaptivity
- **Impact**: El patrón repetido `behavior={Platform.OS === "ios" ? "padding" : undefined}` deja Android a
  merced de `adjustResize`, que con edge-to-edge activado deja de funcionar bien. `KeyboardProvider` está en el
  root y ayuda, pero no está aprovechado en estas cinco pantallas.
- **Recommendation**: Usar `KeyboardAvoidingView` de `react-native-keyboard-controller`, ya instalado, con
  insets IME reales.
- **Suggested command**: `/impeccable adapt`

### [P3] Inter como cara de UI

`app/_layout.tsx:19-23`. HIG pide SF Pro para cuerpo y controles; Material pide Roboto. Inter está fijado en
`DESIGN.md`, así que **no se recomienda cambiarlo** — se registra para que sea una decisión consciente y no
deriva. Si se mantiene, conviene declararlo explícitamente como excepción de marca en `DESIGN.md`.

### [P3] `gestureEnabled: false` en assign-money

`app/(auth)/_layout.tsx:40`. Rompe swipe-to-dismiss en un modal. HIG lo permite solo cuando hay riesgo de
pérdida de datos; si es el caso, mejor un guard de confirmación que matar el gesto.

### [P3] 16 hex crudos en ErrorBoundary

`src/ui/feedback/ErrorBoundary.tsx`. Justificado —renderiza fuera del provider de tema—, pero merece un
comentario que lo diga para que no se lea como descuido, y valores que sigan cumpliendo contraste en ambos
modos.

---

## Patterns & Systemic Issues

1. **La accesibilidad se aplicó por parches, no por sistema.** 12 de 214 archivos `.tsx` tienen
   `accessibilityLabel`; 4 tienen `accessibilityRole`; 0 tienen `accessibilityHint`. Los que lo tienen son
   buenos (`FloatingTabBar` incluso maneja `accessibilityState`), lo que sugiere que se resolvió donde alguien
   se acordó.

   Los 22 archivos con botones solo-icono sin etiqueta:

   ```
   src/ui/ScreenHeader/ScreenHeader.tsx
   src/ui/CloseButton.tsx
   src/screens/encryption/EncryptionPasswordScreen/index.tsx
   src/screens/settings/SettingsScreen/index.tsx
   src/screens/schedules/ScheduleNameScreen/index.tsx
   src/screens/auth/NewBudgetScreen/index.tsx
   src/screens/transactions/NewTransactionScreen/components/sheets/TagsField.tsx
   src/screens/transactions/SearchScreen/index.tsx
   src/screens/transactions/components/category-select/SplitAmountsView.tsx
   src/screens/transactions/TransactionsListScreen/components/AccountDetailHeader.tsx
   src/screens/transactions/TransactionsListScreen/components/AccountDetailMenu.tsx
   src/screens/transactions/TransactionsListScreen/components/SearchButton.tsx
   src/screens/accounts/NewAccountScreen/index.tsx
   src/screens/accounts/CloseAccountScreen/index.tsx
   src/screens/accounts/ReconcileScreen/index.tsx
   src/screens/accounts/AccountSettingsScreen/index.tsx
   src/screens/files/BudgetFilesScreen/index.tsx
   src/screens/files/ChangeBudgetScreen/index.tsx
   src/screens/budget/HoldScreen/index.tsx
   src/screens/budget/EditBudgetScreen/components/PlanActionsMenu.tsx
   src/screens/budget/RenameCategoryScreen/index.tsx
   src/screens/budget/CategoryDetailsScreen/index.tsx
   ```

2. **El tema oscuro es de primera clase; el claro es su reflejo sin verificar.** Todos los fallos de contraste
   están en `@variant light`, ninguno en `@variant dark`.

3. **Android existe como intención tipada, no como implementación.** `TabConfig` declara `md: AndroidSymbol`
   para cada destino, `FloatingTabBar` se documenta como "mirroring the iOS NativeTabs", hay ramas
   `Platform.OS === "android"` en 3 sitios. La estructura para adaptive está pensada; falta el build, los
   componentes Material y el respeto a Predictive Back.

4. **Virtualización aplicada donde la lista es infinita, olvidada donde es solo larga.** Transacciones y
   búsqueda usan `LegendList`; presupuesto y cuentas no. La regla mental parece haber sido "¿puede crecer sin
   límite?" en vez de "¿cuántas filas monta en el caso real?".

---

## Positive Findings

Cosas que están genuinamente bien y que conviene no romper al arreglar lo de arriba:

- **El sistema de tokens es de los buenos.** 17 hex crudos en todo `src/`, 16 de ellos en `ErrorBoundary`
  (donde no hay provider de tema) y 1 en `lib/colors.ts`. Todo lo demás pasa por tokens oklch con variantes
  claro/oscuro y utilidades registradas en `@theme`.
- **`--positive` es el tipo de decisión que distingue un sistema pensado de uno copiado.** Se detectó que
  `success` era ilegible como texto, se creó un token separado y se documentó en el propio CSS. El valor
  necesita ajuste, pero el razonamiento es correcto.
- **La paleta de gráficos está afinada por modo**: mismos matices, lightness elevada y croma recortado en
  oscuro. Con tokens semánticos (`--chart-income/expense/neutral`) encima de la escala cualitativa.
- **La granularidad de re-render está bien resuelta.** `BudgetCategoryRow` memoizado con props estables por
  diseño, refs espejando estado para que los handlers no cambien, suscripciones por celda del spreadsheet.
- **El uso de iOS es sofisticado**: `FullWindowOverlay` para el teclado de montos, detección de liquid glass,
  `NativeTabs` con SF Symbols, detents por ruta, shake-to-undo, quick actions.
- **`useStackOptions` resuelve un bug real y sutil** —los flashes blancos entre pantallas por `contentStyle`
  sin definir— y lo documenta.
- **i18n completo desde el principio** (EN+ES con `ParseKeys` tipado), no añadido a posteriori.
- **`FloatingTabBar` es el componente más accesible de la app**: label, estado seleccionado, háptica, hitSlop.
  Es la prueba de que el patrón correcto se sabe hacer — solo falta generalizarlo.

---

## Recommended Actions

1. **[P0] `/impeccable harden`** — Cerrar la fuga del modo privacidad al lector de pantalla (`Money.tsx`), dar
   label/rol/hint compuesto a las filas de presupuesto, y etiquetar `ScreenHeader.Back` y `CloseButton` para
   cubrir de golpe la mayoría de los 22 archivos.
2. **[P1] `/impeccable colorize`** — Reafinar `muted`, `positive`, `danger`, `balanced` y el par
   `accent`/`accent-foreground` en `@variant light` hasta cruzar 4.5:1 contra `background`, con un test de
   ratios en CI.
3. **[P1] `/impeccable adapt`** — Bloque `android` en `app.config.ts` con edge-to-edge, `NavigationBar` de
   Material sustituyendo la píldora, equivalentes Android de los `formSheet` con detents, anchos de columna
   derivados de `fontScale`, y teclado vía `react-native-keyboard-controller`.
4. **[P1] `/impeccable optimize`** — Virtualizar Budget y Accounts con `LegendList`, preservando el acordeón y
   el `LiftMenu` que dependen de medir frames.
5. **[P2] `/impeccable animate`** — Extender Reduce Motion a los 3 componentes animados que faltan y mapear el
   ajuste equivalente de Android.
6. **[P2] `/impeccable document`** — Regenerar `DESIGN.md` con los tokens propios (`positive`, `balanced`,
   `chart-6..8`, semánticos) y con Inter declarado como excepción de marca frente a SF/Roboto.
7. **[P2] `/impeccable polish`** — Unificar iconografía (empezando por eliminar Ionicons), devolver el header
   nativo a las rutas no modales, y revisar el `gestureEnabled: false`.

---

## Nota de encuadre

El 9/20 es real pero es sobre todo consecuencia de haber movido el listón a `adaptive`. Si Android sigue
siendo el plan, el orden de arriba es el correcto. Si al ver el tamaño de la deuda Android se prefiere volver
a `ios`, hay que actualizar `PRODUCT.md`: con eso desaparecen la acción 3 y parte de la 6, y quedarían
accesibilidad y contraste — que hay que arreglar en cualquier escenario.

## Cómo reproducir

```
/impeccable audit
```

Vuelve a ejecutarlo tras los arreglos para comparar la puntuación contra esta línea base.
