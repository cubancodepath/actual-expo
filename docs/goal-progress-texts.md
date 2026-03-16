# Textos de la barra de progreso de Goals

Referencia completa de todos los textos que muestra la barra de progreso en la pantalla de presupuesto.

**Archivo fuente**: `src/goals/progress.ts` — función `getGoalProgress(cat)`

---

## 1. Sin goal definido (`goalDef` vacío o `goal == null`)

| Condición                    | Texto mostrado | Explicación                                                                    |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------ |
| No hay gastos (`spent == 0`) | `No spending`  | La categoría no tiene meta y no se ha gastado nada este mes.                   |
| Hay gastos                   | `Spent $XX.XX` | La categoría no tiene meta pero se ha gastado dinero. Muestra cuánto se gastó. |

---

## 2. Goal de balance (`#goal` — tipo `goal`)

Meta de ahorro sin fecha límite. Se evalúa contra el **balance** de la categoría.

| Condición         | Texto mostrado          | Explicación                                                                         |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `balance >= goal` | `Fully funded`          | El balance ya alcanzó o superó la meta. La categoría está completamente financiada. |
| `balance < goal`  | `$XX.XX left to budget` | Falta presupuestar esa cantidad para alcanzar la meta de balance.                   |

---

## 3. Template simple (`#template N` — tipo `simple`)

Monto fijo mensual, opcionalmente con límite de gasto.

### 3a. Tope de gasto puro (`monthly: 0` + tiene `limit`)

Solo controla cuánto se gasta, no presupuesta nada.

| Condición          | Texto mostrado                  | Explicación                                                   |
| ------------------ | ------------------------------- | ------------------------------------------------------------- |
| No hay gastos      | `Nothing spent of $XX.XX limit` | No se ha gastado nada aún. Muestra el límite total permitido. |
| `spent >= goal`    | `Limit reached. Spent $XX.XX`   | Se alcanzó o superó el límite de gasto. Alerta visual.        |
| `0 < spent < goal` | `Spent $XX.XX of $XX.XX limit`  | Se ha gastado una parte del límite. Muestra progreso parcial. |

### 3b. Template simple normal (con o sin refill)

Presupuesta un monto fijo cada mes. Se evalúa contra lo **presupuestado**.

| Condición               | Texto mostrado                   | Explicación                                                                      |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Financiado + sin gastos | `Funded. Nothing spent yet`      | Se presupuestó lo suficiente y no se ha gastado nada todavía.                    |
| Financiado + con gastos | `Funded. Spent $XX.XX of $XX.XX` | Se presupuestó lo suficiente. Muestra cuánto se ha gastado del total de la meta. |
| No financiado           | `$XX.XX more needed this month`  | Falta presupuestar esa cantidad para alcanzar la meta este mes.                  |

---

## 4. Fondo de ahorro (`#template N by YYYY-MM` — tipo `by`)

Ahorro progresivo hacia una fecha específica. El sistema calcula cuánto presupuestar cada mes para llegar a tiempo.

| Condición               | Texto mostrado                   | Explicación                                                                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Financiado + sin gastos | `Funded. Nothing spent yet`      | La cuota de este mes ya está cubierta.                                                                  |
| Financiado + con gastos | `Funded. Spent $XX.XX of $XX.XX` | Cuota cubierta. Muestra el gasto actual vs la meta.                                                     |
| No financiado           | `$XX.XX more needed by Jan 1`    | Falta presupuestar esa cantidad. La fecha indica el día del mes objetivo (ej: "by Jan 1", "by Dec 15"). |

---

## 5. Gasto distribuido (`#template N by YYYY-MM spend from YYYY-MM` — tipo `spend`)

Distribuye un monto objetivo a lo largo de varios meses.

| Condición               | Texto mostrado                   | Explicación                                                                                              |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Financiado + sin gastos | `Funded. Nothing spent yet`      | La cuota de este mes ya está cubierta.                                                                   |
| Financiado + con gastos | `Funded. Spent $XX.XX of $XX.XX` | Cuota cubierta con gastos parciales.                                                                     |
| No financiado           | `$XX.XX more needed by Mar 2026` | Falta presupuestar esa cantidad. La fecha muestra mes y año objetivo (ej: "by Mar 2026", "by Jan 2025"). |

---

## 6. Límite de gasto (`limit` y `refill`)

Templates que controlan cuánto se puede gastar en la categoría.

| Condición          | Texto mostrado                  | Explicación                                                      |
| ------------------ | ------------------------------- | ---------------------------------------------------------------- |
| No hay gastos      | `Nothing spent of $XX.XX limit` | No se ha gastado nada. Muestra el límite total.                  |
| `spent >= goal`    | `Limit reached. Spent $XX.XX`   | Se alcanzó el límite. Muestra el total gastado como advertencia. |
| `0 < spent < goal` | `Spent $XX.XX of $XX.XX limit`  | Gasto parcial dentro del límite permitido.                       |

---

## 7. Otros templates (`average`, `copy`, `periodic`, `percentage`, `remainder`)

Comportamiento por defecto para templates que no tienen lógica especial de texto.

| Condición               | Texto mostrado                   | Explicación                               |
| ----------------------- | -------------------------------- | ----------------------------------------- |
| Financiado + sin gastos | `Funded. Nothing spent yet`      | La meta calculada ya está cubierta.       |
| Financiado + con gastos | `Funded. Spent $XX.XX of $XX.XX` | Meta cubierta con gastos parciales.       |
| No financiado           | `$XX.XX more needed this month`  | Falta presupuestar esa cantidad este mes. |

---

## Resumen de todos los textos únicos

| #   | Texto                             | Cuándo aparece                                                              |
| --- | --------------------------------- | --------------------------------------------------------------------------- |
| 1   | `No spending`                     | Sin goal y sin gastos                                                       |
| 2   | `Spent $XX.XX`                    | Sin goal pero con gastos                                                    |
| 3   | `Fully funded`                    | Goal de balance alcanzado                                                   |
| 4   | `$XX.XX left to budget`           | Goal de balance no alcanzado                                                |
| 5   | `Funded. Nothing spent yet`       | Meta mensual cubierta, sin gastos                                           |
| 6   | `Funded. Spent $XX.XX of $XX.XX`  | Meta mensual cubierta, con gastos                                           |
| 7   | `$XX.XX more needed this month`   | Falta presupuestar (simple, average, copy, periodic, percentage, remainder) |
| 8   | `$XX.XX more needed by [día]`     | Falta presupuestar (fondo de ahorro `by`)                                   |
| 9   | `$XX.XX more needed by [mes año]` | Falta presupuestar (gasto distribuido `spend`)                              |
| 10  | `Nothing spent of $XX.XX limit`   | Límite de gasto sin gastos                                                  |
| 11  | `Limit reached. Spent $XX.XX`     | Límite de gasto alcanzado                                                   |
| 12  | `Spent $XX.XX of $XX.XX limit`    | Gasto parcial dentro del límite                                             |

---

## Lógica de "financiado"

La condición de financiado depende del tipo de goal:

- **`#goal` (longGoal = true)**: Financiado cuando `balance >= goal`
- **Templates (longGoal = false)**: Financiado cuando `budgeted >= goal`

En ambos casos, `goal` debe ser mayor a 0.
