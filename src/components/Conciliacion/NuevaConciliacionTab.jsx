import React, { useState, useEffect, useMemo } from 'react';
import { Landmark, Loader2, ArrowRightLeft, Search, HelpCircle, Save, CheckCircle2, AlertCircle, Check, Settings, Sparkles } from 'lucide-react';

export default function NuevaConciliacionTab({
  selectedPeriod,
  parsedMovements,
  setParsedMovements,
  saldoAnterior,
  setSaldoAnterior,
  saldoFinalExtraido,
  setSaldoFinalExtraido,
  loading,
  loadingMaster,
  handleProcesar,
  conciliarFila,
  deshacerMatchLocal,
  handleConciliarTodos,
  openLoteModal,
  openBreakdownModal,
  socios,
  handleSocioInputChange,

  handleToggleLiquidation,
  handleAddGroupToRow,
  getTipoMovimientoLabel,
  renderTipoMovimientoBadge,
  rawData,
  setRawData,
  periodConsumos = [],
  handleToggleLineSelection,
  openEditConciliacionModal,
  checkIsAmountMatch,
  fetchMasterData,
  fetchPeriodSummary
}) {
  // Local states to isolate typing and filter re-renders from parent
  const [banco, setBanco] = useState('NACION'); // 'NACION', 'CREDICOOP'
  const [filtroTipoNueva, setFiltroTipoNueva] = useState('TODOS');
  const [filtroBancoNueva, setFiltroBancoNueva] = useState('TODOS');
  const [filtroEstadoNueva, setFiltroEstadoNueva] = useState('TODOS');
  const [searchNueva, setSearchNueva] = useState('');
  const [currentPageNueva, setCurrentPageNueva] = useState(1);
  const [openDropdownRowId, setOpenDropdownRowId] = useState(null);
  const [addingGroupToRowId, setAddingGroupToRowId] = useState(null);
  const [newGroupValue, setNewGroupValue] = useState('');
  const itemsPerPage = 100;

  // AI Reconciliation States
  const [n8nUrl, setN8nUrl] = useState(() => localStorage.getItem('cb_n8n_url') || 'http://localhost:5678/webhook/conciliar-pago-inteligente');
  const [showConfigIA, setShowConfigIA] = useState(false);
  const [loadingIA, setLoadingIA] = useState(false);
  const [resultadoIA, setResultadoIA] = useState([]);
  const [progresoIA, setProgresoIA] = useState({ current: 0, total: 0 });

  // Reset page when filters change
  useEffect(() => {
    setCurrentPageNueva(1);
  }, [filtroTipoNueva, filtroBancoNueva, filtroEstadoNueva, searchNueva]);

  // Persist n8n URL changes
  useEffect(() => {
    localStorage.setItem('cb_n8n_url', n8nUrl);
  }, [n8nUrl]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (openDropdownRowId === null) return;

    const handleClickOutside = (event) => {
      const container = document.getElementById(`dropdown-container-${openDropdownRowId}`);
      if (container && !container.contains(event.target)) {
        setOpenDropdownRowId(null);
        setAddingGroupToRowId(null);
        setNewGroupValue('');
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openDropdownRowId]);

  // Auto-scroll dropdown panel into view when opened
  useEffect(() => {
    if (openDropdownRowId === null) return;

    const timer = setTimeout(() => {
      const panel = document.getElementById(`dropdown-panel-${openDropdownRowId}`);
      if (panel) {
        const panelRect = panel.getBoundingClientRect();
        
        // 1. Scroll nested table container if it overflows
        const container = panel.closest('.premium-table-container');
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const overflowBottom = panelRect.bottom - containerRect.bottom;
          if (overflowBottom > 0) {
            container.scrollBy({
              top: overflowBottom + 20, // 20px safety margin
              behavior: 'smooth'
            });
            return;
          }
        }
        
        // 2. Scroll window if it overflows the browser viewport
        const overflowWindow = panelRect.bottom - window.innerHeight;
        if (overflowWindow > 0) {
          window.scrollBy({
            top: overflowWindow + 20, // 20px safety margin
            behavior: 'smooth'
          });
        }
      }
    }, 150); // Small delay to let the panel render in DOM

    return () => clearTimeout(timer);
  }, [openDropdownRowId]);

  // Calculate local processed data
  const processedData = useMemo(() => {
    if (parsedMovements.length === 0) {
      return {
        rows: [],
        totalCount: 0,
        totalIngresos: 0,
        totalEgresos: 0,
        saldoFinal: Number(saldoAnterior) || 0
      };
    }

    let totalIngresos = 0;
    let totalEgresos = 0;
    
    parsedMovements.forEach(m => {
      if (m.netoReal > 0) {
        totalIngresos += m.netoReal;
      } else {
        totalEgresos += Math.abs(m.netoReal);
      }
    });

    const rows = parsedMovements.map(m => ({ ...m }));
    let currentBalance = Number(saldoAnterior) || 0;
    
    for (let i = 0; i < rows.length; i++) {
      currentBalance += rows[i].netoReal;
      rows[i].saldoAcumulado = Math.round(currentBalance * 100) / 100;
    }

    const saldoFinal = Math.round(currentBalance * 100) / 100;

    // Apply filters and searches
    let filteredRows = rows;
    if (filtroTipoNueva !== 'TODOS') {
      filteredRows = filteredRows.filter(r => r.tipo_movimiento === filtroTipoNueva);
    }
    if (filtroBancoNueva !== 'TODOS') {
      filteredRows = filteredRows.filter(r => r.banco === filtroBancoNueva);
    }
    if (filtroEstadoNueva !== 'TODOS') {
      filteredRows = filteredRows.filter(r => r.estado === filtroEstadoNueva);
    }
    if (searchNueva) {
      const term = searchNueva.toLowerCase();
      filteredRows = filteredRows.filter(r => {
        const matchConcepto = r.concepto?.toLowerCase().includes(term);
        const matchSocio = r.selectedSocioLabel?.toLowerCase().includes(term);
        const matchTipo = (r.tipo_movimiento || '').toLowerCase().includes(term) || getTipoMovimientoLabel(r.tipo_movimiento).toLowerCase().includes(term);
        const amountStr = Math.abs(Number(r.netoReal || 0)).toString();
        const matchMonto = amountStr.includes(term) || amountStr.replace('.', '').replace(',', '').includes(term);
        
        return matchConcepto || matchSocio || matchTipo || matchMonto;
      });
    }

    return {
      rows: filteredRows,
      totalCount: filteredRows.length,
      totalIngresos: Math.round(totalIngresos * 100) / 100,
      totalEgresos: Math.round(totalEgresos * 100) / 100,
      saldoFinal
    };
  }, [parsedMovements, saldoAnterior, filtroTipoNueva, filtroBancoNueva, filtroEstadoNueva, searchNueva, getTipoMovimientoLabel]);

  const paginatedRowsNueva = useMemo(() => {
    return processedData.rows.slice(
      (currentPageNueva - 1) * itemsPerPage,
      currentPageNueva * itemsPerPage
    );
  }, [processedData.rows, currentPageNueva]);

  const totalPagesNueva = Math.ceil(processedData.rows.length / itemsPerPage);

  const handleConciliarIA = async () => {
    if (!rawData || !rawData.trim()) {
      alert("Por favor pegá el extracto bancario antes de conciliar.");
      return;
    }

    setLoadingIA(true);
    setResultadoIA([]);
    setProgresoIA({ current: 0, total: 100 });

    try {
      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw_text: rawData,
          periodo: selectedPeriod,
          banco: banco
        })
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.details && Array.isArray(data.details)) {
        setResultadoIA(data.details);
        
        // Actualizar el estado local de los movimientos en la tabla
        if (typeof setParsedMovements === 'function') {
          setParsedMovements(prevMovements => {
            if (prevMovements.length === 0) {
              // Si la tabla estaba vacía, la poblamos directamente con lo extraído y procesado por n8n
              return data.details.map((d, idx) => {
                const targetSocio = socios.find(s => s.socio_id === d.socio_id);
                const dbLabel = targetSocio ? `${targetSocio.nombre_completo} (Socio ${targetSocio.nro_socio || ''})` : '';
                return {
                  id: idx,
                  fecha: d.fechaPago ? d.fechaPago.split('-').reverse().join('/') : '',
                  concepto: d.descripcion || '',
                  comprobante: d.comprobante || '',
                  ingresoBruto: 0,
                  impuestos: 0,
                  netoReal: d.monto || 0,
                  tipo_movimiento: d.decision === 'AUTO_APLICAR' ? 'TRANSFERENCIA_RECIBIDA' : (d.decision === 'SUGERIR_REVISION' ? 'TRANSFERENCIA_REVISION' : 'TRANSFERENCIA_HUERFANA'),
                  detallesImpuestos: [],
                  banco: d.banco || banco,
                  suggestedSocio: targetSocio ? { socio: targetSocio } : null,
                  selectedSocioId: d.socio_id,
                  selectedSocioLabel: dbLabel,
                  pendingList: [],
                  selectedLiquidationId: d.liquidacion_id ? String(d.liquidacion_id) : '',
                  matchedLiquidationIds: d.liquidacion_id ? [d.liquidacion_id] : [],
                  selectedLines: [],
                  estado: d.decision === 'AUTO_APLICAR' ? 'CONCILIADO' : 'PENDIENTE',
                  isDbDuplicate: d.decision === 'AUTO_APLICAR',
                  isAlreadyPaidMatch: d.decision === 'AUTO_APLICAR',
                  movimiento_id: null,
                  dbLiquidationInfo: null,
                  warningMsg: d.decision === 'SUGERIR_REVISION' ? d.observaciones : '',
                  isDuplicateCpbte: false,
                  errorMsg: '',
                  reconciledInSession: d.decision === 'AUTO_APLICAR'
                };
              });
            }
            
            return prevMovements.map(m => {
              // Buscar si este movimiento fue procesado por n8n por número de comprobante o monto
              const processed = data.details.find(d => {
                const cleanC = String(d.comprobante || '').replace(/\D/g, '');
                const cleanRowC = String(m.comprobante || '').replace(/\D/g, '');
                const isMatchComprobante = cleanC && cleanRowC && cleanC === cleanRowC;
                const isMatchMonto = Math.abs(Number(d.monto || 0) - Math.abs(m.netoReal)) < 2.0;
                return isMatchComprobante || (isMatchMonto && cleanC && String(m.concepto || '').toLowerCase().includes(cleanC.toLowerCase()));
              });
              
              if (processed) {
                if (processed.decision === 'AUTO_APLICAR') {
                  return {
                    ...m,
                    estado: 'CONCILIADO',
                    reconciledInSession: true,
                    selectedSocioId: processed.socio_id,
                    selectedSocioLabel: processed.socio_nombre ? `${processed.socio_nombre} (Socio ${processed.socio_id})` : '',
                    selectedLiquidationId: processed.liquidacion_id ? String(processed.liquidacion_id) : ''
                  };
                } else if (processed.decision === 'SUGERIR_REVISION') {
                  // Si es sugerencia, le asignamos el socio y deuda para que el usuario solo tenga que dar click
                  return {
                    ...m,
                    selectedSocioId: processed.socio_id,
                    selectedSocioLabel: processed.socio_nombre ? `${processed.socio_nombre} (Socio ${processed.socio_id})` : '',
                    selectedLiquidationId: processed.liquidacion_id ? String(processed.liquidacion_id) : ''
                  };
                }
              }
              return m;
            });
          });
        }
      } else if (data.html) {
        setResultadoIA([{
          status: data.status || 'ok',
          html: data.html
        }]);
      } else {
        setResultadoIA([{
          status: 'ok',
          html: `<div style="background:#28a745;color:white;padding:15px;border-radius:8px;">✅ Lote de conciliación procesado con éxito por n8n.</div>`
        }]);
      }
      
      const total = data.total_processed || 1;
      setProgresoIA({ current: total, total: total });

      // Refresh database stats
      if (typeof fetchMasterData === 'function') {
        fetchMasterData();
      }
      if (typeof fetchPeriodSummary === 'function') {
        fetchPeriodSummary(selectedPeriod);
      }
    } catch (err) {
      console.error("Error al procesar lote por IA:", err);
      setResultadoIA([{
        status: 'error',
        html: `<div style="background:#dc3545;color:white;padding:15px;border-radius:8px;font-family:sans-serif;">
                 <h4>❌ Error de Conexión en Lote</h4>
                 <p style="margin:4px 0 0 0;font-size:13px;">No se pudo completar el procesamiento del extracto bancario en lote.</p>
                 <p style="margin:2px 0 0 0;font-size:11px;opacity:0.8;">Detalle: ${err.message}</p>
               </div>`
      }]);
      setProgresoIA({ current: 0, total: 100 });
    } finally {
      setLoadingIA(false);
    }
  };

  const onSubmitProcesar = () => {
    handleProcesar(rawData, banco);
  };

  const handleLimpiarVolver = () => {
    setParsedMovements([]);
    setRawData('');
    setSaldoAnterior(0);
    setSaldoFinalExtraido(null);
    setFiltroTipoNueva('TODOS');
    setFiltroBancoNueva('TODOS');
    setFiltroEstadoNueva('TODOS');
    setSearchNueva('');
    setResultadoIA([]);
  };

  // Cantidad de sugeridos listos para conciliar
  const readyToReconcileCount = useMemo(() => {
    return parsedMovements.filter(m => 
      m.estado === 'PENDIENTE' && 
      checkIsAmountMatch(m, periodConsumos)
    ).length;
  }, [parsedMovements, periodConsumos]);

  // Group movements by selected or suggested socio ID to count transfers in this batch
  const socioTransfersInfo = useMemo(() => {
    const groups = {};
    parsedMovements.forEach(m => {
      // Only group credit transfers (netoReal > 0)
      if (m.netoReal > 0) {
        const sId = m.selectedSocioId || m.suggestedSocio?.socio?.socio_id;
        if (sId) {
          if (!groups[sId]) {
            groups[sId] = [];
          }
          groups[sId].push(m);
        }
      }
    });
    return groups;
  }, [parsedMovements]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {parsedMovements.length === 0 ? (
        <div className="glass-panel" style={{ borderRadius: '24px', padding: '32px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'center' }}>
            <Landmark size={24} color="var(--accent)" />
            <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Paso 1: Copiar Extracto Bancario</h3>
          </div>

          <div style={{
            background: 'var(--accent-light)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            gap: '16px',
            alignItems: 'flex-start'
          }}>
            <AlertCircle size={24} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 800, color: 'var(--accent)' }}>
                Aclaración Importante
              </h4>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Estás conciliando la deuda facturada en el período <strong style={{color: 'var(--text-primary)'}}>{
                  selectedPeriod ? new Date(parseInt(selectedPeriod.split('-')[0]), parseInt(selectedPeriod.split('-')[1]) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).toUpperCase() : ''
                }</strong>. 
                Recordá que los pagos para este período suelen realizarse al mes siguiente. Por lo tanto, deberías copiar y pegar las transferencias del extracto de <strong style={{color: 'var(--text-primary)'}}>{
                  selectedPeriod ? new Date(parseInt(selectedPeriod.split('-')[0]), parseInt(selectedPeriod.split('-')[1]), 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).toUpperCase() : ''
                }</strong>.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
              <label className="form-label">Entidad Bancaria</label>
              <select 
                className="premium-input" 
                style={{ padding: '12px 16px', height: '46px' }}
                value={banco}
                onChange={e => setBanco(e.target.value)}
              >
                <option value="NACION">Banco Nación</option>
                <option value="CREDICOOP">Banco Credicoop</option>
              </select>
            </div>
          </div>

          <textarea 
            className="premium-input w-full"
            style={{ 
              height: '240px', 
              padding: '16px', 
              fontFamily: 'monospace', 
              fontSize: '13px', 
              marginBottom: '20px',
              width: '100%',
              lineHeight: '1.6'
            }}
            placeholder="Pegar extracto del homebanking o archivo CSV aquí (por ejemplo, transacciones de Banco Nación o Banco Credicoop)..."
            value={rawData}
            onChange={e => setRawData(e.target.value)}
          />

          {/* Configuración del Webhook de IA */}
          <div style={{ marginBottom: '20px' }}>
            <button
              onClick={() => setShowConfigIA(!showConfigIA)}
              className="action-button"
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: 'none',
                padding: '4px 8px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Settings size={14} />
              {showConfigIA ? 'Ocultar Configuración Webhook' : 'Configurar Webhook de Conciliación'}
            </button>

            {showConfigIA && (
              <div 
                className="glass-panel" 
                style={{ 
                  marginTop: '8px', 
                  padding: '16px', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border-light)',
                  background: 'rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>
                  URL del Webhook de Conciliación en n8n:
                </label>
                <input
                  type="text"
                  className="premium-input"
                  style={{ fontSize: '12px', padding: '8px 12px', height: '36px', width: '100%' }}
                  value={n8nUrl}
                  onChange={e => setN8nUrl(e.target.value)}
                  placeholder="http://localhost:5678/webhook/conciliar-pago-inteligente"
                />
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Asegúrate de que el webhook de n8n esté activo y apunte a tu puerto local o servidor.
                </p>
              </div>
            )}
          </div>

          {/* Barra de progreso de la IA */}
          {(loadingIA || (progresoIA.total > 0 && resultadoIA.length > 0)) && (
            <div className="glass-panel animate-pulse" style={{ padding: '20px', borderRadius: '16px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="var(--accent)" />
                  {loadingIA ? '🤖 La IA está conciliando tus cuentas...' : '✅ Conciliación de IA Finalizada'}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)' }}>
                  {progresoIA.current} de {progresoIA.total} pagos
                </span>
              </div>
              <div style={{ height: '8px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(progresoIA.current / progresoIA.total) * 100}%`,
                  background: 'var(--accent)',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease'
                }} />
              </div>

              {/* Lista de Resultados de IA */}
              {resultadoIA.length > 0 && (
                <div 
                  style={{ 
                    marginTop: '16px', 
                    maxHeight: '260px', 
                    overflowY: 'auto', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px',
                    paddingRight: '6px'
                  }}
                  className="premium-scrollbar"
                >
                  {resultadoIA.map((res, i) => (
                    <div key={`ia-res-${i}`} dangerouslySetInnerHTML={{ __html: res.html }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Botones de Acción */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <button 
              onClick={onSubmitProcesar} 
              className="action-button" 
              style={{ 
                flex: 1, 
                minWidth: '220px', 
                height: '48px', 
                fontSize: '14.5px', 
                background: 'var(--surface)', 
                color: 'var(--text-primary)',
                border: '1px solid var(--border-light)'
              }}
              disabled={loading || loadingMaster || loadingIA}
            >
              {loading || loadingMaster ? (
                <>
                  <Loader2 className="animate-spin" size={18} style={{ marginRight: '8px' }} />
                  Procesando...
                </>
              ) : (
                <>
                  <ArrowRightLeft size={18} style={{ marginRight: '8px' }} />
                  Procesar Manual (Sugerencias)
                </>
              )}
            </button>

            <button 
              onClick={handleConciliarIA} 
              className="action-button" 
              style={{ 
                flex: 1, 
                minWidth: '220px', 
                height: '48px', 
                fontSize: '14.5px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderColor: '#10b981',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                color: 'white'
              }}
              disabled={loading || loadingMaster || loadingIA}
            >
              {loadingIA ? (
                <>
                  <Loader2 className="animate-spin" size={18} style={{ marginRight: '8px' }} />
                  AI Conciliando...
                </>
              ) : (
                <>
                  <Sparkles size={18} style={{ marginRight: '8px' }} />
                  Conciliar con IA (n8n)
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Resumen Bento de Saldos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {/* Tarjeta 1: Saldo Inicial */}
            <div className="glass-panel" style={{ borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Saldo Inicial
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)' }}>$</span>
                <input
                  type="text"
                  value={saldoAnterior}
                  onChange={(e) => {
                    setSaldoAnterior(e.target.value);
                  }}
                  onBlur={() => {
                    let s = String(saldoAnterior).replace(/\s/g, '');
                    if (s.includes('.') && s.includes(',')) {
                      s = s.replace(/\./g, '').replace(',', '.');
                    } else if (s.includes(',')) {
                      s = s.replace(',', '.');
                    }
                    const num = parseFloat(s) || 0;
                    setSaldoAnterior(num);
                  }}
                  className="premium-input"
                  style={{ 
                    fontSize: '18px', 
                    fontWeight: 900, 
                    padding: '2px 6px', 
                    height: '32px', 
                    width: '100%',
                    background: 'transparent',
                    border: '1px dashed var(--border-light)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                Extraído del extracto. Editable.
              </p>
            </div>

            {/* Tarjeta 2: Total Ingresos */}
            <div className="glass-panel" style={{ borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Ingresos Detectados
              </span>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#10b981', marginTop: '2px' }}>
                +${processedData.totalIngresos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                Créditos totales en este período
              </p>
            </div>

            {/* Tarjeta 3: Total Egresos */}
            <div className="glass-panel" style={{ borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Egresos Detectados
              </span>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#ef4444', marginTop: '2px' }}>
                -${processedData.totalEgresos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                Débitos totales en este período
              </p>
            </div>

            {/* Tarjeta 4: Saldo Final */}
            <div className="glass-panel" style={{ borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Saldo Final Proyectado
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)' }}>
                  ${processedData.saldoFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
                {saldoFinalExtraido !== null && (
                  (() => {
                    const diff = Math.round((processedData.saldoFinal - Number(saldoFinalExtraido)) * 100) / 100;
                    const isPerfect = Math.abs(diff) < 0.05;
                    return (
                      <span style={{ 
                        fontSize: '9.5px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px',
                        background: isPerfect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: isPerfect ? '#10b981' : '#ef4444'
                      }} title={isPerfect ? "Coincide con el saldo informado por el extracto" : `Discrepancia con el extracto bancario de $${diff.toLocaleString('es-AR')}`}>
                        {isPerfect ? 'Cuadra' : 'Diferencia'}
                      </span>
                    );
                  })()
                )}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                Saldo Inicial {Number(saldoAnterior) >= 0 ? '+' : ''} Netos
              </p>
            </div>
          </div>

          {/* Grilla Principal */}
          <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Resultados del Análisis de Trazabilidad</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Verifica y concilia cada transferencia de forma individual o masiva</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button 
                    onClick={handleLimpiarVolver}
                    className="action-button"
                    style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                  >
                    Limpiar y Volver
                  </button>
                  <button 
                    onClick={handleConciliarTodos}
                    className="action-button"
                    disabled={readyToReconcileCount === 0}
                  >
                    <CheckCircle2 size={18} style={{ marginRight: '8px' }} />
                    Conciliar Sugeridos ({readyToReconcileCount})
                  </button>
                </div>
              </div>

              {/* Controles de Filtros y Búsqueda */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', background: 'rgba(0,0,0,0.01)', padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.02)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', flex: 1, minWidth: '220px' }}>
                  <Search size={16} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Buscar por concepto, socio sugerido o importe..."
                    value={searchNueva}
                    onChange={(e) => setSearchNueva(e.target.value)}
                    style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Banco:</span>
                    <select
                      className="premium-input"
                      style={{ padding: '4px 10px', height: '34px', fontSize: '13px', width: '120px', borderRadius: '8px' }}
                      value={filtroBancoNueva}
                      onChange={e => setFiltroBancoNueva(e.target.value)}
                    >
                      <option value="TODOS">Todos</option>
                      <option value="CREDICOOP">Credicoop</option>
                      <option value="NACION">Nación</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Tipo:</span>
                    <select
                      className="premium-input"
                      style={{ padding: '4px 10px', height: '34px', fontSize: '13px', width: '150px', borderRadius: '8px' }}
                      value={filtroTipoNueva}
                      onChange={e => setFiltroTipoNueva(e.target.value)}
                    >
                      <option value="TODOS">Todos los tipos</option>
                      <option value="TRANSFERENCIA_RECIBIDA">Transf. Recibidas</option>
                      <option value="TRANSFERENCIA_ENVIADA">Transf. Enviadas</option>
                      <option value="IMPUESTO">Impuestos</option>
                      <option value="COMISION">Comisiones</option>
                      <option value="SUSCRIPCION">Suscripciones</option>
                      <option value="PAGO_ARCA">Pagos ARCA</option>
                      <option value="PAGO_VEP">Pagos VEP</option>
                      <option value="PAGO_SERVICIO">Pagos Servicios</option>
                      <option value="OTRO_INGRESO">Otros Ingresos</option>
                      <option value="OTRO_EGRESO">Otros Egresos</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Estado:</span>
                    <select
                      className="premium-input"
                      style={{ padding: '4px 10px', height: '34px', fontSize: '13px', width: '130px', borderRadius: '8px' }}
                      value={filtroEstadoNueva}
                      onChange={e => setFiltroEstadoNueva(e.target.value)}
                    >
                      <option value="TODOS">Todos</option>
                      <option value="PENDIENTE">Pendientes</option>
                      <option value="CONCILIADO">Conciliados (Base)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="premium-table-container">
              <table className="premium-table premium-table-compact" style={{ width: '100%', minWidth: '950px', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ width: '8%' }}>Fecha / Banco</th>
                    <th style={{ width: '20%' }}>Concepto Original</th>
                    <th style={{ width: '8%' }}>Débito</th>
                    <th style={{ width: '8%' }}>Crédito</th>
                    <th style={{ width: '16%' }}>Asignar Socio / Titular</th>
                    <th style={{ width: '20%' }}>Saldar Factura Pendiente</th>
                    <th style={{ width: '20%', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRowsNueva.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                        No se encontraron movimientos que coincidan con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    paginatedRowsNueva.map((row) => {
                      const isTaxOrFee = ['IMPUESTO', 'COMISION', 'SUSCRIPCION', 'PAGO_VEP', 'PAGO_SERVICIO', 'PAGO_ARCA', 'TRANSFERENCIA_ENVIADA'].includes(row.tipo_movimiento);
                      const sId = row.selectedSocioId || row.suggestedSocio?.socio?.socio_id;
                      const siblingTransfers = (sId && socioTransfersInfo[sId]) || [];
                      const otherTransfers = siblingTransfers.filter(ot => ot.id !== row.id);
                      
                      const rowStyle = {
                        opacity: row.estado === 'CONCILIADO' 
                          ? (row.reconciledInSession ? 0.9 : 0.5) 
                          : 1,
                        backgroundColor: row.reconciledInSession 
                          ? 'rgba(16, 185, 129, 0.04)' 
                          : (row.estado === 'CONCILIADO' ? 'rgba(0, 0, 0, 0.02)' : 'transparent'),
                        transition: 'opacity 0.5s ease, background-color 0.5s ease'
                      };
                      
                      return (
                        <tr key={row.id} className="table-row-hover" style={rowStyle}>
                          
                          {/* 1. Fecha y Badge del Banco */}
                          <td style={{ fontSize: '13px', fontWeight: 600 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span>{row.fecha}</span>
                              <div>
                                <span style={{ 
                                  fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px',
                                  background: row.banco === 'NACION' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                  color: row.banco === 'NACION' ? '#3b82f6' : '#10b981',
                                  display: 'inline-block'
                                }}>
                                  {row.banco}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Concepto en Extracto Bancario */}
                          <td style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', width: '100%', minWidth: 0 }}>
                                <span 
                                  style={{ 
                                    fontWeight: 600,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flex: 1,
                                    minWidth: 0
                                  }}
                                  title={row.concepto}
                                >
                                  {row.concepto}
                                </span>
                                {renderTipoMovimientoBadge(row.tipo_movimiento)}
                              </div>
                              {row.warningMsg && (
                                <div style={{ display: 'flex' }}>
                                  <span style={{ 
                                    fontSize: '11px', 
                                    fontWeight: 700, 
                                    padding: '3px 8px', 
                                    borderRadius: '6px',
                                    background: 'rgba(245, 158, 11, 0.1)', 
                                    color: '#d97706',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    border: '1px solid rgba(245, 158, 11, 0.2)'
                                  }}>
                                    <AlertCircle size={12} />
                                    {row.warningMsg}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 3. Débito (Importe negativo) */}
                          <td>
                            {row.netoReal < 0 ? (
                              <span style={{ fontWeight: 900, color: '#ef4444', fontSize: '13px' }}>
                                -${Math.abs(row.netoReal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', opacity: 0.3 }}>-</span>
                            )}
                          </td>

                          {/* 4. Crédito (Importe positivo) */}
                          <td>
                            {row.netoReal > 0 ? (
                              <span style={{ fontWeight: 900, color: '#10b981', fontSize: '13px' }}>
                                +${row.netoReal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', opacity: 0.3 }}>-</span>
                            )}
                          </td>

                          {/* 5. Asignar Socio */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {row.estado === 'CONCILIADO' && (row.isDbDuplicate || row.reconciledInSession) ? (
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {row.selectedSocioLabel || 'Gasto / Ingreso General'}
                                </span>
                              ) : isTaxOrFee ? (
                                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontStyle: 'italic', fontWeight: 600 }}>
                                  {row.tipo_movimiento === 'IMPUESTO' ? 'Gasto Bancario General' :
                                   row.tipo_movimiento === 'COMISION' ? 'Pago Comisión' :
                                   row.tipo_movimiento === 'SUSCRIPCION' ? 'Suscripción General' :
                                   row.tipo_movimiento === 'PAGO_VEP' ? 'Pago de VEP (AFIP)' :
                                   row.tipo_movimiento === 'PAGO_ARCA' ? 'Pago de ARCA' :
                                   row.tipo_movimiento === 'PAGO_SERVICIO' ? 'Pago de Servicio General' : 'Gasto General'}
                                </span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <input
                                      type="text"
                                      list="global-socios-list"
                                      className="premium-input"
                                      style={{ fontSize: '12px', padding: '4px 8px', height: '32px', width: '100%' }}
                                      placeholder="Buscar por Nombre / Nro..."
                                      value={row.selectedSocioLabel || ''}
                                      onChange={e => handleSocioInputChange(row.id, e.target.value)}
                                    />
                                    {row.suggestedSocio && !row.selectedSocioId && (
                                      <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>Sugerido por {row.suggestedSocio.reason}:</span>
                                        <button
                                          type="button"
                                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontWeight: 'bold', textDecoration: 'underline' }}
                                          onClick={() => handleSocioInputChange(row.id, `${row.suggestedSocio.socio.nombre_completo} (Socio ${row.suggestedSocio.socio.nro_socio || ''})`)}
                                        >
                                          Aceptar match
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {otherTransfers.length > 0 && (
                                <div style={{ display: 'flex' }}>
                                  <span style={{ 
                                    fontSize: '10px', 
                                    fontWeight: 700, 
                                    padding: '2px 6px', 
                                    borderRadius: '5px',
                                    background: 'rgba(59, 130, 246, 0.1)', 
                                    color: '#2563eb',
                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}>
                                    🔄 Otra transf: {otherTransfers.map(ot => `$${Math.abs(ot.netoReal).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`).join(', ')}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 6. Saldar Liquidación */}
                          <td style={{ }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {row.estado === 'CONCILIADO' && (row.isDbDuplicate || row.reconciledInSession || row.isAlreadyPaidMatch) ? (
                                (row.selectedLiquidationId || (row.selectedLiquidations && row.selectedLiquidations.length > 0)) ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                      {(row.selectedLiquidations || []).length > 1 ? `Vinculado a: ${(row.selectedLiquidations || []).length} Grupos` : (() => {
                                        const dbLiq = row.dbLiquidationInfo;
                                        if (dbLiq) {
                                          return `Vinculado a: Periodo ${dbLiq.periodo || ''} (Gpo ${dbLiq.numero_grupo || ''})`;
                                        }
                                        const localLiq = row.pendingList?.find(l => String(l.liquidacion_id) === String((row.selectedLiquidations || [])[0]));
                                        if (localLiq) {
                                          return `Vinculado a: Periodo ${localLiq.periodo} (Gpo ${localLiq.numero_grupo})`;
                                        }
                                        return '';
                                      })()}
                                    </span>
                                    {(row.selectedLiquidations || []).length === 1 && (
                                      <button
                                        type="button"
                                        onClick={() => openBreakdownModal((row.selectedLiquidations || [])[0])}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: 'var(--accent)',
                                          fontSize: '11px',
                                          cursor: 'pointer',
                                          padding: 0,
                                          textDecoration: 'underline',
                                          textAlign: 'left',
                                          fontWeight: 'bold'
                                        }}
                                      >
                                        Ver desglose del grupo
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Sin factura vinculada</span>
                                )
                              ) : !isTaxOrFee && (() => {
                                const isDropdownOpen = openDropdownRowId === row.id;
                                const socioId = row.selectedSocioId;
                                
                                // Get currently selected liquidation info
                                const selectedLiq = (row.selectedLiquidations || []).length === 1
                                  ? row.pendingList?.find(l => String(l.liquidacion_id) === String(row.selectedLiquidations[0]))
                                  : null;

                                // Total pending amount for all selected
                                const totalGroupPending = row.pendingList
                                  .filter(liq => (row.selectedLiquidations || []).includes(String(liq.liquidacion_id)))
                                  .reduce((sum, liq) => 
                                    sum + (Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0)), 0
                                  );

                                // Display text of the button
                                let buttonText = "Seleccionar factura / líneas...";
                                if (!row.selectedSocioId) {
                                  buttonText = "Asigne un socio primero";
                                } else if (row.pendingList.length === 0) {
                                  buttonText = "Ninguna deuda pendiente";
                                } else if ((row.selectedLiquidations || []).length === 0) {
                                  buttonText = "-- No saldar deuda --";
                                } else if ((row.selectedLiquidations || []).length > 1) {
                                  buttonText = `[MÚLTIPLES GRUPOS] ($${totalGroupPending.toLocaleString('es-AR', { minimumFractionDigits: 0 })})`;
                                } else if (selectedLiq) {
                                  const pendingAmount = Number(selectedLiq.monto_total_facturado || 0) - Number(selectedLiq.monto_abonado || 0);
                                  const providerName = selectedLiq.proveedores?.nombre || 'S/P';
                                  
                                  if ((row.selectedLines || []).length > 0) {
                                    const selectedSum = (row.selectedLines || []).reduce((sum, lineNum) => {
                                      const line = periodConsumos.find(c => 
                                        c.numero_linea === lineNum && 
                                        c.lineas?.numero_grupo === parseInt(selectedLiq.numero_grupo, 10) &&
                                        c.proveedor_id === selectedLiq.proveedor_id
                                      );
                                      return sum + (line ? Number(line.total_linea) : 0);
                                    }, 0);
                                    buttonText = `${(row.selectedLines || []).length} líneas de Gpo ${selectedLiq.numero_grupo} ($${selectedSum.toLocaleString('es-AR', { minimumFractionDigits: 0 })})`;
                                  } else {
                                    buttonText = `${selectedLiq.periodo} - Gpo ${selectedLiq.numero_grupo} (${providerName}) ($${pendingAmount.toLocaleString('es-AR', { minimumFractionDigits: 0 })})`;
                                  }
                                }

                                return (
                                  <div 
                                    id={`dropdown-container-${row.id}`}
                                    style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}
                                  >
                                    <div style={{ display: 'flex', gap: '6px', width: '100%', alignItems: 'center' }}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!row.selectedSocioId || row.pendingList.length === 0 || row.estado === 'PROCESANDO') return;
                                          setOpenDropdownRowId(isDropdownOpen ? null : row.id);
                                        }}
                                        className="premium-input"
                                        disabled={!row.selectedSocioId || row.pendingList.length === 0 || row.estado === 'PROCESANDO'}
                                        style={{
                                          width: '160px',
                                          minWidth: '160px',
                                          maxWidth: '160px',
                                          overflow: 'hidden',
                                          fontSize: '12px',
                                          padding: '4px 8px',
                                          height: '32px',
                                          background: 'rgba(255, 255, 255, 0.05)',
                                          border: '1px solid var(--border-light)',
                                          borderRadius: '8px',
                                          cursor: (!row.selectedSocioId || row.pendingList.length === 0 || row.estado === 'PROCESANDO') ? 'not-allowed' : 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          color: 'var(--text-primary)',
                                          textAlign: 'left'
                                        }}
                                      >
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                                          {buttonText}
                                        </span>
                                        {row.selectedSocioId && row.pendingList.length > 0 && (
                                          <span style={{ fontSize: '9px', marginLeft: '6px', opacity: 0.7, flexShrink: 0 }}>▼</span>
                                        )}
                                      </button>
                                      
                                      <button
                                        type="button"
                                        onClick={() => openBreakdownModal(row.selectedLiquidationId, row)}
                                        disabled={!row.selectedLiquidationId}
                                        style={{
                                          width: '32px',
                                          minWidth: '32px',
                                          height: '32px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          background: row.selectedLiquidationId ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0, 0, 0, 0.02)',
                                          color: row.selectedLiquidationId ? 'var(--accent)' : 'var(--text-secondary)',
                                          border: '1px solid var(--border-light)',
                                          borderRadius: '8px',
                                          cursor: row.selectedLiquidationId ? 'pointer' : 'not-allowed',
                                          opacity: row.selectedLiquidationId ? 1 : 0.5,
                                          transition: 'all 0.2s',
                                          flexShrink: 0
                                        }}
                                        title="Ver desglose del grupo"
                                      >
                                        <HelpCircle size={15} />
                                      </button>
                                    </div>

                                    {isDropdownOpen && (
                                      <div 
                                        id={`dropdown-panel-${row.id}`}
                                        style={{
                                          position: 'absolute',
                                          top: '36px',
                                          right: 0,
                                          width: '320px',
                                          background: 'var(--modal-bg)',
                                          border: '1px solid var(--border-light)',
                                          borderRadius: '16px',
                                          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.15)',
                                          zIndex: 999,
                                          maxHeight: '340px',
                                          overflowY: 'auto',
                                          padding: '12px',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: '8px'
                                        }}>
                                          <div style={{
                                            paddingBottom: '8px',
                                            borderBottom: '1px solid var(--border-light)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '2px'
                                          }}>
                                            <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                              Vincular Factura / Líneas
                                            </span>
                                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                                              Socio: {row.selectedSocioLabel}
                                            </span>
                                          </div>

                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px',
                                              padding: '6px 8px',
                                              borderRadius: '6px',
                                              cursor: 'pointer',
                                              fontSize: '11.5px',
                                              background: (row.selectedLiquidations || []).length === 0 ? 'var(--accent-light)' : 'transparent',
                                              border: '1px solid ' + ((row.selectedLiquidations || []).length === 0 ? 'var(--border-light)' : 'transparent')
                                            }} className="dropdown-item-hover">
                                              <input 
                                                type="radio" 
                                                name={`liq-select-${row.id}`}
                                                checked={(row.selectedLiquidations || []).length === 0}
                                                onChange={() => {
                                                  handleToggleLiquidation(row.id, '');
                                                  // Optional: clear all
                                                  row.selectedLiquidations?.forEach(id => handleToggleLiquidation(row.id, id));
                                                }}
                                                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                              />
                                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>-- No saldar deuda --</span>
                                            </label>

                                            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-light)' }}>
                                              {addingGroupToRowId === row.id ? (
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                  <input
                                                    autoFocus
                                                    type="number"
                                                    value={newGroupValue}
                                                    onChange={(e) => setNewGroupValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (newGroupValue && !isNaN(newGroupValue)) {
                                                          handleAddGroupToRow(row.id, parseInt(newGroupValue, 10));
                                                          setAddingGroupToRowId(null);
                                                          setNewGroupValue('');
                                                        }
                                                      } else if (e.key === 'Escape') {
                                                        setAddingGroupToRowId(null);
                                                        setNewGroupValue('');
                                                      }
                                                    }}
                                                    placeholder="N° de Grupo"
                                                    style={{
                                                      flex: 1,
                                                      padding: '4px 8px',
                                                      borderRadius: '6px',
                                                      border: '1px solid var(--accent)',
                                                      fontSize: '11px',
                                                      outline: 'none'
                                                    }}
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      if (newGroupValue && !isNaN(newGroupValue)) {
                                                        handleAddGroupToRow(row.id, parseInt(newGroupValue, 10));
                                                        setAddingGroupToRowId(null);
                                                        setNewGroupValue('');
                                                      }
                                                    }}
                                                    style={{
                                                      padding: '4px 8px',
                                                      borderRadius: '6px',
                                                      background: 'var(--accent)',
                                                      color: '#fff',
                                                      border: 'none',
                                                      fontSize: '11px',
                                                      cursor: 'pointer',
                                                      fontWeight: 600
                                                    }}
                                                  >
                                                    Add
                                                  </button>
                                                </div>
                                              ) : (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAddingGroupToRowId(row.id);
                                                  }}
                                                  style={{
                                                    width: '100%',
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    border: '1px dashed var(--accent)',
                                                    background: 'rgba(16, 185, 129, 0.05)',
                                                    color: 'var(--accent)',
                                                    fontSize: '11px',
                                                    cursor: 'pointer',
                                                    fontWeight: 600
                                                  }}
                                                >
                                                  + Agregar otro grupo...
                                                </button>
                                              )}
                                            </div>


                                            {row.pendingList.map(liq => {
                                              if (!liq) return null;
                                              const isLiqSelected = (row.selectedLiquidations || []).includes(liq.liquidacion_id.toString());
                                              const pendingAmount = Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0);
                                              const providerName = liq.proveedores?.nombre || 'S/P';
                                              
                                              const socioLines = periodConsumos.filter(c => 
                                                c.lineas?.numero_grupo === parseInt(liq.numero_grupo, 10) &&
                                                c.proveedor_id === liq.proveedor_id
                                              );

                                              return (
                                                <div key={liq.liquidacion_id} style={{
                                                  display: 'flex',
                                                  flexDirection: 'column',
                                                  background: isLiqSelected ? 'rgba(0,0,0,0.01)' : 'transparent',
                                                  borderRadius: '8px',
                                                  border: '1px solid ' + (isLiqSelected ? 'var(--border-light)' : 'transparent'),
                                                  padding: '4px'
                                                }}>
                                                  <label style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    padding: '6px 8px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '11.5px',
                                                    background: isLiqSelected && (row.selectedLines || []).length === 0 ? 'var(--accent-light)' : 'transparent'
                                                  }} className="dropdown-item-hover">
                                                    <input 
                                                      type="checkbox" 
                                                      name={`liq-select-${row.id}-${liq.liquidacion_id}`}
                                                      checked={isLiqSelected}
                                                      onChange={() => {
                                                        handleToggleLiquidation(row.id, liq.liquidacion_id.toString());
                                                      }}
                                                      style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: '14px', height: '14px' }}
                                                    />
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                                        {liq.periodo} - Gpo {liq.numero_grupo} ({providerName})
                                                      </span>
                                                      <span style={{ fontWeight: 800, color: pendingAmount <= 0 ? 'var(--text-secondary)' : 'var(--text-primary)', fontSize: '11px', marginLeft: '6px' }}>
                                                        {pendingAmount <= 0 ? '(Ya saldado)' : `$${pendingAmount.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`}
                                                      </span>
                                                    </div>
                                                  </label>

                                                  {isLiqSelected && socioLines.length > 0 && (
                                                    <div style={{
                                                      marginLeft: '20px',
                                                      marginTop: '4px',
                                                      padding: '4px',
                                                      borderLeft: '2px solid var(--border-light)',
                                                      display: 'flex',
                                                      flexDirection: 'column',
                                                      gap: '4px'
                                                    }}>
                                                      {socioLines.map(line => {
                                                        const isLineChecked = (row.selectedLines || []).includes(line.numero_linea);
                                                        return (
                                                          <label key={line.numero_linea} style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '4px 8px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            fontSize: '11px',
                                                            color: 'var(--text-primary)',
                                                            background: isLineChecked ? 'var(--accent-light)' : 'transparent'
                                                          }} className="dropdown-item-hover">
                                                            <input 
                                                              type="checkbox"
                                                              checked={isLineChecked}
                                                              onChange={(e) => {
                                                                handleToggleLineSelection(row.id, line.numero_linea, e.target.checked);
                                                              }}
                                                              style={{
                                                                width: '13px',
                                                                height: '13px',
                                                                cursor: 'pointer',
                                                                accentColor: 'var(--accent)'
                                                              }}
                                                            />
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '11px' }}>
                                                                  {line.lineas?.socios?.nombre_completo || 'Socio Desconocido'}
                                                                </span>
                                                                <span style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                                                                  Línea: {line.numero_linea}
                                                                </span>
                                                              </div>
                                                              <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '11px' }}>
                                                                ${Number(line.total_linea).toLocaleString('es-AR')}
                                                              </span>
                                                            </div>
                                                          </label>
                                                        );
                                                      })}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                    {(row.selectedLiquidations || []).length === 1 && (() => {
                                      const singleLiqId = (row.selectedLiquidations || [])[0];
                                      const singleLiq = row.pendingList.find(l => String(l.liquidacion_id) === String(singleLiqId));
                                      if (!singleLiq) return null;
                                      const currentGroup = singleLiq.numero_grupo;
                                      const currentLines = periodConsumos.filter(c => 
                                        c.lineas?.numero_grupo === parseInt(currentGroup, 10) &&
                                        c.proveedor_id === singleLiq.proveedor_id
                                      );
                                      const selectedSum = (row.selectedLines || []).reduce((sum, lineNum) => {
                                        const line = periodConsumos.find(c => 
                                          c.numero_linea === lineNum && 
                                          c.lineas?.numero_grupo === parseInt(singleLiq.numero_grupo, 10) &&
                                          c.proveedor_id === singleLiq.proveedor_id
                                        );
                                        return sum + (line ? Number(line.total_linea) : 0);
                                      }, 0);
                                      const diff = Math.abs(selectedSum - Math.abs(row.netoReal));
                                      const isMatch = diff < 0.05;
                                      
                                      if (!isMatch && currentLines.length > 0) {
                                        return (
                                          <div style={{
                                            fontSize: '10px',
                                            color: '#d97706',
                                            background: 'rgba(245, 158, 11, 0.05)',
                                            padding: '4px 6px',
                                            borderRadius: '6px',
                                            border: '1px dashed rgba(245, 158, 11, 0.2)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            marginTop: '2px'
                                          }}>
                                            <span>⚠️ Seleccionado: ${selectedSum.toLocaleString('es-AR')} (Transf: ${Math.abs(row.netoReal).toLocaleString('es-AR')})</span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>

                          {/* 7. Acción */}
                          <td style={{ textAlign: 'center' }}>
                            {row.estado === 'CONCILIADO' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <div style={{ 
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  alignItems: 'center', 
                                  color: row.reconciledInSession ? '#10b981' : 'var(--text-secondary)', 
                                  gap: '2px', 
                                  fontWeight: 700, 
                                  fontSize: '13px' 
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle2 size={16} />
                                    {row.reconciledInSession ? 'Conciliado' : 'Ya Registrado'}
                                  </div>
                                  {row.reconciledInSession ? (
                                    <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 500 }}>(Guardado en DB)</span>
                                  ) : (
                                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                      {row.isAlreadyPaidMatch ? '(Pago ya impactó)' : '(Ignorado / Duplicado)'}
                                    </span>
                                  )}
                                </div>
                                {row.movimiento_id && openEditConciliacionModal && (
                                  <button
                                    onClick={() => openEditConciliacionModal(row)}
                                    className="action-button"
                                    style={{ 
                                      background: 'transparent', color: 'var(--accent)', border: '1px solid var(--border-light)',
                                      padding: '4px 10px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer',
                                      height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                  >
                                    Editar
                                  </button>
                                )}
                                {!row.movimiento_id && deshacerMatchLocal && (
                                  <button
                                    onClick={() => deshacerMatchLocal(row.id)}
                                    className="action-button"
                                    style={{ 
                                      background: 'transparent', color: 'var(--accent)', border: '1px solid var(--border-light)',
                                      padding: '4px 10px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer',
                                      height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                  >
                                    Editar
                                  </button>
                                )}
                              </div>
                            ) : row.estado === 'PROCESANDO' ? (
                              <Loader2 className="animate-spin" size={18} style={{ color: 'var(--accent)', margin: '0 auto' }} />
                            ) : (
                              (() => {
                                let isAlreadySaldada = false;
                                if (row.selectedLiquidations && row.selectedLiquidations.length > 0) {
                                  isAlreadySaldada = row.selectedLiquidations.every(liqId => {
                                    const liq = row.pendingList?.find(l => String(l.liquidacion_id) === String(liqId));
                                    if (!liq) return false;
                                    const pending = Number(liq.monto_total_facturado || 0) - Number(liq.monto_abonado || 0);
                                    return pending <= 2.00;
                                  });
                                } else if (row.selectedLiquidationId && row.selectedLiquidationId !== 'SALDAR_TODO') {
                                  const liq = row.pendingList?.find(l => String(l.liquidacion_id) === String(row.selectedLiquidationId));
                                  if (liq) {
                                    const pending = Number(liq.monto_total_facturado || 0) - Number(liq.monto_abonado || 0);
                                    if (pending <= 2.00) isAlreadySaldada = true;
                                  }
                                }

                                const isAmountMatch = row.netoReal > 0 && checkIsAmountMatch(row, periodConsumos);
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                    <span style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '4px', 
                                      fontSize: '11px', 
                                      fontWeight: 700, 
                                      color: isAlreadySaldada ? 'var(--text-secondary)' : (isAmountMatch ? '#16a34a' : (row.netoReal > 0 ? '#d97706' : 'var(--text-secondary)')),
                                      background: isAlreadySaldada ? 'rgba(0,0,0,0.05)' : (isAmountMatch ? 'rgba(22, 163, 74, 0.08)' : (row.netoReal > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(0,0,0,0.05)')),
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      border: isAlreadySaldada ? '1px solid var(--border-light)' : (isAmountMatch ? '1px solid rgba(22, 163, 74, 0.2)' : (row.netoReal > 0 ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid var(--border-light)'))
                                    }}>
                                      {isAlreadySaldada ? <CheckCircle2 size={12} /> : (isAmountMatch ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />)}
                                      {isAlreadySaldada ? 'Ya Saldado' : (isAmountMatch ? 'Listo para conciliar' : (row.netoReal > 0 ? 'Sin Conciliar' : 'No Conciliable'))}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                      {row.netoReal > 0 && (
                                        <button 
                                          onClick={() => conciliarFila(row.id, false, row.selectedLines)}
                                          className="action-button"
                                          style={{ padding: '6px 12px', fontSize: '12px', height: '32px', borderRadius: '8px', flexShrink: 0 }}
                                          disabled={isAlreadySaldada || (!row.selectedSocioId && !isTaxOrFee)}
                                          title={isAlreadySaldada ? 'La liquidación seleccionada ya está saldada' : ''}
                                        >
                                          <Save size={13} style={{ marginRight: '4px' }} />
                                          Conciliar
                                        </button>
                                      )}
                                      {row.netoReal > 0 && (
                                        <button 
                                          onClick={() => openLoteModal(row)}
                                          className="action-button"
                                          style={{ 
                                            padding: '6px 12px', 
                                            fontSize: '12px', 
                                            height: '32px', 
                                            borderRadius: '8px',
                                            background: 'rgba(59, 130, 246, 0.1)',
                                            color: '#3b82f6',
                                            border: '1px solid rgba(59, 130, 246, 0.2)',
                                            flexShrink: 0
                                          }}
                                          title="Conciliar lote de débitos automáticos por CBU usando un archivo Excel"
                                        >
                                          Lote CBU
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                            
                            {row.estado === 'ERROR' && (
                              <div style={{ color: 'var(--danger)', fontSize: '10px', marginTop: '4px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.errorMsg}>
                                Error: {row.errorMsg}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Controles de Paginación */}
            {totalPagesNueva > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border-light)', background: 'var(--surface)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                  Mostrando {(currentPageNueva - 1) * itemsPerPage + 1} a {Math.min(currentPageNueva * itemsPerPage, processedData.rows.length)} de {processedData.rows.length} movimientos
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => setCurrentPageNueva(p => Math.max(1, p - 1))}
                    disabled={currentPageNueva === 1}
                    className="action-button"
                    style={{ padding: '6px 12px', fontSize: '12px', height: 'auto', background: currentPageNueva === 1 ? 'transparent' : 'var(--accent)', color: currentPageNueva === 1 ? 'var(--text-secondary)' : 'white', border: '1px solid var(--border-light)', opacity: currentPageNueva === 1 ? 0.5 : 1 }}
                  >
                    Anterior
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '700' }}>
                    Página {currentPageNueva} de {totalPagesNueva}
                  </div>
                  <button 
                    onClick={() => setCurrentPageNueva(p => Math.min(totalPagesNueva, p + 1))}
                    disabled={currentPageNueva === totalPagesNueva}
                    className="action-button"
                    style={{ padding: '6px 12px', fontSize: '12px', height: 'auto', background: currentPageNueva === totalPagesNueva ? 'transparent' : 'var(--accent)', color: currentPageNueva === totalPagesNueva ? 'var(--text-secondary)' : 'white', border: '1px solid var(--border-light)', opacity: currentPageNueva === totalPagesNueva ? 0.5 : 1 }}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
