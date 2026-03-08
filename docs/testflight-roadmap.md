# Actual Expo - Analisis de Estado y Roadmap a TestFlight

## Contexto

Analisis completo del estado actual de la app movil Actual Budget (Expo/React Native) para determinar que tenemos, que falta, y que se necesita para llegar a TestFlight.

---

## 1. ESTADO ACTUAL - Lo que tenemos (COMPLETO)

### Funcionalidades Core
- **Autenticacion**: Password + OpenID + modo local offline
- **Onboarding**: Wizard de 3 paginas con animaciones + setup local guiado
- **Cuentas**: CRUD completo, cerrar/reabrir, off-budget, context menu
- **Transacciones**: Crear/editar/eliminar, splits, transfers, bulk select, swipe actions
- **Presupuesto**: Vista mensual, edicion inline con calculadora, progress bars, filtros
- **Categorias**: CRUD, grupos, reordenar (drag), ocultar, eliminar con transferencia
- **Payees**: CRUD, favoritos, merge, busqueda
- **Tags**: Crear/editar, extraccion inline desde notas, colores
- **Goals**: 10 tipos de metas (simple, balance, by-date, periodic, limit, average, copy, percentage, remainder, spend)
- **Mover dinero**: Cover overspent, transferir entre categorias
- **Reconciliacion**: Marcar cleared/reconciled, overlay de reconciliacion, ultima fecha
- **Busqueda avanzada**: Token-based con sugerencias (categorias, payees, montos, fechas)
- **Undo/Redo**: Soporte completo via CRDT message history + shake-to-undo
- **Quick Actions**: Shortcuts de iOS para agregar transacciones con pre-fill
- **App Intent**: Entity selectors dinamicos para shortcuts
- **Privacidad**: Modo privacidad que oculta montos
- **Sync CRDT**: Completo con HLC timestamps, Merkle tree, protobuf, retry logic
- **Encriptacion**: AES-256-GCM implementado en sync (per-message)
- **Tema**: Light/dark automatico, paleta Actual Budget
- **Settings**: Formato fecha/numero, dia inicio semana, progress bars, sync manual

### Arquitectura y Codigo
- 0 comentarios TODO/FIXME/HACK en todo el codigo
- TypeScript estricto
- 46 pantallas completas y funcionales
- Zustand stores bien organizados (13 stores)
- Raw SQL sin ORM (matches Actual original)
- Local-first: todo persiste en SQLite primero

---

## 2. BLOQUEANTES PARA TESTFLIGHT (Critico)

### 2.1 Crear `eas.json`
- **No existe** - sin esto no se puede hacer build para TestFlight
- Necesita perfiles: development, preview (TestFlight), production
- Configurar auto-submit a TestFlight

### 2.2 Bundle ID
- Actualmente: `com.anonymous.actual-expo`
- **Cambiar "anonymous"** por un identificador real (ej: `com.actualbudget.mobile`)
- Apple rechazara apps con "anonymous" en bundle ID

### 2.3 App Store Metadata
- Version: `1.0.0` - OK para inicio
- Necesita: screenshots, descripcion, keywords, categoria
- Privacy Policy URL (requerido por Apple)

### 2.4 Provisioning & Signing
- Necesita Apple Developer Account ($99/year)
- Configurar certificates y provisioning profiles (EAS lo maneja)

---

## 3. RECOMENDADO ANTES DE TESTFLIGHT (Alta prioridad)

### 3.1 Error Boundary
- **No hay ErrorBoundary** en la app
- Un crash no capturado = app se cierra sin feedback
- Agregar React Error Boundary en root layout

### 3.2 Crash Reporting (Sentry o similar)
- **No hay crash reporting** configurado
- Sin esto, no sabras por que crashea en dispositivos de testers
- Sentry tiene SDK para Expo: `@sentry/react-native`

### 3.3 Version / Build Number Management
- iOS requiere build number incremental para cada upload a TestFlight
- Configurar auto-increment o usar `eas build --auto-submit`

### 3.4 iOS Minimum Version
- Actualmente: iOS 12.0
- Subir a iOS 16.0+ (Expo 55 requiere iOS 16 minimo de todas formas)

### 3.5 Archivos encriptados
- Actualmente bloquea descarga de budgets encriptados
- Muestra error: "Encrypted files are not yet supported"
- No es bloqueante si testers usan budgets sin encriptar

