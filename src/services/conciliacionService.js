import { supabase } from '../supabaseClient';

/**
 * Obtiene la lista de todos los períodos únicos en liquidaciones_grupos.
 * @returns {Promise<Array<string>>} Lista de períodos ordenados descendente.
 */
export const fetchPeriods = async () => {
  const { data, error } = await supabase
    .from('liquidaciones_grupos')
    .select('periodo');
  if (error) throw error;
  
  return [...new Set(data?.map(d => d.periodo))]
    .filter(Boolean)
    .sort()
    .reverse();
};

/**
 * Obtiene el resumen financiero de facturación y abonos para un período específico.
 * @param {string} period - Período (YYYY-MM).
 * @returns {Promise<{totalBilled: number, totalPaid: number, totalPending: number}>}
 */
export const fetchPeriodSummary = async (period) => {
  if (!period) return { totalBilled: 0, totalPaid: 0, totalPending: 0 };
  
  const { data, error } = await supabase
    .from('liquidaciones_grupos')
    .select('monto_total_facturado, monto_abonado')
    .eq('periodo', period);
    
  if (error) throw error;
  
  let totalBilled = 0;
  let totalPaid = 0;
  
  (data || []).forEach(row => {
    totalBilled += Number(row.monto_total_facturado || 0);
    totalPaid += Number(row.monto_abonado || 0);
  });
  
  return {
    totalBilled: Math.round(totalBilled * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalPending: Math.round((totalBilled - totalPaid) * 100) / 100
  };
};

/**
 * Obtiene todos los socios activos con su grupo correspondiente.
 * @returns {Promise<Array>}
 */
export const fetchSocios = async () => {
  const { data, error } = await supabase
    .from('socios')
    .select(`
      socio_id,
      nombre_completo,
      nro_socio,
      dni,
      cuit,
      cbu,
      grupo_socio(numero_grupo)
    `)
    .order('nombre_completo');
    
  if (error) throw error;
  return data || [];
};
export const fetchSociosWithGroups = fetchSocios;

/**
 * Obtiene la relación de titulares de cada grupo.
 * @returns {Promise<Array>}
 */
export const fetchTitularData = async () => {
  const { data, error } = await supabase
    .from('grupo_socio')
    .select('numero_grupo, socio_id')
    .eq('es_titular', true);
    
  if (error) throw error;
  return data || [];
};
export const fetchTitulares = fetchTitularData;

/**
 * Obtiene las liquidaciones para un período específico.
 * @param {string} selectedPeriod - Período (YYYY-MM).
 * @returns {Promise<Array>}
 */
export const fetchPendingLiquidaciones = async (selectedPeriod) => {
  let query = supabase
    .from('liquidaciones_grupos')
    .select(`
      liquidacion_id,
      numero_grupo,
      periodo,
      monto_total_facturado,
      monto_abonado,
      proveedor_id,
      socio_id,
      socios!socio_id(fpago),
      proveedores!proveedor_id(nombre)
    `);

  if (selectedPeriod) {
    query = query.eq('periodo', selectedPeriod);
  }

  const { data, error } = await query.order('periodo', { ascending: true });
  if (error) throw error;
  return data || [];
};
export const fetchLiquidacionesByPeriod = fetchPendingLiquidaciones;

/**
 * Obtiene los consumos mensuales para un período.
 * @param {string} selectedPeriod - Período (YYYY-MM).
 * @returns {Promise<Array>}
 */
export const fetchConsumosMensuales = async (selectedPeriod) => {
  if (!selectedPeriod) return [];
  const { data, error } = await supabase
    .from('consumos_mensuales')
    .select(`
      total_linea,
      numero_linea,
      periodo,
      proveedor_id,
      lineas!inner (
        socio_id,
        numero_grupo,
        socios:socios!lineas_socio_id_fkey (
          nombre_completo,
          nro_socio
        )
      )
    `)
    .eq('periodo', selectedPeriod);
    
  if (error) throw error;
  return data || [];
};
export const fetchPeriodConsumos = fetchConsumosMensuales;

/**
 * Obtiene el historial de movimientos bancarios filtrado por período.
 * @param {string} selectedPeriod - Período (YYYY-MM).
 * @returns {Promise<Array>}
 */
export const fetchHistorial = async (selectedPeriod) => {
  let query = supabase
    .from('movimientos_bancarios')
    .select(`
      movimiento_id,
      fecha_movimiento,
      concepto,
      monto,
      ingreso_bruto,
      impuestos,
      banco,
      created_at,
      socio_id,
      liquidacion_id,
      tipo_movimiento,
      comprobante,
      observaciones,
      periodo,
      socios(nombre_completo, nro_socio),
      liquidaciones_grupos(periodo, numero_grupo, monto_total_facturado)
    `)
    .order('fecha_movimiento', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};
export const fetchMovimientosBancariosByPeriod = fetchHistorial;

/**
 * Inserta un registro de auditoría.
 * @param {Object} auditLog - Datos del registro.
 * @returns {Promise<void>}
 */
export const insertAuditLog = async (auditLog) => {
  const { error } = await supabase
    .from('audit_log')
    .insert(auditLog);
  if (error) throw error;
};

/**
 * Elimina movimientos bancarios asociados a liquidaciones específicas.
 * @param {Array<number>} liqIds - IDs de liquidaciones.
 * @returns {Promise<void>}
 */
export const deleteMovimientosBancariosByLiquidations = async (liqIds) => {
  if (!liqIds || liqIds.length === 0) return;
  const { error } = await supabase
    .from('movimientos_bancarios')
    .delete()
    .in('liquidacion_id', liqIds);
  if (error) throw error;
};

/**
 * Elimina movimientos bancarios huérfanos dentro de un rango de fechas.
 * @param {string} startDate - Fecha inicio.
 * @param {string} endDate - Fecha fin.
 * @returns {Promise<void>}
 */
export const deleteMovimientosBancariosOrphans = async (startDate, endDate) => {
  const { error } = await supabase
    .from('movimientos_bancarios')
    .delete()
    .is('liquidacion_id', null)
    .gte('fecha_movimiento', startDate)
    .lte('fecha_movimiento', endDate);
  if (error) throw error;
};

/**
 * Resetea el abono y estado de pago de liquidaciones específicas.
 * @param {Array<number>} liqIds - IDs de liquidaciones.
 * @returns {Promise<void>}
 */
export const resetLiquidacionesGrupos = async (liqIds) => {
  if (!liqIds || liqIds.length === 0) return;
  const { error } = await supabase
    .from('liquidaciones_grupos')
    .update({
      monto_abonado: 0,
      estado_pago: 'PENDIENTE',
      updated_at: new Date().toISOString()
    })
    .in('liquidacion_id', liqIds);
  if (error) throw error;
};
