/**
 * Motor de Cálculo de Cuentas Corrientes e Intereses por Mora
 * Basado en las reglas y fórmulas del Excel AUNAR
 * 
 * FÓRMULAS EXACTAS DEL EXCEL (hoja REGISTROS_ANEXADOS):
 * 1. Plazo Dias       = FechaActual - FechaAnterior (días entre filas consecutivas del mismo grupo)
 * 2. Interes %        = (TNA_decimal / 365) × PlazoDias
 * 3. Intereses $      = SaldoCapitalAnterior × Interes%   (SOLO si SaldoCapAnterior > 0)
 * 4. Int Pend Acum    = IntPendFinalAnterior + Intereses$
 * 5. Pago a Interes   = (si PAGO) min(abs(Importe), IntPendAcum)  |  (si FACTURA) 0
 * 6. Pago a Capital   = (si PAGO) abs(Importe) - PagoAInteres     |  (si FACTURA) 0
 * 7. Saldo Capital    = SaldoCapAnterior + Importe  (facturas +, pagos -)
 * 8. Int Pend Final   = IntPendAcum - PagoAInteres
 * 9. Saldo Final      = SaldoCapital + IntPendFinal
 */

// TASA ANUAL DEFAULT: 0% (sin cálculo de intereses por mora para períodos históricos)
export const DEFAULT_TNA = 0;
export const DIA_TOPE_PAGO = 15;

/**
 * Formatea fechas ISO (YYYY-MM-DD) a formato día-mes-año (DD/MM/YYYY)
 */
export function formatFecha(isoDate) {
  if (!isoDate) return '—';
  const str = String(isoDate).trim().split('T')[0];
  const parts = str.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return isoDate;
}

/**
 * Función de ordenamiento canónico de movimientos de cuenta corriente:
 * 1° Por PERÍODO contable ascendente (2026-01, 2026-02...)
 * 2° FACTURAS antes que PAGOS (las facturas del período generan la deuda y los pagos la cancelan)
 * 3° Por FECHA ascendente dentro del mismo tipo
 * 4° Por ID ascendente
 */
export function sortMovimientosCuenta(a, b) {
  const pA = a.periodo || (a.fecha ? a.fecha.slice(0, 7) : '9999-99');
  const pB = b.periodo || (b.fecha ? b.fecha.slice(0, 7) : '9999-99');
  if (pA !== pB) return pA.localeCompare(pB);

  const orderA = a.tipo === 'FACTURA' ? 1 : a.tipo === 'NOTA_DEBITO' ? 2 : a.tipo === 'NOTA_CREDITO' ? 3 : 4;
  const orderB = b.tipo === 'FACTURA' ? 1 : b.tipo === 'NOTA_DEBITO' ? 2 : b.tipo === 'NOTA_CREDITO' ? 3 : 4;
  if (orderA !== orderB) return orderA - orderB;

  const fA = a.fecha || '';
  const fB = b.fecha || '';
  if (fA !== fB) return fA.localeCompare(fB);

  return (a.id || 0) - (b.id || 0);
}

/**
 * Recalcula los saldos de un grupo EXACTAMENTE como lo hace el Excel AUNAR.
 * Procesa los movimientos de UN grupo en orden contable canónico (por período, FACTURA antes que PAGO)
 * y produce las 9 columnas calculadas del Excel.
 * 
 * @param {Array} movimientos - Movimientos de UN grupo
 * @param {number} [tnaPct=0] - Tasa nominal anual en PORCENTAJE
 * @returns {Array} Movimientos enriquecidos con las columnas de cálculo del Excel
 */
