import { supabase } from '../supabaseClient';
import { registrarAuditoria } from '../utils/auditLogger';

/* ─────────────────────────────────────────────
   Grupos — full CRUD + proveedores lookup
   ───────────────────────────────────────────── */

/**
 * Fetch all grupos with nested socios & líneas data,
 * optionally filtered by search term and/or provider.
 *
 * @param {Object}  [filters]
 * @param {string}  [filters.search]             - Numeric → eq(numero_grupo), else ilike(alias_grupo)
 * @param {number}  [filters.selectedProvider]    - Filter client-side by proveedor_id
 *
 * @returns {Promise<{ grupos: Array, proveedores: Array }>}
 */
export async function fetchGrupos({ search, selectedProvider } = {}) {
  let query = supabase
    .from('grupos')
    .select(`
      *,
      grupo_socio(socio_id, es_titular, socios(nombre_completo, email, nro_socio, dni)),
      lineas(numero_linea, proveedor_id, estado, planes_abonos(nombre_plan), proveedores!lineas_proveedor_id_fkey(nombre))
    `)
    .order('numero_grupo');

  if (search) {
    if (!isNaN(search) && search.trim() !== '') {
      query = query.eq('numero_grupo', parseInt(search));
    } else {
      query = query.ilike('alias_grupo', `%${search}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  // Also fetch the provider catalogue for the filter dropdown
  const { data: provData } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre');

  // Post-process: extract titular, counts, provider IDs
  let processed = (data || []).map((g) => {
    const titularEntry = (g.grupo_socio || []).find((gs) => gs.es_titular);
    const titular = titularEntry?.socios?.nombre_completo || null;
    const totalSocios = (g.grupo_socio || []).length;
    const totalLineas = (g.lineas || []).length;
    const provIds = (g.lineas || []).map((l) => l.proveedor_id);

    const integrantes = (g.grupo_socio || [])
      .map((gs) => ({
        socio_id: gs.socio_id,
        nombre_completo: gs.socios?.nombre_completo,
        email: gs.socios?.email,
        nro_socio: gs.socios?.nro_socio,
        dni: gs.socios?.dni,
        es_titular: gs.es_titular,
      }))
      .sort((a, b) => {
        // Titular siempre primero
        if (a.es_titular && !b.es_titular) return -1;
        if (!a.es_titular && b.es_titular) return 1;
        return (a.nombre_completo || '').localeCompare(b.nombre_completo || '');
      });

    return {
      ...g,
      titular,
      total_socios: totalSocios,
      total_lineas: totalLineas,
      provIds,
      integrantes,
      lineasDetalle: g.lineas || [],
    };
  });

  if (selectedProvider) {
    processed = processed.filter((g) =>
      g.provIds.includes(parseInt(selectedProvider))
    );
  }

  return { grupos: processed, proveedores: provData || [] };
}

/**
 * Insert a new grupo.
 *
 * @param {Object} grupoData - { numero_grupo, alias_grupo, email_facturacion, emails_integrantes }
 */
export async function insertGrupo(grupoData) {
  // Limpiar campos vacíos para no insertar strings vacíos
  const clean = {};
  for (const [k, v] of Object.entries(grupoData)) {
    if (v !== '' && v !== null && v !== undefined) clean[k] = v;
  }
  const { error } = await supabase.from('grupos').insert([clean]);
  if (error) throw error;
}

/**
 * Update an existing grupo identified by numero_grupo.
 *
 * @param {number} numeroGrupo  - Primary key
 * @param {Object} grupoData    - Fields to update
 */
export async function updateGrupo(numeroGrupo, grupoData) {
  // Limpiar campos vacíos
  const clean = {};
  for (const [k, v] of Object.entries(grupoData)) {
    if (k === 'numero_grupo') continue; // no actualizar PK
    clean[k] = v === '' ? null : v;
  }
  const { error } = await supabase
    .from('grupos')
    .update(clean)
    .eq('numero_grupo', numeroGrupo);
  if (error) throw error;
}

/**
 * Delete a grupo by numero_grupo.
 *
 * @param {number} numeroGrupo
 */
export async function deleteGrupo(numeroGrupo) {
  const { error } = await supabase
    .from('grupos')
    .delete()
    .eq('numero_grupo', numeroGrupo);
  if (error) throw error;
}

/**
 * Agrega un socio al grupo (sin hacerlo titular).
 *
 * @param {number} numeroGrupo
 * @param {number} socioId
 */
export async function addIntegranteToGrupo(numeroGrupo, socioId) {
  // Verificar si ya es integrante
  const { data: existing, error: checkErr } = await supabase
    .from('grupo_socio')
    .select('socio_id')
    .eq('numero_grupo', numeroGrupo)
    .eq('socio_id', socioId)
    .maybeSingle();

  if (checkErr) throw checkErr;
  if (existing) throw new Error('Este socio ya es integrante del grupo.');

  const { error } = await supabase
    .from('grupo_socio')
    .insert({ numero_grupo: numeroGrupo, socio_id: socioId, es_titular: false });
  if (error) throw error;
}

/**
 * Quita un socio del grupo.
 * No permite quitar al titular.
 *
 * @param {number} numeroGrupo
 * @param {number} socioId
 * @param {boolean} esTitular
 */
export async function removeIntegranteFromGrupo(numeroGrupo, socioId, esTitular = false) {
  if (esTitular) throw new Error('No podés quitar al titular del grupo. Primero asigná otro titular.');

  const { error } = await supabase
    .from('grupo_socio')
    .delete()
    .eq('numero_grupo', numeroGrupo)
    .eq('socio_id', socioId);
  if (error) throw error;
}

/**
 * Establece un socio como el titular (responsable/líder) del grupo.
 * Si el socio no es integrante, se agrega al grupo primero.
 * Todos los demás miembros quedan con es_titular = false.
 *
 * @param {number} numeroGrupo
 * @param {number} socioId
 */
export async function setGrupoTitular(numeroGrupo, socioId) {
  // 1. Quitar titular actual
  const { error: clearErr } = await supabase
    .from('grupo_socio')
    .update({ es_titular: false })
    .eq('numero_grupo', numeroGrupo);

  if (clearErr) throw clearErr;

  // 2. Verificar si el socio ya es integrante
  const { data: existing, error: checkErr } = await supabase
    .from('grupo_socio')
    .select('socio_id')
    .eq('numero_grupo', numeroGrupo)
    .eq('socio_id', socioId)
    .maybeSingle();

  if (checkErr) throw checkErr;

  if (existing) {
    // Actualizar miembro existente a titular
    const { error: updateErr } = await supabase
      .from('grupo_socio')
      .update({ es_titular: true })
      .eq('numero_grupo', numeroGrupo)
      .eq('socio_id', socioId);

    if (updateErr) throw updateErr;
  } else {
    // Insertar nuevo miembro como titular
    const { error: insertErr } = await supabase
      .from('grupo_socio')
      .insert({ numero_grupo: numeroGrupo, socio_id: socioId, es_titular: true });

    if (insertErr) throw insertErr;
  }

  // 3. Sincronizar liquidaciones_grupos para que el cambio de titular se refleje en Facturas y Contaduría
  try {
    await supabase
      .from('liquidaciones_grupos')
      .update({ socio_id: socioId })
      .eq('numero_grupo', numeroGrupo);
  } catch { /* no bloqueante */ }
}

/**
 * Busca socios por nombre o DNI para el autocomplete.
 *
 * @param {string} q - Término de búsqueda
 * @param {number} [limit=8]
 */
export async function searchSocios(q, limit = 8) {
  const { data, error } = await supabase
    .from('socios')
    .select('socio_id, nombre_completo, nro_socio, dni, email')
    .or(`nombre_completo.ilike.%${q}%,dni.ilike.%${q}%,nro_socio.ilike.%${q}%`)
    .order('nombre_completo')
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * Carga el historial de liquidaciones y pagos de un grupo.
 *
 * @param {number} numeroGrupo
 */
export async function fetchLiquidacionesGrupo(numeroGrupo) {
  const { data, error } = await supabase
    .from('liquidaciones_grupos')
    .select(`
      liquidacion_id,
      periodo,
      monto_total_facturado,
      monto_abonado,
      estado_pago,
      proveedores(nombre),
      movimientos_bancarios(
        movimiento_id,
        fecha_movimiento,
        monto,
        banco,
        socios(nombre_completo)
      )
    `)
    .eq('numero_grupo', numeroGrupo)
    .order('periodo', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Actualiza el estado de una línea individual perteneciente a un grupo ('ACTIVA', 'SUSPENDIDA', 'BAJA').
 * Registra auditoría automática.
 *
 * @param {string} numeroLinea
 * @param {string} nuevoEstado
 * @param {number} [numeroGrupo]
 */
export async function updateLineaEstadoGrupo(numeroLinea, nuevoEstado, numeroGrupo = null) {
  const cleanTel = String(numeroLinea).replace(/\D/g, '');
  const { error } = await supabase
    .from('lineas')
    .update({ estado: nuevoEstado })
    .eq('numero_linea', cleanTel);

  if (error) throw error;

  await registrarAuditoria({
    tipo_evento: 'CAMBIO_ESTADO_LINEA',
    descripcion: `Línea ${cleanTel} cambió a estado ${String(nuevoEstado).toUpperCase()}${numeroGrupo ? ` en Grupo #${numeroGrupo}` : ''}`,
    numero_linea: cleanTel,
    numero_grupo: numeroGrupo || null
  });
}

/**
 * Actualiza en lote el estado de todas las líneas de un grupo ('ACTIVA' o 'SUSPENDIDA').
 * Registra auditoría automática.
 *
 * @param {number} numeroGrupo
 * @param {string} nuevoEstado
 */
export async function updateTodasLineasGrupoEstado(numeroGrupo, nuevoEstado) {
  const { data, error } = await supabase
    .from('lineas')
    .update({ estado: nuevoEstado })
    .eq('numero_grupo', numeroGrupo)
    .select('numero_linea');

  if (error) throw error;

  await registrarAuditoria({
    tipo_evento: 'CAMBIO_ESTADO_GRUPO_LINEAS',
    descripcion: `Se cambiaron a estado ${String(nuevoEstado).toUpperCase()} todas las líneas (${data?.length || 0}) del Grupo #${numeroGrupo}`,
    numero_grupo: numeroGrupo
  });

  return data;
}

