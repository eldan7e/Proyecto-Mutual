/**
 * Módulo de Exportación a Excel (.xlsx) para Contaduría
 * Genera workbooks reales con formato profesional para auditoría.
 * 
 * Utiliza la librería 'xlsx' (SheetJS) ya instalada en el proyecto.
 */
import * as XLSX from 'xlsx';
import { formatFechaVencimiento, calcularDiasMora, calcularInteresMora } from './cuentaCorrienteEngine';

/**
 * Helper: formatea un número como moneda ARS (sin símbolo, con 2 decimales)
 */
function fmtMoney(val) {
  const n = Number(val || 0);
  return Math.round(n * 100) / 100;
}

/**
 * Helper: aplica ancho automático a las columnas basado en el contenido
 */
function autoFitColumns(ws, data, headers) {
  const colWidths = headers.map((h, i) => {
    let max = String(h).length;
    data.forEach(row => {
      const val = String(row[headers[i]] ?? '');
      if (val.length > max) max = val.length;
    });
    return { wch: Math.min(max + 2, 40) };
  });
  ws['!cols'] = colWidths;
}

/**
 * Pestaña 1: Exportar Facturas y Comprobantes
 * @param {Array} facturasAgrupadas - Array de grupos de facturas filtrados
 * @param {string} periodo - Período seleccionado
 * @param {object} statsGlobales - KPIs calculados
 * @param {number} [tna=120] - TNA para cálculo de mora
 */
