import { supabase } from '../supabaseClient';
import { calculateAuditLine, consolidateFixedServices } from '../utils/auditEngine';

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

/* ─────────────────────────────────────────────
   Shared audit-data fetcher used by both
   GestionPagos (fetchLineas) and
   Facturacion  (fetchSocioLiquidaciones)
   ───────────────────────────────────────────── */

/**
 * Core helper: given an array of consumos and their line numbers,
 * fetch the master líneas (with joins), adicionales and historical
 * prices, then run each consumo through the audit engine.
 *
 * @param {Array}  consumos     - Raw consumos_mensuales rows
 * @param {string} periodo      - "YYYY-MM"
 * @returns {{ processed: Array, adicionalesMap: Object, histMap: Object, lineMap: Object }}
 */
async function enrichConsumosWithAudit(consumos, periodo) {
  const lineNumbers = [...new Set(consumos.map((c) => c.numero_linea))];

  if (lineNumbers.length === 0) {
    return { processed: [], adicionalesMap: {}, histMap: {}, lineMap: {} };
  }

  // Fetch in batched chunks of 200 to avoid URL-length limits
  let allLineas = [];
  let allAdicionales = [];

  for (let i = 0; i < lineNumbers.length; i += 200) {
    const chunk = lineNumbers.slice(i, i + 200);

    const chunkLineas = await fetchAllPaginated(() =>
      supabase
        .from('lineas')
        .select('*, planes_abonos(*), socios:socios!lineas_socio_id_fkey(*), responsable:socios!lineas_socio_responsable_id_fkey(*), proveedores!lineas_proveedor_id_fkey(*)')
        .in('numero_linea', chunk)
    );
    allLineas = [...allLineas, ...chunkLineas];

    const { data: adicData } = await supabase
      .from('adicionales')
      .select('*')
      .eq('activo', true)
      .in('numero_linea', chunk);
    if (adicData) allAdicionales = [...allAdicionales, ...adicData];
  }

  // Build lookup maps
  const lineMap = {};
  allLineas.forEach((l) => { lineMap[l.numero_linea] = l; });

  const adicionalesMap = {};
  allAdicionales.forEach((ad) => {
    if (!adicionalesMap[ad.numero_linea]) adicionalesMap[ad.numero_linea] = [];
    adicionalesMap[ad.numero_linea].push(ad);
  });

  // Historical pricing matrix
  const { data: historicalPrices } = await supabase
    .from('precios_auditoria_periodo')
    .select('*')
    .eq('periodo', periodo);

  const histMap = {};
  (historicalPrices || []).forEach((h) => { histMap[h.plan_id] = h; });

  // Process each consumo through the audit engine
  const processed = consumos.map((consumo) => {
    const lineInfo = lineMap[consumo.numero_linea] || {
      numero_linea: consumo.numero_linea,
      proveedor_id: consumo.proveedor_id,
      estado: 'DESCONOCIDA',
    };
    const planId = lineInfo.plan_id || lineInfo.planes_abonos?.plan_id;
    const hPrice = histMap[planId];

    return calculateAuditLine(consumo, lineInfo, {
      providerId: consumo.proveedor_id || lineInfo.proveedor_id,
      period: periodo,
      historicalPrice: hPrice,
      adicionales: adicionalesMap[consumo.numero_linea] || [],
    });
  });

  // Consolidar cuentas técnicas de internet y teléfonos fijos
  const sampleProvId = consumos[0]?.proveedor_id || 1;
  const sampleProvName = sampleProvId === 1 ? 'claro' : sampleProvId === 2 ? 'movistar' : 'personal';
  const consolidatedProcessed = consolidateFixedServices(processed, sampleProvName);

  return { processed: consolidatedProcessed, adicionalesMap, histMap, lineMap };
}

/* ─────────────────────────────────────────────
   GestionPagos → fetchLineas
   ───────────────────────────────────────────── */

