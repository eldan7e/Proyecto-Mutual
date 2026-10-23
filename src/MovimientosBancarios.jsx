import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { 
  Search, RefreshCw, AlertCircle, Plus, Calendar, DollarSign, 
  TrendingUp, Landmark, CheckCircle2, User, Loader2, Printer, 
  FileSpreadsheet, Filter, ArrowUpDown, ChevronDown, Check, Coins, CreditCard, Trash2
} from 'lucide-react';
import Modal from './components/Modal';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import ComprobanteCobroModal from './components/ComprobanteCobroModal';
import { formatMoney, formatFecha } from './utils/cuentaCorrienteEngine';
import { fetchGruposUnicos, registrarCobroCuenta, eliminarCobroCuenta } from './services/cuentaCorrienteService';
import { fetchPeriods } from './services/conciliacionService';
import * as XLSX from 'xlsx';

// Helper para calcular rangos de fecha de semana (Lunes a Domingo)
function getWeekRangeDates(offsetWeeks = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
  const diffToMonday = (day === 0 ? -6 : 1 - day) + (offsetWeeks * 7);
  
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  const toISO = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const dayStr = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  };

  const toLabel = (dt) => {
    return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  };

  return {
    start: toISO(monday),
    end: toISO(sunday),
    label: `${toLabel(monday)} al ${toLabel(sunday)}`,
    year: monday.getFullYear()
  };
}

