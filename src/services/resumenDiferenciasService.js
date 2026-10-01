import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

/**
 * Helper para paginar consultas grandes en Supabase
 */
async function fetchAllPaginated(buildQueryFn) {
  let allData = [];
  let from = 0;
  const limit = 1000;
  while (true) {
    const to = from + limit - 1;
    const { data, error } = await buildQueryFn().range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = [...allData, ...data];
    if (data.length < limit) break;
    from += limit;
  }
  return allData;
}

/**
 * Devuelve el período anterior en formato YYYY-MM
 */
export function getPrevPeriodStr(pStr) {
  if (!pStr) return '';
  const [year, month] = pStr.split('-').map(Number);
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

/**
 * Devuelve una etiqueta amigable para el período (ej: "Agosto 2026")
 */
export function formatPeriodoLabel(pStr) {
  if (!pStr) return '';
  const [year, month] = pStr.split('-').map(Number);
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return `${meses[month - 1] || ''} ${year}`;
}

/**
 * Calcula el resumen de diferencias completo entre el mes anterior y el actual:
 * - Líneas que no vinieron más (con diagnóstico de baja, suspendida, pase de compañía o no facturada)
 * - Líneas nuevas (altas)
 * - Cambios de plan
 * - Tarifa Aunar anterior vs actual
 * - Precios promedio y variación por plan
 */
export async function fetchResumenDiferencias({ periodo, proveedorId, currentLinesData = [], currentTarifaAunar = 0 }) {
  if (!periodo || !proveedorId) {
    return null;
  }

  const provId = parseInt(proveedorId, 10);

  // 1. Buscar el período anterior inmediato en base de datos para este proveedor
  const { data: latestPeriods } = await supabase
    .from('consumos_mensuales')
    .select('periodo')
    .eq('proveedor_id', provId)
    .lt('periodo', periodo)
    .order('periodo', { ascending: false })
    .limit(1);

  let prevPeriodo = latestPeriods && latestPeriods.length > 0 ? latestPeriods[0].periodo : null;
  if (!prevPeriodo) {
    prevPeriodo = getPrevPeriodStr(periodo);
  }

  // 2. Traer consumos del mes anterior para este proveedor
  const prevConsumosRaw = await fetchAllPaginated(() =>
    supabase
      .from('consumos_mensuales')
      .select('consumo_id, numero_linea, costo_abono_real, excedentes, tarifa_aunar_aplicada, precio_lista_audit, precio_lista_factura, descuento_pct, proveedor_id')
      .eq('periodo', prevPeriodo)
      .eq('proveedor_id', provId)
  );

  // Exclusiones si las hubiera
  const { data: expData } = await supabase.from('excepciones_facturacion').select('numero_linea');
  const excepciones = new Set((expData || []).map(e => e.numero_linea));
  const prevConsumos = (prevConsumosRaw || []).filter(c => !excepciones.has(c.numero_linea));

  // Mapa de líneas del mes actual
  const currentLinesMap = new Map();
  (currentLinesData || []).forEach(row => {
    currentLinesMap.set(String(row.numero_linea), row);
  });

  // Mapa de líneas del mes anterior
  const prevConsumosMap = new Map();
  prevConsumos.forEach(c => {
    prevConsumosMap.set(String(c.numero_linea), c);
  });

  // 3. Precios históricos de ambos períodos
  const { data: histPrices } = await supabase
    .from('precios_auditoria_periodo')
    .select('*')
    .in('periodo', [prevPeriodo, periodo]);

  const prevHistMap = {};
  const currHistMap = {};
  (histPrices || []).forEach(h => {
    if (h.periodo === prevPeriodo) prevHistMap[h.plan_id] = h;
    if (h.periodo === periodo) currHistMap[h.plan_id] = h;
  });

  // 4. Identificar números faltantes (estaban en mes anterior pero NO en el actual)
  const missingLineNumbers = [];
  prevConsumosMap.forEach((_, linea) => {
    if (!currentLinesMap.has(linea)) {
      missingLineNumbers.push(linea);
    }
  });

  // 5. Cargar información de líneas faltantes en `lineas` y verificar portabilidades en mes actual
  const missingLinesInfoMap = new Map();
  const portedCurrentConsumosMap = new Map();

  if (missingLineNumbers.length > 0) {
    for (let i = 0; i < missingLineNumbers.length; i += 200) {
      const chunk = missingLineNumbers.slice(i, i + 200);

      const { data: dbLines } = await supabase
        .from('lineas')
        .select('numero_linea, numero_grupo, estado, proveedor_id, plan_id, planes_abonos(nombre_plan, precio, tarifa_aunar), socios:socios!lineas_socio_id_fkey(nombre_completo, nro_socio), proveedores!lineas_proveedor_id_fkey(nombre)')
        .in('numero_linea', chunk);

      (dbLines || []).forEach(l => {
        missingLinesInfoMap.set(String(l.numero_linea), l);
      });

      // Consultar si estas líneas vinieron en el mes actual pero en OTRO proveedor
      const { data: currentOtherProvConsumos } = await supabase
        .from('consumos_mensuales')
        .select('numero_linea, proveedor_id, proveedores:proveedores!consumos_mensuales_proveedor_id_fkey(nombre)')
        .eq('periodo', periodo)
        .in('numero_linea', chunk);

      (currentOtherProvConsumos || []).forEach(c => {
        portedCurrentConsumosMap.set(String(c.numero_linea), c);
      });
    }
  }

  // 6. Diagnóstico y armado de Líneas Faltantes
  const lineasFaltantes = missingLineNumbers.map(linea => {
    const prevC = prevConsumosMap.get(linea);
    const lineDb = missingLinesInfoMap.get(linea);
    const portedInCurrent = portedCurrentConsumosMap.get(linea);

    const socioRaw = lineDb?.socios;
    const socioInfo = Array.isArray(socioRaw) ? socioRaw[0] : socioRaw;
    const socioNombre = socioInfo?.nombre_completo || 'Sin Asignar';
    const numeroGrupo = lineDb?.numero_grupo || '-';
    const planDbRaw = lineDb?.planes_abonos;
    const planDb = Array.isArray(planDbRaw) ? planDbRaw[0] : planDbRaw;
    const planNombre = planDb?.nombre_plan || 'Plan No Registrado';
    const abonoAnterior = Number(prevC?.costo_abono_real || 0);

    // Diagnóstico
    let tipo = 'NO_FACTURADA';
    let label = 'No vino en factura (Posible corte o baja)';
    let badgeColor = '#f59e0b'; // ámbar
    let badgeBg = 'rgba(245, 158, 11, 0.12)';
    let nuevoProv = null;

    if (portedInCurrent) {
      const provName = portedInCurrent.proveedores?.nombre || `Proveedor #${portedInCurrent.proveedor_id}`;
      tipo = 'PORTABILIDAD';
      label = `Pasó a ${provName} (Facturado en ${periodo})`;
      badgeColor = '#3b82f6'; // azul
      badgeBg = 'rgba(59, 130, 246, 0.12)';
      nuevoProv = provName;
    } else if (lineDb?.proveedor_id && lineDb.proveedor_id !== provId) {
      const provName = lineDb.proveedores?.nombre || `Proveedor #${lineDb.proveedor_id}`;
      tipo = 'PORTABILIDAD';
      label = `Pasó a ${provName} (Asignado en DB)`;
      badgeColor = '#6366f1'; // índigo
      badgeBg = 'rgba(99, 102, 241, 0.12)';
      nuevoProv = provName;
    } else if (lineDb?.estado === 'BAJA' || lineDb?.estado === 'Baja' || lineDb?.estado === 'INACTIVA') {
      tipo = 'BAJA';
      label = 'Dada de Baja en Base de Datos';
      badgeColor = '#ef4444'; // rojo
      badgeBg = 'rgba(239, 68, 68, 0.12)';
    } else if (lineDb?.estado === 'SUSPENDIDA' || lineDb?.estado === 'Suspendida') {
      tipo = 'SUSPENDIDA';
      label = 'Suspendida en Base de Datos';
      badgeColor = '#ea580c'; // naranja
      badgeBg = 'rgba(234, 88, 12, 0.12)';
    }

    return {
      numero_linea: linea,
      socioNombre,
      numeroGrupo,
      planNombre,
      abonoAnterior,
      tipo,
      label,
      badgeColor,
      badgeBg,
      nuevoProv,
      estadoDb: lineDb?.estado || 'ACTIVA'
    };
  });

  // Ordenar faltantes por tipo de diagnóstico
  lineasFaltantes.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.socioNombre.localeCompare(b.socioNombre));

  // 7. Identificar Líneas Nuevas (Altas)
  const lineasNuevas = [];
  currentLinesMap.forEach((row, linea) => {
    if (!prevConsumosMap.has(linea)) {
      const socioRaw = row.lineas?.socios;
      const socioInfo = Array.isArray(socioRaw) ? socioRaw[0] : socioRaw;
      const socioNombre = socioInfo?.nombre_completo || 'Sin Asignar';
      const numeroGrupo = row.lineas?.numero_grupo || '-';
      const planRaw = row.lineas?.planes_abonos;
      const planInfo = Array.isArray(planRaw) ? planRaw[0] : planRaw;
      const planNombre = planInfo?.nombre_plan || row.plan || 'Plan No Registrado';
      const abonoActual = Number(row.calculado?.baseAb || row.costo_abono_real || 0);

      lineasNuevas.push({
        numero_linea: linea,
        socioNombre,
        numeroGrupo,
        planNombre,
        abonoActual,
        tipo: 'ALTA',
        label: 'Alta / Nueva Línea',
        badgeColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.12)'
      });
    }
  });

  lineasNuevas.sort((a, b) => a.socioNombre.localeCompare(b.socioNombre));

  // 8. Agrupación para cálculo de variaciones por plan
  const planStatsMap = {};

  (currentLinesData || []).forEach(row => {
    const linea = String(row.numero_linea);
    const currPlanRaw = row.lineas?.planes_abonos;
    const currPlanInfo = Array.isArray(currPlanRaw) ? currPlanRaw[0] : currPlanRaw;
    const planName = currPlanInfo?.nombre_plan || row.plan || 'Sin Plan';
    const planId = currPlanInfo?.plan_id || row.plan_id;

    if (!planStatsMap[planName]) {
      planStatsMap[planName] = {
        planName,
        planId,
        linesCount: 0,
        currTotalAbono: 0,
        prevTotalAbono: 0,
        countComparable: 0
      };
    }

    planStatsMap[planName].linesCount++;

    const prevC = prevConsumosMap.get(linea);
    if (prevC) {
      const prevAbono = Number(prevC.costo_abono_real || 0);
      const currAbono = Number(row.costo_abono_real || row.calculado?.baseAb || 0);

      // Si no tiene excedentes en ninguno de los dos meses, es apta para cálculo limpio de variación
      const currExc = Number(row.excedentes || row.calculado?.excedentes || 0);
      const prevExc = Number(prevC.excedentes || 0);

      if (prevAbono > 0 && currAbono > 0 && currExc === 0 && prevExc === 0) {
        planStatsMap[planName].prevTotalAbono += prevAbono;
        planStatsMap[planName].currTotalAbono += currAbono;
        planStatsMap[planName].countComparable++;
      }
    }
  });

  // 9. Cálculo de Variación Promedio por Plan
  const planAverages = Object.values(planStatsMap).map(p => {
    let avgPrev = p.countComparable > 0 ? p.prevTotalAbono / p.countComparable : 0;
    let avgCurr = p.countComparable > 0 ? p.currTotalAbono / p.countComparable : 0;
    
    // Si no hubo líneas comparables sin excedentes, promediar todas las que tengan previo
    if (p.countComparable === 0) {
      let tPrev = 0;
      let tCurr = 0;
      let cnt = 0;
      (currentLinesData || []).forEach(row => {
        const currPlanInfo = row.lineas?.planes_abonos || {};
        const pName = currPlanInfo.nombre_plan || row.plan || 'Sin Plan';
        if (pName === p.planName) {
          const prevC = prevConsumosMap.get(String(row.numero_linea));
          if (prevC && Number(prevC.costo_abono_real || 0) > 0) {
            tPrev += Number(prevC.costo_abono_real);
            tCurr += Number(row.costo_abono_real || row.calculado?.baseAb || 0);
            cnt++;
          }
        }
      });
      if (cnt > 0) {
        avgPrev = tPrev / cnt;
        avgCurr = tCurr / cnt;
      }
    }

    let variacionPct = 0;
    if (avgPrev > 0 && avgCurr > 0) {
      variacionPct = ((avgCurr - avgPrev) / avgPrev) * 100;
    }

    const prevHist = p.planId ? prevHistMap[p.planId] : null;
    const currHist = p.planId ? currHistMap[p.planId] : null;
    const prevListPrice = Number(prevHist?.precio_lista || 0);
    const currListPrice = Number(currHist?.precio_lista || 0);

    return {
      plan: p.planName,
      linesCount: p.linesCount,
      avgPrevAbono: avgPrev,
      avgCurrAbono: avgCurr,
      diffAbono: avgCurr - avgPrev,
      variacionPct,
      prevListPrice,
      currListPrice
    };
  });

  // Ordenar por cantidad de líneas descendente
  planAverages.sort((a, b) => b.linesCount - a.linesCount);

  // 10. Comparativa de Tarifa Aunar
  let tarifaAnterior = 0;
  // Buscar en historial de precios del mes anterior
  const prevHistEntries = Object.values(prevHistMap);
  if (prevHistEntries.length > 0 && Number(prevHistEntries[0].tarifa_aunar || 0) > 0) {
    tarifaAnterior = Number(prevHistEntries[0].tarifa_aunar);
  } else {
    // Si no está en historial, promediar tarifas aplicadas en consumos del mes anterior
    const nonZeroPrevTarifas = prevConsumos
      .map(c => Number(c.tarifa_aunar_aplicada || 0))
      .filter(t => t > 0);
    if (nonZeroPrevTarifas.length > 0) {
      tarifaAnterior = nonZeroPrevTarifas[0];
    } else {
      // Fallback según operadora
      tarifaAnterior = provId === 3 ? 8335 : (provId === 1 ? 7630 : 7600);
    }
  }

  let tarifaActual = Number(currentTarifaAunar || 0);
  if (tarifaActual === 0) {
    const currHistEntries = Object.values(currHistMap);
    if (currHistEntries.length > 0 && Number(currHistEntries[0].tarifa_aunar || 0) > 0) {
      tarifaActual = Number(currHistEntries[0].tarifa_aunar);
    } else {
      const nonZeroCurr = (currentLinesData || [])
        .map(r => Number(r.calculado?.tarifaAunar || r.tarifa_aunar_aplicada || 0))
        .filter(t => t > 0);
      tarifaActual = nonZeroCurr.length > 0 ? nonZeroCurr[0] : tarifaAnterior;
    }
  }

  let variacionTarifa = 0;
  if (tarifaAnterior > 0 && tarifaActual > 0) {
    variacionTarifa = ((tarifaActual - tarifaAnterior) / tarifaAnterior) * 100;
  }

  // 11. Estadísticas Generales
  const prevCount = prevConsumos.length;
  const currCount = currentLinesData.length;
  const diffCount = currCount - prevCount;
  const countMantenidas = prevCount - lineasFaltantes.length;

  // 12. Desglose de Bonificaciones por Porcentaje
  const countByPct = new Map();
  let sinBonifCount = 0;
  (currentLinesData || []).forEach(d => {
    let pct = null;
    if (d.calculado?.operatorDiscountPct !== undefined && d.calculado?.operatorDiscountPct !== null && Number(d.calculado.operatorDiscountPct) > 0) {
      pct = Math.round(Number(d.calculado.operatorDiscountPct));
    } else if (d.calculado?.movistarAudit?.actualDiscountPct !== undefined && d.calculado?.movistarAudit?.actualDiscountPct !== null && Number(d.calculado.movistarAudit.actualDiscountPct) > 0) {
      pct = Math.round(Number(d.calculado.movistarAudit.actualDiscountPct));
    } else if (d.descuento_pct !== undefined && d.descuento_pct !== null && Number(d.descuento_pct) > 0) {
      pct = Math.round(Number(d.descuento_pct));
    } else {
      const pLista = Number(d.precio_lista_audit || d.lineas?.planes_abonos?.precio || 0);
      const costo = Number(d.costo_abono_real || d.calculado?.baseAb || 0);
      if (pLista > 0 && costo > 0 && costo < pLista) {
        pct = Math.round(((pLista - costo) / pLista) * 100);
      }
    }

    if (pct !== null && pct > 0 && pct <= 100) {
      countByPct.set(pct, (countByPct.get(pct) || 0) + 1);
    } else {
      sinBonifCount++;
    }
  });

  const totalLines = (currentLinesData || []).length;
  const bonifBreakdown = Array.from(countByPct.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([pct, count]) => ({
      pct,
      label: `${pct}%`,
      count,
      pctOfTotal: totalLines > 0 ? (count / totalLines) * 100 : 0
    }));

  if (sinBonifCount > 0) {
    bonifBreakdown.push({
      pct: 0,
      label: 'Sin Bonif. (0%)',
      count: sinBonifCount,
      pctOfTotal: totalLines > 0 ? (sinBonifCount / totalLines) * 100 : 0
    });
  }

  return {
    periodo,
    prevPeriodo,
    proveedorId: provId,
    prevPeriodoLabel: formatPeriodoLabel(prevPeriodo),
    currPeriodoLabel: formatPeriodoLabel(periodo),
    stats: {
      prevCount,
      currCount,
      diffCount,
      countFaltantes: lineasFaltantes.length,
      countAltas: lineasNuevas.length,
      countCambiosPlan: 0,
      countMantenidas,
      totalWithBonif: totalLines - sinBonifCount,
      totalSinBonif: sinBonifCount
    },
    tarifas: {
      tarifaAnterior,
      tarifaActual,
      diffTarifa: tarifaActual - tarifaAnterior,
      variacionTarifa
    },
    lineasFaltantes,
    lineasNuevas,
    planAverages,
    bonifBreakdown
  };
}

