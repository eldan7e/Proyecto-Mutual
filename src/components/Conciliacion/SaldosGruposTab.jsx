import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, RefreshCw, ArrowUpRight, DollarSign, Building, AlertTriangle } from 'lucide-react';
import { fetchInformeSaldosGeneral } from '../../services/cuentaCorrienteService';
import { formatMoney } from '../../utils/cuentaCorrienteEngine';
import { Link } from 'react-router-dom';

export default function SaldosGruposTab() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [soloDeudores, setSoloDeudores] = useState(false);

  useEffect(() => {
    loadSaldos();
  }, [soloDeudores]);

  async function loadSaldos() {
    setLoading(true);
    try {
      const data = await fetchInformeSaldosGeneral({ soloDeudores });
      setGroups(data || []);
    } catch (err) {
      console.error('Error al cargar saldos de grupos en conciliación:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const s = search.toLowerCase().trim();
    return groups.filter(g => 
      String(g.numero_grupo).includes(s) ||
      (g.nombre || '').toLowerCase().includes(s)
    );
  }, [groups, search]);

  return (
    <div className="glass-panel" style={{ borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building size={20} color="var(--accent)" /> Estado de Cuentas y Saldos por Grupo
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
            Base de datos unificada de cuenta corriente y saldos actualizados por grupo
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="search-bar" style={{ width: '280px' }}>
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Buscar por grupo o titular..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', width: '100%', fontSize: '13px', color: 'var(--text-primary)' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={soloDeudores} 
              onChange={(e) => setSoloDeudores(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            Solo con Deuda {'>'} $5
          </label>

          <button onClick={loadSaldos} className="icon-button-edit" style={{ height: '38px', width: '38px' }}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
        <table className="premium-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center', padding: '14px 18px' }}>Grupo</th>
              <th>Titular / Razón Social</th>
              <th style={{ textAlign: 'center' }}>Último Movimiento</th>
              <th style={{ textAlign: 'right' }}>Total Facturado</th>
              <th style={{ textAlign: 'right' }}>Total Pagado</th>
              <th style={{ textAlign: 'right' }}>Saldo Capital</th>
              <th style={{ textAlign: 'right' }}>Saldo Final Consolidado</th>
              <th style={{ textAlign: 'center' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ padding: '60px', textAlign: 'center' }}>
                  <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No se encontraron registros de saldo para estos criterios.
                </td>
              </tr>
            ) : (
              filtered.map(g => {
                const tieneDeuda = g.saldoFinalUltimo > 5;
                return (
                  <tr key={g.numero_grupo}>
                    <td style={{ textAlign: 'center', fontWeight: 900, fontSize: '14px' }}>
                      Grupo {g.numero_grupo}
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {g.nombre}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {g.ultimoMovimientoFecha}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '13px' }}>
                      {formatMoney(g.totalFacturas)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '13px', color: '#10b981' }}>
                      {formatMoney(g.totalPagos)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: g.saldoCapitalUltimo > 5 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {formatMoney(g.saldoCapitalUltimo)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 900, fontSize: '14px', color: tieneDeuda ? '#ef4444' : '#10b981' }}>
                      {formatMoney(g.saldoFinalUltimo)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Link 
                        to={`/cuenta-corriente?grupo=${g.numero_grupo}`} 
                        className="icon-button-edit"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}
                      >
                        Ver Extracto <ArrowUpRight size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
