import { supabase } from '../supabaseClient';
import { calculateAuditLine } from '../utils/auditEngine';

/**
 * Fetch all lines and processed consumos for a given socio.
 * Returns { lines, consumos } where consumos are enriched via calculateAuditLine.
 */
export async function fetchSocioConsumosData(socioId) {
  const { data: lines, error: lErr } = await supabase
    .from('lineas')
    .select('*, planes_abonos(*), proveedores:proveedor_id(*), responsable:socios!lineas_socio_responsable_id_fkey(socio_id, nombre_completo)')
    .or(`socio_id.eq.${socioId},socio_responsable_id.eq.${socioId}`);
  if (lErr) throw lErr;

  if (!lines || lines.length === 0) {
    return { lines: [], consumos: [] };
  }

  const lineNumbers = lines.map(l => l.numero_linea);

  const { data: consumos, error: cErr } = await supabase
    .from('consumos_mensuales')
    .select('*')
    .in('numero_linea', lineNumbers)
    .order('periodo', { ascending: false });
  if (cErr) throw cErr;

  const { data: adics } = await supabase
    .from('adicionales')
    .select('*')
    .in('numero_linea', lineNumbers)
    .eq('activo', true);
  const adicsMap = {};
  (adics || []).forEach(ad => {
    if (!adicsMap[ad.numero_linea]) adicsMap[ad.numero_linea] = [];
    adicsMap[ad.numero_linea].push(ad);
  });

  const { data: histPrices } = await supabase
    .from('precios_auditoria_periodo')
    .select('*');
  const histPricesMap = {};
  (histPrices || []).forEach(hp => {
    if (!histPricesMap[hp.periodo]) histPricesMap[hp.periodo] = {};
    histPricesMap[hp.periodo][hp.plan_id] = hp;
  });

  const socioGroups = [...new Set(lines.map(l => l.numero_grupo).filter(Boolean))];
  let liqGroups = [];
  if (socioGroups.length > 0) {
    try {
      const { data: liqData } = await supabase
        .from('liquidaciones_grupos')
        .select('numero_grupo, periodo, estado_pago, proveedor_id, socio_id, socios:socio_id(nombre_completo)')
        .in('numero_grupo', socioGroups);
      liqGroups = liqData || [];
    } catch (err) {
      console.error("Error al obtener liquidaciones para el historial del socio:", err);
    }
  }

  const lineMap = {};
  lines.forEach(l => { lineMap[l.numero_linea] = l; });

  const processed = (consumos || []).map(c => {
    const lineInfo = lineMap[c.numero_linea];
    const planId = lineInfo?.plan_id || lineInfo?.planes_abonos?.plan_id;
    const hPrice = histPricesMap[c.periodo]?.[planId];
    
    const groupLiq = liqGroups.find(l => 
      l.numero_grupo === lineInfo?.numero_grupo && 
      l.periodo === c.periodo && 
      l.proveedor_id === c.proveedor_id
    );
    const realEstadoPago = groupLiq ? groupLiq.estado_pago : 'PENDIENTE';
    const liqSocioId = groupLiq ? groupLiq.socio_id : null;
    const liqSocioNombre = groupLiq?.socios?.nombre_completo || null;
    
    const auditInfo = calculateAuditLine(c, lineInfo, {
      providerId: c.proveedor_id,
      period: c.periodo,
      historicalPrice: hPrice,
      adicionales: adicsMap[c.numero_linea] || []
    });

    return {
      ...auditInfo,
      estado_pago: realEstadoPago,
      liq_socio_id: liqSocioId,
      liq_socio_nombre: liqSocioNombre,
      pagado_por_otro: liqSocioId && Number(liqSocioId) !== Number(socioId)
    };
  });

  return { lines, consumos: processed };
}

/**
 * Fetch all incidents linked to a socio's lines.
 * Returns an array of incident objects.
 */
export async function fetchSocioIncidentsData(socioId) {
  const { data: lineas } = await supabase.from('lineas').select('numero_linea').eq('socio_id', socioId);
  if (lineas?.length > 0) {
    const nums = lineas.map(l => l.numero_linea);
    const { data } = await supabase.from('incidentes_lineas').select('*').in('numero_linea', nums).order('fecha_creacion', { ascending: false });
    return data || [];
  }
  return [];
}

/* ─────────────────────────────────────────────
   SocioDatos — update socio + group reassignment
   (extracted from SocioDatos.jsx handleSubmit)
   ───────────────────────────────────────────── */

/**
 * Update a socio's personal data AND reassign their grupo.
 *
 * @param {number} socioId       - socios.socio_id
 * @param {Object} data          - All editable columns (nombre_completo, dni, cuit, etc.)
 *                                 May include `numero_grupo` which is handled separately.
 * @returns {Promise<void>}
 */
