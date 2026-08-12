import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calculator, Search, DollarSign, TrendingUp, AlertTriangle, 
  Loader2, RefreshCw, Plus, CheckCircle2, ChevronRight, ShieldCheck, 
  Download, ArrowUpRight, ArrowDownLeft, Settings, Building, Calendar, 
  FileText, Users, Eye, Edit3, X, Receipt, Filter, Clock, Sparkles
} from 'lucide-react';
import { supabase } from './supabaseClient';
import Modal from './components/Modal';
import ComprobanteCobroModal from './components/ComprobanteCobroModal';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import { 
  getParametrosCuenta, updateTasaAnual, fetchGruposUnicos, 
  fetchMovimientosGrupo, fetchInformeSaldosGeneral, registrarCobroCuenta 
} from './services/cuentaCorrienteService';
import { 
  recalcularSaldosGrupo, imputarCobroFIFO, formatMoney, 
  calcularDiasMora, calcularInteresMora, DEFAULT_TNA 
} from './utils/cuentaCorrienteEngine';

export default function Contaduria() {
  const { addToast } = useToast();
  const confirm = useConfirm();

  const getTodayISO = () => new Date().toISOString().slice(0, 10);

  // --- ESTADOS PRINCIPALES ---
  const [activeTab, setActiveTab] = useState('saldos'); // 'saldos' | 'extracto' | 'periodos'
  const [gruposList, setGruposList] = useState([]);
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [liquidacionesGrupo, setLiquidacionesGrupo] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [loadingLiquidaciones, setLoadingLiquidaciones] = useState(false);

  // Parámetros TNA
  const [tna, setTna] = useState(DEFAULT_TNA);
  const [editingTna, setEditingTna] = useState('120');
  const [savingTna, setSavingTna] = useState(false);
  const [isTnaModalOpen, setIsTnaModalOpen] = useState(false);

  // Filtros
  const [searchGrupo, setSearchGrupo] = useState('');
  const [soloDeudores, setSoloDeudores] = useState(false);
  const [saldosData, setSaldosData] = useState([]);

  // Modal de cobro FIFO
  const [cobroModalOpen, setCobroModalOpen] = useState(false);
  const [montoCobro, setMontoCobro] = useState('');
  const [medioPago, setMedioPago] = useState('TRANSFERENCIA');
  const [observacionesCobro, setObservacionesCobro] = useState('');
  const [fechaCobro, setFechaCobro] = useState(getTodayISO());
  const [procesandoCobro, setProcesandoCobro] = useState(false);
  const [resultadoFifo, setResultadoFifo] = useState(null);

  // Modal de Comprobante de Cobro
  const [comprobanteModalOpen, setComprobanteModalOpen] = useState(false);
  const [comprobanteData, setComprobanteData] = useState(null);

  // Modal de Edición Rápida de Grupo / Socio / Línea
  const [editGrupoModalOpen, setEditGrupoModalOpen] = useState(false);
  const [grupoEditData, setGrupoEditData] = useState(null);
  const [editTitularNombre, setEditTitularNombre] = useState('');
  const [savingGrupoEdit, setSavingGrupoEdit] = useState(false);

  // --- CARGA INICIAL ---
  useEffect(() => {
    loadInicial();
  }, []);

  // Cargar saldos de informe general
  useEffect(() => {
    loadSaldosGeneral();
  }, [soloDeudores, tna]);

  // Cargar detalles cuando cambia el grupo seleccionado
  useEffect(() => {
    if (selectedGrupo !== null) {
      loadMovimientos(selectedGrupo);
      loadLiquidaciones(selectedGrupo);
    }
  }, [selectedGrupo]);

  // Suscripción Realtime para actualizar movimientos en vivo
  useEffect(() => {
    if (!selectedGrupo) return;

    const channel = supabase
      .channel(`contaduria-grupo-${selectedGrupo}`)
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
          loadSaldosGeneral();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'liquidaciones_grupos',
          filter: `numero_grupo=eq.${selectedGrupo}`
        },
        () => {
          loadLiquidaciones(selectedGrupo);
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
        setTna(params.tasa_anual);
        setEditingTna(String(params.tasa_anual));
      }
      setGruposList(grupos);
      if (grupos.length > 0 && selectedGrupo === null) {
        setSelectedGrupo(grupos[0].numero_grupo);
      }
    } catch (err) {
      console.error('Error al cargar datos iniciales de contaduría:', err);
      addToast('Error al inicializar módulo de contaduría: ' + err.message, 'error');
    } finally {
      setLoadingGrupos(false);
    }
  }

  async function loadSaldosGeneral() {
    setLoading(true);
    try {
      const data = await fetchInformeSaldosGeneral({ search: searchGrupo, soloDeudores });
      setSaldosData(data);
    } catch (err) {
      console.error('Error al cargar informe de saldos:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMovimientos(numeroGrupo) {
    setLoading(true);
    try {
      const rawMovs = await fetchMovimientosGrupo(numeroGrupo);
      const procesados = recalcularSaldosGrupo(rawMovs, tna);
      setMovimientos(procesados);
    } catch (err) {
      console.error('Error al cargar movimientos:', err);
      addToast('Error al cargar movimientos del grupo ' + numeroGrupo, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadLiquidaciones(numeroGrupo) {
    setLoadingLiquidaciones(true);
    try {
      const { data, error } = await supabase
        .from('liquidaciones_grupos')
        .select('*, proveedores(nombre), socios(nombre_completo)')
        .eq('numero_grupo', numeroGrupo)
        .order('periodo', { ascending: false });

      if (error) throw error;
      setLiquidacionesGrupo(data || []);
    } catch (err) {
      console.error('Error al cargar liquidaciones del grupo:', err);
    } finally {
      setLoadingLiquidaciones(false);
    }
  }

  // Guardar TNA
  async function handleSaveTna(e) {
    e.preventDefault();
    setSavingTna(true);
    try {
      const val = parseFloat(editingTna);
      if (isNaN(val) || val <= 0) throw new Error('Tasa inválida');
      await updateTasaAnual(val);
      setTna(val);
      setIsTnaModalOpen(false);
      addToast(`Tasa TNA actualizada a ${val}%`, 'success');
      if (selectedGrupo) loadMovimientos(selectedGrupo);
      loadSaldosGeneral();
    } catch (err) {
      addToast('Error al guardar TNA: ' + err.message, 'error');
    } finally {
      setSavingTna(false);
    }
  }

  // --- CÁLCULO DE FIFO Y COBRO ---
  useEffect(() => {
    if (!cobroModalOpen || !montoCobro || isNaN(parseFloat(montoCobro))) {
      setResultadoFifo(null);
      return;
    }

    const val = Math.abs(parseFloat(montoCobro));
    if (val <= 0) {
      setResultadoFifo(null);
      return;
    }

    const facturasPendientes = movimientos
      .filter(m => m.tipo === 'FACTURA' && (m.saldo_final > 0 || (m.importe - (m.pago_aplicado_capital || 0)) > 0))
      .map(m => ({
        id: m.id,
        fecha: m.fecha,
        numero_linea: m.numero_linea,
        empresa: m.empresa,
        observaciones: m.observaciones,
        importe: m.importe,
        pago_aplicado_capital: m.pago_aplicado_capital || 0,
        pago_aplicado_interes: m.pago_aplicado_interes || 0
      }));

    const resultado = imputarCobroFIFO(facturasPendientes, val, tna, fechaCobro);
    setResultadoFifo(resultado);
  }, [montoCobro, cobroModalOpen, movimientos, tna, fechaCobro]);

  // Ejecutar Cobro
  async function handleConfirmarCobro(e) {
    e.preventDefault();
    const val = parseFloat(montoCobro);
    if (isNaN(val) || val <= 0) {
      addToast('Ingrese un importe de cobro válido', 'warning');
      return;
    }

    const titularInfo = gruposList.find(g => g.numero_grupo === selectedGrupo);
    setProcesandoCobro(true);

    try {
      const nuevoMov = await registrarCobroCuenta({
        numero_grupo: selectedGrupo,
        nombre: titularInfo?.nombre || `Grupo ${selectedGrupo}`,
        importe: val,
        medio_pago: medioPago,
        observaciones: observacionesCobro || `Cobro registrado en Contaduría - ${medioPago}`,
        fecha: fechaCobro,
        imputaciones: resultadoFifo?.desgloses || []
      });

      addToast(`Cobro de ${formatMoney(val)} registrado exitosamente.`, 'success');

      setComprobanteData({
        fecha: fechaCobro,
        grupo: selectedGrupo,
        titular: titularInfo?.nombre || `Grupo ${selectedGrupo}`,
        importe: val,
        medioPago,
        observaciones: observacionesCobro,
        interesPagado: resultadoFifo?.totalInteresCancelado || 0,
        capitalPagado: resultadoFifo?.totalCapitalCancelado || 0,
        remanenteSaldoAFavor: resultadoFifo?.remanenteSaldoAFavor || 0,
        desgloses: resultadoFifo?.desgloses || []
      });

      setCobroModalOpen(false);
      setMontoCobro('');
      setObservacionesCobro('');
      setResultadoFifo(null);

      await loadMovimientos(selectedGrupo);
      await loadLiquidaciones(selectedGrupo);
      await loadSaldosGeneral();

      setComprobanteModalOpen(true);
    } catch (err) {
      console.error('Error al registrar cobro:', err);
      addToast('Error al procesar el cobro: ' + err.message, 'error');
    } finally {
      setProcesandoCobro(false);
    }
  }

  // --- EDICIÓN RÁPIDA DE TITULAR / GRUPO ---
  function handleOpenEditGrupo(grupoNum) {
    const info = gruposList.find(g => g.numero_grupo === grupoNum);
    setGrupoEditData(info);
    setEditTitularNombre(info?.nombre || '');
    setEditGrupoModalOpen(true);
  }

  async function handleSaveGrupoEdit(e) {
    e.preventDefault();
    if (!grupoEditData || !editTitularNombre.trim()) return;

    setSavingGrupoEdit(true);
    try {
      // Actualizar nombre en movimientos_cuenta
      await supabase
        .from('movimientos_cuenta')
        .update({ nombre: editTitularNombre.trim() })
        .eq('numero_grupo', grupoEditData.numero_grupo);

      addToast(`Nombre del Grupo ${grupoEditData.numero_grupo} actualizado a "${editTitularNombre.trim()}"`, 'success');
      setEditGrupoModalOpen(false);
      loadInicial();
      loadSaldosGeneral();
      if (selectedGrupo) loadMovimientos(selectedGrupo);
    } catch (err) {
      addToast('Error al actualizar nombre: ' + err.message, 'error');
    } finally {
      setSavingGrupoEdit(false);
    }
  }

  // --- CÁLCULO DE KPIs GLOBALES ---
  const statsGlobales = useMemo(() => {
    let totalDeuda = 0;
    let totalCobrado = 0;
    let totalIntereses = 0;
    let gruposDeudoresCount = 0;
    let totalSaldoAFavor = 0;

    saldosData.forEach(g => {
      if (g.saldoFinalUltimo > 5) {
        totalDeuda += g.saldoFinalUltimo;
        gruposDeudoresCount++;
      } else if (g.saldoFinalUltimo < -5) {
        totalSaldoAFavor += Math.abs(g.saldoFinalUltimo);
      }
      totalCobrado += g.totalPagos || 0;
      totalIntereses += g.interesPendUltimo || 0;
    });

    return {
      totalDeuda,
      totalCobrado,
      totalIntereses,
      gruposDeudoresCount,
      totalSaldoAFavor,
      totalGrupos: saldosData.length
    };
  }, [saldosData]);

  // Movimientos del grupo seleccionado
  const ultimoMovGrupo = useMemo(() => {
    if (movimientos.length === 0) return null;
    return movimientos[movimientos.length - 1];
  }, [movimientos]);

  const titularSeleccionadoInfo = useMemo(() => {
    return gruposList.find(g => g.numero_grupo === selectedGrupo);
  }, [gruposList, selectedGrupo]);

  return (
    <div className="page-container animate-fade" style={{ paddingBottom: '60px' }}>
      
      {/* HEADER Y KPIS DE CONTADURÍA */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '10px', borderRadius: '14px' }}>
              <Calculator size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: 'var(--text-primary)' }}>
                Gestión de Contaduría
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>
                Control real de cuentas corrientes, liquidaciones por grupo e intereses por mora.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            onClick={() => setIsTnaModalOpen(true)}
            className="air-btn"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 700 }}
          >
            <Settings size={16} /> TNA Mora: {tna}%
          </button>
          
          <button 
            onClick={() => setCobroModalOpen(true)}
            className="air-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 800 }}
          >
            <Plus size={18} /> Registrar Cobro / Pago
          </button>
        </div>
      </div>

      {/* BENNTOCARDS KPIS */}
      <div className="bento-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '28px', gap: '16px' }}>
        <div className="bento-card" style={{ padding: '20px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>DEUDA REAL ACUMULADA</span>
            <AlertTriangle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#ef4444' }}>
            {formatMoney(statsGlobales.totalDeuda)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
            {statsGlobales.gruposDeudoresCount} grupos con saldo pendiente
          </div>
        </div>

        <div className="bento-card" style={{ padding: '20px', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>TOTAL COBRADO / COBROS</span>
            <CheckCircle2 size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--accent)' }}>
            {formatMoney(statsGlobales.totalCobrado)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
            Pagos procesados e imputados
          </div>
        </div>

        <div className="bento-card" style={{ padding: '20px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>INTERESES PENDIENTES</span>
            <TrendingUp size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#f59e0b' }}>
            {formatMoney(statsGlobales.totalIntereses)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
            Interés por mora según TNA ({tna}%)
          </div>
        </div>

        <div className="bento-card" style={{ padding: '20px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>SALDO EN CRÉDITO</span>
            <DollarSign size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#3b82f6' }}>
            {formatMoney(statsGlobales.totalSaldoAFavor)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
            Saldos a favor de los grupos
          </div>
        </div>
      </div>

      {/* PESTAÑAS PRINCIPALES DEL MÓDULO */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(0,0,0,0.03)', padding: '6px', borderRadius: '18px', width: 'fit-content' }}>
        <button
          onClick={() => setActiveTab('saldos')}
          className={`nav-pill ${activeTab === 'saldos' ? 'active' : ''}`}
          style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
        >
          <Building size={16} /> Estado General de Cuentas ({saldosData.length})
        </button>
        <button
          onClick={() => setActiveTab('extracto')}
          className={`nav-pill ${activeTab === 'extracto' ? 'active' : ''}`}
          style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
        >
          <FileText size={16} /> Extracto / Libro Mayor de Grupo {selectedGrupo ? `#${selectedGrupo}` : ''}
        </button>
        <button
          onClick={() => setActiveTab('periodos')}
          className={`nav-pill ${activeTab === 'periodos' ? 'active' : ''}`}
          style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
        >
          <Calendar size={16} /> Períodos Liquidados por Grupo ({liquidacionesGrupo.length})
        </button>
      </div>

      {/* TAB 1: ESTADO GENERAL DE CUENTAS (INFORME DE SALDOS POR GRUPO) */}
      {activeTab === 'saldos' && (
        <div className="bento-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Buscar por grupo, socio o proveedor..."
                  value={searchGrupo}
                  onChange={(e) => setSearchGrupo(e.target.value)}
                  className="premium-input"
                  style={{ width: '100%', paddingLeft: '42px', height: '42px' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={soloDeudores}
                  onChange={(e) => setSoloDeudores(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                />
                Solo con Deuda (&gt; $5)
              </label>
            </div>

            <button 
              onClick={loadSaldosGeneral}
              className="air-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700 }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>

          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', borderRadius: '12px 0 0 12px' }}>GRUPO / CUENTA</th>
                  <th style={{ padding: '12px 16px' }}>TITULAR REGISTRADO</th>
                  <th style={{ padding: '12px 16px' }}>OPERADORAS</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>FACTURADO</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>PAGADO</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>CAPITAL PEND.</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>INT. MORA</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>DEUDA TOTAL</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', borderRadius: '0 12px 12px 0' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '40px' }}>
                      <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                      <div style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Calculando estado de cuentas en tiempo real...</div>
                    </td>
                  </tr>
                ) : saldosData.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      No se encontraron cuentas o grupos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  saldosData.map((row) => {
                    const isDeudor = row.saldoFinalUltimo > 5;
                    const isCredito = row.saldoFinalUltimo < -5;

                    return (
                      <tr 
                        key={row.numero_grupo}
                        style={{ borderBottom: '1px solid var(--border-light)', background: selectedGrupo === row.numero_grupo ? 'rgba(16,185,129,0.05)' : 'transparent' }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 900 }}>
                          <span style={{ background: 'var(--surface-hover)', padding: '4px 10px', borderRadius: '8px', fontSize: '13px' }}>
                            Grupo #{row.numero_grupo}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {row.nombre}
                            <button 
                              onClick={() => handleOpenEditGrupo(row.numero_grupo)} 
                              style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
                              title="Editar nombre de titular"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {row.empresas}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(row.totalFacturas)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                          {formatMoney(row.totalPagos)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                          {formatMoney(row.saldoCapitalUltimo)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                          {formatMoney(row.interesPendUltimo)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, color: isDeudor ? '#ef4444' : isCredito ? '#3b82f6' : 'var(--accent)' }}>
                          {formatMoney(row.saldoFinalUltimo)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              onClick={() => {
                                setSelectedGrupo(row.numero_grupo);
                                setActiveTab('extracto');
                              }}
                              className="air-btn"
                              style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: '8px' }}
                            >
                              <Eye size={14} /> Extracto
                            </button>
                            <button
                              onClick={() => {
                                setSelectedGrupo(row.numero_grupo);
                                setActiveTab('periodos');
                              }}
                              className="air-btn"
                              style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: '8px' }}
                            >
                              <Calendar size={14} /> Liquidaciones
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DETALLE DE CUENTA CORRIENTE / EXTRACTO DEL GRUPO */}
      {activeTab === 'extracto' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* SELECTOR Y RESUMEN DEL GRUPO SELECCIONADO */}
          <div className="bento-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>GRUPO SELECCIONADO</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                  <select 
                    value={selectedGrupo || ''}
                    onChange={(e) => setSelectedGrupo(Number(e.target.value))}
                    className="premium-input"
                    style={{ fontSize: '16px', fontWeight: 900, padding: '8px 16px', height: '44px' }}
                  >
                    {gruposList.map(g => (
                      <option key={g.numero_grupo} value={g.numero_grupo}>
                        Grupo #{g.numero_grupo} - {g.nombre}
                      </option>
                    ))}
                  </select>

                  <button 
                    onClick={() => handleOpenEditGrupo(selectedGrupo)}
                    className="air-btn"
                    style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700 }}
                  >
                    <Edit3 size={14} /> Editar Titular
                  </button>
                </div>
              </div>

              {/* SALDO ACTUAL Y ACCIONES */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>SALDO FINAL ACTUAL</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: (ultimoMovGrupo?.saldo_final || 0) > 5 ? '#ef4444' : 'var(--accent)' }}>
                    {formatMoney(ultimoMovGrupo?.saldo_final || 0)}
                  </div>
                </div>

                <button 
                  onClick={() => setCobroModalOpen(true)}
                  className="air-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 20px', borderRadius: '12px', fontWeight: 800 }}
                >
                  <Plus size={16} /> Imputar Cobro
                </button>
              </div>
            </div>
          </div>

          {/* TABLA EXTRACTO CRONOLÓGICO DEL GRUPO */}
          <div className="bento-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, margin: 0 }}>
                Movimientos e Histórico de Cuenta Corriente (Grupo #{selectedGrupo})
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Fórmulas exactas TNA {tna}% con imputación FIFO
              </span>
            </div>

            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px' }}>FECHA</th>
                    <th style={{ padding: '10px 12px' }}>TIPO</th>
                    <th style={{ padding: '10px 12px' }}>OPERADORA / CONCEPTO</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>IMPORTE</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>PLAZO DÍAS</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>INT. MORA</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>PAGO INT.</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>PAGO CAP.</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>SALDO CAPITAL</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>SALDO FINAL</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '30px' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                      </td>
                    </tr>
                  ) : movimientos.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                        Este grupo no registra movimientos de cuenta corriente aún.
                      </td>
                    </tr>
                  ) : (
                    movimientos.map((m) => {
                      const isPago = m.tipo === 'PAGO';
                      return (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700 }}>{m.fecha}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              background: isPago ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: isPago ? '#10b981' : '#ef4444',
                              padding: '3px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '10px'
                            }}>
                              {m.tipo}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 700 }}>{m.empresa || 'GENERAL'}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{m.observaciones || ''}</div>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: isPago ? '#10b981' : 'var(--text-primary)' }}>
                            {formatMoney(m.importe)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            {m.plazo_dias || 0}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>
                            {formatMoney(m.interes_mora || 0)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                            {formatMoney(m.pago_aplicado_interes || 0)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                            {formatMoney(m.pago_aplicado_capital || 0)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                            {formatMoney(m.saldo_capital)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: m.saldo_final > 5 ? '#ef4444' : 'var(--accent)' }}>
                            {formatMoney(m.saldo_final)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PERÍODOS LIQUIDADOS POR GRUPO */}
      {activeTab === 'periodos' && (
        <div className="bento-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 900, margin: 0 }}>
                Períodos Liquidados y Facturados para Grupo #{selectedGrupo}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                Sincronización en tiempo real entre Facturación, Auditoría y Liquidaciones.
              </p>
            </div>

            <select 
              value={selectedGrupo || ''}
              onChange={(e) => setSelectedGrupo(Number(e.target.value))}
              className="premium-input"
              style={{ fontSize: '14px', fontWeight: 800, padding: '8px 16px' }}
            >
              {gruposList.map(g => (
                <option key={g.numero_grupo} value={g.numero_grupo}>
                  Grupo #{g.numero_grupo} - {g.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px' }}>PERÍODO</th>
                  <th style={{ padding: '12px 16px' }}>OPERADORA</th>
                  <th style={{ padding: '12px 16px' }}>LÍNEAS LOTE</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>FACTURADO SOCIO</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>ABONADO</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>MARGEN AUNAR</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>ESTADO PAGO</th>
                </tr>
              </thead>
              <tbody>
                {loadingLiquidaciones ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px' }}>
                      <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                    </td>
                  </tr>
                ) : liquidacionesGrupo.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      Este grupo no posee liquidaciones generadas todavía.
                    </td>
                  </tr>
                ) : (
                  liquidacionesGrupo.map(l => {
                    const isAbonado = l.estado_pago === 'ABONADO';
                    const isParcial = l.estado_pago === 'PARCIAL';

                    return (
                      <tr key={l.liquidacion_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 900 }}>{l.periodo}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{l.proveedores?.nombre || 'N/D'}</td>
                        <td style={{ padding: '12px 16px' }}>{l.total_lineas_lote || 1} líneas</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800 }}>{formatMoney(l.monto_total_facturado)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>{formatMoney(l.monto_abonado || 0)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{formatMoney(l.beneficio_aunar || 0)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{
                            background: isAbonado ? 'rgba(16, 185, 129, 0.1)' : isParcial ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: isAbonado ? '#10b981' : isParcial ? '#f59e0b' : '#ef4444',
                            padding: '4px 10px', borderRadius: '8px', fontWeight: 900, fontSize: '11px'
                          }}>
                            {l.estado_pago || 'PENDIENTE'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL COBRO FIFO */}
      <Modal isOpen={cobroModalOpen} onClose={() => setCobroModalOpen(false)} title={`Registrar Cobro - Grupo #${selectedGrupo}`} maxWidth="600px">
        <form onSubmit={handleConfirmarCobro} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Fecha del Pago</label>
            <input 
              type="date" 
              value={fechaCobro} 
              onChange={(e) => setFechaCobro(e.target.value)} 
              className="form-input" 
              required 
            />
          </div>

          <div>
            <label className="form-label">Importe a Cobrar ($)</label>
            <input 
              type="number" 
              step="0.01" 
              placeholder="0.00" 
              value={montoCobro} 
              onChange={(e) => setMontoCobro(e.target.value)} 
              className="form-input" 
              autoFocus 
              required 
            />
          </div>

          <div>
            <label className="form-label">Medio de Pago</label>
            <select 
              value={medioPago} 
              onChange={(e) => setMedioPago(e.target.value)} 
              className="form-input"
            >
              <option value="TRANSFERENCIA">Transferencia Bancaria</option>
              <option value="DEBITO">Débito Automático</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="MERCADOPAGO">MercadoPago</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>

          <div>
            <label className="form-label">Observaciones / Referencia</label>
            <input 
              type="text" 
              placeholder="Ej: Nro de Comprobante / Transferencia Banco" 
              value={observacionesCobro} 
              onChange={(e) => setObservacionesCobro(e.target.value)} 
              className="form-input" 
            />
          </div>

          {/* DESGLOSE FIFO EN VIVO */}
          {resultadoFifo && (
            <div style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', borderRadius: '12px', fontSize: '12px' }}>
              <div style={{ fontWeight: 800, marginBottom: '8px', color: 'var(--accent)' }}>
                DESGLOSE DE IMPUTACIÓN AUTOMÁTICA (REGLA FIFO):
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Imputado a Intereses por Mora:</span>
                <strong style={{ color: '#f59e0b' }}>{formatMoney(resultadoFifo.totalInteresCancelado)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Imputado a Capital Deuda:</span>
                <strong>{formatMoney(resultadoFifo.totalCapitalCancelado)}</strong>
              </div>
              {resultadoFifo.remanenteSaldoAFavor > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3b82f6', fontWeight: 800, marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-light)' }}>
                  <span>Saldo a Favor del Grupo:</span>
                  <span>{formatMoney(resultadoFifo.remanenteSaldoAFavor)}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button 
              type="button" 
              onClick={() => setCobroModalOpen(false)} 
              className="air-btn" 
              style={{ flex: 1, padding: '12px' }}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={procesandoCobro} 
              className="air-btn-primary" 
              style={{ flex: 1, padding: '12px', fontWeight: 800 }}
            >
              {procesandoCobro ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Cobro'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL CONFIGURACIÓN TNA */}
      <Modal isOpen={isTnaModalOpen} onClose={() => setIsTnaModalOpen(false)} title="Configuración de Tasa TNA" maxWidth="400px">
        <form onSubmit={handleSaveTna} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Tasa Nominal Anual (TNA %)</label>
            <input 
              type="number" 
              step="0.1" 
              value={editingTna} 
              onChange={(e) => setEditingTna(e.target.value)} 
              className="form-input" 
              required 
            />
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Tasa anual utilizada para el cálculo diario de mora. Default: 120%
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={() => setIsTnaModalOpen(false)} className="air-btn" style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" disabled={savingTna} className="air-btn-primary" style={{ flex: 1 }}>
              {savingTna ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Tasa'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL EDICIÓN RÁPIDA TITULAR */}
      <Modal isOpen={editGrupoModalOpen} onClose={() => setEditGrupoModalOpen(false)} title={`Editar Nombre Titular - Grupo #${grupoEditData?.numero_grupo}`} maxWidth="450px">
        <form onSubmit={handleSaveGrupoEdit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Nombre del Titular / Identificación del Grupo</label>
            <input 
              type="text" 
              value={editTitularNombre} 
              onChange={(e) => setEditTitularNombre(e.target.value)} 
              className="form-input" 
              required 
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={() => setEditGrupoModalOpen(false)} className="air-btn" style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" disabled={savingGrupoEdit} className="air-btn-primary" style={{ flex: 1 }}>
              {savingGrupoEdit ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Nombre'}
            </button>
          </div>
        </form>
      </Modal>

      {/* COMPROBANTE DE COBRO COMPONENT */}
      <ComprobanteCobroModal 
        isOpen={comprobanteModalOpen}
        onClose={() => setComprobanteModalOpen(false)}
        data={comprobanteData}
      />

    </div>
  );
}
