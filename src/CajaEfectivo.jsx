import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Banknote, Plus, Trash2, Calendar, CheckCircle2, AlertTriangle,
  Download, Filter, RefreshCw, Loader2, ChevronDown, ChevronUp,
  Eye, Search, X, Coins, ArrowUpDown, FileText, ExternalLink, Copy, Check
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import {
  fetchMovimientosCaja,
  insertMovimientoCaja,
  deleteMovimientoCaja,
  fetchCobrosEfectivo,
  buildVerificacionDiaria,
  saveNotaVerificacion,
  TIPOS_MOVIMIENTO_CAJA
} from './services/cajaEfectivoService';

const TAB_REGISTRO = 'registro';
const TAB_VERIFICACION = 'verificacion';
const TAB_DETALLE = 'detalle';

const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '$0,00';
  return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const extractEmpresa = (obs) => {
  if (!obs) return '';
  const m = obs.match(/\((CLARO|MOVISTAR|PERSONAL)\)/i);
  return m ? m[1].toUpperCase() : '';
};

const extractLinea = (obs) => {
  if (!obs) return '';
  const m = obs.match(/Línea\s+(\d+)/i);
  return m ? m[1] : '';
};

export default function CajaEfectivo() {
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const initialFechaParam = searchParams.get('fecha');
  const initialTabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState(initialTabParam || TAB_VERIFICACION);
  const [loading, setLoading] = useState(false);

  // Date filters - default from beginning of 2026 to today (or to include initialFechaParam)
  const today = new Date().toISOString().slice(0, 10);
  const startOfYear = new Date().getFullYear() + '-01-01';
  const [fechaDesde, setFechaDesde] = useState(initialFechaParam && initialFechaParam < startOfYear ? initialFechaParam : startOfYear);
  const [fechaHasta, setFechaHasta] = useState(initialFechaParam && initialFechaParam > today ? initialFechaParam : today);

  // TAB 1: Registro Diario
  const [movsCaja, setMovsCaja] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formFecha, setFormFecha] = useState(today);
  const [formDetalle, setFormDetalle] = useState(TIPOS_MOVIMIENTO_CAJA[0].detalle);
  const [formImporte, setFormImporte] = useState('');
  const [formObs, setFormObs] = useState('');
  const [saving, setSaving] = useState(false);

  // TAB 2: Verificación
  const [verificacion, setVerificacion] = useState([]);
  const [searchVerif, setSearchVerif] = useState(initialFechaParam || '');
  const [filterDiffOnly, setFilterDiffOnly] = useState(false);
  const [editingNoteFecha, setEditingNoteFecha] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [selectedFechaCobros, setSelectedFechaCobros] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set(initialFechaParam ? [initialFechaParam] : []));

  const toggleRowExpanded = (fecha) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(fecha)) next.delete(fecha);
      else next.add(fecha);
      return next;
    });
  };

  // TAB 3: Detalle cobros
  const [cobros, setCobros] = useState([]);
  const [searchCobros, setSearchCobros] = useState('');
  const [sortField, setSortField] = useState('fecha');
  const [sortDir, setSortDir] = useState('desc');

  // ========================================
  // Data Loading
  // ========================================

  const loadRegistro = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMovimientosCaja({ fechaDesde, fechaHasta });
      setMovsCaja(data);
    } catch (err) {
      addToast('Error al cargar movimientos de caja: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [fechaDesde, fechaHasta]);

  const loadVerificacion = useCallback(async () => {
    setLoading(true);
    try {
      const data = await buildVerificacionDiaria({ fechaDesde, fechaHasta });
      setVerificacion(data);
    } catch (err) {
      addToast('Error al cargar verificación: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [fechaDesde, fechaHasta]);

  const loadDetalle = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCobrosEfectivo({ fechaDesde, fechaHasta });
      setCobros(data);
    } catch (err) {
      addToast('Error al cargar cobros: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [fechaDesde, fechaHasta]);

  useEffect(() => {
    if (activeTab === TAB_REGISTRO) loadRegistro();
    else if (activeTab === TAB_VERIFICACION) loadVerificacion();
    else if (activeTab === TAB_DETALLE) loadDetalle();
  }, [activeTab, fechaDesde, fechaHasta]);

  // ========================================
  // TAB 1: Registro Handlers
  // ========================================

  const handleAddMovimiento = async (e) => {
    e.preventDefault();
    if (!formFecha || !formDetalle || !formImporte) {
      addToast('Complete todos los campos obligatorios', 'warning');
      return;
    }

    const tipoConfig = TIPOS_MOVIMIENTO_CAJA.find(t => t.detalle === formDetalle);
    let importe = Math.abs(parseFloat(formImporte));
    if (isNaN(importe)) {
      addToast('Importe inválido', 'error');
      return;
    }
    if (tipoConfig && tipoConfig.signo === 'NEGATIVO') {
      importe = -importe;
    }

    setSaving(true);
    try {
      await insertMovimientoCaja({
        fecha: formFecha,
        detalle: formDetalle,
        observacion: formObs || null,
        importe
      });
      addToast('Movimiento registrado correctamente', 'success');
      setFormImporte('');
      setFormObs('');
      setShowForm(false);
      loadRegistro();
    } catch (err) {
      addToast('Error al registrar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMov = async (id) => {
    if (!confirm('¿Eliminar este movimiento de caja?')) return;
    try {
      await deleteMovimientoCaja(id);
      addToast('Movimiento eliminado', 'success');
      loadRegistro();
    } catch (err) {
      addToast('Error al eliminar: ' + err.message, 'error');
    }
  };

  // ========================================
  // TAB 1: Computed subtotal
  // ========================================

  const movsConSubtotal = useMemo(() => {
    // Sort ascending for cumulative subtotal calc
    const sorted = [...movsCaja].sort((a, b) => {
      const fd = (a.fecha || '').localeCompare(b.fecha || '');
      if (fd !== 0) return fd;
      return (a.id || 0) - (b.id || 0);
    });
    let subtotal = 0;
    const result = sorted.map(m => {
      subtotal += Number(m.importe || 0);
      return { ...m, subtotal: Math.round(subtotal * 100) / 100 };
    });
    // Reverse to show most recent first
    return result.reverse();
  }, [movsCaja]);

  // ========================================
  // TAB 2: Verification note saving & filtering
  // ========================================

  const handleSaveNota = async (fecha, text) => {
    try {
      await saveNotaVerificacion({ fecha, observaciones: text });
      setVerificacion(prev => prev.map(v => v.fecha === fecha ? { ...v, observaciones: text } : v));
      addToast('Nota guardada para ' + fmtDate(fecha), 'success');
      setEditingNoteFecha(null);
    } catch (err) {
      addToast('Error al guardar nota: ' + err.message, 'error');
    }
  };

  const handleCopiarNotasContaduria = async (fecha, notasContaduria) => {
    if (!notasContaduria || notasContaduria.length === 0) return;
    const textoAnotar = notasContaduria.join(' | ');
    await handleSaveNota(fecha, textoAnotar);
  };

  const filteredVerificacion = useMemo(() => {
    let result = [...verificacion];
    if (filterDiffOnly) {
      result = result.filter(v => Math.abs(v.diferencia) >= 100);
    }
    if (searchVerif.trim()) {
      const s = searchVerif.toLowerCase().trim();
      result = result.filter(v =>
        (v.fecha || '').includes(s) ||
        fmtDate(v.fecha).includes(s) ||
        (v.observaciones || '').toLowerCase().includes(s)
      );
    }
    return result;
  }, [verificacion, filterDiffOnly, searchVerif]);

  // ========================================
  // TAB 3: Filtered & sorted cobros
  // ========================================

  const filteredCobros = useMemo(() => {
    let result = [...cobros];
    if (searchCobros.trim()) {
      const s = searchCobros.toLowerCase().trim();
      result = result.filter(c =>
        (c.nombre || '').toLowerCase().includes(s) ||
        String(c.numero_grupo || '').includes(s) ||
        (c.observaciones || '').toLowerCase().includes(s) ||
        (c.numero_linea || '').includes(s)
      );
    }
    result.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === 'importe') {
        va = Math.abs(Number(va || 0));
        vb = Math.abs(Number(vb || 0));
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [cobros, searchCobros, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  // ========================================
  // Export helpers
  // ========================================

  const exportCSV = (rows, filename) => {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(';'),
      ...rows.map(r => headers.map(h => {
        let v = r[h];
        if (v === null || v === undefined) v = '';
        return String(v).replace(/;/g, ',');
      }).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Archivo exportado correctamente', 'success');
  };

  // ========================================
  // Styles
  // ========================================

  const cardStyle = {
    background: 'var(--surface)',
    borderRadius: '16px',
    border: '1px solid var(--border-light)',
    boxShadow: 'var(--shadow-soft)',
    padding: '20px',
    marginBottom: '16px'
  };

  const thStyle = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    letterSpacing: '0.04em',
    borderBottom: '2px solid var(--border-light)',
    position: 'sticky',
    top: 0,
    background: 'var(--surface)',
    zIndex: 2
  };

  const tdStyle = {
    padding: '10px 14px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border-light)'
  };

  const tabBtnStyle = (isActive) => ({
    border: 'none',
    background: isActive ? 'var(--accent)' : 'transparent',
    color: isActive ? 'white' : 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '10px 20px',
    fontWeight: 700,
    borderRadius: '10px',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: isActive ? '0 8px 18px -4px var(--accent-shadow)' : 'none',
    transition: 'all 0.2s ease'
  });

  // ========================================
  // RENDER
  // ========================================

  return (
    <div style={{ padding: '0 8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '14px',
            background: 'linear-gradient(135deg, var(--accent) 0%, #1b5e20 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px -4px var(--accent-shadow)'
          }}>
            <Banknote size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
              Caja Efectivo
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
              Registro y verificación de movimientos de caja
            </p>
          </div>
        </div>

        {/* Date filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Calendar size={14} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="date"
            value={fechaDesde}
            onChange={e => setFechaDesde(e.target.value)}
            className="form-input"
            style={{ width: '150px', margin: 0, padding: '8px 10px', fontSize: '12px' }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>a</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={e => setFechaHasta(e.target.value)}
            className="form-input"
            style={{ width: '150px', margin: 0, padding: '8px 10px', fontSize: '12px' }}
          />
        </div>
      </div>

      {/* Tab Buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button style={tabBtnStyle(activeTab === TAB_REGISTRO)} onClick={() => setActiveTab(TAB_REGISTRO)}>
          <Coins size={16} /> Registro Diario
        </button>
        <button style={tabBtnStyle(activeTab === TAB_VERIFICACION)} onClick={() => setActiveTab(TAB_VERIFICACION)}>
          <CheckCircle2 size={16} /> Verificación Diaria
        </button>
        <button style={tabBtnStyle(activeTab === TAB_DETALLE)} onClick={() => setActiveTab(TAB_DETALLE)}>
          <Eye size={16} /> Detalle de Cobros
        </button>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
        </div>
      )}

      {/* ======================== TAB 1: REGISTRO DIARIO ======================== */}
      {!loading && activeTab === TAB_REGISTRO && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Saldo Actual
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--accent)' }}>
                {fmt(movsConSubtotal.length > 0 ? movsConSubtotal[0].subtotal : 0)}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Movimientos
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>
                {movsConSubtotal.length}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Ingresos
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#16a34a' }}>
                {fmt(movsConSubtotal.filter(m => m.importe > 0).reduce((s, m) => s + Number(m.importe), 0))}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Egresos
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--danger)' }}>
                {fmt(movsConSubtotal.filter(m => m.importe < 0).reduce((s, m) => s + Math.abs(Number(m.importe)), 0))}
              </div>
            </div>
          </div>

          {/* Action bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <button
              onClick={() => setShowForm(!showForm)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'linear-gradient(135deg, var(--accent) 0%, #1b5e20 100%)',
                color: 'white', border: 'none', borderRadius: '10px',
                padding: '10px 18px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                boxShadow: '0 8px 18px -4px var(--accent-shadow)'
              }}
            >
              {showForm ? <X size={16} /> : <Plus size={16} />}
              {showForm ? 'Cancelar' : 'Nuevo Movimiento'}
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={loadRegistro}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'var(--surface)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-light)', borderRadius: '10px',
                  padding: '8px 14px', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                }}
              >
                <RefreshCw size={14} /> Actualizar
              </button>
              <button
                onClick={() => exportCSV(movsConSubtotal.map(m => ({
                  Fecha: fmtDate(m.fecha), Detalle: m.detalle, Observacion: m.observacion || '',
                  Importe: m.importe, Subtotal: m.subtotal
                })), 'caja_diaria.csv')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'var(--surface)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-light)', borderRadius: '10px',
                  padding: '8px 14px', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                }}
              >
                <Download size={14} /> Exportar
              </button>
            </div>
          </div>

          {/* Add Form */}
          {showForm && (
            <form onSubmit={handleAddMovimiento} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', alignItems: 'end' }}>
              <div>
                <label className="form-label">Fecha</label>
                <input
                  type="date"
                  value={formFecha}
                  onChange={e => setFormFecha(e.target.value)}
                  className="form-input"
                  style={{ margin: 0 }}
                  required
                />
              </div>
              <div>
                <label className="form-label">Tipo de Movimiento</label>
                <select
                  value={formDetalle}
                  onChange={e => setFormDetalle(e.target.value)}
                  className="form-input"
                  style={{ margin: 0 }}
                >
                  {TIPOS_MOVIMIENTO_CAJA.map(t => (
                    <option key={t.detalle} value={t.detalle}>
                      {t.detalle} ({t.signo === 'NEGATIVO' ? '−' : '+'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Importe (valor absoluto)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formImporte}
                  onChange={e => setFormImporte(e.target.value)}
                  className="form-input"
                  style={{ margin: 0 }}
                  placeholder="Ej: 15000"
                  required
                />
              </div>
              <div>
                <label className="form-label">Observación (opcional)</label>
                <input
                  type="text"
                  value={formObs}
                  onChange={e => setFormObs(e.target.value)}
                  className="form-input"
                  style={{ margin: 0 }}
                  placeholder="Nota adicional..."
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  background: 'linear-gradient(135deg, var(--accent) 0%, #1b5e20 100%)',
                  color: 'white', border: 'none', borderRadius: '10px',
                  padding: '10px 18px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                  opacity: saving ? 0.6 : 1, height: '42px'
                }}
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                {saving ? 'Guardando...' : 'Registrar'}
              </button>
            </form>
          )}

          {/* Table */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Fecha</th>
                    <th style={thStyle}>Detalle</th>
                    <th style={thStyle}>Observación</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Importe</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Subtotal</th>
                    <th style={{ ...thStyle, width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {movsConSubtotal.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        No hay movimientos de caja en este período
                      </td>
                    </tr>
                  ) : (
                    movsConSubtotal.map(m => (
                      <tr key={m.id} style={{ transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={tdStyle}>{fmtDate(m.fecha)}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                            background: m.importe >= 0 ? '#dcfce7' : '#fee2e2',
                            color: m.importe >= 0 ? '#166534' : '#991b1b'
                          }}>
                            {m.importe >= 0 ? '↑' : '↓'} {m.detalle}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {m.observacion || '—'}
                        </td>
                        <td style={{
                          ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace',
                          color: m.importe >= 0 ? '#16a34a' : '#dc2626'
                        }}>
                          {m.importe >= 0 ? '+' : ''}{fmt(m.importe)}
                        </td>
                        <td style={{
                          ...tdStyle, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace',
                          color: 'var(--text-primary)'
                        }}>
                          {fmt(m.subtotal)}
                        </td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => handleDeleteMov(m.id)}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: 'var(--text-secondary)', padding: '4px',
                              borderRadius: '6px', transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fee2e2'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
                            title="Eliminar movimiento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ======================== TAB 2: VERIFICACIÓN DIARIA ======================== */}
      {!loading && activeTab === TAB_VERIFICACION && (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Días Registrados
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>
                {verificacion.length}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Días OK (dif. &lt; $100)
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#16a34a' }}>
                {verificacion.filter(v => Math.abs(v.diferencia) < 100).length}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Días con Diferencia
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: verificacion.filter(v => Math.abs(v.diferencia) >= 100).length > 0 ? '#dc2626' : 'var(--text-primary)' }}>
                {verificacion.filter(v => Math.abs(v.diferencia) >= 100).length}
              </div>
            </div>
          </div>

          {/* Actions & Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: '1', maxWidth: '500px' }}>
              <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={searchVerif}
                  onChange={e => setSearchVerif(e.target.value)}
                  className="form-input"
                  style={{ margin: 0, paddingLeft: '34px', fontSize: '12px' }}
                  placeholder="Buscar por fecha u observación..."
                />
                {searchVerif && (
                  <button
                    onClick={() => setSearchVerif('')}
                    style={{
                      position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                      background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px'
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setFilterDiffOnly(!filterDiffOnly)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: filterDiffOnly ? '#fee2e2' : 'var(--surface)',
                  color: filterDiffOnly ? '#991b1b' : 'var(--text-secondary)',
                  border: filterDiffOnly ? '1px solid #f87171' : '1px solid var(--border-light)',
                  borderRadius: '10px', padding: '8px 14px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <AlertTriangle size={14} /> Solo Diferencias ({verificacion.filter(v => Math.abs(v.diferencia) >= 100).length})
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={loadVerificacion}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'var(--surface)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-light)', borderRadius: '10px',
                  padding: '8px 14px', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                }}
              >
                <RefreshCw size={14} /> Actualizar
              </button>
              <button
                onClick={() => exportCSV(filteredVerificacion.map(v => ({
                  Fecha: fmtDate(v.fecha),
                  'Al Inicio Cambio': v.alInicioCambio,
                  'Al Cierre $': v.alCierre,
                  'Total Facturado Web': v.totalFacturadoWeb,
                  'Saldo Día': v.saldoDia,
                  'Diferencia': v.diferencia,
                  'Cobros': v.cobrosCount,
                  'Observaciones': v.observaciones
                })), 'verificacion_caja.csv')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'var(--surface)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-light)', borderRadius: '10px',
                  padding: '8px 14px', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                }}
              >
                <Download size={14} /> Exportar
              </button>
            </div>
          </div>

          {/* Verification Table */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '550px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '32px', textAlign: 'center' }}></th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Fecha</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Al Inicio Cambio</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Al Cierre $</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total Fact. Web</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Saldo Día</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Diferencia</th>
                    <th style={thStyle}>Cobros</th>
                    <th style={{ ...thStyle, minWidth: '260px' }}>Observaciones & Notas Contaduría</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVerificacion.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ ...tdStyle, textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        No hay datos de verificación para este filtro/período.
                      </td>
                    </tr>
                  ) : (
                    filteredVerificacion.map(v => {
                      const isOk = Math.abs(v.diferencia) < 100;
                      const isWarning = Math.abs(v.diferencia) >= 100 && Math.abs(v.diferencia) < 500;
                      const isEditingThis = editingNoteFecha === v.fecha;
                      const isExpanded = expandedRows.has(v.fecha);
                      const hasContaduriaNotes = v.notasContaduria && v.notasContaduria.length > 0;
                      return (
                        <>
                          <tr key={v.fecha}
                              style={{ transition: 'background 0.15s', background: isExpanded ? 'rgba(59, 130, 246, 0.04)' : 'transparent' }}
                              onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; }}
                              onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}>
                            <td style={{ ...tdStyle, textAlign: 'center', padding: '6px' }}>
                              <button
                                onClick={() => toggleRowExpanded(v.fecha)}
                                style={{
                                  background: 'transparent', border: 'none', cursor: 'pointer',
                                  color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center'
                                }}
                                title={isExpanded ? 'Ocultar desglose' : 'Ver notas de Contaduría y cobros'}
                              >
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              {isOk ? (
                                <CheckCircle2 size={18} color="#16a34a" />
                              ) : (
                                <AlertTriangle size={18} color={isWarning ? '#f59e0b' : '#dc2626'} />
                              )}
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{fmtDate(v.fecha)}</span>
                                {v.cajaMovsCount === 0 && (
                                  <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#991b1b' }}>
                                    Sin caja
                                  </span>
                                )}
                                {v.cobrosCount === 0 && (
                                  <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: '#f3f4f6', color: '#4b5563' }}>
                                    Sin cobros
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(v.alInicioCambio)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(v.alCierre)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', color: 'var(--accent)' }}>{fmt(v.totalFacturadoWeb)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(v.saldoDia)}</td>
                            <td style={{
                              ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 800,
                              color: isOk ? '#16a34a' : (isWarning ? '#f59e0b' : '#dc2626'),
                              background: isOk ? 'rgba(22,163,106,0.06)' : (Math.abs(v.diferencia) >= 500 ? 'rgba(220,38,38,0.06)' : 'transparent')
                            }}>
                              {v.diferencia > 0 ? '+' : ''}{fmt(v.diferencia)}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              <button
                                onClick={() => toggleRowExpanded(v.fecha)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: '28px', height: '28px', borderRadius: '8px',
                                  background: v.cobrosCount > 0 ? 'var(--accent-light)' : '#f3f4f6',
                                  color: v.cobrosCount > 0 ? 'var(--accent)' : 'var(--text-secondary)',
                                  fontSize: '12px', fontWeight: 800, border: 'none',
                                  cursor: 'pointer'
                                }}
                                title={v.cobrosCount > 0 ? 'Ver desglose de cobros' : 'Sin cobros'}
                              >
                                {v.cobrosCount}
                              </button>
                            </td>
                            <td style={{ ...tdStyle, fontSize: '12px' }}>
                              {isEditingThis ? (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    autoFocus
                                    value={noteText}
                                    onChange={e => setNoteText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveNota(v.fecha, noteText);
                                      if (e.key === 'Escape') setEditingNoteFecha(null);
                                    }}
                                    className="form-input"
                                    style={{ margin: 0, padding: '4px 8px', fontSize: '12px', flex: 1 }}
                                  />
                                  <button
                                    onClick={() => handleSaveNota(v.fecha, noteText)}
                                    style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => setEditingNoteFecha(null)}
                                    style={{ background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div>
                                  <div
                                    onClick={() => {
                                      setEditingNoteFecha(v.fecha);
                                      setNoteText(v.observaciones || '');
                                    }}
                                    style={{
                                      cursor: 'pointer', padding: '3px 6px', borderRadius: '6px',
                                      color: v.observaciones ? 'var(--text-primary)' : 'var(--text-secondary)',
                                      fontStyle: v.observaciones ? 'normal' : 'italic',
                                      fontWeight: v.observaciones ? 600 : 400,
                                      transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    title="Haga clic para editar la observación"
                                  >
                                    {v.observaciones || '+ Agregar nota de verificación...'}
                                  </div>

                                  {/* Badge de notas en Contaduría/Facturación */}
                                  {hasContaduriaNotes && (
                                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                      <span
                                        onClick={() => toggleRowExpanded(v.fecha)}
                                        style={{
                                          fontSize: '10.5px', background: 'rgba(59, 130, 246, 0.1)',
                                          color: '#1d4ed8', padding: '2px 6px', borderRadius: '5px',
                                          fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px',
                                          cursor: 'pointer', border: '1px solid rgba(59, 130, 246, 0.25)'
                                        }}
                                        title={v.notasContaduria.join(' | ')}
                                      >
                                        <FileText size={10} /> Contaduría ({v.notasContaduria.length}): {v.notasContaduria[0].slice(0, 35)}{v.notasContaduria[0].length > 35 ? '...' : ''}
                                      </span>
                                      {(!v.observaciones || v.observaciones.trim() !== v.notasContaduria.join(' | ')) && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleCopiarNotasContaduria(v.fecha, v.notasContaduria);
                                          }}
                                          style={{
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            color: '#2563eb', fontSize: '10px', fontWeight: 700,
                                            padding: '2px 4px', display: 'inline-flex', alignItems: 'center', gap: '2px'
                                          }}
                                          title="Copiar estas notas a la verificación diaria"
                                        >
                                          <Copy size={10} /> Vincular
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* FILA EXPANDIDA CON DETALLE DE COBROS Y NOTAS DE CONTADURÍA */}
                          {isExpanded && (
                            <tr key={v.fecha + '_expanded'} style={{ background: 'rgba(59, 130, 246, 0.02)' }}>
                              <td colSpan={10} style={{ padding: '12px 18px', borderBottom: '2px solid var(--border-light)' }}>
                                <div style={{
                                  background: 'var(--surface)', borderRadius: '12px',
                                  border: '1px solid var(--border-light)', padding: '14px',
                                  boxShadow: 'var(--shadow-soft)'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <FileText size={16} color="var(--accent)" />
                                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                        Detalle de Cobros y Notas de Contaduría / Facturación — {fmtDate(v.fecha)}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      {hasContaduriaNotes && (
                                        <button
                                          onClick={() => handleCopiarNotasContaduria(v.fecha, v.notasContaduria)}
                                          style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            background: 'rgba(59, 130, 246, 0.1)', color: '#1d4ed8',
                                            border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px',
                                            padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                                          }}
                                        >
                                          <Copy size={12} /> Vincular notas de Contaduría a la observación
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Listado de Cobros de este día */}
                                  {(!v.cobrosDetalle || v.cobrosDetalle.length === 0) ? (
                                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                      No hay cobros en efectivo registrados en Contaduría para esta fecha.
                                    </div>
                                  ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                        <thead>
                                          <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                                            <th style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800 }}>GRUPO</th>
                                            <th style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800 }}>SOCIO</th>
                                            <th style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800 }}>PERÍODO</th>
                                            <th style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800 }}>MEDIO</th>
                                            <th style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800, textAlign: 'right' }}>IMPORTE</th>
                                            <th style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800 }}>OBSERVACIÓN CONTADURÍA / FACTURACIÓN</th>
                                            <th style={{ padding: '6px 8px', fontSize: '10.5px', fontWeight: 800, textAlign: 'center' }}>ACCIÓN</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {v.cobrosDetalle.map(c => (
                                            <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                              <td style={{ padding: '6px 8px' }}>
                                                <Link
                                                  to={`/contaduria?tab=extracto&grupo=${c.numero_grupo}`}
                                                  style={{
                                                    color: 'var(--accent)', fontWeight: 800, textDecoration: 'none',
                                                    display: 'inline-flex', alignItems: 'center', gap: '3px'
                                                  }}
                                                  title="Ver cuenta corriente del grupo en Contaduría"
                                                >
                                                  #{c.numero_grupo} <ExternalLink size={10} />
                                                </Link>
                                              </td>
                                              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.nombre}</td>
                                              <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{c.periodo || '—'}</td>
                                              <td style={{ padding: '6px 8px' }}>
                                                <span style={{
                                                  fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                                                  background: c.medio_pago === 'EFECTIVO' ? '#dcfce7' : '#fef9c3',
                                                  color: c.medio_pago === 'EFECTIVO' ? '#166534' : '#854d0e'
                                                }}>
                                                  {c.medio_pago}
                                                </span>
                                              </td>
                                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#16a34a' }}>
                                                {fmt(c.importe)}
                                              </td>
                                              <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontStyle: c.observaciones ? 'normal' : 'italic' }}>
                                                {c.observaciones || '—'}
                                              </td>
                                              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                <Link
                                                  to={`/contaduria?tab=extracto&grupo=${c.numero_grupo}`}
                                                  className="air-btn"
                                                  style={{
                                                    padding: '3px 8px', fontSize: '10.5px', fontWeight: 700,
                                                    borderRadius: '6px', textDecoration: 'none',
                                                    background: 'var(--surface)', color: 'var(--accent)',
                                                    border: '1px solid var(--border-light)', display: 'inline-flex',
                                                    alignItems: 'center', gap: '3px'
                                                  }}
                                                >
                                                  Ver en Contaduría
                                                </Link>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ======================== TAB 3: DETALLE DE COBROS ======================== */}
      {!loading && activeTab === TAB_DETALLE && (
        <>
          {/* Search & actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ position: 'relative', flex: '1', maxWidth: '350px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                value={searchCobros}
                onChange={e => setSearchCobros(e.target.value)}
                className="form-input"
                style={{ margin: 0, paddingLeft: '34px', fontSize: '12px' }}
                placeholder="Buscar por nombre, grupo, línea..."
              />
              {searchCobros && (
                <button
                  onClick={() => setSearchCobros('')}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {filteredCobros.length} cobro{filteredCobros.length !== 1 ? 's' : ''}
                {' · '}Total: {fmt(filteredCobros.reduce((s, c) => s + Math.abs(Number(c.importe || 0)), 0))}
              </span>
              <button
                onClick={loadDetalle}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'var(--surface)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-light)', borderRadius: '10px',
                  padding: '8px 14px', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                }}
              >
                <RefreshCw size={14} /> Actualizar
              </button>
              <button
                onClick={() => exportCSV(filteredCobros.map(c => ({
                  Fecha: fmtDate(c.fecha),
                  Grupo: c.numero_grupo,
                  Nombre: c.nombre,
                  Empresa: extractEmpresa(c.observaciones),
                  Línea: c.numero_linea || extractLinea(c.observaciones),
                  Importe: Math.abs(Number(c.importe || 0)),
                  'Medio Pago': c.medio_pago,
                  Observaciones: c.observaciones
                })), 'cobros_efectivo.csv')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'var(--surface)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-light)', borderRadius: '10px',
                  padding: '8px 14px', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                }}
              >
                <Download size={14} /> Exportar
              </button>
            </div>
          </div>

          {/* Cobros Table */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '550px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('fecha')}>
                      Fecha {sortField === 'fecha' && (sortDir === 'asc' ? <ChevronUp size={12} style={{ display: 'inline' }} /> : <ChevronDown size={12} style={{ display: 'inline' }} />)}
                    </th>
                    <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('numero_grupo')}>
                      Grupo {sortField === 'numero_grupo' && (sortDir === 'asc' ? <ChevronUp size={12} style={{ display: 'inline' }} /> : <ChevronDown size={12} style={{ display: 'inline' }} />)}
                    </th>
                    <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('nombre')}>
                      Nombre {sortField === 'nombre' && (sortDir === 'asc' ? <ChevronUp size={12} style={{ display: 'inline' }} /> : <ChevronDown size={12} style={{ display: 'inline' }} />)}
                    </th>
                    <th style={thStyle}>Empresa</th>
                    <th style={thStyle}>Línea</th>
                    <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('importe')}>
                      Importe {sortField === 'importe' && (sortDir === 'asc' ? <ChevronUp size={12} style={{ display: 'inline' }} /> : <ChevronDown size={12} style={{ display: 'inline' }} />)}
                    </th>
                    <th style={thStyle}>Medio</th>
                    <th style={thStyle}>Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCobros.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        No hay cobros en efectivo en este período
                      </td>
                    </tr>
                  ) : (
                    filteredCobros.map(c => {
                      const empresa = extractEmpresa(c.observaciones);
                      const linea = c.numero_linea || extractLinea(c.observaciones);
                      return (
                        <tr key={c.id}
                            style={{ transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={tdStyle}>{fmtDate(c.fecha)}</td>
                          <td style={tdStyle}>
                            <span style={{
                              padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 800,
                              background: 'var(--accent-light)', color: 'var(--accent)'
                            }}>
                              #{c.numero_grupo}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{c.nombre || '—'}</td>
                          <td style={tdStyle}>
                            {empresa ? (
                              <span style={{
                                padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                background: empresa === 'CLARO' ? '#fef3c7' : empresa === 'MOVISTAR' ? '#dbeafe' : '#e0e7ff',
                                color: empresa === 'CLARO' ? '#92400e' : empresa === 'MOVISTAR' ? '#1e40af' : '#3730a3'
                              }}>
                                {empresa}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ ...tdStyle, fontSize: '12px', fontFamily: 'monospace' }}>{linea || '—'}</td>
                          <td style={{
                            ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace',
                            color: '#dc2626'
                          }}>
                            {fmt(Math.abs(Number(c.importe || 0)))}
                          </td>
                          <td style={tdStyle}>
                            <span style={{
                              padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                              background: c.medio_pago === 'EFECTIVO' ? '#dcfce7' : '#fef9c3',
                              color: c.medio_pago === 'EFECTIVO' ? '#166534' : '#854d0e'
                            }}>
                              {c.medio_pago}
                            </span>
                          </td>
                          <td style={{
                            ...tdStyle, fontSize: '11px', color: 'var(--text-secondary)',
                            maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }} title={c.observaciones}>
                            {c.observaciones || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