export async function upsertSocioDatos(socioId, data) {
  // Separate grupo from socio fields
  const { numero_grupo, ...socioFields } = data;

  // 1. Update the socios row
  const { error: updateErr } = await supabase
    .from('socios')
    .update(socioFields)
    .eq('socio_id', socioId);

  if (updateErr) throw updateErr;

  // 2. Handle grupo association
  if (numero_grupo !== undefined && numero_grupo !== null && numero_grupo !== '') {
    const grupoNum = parseInt(numero_grupo);

    // Ensure the grupo exists
    await supabase
      .from('grupos')
      .upsert({ numero_grupo: grupoNum }, { onConflict: 'numero_grupo' });

    // Remove from any previous groups
    await supabase
      .from('grupo_socio')
      .delete()
      .eq('socio_id', socioId);

    // Associate to the new group
    const { error: assocErr } = await supabase
      .from('grupo_socio')
      .insert({ numero_grupo: grupoNum, socio_id: socioId, es_titular: false });

    if (assocErr) throw assocErr;
  } else {
    // No grupo selected — remove any existing association
    await supabase
      .from('grupo_socio')
      .delete()
      .eq('socio_id', socioId);
  }
}

/* ─────────────────────────────────────────────
   SocioLineas — CRUD for líneas
   (extracted from SocioLineas.jsx)
   ───────────────────────────────────────────── */

/**
 * Fetch auxiliary data needed by the líneas form (plans + providers).
 * Returns { planes, proveedores }.
 */
export async function fetchAuxDataForLineas() {
  const [planesRes, provRes] = await Promise.all([
    supabase
      .from('planes_abonos')
      .select('plan_id, nombre_plan')
      .order('nombre_plan'),
    supabase
      .from('proveedores')
      .select('proveedor_id, nombre')
      .order('nombre'),
  ]);

  return {
    planes: planesRes.data || [],
    proveedores: provRes.data || [],
  };
}

/**
 * Insert a new línea for a socio.
 *
 * @param {Object} lineaData - { numero_linea, proveedor_id, plan_id, estado, socio_id, numero_grupo }
 * @returns {Promise<Object>}  The inserted row
 */
export async function insertSocioLinea(lineaData) {
  const { data, error } = await supabase
    .from('lineas')
    .insert([lineaData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update an existing línea (identified by its current numero_linea).
 *
 * @param {string} currentNumeroLinea  - PK of the line to update
 * @param {Object} updateData          - Fields to change (proveedor_id, plan_id, estado, etc.)
 */
export async function updateSocioLinea(currentNumeroLinea, updateData) {
  const { error } = await supabase
    .from('lineas')
    .update(updateData)
    .eq('numero_linea', currentNumeroLinea);

  if (error) throw error;
}

/**
 * Delete a línea by numero_linea.
 */
export async function deleteSocioLinea(numeroLinea) {
  const { error } = await supabase
    .from('lineas')
    .delete()
    .eq('numero_linea', numeroLinea);

  if (error) throw error;
}

/**
 * Fetch all lines in the system for association (search autocomplete).
 * Returns [{ numero_linea, proveedor_id, plan_id, estado, socio_id, socios(nombre_completo) }]
 */
export async function fetchAllLinesForAssociation() {
  const { data, error } = await supabase
    .from('lineas')
    .select(`
      numero_linea,
      proveedor_id,
      plan_id,
      estado,
      socio_id,
      descuento_esperado,
      socios:socios!lineas_socio_id_fkey(nombre_completo)
    `)
    .order('numero_linea');
  if (error) throw error;
  return data || [];
}

/**
 * Convenience: insert or update a línea depending on whether
 * `currentNumeroLinea` is provided or if the line number already exists.
 *
 * @param {Object}  lineaData          - All fields for the línea
 * @param {string}  [currentNumeroLinea] - If provided, performs UPDATE; otherwise checks db first
 * @returns {Promise<Object|void>}
 */
export async function upsertSocioLinea(lineaData, currentNumeroLinea) {
  if (currentNumeroLinea) {
    const updateData = { ...lineaData };
    delete updateData.numero_linea;
    await updateSocioLinea(currentNumeroLinea, updateData);
  } else {
    // Check if the typed line number already exists in the database
    const { data: existing, error } = await supabase
      .from('lineas')
      .select('numero_linea')
      .eq('numero_linea', lineaData.numero_linea)
      .maybeSingle();

    if (error) throw error;

    if (existing) {
      // Re-assign the existing line to this socio
      const updateData = { ...lineaData };
      delete updateData.numero_linea;
      await updateSocioLinea(lineaData.numero_linea, updateData);
    } else {
      // Insert as a brand new line
      return await insertSocioLinea(lineaData);
    }
  }
}
