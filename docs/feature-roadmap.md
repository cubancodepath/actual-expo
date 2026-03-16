# Feature Roadmap — Actual Budget Expo

Documento vivo para trackear features futuras y su progreso.

---

## Rules Engine

### Completado

- [x] Tipos mejorados (`ConditionOp`, `ActionOp`, `RuleStage`, `FIELD_TYPES`, `INTERNAL_FIELD_MAP`)
- [x] Motor de evaluacion puro (`evalCondition`, `execAction`, `rankRules`, `runRules`) — 74 tests
- [x] Store read-only (`useRulesStore`) con auto-refresh en sync
- [x] Bridge form↔engine (`applyRulesToForm`, `suggestCategoryForPayee`) — 18 tests
- [x] Auto-sugerir categoria al seleccionar payee en transaction/new
- [x] Aplicar rules al guardar transacciones nuevas (categoria, notas, cuenta)
- [x] `userOverrides` ref para no pisar valores de URL params / Apple Intents / picks manuales

### Pendiente

- [ ] Pantalla de rules (read-only en Settings) — mostrar condiciones y acciones en formato legible
- [ ] Aplicar rules en sync — cuando llegan transacciones del servidor (bank sync), pasarlas por el engine
- [ ] Soporte para condiciones `onBudget`/`offBudget` (requiere enrichment de account)
- [ ] Soporte para condiciones de fecha recurrente (`RecurConfig`)
- [ ] Soporte para acciones con templates/formulas (Handlebars, HyperFormula)

---

## Importacion de Transacciones

### Pendiente

- [ ] Importar archivos OFX/QFX/CSV
- [ ] Aplicar rules de `imported_payee` durante importacion (pre-stage rules)
- [ ] Reconciliacion con transacciones existentes (matching por fecha/monto)

---

## Payee Location

### Pendiente

- [ ] Guardar ubicacion GPS al crear transaccion (opcional, con permiso del usuario)
- [ ] Asociar ubicaciones a payees (un payee puede tener multiples ubicaciones)
- [ ] Auto-sugerir payee basado en ubicacion actual (proximity matching)
- [ ] Mapa de transacciones por payee (ver donde gastas)
- [ ] Persistencia de ubicaciones en SQLite (tabla `payee_locations` o campo en `payees`)
- [ ] Settings toggle para habilitar/deshabilitar location tracking
- [ ] Sincronizar ubicaciones via CRDT (si el servidor lo soporta)

---

## Bank Sync (GoCardless / SimpleFIN)

> ⚠️ **Limitacion de testing**: No hay forma facil de probar conexiones bancarias reales en desarrollo. Considerar mocks/sandbox de GoCardless o SimpleFIN para desarrollo, pero la integracion real solo se puede validar con cuentas bancarias activas.

### Pendiente

- [ ] Investigar sandbox/test mode de GoCardless y SimpleFIN
- [ ] Configuracion de conexion bancaria (UI de seleccion de banco)
- [ ] Flujo OAuth / link de autorizacion bancaria
- [ ] Descarga automatica de transacciones
- [ ] Aplicar rules engine a transacciones importadas
- [ ] Reconciliacion automatica con transacciones manuales existentes
- [ ] UI de estado de conexion y errores
- [ ] Manejo de reconexion cuando expira la autorizacion
- [ ] Soporte para multiples cuentas por conexion

---

## Reportes y Graficos

### Pendiente

- [ ] Spending by category (grafico de torta/barras)
- [ ] Net worth over time
- [ ] Cash flow mensual
- [ ] Exportar reportes

---

## Notificaciones

### Pendiente

- [ ] Recordatorios de presupuesto (cuando una categoria esta cerca del limite)
- [ ] Recordatorios de schedules proximos
- [ ] Alertas de sync fallido

---

## Widgets (iOS)

### Pendiente

- [ ] Widget de balance por cuenta
- [ ] Widget de presupuesto del mes
- [ ] Widget de transaccion rapida
