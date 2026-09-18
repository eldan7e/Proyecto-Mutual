import React from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  CreditCard, 
  FileText, 
  Building2, 
  User, 
  ExternalLink, 
  Loader2, 
  Info, 
  ShieldCheck, 
  Hash, 
  ArrowRight
} from 'lucide-react';
import Modal from '../Modal';
import { formatUTCDate as formatISODateToAR } from '../../utils/formatters';

export default function DetallePagoModal({ 
  isOpen, 
  onClose, 
  data, 
  setActiveTab 
}) {
  if (!isOpen) return null;

  const {
    loading = false,
    row = null,
    liquidaciones = [],
    pagosCuenta = [],
    pagosBanco = [],
    error = null
  } = data || {};

  // Formateador de moneda
  const formatMoney = (val) => {
    const num = Math.abs(Number(val) || 0);
    return `$${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Formatear timestamp completo
  const formatDateTime = (ts) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return `${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return ts;
    }
  };

  const totalFacturado = liquidaciones.reduce((sum, l) => sum + Number(l.monto_total_facturado || 0), 0);
  const totalAbonado = liquidaciones.reduce((sum, l) => sum + Number(l.monto_abonado || 0), 0);
  const saldoPendiente = Math.max(0, totalFacturado - totalAbonado);

  const transferMonto = row ? Math.abs(Number(row.netoReal || row.monto || 0)) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verificación de Pago Conciliado"
      maxWidth="680px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        
        {/* Banner de Estado */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '14px 16px',
          borderRadius: '12px',
          background: saldoPendiente <= 2 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
          border: `1px solid ${saldoPendiente <= 2 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`
        }}>
          <div style={{
            color: saldoPendiente <= 2 ? '#10b981' : '#f59e0b',
            background: saldoPendiente <= 2 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            padding: '8px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {saldoPendiente <= 2 ? <ShieldCheck size={22} /> : <AlertCircle size={22} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ 
              fontWeight: 800, 
              fontSize: '14px', 
              color: saldoPendiente <= 2 ? '#10b981' : '#d97706' 
            }}>
              {saldoPendiente <= 2 
                ? 'Liquidación ya saldada e imputada en Base de Datos' 
                : 'Liquidación con pago parcial registrado'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Esta deuda ya cuenta con movimientos de cobro registrados. No es necesario volver a conciliarla, a menos que se trate de un pago diferente o se requiera anular el movimiento previo.
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
            <Loader2 className="animate-spin" size={28} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Buscando movimientos del pago en base de datos...</span>
          </div>
        ) : error ? (
          <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' }}>
            {error}
          </div>
        ) : (
          <>
            {/* Detalle de la Liquidación Facturada */}
            <div style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--border-light)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                  Datos de la Liquidación / Factura
                </span>
                {liquidaciones.length > 0 && (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: liquidaciones[0]?.estado_pago === 'ABONADO' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                    color: liquidaciones[0]?.estado_pago === 'ABONADO' ? '#10b981' : '#f59e0b'
                  }}>
                    {liquidaciones[0]?.estado_pago || 'REGISTRADO'}
                  </span>
                )}
              </div>

              {liquidaciones.map((liq, idx) => (
                <div key={liq.liquidacion_id || idx} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Período / Grupo</span>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      {liq.periodo} - Gpo {liq.numero_grupo}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Titular / Proveedor</span>
                    <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {liq.socios?.nombre_completo || row?.selectedSocioLabel || 'S/D'} ({liq.proveedores?.nombre || 'S/P'})
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Facturado Total</span>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      {formatMoney(liq.monto_total_facturado)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Abonado en BD</span>
                    <div style={{ fontWeight: 900, fontSize: '13px', color: '#10b981', marginTop: '2px' }}>
                      {formatMoney(liq.monto_abonado)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Comparación con la Transferencia del Extracto (si viene de una fila bancaria) */}
            {row && transferMonto && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px dashed rgba(59, 130, 246, 0.25)',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Info size={16} style={{ color: '#3b82f6', flexShrink: 0 }} />
                  <span>
                    Fila del extracto bancario: <strong>{row.titular || row.concepto}</strong> ({row.banco || 'BANCO'})
                  </span>
                </div>
                <div style={{ fontWeight: 800, color: '#3b82f6', fontSize: '13px', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                  {formatMoney(transferMonto)}
                </div>
              </div>
            )}

            {/* Sección de Movimientos de Pago Encontrados */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Movimientos que Imputaron este Pago ({pagosCuenta.length + pagosBanco.length})
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Registro histórico en Cuenta Corriente y Conciliación
                </span>
              </div>

              {pagosCuenta.length === 0 && pagosBanco.length === 0 ? (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: 'var(--surface)',
                  borderRadius: '12px',
                  border: '1px dashed var(--border-light)',
                  color: 'var(--text-secondary)',
                  fontSize: '12.5px'
                }}>
                  No se encontraron registros de cobro automáticos con este número de liquidación.
                  <br />
                  <span style={{ fontSize: '11.5px', marginTop: '4px', display: 'inline-block' }}>
                    (Es posible que el saldo haya sido asentado manualmente o mediante un ajuste previo de cuenta corriente).
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  
                  {/* Pagos en Cuenta Corriente (Contaduría / Cobros) */}
                  {pagosCuenta.map((pago) => (
                    <div 
                      key={`mc-${pago.id}`}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: 'rgba(99, 102, 241, 0.12)',
                            color: '#6366f1',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <CreditCard size={11} />
                            Cuenta Corriente #{pago.id}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatISODateToAR(pago.fecha)}
                          </span>
                        </div>
                        <span style={{ fontWeight: 900, color: '#10b981', fontSize: '14px' }}>
                          -{formatMoney(pago.importe)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {pago.observaciones || 'Cobro imputado a la cuenta corriente del grupo'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {pago.medio_pago && (
                            <span><strong>Medio:</strong> {pago.medio_pago}</span>
                          )}
                          {pago.periodo && (
                            <span><strong>Período:</strong> {pago.periodo}</span>
                          )}
                          {pago.created_at && (
                            <span><strong>Asentado:</strong> {formatDateTime(pago.created_at)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Pagos en Movimientos Bancarios (Extractos conciliados) */}
                  {pagosBanco.map((pago) => (
                    <div 
                      key={`mb-${pago.movimiento_id}`}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#10b981',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Building2 size={11} />
                            Conciliación Bancaria #{pago.movimiento_id}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatISODateToAR(pago.fecha_movimiento)}
                          </span>
                        </div>
                        <span style={{ fontWeight: 900, color: '#10b981', fontSize: '14px' }}>
                          +{formatMoney(pago.monto)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {pago.concepto || pago.observaciones || 'Transferencia Bancaria Conciliada'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {pago.banco && (
                            <span><strong>Banco:</strong> {pago.banco}</span>
                          )}
                          {pago.comprobante && (
                            <span><strong>Comprobante:</strong> {pago.comprobante}</span>
                          )}
                          {pago.socios?.nombre_completo && (
                            <span><strong>Socio:</strong> {pago.socios.nombre_completo}</span>
                          )}
                          {pago.created_at && (
                            <span><strong>Asentado:</strong> {formatDateTime(pago.created_at)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                </div>
              )}
            </div>
          </>
        )}

        {/* Footer Actions */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          paddingTop: '14px',
          borderTop: '1px solid var(--border-light)',
          marginTop: '4px'
        }}>
          {setActiveTab && (
            <button
              type="button"
              onClick={() => {
                onClose();
                setActiveTab('historial');
              }}
              className="air-btn"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                background: 'rgba(0,0,0,0.03)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-light)'
              }}
            >
              Ver en Historial <ExternalLink size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="action-button"
            style={{
              padding: '8px 24px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Entendido
          </button>
        </div>

      </div>
    </Modal>
  );
}
