/**
 * Módulo de Exportación a Excel (.xlsx) para Facturación y Auditoría de Liquidación
 * Genera planillas nativas de Excel con columnas idénticas a la interfaz web,
 * valores numéricos puros (aptos para fórmulas y comparaciones) y formato de moneda.
 */
import * as XLSX from 'xlsx';

/**
 * Ajusta automáticamente el ancho de las columnas según su contenido y encabezados
 */
function autoFitColumns(ws, data, headers) {
  const colWidths = headers.map((h, i) => {
    let max = String(h).length;
    data.forEach(row => {
      const val = String(row[headers[i]] ?? '');
      if (val.length > max) max = val.length;
    });
    return { wch: Math.min(Math.max(max + 3, 10), 45) };
  });
  ws['!cols'] = colWidths;
}

/**
 * Aplica formato de moneda de Excel a las columnas numéricas
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
 * Mapeo descriptivo para medios de pago
 */
function formatMedioPago(code) {
  const map = {
    'D': 'Débito Automático',
    'M': 'Cobro Mutual',
    'BC': 'Banco Credicoop',
    'R': 'RapiPago / Pago Fácil',
    'E': 'Efectivo'
  };
  return map[code] || code || 'N/D';
}

/**
 * 1. Exporta la tabla "Detalle por Línea (Auditoría)" de GestionPagos.jsx
 */
export function exportAuditoriaLineasXLSX({ data, periodo, operadora }) {
  if (!data || data.length === 0) {
    alert('No hay datos disponibles para exportar.');
    return;
  }

  const rows = data.map(d => {
    const abonoNeto = Math.round(Number(d.calculado?.baseAb || 0) * 100) / 100;
    const adminIVA = Math.round(Number((d.calculado?.cAdmin || 0) + (d.calculado?.cIVA || 0)) * 100) / 100;
    const tarifa = Math.round(Number(d.calculado?.tarifaAunar || 0) * 100) / 100;
    const excedentes = Math.round(Number(d.calculado?.excedentes || 0) * 100) / 100;
    const bonif = Math.round(Number(d.calculado?.bonifManual || 0) * 100) / 100;
    const ajusteOp = Math.round(Number(d.otros_cargos_op || 0) * 100) / 100;
    const totalCobrar = Math.round(Number(d.calculado?.totalCobrar || 0) * 100) / 100;

    let auditText = 'OK';
    if (d.calculado?.movistarAudit) {
      auditText = d.calculado.movistarAudit.meetsAgreement
        ? `OK ${d.calculado.movistarAudit.expectedPct}%`
        : `NO CUMPLE (Real: ${d.calculado.movistarAudit.actualDiscountPct}%, Esperado: ${d.calculado.movistarAudit.expectedPct}%)`;
    } else if (d.calculado?.portabilityWarning) {
      auditText = d.calculado.portabilityWarning;
    } else if (d.calculado?.hasDiscountAlert) {
      auditText = 'Alerta Descuento';
    }

    return {
      'Línea': d.numero_linea || '',
      'Plan': d.lineas?.planes_abonos?.nombre_plan || 'Plan No Identificado',
      'Socio': d.lineas?.socios?.nombre_completo || 'Sin Socio',
      'Nº Socio': d.lineas?.socios?.nro_socio || '',
      'Grupo': d.lineas?.numero_grupo || '',
      'Abono Neto': abonoNeto,
      'Admin + IVA': adminIVA,
      'Tarifa': tarifa,
      'Excedentes': excedentes,
      'Descuentos': bonif !== 0 ? -Math.abs(bonif) : 0,
      'Ajuste Operadora': ajusteOp,
      'TOTAL': totalCobrar,
      '% Desc. Operadora': d.calculado?.operatorDiscountPct ? `${d.calculado.operatorDiscountPct}%` : '',
      'Estado Auditoría': auditText
    };
  });

  // Fila de TOTALES
  const sumNeto = rows.reduce((s, r) => s + (r['Abono Neto'] || 0), 0);
  const sumAdminIVA = rows.reduce((s, r) => s + (r['Admin + IVA'] || 0), 0);
  const sumTarifa = rows.reduce((s, r) => s + (r['Tarifa'] || 0), 0);
  const sumExcedentes = rows.reduce((s, r) => s + (r['Excedentes'] || 0), 0);
  const sumDescuentos = rows.reduce((s, r) => s + (r['Descuentos'] || 0), 0);
  const sumAjusteOp = rows.reduce((s, r) => s + (r['Ajuste Operadora'] || 0), 0);
  const sumTotal = rows.reduce((s, r) => s + (r['TOTAL'] || 0), 0);

  rows.push({
    'Línea': `TOTALES (${data.length} líneas)`,
    'Plan': '',
    'Socio': '',
    'Nº Socio': '',
    'Grupo': '',
    'Abono Neto': Math.round(sumNeto * 100) / 100,
    'Admin + IVA': Math.round(sumAdminIVA * 100) / 100,
    'Tarifa': Math.round(sumTarifa * 100) / 100,
    'Excedentes': Math.round(sumExcedentes * 100) / 100,
    'Descuentos': Math.round(sumDescuentos * 100) / 100,
    'Ajuste Operadora': Math.round(sumAjusteOp * 100) / 100,
    'TOTAL': Math.round(sumTotal * 100) / 100,
    '% Desc. Operadora': '',
    'Estado Auditoría': ''
  });

  const headers = Object.keys(rows[0]);
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows, headers);
  applyCurrencyFormat(ws);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Auditoría de Liquidación');

  const opClean = (operadora || 'OPERADORA').replace(/\s+/g, '_');
  const perClean = (periodo || 'PERIODO').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `Auditoria_Liquidacion_${perClean}_${opClean}.xlsx`);
}

