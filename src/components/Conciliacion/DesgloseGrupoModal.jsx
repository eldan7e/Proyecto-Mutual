import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import Modal from '../Modal';

export default function DesgloseGrupoModal({ breakdownModal, setBreakdownModal, formatISODateToAR, conciliarFila }) {
  const [selectedLines, setSelectedLines] = useState([]);

  // Precalculate allocated payments for each member's line
  const allocatedPaymentsByMemberIndex = {};
  const paymentsSumBySocio = {};

  if (breakdownModal.groupInfo && breakdownModal.members && breakdownModal.payments) {
    const explicitAllocations = {}; // { numero_linea: allocatedAmount }
    const generalPaymentsSumBySocio = {};

    // 1. Process payments (split into explicit line payments and general waterfall payments)
    breakdownModal.payments.forEach(p => {
      const socioId = p.socio_id;
      if (!socioId) return;

      paymentsSumBySocio[socioId] = (paymentsSumBySocio[socioId] || 0) + Number(p.monto);

      // Check if concept specifies line numbers (e.g. "... | Líneas: 2215312861, 2215628241")
      const linesMatch = p.concepto?.match(/\|\s*Líneas:\s*([\d\s,]+)/i);
      if (linesMatch) {
        const lineNums = linesMatch[1].split(',').map(num => num.trim()).filter(Boolean);
        
        // Find these lines for this socio
        const socioLines = breakdownModal.members
          .filter(m => m.lineas?.socio_id === socioId && lineNums.includes(m.numero_linea));
        
        // Sort lines by total_linea ascending
        socioLines.sort((a, b) => Number(a.total_linea) - Number(b.total_linea));
        
        let remaining = Number(p.monto);
        socioLines.forEach(item => {
          const cost = Number(item.total_linea);
          let allocated = 0;
          if (remaining >= cost - 0.05) {
            allocated = cost;
            remaining = Math.max(0, Math.round((remaining - cost) * 100) / 100);
          } else if (remaining > 0) {
            allocated = remaining;
            remaining = 0;
          }
          explicitAllocations[item.numero_linea] = (explicitAllocations[item.numero_linea] || 0) + allocated;
        });
      } else {
        generalPaymentsSumBySocio[socioId] = (generalPaymentsSumBySocio[socioId] || 0) + Number(p.monto);
      }
    });

    // 2. Group members (lines) by socio_id, and subtract any explicitly allocated amounts
    const membersBySocio = {};
    breakdownModal.members.forEach((m, index) => {
      const socioId = m.lineas?.socio_id;
      if (socioId) {
        if (!membersBySocio[socioId]) {
          membersBySocio[socioId] = [];
        }
        
        const explicitPaid = explicitAllocations[m.numero_linea] || 0;
        const remainingCost = Math.max(0, Math.round((Number(m.total_linea) - explicitPaid) * 100) / 100);
        
        membersBySocio[socioId].push({ 
          member: m, 
          originalIndex: index, 
          explicitPaid, 
          remainingCost 
        });
      }
    });

    // 3. Distribute general payments waterfall-style across remaining costs
    Object.keys(membersBySocio).forEach(socioIdStr => {
      const socioId = parseInt(socioIdStr, 10);
      const socioLines = membersBySocio[socioId];
      
      // Sort lines by remainingCost ascending
      socioLines.sort((a, b) => a.remainingCost - b.remainingCost);
      
      let remainingGeneralPayment = generalPaymentsSumBySocio[socioId] || 0;
      
      socioLines.forEach(item => {
        const lineCost = item.remainingCost;
        let allocated = 0;
        
        if (remainingGeneralPayment >= lineCost - 0.05) {
          allocated = lineCost;
          remainingGeneralPayment = Math.max(0, Math.round((remainingGeneralPayment - lineCost) * 100) / 100);
        } else if (remainingGeneralPayment > 0) {
          allocated = remainingGeneralPayment;
          remainingGeneralPayment = 0;
        }
        
        allocatedPaymentsByMemberIndex[item.originalIndex] = item.explicitPaid + allocated;
      });
    });
  }

  // Initialize checked lines using a simulated waterfall for the pending payment
  useEffect(() => {
    if (breakdownModal.pendingRow && breakdownModal.members) {
      const socioId = parseInt(breakdownModal.pendingRow.selectedSocioId, 10);
      if (!socioId) {
        setSelectedLines([]);
        return;
      }
      
      const socioLines = breakdownModal.members
        .filter(m => m.lineas?.socio_id === socioId);
      
      // Sort lines by total_linea ascending
      const sorted = [...socioLines].sort((a, b) => Number(a.total_linea) - Number(b.total_linea));
      
      let remaining = Math.abs(breakdownModal.pendingRow.netoReal);
      const defaults = [];
      
      sorted.forEach(item => {
        const cost = Number(item.total_linea);
        if (remaining >= cost - 0.05) {
          defaults.push(item.numero_linea);
          remaining = Math.round((remaining - cost) * 100) / 100;
        } else if (remaining > 0) {
          defaults.push(item.numero_linea);
          remaining = 0;
        }
      });
      
      setSelectedLines(defaults);
    } else {
      setSelectedLines([]);
    }
  }, [breakdownModal.pendingRow, breakdownModal.members]);

  const selectedSum = useMemo(() => {
    if (!breakdownModal.members) return 0;
    return breakdownModal.members
      .filter(m => selectedLines.includes(m.numero_linea))
      .reduce((sum, m) => sum + Number(m.total_linea), 0);
  }, [selectedLines, breakdownModal.members]);

  const pendingAmount = breakdownModal.pendingRow ? Math.abs(breakdownModal.pendingRow.netoReal) : 0;
  const isMatch = Math.abs(selectedSum - pendingAmount) < 0.05;

  const handleConciliarConLineas = async () => {
    if (!breakdownModal.pendingRow) return;
    
    // Call conciliarFila from props with custom checked lines
    await conciliarFila(breakdownModal.pendingRow.id, false, selectedLines);
    
    // Close modal
    setBreakdownModal(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <Modal
      isOpen={breakdownModal.isOpen}
      onClose={() => setBreakdownModal(prev => ({ ...prev, isOpen: false }))}
      title={breakdownModal.groupInfo ? `Desglose de Liquidación - Grupo ${breakdownModal.groupInfo.numero_grupo}` : "Desglose de Liquidación"}
      maxWidth="750px"
    >
      {breakdownModal.loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
          <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Cargando datos del grupo...</span>
        </div>
      ) : breakdownModal.groupInfo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Tarjeta de Resumen */}
          <div className="glass-panel-sub" style={{ 
            padding: '16px 20px', 
            borderRadius: '16px', 
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 700 }}>Periodo y Proveedor</span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {breakdownModal.groupInfo.periodo} — {breakdownModal.groupInfo.proveedores?.nombre || 'Proveedor Desconocido'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 700 }}>Estado General del Grupo</span>
                <div style={{ marginTop: '2px' }}>
                  <span style={{ 
                    fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '8px',
                    background: breakdownModal.groupInfo.estado_pago === 'ABONADO' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: breakdownModal.groupInfo.estado_pago === 'ABONADO' ? '#10b981' : '#ef4444'
                  }}>
                    {breakdownModal.groupInfo.estado_pago === 'ABONADO' ? 'TOTALMENTE SALDADO' : 'PENDIENTE DE PAGO'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Facturado Total (Grupo)</span>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                  ${Number(breakdownModal.groupInfo.monto_total_facturado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Abonado Total (Grupo)</span>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#10b981', marginTop: '2px' }}>
                  ${Number(breakdownModal.groupInfo.monto_abonado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Saldo Restante</span>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#ef4444', marginTop: '2px' }}>
                  ${Math.max(0, Number(breakdownModal.groupInfo.monto_total_facturado) - Number(breakdownModal.groupInfo.monto_abonado || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Barra de progreso */}
            <div style={{ marginTop: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <span>Progreso de Pago del Grupo</span>
                <span>
                  {Math.min(100, Math.round(((breakdownModal.groupInfo.monto_abonado || 0) / breakdownModal.groupInfo.monto_total_facturado) * 100))}%
                </span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.min(100, ((breakdownModal.groupInfo.monto_abonado || 0) / breakdownModal.groupInfo.monto_total_facturado) * 100)}%`, 
                  height: '100%', 
                  background: breakdownModal.groupInfo.estado_pago === 'ABONADO' ? 'var(--accent)' : 'linear-gradient(90deg, #3b82f6, #10b981)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          </div>

          {/* Listado de Integrantes */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '10px', color: 'var(--text-primary)' }}>Desglose por Integrante</h4>
            <div className="premium-table-container" style={{ border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
              <table className="premium-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    {breakdownModal.pendingRow && <th style={{ width: '50px', textAlign: 'center' }}>Pagar</th>}
                    <th>Integrante</th>
                    <th>Línea</th>
                    <th style={{ textAlign: 'right' }}>Monto Línea</th>
                    <th style={{ textAlign: 'right' }}>Pagos Registrados</th>
                    <th style={{ textAlign: 'center' }}>Estado Individual</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownModal.members.length === 0 ? (
                    <tr>
                      <td colSpan={breakdownModal.pendingRow ? 6 : 5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>
                        No hay líneas asociadas a este grupo en este periodo
                      </td>
                    </tr>
                  ) : (
                    <>
                      {breakdownModal.members.map((m, idx) => {
                        const socioInfo = m.lineas?.socios;
                        const socioId = m.lineas?.socio_id;
                        
                        // Get sum of payments and allocated payment for this specific line
                        const socioPaymentsSum = paymentsSumBySocio[socioId] || 0;
                        const allocatedPayment = allocatedPaymentsByMemberIndex[idx] || 0;
                        const lineCost = Number(m.total_linea);

                        const isGroupPaid = breakdownModal.groupInfo.estado_pago === 'ABONADO';
                        const isIndivPaid = allocatedPayment >= lineCost - 0.05;
                        const hasPartialPay = allocatedPayment > 0 && allocatedPayment < lineCost - 0.05;

                        let statusLabel = 'PENDIENTE';
                        let statusColor = '#ef4444';
                        let statusBg = 'rgba(239, 68, 68, 0.1)';

                        if (isGroupPaid) {
                          statusLabel = 'PAGADO (Grupo)';
                          statusColor = '#10b981';
                          statusBg = 'rgba(16, 185, 129, 0.1)';
                        } else if (isIndivPaid) {
                          statusLabel = 'PAGADO (Indiv)';
                          statusColor = '#10b981';
                          statusBg = 'rgba(16, 185, 129, 0.1)';
                        } else if (hasPartialPay) {
                          statusLabel = 'PARCIAL';
                          statusColor = '#f59e0b';
                          statusBg = 'rgba(245, 158, 11, 0.1)';
                        }

                        const pendingSocioId = breakdownModal.pendingRow ? parseInt(breakdownModal.pendingRow.selectedSocioId, 10) : null;
                        const isPendingSocio = socioId === pendingSocioId;

                        return (
                          <tr key={idx} className="table-row-hover">
                            {breakdownModal.pendingRow && (
                              <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedLines.includes(m.numero_linea)}
                                  disabled={!isPendingSocio}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedLines(prev => [...prev, m.numero_linea]);
                                    } else {
                                      setSelectedLines(prev => prev.filter(num => num !== m.numero_linea));
                                    }
                                  }}
                                  style={{ 
                                    width: '16px', 
                                    height: '16px', 
                                    cursor: isPendingSocio ? 'pointer' : 'not-allowed',
                                    accentColor: 'var(--accent)'
                                  }}
                                />
                              </td>
                            )}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{socioInfo?.nombre_completo || 'Socio Desconocido'}</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    Socio Nº {socioInfo?.nro_socio || 'N/A'} (ID: {socioId || 'N/A'})
                                  </span>
                                  {socioPaymentsSum > 0 && (
                                    <span style={{ fontSize: '10.5px', color: '#10b981', fontWeight: 700 }}>
                                      Total Recibido: ${socioPaymentsSum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 600 }}>
                                {m.numero_linea}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                              ${lineCost.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: allocatedPayment > 0 ? '#10b981' : 'var(--text-secondary)' }}>
                              {allocatedPayment > 0 ? (
                                `+$${allocatedPayment.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                              ) : (
                                '$0,00'
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ 
                                fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px',
                                background: statusBg, color: statusColor, display: 'inline-block'
                              }}>
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {breakdownModal.groupInfo.socios?.fpago === 'D' && (
                        <tr className="table-row-hover">
                          {breakdownModal.pendingRow && <td></td>}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600 }}>Costo Débito Automático</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Cargo Administrativo Fijo</span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>—</span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            $12,12
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            —
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ 
                              fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px',
                              background: breakdownModal.groupInfo.estado_pago === 'ABONADO' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: breakdownModal.groupInfo.estado_pago === 'ABONADO' ? '#10b981' : '#ef4444',
                              display: 'inline-block'
                            }}>
                              {breakdownModal.groupInfo.estado_pago === 'ABONADO' ? 'PAGADO (Grupo)' : 'PENDIENTE'}
                            </span>
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Listado de Transferencias Conciliadas */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '10px', color: 'var(--text-primary)' }}>
              Transferencias Bancarias Conciliadas
            </h4>
            {breakdownModal.payments.length === 0 ? (
              <div style={{ 
                padding: '16px', 
                textAlign: 'center', 
                color: 'var(--text-secondary)',
                border: '1px dashed var(--border-light)',
                borderRadius: '12px',
                fontSize: '12.5px'
              }}>
                No se registran transferencias conciliadas para esta liquidación
              </div>
            ) : (
              <div className="premium-table-container" style={{ border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
                <table className="premium-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Concepto / Transferente</th>
                      <th style={{ textAlign: 'right' }}>Importe Recibido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownModal.payments.map((p, pIdx) => (
                      <tr key={pIdx} className="table-row-hover">
                        <td style={{ fontSize: '12.5px' }}>{formatISODateToAR(p.fecha_movimiento)}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, fontSize: '12.5px' }}>Pago registrado por: {p.socios?.nombre_completo || 'N/A'}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ID Mov: {p.movimiento_id}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#10b981', fontSize: '13px' }}>
                          +${Number(p.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer de Acciones del Modal en Conciliación */}
          {breakdownModal.pendingRow && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px',
              marginTop: '10px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-light)'
            }}>
              {!isMatch && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  background: 'rgba(245, 158, 11, 0.08)', 
                  border: '1px solid rgba(245, 158, 11, 0.2)', 
                  borderRadius: '12px', 
                  padding: '12px 16px',
                  color: '#d97706',
                  fontSize: '12.5px'
                }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <span>
                    El total seleccionado (<strong>${selectedSum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>) 
                    difiere del monto de la transferencia (<strong>${pendingAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>).
                  </span>
                </div>
              )}
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  className="action-button"
                  style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                  onClick={() => setBreakdownModal(prev => ({ ...prev, isOpen: false }))}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="action-button"
                  onClick={handleConciliarConLineas}
                  disabled={selectedLines.length === 0}
                >
                  Conciliar con Líneas Seleccionadas ({selectedLines.length}) — Total: ${selectedSum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </button>
              </div>
            </div>
          )}

        </div>
      ) : null}
    </Modal>
  );
}