export default function MovimientosBancarios() {
  const { addToast } = useToast();
  const confirm = useConfirm();

  // Estados de datos
  const [pagos, setPagos] = useState([]);
  const [gruposList, setGruposList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros de Rango Temporal (Por defecto: ESTA_SEMANA)
  const [filtroRango, setFiltroRango] = useState('ESTA_SEMANA'); // 'ESTA_SEMANA' | 'SEMANA_ANTERIOR' | 'ESTE_MES' | 'TODOS' | 'CUSTOM'
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');

  // Filtros de Grupo (Alternar entre Todos los Grupos y Grupo Específico)
  const [modoGrupo, setModoGrupo] = useState('TODOS'); // 'TODOS' | 'GRUPO'
  const [selectedGrupo, setSelectedGrupo] = useState('');
  const [searchGrupoTerm, setSearchGrupoTerm] = useState('');

  // Filtro de Medio de Pago
  const [filtroMedio, setFiltroMedio] = useState('TODOS'); // 'TODOS' | 'EFECTIVO' | 'CREDICOOP' | 'NACION' | 'DIRECTO'

  // Búsqueda libre
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de Comprobante Oficial de Cobro
  const [comprobanteModalOpen, setComprobanteModalOpen] = useState(false);
  const [comprobanteData, setComprobanteData] = useState(null);

  // Modal de Eliminación de Pago Duplicado / Erróneo
  const [pagoAEliminar, setPagoAEliminar] = useState(null);
  const [eliminandoPago, setEliminandoPago] = useState(false);

  async function handleEliminarPago() {
    if (!pagoAEliminar) return;
    setEliminandoPago(true);
    try {
      await eliminarCobroCuenta(pagoAEliminar.id);
      setPagos(prev => prev.filter(p => p.id !== pagoAEliminar.id));
      addToast(`Cobro ID #${pagoAEliminar.id} por ${formatMoney(pagoAEliminar.monto)} eliminado con éxito`, 'success');
      setPagoAEliminar(null);
    } catch (err) {
      console.error('Error al eliminar cobro:', err);
      addToast('Error al eliminar cobro: ' + err.message, 'error');
    } finally {
      setEliminandoPago(false);
    }
  }

  // Modal para Registrar Pago Manual
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [activeSystemPeriod, setActiveSystemPeriod] = useState(() => localStorage.getItem('app_selected_period') || '2026-09');
  const [manualForm, setManualForm] = useState({
    numero_grupo: '',
    nombre: '',
    monto: '',
    medio_pago: 'EFECTIVO EN MUT',
    fecha: new Date().toISOString().split('T')[0],
    periodo: localStorage.getItem('app_selected_period') || '2026-09',
    observaciones: ''
  });

  // Cargar grupos y pagos al inicio
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [gruposData, { data: pagosCuenta, error: errCuenta }, periodosData] = await Promise.all([
        fetchGruposUnicos().catch(() => []),
        supabase
          .from('movimientos_cuenta')
          .select(`
            id,
            fecha,
            numero_grupo,
            nombre,
            importe,
            tipo,
            medio_pago,
            observaciones,
            periodo,
            numero_linea,
            pago_aplicado_capital,
            pago_aplicado_interes,
            created_at
          `)
          .eq('tipo', 'PAGO')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false }),
        fetchPeriods().catch(() => [])
      ]);

      if (errCuenta) throw errCuenta;

      const currentPeriod = (periodosData && periodosData[0]) || localStorage.getItem('app_selected_period') || '2026-09';
      setActiveSystemPeriod(currentPeriod);
      setManualForm(prev => ({ ...prev, periodo: prev.periodo || currentPeriod }));
      try {
        localStorage.setItem('app_selected_period', currentPeriod);
      } catch (e) {}

      // Normalizar estructura de pagos
      const normalizedPagos = (pagosCuenta || []).map(p => ({
        id: p.id,
        fecha: p.fecha,
        numero_grupo: p.numero_grupo,
        nombre: p.nombre || `Grupo #${p.numero_grupo}`,
        monto: Math.abs(Number(p.importe || 0)),
        medio_pago: p.medio_pago || 'EFECTIVO EN MUT',
        observaciones: p.observaciones || '',
        periodo: p.periodo || '',
        numero_linea: p.numero_linea,
        pago_aplicado_capital: p.pago_aplicado_capital,
        pago_aplicado_interes: p.pago_aplicado_interes,
        created_at: p.created_at
      }));

      setPagos(normalizedPagos);
      setGruposList(gruposData || []);

      if (gruposData && gruposData.length > 0 && !selectedGrupo) {
        setSelectedGrupo(String(gruposData[0].numero_grupo));
      }
    } catch (err) {
      console.error('Error al cargar historial de movimientos:', err);
      addToast('Error al cargar pagos: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // Rangos calculados de semanas
  const weekCurrent = useMemo(() => getWeekRangeDates(0), []);
  const weekPrevious = useMemo(() => getWeekRangeDates(-1), []);

  // Filtrado de pagos según rango temporal, grupo, medio de pago y búsqueda
  const pagosFiltrados = useMemo(() => {
    return pagos.filter(p => {
      // 1. Filtro temporal
      if (filtroRango === 'ESTA_SEMANA') {
        if (!p.fecha || p.fecha < weekCurrent.start || p.fecha > weekCurrent.end) {
          return false;
        }
      } else if (filtroRango === 'SEMANA_ANTERIOR') {
        if (!p.fecha || p.fecha < weekPrevious.start || p.fecha > weekPrevious.end) {
          return false;
        }
      } else if (filtroRango === 'ESTE_MES') {
        const curMonthPrefix = weekCurrent.start.slice(0, 7); // '2026-10'
        if (!p.fecha || !p.fecha.startsWith(curMonthPrefix)) {
          return false;
        }
      } else if (filtroRango === 'CUSTOM') {
        if (customDesde && p.fecha < customDesde) return false;
        if (customHasta && p.fecha > customHasta) return false;
      }

      // 2. Filtro de Grupo (Alternar entre Todos los Grupos y Grupo Específico)
      if (modoGrupo === 'GRUPO' && selectedGrupo) {
        if (String(p.numero_grupo) !== String(selectedGrupo)) {
          return false;
        }
      }

      // 3. Filtro por Medio de Pago
      if (filtroMedio !== 'TODOS') {
        const uMedio = String(p.medio_pago || '').toUpperCase();
        if (filtroMedio === 'EFECTIVO' && !uMedio.includes('EFECT') && !uMedio.includes('MUT') && !uMedio.includes('CAJA')) {
          return false;
        }
        if (filtroMedio === 'CREDICOOP' && !uMedio.includes('CREDICOOP')) {
          return false;
        }
        if (filtroMedio === 'NACION' && !uMedio.includes('NACION') && !uMedio.includes('NACIÓN')) {
          return false;
        }
        if (filtroMedio === 'DIRECTO' && !uMedio.includes('DIRECTO') && !uMedio.includes('PABLO')) {
          return false;
        }
      }

      // 4. Búsqueda por texto libre
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchNombre = String(p.nombre || '').toLowerCase().includes(term);
        const matchGrupo = String(p.numero_grupo || '').includes(term);
        const matchObs = String(p.observaciones || '').toLowerCase().includes(term);
        const matchMedio = String(p.medio_pago || '').toLowerCase().includes(term);
        const matchMonto = String(p.monto || '').includes(term);
        if (!matchNombre && !matchGrupo && !matchObs && !matchMedio && !matchMonto) {
          return false;
        }
      }

      return true;
    });
  }, [pagos, filtroRango, customDesde, customHasta, modoGrupo, selectedGrupo, filtroMedio, searchTerm, weekCurrent, weekPrevious]);

  // Métricas / KPIs calculados en base a los pagos filtrados
  const metricas = useMemo(() => {
    let total = 0;
    let efectivo = 0;
    let credicoop = 0;
    let nacion = 0;
    let otros = 0;

    pagosFiltrados.forEach(p => {
      const m = Number(p.monto || 0);
      total += m;
      const u = String(p.medio_pago || '').toUpperCase();
      if (u.includes('EFECT') || u.includes('MUT') || u.includes('CAJA')) {
        efectivo += m;
      } else if (u.includes('CREDICOOP')) {
        credicoop += m;
      } else if (u.includes('NACION') || u.includes('NACIÓN')) {
        nacion += m;
      } else {
        otros += m;
      }
    });

    return {
      total,
      efectivo,
      credicoop,
      nacion,
      otros,
      cantidad: pagosFiltrados.length
    };
  }, [pagosFiltrados]);

  // Abrir comprobante oficial
  function handleAbrirComprobante(pago) {
    setComprobanteData({
      movimientoId: pago.id,
      reciboNumero: `REC-${pago.periodo || pago.fecha.slice(0, 7)}-${pago.numero_grupo}-${pago.id}`,
      fecha: pago.fecha,
      periodo: pago.periodo,
      numero_grupo: pago.numero_grupo,
      numero_linea: pago.numero_linea,
      nombre_titular: pago.nombre,
      monto_cobrado: pago.monto,
      medio_pago: pago.medio_pago,
      observaciones: pago.observaciones,
      efectivo_entregado: pago.monto,
      desgloses: [{
        observaciones: pago.observaciones || `Cobro en cuenta corriente - Período ${pago.periodo || 'General'}`,
        pagoAplicadoCapital: (pago.pago_aplicado_capital !== undefined && pago.pago_aplicado_capital !== null) ? Number(pago.pago_aplicado_capital) : pago.monto,
        pagoAplicadoInteres: Number(pago.pago_aplicado_interes || 0)
      }]
    });
    setComprobanteModalOpen(true);
  }

  // Callback cuando se actualiza el comprobante (ej: usuario cambia de Efectivo a Credicoop en el modal)
  function handleComprobanteUpdated(updated) {
    if (!updated || !updated.movimientoId) return;
    setPagos(prev => prev.map(p => {
      if (p.id === updated.movimientoId) {
        return {
          ...p,
          medio_pago: updated.medio_pago,
          observaciones: updated.observaciones || p.observaciones
        };
      }
      return p;
    }));
    addToast(`Medio de pago actualizado a ${updated.medio_pago}`, 'success');
  }

  // Exportar a Excel
  function handleExportarExcel() {
    if (pagosFiltrados.length === 0) {
      addToast('No hay pagos en la lista para exportar', 'info');
      return;
    }

    const rows = pagosFiltrados.map(p => ({
      'Fecha': formatFecha(p.fecha),
      'Grupo': p.numero_grupo,
      'Titular': p.nombre,
      'Medio de Pago': p.medio_pago,
      'Importe Pagado': p.monto,
      'Período': p.periodo || '—',
      'Observaciones': p.observaciones || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cobros');
    
    const labelRango = filtroRango === 'ESTA_SEMANA' ? `Semana_${weekCurrent.start}_a_${weekCurrent.end}` : 'Historial_Cobros';
    XLSX.writeFile(wb, `Cobros_Mutual_${labelRango}.xlsx`);
    addToast('Archivo Excel exportado exitosamente', 'success');
  }

  // Registrar Cobro Manual
  async function handleGuardarPagoManual(e) {
    e.preventDefault();
    const gNum = Number(manualForm.numero_grupo);
    const montoNum = parseFloat(manualForm.monto);

    if (!gNum || isNaN(gNum)) {
      addToast('Debe ingresar un número de grupo válido', 'error');
      return;
    }
    if (!montoNum || isNaN(montoNum) || montoNum <= 0) {
      addToast('Debe ingresar un importe mayor a cero', 'error');
      return;
    }

    setManualSaving(true);
    try {
      const gInfo = gruposList.find(g => g.numero_grupo === gNum);
      const titularNombre = manualForm.nombre || gInfo?.nombre || gInfo?.titular || `Grupo ${gNum}`;

      const nuevo = await registrarCobroCuenta({
        numero_grupo: gNum,
        nombre: titularNombre,
        importe: montoNum,
        medio_pago: manualForm.medio_pago,
        observaciones: manualForm.observaciones || `Cobro registrado en Historial de Movimientos - [${manualForm.medio_pago}]`,
        fecha: manualForm.fecha || new Date().toISOString().slice(0, 10),
        periodo: manualForm.periodo || null
      });

      addToast(`Cobro de ${formatMoney(montoNum)} registrado con éxito para Grupo #${gNum}`, 'success');
      setIsManualModalOpen(false);
      setManualForm({
        numero_grupo: '',
        nombre: '',
        monto: '',
        medio_pago: 'EFECTIVO EN MUT',
        fecha: new Date().toISOString().split('T')[0],
        periodo: activeSystemPeriod || '2026-09',
        observaciones: ''
      });

      // Recargar lista
      await loadData();
    } catch (err) {
      console.error('Error al registrar pago manual:', err);
      addToast('Error al registrar cobro: ' + err.message, 'error');
    } finally {
      setManualSaving(false);
    }
  }

  // Información del grupo actualmente seleccionado en modo grupo
  const grupoSeleccionadoInfo = useMemo(() => {
    if (!selectedGrupo) return null;
    return gruposList.find(g => String(g.numero_grupo) === String(selectedGrupo)) || null;
  }, [gruposList, selectedGrupo]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px 0 40px 0' }}>
      
      {/* ENCABEZADO PRINCIPAL */}
      <div className="dashboard-header animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
              Historial de Movimientos
            </h2>
            <span style={{
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <CheckCircle2 size={13} /> {pagosFiltrados.length} cobro{pagosFiltrados.length === 1 ? '' : 's'}
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', fontWeight: 500, marginTop: '4px', margin: 0 }}>
            Visualización y control de cobros recaudados (semanal y por grupo con su medio de pago).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            onClick={handleExportarExcel}
            className="action-button" 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 16px', 
              borderRadius: '12px', fontWeight: 700, fontSize: '13px', background: 'var(--surface)',
              border: '1px solid var(--border-light)', color: 'var(--text-primary)'
            }}
            title="Exportar listado visible a planilla Excel"
          >
            <FileSpreadsheet size={16} color="#10b981" />
            Exportar Excel
          </button>

          <button 
            onClick={loadData}
            className="action-button" 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 16px', 
              borderRadius: '12px', fontWeight: 700, fontSize: '13px', background: 'var(--surface)',
              border: '1px solid var(--border-light)', color: 'var(--text-primary)'
            }}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>

          <button 
            className="btn-primary" 
            onClick={() => setIsManualModalOpen(true)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', 
              borderRadius: '12px', fontWeight: 800, fontSize: '13px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)' 
            }}
          >
            <Plus size={16} />
            Registrar Cobro
          </button>
        </div>
      </div>

      {/* BARRA DE FILTRO TEMPORAL Y ALTERNADOR DE GRUPOS */}
      <div className="bento-card" style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* FILA 1: SELECTOR DE RANGO TEMPORAL */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} color="var(--accent)" /> Período:
            </span>

            {/* Pill 1: Esta Semana (Por defecto) */}
            <button
              type="button"
              onClick={() => setFiltroRango('ESTA_SEMANA')}
              style={{
                padding: '6px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: filtroRango === 'ESTA_SEMANA' ? '2px solid #10b981' : '1px solid var(--border-light)',
                background: filtroRango === 'ESTA_SEMANA' ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface)',
                color: filtroRango === 'ESTA_SEMANA' ? '#059669' : 'var(--text-primary)'
              }}
            >
              ⭐ Esta Semana ({weekCurrent.label})
            </button>

            {/* Pill 2: Semana Anterior */}
            <button
              type="button"
              onClick={() => setFiltroRango('SEMANA_ANTERIOR')}
              style={{
                padding: '6px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: filtroRango === 'SEMANA_ANTERIOR' ? '2px solid #10b981' : '1px solid var(--border-light)',
                background: filtroRango === 'SEMANA_ANTERIOR' ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface)',
                color: filtroRango === 'SEMANA_ANTERIOR' ? '#059669' : 'var(--text-primary)'
              }}
            >
              Semana Anterior ({weekPrevious.label})
            </button>

            {/* Pill 3: Este Mes */}
            <button
              type="button"
              onClick={() => setFiltroRango('ESTE_MES')}
              style={{
                padding: '6px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: filtroRango === 'ESTE_MES' ? '2px solid #10b981' : '1px solid var(--border-light)',
                background: filtroRango === 'ESTE_MES' ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface)',
                color: filtroRango === 'ESTE_MES' ? '#059669' : 'var(--text-primary)'
              }}
            >
              Este Mes (Octubre)
            </button>

            {/* Pill 4: Histórico Completo */}
            <button
              type="button"
              onClick={() => setFiltroRango('TODOS')}
              style={{
                padding: '6px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: filtroRango === 'TODOS' ? '2px solid #10b981' : '1px solid var(--border-light)',
                background: filtroRango === 'TODOS' ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface)',
                color: filtroRango === 'TODOS' ? '#059669' : 'var(--text-primary)'
              }}
            >
              Histórico Completo
            </button>

            {/* Pill 5: Personalizado */}
            <button
              type="button"
              onClick={() => setFiltroRango('CUSTOM')}
              style={{
                padding: '6px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: filtroRango === 'CUSTOM' ? '2px solid #10b981' : '1px solid var(--border-light)',
                background: filtroRango === 'CUSTOM' ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface)',
                color: filtroRango === 'CUSTOM' ? '#059669' : 'var(--text-primary)'
              }}
            >
              Rango Personalizado
            </button>
          </div>

          {filtroRango === 'CUSTOM' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="date" 
                value={customDesde} 
                onChange={(e) => setCustomDesde(e.target.value)} 
                className="premium-input"
                style={{ padding: '4px 8px', fontSize: '12px', height: '32px' }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>hasta</span>
              <input 
                type="date" 
                value={customHasta} 
                onChange={(e) => setCustomHasta(e.target.value)} 
                className="premium-input"
                style={{ padding: '4px 8px', fontSize: '12px', height: '32px' }}
              />
            </div>
          )}
        </div>

        {/* FILA 2: ALTERNADOR ENTRE TODOS LOS GRUPOS O GRUPO ESPECÍFICO */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-light)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} color="var(--accent)" /> Visualización:
            </span>

            {/* Alternador Segmentado */}
            <div style={{
              display: 'inline-flex',
              background: 'var(--surface-hover)',
              padding: '3px',
              borderRadius: '12px',
              border: '1px solid var(--border-light)'
            }}>
              <button
                type="button"
                onClick={() => setModoGrupo('TODOS')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: 'none',
                  background: modoGrupo === 'TODOS' ? 'var(--accent)' : 'transparent',
                  color: modoGrupo === 'TODOS' ? '#ffffff' : 'var(--text-secondary)',
                  boxShadow: modoGrupo === 'TODOS' ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                🌐 Todos los Grupos
              </button>
              
              <button
                type="button"
                onClick={() => setModoGrupo('GRUPO')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: 'none',
                  background: modoGrupo === 'GRUPO' ? 'var(--accent)' : 'transparent',
                  color: modoGrupo === 'GRUPO' ? '#ffffff' : 'var(--text-secondary)',
                  boxShadow: modoGrupo === 'GRUPO' ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                👥 Por Grupo Específico
              </button>
            </div>

            {/* Selector de Grupo si está en modo GRUPO */}
            {modoGrupo === 'GRUPO' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={selectedGrupo}
                  onChange={(e) => setSelectedGrupo(e.target.value)}
                  className="premium-input"
                  style={{
                    padding: '6px 12px',
                    height: '36px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    minWidth: '260px',
                    background: 'var(--surface)'
                  }}
                >
                  {gruposList.map(g => (
                    <option key={g.numero_grupo} value={String(g.numero_grupo)}>
                      Grupo #{g.numero_grupo} — {g.titular || g.nombre || 'Socio'}
                    </option>
                  ))}
                </select>

                {grupoSeleccionadoInfo && (
                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {grupoSeleccionadoInfo.total_lineas ? `(${grupoSeleccionadoInfo.total_lineas} línea${grupoSeleccionadoInfo.total_lineas === 1 ? '' : 's'})` : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Filtro por Medio de Pago */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Medio:
            </span>
            <select
              value={filtroMedio}
              onChange={(e) => setFiltroMedio(e.target.value)}
              className="premium-input"
              style={{
                padding: '4px 10px',
                height: '34px',
                fontSize: '12px',
                fontWeight: 700,
                width: 'auto',
                background: 'var(--surface)'
              }}
            >
              <option value="TODOS">Todos los medios</option>
              <option value="EFECTIVO">💵 Solo Efectivo en Mutual</option>
              <option value="CREDICOOP">🏦 Solo Banco Credicoop</option>
              <option value="NACION">🏦 Solo Banco Nación</option>
              <option value="DIRECTO">📱 Solo Pagos Directos</option>
            </select>
          </div>
        </div>

      </div>

      {/* TARJETAS KPI DE RESUMEN SEMANAL */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }} className="animate-fade">
        {/* Card 1: Total Cobrado */}
        <div className="premium-card hover-lift" style={{ 
          background: 'linear-gradient(135deg, var(--surface) 0%, rgba(16, 185, 129, 0.04) 100%)', 
          borderLeft: '5px solid #10b981',
          padding: '16px 20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {filtroRango === 'ESTA_SEMANA' ? 'COBRADO ESTA SEMANA' : 'TOTAL COBRADO'}
            </span>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '6px', borderRadius: '10px' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#10b981', margin: '8px 0 2px 0', letterSpacing: '-0.02em' }}>
            {formatMoney(metricas.total)}
          </h3>
          <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            {metricas.cantidad} cobro{metricas.cantidad === 1 ? '' : 's'} registrado{metricas.cantidad === 1 ? '' : 's'}
          </p>
        </div>

        {/* Card 2: Efectivo en Mutual */}
        <Link 
          to="/caja-efectivo"
          className="premium-card hover-lift" 
          style={{ 
            background: 'var(--surface)', 
            borderLeft: '5px solid #059669',
            padding: '16px 20px',
            textDecoration: 'none',
            display: 'block'
          }}
          title="Ver Arqueo y Verificación de Caja Efectivo"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              💵 EFECTIVO EN CAJA
            </span>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '6px', borderRadius: '10px' }}>
              <Coins size={18} />
            </div>
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)', margin: '8px 0 2px 0' }}>
            {formatMoney(metricas.efectivo)}
          </h3>
          <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Cobrado en efectivo en sede · <span style={{ color: '#059669', fontWeight: 700 }}>Ver Caja ↗</span>
          </p>
        </Link>

        {/* Card 3: Banco Credicoop */}
        <div className="premium-card hover-lift" style={{ 
          background: 'var(--surface)', 
          borderLeft: '5px solid #3b82f6',
          padding: '16px 20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🏦 BANCO CREDICOOP
            </span>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '6px', borderRadius: '10px' }}>
              <Landmark size={18} />
            </div>
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#2563eb', margin: '8px 0 2px 0' }}>
            {formatMoney(metricas.credicoop)}
          </h3>
          <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Transferencias a Credicoop
          </p>
        </div>

        {/* Card 4: Banco Nación / Otros */}
        <div className="premium-card hover-lift" style={{ 
          background: 'var(--surface)', 
          borderLeft: '5px solid #6366f1',
          padding: '16px 20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              🏦 NACIÓN / DIRECTOS
            </span>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', padding: '6px', borderRadius: '10px' }}>
              <CreditCard size={18} />
            </div>
          </div>
          <h3 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)', margin: '8px 0 2px 0' }}>
            {formatMoney(metricas.nacion + metricas.otros)}
          </h3>
          <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Nación y otros canales
          </p>
        </div>
      </div>

      {/* PANEL PRINCIPAL: TABLA DE COBROS */}
      <div className="bento-card" style={{ padding: '24px', overflow: 'hidden' }}>
        
        {/* Barra superior con buscador y contador */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>
              {modoGrupo === 'GRUPO' 
                ? `Cobros Registrados — Grupo #${selectedGrupo} (${grupoSeleccionadoInfo?.titular || grupoSeleccionadoInfo?.nombre || 'Socio'})`
                : 'Listado Consolidado de Cobros Registrados'
              }
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {filtroRango === 'ESTA_SEMANA' && `Mostrando pagos de la semana actual (${weekCurrent.label})`}
              {filtroRango === 'SEMANA_ANTERIOR' && `Mostrando pagos de la semana anterior (${weekPrevious.label})`}
              {filtroRango === 'ESTE_MES' && 'Mostrando pagos del mes en curso'}
              {filtroRango === 'TODOS' && 'Mostrando histórico completo de cobros'}
              {filtroRango === 'CUSTOM' && `Mostrando cobros entre ${customDesde || 'inicio'} y ${customHasta || 'hoy'}`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', padding: '6px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', minWidth: '280px' }}>
            <Search size={15} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Buscar por socio, grupo o concepto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)', fontSize: '12.5px' }}
            />
          </div>
        </div>

        {/* TABLA DE COBROS */}
        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', borderRadius: '10px 0 0 10px' }}>FECHA</th>
                <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>GRUPO / SOCIO</th>
                <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>MEDIO DE PAGO</th>
                <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>DETALLE / PERÍODO</th>
                <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>MONTO COBRADO</th>
                <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', borderRadius: '0 10px 10px 0' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>
                    <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>Cargando pagos...</span>
                  </td>
                </tr>
              ) : pagosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-secondary)' }}>
                    <AlertCircle size={36} style={{ margin: '0 auto 10px', opacity: 0.4, color: 'var(--text-secondary)' }} />
                    <p style={{ fontWeight: 800, fontSize: '14px', margin: 0 }}>
                      No se encontraron cobros registrados para este filtro
                    </p>
                    <p style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px', margin: 0 }}>
                      {modoGrupo === 'GRUPO' 
                        ? `El Grupo #${selectedGrupo} no registra pagos esta semana. Prueba cambiar a "Todos los Grupos" o ver "Histórico Completo".`
                        : 'No hay cobros registrados en el rango de fechas seleccionado.'
                      }
                    </p>
                    {filtroRango !== 'TODOS' && (
                      <button
                        onClick={() => setFiltroRango('TODOS')}
                        className="air-btn"
                        style={{ marginTop: '14px', padding: '6px 14px', fontSize: '12px', fontWeight: 800 }}
                      >
                        Ver Histórico Completo
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                pagosFiltrados.map((pago) => {
                  const isEfectivo = String(pago.medio_pago || '').toUpperCase().includes('EFECT') || String(pago.medio_pago || '').toUpperCase().includes('MUT');
                  const isCredicoop = String(pago.medio_pago || '').toUpperCase().includes('CREDICOOP');
                  const isNacion = String(pago.medio_pago || '').toUpperCase().includes('NACION') || String(pago.medio_pago || '').toUpperCase().includes('NACIÓN');

                  return (
                    <tr key={pago.id} style={{ borderBottom: '1px solid var(--border-light)' }} className="table-row-hover">
                      {/* 1. FECHA */}
                      <td style={{ padding: '12px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <div>{formatFecha(pago.fecha)}</div>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          ID #{pago.id}
                        </span>
                      </td>

                      {/* 2. GRUPO / SOCIO */}
                      <td style={{ padding: '12px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#2563eb',
                            fontWeight: 900,
                            fontSize: '11px',
                            padding: '2px 7px',
                            borderRadius: '6px'
                          }}>
                            #{pago.numero_grupo}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {pago.nombre}
                          </span>
                        </div>
                      </td>

                      {/* 3. MEDIO DE PAGO (DESTACADO Y CLICABLE) */}
                      <td style={{ padding: '12px 12px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span 
                            onClick={() => handleAbrirComprobante(pago)}
                            title="Clic para ver recibo o corregir medio de pago"
                            style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: isEfectivo ? 'rgba(16, 185, 129, 0.12)' : isCredicoop ? 'rgba(59, 130, 246, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                              color: isEfectivo ? '#059669' : isCredicoop ? '#2563eb' : '#4f46e5',
                              border: `1px solid ${isEfectivo ? 'rgba(16, 185, 129, 0.3)' : isCredicoop ? 'rgba(59, 130, 246, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
                            }}
                          >
                            {isEfectivo ? '💵' : isCredicoop ? '🏦' : '📱'} {pago.medio_pago}
                          </span>
                          {isEfectivo && pago.fecha && (
                            <Link
                              to={`/caja-efectivo?fecha=${pago.fecha}`}
                              title={`Ver arqueo de Caja Efectivo para el día ${pago.fecha}`}
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#059669',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                            >
                              Caja ↗
                            </Link>
                          )}
                        </div>
                      </td>

                      {/* 4. DETALLE / OBSERVACIONES / PERÍODO */}
                      <td style={{ padding: '12px 12px', maxWidth: '320px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {pago.periodo && (
                            <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-secondary)', background: 'var(--surface-hover)', padding: '1px 5px', borderRadius: '4px' }}>
                              {pago.periodo}
                            </span>
                          )}
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pago.observaciones}>
                            {pago.observaciones || 'Cobro registrado'}
                          </span>
                        </div>
                        {pago.pago_aplicado_interes > 0 && (
                          <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700, marginTop: '2px' }}>
                            ✓ Amortizó {formatMoney(pago.pago_aplicado_capital)} cap. + {formatMoney(pago.pago_aplicado_interes)} int.
                          </div>
                        )}
                      </td>

                      {/* 5. MONTO COBRADO */}
                      <td style={{ padding: '12px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ fontWeight: 900, fontSize: '14.5px', color: '#10b981' }}>
                          {formatMoney(pago.monto)}
                        </span>
                      </td>

                      {/* 6. ACCIONES (COMPROBANTE / RECIBO) */}
                      <td style={{ padding: '12px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleAbrirComprobante(pago)}
                          className="air-btn"
                          style={{
                            padding: '5px 10px',
                            fontSize: '11px',
                            borderRadius: '8px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.25)'
                          }}
                          title="Ver o imprimir comprobante oficial de pago"
                        >
                          <Printer size={13} /> Recibo
                        </button>
                        <button
                          type="button"
                          onClick={() => setPagoAEliminar(pago)}
                          className="air-btn"
                          style={{
                            padding: '5px 8px',
                            fontSize: '11px',
                            borderRadius: '8px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            marginLeft: '6px'
                          }}
                          title="Eliminar cobro duplicado o erróneo"
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* MODAL COMPROBANTE OFICIAL DE COBRO */}
      <ComprobanteCobroModal 
        isOpen={comprobanteModalOpen}
        onClose={() => setComprobanteModalOpen(false)}
        cobroData={comprobanteData}
        onComprobanteUpdated={handleComprobanteUpdated}
      />

      {/* MODAL PARA REGISTRAR COBRO MANUAL */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title="Registrar Nuevo Cobro"
        maxWidth="520px"
      >
        <form onSubmit={handleGuardarPagoManual} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
          
          <div>
            <label className="form-label">Número de Grupo</label>
            <input 
              type="number" 
              required
              placeholder="Ej: 70140"
              value={manualForm.numero_grupo} 
              onChange={(e) => {
                const gVal = e.target.value;
                const match = gruposList.find(g => String(g.numero_grupo) === String(gVal));
                setManualForm(prev => ({
                  ...prev,
                  numero_grupo: gVal,
                  nombre: match ? (match.titular || match.nombre) : prev.nombre
                }));
              }}
              className="form-input" 
            />
            {manualForm.nombre && (
              <span style={{ fontSize: '11.5px', color: '#10b981', fontWeight: 700, marginTop: '3px', display: 'block' }}>
                ✓ {manualForm.nombre}
              </span>
            )}
          </div>

          <div>
            <label className="form-label">Nombre del Titular / Socio</label>
            <input 
              type="text" 
              placeholder="Nombre y apellido"
              value={manualForm.nombre} 
              onChange={(e) => setManualForm(prev => ({ ...prev, nombre: e.target.value }))}
              className="form-input" 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Monto Cobrado ($)</label>
              <input 
                type="number" 
                step="0.01"
                required
                placeholder="0.00"
                value={manualForm.monto} 
                onChange={(e) => setManualForm(prev => ({ ...prev, monto: e.target.value }))}
                className="form-input" 
                style={{ fontSize: '15px', fontWeight: 800 }}
              />
            </div>

            <div>
              <label className="form-label">Fecha de Cobro</label>
              <input 
                type="date" 
                required
                value={manualForm.fecha} 
                onChange={(e) => setManualForm(prev => ({ ...prev, fecha: e.target.value }))}
                className="form-input" 
              />
            </div>
          </div>

          <div>
            <label className="form-label">Medio de Pago</label>
            <select 
              value={manualForm.medio_pago} 
              onChange={(e) => setManualForm(prev => ({ ...prev, medio_pago: e.target.value }))}
              className="form-input"
              style={{ fontWeight: 800 }}
            >
              <option value="EFECTIVO EN MUT">💵 EFECTIVO EN MUT</option>
              <option value="TRANSFERENCIA A CREDICOOP">🏦 TRANSFERENCIA A CREDICOOP</option>
              <option value="TRANSFERENCIA A NACION">🏦 TRANSFERENCIA A NACION</option>
              <option value="PAGO DIRECTO">📱 PAGO DIRECTO</option>
            </select>
          </div>

          <div>
            <label className="form-label">Período Imputado</label>
            <input 
              type="text" 
              placeholder="Ej: 2026-09"
              value={manualForm.periodo} 
              onChange={(e) => setManualForm(prev => ({ ...prev, periodo: e.target.value }))}
              className="form-input" 
            />
          </div>

          <div>
            <label className="form-label">Observaciones / Referencia</label>
            <textarea 
              rows="2"
              placeholder="Detalle o referencia del cobro..."
              value={manualForm.observaciones} 
              onChange={(e) => setManualForm(prev => ({ ...prev, observaciones: e.target.value }))}
              className="form-input" 
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button 
              type="button" 
              onClick={() => setIsManualModalOpen(false)}
              className="action-button"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={manualSaving}
              style={{ padding: '8px 20px', fontWeight: 800 }}
            >
              {manualSaving ? 'Guardando...' : 'Confirmar Cobro'}
            </button>
          </div>

        </form>
      </Modal>

      {/* MODAL DE CONFIRMACIÓN PARA ELIMINAR PAGO */}
      {pagoAEliminar && (
        <Modal
          isOpen={!!pagoAEliminar}
          onClose={() => !eliminandoPago && setPagoAEliminar(null)}
          title="Eliminar Cobro Registrado"
          maxWidth="480px"
        >
          <div style={{ padding: '8px 4px' }}>
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              marginBottom: '16px'
            }}>
              <AlertCircle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '13px', color: '#991b1b', lineHeight: 1.4 }}>
                <strong>¿Estás seguro de que deseas eliminar este cobro?</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#7f1d1d' }}>
                  Esta acción eliminará el registro de la cuenta corriente del grupo y recalculará automáticamente su saldo y amortizaciones.
                </p>
              </div>
            </div>

            <div style={{
              background: 'var(--surface-hover)',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '20px',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>ID de Movimiento:</span>
                <strong>#{pagoAEliminar.id}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Grupo y Titular:</span>
                <strong>Grupo #{pagoAEliminar.numero_grupo} — {pagoAEliminar.nombre}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fecha de Pago:</span>
                <strong>{formatFecha(pagoAEliminar.fecha)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Medio de Pago:</span>
                <strong>{pagoAEliminar.medio_pago}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-light)', paddingTop: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Importe a Eliminar:</span>
                <strong style={{ fontSize: '16px', color: '#ef4444' }}>{formatMoney(pagoAEliminar.monto)}</strong>
              </div>
              {pagoAEliminar.observaciones && (
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <em>{pagoAEliminar.observaciones}</em>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setPagoAEliminar(null)}
                disabled={eliminandoPago}
                className="action-button"
                style={{ padding: '8px 16px', fontWeight: 700, fontSize: '12.5px' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEliminarPago}
                disabled={eliminandoPago}
                className="btn-primary"
                style={{
                  padding: '8px 18px',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {eliminandoPago ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Confirmar Eliminación
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