/**
 * Fetch and audit all consumos for a given period + provider.
 * This is the full extraction of GestionPagos.fetchLineas().
 *
 * @param {string} periodo      - "YYYY-MM"
 * @param {number} proveedorId  - FK to proveedores
 *
 * @returns {Promise<{
 *   lineasData: Array,
 *   adicionalesMap: Object,
 *   isPeriodoLiquidado: boolean,
 *   batchPlans: Array,
 *   defaultTarifaAunar: number,
 * }>}
 */
export async function fetchLineas(periodo, proveedorId) {
  // 1. All consumos for the period + provider
  const allConsumos = await fetchAllPaginated(() =>
    supabase
      .from('consumos_mensuales')
      .select('*')
      .eq('periodo', periodo)
      .eq('proveedor_id', proveedorId)
  );

  // Load exceptions dynamically
  const { data: expData } = await supabase.from('excepciones_facturacion').select('numero_linea');
  const excepciones = new Set((expData || []).map(e => e.numero_linea));

  // Filter exclusions
  const providerConsumos = (allConsumos || []).filter(
    (c) =>
      parseInt(c.proveedor_id) === proveedorId &&
      !excepciones.has(c.numero_linea)
  );

  // Fallback: Si no hay consumos guardados en DB para este período, traemos las líneas activas con sus planes
  if (providerConsumos.length === 0) {
    const masterLineas = await fetchAllPaginated(() =>
      supabase
        .from('lineas')
        .select('*, planes_abonos(*), socios:socios!lineas_socio_id_fkey(*), responsable:socios!lineas_socio_responsable_id_fkey(*), proveedores!lineas_proveedor_id_fkey(*)')
        .eq('proveedor_id', proveedorId)
        .eq('estado', 'ACTIVA')
    );

    const syntheticConsumos = (masterLineas || []).filter(l => !excepciones.has(l.numero_linea)).map(l => {
      const p = l.planes_abonos || {};
      return {
        periodo,
        numero_linea: l.numero_linea,
        proveedor_id: proveedorId,
        costo_abono_real: Number(p.precio || 0),
        excedentes: 0,
        bonificaciones: 0,
        total_linea: Number(p.precio || 0),
        estado_pago: 'PENDIENTE',
        precio_lista_audit: Number(p.precio || 0),
        tarifa_aunar_aplicada: Number(p.tarifa_aunar || 0),
        mutual_margen_aplicado: Number(p.mutual_margen_pct || 0),
        precio_lista_factura: Number(p.precio || 0)
      };
    });

    const { processed: synthProcessed, adicionalesMap: synthAdic } = await enrichConsumosWithAudit(
      syntheticConsumos,
      periodo
    );

    const { data: officialPlans } = await supabase.from('planes_abonos').select('*').eq('proveedor_id', proveedorId);
    let batchPlans = (officialPlans || []).map(p => ({
      id: p.plan_id,
      nombre: p.nombre_plan,
      precio: Number(p.precio || 0),
      tarifa: Number(p.tarifa_aunar || 0)
    }));
    let defaultTarifaAunar = batchPlans[0]?.tarifa || (proveedorId === 1 ? 7585 : 6500);

    return {
      lineasData: synthProcessed,
      adicionalesMap: synthAdic,
      isPeriodoLiquidado: false,
      batchPlans,
      defaultTarifaAunar
    };
  }

  // 2. Enrich with audit data
  const { processed, adicionalesMap, histMap } = await enrichConsumosWithAudit(
    providerConsumos,
    periodo
  );

  // 3. Check if period is already liquidated
  const { count: liqCount } = await supabase
    .from('liquidaciones_grupos')
    .select('*', { count: 'exact', head: true })
    .eq('periodo', periodo)
    .eq('proveedor_id', proveedorId);

  const isPeriodoLiquidado = (liqCount || 0) > 0;

  // 4. Anomaly detection — mode-based price deviation
  const planFrequencies = {};
  processed.forEach((row) => {
    const planId = row.plan_id;
    if (!planId) return;
    if (!planFrequencies[planId]) planFrequencies[planId] = {};
    const price = row.baseAb;
    planFrequencies[planId][price] = (planFrequencies[planId][price] || 0) + 1;
  });

  const planStandardPrice = {};
  Object.entries(planFrequencies).forEach(([planId, priceMap]) => {
    const entries = Object.entries(priceMap);
    const totalLines = entries.reduce((s, [, c]) => s + c, 0);
    if (totalLines >= 3) {
      const mode = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
      planStandardPrice[planId] = Number(mode[0]);
    }
  });

  const finalProcessed = processed.map((row) => {
    const standard = planStandardPrice[row.plan_id];
    if (standard && row.baseAb > standard * 1.5) {
      return { ...row, portabilityWarning: true, standardPrice: standard };
    }
    return row;
  });

  // 5. Load official plans for the cost-matrix / BatchModal
  const { data: officialPlans } = await supabase
    .from('planes_abonos')
    .select('*')
    .eq('proveedor_id', proveedorId);

  let batchPlans = [];
  let defaultTarifaAunar = proveedorId === 3 ? 7585 : 6500;

  if (officialPlans) {
    batchPlans = officialPlans.map((p) => {
      const hist = histMap[p.plan_id];
      return {
        id: p.plan_id,
        nombre: p.nombre_plan,
        precio:
          hist?.precio_lista !== undefined && hist?.precio_lista !== null
            ? Number(hist.precio_lista)
            : Number(p.precio || 0),
        tarifa:
          hist?.tarifa_aunar !== undefined && hist?.tarifa_aunar !== null
            ? Number(hist.tarifa_aunar)
            : Number(p.tarifa_aunar || 0),
      };
    });
    if (batchPlans.length > 0) {
      defaultTarifaAunar = batchPlans[0].tarifa;
    }
  }

  return {
    lineasData: finalProcessed,
    adicionalesMap,
    isPeriodoLiquidado,
    batchPlans,
    defaultTarifaAunar,
  };
}

