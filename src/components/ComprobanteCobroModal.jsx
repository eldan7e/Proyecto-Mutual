import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Printer, Send, ShieldCheck, User, Calendar, CreditCard, DollarSign, Building, Coins, CheckCircle2, AlertTriangle, Phone, Scissors } from 'lucide-react';
import { formatMoney, formatFecha } from '../utils/cuentaCorrienteEngine';
import { supabase } from '../supabaseClient';

function isMedioEfectivo(val) {
  if (!val) return true;
  const u = String(val).toUpperCase();
  return u.includes('EFECT') || u.includes('MUT') || u.includes('CAJA');
}

function normalizeMedioPago(val) {
  if (!val) return 'EFECTIVO EN MUT';
  const u = String(val).toUpperCase();
  if (u.includes('CREDICOOP')) return 'TRANSFERENCIA A CREDICOOP';
  if (u.includes('NACION') || u.includes('NACIÓN')) return 'TRANSFERENCIA A NACION';
  if (u.includes('TRANSF') || u.includes('BANCO') || u.includes('DEBITO') || u.includes('MERCADO') || u.includes('CHEQUE')) return 'TRANSFERENCIA A NACION';
  if (u.includes('EFECT') || u.includes('MUT') || u.includes('CAJA')) return 'EFECTIVO EN MUT';
  return val;
}

/**
 * Extrae únicamente los gigabytes o megabytes contratados del plan (ej: "30 GB", "10 GB", "15 GB").
 */
