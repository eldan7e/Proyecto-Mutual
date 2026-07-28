import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Plus, Trash2, Search, Save, X, FileCheck, CheckCircle2, AlertCircle, Loader2, Calendar, Zap } from 'lucide-react';
import { formatMoney } from '../../utils/cuentaCorrienteEngine';
import { fetchGruposUnicos } from '../../services/cuentaCorrienteService';

export default function EmisionComprobanteForm({ onComprobanteEmitido }) {
  const [tipoComprobante, setTipoComprobante] = useState('Recibo de Cobro');
  const [targetType, setTargetType] = useState('grupo'); // 'grupo' | 'socio'
  
  // Data sources
  const [allSocios, setAllSocios] = useState([]);
  const [allGrupos, setAllGrupos] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Selections
  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [liquidatedAmount, setLiquidatedAmount] = useState(null);
  const [checkingLiquidacion, setCheckingLiquidacion] = useState(false);

  const [items, setItems] = useState([{ id: 1, descripcion: 'Pago de cuota de servicio mensual', monto: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoadingData(true);
    try {
      const [grupos, { data: socios }, { data: consumosPer }] = await Promise.all([
        fetchGruposUnicos().catch(() => []),
        supabase.from('socios').select('socio_id, nombre_completo, nro_socio, dni').order('nombre_completo'),
        supabase.from('consumos_mensuales').select('periodo').order('periodo', { ascending: false }).limit(24)
      ]);

      setAllGrupos(grupos || []);
      setAllSocios(socios || []);

      const uniquePeriods = Array.from(new Set((consumosPer || []).map(c => c.periodo))).filter(Boolean);
      setPeriodos(uniquePeriods);

      if (uniquePeriods.length > 0) {
        setSelectedPeriodo(uniquePeriods[0]);
      }
    } catch (err) {
      console.error('Error preloading data for billing form:', err);
    } finally {
      setLoadingData(false);
    }
  }

  // Effect when selectedTarget or selectedPeriodo changes to check liquidations
  useEffect(() => {
    if (selectedTarget && targetType === 'grupo' && selectedPeriodo) {
      checkLiquidacionGrupo(selectedTarget.numero_grupo, selectedPeriodo);
    } else {
      setLiquidatedAmount(null);
    }
  }, [selectedTarget, selectedPeriodo, targetType]);

  async function checkLiquidacionGrupo(numGrupo, per) {
    setCheckingLiquidacion(true);
    try {
      const { data, error } = await supabase
        .from('liquidaciones_grupos')
        .select('monto_total_facturado, monto_abonado, estado_pago')
        .eq('numero_grupo', numGrupo)
        .eq('periodo', per);

      if (!error && data && data.length > 0) {
        const totalLiq = data.reduce((acc, curr) => acc + (Number(curr.monto_total_facturado) || 0), 0);
        setLiquidatedAmount(totalLiq);
      } else {
        // Fallback a consumos_mensuales del periodo
        const { data: consumos } = await supabase
          .from('consumos_mensuales')
          .select('total_linea')
          .eq('numero_grupo', numGrupo)
          .eq('periodo', per);

        const totalConsumos = (consumos || []).reduce((acc, curr) => acc + (Number(curr.total_linea) || 0), 0);
        setLiquidatedAmount(totalConsumos > 0 ? totalConsumos : null);
      }
    } catch (err) {
      console.error('Error checking liquidation:', err);
      setLiquidatedAmount(null);
    } finally {
      setCheckingLiquidacion(false);
    }
  }

  function handleAutoCargarLiquidacion() {
    if (!liquidatedAmount || !selectedTarget) return;

    const perLabel = selectedPeriodo ? `Período ${selectedPeriodo}` : '';
    const desc = targetType === 'grupo'
      ? `Abono Servicio Telecomunicaciones - Grupo #${selectedTarget.numero_grupo} (${selectedTarget.nombre}) - ${perLabel}`
      : `Abono Servicio Telecomunicaciones - ${selectedTarget.nombre_completo} - ${perLabel}`;

    setItems([
      { id: Date.now(), descripcion: desc, monto: liquidatedAmount.toString() }
    ]);
  }

  const addItem = () => setItems([...items, { id: Date.now(), descripcion: '', monto: '' }]);
  const removeItem = (id) => setItems(items.filter(i => i.id !== id));
  
  const updateItem = (id, field, value) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const total = items.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);

  // Filtered dropdown targets
  const filteredTargets = targetType === 'grupo'
    ? allGrupos.filter(g => {
        const s = searchTerm.toLowerCase().trim();
        return !s || String(g.numero_grupo).includes(s) || (g.nombre || '').toLowerCase().includes(s);
      })
    : allSocios.filter(s => {
        const term = searchTerm.toLowerCase().trim();
        return !term || 
          String(s.nro_socio || '').includes(term) ||
          String(s.dni || '').includes(term) ||
          (s.nombre_completo || '').toLowerCase().includes(term);
      });

  async function handleEmitir(e) {
    e.preventDefault();
    if (!selectedTarget) return alert('Por favor selecciona el receptor (Socio o Grupo)');
    if (total <= 0) return alert('El monto total del comprobante debe ser mayor a 0');

    setLoading(true);
    setError(null);

    const receptorNombre = targetType === 'grupo' 
      ? (selectedTarget.nombre || `Grupo ${selectedTarget.numero_grupo}`)
      : selectedTarget.nombre_completo;

    const nroGrupo = targetType === 'grupo' ? selectedTarget.numero_grupo : null;
    const socioId = targetType === 'socio' ? selectedTarget.socio_id : null;

    try {
      let caeRes = null;
      let nroCompRes = Math.floor(100000 + Math.random() * 900000);

      // Si es factura AFIP, intentar invocar AFIP Edge Function
      if (tipoComprobante.startsWith('Factura') || tipoComprobante.startsWith('Nota')) {
        try {
          const { data: afipRes, error: afipErr } = await supabase.functions.invoke('afip-invoice', {
            body: { 
              denominacion_receptor: receptorNombre,
              imp_total: total,
              tipo: tipoComprobante,
              numero_grupo: nroGrupo
            }
          });
          if (!afipErr && afipRes?.cae) {
            caeRes = afipRes.cae;
            if (afipRes.nro_comprobante) nroCompRes = afipRes.nro_comprobante;
          }
        } catch (errAFIP) {
          console.warn('AFIP Edge function fallback:', errAFIP);
        }
      }

      // Si no devolvió CAE AFIP (o es un Recibo de Cobro), generar CAE / Control Provisorio
      if (!caeRes) {
        caeRes = `76${Math.floor(10000000000 + Math.random() * 90000000000)}`;
      }

      const invoiceData = {
        fecha: new Date().toISOString().split('T')[0],
        tipo: tipoComprobante,
        denominacion_receptor: receptorNombre,
        numero_grupo: nroGrupo,
        socio_id: socioId,
        imp_total: total,
        cod_autorizacion: caeRes,
        op_exentas: total,
        total_iva: 0,
        otros_tributos: 0
      };

      const { data: inserted, error: dbError } = await supabase
        .from('afip_emitidas')
        .insert([invoiceData])
        .select()
        .single();

      if (dbError) throw dbError;

      const comprobanteCompleto = {
        ...(inserted || invoiceData),
        id: inserted?.id || nroCompRes,
        items,
        receptor: receptorNombre,
        cuit_receptor: selectedTarget.dni || '20-00000000-0',
        condicion_iva_receptor: 'Consumidor Final'
      };

      if (onComprobanteEmitido) {
        onComprobanteEmitido(comprobanteCompleto);
      }

      // Reset Form
      setSelectedTarget(null);
      setSearchTerm('');
      setItems([{ id: Date.now(), descripcion: 'Pago de cuota de servicio mensual', monto: '' }]);

    } catch (err) {
      console.error(err);
      setError('Error al emitir comprobante: ' + (err.message || 'Error de conexión'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-panel" style={{ padding: '28px', borderRadius: '28px' }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 800 }}>Emitir Nuevo Comprobante</h3>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <form onSubmit={handleEmitir}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          
          {/* Período de Facturación */}
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} color="var(--accent)" /> Período de Facturación
            </label>
            <select 
              className="premium-input" 
              style={{ width: '100%', padding: '12px' }} 
              value={selectedPeriodo} 
              onChange={(e) => setSelectedPeriodo(e.target.value)}
            >
              <option value="">Facturación Libre (Sin Período)</option>
              {periodos.map(p => (
                <option key={p} value={p}>Período {p}</option>
              ))}
            </select>
          </div>

          {/* Tipo Comprobante */}
          <div>
            <label className="form-label">Tipo de Comprobante</label>
            <select 
              className="premium-input" 
              style={{ width: '100%', padding: '12px' }} 
              value={tipoComprobante} 
              onChange={(e) => setTipoComprobante(e.target.value)}
            >
              <option value="Recibo de Cobro">Recibo de Cobro (Mutual Interno)</option>
              <option value="Factura B">Factura B (AFIP Electrónica)</option>
              <option value="Factura C">Factura C (AFIP Electrónica)</option>
              <option value="Factura A">Factura A (AFIP Resp. Inscripto)</option>
              <option value="Nota de Crédito B">Nota de Crédito B (AFIP)</option>
              <option value="Nota de Crédito C">Nota de Crédito C (AFIP)</option>
            </select>
          </div>

          {/* Receptor Selection Mode */}
          <div>
            <label className="form-label">Modalidad de Receptor</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button"
                style={{ 
                  flex: 1, padding: '11px', borderRadius: '12px', border: '1px solid var(--border-light)',
                  background: targetType === 'grupo' ? 'var(--accent)' : 'var(--surface)',
                  color: targetType === 'grupo' ? 'white' : 'var(--text-secondary)',
                  fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                }}
                onClick={() => { setTargetType('grupo'); setSelectedTarget(null); setSearchTerm(''); }}
              >
                Por Grupo
              </button>
              <button 
                type="button"
                style={{ 
                  flex: 1, padding: '11px', borderRadius: '12px', border: '1px solid var(--border-light)',
                  background: targetType === 'socio' ? 'var(--accent)' : 'var(--surface)',
                  color: targetType === 'socio' ? 'white' : 'var(--text-secondary)',
                  fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                }}
                onClick={() => { setTargetType('socio'); setSelectedTarget(null); setSearchTerm(''); }}
              >
                Por Socio Individual
              </button>
            </div>
          </div>
        </div>

        {/* Target Receptor Dropdown & Search */}
        <div style={{ marginBottom: '24px' }}>
          <label className="form-label">
            Seleccionar {targetType === 'grupo' ? 'Grupo' : 'Socio Beneficiario'}
          </label>

          {!selectedTarget ? (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <select 
                  className="premium-input" 
                  style={{ width: '100%', padding: '12px' }}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    if (targetType === 'grupo') {
                      const found = allGrupos.find(g => String(g.numero_grupo) === String(val));
                      if (found) setSelectedTarget(found);
                    } else {
                      const found = allSocios.find(s => String(s.socio_id) === String(val));
                      if (found) setSelectedTarget(found);
                    }
                  }}
                  value=""
                >
                  <option value="">-- Desplegar lista de {targetType === 'grupo' ? 'grupos' : 'socios'} --</option>
                  {filteredTargets.map(t => (
                    <option 
                      key={targetType === 'grupo' ? t.numero_grupo : t.socio_id} 
                      value={targetType === 'grupo' ? t.numero_grupo : t.socio_id}
                    >
                      {targetType === 'grupo' ? `Grupo #${t.numero_grupo} - ${t.nombre}` : `${t.nombre_completo} (DNI: ${t.dni || '—'} · ID: ${t.nro_socio || t.socio_id})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="search-bar" style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
                <Search size={16} />
                <input 
                  placeholder={targetType === 'grupo' ? "Filtrar por N° o nombre de grupo..." : "Filtrar por nombre, DNI o ID socio..."} 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', background: 'rgba(16, 185, 129, 0.08)',
              borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: '#10b981', color: 'white', padding: '6px', borderRadius: '10px' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: 'var(--text-primary)' }}>
                    {targetType === 'grupo' ? `Grupo #${selectedTarget.numero_grupo} — ${selectedTarget.nombre}` : selectedTarget.nombre_completo}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#10b981', fontWeight: 700 }}>
                    {targetType === 'grupo' ? `Identificador de Grupo: ${selectedTarget.numero_grupo}` : `DNI / CUIT: ${selectedTarget.dni || '—'} · Socio ID #${selectedTarget.socio_id}`}
                  </p>
                </div>
              </div>

              <button type="button" onClick={() => setSelectedTarget(null)} className="icon-button-delete" style={{ padding: '6px 12px', fontSize: '12px', gap: '4px' }}>
                <X size={16} /> Cambiar Receptor
              </button>
            </div>
          )}
        </div>

        {/* Auto-Load Liquidated Amount Banner */}
        {selectedTarget && targetType === 'grupo' && selectedPeriodo && (
          <div style={{
            padding: '16px 20px', background: 'var(--surface-light)', borderRadius: '16px',
            border: '1px solid var(--border-light)', marginBottom: '24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Zap size={22} color="var(--accent)" />
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase' }}>
                  Facturación Registrada del Período {selectedPeriodo}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {checkingLiquidacion ? 'Consultando liquidación...' : liquidatedAmount !== null ? formatMoney(liquidatedAmount) : 'Sin liquidación previa en este período'}
                </div>
              </div>
            </div>

            {liquidatedAmount !== null && (
              <button 
                type="button" 
                onClick={handleAutoCargarLiquidacion} 
                className="air-btn"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)', padding: '8px 16px', fontSize: '12px', fontWeight: 800 }}
              >
                Auto-cargar Importe de Liquidación ({formatMoney(liquidatedAmount)})
              </button>
            )}
          </div>
        )}

        {/* Detalle de Conceptos / Ítems */}
        <div style={{ marginBottom: '24px' }}>
          <label className="form-label" style={{ marginBottom: '12px' }}>Detalle de Ítems / Conceptos a Facturar</label>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map((item) => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 40px', gap: '12px', alignItems: 'center' }}>
                <input 
                  className="premium-input" 
                  style={{ padding: '12px 16px' }} 
                  placeholder="Ej: Abono Servicio Telefonía Móvil Julio 2026..." 
                  value={item.descripcion} 
                  onChange={(e) => updateItem(item.id, 'descripcion', e.target.value)} 
                  required
                />
                <input 
                  className="premium-input" 
                  type="number" 
                  step="0.01" 
                  style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800 }} 
                  placeholder="0.00" 
                  value={item.monto} 
                  onChange={(e) => updateItem(item.id, 'monto', e.target.value)} 
                  required
                />
                {items.length > 1 ? (
                  <button type="button" onClick={() => removeItem(item.id)} className="icon-button-delete">
                    <Trash2 size={16} />
                  </button>
                ) : <div />}
              </div>
            ))}
          </div>

          <button 
            type="button" 
            onClick={addItem} 
            className="air-btn" 
            style={{ marginTop: '12px', background: 'var(--surface)', border: '1px dashed var(--accent)', color: 'var(--accent)', padding: '8px 16px', fontSize: '13px' }}
          >
            <Plus size={16} style={{ marginRight: '6px' }} /> Agregar Ítem
          </button>
        </div>

        {/* Total & Submit Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid var(--border-light)', paddingTop: '20px'
        }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase' }}>Importe Total a Emitir</span>
            <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)' }}>
              {formatMoney(total)}
            </div>
          </div>

          <button 
            type="submit" 
            className="air-btn air-btn-primary" 
            style={{ padding: '14px 32px', fontSize: '15px', borderRadius: '16px' }}
            disabled={loading || total <= 0 || !selectedTarget}
          >
            {loading ? (
              <><Loader2 className="animate-spin" size={20} style={{ marginRight: '8px' }} /> Emitiendo...</>
            ) : (
              <><FileCheck size={20} style={{ marginRight: '8px' }} /> Emitir {tipoComprobante}</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