/**
 * 2. Exporta la tabla "Liquidaciones por Socio" de LiquidacionesSocio.jsx (Liquidación Final)
 */
export function exportLiquidacionesSociosXLSX({ data, periodo, operadora }) {
  if (!data || data.length === 0) {
    alert('No hay liquidaciones disponibles para exportar.');
    return;
  }

  const rows = data.map(d => {
    const abonoBaseFull = Math.round(Number(
      (d.calculado?.baseAb || 0) +
      (d.calculado?.cAdmin || 0) +
      (d.calculado?.cIVA || 0) +
      (d.calculado?.tarifaAunar || 0)
    ) * 100) / 100;

    const extra = Math.round(Number(d.calculado?.extraAmount || 0) * 100) / 100;
    const bonif = Math.round(Number(d.calculado?.bonifManual || 0) * 100) / 100;
    const total = Math.round(Number(d.calculado?.totalCobrar || 0) * 100) / 100;

    const provNombre = d.lineas?.proveedores?.nombre ||
      (d.proveedor_id === 1 ? 'CLARO' : d.proveedor_id === 2 ? 'MOVISTAR' : d.proveedor_id === 3 ? 'PERSONAL' : 'N/D');

    return {
      'Socio': d.lineas?.socios?.nombre_completo || 'Sin Socio',
      'Nº Socio': d.lineas?.socios?.nro_socio || '',
      'Grupo': d.lineas?.numero_grupo || '',
      'Línea': d.numero_linea || '',
      'Plan': d.lineas?.planes_abonos?.nombre_plan || 'Plan S/D',
      'Operadora': provNombre,
      'Medio de Pago': formatMedioPago(d.lineas?.socios?.fpago),
      'Abono Base': abonoBaseFull,
      'Cargos Extra': extra,
      'Descuentos': bonif > 0 ? -bonif : 0,
      'Total a Cobrar': total
    };
  });

  // Fila de TOTALES
  const sumAbono = rows.reduce((s, r) => s + (r['Abono Base'] || 0), 0);
  const sumExtra = rows.reduce((s, r) => s + (r['Cargos Extra'] || 0), 0);
  const sumDesc = rows.reduce((s, r) => s + (r['Descuentos'] || 0), 0);
  const sumTotal = rows.reduce((s, r) => s + (r['Total a Cobrar'] || 0), 0);

  rows.push({
    'Socio': `TOTALES (${data.length} registros)`,
    'Nº Socio': '',
    'Grupo': '',
    'Línea': '',
    'Plan': '',
    'Operadora': '',
    'Medio de Pago': '',
    'Abono Base': Math.round(sumAbono * 100) / 100,
    'Cargos Extra': Math.round(sumExtra * 100) / 100,
    'Descuentos': Math.round(sumDesc * 100) / 100,
    'Total a Cobrar': Math.round(sumTotal * 100) / 100
  });

  const headers = Object.keys(rows[0]);
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows, headers);
  applyCurrencyFormat(ws);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Liquidaciones Socios');

  const perClean = (periodo || 'General').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `Liquidacion_Final_Socios_${perClean}.xlsx`);
}

/**
 * 3. Exporta la tabla "Resumen por Grupos" de ResumenGrupos.jsx
 */
export function exportLiquidacionesGruposXLSX({ data, periodo }) {
  if (!data || data.length === 0) {
    alert('No hay grupos para exportar.');
    return;
  }

  const rows = data.map(g => {
    const totalGrupo = Math.round(Number(g.total_grupo || 0) * 100) / 100;
    const abonado = Math.round(Number(g.monto_abonado || (g.estado_pago === 'ABONADO' ? g.total_grupo : 0)) * 100) / 100;
    const pendiente = Math.max(0, Math.round((totalGrupo - abonado) * 100) / 100);

    const provNombre = g.proveedores?.nombre ||
      (g.proveedor_id === 1 ? 'CLARO' : g.proveedor_id === 2 ? 'MOVISTAR' : g.proveedor_id === 3 ? 'PERSONAL' : 'N/D');

    return {
      'Grupo': g.grupos?.alias_grupo || `Grupo ${g.numero_grupo}`,
      'Responsable (Socio)': g.socios?.nombre_completo || 'Sin Nombre',
      'Líneas': Number(g.sum_total_lineas || 0),
      'Operadora': provNombre,
      'Total a Cobrar': totalGrupo,
      'Monto Abonado': abonado,
      'Saldo Pendiente': pendiente,
      'Estado': g.estado_pago || 'PENDIENTE'
    };
  });

  // Fila de TOTALES
  const sumLineas = rows.reduce((s, r) => s + (r['Líneas'] || 0), 0);
  const sumTotal = rows.reduce((s, r) => s + (r['Total a Cobrar'] || 0), 0);
  const sumAbonado = rows.reduce((s, r) => s + (r['Monto Abonado'] || 0), 0);
  const sumPendiente = rows.reduce((s, r) => s + (r['Saldo Pendiente'] || 0), 0);

  rows.push({
    'Grupo': `TOTALES (${data.length} grupos)`,
    'Responsable (Socio)': '',
    'Líneas': sumLineas,
    'Operadora': '',
    'Total a Cobrar': Math.round(sumTotal * 100) / 100,
    'Monto Abonado': Math.round(sumAbonado * 100) / 100,
    'Saldo Pendiente': Math.round(sumPendiente * 100) / 100,
    'Estado': ''
  });

  const headers = Object.keys(rows[0]);
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows, headers);
  applyCurrencyFormat(ws);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen por Grupo');

  const perClean = (periodo || 'Lote').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `Liquidacion_Final_Grupos_${perClean}.xlsx`);
}
