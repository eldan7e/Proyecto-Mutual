# Informe de Grupos con Morosidad Crítica (> 4 Períodos Consecutivos sin Pago)

**Fecha de relevamiento:** 24/09/2026  
**Universo analizado:** 15 períodos de facturación (`2025-06` a `2026-08`), 381 grupos y más de 11.000 movimientos en cuenta corriente con paridad al Excel de referencia `00. AUNAR CONTROL DE PAGOS - (CON DATOS) OK - ppppppppp.xlsx`.

---

## 1. Resumen Ejecutivo

Al analizar el flujo de cobros reales bancarios (sin guiarse por indicadores estáticos antiguos) frente a los vencimientos mensuales, se detectaron **9 grupos activos con más de 4 períodos consecutivos sin registrar pago alguno**.

| Grupo | Titular / Identificación | Racha Actual sin Pago | Períodos Impagos Consecutivos | Último Pago Registrado | Capital Pendiente | Interés Mora | **Deuda Total Actualizada** |
| :---: | :--- | :---: | :--- | :---: | :---: | :---: | :---: |
| **70123** | **Amoreo, Emilia** | **11 períodos** | `2025-08` a `2026-06` | *Nunca pagó* | $255.534,53 | $141.923,49 | **$397.458,02** |
| **409** | **Lorenzo, Emilio Eladio** | **11 períodos** | `2025-10` a `2026-08` | 12/10/2025 | $702.931,34 | $372.008,53 | **$1.074.939,87** |
| **325** | **Catena, Antonela** | **11 períodos** | `2025-10` a `2026-08` | 12/10/2025 | $444.579,61 | $177.629,82 | **$622.209,43** |
| **326** | **Mutual Aunar** *(Líneas Pruebas / Uso)* | **10 períodos** | `2025-11` a `2026-08` | 16/10/2025 | $739.567,04 | $205.872,47 | **$945.439,51** |
| **327** | **Lorenzo, Diego / Rocío** | **10 períodos** | `2025-11` a `2026-08` | 31/10/2025 | $347.439,46 | $105.422,77 | **$452.862,23** |
| **70067** | **Amico, Susana Vanina** | **8 períodos** | `2025-11` a `2026-06` | 31/10/2025 | $308.376,77 | $175.079,49 | **$483.456,26** |
| **5006** | **Guazzaroni, Haydee / Marra, Yesica** | **8 períodos** | `2025-11` a `2026-06` | 28/10/2025 | $211.101,88 | $115.282,70 | **$326.384,58** |
| **126** | **Scognamillo, Telma Julia / Vidal** | **6 períodos** | `2026-03` a `2026-08` | 26/08/2026 *(pago parcial)* | $1.225.516,81 | $273.531,45 | **$1.499.048,26** |
| **6** | **Nieto, Carlos Hernán** | **5 períodos** | `2026-04` a `2026-08` | 20/02/2026 | $947.937,53 | $152.467,79 | **$1.100.405,33** |

---

## 2. Detalle por Grupo

### Grupo 70123 — Amoreo, Emilia
- **Estado:** Morosidad total desde el alta en agosto 2025.
- **Historial:** No registra ningún comprobante de cobro bancario ni en el extracto histórico ni en el Excel.
- **Total acumulado:** 11 períodos completos sin pagar.

### Grupo 409 — Lorenzo, Emilio Eladio
- **Estado:** Morosidad prolongada de 11 meses consecutivos.
- **Historial:** Regularizó cuotas en julio, agosto y septiembre de 2025. Su último pago fue el 12/10/2025 por $19.726,75.
- **Total acumulado:** Desde octubre de 2025 hasta agosto de 2026 no abonó ninguna factura. Deuda supera $1.000.000.

### Grupo 325 — Catena, Antonela
- **Estado:** 11 meses consecutivos sin abonar.
- **Historial:** Registró pagos normales hasta octubre 2025. Último pago el 12/10/2025 por $15.190,37.
- **Total acumulado:** No registra cobros en todo el ejercicio 2026.

### Grupo 326 — Mutual Aunar (Líneas operativas internas)
- **Estado:** Acumula 10 períodos impagos desde noviembre 2025.
- **Composición:** Comprende líneas técnicas y de pruebas (Línea 0506, Línea Pruebas, Para Usar). Su última compensación interna fue el 16/10/2025.

### Grupo 327 — Lorenzo, Diego / Rocío
- **Estado:** 10 meses consecutivos sin pagos regulares.
- **Historial:** Realizó un pago extraordinario de $300.000 el 31/10/2025 que cubrió liquidaciones hasta enero 2026. Desde entonces no ingresó ningún pago durante todo 2026.

### Grupo 70067 — Amico, Susana Vanina
- **Estado:** 8 períodos consecutivos impagos (`2025-11` a `2026-06`).
- **Historial:** Sus últimos cobros fueron transferencias por Banco Nación a fines de octubre 2025 ($70.000 y $30.000).

### Grupo 5006 — Guazzaroni, Haydee / Marra, Yesica
- **Estado:** 8 períodos consecutivos impagos (`2025-11` a `2026-06`).
- **Historial:** Último pago registrado por transferencia el 28/10/2025 por $85.834.

### Grupo 126 — Scognamillo, Telma Julia / Vidal, Germán Néstor
- **Estado:** Mora severa acumulada. Aunque realizó pagos parciales esporádicos en 2026 (último el 26/08/2026 por $130.000), las facturas mensuales superan ampliamente lo abonado, acumulando 6 meses consecutivos con saldo íntegramente descubierto.

### Grupo 6 — Nieto, Carlos Hernán
- **Estado:** 5 meses consecutivos sin registrar pago (`2026-04` a `2026-08`).
- **Historial:** Su último pago fue el 20/02/2026 por $139.493,43.

---

## 3. Regularización en la Base de Datos
Se sincronizaron **697 liquidaciones** en la tabla `liquidaciones_grupos` para reflejar con total veracidad el estado `PENDIENTE` / `PARCIAL` en lugar de estados artificiales `ABONADO` heredados de cargas previas.
Se incorporó el filtro **"Críticos (+4 períodos sin pago)"** en la pantalla de **Gestión de Deuda** para permitir el seguimiento directo de estos casos.
