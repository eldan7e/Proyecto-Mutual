import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { 
  Search, FileText, DollarSign, TrendingUp, AlertTriangle, 
  Loader2, RefreshCw, Plus, CheckCircle2, ChevronRight, ShieldCheck, 
  Download, Send, ArrowUpRight, ArrowDownLeft, Calculator, Settings, Building, Calendar, Printer
} from 'lucide-react';
import Modal from './components/Modal';
import ComprobanteCobroModal from './components/ComprobanteCobroModal';
import { useToast } from './components/ui/ToastProvider';
import { 
  fetchGruposUnicos, fetchMovimientosGrupo, registrarCobroCuenta, 
  getParametrosCuenta, updateTasaAnual 
} from './services/cuentaCorrienteService';
import { 
  calcularDiasMora, calcularInteresMora, imputarCobroFIFO, formatMoney 
} from './utils/cuentaCorrienteEngine';

export default function CuentaCorriente() {
  const { addToast } = useToast();

  const getTodayISO = () => new Date().toISOString().slice(0, 10);

  // Estados principales
  const [gruposList, setGruposList] = useState([]);
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  
  // Parámetros de Tasa
  const [tna, setTna] = useState(120.0);
  const [editingTna, setEditingTna] = useState('120');
  const [savingTna, setSavingTna] = useState(false);

  // Filtros de Fecha para Cálculo de Deuda
  const [fechaInicio, setFechaInicio] = useState('2026-01-01');
  const [fechaFinCalculo, setFechaFinCalculo] = useState(getTodayISO());

  // Filtro de búsqueda de grupo
  const [searchGrupo, setSearchGrupo] = useState('');

  // Modal de cobro FIFO
  const [cobroModalOpen, setCobroModalOpen] = useState(false);
  const [montoCobro, setMontoCobro] = useState('');
  const [medioPago, setMedioPago] = useState('TRANSFERENCIA');
  const [observacionesCobro, setObservacionesCobro] = useState('');
  const [procesandoCobro, setProcesandoCobro] = useState(false);
  const [resultadoFifo, setResultadoFifo] = useState(null);

  // Modal de Comprobante de Cobro
  const [comprobanteModalOpen, setComprobanteModalOpen] = useState(false);
  const [comprobanteData, setComprobanteData] = useState(null);

  // Cargar grupos y parámetros al iniciar
  useEffect(() => {
    loadInicial();
  }, []);

  // Cargar movimientos cuando cambia el grupo seleccionado
  useEffect(() => {
    if (selectedGrupo !== null) {
      loadMovimientos(selectedGrupo);
    }
  }, [selectedGrupo]);

  // Suscripción Realtime para actualizar movimientos en tiempo real
  useEffect(() => {
    if (!selectedGrupo) return;

    const channel = supabase
      .channel(`movimientos-cuenta-grupo-${selectedGrupo}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'movimientos_cuenta',
          filter: `numero_grupo=eq.${selectedGrupo}`
        },
        () => {
          loadMovimientos(selectedGrupo);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGrupo]);

  async function loadInicial() {
    setLoadingGrupos(true);
    try {
      const [params, grupos] = await Promise.all([
        getParametrosCuenta(),
        fetchGruposUnicos()
      ]);

      if (params && params.tasa_anual) {
        const valTna = Number(params.tasa_anual);
        setTna(valTna);
        setEditingTna(String(valTna));
      }

      setGruposList(grupos || []);
      if (grupos && grupos.length > 0) {
        const grupo2 = grupos.find(g => g.numero_grupo === 2) || grupos[0];
        setSelectedGrupo(grupo2.numero_grupo);
      }
    } catch (err) {
      console.error('Error al cargar datos iniciales:', err);
      addToast('Error al conectar con la base de datos: ' + err.message, 'error');
    } finally {
      setLoadingGrupos(false);
    }
  }

  async function loadMovimientos(numGrupo) {
    setLoading(true);
    try {
      const data = await fetchMovimientosGrupo(numGrupo);
      setMovimientos(data || []);
    } catch (err) {
      console.error('Error al cargar movimientos:', err);
      addToast('Error al cargar el extracto de cuenta del Grupo ' + numGrupo, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveTna() {
    const num = parseFloat(editingTna);
    if (isNaN(num) || num < 0) {
      addToast('Tasa TNA inválida', 'warning');
      return;
    }
    setSavingTna(true);
    try {
      await updateTasaAnual(num);
      setTna(num);
      addToast(`Tasa TNA fijada en ${num}% e intereses recalculados`, 'success');
    } catch (err) {
      addToast('Error al guardar la tasa: ' + err.message, 'error');
    } finally {
      setSavingTna(false);
    }
  }

  // Movimientos filtrados por rango de fecha
  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter(m => {
      if (!m.fecha) return true;
      if (fechaInicio && m.fecha < fechaInicio) return false;
      if (fechaFinCalculo && m.fecha > fechaFinCalculo) return false;
      return true;
    });
  }, [movimientos, fechaInicio, fechaFinCalculo]);

  // Filtrado de grupos en el selector
  const gruposFiltrados = useMemo(() => {
    if (!searchGrupo.trim()) return gruposList;
    const s = searchGrupo.toLowerCase().trim();
    return gruposList.filter(g => 
      String(g.numero_grupo).includes(s) || 
      (g.nombre || '').toLowerCase().includes(s)
    );
  }, [gruposList, searchGrupo]);

  // Cálculos consolidados del grupo actual (calculados estrictamente hasta fechaFinCalculo)
  const kpis = useMemo(() => {
    let saldoCapitalActual = 0;
    let interesMoraAcumulado = 0;
    let facturasPendientes = [];

    movimientosFiltrados.forEach(m => {
      const imp = Math.abs(Number(m.importe) || 0);
      if (m.tipo === 'FACTURA') {
        const capitalPend = Math.max(0, imp - Number(m.pago_aplicado_capital || 0));
        if (capitalPend > 0.05) {
          const dias = calcularDiasMora(m.fecha, fechaFinCalculo);
          const intCalc = calcularInteresMora(capitalPend, dias, tna);
          interesMoraAcumulado += Math.max(0, intCalc - Number(m.pago_aplicado_interes || 0));
          facturasPendientes.push({ ...m, capitalPendiente: capitalPend });
        }
      }
    });

    if (movimientosFiltrados.length > 0) {
      const ultimo = movimientosFiltrados[movimientosFiltrados.length - 1];
      saldoCapitalActual = Number(ultimo.saldo_capital || 0);
    }

    const totalConsolidado = Math.max(0, saldoCapitalActual + interesMoraAcumulado);

    return {
      saldoCapitalActual,
      interesMoraAcumulado,
      totalConsolidado,
      facturasPendientes
    };
  }, [movimientosFiltrados, tna, fechaFinCalculo]);

  // Preparar modal de cobro FIFO
  function openCobroModal() {
    setMontoCobro(kpis.totalConsolidado > 0 ? kpis.totalConsolidado.toFixed(2) : '0.00');
    setObservacionesCobro('');
    const res = imputarCobroFIFO(kpis.facturasPendientes, kpis.totalConsolidado, tna, fechaFinCalculo);
    setResultadoFifo(res);
    setCobroModalOpen(true);
  }

  function previewCobroFIFO(valMonto) {
    const num = parseFloat(valMonto);
    if (isNaN(num) || num <= 0) {
      setResultadoFifo(null);
      return;
    }
    const res = imputarCobroFIFO(kpis.facturasPendientes, num, tna, fechaFinCalculo);
    setResultadoFifo(res);
  }

  async function handleConfirmarCobro() {
    const num = parseFloat(montoCobro);
    if (isNaN(num) || num <= 0) {
      addToast('Monto a cobrar inválido', 'warning');
      return;
    }

    const res = imputarCobroFIFO(kpis.facturasPendientes, num, tna, fechaFinCalculo);
    setProcesandoCobro(true);

    try {
      const currentGrupoObj = gruposList.find(g => g.numero_grupo === selectedGrupo);
      const nuevoMov = await registrarCobroCuenta({
        numero_grupo: selectedGrupo,
        nombre: currentGrupoObj?.nombre || `Grupo ${selectedGrupo}`,
        importe: num,
        medio_pago: medioPago,
        observaciones: observacionesCobro || `Cobro PAGO - ${medioPago}`,
        imputaciones: res.desgloses
      });

      addToast(`Cobro de ${formatMoney(num)} registrado e imputado con éxito`, 'success');
      setCobroModalOpen(false);

      // Mostrar Comprobante de Cobro
      setComprobanteData({
        reciboNumero: `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        fecha: new Date().toISOString().slice(0, 10),
        numero_grupo: selectedGrupo,
        nombre_titular: currentGrupoObj?.nombre || `Grupo ${selectedGrupo}`,
        monto_cobrado: num,
        medio_pago: medioPago,
        observaciones: observacionesCobro,
        desgloses: res.desgloses,
        saldo_restante: res.remanenteSaldoAFavor > 0 ? -res.remanenteSaldoAFavor : Math.max(0, kpis.saldoCapitalActual - res.totalCapitalCancelado)
      });
      setComprobanteModalOpen(true);

      loadMovimientos(selectedGrupo);
    } catch (err) {
      console.error(err);
      addToast('Error al registrar cobro: ' + err.message, 'error');
    } finally {
      setProcesandoCobro(false);
    }
  }

  function verComprobanteMovimiento(mov) {
    const currentGrupoObj = gruposList.find(g => g.numero_grupo === selectedGrupo);
    setComprobanteData({
      reciboNumero: `REC-${mov.fecha.slice(0,4)}-${mov.id || '001'}`,
      fecha: mov.fecha,
      numero_grupo: selectedGrupo,
      nombre_titular: currentGrupoObj?.nombre || `Grupo ${selectedGrupo}`,
      monto_cobrado: Math.abs(Number(mov.importe)),
      medio_pago: mov.medio_pago || 'TRANSFERENCIA',
      observaciones: mov.observaciones || 'Pago registrado',
      desgloses: [
        {
          observaciones: mov.observaciones || 'Aplicado a cuenta corriente',
          pagoAplicadoCapital: Number(mov.pago_aplicado_capital || Math.abs(Number(mov.importe))),
          pagoAplicadoInteres: Number(mov.pago_aplicado_interes || 0)
        }
      ],
      saldo_restante: Number(mov.saldo_final || 0)
    });
    setComprobanteModalOpen(true);
  }

  // Exportar extracto a CSV
  function exportarExtractoCSV() {
    if (movimientosFiltrados.length === 0) return;
    let csv = 'Fecha,Grupo,Tipo,Medio Pago,Importe,Saldo Capital,Interes Mora,Saldo Final,Observaciones\n';
    movimientosFiltrados.forEach(m => {
      const dias = m.tipo === 'FACTURA' ? calcularDiasMora(m.fecha, fechaFinCalculo) : 0;
      const intMora = m.tipo === 'FACTURA' ? calcularInteresMora(Number(m.importe), dias, tna) : 0;
      csv += `"${m.fecha}","${m.numero_grupo}","${m.tipo}","${m.medio_pago || ''}",${m.importe},${m.saldo_capital},${intMora},${m.saldo_final},"${m.observaciones || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracto_grupo_${selectedGrupo}_hasta_${fechaFinCalculo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`Extracto del Grupo ${selectedGrupo} exportado`, 'success');
  }

  const currentGrupoObj = gruposList.find(g => g.numero_grupo === selectedGrupo);

  return (
    <div style={{ padding: '0 20px 40px 20px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      
      {/* Header & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{ background: 'var(--accent)', color: 'white', padding: '8px', borderRadius: '12px' }}>
              <Building size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.03em' }}>Cuenta Corriente por Grupo</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
                Extracto bancario acumulativo con cálculo automático de mora e imputación FIFO
              </p>
            </div>
          </div>
        </div>

        {/* Panel de Configuración TNA y Fechas */}
        <div className="glass-panel" style={{ padding: '12px 18px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          
          {/* TNA Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={18} color="var(--accent)" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>Tasa TNA:</span>
            <input 
              type="number" 
              value={editingTna}
              onChange={(e) => setEditingTna(e.target.value)}
              style={{
                width: '70px', background: 'var(--surface)', border: '1px solid var(--border-light)',
                borderRadius: '8px', padding: '6px 10px', fontSize: '14px', fontWeight: 800,
                color: 'var(--text-primary)', textAlign: 'center'
              }}
            />
            <span style={{ fontSize: '14px', fontWeight: 800 }}>%</span>
            <button 
              onClick={handleSaveTna}
              disabled={savingTna}
              className="action-button"
              style={{ padding: '6px 14px', fontSize: '12px', height: '34px' }}
            >
              {savingTna ? <Loader2 size={14} className="animate-spin" /> : 'Actualizar'}
            </button>
          </div>

          <div style={{ height: '24px', width: '1px', background: 'var(--border-light)' }} />

          {/* Rango de Fechas / Límite de Cálculo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={18} color="var(--accent)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Desde:</span>
              <input 
                type="date" 
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Hasta / Cálculo:</span>
              <input 
                type="date" 
                value={fechaFinCalculo}
                onChange={(e) => setFechaFinCalculo(e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}
              />
            </div>
            <button 
              onClick={() => setFechaFinCalculo(getTodayISO())}
              className="icon-button-edit"
              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 800, borderRadius: '8px' }}
            >
              Usar Hoy
            </button>
          </div>

        </div>
      </div>

      {/* Select Grupo + KPIs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px', marginBottom: '24px' }}>
        
        {/* Sidebar Selector de Grupos */}
        <div className="glass-panel" style={{ padding: '16px', borderRadius: '20px', display: 'flex', flexDirection: 'column', height: '380px' }}>
          <div className="search-bar" style={{ marginBottom: '12px' }}>
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Buscar grupo o titular..."
              value={searchGrupo}
              onChange={(e) => setSearchGrupo(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', width: '100%', fontSize: '13px', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '4px' }}>
            {loadingGrupos ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
              </div>
            ) : gruposFiltrados.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                No se encontraron grupos
              </div>
            ) : (
              gruposFiltrados.map(g => {
                const isSelected = selectedGrupo === g.numero_grupo;
                return (
                  <div
                    key={g.numero_grupo}
                    onClick={() => setSelectedGrupo(g.numero_grupo)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--accent)' : 'transparent',
                      color: isSelected ? 'white' : 'var(--text-primary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14px' }}>Grupo {g.numero_grupo}</div>
                      <div style={{ fontSize: '11px', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '190px' }}>
                        {g.nombre}
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ opacity: isSelected ? 1 : 0.4 }} />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top KPIs del Grupo Seleccionado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Header del Grupo seleccionado */}
          <div className="glass-panel" style={{ padding: '20px 24px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Cuenta Corriente Seleccionada
              </span>
              <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                Grupo {selectedGrupo} — {currentGrupoObj?.nombre || 'Titular S/D'}
              </h2>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={exportarExtractoCSV} className="icon-button-edit" style={{ height: '42px', padding: '0 16px', borderRadius: '12px', gap: '8px', fontSize: '13px' }}>
                <Download size={16} /> Exportar CSV
              </button>
              <button onClick={openCobroModal} className="action-button" style={{ height: '42px', padding: '0 20px', borderRadius: '12px', gap: '8px', fontSize: '14px', background: 'linear-gradient(135deg, var(--accent) 0%, #1b5e20 100%)' }}>
                <Plus size={18} /> Registrar Cobro (FIFO)
              </button>
            </div>
          </div>

          {/* Cards de Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>SALDO CAPITAL</span>
                <DollarSign size={16} color="var(--accent)" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: kpis.saldoCapitalActual > 0 ? 'var(--danger)' : '#10b981' }}>
                {formatMoney(kpis.saldoCapitalActual)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Capital impago acumulado
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>INTERESES MORA ({tna}% TNA)</span>
                <AlertTriangle size={16} color="#ef4444" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: kpis.interesMoraAcumulado > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                {formatMoney(kpis.interesMoraAcumulado)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Calculados al {fechaFinCalculo}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', background: 'rgba(99,102,241,0.06)', border: '1px solid var(--accent-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)' }}>TOTAL DEUDA CONSOLIDADA</span>
                <Calculator size={16} color="var(--accent)" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--accent)' }}>
                {formatMoney(kpis.totalConsolidado)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Capital + Intereses por mora
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Movimientos / Extracto Table */}
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Extracto de Cuenta Corriente — Grupo {selectedGrupo}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Mostrando movimientos desde {fechaInicio} hasta {fechaFinCalculo}
            </p>
          </div>
          <button onClick={() => loadMovimientos(selectedGrupo)} className="icon-button-edit" style={{ width: '38px', height: '38px' }}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ padding: '14px 20px' }}>Fecha</th>
                <th>Tipo</th>
                <th>Concepto / Observaciones</th>
                <th>Medio / Origen</th>
                <th style={{ textAlign: 'right' }}>Importe ($)</th>
                <th style={{ textAlign: 'right' }}>Interés Mora ($)</th>
                <th style={{ textAlign: 'right' }}>Saldo Capital ($)</th>
                <th style={{ textAlign: 'right' }}>Saldo Final ($)</th>
                <th style={{ textAlign: 'center' }}>Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ padding: '80px', textAlign: 'center' }}>
                    <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                  </td>
                </tr>
              ) : movimientosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No se encontraron movimientos registrados en el rango de fechas seleccionado.
                  </td>
                </tr>
              ) : (
                movimientosFiltrados.map((m, idx) => {
                  const imp = Number(m.importe) || 0;
                  const isFactura = m.tipo === 'FACTURA';
                  const isPago = m.tipo === 'PAGO';
                  const diasMora = isFactura ? calcularDiasMora(m.fecha, fechaFinCalculo) : 0;
                  const intMora = isFactura ? calcularInteresMora(imp - Number(m.pago_aplicado_capital||0), diasMora, tna) : 0;

                  return (
                    <tr key={m.id || idx}>
                      <td style={{ padding: '14px 20px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                        {m.fecha}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 800,
                          background: isPago ? 'rgba(16,185,129,0.12)' : isFactura ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                          color: isPago ? '#10b981' : isFactura ? '#ef4444' : '#f59e0b'
                        }}>
                          {isPago ? <ArrowDownLeft size={12} /> : isFactura ? <ArrowUpRight size={12} /> : null}
                          {m.tipo}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px', fontWeight: 500 }}>
                        {m.observaciones || m.nombre || 'Movimiento de cuenta'}
                        {m.numero_linea && <span style={{ color: 'var(--text-secondary)', fontSize: '11px', marginLeft: '6px' }}>({m.numero_linea})</span>}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {m.medio_pago || m.origen || 'Sistema'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '14px', color: isPago ? '#10b981' : 'var(--text-primary)' }}>
                        {formatMoney(imp)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '13px', color: intMora > 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                        {intMora > 0 ? formatMoney(intMora) : '-'}
                        {diasMora > 0 && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block' }}>({diasMora}d mora)</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '14px' }}>
                        {formatMoney(m.saldo_capital)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 900, fontSize: '14px', color: Number(m.saldo_final) > 5 ? 'var(--danger)' : '#10b981' }}>
                        {formatMoney(m.saldo_final)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isPago ? (
                          <button 
                            onClick={() => verComprobanteMovimiento(m)}
                            className="icon-button-edit"
                            style={{ padding: '4px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, gap: '4px', display: 'inline-flex', alignItems: 'center' }}
                          >
                            <Printer size={12} /> Recibo
                          </button>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL COBRO FIFO */}
      <Modal isOpen={cobroModalOpen} onClose={() => setCobroModalOpen(false)} title={`Registrar Cobro e Imputación FIFO — Grupo ${selectedGrupo}`} maxWidth="560px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Titular del Grupo</p>
            <p style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{currentGrupoObj?.nombre}</p>
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Deuda Capital:</span>
                <span style={{ fontSize: '13px', fontWeight: 700, marginLeft: '4px' }}>{formatMoney(kpis.saldoCapitalActual)}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Intereses Mora ({tna}%):</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444', marginLeft: '4px' }}>{formatMoney(kpis.interesMoraAcumulado)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="form-label">Monto Recibido ($)</label>
            <input 
              type="number" 
              className="form-input" 
              value={montoCobro} 
              onChange={(e) => {
                setMontoCobro(e.target.value);
                previewCobroFIFO(e.target.value);
              }}
              placeholder="Ingresar importe pagado..."
              style={{ marginBottom: '4px' }} 
            />
            <button 
              onClick={() => {
                const full = kpis.totalConsolidado.toFixed(2);
                setMontoCobro(full);
                previewCobroFIFO(full);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, marginTop: '4px' }}
            >
              Cobrar saldo total consolidado ({formatMoney(kpis.totalConsolidado)})
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Medio de Pago</label>
              <select className="form-input" value={medioPago} onChange={(e) => setMedioPago(e.target.value)} style={{ marginBottom: 0 }}>
                <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                <option value="CREDICOOP">Credicoop DEBIN</option>
                <option value="NACION">Banco Nación</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="CHEQUE">Cheque Bancario</option>
                <option value="MERCADO_PAGO">Mercado Pago</option>
              </select>
            </div>
            <div>
              <label className="form-label">Observaciones / Ref</label>
              <input type="text" className="form-input" value={observacionesCobro} onChange={(e) => setObservacionesCobro(e.target.value)} placeholder="Ej: Recibo N° 4021" style={{ marginBottom: 0 }} />
            </div>
          </div>

          {/* Vista previa de imputación FIFO */}
          {resultadoFifo && (
            <div style={{ padding: '14px', background: 'rgba(16,185,129,0.06)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#10b981', marginBottom: '8px' }}>
                ✓ Desglose de Imputación FIFO (Bancario)
              </div>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>• Imputado a Intereses por mora: <strong>{formatMoney(resultadoFifo.totalInteresCancelado)}</strong></div>
                <div>• Imputado a Capital impago: <strong>{formatMoney(resultadoFifo.totalCapitalCancelado)}</strong></div>
                {resultadoFifo.remanenteSaldoAFavor > 0 && (
                  <div style={{ color: '#10b981', fontWeight: 800, marginTop: '4px' }}>
                    💰 Saldo a favor sobrante para el Grupo: {formatMoney(resultadoFifo.remanenteSaldoAFavor)}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button onClick={() => setCobroModalOpen(false)} className="action-button" style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', width: '50%' }} disabled={procesandoCobro}>
              Cancelar
            </button>
            <button onClick={handleConfirmarCobro} className="action-button" style={{ width: '50%', background: 'linear-gradient(135deg, var(--accent) 0%, #1b5e20 100%)' }} disabled={procesandoCobro}>
              {procesandoCobro ? <Loader2 className="animate-spin" size={16} /> : 'Confirmar Cobro y Generar Recibo'}
            </button>
          </div>

        </div>
      </Modal>

      {/* MODAL COMPROBANTE DE PAGO OFICIAL */}
      <ComprobanteCobroModal 
        isOpen={comprobanteModalOpen}
        onClose={() => setComprobanteModalOpen(false)}
        cobroData={comprobanteData}
      />

    </div>
  );
}
