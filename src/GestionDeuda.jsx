import { useEffect, useState, useMemo, memo } from 'react';
import { supabase } from './supabaseClient';
import { 
  Search, FileText, Database, TrendingUp, AlertTriangle, 
  Loader2, RefreshCw, Edit2, CheckCircle2, ChevronDown, ChevronRight, Hash, Users
} from 'lucide-react';
import Modal from './components/Modal';
import { useToast } from './components/ui/ToastProvider';
import { usePagination } from './hooks/usePagination';
import { fetchLiquidacionesPaginated, fetchLiquidacionesStats, fetchUniquePeriods } from './services/liquidacionService';

export default function GestionDeuda() {
  const { addToast } = useToast();
  
  const { page, pageSize, total, setTotal, goToPage, prevPage, nextPage, reset } = usePagination(1, 40);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [kpis, setKpis] = useState({ totalFacturado: 0, totalAbonado: 0, totalPendiente: 0, gruposDeudores: 0, totalGrupos: 0, cobroRate: 0 });
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('Todos');
  const [selectedPeriod, setSelectedPeriod] = useState('Todos');
  const [periodosList, setPeriodosList] = useState([]);
  const [expandedGrupo, setExpandedGrupo] = useState(null);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLiq, setSelectedLiq] = useState(null);
  const [editMontoAbonado, setEditMontoAbonado] = useState('');
  const [editEstadoPago, setEditEstadoPago] = useState('PENDIENTE');
  const [saving, setSaving] = useState(false);

  // Cargar lista de períodos disponibles al montar
  useEffect(() => {
    async function loadPeriods() {
      try {
        const unique = await fetchUniquePeriods();
        setPeriodosList(unique || []);
      } catch (err) {
        console.error("Error al cargar períodos únicos:", err);
      }
    }
    loadPeriods();
  }, []);

  // Cargar datos principales cuando cambian filtros
  useEffect(() => {
    loadData();
  }, [search, selectedStatus, selectedPeriod]);

  // Cargar estadísticas globales sin paginación
  useEffect(() => {
    loadStats();
  }, [search, selectedStatus, selectedPeriod]);

  // Resetear a página 1 si cambian los filtros principales
  useEffect(() => {
    reset();
  }, [search, selectedStatus, selectedPeriod]);

  useEffect(() => {
    // Subscribe to realtime updates for liquidaciones_grupos to keep state synchronized in background
    const channel = supabase
      .channel('liquidaciones-grupos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'liquidaciones_grupos'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            loadData();
            loadStats();
          } else if (payload.eventType === 'UPDATE') {
            setLiquidaciones(prev => prev.map(item => {
              if (item.liquidacion_id === payload.new.liquidacion_id) {
                return {
                  ...item,
                  ...payload.new
                };
              }
              return item;
            }));
            loadStats();
          } else if (payload.eventType === 'DELETE') {
            setLiquidaciones(prev => prev.filter(item => item.liquidacion_id !== payload.old.liquidacion_id));
            loadStats();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [search, selectedStatus, selectedPeriod]);

  async function loadData() {
    setLoading(true);
    try {
      const { data } = await fetchLiquidacionesPaginated({
        periodo: selectedPeriod,
        estado: selectedStatus,
        search,
      });
      setLiquidaciones(data || []);

      // Cargar líneas si no han sido cargadas aún
      if (lineas.length === 0) {
        const { data: lineData, error: lineError } = await supabase
          .from('lineas')
          .select('numero_linea, numero_grupo, proveedor_id, planes_abonos(nombre_plan), proveedores:proveedor_id(nombre)');
        if (lineError) throw lineError;
        setLineas(lineData || []);
      }
    } catch (err) {
      console.error(err);
      addToast('Error al cargar datos del servidor: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    setLoadingStats(true);
    try {
      const stats = await fetchLiquidacionesStats({
        periodo: selectedPeriod,
        estado: selectedStatus,
      });
      const cobroRate = stats.totalFacturado > 0 ? (stats.totalAbonado / stats.totalFacturado) * 100 : 0;
      setKpis({
        ...stats,
        cobroRate
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  }
  
  // Group liquidaciones by numero_grupo (only for the current paginated page)
  const groupedData = useMemo(() => {
    const groups = {};
    liquidaciones.forEach(liq => {
      const g = liq.numero_grupo;
      if (!groups[g]) {
        groups[g] = {
          numero_grupo: g,
          titular: liq.socios?.nombre_completo || null,
          socio_id: liq.socio_id,
          liquidaciones: [],
          totalFacturado: 0,
          totalAbonado: 0,
          periodos: new Set(),
          proveedores: new Set(),
        };
      }
      const facturado = parseFloat(liq.monto_total_facturado) || 0;
      const abonado = parseFloat(liq.monto_abonado) || 0;
      groups[g].totalFacturado += facturado;
      groups[g].totalAbonado += abonado;
      groups[g].periodos.add(liq.periodo);
      if (liq.proveedores?.nombre) groups[g].proveedores.add(liq.proveedores.nombre);
      groups[g].liquidaciones.push(liq);
    });

    // Calculate derived fields
    return Object.values(groups).map(g => {
      g.totalPendiente = g.totalFacturado - g.totalAbonado;
      g.liquidaciones.sort((a, b) => b.periodo.localeCompare(a.periodo));
      
      const allAbonado = g.liquidaciones.every(l => l.estado_pago === 'ABONADO') || g.totalPendiente <= 5;
      const anyPaid = g.totalAbonado > 0;
      g.estado = allAbonado ? 'AL_DIA' : (anyPaid ? 'PARCIAL' : 'MOROSO');
      g.periodosCount = g.periodos.size;
      g.proveedoresList = [...g.proveedores];
      
      // Associate lines
      g.lines = lineas.filter(l => l.numero_grupo === g.numero_grupo);
      
      // Count pending liquidaciones with more than 5 pesos pending
      g.pendientesCount = g.liquidaciones.filter(l => l.estado_pago !== 'ABONADO' && (Number(l.monto_total_facturado) - Number(l.monto_abonado)) > 5).length;
      return g;
    });
  }, [liquidaciones, lineas]);

  // Sort and filter groups by search query
  const sortedGroups = useMemo(() => {
    let result = [...groupedData];
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      result = result.filter(group => 
        String(group.numero_grupo).includes(s) ||
        (group.titular && group.titular.toLowerCase().includes(s))
      );
    }
    result.sort((a, b) => b.totalPendiente - a.totalPendiente);
    return result;
  }, [groupedData, search]);

  // Synchronize pagination total with filtered count
  useEffect(() => {
    setTotal(sortedGroups.length);
  }, [sortedGroups, setTotal]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const paginatedGroups = useMemo(() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return sortedGroups.slice(from, to);
  }, [sortedGroups, page, pageSize]);

  function toggleGrupo(grupoNum) {
    setExpandedGrupo(prev => prev === grupoNum ? null : grupoNum);
  }

  function openEditModal(liq) {
    setSelectedLiq(liq);
    setEditMontoAbonado(liq.monto_abonado);
    setEditEstadoPago(liq.estado_pago || 'PENDIENTE');
    setModalOpen(true);
  }

  async function handleSave() {
    if (editMontoAbonado === '' || isNaN(Number(editMontoAbonado)) || Number(editMontoAbonado) < 0) {
      addToast('Monto abonado inválido', 'warning');
      return;
    }
    const newAbonado = parseFloat(editMontoAbonado);
    const facturado = parseFloat(selectedLiq.monto_total_facturado) || 0;
    let finalEstado = editEstadoPago;
    if (newAbonado >= facturado - 0.05) finalEstado = 'ABONADO';
    else if (newAbonado === 0) finalEstado = 'PENDIENTE';

    setSaving(true);
    try {
      const { error } = await supabase
        .from('liquidaciones_grupos')
        .update({ monto_abonado: newAbonado, estado_pago: finalEstado, updated_at: new Date().toISOString() })
        .eq('liquidacion_id', selectedLiq.liquidacion_id);
      if (error) throw error;

      await supabase.from('audit_log').insert({
        tipo_evento: 'EDICION_DEUDA_MANUAL',
        descripcion: `Edición manual: Grupo ${selectedLiq.numero_grupo} (${selectedLiq.periodo}, ${selectedLiq.proveedores?.nombre || 'S/P'}): Abonado $${selectedLiq.monto_abonado} → $${newAbonado}. Estado: ${finalEstado}.`,
        monto: newAbonado,
        usuario: 'dante@admin.com'
      });

      addToast(`Deuda de Grupo ${selectedLiq.numero_grupo} actualizada`, 'success');
      setLiquidaciones(prev => prev.map(item => 
        item.liquidacion_id === selectedLiq.liquidacion_id 
          ? { ...item, monto_abonado: newAbonado, estado_pago: finalEstado } 
          : item
      ));
      setModalOpen(false);
    } catch (err) {
      console.error(err);
      addToast(`Error al guardar: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const estadoBadge = (estado) => {
    const configs = {
      AL_DIA: { bg: 'rgba(16,185,129,0.12)', color: '#10b981', icon: <CheckCircle2 size={12} />, label: 'AL DÍA' },
      PARCIAL: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', icon: null, label: 'PARCIAL' },
      MOROSO: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', icon: <AlertTriangle size={11} />, label: 'MOROSO' },
    };
    const c = configs[estado] || configs.PARCIAL;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: c.bg, color: c.color,
        padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800
      }}>
        {c.icon}{c.label}
      </span>
    );
  };

  const liqStatusBadge = (liq) => {
    const abonado = parseFloat(liq.monto_abonado) || 0;
    const isAbonado = liq.estado_pago === 'ABONADO';
    const isParcial = !isAbonado && abonado > 0;
    const bg = isAbonado ? 'rgba(16,185,129,0.12)' : isParcial ? 'rgba(59,130,246,0.12)' : 'rgba(245,158,11,0.12)';
    const color = isAbonado ? '#10b981' : isParcial ? '#3b82f6' : '#f59e0b';
    const label = isAbonado ? 'ABONADO' : isParcial ? 'PARCIAL' : 'PENDIENTE';
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        background: bg, color, padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 800
      }}>
        {isAbonado && <CheckCircle2 size={10} />}{label}
      </span>
    );
  };

  const provBadge = (nombre) => {
    const n = (nombre || '').toUpperCase();
    const bg = n.includes('CLARO') ? 'rgba(239,68,68,0.1)' : n.includes('MOVISTAR') ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)';
    const color = n.includes('CLARO') ? '#ef4444' : n.includes('MOVISTAR') ? '#3b82f6' : '#10b981';
    return (
      <span style={{ display: 'inline-block', padding: '3px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: bg, color }}>
        {nombre || 'OTRO'}
      </span>
    );
  };

  return (
    <div style={{ padding: '0 20px 40px 20px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ background: 'var(--accent)', color: 'white', padding: '8px', borderRadius: '12px' }}>
              <FileText size={20} />
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em' }}>Gestión de Deuda</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 500 }}>
            Estado de deuda consolidado por grupo · Hacé click en un grupo para ver el detalle
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        
        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>TOTAL FACTURADO</span>
            <Database size={16} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900 }}>${fmt(kpis.totalFacturado)}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{kpis.totalGrupos} grupos en filtros</div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>TOTAL COBRADO</span>
            <TrendingUp size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#10b981' }}>${fmt(kpis.totalAbonado)}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{kpis.cobroRate.toFixed(1)}% Recaudado</div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>DEUDA PENDIENTE</span>
            <AlertTriangle size={16} color="var(--danger)" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: kpis.totalPendiente > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>${fmt(kpis.totalPendiente)}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Saldos pendientes de cobro</div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>GRUPOS DEUDORES</span>
            <Users size={16} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#f59e0b' }}>{kpis.gruposDeudores}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Con saldo pendiente {'>'}$5</div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
        
        {/* Filters */}
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-bar" style={{ flex: 1, minWidth: '250px' }}>
            <Search size={18} />
            <input type="text" placeholder="Buscar por número de grupo o nombre de titular..." value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)' }} />
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Período:</span>
              <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}
                style={{ background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '8px 16px', fontSize: '14px', fontWeight: 600, outline: 'none' }}>
                <option value="Todos">Todos</option>
                {periodosList.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Estado:</span>
              <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
                style={{ background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '8px 16px', fontSize: '14px', fontWeight: 600, outline: 'none' }}>
                <option value="Todos">Todos</option>
                <option value="DEUDOR">Con deuda</option>
                <option value="MOROSO">Morosos</option>
                <option value="AL_DIA">Al día</option>
              </select>
            </div>
            <button onClick={() => { loadData(); loadStats(); }} className="icon-button-edit" style={{ height: '42px', width: '42px', flexShrink: 0 }}>
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Groups Table */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ padding: '16px 24px', width: '40px' }}></th>
                <th style={{ textAlign: 'center' }}>Grupo</th>
                <th>Titular</th>
                <th>Operadoras</th>
                <th style={{ textAlign: 'center' }}>Períodos</th>
                <th style={{ textAlign: 'right' }}>Total Facturado</th>
                <th style={{ textAlign: 'right' }}>Total Abonado</th>
                <th style={{ textAlign: 'right' }}>Saldo Pendiente</th>
                <th style={{ textAlign: 'center' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading && liquidaciones.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '100px', textAlign: 'center' }}>
                    <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent)' }} />
                  </td>
                </tr>
              ) : sortedGroups.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    No se encontraron grupos para estos filtros.
                  </td>
                </tr>
              ) : (
                paginatedGroups.map(group => {
                  const isExpanded = expandedGrupo === group.numero_grupo;
                  return (
                    <GroupRow 
                      key={group.numero_grupo} 
                      group={group} 
                      isExpanded={isExpanded}
                      onToggle={() => toggleGrupo(group.numero_grupo)}
                      onEditLiq={openEditModal}
                      fmt={fmt}
                      estadoBadge={estadoBadge}
                      liqStatusBadge={liqStatusBadge}
                      provBadge={provBadge}
                    />
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
              <button onClick={prevPage} disabled={page === 1}
                style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '10px', cursor: page === 1 ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', opacity: page === 1 ? 0.4 : 1, color: 'var(--text-primary)' }}>
                <ChevronDown size={18} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <span style={{ fontSize: '14px', fontWeight: 700, minWidth: '80px', textAlign: 'center' }}>{page} / {totalPages}</span>
              <button onClick={nextPage} disabled={page === totalPages}
                style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '10px', cursor: page === totalPages ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', opacity: page === totalPages ? 0.4 : 1, color: 'var(--text-primary)' }}>
                <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {selectedLiq && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={`Conciliación Manual - Grupo ${selectedLiq.numero_grupo}`} maxWidth="450px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Socio Titular</p>
              <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedLiq.socios?.nombre_completo || 'Sin titular'}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Periodo</p>
                  <p style={{ fontSize: '13px', fontWeight: 600 }}>{selectedLiq.periodo}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Operadora</p>
                  <p style={{ fontSize: '13px', fontWeight: 600 }}>{selectedLiq.proveedores?.nombre || 'S/P'}</p>
                </div>
              </div>
            </div>
            <div>
              <label className="form-label">Total Facturado (Deuda)</label>
              <div style={{ fontSize: '20px', fontWeight: 800, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                ${parseFloat(selectedLiq.monto_total_facturado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <label className="form-label">Monto Abonado ($)</label>
              <input type="number" className="form-input" value={editMontoAbonado} onChange={(e) => setEditMontoAbonado(e.target.value)} placeholder="Ingresar importe pagado..." style={{ marginBottom: 0 }} />
              <button onClick={() => setEditMontoAbonado(selectedLiq.monto_total_facturado)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Saldar deuda completa (${parseFloat(selectedLiq.monto_total_facturado).toFixed(2)})
              </button>
            </div>
            <div>
              <label className="form-label">Estado de Pago</label>
              <select className="form-input" value={editEstadoPago} onChange={(e) => setEditEstadoPago(e.target.value)} style={{ marginBottom: 0 }}>
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="ABONADO">ABONADO</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <button onClick={() => setModalOpen(false)} className="action-button" 
                style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', width: '50%' }} disabled={saving}>
                Cancelar
              </button>
              <button onClick={handleSave} className="action-button" style={{ width: '50%' }} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Separate component for group row + expanded detail to avoid re-renders (wrapped in React.memo)
const GroupRow = memo(({ group, isExpanded, onToggle, onEditLiq, fmt, estadoBadge, liqStatusBadge, provBadge }) => {
  const pendiente = group.totalPendiente;
  const hasPendiente = pendiente > 5;

  return (
    <>
      {/* Main Group Row */}
      <tr 
        onClick={onToggle} 
        style={{ 
          cursor: 'pointer', 
          transition: 'background 0.15s',
          background: isExpanded ? 'rgba(99,102,241,0.04)' : undefined 
        }}
        onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'rgba(99,102,241,0.02)'; }}
        onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = ''; }}
      >
        <td style={{ padding: '16px 12px 16px 24px', width: '40px' }}>
          {isExpanded 
            ? <ChevronDown size={16} style={{ color: 'var(--accent)', transition: 'transform 0.2s' }} /> 
            : <ChevronRight size={16} style={{ color: 'var(--text-secondary)', transition: 'transform 0.2s' }} />
          }
        </td>
        <td style={{ textAlign: 'center', fontWeight: 800, fontSize: '15px' }}>{group.numero_grupo}</td>
        <td style={{ fontWeight: 600 }}>
          {group.titular || <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic' }}>Sin titular</span>}
        </td>
        <td>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {group.proveedoresList.map(p => (
              <span key={p} style={{
                display: 'inline-block', padding: '3px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 800,
                background: p.toUpperCase().includes('CLARO') ? 'rgba(239,68,68,0.1)' : p.toUpperCase().includes('MOVISTAR') ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)',
                color: p.toUpperCase().includes('CLARO') ? '#ef4444' : p.toUpperCase().includes('MOVISTAR') ? '#3b82f6' : '#10b981',
              }}>{p}</span>
            ))}
          </div>
        </td>
        <td style={{ textAlign: 'center' }}>
          <span style={{ 
            background: 'var(--surface)', padding: '3px 10px', borderRadius: '10px', 
            fontSize: '12px', fontWeight: 700, border: '1px solid var(--border-light)',
            whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px'
          }}>
            {group.periodosCount}
            {group.pendientesCount > 0 && (
              <span style={{ color: 'var(--danger)', fontSize: '10px' }}>
                ({group.pendientesCount} pend.)
              </span>
            )}
          </span>
        </td>
        <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '14px' }}>${fmt(group.totalFacturado)}</td>
        <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '14px', color: '#10b981' }}>${fmt(group.totalAbonado)}</td>
        <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '14px', color: hasPendiente ? 'var(--danger)' : 'var(--text-primary)' }}>
          ${fmt(Math.max(0, pendiente))}
        </td>
        <td style={{ textAlign: 'center' }}>{estadoBadge(group.estado)}</td>
      </tr>

      {/* Expanded Detail Rows */}
      {isExpanded && (
        <tr>
          <td colSpan="9" style={{ padding: 0, background: 'rgba(99,102,241,0.03)' }}>
            <div style={{ padding: '8px 24px 16px 60px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Detalle de liquidaciones · Grupo {group.numero_grupo}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Período</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Operadora</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Líneas (Plan)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Facturado</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Abonado</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Saldo</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Estado</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {group.liquidaciones.map(liq => {
                    const f = parseFloat(liq.monto_total_facturado) || 0;
                    const a = parseFloat(liq.monto_abonado) || 0;
                    const s = f - a;
                    const liqLines = (group.lines || []).filter(l => l.proveedor_id === liq.proveedor_id);
                    return (
                      <tr key={liq.liquidacion_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: '13px' }}>{liq.periodo}</td>
                        <td style={{ padding: '8px 12px' }}>{provBadge(liq.proveedores?.nombre)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {liqLines.map(l => (
                              <div key={l.numero_linea} style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                {l.numero_linea} <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>({l.proveedores?.nombre || 'S/P'} - {l.planes_abonos?.nombre_plan || 'S/D'})</span>
                              </div>
                            ))}
                            {liqLines.length === 0 && (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontStyle: 'italic' }}>Sin líneas activas</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: '13px' }}>${fmt(f)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontSize: '13px', color: '#10b981' }}>${fmt(a)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: '13px', color: s > 0.05 ? 'var(--danger)' : 'var(--text-primary)' }}>
                          ${fmt(Math.max(0, s))}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{liqStatusBadge(liq)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <button 
                            onClick={(e) => { e.stopPropagation(); onEditLiq(liq); }} 
                            className="icon-button-edit" 
                            style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px' }}>
                            <Edit2 size={12} style={{ color: 'var(--text-secondary)' }} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});
GroupRow.displayName = 'GroupRow';
