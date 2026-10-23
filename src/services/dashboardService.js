import { supabase } from '../supabaseClient';

/* ─────────────────────────────────────────────
   Dashboard — optimized parallel queries +
   global counts used in the main view
   ───────────────────────────────────────────── */

/**
 * Fetch all liquidaciones_grupos with the provider name using parallel pagination
 * to avoid PostgREST's 1000-row default truncation limit.
 */
export async function fetchLiquidaciones(targetPeriods) {
  let queryCount = supabase
    .from('liquidaciones_grupos')
    .select('*', { count: 'exact', head: true });

  if (targetPeriods && targetPeriods.length > 0) {
    queryCount = queryCount.in('periodo', targetPeriods);
  }

  const { count, error: countErr } = await queryCount;
  if (countErr) throw countErr;

  const pageSize = 1000;
  const numPages = Math.ceil((count || 0) / pageSize);
  if (numPages === 0) return [];

  const pagePromises = [];
  for (let i = 0; i < numPages; i++) {
    const from = i * pageSize;
    const to = from + pageSize - 1;
    let pageQuery = supabase
      .from('liquidaciones_grupos')
      .select('periodo, monto_total_facturado, estado_pago, proveedores(nombre)')
      .order('periodo', { ascending: false })
      .range(from, to);

    if (targetPeriods && targetPeriods.length > 0) {
      pageQuery = pageQuery.in('periodo', targetPeriods);
    }
    pagePromises.push(pageQuery);
  }

  const results = await Promise.all(pagePromises);
  const allData = [];
  for (const res of results) {
    if (res.error) throw res.error;
    if (res.data) allData.push(...res.data);
  }
  return allData;
}

/**
 * Fetch consumos_mensuales filtered to a set of periods with parallel pagination
 * to guarantee no records are truncated by the 1000-row limit.
 *
 * @param {string[]} periods - Array of "YYYY-MM" strings. If empty, fetches all.
 */
export async function fetchConsumos(periods) {
  if (periods && periods.length === 0) return [];

  let queryCount = supabase
    .from('consumos_mensuales')
    .select('*', { count: 'exact', head: true });

  if (periods && periods.length > 0) {
    queryCount = queryCount.in('periodo', periods);
  }

  const { count, error: countErr } = await queryCount;
  if (countErr) throw countErr;

  const pageSize = 1000;
  const numPages = Math.ceil((count || 0) / pageSize);
  if (numPages === 0) return [];

  const pagePromises = [];
  for (let i = 0; i < numPages; i++) {
    const from = i * pageSize;
    const to = from + pageSize - 1;
    let pageQuery = supabase
      .from('consumos_mensuales')
      .select('periodo, numero_linea, lineas(socio_id)')
      .range(from, to);

    if (periods && periods.length > 0) {
      pageQuery = pageQuery.in('periodo', periods);
    }
    pagePromises.push(pageQuery);
  }

  const results = await Promise.all(pagePromises);
  const allData = [];
  for (const res of results) {
    if (res.error) throw res.error;
    if (res.data) allData.push(...res.data);
  }
  return allData;
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
