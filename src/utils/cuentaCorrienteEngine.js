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

// TASA ANUAL DEFAULT: 120% anual (1.2 en Excel)
export const DEFAULT_TNA = 120;
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
 * Helper para parsear fechas de forma segura en UTC evitando desfases por huso horario (GMT-3)
 */
export function parseDateUTC(d) {
  if (!d) return null;
  if (d instanceof Date) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  const str = String(d).trim().split('T')[0];
  const parts = str.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
  }
  const dObj = new Date(d);
  if (!isNaN(dObj.getTime())) {
    return new Date(Date.UTC(dObj.getFullYear(), dObj.getMonth(), dObj.getDate()));
  }
  return null;
}

/**
 * Diferencia en días entre dos fechas (d2 - d1)
 */
export function getDaysDiff(d1, d2) {
  const p1 = parseDateUTC(d1);
  const p2 = parseDateUTC(d2);
  if (!p1 || !p2) return 0;
  const ms = p2.getTime() - p1.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Función de ordenamiento canónico de movimientos de cuenta corriente:
 * Coincide con SORT(REGISTROS_ANEXADOS, 2, 1) del Excel:
 * 1° Por FECHA ascendente (orden cronológico estricto de los hechos contables)
 * 2° Si misma fecha, FACTURAS antes que AJUSTES y estos antes que PAGOS
 * 3° Por ID ascendente
 */
export function sortMovimientosCuenta(a, b) {
  const fA = a.fecha ? String(a.fecha).split('T')[0] : (a.periodo ? `${a.periodo}-01` : '');
  const fB = b.fecha ? String(b.fecha).split('T')[0] : (b.periodo ? `${b.periodo}-01` : '');
  if (fA !== fB) return fA.localeCompare(fB);

  // Si misma fecha y tienen IDs diferentes, respetar el orden de creación/registro contable
  if (a.id !== undefined && b.id !== undefined && a.id !== b.id) {
    return (a.id || 0) - (b.id || 0);
  }

  // Orden de tipos en la misma fecha: FACTURA genera saldo, PAGO lo cancela
  const order = { FACTURA: 1, NOTA_DEBITO: 2, AJUSTE: 3, NOTA_CREDITO: 4, PAGO: 5 };
  const oA = order[a.tipo] || 3;
  const oB = order[b.tipo] || 3;
  if (oA !== oB) return oA - oB;

  return 0;
}

/**
 * Recalcula los saldos de un grupo EXACTAMENTE como lo hace el Excel AUNAR (hoja REGISTROS_ANEXADOS).
 * Procesa los movimientos de UN grupo en orden cronológico estricto
 * y produce las 9 columnas calculadas del Excel.
 * 
 * FÓRMULAS EXACTAS DEL EXCEL:
 * 1. Plazo Días (Col L):
 *    IF([Orden Mov]="Ultimo movimiento", MAX(0, fechaCalculo - fecha_actual), fecha_actual - fecha_ant)
 * 2. Interés % (Col M):
 *    (TNA / 365) * [Plazo Días]
 * 3. Intereses $ (Col N):
 *    pago_a_cap = MAX(0, ABS(Importe) - int_ant)
 *    cap_nuevo = cap_ant + IF(Tipo="FACTURA", Importe, -pago_a_cap)
 *    base_interes = MAX(0, IF(Orden Mov="Ultimo movimiento", cap_nuevo, cap_ant))
 *    Intereses $ = base_interes * Interes%
 * 4. Int Pend Acum (Col O):
 *    int_ant + [Intereses $]
 * 5. Pago a Interés (Col P):
 *    IF(Tipo="PAGO", MIN(ABS(Importe), [Int. Pend. Acumulado]), 0)
 * 6. Pago a Capital (Col Q):
 *    IF(Tipo="PAGO", MAX(ABS(Importe) - [Int. Pend. Acumulado], 0), 0)
 * 7. Saldo Capital (Col S):
 *    [Saldo Capital Anterior] + IF(Tipo="FACTURA", Importe, 0) - [Pago aplicado a capital]
 * 8. Int Pend Final (Col T):
 *    [Int. Pend. Acumulado] - [Pago aplicado a interés]
 * 9. Saldo Final (Col U):
 *    [Saldo Capital] + [Int. Pend. Final]
 * 
 * @param {Array} movimientos - Movimientos de UN grupo
 * @param {number} [tnaPct=120] - Tasa nominal anual en PORCENTAJE (ej 120 para 120%)
 * @param {string|Date} [fechaCalculo=new Date()] - Fecha de cálculo/corte de intereses
 * @returns {Array} Movimientos enriquecidos con las columnas de cálculo del Excel
 */
export function recalcularSaldosGrupo(movimientos, tnaPct = DEFAULT_TNA, fechaCalculo = new Date()) {
  const tnaDecimal = (Number(tnaPct) || 0) / 100;
  const tasaDiaria = tnaDecimal / 365;

  let capAnt = 0;
  let intAnt = 0;
  let fechaAnt = null;

  // Ordenar canónicamente por FECHA cronológica y tipo
  const sortedMovs = [...(movimientos || [])].sort(sortMovimientosCuenta);
  const total = sortedMovs.length;

  return sortedMovs.map((m, idx) => {
    const isUltimo = (idx === total - 1);
    const isPago = m.tipo === 'PAGO';
    const isNC = m.tipo === 'NOTA_CREDITO';
    const importeOriginal = Number(m.importe) || 0;

    // 1. Plazo Dias (Col L de Excel)
    let plazoDias = 0;
    if (isUltimo) {
      plazoDias = Math.max(0, getDaysDiff(m.fecha, fechaCalculo));
    } else if (fechaAnt) {
      plazoDias = Math.max(0, getDaysDiff(fechaAnt, m.fecha));
    }

    // 2. Interes % (Col M de Excel)
    const interesPct = tasaDiaria * plazoDias;

    // 3. Intereses $ (Col N de Excel)
    const pagoACapProvisional = isPago ? Math.max(0, Math.abs(importeOriginal) - intAnt) : 0;
    let capNuevo;
    if (isPago) {
      capNuevo = capAnt - pagoACapProvisional;
    } else if (isNC) {
      capNuevo = capAnt - Math.abs(importeOriginal);
    } else {
      capNuevo = capAnt + importeOriginal;
    }

    const baseInteres = Math.max(0, isUltimo ? capNuevo : capAnt);
    const interesMora = baseInteres * interesPct;

    // 4. Interes Pendiente Acumulado (Col O de Excel)
    const intPendAcum = intAnt + interesMora;

    // 5 & 6. Imputación de pagos: primero a interés, luego a capital (Cols P & Q de Excel)
    let pagoAInteres = 0;
    let pagoACapital = 0;
    let fechaFacturaOrigen = null;
    let diasDesdeFactura = 0;
    let diasMoraVencimiento = 0;

    if (isPago) {
      const montoAbsoluto = Math.abs(importeOriginal);
      pagoAInteres = Math.min(montoAbsoluto, intPendAcum);
      pagoACapital = Math.max(0, montoAbsoluto - intPendAcum);

      // Buscar factura previa asociada a este pago
      const facturasPrevias = sortedMovs.filter(x => x.tipo === 'FACTURA' && (!m.fecha || !x.fecha || x.fecha <= m.fecha));
      let factRelacionada = null;
      if (m.periodo) {
        factRelacionada = facturasPrevias.slice().reverse().find(x => x.periodo === m.periodo);
      }
      if (!factRelacionada && facturasPrevias.length > 0) {
        factRelacionada = facturasPrevias[facturasPrevias.length - 1];
      }

      if (factRelacionada && factRelacionada.fecha) {
        fechaFacturaOrigen = factRelacionada.fecha;
        diasDesdeFactura = Math.max(0, getDaysDiff(factRelacionada.fecha, m.fecha));
        diasMoraVencimiento = calcularDiasMora(factRelacionada.periodo || factRelacionada.fecha, m.fecha);
      } else {
        diasDesdeFactura = plazoDias;
      }
    }

    // 7. Saldo Capital (Col S de Excel)
    let saldoCapital;
    if (isPago) {
      saldoCapital = capAnt - pagoACapital;
    } else if (isNC) {
      saldoCapital = capAnt - Math.abs(importeOriginal);
    } else {
      saldoCapital = capAnt + importeOriginal;
    }

    // 8. Interes Pendiente Final (Col T de Excel)
    const intPendFinal = intPendAcum - pagoAInteres;

    // 9. Saldo Final (Col U de Excel)
    const saldoFinal = saldoCapital + intPendFinal;

    const saldoCapAntPrev = capAnt;

    // Guardar acumuladores con precisión flotante para la siguiente fila
    fechaAnt = m.fecha;
    capAnt = saldoCapital;
    intAnt = intPendFinal;

    return {
      ...m,
      plazo_dias: plazoDias,
      interes_pct: interesPct,
      interes_mora: Math.round(interesMora * 100) / 100,
      interes_pend_acumulado: Math.round(intPendAcum * 100) / 100,
      pago_aplicado_interes: Math.round(pagoAInteres * 100) / 100,
      pago_aplicado_capital: Math.round(pagoACapital * 100) / 100,
      saldo_capital_anterior: Math.round(saldoCapAntPrev * 100) / 100,
      saldo_capital: Math.round(saldoCapital * 100) / 100,
      interes_pend_final: Math.round(intPendFinal * 100) / 100,
      saldo_final: Math.round(saldoFinal * 100) / 100,
      is_ultimo_movimiento: isUltimo,
      fecha_factura_origen: fechaFacturaOrigen,
      dias_desde_factura: diasDesdeFactura,
      dias_mora_vencimiento: diasMoraVencimiento
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
 * - Si es un período ("YYYY-MM"), el servicio mensual vence el día 12 del MES SIGUIENTE (ej: 2026-08 vence el 12/09/2026).
 * - Si es una fecha ("YYYY-MM-DD") y se emitió después del día 12, vence el día 12 del mes siguiente.
 */
export function getFechaVencimiento(fechaOrPeriodo, diaTope = DIA_TOPE_PAGO) {
  if (!fechaOrPeriodo) return null;
  const str = String(fechaOrPeriodo).trim().split('T')[0];
  const parts = str.split('-');

  let ano = 0;
  let mes = 0; // 0-indexed (0=Enero ... 11=Diciembre)

  // Formato PERÍODO ("YYYY-MM"): vence el día 12 del mes siguiente al de consumo
  if (parts.length === 2) {
    ano = parseInt(parts[0], 10);
    const mesPeriodo = parseInt(parts[1], 10); // 1-12
    // En Date 0-indexed, mesPeriodo equivale directamente al mes siguiente (ej: 8 -> mes 8 = Septiembre)
    mes = mesPeriodo;
    if (mes > 11) {
      mes = 0;
      ano += 1;
    }
    return new Date(ano, mes, diaTope, 23, 59, 59);
  }


  // Formato FECHA COMPLETA ("YYYY-MM-DD")
  if (parts.length >= 3) {
    ano = parseInt(parts[0], 10);
    mes = parseInt(parts[1], 10) - 1; // 0-indexed
    const dia = parseInt(parts[2], 10);

    // Si se emitió después del día 12 del mes, vence el día 12 del mes siguiente
    if (dia > diaTope) {
      mes += 1;
      if (mes > 11) {
        mes = 0;
        ano += 1;
      }
    }
    return new Date(ano, mes, diaTope, 23, 59, 59);
  }

  const d = new Date(fechaOrPeriodo);
  ano = d.getFullYear();
  mes = d.getMonth();
  if (d.getDate() > diaTope) {
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
    const diasMora = calcularDiasMora(mov.periodo || mov.fecha, fechaCalculo);
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
    const fechaVencStr = formatFechaVencimiento(mov.periodo || mov.fecha, DIA_TOPE_PAGO);

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

/**
 * Obtiene los meses o períodos que presentan deuda impaga para un grupo,
 * con el interés por mora calculado y aplicado a la fecha indicada.
 * Permite filtrar por un año específico (ej. 'YEAR_2026' o '2026'), un período mensual, o todos.
 * 
 * @param {Object} params
 * @param {Array} params.liquidacionesGrupo - Liquidaciones del grupo (liquidaciones_grupos)
 * @param {Array} params.movimientos - Movimientos de cuenta corriente del grupo
 * @param {number} [params.tna=0] - Tasa nominal anual (porcentaje, ej 120)
 * @param {string} [params.periodoFiltro='TODOS'] - 'TODOS' | 'YEAR_YYYY' | 'YYYY-MM'
 * @param {Date|string} [params.fechaCalculo=new Date()] - Fecha de corte de cálculo (hoy)
 * @returns {Array} Lista de items de deuda por mes con interés calculado
 */
export function obtenerMesesDeudaGrupo({
  liquidacionesGrupo = [],
  movimientos = [],
  tna = DEFAULT_TNA,
  periodoFiltro = 'TODOS',
  fechaCalculo = new Date()
}) {
  let allowedPeriods = null;
  if (Array.isArray(periodoFiltro)) {
    allowedPeriods = new Set(periodoFiltro);
  } else if (periodoFiltro instanceof Set) {
    allowedPeriods = periodoFiltro;
  } else if (periodoFiltro === 'LAST_3' || periodoFiltro === 'LAST_6') {
    const count = periodoFiltro === 'LAST_3' ? 3 : 6;
    const allPers = new Set();
    liquidacionesGrupo.forEach(l => { if (l.periodo) allPers.add(l.periodo); });
    movimientos.forEach(m => {
      if (m.periodo) allPers.add(m.periodo);
    });
    const sorted = Array.from(allPers).filter(Boolean).sort().reverse();
    allowedPeriods = new Set(sorted.slice(0, count));
  }

  const anioFiltro = (!allowedPeriods && periodoFiltro && (periodoFiltro.startsWith('YEAR_') || /^\d{4}$/.test(periodoFiltro)))
    ? periodoFiltro.replace('YEAR_', '')
    : null;
  const mesFiltro = (!allowedPeriods && !anioFiltro && periodoFiltro && periodoFiltro !== 'TODOS')
    ? periodoFiltro
    : null;

  // 1. Si tenemos movimientos de cuenta corriente procesados, usamos el libro mayor (fuente fidedigna de saldo)
  if (movimientos && movimientos.length > 0) {
    const ultimoMov = movimientos[movimientos.length - 1];
    const saldoCapitalTotal = Number(ultimoMov?.saldo_capital || 0);

    // Si el grupo no tiene saldo capital deudor (saldo <= 1), no adeuda meses
    if (saldoCapitalTotal <= 1) {
      return [];
    }

    // Obtener todas las facturas ordenadas cronológicamente de la más reciente a la más antigua
    // para asignar el saldo capital impago a las facturas correspondientes (FIFO inverso)
    const facturas = movimientos
      .filter(m => m.tipo === 'FACTURA' && Number(m.importe || 0) > 0)
      .sort((a, b) => {
        const fA = a.fecha ? String(a.fecha).split('T')[0] : (a.periodo ? `${a.periodo}-01` : '');
        const fB = b.fecha ? String(b.fecha).split('T')[0] : (b.periodo ? `${b.periodo}-01` : '');
        if (fA !== fB) return fB.localeCompare(fA); // Más recientes primero
        return (b.id || 0) - (a.id || 0);
      });

    let capitalRestante = saldoCapitalTotal;
    const deudaList = [];

    for (const f of facturas) {
      if (capitalRestante <= 0.01) break;

      const impFactura = Number(f.importe || 0);
      const montoImpago = Math.min(capitalRestante, impFactura);
      capitalRestante -= montoImpago;

      const per = f.periodo || (f.fecha ? String(f.fecha).slice(0, 7) : '');

      // Filtrar por período si aplica
      let cumpleFiltro = true;
      if (allowedPeriods && !allowedPeriods.has(per) && (!f.fecha || !allowedPeriods.has(String(f.fecha).slice(0, 7)))) {
        cumpleFiltro = false;
      }
      if (anioFiltro && !per.startsWith(anioFiltro) && (!f.fecha || !String(f.fecha).startsWith(anioFiltro))) {
        cumpleFiltro = false;
      }
      if (mesFiltro && per !== mesFiltro) {
        cumpleFiltro = false;
      }

      if (cumpleFiltro && montoImpago > 0.5) {
        const fechaVencStr = formatFechaVencimiento(per || f.fecha, DIA_TOPE_PAGO);
        const diasMora = calcularDiasMora(per || f.fecha, fechaCalculo, DIA_TOPE_PAGO);
        const interes = (diasMora > 0 && tna > 0) ? calcularInteresMora(montoImpago, diasMora, tna) : 0;

        deudaList.push({
          periodo: per || 'S/P',
          concepto: f.observaciones || `Factura ${f.empresa || 'MUTUAL'}`,
          operadora: f.empresa || 'MUTUAL',
          fecha: f.fecha || '',
          vencimiento: fechaVencStr,
          diasMora,
          montoFacturado: Math.round(impFactura * 100) / 100,
          montoAbonado: Math.round((impFactura - montoImpago) * 100) / 100,
          saldoImpago: Math.round(montoImpago * 100) / 100,
          tna,
          interesMora: interes,
          totalConInteres: Math.round((montoImpago + interes) * 100) / 100,
          estado: (impFactura - montoImpago) > 0.5 ? 'PARCIAL' : 'IMPAGA'
        });
      }
    }

    return deudaList.reverse();
  }

  // 2. Fallback: Si no hay movimientos de cuenta corriente, usar liquidaciones_grupos
  if (liquidacionesGrupo && liquidacionesGrupo.length > 0) {
    const periodosMap = new Map();

    liquidacionesGrupo.forEach(liq => {
      const per = liq.periodo;
      if (!per) return;

      // Filtrar según período / año seleccionado
      if (allowedPeriods && !allowedPeriods.has(per)) return;
      if (anioFiltro && !per.startsWith(anioFiltro)) return;
      if (mesFiltro && per !== mesFiltro) return;

      if (!periodosMap.has(per)) {
        periodosMap.set(per, {
          periodo: per,
          monto_total_facturado: 0,
          monto_abonado: 0,
          proveedores: new Set(),
          fecha_emision: liq.fecha_emision || null,
          items: []
        });
      }

      const pObj = periodosMap.get(per);
      pObj.monto_total_facturado += Number(liq.monto_total_facturado || 0);
      pObj.monto_abonado += Number(liq.monto_abonado || 0);
      if (liq.proveedores?.nombre) pObj.proveedores.add(liq.proveedores.nombre);
      pObj.items.push(liq);
    });

    const deudaList = [];
    const sortedPeriodos = Array.from(periodosMap.keys()).sort();

    for (const per of sortedPeriodos) {
      const data = periodosMap.get(per);
      const fact = data.monto_total_facturado;
      const ab = data.monto_abonado;
      const pendiente = Math.max(0, fact - ab);

      // Si el saldo impago es mayor a 1 peso, se considera mes adeudado
      if (pendiente > 1) {
        const fechaVencStr = formatFechaVencimiento(per, DIA_TOPE_PAGO);
        const diasMora = calcularDiasMora(per, fechaCalculo, DIA_TOPE_PAGO);
        const interes = (diasMora > 0 && tna > 0) ? calcularInteresMora(pendiente, diasMora, tna) : 0;
        const provs = Array.from(data.proveedores).join(', ') || 'MUTUAL';

        deudaList.push({
          periodo: per,
          concepto: `Facturación Período ${per} (${provs})`,
          operadora: provs,
          fecha: data.fecha_emision || `${per}-10`,
          vencimiento: fechaVencStr,
          diasMora,
          montoFacturado: Math.round(fact * 100) / 100,
          montoAbonado: Math.round(ab * 100) / 100,
          saldoImpago: Math.round(pendiente * 100) / 100,
          tna,
          interesMora: interes,
          totalConInteres: Math.round((pendiente + interes) * 100) / 100,
          estado: ab > 0 ? 'PARCIAL' : 'IMPAGA'
        });
      }
    }

    if (deudaList.length > 0 || liquidacionesGrupo.length > 0) {
      return deudaList;
    }
  }

  return [];
}
