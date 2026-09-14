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
export const DIA_TOPE_PAGO = 12;

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
 * 1° Por FECHA cronológica real ascendente (YYYY-MM-DD)
 * 2° En la misma fecha: FACTURAS antes que PAGOS (las facturas generan deuda y los pagos imputan)
 * 3° Por PERÍODO contable ascendente
 * 4° Por ID ascendente
 */
export function sortMovimientosCuenta(a, b) {
  // 1° Fecha cronológica real (fallback a período si falta la fecha)
  const fA = a.fecha ? String(a.fecha).split('T')[0] : (a.periodo ? `${a.periodo}-01` : '9999-99-99');
  const fB = b.fecha ? String(b.fecha).split('T')[0] : (b.periodo ? `${b.periodo}-01` : '9999-99-99');
  if (fA !== fB) return fA.localeCompare(fB);

  // 2° En la misma fecha: FACTURAS antes que NOTA_DEBITO, NOTA_CREDITO y PAGOS
  const orderA = a.tipo === 'FACTURA' ? 1 : a.tipo === 'NOTA_DEBITO' ? 2 : a.tipo === 'NOTA_CREDITO' ? 3 : 4;
  const orderB = b.tipo === 'FACTURA' ? 1 : b.tipo === 'NOTA_DEBITO' ? 2 : b.tipo === 'NOTA_CREDITO' ? 3 : 4;
  if (orderA !== orderB) return orderA - orderB;

  // 3° Período contable
  const pA = a.periodo || '';
  const pB = b.periodo || '';
  if (pA !== pB) return pA.localeCompare(pB);

  return (a.id || 0) - (b.id || 0);
}

/**
 * Recalcula los saldos de un grupo cronológicamente.
 * Procesa los movimientos de UN grupo en orden contable canónico (por fecha, FACTURA antes que PAGO)
 * y produce las columnas calculadas del extracto contable.
 * 
 * @param {Array} movimientos - Movimientos de UN grupo
 * @param {number} [tnaPct=0] - Tasa nominal anual en PORCENTAJE
 * @returns {Array} Movimientos enriquecidos con las columnas de cálculo del extracto
 */
