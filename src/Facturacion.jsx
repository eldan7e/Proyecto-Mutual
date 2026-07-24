import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { 
  Search, FileText, Smartphone, TrendingUp, ChevronDown, ChevronUp, 
  Database, Zap, CheckCircle2, AlertCircle, 
  Trash2, Edit2, ArrowRight, Calendar, ArrowRightLeft, ChevronRight, X,
  Filter, MoreHorizontal, LayoutGrid, List, BarChart3, Download,
  Loader2, Users, ArrowUpDown, AlertTriangle, Clock
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { calculateAuditLine } from './utils/auditEngine';
import { buildResumenRows, buildSociosRows } from './utils/csvFormatters';
import { useToast } from './components/ui/ToastProvider';
import { exportToCSV } from './utils/browserDownload';
import useDebounce from './hooks/useDebounce';
import { fetchSocioLiquidaciones as fetchSocioLiquidacionesService } from './services/auditoriaDataService';
import { fetchLiquidaciones, deleteBatch } from './services/facturacionService';
import useFacturacionData from './hooks/useFacturacionData';
import useTableFilters from './hooks/useTableFilters';
import HistorialLotes from './components/Facturacion/HistorialLotes';
import LiquidacionesSocio from './components/Facturacion/LiquidacionesSocio';
import ResumenGrupos from './components/Facturacion/ResumenGrupos';

const PROV_IDS = { 'CLARO': 1, 'MOVISTAR': 2, 'PERSONAL': 3 };

// Components
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="bento-card" style={{ width: '100%', maxWidth: '500px', padding: '24px', position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', border: 'none', background: 'rgba(0,0,0,0.05)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
        <h2 style={{ fontSize: '22px', fontWeight: 900, marginBottom: '24px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{title}</h2>
        {children}
      </div>
    </div>
  );
};

export default function Facturacion() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'historial');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [filterProv, setFilterProv] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});

  const updateParams = (updates) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, val]) => {
        if (val === undefined || val === null || val === '') {
          next.delete(key);
        } else {
          next.set(key, val);
        }
      });
      return next;
    });
  };

  // Cargar períodos disponibles con React Query desde la vista de períodos únicos (evita el límite de 1000 filas)
  const { data: periods = [] } = useQuery({
    queryKey: ['periods'],
    queryFn: async () => {
      const { data, error } = await supabase.from('unique_periods_view').select('periodo');
      if (error) throw error;
      return (data || []).map(d => d.periodo).filter(Boolean);
    },
    staleTime: 10 * 1000,
  });

  // Establecer período predeterminado o corregir período inválido
  useEffect(() => {
    if (periods.length > 0) {
      const currentPeriod = searchParams.get('periodo');
      if (!currentPeriod || !periods.includes(currentPeriod)) {
        updateParams({ periodo: periods[0] });
      }
    }
  }, [periods]);

  // Cargar liquidaciones principales filtradas con React Query (soporta parámetros de periodo y operadora)
  const { data: liquidaciones = [], isLoading: liquidacionesLoading } = useQuery({
    queryKey: ['liquidaciones', selectedPeriod, filterProv],
    queryFn: () => fetchLiquidaciones(selectedPeriod, filterProv),
    staleTime: 10 * 1000,
  });

  // Cargar liquidaciones detalladas de socios con React Query
  const { data: socioLiquidaciones = [], isLoading: socioLoading } = useQuery({
    queryKey: ['socioLiquidaciones', selectedPeriod, filterProv],
    queryFn: () => fetchSocioLiquidacionesService(selectedPeriod, filterProv),
    enabled: !!selectedPeriod && (activeTab === 'socios' || activeTab === 'resumen'),
    staleTime: 10 * 1000,
  });

  // Mutación para eliminar un lote completo
  const deleteMutation = useMutation({
    mutationFn: ({ periodo, provId }) => deleteBatch(periodo, provId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liquidaciones'] });
      queryClient.invalidateQueries({ queryKey: ['periods'] });
      queryClient.invalidateQueries({ queryKey: ['socioLiquidaciones'] });
      addToast('Lote eliminado correctamente', 'success');
    },
    onError: (err) => {
      addToast('Error al eliminar lote: ' + err.message, 'error');
    }
  });

  useEffect(() => {
    const tabParam = searchParams.get('tab') || 'historial';
    if (['historial', 'resumen', 'socios'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
    const periodParam = searchParams.get('periodo') || '';
    setSelectedPeriod(periodParam);
    
    const provParam = searchParams.get('proveedor') || '';
    const provMap = { '1': 'CLARO', '2': 'MOVISTAR', '3': 'PERSONAL' };
    setFilterProv(provMap[provParam] || '');
  }, [searchParams]);

  const {
    filteredLiquidaciones,
    stats,
    batches,
    liquidacionesAgrupadas,
    totalSocioCobrar,
    totalFacturaSinCalcular
  } = useFacturacionData(liquidaciones, socioLiquidaciones, activeTab, selectedPeriod, filterProv, debouncedSearch);

  const socioFilterOptions = useMemo(() => ({
    initialSortKey: 'totalCobrar',
    initialSortDirection: 'desc',
    searchFields: [
      (item) => item.numero_linea,
      (item) => item.lineas?.socios?.nombre_completo,
      (item) => item.lineas?.planes_abonos?.nombre_plan
    ],
    providerField: 'proveedor_id',
    getSortValue: (item, key) => {
      switch (key) {
        case 'socio': return item.lineas?.socios?.nombre_completo || '';
        case 'linea': return item.numero_linea || '';
        case 'baseAb': return (item.calculado?.baseAb || 0) + (item.calculado?.cAdmin || 0) + (item.calculado?.cIVA || 0) + (item.calculado?.tarifaAunar || 0);
        case 'extras': return item.calculado?.extraAmount || 0;
        case 'descuentos': return item.calculado?.bonifManual || 0;
        case 'totalCobrar': return item.calculado?.totalCobrar || 0;
        default: return item[key] || 0;
      }
    }
  }), []);

  const {
    sortConfig,
    setSortConfig,
    setSearch: setTableSearch,
    filteredAndSortedData: sortedSocioData
  } = useTableFilters(socioLiquidaciones, socioFilterOptions);

  // Pass global debouncedSearch to table filters
  useEffect(() => {
    if (setTableSearch) setTableSearch(debouncedSearch);
  }, [debouncedSearch, setTableSearch]);

  async function handleDeleteBatch(periodo, provId) {
    if (!confirm(`¿Eliminar TODO el lote de este periodo? Esta acción es irreversible.`)) return;
    deleteMutation.mutate({ periodo, provId });
  }

  function exportResumenToCSV() {
    if (liquidacionesAgrupadas.length === 0) return;
    const headers = ["Grupo", "Responsable (Socio)", "Lineas", "Total a Cobrar", "Estado"];
    const rows = buildResumenRows(liquidacionesAgrupadas);
    exportToCSV(headers, rows, `resumen_grupos_${selectedPeriod || 'lote'}.csv`);
  }

  function exportSociosToCSV() {
    if (sortedSocioData.length === 0) return;
    const headers = ["Socio", "Nro Socio", "Linea", "Plan", "Abono Base", "Cargos Extra", "Descuentos", "Total a Cobrar"];
    const rows = buildSociosRows(sortedSocioData);
    exportToCSV(headers, rows, `liquidaciones_socios_${selectedPeriod || 'periodo'}.csv`);
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* Header Premium */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span className="category-label">Gestión Financiera</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700 }}>
              <Clock size={14} /> Sistema en Tiempo Real
            </div>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
            Facturación & Lotes
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <div className="search-bar" style={{ width: '320px' }}>
            <Search size={18} />
            <input 
              placeholder="Buscar por socio, grupo o línea..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
          <select 
            key={periods.length}
            className="btn-ghost notranslate"
            translate="no"
            value={selectedPeriod} 
            onChange={e => updateParams({ periodo: e.target.value })}
            style={{ fontWeight: 700 }}
          >
            <option value="" className="notranslate" translate="no">Todos los Períodos</option>
            {(periods || []).map(p => <option key={p} value={p} className="notranslate" translate="no">{p}</option>)}
          </select>
          <select 
            className="btn-ghost" 
            value={filterProv} 
            onChange={e => {
              const provMapRev = { 'CLARO': '1', 'MOVISTAR': '2', 'PERSONAL': '3' };
              updateParams({ proveedor: provMapRev[e.target.value] || '' });
            }}
            style={{ fontWeight: 700 }}
          >
            <option value="">Todas las Operadoras</option>
            <option value="CLARO">Claro</option>
            <option value="MOVISTAR">Movistar</option>
            <option value="PERSONAL">Personal</option>
          </select>
        </div>
      </div>

      {/* Banner: sin datos para el período seleccionado */}
      {!liquidacionesLoading && selectedPeriod && liquidaciones.length === 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '16px 24px', marginBottom: '24px',
          background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: '16px', color: '#92400e', fontSize: '14px', fontWeight: 600
        }}>
          <AlertTriangle size={20} style={{ color: '#eab308', flexShrink: 0 }} />
          <div>
            <strong>Sin datos para el período {selectedPeriod}{filterProv ? ` (${filterProv})` : ''}.</strong>
            {' '}Verificá que la factura haya sido cargada en <em>Carga Manual</em> y liquidada desde <em>Gestión de Pagos</em>.
            {periods.length > 0 && (
              <span> Último período disponible: <strong>{periods[0]}</strong>.</span>
            )}
          </div>
        </div>
      )}

      {/* KPI Dashboard — 3 tarjetas principales */}
      <div className="bento-grid" style={{ marginBottom: '48px', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="bento-card" style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #1b5e20 100%)', color: 'white', border: 'none', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ opacity: 0.8, fontSize: '13px', fontWeight: 800, textTransform: 'uppercase' }}>Recaudación Total</div>
            <TrendingUp size={20} />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, marginBottom: '4px' }}>
            ${stats.totalCobrar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {totalSocioCobrar > 0 && Math.abs(stats.totalCobrar - totalSocioCobrar) > 0.01 && (
            <div style={{ fontSize: '11px', opacity: 0.95, fontWeight: 700, marginTop: '2px', lineHeight: '1.2' }}>
              ${totalSocioCobrar.toLocaleString('es-AR', { minimumFractionDigits: 2 })} socios + ${(stats.totalCobrar - totalSocioCobrar).toLocaleString('es-AR', { minimumFractionDigits: 2 })} tasas débito
            </div>
          )}
          <div style={{ fontSize: '12px', opacity: 0.7, fontWeight: 600 }}>
            {selectedPeriod ? `Período ${selectedPeriod}` : `Histórico (${stats.targetPeriodUsed || 'Actual'})`}
          </div>
          <div style={{ marginTop: '24px', height: '6px', background: 'rgba(255,255,255,0.2)', borderRadius: '10px' }}>
            <div style={{ width: `${(stats.totalPagado / (stats.totalCobrar || 1)) * 100}%`, height: '100%', background: 'white', borderRadius: '10px' }} />
          </div>
        </div>

        <div className="bento-card" style={{ padding: '20px' }}>
          <div className="bento-card-title">Costo Operadoras</div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)' }}>${stats.totalCosto.toLocaleString('es-AR')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', color: '#ef4444', fontWeight: 700, fontSize: '12px' }}>
            <ArrowRight size={14} /> Con descuento aplicado
          </div>
        </div>

        <div className="bento-card" style={{ padding: '20px' }}>
          <div className="bento-card-title">Margen de Gestión</div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--accent)' }}>
            ${(stats.totalMargenGestion || 0).toLocaleString('es-AR')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', color: 'var(--accent)', fontWeight: 700, fontSize: '12px' }}>
            <Zap size={14} /> Beneficio proyectado
          </div>
        </div>
      </div>

      {/* Tabs Custom */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', background: 'rgba(0,0,0,0.03)', padding: '6px', borderRadius: '18px', width: 'fit-content' }}>
        {[
          { id: 'historial', label: 'Historial de Lotes', icon: <LayoutGrid size={18} /> },
          { id: 'resumen', label: 'Resumen por Grupos', icon: <BarChart3 size={18} /> },
          { id: 'socios', label: 'Liquidaciones por Socio', icon: <Users size={18} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => updateParams({ tab: tab.id })}
            className={`nav-pill ${activeTab === tab.id ? 'active' : ''}`}
            style={{ border: 'none', cursor: 'pointer' }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content Render */}
      <div className="animate-fade">
        {(liquidacionesLoading || deleteMutation.isPending) && batches.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
            <Loader2 className="animate-spin" size={40} style={{ color: 'var(--accent)' }} />
          </div>
        ) : (
          <>
            {activeTab === 'historial' && (
              <HistorialLotes
                batches={batches}
                navigate={navigate}
                setSearchParams={setSearchParams}
                handleDeleteBatch={handleDeleteBatch}
                stats={stats}
              />
            )}

            {activeTab === 'resumen' && (
              <ResumenGrupos
                liquidacionesAgrupadas={liquidacionesAgrupadas}
                periods={periods}
                selectedPeriod={selectedPeriod}
                setSelectedPeriod={setSelectedPeriod}
                expandedGroups={expandedGroups}
                setExpandedGroups={setExpandedGroups}
                exportResumenToCSV={exportResumenToCSV}
                socioLiquidaciones={socioLiquidaciones}
                socioLoading={socioLoading}
              />
            )}

            {activeTab === 'socios' && (
              <LiquidacionesSocio
                sortedSocioData={sortedSocioData}
                socioLoading={socioLoading}
                search={search}
                sortConfig={sortConfig}
                setSortConfig={setSortConfig}
                filterProv={filterProv}
                periods={periods}
                selectedPeriod={selectedPeriod}
                setSelectedPeriod={setSelectedPeriod}
                setFilterProv={setFilterProv}
                totalSocioCobrar={totalSocioCobrar}
                totalFacturaSinCalcular={totalFacturaSinCalcular}
                exportSociosToCSV={exportSociosToCSV}
                totalLote={stats.totalCobrar}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
