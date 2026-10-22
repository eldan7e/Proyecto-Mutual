import { supabase } from '../supabaseClient';

/* ─────────────────────────────────────────────
   Dashboard — optimized parallel queries +
   global counts used in the main view
   ───────────────────────────────────────────── */

/**
 * Fetch all liquidaciones_grupos with the provider name using parallel pagination
 * to avoid sequential round-trip bottlenecks.
 */
export async function fetchLiquidaciones(targetPeriods) {
  let query = supabase
    .from('liquidaciones_grupos')
    .select('periodo, monto_total_facturado, estado_pago, proveedores(nombre)')
    .order('periodo', { ascending: false });

  if (targetPeriods && targetPeriods.length > 0) {
    query = query.in('periodo', targetPeriods);
    const { data, error } = await query.range(0, 3999);
    if (error) throw error;
    return data || [];
  }

  // Si no se especifican períodos, consultar el count y traer en paralelo
  const { count, error: countErr } = await supabase
    .from('liquidaciones_grupos')
    .select('*', { count: 'exact', head: true });

  if (countErr) throw countErr;
  const pageSize = 1000;
  const numPages = Math.ceil((count || pageSize) / pageSize);
  const pagePromises = [];

  for (let i = 0; i < numPages; i++) {
    const from = i * pageSize;
    const to = from + pageSize - 1;
    pagePromises.push(
      supabase
        .from('liquidaciones_grupos')
        .select('periodo, monto_total_facturado, estado_pago, proveedores(nombre)')
        .order('periodo', { ascending: false })
        .range(from, to)
    );
  }

  const results = await Promise.all(pagePromises);
  const allData = [];
  results.forEach(res => {
    if (res.error) throw res.error;
    if (res.data) allData.push(...res.data);
  });
  return allData;
}

/**
 * Fetch consumos_mensuales filtered to a set of periods with pagination.
 * Includes the joined linea → socio_id for counting.
 *
 * @param {string[]} periods - Array of "YYYY-MM" strings. If empty, fetches all.
 */
export async function fetchConsumos(periods) {
  if (periods && periods.length === 0) return [];

  let query = supabase
    .from('consumos_mensuales')
    .select('periodo, numero_linea, lineas(socio_id)')
    .range(0, 3999);

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
 * Convenience wrapper — fetches all Dashboard data in parallel with optimal filters.
 * Returns { liquidaciones, consumos, auditLogs, globalCounts }.
 */
export async function fetchDashboardData() {
  // 1. Obtener en paralelo los períodos recientes, logs de auditoría y conteos globales
  const [periodsRes, auditLogs, globalCounts] = await Promise.all([
    supabase
      .from('unique_periods_view')
      .select('periodo')
      .order('periodo', { ascending: false })
      .limit(12),
    fetchRecentAuditLogs(),
    fetchGlobalCounts(),
  ]);

  const uniquePeriods = (periodsRes.data || [])
    .map((p) => p.periodo)
    .filter(Boolean);

  // 2. Traer liquidaciones de los últimos 12 períodos y consumos solo de los 7 períodos del gráfico
  const [liquidaciones, consumos] = await Promise.all([
    uniquePeriods.length > 0
      ? fetchLiquidaciones(uniquePeriods)
      : fetchLiquidaciones(),
    uniquePeriods.length > 0
      ? fetchConsumos(uniquePeriods.slice(0, 7))
      : Promise.resolve([]),
  ]);

  return { liquidaciones, consumos, auditLogs, globalCounts };
}