export function exportFacturasXLSX(facturasAgrupadas, periodo, statsGlobales, tna = 120) {
  const rows = [];

  facturasAgrupadas.forEach(group => {
    const isCobrada = group.estado_consolidado === 'ABONADO';
    const diasMora = !isCobrada ? calcularDiasMora(group.periodo || group.items?.[0]?.fecha_emision) : 0;
    const fechaVenc = formatFechaVencimiento(group.periodo || group.items?.[0]?.fecha_emision);

    if (group.items && group.items.length > 1) {
      // Multi-operadora: una fila por sub-liquidación
      group.items.forEach(item => {
        const subFact = Number(item.monto_total_facturado || 0);
        const subAbonado = Number(item.monto_abonado || 0);
        const subPendiente = Math.max(0, subFact - subAbonado);
        const subCobrada = subPendiente <= 1;
        const subDias = !subCobrada ? calcularDiasMora(group.periodo || item.fecha_emision) : 0;
        const subInteres = (!subCobrada && subDias > 0 && tna > 0) ? calcularInteresMora(subPendiente, subDias, tna) : 0;

        rows.push({
          'Período': group.periodo,
          'Grupo': group.numero_grupo,
          'Socio Titular': group.socio?.nombre_completo || `Grupo ${group.numero_grupo}`,
          'Operadora': item.proveedores?.nombre || 'N/D',
          'Vencimiento': fechaVenc,
          'Días Atraso': subDias > 0 ? subDias : 0,
          'ID Liquidación': item.liquidacion_id || '',
          'Cant. Líneas': item.total_lineas_lote || 1,
          'Total Facturado': fmtMoney(subFact),
          'Abonado': fmtMoney(subAbonado),
          'Saldo Impago': fmtMoney(subPendiente),
          'Interés Mora': fmtMoney(subInteres),
          'Total con Mora': fmtMoney(subPendiente + subInteres),
          'Estado': subCobrada ? 'ABONADA' : (subAbonado > 0 ? 'PARCIAL' : 'IMPAGA')
        });
      });
    } else {
      const interesMora = (!isCobrada && diasMora > 0 && tna > 0) ? calcularInteresMora(group.saldo_impago, diasMora, tna) : 0;
      rows.push({
        'Período': group.periodo,
        'Grupo': group.numero_grupo,
        'Socio Titular': group.socio?.nombre_completo || `Grupo ${group.numero_grupo}`,
        'Operadora': group.items?.[0]?.proveedores?.nombre || 'N/D',
        'Vencimiento': fechaVenc,
        'Días Atraso': diasMora > 0 ? diasMora : 0,
        'ID Liquidación': group.items?.[0]?.liquidacion_id || '',
        'Cant. Líneas': group.total_lineas,
        'Total Facturado': fmtMoney(group.monto_total_facturado),
        'Abonado': fmtMoney(group.monto_abonado),
        'Saldo Impago': fmtMoney(group.saldo_impago),
        'Interés Mora': fmtMoney(interesMora),
        'Total con Mora': fmtMoney(group.saldo_impago + interesMora),
        'Estado': group.estado_consolidado === 'ABONADO' ? 'ABONADA'
          : group.estado_consolidado === 'PARCIAL' ? 'PARCIAL' : 'IMPAGA'
      });
    }
  });

  // Fila de totales
  rows.push({
    'Período': '',
    'Grupo': '',
    'Socio Titular': 'TOTALES',
    'Operadora': '',
    'ID Liquidación': '',
    'Cant. Líneas': '',
    'Total Facturado': fmtMoney(statsGlobales?.totalFacturado || rows.reduce((s, r) => s + Number(r['Total Facturado'] || 0), 0)),
    'Abonado': fmtMoney(statsGlobales?.totalCobrado || rows.reduce((s, r) => s + Number(r['Abonado'] || 0), 0)),
    'Saldo Impago': fmtMoney(statsGlobales?.saldoNetoReal || rows.reduce((s, r) => s + Number(r['Saldo Impago'] || 0), 0)),
    'Estado': `${statsGlobales?.tasaCobranza || 0}% Cobranza`
  });

  const headers = Object.keys(rows[0]);
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows, headers);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas y Comprobantes');

  const periodoLabel = periodo === 'AUTO' || periodo === 'TODOS' ? 'General' : periodo;
  XLSX.writeFile(wb, `Contaduria_Facturas_${periodoLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Pestaña 2: Exportar Cuentas Corrientes y Saldos
 * @param {Array} saldosFiltrados - Array de saldos por grupo
 */
export function exportSaldosXLSX(saldosFiltrados) {
  const rows = saldosFiltrados.map(row => ({
    'Grupo': row.numero_grupo,
    'Titular': row.nombre || `Grupo ${row.numero_grupo}`,
    'Operadora': row.empresas || 'N/D',
    'Total Facturado': fmtMoney(row.totalFacturas),
    'Total Pagado': fmtMoney(row.totalPagos),
    'Capital Pendiente': fmtMoney(row.saldoCapitalUltimo),
    'Interés Mora': fmtMoney(row.interesPendUltimo),
    'Saldo Final': fmtMoney(row.saldoFinalUltimo),
    'Cant. Movimientos': row.movimientosCount || 0,
    'Última Fecha': row.ultimoMovimientoFecha || 'Sin movimientos'
  }));

  // Fila de totales
  const totalFacturado = saldosFiltrados.reduce((s, r) => s + (r.totalFacturas || 0), 0);
  const totalPagado = saldosFiltrados.reduce((s, r) => s + (r.totalPagos || 0), 0);
  const totalCapital = saldosFiltrados.reduce((s, r) => s + (r.saldoCapitalUltimo || 0), 0);
  const totalInteres = saldosFiltrados.reduce((s, r) => s + (r.interesPendUltimo || 0), 0);
  const totalSaldo = saldosFiltrados.reduce((s, r) => s + (r.saldoFinalUltimo || 0), 0);

  rows.push({
    'Grupo': '',
    'Titular': `TOTALES (${saldosFiltrados.length} cuentas)`,
    'Operadora': '',
    'Total Facturado': fmtMoney(totalFacturado),
    'Total Pagado': fmtMoney(totalPagado),
    'Capital Pendiente': fmtMoney(totalCapital),
    'Interés Mora': fmtMoney(totalInteres),
    'Saldo Final': fmtMoney(totalSaldo),
    'Cant. Movimientos': '',
    'Última Fecha': ''
  });

  const headers = Object.keys(rows[0]);
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows, headers);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cuentas Corrientes y Saldos');

  XLSX.writeFile(wb, `Contaduria_Saldos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Pestaña 3: Exportar Extracto / Libro Mayor de un Grupo
 * @param {Array} movimientos - Array de movimientos del grupo
 * @param {number} grupoNum - Número de grupo
 * @param {string} titular - Nombre del titular
 */
export function exportExtractoXLSX(movimientos, grupoNum, titular) {
  const rows = movimientos.map(m => {
    const isPago = m.tipo === 'PAGO';
    let diasStr = '—';
    if (isPago) {
      if (m.dias_desde_factura > 0) {
        diasStr = `${m.dias_desde_factura} días (${m.fecha_factura_origen ? `${m.fecha_factura_origen} al ` : ''}${m.fecha})`;
      } else {
        diasStr = '0 días';
      }
    } else if (m.plazo_dias > 0) {
      diasStr = `${m.plazo_dias} días`;
    }

    return {
      'Fecha': m.fecha || '',
      'Tipo': m.tipo || '',
      'Período': m.periodo || '',
      'Operadora / Concepto': m.empresa || 'GENERAL',
      'Observaciones': m.observaciones || '',
      'Medio de Pago': m.medio_pago || '',
      'Importe': fmtMoney(m.importe),
      'Días Interés (Factura a Pago)': diasStr,
      'Interés Devengado': !isPago ? fmtMoney(m.interes_mora) : 0,
      'Pago Aplicado Interés': fmtMoney(m.pago_aplicado_interes),
      'Pago Aplicado Capital': fmtMoney(m.pago_aplicado_capital),
      'Saldo Capital': fmtMoney(m.saldo_capital),
      'Interés Pendiente': fmtMoney(m.interes_pend_final),
      'Saldo Final Acumulado': fmtMoney(m.saldo_final)
    };
  });

  // Fila resumen
  const sumFacturas = movimientos.filter(m => m.tipo === 'FACTURA').reduce((s, m) => s + Math.abs(Number(m.importe || 0)), 0);
  const sumPagos = movimientos.filter(m => m.tipo === 'PAGO').reduce((s, m) => s + Math.abs(Number(m.importe || 0)), 0);
  const sumIntCobrado = movimientos.filter(m => m.tipo === 'PAGO').reduce((s, m) => s + Number(m.pago_aplicado_interes || 0), 0);
  const sumCapCobrado = movimientos.filter(m => m.tipo === 'PAGO').reduce((s, m) => s + Number(m.pago_aplicado_capital || 0), 0);
  const ultimo = movimientos.length > 0 ? movimientos[movimientos.length - 1] : null;

  rows.push({
    'Fecha': '',
    'Tipo': '',
    'Período': '',
    'Operadora / Concepto': 'RESUMEN',
    'Observaciones': `Total Facturado: $${fmtMoney(sumFacturas)} | Total Cobrado: $${fmtMoney(sumPagos)} (Cap: $${fmtMoney(sumCapCobrado)} + Int: $${fmtMoney(sumIntCobrado)})`,
    'Medio de Pago': '',
    'Importe': '',
    'Días Interés (Factura a Pago)': '',
    'Interés Devengado': '',
    'Pago Aplicado Interés': fmtMoney(sumIntCobrado),
    'Pago Aplicado Capital': fmtMoney(sumCapCobrado),
    'Saldo Capital': fmtMoney(ultimo?.saldo_capital || 0),
    'Interés Pendiente': fmtMoney(ultimo?.interes_pend_final || 0),
    'Saldo Final Acumulado': fmtMoney(ultimo?.saldo_final || 0)
  });

  const headers = Object.keys(rows[0]);
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows, headers);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Extracto Grupo ${grupoNum}`);

  const titularClean = (titular || `Grupo_${grupoNum}`).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, '').replace(/\s+/g, '_').slice(0, 30);
  XLSX.writeFile(wb, `Contaduria_Extracto_Grupo${grupoNum}_${titularClean}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Pestaña 4: Exportar Líneas del Grupo
 * @param {Array} lineasGrupo - Array de líneas activas del grupo
 * @param {number} grupoNum - Número de grupo
 * @param {string} periodo - Período seleccionado
 */
export function exportLineasXLSX(lineasGrupo, grupoNum, periodo) {
  const rows = lineasGrupo.map(l => ({
    'Línea Telefónica': l.numero_linea || '',
    'Socio Responsable': l.socios?.nombre_completo || 'Sin socio asignado',
    'Operadora': l.proveedores?.nombre || 'N/D',
    'Plan Contratado': l.plan_facturado || l.planes_abonos?.nombre_plan || 'Plan Estándar',
    'Valor Abono': fmtMoney(l.costo_abono_real || l.planes_abonos?.precio || 0),
    'Excedentes': fmtMoney(l.excedentes || 0),
    'Bonificaciones': fmtMoney(l.bonificaciones || 0),
    [`Facturado (${periodo})`]: fmtMoney(l.facturado_periodo || 0),
    'Estado': 'ACTIVA'
  }));

  // Fila de totales
  const totalFacturado = lineasGrupo.reduce((s, l) => s + (l.facturado_periodo || 0), 0);
  const totalAbono = lineasGrupo.reduce((s, l) => s + (l.costo_abono_real || l.planes_abonos?.precio || 0), 0);
  const totalExcedentes = lineasGrupo.reduce((s, l) => s + (l.excedentes || 0), 0);

  rows.push({
    'Línea Telefónica': '',
    'Socio Responsable': `TOTALES (${lineasGrupo.length} líneas activas)`,
    'Operadora': '',
    'Plan Contratado': '',
    'Valor Abono': fmtMoney(totalAbono),
    'Excedentes': fmtMoney(totalExcedentes),
    'Bonificaciones': '',
    [`Facturado (${periodo})`]: fmtMoney(totalFacturado),
    'Estado': ''
  });

  const headers = Object.keys(rows[0]);
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows, headers);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Líneas Grupo ${grupoNum}`);

  XLSX.writeFile(wb, `Contaduria_Lineas_Grupo${grupoNum}_${periodo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Helper interno para formatear montos como string en la fila resumen
function fmtMoneyStr(val) {
  return Number(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