---

## 4. MEJORAS POST-TESTFLIGHT (Media prioridad)

### 4.1 Accesibilidad (a11y)
- **CERO** atributos de accesibilidad en toda la app
- No hay `accessibilityLabel`, `accessibilityRole`, `accessibilityHint`
- Apple puede rechazar la app en review por falta de a11y
- **Riesgo**: Esto podria ser bloqueante para App Store (no TestFlight)

### 4.2 Reportes y Graficos
- No hay graficos de gastos vs ingresos
- No hay tendencias mensuales
- No hay net worth tracking
- Es la feature mas pedida en apps de presupuesto

### 4.3 Reglas y Automatizacion
- No hay auto-categorizacion de transacciones
- No hay transacciones recurrentes/programadas
- No hay reglas de importacion

### 4.4 Import/Export
- No hay importacion de OFX/CSV/QIF
- No hay exportacion de datos
- No hay bank feeds

### 4.5 Busqueda Global
- Busqueda existe pero solo en spending y por cuenta
- No hay busqueda global desde cualquier pantalla

---

## 5. NICE TO HAVE (Baja prioridad)

### 5.1 Testing
- No hay test runner configurado (mencionado en CLAUDE.md)
- Vitest disponible pero no integrado en CI
- No hay E2E tests (Detox/Maestro)

### 5.2 CI/CD
- No hay GitHub Actions ni EAS Workflows
- Builds manuales solamente
- No hay linter configurado

### 5.3 Performance
- Algunas listas sin virtualizacion (categorias)
- No hay query caching
- No hay paginacion en budget queries

### 5.4 Multi-Currency
- No soportado
- No hay tasas de cambio

### 5.5 Widgets
- No hay iOS widgets (Today, Lock Screen)
- Podria mostrar balance total o categoria

---

## 6. CHECKLIST TESTFLIGHT

```
INFRAESTRUCTURA BUILD
[ ] Crear eas.json con perfiles (dev, preview, production)
[ ] Cambiar bundle ID de "anonymous" a identificador real
[ ] Apple Developer Account activa
[ ] Configurar signing con EAS (eas credentials)
[ ] Primer build: eas build --platform ios --profile preview

APP STORE CONNECT
[ ] Crear app en App Store Connect
[ ] Subir build a TestFlight
[ ] Agregar testers (internos y/o externos)
[ ] Privacy Policy URL
[ ] Descripcion breve de la app

CALIDAD MINIMA
[ ] Agregar ErrorBoundary en root layout
[ ] Integrar Sentry (o similar) para crash reporting
[ ] Probar en dispositivo fisico (no solo simulador)
[ ] Probar sync completo con servidor real
[ ] Probar modo offline
[ ] Probar login con password y OpenID
[ ] Verificar que no hay hardcoded localhost en prod
[ ] Verificar splash screen y app icon en dispositivo

OPCIONAL PERO RECOMENDADO
[ ] Subir iOS minimum a 16.0
[ ] Agregar accessibilityLabel a elementos interactivos principales
[ ] Agregar build number auto-increment
[ ] Crear script de build en package.json
```

---

## 7. EVALUACION GENERAL

| Area | Estado | Nota |
|------|--------|------|
| Funcionalidad core | Completo | Todas las features de presupuesto basico |
| Sync | Completo | CRDT production-grade con 6 bug fixes |
| UI/UX | Muy bueno | Animaciones, gestos, tema, calculadora |
| Codigo | Excelente | 0 TODOs, TypeScript estricto, clean |
| Infraestructura build | No existe | Falta eas.json, bundle ID, signing |
| Error handling | Parcial | Sync si, stores no, no ErrorBoundary |
| Crash reporting | No existe | Critico para TestFlight |
| Accesibilidad | No existe | Riesgo App Store review |
| Testing | No existe | Solo manual |
| Reportes/graficos | No existe | Feature gap vs desktop |

**Veredicto**: La app esta funcionalmente lista. El codigo es de alta calidad. Lo que falta es infraestructura de build (eas.json, bundle ID, signing) y herramientas de produccion (crash reporting, error boundaries). Con 2-3 dias de trabajo en infraestructura, se puede hacer el primer TestFlight.