export function recalcularSaldosGrupo(movimientos, tnaPct = DEFAULT_TNA) {
  const tnaDecimal = tnaPct / 100;
  const tasaDiaria = tnaDecimal / 365;

  let saldoCapAnt = 0;
  let intPendAnt = 0;
  let fechaAnt = null;

  // Ordenar canónicamente por fecha cronológica real y tipo
  const sortedMovs = [...(movimientos || [])].sort(sortMovimientosCuenta);

  return sortedMovs.map((m) => {
    const isPago = m.tipo === 'PAGO';
    const isNC = m.tipo === 'NOTA_CREDITO';
    const importeOriginal = Number(m.importe) || 0;

    // 1. Plazo Días: diferencia en días entre esta fila y la anterior
    let plazoDias = 0;
    if (fechaAnt && m.fecha) {
      const dAnt = parseDateOnly(fechaAnt);
      const dAct = parseDateOnly(m.fecha);
      const diffMs = dAct.getTime() - dAnt.getTime();
      plazoDias = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
    }

    // 2. Interés % (tasa diaria × plazo)
    const interesPct = tasaDiaria * plazoDias;

    // 3. Intereses $ (SaldoCapitalAnterior × Interes%, solo si hay deuda)
    const interesMora = saldoCapAnt > 0 ? (saldoCapAnt * interesPct) : 0;

    // 4. Interés Pendiente Acumulado
    const intPendAcum = intPendAnt + interesMora;

    // 5 & 6. Imputación de pagos
    let pagoAInteres = 0;
    let pagoACapital = 0;

    if (isPago || isNC) {
      const montoAbsoluto = Math.abs(importeOriginal);
      pagoAInteres = Math.min(montoAbsoluto, intPendAcum);
      pagoACapital = montoAbsoluto - pagoAInteres;
    }

    // 7. Saldo Capital
    const saldoCapital = (isPago || isNC) 
      ? (saldoCapAnt - pagoACapital) 
      : (saldoCapAnt + importeOriginal);

    // 8. Interés Pendiente Final
    const intPendFinal = Math.max(0, intPendAcum - pagoAInteres);

    // 9. Saldo Final
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
 * Parsea una fecha ISO o string YYYY-MM-DD de forma segura evitando problemas de huso horario (GMT-3)
 */
export function parseDateOnly(dateInput) {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return new Date(dateInput.getTime());
  const str = String(dateInput).trim().split('T')[0];
  const parts = str.split('-');
  if (parts.length >= 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  return new Date(dateInput);
}

/**
 * Obtiene la fecha exacta de vencimiento canónica (día 12 de cada mes).
 * Si la fecha de emisión es posterior al día 12, vence el día 12 del mes siguiente.
 */
export function getFechaVencimiento(fechaOrPeriodo, diaTope = DIA_TOPE_PAGO) {
  if (!fechaOrPeriodo) return null;
  const str = String(fechaOrPeriodo).trim().split('T')[0];
  const parts = str.split('-');

  let ano = 0;
  let mes = 0; // 0-indexed
  let dia = 1;

  if (parts.length >= 2) {
    ano = parseInt(parts[0], 10);
    mes = parseInt(parts[1], 10) - 1;
    if (parts.length >= 3) {
      dia = parseInt(parts[2], 10);
    }
  } else {
    const d = new Date(fechaOrPeriodo);
    ano = d.getFullYear();
    mes = d.getMonth();
    dia = d.getDate();
  }

  // Si tiene día específico y se emitió después del día tope del mes, vence el mes siguiente
  if (parts.length >= 3 && dia > diaTope) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      ano += 1;
    }
  }

  return new Date(ano, mes, diaTope, 23, 59, 59);
}

/**
 * Formatea la fecha de vencimiento a formato día/mes/año (ej: 12/08/2026)
 */
export function formatFechaVencimiento(fechaOrPeriodo, diaTope = DIA_TOPE_PAGO) {
  const fVenc = getFechaVencimiento(fechaOrPeriodo, diaTope);
  if (!fVenc || isNaN(fVenc.getTime())) return '—';
  return `${String(fVenc.getDate()).padStart(2, '0')}/${String(fVenc.getMonth() + 1).padStart(2, '0')}/${fVenc.getFullYear()}`;
}

/**
 * Calcula los días de mora entre el vencimiento de la factura (día 12) y la fecha del cobro.
 * @param {string|Date} fechaEmisionOFactura - Fecha o período de la factura
 * @param {string|Date} [fechaPagoOCalculo] - Fecha en que se abona o calcula el pago
 * @param {number} [diaTope=12] - Día tope de vencimiento (por defecto 12)
 * @returns {number} Días de atraso reales (>= 0)
 */
export function calcularDiasMora(fechaEmisionOFactura, fechaPagoOCalculo = new Date(), diaTope = DIA_TOPE_PAGO) {
  if (!fechaEmisionOFactura) return 0;
  const fVencimiento = getFechaVencimiento(fechaEmisionOFactura, diaTope);
  if (!fVencimiento) return 0;

  const fPago = parseDateOnly(fechaPagoOCalculo);
  fPago.setHours(23, 59, 59, 999);

  const diffMs = fPago.getTime() - fVencimiento.getTime();
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

    // Compute vencimiento date for display
    const fechaVencStr = formatFechaVencimiento(mov.fecha || mov.periodo, DIA_TOPE_PAGO);

    desgloses.push({
      movimiento_id: mov.id,
      fecha: mov.fecha,
      periodo: mov.periodo || (mov.fecha ? mov.fecha.slice(0, 7) : ''),
      numero_linea: mov.numero_linea,
      empresa: mov.empresa,
      observaciones: mov.observaciones,
      capitalPendiente: capitalPend,
      interesPendiente: interesPend,
      diasMora,
      fechaVencimiento: fechaVencStr,
      interesCalculado,
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
