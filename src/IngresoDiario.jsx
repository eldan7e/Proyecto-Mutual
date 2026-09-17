import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  Search, Plus, Calendar, DollarSign, TrendingUp, ClipboardPaste,
  Loader2, RefreshCw, Trash2, CheckCircle2, AlertTriangle, Banknote,
  CreditCard, ArrowRightLeft, ChevronDown, Users, X, Save, FileText,
  Layers, Check
} from 'lucide-react';
import Modal from './components/Modal';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import { registrarCobroCuenta } from './services/cuentaCorrienteService';

const MEDIOS_PAGO = [
  { value: 'TRANSFERENCIA', label: 'Transferencia', icon: ArrowRightLeft, color: '#6366f1' },
  { value: 'EFECTIVO', label: 'Efectivo', icon: Banknote, color: '#10b981' },
  { value: 'DEBITO', label: 'Débito Directo', icon: CreditCard, color: '#f59e0b' },
  { value: 'OTRO', label: 'Otro', icon: DollarSign, color: '#8b5cf6' },
];

const BANCOS = ['CREDICOOP', 'NACION', 'EFECTIVO', 'OTRO'];

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

const fmt = (n) => (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseUniversalAmount(str) {
  if (str === undefined || str === null || str === '') return { amount: 0, isNegative: false };
  if (typeof str === 'number') return { amount: Math.abs(str), isNegative: str < 0 };
  let s = String(str).trim();
  const isNegative = s.includes('-') || (s.startsWith('(') && s.endsWith(')'));
  s = s.replace(/[$()\s\-]/g, '');
  if (!s) return { amount: 0, isNegative };

  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf('.') < s.lastIndexOf(',')) {
      // 20.671,84 -> formato argentino: punto miles, coma decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 112,378.56 -> formato US: coma miles, punto decimal
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    if (s.length - 1 - s.lastIndexOf(',') === 2) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes('.')) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      s = s.replace(/\./g, '');
    }
  }

  const num = Math.abs(parseFloat(s) || 0);
  return { amount: num, isNegative };
}

function parseArgentineOrUSNumber(str) {
  return parseUniversalAmount(str).amount;
}

function parseDateAR(str, refYear = '2026') {
  if (!str) return null;
  const m = String(str).trim().match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (!m) return null;
  const d = m[1].padStart(2, '0');
  const mo = m[2].padStart(2, '0');
  let y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : refYear;
  return `${y}-${mo}-${d}`;
}

