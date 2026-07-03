import { supabase } from '../supabaseClient';

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
      grupo_socio(socio_id, es_titular, socios(nombre_completo, email, nro_socio)),
      lineas(numero_linea, proveedor_id, proveedores!lineas_proveedor_id_fkey(nombre))
    `)
    .order('numero_grupo');

  if (search) {
    if (!isNaN(search)) {
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
    const titular = titularEntry?.socios?.nombre_completo || '—';
    const totalSocios = (g.grupo_socio || []).length;
    const totalLineas = (g.lineas || []).length;
    const provIds = (g.lineas || []).map((l) => l.proveedor_id);

    const integrantes = (g.grupo_socio || [])
      .map((gs) => ({
        socio_id: gs.socio_id,
        nombre_completo: gs.socios?.nombre_completo,
        email: gs.socios?.email,
        nro_socio: gs.socios?.nro_socio,
        es_titular: gs.es_titular,
      }))
      .sort((a, b) =>
        (a.nombre_completo || '').localeCompare(b.nombre_completo || '')
      );

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
  const { error } = await supabase.from('grupos').insert([grupoData]);
  if (error) throw error;
}

/**
 * Update an existing grupo identified by numero_grupo.
 *
 * @param {number} numeroGrupo  - Primary key
 * @param {Object} grupoData    - Fields to update
 */
export async function updateGrupo(numeroGrupo, grupoData) {
  const { error } = await supabase
    .from('grupos')
    .update(grupoData)
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
 * Establishes a partner as the titular (responsible/leader) of a group.
 * If the partner is not currently in the group, they are added.
 * All other group members are set to es_titular = false.
 *
 * @param {number} numeroGrupo
 * @param {number} socioId
 */
export async function setGrupoTitular(numeroGrupo, socioId) {
  // 1. Set all members of this group to es_titular = false
  const { error: clearErr } = await supabase
    .from('grupo_socio')
    .update({ es_titular: false })
    .eq('numero_grupo', numeroGrupo);
    
  if (clearErr) throw clearErr;

  // 2. Check if the partner is already a member of the group
  const { data: existing, error: checkErr } = await supabase
    .from('grupo_socio')
    .select('socio_id')
    .eq('numero_grupo', numeroGrupo)
    .eq('socio_id', socioId)
    .maybeSingle();

  if (checkErr) throw checkErr;

  if (existing) {
    // Update existing member to titular
    const { error: updateErr } = await supabase
      .from('grupo_socio')
      .update({ es_titular: true })
      .eq('numero_grupo', numeroGrupo)
      .eq('socio_id', socioId);
      
    if (updateErr) throw updateErr;
  } else {
    // Insert new member as titular
    const { error: insertErr } = await supabase
      .from('grupo_socio')
      .insert({ numero_grupo: numeroGrupo, socio_id: socioId, es_titular: true });
      
    if (insertErr) throw insertErr;
  }
}
