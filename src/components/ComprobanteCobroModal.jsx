import React from 'react';
import Modal from './Modal';
import { Printer, Send, ShieldCheck, User, Calendar, CreditCard, DollarSign, Building } from 'lucide-react';
import { formatMoney } from '../utils/cuentaCorrienteEngine';

export default function ComprobanteCobroModal({ isOpen, onClose, cobroData }) {
  if (!cobroData) return null;

  const {
    reciboNumero = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    fecha = new Date().toISOString().slice(0, 10),
    numero_grupo,
    nombre_titular,
    monto_cobrado,
    medio_pago,
    observaciones,
    desgloses = [],
    saldo_restante = 0
  } = cobroData;

  function handleImprimir() {
    window.print();
  }

  function handleEnviarWhatsApp() {
    let text = `*MUTUAL AUNAR — COMPROBANTE OFICIAL DE COBRO*\n`;
    text += `📄 *Recibo N°:* ${reciboNumero}\n`;
    text += `📅 *Fecha de Cobro:* ${fecha}\n`;
    text += `👤 *Grupo Pagador:* Grupo ${numero_grupo} — ${nombre_titular || 'Socio'}\n`;
    text += `💰 *Monto Total Cobrado:* ${formatMoney(monto_cobrado)}\n`;
    text += `💳 *Medio / Forma de Pago:* ${medio_pago}\n`;
    if (observaciones) text += `📝 *Ref / Obs:* ${observaciones}\n`;
    text += `\n*DETALLE DE IMPUTACIÓN DE CONCEPTOS (FIFO):*\n`;
    desgloses.forEach(d => {
      text += `• ${d.observaciones || 'Factura'} → Capital: ${formatMoney(d.pagoAplicadoCapital)} | Interés Mora: ${formatMoney(d.pagoAplicadoInteres)}\n`;
    });
    text += `\n*Saldo Restante del Grupo:* ${formatMoney(saldo_restante)}\n`;
    text += `\n_Asociación Mutual Aunar • Gracias por mantener su cuenta al día._`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comprobante Oficial de Cobro" maxWidth="680px">
      
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
                Fecha: {fecha}
              </span>
            </div>

          </div>

          {/* Grilla Principal de Datos de Cobro */}
          <div className="print-bg-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '22px', background: 'rgba(255,255,255,0.03)', padding: '18px', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
            
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
                {medio_pago}
              </p>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                {observaciones || 'Cobro imputado en cuenta corriente'}
              </p>
            </div>

          </div>

          {/* Tabla de Imputaciones FIFO */}
          <div style={{ marginBottom: '22px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={16} color="#10b981" /> Detalle de Imputación de Conceptos (FIFO)
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
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{d.observaciones || `Factura ${d.fecha}`}</td>
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

          {/* Resumen Total y Saldo Restante */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '18px', borderTop: '2px solid var(--border-light)' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase' }}>Saldo Restante del Grupo:</span>
              <span className={saldo_restante > 5 ? 'print-text-danger' : 'print-text-accent'} style={{ fontSize: '16px', fontWeight: 900, marginLeft: '8px', color: saldo_restante > 5 ? '#ef4444' : '#10b981' }}>
                {formatMoney(saldo_restante)}
              </span>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>MONTO TOTAL PAGADO</span>
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
