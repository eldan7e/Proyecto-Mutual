import { supabase } from '../supabaseClient';

/* ─────────────────────────────────────────────
   READ helpers used by CargaManual on mount /
   on period / provider change
   ───────────────────────────────────────────── */

/**
 * Fetch pricing snapshot for a given period.
 * Returns a Map<plan_id, precio_lista>.
 */
export async function fetchPeriodPrices(periodo) {
  const { data, error } = await supabase
    .from('precios_auditoria_periodo')
    .select('*')
    .eq('periodo', periodo);

  if (error) throw error;

  const map = new Map();
  (data || []).forEach((row) => map.set(row.plan_id, row.precio_lista));
  return map;
}

/**
 * Fetch all líneas with joined socios + planes_abonos,
 * and the full socios list for manual assignment.
 * Returns { dbLinesMap, allSocios }.
 */
export async function fetchLineasAndSocios() {
  const [lineasRes, sociosRes] = await Promise.all([
    supabase
      .from('lineas')
      .select(`
        numero_linea,
        proveedor_id,
        plan_id,
        descuento_esperado,
        cargo_equipo,
        numero_grupo,
        socios(nombre_completo, socio_id, desc_adicionales, cta_numero, total_cuotas),
        planes_abonos(plan_id, precio, nombre_plan, gb_incluidos, tarifa_aunar, mutual_margen_pct, descuento_operadora_pct)
      `),
    supabase
      .from('socios')
      .select('socio_id, nombre_completo, grupo_socio(numero_grupo)')
      .order('nombre_completo'),
  ]);

  if (lineasRes.error) throw lineasRes.error;
  if (sociosRes.error) throw sociosRes.error;

  // Build a normalised phone → details map
  const dbLinesMap = new Map();
  (lineasRes.data || []).forEach((l) => {
    const norm = l.numero_linea?.replace(/\D/g, '');
    if (norm) dbLinesMap.set(norm, l);
  });

  return { dbLinesMap, allSocios: sociosRes.data || [] };
}

/**
 * Fetch previous-month consumos for comparison.
 * Returns the raw consumos rows for the latest previous period.
 */
export async function fetchPreviousConsumos(periodo, proveedorId) {
  // Find latest previous period
  const { data: latestPeriods, error: err1 } = await supabase
    .from('consumos_mensuales')
    .select('periodo')
    .eq('proveedor_id', proveedorId)
    .lt('periodo', periodo)
    .order('periodo', { ascending: false })
    .limit(1);

  if (err1) throw err1;
  if (!latestPeriods || latestPeriods.length === 0) return [];

  const prevPeriod = latestPeriods[0].periodo;

  const { data, error: err2 } = await supabase
    .from('consumos_mensuales')
    .select('*, lineas(plan_id, planes_abonos(gb_incluidos, tarifa_aunar))')
    .eq('periodo', prevPeriod)
    .eq('proveedor_id', proveedorId);

  if (err2) throw err2;
  return data || [];
}

/**
 * Fetch the list of already-loaded periods for a provider.
 * Returns an array of period strings.
 */
export async function fetchExistingPeriods(proveedorId) {
  const { data, error } = await supabase
    .from('consumos_mensuales')
    .select('periodo')
    .eq('proveedor_id', proveedorId);

  if (error) throw error;
  return [...new Set((data || []).map((d) => d.periodo))];
}

/* ─────────────────────────────────────────────
   WRITE — main save transaction
   (extracted from CargaManual.handleSave)
   ───────────────────────────────────────────── */

/**
 * Persist a parsed invoice file into the database.
 *
 * @param {Object}   params
 * @param {string}   params.periodo          - "YYYY-MM"
 * @param {number}   params.proveedorId      - FK to proveedores
 * @param {string}   params.proveedorName    - Human-readable provider name (for audit log)
 * @param {Array}    params.fileData          - Parsed rows from the uploaded file
 * @param {Function} [params.onProgress]      - Optional (current, total, status) callback
 *
 * @returns {Promise<{ savedCount: number }>}
 */