/* ─────────────────────────────────────────────
   Facturacion → fetchSocioLiquidaciones
   ───────────────────────────────────────────── */

/**
 * Provider name → id mapping (mirrored from the component constant).
 */
const PROV_IDS = { CLARO: 1, MOVISTAR: 2, PERSONAL: 3 };

/**
 * Fetch liquidated consumos for a period, optionally filtered by
 * provider, enriched with audit data.
 *
 * @param {string}  periodo      - "YYYY-MM"
 * @param {string}  [filterProv] - "CLARO" | "MOVISTAR" | "PERSONAL" (optional)
 *
 * @returns {Promise<Array>}     - Audit-processed rows
 */
export async function fetchSocioLiquidaciones(periodo, filterProv) {
  const rawConsumos = await fetchAllPaginated(() => {
    let query = supabase
      .from('consumos_mensuales')
      .select('*')
      .eq('periodo', periodo);

    if (filterProv) {
      const provId = PROV_IDS[filterProv];
      if (provId) {
        query = query.eq('proveedor_id', provId);
      }
    }
    return query;
  });

  // Load exceptions dynamically
  const { data: expData } = await supabase.from('excepciones_facturacion').select('numero_linea');
  const excepciones = new Set((expData || []).map(e => e.numero_linea));

  // Exclusions
  const consumos = (rawConsumos || []).filter(
    (c) => !excepciones.has(c.numero_linea)
  );

  if (consumos.length === 0) return [];

  const { processed } = await enrichConsumosWithAudit(consumos, periodo);
  return processed;
}

/**
 * Updates a consumo only if the related period is not closed.
 * @param {number} consumoId 
 * @param {string} periodo 
 * @param {number} proveedorId 
 * @param {object} updates 
 */
export async function updateConsumoMensual(consumoId, periodo, proveedorId, updates) {
  const { count, error: countErr } = await supabase
    .from('liquidaciones_grupos')
    .select('*', { count: 'exact', head: true })
    .eq('periodo', periodo)
    .eq('proveedor_id', proveedorId)
    .in('estado_pago', ['LIQUIDADO', 'PAGADO']);
    
  if (countErr) throw countErr;
  
  if (count > 0) {
    throw new Error('Cannot modify records of a closed settlement');
  }

  const { error } = await supabase
    .from('consumos_mensuales')
    .update(updates)
    .eq('consumo_id', consumoId);

  if (error) throw error;
}
