# 📄 Reglas Específicas de Cálculo - Operadora Movistar
Este documento detalla y preserva de forma permanente la lógica y las particularidades del cálculo del importe por línea y socio para la operadora **Movistar** en el sistema de auditoría. 

> [!IMPORTANT]
> Esta forma de cálculo es **exclusiva para Movistar** y está calibrada con precisión matemática y redondeos específicos para lograr coincidencia al centavo con las planillas Excel históricas.

---

## 🛡️ 1. Conceptos y Multiplicador Impositivo Especial
A diferencia de Claro y Personal, Movistar utiliza un coeficiente impositivo unificado para trasladar los impuestos internos, percepciones e IVA:
*   **Multiplicador impositivo unificado de Movistar (IVA + Imp. Internos):** `1.26263157`
*   **IVA Simple:** `1.21` (21%)

---

## 🧮 2. Algoritmo Paso a Paso

### Paso 2.1: Valores de Entrada
Se obtienen desde la base de datos para la línea auditada en el período correspondiente:
*   `costo_abono_real`: Costo base neto del abono de la línea.
*   `excedentes`: Cargos netos por excedentes de datos/minutos/consumos.
*   `otros_cargos_op`: Otros cargos del operador facturados en la línea (neto).
*   `desc_adicionales` / `descExtraPct`: Porcentaje de descuento o bonificación asignado al socio.

### Paso 2.2: Cálculo de Importes con Impuestos Completos
Se calcula el abono y los excedentes trasladando el coeficiente unificado de Movistar:
$$\text{abonoWithTaxes} = \text{round}(\text{costo\_abono\_real} \times 1.26263157)$$
$$\text{excedenteWithTaxes} = \text{round}((\text{excedentes} + \text{otros\_cargos\_op}) \times 1.26263157)$$

El total facturado bruto de la línea de origen es:
$$\text{totalFacturado} = \text{abonoWithTaxes} + \text{excedenteWithTaxes}$$

---

### Paso 2.3: Determinación de la Base Imponible $Y$
La clave de la coincidencia con el Excel radica en cómo se calcula el excedente con IVA simple y cómo este deduce el total bruto para definir la base imponible $Y$:

1.  **Cálculo Base de Excedente con IVA simple (21%):**
    $$\text{excedenteConIva} = \text{round}((\text{excedentes} + \text{otros\_cargos\_op}) \times 1.21)$$
    
2.  **Caso Especial - Excedentes Directos de Factura:**
    Si el excedente es de factura directa (generalmente ocurre en los planes de **30 GB** que tienen abonos netos de `13013.25`, `13350.83` o `13138.85` en la base de datos), el Excel resta el excedente utilizando el multiplicador de impuestos completo de Movistar.
    
    *Condición de Aplicación:*
    $$\text{Si } (\text{costo\_abono\_real} \in \{13013.25, 13350.83, 13138.85\}) \text{ y } \text{excedentes} > 0:$$
    $$\text{excedenteConIva} = \text{excedenteWithTaxes}$$

3.  **Cálculo de la Base de Cálculo Auxiliar $Y$:**
    $$Y = \text{totalFacturado} - \text{excedenteConIva}$$

---

### Paso 2.4: Gastos Administrativos, IVA Final y Tarifa Fija
Utilizando la base de cálculo auxiliar $Y$, determinamos las tres columnas del socio:
*   **Gastos Administrativos (5%):**
    $$\text{gastosAdmin} = \text{round}(Y \times 0.05)$$
*   **IVA Final Auditoría (21%):**
    $$\text{ivaFinal} = \text{round}(Y \times 0.21)$$
*   **Tarifa Fija Aunar (Exclusivo Movistar):**
    $$\text{tarifaAunarFija} = \$6500.00$$

---

### Paso 2.5: Total Bruto y Bonificación de Ficha
El costo bruto antes de bonificación por socio es:
$$\text{totalBruto} = \text{totalFacturado} + \text{gastosAdmin} + \text{ivaFinal} + \text{tarifaAunarFija}$$

Si el socio posee un porcentaje de descuento contratado (`desc_adicionales`):
$$\text{bonifSocio} = \text{round}\left(\text{totalBruto} \times \frac{\text{desc\_adicionales}}{100}\right)$$

### Paso 2.6: Importe Total Neto a Cobrar por Línea
$$\text{totalCobrar} = \text{totalBruto} - \text{bonifSocio}$$

---

## 🛠️ 3. Implementación de Referencia en Código (JS)
Este cálculo se encuentra implementado en el motor de auditoría central **[auditEngine.js](file:///c:/Users/dante/OneDrive/Escritorio/pag%20web/src/utils/auditEngine.js)**:

```javascript
if (isMovistar) {
  const taxMultiplier = 1.26263157;
  const abonoWithTaxes = Math.round(costoAbonoReal * taxMultiplier * 100) / 100;
  const excedenteWithTaxes = Math.round((excedentes + otrosCargosOp) * taxMultiplier * 100) / 100;
  
  const totalFacturado = abonoWithTaxes + excedenteWithTaxes;
  
  let excedenteConIva = Math.round((excedentes + otrosCargosOp) * 1.21 * 100) / 100;
  if (isMovistar && (costoAbonoReal === 13013.25 || costoAbonoReal === 13350.83 || costoAbonoReal === 13138.85) && excedentes > 0) {
    excedenteConIva = excedenteWithTaxes;
  }
  
  const Y = totalFacturado - excedenteConIva;
  
  abonoBase = totalFacturado;
  gastosAdmin = Math.round(Y * 0.05 * 100) / 100;
  tarifaAunarFija = 6500;
  ivaFinal = Math.round(Y * 0.21 * 100) / 100;
}
```
