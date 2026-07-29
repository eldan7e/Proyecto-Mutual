import { useEffect, useState } from 'react';
import { 
  Search, Edit2, Trash2, Plus, Users, Smartphone, 
  Mail, Hash, TrendingUp, ShieldCheck, UserCheck, Loader2, RefreshCw
} from 'lucide-react';
import Modal from './components/Modal';
import { fetchGrupos as loadGrupos, insertGrupo, updateGrupo, deleteGrupo, setGrupoTitular } from './services/gruposService';
import useDebounce from './hooks/useDebounce';
import { supabase } from './supabaseClient';

export default function Grupos() {
  const [grupos, setGrupos] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentGrupo, setCurrentGrupo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailGrupo, setDetailGrupo] = useState(null);

  // States for liquidation and payment history of the selected group
  const [liquidacionesHistory, setLiquidacionesHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isDetailModalOpen && detailGrupo) {
      loadHistory(detailGrupo.numero_grupo);
    } else {
      setLiquidacionesHistory([]);
    }
  }, [isDetailModalOpen, detailGrupo]);

  async function loadHistory(numeroGrupo) {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('liquidaciones_grupos')
        .select(`
          liquidacion_id,
          periodo,
          monto_total_facturado,
          monto_abonado,
          estado_pago,
          proveedores(nombre),
          movimientos_bancarios(
            movimiento_id,
            fecha_movimiento,
            monto,
            banco,
            socios(nombre_completo)
          )
        `)
        .eq('numero_grupo', numeroGrupo)
        .order('periodo', { ascending: false });

      if (error) throw error;
      setLiquidacionesHistory(data || []);
    } catch (err) {
      console.error('Error al cargar historial de liquidaciones:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  // States for search and autocompletion of partners to assign as titular
  const [socioSearch, setSocioSearch] = useState('');
  const [socioSuggestions, setSocioSuggestions] = useState([]);
  const [searchingSocios, setSearchingSocios] = useState(false);

  useEffect(() => {
    if (socioSearch.trim().length < 2) {
      setSocioSuggestions([]);
      return;
    }
    const search = async () => {
      setSearchingSocios(true);
      try {
        const { data, error } = await supabase
          .from('socios')
          .select('socio_id, nombre_completo, nro_socio')
          .or(`nombre_completo.ilike.%${socioSearch}%,dni.ilike.%${socioSearch}%`)
          .limit(5);
        if (!error && data) {
          setSocioSuggestions(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSearchingSocios(false);
      }
    };
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [socioSearch]);

  useEffect(() => {
    fetchData();
  }, [debouncedSearch, selectedProvider]);

  async function fetchData() {
    setLoading(true);
    try {
      const { grupos: processedGrupos, proveedores: provData } = await loadGrupos({ search: debouncedSearch, selectedProvider });
      setGrupos(processedGrupos);
      setProveedores(provData);
      return processedGrupos;
    } catch (err) {
      console.error('Error fetching grupos:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetTitular(socioId) {
    try {
      setLoading(true);
      await setGrupoTitular(detailGrupo.numero_grupo, socioId);
      const freshGrupos = await fetchData();
      if (freshGrupos) {
        const updated = freshGrupos.find(g => g.numero_grupo === detailGrupo.numero_grupo);
        if (updated) {
          setDetailGrupo(updated);
        }
      }
      setSocioSearch('');
      setSocioSuggestions([]);
    } catch (err) {
      alert("Error al establecer titular: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target);
    const grupoData = Object.fromEntries(formData);

    try {
      if (currentGrupo) {
        await updateGrupo(currentGrupo.numero_grupo, grupoData);
      } else {
        await insertGrupo(grupoData);
      }
      setIsModalOpen(false);
      setCurrentGrupo(null);
      fetchData();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (window.confirm('¿Estás seguro de eliminar este grupo? Todos los vínculos se perderán.')) {
      try {
        await deleteGrupo(id);
        fetchData();
      } catch (error) {
        alert(error.message);
      }
    }
  }

  const kpis = {
    totalGrupos: grupos.length,
    totalLineas: grupos.reduce((acc, g) => acc + g.total_lineas, 0),
    sinTitular: grupos.filter(g => g.titular === 'Sin Titular').length
  };

  return (
    <div className="animate-fade">
      
      {/* Dashboard Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>TOTAL GRUPOS</span>
            <Users size={16} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900 }}>{kpis.totalGrupos}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Unidades de facturación</div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>LÍNEAS VINCULADAS</span>
            <Smartphone size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900 }}>{kpis.totalLineas}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Total de equipos en flota</div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>SIN TITULAR</span>
            <ShieldCheck size={16} color="#ef4444" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: kpis.sinTitular > 0 ? '#ef4444' : 'inherit' }}>{kpis.sinTitular}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Requieren asignación</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-panel" style={{ padding: '20px', borderRadius: '24px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por número de grupo o alias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', width: '100%' }}
          />
        </div>
        <select 
          className="premium-input" 
          style={{ width: '220px', padding: '10px 16px' }}
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
        >
          <option value="">Todos los Proveedores</option>
          {proveedores.map(p => (
            <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>
          ))}
        </select>
        <button onClick={fetchData} className="icon-button-edit" style={{ height: '42px', width: '42px', flexShrink: 0 }}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
        <button 
          onClick={() => { setCurrentGrupo(null); setIsModalOpen(true); }}
          className="action-button" 
          style={{ padding: '10px 18px', fontSize: '13px', borderRadius: '12px', height: '42px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
        >
          <Plus size={16} /> Nuevo Grupo
        </button>
      </div>

      {/* Grid de Grupos */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton" style={{ height: '64px', width: '100%', borderRadius: '16px' }}></div>
          ))}
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', 
          gap: '24px' 
        }}>
          {grupos.map(g => (
            <div key={g.numero_grupo} className="glass-panel" style={{ 
              padding: '28px', 
              borderRadius: '28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              transition: 'all 0.3s ease',
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div 
                  onClick={() => { setDetailGrupo(g); setIsDetailModalOpen(true); }}
                  style={{ 
                    background: 'var(--accent-light)', 
                    color: 'var(--accent)', 
                    padding: '6px 14px', 
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <Hash size={14} /> GRUPO {g.numero_grupo}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setCurrentGrupo(g); setIsModalOpen(true); }} className="icon-button-edit">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(g.numero_grupo)} className="icon-button-delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div onClick={() => { setDetailGrupo(g); setIsDetailModalOpen(true); }} style={{ cursor: 'pointer' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>
                  {g.alias_grupo || 'Grupo sin Alias'}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontWeight: 800, fontSize: '14px' }}>
                  <UserCheck size={16} /> {g.titular}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '18px', textAlign: 'center', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '22px', fontWeight: 900 }}>{g.total_socios}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase' }}>Integrantes</div>
                </div>
                <div style={{ background: 'var(--bg-app)', padding: '16px', borderRadius: '18px', textAlign: 'center', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '22px', fontWeight: 900 }}>{g.total_lineas}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase' }}>Líneas</div>
                </div>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ 
                  width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-light)' 
                }}>
                  <Mail size={14} color="var(--text-secondary)" />
                </div>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {g.email_facturacion || 'Sin Email'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals modernized */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={currentGrupo ? `Editar Grupo #${currentGrupo.numero_grupo}` : 'Nuevo Grupo'}
      >
        <form key={currentGrupo?.numero_grupo || 'new'} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel-sub" style={{ padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Número de Grupo</label>
              <input className="premium-input" style={{ width: '100%', padding: '12px' }} type="number" name="numero_grupo" defaultValue={currentGrupo?.numero_grupo} disabled={!!currentGrupo} required />
            </div>
            
            <div>
              <label className="form-label">Alias del Grupo</label>
              <input className="premium-input" style={{ width: '100%', padding: '12px' }} name="alias_grupo" defaultValue={currentGrupo?.alias_grupo} placeholder="Ej: Grupo Familiar Rossi" />
            </div>

            <div>
              <label className="form-label">Email de Facturación</label>
              <input className="premium-input" style={{ width: '100%', padding: '12px' }} type="email" name="email_facturacion" defaultValue={currentGrupo?.email_facturacion} required />
            </div>

            <div>
              <label className="form-label">Correos Adicionales (CSV)</label>
              <textarea className="premium-input" style={{ width: '100%', padding: '12px', height: '100px', resize: 'none' }} name="emails_integrantes" defaultValue={currentGrupo?.emails_integrantes} />
            </div>
          </div>

          <button type="submit" className="action-button" style={{ width: '100%', padding: '16px', borderRadius: '16px' }} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck size={18} style={{ marginRight: '8px' }} />}
            Confirmar Cambios
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Expediente Grupo #${detailGrupo?.numero_grupo}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel-sub" style={{ padding: '20px', borderRadius: '20px' }}>
            <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 900, marginBottom: '16px' }}>Integrantes del Grupo</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {detailGrupo?.integrantes?.map((int, i) => (
                <div key={i} style={{ padding: '14px', background: 'var(--bg-app)', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{int.nombre_completo}</span>
                    {int.es_titular ? (
                      <span style={{ fontSize: '9px', background: 'var(--accent)', color: 'white', padding: '3px 8px', borderRadius: '100px', fontWeight: 900 }}>TITULAR</span>
                    ) : (
                      <button
                        onClick={() => handleSetTitular(int.socio_id)}
                        type="button"
                        style={{ fontSize: '10px', padding: '4px 8px', height: 'auto', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', fontWeight: 800 }}
                      >
                        Hacer Responsable
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>{int.email || 'Sin email'} • Socio #{int.nro_socio}</div>
                </div>
              ))}
            </div>

            {/* Asignar Nuevo Titular Buscando en DB */}
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                Asignar Nuevo Responsable (Buscador DB)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="premium-input"
                  style={{ width: '100%', padding: '10px 12px', fontSize: '13px', borderRadius: '10px' }}
                  placeholder="Buscar socio por nombre o DNI..."
                  value={socioSearch}
                  onChange={(e) => setSocioSearch(e.target.value)}
                />
                {searchingSocios && (
                  <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                )}
                
                {socioSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--modal-bg)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    boxShadow: 'var(--shadow-premium)',
                    zIndex: 2000,
                    marginTop: '4px',
                    overflow: 'hidden'
                  }}>
                    {socioSuggestions.map((s) => (
                      <div
                        key={s.socio_id}
                        onClick={() => {
                          if (window.confirm(`¿Establecer a ${s.nombre_completo} como el nuevo responsable de este grupo?`)) {
                            handleSetTitular(s.socio_id);
                          }
                        }}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          fontSize: '12.5px',
                          borderBottom: '1px solid var(--border-light)',
                          background: 'var(--bg-app)',
                          color: 'var(--text-primary)',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-light)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-app)'}
                      >
                        <div style={{ fontWeight: 700 }}>{s.nombre_completo}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Socio #{s.nro_socio || 'S/N'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>


          {/* Historial de Liquidaciones y Pagos */}
          <div className="glass-panel-sub" style={{ padding: '20px', borderRadius: '20px' }}>
            <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 900, marginBottom: '16px' }}>Historial de Liquidaciones y Pagos</h4>
            {loadingHistory ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                <Loader2 className="animate-spin" size={24} style={{ color: 'var(--accent)' }} />
              </div>
            ) : liquidacionesHistory.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', padding: '10px' }}>No hay registros de liquidación en el sistema</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {liquidacionesHistory.map((liq, idx) => {
                  const payments = liq.movimientos_bancarios || [];
                  
                  // CORRECCIÓN DEL DESFASAJE: 
                  // El abono de esta factura se encuentra registrado en el periodo siguiente en la base de datos
                  const liqSiguiente = idx > 0 ? liquidacionesHistory[idx - 1] : null;
                  const montoAbonadoReal = liqSiguiente ? Number(liqSiguiente.monto_abonado) : Number(liq.monto_abonado);
                  
                  const facturado = Number(liq.monto_total_facturado);
                  const diferencia = Math.abs(facturado - montoAbonadoReal);
                  const estadoPagoReal = diferencia < 5.0 ? 'ABONADO' : (montoAbonadoReal > 5.0 ? 'PARCIAL' : 'PENDIENTE');

                  return (
                    <div key={liq.liquidacion_id} style={{ padding: '14px', background: 'var(--bg-app)', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '13px' }}>
                          {liq.periodo} • {liq.proveedores?.nombre}
                        </span>
                        <span style={{ 
                          fontSize: '9px', 
                          background: estadoPagoReal === 'ABONADO' ? 'var(--accent)' : estadoPagoReal === 'PARCIAL' ? '#f59e0b' : '#ef4444', 
                          color: 'white', 
                          padding: '3px 8px', 
                          borderRadius: '100px', 
                          fontWeight: 900 
                        }}>
                          {estadoPagoReal}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Facturado: ${facturado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        <span>Abonado: ${montoAbonadoReal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      
                      {payments.length > 0 && (
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-light)' }}>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '6px' }}>Pagos Conciliados:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {payments.map((p) => (
                              <div key={p.movimiento_id} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                                  📅 {p.fecha_movimiento} • Pagador: <strong>{p.socios?.nombre_completo || 'Socio'}</strong> ({p.banco})
                                </span>
                                <span style={{ fontWeight: 800, color: 'var(--accent)' }}>
                                  +${parseFloat(p.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="glass-panel-sub" style={{ padding: '20px', borderRadius: '20px' }}>
            <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: '#3b82f6', fontWeight: 900, marginBottom: '16px' }}>Líneas Vinculadas</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {detailGrupo?.lineasDetalle.map((l, i) => (
                <div key={i} style={{ padding: '10px 16px', background: 'var(--bg-app)', border: '1px solid var(--border-light)', borderRadius: '14px' }}>
                  <div style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: '14px' }}>{l.numero_linea}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 800 }}>{l.proveedores?.nombre}</div>
                </div>
              ))}
              {detailGrupo?.lineasDetalle.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', padding: '10px' }}>No hay líneas asignadas</div>}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