export async function saveFacturacion({
  periodo,
  proveedorId,
  proveedorName,
  fileData,
  onProgress,
  sugTarifa,
  planIncreases,
}) {
  const progress = onProgress || (() => {});

  // Step 0 — Ensure "grupo 0" exists
  progress(0, fileData.length, 'Preparando datos...');
  await supabase
    .from('grupos')
    .upsert({ numero_grupo: 0 }, { onConflict: 'numero_grupo' });

  // Step 1 — Fetch plans for auto-assignment
  const { data: dbPlanes, error: planesErr } = await supabase
    .from('planes_abonos')
    .select('*')
    .eq('proveedor_id', proveedorId);

  if (planesErr) throw planesErr;

  // Step 2 — Fetch existing líneas that match uploaded phone numbers
  const allPhoneNumbers = fileData.map((r) =>
    r.linea?.toString().replace(/\D/g, '')
  ).filter(Boolean);

  const { data: existingInDb, error: existErr } = await supabase
    .from('lineas')
    .select('*')
    .in('numero_linea', allPhoneNumbers);

  if (existErr) throw existErr;

  const existMap = new Map();
  (existingInDb || []).forEach((l) => existMap.set(l.numero_linea, l));

  // Step 2b — Build & upsert líneas in chunks of 50
  progress(0, fileData.length, 'Guardando líneas...');

  const lineasPayload = fileData.map((row) => {
    const num = row.linea?.toString().replace(/\D/g, '');
    const existing = existMap.get(num);

    // Auto-match plan by name or closest price
    let matchedPlanId = existing?.plan_id || null;
    if (!matchedPlanId && row.plan && dbPlanes) {
      const byName = dbPlanes.find(
        (p) =>
          p.nombre_plan?.toLowerCase() === row.plan?.toLowerCase()
      );
      if (byName) {
        matchedPlanId = byName.plan_id;
      } else if (row.abono) {
        const closest = dbPlanes.reduce((prev, curr) =>
          Math.abs((curr.precio_oficial || curr.precio || 0) - row.abono) <
          Math.abs((prev.precio_oficial || prev.precio || 0) - row.abono)
            ? curr
            : prev
        , dbPlanes[0]);
        if (closest) matchedPlanId = closest.plan_id;
      }
    }

    return {
      numero_linea: num,
      socio_id: existing?.socio_id || row.socioId || null,
      numero_grupo: existing?.numero_grupo || row.numero_grupo || 0,
      proveedor_id: proveedorId,
      plan_id: matchedPlanId,
    };
  });

  const CHUNK = 50;
  for (let i = 0; i < lineasPayload.length; i += CHUNK) {
    const chunk = lineasPayload.slice(i, i + CHUNK);
    const { error: lineErr } = await supabase
      .from('lineas')
      .upsert(chunk, { onConflict: 'numero_linea' });
    if (lineErr) throw lineErr;
  }

  // Step 3a — Delete previous consumos for same period + lines
  progress(0, fileData.length, 'Limpiando datos anteriores...');
  await supabase
    .from('consumos_mensuales')
    .delete()
    .eq('periodo', periodo)
    .in('numero_linea', allPhoneNumbers);

  // Step 3b — Insert new consumos in parallel chunks of 50
  progress(0, fileData.length, 'Guardando consumos...');

  // Re-fetch period prices for audit columns
  const periodPrices = await fetchPeriodPrices(periodo);

  const consumosPayload = fileData.map((row) => {
    const num = row.linea?.toString().replace(/\D/g, '');
    const lineaObj = lineasPayload.find((l) => l.numero_linea === num);
    const planId = lineaObj?.plan_id;
    const planPrice = periodPrices.get(planId) ?? 0;

    // Find tarifa_aunar & margin from plans
    const dbPlan = (dbPlanes || []).find((p) => p.plan_id === planId);
    const tarifaAunar = (sugTarifa !== undefined && sugTarifa !== null && sugTarifa > 0)
      ? sugTarifa
      : (dbPlan?.tarifa_aunar ?? 0);
    const planMargin = dbPlan?.mutual_margen_pct ?? 0;

    return {
      periodo,
      numero_linea: num,
      proveedor_id: proveedorId,
      costo_abono_real: row.abono,
      excedentes: row.excedentes,
      bonificaciones: 0,
      total_linea: (row.abono || 0) + (row.excedentes || 0),
      estado_pago: 'PENDIENTE',
      precio_lista_audit: planPrice,
      tarifa_aunar_aplicada: tarifaAunar,
      mutual_margen_aplicado: planMargin,
    };
  });

  const consumoChunks = [];
  for (let i = 0; i < consumosPayload.length; i += CHUNK) {
    consumoChunks.push(consumosPayload.slice(i, i + CHUNK));
  }
  await Promise.all(
    consumoChunks.map((chunk) =>
      supabase
        .from('consumos_mensuales')
        .insert(chunk)
        .then(({ error }) => {
          if (error) throw error;
        })
    )
  );

  // Step 3.5 — Sincronizar tarifa aunar y precios promedio en el catálogo e histórico
  if (sugTarifa > 0) {
    progress(fileData.length, fileData.length, 'Sincronizando tarifas de operadora...');
    const { error: errTarifa } = await supabase
      .from('planes_abonos')
      .update({ tarifa_aunar: sugTarifa })
      .eq('proveedor_id', proveedorId);
    if (errTarifa) console.error("Error al actualizar tarifa aunar en catálogo:", errTarifa);
  }

  if (planIncreases && planIncreases.length > 0) {
    progress(fileData.length, fileData.length, 'Sincronizando precios de planes...');
    for (const p of planIncreases) {
      if (p.plan && p.plan !== 'No registrado' && p.avgCurrAbono > 0) {
        const dbPlan = (dbPlanes || []).find(dp => dp.nombre_plan?.toLowerCase() === p.plan?.toLowerCase());
        if (dbPlan) {
          const avgPrice = Math.round(p.avgCurrAbono * 100) / 100;
          // 1. Actualizar catálogo de planes
          const { error: errPlan } = await supabase
            .from('planes_abonos')
            .update({ precio: avgPrice })
            .eq('plan_id', dbPlan.plan_id);
          if (errPlan) console.error(`Error al actualizar plan ${p.plan} en catálogo:`, errPlan);

          // 2. Persistir en tabla precios_auditoria_periodo
          const { error: errAuditoria } = await supabase
            .from('precios_auditoria_periodo')
            .upsert({
              periodo,
              plan_id: dbPlan.plan_id,
              precio_lista: avgPrice,
              tarifa_aunar: sugTarifa || dbPlan.tarifa_aunar || 0
            }, { onConflict: 'periodo,plan_id' });
          if (errAuditoria) console.error(`Error al actualizar histórico de ${p.plan}:`, errAuditoria);
        }
      }
    }
  }

  // Step 4 — Audit log entry
  await supabase.from('audit_log').insert({
    tipo_evento: 'CARGA_FACTURA',
    descripcion: `EXITO: Factura ${proveedorName.toUpperCase()} (${periodo}) - ${fileData.length} líneas guardadas.`,
  });

  progress(fileData.length, fileData.length, '¡Guardado completo!');

  return { savedCount: fileData.length };
}

