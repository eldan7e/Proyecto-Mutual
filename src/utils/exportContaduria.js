/**
 * Módulo de Exportación a Excel (.xlsx) para Contaduría
 * Genera workbooks reales con formato profesional para auditoría.
 * 
 * Utiliza la librería 'xlsx' (SheetJS) ya instalada en el proyecto.
 */
import * as XLSX from 'xlsx';
import { formatFecha, formatFechaVencimiento, calcularDiasMora, calcularInteresMora, periodoConsumoACobro } from './cuentaCorrienteEngine.js';

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
 * Helper: aplica formato de moneda de Excel a las celdas numéricas
 */
function applyCurrencyFormat(ws) {
  for (const cellAddress in ws) {
    if (cellAddress[0] === '!') continue;
    const cell = ws[cellAddress];
    if (cell && typeof cell.v === 'number') {
      cell.z = '"$"#,##0.00';
    }
  }
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
    const diasMora = !isCobrada ? calcularDiasMora(periodoConsumoACobro(group.periodo) || group.items?.[0]?.fecha_emision) : 0;
    const fechaVenc = formatFechaVencimiento(periodoConsumoACobro(group.periodo) || group.items?.[0]?.fecha_emision);

    if (group.items && group.items.length > 1) {
      // Multi-operadora: una fila por sub-liquidación
      group.items.forEach(item => {
        const subFact = Number(item.monto_total_facturado || 0);
        const subAbonado = Number(item.monto_abonado || 0);
        const subPendiente = Math.max(0, subFact - subAbonado);
        const subCobrada = subPendiente <= 1;
        const subDias = !subCobrada ? calcularDiasMora(periodoConsumoACobro(group.periodo) || item.fecha_emision) : 0;
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

  const periodoLabel = periodo === 'AUTO' || periodo === 'TODOS' ? 'General' : periodo === 'LAST_3' ? 'Ultimos_3_Meses' : periodo === 'LAST_6' ? 'Ultimos_6_Meses' : periodo;
  XLSX.writeFile(wb, `Contaduria_Facturas_${periodoLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Pestaña 2: Exportar Cuentas Corrientes y Saldos
 * @param {Array} saldosFiltrados - Array de saldos por grupo
 */
export function exportSaldosXLSX(saldosFiltrados, periodoLabel = 'Histórico') {
  const rows = saldosFiltrados.map(row => ({
    'Grupo': row.numero_grupo,
    'Titular / Nombre': row.nombre || `Grupo ${row.numero_grupo}`,
    'Compañías': row.empresas || 'N/D',
    'Total Facturas': fmtMoney(row.totalFacturas),
    'Total Pagos': fmtMoney(row.totalPagos),
    'Saldo Capital': fmtMoney(row.saldoCapitalUltimo),
    'Interés Acumulado': fmtMoney(row.interesPendUltimo),
    'Saldo Total': fmtMoney(row.saldoFinalUltimo),
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
    'Titular / Nombre': `TOTALES (${saldosFiltrados.length} cuentas - ${periodoLabel})`,
    'Compañías': '',
    'Total Facturas': fmtMoney(totalFacturado),
    'Total Pagos': fmtMoney(totalPagado),
    'Saldo Capital': fmtMoney(totalCapital),
    'Interés Acumulado': fmtMoney(totalInteres),
    'Saldo Total': fmtMoney(totalSaldo),
    'Cant. Movimientos': '',
    'Última Fecha': ''
  });

  const headers = Object.keys(rows[0]);
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows, headers);
  applyCurrencyFormat(ws);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cuentas Corrientes y Saldos');

  const cleanLabel = (periodoLabel || 'General').replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Contaduria_Saldos_${cleanLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Pestaña 3: Exportar Extracto / Libro Mayor de un Grupo
 * @param {Array} movimientos - Array de movimientos del grupo
 * @param {number} grupoNum - Número de grupo
 * @param {string} titular - Nombre del titular
 * @param {string} [periodoLabel='General'] - Período o año filtrado
 */
export function exportExtractoXLSX(movimientos, grupoNum, titular, periodoLabel = 'General') {
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
    'Operadora / Concepto': `RESUMEN (${periodoLabel || 'General'})`,
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
  const perClean = (periodoLabel || 'General').replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Contaduria_Extracto_Grupo${grupoNum}_${perClean}_${titularClean}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Pestaña 3: Exportar Solo Deuda de un Grupo (Meses que deben con interés por mora ya aplicado)
 * @param {Array} deudaItems - Array de meses/conceptos impagos con cálculo de mora
 * @param {number} grupoNum - Número de grupo
 * @param {string} titular - Nombre del titular
 * @param {string} [periodoLabel='General'] - Etiqueta de período/año (ej: 'Año 2026', 'General')
 * @param {number} [tna=120] - Tasa nominal anual aplicada
 */
export function exportSoloDeudaXLSX(deudaItems, grupoNum, titular, periodoLabel = 'General', tna = 120) {
  if (!deudaItems || deudaItems.length === 0) {
    throw new Error('No hay meses con deuda pendiente para exportar en el período seleccionado.');
  }

  const rows = deudaItems.map(d => ({
    'Período': d.periodo || '',
    'Grupo': grupoNum,
    'Socio Titular': titular || `Grupo ${grupoNum}`,
    'Operadora / Concepto': d.concepto || d.operadora || 'MUTUAL',
    'Fecha Emisión': d.fecha ? formatFecha(d.fecha) : '—',
    'Vencimiento': d.vencimiento || '—',
    'Días Mora': Number(d.diasMora || 0) > 0 ? Number(d.diasMora) : 0,
    'Total Facturado': fmtMoney(d.montoFacturado),
    'Abonado a Cuenta': fmtMoney(d.montoAbonado),
    'Saldo Capital Impago': fmtMoney(d.saldoImpago),
    'TNA Aplicada': `${tna}%`,
    'Interés por Mora': fmtMoney(d.interesMora),
    'Total Deuda (con Interés)': fmtMoney(d.totalConInteres),
    'Estado': d.estado || 'IMPAGA'
  }));

  // Fila de totales
  const totalFacturado = deudaItems.reduce((s, d) => s + Number(d.montoFacturado || 0), 0);
  const totalAbonado = deudaItems.reduce((s, d) => s + Number(d.montoAbonado || 0), 0);
  const totalCapital = deudaItems.reduce((s, d) => s + Number(d.saldoImpago || 0), 0);
  const totalInteres = deudaItems.reduce((s, d) => s + Number(d.interesMora || 0), 0);
  const totalDeuda = deudaItems.reduce((s, d) => s + Number(d.totalConInteres || 0), 0);

  rows.push({
    'Período': '',
    'Grupo': '',
    'Socio Titular': `TOTAL DEUDA (${deudaItems.length} meses impagos)`,
    'Operadora / Concepto': `Período: ${periodoLabel} | TNA: ${tna}%`,
    'Fecha Emisión': '',
    'Vencimiento': '',
    'Días Mora': '',
    'Total Facturado': fmtMoney(totalFacturado),
    'Abonado a Cuenta': fmtMoney(totalAbonado),
    'Saldo Capital Impago': fmtMoney(totalCapital),
    'TNA Aplicada': '',
    'Interés por Mora': fmtMoney(totalInteres),
    'Total Deuda (con Interés)': fmtMoney(totalDeuda),
    'Estado': 'CONSOLIDADO'
  });

  const headers = Object.keys(rows[0]);
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows, headers);
  applyCurrencyFormat(ws);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Deuda Grupo ${grupoNum}`);

  const titularClean = (titular || `Grupo_${grupoNum}`).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, '').replace(/\s+/g, '_').slice(0, 30);
  const perClean = (periodoLabel || 'General').replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Contaduria_Deuda_Grupo${grupoNum}_${perClean}_${titularClean}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
