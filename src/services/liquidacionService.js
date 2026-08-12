import { supabase } from '../supabaseClient';

/**
 * Genera liquidaciones para un periodo y proveedor dados.
 * Retorna { count } con la cantidad de liquidaciones generadas.
 */
export async function generarLiquidaciones({ lineasData, selectedPeriodo, selectedProveedor, globalDiscount, globalDiscountType }) {
  if (!lineasData || lineasData.length === 0) {
    throw new Error('No hay líneas auditeadas disponibles para liquidar en este período.');
  }

  const rawTotal = lineasData.reduce((acc, row) => acc + (row.calculado?.totalCobrar || 0), 0);
  if (rawTotal <= 0) {
    throw new Error('Imposible generar liquidación: el total calculado de la auditoría es $0.00. Verifique los datos antes de continuar.');
  }

  const discountVal = Number(globalDiscount) || 0;
  const discountAmount = globalDiscountType === '%' 
    ? rawTotal * (discountVal / 100) 
    : discountVal;
  
  const totalDiscountPct = rawTotal > 0 ? discountAmount / rawTotal : 0;

  // 1. Obtener titulares de grupo para asociar los socio_id correctos y su forma de pago
  const { data: titularData, error: titularError } = await supabase
    .from('grupo_socio')
    .select('numero_grupo, socio_id, socios(fpago)')
    .eq('es_titular', true);
  
  if (titularError) throw titularError;
  
  const titularMap = {};
  const titularFpagoMap = {};
  (titularData || []).forEach(gt => {
    titularMap[gt.numero_grupo] = gt.socio_id;
    const socioInfo = Array.isArray(gt.socios) ? gt.socios[0] : gt.socios;
    titularFpagoMap[gt.numero_grupo] = socioInfo?.fpago || null;
  });

  // 1b. Obtener los proveedores activos para cada grupo a partir de sus líneas activas para determinar cuál lleva la tasa de débito
  const { data: activeLines, error: activeLinesError } = await supabase
    .from('lineas')
    .select('proveedor_id, numero_grupo, socio_responsable_id, responsable:socios!lineas_socio_responsable_id_fkey(grupo_socio(numero_grupo))')
    .eq('estado', 'ACTIVA');

  if (activeLinesError) throw activeLinesError;

  const groupMinProviderMap = {};
  (activeLines || []).forEach(line => {
    let groupNum = line.numero_grupo;
    if (line.socio_responsable_id) {
      const respGroup = line.responsable?.grupo_socio?.[0]?.numero_grupo;
      groupNum = respGroup !== undefined ? respGroup : 0;
    }
    if (groupNum !== null && groupNum !== undefined) {
      if (groupMinProviderMap[groupNum] === undefined || line.proveedor_id < groupMinProviderMap[groupNum]) {
        groupMinProviderMap[groupNum] = line.proveedor_id;
      }
    }
  });

  const gruposMap = new Map();
  lineasData.forEach(row => { 
    let key = row.lineas.numero_grupo || 0;
    let payingSocioId = row.lineas.socio_id;

    if (row.lineas.socio_responsable_id) {
      payingSocioId = row.lineas.socio_responsable_id;
      const respGroup = row.lineas.responsable?.grupo_socio?.[0]?.numero_grupo;
      key = respGroup || 0;
    }

    if (!gruposMap.has(key)) {
      const socioId = key === 0 ? payingSocioId : (titularMap[key] || payingSocioId || null);
      
      // Obtener forma de pago del titular o de la línea
      let fpago = null;
      if (key !== 0) {
        fpago = titularFpagoMap[key];
      }
      if (!fpago) {
        const payingSocioInfo = row.lineas.socio_responsable_id 
          ? row.lineas.responsable 
          : (Array.isArray(row.lineas?.socios) ? row.lineas.socios[0] : row.lineas?.socios);
        fpago = payingSocioInfo?.fpago || null;
      }

      gruposMap.set(key, {
        periodo: selectedPeriodo,
        numero_grupo: key,
        socio_id: socioId,
        proveedor_id: parseInt(selectedProveedor),
        monto_total_facturado: 0,
        total_lineas_lote: 0,
        costo_operadora_neto: 0,
        beneficio_aunar: 0,
        estado_pago: 'PENDIENTE',
        fpago: fpago
      });
    }
    const g = gruposMap.get(key);
    const lineOriginalTotal = row.calculado.totalCobrar;
    const lineAdjustedTotal = Math.max(0, lineOriginalTotal * (1 - totalDiscountPct));
    
    g.monto_total_facturado += lineAdjustedTotal;
    g.total_lineas_lote += 1;
    // Costo operadora = lo que realmente paga la mutual al proveedor (ya con descuento aplicado)
    const costoRealLinea = Number(row.costo_abono_real || 0) + Number(row.excedentes || 0);
    g.costo_operadora_neto += costoRealLinea;
    // Margen de Aunar = lo que cobra al socio - lo que paga al proveedor
    g.beneficio_aunar += lineAdjustedTotal - costoRealLinea;
  });

  const inserts = Array.from(gruposMap.values()).map(l => {
    let finalMonto = l.monto_total_facturado;
    let finalBeneficio = l.beneficio_aunar;
    
    // Si la forma de pago es Débito Automático ('D') y tiene consumo real, agregar costo fijo
    // Para evitar duplicación, solo agregamos el costo al proveedor de menor ID para este grupo
    const minProv = groupMinProviderMap[l.numero_grupo];
    const shouldAddFee = l.fpago === 'D' && l.monto_total_facturado > 0 && (minProv === undefined || l.proveedor_id === minProv);
    
    if (shouldAddFee) {
      finalMonto += 12.12;
      finalBeneficio += 12.12;
    }

    return {
      periodo: l.periodo,
      numero_grupo: l.numero_grupo,
      socio_id: l.socio_id,
      proveedor_id: l.proveedor_id,
      monto_total_facturado: Math.round(finalMonto * 100) / 100,
      total_lineas_lote: l.total_lineas_lote,
      costo_operadora_neto: Math.round(l.costo_operadora_neto * 100) / 100,
      beneficio_aunar: Math.round(finalBeneficio * 100) / 100,
      estado_pago: l.estado_pago
    };
  });

  const consumoUpdates = lineasData.map(row => {
    const lineOriginalTotal = row.calculado.totalCobrar;
    let finalTotal = lineOriginalTotal;
    let extraDiscount = 0;

    if (totalDiscountPct > 0) {
      extraDiscount = Math.round((lineOriginalTotal * totalDiscountPct) * 100) / 100;
      finalTotal = Math.max(0, lineOriginalTotal - extraDiscount);
    }

    return {
      consumo_id: row.consumo_id,
      total_linea: finalTotal,
      bonificaciones: Number(row.bonificaciones || 0) + extraDiscount
    };
  });

  const { error: rpcError } = await supabase.rpc('generar_liquidaciones_lote', {
    p_periodo: selectedPeriodo,
    p_proveedor_id: parseInt(selectedProveedor, 10),
    p_liquidaciones: inserts,
    p_consumo_updates: consumoUpdates
  });

  if (rpcError) throw rpcError;

  // Avanzar las cuotas de descuentos y adicionales ÚNICAMENTE tras guardar y generar las liquidaciones auditadas del período
  try {
    await supabase.rpc('avanzar_cuotas_adicionales');
  } catch (errCuotas) {
    console.error('Error al avanzar cuotas de adicionales en liquidación:', errCuotas);
  }

  return { count: inserts.length };
}

