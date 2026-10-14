import { supabase } from '../supabaseClient';

// ========================================
// CAJA DIARIA CRUD (tabla: caja_diaria)
// ========================================

/**
 * Fetch all caja_diaria entries, optionally filtered by date range.
 * @param {{ fechaDesde?: string, fechaHasta?: string }} filters
 */
export async function fetchMovimientosCaja({ fechaDesde, fechaHasta } = {}) {
  let query = supabase
    .from('caja_diaria')
    .select('*')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });

  if (fechaDesde) query = query.gte('fecha', fechaDesde);
  if (fechaHasta) query = query.lte('fecha', fechaHasta);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Insert a new caja_diaria movement.
 */
export async function insertMovimientoCaja({ fecha, detalle, observacion, importe }) {
  const { data, error } = await supabase
    .from('caja_diaria')
    .insert([{ fecha, detalle, observacion: observacion || null, importe: Number(importe) }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a caja_diaria entry.
 */
export async function deleteMovimientoCaja(id) {
  const { error } = await supabase
    .from('caja_diaria')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/**
 * Update a caja_diaria entry.
 */
export async function updateMovimientoCaja(id, updates) {
  const { data, error } = await supabase
    .from('caja_diaria')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ========================================
// DETALLE COBROS EFECTIVO (from movimientos_cuenta)
// ========================================

/**
 * Fetch all cash payments (EFECTIVO + EFECTIVO EN MUT) from movimientos_cuenta.
 * @param {{ fechaDesde?: string, fechaHasta?: string }} filters
 */
export async function fetchCobrosEfectivo({ fechaDesde, fechaHasta } = {}) {
  // Supabase doesn't support OR on same column with filters, so we do two queries
  const buildQuery = (medioPago) => {
    let q = supabase
      .from('movimientos_cuenta')
      .select('id, fecha, numero_grupo, nombre, empresa, importe, observaciones, medio_pago, numero_linea, periodo')
      .eq('tipo', 'PAGO')
      .eq('medio_pago', medioPago)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });

    if (fechaDesde) q = q.gte('fecha', fechaDesde);
    if (fechaHasta) q = q.lte('fecha', fechaHasta);
    return q;
  };

  const [r1, r2] = await Promise.all([
    buildQuery('EFECTIVO'),
    buildQuery('EFECTIVO EN MUT')
  ]);

  if (r1.error) throw r1.error;
  if (r2.error) throw r2.error;

  const all = [...(r1.data || []), ...(r2.data || [])];
  // Sort descending by fecha, then by id desc
  all.sort((a, b) => {
    const fd = (b.fecha || '').localeCompare(a.fecha || '');
    if (fd !== 0) return fd;
    return (b.id || 0) - (a.id || 0);
  });
  return all;
}

// ========================================
// NOTAS DE VERIFICACIÓN (tabla: caja_verificaciones_notas)
// ========================================

/**
 * Save or update daily verification observation.
 */
export async function saveNotaVerificacion({ fecha, observaciones }) {
  const { data, error } = await supabase
    .from('caja_verificaciones_notas')
    .upsert({
      fecha,
      observaciones: observaciones || null,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ========================================
// VERIFICACIÓN DIARIA - Cross-reference caja_diaria vs movimientos_cuenta
// ========================================

/**
 * Build verification report: one row per unique date in caja_diaria OR cash cobros.
 * For each date:
 *   - Al Inicio Cambio: sum of "INICIO - CAMBIO*" entries × -1
 *   - Al Cierre $: sum of "CIERRE -*" entries
 *   - Total Facturado Web: sum of EFECTIVO payments from movimientos_cuenta (absolute value)
 *   - Saldo Día: Al Cierre - Al Inicio Cambio
 *   - Diferencia: Saldo Día - Total Facturado Web
 */
export async function buildVerificacionDiaria({ fechaDesde, fechaHasta } = {}) {
  // 1. Fetch caja_diaria movements
  const movsCaja = await fetchMovimientosCaja({ fechaDesde, fechaHasta });

  // 2. Fetch cash payments from movimientos_cuenta for same date range
  const cobros = await fetchCobrosEfectivo({ fechaDesde, fechaHasta });

  // 3. Fetch verification notes for date range
  let notesQuery = supabase
    .from('caja_verificaciones_notas')
    .select('*');
  if (fechaDesde) notesQuery = notesQuery.gte('fecha', fechaDesde);
  if (fechaHasta) notesQuery = notesQuery.lte('fecha', fechaHasta);
  const { data: notesData } = await notesQuery;
  const notesMap = {};
  (notesData || []).forEach(n => {
    notesMap[n.fecha] = n.observaciones;
  });

  // 4. Get unique dates from BOTH caja_diaria and cobros
  const fechasSet = new Set([
    ...movsCaja.map(m => m.fecha),
    ...cobros.map(c => c.fecha)
  ]);
  const fechas = [...fechasSet].sort().reverse();

  // 5. Group caja_diaria by date
  const cajaByDate = {};
  movsCaja.forEach(m => {
    if (!cajaByDate[m.fecha]) cajaByDate[m.fecha] = [];
    cajaByDate[m.fecha].push(m);
  });

  // 6. Group cobros by date
  const cobrosByDate = {};
  cobros.forEach(c => {
    if (!cobrosByDate[c.fecha]) cobrosByDate[c.fecha] = [];
    cobrosByDate[c.fecha].push(c);
  });

  // 7. Build report
  return fechas.map(fecha => {
    const movsDia = cajaByDate[fecha] || [];
    const cobrosDia = cobrosByDate[fecha] || [];

    // Al Inicio Cambio: entries with detalle starting with "INICIO - CAMBIO", sum importe × -1
    const alInicioCambio = movsDia
      .filter(m => (m.detalle || '').toUpperCase().startsWith('INICIO - CAMBIO'))
      .reduce((sum, m) => sum + Number(m.importe || 0), 0) * -1;

    // Al Cierre $: entries with detalle starting with "CIERRE"
    const alCierre = movsDia
      .filter(m => (m.detalle || '').toUpperCase().startsWith('CIERRE'))
      .reduce((sum, m) => sum + Number(m.importe || 0), 0);

    // Total Facturado Web: sum of absolute value of EFECTIVO payments
    const totalFacturadoWeb = cobrosDia
      .reduce((sum, c) => sum + Math.abs(Number(c.importe || 0)), 0);

    // Saldo Día
    const saldoDia = alCierre - alInicioCambio;

    // Diferencia
    const diferencia = saldoDia - totalFacturadoWeb;

    // Dedicated daily verification note takes priority
    const notaVerif = notesMap[fecha];

    // Observations from cash movements (CAJA)
    const obsEntries = movsDia.filter(m => {
      const d = (m.detalle || '').toUpperCase();
      return d === 'CAJA' || (!d.startsWith('INICIO') && !d.startsWith('CIERRE') && !d.startsWith('PUESTO') && !d.startsWith('AGREGADO'));
    });
    const fallbackObs = obsEntries.map(m => m.observacion).filter(Boolean).join('; ');

    // Notes and observations registered from Contaduria and Facturacion for this day
    const cobrosDetalle = cobrosDia.map(c => ({
      id: c.id,
      numero_grupo: c.numero_grupo,
      nombre: c.nombre,
      importe: Math.abs(Number(c.importe || 0)),
      observaciones: c.observaciones || '',
      medio_pago: c.medio_pago,
      numero_linea: c.numero_linea,
      periodo: c.periodo,
      empresa: c.empresa
    }));

    // Unique non-empty observations from Contaduria payments
    const notasContaduria = [...new Set(
      cobrosDia
        .map(c => (c.observaciones || '').trim())
        .filter(Boolean)
    )];

    return {
      fecha,
      alInicioCambio: Math.round(alInicioCambio * 100) / 100,
      alCierre: Math.round(alCierre * 100) / 100,
      totalFacturadoWeb: Math.round(totalFacturadoWeb * 100) / 100,
      saldoDia: Math.round(saldoDia * 100) / 100,
      diferencia: Math.round(diferencia * 100) / 100,
      cobrosCount: cobrosDia.length,
      cajaMovsCount: movsDia.length,
      observaciones: notaVerif || fallbackObs || '',
      notaArqueoManual: notaVerif || '',
      notasContaduria,
      cobrosDetalle
    };
  });
}

// ========================================
// TYPES CONFIGURATION
// ========================================

/**
 * Available movement types for caja_diaria with their sign rules.
 */
export const TIPOS_MOVIMIENTO_CAJA = [
  { detalle: 'CAJA', signo: 'POSITIVO', descripcion: 'Saldo inicial de caja' },
  { detalle: 'INICIO - CAMBIO EN BILLETES', signo: 'NEGATIVO', descripcion: 'Billetes de cambio al inicio' },
  { detalle: 'INICIO - CAMBIO EN MONEDAS', signo: 'NEGATIVO', descripcion: 'Monedas de cambio al inicio' },
  { detalle: 'CIERRE - BILLETES', signo: 'POSITIVO', descripcion: 'Billetes al cierre del día' },
  { detalle: 'CIERRE - MONEDAS', signo: 'POSITIVO', descripcion: 'Monedas al cierre del día' },
  { detalle: 'PUESTO A RESGUARDO EN CAJA', signo: 'NEGATIVO', descripcion: 'Dinero puesto a resguardo' },
  { detalle: 'AGREGADO DE CAMBIO', signo: 'POSITIVO', descripcion: 'Cambio agregado durante el día' },
];