export default function IngresoDiario() {
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(false);
  const [movimientos, setMovimientos] = useState([]);
  const [grupos, setGrupos] = useState([]); // {numero_grupo, titular, socio_id}
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [activeTab, setActiveTab] = useState('manual');
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [searchFilter, setSearchFilter] = useState('');
  const [saving, setSaving] = useState(false);

  // Manual form state
  const [formData, setFormData] = useState({
    fecha: todayISO(),
    numero_grupo: '',
    monto: '',
    medio_pago: 'TRANSFERENCIA',
    banco: 'CREDICOOP',
    comprobante: '',
    observaciones: '',
  });

  // Extracto paste state
  const [extractoText, setExtractoText] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [extractoBanco, setExtractoBanco] = useState('CREDICOOP');
  const [extractoFechaRef, setExtractoFechaRef] = useState(todayISO());
  const [extractoFechaMetodo, setExtractoFechaMetodo] = useState('detect'); // 'detect' or 'force'

  // Efectivo form
  const [efectivoData, setEfectivoData] = useState({
    fecha: todayISO(),
    numero_grupo: '',
    monto: '',
    recibo: '',
    observaciones: '',
  });

  // Efectivo Lote state
  const [efectivoSubTab, setEfectivoSubTab] = useState('lote'); // 'lote' or 'individual'
  const [efectivoLoteText, setEfectivoLoteText] = useState('');
  const [efectivoLoteRows, setEfectivoLoteRows] = useState([]);
  const [efectivoPeriodoTarget, setEfectivoPeriodoTarget] = useState('2026-01');
  const [efectivoFechaMetodo, setEfectivoFechaMetodo] = useState('detect'); // 'detect' or 'force'
  const [efectivoFechaRef, setEfectivoFechaRef] = useState(todayISO());

  useEffect(() => {
    fetchData();
  }, [selectedPeriod]);

  async function fetchData() {
    setLoading(true);
    try {
      await Promise.all([fetchMovimientos(), fetchGrupos(), fetchLiquidaciones()]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMovimientos() {
    const { data, error } = await supabase
      .from('movimientos_bancarios')
      .select('*')
      .in('origen', ['DIARIO', 'EXTRACTO'])
      .eq('periodo', selectedPeriod)
      .order('fecha_movimiento', { ascending: false });
    if (error) { console.error(error); return; }
    setMovimientos(data || []);
  }

  async function fetchGrupos() {
    if (grupos.length > 0) return; // cached
    const { data, error } = await supabase
      .from('grupo_socio')
      .select('numero_grupo, socio_id, es_titular, socios:socio_id(nombre_completo, socio_id, cuit, dni)')
      .order('numero_grupo');
    if (error) { console.error(error); return; }

    const grupoMap = {};
    (data || []).forEach(g => {
      const gNum = g.numero_grupo;
      if (!grupoMap[gNum]) {
        grupoMap[gNum] = {
          numero_grupo: gNum,
          titular: 'Sin titular',
          socio_id: g.socio_id,
          socios: []
        };
      }
      if (g.es_titular && g.socios?.nombre_completo) {
        grupoMap[gNum].titular = g.socios.nombre_completo;
        grupoMap[gNum].socio_id = g.socios.socio_id || g.socio_id;
      }
      if (g.socios) {
        grupoMap[gNum].socios.push({
          socio_id: g.socios.socio_id || g.socio_id,
          nombre_completo: g.socios.nombre_completo || '',
          cuit: g.socios.cuit ? String(g.socios.cuit).replace(/\D/g, '') : '',
          dni: g.socios.dni ? String(g.socios.dni).replace(/\D/g, '') : '',
          es_titular: g.es_titular
        });
      }
    });
    setGrupos(Object.values(grupoMap));
  }

  async function fetchLiquidaciones() {
    const { data, error } = await supabase
      .from('liquidaciones_grupos')
      .select('liquidacion_id, numero_grupo, periodo, monto_total_facturado, monto_abonado, estado_pago, proveedor_id')
      .eq('periodo', selectedPeriod);
    if (error) { console.error(error); return; }
    setLiquidaciones(data || []);
  }

  // Find grupo info by number
  const getGrupo = useCallback((num) => {
    const n = parseInt(num);
    return grupos.find(g => g.numero_grupo === n);
  }, [grupos]);

  // Auto-link payment to a pending liquidación in DB
  async function linkPaymentToDebt(movimientoId, grupoNum, monto, targetPeriod = selectedPeriod, updateState = true) {
    const numGrupo = parseInt(grupoNum, 10);
    if (isNaN(numGrupo) || !monto || monto <= 0) return;

    // Buscar liquidaciones pendientes directamente de la DB para este grupo y período
    const { data: dbLiqs } = await supabase
      .from('liquidaciones_grupos')
      .select('*')
      .eq('numero_grupo', numGrupo)
      .eq('periodo', targetPeriod)
      .order('monto_total_facturado', { ascending: false });

    if (!dbLiqs || dbLiqs.length === 0) return;

    let remaining = monto;

    for (const liq of dbLiqs) {
      if (remaining <= 0) break;

      const facturado = parseFloat(liq.monto_total_facturado) || 0;
      const abonadoActual = parseFloat(liq.monto_abonado) || 0;
      const deuda = facturado - abonadoActual;

      if (deuda <= 0) continue;

      const aplicar = Math.min(remaining, deuda);
      const nuevoAbonado = abonadoActual + aplicar;
      const nuevoEstado = nuevoAbonado >= facturado - 0.05 ? 'ABONADO' : 'PARCIAL';

      // Update liquidación en DB
      await supabase
        .from('liquidaciones_grupos')
        .update({
          monto_abonado: nuevoAbonado,
          estado_pago: nuevoEstado,
          updated_at: new Date().toISOString()
        })
        .eq('liquidacion_id', liq.liquidacion_id);

      // Link movimiento to this liquidación
      if (movimientoId) {
        await supabase
          .from('movimientos_bancarios')
          .update({ liquidacion_id: liq.liquidacion_id })
          .eq('movimiento_id', movimientoId);
      }

      // Update local state if needed
      if (updateState) {
        setLiquidaciones(prev => prev.map(l =>
          l.liquidacion_id === liq.liquidacion_id
            ? { ...l, monto_abonado: nuevoAbonado, estado_pago: nuevoEstado }
            : l
        ));
      }

      remaining -= aplicar;
    }

    return remaining <= 0;
  }

  // MANUAL PAYMENT
  async function handleSaveManual() {
    const grupo = getGrupo(formData.numero_grupo);
    if (!formData.numero_grupo || !formData.monto || parseFloat(formData.monto) <= 0) {
      addToast('Completá grupo y monto', 'warning');
      return;
    }

    setSaving(true);
    try {
      const monto = parseFloat(formData.monto);
      const periodo = formData.fecha.substring(0, 7);

      const record = {
        fecha_movimiento: formData.fecha,
        concepto: grupo ? `Pago manual - ${grupo.titular}` : `Pago manual - Grupo ${formData.numero_grupo}`,
        monto: monto,
        banco: formData.banco,
        tipo_movimiento: 'INGRESO',
        origen: 'DIARIO',
        numero_grupo: parseInt(formData.numero_grupo),
        nombre_socio: grupo?.titular || '',
        medio_pago: formData.medio_pago,
        comprobante: formData.comprobante,
        observaciones: formData.observaciones,
        periodo: periodo,
        socio_id: grupo?.socio_id || null,
      };

      const { data, error } = await supabase
        .from('movimientos_bancarios')
        .insert(record)
        .select()
        .single();

      if (error) throw error;

      // Link to debt
      await linkPaymentToDebt(data.movimiento_id, formData.numero_grupo, monto);

      // Audit
      await supabase.from('audit_log').insert({
        tipo_evento: 'INGRESO_DIARIO',
        descripcion: `Pago ${formData.medio_pago} registrado: Grupo ${formData.numero_grupo} (${grupo?.titular || 'S/N'}) $${monto.toFixed(2)} - ${formData.banco}`,
        monto,
        usuario: 'dante@admin.com'
      });

      addToast(`Pago de $${fmt(monto)} registrado para Grupo ${formData.numero_grupo}`, 'success');

      // Reset form & refresh
      setFormData(prev => ({ ...prev, numero_grupo: '', monto: '', comprobante: '', observaciones: '' }));
      await fetchMovimientos();
      await fetchLiquidaciones();
    } catch (err) {
      console.error(err);
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // EFECTIVO PAYMENT (INDIVIDUAL)
  async function handleSaveEfectivo() {
    const grupo = getGrupo(efectivoData.numero_grupo);
    if (!efectivoData.numero_grupo || !efectivoData.monto || parseFloat(efectivoData.monto) <= 0) {
      addToast('Completá grupo y monto', 'warning');
      return;
    }

    setSaving(true);
    try {
      const monto = parseFloat(efectivoData.monto);
      const periodo = efectivoPeriodoTarget || efectivoData.fecha.substring(0, 7);
      const titularLabel = grupo?.titular || `Grupo ${efectivoData.numero_grupo}`;

      const record = {
        fecha_movimiento: efectivoData.fecha,
        concepto: `Pago en efectivo - ${titularLabel}`,
        monto,
        ingreso_bruto: monto,
        impuestos: 0,
        banco: 'EFECTIVO',
        tipo_movimiento: 'INGRESO',
        origen: 'DIARIO',
        numero_grupo: parseInt(efectivoData.numero_grupo, 10),
        nombre_socio: titularLabel,
        medio_pago: 'EFECTIVO',
        comprobante: efectivoData.recibo || '',
        observaciones: efectivoData.observaciones || 'Pago presencial en la mutual',
        periodo,
        socio_id: grupo?.socio_id || null,
      };

      const { data, error } = await supabase.from('movimientos_bancarios').insert(record).select().single();
      if (error) throw error;

      // Registrar en cuenta corriente
      await registrarCobroCuenta({
        numero_grupo: parseInt(efectivoData.numero_grupo, 10),
        nombre: titularLabel,
        importe: monto,
        medio_pago: 'EFECTIVO',
        observaciones: `Cobro Efectivo (Presencial) - ${efectivoData.observaciones || efectivoData.recibo || ''}`,
        fecha: efectivoData.fecha
      });

      await linkPaymentToDebt(data.movimiento_id, efectivoData.numero_grupo, monto);

      await supabase.from('audit_log').insert({
        tipo_evento: 'INGRESO_DIARIO',
        descripcion: `Pago EFECTIVO: Grupo ${efectivoData.numero_grupo} $${monto.toFixed(2)}`,
        monto,
        usuario: 'dante@admin.com'
      });

      addToast(`Efectivo $${fmt(monto)} registrado — Grupo ${efectivoData.numero_grupo}`, 'success');
      setEfectivoData(prev => ({ ...prev, numero_grupo: '', monto: '', recibo: '', observaciones: '' }));
      await fetchMovimientos();
      await fetchLiquidaciones();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // PARSE EFECTIVO LOTE (EXCEL / TEXT BLOCK)
  async function handleParseEfectivoLote() {
    if (!efectivoLoteText.trim()) {
      addToast('Pegá el bloque de cobros en efectivo primero', 'warning');
      return;
    }

    // Consultar movimientos en efectivo ya cargados para este período para evitar duplicados
    const { data: existingCashMovs } = await supabase
      .from('movimientos_bancarios')
      .select('movimiento_id, fecha_movimiento, monto, numero_grupo, concepto, comprobante')
      .eq('periodo', efectivoPeriodoTarget)
      .eq('banco', 'EFECTIVO');

    const lines = efectivoLoteText.trim().split('\n');
    const parsed = [];
    let duplicateCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Separar por tabulaciones o por 2 o más espacios consecutivos (para cuando se copia/pega como texto plano)
      const parts = line.split(/\t+/).length > 2
        ? line.split(/\t+/).map(p => p.trim()).filter(Boolean)
        : line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);

      if (parts.length < 2) continue;

      let fecha = todayISO();
      let grupo = '';
      let titular = '';
      let empresa = '';
      let monto = 0;
      let linea = '';
      let observaciones = '';

      // 1. Fecha: buscar en las partes o en toda la línea
      for (const p of parts) {
        const dMatch = p.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (dMatch) {
          const day = dMatch[1].padStart(2, '0');
          const month = dMatch[2].padStart(2, '0');
          const year = dMatch[3].length === 2 ? '20' + dMatch[3] : dMatch[3];
          fecha = `${year}-${month}-${day}`;
          break;
        }
      }
      if (!fecha || fecha === todayISO()) {
        const lineDateMatch = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
        if (lineDateMatch) {
          fecha = `${lineDateMatch[3]}-${lineDateMatch[2].padStart(2, '0')}-${lineDateMatch[1].padStart(2, '0')}`;
        }
      }

      // 2. Monto: buscar primero importes con formato moneda
      for (const p of parts) {
        if (p.includes('$') || /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(p) || /^\d+[\.,]\d{2}$/.test(p)) {
          const num = parseArgentineOrUSNumber(p);
          if (num > 0 && monto === 0) {
            monto = num;
          }
        }
      }
      // Fallback para monto en toda la línea
      if (monto === 0) {
        const moneyMatches = line.match(/\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g);
        if (moneyMatches && moneyMatches.length > 0) {
          const lastMoney = moneyMatches[moneyMatches.length - 1];
          monto = parseArgentineOrUSNumber(lastMoney);
        }
      }

      // 3. Grupo: buscar formato 'GPO: 128', 'GRUPO 128', o número de grupo en cualquier parte
      const gpoInLine = line.match(/\b(?:GPO|GRUPO):?\s*(\d{1,6})\b/i);
      if (gpoInLine) {
        grupo = gpoInLine[1];
      }
      if (!grupo) {
        for (const p of parts) {
          const gpoMatch = p.match(/\b(?:GPO|GRUPO):?\s*(\d{1,6})\b/i);
          if (gpoMatch && !grupo) {
            grupo = gpoMatch[1];
          }
          if (/^\d{1,5}$/.test(p) && !p.includes('$') && !grupo) {
            const n = parseInt(p, 10);
            if (n > 0 && n < 100000) {
              grupo = p;
            }
          }
        }
      }

      // 4. Titular en partes
      for (const p of parts) {
        if ((p.includes(',') || p.toLowerCase().includes('s/ socios')) && !p.includes('$') && isNaN(parseFloat(p.replace(/,/g, '')))) {
          titular = p.replace(/\s+S\/\s+SOCIOS.*$/i, '').trim();
          break;
        }
      }

      // 5. Empresa / Operadora
      const empMatch = line.match(/\b(CLARO|PERSONAL|MOVISTAR)\b/i);
      if (empMatch) {
        empresa = empMatch[1].toUpperCase();
      }

      // 6. Línea
      const phoneMatch = line.match(/\b(11\d{8}|221\d{7}|\d{10})\b/);
      if (phoneMatch) {
        linea = phoneMatch[1];
      }

      // 4b. Titular: extraer formato 'Apellido, Nombre'
      if (!titular) {
        const nameMatch = line.match(/([A-ZÁÉÍÓÚÑa-záéíóúñ]+,\s*[A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)*)/);
        if (nameMatch) {
          titular = nameMatch[1].replace(/\b(CLARO|PERSONAL|MOVISTAR)\b/i, '').replace(/\s+S\/\s+SOCIOS.*$/i, '').trim();
        }
      }

      // 2b. Fallback para montos enteros o sin signo pesos (ej: 50000 o 50000.00)
      if (monto === 0) {
        const tokens = line.split(/\s+/);
        for (const t of tokens) {
          // Si el token parece fecha (contiene / o -) no parsearlo como número
          if (t.includes('/') || (t.includes('-') && !t.startsWith('-'))) continue;
          const cleanT = t.replace(/[^0-9.,]/g, '');
          if (!cleanT) continue;
          // Ignorar si es el grupo o la línea telefónica
          if (cleanT === grupo || cleanT === linea) continue;
          const val = parseArgentineOrUSNumber(cleanT);
          // Un importe razonable no es el año 2026 ni números de 8+ cifras
          if (val > 0 && val < 5000000 && val !== 2026) {
            monto = val;
            break;
          }
        }
      }

      // 7. Observaciones
      if (line.toLowerCase().includes('a favor')) {
        observaciones = 'Saldo a favor';
      } else if (linea) {
        observaciones = `Línea ${linea}`;
      }

      const gNum = parseInt(grupo, 10);
      const grupoObj = !isNaN(gNum) ? getGrupo(gNum) : null;
      const finalTitular = titular || grupoObj?.titular || `Grupo ${grupo || 'S/N'}`;

      if (monto > 0 && !isNaN(gNum)) {
        const isDuplicate = (existingCashMovs || []).some(e => {
          if (Number(e.numero_grupo) !== gNum) return false;
          if (Math.abs(Number(e.monto || 0) - monto) > 0.05) return false;
          if (e.fecha_movimiento !== fecha) return false;
          if (linea && String(e.comprobante || e.concepto || '').includes(linea)) return true;
          return true;
        });

        if (isDuplicate) {
          duplicateCount++;
        }

        parsed.push({
          id: Math.random().toString(36).substr(2, 9),
          fecha,
          numero_grupo: gNum,
          titular: finalTitular,
          empresa: empresa || 'GENERAL',
          monto,
          linea,
          observaciones: observaciones || (linea ? `Línea: ${linea}` : 'Cobro Efectivo'),
          alreadyRegistered: isDuplicate,
          include: !isDuplicate
        });
      }
    }

    if (parsed.length === 0) {
      addToast('No se pudieron detectar pagos válidos en el texto pegado', 'warning');
      return;
    }

    setEfectivoLoteRows(parsed);
    if (duplicateCount > 0) {
      addToast(`${parsed.length} pagos detectados (${duplicateCount} omitidos por ya estar registrados en DB)`, 'info');
    } else {
      addToast(`${parsed.length} pagos en efectivo detectados y listos para imputar`, 'success');
    }
  }

  // SAVE EFECTIVO LOTE
  async function handleSaveEfectivoLote() {
    const toSave = efectivoLoteRows.filter(r => r.include && r.monto > 0);
    if (toSave.length === 0) {
      addToast('No hay pagos seleccionados para guardar', 'warning');
      return;
    }

    const totalMonto = toSave.reduce((s, r) => s + r.monto, 0);
    const accepted = await confirm({
      title: 'Confirmar Lote de Cobros en Efectivo',
      message: `¿Deseas registrar e imputar ${toSave.length} pagos en efectivo por un total de $${fmt(totalMonto)}?\n\n📌 Período a imputar deuda: ${efectivoPeriodoTarget}\n\nEsto registrará los pagos en movimientos bancarios (Caja Efectivo), actualizará la cuenta corriente y cancelará las facturas correspondientes.`,
      confirmText: 'Confirmar e Imputar',
      cancelText: 'Cancelar'
    });
    if (!accepted) return;

    setSaving(true);
    try {
      let saved = 0;
      let skipped = 0;

      // Re-consultar DB para garantizar cero duplicados en concurrencia
      const { data: currentCashMovs } = await supabase
        .from('movimientos_bancarios')
        .select('movimiento_id, fecha_movimiento, monto, numero_grupo, concepto, comprobante')
        .eq('periodo', efectivoPeriodoTarget)
        .eq('banco', 'EFECTIVO');

      const processRow = async (row) => {
        // Control estricto anti-duplicados antes de insertar
        const isAlreadyInDb = (currentCashMovs || []).some(e => {
          if (Number(e.numero_grupo) !== row.numero_grupo) return false;
          if (Math.abs(Number(e.monto || 0) - row.monto) > 0.05) return false;
          if (e.fecha_movimiento !== row.fecha) return false;
          if (row.linea && String(e.comprobante || e.concepto || '').includes(row.linea)) return true;
          return true;
        });

        if (isAlreadyInDb) {
          return { status: 'skipped' };
        }

        const grupo = getGrupo(row.numero_grupo);
        const titularLabel = row.titular || grupo?.titular || `Grupo ${row.numero_grupo}`;

        // 1. Insert in movimientos_bancarios (Caja Efectivo con concepto único por línea)
        const conceptoUnico = row.linea
          ? `Cobro Efectivo - ${row.empresa} (${titularLabel} - Línea ${row.linea})`
          : `Cobro Efectivo - ${row.empresa} (${titularLabel})`;

        const record = {
          fecha_movimiento: row.fecha,
          concepto: conceptoUnico,
          monto: row.monto,
          ingreso_bruto: row.monto,
          impuestos: 0,
          banco: 'EFECTIVO',
          tipo_movimiento: 'INGRESO',
          origen: 'DIARIO',
          numero_grupo: row.numero_grupo,
          nombre_socio: titularLabel,
          medio_pago: 'EFECTIVO',
          comprobante: row.linea || '',
          observaciones: row.observaciones,
          periodo: efectivoPeriodoTarget,
          socio_id: grupo?.socio_id || null,
        };

        const { data: bncData, error: bncErr } = await supabase
          .from('movimientos_bancarios')
          .insert(record)
          .select()
          .single();

        if (bncErr) {
          console.error(bncErr);
          return { status: 'error', error: bncErr };
        }

        // 2. Registrar cobro en cuenta corriente (cuentaCorrienteService con proteccion anti-duplicados)
        try {
          await registrarCobroCuenta({
            numero_grupo: row.numero_grupo,
            nombre: titularLabel,
            importe: row.monto,
            medio_pago: 'EFECTIVO',
            observaciones: `Cobro Efectivo (${row.empresa}) - ${row.observaciones}`,
            fecha: row.fecha
          });
        } catch (ccErr) {
          console.warn('Aviso CC:', ccErr);
        }

        // 3. Vincular directamente con la liquidación de deuda del período destino
        if (bncData?.movimiento_id) {
          await linkPaymentToDebt(bncData.movimiento_id, row.numero_grupo, row.monto, efectivoPeriodoTarget, false);
        }

        return { status: 'saved' };
      };

      const results = [];
      for (const row of toSave) {
        const res = await processRow(row);
        results.push(res);
      }
      saved = results.filter(r => r.status === 'saved').length;
      skipped = results.filter(r => r.status === 'skipped').length;

      await supabase.from('audit_log').insert({
        tipo_evento: 'INGRESO_EFECTIVO_LOTE',
        descripcion: `Lote Efectivo: ${saved} cobros imputados a período ${efectivoPeriodoTarget}${skipped > 0 ? ` (${skipped} omitidos por duplicados)` : ''}`,
        monto: totalMonto,
        usuario: 'dante@admin.com'
      });

      if (skipped > 0) {
        addToast(`✓ ${saved} pagos guardados (${skipped} omitidos para evitar duplicados)`, 'success');
      } else {
        addToast(`✓ ${saved} pagos en efectivo registrados e imputados a ${efectivoPeriodoTarget}`, 'success');
      }
      setEfectivoLoteText('');
      setEfectivoLoteRows([]);
      await fetchMovimientos();
      await fetchLiquidaciones();
    } catch (err) {
      console.error(err);
      addToast(`Error al guardar lote: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // PARSE EXTRACTO (Soporte universal para Banco Nación, Credicoop, etc. y copiado desde Excel)
  function handleParseExtracto() {
    if (!extractoText.trim()) { addToast('Pegá el extracto primero', 'warning'); return; }

    const rawLines = extractoText.split(/\r?\n/).map(l => l.replace(/[\r\n]+$/, '')).filter(l => l.trim() !== '');
    if (rawLines.length === 0) { addToast('El texto pegado está vacío', 'warning'); return; }

    const refYear = extractoFechaRef.substring(0, 4) || '2026';
    const parsed = [];

    // 1. Detectar si la primera fila es encabezado
    const firstParts = rawLines[0].includes('\t')
      ? rawLines[0].split('\t').map(p => p.trim())
      : rawLines[0].split(/\s{2,}/).map(p => p.trim());

    const firstUpper = firstParts.map(p => p.toUpperCase());
    const hasHeader = firstUpper.some(h => 
      h.includes('FECHA') || h.includes('CONCEPTO') || h.includes('MONTO') || h.includes('GRUPO') || h.includes('IMPORTE')
    );

    let colMap = {
      grupo: -1,
      fecha: -1,
      concepto: -1,
      monto: -1,
      comprobante: -1,
      saldo: -1,
      titular: -1
    };

    let dataLines = rawLines;

    if (hasHeader) {
      colMap.grupo = firstUpper.findIndex(h => h.includes('GRUPO') || h === 'GPO');
      colMap.fecha = firstUpper.findIndex(h => h.includes('FECHA'));
      colMap.concepto = firstUpper.findIndex(h => h.includes('CONCEPTO') || h.includes('MOVIMIENTO') || h.includes('DETALLE') || h.includes('DESCRIP'));
      colMap.comprobante = firstUpper.findIndex(h => h.includes('COMPROB') || h.includes('CPBTE') || h.includes('TICKET'));
      colMap.monto = firstUpper.findIndex(h => h === 'MONTO' || h === 'IMPORTE' || h === 'VALOR' || h.includes('CREDIT') || h.includes('CRÉDIT'));
      colMap.saldo = firstUpper.findIndex(h => h.includes('SALDO'));
      colMap.titular = firstUpper.findIndex(h => h.includes('APELLIDO') || h.includes('NOMBRE') || h.includes('TITULAR') || h.includes('SOCIO') || h.includes('CLIENTE'));
      dataLines = rawLines.slice(1);
    }

    for (const line of dataLines) {
      if (!line || line.trim().length < 5) continue;

      let parts = line.includes('\t')
        ? line.split('\t').map(p => p.trim())
        : line.split(/\s{2,}/).map(p => p.trim());

      if (parts.length < 2) continue;

      // Protección contra corrimiento: Si la fila no traía tab inicial para columna GRUPO vacía
      if (hasHeader && colMap.grupo === 0 && colMap.fecha === 1 && parseDateAR(parts[0], refYear)) {
        parts.unshift('');
      }

      let rawGrupo = '';
      let rawFecha = '';
      let rawConcepto = '';
      let rawMonto = '';
      let rawComprobante = '';
      let rawTitular = '';

      if (hasHeader && (colMap.fecha !== -1 || colMap.monto !== -1)) {
        if (colMap.grupo !== -1 && parts[colMap.grupo]) rawGrupo = parts[colMap.grupo];
        if (colMap.fecha !== -1 && parts[colMap.fecha]) rawFecha = parts[colMap.fecha];
        if (colMap.concepto !== -1 && parts[colMap.concepto]) rawConcepto = parts[colMap.concepto];
        if (colMap.monto !== -1 && parts[colMap.monto]) rawMonto = parts[colMap.monto];
        if (colMap.comprobante !== -1 && parts[colMap.comprobante]) rawComprobante = parts[colMap.comprobante];
        if (colMap.titular !== -1 && parts[colMap.titular]) rawTitular = parts[colMap.titular];
      } else {
        // Detección heurística inteligente sin encabezado
        if (/^\d{1,6}$/.test(parts[0]) && parseDateAR(parts[1], refYear)) {
          rawGrupo = parts[0];
          rawFecha = parts[1];
          rawConcepto = parts[2] || '';
          rawMonto = parts[3] || '';
          if (parts[5]) rawTitular = parts[5];
        } else if (parseDateAR(parts[0], refYear)) {
          rawFecha = parts[0];
          rawConcepto = parts[1] || '';
          for (let i = 2; i < parts.length; i++) {
            const parsedAmt = parseUniversalAmount(parts[i]);
            if (parsedAmt.amount > 0) {
              rawMonto = parts[i];
              break;
            }
          }
        } else {
          for (const p of parts) {
            if (!rawFecha && parseDateAR(p, refYear)) {
              rawFecha = p;
            } else if (!rawMonto && parseUniversalAmount(p).amount > 0 && (p.includes('$') || p.includes(',') || p.includes('.'))) {
              rawMonto = p;
            } else if (p.length > rawConcepto.length && isNaN(parseFloat(p.replace(/[$.,]/g, '')))) {
              rawConcepto = p;
            }
          }
        }
      }

      // 1. Determinar Fecha
      let fecha = extractoFechaRef;
      if (extractoFechaMetodo === 'detect' && rawFecha) {
        const detected = parseDateAR(rawFecha, refYear);
        if (detected) fecha = detected;
      }

      // 2. Determinar Monto y signo (detectar gravámenes/impuestos bancarios)
      const { amount: monto, isNegative } = parseUniversalAmount(rawMonto);
      if (monto === 0) continue;

      const upperConcepto = (rawConcepto || '').toUpperCase();
      const isTax = isNegative ||
        upperConcepto.includes('GRAVAMEN') ||
        upperConcepto.includes('LEY 25413') ||
        upperConcepto.includes('IMPUESTO') ||
        upperConcepto.includes('COMISION') ||
        upperConcepto.includes('MANTENIMIENTO') ||
        upperConcepto.includes('IVA') ||
        upperConcepto.includes('PERCEPCION') ||
        upperConcepto.includes('RETENCION');

      // 3. Determinar Grupo
      let grupoMatch = null;
      let socioMatch = null;

      // 3.1 Directo de la columna Grupo
      if (rawGrupo) {
        const gNum = parseInt(String(rawGrupo).replace(/\D/g, ''), 10);
        if (!isNaN(gNum) && gNum > 0) {
          grupoMatch = gNum;
        }
      }

      // 3.2 Buscar en concepto si dice 'GRUPO 128' o 'GPO: 128'
      if (!grupoMatch && rawConcepto) {
        const normConcepto = rawConcepto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const grupoPattern = normConcepto.match(/\b(?:grupo|gpo|g)[- _#]*(\d{1,6})\b/i);
        if (grupoPattern) {
          const gNum = parseInt(grupoPattern[1], 10);
          if (grupos.some(g => g.numero_grupo === gNum)) {
            grupoMatch = gNum;
          }
        }
      }

      // 3.3 Buscar por CUIT (11 dígitos) en concepto
      if (!grupoMatch && rawConcepto) {
        const cuitMatch = rawConcepto.match(/\b(20|23|24|27|30|33)\d{8}\d?\b/);
        if (cuitMatch) {
          const rawCuit = cuitMatch[0];
          for (const g of grupos) {
            const foundSocio = (g.socios || []).find(s => s.cuit === rawCuit);
            if (foundSocio) {
              grupoMatch = g.numero_grupo;
              socioMatch = foundSocio;
              break;
            }
          }
        }
      }

      // 3.4 Buscar por DNI (7 u 8 dígitos) en concepto
      if (!grupoMatch && rawConcepto) {
        const dniMatch = rawConcepto.match(/\b\d{7,8}\b/);
        if (dniMatch) {
          const rawDni = dniMatch[0];
          for (const g of grupos) {
            const foundSocio = (g.socios || []).find(s => s.dni === rawDni || s.cuit?.includes(rawDni));
            if (foundSocio) {
              grupoMatch = g.numero_grupo;
              socioMatch = foundSocio;
              break;
            }
          }
        }
      }

      // 3.5 Búsqueda difusa por Nombre/Titular
      const nameCandidate = rawTitular || rawConcepto;
      if (!grupoMatch && nameCandidate) {
        let rawName = nameCandidate;
        const tagMatch = nameCandidate.match(/(?:VAR|FAC|CUO|HON)[- ]+([A-Za-z\s,.'´]+?)(?:\s+CBU|\s*$)/i);
        if (tagMatch) rawName = tagMatch[1];

        const normTransferWords = rawName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .split(/[^a-z0-9]+/)
          .filter(w => w.length >= 3 && !['transf', 'dist', 'titular', 'inmediata', 'ctas', 'credito', 'debin', 'origen', 'banco', 'var', 'fac', 'cuo', 'cuit', 'cuil'].includes(w));

        if (normTransferWords.length > 0) {
          let bestG = null;
          let bestScore = 0;

          for (const g of grupos) {
            const candidates = g.socios && g.socios.length > 0 
              ? g.socios 
              : [{ socio_id: g.socio_id, nombre_completo: g.titular }];

            for (const s of candidates) {
              const socioWords = (s.nombre_completo || '')
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .split(/[^a-z0-9]+/)
                .filter(w => w.length >= 3);

              let matchCount = 0;
              for (const tw of normTransferWords) {
                if (socioWords.some(sw => sw === tw || (sw.length > 4 && tw.length > 4 && (sw.includes(tw) || tw.includes(sw))))) {
                  matchCount++;
                }
              }

              const maxWords = Math.max(socioWords.length, normTransferWords.length);
              const score = matchCount + (matchCount / maxWords);

              if (matchCount >= 2 && score > bestScore) {
                bestScore = score;
                bestG = g.numero_grupo;
                socioMatch = s;
              }
            }
          }

          if (bestG) {
            grupoMatch = bestG;
          }
        }
      }

      const matchedGrupoObj = grupoMatch ? getGrupo(grupoMatch) : null;
      const finalTitular = rawTitular || socioMatch?.nombre_completo || matchedGrupoObj?.titular || '';

      parsed.push({
        id: Math.random().toString(36).substr(2, 9),
        fecha,
        concepto: rawConcepto,
        monto,
        comprobante: rawComprobante,
        numero_grupo: grupoMatch || '',
        nombre_socio: finalTitular,
        socio_id: socioMatch?.socio_id || matchedGrupoObj?.socio_id || null,
        isTax,
        include: !isTax && monto > 0 && grupoMatch !== null,
      });
    }

    if (parsed.length === 0) {
      addToast('No se pudieron detectar movimientos en el texto pegado', 'warning');
      return;
    }

    const totalValid = parsed.filter(r => !r.isTax).length;
    const totalTaxes = parsed.filter(r => r.isTax).length;

    setParsedRows(parsed);
    addToast(`${parsed.length} filas analizadas (${totalValid} pagos detectados, ${totalTaxes} impuestos/gravámenes desmarcados)`, 'success');
  }

  // GUARDAR EXTRACTO
  async function handleSaveExtracto() {
    const toSave = parsedRows.filter(r => r.include && r.monto > 0 && !r.isTax);
    if (toSave.length === 0) { addToast('No hay movimientos seleccionados para guardar', 'warning'); return; }

    setSaving(true);
    try {
      let saved = 0;
      for (const row of toSave) {
        const periodo = row.fecha.substring(0, 7);
        const grupo = row.numero_grupo ? getGrupo(row.numero_grupo) : null;
        const titularNombre = row.nombre_socio || grupo?.titular || (row.numero_grupo ? `Grupo ${row.numero_grupo}` : '');

        const record = {
          fecha_movimiento: row.fecha,
          concepto: row.concepto || `Transferencia ${extractoBanco} - ${titularNombre}`,
          monto: row.monto,
          ingreso_bruto: row.monto,
          impuestos: 0,
          banco: extractoBanco,
          tipo_movimiento: 'INGRESO',
          origen: 'EXTRACTO',
          numero_grupo: row.numero_grupo ? parseInt(row.numero_grupo, 10) : null,
          nombre_socio: titularNombre,
          medio_pago: 'TRANSFERENCIA',
          comprobante: row.comprobante || '',
          periodo,
          socio_id: grupo?.socio_id || null,
        };

        const { data, error } = await supabase.from('movimientos_bancarios').insert(record).select().single();
        if (error) { console.error('Error insertando movimiento bancario:', error); continue; }

        if (row.numero_grupo) {
          // Registrar en cuenta corriente
          await registrarCobroCuenta({
            numero_grupo: parseInt(row.numero_grupo, 10),
            nombre: titularNombre,
            importe: row.monto,
            medio_pago: 'TRANSFERENCIA',
            observaciones: `Extracto ${extractoBanco} - ${row.concepto || ''}`,
            fecha: row.fecha
          });

          await linkPaymentToDebt(data.movimiento_id, row.numero_grupo, row.monto);
        }
        saved++;
      }

      await supabase.from('audit_log').insert({
        tipo_evento: 'INGRESO_EXTRACTO',
        descripcion: `Extracto ${extractoBanco}: ${saved} movimientos importados`,
        monto: toSave.reduce((a, r) => a + r.monto, 0),
        usuario: 'dante@admin.com'
      });

      addToast(`${saved} pagos importados e imputados del extracto ${extractoBanco}`, 'success');
      setExtractoText('');
      setParsedRows([]);
      await fetchMovimientos();
      await fetchLiquidaciones();
    } catch (err) {
      console.error(err);
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // DELETE movement + revert debt
  async function handleDelete(mov) {
    const ok = await confirm({
      title: 'Eliminar movimiento',
      message: `¿Eliminar pago de $${fmt(mov.monto)} ${mov.nombre_socio ? `(${mov.nombre_socio})` : ''}? Se revertirá el monto en la deuda del grupo.`,
      confirmText: 'Eliminar',
      variant: 'danger'
    });
    if (!ok) return;

    try {
      // Revert debt if linked
      if (mov.liquidacion_id) {
        const liq = liquidaciones.find(l => l.liquidacion_id === mov.liquidacion_id);
        if (liq) {
          const newAbonado = Math.max(0, parseFloat(liq.monto_abonado) - mov.monto);
          const facturado = parseFloat(liq.monto_total_facturado) || 0;
          const newEstado = newAbonado >= facturado - 0.05 ? 'ABONADO' : 'PENDIENTE';

          await supabase.from('liquidaciones_grupos')
            .update({ monto_abonado: newAbonado, estado_pago: newEstado, updated_at: new Date().toISOString() })
            .eq('liquidacion_id', mov.liquidacion_id);
        }
      }

      await supabase.from('movimientos_bancarios').delete().eq('movimiento_id', mov.movimiento_id);

      await supabase.from('audit_log').insert({
        tipo_evento: 'INGRESO_ELIMINADO',
        descripcion: `Pago eliminado: Grupo ${mov.numero_grupo || 'S/N'} $${mov.monto} - ${mov.banco}`,
        monto: -mov.monto,
        usuario: 'dante@admin.com'
      });

      addToast('Movimiento eliminado y deuda revertida', 'success');
      await fetchMovimientos();
      await fetchLiquidaciones();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
    }
  }

  // KPIs
  const kpis = useMemo(() => {
    const today = todayISO();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const todayMovs = movimientos.filter(m => m.fecha_movimiento === today);
    const weekMovs = movimientos.filter(m => m.fecha_movimiento >= weekAgo);

    const linked = movimientos.filter(m => m.liquidacion_id !== null);
    const unlinked = movimientos.filter(m => m.liquidacion_id === null);

    return {
      todayCount: todayMovs.length,
      todayTotal: todayMovs.reduce((a, m) => a + parseFloat(m.monto || 0), 0),
      weekCount: weekMovs.length,
      weekTotal: weekMovs.reduce((a, m) => a + parseFloat(m.monto || 0), 0),
      monthCount: movimientos.length,
      monthTotal: movimientos.reduce((a, m) => a + parseFloat(m.monto || 0), 0),
      linkedCount: linked.length,
      linkedTotal: linked.reduce((a, m) => a + parseFloat(m.monto || 0), 0),
      unlinkedCount: unlinked.length,
    };
  }, [movimientos]);

  // Filtered movs for table
  const filteredMovs = useMemo(() => {
    if (!searchFilter.trim()) return movimientos;
    const q = searchFilter.toLowerCase();
    return movimientos.filter(m =>
      (m.numero_grupo?.toString() || '').includes(q) ||
      (m.nombre_socio || '').toLowerCase().includes(q) ||
      (m.concepto || '').toLowerCase().includes(q)
    );
  }, [movimientos, searchFilter]);

  // Grupo autocomplete filtered
  const grupoSuggestions = useCallback((input) => {
    if (!input) return [];
    const q = input.toString().toLowerCase();
    return grupos.filter(g =>
      g.numero_grupo.toString().startsWith(q) ||
      g.titular.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [grupos]);

  // Shared styles
  const tabStyle = (isActive) => ({
    padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 700,
    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
    background: isActive ? 'var(--accent)' : 'var(--surface)',
    color: isActive ? 'white' : 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', gap: '6px',
  });

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: '1px solid var(--border-light)', background: 'var(--surface)',
    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle = { fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' };

  return (
    <div style={{ padding: '0 20px 40px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ background: 'var(--accent)', color: 'white', padding: '8px', borderRadius: '12px' }}>
            <Plus size={20} />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em' }}>Ingreso Diario</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 500 }}>
          Registrar pagos del día · Se vinculan automáticamente con Gestión de Deuda y Conciliación Bancaria
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <KPICard icon={<Calendar size={16} />} label="HOY" value={`$${fmt(kpis.todayTotal)}`} sub={`${kpis.todayCount} pagos`} color="var(--accent)" />
        <KPICard icon={<TrendingUp size={16} />} label="ESTA SEMANA" value={`$${fmt(kpis.weekTotal)}`} sub={`${kpis.weekCount} pagos`} color="#6366f1" />
        <KPICard icon={<DollarSign size={16} />} label={`MES ${selectedPeriod}`} value={`$${fmt(kpis.monthTotal)}`} sub={`${kpis.monthCount} registros`} color="#10b981" />
        <KPICard icon={<CheckCircle2 size={16} />} label="VINCULADOS" value={`${kpis.linkedCount}`} sub={`$${fmt(kpis.linkedTotal)} conciliados`} color="#10b981" />
        {kpis.unlinkedCount > 0 && (
          <KPICard icon={<AlertTriangle size={16} />} label="SIN VINCULAR" value={`${kpis.unlinkedCount}`} sub="Pendientes de grupo" color="#f59e0b" />
        )}
      </div>

      {/* Input Section */}
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>

        {/* Tabs */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('manual')} style={tabStyle(activeTab === 'manual')}>
            <Plus size={14} /> Pago Individual
          </button>
          <button onClick={() => setActiveTab('extracto')} style={tabStyle(activeTab === 'extracto')}>
            <ClipboardPaste size={14} /> Pegar Extracto
          </button>
          <button onClick={() => setActiveTab('efectivo')} style={tabStyle(activeTab === 'efectivo')}>
            <Banknote size={14} /> Efectivo
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Periodo:</span>
            <input type="month" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{ ...inputStyle, width: '160px', padding: '8px 12px' }} />
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px' }}>
          {activeTab === 'manual' && (
            <ManualForm formData={formData} setFormData={setFormData} grupos={grupos}
              getGrupo={getGrupo} grupoSuggestions={grupoSuggestions}
              onSave={handleSaveManual} saving={saving} inputStyle={inputStyle} labelStyle={labelStyle} />
          )}

          {activeTab === 'extracto' && (
            <ExtractoForm extractoText={extractoText} setExtractoText={setExtractoText}
              extractoBanco={extractoBanco} setExtractoBanco={setExtractoBanco}
              extractoFechaRef={extractoFechaRef} setExtractoFechaRef={setExtractoFechaRef}
              extractoFechaMetodo={extractoFechaMetodo} setExtractoFechaMetodo={setExtractoFechaMetodo}
              parsedRows={parsedRows} setParsedRows={setParsedRows}
              onParse={handleParseExtracto} onSave={handleSaveExtracto}
              saving={saving} grupos={grupos} getGrupo={getGrupo}
              inputStyle={inputStyle} labelStyle={labelStyle} fmt={fmt} />
          )}

          {activeTab === 'efectivo' && (
            <EfectivoForm
              subTab={efectivoSubTab} setSubTab={setEfectivoSubTab}
              data={efectivoData} setData={setEfectivoData}
              onSaveIndividual={handleSaveEfectivo}
              efectivoLoteText={efectivoLoteText} setEfectivoLoteText={setEfectivoLoteText}
              efectivoLoteRows={efectivoLoteRows} setEfectivoLoteRows={setEfectivoLoteRows}
              efectivoPeriodoTarget={efectivoPeriodoTarget} setEfectivoPeriodoTarget={setEfectivoPeriodoTarget}
              efectivoFechaMetodo={efectivoFechaMetodo} setEfectivoFechaMetodo={setEfectivoFechaMetodo}
              efectivoFechaRef={efectivoFechaRef} setEfectivoFechaRef={setEfectivoFechaRef}
              onParseLote={handleParseEfectivoLote} onSaveLote={handleSaveEfectivoLote}
              grupos={grupos} getGrupo={getGrupo} grupoSuggestions={grupoSuggestions}
              liquidaciones={liquidaciones}
              saving={saving} inputStyle={inputStyle} labelStyle={labelStyle} fmt={fmt}
            />
          )}
        </div>
      </div>

      {/* Movements Table */}
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>Registros del Mes</div>
          <div className="search-bar" style={{ flex: 1, minWidth: '200px', maxWidth: '400px' }}>
            <Search size={16} />
            <input type="text" placeholder="Buscar grupo, socio o concepto..." value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)' }} />
          </div>
          <button onClick={fetchData} className="icon-button-edit" style={{ height: '38px', width: '38px' }}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ padding: '14px 20px' }}>Fecha</th>
                <th style={{ textAlign: 'center' }}>Grupo</th>
                <th>Socio / Concepto</th>
                <th>Medio</th>
                <th>Banco</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th style={{ textAlign: 'center' }}>Vinculado</th>
                <th style={{ textAlign: 'center', width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && movimientos.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: '60px', textAlign: 'center' }}>
                  <Loader2 className="animate-spin" size={28} style={{ margin: '0 auto', color: 'var(--accent)' }} />
                </td></tr>
              ) : filteredMovs.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No hay ingresos diarios registrados para {selectedPeriod}
                </td></tr>
              ) : (
                filteredMovs.map(mov => (
                  <tr key={mov.movimiento_id}>
                    <td style={{ padding: '12px 20px', fontWeight: 600, fontSize: '13px' }}>
                      {mov.fecha_movimiento}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 800 }}>
                      {mov.numero_grupo || '—'}
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      <div style={{ fontWeight: 600 }}>{mov.nombre_socio || ''}</div>
                      {mov.concepto && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{mov.concepto.substring(0, 60)}</div>}
                    </td>
                    <td>
                      <MedioBadge medio={mov.medio_pago} />
                    </td>
                    <td style={{ fontSize: '12px', fontWeight: 600 }}>{mov.banco || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '14px', color: '#10b981' }}>
                      ${fmt(parseFloat(mov.monto))}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {mov.liquidacion_id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(16,185,129,0.12)', color: '#10b981', padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 800 }}>
                          <CheckCircle2 size={10} /> SÍ
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 800 }}>
                          PEND.
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => handleDelete(mov)} className="icon-button-edit"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px' }}>
                        <Trash2 size={12} style={{ color: 'var(--danger)' }} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================
// Sub-components
// =============================================

function KPICard({ icon, label, value, sub, color }) {
  return (
    <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>{sub}</div>
    </div>
  );
}

function MedioBadge({ medio }) {
  const cfg = MEDIOS_PAGO.find(m => m.value === medio) || MEDIOS_PAGO[3];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: `${cfg.color}15`, color: cfg.color, padding: '3px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 800 }}>
      {cfg.label}
    </span>
  );
}

function GrupoInput({ value, onChange, grupos, getGrupo, grupoSuggestions, inputStyle, labelStyle, label = 'Grupo' }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const grupo = getGrupo(value);

  function handleChange(val) {
    onChange(val);
    setSuggestions(grupoSuggestions(val));
    setShowSuggestions(true);
  }

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>{label}</label>
      <input type="text" value={value} onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { setSuggestions(grupoSuggestions(value)); setShowSuggestions(true); }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Nro. de grupo..."
        style={inputStyle} />
      {grupo && <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginTop: '4px' }}>✓ {grupo.titular}</div>}
      {showSuggestions && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg)', border: '1px solid var(--border-light)', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '200px', overflow: 'auto', marginTop: '4px' }}>
          {suggestions.map(s => (
            <div key={s.numero_grupo}
              onClick={() => { onChange(s.numero_grupo.toString()); setShowSuggestions(false); }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99,102,241,0.05)'}
              onMouseLeave={(e) => e.currentTarget.style.background = ''}>
              <span style={{ fontWeight: 700 }}>Grupo {s.numero_grupo}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{s.titular}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualForm({ formData, setFormData, grupos, getGrupo, grupoSuggestions, onSave, saving, inputStyle, labelStyle }) {
  const update = (field, val) => setFormData(prev => ({ ...prev, [field]: val }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', alignItems: 'end' }}>
      <div>
        <label style={labelStyle}>Fecha</label>
        <input type="date" value={formData.fecha} onChange={(e) => update('fecha', e.target.value)} style={inputStyle} />
      </div>
      <GrupoInput value={formData.numero_grupo} onChange={(v) => update('numero_grupo', v)}
        grupos={grupos} getGrupo={getGrupo} grupoSuggestions={grupoSuggestions}
        inputStyle={inputStyle} labelStyle={labelStyle} />
      <div>
        <label style={labelStyle}>Monto ($)</label>
        <input type="number" value={formData.monto} onChange={(e) => update('monto', e.target.value)}
          placeholder="0.00" step="0.01" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Medio de pago</label>
        <select value={formData.medio_pago} onChange={(e) => update('medio_pago', e.target.value)} style={inputStyle}>
          {MEDIOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Banco</label>
        <select value={formData.banco} onChange={(e) => update('banco', e.target.value)} style={inputStyle}>
          {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Comprobante</label>
        <input type="text" value={formData.comprobante} onChange={(e) => update('comprobante', e.target.value)}
          placeholder="Nro." style={inputStyle} />
      </div>
      <div style={{ gridColumn: 'span 2' }}>
        <label style={labelStyle}>Observaciones</label>
        <input type="text" value={formData.observaciones} onChange={(e) => update('observaciones', e.target.value)}
          placeholder="Opcional..." style={inputStyle} />
      </div>
      <div>
        <button onClick={onSave} disabled={saving}
          style={{ width: '100%', padding: '12px', borderRadius: '14px', border: 'none', background: 'var(--accent)', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: saving ? 0.7 : 1, transition: 'all 0.2s' }}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Registrar Pago</>}
        </button>
      </div>
    </div>
  );
}

function EfectivoForm({
  subTab, setSubTab,
  data, setData, onSaveIndividual,
  efectivoLoteText, setEfectivoLoteText,
  efectivoLoteRows, setEfectivoLoteRows,
  efectivoPeriodoTarget, setEfectivoPeriodoTarget,
  efectivoFechaMetodo, setEfectivoFechaMetodo,
  efectivoFechaRef, setEfectivoFechaRef,
  onParseLote, onSaveLote,
  grupos, getGrupo, grupoSuggestions, liquidaciones,
  saving, inputStyle, labelStyle, fmt
}) {
  const updateIndividual = (field, val) => setData(prev => ({ ...prev, [field]: val }));
  
  const updateLoteRow = (id, field, val) => {
    setEfectivoLoteRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const handleToggleSelectAll = (checked) => {
    setEfectivoLoteRows(prev => prev.map(r => ({ ...r, include: checked })));
  };

  const totalSelectedMonto = efectivoLoteRows.filter(r => r.include).reduce((a, r) => a + r.monto, 0);
  const countSelected = efectivoLoteRows.filter(r => r.include).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub-tabs Selector */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '14px' }}>
        <button
          onClick={() => setSubTab('lote')}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
            background: subTab === 'lote' ? '#10b981' : 'var(--surface)',
            color: subTab === 'lote' ? 'white' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <ClipboardPaste size={15} /> Pegar Lote de Efectivo (Excel / Bloque)
        </button>
        <button
          onClick={() => setSubTab('individual')}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
            background: subTab === 'individual' ? '#10b981' : 'var(--surface)',
            color: subTab === 'individual' ? 'white' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Banknote size={15} /> Pago Individual Presencial
        </button>
      </div>

      {/* ========================================================= */}
      {/* MODO 1: PEGAR LOTE DE EFECTIVO (EXCEL / BLOQUE DE TEXTO) */}
      {/* ========================================================= */}
      {subTab === 'lote' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Configuración de Período y Fechas */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <div>
              <label style={labelStyle}>
                📌 Período a Imputar (Facturas a Cancelar)
              </label>
              <select
                value={efectivoPeriodoTarget}
                onChange={(e) => setEfectivoPeriodoTarget(e.target.value)}
                style={{ ...inputStyle, width: '220px', fontWeight: 800, color: '#10b981' }}
              >
                <option value="2026-01">2026-01 (Enero 2026)</option>
                <option value="2026-02">2026-02 (Febrero 2026)</option>
                <option value="2026-03">2026-03 (Marzo 2026)</option>
                <option value="2026-04">2026-04 (Abril 2026)</option>
                <option value="2026-05">2026-05 (Mayo 2026)</option>
                <option value="2026-06">2026-06 (Junio 2026)</option>
                <option value="2026-07">2026-07 (Julio 2026)</option>
                <option value="2026-08">2026-08 (Agosto 2026)</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Asignación de Fecha</label>
              <select
                value={efectivoFechaMetodo}
                onChange={(e) => setEfectivoFechaMetodo(e.target.value)}
                style={{ ...inputStyle, width: '260px' }}
              >
                <option value="detect">Detectar de cada fila (ej: 05/02/2026)</option>
                <option value="force">Forzar fecha fija para todos</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Fecha de Referencia / Fallback</label>
              <input
                type="date"
                value={efectivoFechaRef}
                onChange={(e) => setEfectivoFechaRef(e.target.value)}
                style={{ ...inputStyle, width: '160px' }}
              />
            </div>
          </div>

          {/* Textarea para pegar el bloque de Excel */}
          <div>
            <label style={labelStyle}>
              Pegá el bloque de cobros en efectivo (copiá las celdas directamente desde Excel)
            </label>
            <textarea
              value={efectivoLoteText}
              onChange={(e) => setEfectivoLoteText(e.target.value)}
              placeholder={"Pegá acá las filas de tu Excel de Efectivo...\n\nFormato soportado (copiado directo de Excel):\nPAGO\t05/02/2026\t128\tAguirre, Omar\tCLARO CO\t-$ 16,657.85\tEFECTIVO\t12/01 2215426597 GPO: 128\nPAGO\t05/02/2026\t123\tVillalba, Lucila\tCLARO CO\t-$ 26,458.00\tEFECTIVO\t12/01 2215700021 GPO: 123"}
              style={{
                ...inputStyle,
                minHeight: '160px',
                fontFamily: 'monospace',
                fontSize: '12px',
                resize: 'vertical',
                lineHeight: '1.4'
              }}
            />
          </div>

          {/* Botones de acción de parseo */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={onParseLote}
              style={{
                padding: '10px 22px',
                borderRadius: '12px',
                border: 'none',
                background: '#10b981',
                color: 'white',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ClipboardPaste size={16} /> Analizar Lote de Efectivo
            </button>
            {efectivoLoteRows.length > 0 && (
              <button
                onClick={() => { setEfectivoLoteRows([]); setEfectivoLoteText(''); }}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-light)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Tabla de Vista Previa y Confirmación */}
          {efectivoLoteRows.length > 0 && (
            <div style={{ marginTop: '12px', border: '1px solid var(--border-light)', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', background: 'rgba(16,185,129,0.06)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {countSelected} de {efectivoLoteRows.length} pagos seleccionados
                  </span>
                  <span style={{ opacity: 0.5 }}>|</span>
                  <span style={{ fontSize: '14px', fontWeight: 900, color: '#10b981' }}>
                    Total: ${fmt(totalSelectedMonto)}
                  </span>
                  <span style={{ opacity: 0.5 }}>|</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Imputando a Período: <strong style={{ color: 'var(--text-primary)' }}>{efectivoPeriodoTarget}</strong>
                  </span>
                </div>

                <button
                  onClick={onSaveLote}
                  disabled={saving || countSelected === 0}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#10b981',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: countSelected === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: (saving || countSelected === 0) ? 0.6 : 1
                  }}
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Confirmar e Imputar Lote ({countSelected})</>}
                </button>
              </div>

              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)', position: 'sticky', top: 0, zIndex: 5 }}>
                      <th style={{ padding: '10px 12px', textAlign: 'center', width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={efectivoLoteRows.length > 0 && efectivoLoteRows.every(r => r.include)}
                          onChange={(e) => handleToggleSelectAll(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center' }}>#</th>
                      <th style={{ padding: '10px 12px', width: '120px' }}>Fecha</th>
                      <th style={{ padding: '10px 12px', width: '90px', textAlign: 'center' }}>Grupo</th>
                      <th style={{ padding: '10px 12px', minWidth: '180px' }}>Integrante / Titular</th>
                      <th style={{ padding: '10px 12px', width: '150px' }}>Operadora</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>Monto ($)</th>
                      <th style={{ padding: '10px 12px' }}>Línea / Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {efectivoLoteRows.map((row, idx) => {
                      const grupoObj = getGrupo(row.numero_grupo);
                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', opacity: row.include ? 1 : 0.4 }}>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={row.include}
                              onChange={(e) => updateLoteRow(row.id, 'include', e.target.checked)}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="date"
                              value={row.fecha}
                              onChange={(e) => updateLoteRow(row.id, 'fecha', e.target.value)}
                              style={{ ...inputStyle, padding: '4px 8px', fontSize: '11.5px', width: '125px' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <input
                              type="number"
                              value={row.numero_grupo}
                              onChange={(e) => updateLoteRow(row.id, 'numero_grupo', parseInt(e.target.value, 10) || '')}
                              style={{ width: '65px', textAlign: 'center', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 800 }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {row.titular || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Sin titular</span>}
                              </span>
                              {grupoObj && (
                                <span style={{ fontSize: '10.5px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  ✓ Grupo {row.numero_grupo}: {grupoObj.titular}
                                </span>
                              )}
                              {row.alreadyRegistered && (
                                <span style={{ fontSize: '10px', color: '#0284c7', background: 'rgba(2,132,199,0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, width: 'fit-content', marginTop: '2px' }}>
                                  ℹ️ Ya registrado previamente en DB (desmarcado)
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {row.empresa}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#10b981', fontSize: '13px' }}>
                            ${fmt(row.monto)}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            <input
                              type="text"
                              value={row.observaciones}
                              onChange={(e) => updateLoteRow(row.id, 'observaciones', e.target.value)}
                              style={{ ...inputStyle, padding: '4px 8px', fontSize: '11.5px' }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODO 2: PAGO INDIVIDUAL PRESENCIAL */}
      {/* ========================================================= */}
      {subTab === 'individual' && (
        <div style={{ maxWidth: '600px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', padding: '12px 16px', background: 'rgba(16,185,129,0.08)', borderRadius: '14px', border: '1px solid rgba(16,185,129,0.2)' }}>
            <Banknote size={18} style={{ color: '#10b981' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>Pago presencial en la mutual (1 por 1)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Fecha</label>
              <input type="date" value={data.fecha} onChange={(e) => updateIndividual('fecha', e.target.value)} style={inputStyle} />
            </div>
            <GrupoInput value={data.numero_grupo} onChange={(v) => updateIndividual('numero_grupo', v)}
              grupos={grupos} getGrupo={getGrupo} grupoSuggestions={grupoSuggestions}
              inputStyle={inputStyle} labelStyle={labelStyle} />
            <div>
              <label style={labelStyle}>Monto ($)</label>
              <input type="number" value={data.monto} onChange={(e) => updateIndividual('monto', e.target.value)}
                placeholder="0.00" step="0.01" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Nro. Recibo</label>
              <input type="text" value={data.recibo} onChange={(e) => updateIndividual('recibo', e.target.value)}
                placeholder="Opcional" style={inputStyle} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>Observaciones</label>
              <input type="text" value={data.observaciones} onChange={(e) => updateIndividual('observaciones', e.target.value)}
                placeholder="Opcional..." style={inputStyle} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <button onClick={onSaveIndividual} disabled={saving}
                style={{ width: '100%', padding: '12px', borderRadius: '14px', border: 'none', background: '#10b981', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : <><Banknote size={16} /> Registrar Efectivo</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExtractoForm({
  extractoText, setExtractoText,
  extractoBanco, setExtractoBanco,
  extractoFechaRef, setExtractoFechaRef,
  extractoFechaMetodo, setExtractoFechaMetodo,
  parsedRows, setParsedRows,
  onParse, onSave,
  saving, grupos, getGrupo,
  inputStyle, labelStyle, fmt
}) {
  const updateRow = (id, field, val) => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const totalSelected = parsedRows.filter(r => r.include).reduce((a, r) => a + r.monto, 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <label style={labelStyle}>Banco del extracto</label>
          <select value={extractoBanco} onChange={(e) => setExtractoBanco(e.target.value)} style={{ ...inputStyle, width: '180px' }}>
            {BANCOS.filter(b => b !== 'EFECTIVO').map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Fecha de Referencia / Fallback</label>
          <input type="date" value={extractoFechaRef} onChange={(e) => setExtractoFechaRef(e.target.value)} style={{ ...inputStyle, width: '160px' }} />
        </div>
        <div>
          <label style={labelStyle}>Asignación de Fecha</label>
          <select value={extractoFechaMetodo} onChange={(e) => setExtractoFechaMetodo(e.target.value)} style={{ ...inputStyle, width: '280px' }}>
            <option value="detect">Detectar del texto (usar año de referencia)</option>
            <option value="force">Forzar fecha de referencia para todos</option>
          </select>
        </div>
      </div>

      <label style={labelStyle}>Pegá el extracto bancario (copiá las filas del home banking)</label>
      <textarea value={extractoText} onChange={(e) => setExtractoText(e.target.value)}
        placeholder={"Pegá acá el extracto del banco...\n\nFormato esperado (separado por tabs o espacios):\nFecha    Concepto/Descripción    Comprobante    Monto\n\nEjemplo:\n17/06/2026    Transf. Inmediata - OJEDA, CESAR    1234    36280.73"}
        style={{ ...inputStyle, minHeight: '150px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }} />

      <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
        <button onClick={onParse}
          style={{ padding: '10px 20px', borderRadius: '12px', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ClipboardPaste size={14} /> Analizar Extracto
        </button>
        {parsedRows.length > 0 && (
          <button onClick={() => { setParsedRows([]); setExtractoText(''); }}
            style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Parsed preview table */}
      {parsedRows.length > 0 && (
        <div style={{ marginTop: '20px', border: '1px solid var(--border-light)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'rgba(99,102,241,0.05)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>
              {parsedRows.filter(r => r.include && !r.isTax).length} pagos seleccionados
              {parsedRows.filter(r => r.isTax).length > 0 && (
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {' '}({parsedRows.filter(r => r.isTax).length} impuestos omitidos)
                </span>
              )}
              {' '}· Total: <span style={{ color: '#10b981' }}>${fmt(totalSelected)}</span>
            </span>
            <button onClick={onSave} disabled={saving || parsedRows.filter(r => r.include && !r.isTax).length === 0}
              style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: 'var(--accent)', color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: (saving || parsedRows.filter(r => r.include && !r.isTax).length === 0) ? 0.6 : 1 }}>
              {saving ? <Loader2 className="animate-spin" size={14} /> : <><Save size={14} /> Guardar Pagos ({parsedRows.filter(r => r.include && !r.isTax).length})</>}
            </button>
          </div>
          <div style={{ maxHeight: '460px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)', position: 'sticky', top: 0, zIndex: 5 }}>
                  <th style={{ padding: '10px 12px', textAlign: 'center', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={parsedRows.length > 0 && parsedRows.filter(r => !r.isTax).length > 0 && parsedRows.filter(r => !r.isTax).every(r => r.include)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setParsedRows(prev => prev.map(r => r.isTax ? r : { ...r, include: checked }));
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '10px 12px', width: '125px' }}>Fecha</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', width: '80px' }}>Grupo</th>
                  <th style={{ padding: '10px 12px', minWidth: '160px' }}>Titular / Integrante</th>
                  <th style={{ padding: '10px 12px' }}>Concepto</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map(row => {
                  const grupoObj = row.numero_grupo ? getGrupo(row.numero_grupo) : null;
                  return (
                    <tr key={row.id} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      opacity: row.include ? 1 : 0.45,
                      background: row.isTax ? 'rgba(239, 68, 68, 0.03)' : 'transparent'
                    }}>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) => updateRow(row.id, 'include', e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input
                          type="date"
                          value={row.fecha}
                          onChange={(e) => updateRow(row.id, 'fecha', e.target.value)}
                          style={{ ...inputStyle, padding: '4px 8px', fontSize: '11.5px', width: '125px' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="number"
                          value={row.numero_grupo}
                          onChange={(e) => updateRow(row.id, 'numero_grupo', e.target.value ? parseInt(e.target.value, 10) : '')}
                          style={{ width: '65px', textAlign: 'center', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 800 }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>
                          {row.nombre_socio || (row.isTax ? <span style={{ color: '#ef4444', fontSize: '10.5px', fontWeight: 700 }}>IMPUESTO / RETENCIÓN</span> : <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Sin asignar</span>)}
                        </div>
                        {row.numero_grupo && grupoObj && (
                          <div style={{ fontSize: '10.5px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            ✓ Gpo {row.numero_grupo}: {grupoObj.titular}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11.5px', color: row.isTax ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                        {row.concepto}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: row.isTax ? '#ef4444' : '#10b981', fontSize: '12.5px' }}>
                        {row.isTax ? `-$${fmt(row.monto)}` : `$${fmt(row.monto)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