/**
 * Elimina la liquidación de un periodo y proveedor, devolviendo consumos a estado PENDIENTE.
 */
export async function eliminarLiquidacion({ lineasData, selectedPeriodo, selectedProveedor }) {
  const consumoIds = lineasData.map(row => row.consumo_id);

  const { error: rpcError } = await supabase.rpc('eliminar_liquidacion_lote', {
    p_periodo: selectedPeriodo,
    p_proveedor_id: parseInt(selectedProveedor, 10),
    p_consumo_ids: consumoIds
  });

  if (rpcError) throw rpcError;
}

/**
 * Elimina TODOS los consumos cargados para un periodo y proveedor,
 * y también elimina las liquidaciones asociadas para evitar inconsistencias.
 */
export async function eliminarCargaMasiva({ selectedPeriodo, selectedProveedor }) {
  const { error: rpcError } = await supabase.rpc('eliminar_carga_masiva_lote', {
    p_periodo: selectedPeriodo,
    p_proveedor_id: parseInt(selectedProveedor, 10)
  });

  if (rpcError) throw rpcError;
}

/**
 * Obtiene la lista de todos los períodos únicos en liquidaciones_grupos.
 */
export const fetchUniquePeriods = async () => {
  const { data, error } = await supabase
    .from('liquidaciones_grupos')
    .select('periodo')
    .order('periodo', { ascending: false });
  if (error) throw error;
  return [...new Set(data?.map(d => d.periodo))].filter(Boolean);
};