export function recalcularSaldosGrupo(movimientos, tnaPct = DEFAULT_TNA) {
  // Convertir TNA porcentaje a decimal (120% → 1.20) para coincidir con el Excel
  const tnaDecimal = tnaPct / 100;
  const tasaDiaria = tnaDecimal / 365;

  let saldoCapAnt = 0;
  let intPendAnt = 0;
  let fechaAnt = null;

  // Ordenar canónicamente por período, tipo (FACTURA antes que PAGO) y fecha
  const sortedMovs = [...(movimientos || [])].sort(sortMovimientosCuenta);

  return sortedMovs.map((m) => {


    // Determinar tipo de movimiento
    const isPago = m.tipo === 'PAGO';
    // Importe: positivo para facturas, negativo para pagos (tal cual viene del Excel)
    const importeOriginal = Number(m.importe) || 0;

    // 1. Plazo Dias: diferencia en días entre esta fila y la anterior
    let plazoDias = 0;
    if (fechaAnt) {
      const dAnt = new Date(fechaAnt);
      const dAct = new Date(m.fecha);
      const diffMs = dAct - dAnt;
      plazoDias = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
    }

    // 2. Interes % (tasa diaria × plazo)
    const interesPct = tasaDiaria * plazoDias;

    // 3. Intereses $ (SaldoCapitalAnterior × Interes%)
    const interesMora = saldoCapAnt * interesPct;

    // 4. Interes Pendiente Acumulado = interés anterior + interés nuevo
    const intPendAcum = intPendAnt + interesMora;

    // 5 & 6. Imputación de pagos: primero a interés, luego a capital
    let pagoAInteres = 0;
    let pagoACapital = 0;

    if (isPago) {
      const montoAbsoluto = Math.abs(importeOriginal);
      pagoAInteres = Math.min(montoAbsoluto, intPendAcum);
      pagoACapital = montoAbsoluto - pagoAInteres;
    }

    // 7. Saldo Capital = anterior + importe + pagoAInteres (para facturas suma importe, para pagos resta solo pagoACapital)
    const saldoCapital = isPago ? (saldoCapAnt - pagoACapital) : (saldoCapAnt + importeOriginal);

    // 8. Interes Pendiente Final = acumulado - lo que se pagó de interés
    const intPendFinal = intPendAcum - pagoAInteres;

    // 9. Saldo Final = capital + interés pendiente
    const saldoFinal = saldoCapital + intPendFinal;

    // Guardar acumuladores para la siguiente fila
    fechaAnt = m.fecha;
    saldoCapAnt = saldoCapital;
    intPendAnt = intPendFinal;

    return {
      ...m,
      plazo_dias: plazoDias,
      interes_pct: interesPct,
      interes_mora: interesMora,
      interes_pend_acumulado: intPendAcum,
      pago_aplicado_interes: pagoAInteres,
      pago_aplicado_capital: pagoACapital,
      saldo_capital: saldoCapital,
      interes_pend_final: intPendFinal,
      saldo_final: saldoFinal
    };
  });
}

/**
 * Calcula los días de mora entre la fecha de la factura/vencimiento y la fecha en que se realiza el pago.
 * @param {string|Date} fechaEmisionOFactura - Fecha de presentación/emisión de la factura
 * @param {string|Date} [fechaPagoOCalculo] - Fecha en que se abonó el pago (o fecha de corte si está pendiente)
 * @param {number} [diaTope=15] - Día tope de pago del mes
 * @returns {number} Días de mora reales (>= 0)
 */
