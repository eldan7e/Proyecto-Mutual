import { supabase } from '../supabaseClient';

/* ─────────────────────────────────────────────
   Dashboard — all five SELECT queries +
   global counts used in the main useEffect
   ───────────────────────────────────────────── */

/**
 * Fetch all liquidaciones_grupos with the provider name.
 * Returns raw rows ordered by periodo desc.
 */
export async function fetchLiquidaciones() {
  const { data, error } = await supabase
    .from('liquidaciones_grupos')
    .select('periodo, monto_total_facturado, estado_pago, proveedores(nombre)')
    .order('periodo', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch consumos_mensuales filtered to a set of periods.
 * Includes the joined linea → socio_id for counting.
 *
 * @param {string[]} periods - Array of "YYYY-MM" strings. If empty, fetches all.
 */
export async function fetchConsumos(periods) {
  let query = supabase
    .from('consumos_mensuales')
    .select('periodo, numero_linea, lineas(socio_id)');

  if (periods && periods.length > 0) {
    query = query.in('periodo', periods);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch the last N audit-log entries.
 *
 * @param {number} [limit=5]
 */
export async function fetchRecentAuditLogs(limit = 5) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Fetch global counts used in the dashboard KPI cards.
 * Returns { sociosCount, lineasActivasCount }.
 */
export async function fetchGlobalCounts() {
  const [sociosRes, lineasRes] = await Promise.all([
    supabase.from('socios').select('*', { count: 'exact', head: true }),
    supabase
      .from('lineas')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'ACTIVA'),
  ]);

  return {
    sociosCount: sociosRes.count ?? 0,
    lineasActivasCount: lineasRes.count ?? 0,
  };
}

/**
 * Convenience wrapper — fetches all Dashboard data in one call.
 * Returns { liquidaciones, consumos, auditLogs, globalCounts }.
 */
export async function fetchDashboardData() {
  // First fetch liquidaciones to derive periods
  const liquidaciones = await fetchLiquidaciones();

  // Extract last 12 unique periods
  const uniquePeriods = [
    ...new Set(liquidaciones.map((l) => l.periodo)),
  ].slice(0, 12);

  // Run remaining queries in parallel
  const [consumos, auditLogs, globalCounts] = await Promise.all([
    fetchConsumos(uniquePeriods),
    fetchRecentAuditLogs(),
    fetchGlobalCounts(),
  ]);

  return { liquidaciones, consumos, auditLogs, globalCounts };
}