/**
 * Obtiene liquidaciones paginadas con filtros
 */
export const fetchLiquidacionesPaginated = async ({
  periodo = null,
  estado = null,
  search = '',
}) => {
  let allData = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    let query = supabase
      .from('liquidaciones_grupos')
      .select(`
        liquidacion_id,
        numero_grupo,
        periodo,
        monto_total_facturado,
        monto_abonado,
        estado_pago,
        socio_id,
        proveedor_id,
        proveedores!proveedor_id(nombre),
        socios!socio_id(nombre_completo)
      `, { count: 'exact' });

    if (periodo && periodo !== 'Todos') {
      query = query.eq('periodo', periodo);
    }

    if (estado && estado !== 'Todos') {
      if (estado === 'DEUDOR') {
        query = query.neq('estado_pago', 'ABONADO');
      } else if (estado === 'AL_DIA') {
        query = query.eq('estado_pago', 'ABONADO');
      } else if (estado === 'MOROSO') {
        query = query.eq('estado_pago', 'PENDIENTE');
      }
    }

    query = query.order('periodo', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    allData.push(...(data || []));
    if (!data || data.length < limit) {
      break;
    }
    offset += limit;
  }

  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    allData = allData.filter(l =>
      String(l.numero_grupo).includes(s) ||
      (l.socios?.nombre_completo || '').toLowerCase().includes(s)
    );
  }

  return { data: allData, count: allData.length };
};

/**
 * Obtiene estadísticas globales (KPIs) sin paginación
 */
export const fetchLiquidacionesStats = async ({ periodo = null, estado = null }) => {
  let allData = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    let query = supabase
      .from('liquidaciones_grupos')
      .select('monto_total_facturado, monto_abonado, estado_pago, numero_grupo', { count: 'exact' });

    if (periodo && periodo !== 'Todos') {
      query = query.eq('periodo', periodo);
    }

    if (estado && estado !== 'Todos') {
      if (estado === 'DEUDOR') {
        query = query.neq('estado_pago', 'ABONADO');
      } else if (estado === 'AL_DIA') {
        query = query.eq('estado_pago', 'ABONADO');
      } else if (estado === 'MOROSO') {
        query = query.eq('estado_pago', 'PENDIENTE');
      }
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    allData.push(...(data || []));
    if (!data || data.length < limit) {
      break;
    }
    offset += limit;
  }

  const totalFacturado = allData.reduce((acc, l) => acc + (parseFloat(l.monto_total_facturado) || 0), 0);
  const totalAbonado = allData.reduce((acc, l) => acc + (parseFloat(l.monto_abonado) || 0), 0);
  const totalPendiente = totalFacturado - totalAbonado;
  const gruposPendientesMap = {};
  allData.forEach(l => {
    const g = l.numero_grupo;
    if (!gruposPendientesMap[g]) gruposPendientesMap[g] = { facturado: 0, abonado: 0 };
    gruposPendientesMap[g].facturado += parseFloat(l.monto_total_facturado) || 0;
    gruposPendientesMap[g].abonado += parseFloat(l.monto_abonado) || 0;
  });
  const gruposDeudores = Object.values(gruposPendientesMap).filter(g => (g.facturado - g.abonado) > 5).length;
  // Grupos únicos
  const uniqueGroups = new Set(allData.map(l => l.numero_grupo));
  const totalGrupos = uniqueGroups.size;

  return {
    totalFacturado,
    totalAbonado,
    totalPendiente,
    gruposDeudores,
    totalGrupos,
  };
};
