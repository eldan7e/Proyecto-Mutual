import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Search, Edit2, Trash2, Plus, Users, Smartphone,
  Mail, Hash, ShieldCheck, UserCheck, Loader2, RefreshCw,
  Eye, X, UserPlus, Crown, UserMinus, FileText, Phone, ChevronDown, ChevronUp
} from 'lucide-react';
import Modal from './components/Modal';
import {
  fetchGrupos as loadGrupos,
  insertGrupo,
  updateGrupo,
  deleteGrupo,
  setGrupoTitular,
  addIntegranteToGrupo,
  removeIntegranteFromGrupo,
  searchSocios,
  fetchLiquidacionesGrupo,
} from './services/gruposService';
import useDebounce from './hooks/useDebounce';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';

/* ─────────────────────────────────────────────
   Sub-componente: Buscador de socios con autocomplete
   ───────────────────────────────────────────── */
function SocioBuscador({ onSelect, placeholder = 'Buscar socio por nombre, DNI o Nro...', excludeIds = [] }) {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 300);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (debouncedQ.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    searchSocios(debouncedQ).then((data) => {
      setResults(data.filter(s => !excludeIds.includes(s.socio_id)));
      setOpen(true);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [debouncedQ]);

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(socio) {
    setQ('');
    setResults([]);
    setOpen(false);
    onSelect(socio);
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="premium-input"
          style={{ width: '100%', padding: '10px 40px 10px 12px', fontSize: '13px', borderRadius: '10px', boxSizing: 'border-box' }}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {loading
          ? <Loader2 size={15} className="animate-spin" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)' }} />
          : <Search size={15} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
        }
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--modal-bg, #fff)', border: '1px solid var(--border-light)',
          borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          zIndex: 9999, maxHeight: '240px', overflowY: 'auto'
        }}>
          {results.map((s) => (
            <div
              key={s.socio_id}
              onClick={() => handleSelect(s)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', transition: 'background 0.12s' }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{s.nombre_completo}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: 600 }}>
                Nro {s.nro_socio || '—'} · DNI {s.dni || '—'}
                {s.email && ` · ${s.email}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && results.length === 0 && q.trim().length >= 2 && !loading && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--modal-bg, #fff)', border: '1px solid var(--border-light)',
          borderRadius: '12px', padding: '14px 16px', zIndex: 9999,
          fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic'
        }}>
          No se encontraron socios
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sub-componente: Modal Expediente del Grupo (con tabs)
   ───────────────────────────────────────────── */
function ExpedienteModal({ grupo, onClose, onRefresh }) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('integrantes');
  const [saving, setSaving] = useState(false);

  // Historial de liquidaciones
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [loadingLiq, setLoadingLiq] = useState(false);

  // Estado local de integrantes (para actualización inmediata en UI)
  const [integrantes, setIntegrantes] = useState(grupo?.integrantes || []);

  useEffect(() => {
    setIntegrantes(grupo?.integrantes || []);
  }, [grupo]);

  useEffect(() => {
    if (tab === 'historial' && grupo) {
      setLoadingLiq(true);
      fetchLiquidacionesGrupo(grupo.numero_grupo)
        .then(setLiquidaciones)
        .catch(() => addToast('Error al cargar historial', 'error'))
        .finally(() => setLoadingLiq(false));
    }
  }, [tab, grupo]);

  async function handleSetTitular(socio) {
    const ok = await confirm({
      title: 'Cambiar titular',
      message: `¿Establecer a ${socio.nombre_completo} como titular del grupo #${grupo.numero_grupo}?`,
      confirmText: 'Sí, establecer',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await setGrupoTitular(grupo.numero_grupo, socio.socio_id);
      setIntegrantes(prev => prev.map(i => ({
        ...i,
        es_titular: i.socio_id === socio.socio_id
      })).sort((a, b) => {
        if (a.es_titular && !b.es_titular) return -1;
        if (!a.es_titular && b.es_titular) return 1;
        return (a.nombre_completo || '').localeCompare(b.nombre_completo || '');
      }));
      addToast(`${socio.nombre_completo} es ahora el titular del grupo`, 'success');
      onRefresh();
    } catch (err) {
      addToast('Error al cambiar titular: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFromSearch(socio) {
    setSaving(true);
    try {
      await addIntegranteToGrupo(grupo.numero_grupo, socio.socio_id);
      setIntegrantes(prev => [...prev, { ...socio, es_titular: false }].sort((a, b) => {
        if (a.es_titular && !b.es_titular) return -1;
        if (!a.es_titular && b.es_titular) return 1;
        return (a.nombre_completo || '').localeCompare(b.nombre_completo || '');
      }));
      addToast(`${socio.nombre_completo} agregado al grupo`, 'success');
      onRefresh();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveIntegrante(integrante) {
    if (integrante.es_titular) {
      addToast('No podés quitar al titular. Asigná otro titular primero.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Quitar integrante',
      message: `¿Quitar a ${integrante.nombre_completo} del grupo #${grupo.numero_grupo}?`,
      confirmText: 'Sí, quitar',
      isDanger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await removeIntegranteFromGrupo(grupo.numero_grupo, integrante.socio_id, integrante.es_titular);
      setIntegrantes(prev => prev.filter(i => i.socio_id !== integrante.socio_id));
      addToast(`${integrante.nombre_completo} quitado del grupo`, 'success');
      onRefresh();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: 'integrantes', label: 'Integrantes', icon: <Users size={14} /> },
    { id: 'lineas', label: 'Líneas', icon: <Phone size={14} /> },
    { id: 'historial', label: 'Historial', icon: <FileText size={14} /> },
  ];

  if (!grupo) return null;

  const excludedIds = integrantes.map(i => i.socio_id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Header info del grupo */}
      <div style={{
        background: 'var(--accent-light)', borderRadius: '16px', padding: '16px 20px',
        marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            background: 'var(--accent)', color: 'white', padding: '4px 12px',
            borderRadius: '8px', fontSize: '13px', fontWeight: 900
          }}>
            <Hash size={12} style={{ display: 'inline', marginRight: '3px' }} />{grupo.numero_grupo}
          </span>
          <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }}>
            {grupo.alias_grupo || 'Sin Alias'}
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <Stat icon={<Users size={13} />} label="Integrantes" value={integrantes.length} />
          <Stat icon={<Phone size={13} />} label="Líneas" value={grupo.total_lineas} color="#3b82f6" />
          {grupo.email_facturacion && (
            <Stat icon={<Mail size={13} />} label="Email" value={grupo.email_facturacion} small />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', fontSize: '13px', fontWeight: 700,
              border: 'none', borderRadius: '10px 10px 0 0', cursor: 'pointer',
              background: tab === t.id ? 'var(--accent)' : 'transparent',
              color: tab === t.id ? 'white' : 'var(--text-secondary)',
              transition: 'all 0.15s',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.icon} {t.label}
            {t.id === 'integrantes' && (
              <span style={{
                background: tab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--accent-light)',
                color: tab === t.id ? 'white' : 'var(--accent)',
                fontSize: '10px', fontWeight: 900, padding: '1px 6px', borderRadius: '100px'
              }}>{integrantes.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Integrantes */}
      {tab === 'integrantes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Lista de integrantes */}
          {integrantes.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
              Este grupo no tiene integrantes aún. Usá el buscador para agregar socios.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {integrantes.map((int) => (
                <div key={int.socio_id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', background: 'var(--bg-app)',
                  borderRadius: '12px', border: int.es_titular ? '1.5px solid var(--accent)' : '1px solid var(--border-light)',
                  transition: 'border-color 0.15s'
                }}>
                  {/* Avatar inicial */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: int.es_titular ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: int.es_titular ? 'white' : 'var(--text-secondary)',
                    fontSize: '14px', fontWeight: 800
                  }}>
                    {int.es_titular ? <Crown size={16} /> : (int.nombre_completo?.[0] || '?')}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
                        {int.nombre_completo}
                      </span>
                      {int.es_titular && (
                        <span style={{
                          fontSize: '9px', background: 'var(--accent)', color: 'white',
                          padding: '2px 8px', borderRadius: '100px', fontWeight: 900, textTransform: 'uppercase'
                        }}>TITULAR</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '2px' }}>
                      Nro {int.nro_socio || '—'} · DNI {int.dni || '—'}
                      {int.email && ` · ${int.email}`}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {!int.es_titular && (
                      <button
                        onClick={() => handleSetTitular(int)}
                        disabled={saving}
                        title="Hacer titular"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '6px 10px', fontSize: '11px', fontWeight: 800,
                          background: 'var(--accent-light)', color: 'var(--accent)',
                          border: '1px solid var(--accent)', borderRadius: '8px',
                          cursor: saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap'
                        }}
                      >
                        <Crown size={12} /> Titular
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveIntegrante(int)}
                      disabled={saving}
                      title={int.es_titular ? 'No se puede quitar al titular' : 'Quitar del grupo'}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.2)',
                        cursor: (saving || int.es_titular) ? 'not-allowed' : 'pointer',
                        opacity: (saving || int.es_titular) ? 0.4 : 1,
                        transition: 'all 0.15s'
                      }}
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Buscador para agregar */}
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UserPlus size={13} /> Agregar integrante al grupo
            </div>
            <SocioBuscador
              onSelect={handleAddFromSearch}
              excludeIds={excludedIds}
              placeholder="Buscar socio por nombre, DNI o Nro de socio..."
            />
          </div>
        </div>
      )}

      {/* Tab: Líneas */}
      {tab === 'lineas' && (
        <div>
          {grupo.lineasDetalle.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
              No hay líneas asignadas a este grupo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {grupo.lineasDetalle.map((l, i) => (
                <div key={i} style={{
                  padding: '12px 18px', background: 'var(--bg-app)',
                  border: '1px solid var(--border-light)', borderRadius: '14px',
                  minWidth: '140px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Smartphone size={13} color="#3b82f6" />
                    <span style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: '14px' }}>{l.numero_linea}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    {l.proveedores?.nombre || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Historial */}
      {tab === 'historial' && (
        <div>
          {loadingLiq ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              <Loader2 className="animate-spin" size={24} style={{ color: 'var(--accent)' }} />
            </div>
          ) : liquidaciones.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
              No hay registros de liquidación para este grupo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {liquidaciones.map((liq, idx) => {
                const payments = liq.movimientos_bancarios || [];
                // Corrección del desfasaje: el abono se registra en el periodo siguiente
                const liqSiguiente = idx > 0 ? liquidaciones[idx - 1] : null;
                const montoAbonadoReal = liqSiguiente ? Number(liqSiguiente.monto_abonado) : Number(liq.monto_abonado);
                const facturado = Number(liq.monto_total_facturado);
                const estadoPago = (montoAbonadoReal >= (facturado - 5.0)) ? 'ABONADO' : (montoAbonadoReal > 5.0 ? 'PARCIAL' : 'PENDIENTE');
                const estadoColor = estadoPago === 'ABONADO' ? 'var(--accent)' : estadoPago === 'PARCIAL' ? '#f59e0b' : '#ef4444';

                return (
                  <div key={liq.liquidacion_id} style={{
                    padding: '14px 16px', background: 'var(--bg-app)',
                    borderRadius: '12px', border: '1px solid var(--border-light)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '13px' }}>
                        {liq.periodo} · {liq.proveedores?.nombre}
                      </span>
                      <span style={{
                        fontSize: '9px', background: estadoColor, color: 'white',
                        padding: '3px 8px', borderRadius: '100px', fontWeight: 900
                      }}>{estadoPago}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <span>Facturado: <strong>${facturado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></span>
                      <span>Abonado: <strong>${montoAbonadoReal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></span>
                    </div>
                    {payments.length > 0 && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-light)' }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '6px' }}>
                          Pagos conciliados:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {payments.map((p) => (
                            <div key={p.movimiento_id} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)' }}>
                              <span>📅 {p.fecha_movimiento} · {p.socios?.nombre_completo || 'Socio'} ({p.banco})</span>
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
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Stat chip inline
   ───────────────────────────────────────────── */
function Stat({ icon, label, value, color, small }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: small ? '11px' : '12px', color: color || 'var(--text-secondary)', fontWeight: 700 }}>
      <span style={{ color: color || 'var(--accent)' }}>{icon}</span>
      <span>{label}: <strong style={{ color: 'var(--text-primary)' }}>{value}</strong></span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sub-componente: Formulario Crear/Editar Grupo
   ───────────────────────────────────────────── */
function GrupoForm({ grupo, onSubmit, loading }) {
  return (
    <form key={grupo?.numero_grupo || 'new'} onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-panel-sub" style={{ padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        <div>
          <label className="form-label">Número de Grupo *</label>
          <input
            className="premium-input"
            style={{ width: '100%', padding: '11px 14px', boxSizing: 'border-box' }}
            type="number"
            name="numero_grupo"
            defaultValue={grupo?.numero_grupo}
            disabled={!!grupo}
            required
            placeholder="Ej: 42"
          />
          {!!grupo && (
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
              El número de grupo no se puede modificar.
            </p>
          )}
        </div>

        <div>
          <label className="form-label">Alias del Grupo</label>
          <input
            className="premium-input"
            style={{ width: '100%', padding: '11px 14px', boxSizing: 'border-box' }}
            name="alias_grupo"
            defaultValue={grupo?.alias_grupo}
            placeholder="Ej: Grupo Familiar García"
          />
        </div>

        <div>
          <label className="form-label">Email de Facturación</label>
          <input
            className="premium-input"
            style={{ width: '100%', padding: '11px 14px', boxSizing: 'border-box' }}
            type="email"
            name="email_facturacion"
            defaultValue={grupo?.email_facturacion}
            placeholder="facturacion@ejemplo.com"
          />
        </div>

        <div>
          <label className="form-label">Emails adicionales <span style={{ fontWeight: 500, opacity: 0.7 }}>(separados por coma)</span></label>
          <textarea
            className="premium-input"
            style={{ width: '100%', padding: '11px 14px', height: '80px', resize: 'vertical', boxSizing: 'border-box' }}
            name="emails_integrantes"
            defaultValue={grupo?.emails_integrantes}
            placeholder="otro@email.com, extra@email.com"
          />
        </div>
      </div>

      <button
        type="submit"
        className="action-button"
        style={{ width: '100%', padding: '14px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        disabled={loading}
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Guardando...</>
          : <><ShieldCheck size={16} /> {grupo ? 'Guardar Cambios' : 'Crear Grupo'}</>
        }
      </button>
    </form>
  );
}

/* ─────────────────────────────────────────────
   Componente principal: Grupos
   ───────────────────────────────────────────── */
export default function Grupos() {
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [grupos, setGrupos] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [loading, setLoading] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');

  // Modal edición/creación
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentGrupo, setCurrentGrupo] = useState(null);
  const [savingForm, setSavingForm] = useState(false);

  // Modal expediente
  const [expedienteGrupo, setExpedienteGrupo] = useState(null);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, selectedProvider]);

  const totalPages = Math.max(1, Math.ceil(grupos.length / PAGE_SIZE));
  const paginatedGrupos = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return grupos.slice(start, start + PAGE_SIZE);
  }, [grupos, currentPage]);

  const kpis = useMemo(() => ({
    totalGrupos: grupos.length,
    totalLineas: grupos.reduce((acc, g) => acc + g.total_lineas, 0),
    sinTitular: grupos.filter(g => !g.titular).length,
  }), [grupos]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { grupos: data, proveedores: provData } = await loadGrupos({
        search: debouncedSearch,
        selectedProvider
      });
      setGrupos(data);
      setProveedores(provData);
      return data;
    } catch (err) {
      addToast('Error al cargar grupos: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedProvider]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSavingForm(true);
    const formData = new FormData(e.target);
    const grupoData = Object.fromEntries(formData);

    try {
      if (currentGrupo) {
        await updateGrupo(currentGrupo.numero_grupo, grupoData);
        addToast(`Grupo #${currentGrupo.numero_grupo} actualizado`, 'success');
      } else {
        await insertGrupo(grupoData);
        addToast(`Grupo #${grupoData.numero_grupo} creado exitosamente`, 'success');
      }
      setIsModalOpen(false);
      setCurrentGrupo(null);
      fetchData();
    } catch (error) {
      addToast('Error: ' + error.message, 'error');
    } finally {
      setSavingForm(false);
    }
  }

  async function handleDelete(grupo) {
    const ok = await confirm({
      title: `Eliminar Grupo #${grupo.numero_grupo}`,
      message: `¿Estás seguro? Se perderán todos los vínculos de este grupo. Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      isDanger: true,
    });
    if (!ok) return;
    try {
      await deleteGrupo(grupo.numero_grupo);
      addToast(`Grupo #${grupo.numero_grupo} eliminado`, 'success');
      fetchData();
    } catch (error) {
      addToast('Error al eliminar: ' + error.message, 'error');
    }
  }

  function openExpediente(g) {
    setExpedienteGrupo(g);
  }

  function closeExpediente() {
    setExpedienteGrupo(null);
  }

  // Cuando se actualiza algo en el expediente, refresca la lista y actualiza el grupo en el modal
  async function handleExpedienteRefresh() {
    const freshData = await fetchData();
    if (freshData && expedienteGrupo) {
      const updated = freshData.find(g => g.numero_grupo === expedienteGrupo.numero_grupo);
      if (updated) setExpedienteGrupo(updated);
    }
  }

  return (
    <div className="animate-fade">

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <KpiCard icon={<Users size={16} color="var(--accent)" />} label="TOTAL GRUPOS" value={kpis.totalGrupos} sublabel="Unidades de facturación" />
        <KpiCard icon={<Smartphone size={16} color="#3b82f6" />} label="LÍNEAS VINCULADAS" value={kpis.totalLineas} sublabel="Total de equipos en flota" />
        <KpiCard
          icon={<ShieldCheck size={16} color={kpis.sinTitular > 0 ? '#ef4444' : 'var(--accent)'} />}
          label="SIN TITULAR"
          value={kpis.sinTitular}
          sublabel="Requieren asignación"
          valueColor={kpis.sinTitular > 0 ? '#ef4444' : undefined}
        />
      </div>

      {/* Barra de filtros */}
      <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '20px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: '200px' }}>
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar por número de grupo o alias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', width: '100%', fontSize: '13px' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '2px' }}>
              <X size={14} />
            </button>
          )}
        </div>
        <select
          className="premium-input"
          style={{ width: '200px', padding: '9px 14px', fontSize: '13px' }}
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
        >
          <option value="">Todos los Proveedores</option>
          {proveedores.map(p => (
            <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>
          ))}
        </select>
        <button onClick={fetchData} className="icon-button-edit" style={{ height: '40px', width: '40px', flexShrink: 0 }} title="Recargar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={() => { setCurrentGrupo(null); setIsModalOpen(true); }}
          className="action-button"
          style={{ padding: '9px 16px', fontSize: '13px', borderRadius: '12px', height: '40px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
        >
          <Plus size={15} /> Nuevo Grupo
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton" style={{ height: '56px', width: '100%', borderRadius: '12px' }} />
          ))}
        </div>
      ) : grupos.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', borderRadius: '20px' }}>
          <Users size={40} style={{ color: 'var(--text-secondary)', opacity: 0.3, marginBottom: '12px' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 600 }}>
            {search || selectedProvider ? 'No hay grupos que coincidan con los filtros.' : 'No hay grupos registrados.'}
          </div>
          {!search && !selectedProvider && (
            <button
              onClick={() => { setCurrentGrupo(null); setIsModalOpen(true); }}
              className="action-button"
              style={{ marginTop: '16px', padding: '10px 20px', fontSize: '13px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={15} /> Crear el primer grupo
            </button>
          )}
        </div>
      ) : (
        <div className="glass-panel" style={{ borderRadius: '20px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="premium-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-light)' }}>
                  {['Grupo / Alias', 'Titular / Responsable', 'Integrantes', 'Líneas', 'Email Facturación', 'Acciones'].map((h, i) => (
                    <th key={h} style={{
                      padding: '13px 18px', textAlign: i >= 2 && i <= 3 ? 'center' : i === 5 ? 'right' : 'left',
                      fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedGrupos.map(g => (
                  <tr key={g.numero_grupo} className="table-row-hover" style={{ borderBottom: '1px solid var(--border-light)' }}>

                    {/* Grupo / Alias */}
                    <td style={{ padding: '13px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          background: 'var(--accent-light)', color: 'var(--accent)',
                          padding: '3px 9px', borderRadius: '7px', fontSize: '11px', fontWeight: 900,
                          display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0
                        }}>
                          <Hash size={11} /> {g.numero_grupo}
                        </span>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '13px' }}>
                          {g.alias_grupo || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontWeight: 500 }}>Sin Alias</span>}
                        </span>
                      </div>
                    </td>

                    {/* Titular */}
                    <td style={{ padding: '13px 18px' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '7px',
                        color: !g.titular ? '#ef4444' : 'var(--text-primary)',
                        fontSize: '13px', fontWeight: 700
                      }}>
                        <UserCheck size={14} color={!g.titular ? '#ef4444' : 'var(--accent)'} />
                        {g.titular || (
                          <span style={{ color: '#ef4444', fontStyle: 'italic', fontSize: '12px' }}>Sin Titular</span>
                        )}
                      </div>
                    </td>

                    {/* Integrantes */}
                    <td style={{ padding: '13px 18px', textAlign: 'center' }}>
                      <span style={{
                        background: 'rgba(0,0,0,0.05)', padding: '3px 10px',
                        borderRadius: '8px', fontSize: '12px', fontWeight: 800
                      }}>{g.total_socios}</span>
                    </td>

                    {/* Líneas */}
                    <td style={{ padding: '13px 18px', textAlign: 'center' }}>
                      <span style={{
                        background: 'rgba(16,185,129,0.1)', color: '#10b981',
                        padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800
                      }}>{g.total_lineas}</span>
                    </td>

                    {/* Email */}
                    <td style={{ padding: '13px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <Mail size={13} />
                        <span>{g.email_facturacion || <span style={{ fontStyle: 'italic' }}>Sin Email</span>}</span>
                      </div>
                    </td>

                    {/* Acciones */}
                    <td style={{ padding: '13px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          onClick={() => openExpediente(g)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '6px 12px', fontSize: '12px', fontWeight: 800,
                            background: 'var(--surface)', border: '1px solid var(--border-light)',
                            color: 'var(--accent)', borderRadius: '9px', cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          <Eye size={13} /> Ver
                        </button>
                        <button
                          onClick={() => { setCurrentGrupo(g); setIsModalOpen(true); }}
                          className="icon-button-edit"
                          title="Editar grupo"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(g)}
                          className="icon-button-delete"
                          title="Eliminar grupo"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div style={{
              padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderTop: '1px solid var(--border-light)', background: 'rgba(0,0,0,0.01)', flexWrap: 'wrap', gap: '10px'
            }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Mostrando {Math.min((currentPage - 1) * PAGE_SIZE + 1, grupos.length)}–{Math.min(currentPage * PAGE_SIZE, grupos.length)} de {grupos.length}
              </span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="air-btn"
                  style={{ opacity: currentPage === 1 ? 0.4 : 1, padding: '6px 12px', fontSize: '12px', fontWeight: 700 }}
                >
                  Anterior
                </button>
                <span style={{ fontSize: '12px', fontWeight: 800, padding: '0 6px' }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="air-btn"
                  style={{ opacity: currentPage >= totalPages ? 0.4 : 1, padding: '6px 12px', fontSize: '12px', fontWeight: 700 }}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setCurrentGrupo(null); }}
        title={currentGrupo ? `Editar Grupo #${currentGrupo.numero_grupo}` : 'Nuevo Grupo'}
        maxWidth="480px"
      >
        <GrupoForm
          grupo={currentGrupo}
          onSubmit={handleSubmit}
          loading={savingForm}
        />
      </Modal>

      {/* Modal Expediente */}
      <Modal
        isOpen={!!expedienteGrupo}
        onClose={closeExpediente}
        title={`Expediente · Grupo #${expedienteGrupo?.numero_grupo || ''}`}
        maxWidth="640px"
      >
        <ExpedienteModal
          grupo={expedienteGrupo}
          onClose={closeExpediente}
          onRefresh={handleExpedienteRefresh}
        />
      </Modal>
    </div>
  );
}

/* ─────────────────────────────────────────────
   KPI Card
   ───────────────────────────────────────────── */
function KpiCard({ icon, label, value, sublabel, valueColor }) {
  return (
    <div className="glass-panel" style={{ padding: '20px 24px', borderRadius: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        {icon}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 900, color: valueColor || 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>{sublabel}</div>
    </div>
  );
}
