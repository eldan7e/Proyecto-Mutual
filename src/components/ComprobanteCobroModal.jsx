import React, { useRef } from 'react';
import Modal from './Modal';
import { Printer, Send, CheckCircle2, Building, Calendar, DollarSign, FileText } from 'lucide-react';
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
    let text = `*MUTUAL AUNAR — COMPROBANTE DE PAGO*\n`;
    text += `📄 *Recibo N°:* ${reciboNumero}\n`;
    text += `📅 *Fecha:* ${fecha}\n`;
    text += `👤 *Grupo ${numero_grupo}:* ${nombre_titular || 'Socio'}\n`;
    text += `💰 *Monto Cobrado:* ${formatMoney(monto_cobrado)}\n`;
    text += `💳 *Medio:* ${medio_pago} (${observaciones || 'Sin ref'})\n\n`;
    text += `*DETALLE DE IMPUTACIÓN (FIFO):*\n`;
    desgloses.forEach(d => {
      text += `• ${d.observaciones || 'Factura'} → Capital: ${formatMoney(d.pagoAplicadoCapital)} | Interés Mora: ${formatMoney(d.pagoAplicadoInteres)}\n`;
    });
    text += `\n*Saldo Restante en Cuenta:* ${formatMoney(saldo_restante)}\n`;
    text += `\n_Gracias por mantener su cuenta al día en Mutual Aunar._`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comprobante Oficial de Cobro" maxWidth="640px">
      
      {/* Contenido imprimible */}
      <div id="print-recibo" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
        
        {/* Header Comprobante */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--border-light)', paddingBottom: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', background: 'var(--accent)', color: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '18px' }}>
              MA
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>MUTUAL AUNAR</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Asociación Mutual • Comprobante de Cobro</p>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--accent)', display: 'block' }}>
              {reciboNumero}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Fecha: {fecha}
            </span>
          </div>
        </div>

        {/* Datos del Grupo Pagador */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Grupo Pagador</span>
            <p style={{ fontSize: '15px', fontWeight: 800, margin: '2px 0 0 0', color: 'var(--text-primary)' }}>
              Grupo N° {numero_grupo}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              {nombre_titular}
            </p>
          </div>

          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Forma de Cobro</span>
            <p style={{ fontSize: '15px', fontWeight: 800, margin: '2px 0 0 0', color: '#10b981' }}>
              {medio_pago}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              {observaciones || 'Cobro imputado en cuenta corriente'}
            </p>
          </div>
        </div>

        {/* Tabla de Imputaciones FIFO */}
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: 'var(--text-primary)' }}>
            Detalle de Imputación de Conceptos (FIFO)
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.04)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Concepto</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Interés Mora</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Capital</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Total Aplicado</th>
              </tr>
            </thead>
            <tbody>
              {desgloses.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Pago libre aplicado a saldo general de la cuenta corriente.
                  </td>
                </tr>
              ) : (
                desgloses.map((d, idx) => {
                  const subtotal = Number(d.pagoAplicadoCapital || 0) + Number(d.pagoAplicadoInteres || 0);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{d.observaciones || `Factura ${d.fecha}`}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444' }}>{formatMoney(d.pagoAplicadoInteres)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatMoney(d.pagoAplicadoCapital)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>{formatMoney(subtotal)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Resumen Total & Saldo Restante */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', borderTop: '2px solid var(--border-light)' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Saldo Restante del Grupo:</span>
            <span style={{ fontSize: '14px', fontWeight: 800, marginLeft: '6px', color: saldo_restante > 5 ? '#ef4444' : '#10b981' }}>
              {formatMoney(saldo_restante)}
            </span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block' }}>TOTAL PAGADO</span>
            <span style={{ fontSize: '22px', fontWeight: 900, color: '#10b981' }}>
              {formatMoney(monto_cobrado)}
            </span>
          </div>
        </div>

      </div>

      {/* Botones de acción */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', gap: '12px' }}>
        <button onClick={onClose} className="action-button" style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', width: '30%' }}>
          Cerrar
        </button>

        <div style={{ display: 'flex', gap: '10px', width: '70%', justifyContent: 'flex-end' }}>
          <button onClick={handleEnviarWhatsApp} className="icon-button-edit" style={{ padding: '0 16px', height: '42px', borderRadius: '12px', gap: '8px', fontSize: '13px', background: '#25D366', color: 'white', border: 'none' }}>
            <Send size={16} /> WhatsApp
          </button>
          <button onClick={handleImprimir} className="action-button" style={{ padding: '0 20px', height: '42px', borderRadius: '12px', gap: '8px', fontSize: '13px' }}>
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      </div>

    </Modal>
  );
}
