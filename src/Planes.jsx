import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { 
  Search, Edit2, Plus, Database, Smartphone, 
  Globe, Save, X, Filter, TrendingDown, TrendingUp, 
  ShieldCheck, Loader2, RefreshCw, Hash, Phone, Link2, Unlink, PlusCircle
} from 'lucide-react';
import Modal from './components/Modal';

export default function Planes({ hideHeader = false }) {
  const [planes, setPlanes] = useState([]);
  const [counts, setCounts] = useState({});
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortCol, setSortCol] = useState('proveedor');
  const [sortDir, setSortDir] = useState('asc');
  const [filterProv, setFilterProv] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('catalog');
  const [selectedHistoryPlanId, setSelectedHistoryPlanId] = useState('');
  const [planHistoryData, setPlanHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [planAverages, setPlanAverages] = useState({});

  // Subplan Linking state
  const [subplanModalOpen, setSubplanModalOpen] = useState(false);
  const [subplanTargetPlan, setSubplanTargetPlan] = useState(null);
  const [subplanMode, setSubplanMode] = useState('create'); // 'create' | 'existing'
  const [existingSubplanId, setExistingSubplanId] = useState('');
  const [newSubplanName, setNewSubplanName] = useState('');
  const [newSubplanPrecio, setNewSubplanPrecio] = useState('');
  const [newSubplanTarifaAunar, setNewSubplanTarifaAunar] = useState('');
  const [subplanSaving, setSubplanSaving] = useState(false);

  function getCurrentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  useEffect(() => {
    fetchPlanes();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'history' && selectedHistoryPlanId) {
      fetchPlanHistory(selectedHistoryPlanId);
    } else {
      setPlanHistoryData([]);
    }
  }, [activeSubTab, selectedHistoryPlanId]);

  async function fetchPlanHistory(planId) {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('precios_auditoria_periodo')
        .select('*')
        .eq('plan_id', parseInt(planId, 10))
        .order('periodo', { ascending: true });

      if (error) throw error;

      // Calcular aumentos respecto al periodo anterior
      const calculated = (data || []).map((curr, idx, arr) => {
        let increasePctLista = 0;
        let increasePctAunar = 0;
        if (idx > 0) {
          const prev = arr[idx - 1];
          const prevPriceLista = parseFloat(prev.precio_lista) || 0;
          const currPriceLista = parseFloat(curr.precio_lista) || 0;
          if (prevPriceLista > 0) {
            increasePctLista = ((currPriceLista - prevPriceLista) / prevPriceLista) * 100;
          }

          const prevPriceAunar = parseFloat(prev.tarifa_aunar) || 0;
          const currPriceAunar = parseFloat(curr.tarifa_aunar) || 0;
          if (prevPriceAunar > 0) {
            increasePctAunar = ((currPriceAunar - prevPriceAunar) / prevPriceAunar) * 100;
          }
        }
        return {
          ...curr,
          increasePctLista,
          increasePctAunar
        };
      });

      setPlanHistoryData(calculated.reverse());
    } catch (err) {
      console.error('Error al cargar historial del plan:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function fetchPlanes() {
    setLoading(true);
    const { data: planesData, error } = await supabase
      .from('planes_abonos')
      .select(`
        *,
        proveedores(nombre),
        subplan_linea_fija:subplan_linea_fija_id(plan_id, nombre_plan, precio, tarifa_aunar)
      `)
      .order('proveedor_id', { ascending: true })
      .order('precio', { ascending: true });

    if (error) console.error(error);

    // Cargar la totalidad de las líneas asignadas a planes con paginación continua (Superando el límite de 1000)
    let allLineas = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data: chunk, error: chunkErr } = await supabase
        .from('lineas')
        .select('plan_id, numero_linea')
        .range(from, from + step - 1);
      
      if (chunkErr) { console.error('Error al cargar paquete de líneas:', chunkErr); break; }
      if (!chunk || chunk.length === 0) break;
      allLineas.push(...chunk);
      if (chunk.length < step) break;
      from += step;
    }

    const countsMap = {};
    const lineToPlan = {};
    allLineas.forEach(l => {
      if (l.plan_id) {
        countsMap[l.plan_id] = (countsMap[l.plan_id] || 0) + 1;
        if (l.numero_linea) {
          lineToPlan[l.numero_linea] = l.plan_id;
        }
      }
    });

    // Cargar promedios de consumos mensuales
    const { data: consumosData } = await supabase
      .from('consumos_mensuales')
      .select('numero_linea, costo_abono_real, tarifa_aunar_aplicada, periodo')
      .range(0, 4999);

    const planPeriodData = {};
    consumosData?.forEach(c => {
      const planId = lineToPlan[c.numero_linea];
      if (planId && c.periodo) {
        if (!planPeriodData[planId]) {
          planPeriodData[planId] = {};
        }
        if (!planPeriodData[planId][c.periodo]) {
          planPeriodData[planId][c.periodo] = { totalCosto: 0, totalAunar: 0, count: 0 };
        }
        planPeriodData[planId][c.periodo].totalCosto += Number(c.costo_abono_real) || 0;
        planPeriodData[planId][c.periodo].totalAunar += Number(c.tarifa_aunar_aplicada) || 0;
        planPeriodData[planId][c.periodo].count++;
      }
    });

    const averagesMap = {};
    Object.entries(planPeriodData).forEach(([planId, periods]) => {
      const sortedPeriods = Object.keys(periods).sort().reverse();
      const latestPeriod = sortedPeriods[0];
      if (latestPeriod) {
        const stats = periods[latestPeriod];
        averagesMap[planId] = {
          periodo: latestPeriod,
          avgCostoReal: stats.count > 0 ? (stats.totalCosto / stats.count) : 0,
          avgTarifaAunar: stats.count > 0 ? (stats.totalAunar / stats.count) : 0,
        };
      }
    });

    setPlanes(planesData || []);
    setCounts(countsMap);
    setPlanAverages(averagesMap);
    setLoading(false);
  }

  function openSubplanModal(plan) {
    setSubplanTargetPlan(plan);
    if (plan.subplan_linea_fija_id) {
      setSubplanMode('existing');
      setExistingSubplanId(String(plan.subplan_linea_fija_id));
    } else {
      setSubplanMode('create');
      setExistingSubplanId('');
      setNewSubplanName(`${plan.nombre_plan.trim()} - Línea Fija`);
      setNewSubplanPrecio('0');
      setNewSubplanTarifaAunar('0');
    }
    setSubplanModalOpen(true);
  }

  async function handleSaveSubplan(e) {
    e.preventDefault();
    if (!subplanTargetPlan) return;
    setSubplanSaving(true);
    try {
      if (subplanMode === 'create') {
        const { data: newSubplan, error: insertErr } = await supabase
          .from('planes_abonos')
          .insert([{
            nombre_plan: newSubplanName,
            precio: parseFloat(newSubplanPrecio) || 0,
            tarifa_aunar: parseFloat(newSubplanTarifaAunar) || 0,
            gb_incluidos: 0,
            proveedor_id: subplanTargetPlan.proveedor_id,
            es_linea_fija: true,
            plan_padre_id: subplanTargetPlan.plan_id
          }])
          .select('plan_id')
          .single();

        if (insertErr) throw insertErr;

        const { error: updateErr } = await supabase
          .from('planes_abonos')
          .update({ subplan_linea_fija_id: newSubplan.plan_id })
          .eq('plan_id', subplanTargetPlan.plan_id);

        if (updateErr) throw updateErr;

      } else if (subplanMode === 'existing') {
        if (!existingSubplanId) {
          alert('Por favor selecciona un subplan de la lista');
          setSubplanSaving(false);
          return;
        }
        const { error: updateErr } = await supabase
          .from('planes_abonos')
          .update({ subplan_linea_fija_id: parseInt(existingSubplanId, 10) })
          .eq('plan_id', subplanTargetPlan.plan_id);

        if (updateErr) throw updateErr;
      }

      setSubplanModalOpen(false);
      fetchPlanes();
    } catch (err) {
      alert('Error al guardar subplan: ' + err.message);
    } finally {
      setSubplanSaving(false);
    }
  }

  async function handleUnlinkSubplan() {
    if (!subplanTargetPlan) return;
    if (!confirm(`¿Desvincular el subplan de línea fija para ${subplanTargetPlan.nombre_plan}?`)) return;
    setSubplanSaving(true);
    try {
      const { error } = await supabase
        .from('planes_abonos')
        .update({ subplan_linea_fija_id: null })
        .eq('plan_id', subplanTargetPlan.plan_id);

      if (error) throw error;
      setSubplanModalOpen(false);
      fetchPlanes();
    } catch (err) {
      alert('Error al desvincular subplan: ' + err.message);
    } finally {
      setSubplanSaving(false);
    }
  }

  async function handleQuickLinkClaroComboSubplans() {
    setLoading(true);
    try {
      const planA100E = planes.find(p => p.nombre_plan.trim().toUpperCase() === 'A100E');
      const plan3MC26 = planes.find(p => p.nombre_plan.trim().toUpperCase() === '3MC26');

      const targets = [
        { plan: planA100E, defaultName: 'A100E - Línea Fija' },
        { plan: plan3MC26, defaultName: '3MC26 - Línea Fija' }
      ].filter(t => t.plan);

      if (targets.length === 0) {
        alert('No se encontraron los planes A100E o 3MC26 en el catálogo.');
        return;
      }

      for (const t of targets) {
        if (!t.plan.subplan_linea_fija_id) {
          const { data: newSub, error: subErr } = await supabase
            .from('planes_abonos')
            .insert([{
              nombre_plan: t.defaultName,
              precio: 0,
              tarifa_aunar: 0,
              gb_incluidos: 0,
              proveedor_id: t.plan.proveedor_id,
              es_linea_fija: true,
              plan_padre_id: t.plan.plan_id
            }])
            .select('plan_id')
            .single();

          if (subErr) throw subErr;

          const { error: linkErr } = await supabase
            .from('planes_abonos')
            .update({ subplan_linea_fija_id: newSub.plan_id })
            .eq('plan_id', t.plan.plan_id);

          if (linkErr) throw linkErr;
        }
      }

      fetchPlanes();
      alert('Subplanes de Línea Fija vinculados exitosamente para A100E y 3MC26.');
    } catch (err) {
      alert('Error en vinculación rápida: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function SortIcon({ col }) {
    if (col === 'proveedor') {
      return (
        <span 
          onClick={(e) => {
            if (filterProv) {
              e.stopPropagation();
              setFilterProv('');
            }
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            marginLeft: '8px', padding: '2px 8px', borderRadius: '6px',
            fontSize: '10px', fontWeight: 800,
            background: filterProv ? 'var(--accent)' : 'var(--surface)',
            color: filterProv ? 'white' : 'var(--text-secondary)',
            border: '1px solid var(--border-light)',
            whiteSpace: 'nowrap',
            cursor: 'pointer'
          }}
        >
          <Filter size={12} />
          <span>{filterProv || ''}</span>
          {filterProv && <X size={10} style={{ marginLeft: '4px' }} />}
        </span>
      );
    }
    const isActive = sortCol === col;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginLeft: '6px', padding: '1px 5px', borderRadius: '4px',
        fontSize: '10px', fontWeight: 900,
        background: isActive ? 'var(--accent)' : 'var(--surface)',
        color: isActive ? 'white' : 'var(--text-secondary)',
        border: '1px solid var(--border-light)',
        transition: 'all 0.15s',
      }}>
        {isActive ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    );
  }

  function handleSort(col) {
    if (col === 'proveedor') {
      const provs = ['', 'CLARO', 'MOVISTAR', 'PERSONAL'];
      const idx = provs.indexOf(filterProv);
      setFilterProv(provs[(idx + 1) % provs.length]);
      return;
    }
    const newDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc';
    setSortCol(col);
    setSortDir(newDir);
  }

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target);
    const updatedData = {
      nombre_plan: formData.get('nombre_plan'),
      precio: parseFloat(formData.get('precio')),
      tarifa_aunar: parseFloat(formData.get('tarifa_aunar') || 0),
      mutual_margen_pct: parseFloat(formData.get('mutual_margen_pct') || 0),
      descuento_operadora_pct: parseFloat(formData.get('descuento_operadora_pct') || 0),
      gb_incluidos: parseFloat(formData.get('gb_incluidos')),
      proveedor_id: parseInt(formData.get('proveedor_id')),
      es_plan_internet: formData.get('es_plan_internet') === 'true'
    };

    try {
      let finalPlanId = editingPlan?.plan_id;
      if (editingPlan) {
        const { error: err1 } = await supabase.from('planes_abonos').update(updatedData).eq('plan_id', editingPlan.plan_id);
        if (err1) throw err1;
        
        if (updatedData.tarifa_aunar !== editingPlan.tarifa_aunar) {
          const { error: err2 } = await supabase.from('planes_abonos').update({ tarifa_aunar: updatedData.tarifa_aunar }).eq('proveedor_id', updatedData.proveedor_id);
          if (err2) throw err2;
        }
      } else {
        const { data: insertData, error: insertErr } = await supabase.from('planes_abonos').insert([updatedData]).select('plan_id').single();
        if (insertErr) throw insertErr;
        finalPlanId = insertData?.plan_id;
      }

      if (finalPlanId) {
        const currentPeriod = getCurrentPeriod();
        const { error: upsertErr } = await supabase
          .from('precios_auditoria_periodo')
          .upsert({
            periodo: currentPeriod,
            plan_id: finalPlanId,
            precio_lista: updatedData.precio,
            tarifa_aunar: updatedData.tarifa_aunar
          }, { onConflict: 'periodo,plan_id' });
        if (upsertErr) throw upsertErr;
      }

      setIsModalOpen(false);
      setEditingPlan(null);
      fetchPlanes();
    } catch (error) {
      alert('Error al guardar plan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredPlanes = planes
    .filter(p => {
      const matchSearch = p.nombre_plan.toLowerCase().includes(search.toLowerCase()) ||
                          p.proveedores?.nombre?.toLowerCase().includes(search.toLowerCase());
      const matchProv = !filterProv || p.proveedores?.nombre?.toUpperCase() === filterProv;
      return matchSearch && matchProv;
    })
    .sort((a, b) => {
      let valA, valB;
      if (sortCol === 'datos') { valA = a.gb_incluidos; valB = b.gb_incluidos; }
      else if (sortCol === 'lineas') { valA = counts[a.plan_id] || 0; valB = counts[b.plan_id] || 0; }
      else if (sortCol === 'costo') { valA = a.precio; valB = b.precio; }
      else if (sortCol === 'proveedor') { valA = a.proveedores?.nombre || ''; valB = b.proveedores?.nombre || ''; }
      else { return 0; }
      if (typeof valA === 'string') return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

  const stats = {
    totalPlanes: planes.length,
    totalLineas: Object.values(counts).reduce((a, b) => a + b, 0),
    recaudacionEstimada: planes.reduce((acc, p) => {
      const precioBase = Number(p.precio) || 0;
      return acc + Math.round(precioBase * (counts[p.plan_id] || 0) * 100);
    }, 0) / 100
  };

  const handleMassIncrease = async (pct) => {
    if (!confirm(`¿Aplicar un aumento del ${pct}% a TODOS los planes?`)) return;
    setLoading(true);
    try {
      const { data: allPlanes, error: fetchError } = await supabase.from('planes_abonos').select('*');
      if (fetchError) throw fetchError;
      
      const currentPeriod = getCurrentPeriod();

      await Promise.all((allPlanes || []).map(async (plan) => {
        const newPrice = parseFloat(plan.precio) * (1 + (pct / 100));
        
        const { error: err1 } = await supabase.from('planes_abonos').update({ precio: newPrice }).eq('plan_id', plan.plan_id);
        if (err1) throw err1;

        const { error: err2 } = await supabase
          .from('precios_auditoria_periodo')
          .upsert({
            periodo: currentPeriod,
            plan_id: plan.plan_id,
            precio_lista: newPrice,
            tarifa_aunar: plan.tarifa_aunar
          }, { onConflict: 'periodo,plan_id' });
        if (err2) throw err2;
      }));
      
      fetchPlanes();
      alert('Aumento aplicado correctamente.');
    } catch (err) {
      alert('Error al aplicar aumento masivo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade" style={{ padding: hideHeader ? '0' : '24px' }}>
      
      {/* Header */}
      {!hideHeader && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{ background: 'var(--accent)', color: 'white', padding: '8px', borderRadius: '12px' }}><Database size={20} /></div>
              <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em' }}>Catálogo de Planes</h1>
            </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 500 }}>Administración de costos, datos y rentabilidad por abono</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            onClick={handleQuickLinkClaroComboSubplans} 
            disabled={loading}
            className="action-button" 
            style={{ 
              background: 'rgba(139, 92, 246, 0.12)', 
              color: '#8b5cf6', 
              border: '1px solid #8b5cf6', 
              borderRadius: '16px',
              padding: '12px 20px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <Phone size={18} />
            <span>Vincular Línea Fija (A100E / 3MC26)</span>
          </button>
          <button 
            onClick={() => handleMassIncrease(4.5)} 
            disabled={loading}
            className="action-button" 
            style={{ 
              background: 'var(--accent-light)', 
              color: 'var(--accent)', 
              border: '1px solid var(--accent)', 
              borderRadius: '16px',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            Aumento 4.5%
          </button>
          <button className="action-button" style={{ borderRadius: '16px', padding: '12px 24px' }} onClick={() => { setEditingPlan(null); setIsModalOpen(true); }}>
            <Plus size={18} style={{ marginRight: '8px' }} /> Nuevo Plan
          </button>
        </div>
      </div>
      )}

      {/* KPI Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>PLANES ACTIVOS</span>
            <Database size={16} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900 }}>{stats.totalPlanes}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>En catálogo</div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>LÍNEAS REALES</span>
            <Smartphone size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900 }}>{stats.totalLineas}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Vinculadas a planes</div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>RECAUDACIÓN ESTIMADA</span>
            <TrendingUp size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900 }}>${stats.recaudacionEstimada.toLocaleString('es-AR')}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Base mensual bruta</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveSubTab('catalog')}
          className={`nav-pill ${activeSubTab === 'catalog' ? 'active' : ''}`}
          style={{ 
            border: 'none', 
            background: activeSubTab === 'catalog' ? 'var(--accent)' : 'transparent',
            color: activeSubTab === 'catalog' ? 'white' : 'var(--text-secondary)',
            cursor: 'pointer', 
            padding: '10px 20px', 
            fontWeight: 700, 
            borderRadius: '10px', 
            fontSize: '14px',
            boxShadow: activeSubTab === 'catalog' ? '0 8px 18px -4px var(--accent-shadow)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          Catálogo de Planes
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`nav-pill ${activeSubTab === 'history' ? 'active' : ''}`}
          style={{ 
            border: 'none', 
            background: activeSubTab === 'history' ? 'var(--accent)' : 'transparent',
            color: activeSubTab === 'history' ? 'white' : 'var(--text-secondary)',
            cursor: 'pointer', 
            padding: '10px 20px', 
            fontWeight: 700, 
            borderRadius: '10px', 
            fontSize: '14px',
            boxShadow: activeSubTab === 'history' ? '0 8px 18px -4px var(--accent-shadow)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          Historial de Precios y Aumentos
        </button>
      </div>

      {activeSubTab === 'catalog' ? (
        /* Filters & Table */
        <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div className="search-bar" style={{ flex: 1 }}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Buscar por nombre de plan u operadora..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ background: 'none', border: 'none', outline: 'none', width: '100%' }}
              />
            </div>
            <button onClick={fetchPlanes} className="icon-button-edit" style={{ height: '42px', width: '42px', flexShrink: 0 }}>
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            {hideHeader && (
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button 
                  onClick={handleQuickLinkClaroComboSubplans}
                  disabled={loading}
                  className="action-button"
                  style={{
                    background: 'rgba(139, 92, 246, 0.12)',
                    color: '#8b5cf6',
                    border: '1px solid #8b5cf6',
                    borderRadius: '12px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Phone size={14} />
                  <span>Vincular Línea Fija</span>
                </button>
                <button 
                  onClick={() => handleMassIncrease(4.5)} 
                  disabled={loading}
                  className="action-button" 
                  style={{ 
                    background: 'var(--accent-light)', 
                    color: 'var(--accent)', 
                    border: '1px solid var(--accent)', 
                    borderRadius: '12px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    opacity: loading ? 0.6 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  Aumento 4.5%
                </button>
                <button 
                  className="action-button" 
                  style={{ borderRadius: '12px', padding: '8px 16px', fontSize: '13px' }} 
                  onClick={() => { setEditingPlan(null); setIsModalOpen(true); }}
                >
                  <Plus size={16} style={{ marginRight: '6px' }} /> Nuevo Plan
                </button>
              </div>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('proveedor')} style={{ cursor: 'pointer', padding: '16px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>Operadora <SortIcon col="proveedor" /></div>
                  </th>
                  <th>Nombre del Plan</th>
                  <th onClick={() => handleSort('datos')} style={{ cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>Datos <SortIcon col="datos" /></div>
                  </th>
                  <th onClick={() => handleSort('lineas')} style={{ cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>Líneas <SortIcon col="lineas" /></div>
                  </th>
                  <th style={{ textAlign: 'right' }}>Estructura de Costos</th>
                  <th style={{ textAlign: 'right', paddingRight: '24px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading && planes.length === 0 ? (
                  <tr><td colSpan="6" style={{ padding: '100px', textAlign: 'center' }}><Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent)' }} /></td></tr>
                ) : filteredPlanes.map(plan => {
                  const realCount = counts[plan.plan_id] || 0;
                  const averages = planAverages[plan.plan_id];
                  const isComboCandidate = plan.nombre_plan.includes('A100E') || plan.nombre_plan.includes('3MC26') || plan.es_plan_internet;
                  
                  return (
                    <tr key={plan.plan_id}>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{ 
                          fontSize: '10px', fontWeight: 900, padding: '4px 12px', borderRadius: '100px',
                          background: plan.proveedor_id === 1 ? '#ef44441a' : plan.proveedor_id === 2 ? '#f59e0b1a' : '#3b82f61a',
                          color: plan.proveedor_id === 1 ? '#ef4444' : plan.proveedor_id === 2 ? '#f59e0b' : '#3b82f6',
                          letterSpacing: '0.04em'
                        }}>
                          {plan.proveedores?.nombre?.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {plan.nombre_plan}
                            {plan.es_linea_fija && (
                              <span style={{ fontSize: '9px', fontWeight: 900, background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', padding: '2px 8px', borderRadius: '6px' }}>
                                SUBPLAN LÍNEA FIJA
                              </span>
                            )}
                          </div>

                          {/* Subplan badge */}
                          {plan.subplan_linea_fija ? (
                            <div 
                              onClick={() => openSubplanModal(plan)}
                              style={{ 
                                display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '4px', 
                                background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', 
                                padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, 
                                color: '#10b981', cursor: 'pointer', width: 'fit-content'
                              }}
                              title="Haz clic para modificar o desvincular el subplan de línea fija"
                            >
                              <Phone size={12} />
                              <span>Subplan LF: <strong>{plan.subplan_linea_fija.nombre_plan}</strong> (${Number(plan.subplan_linea_fija.precio).toLocaleString('es-AR')})</span>
                            </div>
                          ) : isComboCandidate && (
                            <div 
                              onClick={() => openSubplanModal(plan)}
                              style={{ 
                                display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', 
                                background: 'rgba(59, 130, 246, 0.08)', border: '1px dashed rgba(59, 130, 246, 0.3)', 
                                padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, 
                                color: '#3b82f6', cursor: 'pointer', width: 'fit-content'
                              }}
                              title="Haz clic para vincular o crear subplan de línea fija"
                            >
                              <PlusCircle size={12} />
                              <span>+ Vincular Línea Fija</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>{plan.gb_incluidos} GB</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 900, color: 'var(--accent)', fontSize: '16px' }}>{realCount}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <div style={{ fontWeight: 800, fontSize: '14px' }}>Prov: ${Number(plan.precio).toLocaleString('es-AR')}</div>
                          {averages && averages.avgCostoReal > 0 && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              Prom. Real: ${averages.avgCostoReal.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                            {plan.tarifa_aunar > 0 && <span style={{ fontSize: '9px', fontWeight: 900, background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '6px' }}>+${Number(plan.tarifa_aunar).toLocaleString('es-AR')} AU</span>}
                            {averages && averages.avgTarifaAunar > 0 && Math.round(averages.avgTarifaAunar) !== Math.round(plan.tarifa_aunar) && (
                              <span style={{ fontSize: '9px', fontWeight: 900, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '2px 6px', borderRadius: '6px' }}>
                                Prom. AU: ${averages.avgTarifaAunar.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                              </span>
                            )}
                            {plan.descuento_operadora_pct > 0 && <span style={{ fontSize: '9px', fontWeight: 900, background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '2px 6px', borderRadius: '6px' }}>-{plan.descuento_operadora_pct}% OP</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <div>
                            <div style={{ fontWeight: 900, fontSize: '16px' }}>${(Number(plan.precio) * (1 - (plan.descuento_operadora_pct / 100))).toLocaleString('es-AR')}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>Costo Liquidación</div>
                          </div>
                          
                          {/* Botón Vincular Subplan Línea Fija */}
                          <button 
                            className="icon-button-edit" 
                            title={plan.subplan_linea_fija ? `Gestionar Subplan LF (${plan.subplan_linea_fija.nombre_plan})` : "Vincular Subplan Línea Fija"} 
                            onClick={() => openSubplanModal(plan)}
                            style={{
                              background: plan.subplan_linea_fija ? 'rgba(16, 185, 129, 0.12)' : 'rgba(139, 92, 246, 0.12)',
                              color: plan.subplan_linea_fija ? '#10b981' : '#8b5cf6',
                              border: '1px solid ' + (plan.subplan_linea_fija ? 'rgba(16, 185, 129, 0.3)' : 'rgba(139, 92, 246, 0.3)')
                            }}
                          >
                            <Phone size={15} />
                          </button>

                          <button className="icon-button-edit" onClick={() => { setEditingPlan(plan); setIsModalOpen(true); }}><Edit2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Price History Tab */
        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
            <label style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Seleccionar Plan:</label>
            <select
              className="premium-input"
              style={{ width: '320px', padding: '10px 16px' }}
              value={selectedHistoryPlanId}
              onChange={(e) => setSelectedHistoryPlanId(e.target.value)}
            >
              <option value="">-- Seleccionar Plan --</option>
              {planes.map(p => (
                <option key={p.plan_id} value={p.plan_id}>
                  {p.proveedores?.nombre?.toUpperCase()} - {p.nombre_plan}
                </option>
              ))}
            </select>
          </div>

          {selectedHistoryPlanId ? (
            loadingHistory ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent)' }} />
              </div>
            ) : planHistoryData.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontStyle: 'italic', padding: '20px', textAlign: 'center' }}>
                No hay historial de precios registrado para este plan en el sistema.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th style={{ padding: '16px 24px' }}>Período</th>
                      <th style={{ textAlign: 'right' }}>Abono Prestadora (Sin Desc.)</th>
                      <th style={{ textAlign: 'right', paddingRight: '24px' }}>Abono Base (T. Aunar)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planHistoryData.map((hist, index) => (
                      <tr key={index}>
                        <td style={{ padding: '16px 24px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {hist.periodo}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <span style={{ fontWeight: 700 }}>
                              ${parseFloat(hist.precio_lista).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                            {hist.increasePctLista > 0 ? (
                              <span style={{ 
                                display: 'inline-flex', alignItems: 'center', gap: '2px',
                                fontSize: '10px', fontWeight: 900, background: 'rgba(16, 185, 129, 0.1)',
                                color: '#10b981', padding: '2px 6px', borderRadius: '6px'
                              }}>
                                <TrendingUp size={10} />
                                +{hist.increasePctLista.toFixed(1)}%
                              </span>
                            ) : hist.increasePctLista < 0 ? (
                              <span style={{ 
                                display: 'inline-flex', alignItems: 'center', gap: '2px',
                                fontSize: '10px', fontWeight: 900, background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444', padding: '2px 6px', borderRadius: '6px'
                              }}>
                                <TrendingDown size={10} />
                                {hist.increasePctLista.toFixed(1)}%
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                              ${parseFloat(hist.tarifa_aunar).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                            {hist.increasePctAunar > 0 ? (
                              <span style={{ 
                                display: 'inline-flex', alignItems: 'center', gap: '2px',
                                fontSize: '10px', fontWeight: 900, background: 'rgba(16, 185, 129, 0.1)',
                                color: '#10b981', padding: '2px 6px', borderRadius: '6px'
                              }}>
                                <TrendingUp size={10} />
                                +{hist.increasePctAunar.toFixed(1)}%
                              </span>
                            ) : hist.increasePctAunar < 0 ? (
                              <span style={{ 
                                display: 'inline-flex', alignItems: 'center', gap: '2px',
                                fontSize: '10px', fontWeight: 900, background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444', padding: '2px 6px', borderRadius: '6px'
                              }}>
                                <TrendingDown size={10} />
                                {hist.increasePctAunar.toFixed(1)}%
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontStyle: 'italic', padding: '40px', textAlign: 'center' }}>
              Selecciona un plan del menú desplegable para consultar su evolución histórica de precios.
            </div>
          )}
        </div>
      )}

      {/* Modal Editar / Crear Plan Base */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingPlan(null); }} title={editingPlan ? 'Configuración de Plan' : 'Nuevo Plan'}>
        <form key={editingPlan?.plan_id || 'new'} onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel-sub" style={{ padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Nombre del Plan</label>
              <input className="premium-input" style={{ width: '100%', padding: '12px' }} name="nombre_plan" defaultValue={editingPlan?.nombre_plan} required />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Costo Prov. ($)</label>
                <input className="premium-input" style={{ width: '100%', padding: '12px' }} name="precio" type="number" step="0.01" defaultValue={editingPlan?.precio} required />
              </div>
              <div>
                <label className="form-label">T. Aunar ($)</label>
                <input className="premium-input" style={{ width: '100%', padding: '12px' }} name="tarifa_aunar" type="number" step="0.01" defaultValue={editingPlan?.tarifa_aunar} required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Recargo Plan (%)</label>
                <input className="premium-input" style={{ width: '100%', padding: '12px' }} name="mutual_margen_pct" type="number" step="0.1" defaultValue={editingPlan?.mutual_margen_pct} required />
              </div>
              <div>
                <label className="form-label">Desc. OP (%)</label>
                <input className="premium-input" style={{ width: '100%', padding: '12px' }} name="descuento_operadora_pct" type="number" step="0.1" defaultValue={editingPlan?.descuento_operadora_pct} required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Datos (GB)</label>
                <input className="premium-input" style={{ width: '100%', padding: '12px' }} name="gb_incluidos" type="number" step="0.1" defaultValue={editingPlan?.gb_incluidos} required />
              </div>
              <div>
                <label className="form-label">Proveedor</label>
                <select className="premium-input" style={{ width: '100%', padding: '12px' }} name="proveedor_id" defaultValue={editingPlan?.proveedor_id} required>
                  <option value="1">Claro</option>
                  <option value="2">Movistar</option>
                  <option value="3">Personal</option>
                </select>
              </div>
            </div>
          </div>

          <button type="submit" className="action-button" style={{ width: '100%', padding: '16px', borderRadius: '16px' }}>
            <ShieldCheck size={18} style={{ marginRight: '8px' }} />
            {editingPlan ? 'Actualizar Plan' : 'Crear Plan'}
          </button>
        </form>
      </Modal>

      {/* Modal Vincular Subplan de Línea Fija */}
      <Modal 
        isOpen={subplanModalOpen} 
        onClose={() => { setSubplanModalOpen(false); setSubplanTargetPlan(null); }} 
        title={`Vincular Subplan de Línea Fija (${subplanTargetPlan?.nombre_plan?.trim()})`}
      >
        {subplanTargetPlan && (
          <form onSubmit={handleSaveSubplan} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel-sub" style={{ padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Selector de Modo */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSubplanMode('create')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid var(--border-light)',
                    fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                    background: subplanMode === 'create' ? 'var(--accent)' : 'var(--surface)',
                    color: subplanMode === 'create' ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  + Crear Nuevo Subplan
                </button>
                <button
                  type="button"
                  onClick={() => setSubplanMode('existing')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid var(--border-light)',
                    fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                    background: subplanMode === 'existing' ? 'var(--accent)' : 'var(--surface)',
                    color: subplanMode === 'existing' ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Seleccionar Existente
                </button>
              </div>

              {subplanMode === 'create' ? (
                <>
                  <div>
                    <label className="form-label">Nombre del Subplan de Línea Fija</label>
                    <input 
                      className="premium-input" 
                      style={{ width: '100%', padding: '12px' }} 
                      value={newSubplanName}
                      onChange={(e) => setNewSubplanName(e.target.value)}
                      placeholder="Ej: A100E - Línea Fija"
                      required 
                    />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label className="form-label">Costo Prov. ($)</label>
                      <input 
                        className="premium-input" 
                        style={{ width: '100%', padding: '12px' }} 
                        type="number" 
                        step="0.01"
                        value={newSubplanPrecio}
                        onChange={(e) => setNewSubplanPrecio(e.target.value)}
                        required 
                      />
                    </div>
                    <div>
                      <label className="form-label">T. Aunar ($)</label>
                      <input 
                        className="premium-input" 
                        style={{ width: '100%', padding: '12px' }} 
                        type="number" 
                        step="0.01"
                        value={newSubplanTarifaAunar}
                        onChange={(e) => setNewSubplanTarifaAunar(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="form-label">Seleccionar Plan de Línea Fija Existente</label>
                  <select
                    className="premium-input"
                    style={{ width: '100%', padding: '12px' }}
                    value={existingSubplanId}
                    onChange={(e) => setExistingSubplanId(e.target.value)}
                    required
                  >
                    <option value="">-- Seleccionar Plan --</option>
                    {planes
                      .filter(p => p.plan_id !== subplanTargetPlan.plan_id)
                      .map(p => (
                        <option key={p.plan_id} value={p.plan_id}>
                          {p.nombre_plan} ({p.proveedores?.nombre}) - ${Number(p.precio).toLocaleString('es-AR')}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              {subplanTargetPlan.subplan_linea_fija_id && (
                <button 
                  type="button" 
                  onClick={handleUnlinkSubplan}
                  disabled={subplanSaving}
                  style={{ 
                    padding: '14px 20px', borderRadius: '16px', border: '1px solid #ef4444', 
                    background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 800, cursor: 'pointer' 
                  }}
                >
                  Desvincular
                </button>
              )}
              <button 
                type="submit" 
                disabled={subplanSaving}
                className="action-button" 
                style={{ flex: 1, padding: '14px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {subplanSaving ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                <span>Guardar Vinculación</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

    </div>
  );
}