/* ─────────────────────────────────────────────
   WRITE — Insert an incident / reclamo
   ───────────────────────────────────────────── */

/**
 * Insert an incident (reclamo) for a given phone line.
 */
export async function insertIncidente({
  numero_linea,
  tipo_incidente,
  descripcion_problema,
  monto_a_reclamar,
  monto_auditado,
  monto_facturado,
}) {
  const { error } = await supabase.from('incidentes_lineas').insert({
    numero_linea,
    tipo_incidente,
    descripcion_problema,
    monto_a_reclamar,
    monto_auditado: monto_auditado || 0,
    monto_facturado: monto_facturado || 0,
    estado: 'Abierto',
  });

  if (error) throw error;
}

/**
 * Obtiene liquidaciones filtradas por periodo y proveedor
 */
export const fetchLiquidaciones = async (periodo, proveedor) => {
  let query = supabase
    .from('liquidaciones_grupos')
    .select(`
      *,
      grupos(alias_grupo, numero_grupo),
      socios(nombre_completo, nro_socio, fpago),
      proveedores!proveedor_id(*)
    `)
    .order('periodo', { ascending: false })
    .range(0, 4000); // Evitar truncado predeterminado de 1000 filas en Supabase

  if (periodo) query = query.eq('periodo', periodo);
  if (proveedor) {
    const provMap = { 'CLARO': 1, 'MOVISTAR': 2, 'PERSONAL': 3 };
    const provId = provMap[proveedor];
    if (provId) query = query.eq('proveedor_id', provId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
};

/**
 * Elimina una liquidación por su ID
 */
export const deleteLiquidacion = async (id) => {
  const { error } = await supabase
    .from('liquidaciones_grupos')
    .delete()
    .eq('liquidacion_id', id);
  if (error) throw error;
  return true;
};

/**
 * Elimina un lote completo de consumos y liquidaciones de un periodo y proveedor
 */
export const deleteBatch = async (periodo, proveedorId) => {
  const { error: err1 } = await supabase
    .from('consumos_mensuales')
    .delete()
    .eq('periodo', periodo)
    .eq('proveedor_id', proveedorId);
  if (err1) throw err1;

  const { error: err2 } = await supabase
    .from('liquidaciones_grupos')
    .delete()
    .eq('periodo', periodo)
    .eq('proveedor_id', proveedorId);
  if (err2) throw err2;

  return true;
};
