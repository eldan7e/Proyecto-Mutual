/**
 * Builds row data for the resumen (groups summary) CSV export.
 * @param {Array} liquidacionesAgrupadas
 * @returns {Array<Array<any>>}
 */
export function buildResumenRows(liquidacionesAgrupadas) {
  return liquidacionesAgrupadas.map(g => [
    g.grupos?.alias_grupo || `Grupo ${g.numero_grupo}`,
    g.socios?.nombre_completo || 'Sin Nombre',
    g.sum_total_lineas,
    g.total_grupo || 0,
    g.estado_pago || 'PENDIENTE'
  ]);
}

/**
 * Builds row data for the socios (per-line liquidation) CSV export.
 * @param {Array} sortedSocioData
 * @returns {Array<Array<any>>}
 */
export function buildSociosRows(sortedSocioData) {
  return sortedSocioData.map(d => {
    const abonoBaseFull = (d.calculado?.baseAb || 0) + (d.calculado?.cAdmin || 0) + (d.calculado?.cIVA || 0) + (d.calculado?.tarifaAunar || 0);
    const extra = d.calculado?.extraAmount || 0;
    const bonif = d.calculado?.bonifManual || 0;
    const total = d.calculado?.totalCobrar || 0;
    return [
      d.lineas?.socios?.nombre_completo || 'Sin Socio',
      d.lineas?.socios?.nro_socio || '',
      d.numero_linea || '',
      d.lineas?.planes_abonos?.nombre_plan || 'Plan S/D',
      abonoBaseFull,
      extra,
      bonif,
      total
    ];
  });
}