/**
 * Exporta el informe completo de diferencias a un libro Excel (.xlsx) con pestañas organizadas
 */
export function exportResumenDiferenciasXLSX({ resumen, operadora }) {
  if (!resumen) return;

  const wb = XLSX.utils.book_new();

  // Hoja 1: Resumen General y Tarifas
  const generalData = [
    { 'MÉTRICA': 'Período Auditado', 'VALOR': `${resumen.periodo} (${resumen.currPeriodoLabel})` },
    { 'MÉTRICA': 'Período Anterior', 'VALOR': `${resumen.prevPeriodo} (${resumen.prevPeriodoLabel})` },
    { 'MÉTRICA': 'Operadora', 'VALOR': operadora || `Proveedor #${resumen.proveedorId}` },
    { 'MÉTRICA': 'Total Líneas Mes Anterior', 'VALOR': resumen.stats.prevCount },
    { 'MÉTRICA': 'Total Líneas Mes Actual', 'VALOR': resumen.stats.currCount },
    { 'MÉTRICA': 'Diferencia Neta de Líneas', 'VALOR': resumen.stats.diffCount },
    { 'MÉTRICA': 'Líneas que NO vinieron más (Faltantes / Bajas)', 'VALOR': resumen.stats.countFaltantes },
    { 'MÉTRICA': 'Líneas Nuevas (Altas)', 'VALOR': resumen.stats.countAltas },
    { 'MÉTRICA': 'Tarifa Aunar Mes Anterior', 'VALOR': `$${resumen.tarifas.tarifaAnterior.toLocaleString('es-AR')}` },
    { 'MÉTRICA': 'Tarifa Aunar Mes Actual', 'VALOR': `$${resumen.tarifas.tarifaActual.toLocaleString('es-AR')}` },
    { 'MÉTRICA': 'Variación Tarifa Aunar', 'VALOR': `${resumen.tarifas.variacionTarifa >= 0 ? '+' : ''}${resumen.tarifas.variacionTarifa.toFixed(2)}%` }
  ];
  const wsGeneral = XLSX.utils.json_to_sheet(generalData);
  wsGeneral['!cols'] = [{ wch: 45 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsGeneral, 'Resumen General');

  // Hoja 2: Líneas que no vinieron más (Faltantes / Bajas / Traspasos)
  if (resumen.lineasFaltantes && resumen.lineasFaltantes.length > 0) {
    const faltantesRows = resumen.lineasFaltantes.map(f => ({
      'Línea': f.numero_linea,
      'Socio': f.socioNombre,
      'Grupo': f.numeroGrupo,
      'Plan Anterior': f.planNombre,
      'Abono Base Anterior': f.abonoAnterior,
      'Diagnóstico / Motivo': f.label,
      'Estado en DB': f.estadoDb
    }));
    const wsFaltantes = XLSX.utils.json_to_sheet(faltantesRows);
    wsFaltantes['!cols'] = [
      { wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 45 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, wsFaltantes, 'No Vinieron Más');
  }

  // Hoja 3: Líneas Nuevas (Altas)
  if (resumen.lineasNuevas && resumen.lineasNuevas.length > 0) {
    const altasRows = resumen.lineasNuevas.map(a => ({
      'Línea': a.numero_linea,
      'Socio': a.socioNombre,
      'Grupo': a.numeroGrupo,
      'Plan Actual': a.planNombre,
      'Abono Base Actual': a.abonoActual,
      'Tipo': 'Alta'
    }));
    const wsAltas = XLSX.utils.json_to_sheet(altasRows);
    wsAltas['!cols'] = [
      { wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, wsAltas, 'Nuevas Altas');
  }

  // Hoja 4: Variación Promedio por Plan
  if (resumen.planAverages && resumen.planAverages.length > 0) {
    const planRows = resumen.planAverages.map(p => ({
      'Plan': p.plan,
      'Cantidad Líneas': p.linesCount,
      'Abono Promedio Anterior': Math.round(p.avgPrevAbono * 100) / 100,
      'Abono Promedio Actual': Math.round(p.avgCurrAbono * 100) / 100,
      'Diferencia Abono ($)': Math.round(p.diffAbono * 100) / 100,
      'Variación (%)': `${p.variacionPct >= 0 ? '+' : ''}${p.variacionPct.toFixed(2)}%`,
      'Precio Lista Anterior': p.prevListPrice || '-',
      'Precio Lista Actual': p.currListPrice || '-'
    }));
    const wsPlanes = XLSX.utils.json_to_sheet(planRows);
    wsPlanes['!cols'] = [
      { wch: 28 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, wsPlanes, 'Variación por Plan');
  }

  // Hoja 5: Bonificaciones por %
  if (resumen.bonifBreakdown && resumen.bonifBreakdown.length > 0) {
    const bonifRows = resumen.bonifBreakdown.map(b => ({
      '% Bonificación': b.label || `${b.pct}%`,
      'Cantidad de Líneas': b.count,
      'Participación (% del Lote)': `${b.pctOfTotal.toFixed(1)}%`
    }));
    const wsBonif = XLSX.utils.json_to_sheet(bonifRows);
    wsBonif['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsBonif, 'Bonificaciones');
  }

  // Descargar archivo
  const filename = `Resumen_Diferencias_${resumen.periodo}_${operadora || 'Operadora'}.xlsx`;
  XLSX.writeFile(wb, filename);
}
