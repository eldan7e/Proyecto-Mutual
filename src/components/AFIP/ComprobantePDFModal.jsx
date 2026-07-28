import { useRef, useState, useEffect } from 'react';
import { Printer, Download, X, CheckCircle2, ShieldCheck, FileText, Smartphone } from 'lucide-react';
import { formatMoney } from '../../utils/cuentaCorrienteEngine';
import { supabase } from '../../supabaseClient';

export default function ComprobantePDFModal({ comprobante, onClose }) {
  const printRef = useRef();
  const [lineasReceptor, setLineasReceptor] = useState(comprobante?.lineas || []);

  useEffect(() => {
    if (comprobante && (comprobante.numero_grupo || comprobante.socio_id) && (!comprobante.lineas || comprobante.lineas.length === 0)) {
      fetchLineasReceptor();
    }
  }, [comprobante]);

  async function fetchLineasReceptor() {
    try {
      let query = supabase.from('lineas').select('numero_linea, proveedores:proveedor_id(nombre)');
      if (comprobante.numero_grupo) {
        query = query.eq('numero_grupo', comprobante.numero_grupo);
      } else if (comprobante.socio_id) {
        query = query.eq('socio_id', comprobante.socio_id);
      }
      const { data } = await query;
      if (data) setLineasReceptor(data);
    } catch (err) {
      console.error('Error fetching lineas for voucher PDF:', err);
    }
  }

  if (!comprobante) return null;

  const isFacturaAFIP = comprobante.tipo?.startsWith('Factura') || comprobante.tipo?.startsWith('Nota');
  const isReciboInternal = comprobante.tipo === 'Recibo X' || comprobante.tipo === 'Recibo de Cobro';

  // Datos normalizados del comprobante
  const fecha = comprobante.fecha || new Date().toISOString().split('T')[0];
  const fechaFormatted = new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
  
  const nroComprobante = String(comprobante.id || comprobante.numero || '1').padStart(8, '0');
  const puntoVenta = String(comprobante.punto_venta || 1).padStart(4, '0');
  const tipoLetra = isReciboInternal ? 'X' : (comprobante.tipo?.slice(-1) || 'B');
  const cae = comprobante.cod_autorizacion || comprobante.cae || 'PROVISORIO';
  const vencimientoCae = comprobante.vencimiento_cae || fechaFormatted;

  const receptorNombre = comprobante.denominacion_receptor || comprobante.receptor || 'Consumidor Final';
  const receptorGrupo = comprobante.numero_grupo ? `Grupo #${comprobante.numero_grupo}` : '';
  const receptorCuit = comprobante.cuit_receptor || comprobante.dni || 'Sin CUIT/DNI';
  const receptorCondicion = comprobante.condicion_iva_receptor || 'Consumidor Final';

  const items = comprobante.items || [
    { descripcion: comprobante.concepto || comprobante.descripcion || 'Servicios Telecomunicaciones Mutual', monto: comprobante.imp_total || comprobante.monto || 0 }
  ];

  const total = Number(comprobante.imp_total || comprobante.monto || 0);

  // URL del QR oficial de AFIP
  const qrData = JSON.stringify({
    ver: 1,
    fecha,
    cuit: 30712345678,
    ptoVta: Number(puntoVenta),
    tipoCmp: isReciboInternal ? 0 : 6,
    nroCmp: Number(nroComprobante),
    importe: total,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: 99,
    nroDocRec: 0,
    tipoCodAut: 'E',
    codAut: cae !== 'PROVISORIO' ? Number(cae) : 0
  });

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`https://www.afip.gob.ar/fe/qr/?p=${btoa(qrData)}`)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
      padding: '20px'
    }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{
        background: 'var(--surface)', borderRadius: '24px', width: '100%', maxWidth: '840px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', border: '1px solid var(--border-light)'
      }}>
        {/* Header Actions */}
        <div className="no-print" style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--surface-light)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: isReciboInternal ? 'rgba(16, 185, 129, 0.1)' : 'var(--accent-light)', color: isReciboInternal ? '#10b981' : 'var(--accent)', padding: '8px', borderRadius: '10px' }}>
              <FileText size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Vista Previa de Comprobante</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>{comprobante.tipo} · {puntoVenta}-{nroComprobante}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={handlePrint} className="air-btn air-btn-primary" style={{ padding: '8px 18px', gap: '8px', fontSize: '13px' }}>
              <Printer size={16} /> Imprimir Comprobante
            </button>
            <button onClick={onClose} className="icon-button-edit" style={{ padding: '8px' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div id="print-area" ref={printRef} style={{
            background: 'white', color: '#1e293b', padding: '32px', borderRadius: '16px',
            border: '2px solid #e2e8f0', fontFamily: 'Arial, sans-serif', fontSize: '13px'
          }}>
            {/* Header Box */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto 1fr', borderBottom: '2px solid #000',
              paddingBottom: '16px', marginBottom: '20px', position: 'relative'
            }}>
              {/* Left Column - Issuer with Logo */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                  <img src="/logo.png" alt="Mutual Aunar Logo" style={{ width: '44px', height: '44px', objectFit: 'contain' }} />
                  <div>
                    <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>ASOCIACION MUTUAL DE EMPLEADOS (AUNAR)</h2>
                    <p style={{ margin: '1px 0 0 0', fontWeight: 700, fontSize: '11px', color: '#16a34a' }}>Servicios de Telecomunicaciones & Conectividad</p>
                  </div>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#475569' }}><strong>Domicilio Comercial:</strong> Diagonal 76 46 “4” La Plata, Provincia de Buenos Aires, Argentina · Tel: (0221) 621-0369</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}><strong>Condición IVA:</strong> IVA Exento</p>
              </div>

              {/* Letter Box in Center */}
              <div style={{
                width: '60px', height: '60px', border: '2px solid #000', borderRadius: '8px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                margin: '0 20px', background: '#f8fafc'
              }}>
                <span style={{ fontSize: '26px', fontWeight: 900, lineHeight: 1 }}>{tipoLetra}</span>
                <span style={{ fontSize: '9px', fontWeight: 800, marginTop: '2px', color: '#475569' }}>{isReciboInternal ? 'DOC. INTERNO' : 'COD. 006'}</span>
              </div>

              {/* Right Column - Voucher Info */}
              <div style={{ textAlign: 'right' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>{comprobante.tipo || 'COMPROBANTE'}</h3>
                <p style={{ margin: '6px 0 0 0', fontSize: '13px', fontWeight: 800 }}>P.V. {puntoVenta} - N° {nroComprobante}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}><strong>Fecha de Emisión:</strong> {fechaFormatted}</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}><strong>CUIT Mutual:</strong> 30-71234567-8</p>
              </div>
            </div>

            {/* Client / Receptor Box */}
            <div style={{
              background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px',
              padding: '16px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'
            }}>
              <div>
                <p style={{ margin: 0 }}><strong>Receptor / Titular:</strong> {receptorNombre}</p>
                {receptorGrupo && <p style={{ margin: '4px 0 0 0', color: '#0284c7', fontWeight: 700 }}>{receptorGrupo}</p>}
                <p style={{ margin: '4px 0 0 0' }}><strong>CUIT / DNI:</strong> {receptorCuit}</p>
                {lineasReceptor && lineasReceptor.length > 0 && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#0f172a', fontWeight: 700 }}>
                    <strong>Líneas abonadas:</strong> {lineasReceptor.map(l => `${l.numero_linea}${l.proveedores?.nombre ? ` (${l.proveedores.nombre})` : ''}`).join(', ')}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0 }}><strong>Condición de IVA:</strong> {receptorCondicion}</p>
                <p style={{ margin: '4px 0 0 0' }}><strong>Condición de Venta:</strong> Contado / Transferencia</p>
              </div>
            </div>

            {/* Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: 'white', fontSize: '12px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Concepto / Descripción</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', width: '80px' }}>Cant.</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{item.descripcion}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{item.cantidad || 1}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>{formatMoney(item.monto || item.precio_unitario || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '2px solid #000', paddingTop: '16px' }}>
              <div>
                {isFacturaAFIP ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <img src={qrUrl} alt="QR AFIP" style={{ width: '90px', height: '90px', border: '1px solid #cbd5e1', borderRadius: '8px' }} />
                    <div style={{ fontSize: '11px', color: '#475569' }}>
                      <p style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>Comprobante Autorizado por AFIP</p>
                      <p style={{ margin: '2px 0 0 0' }}><strong>CAE N°:</strong> {cae}</p>
                      <p style={{ margin: '2px 0 0 0' }}><strong>Vencimiento CAE:</strong> {vencimientoCae}</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#16a34a' }}>
                    <CheckCircle2 size={36} />
                    <div>
                      <p style={{ margin: 0, fontWeight: 900, fontSize: '14px' }}>Comprobante Oficial de Cobro</p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#475569' }}>Mutual Aunar · Registro Acreditado</p>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right', background: '#f1f5f9', padding: '16px 24px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Importe Total</span>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
                  {formatMoney(total)}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