export function extraerGbsPlan(nombrePlan, gbIncluidos) {
  // 1. Si viene gb_incluidos explícito
  if (gbIncluidos !== undefined && gbIncluidos !== null && String(gbIncluidos).trim() !== '') {
    const cleanGb = String(gbIncluidos).trim().replace(',', '.');
    const num = parseFloat(cleanGb);
    if (!isNaN(num) && num > 0) {
      if (num < 1) return `${Math.round(num * 1024)} MB`;
      return num % 1 === 0 ? `${num} GB` : `${num.toFixed(1)} GB`;
    }
  }

  // 2. Diccionario de planes conocidos de mutual (por códigos oficiales como CC24R, CC23R, etc.)
  const DICCIONARIO_GB_PLANES = {
    '3MC26': '300 MB',
    'M3C03': '300 MB',
    'PLAN INTERNET 300 MB': '300 MB',
    'CC10R': '2 GB',
    'CC20R': '2 GB',
    'CC11R': '4 GB',
    'CC21R': '4 GB',
    'CC12R': '7 GB',
    'CC22R': '7 GB',
    'CC13R': '10 GB',
    'CC13C': '10 GB',
    'CC23R': '10 GB',
    'CC14R': '20 GB',
    'CC24R': '30 GB',
    'CC25R': '50 GB',
    'CFT14 - LÍNEA FIJA': 'Línea Fija',
    'TFT26 - LÍNEA FIJA': 'Línea Fija',
    'CFT14': 'Línea Fija',
    'TFT26': 'Línea Fija'
  };

  const code = String(nombrePlan || '').trim().toUpperCase();
  if (DICCIONARIO_GB_PLANES[code]) {
    return DICCIONARIO_GB_PLANES[code];
  }

  // 3. Extracción por Regex si el nombre contiene "X GB" o "X MB" o "X,X GB"
  if (nombrePlan && typeof nombrePlan === 'string') {
    const match = nombrePlan.match(/(\d+(?:[,\.]\d+)?)\s*(GB|MB)/i);
    if (match) {
      const val = parseFloat(match[1].replace(',', '.'));
      const unit = match[2].toUpperCase();
      return `${val} ${unit}`;
    }
  }

  return nombrePlan || '-';
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
    saldo_pendiente_cambio = 0,
    periodo: cobroPeriodo,
    numero_linea: cobroNumeroLinea
  } = cobroData;

  const [currentMedioPago, setCurrentMedioPago] = useState(() => normalizeMedioPago(medio_pago));
  const [planesGbMap, setPlanesGbMap] = useState({});
  const [lineasCargadas, setLineasCargadas] = useState(() => {
    if (cobroData.lineas && Array.isArray(cobroData.lineas) && cobroData.lineas.length > 0) {
      return cobroData.lineas;
    }
    return [];
  });
  const [loadingLineas, setLoadingLineas] = useState(false);

  // Cargar mapa global de planes_abonos para resolución inmediata de GB
  useEffect(() => {
    async function loadPlanesMap() {
      try {
        const { data } = await supabase
          .from('planes_abonos')
          .select('nombre_plan, gb_incluidos');
        if (data) {
          const map = {};
          data.forEach(p => {
            if (p.nombre_plan) {
              map[p.nombre_plan.trim().toUpperCase()] = p.gb_incluidos;
            }
          });
          setPlanesGbMap(map);
        }
      } catch (e) {
        console.error('Error al cargar mapa de planes:', e);
      }
    }
    loadPlanesMap();
  }, []);

  useEffect(() => {
    setCurrentMedioPago(normalizeMedioPago(medio_pago));
  }, [medio_pago]);

  // Cargar las líneas que componen este pago si no vienen precargadas
  useEffect(() => {
    if (cobroData.lineas && Array.isArray(cobroData.lineas) && cobroData.lineas.length > 0) {
      setLineasCargadas(cobroData.lineas);
      return;
    }

    if (numero_grupo) {
      cargarLineasDelCobro();
    }
  }, [cobroData, numero_grupo]);

  async function cargarLineasDelCobro() {
    setLoadingLineas(true);
    try {
      // 1. Determinar período
      const per = cobroPeriodo
        || cobroData.desgloses?.[0]?.periodo
        || (observaciones ? observaciones.match(/202\d-[01]\d/)?.[0] : null)
        || (reciboNumero ? reciboNumero.match(/202\d-[01]\d/)?.[0] : null);

      // 2. Determinar si se pagó una o más líneas específicas
      const targetLinea = cobroNumeroLinea
        || cobroData.targetLinea
        || (observaciones ? observaciones.match(/Línea[s]?[:\s]+([\d,\s]+)/i)?.[1] : null);

      // 3. Buscar socios del grupo desde v_socios_busqueda
      const { data: sociosGrupo } = await supabase
        .from('v_socios_busqueda')
        .select('socio_id')
        .filter('grupo_codigo_str', 'imatch', '\\y' + numero_grupo + '\\y');
      const socioIds = (sociosGrupo || []).map(s => s.socio_id).filter(Boolean);

      let orConds = [`numero_grupo.eq.${numero_grupo}`];
      if (socioIds.length > 0) {
        orConds.push(`socio_id.in.(${socioIds.join(',')})`);
      }

      const { data: rawLineas } = await supabase
        .from('lineas')
        .select('numero_linea, proveedor_id, proveedores:proveedor_id(nombre), socio_id, socios:socio_id(nombre_completo), planes_abonos:plan_id(nombre_plan, precio, gb_incluidos), estado')
        .or(orConds.join(','));

      let activas = (rawLineas || []).filter(l => (l.estado || 'ACTIVA').toUpperCase() !== 'BAJA');

      // Si se indicó una o más líneas específicas, filtrar solo esas
      if (targetLinea) {
        const tokens = String(targetLinea).split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
        const filtradas = activas.filter(l => tokens.includes(l.numero_linea));
        if (filtradas.length > 0) {
          activas = filtradas;
        }
      }

      const lineNums = activas.map(l => l.numero_linea).filter(Boolean);

      let billingMap = {};
      if (lineNums.length > 0 && per) {
        const { data: billingData } = await supabase
          .from('v_historial_facturacion_socio')
          .select('numero_linea, total_linea, nombre_plan, costo_abono_real, nombre_completo, proveedor')
          .eq('periodo', per)
          .in('numero_linea', lineNums);

        if (billingData) {
          billingData.forEach(b => {
            billingMap[b.numero_linea] = b;
          });
        }
      }

      const enriched = activas.map(l => {
        const b = billingMap[l.numero_linea];
        const rawVal = b ? parseFloat(b.total_linea) : (parseFloat(l.planes_abonos?.precio) || 0);
        const nomPlan = b?.nombre_plan || l.planes_abonos?.nombre_plan || 'Plan Estándar';
        const gbRaw = l.planes_abonos?.gb_incluidos || planesGbMap[String(nomPlan).trim().toUpperCase()];
        return {
          numero_linea: l.numero_linea,
          socio_nombre: b?.nombre_completo || l.socios?.nombre_completo || nombre_titular || 'Titular',
          proveedor_nombre: b?.proveedor || l.proveedores?.nombre || 'MUTUAL',
          nombre_plan: nomPlan,
          gb_incluidos: gbRaw,
          total_linea: Math.round(rawVal * 100) / 100
        };
      });

      setLineasCargadas(enriched);
    } catch (err) {
      console.error('Error al cargar líneas del comprobante:', err);
    } finally {
      setLoadingLineas(false);
    }
  }

  function handleImprimir() {
    const originalTitle = document.title;
    document.title = `${reciboNumero}_Grupo_${numero_grupo || 'Cobro'}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  }

  function handleEnviarWhatsApp() {
    const isCash = isMedioEfectivo(currentMedioPago);
    let text = `*MUTUAL AUNAR — COMPROBANTE OFICIAL DE COBRO*\n`;
    text += `📄 *Recibo N°:* ${reciboNumero}\n`;
    text += `📅 *Fecha de Cobro:* ${formatFecha(fecha)}\n`;
    text += `👤 *Grupo Pagador:* Grupo ${numero_grupo} — ${nombre_titular || 'Socio'}\n`;
    text += `💰 *Monto Total Cobrado:* ${formatMoney(monto_cobrado)}\n`;
    text += `💵 *Forma de Pago:* ${isCash ? 'PAGO EN EFECTIVO' : currentMedioPago}\n`;
    text += `✓ *Condición:* TOTALMENTE CANCELADO\n`;
    if (isCash && efectivo_entregado) {
      text += `💵 *Efectivo en Caja:* ${formatMoney(efectivo_entregado)}\n`;
    }
    if (lineasCargadas.length > 0) {
      text += `\n*📱 LÍNEAS ABONADAS (${lineasCargadas.length}):*\n`;
      lineasCargadas.forEach(l => {
        const gb = extraerGbsPlan(l.nombre_plan, l.gb_incluidos || l.gb || planesGbMap[String(l.nombre_plan || '').trim().toUpperCase()]);
        text += `• ${l.numero_linea} (${l.socio_nombre || 'Socio'}) — ${gb}: ${formatMoney(l.total_linea || 0)}\n`;
      });
    }
    if (saldo_favor_cambio > 0) {
      text += `🟢 *Saldo a Favor por falta de cambio:* +${formatMoney(saldo_favor_cambio)} (Acreditado a cuenta corriente)\n`;
    }
    if (bonificacion_redondeo > 0) {
      text += `🔵 *Bonificación por redondeo en caja:* ${formatMoney(bonificacion_redondeo)} (Factura 100% cancelada)\n`;
    }
    if (observaciones) text += `📝 *Ref / Obs:* ${observaciones}\n`;
    text += `\n_Asociación Mutual Aunar • Gracias por mantener su cuenta al día._`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  const isCash = isMedioEfectivo(currentMedioPago);
  const detectedPeriodo = cobroPeriodo 
    || (observaciones ? observaciones.match(/202\d-[01]\d/)?.[0] : null) 
    || (reciboNumero ? reciboNumero.match(/202\d-[01]\d/)?.[0] : null);

  const sharedCardProps = {
    reciboNumero,
    fecha,
    numero_grupo,
    nombre_titular,
    currentMedioPago,
    isCash,
    observaciones,
    periodo: detectedPeriodo,
    lineas: lineasCargadas,
    desgloses,
    monto_cobrado,
    efectivo_entregado: isCash ? (efectivo_entregado || monto_cobrado) : undefined,
    saldo_favor_cambio,
    bonificacion_redondeo,
    planesGbMap
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comprobante Oficial de Cobro (Original y Duplicado en Hoja A4)" maxWidth="760px">
      
      {/* CSS para Impresión de 1 Sola Hoja A4 con Original y Duplicado */}
      <style>{`
        @media print {
          /* 1. Ocultar el árbol de la aplicación principal */
          #root,
          body > *:not(.modal-backdrop),
          header,
          nav,
          footer,
          .no-print,
          .modal-header,
          .modal-close-btn,
          button {
            display: none !important;
            height: 0 !important;
            max-height: 0 !important;
            overflow: hidden !important;
          }

          body::before,
          body::after {
            display: none !important;
          }

          /* 2. Reset exacto de hoja A4 portrait (210 x 297mm) */
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            width: 100% !important;
            height: 100% !important;
            max-height: 297mm !important;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .modal-backdrop {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            max-height: 285mm !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
            inset: auto !important;
            z-index: auto !important;
          }

          .modal-container {
            position: static !important;
            display: block !important;
            max-width: 100% !important;
            width: 100% !important;
            height: 100% !important;
            max-height: 285mm !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
            transform: none !important;
          }

          /* 3. Contenedor que agrupa Original + Corte + Duplicado */
          #print-recibo-wrapper {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            width: 100% !important;
            height: 100% !important;
            max-height: 283mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* 4. Cada mitad del recibo: Original y Duplicado */
          .recibo-single {
            width: 100% !important;
            max-height: 136mm !important;
            box-sizing: border-box !important;
            border: 1.5px solid #10b981 !important;
            border-radius: 8px !important;
            padding: 8px 14px !important;
            background: #ffffff !important;
            color: #000000 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
          }

          .recibo-single h3,
          .recibo-single p,
          .recibo-single td,
          .recibo-single th,
          .recibo-single span,
          .recibo-single div {
            color: #000000 !important;
          }

          .recibo-single .print-text-accent {
            color: #059669 !important;
          }

          .recibo-single .print-text-danger {
            color: #dc2626 !important;
          }

          .recibo-single .print-bg-card {
            background: #f8fafc !important;
            border: 1px solid #cbd5e1 !important;
          }

          .recibo-single .print-table-header {
            background: #f1f5f9 !important;
          }

          /* 5. Línea divisoria de corte punteada */
          .print-cut-divider {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 6mm !important;
            margin: 1.5mm 0 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .print-cut-divider span {
            background: #ffffff !important;
            color: #475569 !important;
          }
        }
      `}</style>

      {/* Barra superior Interactiva (Solo en Pantalla, Oculta al Imprimir) */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CreditCard size={15} color="#10b981" />
          <span style={{ fontSize: '12.5px', fontWeight: 800 }}>Forma de Pago:</span>
          <select 
            value={currentMedioPago} 
            onChange={(e) => setCurrentMedioPago(e.target.value)}
            className="form-input"
            style={{ padding: '3px 8px', height: '32px', fontSize: '11.5px', fontWeight: 800, width: 'auto', background: 'var(--surface)' }}
          >
            <option value="EFECTIVO EN MUT">EFECTIVO EN MUT</option>
            <option value="TRANSFERENCIA A NACION">TRANSFERENCIA A NACION</option>
            <option value="TRANSFERENCIA A CREDICOOP">TRANSFERENCIA A CREDICOOP</option>
          </select>
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Scissors size={12} color="#10b981" /> Formato A4 con Original y Duplicado para cortar
        </div>
      </div>

      {/* Wrapper Imprimible: Contiene ORIGINAL + DIVISOR + DUPLICADO */}
      <div id="print-recibo-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        
        {/* 1. COPIA ORIGINAL (SOCIO / CLIENTE) */}
        <ReciboCard 
          tipo="ORIGINAL" 
          sublabel="CLIENTE / SOCIO" 
          {...sharedCardProps} 
        />

        {/* LÍNEA DE CORTE PUNTADA (TIJERA) */}
        <div className="print-cut-divider" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '6px 0',
          position: 'relative',
          userSelect: 'none'
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            borderTop: '1.5px dashed #94a3b8'
          }} />
          <span style={{
            position: 'relative',
            background: 'var(--modal-bg, #ffffff)',
            padding: '0 10px',
            fontSize: '8.5px',
            fontWeight: 800,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <Scissors size={11} color="#64748b" /> Cortar por aquí — Original (Arriba) / Duplicado (Abajo)
          </span>
        </div>

        {/* 2. COPIA DUPLICADO (MUTUAL / ADMINISTRACIÓN) */}
        <ReciboCard 
          tipo="DUPLICADO" 
          sublabel="MUTUAL / ADMINISTRACIÓN" 
          {...sharedCardProps} 
        />

      </div>

      {/* Botones de Acción (Ignorados en la impresión) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '12px' }}>
        <button onClick={onClose} className="action-button" style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', width: '28%' }}>
          Cerrar
        </button>

        <div style={{ display: 'flex', gap: '10px', width: '72%', justifyContent: 'flex-end' }}>
          <button onClick={handleEnviarWhatsApp} className="icon-button-edit" style={{ padding: '0 16px', height: '38px', borderRadius: '10px', gap: '7px', fontSize: '12.5px', background: '#25D366', color: 'white', border: 'none', fontWeight: 800 }}>
            <Send size={15} /> WhatsApp
          </button>
          <button onClick={handleImprimir} className="action-button" style={{ padding: '0 20px', height: '38px', borderRadius: '10px', gap: '7px', fontSize: '12.5px', fontWeight: 800 }}>
            <Printer size={15} /> Imprimir / PDF (A4)
          </button>
        </div>
      </div>

    </Modal>
  );
}

// ============================================================================
// SUB-COMPONENTE: TARJETA DE RECIBO (ORIGINAL O DUPLICADO)
// ============================================================================
function ReciboCard({
  tipo,
  sublabel,
  reciboNumero,
  fecha,
  numero_grupo,
  nombre_titular,
  currentMedioPago,
  isCash,
  observaciones,
  periodo,
  lineas = [],
  desgloses = [],
  monto_cobrado,
  efectivo_entregado,
  saldo_favor_cambio,
  bonificacion_redondeo,
  planesGbMap = {}
}) {
  const isOriginal = tipo === 'ORIGINAL';
  const badgeColor = isOriginal ? '#059669' : '#2563eb';
  const badgeBg = isOriginal ? 'rgba(16, 185, 129, 0.08)' : 'rgba(37, 99, 235, 0.08)';
  const badgeBorder = isOriginal ? 'rgba(16, 185, 129, 0.3)' : 'rgba(37, 99, 235, 0.3)';

  return (
    <div className="recibo-single" style={{
      background: 'var(--surface, #ffffff)',
      border: '1.5px solid #10b981',
      borderRadius: '10px',
      padding: '10px 14px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '6px'
    }}>
      {/* 1. Header con Logo, Título y Datos de Recibo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light, #e2e8f0)', paddingBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <img 
            src="/logo.png" 
            alt="Mutual Aunar" 
            style={{ height: '30px', objectFit: 'contain' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div>
            <h3 style={{ fontSize: '14.5px', fontWeight: 900, margin: 0, color: 'var(--text-primary, #0f172a)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              MUTUAL AUNAR
            </h3>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary, #64748b)' }}>
              Asociación Mutual • Comprobante Oficial de Cobro
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ textAlign: 'right' }}>
            <span className="print-text-accent" style={{ fontSize: '12.5px', fontWeight: 900, color: '#059669', display: 'block', lineHeight: 1.1 }}>
              {reciboNumero}
            </span>
            <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary, #64748b)' }}>
              Fecha: {formatFecha(fecha)}
            </span>
          </div>
          <div style={{
            fontSize: '8.5px',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '3px 7px',
            borderRadius: '5px',
            background: badgeBg,
            color: badgeColor,
            border: `1px solid ${badgeBorder}`,
            lineHeight: 1
          }}>
            {tipo} — {sublabel}
          </div>
        </div>
      </div>

      {/* 2. Banner de Datos del Pagador y Medio de Pago */}
      <div className="print-bg-card" style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1.2fr',
        gap: '10px',
        padding: '6px 10px',
        borderRadius: '7px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border-light, #e2e8f0)',
        alignItems: 'center'
      }}>
        {/* Columna Pagador */}
        <div>
          <span style={{ fontSize: '8.5px', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.03em' }}>
            <User size={10} color="#10b981" /> Persona Pagadora / Grupo
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '1px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 900, color: 'var(--text-primary, #0f172a)' }}>
              Grupo N° {numero_grupo}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #475569)' }}>
              • {nombre_titular || 'Titular'}
            </span>
          </div>
        </div>

        {/* Columna Medio de Pago */}
        <div>
          <span style={{ fontSize: '8.5px', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.03em' }}>
            <CreditCard size={10} color="#10b981" /> Forma / Medio de Pago
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
            <span className="print-text-accent" style={{ fontSize: '12.5px', fontWeight: 900, color: '#059669' }}>
              {isCash ? 'PAGO EN EFECTIVO' : currentMedioPago}
            </span>
            <span style={{
              fontSize: '8px',
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: '3px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              ✓ {isCash ? 'EFECTIVO' : 'ACREDITADO'}
            </span>
          </div>
          {observaciones && (
            <div style={{ fontSize: '9px', color: 'var(--text-secondary, #64748b)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Ref: {observaciones}
            </div>
          )}
        </div>
      </div>

      {/* 3. Detalle de Líneas Abonadas (o Imputación si no hay líneas) */}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
        {lineas && lineas.length > 0 ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Phone size={10} color="#10b981" /> Líneas Abonadas ({lineas.length})
              </span>
              {periodo && (
                <span style={{ fontSize: '8.5px', fontWeight: 700, color: 'var(--text-secondary, #64748b)' }}>
                  Período Facturado: {periodo}
                </span>
              )}
            </div>

            {/* Tabla continua de líneas abonadas con indicador exclusivo de GB del plan */}
            {lineas.length <= 12 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                <thead>
                  <tr className="print-table-header" style={{ background: 'rgba(0,0,0,0.04)', borderBottom: '1.5px solid var(--border-light, #cbd5e1)' }}>
                    <th style={{ padding: '2.5px 5px', textAlign: 'left', fontWeight: 800, width: '25%' }}>Línea</th>
                    <th style={{ padding: '2.5px 5px', textAlign: 'left', fontWeight: 800, width: '40%' }}>Socio / Asignado</th>
                    <th style={{ padding: '2.5px 5px', textAlign: 'center', fontWeight: 800, width: '15%' }}>Plan (GB)</th>
                    <th style={{ padding: '2.5px 5px', textAlign: 'right', fontWeight: 800, width: '20%' }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, idx) => {
                    const gbPlan = extraerGbsPlan(l.nombre_plan, l.gb_incluidos || l.gb || planesGbMap[String(l.nombre_plan || '').trim().toUpperCase()]);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                        <td style={{ padding: '2px 5px', fontWeight: 800, fontFamily: 'monospace', fontSize: '9.5px' }}>{l.numero_linea}</td>
                        <td style={{ padding: '2px 5px', color: 'var(--text-primary, #334155)', fontWeight: 600 }}>{l.socio_nombre || 'Titular'}</td>
                        <td style={{ padding: '2px 5px', textAlign: 'center', fontWeight: 800, color: '#059669' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'rgba(16, 185, 129, 0.08)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            fontSize: '8.5px',
                            whiteSpace: 'nowrap'
                          }}>
                            {gbPlan}
                          </span>
                        </td>
                        <td style={{ padding: '2px 5px', textAlign: 'right', fontWeight: 800 }}>{formatMoney(l.total_linea || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              /* Si son más de 12 líneas: cuadrícula de 2 columnas ultra compacta también mostrando el GB */
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', fontSize: '8.5px', background: 'rgba(0,0,0,0.02)', padding: '3px', borderRadius: '5px' }}>
                {lineas.map((l, idx) => {
                  const gbPlan = extraerGbsPlan(l.nombre_plan, l.gb_incluidos || l.gb || planesGbMap[String(l.nombre_plan || '').trim().toUpperCase()]);
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '1px 2px' }}>
                      <span style={{ fontWeight: 800 }}>
                        {l.numero_linea} <span style={{ fontWeight: 700, color: '#059669' }}>[{gbPlan}]</span> <span style={{ fontWeight: 400, color: '#64748b' }}>({l.socio_nombre?.split(',')[0] || 'Socio'})</span>
                      </span>
                      <span style={{ fontWeight: 800 }}>{formatMoney(l.total_linea || 0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Fallback Imputación Clásica */
          <div>
            <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <ShieldCheck size={10} color="#10b981" /> Detalle de Imputación de Conceptos
            </span>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr className="print-table-header" style={{ background: 'rgba(0,0,0,0.04)', borderBottom: '1px solid var(--border-light, #cbd5e1)' }}>
                  <th style={{ padding: '2.5px 5px', textAlign: 'left', fontWeight: 800 }}>Concepto / Período</th>
                  <th style={{ padding: '2.5px 5px', textAlign: 'right', fontWeight: 800 }}>Interés Mora</th>
                  <th style={{ padding: '2.5px 5px', textAlign: 'right', fontWeight: 800 }}>Capital</th>
                  <th style={{ padding: '2.5px 5px', textAlign: 'right', fontWeight: 800 }}>Total Aplicado</th>
                </tr>
              </thead>
              <tbody>
                {desgloses && desgloses.length > 0 ? (
                  desgloses.map((d, idx) => {
                    const subtotal = Number(d.pagoAplicadoCapital || 0) + Number(d.pagoAplicadoInteres || 0);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                        <td style={{ padding: '2px 5px', fontWeight: 700 }}>{d.observaciones || 'Cobro Facturación'}</td>
                        <td style={{ padding: '2px 5px', textAlign: 'right', color: '#dc2626' }}>{formatMoney(d.pagoAplicadoInteres || 0)}</td>
                        <td style={{ padding: '2px 5px', textAlign: 'right' }}>{formatMoney(d.pagoAplicadoCapital || 0)}</td>
                        <td style={{ padding: '2px 5px', textAlign: 'right', fontWeight: 900 }}>{formatMoney(subtotal)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="4" style={{ padding: '5px', textAlign: 'center', color: '#64748b' }}>Cobro imputado en cuenta corriente</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tarjetas compactas si hubo saldo a favor o redondeo de cambio */}
        {saldo_favor_cambio > 0 && (
          <div style={{ marginTop: '3px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '8.5px', display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 700 }}>
            <span>🟢 Saldo a favor por falta de cambio en caja acreditado a cuenta corriente</span>
            <span>+{formatMoney(saldo_favor_cambio)}</span>
          </div>
        )}
        {bonificacion_redondeo > 0 && (
          <div style={{ marginTop: '3px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', fontSize: '8.5px', display: 'flex', justifyContent: 'space-between', color: '#2563eb', fontWeight: 700 }}>
            <span>🔵 Bonificación por redondeo en ventanilla (Factura 100% Cancelada)</span>
            <span>{formatMoney(bonificacion_redondeo)}</span>
          </div>
        )}
      </div>

      {/* 4. Resumen Final, Totales y Firmas */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        borderTop: '1.5px solid var(--border-light, #cbd5e1)',
        paddingTop: '5px'
      }}>
        {/* Firmas y Efectivo Recibido */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {isCash && efectivo_entregado ? (
            <div style={{ fontSize: '9px', color: 'var(--text-secondary, #475569)', fontWeight: 600 }}>
              Efectivo entregado en ventanilla: <strong style={{ color: 'var(--text-primary, #0f172a)' }}>{formatMoney(efectivo_entregado)}</strong>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: '16px', marginTop: '2px' }}>
            <div style={{ borderTop: '1px solid #94a3b8', width: '105px', textAlign: 'center', fontSize: '8px', color: '#64748b', paddingTop: '2px' }}>
              Firma y Sello Mutual
            </div>
            <div style={{ borderTop: '1px solid #94a3b8', width: '105px', textAlign: 'center', fontSize: '8px', color: '#64748b', paddingTop: '2px' }}>
              Firma del Pagador
            </div>
          </div>
        </div>

        {/* Monto Total Imputado / Pagado */}
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '8px', color: 'var(--text-secondary, #64748b)', fontWeight: 800, textTransform: 'uppercase', display: 'block', letterSpacing: '0.04em' }}>
            {isCash ? 'MONTO TOTAL PAGADO EN EFECTIVO' : 'MONTO TOTAL IMPUTADO'}
          </span>
          <span className="print-text-accent" style={{ fontSize: '16.5px', fontWeight: 900, color: '#059669', lineHeight: 1.1 }}>
            {formatMoney(monto_cobrado)}
          </span>
          <div style={{ marginTop: '1px' }}>
            <span style={{
              fontSize: '8px',
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: '3px',
              background: '#ecfdf5',
              color: '#059669',
              border: '1px solid #a7f3d0'
            }}>
              ✓ {isCash ? 'CANCELADO EN EFECTIVO' : 'PAGADO'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
