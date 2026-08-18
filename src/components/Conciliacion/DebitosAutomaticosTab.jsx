import React, { useState, useEffect } from 'react';
import { Loader2, Upload, Database, AlertTriangle, FileSpreadsheet, CheckCircle2, ClipboardPaste, HelpCircle } from 'lucide-react';

export default function DebitosAutomaticosTab({
  loteModal,
  setLoteModal,
  candidateMovements,
  handleExcelUpload,
  handleColumnMappingChange,
  handleRowCheckChange,
  handleRowLiquidationChange,
  handleLoteRowToggleLiquidation,
  handleCheckAll,
  saveLoteReconciliation,
  handleSheetChange,
  openBreakdownModal,
  handleTextPaste,
  periodConsumos = [],
  handleToggleLineSelection
}) {
  const [pasteText, setPasteText] = useState('');
  const [openDropdownRowId, setOpenDropdownRowId] = useState(null);
  const [inputMethod, setInputMethod] = useState('file'); // 'file' | 'paste'

  const stats = React.useMemo(() => {
    const rows = loteModal.processedRows || [];
    const totalUpload = rows.reduce((sum, r) => sum + r.monto, 0);
    const totalChecked = rows.filter(r => r.checked).reduce((sum, r) => sum + r.monto, 0);
    const totalRej = rows.filter(r => r.matchStatus === 'EXCEL_REJECT').reduce((sum, r) => sum + r.monto, 0);
    const totalNoFound = rows.filter(r => r.matchStatus === 'NO_FOUND').reduce((sum, r) => sum + r.monto, 0);
    const totalNoDebt = rows.filter(r => r.matchStatus === 'MATCH_NO_DEBT').reduce((sum, r) => sum + r.monto, 0);
    const totalDebt = rows.filter(r => r.matchStatus === 'MATCH_DEBT').reduce((sum, r) => sum + r.monto, 0);
    
    return {
      totalUpload,
      totalChecked,
      totalRej,
      totalNoFound,
      totalNoDebt,
      totalDebt,
      countTotal: rows.length,
      countChecked: rows.filter(r => r.checked).length,
      countRej: rows.filter(r => r.matchStatus === 'EXCEL_REJECT').length,
      countNoFound: rows.filter(r => r.matchStatus === 'NO_FOUND').length,
      countNoDebt: rows.filter(r => r.matchStatus === 'MATCH_NO_DEBT').length,
      countDebt: rows.filter(r => r.matchStatus === 'MATCH_DEBT').length,
    };
  }, [loteModal.processedRows]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (openDropdownRowId === null) return;

    const handleClickOutside = (event) => {
      const container = document.getElementById(`lote-dropdown-container-${openDropdownRowId}`);
      if (container && !container.contains(event.target)) {
        setOpenDropdownRowId(null);
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
      const panel = document.getElementById(`lote-dropdown-panel-${openDropdownRowId}`);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden', padding: '24px' }}>
        
        <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Conciliación Masiva de Débitos Automáticos</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Conciliá lotes de recaudación subiendo el detalle del débito automático en Excel/CSV (ej: <strong>VC DEBITOS.xlsx</strong>) o pegando la tabla de texto, vinculándolos con la transacción bancaria colectiva.
            </p>
          </div>
        </div>

        {/* Dropdown de Selección de Movimiento Bancario Colectivo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          <div className="glass-panel-sub" style={{ padding: '16px 20px', borderRadius: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', display: 'flex', gap: '20px', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', maxWidth: '650px' }}>
              <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                1. Seleccionar Movimiento Bancario Colectivo a Conciliar (Extracto Banco)
              </label>
              <select
                className="premium-input"
                style={{ padding: '8px 12px', height: '42px', fontSize: '13px', borderRadius: '10px' }}
                value={loteModal.row?.id !== undefined ? String(loteModal.row.id) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setLoteModal(prev => ({ ...prev, row: null }));
                    return;
                  }
                  const foundRow = candidateMovements.find(m => String(m.id) === val);
                  setLoteModal(prev => ({
                    ...prev,
                    row: foundRow || null
                  }));
                }}
              >
                <option value="">-- Seleccionar movimiento del extracto bancario --</option>
                {candidateMovements.map(m => (
                  <option key={String(m.id)} value={String(m.id)}>
                    {m.isRecaudacion ? '⭐ ' : ''}{m.fecha} - {m.concepto} ({m.banco}) [+${Number(m.netoReal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}]
                  </option>
                ))}
              </select>
            </div>

            {loteModal.row && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '12px 16px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <div>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 700 }}>Movimiento Seleccionado</span>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {loteModal.row.concepto} — {loteModal.row.banco} ({loteModal.row.fecha})
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 700 }}>Importe en Banco</span>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#10b981', marginTop: '2px' }}>
                    +${Number(loteModal.row.netoReal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Area (Subir Archivo Excel o Pegar Tabla) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loteModal.excelRows.length === 0 ? (
            <div 
              className="glass-panel-sub"
              style={{
                borderRadius: '20px',
                padding: '24px',
                background: 'rgba(255,255,255,0.01)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                border: '1px solid var(--border-light)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileSpreadsheet size={20} color="var(--accent)" />
                  <h4 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>2. Cargar Detalle de Débitos (Excel o Tabla)</h4>
                </div>
                
                {/* Selector de modo: Archivo vs Pegar */}
                <div style={{ display: 'flex', background: 'var(--surface)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <button
                    onClick={() => setInputMethod('file')}
                    style={{
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      background: inputMethod === 'file' ? 'var(--accent)' : 'transparent',
                      color: inputMethod === 'file' ? '#ffffff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Upload size={14} /> Subir Archivo Excel / CSV
                  </button>
                  <button
                    onClick={() => setInputMethod('paste')}
                    style={{
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      background: inputMethod === 'paste' ? 'var(--accent)' : 'transparent',
                      color: inputMethod === 'paste' ? '#ffffff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <ClipboardPaste size={14} /> Pegar Tabla de Texto
                  </button>
                </div>
              </div>

              {inputMethod === 'file' ? (
                /* Subida directa de archivo Excel / CSV */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label
                    htmlFor="debitos-file-upload-input"
                    className="hover-lift"
                    style={{
                      border: '2px dashed var(--accent)',
                      borderRadius: '16px',
                      padding: '36px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      background: 'rgba(34, 197, 94, 0.03)',
                      textAlign: 'center',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                      {loteModal.loading ? <Loader2 className="animate-spin" size={26} /> : <Upload size={26} />}
                    </div>
                    <div>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {loteModal.loading ? 'Leyendo archivo Excel...' : 'Seleccionar o arrastrar archivo de Débitos (.xlsx, .xls, .csv)'}
                      </span>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                        Podés subir <strong>VC DEBITOS.xlsx</strong> o cualquier archivo exportado con CBU, importes y socios/grupos.
                      </p>
                    </div>
                  </label>
                  <input
                    id="debitos-file-upload-input"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: 'none' }}
                    onChange={handleExcelUpload}
                  />
                </div>
              ) : (
                /* Pegar Texto Area */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
                    Copiá la tabla desde Excel (incluyendo los encabezados) y pegala aquí abajo. El sistema detectará las columnas automáticamente.
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`Pegar datos aquí...\n\nEjemplo:\nGRUPO NRO\tRESULT\tEXPLICACIÓN\tSOCIO\tIMPORTE $\tCBU EN 22 OK\n5037\tR10\tFalta de fondos\tRafti, Juan Ignacio\t$ 57,888.46\t02900537...`}
                    style={{
                      width: '100%',
                      height: '180px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      resize: 'vertical',
                      outline: 'none'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleTextPaste(pasteText)}
                      className="action-button"
                      style={{ padding: '0 24px', height: '38px', fontSize: '13px' }}
                      disabled={!pasteText.trim()}
                    >
                      Procesar Texto Pegado
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Excel Data Loaded - Mappings & Preview */
            <>
              {/* Barra de archivo cargado con opción de cambiar */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: 'rgba(16, 185, 129, 0.08)', 
                padding: '12px 18px', 
                borderRadius: '14px', 
                border: '1px solid rgba(16, 185, 129, 0.2)',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileSpreadsheet size={20} color="#10b981" />
                  <div>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {loteModal.fileName || 'Archivo de Débitos Cargado'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      ({loteModal.excelRows.length} registros cargados)
                    </span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label
                    htmlFor="debitos-file-change-input"
                    className="btn-ghost hover-lift"
                    style={{
                      cursor: 'pointer',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: 'var(--surface)',
                      border: '1px solid var(--border-light)',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Upload size={14} /> Cambiar Archivo / Cargar Otro
                  </label>
                  <input
                    id="debitos-file-change-input"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: 'none' }}
                    onChange={handleExcelUpload}
                  />
                </div>
              </div>

              {/* Panel de Configuración de Columnas */}
              <div className="glass-panel-sub" style={{ 
                 padding: '16px 20px', 
                 borderRadius: '16px', 
                 background: 'rgba(255,255,255,0.01)',
                 border: '1px solid var(--border-light)',
                 display: 'flex',
                 flexDirection: 'column',
                 gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={16} color="var(--accent)" />
                      <span style={{ fontSize: '12.5px', fontWeight: 800 }}>Mapeo de Columnas de Excel ({loteModal.fileName})</span>
                    </div>
                    {/* Selector de Hoja */}
                    {loteModal.sheets && loteModal.sheets.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>Hoja:</span>
                        <select
                          className="premium-input"
                          style={{ height: '30px', padding: '0 8px', fontSize: '12px', borderRadius: '8px', minWidth: '150px', background: 'var(--surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                          value={loteModal.selectedSheet}
                          onChange={(e) => handleSheetChange(e.target.value)}
                        >
                          {loteModal.sheets.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    {/* CBU Col */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Columna CBU / Identificación</label>
                      <select
                        className="premium-input"
                        style={{ height: '34px', padding: '4px 8px', fontSize: '12.5px', borderRadius: '8px' }}
                        value={loteModal.cbuCol}
                        onChange={(e) => handleColumnMappingChange('cbuCol', e.target.value)}
                      >
                        {loteModal.columns.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Importe Col */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Columna Importe ($)</label>
                      <select
                        className="premium-input"
                        style={{ height: '34px', padding: '4px 8px', fontSize: '12.5px', borderRadius: '8px' }}
                        value={loteModal.montoCol}
                        onChange={(e) => handleColumnMappingChange('montoCol', e.target.value)}
                      >
                        {loteModal.columns.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* DNI/CUIT Col */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Columna CUIT/DNI (Opcional)</label>
                      <select
                        className="premium-input"
                        style={{ height: '34px', padding: '4px 8px', fontSize: '12.5px', borderRadius: '8px' }}
                        value={loteModal.idCol}
                        onChange={(e) => handleColumnMappingChange('idCol', e.target.value)}
                      >
                        <option value="">-- No mapeado --</option>
                        {loteModal.columns.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Estado Col */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Columna Estado / Resultado (Opcional)</label>
                      <select
                        className="premium-input"
                        style={{ height: '34px', padding: '4px 8px', fontSize: '12.5px', borderRadius: '8px' }}
                        value={loteModal.estadoCol}
                        onChange={(e) => handleColumnMappingChange('estadoCol', e.target.value)}
                      >
                        <option value="">-- No mapeado --</option>
                        {loteModal.columns.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Grupo Col */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Columna Grupo / GPO (Opcional)</label>
                      <select
                        className="premium-input"
                        style={{ height: '34px', padding: '4px 8px', fontSize: '12.5px', borderRadius: '8px' }}
                        value={loteModal.grupoCol || ''}
                        onChange={(e) => handleColumnMappingChange('grupoCol', e.target.value)}
                      >
                        <option value="">-- No mapeado --</option>
                        {loteModal.columns.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {!loteModal.estadoCol && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 16px',
                    background: 'rgba(217, 119, 6, 0.08)',
                    border: '1px solid rgba(217, 119, 6, 0.2)',
                    borderRadius: '12px',
                    color: '#d97706',
                    fontSize: '12.5px',
                    lineHeight: '1.4',
                    textAlign: 'left'
                  }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Atención:</strong> No has mapeado la columna de <strong>Estado / Resultado</strong> del Excel. Todos los registros se considerarán como "Cobrados con Éxito" (incluyendo posibles rechazos bancarios). Esto puede causar una discrepancia con el depósito real neto reflejado en el banco.
                    </div>
                  </div>
                )}

                {/* Tabla de Previsualización */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>Vista Previa de Coincidencias ({loteModal.processedRows.length} filas detectadas)</span>
                    <button 
                      onClick={() => { setLoteModal(prev => ({ ...prev, excelRows: [], processedRows: [], columns: [], fileName: '' })); }}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Cargar otro archivo
                    </button>
                  </div>

                  <div className="premium-table-container" style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
                    <table className="premium-table premium-table-compact" style={{ margin: 0, tableLayout: 'fixed', minWidth: '920px' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={loteModal.processedRows.length > 0 && loteModal.processedRows.every(r => !r.socioId || r.checked)}
                              onChange={(e) => handleCheckAll(e.target.checked)}
                              style={{ cursor: 'pointer' }}
                            />
                          </th>
                          <th style={{ width: '50px' }}>#</th>
                          <th style={{ width: '210px' }}>Integrante / Nombre en Excel</th>
                          <th style={{ width: '150px' }}>CBU / Identif.</th>
                          <th style={{ width: '110px', textAlign: 'right' }}>Importe Excel</th>
                          <th style={{ width: '240px' }}>Factura a Imputar</th>
                          <th style={{ width: '120px', textAlign: 'center' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loteModal.processedRows.map((row) => {
                          let statusBg = 'rgba(107, 114, 128, 0.08)';
                          let statusColor = '#6b7280';
                          
                          if (row.matchStatus === 'MATCH_DEBT') {
                            statusBg = 'rgba(16, 185, 129, 0.1)';
                            statusColor = '#10b981';
                          } else if (row.matchStatus === 'MATCH_NO_DEBT') {
                            statusBg = 'rgba(234, 179, 8, 0.1)';
                            statusColor = '#eab308';
                          } else if (row.matchStatus === 'NO_FOUND') {
                            statusBg = 'rgba(239, 68, 68, 0.1)';
                            statusColor = '#ef4444';
                          } else if (row.matchStatus === 'EXCEL_REJECT') {
                            statusBg = 'rgba(249, 115, 22, 0.1)';
                            statusColor = '#f97316';
                          } else if (row.matchStatus === 'INVALID_AMOUNT') {
                            statusBg = 'rgba(239, 68, 68, 0.1)';
                            statusColor = '#ef4444';
                          }

                          return (
                            <tr key={row.id} className="table-row-hover" style={{ opacity: row.checked ? 1 : 0.6 }}>
                              <td style={{ textAlign: 'center' }}>
                                <input 
                                  type="checkbox" 
                                  checked={row.checked} 
                                  onChange={(e) => handleRowCheckChange(row.id, e.target.checked)}
                                  disabled={!row.socioId || row.matchStatus === 'INVALID_AMOUNT'}
                                  style={{ cursor: (!row.socioId || row.matchStatus === 'INVALID_AMOUNT') ? 'default' : 'pointer' }}
                                />
                              </td>
                              <td style={{ fontSize: '12px', fontWeight: 600 }}>{row.id + 1}</td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 600 }}>
                                    {row.socioNombreCompleto || row.nombreExcel || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Desconocido</span>}
                                  </span>
                                  {row.socioNombreCompleto && row.nombreExcel && row.nombreExcel !== row.socioNombreCompleto && (
                                    <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>Excel: "{row.nombreExcel}"</span>
                                  )}
                                  {row.nroSocio && (
                                    <span style={{ fontSize: '10.5px', color: 'var(--accent)' }}>Nº Socio {row.nroSocio}</span>
                                  )}
                                  {row.sharingSocios && row.sharingSocios.length > 1 && (
                                    <span style={{ 
                                      fontSize: '9.5px', 
                                      color: '#f97316', 
                                      marginTop: '3.5px',
                                      background: 'rgba(249, 115, 22, 0.08)',
                                      border: '1px solid rgba(249, 115, 22, 0.15)',
                                      padding: '2px 6px',
                                      borderRadius: '5px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      fontWeight: '800',
                                      cursor: 'help'
                                    }} title={`CBU Compartido por:\n• ${row.sharingSocios.join('\n• ')}`}>
                                      <AlertTriangle size={10} style={{ flexShrink: 0 }} />
                                      CBU Compartido ({row.sharingSocios.length})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span>{row.cbu || 'S/C'}</span>
                                  {row.cuitDni && <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>ID: {row.cuitDni}</span>}
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>
                                <div>
                                  ${row.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                </div>
                                {(() => {
                                  if (!row.socioId || row.matchStatus === 'EXCEL_REJECT' || row.matchStatus === 'INVALID_AMOUNT') return null;
                                  
                                  let pendingAmount = 0;
                                  if (row.selectedLiquidationId === 'SALDAR_TODO') {
                                    pendingAmount = row.pendingList.reduce((sum, liq) => sum + (Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0)), 0);
                                  } else if (row.selectedLiquidationId) {
                                    const matchedLiq = row.pendingList.find(l => l?.liquidacion_id === parseInt(row.selectedLiquidationId, 10));
                                    pendingAmount = matchedLiq ? (Number(matchedLiq.monto_total_facturado || 0) - Number(matchedLiq.monto_abonado || 0)) : 0;
                                  } else {
                                    return null;
                                  }
                                  
                                  const diff = row.monto - pendingAmount;
                                  if (Math.abs(diff) > 5.0) {
                                    const isExcess = diff > 0;
                                    return (
                                      <div 
                                        style={{ 
                                          fontSize: '9px', 
                                          fontWeight: '800', 
                                          color: isExcess ? '#f97316' : '#3b82f6',
                                          marginTop: '2.5px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                          background: isExcess ? 'rgba(249, 115, 22, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                                          padding: '2px 6px',
                                          borderRadius: '5px',
                                          whiteSpace: 'nowrap'
                                        }}
                                        title={isExcess 
                                          ? `El socio pagó $${row.monto.toLocaleString('es-AR')} pero debe $${pendingAmount.toLocaleString('es-AR')}. Exceso de $${diff.toLocaleString('es-AR')}. Posible cobro duplicado o saldo a favor.`
                                          : `El socio pagó $${row.monto.toLocaleString('es-AR')} pero debe $${pendingAmount.toLocaleString('es-AR')}. Faltan $${Math.abs(diff).toLocaleString('es-AR')}.`
                                        }
                                      >
                                        <AlertTriangle size={10} style={{ flexShrink: 0 }} />
                                        <span>{isExcess ? `Exceso +$${Math.round(diff).toLocaleString('es-AR')}` : `Parcial -$${Math.round(Math.abs(diff)).toLocaleString('es-AR')}`}</span>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </td>
                              <td style={{ width: '240px', minWidth: '240px', maxWidth: '240px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {!row.socioId ? (
                                    <button
                                      type="button"
                                      className="premium-input"
                                      disabled
                                      style={{
                                        width: '160px',
                                        fontSize: '12px',
                                        padding: '4px 8px',
                                        height: '32px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: '8px',
                                        cursor: 'not-allowed',
                                        color: 'var(--text-secondary)'
                                      }}
                                    >
                                      Socio no identificado
                                    </button>
                                  ) : row.pendingList.length === 0 ? (
                                    <button
                                      type="button"
                                      className="premium-input"
                                      disabled
                                      style={{
                                        width: '160px',
                                        fontSize: '12px',
                                        padding: '4px 8px',
                                        height: '32px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: '8px',
                                        cursor: 'not-allowed',
                                        color: 'var(--text-secondary)'
                                      }}
                                    >
                                      Ninguna deuda pendiente
                                    </button>
                                  ) : (() => {
                                     const isDropdownOpen = openDropdownRowId === row.id;
                                     
                                     // Get currently selected liquidation info
                                     const selectedLiq = row.selectedLiquidationId && row.selectedLiquidationId !== 'SALDAR_TODO'
                                       ? row.pendingList?.find(l => l.liquidacion_id === parseInt(row.selectedLiquidationId, 10))
                                       : null;

                                     // Total pending amount for "SALDAR TODO EL GRUPO"
                                     const totalGroupPending = row.pendingList.reduce((sum, liq) => 
                                       sum + (Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0)), 0
                                     );

                                     const selectedLiqs = row.selectedLiquidations || [];
                                     const totalSelectedPending = row.pendingList
                                       .filter(liq => selectedLiqs.includes(liq.liquidacion_id.toString()))
                                       .reduce((sum, liq) => sum + (Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0)), 0);

                                     // Display text of the button
                                     let buttonText = "-- No saldar deuda --";
                                     if (selectedLiqs.length === 0) {
                                       buttonText = "-- No saldar deuda --";
                                     } else if (selectedLiqs.length === row.pendingList.length) {
                                       buttonText = `[SALDAR TODO EL GRUPO] ($${totalGroupPending.toLocaleString('es-AR', { minimumFractionDigits: 0 })})`;
                                     } else if (selectedLiqs.length > 1) {
                                       buttonText = `[${selectedLiqs.length} Facturas] ($${totalSelectedPending.toLocaleString('es-AR', { minimumFractionDigits: 0 })})`;
                                     } else if (selectedLiq) {
                                       const pendingAmount = Number(selectedLiq.monto_total_facturado || 0) - Number(selectedLiq.monto_abonado || 0);
                                       const providerName = selectedLiq.proveedores?.nombre || 'S/P';
                                       
                                       const currentLines = periodConsumos.filter(c => 
                                         c.lineas?.numero_grupo === parseInt(selectedLiq.numero_grupo, 10) &&
                                         c.proveedor_id === selectedLiq.proveedor_id
                                       );
                                       const isAllLinesSelected = selectedLiq && (row.selectedLines || []).length === currentLines.length;

                                       if ((row.selectedLines || []).length > 0 && !isAllLinesSelected) {
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
                                        id={`lote-dropdown-container-${row.id}`}
                                        style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}
                                      >
                                        <div style={{ display: 'flex', gap: '6px', width: '100%', alignItems: 'center' }}>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenDropdownRowId(isDropdownOpen ? null : row.id);
                                            }}
                                            className="premium-input"
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
                                              cursor: 'pointer',
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
                                            <span style={{ fontSize: '9px', marginLeft: '6px', opacity: 0.7, flexShrink: 0 }}>▼</span>
                                          </button>
                                          
                                          <button
                                            type="button"
                                            onClick={() => openBreakdownModal(row.selectedLiquidationId)}
                                            disabled={!row.selectedLiquidationId || row.selectedLiquidationId === 'SALDAR_TODO'}
                                            style={{
                                              width: '32px',
                                              minWidth: '32px',
                                              height: '32px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              background: (row.selectedLiquidationId && row.selectedLiquidationId !== 'SALDAR_TODO') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0, 0, 0, 0.02)',
                                              color: (row.selectedLiquidationId && row.selectedLiquidationId !== 'SALDAR_TODO') ? 'var(--accent)' : 'var(--text-secondary)',
                                              border: '1px solid var(--border-light)',
                                              borderRadius: '8px',
                                              cursor: (row.selectedLiquidationId && row.selectedLiquidationId !== 'SALDAR_TODO') ? 'pointer' : 'not-allowed',
                                              opacity: (row.selectedLiquidationId && row.selectedLiquidationId !== 'SALDAR_TODO') ? 1 : 0.5,
                                              transition: 'all 0.2s',
                                              flexShrink: 0
                                            }}
                                            title="Ver desglose del grupo"
                                          >
                                            <HelpCircle size={14} />
                                          </button>
                                        </div>

                                        {isDropdownOpen && (
                                          <div 
                                            id={`lote-dropdown-panel-${row.id}`}
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
                                            }}
                                          >
                                            <div style={{
                                              paddingBottom: '8px',
                                              borderBottom: '1px solid var(--border-light)',
                                              display: 'flex',
                                              flexDirection: 'column',
                                              gap: '2px'
                                            }}>
                                              <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'left' }}>
                                                Vincular Factura / Líneas
                                              </span>
                                              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'left' }}>
                                                Socio: {row.socioNombreCompleto}
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
                                                  type="checkbox" 
                                                  checked={(row.selectedLiquidations || []).length === 0}
                                                  onChange={() => {
                                                    handleRowLiquidationChange(row.id, '');
                                                  }}
                                                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>-- No saldar deuda --</span>
                                              </label>

                                              {row.pendingList.length > 1 && (
                                                <label style={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '8px',
                                                  padding: '6px 8px',
                                                  borderRadius: '6px',
                                                  cursor: 'pointer',
                                                  fontSize: '11.5px',
                                                  background: row.selectedLiquidationId === 'SALDAR_TODO' && (row.selectedLiquidations || []).length === row.pendingList.length ? 'var(--accent-light)' : 'transparent',
                                                  border: '1px solid ' + (row.selectedLiquidationId === 'SALDAR_TODO' && (row.selectedLiquidations || []).length === row.pendingList.length ? 'var(--border-light)' : 'transparent')
                                                }} className="dropdown-item-hover">
                                                  <input 
                                                    type="checkbox" 
                                                    checked={row.selectedLiquidationId === 'SALDAR_TODO' && (row.selectedLiquidations || []).length === row.pendingList.length}
                                                    onChange={() => {
                                                      handleRowLiquidationChange(row.id, 'SALDAR_TODO');
                                                    }}
                                                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                                  />
                                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', textAlign: 'left' }}>
                                                    [SALDAR TODO EL GRUPO] (${totalGroupPending.toLocaleString('es-AR', { minimumFractionDigits: 0 })})
                                                  </span>
                                                </label>
                                              )}

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
                                                        checked={isLiqSelected}
                                                        onChange={() => {
                                                          handleLoteRowToggleLiquidation(row.id, liq.liquidacion_id.toString());
                                                        }}
                                                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                                      />
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', textAlign: 'left' }}>
                                                          {liq.periodo} - Gpo {liq.numero_grupo} ({providerName})
                                                        </span>
                                                        <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '11px', marginLeft: '6px' }}>
                                                          ${pendingAmount.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
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
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
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

                                        {row.selectedLiquidationId && row.selectedLiquidationId !== 'SALDAR_TODO' && selectedLiq && (() => {
                                          const currentGroup = selectedLiq?.numero_grupo;
                                          const currentLines = periodConsumos.filter(c => 
                                            c.lineas?.numero_grupo === parseInt(currentGroup, 10) &&
                                            c.proveedor_id === selectedLiq?.proveedor_id
                                          );
                                          const selectedSum = (row.selectedLines || []).reduce((sum, lineNum) => {
                                            const line = periodConsumos.find(c => 
                                              c.numero_linea === lineNum && 
                                              c.lineas?.numero_grupo === parseInt(selectedLiq?.numero_grupo, 10) &&
                                              c.proveedor_id === selectedLiq?.proveedor_id
                                            );
                                            return sum + (line ? Number(line.total_linea) : 0);
                                          }, 0);
                                          const diff = Math.abs(selectedSum - Math.abs(row.monto));
                                          const isMatch = diff < 0.05 || 
                                             Math.abs(Number(selectedLiq.monto_total_facturado) - Math.abs(row.monto)) < 2.00 ||
                                             (row.selectedLines.length === currentLines.length && Math.abs(Number(selectedLiq.monto_total_facturado) - Math.abs(row.monto)) < 15.00);
                                          
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
                                                marginTop: '2px',
                                                textAlign: 'left'
                                              }}>
                                                <span>⚠️ Seleccionado: ${selectedSum.toLocaleString('es-AR')} (Transf: ${Math.abs(row.monto).toLocaleString('es-AR')})</span>
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
                              <td style={{ textAlign: 'center' }}>
                                <span style={{ 
                                  fontSize: '10.5px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px',
                                  background: statusBg, color: statusColor, display: 'inline-block',
                                  whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis'
                                }} title={row.reason}>
                                  {row.matchStatus === 'MATCH_DEBT' ? 'Listo' :
                                   row.matchStatus === 'MATCH_NO_DEBT' ? 'Sin Deuda' :
                                   row.matchStatus === 'EXCEL_REJECT' ? 'Rechazado (Ex)' :
                                   row.matchStatus === 'INVALID_AMOUNT' ? 'Monto Inválido' : 'No Encontrado'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Resumen de Totales y Comparación */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '16px', 
                  padding: '16px', 
                  borderRadius: '16px', 
                  background: 'rgba(255,255,255,0.01)',
                  border: '1px solid var(--border-light)'
                }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Monto a Imputar (Excel Seleccionado)</span>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                      ${loteModal.processedRows.filter(r => r.checked).reduce((sum, r) => sum + r.monto, 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Socio Coincidentes Seleccionados</span>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {loteModal.processedRows.filter(r => r.checked && r.socioId).length} / {loteModal.processedRows.length}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Diferencia c/ Extracto</span>
                    {(() => {
                      const excelSum = loteModal.processedRows.filter(r => r.checked).reduce((sum, r) => sum + r.monto, 0);
                      const bankSum = loteModal.row?.netoReal || 0;
                      const diff = Math.round((excelSum - bankSum) * 100) / 100;
                      const isOk = Math.abs(diff) < 0.05;
                      
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 900, color: isOk ? '#10b981' : 'var(--danger)' }}>
                            {diff > 0 ? '+' : ''}{diff.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                          {isOk ? (
                            <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                              Coincide
                            </span>
                          ) : (
                            <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }} title="La suma de débitos seleccionados difiere de la transacción bancaria.">
                              Discrepancia
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Desglose de montos del Excel */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '16px',
                  borderRadius: '16px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border-light)',
                  marginTop: '12px',
                  fontSize: '12px',
                  textAlign: 'left'
                }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Desglose de Montos del Lote Excel:
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '4px' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Total del Excel:</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', marginLeft: '6px' }}>
                        ${stats.totalUpload.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ({stats.countTotal} filas)
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Seleccionados:</span>
                      <span style={{ fontWeight: 700, color: '#10b981', marginLeft: '6px' }}>
                        ${stats.totalChecked.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ({stats.countChecked} filas)
                      </span>
                    </div>
                    {stats.totalRej > 0 && (
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Rechazados en Excel:</span>
                        <span style={{ fontWeight: 700, color: 'var(--danger)', marginLeft: '6px' }}>
                          ${stats.totalRej.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ({stats.countRej} filas)
                        </span>
                      </div>
                    )}
                    {stats.totalNoDebt > 0 && (
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Socios Sin Deuda:</span>
                        <span style={{ fontWeight: 700, color: '#eab308', marginLeft: '6px' }}>
                          ${stats.totalNoDebt.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ({stats.countNoDebt} filas)
                        </span>
                      </div>
                    )}
                    {stats.totalNoFound > 0 && (
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>No Identificados:</span>
                        <span style={{ fontWeight: 700, color: '#a855f7', marginLeft: '6px' }}>
                          ${stats.totalNoFound.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ({stats.countNoFound} filas)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botón Guardar */}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button 
                    onClick={() => {
                      setLoteModal({
                        isOpen: false,
                        row: null,
                        excelRows: [],
                        processedRows: [],
                        columns: [],
                        cbuCol: '',
                        montoCol: '',
                        idCol: '',
                        estadoCol: '',
                        loading: false,
                        fileName: ''
                      });
                    }}
                    className="action-button"
                    style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                    disabled={loteModal.loading}
                  >
                    Limpiar y Cancelar
                  </button>
                  <button 
                    onClick={saveLoteReconciliation}
                    className="action-button"
                    style={{ padding: '0 24px' }}
                    disabled={loteModal.loading || loteModal.processedRows.filter(r => r.checked && r.socioId).length === 0}
                  >
                    {loteModal.loading ? (
                      <>
                        <Loader2 className="animate-spin" size={16} style={{ marginRight: '8px' }} />
                        Registrando lote...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} style={{ marginRight: '8px' }} />
                        Confirmar Conciliación de Lote
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>

      </div>
    </div>
  );
}
