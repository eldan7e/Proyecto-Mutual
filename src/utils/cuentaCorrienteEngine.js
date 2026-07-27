/**
 * Motor de Cálculo de Cuentas Corrientes e Intereses por Mora
 * Basado en las reglas y fórmulas del Excel AUNAR
 */

// TASA ANUAL DEFAULT: 120% (1.20)
// TASA DIARIA: 1.20 / 365 = 0.0032876712328767123
export const DEFAULT_TNA = 120.0;
export const DIA_TOPE_PAGO = 15;

/**
 * Calcula los días de mora entre la fecha de vencimiento (o día 15 del mes) y la fecha de cálculo/pago.
 * @param {string|Date} fechaEmisionOFactura - Fecha de la factura o vencimiento
 * @param {string|Date} [fechaPagoOCalculo] - Fecha de cálculo/pago (default: hoy)
 * @param {number} [diaTope=15] - Día tope de pago del mes
 * @returns {number} Días de mora (>= 0)
 */
export function calcularDiasMora(fechaEmisionOFactura, fechaPagoOCalculo = new Date(), diaTope = DIA_TOPE_PAGO) {
  if (!fechaEmisionOFactura) return 0;
  
  const fFactura = new Date(fechaEmisionOFactura);
  const fCalculo = new Date(fechaPagoOCalculo);
  
  // Establecer vencimiento en el día tope del mes de la factura o mes siguiente si se emite después del día 15
  let anoVenc = fFactura.getFullYear();
  let mesVenc = fFactura.getMonth();
  
  // Si la fecha de la factura ya es posterior al día 15, vence el 15 del mes siguiente
  if (fFactura.getDate() > diaTope) {
    mesVenc += 1;
    if (mesVenc > 11) {
      mesVenc = 0;
      anoVenc += 1;
    }
  }
  
  const fVencimiento = new Date(anoVenc, mesVenc, diaTope, 23, 59, 59);
  
  const diffMs = fCalculo - fVencimiento;
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
