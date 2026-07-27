import { useState, useEffect, useMemo } from 'react';
import { 
  Search, FileText, Database, TrendingUp, AlertTriangle, 
  Loader2, RefreshCw, Users, Download, ArrowUpRight
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import { usePagination } from './hooks/usePagination';
import { fetchInformeSaldosGeneral } from './services/cuentaCorrienteService';
import { formatMoney } from './utils/cuentaCorrienteEngine';
import useDebounce from './hooks/useDebounce';
import { Link } from 'react-router-dom';

export default function InformeSaldos() {
  const { addToast } = useToast();
  
  const { page, pageSize, total, setTotal, goToPage, prevPage, nextPage, reset } = usePagination(1, 40);
  const [gruposData, setGruposData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [soloDeudores, setSoloDeudores] = useState(true);

  useEffect(() => {
    loadData();
  }, [debouncedSearch, soloDeudores]);

  useEffect(() => {
    reset();
  }, [debouncedSearch, soloDeudores]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await fetchInformeSaldosGeneral({
        search: debouncedSearch,
        soloDeudores
      });
      setGruposData(data || []);
      setTotal(data?.length || 0);
    } catch (err) {
      console.error(err);
      addToast('Error al cargar informe de saldos: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // KPIs globales
  const stats = useMemo(() => {
    let totalCapitalDeuda = 0;
    let totalFacturasHist = 0;
    let totalPagosHist = 0;

    gruposData.forEach(g => {
      totalCapitalDeuda += Math.max(0, g.saldoFinalUltimo);
      totalFacturasHist += g.totalFacturas;
      totalPagosHist += g.totalPagos;
    });

    const gruposDeudoresCount = gruposData.filter(g => g.saldoFinalUltimo > 5).length;

    return {
      totalCapitalDeuda,
      totalFacturasHist,
      totalPagosHist,
      gruposDeudoresCount,
      totalGrupos: gruposData.length
    };
  }, [gruposData]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const paginatedGroups = useMemo(() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return gruposData.slice(from, to);
  }, [gruposData, page, pageSize]);

  function exportarCSV() {
    if (gruposData.length === 0) return;
    let csv = 'Grupo,Titular,Empresas,Ultimo Movimiento,Total Facturado,Total Pagado,Saldo Capital Final\n';
    gruposData.forEach(g => {
      csv += `"${g.numero_grupo}","${g.nombre}","${g.empresas}","${g.ultimoMovimientoFecha}",${g.totalFacturas},${g.totalPagos},${g.saldoFinalUltimo}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'informe_saldos_general.csv';
    a.click();
    URL.revokeObjectURL(url);
    addToast('Informe de saldos exportado a CSV', 'success');
  }

  return (
    <div style={{ padding: '0 20px 40px 20px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{ background: 'var(--accent)', color: 'white', padding: '8px', borderRadius: '12px' }}>
              <FileText size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.03em' }}>Informe General de Saldos</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
                Resumen de cuenta acumulado por grupo · Reemplazo de la vista Pivot de Lex Doctor y Excel
              </p>
            </div>
          </div>
        </div>

        <button onClick={exportarCSV} className="icon-button-edit" style={{ height: '42px', padding: '0 16px', borderRadius: '12px', gap: '8px', fontSize: '13px' }}>
          <Download size={16} /> Exportar Reporte CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>TOTAL SALDO CAPITAL</span>
            <AlertTriangle size={16} color="var(--danger)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--danger)' }}>
            {formatMoney(stats.totalCapitalDeuda)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {stats.gruposDeudoresCount} grupos con saldo impago {'>'} $5
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>TOTAL FACTURADO HISTÓRICO</span>
            <Database size={16} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900 }}>
            {formatMoney(stats.totalFacturasHist)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Suma de todas las facturas cargadas
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>TOTAL RECAUDADO HISTÓRICO</span>
            <TrendingUp size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981' }}>
            {formatMoney(stats.totalPagosHist)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Suma de todos los cobros registrados
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>GRUPOS REGISTRADOS</span>
            <Users size={16} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#f59e0b' }}>
            {stats.totalGrupos}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            En la base de cuenta corriente
          </div>
        </div>

      </div>

      {/* Table & Filters */}
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
        
        {/* Filters */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-bar" style={{ flex: 1, minWidth: '250px' }}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar por número de grupo, titular u operadora..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)' }} 
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
              <input 
                type="checkbox" 
                checked={soloDeudores} 
                onChange={(e) => setSoloDeudores(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
              />
              Mostrar solo deudores ({'>'} $5)
            </label>

            <button onClick={loadData} className="icon-button-edit" style={{ height: '40px', width: '40px' }}>
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Groups Table */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'center', padding: '16px 20px' }}>Grupo</th>
                <th>Titular / Razón Social</th>
                <th>Operadoras</th>
                <th style={{ textAlign: 'center' }}>Último Movimiento</th>
                <th style={{ textAlign: 'right' }}>Total Facturado</th>
                <th style={{ textAlign: 'right' }}>Total Pagado</th>
                <th style={{ textAlign: 'right' }}>Saldo Capital</th>
                <th style={{ textAlign: 'right' }}>Saldo Final</th>
                <th style={{ textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ padding: '80px', textAlign: 'center' }}>
                    <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent)' }} />
                  </td>
                </tr>
              ) : paginatedGroups.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No se encontraron grupos para estos filtros.
                  </td>
                </tr>
              ) : (
                paginatedGroups.map(g => {
                  const tieneDeuda = g.saldoFinalUltimo > 5;
                  return (
                    <tr key={g.numero_grupo}>
                      <td style={{ textAlign: 'center', fontWeight: 900, fontSize: '15px' }}>
                        {g.numero_grupo}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {g.nombre}
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {g.empresas}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>
                        {g.ultimoMovimientoFecha}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '14px' }}>
                        {formatMoney(g.totalFacturas)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '14px', color: '#10b981' }}>
                        {formatMoney(g.totalPagos)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '14px', color: g.saldoCapitalUltimo > 5 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {formatMoney(g.saldoCapitalUltimo)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 900, fontSize: '14px', color: tieneDeuda ? 'var(--danger)' : '#10b981' }}>
                        {formatMoney(g.saldoFinalUltimo)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Link 
                          to={`/cuenta-corriente?grupo=${g.numero_grupo}`} 
                          className="icon-button-edit"
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}
                        >
                          Ver Extracto <ArrowUpRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Mostrando {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} de {total} grupos
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={prevPage} disabled={page === 1} className="icon-button-edit" style={{ width: '36px', height: '36px', opacity: page === 1 ? 0.4 : 1 }}>
                ←
              </button>
              <span style={{ fontSize: '14px', fontWeight: 700, minWidth: '80px', textAlign: 'center' }}>{page} / {totalPages}</span>
              <button onClick={nextPage} disabled={page === totalPages} className="icon-button-edit" style={{ width: '36px', height: '36px', opacity: page === totalPages ? 0.4 : 1 }}>
                →
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
