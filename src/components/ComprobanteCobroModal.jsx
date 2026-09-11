import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Printer, Send, ShieldCheck, User, Calendar, CreditCard, DollarSign, Building, Coins, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatMoney, formatFecha } from '../utils/cuentaCorrienteEngine';

function normalizeMedioPago(val) {
  if (!val) return 'EFECTIVO EN MUT';
  const u = String(val).toUpperCase();
  if (u.includes('CREDICOOP')) return 'TRANSFERENCIA A CREDICOOP';
  if (u.includes('NACION') || u.includes('NACIÓN')) return 'TRANSFERENCIA A NACION';
  if (u.includes('TRANSF') || u.includes('BANCO') || u.includes('DEBITO') || u.includes('MERCADO') || u.includes('CHEQUE')) return 'TRANSFERENCIA A NACION';
  if (u.includes('EFECT') || u.includes('MUT') || u.includes('CAJA')) return 'EFECTIVO EN MUT';
  return val;
}

export default function ComprobanteCobroModal({ isOpen, onClose, cobroData }) {
  if (!cobroData) return null;

  const {
    reciboNumero = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    fecha = new Date().toISOString().slice(0, 10),
    numero_grupo,
    nombre_titular,
    monto_cobrado,
    medio_pago = 'EFECTIVO EN MUT',
    observaciones,
    desgloses = [],
    saldo_restante = 0,
    monto_factura,
    efectivo_entregado,
    saldo_favor_cambio = 0,
    bonificacion_redondeo = 0,
    saldo_pendiente_cambio = 0
  } = cobroData;

  const [currentMedioPago, setCurrentMedioPago] = useState(() => normalizeMedioPago(medio_pago));

  useEffect(() => {
    setCurrentMedioPago(normalizeMedioPago(medio_pago));
  }, [medio_pago]);

  function handleImprimir() {
    window.print();
  }

  function handleEnviarWhatsApp() {
    let text = `*MUTUAL AUNAR — COMPROBANTE OFICIAL DE COBRO*\n`;
    text += `📄 *Recibo N°:* ${reciboNumero}\n`;
    text += `📅 *Fecha de Cobro:* ${formatFecha(fecha)}\n`;
    text += `👤 *Grupo Pagador:* Grupo ${numero_grupo} — ${nombre_titular || 'Socio'}\n`;
    text += `💰 *Monto Total Cobrado:* ${formatMoney(monto_cobrado)}\n`;
    text += `💳 *Medio / Forma de Pago:* ${currentMedioPago}\n`;
    if (efectivo_entregado) {
      text += `💵 *Efectivo en Caja:* ${formatMoney(efectivo_entregado)}\n`;
    }
    if (saldo_favor_cambio > 0) {
      text += `🟢 *Saldo a Favor por falta de cambio:* +${formatMoney(saldo_favor_cambio)} (Acreditado a su cuenta corriente)\n`;
    }
    if (bonificacion_redondeo > 0) {
      text += `🔵 *Bonificación por redondeo en caja:* ${formatMoney(bonificacion_redondeo)} (Factura 100% cancelada)\n`;
    }
    if (saldo_pendiente_cambio > 0) {
      text += `🟡 *Saldo pendiente por falta de cambio:* -${formatMoney(saldo_pendiente_cambio)} (A regularizar en próxima factura)\n`;
    }
    if (observaciones) text += `📝 *Ref / Obs:* ${observaciones}\n`;
    text += `\n*DETALLE DE IMPUTACIÓN DE CONCEPTOS:*\n`;
    desgloses.forEach(d => {
      text += `• ${d.observaciones || 'Factura'} → Capital: ${formatMoney(d.pagoAplicadoCapital)} | Interés Mora: ${formatMoney(d.pagoAplicadoInteres)}\n`;
    });
    text += `\n_Asociación Mutual Aunar • Gracias por mantener su cuenta al día._`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comprobante Oficial de Cobro" maxWidth="720px">
      
      {/* CSS para Garantizar Impresión Limpia de Página Completa A4 sin recortes */}
      <style>{`
        @media print {
          /* Ocultar todo el sitio por defecto */
          body * {
            visibility: hidden !important;
          }

          /* Hacer visible solo el recibo y sus elementos */
          #print-recibo-wrapper,
          #print-recibo-wrapper * {
            visibility: visible !important;
          }

          /* Resetear contenedores del Modal durante la impresión */
          .modal-backdrop, .modal-container, .modal-content, #print-recibo-wrapper {
            position: static !important;
            background: #ffffff !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
            width: 100% !important;
            display: block !important;
          }

          /* Ocultar controles de UI que no van a papel */
          .no-print, button, .modal-header, .modal-footer, [role="dialog"] > div:first-child {
            display: none !important;
          }

          /* Posicionar el recibo ocupando la hoja A4 */
          #print-recibo {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            background: #ffffff !important;
            color: #000000 !important;
            border: 2px solid #10b981 !important;
            border-radius: 12px !important;
            box-sizing: border-box !important;
          }

          /* Forzar colores de alto contraste en papel impreso */
          #print-recibo h2, #print-recibo h3, #print-recibo h4, #print-recibo p, #print-recibo td, #print-recibo th, #print-recibo span, #print-recibo div {
            color: #000000 !important;
          }
          #print-recibo .print-text-accent {
            color: #10b981 !important;
          }
          #print-recibo .print-text-danger {
            color: #ef4444 !important;
          }
          #print-recibo .print-bg-card {
            background: #f8fafc !important;
            border: 1px solid #cbd5e1 !important;
          }
          #print-recibo .print-table-header {
            background: #e2e8f0 !important;
          }

          @page {
            size: A4 portrait;
            margin: 12mm;
          }
        }
      `}</style>

      {/* Barra superior Interactiva (Solo en Pantalla, Oculta al Imprimir) */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CreditCard size={16} color="#10b981" />
          <span style={{ fontSize: '13px', fontWeight: 800 }}>Forma de Pago del Recibo:</span>
          <select 
            value={currentMedioPago} 
            onChange={(e) => setCurrentMedioPago(e.target.value)}
            className="form-input"
            style={{ padding: '4px 10px', height: '34px', fontSize: '12px', fontWeight: 800, width: 'auto', background: 'var(--surface)' }}
          >
            <option value="EFECTIVO EN MUT">EFECTIVO EN MUT</option>
            <option value="TRANSFERENCIA A NACION">TRANSFERENCIA A NACION</option>
            <option value="TRANSFERENCIA A CREDICOOP">TRANSFERENCIA A CREDICOOP</option>
          </select>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Printer size={13} /> Listo para imprimir en A4
        </div>
      </div>

      {/* Wrapper imprimible */}
      <div id="print-recibo-wrapper">
        <div id="print-recibo" style={{ background: 'var(--surface)', padding: '28px', borderRadius: '18px', border: '1px solid var(--border-light)' }}>
          
          {/* Header con LOGO OFICIAL AUNAR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-light)', paddingBottom: '18px', marginBottom: '22px' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <img 
                src="/logo.png" 
                alt="Logo Mutual Aunar" 
                style={{ height: '56px', objectFit: 'contain' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  MUTUAL AUNAR
                </h2>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Asociación Mutual • Comprobante Oficial de Cobro
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right', background: 'rgba(16,185,129,0.08)', padding: '10px 18px', borderRadius: '14px', border: '1px solid rgba(16,185,129,0.25)' }}>
              <span className="print-text-accent" style={{ fontSize: '16px', fontWeight: 900, color: '#10b981', display: 'block' }}>
                {reciboNumero}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)' }}>
                Fecha: {formatFecha(fecha)}
              </span>
            </div>

          </div>

          {/* Grilla Principal de Datos de Cobro */}
          <div className="print-bg-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px', background: 'rgba(255,255,255,0.03)', padding: '18px', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
            
            {/* Persona Pagadora y Grupo */}
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <User size={12} color="#10b981" /> Persona Pagadora / Grupo
              </span>
              <p style={{ fontSize: '18px', fontWeight: 900, margin: '4px 0 0 0', color: 'var(--text-primary)' }}>
                Grupo N° {numero_grupo}
              </p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                {nombre_titular || 'Titular sin especificar'}
              </p>
            </div>

            {/* Medio de Pago y Detalles */}
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CreditCard size={12} color="#10b981" /> Forma / Medio de Pago
              </span>
              <p className="print-text-accent" style={{ fontSize: '18px', fontWeight: 900, margin: '4px 0 0 0', color: '#10b981' }}>
                {currentMedioPago}
              </p>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                {observaciones || 'Cobro imputado en cuenta corriente'}
              </p>
            </div>

          </div>

          {/* TARJETAS ESPECIALES DE CAJA: SALDO A FAVOR / BONIFICACIÓN / SALDO PENDIENTE POR FALTA DE CAMBIO */}
          {saldo_favor_cambio > 0 && (
            <div className="print-bg-card" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1.5px solid rgba(16, 185, 129, 0.35)', borderRadius: '12px', padding: '12px 16px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} color="#10b981" /> Saldo a Favor por Falta de Cambio en Oficina
                </span>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#10b981' }}>
                  +{formatMoney(saldo_favor_cambio)}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                {efectivo_entregado ? `Efectivo recibido en caja: ${formatMoney(efectivo_entregado)}. ` : ''}
                La diferencia a favor queda acreditada en la cuenta corriente del grupo para descontarse automáticamente en su próxima liquidación mensual.
              </p>
            </div>
          )}

          {bonificacion_redondeo > 0 && (
            <div className="print-bg-card" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1.5px solid rgba(59, 130, 246, 0.35)', borderRadius: '12px', padding: '12px 16px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Coins size={16} color="#3b82f6" /> Bonificación por Redondeo de Cambio en Caja
                </span>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#3b82f6' }}>
                  {formatMoney(bonificacion_redondeo)}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                {efectivo_entregado ? `Efectivo recibido en caja: ${formatMoney(efectivo_entregado)}. ` : ''}
                Diferencia absorbida por Mutual Aunar por falta de cambio chico en ventanilla. Factura 100% CANCELADA sin deuda remanente.
              </p>
            </div>
          )}

          {saldo_pendiente_cambio > 0 && (
            <div className="print-bg-card" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1.5px solid rgba(245, 158, 11, 0.35)', borderRadius: '12px', padding: '12px 16px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={16} color="#f59e0b" /> Saldo Pendiente por Falta de Cambio
                </span>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#f59e0b' }}>
                  -{formatMoney(saldo_pendiente_cambio)}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                {efectivo_entregado ? `Efectivo recibido a cuenta: ${formatMoney(efectivo_entregado)}. ` : ''}
                El saldo remanente queda pendiente en la cuenta corriente del grupo para regularizarse en la próxima factura mensual.
              </p>
            </div>
          )}

          {/* Tabla de Imputaciones FIFO */}
          <div style={{ marginBottom: '22px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={16} color="#10b981" /> Detalle de Imputación de Conceptos
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr className="print-table-header" style={{ background: 'rgba(0,0,0,0.05)', borderBottom: '2px solid var(--border-light)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800 }}>Concepto / Período</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>Interés Mora</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>Capital</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>Total Aplicado</th>
                </tr>
              </thead>
              <tbody>
                {desgloses.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '14px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Pago asignado libremente como saldo a favor en cuenta corriente.
                    </td>
                  </tr>
                ) : (
                  desgloses.map((d, idx) => {
                    const subtotal = Number(d.pagoAplicadoCapital || 0) + Number(d.pagoAplicadoInteres || 0);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{d.observaciones || `Factura ${d.fecha || ''}`}</td>
                        <td className="print-text-danger" style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{formatMoney(d.pagoAplicadoInteres)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(d.pagoAplicadoCapital)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: 'var(--text-primary)' }}>{formatMoney(subtotal)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Resumen Total Cobrado */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '18px', borderTop: '2px solid var(--border-light)' }}>
            <div>
              {efectivo_entregado && (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                  Efectivo entregado en mano: <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(efectivo_entregado)}</strong>
                </div>
              )}
              {monto_factura && monto_factura !== monto_cobrado && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Total factura adeudada: {formatMoney(monto_factura)}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>
                MONTO TOTAL IMPUTADO
              </span>
              <span className="print-text-accent" style={{ fontSize: '26px', fontWeight: 900, color: '#10b981' }}>
                {formatMoney(monto_cobrado)}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* Botones de Acción (Ignorados en la impresión) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', gap: '12px' }}>
        <button onClick={onClose} className="action-button" style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', width: '30%' }}>
          Cerrar
        </button>

        <div style={{ display: 'flex', gap: '10px', width: '70%', justifyContent: 'flex-end' }}>
          <button onClick={handleEnviarWhatsApp} className="icon-button-edit" style={{ padding: '0 18px', height: '42px', borderRadius: '12px', gap: '8px', fontSize: '13px', background: '#25D366', color: 'white', border: 'none', fontWeight: 800 }}>
            <Send size={16} /> WhatsApp
          </button>
          <button onClick={handleImprimir} className="action-button" style={{ padding: '0 22px', height: '42px', borderRadius: '12px', gap: '8px', fontSize: '13px', fontWeight: 800 }}>
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      </div>

    </Modal>
  );
}