export function calcularDiasMora(fechaEmisionOFactura, fechaPagoOCalculo = new Date(), diaTope = DIA_TOPE_PAGO) {
  if (!fechaEmisionOFactura || !fechaPagoOCalculo) return 0;
  
  const fFactura = new Date(fechaEmisionOFactura);
  const fPago = new Date(fechaPagoOCalculo);
  
  // Establecer vencimiento (día 15 del mes de la factura o mes siguiente si se emite después del día 15)
  let anoVenc = fFactura.getFullYear();
  let mesVenc = fFactura.getMonth();
  
  if (fFactura.getDate() > diaTope) {
    mesVenc += 1;
    if (mesVenc > 11) {
      mesVenc = 0;
      anoVenc += 1;
    }
  }
  
  const fVencimiento = new Date(anoVenc, mesVenc, diaTope, 23, 59, 59);
  
  // Si la fecha de pago ocurrió dentro del plazo o antes del vencimiento -> 0 días de mora
  const diffMs = fPago - fVencimiento;
  if (diffMs <= 0) return 0;
  
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calcula el interés por mora dado un capital, días de mora y TNA.
 * @param {number} capital 
 * @param {number} diasMora 
 * @param {number} [tnaPct=120] - Tasa nominal anual en porcentaje (ej 120)
 * @returns {number} Monto de interés redondeado a 2 decimales
 */
export function calcularInteresMora(capital, diasMora, tnaPct = DEFAULT_TNA) {
  if (capital <= 0 || diasMora <= 0) return 0;
  const tasaDiaria = (tnaPct / 100) / 365;
  const interes = capital * tasaDiaria * diasMora;
  return Math.round(interes * 100) / 100;
}

/**
 * Imputación Automática de Cobro según regla FIFO bancaria:
 * 1. Primero cancela los intereses acumulados de la factura/movimiento más antiguo.
 * 2. Luego cancela el capital de la factura más antigua.
 * 3. Si sobra dinero, pasa al siguiente movimiento más antiguo.
 * 4. Si sobra remanente al final, queda como saldo a favor del grupo.
 * 
 * @param {Array} movimientosPendientes - Lista de movimientos de tipo FACTURA pendientes, ordenados por fecha asc
 * @param {number} montoPago - Importe total recibido
 * @param {number} [tnaPct=120] - TNA aplicable
 * @returns {Object} { desgloses: Array, remanenteSaldoAFavor: number, totalCapitalCancelado: number, totalInteresCancelado: number }
 */
export function imputarCobroFIFO(movimientosPendientes, montoPago, tnaPct = DEFAULT_TNA, fechaCalculo = new Date()) {
  let remanente = Math.max(0, montoPago);
  let totalCapitalCancelado = 0;
  let totalInteresCancelado = 0;
  const desgloses = [];

  // Copia deep ordenada cronológicamente
  const pendientes = [...movimientosPendientes].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  for (const mov of pendientes) {
    if (remanente <= 0) break;

    const capitalPend = Math.max(0, Number(mov.importe) - Number(mov.pago_aplicado_capital || 0));
    const diasMora = calcularDiasMora(mov.fecha, fechaCalculo);
    const interesCalculado = calcularInteresMora(capitalPend, diasMora, tnaPct);
    const interesPend = Math.max(0, interesCalculado - Number(mov.pago_aplicado_interes || 0));
    const totalMovimiento = capitalPend + interesPend;

    if (totalMovimiento <= 0) continue;

    let pagoInteres = 0;
    let pagoCapital = 0;
    let canceladoTotal = false;

    if (remanente >= totalMovimiento) {
      pagoInteres = interesPend;
      pagoCapital = capitalPend;
      canceladoTotal = true;
      remanente -= totalMovimiento;
    } else {
      pagoInteres = Math.min(remanente, interesPend);
      remanente -= pagoInteres;

      if (remanente > 0) {
        pagoCapital = Math.min(remanente, capitalPend);
        remanente -= pagoCapital;
      }
    }

    totalCapitalCancelado += pagoCapital;
    totalInteresCancelado += pagoInteres;

    desgloses.push({
      movimiento_id: mov.id,
      fecha: mov.fecha,
      numero_linea: mov.numero_linea,
      empresa: mov.empresa,
      observaciones: mov.observaciones,
      capitalPendiente: capitalPend,
      interesPendiente: interesPend,
      pagoAplicadoInteres: pagoInteres,
      pagoAplicadoCapital: pagoCapital,
      saldoRestanteMovimiento: Math.max(0, totalMovimiento - (pagoInteres + pagoCapital)),
      canceladoTotal
    });
  }

  return {
    desgloses,
    remanenteSaldoAFavor: Math.round(remanente * 100) / 100,
    totalCapitalCancelado: Math.round(totalCapitalCancelado * 100) / 100,
    totalInteresCancelado: Math.round(totalInteresCancelado * 100) / 100
  };
}

/**
 * Formatea montos en moneda argentina ($ 1.234,56)
 */
export function formatMoney(val) {
  const num = Number(val) || 0;
  return '$ ' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
