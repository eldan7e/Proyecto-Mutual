import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { 
  Tag, Search, AlertCircle, CheckCircle2, TrendingDown, 
  Smartphone, Plus, Edit2, Trash2, X, Filter, Calendar, 
  Loader2, RefreshCw, ShieldCheck, UserCheck, CreditCard
} from 'lucide-react';
import Modal from './components/Modal';

const TIPOS = { DESCUENTO: 'DESCUENTO', CARGO: 'CARGO' };

const EMPTY_FORM = {
  tipo: 'DESCUENTO',
  descripcion: '',
  valor: '',
  cta_numero: 1,
  total_cuotas: 12,
  socio_id: '',
  numero_linea: '',
};

export default function Descuentos() {
  const [adicionales, setAdicionales] = useState([]);
  const [error, setError] = useState(null);
  const [socios, setSocios] = useState([]);
  const [lineasBySocio, setLineasBySocio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sortCol, setSortCol] = useState('restantes');
  const [sortDir, setSortDir] = useState('asc');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchAll();
  }, [debouncedSearch, filterTipo, mostrarInactivos, sortCol, sortDir]);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Adicionales con joins simplificados
      let query = supabase
        .from('adicionales')
        .select(`
          id, tipo, descripcion, valor, cta_numero, total_cuotas, activo,
          socios(socio_id, nombre_completo, nro_socio),
          lineas(
            numero_linea, 
            numero_grupo,
            socios(socio_id, nombre_completo, nro_socio),
            planes_abonos(nombre_plan),
            proveedores:proveedor_id(nombre)
          )
        `)
        .order('id', { ascending: false });
        
      if (!mostrarInactivos) {
        query = query.eq('activo', true);
      }

      const { data, error: supabaseError } = await query;

      if (supabaseError) {
        console.error("Error Fetching Adicionales:", supabaseError);
        setError("Error al cargar datos: " + supabaseError.message);
        
        // Fallback robusto por si fallan los joins profundos
        let fallbackQuery = supabase
          .from('adicionales')
          .select(`
            id, tipo, descripcion, valor, cta_numero, total_cuotas, activo,
            socios(socio_id, nombre_completo, nro_socio)
          `);
          
        if (!mostrarInactivos) {
          fallbackQuery = fallbackQuery.eq('activo', true);
        }
        
        const { data: fallback } = await fallbackQuery;
        
        applyFilters(fallback || []);
      } else {
        applyFilters(data || []);
      }
    } catch (err) {
      console.error("Error Crítico:", err);
      setError("Error crítico del sistema");
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(data) {
    if (!data) {
      setAdicionales([]);
      return;
    }
    let result = [...data];
    if (debouncedSearch) {
      const term = debouncedSearch.toLowerCase();
      result = result.filter(a => {
        const socio = a.socios || a.lineas?.socios || {};
        const nom = (socio.nombre_completo || '').toLowerCase();
        const dsc = (a.descripcion || '').toLowerCase();
        return nom.includes(term) || dsc.includes(term);
      });
    }
    if (filterTipo) {
      result = result.filter(a => a.tipo === filterTipo);
    }
    result = sortData(result, sortCol, sortDir);
    setAdicionales(result);
  }

  function sortData(data, col, dir) {
    if (!data) return [];
    return [...data].sort((a, b) => {
      const restA = Math.max(0, (a.total_cuotas || 0) - (a.cta_numero || 0));
      const restB = Math.max(0, (b.total_cuotas || 0) - (b.cta_numero || 0));
      let valA, valB;
      if (col === 'restantes') { valA = restA; valB = restB; }
      else if (col === 'valor') { valA = Number(a.valor || 0); valB = Number(b.valor || 0); }
      else if (col === 'socio') { 
        const socioA = a.socios || a.lineas?.socios || {};
        const socioB = b.socios || b.lineas?.socios || {};
        valA = socioA.nombre_completo || ''; 
        valB = socioB.nombre_completo || ''; 
      }
      else if (col === 'tipo') { valA = a.tipo || ''; valB = b.tipo || ''; }
      else if (col === 'proveedor') { valA = a.lineas?.proveedores?.nombre || ''; valB = b.lineas?.proveedores?.nombre || ''; }
      else { valA = restA; valB = restB; }
      
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
        return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return dir === 'asc' ? valA - valB : valB - valA;
    });
  }

  function handleSort(col) {
    if (col === 'tipo') {
      const nextFilter = filterTipo === '' ? 'DESCUENTO' : filterTipo === 'DESCUENTO' ? 'CARGO' : '';
      setFilterTipo(nextFilter);
      return;
    }
    const newDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc';
    setSortCol(col);
    setSortDir(newDir);
    setAdicionales(prev => sortData(prev, col, newDir));
  }

  function SortIcon({ col }) {
    if (col === 'tipo') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          marginLeft: '8px', padding: '2px 8px', borderRadius: '6px',
          fontSize: '10px', fontWeight: 800,
          background: filterTipo ? 'var(--accent)' : 'var(--surface)',
          color: filterTipo ? 'white' : 'var(--text-secondary)',
          border: '1px solid var(--border-light)',
          whiteSpace: 'nowrap'
        }}>
          {filterTipo === 'DESCUENTO' ? <TrendingDown size={12} /> : filterTipo === 'CARGO' ? <Smartphone size={12} /> : <Filter size={12} />}
          <span>{filterTipo === 'DESCUENTO' ? '%' : filterTipo === 'CARGO' ? '$' : ''}</span>
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

  async function fetchSocios() {
    const { data } = await supabase.from('socios').select('socio_id, nombre_completo').order('nombre_completo');
    setSocios(data || []);
  }

  async function fetchLineas(socioId) {
    if (!socioId) return;
    const { data } = await supabase.from('lineas').select('numero_linea, proveedores:proveedor_id(nombre)').eq('socio_id', socioId);
    setLineasBySocio(data || []);
  }

  async function handleAvanzarMes() {
    if (!window.confirm('¿Desea avanzar una cuota (1 mes) en todos los registros activos?')) return;
    setLoading(true);
    const { error } = await supabase.rpc('avanzar_cuotas_adicionales');
    if (error) alert('Error: ' + error.message);
    else await fetchAll();
    setLoading(false);
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditId(null);
    fetchSocios();
    setLineasBySocio([]);
    setIsModalOpen(true);
  }

  function openEdit(a) {
    setForm({
      tipo: a.tipo,
      descripcion: a.descripcion || '',
      valor: a.valor,
      cta_numero: a.cta_numero,
      total_cuotas: a.total_cuotas,
      socio_id: a.socios?.socio_id || '',
      numero_linea: a.lineas?.numero_linea || '',
    });
    setEditId(a.id);
    fetchSocios();
    if (a.socios?.socio_id) fetchLineas(a.socios.socio_id);
    setIsModalOpen(true);
  }

  async function handleDelete(a) {
    if (a.isFixed) {
      if (!window.confirm(`¿Desea eliminar la bonificación fija del 20% para ${a.socios.nombre_completo}?`)) return;
      await supabase.from('socios').update({ desc_adicionales: 0 }).eq('socio_id', a.socios.socio_id);
    } else {
      if (!window.confirm('¿Eliminar este registro?')) return;
      await supabase.from('adicionales').update({ activo: false }).eq('id', a.id);
    }
    fetchAll();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      tipo: form.tipo,
      descripcion: form.descripcion,
      valor: parseFloat(form.valor),
      cta_numero: parseInt(form.cta_numero),
      total_cuotas: parseInt(form.total_cuotas),
      socio_id: form.socio_id || null,
      numero_linea: form.numero_linea || null,
      activo: true,
      updated_at: new Date().toISOString(),
    };
    
    let error = null;
    if (editId) {
      const { error: updateError } = await supabase.from('adicionales').update(payload).eq('id', editId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('adicionales').insert([payload]);
      error = insertError;
    }
    
    setSaving(false);
    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      setIsModalOpen(false);
      fetchAll();
    }
  }

  const cuotasRestantes = (a) => Math.max(0, (a.total_cuotas || 0) - (a.cta_numero || 0));
  const progreso = (a) => a.total_cuotas > 0 ? Math.round(((a.cta_numero || 0) / a.total_cuotas) * 100) : 0;

  const stats = {
    descuentos: adicionales.filter(a => a.tipo === 'DESCUENTO').length,
    cargos: adicionales.filter(a => a.tipo === 'CARGO').length,
    porVencer: adicionales.filter(a => cuotasRestantes(a) <= 2).length,
    total: adicionales.length
  };

  return (
    <div className="animate-fade" style={{ padding: '0px' }}>
      
      {/* Header Simplificado para integración */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', animation: 'slideUpFade 0.5s ease-out' }}>
        <div>
          <h2 style={{ fontSize: '32px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Gestión de Adicionales</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginTop: '4px', fontWeight: 500 }}>Control de bonificaciones y cargos variables por socio/línea</p>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <button 
            onClick={handleAvanzarMes} 
            className="air-btn" 
            style={{ 
              background: 'var(--surface)', border: '1px solid var(--border-light)', 
              color: 'var(--text-primary)', height: '48px', padding: '0 24px',
              boxShadow: 'var(--shadow-soft)', transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 15px 30px -10px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-soft)'; }}
          >
            <Calendar size={18} style={{ marginRight: '8px' }} /> Avanzar Cuotas
          </button>
          <button 
            className="air-btn" 
            style={{ 
              background: 'linear-gradient(135deg, var(--accent) 0%, #16a34a 100%)', 
              color: 'white', height: '48px', padding: '0 24px', border: 'none',
              boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.4)', transition: 'all 0.2s'
            }} 
            onClick={openNew}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 15px 35px -5px rgba(34, 197, 94, 0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(34, 197, 94, 0.4)'; }}
          >
            <Plus size={18} style={{ marginRight: '8px' }} /> Nuevo Registro
          </button>
        </div>
      </div>

      {/* KPI Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        {[
          { label: 'DESCUENTOS ACTIVOS', value: stats.descuentos, icon: <TrendingDown size={20} />, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', desc: 'Bonificaciones a aplicar este mes', delay: '0.1s' },
          { label: 'CARGOS POR EQUIPO/EXTRAS', value: stats.cargos, icon: <Smartphone size={20} />, color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', desc: 'Registros con cargos fijos', delay: '0.2s' },
          { label: 'VENCIMIENTOS PRÓXIMOS', value: stats.porVencer, icon: <AlertCircle size={20} />, color: '#dc2626', bg: 'rgba(220, 38, 38, 0.1)', desc: 'Finalizan en 2 meses o menos', delay: '0.3s' },
        ].map((kpi, i) => (
          <div 
            key={i} 
            className="glass-panel" 
            style={{ 
              padding: '28px', borderRadius: '28px', borderLeft: `6px solid ${kpi.color}`,
              animation: `slideUpFade 0.5s ease-out ${kpi.delay} both`,
              transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              cursor: 'default'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0) scale(1)'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>{kpi.label}</span>
              <div style={{ background: kpi.bg, color: kpi.color, padding: '8px', borderRadius: '12px' }}>
                {kpi.icon}
              </div>
            </div>
            <div style={{ fontSize: '36px', fontWeight: 900, color: 'var(--text-primary)' }}>{kpi.value}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', fontWeight: 500 }}>{kpi.desc}</div>
          </div>
        ))}
      </div>

      {/* Filters & Table */}
      <div className="glass-panel" style={{ borderRadius: '28px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '20px', alignItems: 'center', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', background: 'var(--bg-app)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <button 
              onClick={() => setMostrarInactivos(false)} 
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: !mostrarInactivos ? 'var(--surface)' : 'transparent', color: !mostrarInactivos ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', boxShadow: !mostrarInactivos ? 'var(--shadow-soft)' : 'none', transition: 'all 0.2s' }}
            >
              Activos
            </button>
            <button 
              onClick={() => setMostrarInactivos(true)} 
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: mostrarInactivos ? 'var(--surface)' : 'transparent', color: mostrarInactivos ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', boxShadow: mostrarInactivos ? 'var(--shadow-soft)' : 'none', transition: 'all 0.2s' }}
            >
              Historial
            </button>
          </div>
          
          <div className="search-bar" style={{ flex: 1, height: '44px' }}>
            <Search size={18} />
            <input
              type="text"
              placeholder="Buscar socio o concepto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', width: '100%', fontWeight: 600, color: 'var(--text-primary)' }}
            />
          </div>
          <button onClick={fetchAll} className="icon-button-edit">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('tipo')} style={{ cursor: 'pointer', padding: '16px 24px', width: '80px' }}>
                    <SortIcon col="tipo" />
                </th>
                <th onClick={() => handleSort('socio')} style={{ cursor: 'pointer' }}>
                   Socio <SortIcon col="socio" />
                </th>
                <th onClick={() => handleSort('proveedor')} style={{ cursor: 'pointer' }}>
                   Línea / Operadora <SortIcon col="proveedor" />
                </th>
                <th>Concepto</th>
                <th onClick={() => handleSort('valor')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                   Valor <SortIcon col="valor" />
                </th>
                <th onClick={() => handleSort('restantes')} style={{ cursor: 'pointer', textAlign: 'center', minWidth: '130px' }}>
                   Estado Cuotas <SortIcon col="restantes" />
                </th>
                <th style={{ textAlign: 'right', paddingRight: '24px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>{error}</td></tr>
              )}
              {loading && adicionales.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '100px', textAlign: 'center' }}><Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent)' }} /></td></tr>
              ) : adicionales.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '100px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <AlertCircle size={48} style={{ opacity: 0.2 }} />
                      <span style={{ fontSize: '15px' }}>No se encontraron registros {mostrarInactivos ? 'en el historial' : 'activos'}.</span>
                    </div>
                  </td>
                </tr>
              ) : adicionales.map(a => {
                const rest = cuotasRestantes(a);
                const pct = progreso(a);
                const isD = a.tipo === 'DESCUENTO';
                return (
                  <tr key={a.id}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ 
                        width: '32px', height: '32px', borderRadius: '8px', 
                        background: isD ? 'rgba(16, 185, 129, 0.1)' : 'rgba(249, 115, 22, 0.1)',
                        color: isD ? '#10b981' : '#f97316',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {isD ? <TrendingDown size={16} /> : <Smartphone size={16} />}
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const socioData = a.socios || a.lineas?.socios;
                        return (
                          <>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '14px' }}>{socioData?.nombre_completo || 'Sin Asignar'}</div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>ID #{socioData?.nro_socio || '—'}</div>
                              {a.lineas?.numero_grupo && (
                                <div style={{ fontSize: '10px', background: 'var(--accent-light)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                  G{a.lineas.numero_grupo}
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '13px' }}>{a.lineas?.numero_linea || 'Global (Socio)'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '2px' }}>
                        {a.lineas?.planes_abonos?.nombre_plan || 'Sin Plan'} • {a.lineas?.proveedores?.nombre || '—'}
                      </div>
                    </td>
                    <td><div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{a.descripcion || 'Sin descripción'}</div></td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, fontSize: '17px', color: isD ? '#10b981' : '#f97316' }}>
                        {isD ? `-${a.valor}%` : `$${Number(a.valor).toLocaleString('es-AR')}`}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', minWidth: '130px' }}>
                      <div style={{ 
                        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: '10px'
                      }}>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)' }}>
                          Cuota {a.cta_numero} de {a.total_cuotas}
                        </div>
                        <div style={{ width: '60px', height: '4px', background: 'var(--border-light)', borderRadius: '10px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: isD ? '#10b981' : '#f97316', borderRadius: '10px' }}></div>
                        </div>
                      </div>
                    </td>
                    <td style={{ paddingRight: '24px' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className="icon-button-edit" onClick={() => openEdit(a)}><Edit2 size={16} /></button>
                        <button className="icon-button-delete" onClick={() => handleDelete(a)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editId ? 'Editar Adicional' : 'Nuevo Adicional'}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel-sub" style={{ padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Tipo de Movimiento</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button type="button" onClick={() => setForm({...form, tipo: 'DESCUENTO'})} style={{ padding: '12px', borderRadius: '12px', border: '1px solid var(--border-light)', background: form.tipo === 'DESCUENTO' ? 'var(--accent-light)' : 'var(--surface)', color: form.tipo === 'DESCUENTO' ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 800 }}>Descuento %</button>
                <button type="button" onClick={() => setForm({...form, tipo: 'CARGO'})} style={{ padding: '12px', borderRadius: '12px', border: '1px solid var(--border-light)', background: form.tipo === 'CARGO' ? 'rgba(249,115,22,0.1)' : 'var(--surface)', color: form.tipo === 'CARGO' ? '#f97316' : 'var(--text-secondary)', fontWeight: 800 }}>Cargo $</button>
              </div>
            </div>

            <div>
              <label className="form-label">Socio Beneficiario</label>
              <select className="premium-input" style={{ width: '100%', padding: '12px' }} value={form.socio_id} required onChange={e => { setForm({...form, socio_id: e.target.value, numero_linea: ''}); fetchLineas(e.target.value); }}>
                <option value="">Seleccionar socio...</option>
                {socios.map(s => <option key={s.socio_id} value={s.socio_id}>{s.nombre_completo}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Línea Aplicable (Opcional)</label>
              <select className="premium-input" style={{ width: '100%', padding: '12px' }} value={form.numero_linea} onChange={e => setForm({...form, numero_linea: e.target.value})}>
                <option value="">Todas las líneas</option>
                {lineasBySocio.map(l => <option key={l.numero_linea} value={l.numero_linea}>{l.numero_linea} · {l.proveedores?.nombre}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Concepto / Descripción</label>
                <input className="premium-input" style={{ width: '100%', padding: '12px' }} value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} placeholder="Ej: Bonificación Especial" />
              </div>
              <div>
                <label className="form-label">Valor</label>
                <input className="premium-input" style={{ width: '100%', padding: '12px' }} type="number" step="0.01" value={form.valor} required onChange={e => setForm({...form, valor: e.target.value})} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Cuota Inicial</label>
                <input className="premium-input" style={{ width: '100%', padding: '12px' }} type="number" value={form.cta_numero} required onChange={e => setForm({...form, cta_numero: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Total Cuotas</label>
                <input className="premium-input" style={{ width: '100%', padding: '12px' }} type="number" value={form.total_cuotas} required onChange={e => setForm({...form, total_cuotas: e.target.value})} />
              </div>
            </div>
          </div>

          <button type="submit" className="air-btn air-btn-primary" style={{ width: '100%', padding: '16px', borderRadius: '16px', justifyContent: 'center' }} disabled={saving}>
             {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck size={18} style={{ marginRight: '8px' }} />}
             {editId ? 'Guardar Cambios' : 'Crear Adicional'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
