import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  Banknote, ClipboardPaste, Calendar, TrendingUp, DollarSign, Search,
  RefreshCw, Trash2, CheckCircle2, AlertTriangle, Loader2, Printer,
  Info, Check, X, ArrowRight, FileText, ChevronDown, CheckCheck
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import { registrarCobroCuenta, sincronizarSaldosPersistidosGrupo } from './services/cuentaCorrienteService';
import ComprobanteCobroModal from './components/ComprobanteCobroModal';
import { formatFecha, formatMoney } from './utils/cuentaCorrienteEngine';

// ============================================================================
// HELPERS DE FECHAS (RESTRICCIÓN ESTRICTA: ÚLTIMOS 3 DÍAS)
// ============================================================================
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Retorna la fecha mínima permitida (3 días naturales hacia atrás desde hoy)
 */
function getMinAllowedDate() {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d.toISOString().split('T')[0];
}

function getMaxAllowedDate() {
  return todayISO();
}

function isDateWithinAllowedRange(dateStr) {
  if (!dateStr) return false;
  const min = getMinAllowedDate();
  const max = getMaxAllowedDate();
  return dateStr >= min && dateStr <= max;
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
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
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

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function IngresoDiario() {
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(false);
  const [movimientos, setMovimientos] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [activeTab, setActiveTab] = useState('individual'); // 'individual' | 'lote'
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [searchFilter, setSearchFilter] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal Comprobante
  const [comprobanteModalOpen, setComprobanteModalOpen] = useState(false);
  const [comprobanteData, setComprobanteData] = useState(null);

  // Form Individual
  const [individualData, setIndividualData] = useState({
    fecha: todayISO(),
    numero_grupo: '',
    monto: '',
    recibo: '',
    observaciones: '',
    periodo: 'AUTO', // 'AUTO' o periodo específico
  });

  // Form Lote
  const [loteText, setLoteText] = useState('');
  const [loteRows, setLoteRows] = useState([]);
  const [lotePeriodoTarget, setLotePeriodoTarget] = useState(getCurrentPeriod());
  const [loteFechaMetodo, setLoteFechaMetodo] = useState('detect'); // 'detect' | 'force'
  const [loteFechaRef, setLoteFechaRef] = useState(todayISO());

  const minAllowedDate = useMemo(() => getMinAllowedDate(), []);
  const maxAllowedDate = useMemo(() => getMaxAllowedDate(), []);

  // Carga de datos
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

  // Consulta exclusiva a movimientos_cuenta (Solo EFECTIVO)
  async function fetchMovimientos() {
    try {
      const { data, error } = await supabase
        .from('movimientos_cuenta')
        .select('*')
        .eq('tipo', 'PAGO')
        .ilike('medio_pago', '%EFECTIVO%')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(300);

      if (error) throw error;
      setMovimientos(data || []);
    } catch (err) {
      console.error('Error fetching cash movements:', err);
    }
  }

  async function fetchGrupos() {
    if (grupos.length > 0) return;
    try {
      const { data, error } = await supabase
        .from('grupo_socio')
        .select('numero_grupo, socio_id, es_titular, socios:socio_id(nombre_completo, socio_id, cuit, dni)')
        .order('numero_grupo');

      if (error) throw error;

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
    } catch (err) {
      console.error('Error fetching grupos:', err);
    }
  }

  async function fetchLiquidaciones() {
    try {
      const { data, error } = await supabase
        .from('liquidaciones_grupos')
        .select('liquidacion_id, numero_grupo, periodo, monto_total_facturado, monto_abonado, estado_pago, proveedor_id')
        .neq('estado_pago', 'ABONADO');

      if (error) throw error;
      setLiquidaciones(data || []);
    } catch (err) {
      console.error('Error fetching liquidaciones:', err);
    }
  }

  const getGrupo = useCallback((num) => {
    const n = parseInt(num, 10);
    return grupos.find(g => g.numero_grupo === n);
  }, [grupos]);

  const grupoSuggestions = useCallback((input) => {
    if (!input) return [];
    const q = input.toString().toLowerCase();
    return grupos.filter(g =>
      g.numero_grupo.toString().startsWith(q) ||
      g.titular.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [grupos]);

  // Facturas pendientes del grupo ingresado en individual
  const pendingLiqsForIndividual = useMemo(() => {
    const gNum = parseInt(individualData.numero_grupo, 10);
    if (isNaN(gNum) || gNum <= 0) return [];
    return liquidaciones.filter(l => l.numero_grupo === gNum);
  }, [individualData.numero_grupo, liquidaciones]);

  // ============================================================================
  // GUARDAR PAGO INDIVIDUAL (SOLO EFECTIVO)
  // ============================================================================
  async function handleSaveIndividual() {
    const gNum = parseInt(individualData.numero_grupo, 10);
    const monto = parseFloat(individualData.monto);

    if (isNaN(gNum) || gNum <= 0) {
      addToast('Ingresá un número de grupo válido', 'warning');
      return;
    }
    if (isNaN(monto) || monto <= 0) {
      addToast('Ingresá un monto mayor a $0', 'warning');
      return;
    }

    // Validación de fecha estricta (últimos 3 días)
    if (!isDateWithinAllowedRange(individualData.fecha)) {
      addToast(`Solo se permite registrar pagos de los últimos 3 días (entre ${formatFecha(minAllowedDate)} y ${formatFecha(maxAllowedDate)})`, 'warning');
      return;
    }

    setSaving(true);
    try {
      const grupo = getGrupo(gNum);
      const titularLabel = grupo?.titular || `Grupo ${gNum}`;
      const periodoTarget = individualData.periodo === 'AUTO' ? null : individualData.periodo;
      const obsFinal = `Cobro Efectivo (Mutual)${individualData.recibo ? ` - Recibo: ${individualData.recibo}` : ''}${individualData.observaciones ? ` - ${individualData.observaciones}` : ''}`;

      // Llamada directa y oficial al servicio de Cuenta Corriente
      await registrarCobroCuenta({
        numero_grupo: gNum,
        nombre: titularLabel,
        importe: monto,
        medio_pago: 'EFECTIVO',
        observaciones: obsFinal,
        fecha: individualData.fecha,
        periodo: periodoTarget,
        skipLiqUpdate: false
      });

      addToast(`✓ Cobro en efectivo de $${fmt(monto)} registrado para Grupo ${gNum}`, 'success');

      // Preparar comprobante oficial
      const reciboNum = individualData.recibo || `REC-${individualData.fecha.replace(/-/g, '')}-${gNum}`;
      setComprobanteData({
        reciboNumero: reciboNum,
        fecha: individualData.fecha,
        numero_grupo: gNum,
        nombre_titular: titularLabel,
        monto_cobrado: monto,
        medio_pago: 'EFECTIVO EN MUT',
        observaciones: obsFinal,
        efectivo_entregado: monto
      });
      setComprobanteModalOpen(true);

      // Limpiar formulario
      setIndividualData(prev => ({
        ...prev,
        numero_grupo: '',
        monto: '',
        recibo: '',
        observaciones: '',
        periodo: 'AUTO'
      }));

      await fetchMovimientos();
      await fetchLiquidaciones();
    } catch (err) {
      console.error('Error al registrar pago en efectivo:', err);
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ============================================================================
  // PARSEAR Y GUARDAR LOTE DE EFECTIVO
  // ============================================================================
  async function handleParseLote() {
    if (!loteText.trim()) {
      addToast('Pegá el bloque de cobros en efectivo primero', 'warning');
      return;
    }

    // Consultar pagos en efectivo ya existentes para evitar duplicados
    const { data: existingCashMovs } = await supabase
      .from('movimientos_cuenta')
      .select('numero_grupo, fecha, importe')
      .eq('tipo', 'PAGO')
      .ilike('medio_pago', '%EFECTIVO%');

    const lines = loteText.trim().split('\n');
    const parsed = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.includes('\t')
        ? line.split(/\t+/).map(p => p.trim()).filter(Boolean)
        : line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);

      if (parts.length < 2) continue;

      let fecha = loteFechaRef;
      let grupo = '';
      let titular = '';
      let empresa = 'MUTUAL';
      let monto = 0;
      let linea = '';
      let observaciones = '';

      // 1. Fecha
      if (loteFechaMetodo === 'detect') {
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
      }

      // Validar si la fecha está en rango permitido
      const isDateValid = isDateWithinAllowedRange(fecha);
      if (!isDateValid) {
        // Fallback al día de hoy / fecha de referencia
        fecha = loteFechaRef;
      }

      // 2. Monto
      for (const p of parts) {
        if (p.includes('$') || /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(p) || /^\d+[\.,]\d{2}$/.test(p)) {
          const num = parseArgentineOrUSNumber(p);
          if (num > 0 && monto === 0) monto = num;
        }
      }
      if (monto === 0) {
        const moneyMatches = line.match(/\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g);
        if (moneyMatches && moneyMatches.length > 0) {
          monto = parseArgentineOrUSNumber(moneyMatches[moneyMatches.length - 1]);
        }
      }

      // 3. Grupo
      const gpoInLine = line.match(/\b(?:GPO|GRUPO):?\s*(\d{1,6})\b/i);
      if (gpoInLine) grupo = gpoInLine[1];
      if (!grupo) {
        for (const p of parts) {
          if (/^\d{1,5}$/.test(p) && !p.includes('$')) {
            const n = parseInt(p, 10);
            if (n > 0 && n < 100000) { grupo = p; break; }
          }
        }
      }

      // 4. Titular
      for (const p of parts) {
        if ((p.includes(',') || p.toLowerCase().includes('s/ socios')) && !p.includes('$') && isNaN(parseFloat(p.replace(/,/g, '')))) {
          titular = p.replace(/\s+S\/\s+SOCIOS.*$/i, '').trim();
          break;
        }
      }

      // 5. Empresa
      const empMatch = line.match(/\b(CLARO|PERSONAL|MOVISTAR)\b/i);
      if (empMatch) empresa = empMatch[1].toUpperCase();

      // 6. Línea
      const phoneMatch = line.match(/\b(11\d{8}|221\d{7}|\d{10})\b/);
      if (phoneMatch) linea = phoneMatch[1];

      // 7. Observaciones
      if (line.toLowerCase().includes('a favor')) observaciones = 'Saldo a favor';
      else if (linea) observaciones = `Línea ${linea}`;

      const gNum = parseInt(grupo, 10);
      const grupoObj = !isNaN(gNum) ? getGrupo(gNum) : null;
      const finalTitular = titular || grupoObj?.titular || `Grupo ${grupo || 'S/N'}`;

      if (monto > 0 && !isNaN(gNum)) {
        const isDuplicate = (existingCashMovs || []).some(e => {
          if (Number(e.numero_grupo) !== gNum) return false;
          if (Math.abs(Math.abs(Number(e.importe || 0)) - monto) > 0.05) return false;
          if (e.fecha !== fecha) return false;
          return true;
        });

        parsed.push({
          id: `lote-${i}`,
          fecha,
          isDateValid: isDateWithinAllowedRange(fecha),
          numero_grupo: gNum,
          titular: finalTitular,
          monto,
          empresa,
          linea,
          observaciones,
          include: !isDuplicate && isDateWithinAllowedRange(fecha),
          alreadyRegistered: isDuplicate
        });
      }
    }

    if (parsed.length === 0) {
      addToast('No se pudieron detectar cobros válidos. Verificá el formato.', 'warning');
      return;
    }

    setLoteRows(parsed);
    const dups = parsed.filter(p => p.alreadyRegistered).length;
    addToast(`Se detectaron ${parsed.length} cobros en efectivo${dups > 0 ? ` (${dups} ya registrados)` : ''}`, 'success');
  }

  async function handleSaveLote() {
    const toSave = loteRows.filter(r => r.include);
    if (toSave.length === 0) {
      addToast('No hay filas seleccionadas para guardar', 'warning');
      return;
    }

    // Validación estricta de fechas de lote
    const invalidDates = toSave.filter(r => !isDateWithinAllowedRange(r.fecha));
    if (invalidDates.length > 0) {
      addToast(`Hay ${invalidDates.length} filas con fechas fuera de los últimos 3 días (${formatFecha(minAllowedDate)} a ${formatFecha(maxAllowedDate)}). Corregilas antes de continuar.`, 'warning');
      return;
    }

    const totalMonto = toSave.reduce((a, r) => a + r.monto, 0);
    const accepted = await confirm({
      title: 'Confirmar Ingreso de Lote en Efectivo',
      message: `¿Registrar ${toSave.length} pagos en efectivo por un total de $${fmt(totalMonto)} imputados a ${lotePeriodoTarget}?\n\nImpactarán directamente en Cuenta Corriente y cancelarán las facturas correspondientes.`,
      confirmText: 'Guardar y Aplicar',
      cancelText: 'Cancelar'
    });
    if (!accepted) return;

    setSaving(true);
    try {
      let saved = 0;
      for (const row of toSave) {
        const titularLabel = row.titular || `Grupo ${row.numero_grupo}`;
        const obs = `Cobro Efectivo (${row.empresa})${row.linea ? ` - Línea ${row.linea}` : ''}${row.observaciones ? ` - ${row.observaciones}` : ''}`;

        await registrarCobroCuenta({
          numero_grupo: row.numero_grupo,
          nombre: titularLabel,
          importe: row.monto,
          medio_pago: 'EFECTIVO',
          observaciones: obs,
          fecha: row.fecha,
          periodo: lotePeriodoTarget,
          numero_linea: row.linea || null,
          skipLiqUpdate: false
        });
        saved++;
      }

      addToast(`✓ ${saved} pagos en efectivo registrados exitosamente en Contaduría e imputados a ${lotePeriodoTarget}`, 'success');
      setLoteText('');
      setLoteRows([]);
      await fetchMovimientos();
      await fetchLiquidaciones();
    } catch (err) {
      console.error('Error al guardar lote de efectivo:', err);
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ============================================================================
  // ELIMINAR COBRO EN EFECTIVO (REVERTIR DEUDA Y RECALCULAR)
  // ============================================================================
  async function handleDelete(mov) {
    const ok = await confirm({
      title: 'Eliminar cobro en efectivo',
      message: `¿Eliminar cobro en efectivo de $${fmt(Math.abs(mov.importe))} para Grupo ${mov.numero_grupo} (${mov.nombre})?\n\nSe restablecerá la deuda en la liquidación y se actualizará el saldo de cuenta corriente.`,
      confirmText: 'Eliminar Cobro',
      variant: 'danger'
    });
    if (!ok) return;

    try {
      // 1. Revertir liquidaciones_grupos si estaba imputado
      if (mov.periodo) {
        const { data: liqs } = await supabase
          .from('liquidaciones_grupos')
          .select('liquidacion_id, monto_total_facturado, monto_abonado')
          .eq('numero_grupo', mov.numero_grupo)
          .eq('periodo', mov.periodo);

        if (liqs && liqs.length > 0) {
          const liq = liqs[0];
          const nuevoAbonado = Math.max(0, Number(liq.monto_abonado || 0) - Math.abs(Number(mov.importe)));
          const facturado = Number(liq.monto_total_facturado || 0);
          const nuevoEstado = nuevoAbonado >= facturado - 0.05 ? 'ABONADO' : (nuevoAbonado > 0 ? 'PARCIAL' : 'PENDIENTE');

          await supabase.from('liquidaciones_grupos').update({
            monto_abonado: Math.round(nuevoAbonado * 100) / 100,
            estado_pago: nuevoEstado,
            updated_at: new Date().toISOString()
          }).eq('liquidacion_id', liq.liquidacion_id);
        }
      }

      // 2. Eliminar de movimientos_cuenta
      await supabase.from('movimientos_cuenta').delete().eq('id', mov.id);

      // 3. Recalcular saldos del grupo en cuenta corriente
      await sincronizarSaldosPersistidosGrupo(mov.numero_grupo);

      // 4. Registrar en audit_log
      await supabase.from('audit_log').insert({
        tipo_evento: 'INGRESO_EFECTIVO_ELIMINADO',
        descripcion: `Cobro Efectivo eliminado: Grupo ${mov.numero_grupo} por $${Math.abs(mov.importe)} - Período ${mov.periodo || 'N/A'}`,
        monto: -Math.abs(mov.importe),
        usuario: 'dante@admin.com'
      });

      addToast('Cobro en efectivo eliminado y saldo restablecido', 'success');
      await fetchMovimientos();
      await fetchLiquidaciones();
    } catch (err) {
      console.error('Error al eliminar cobro:', err);
      addToast(`Error: ${err.message}`, 'error');
    }
  }

  // ============================================================================
  // KPIS DE COBROS EN EFECTIVO
  // ============================================================================
  const kpis = useMemo(() => {
    const today = todayISO();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const todayMovs = movimientos.filter(m => m.fecha === today);
    const weekMovs = movimientos.filter(m => m.fecha >= weekAgo);
    const monthMovs = movimientos.filter(m => m.fecha?.startsWith(selectedPeriod) || m.periodo === selectedPeriod);

    return {
      todayCount: todayMovs.length,
      todayTotal: todayMovs.reduce((a, m) => a + Math.abs(parseFloat(m.importe || 0)), 0),
      weekCount: weekMovs.length,
      weekTotal: weekMovs.reduce((a, m) => a + Math.abs(parseFloat(m.importe || 0)), 0),
      monthCount: monthMovs.length,
      monthTotal: monthMovs.reduce((a, m) => a + Math.abs(parseFloat(m.importe || 0)), 0),
      totalCount: movimientos.length,
    };
  }, [movimientos, selectedPeriod]);

  // Filtro de tabla
  const filteredMovs = useMemo(() => {
    if (!searchFilter.trim()) return movimientos;
    const q = searchFilter.toLowerCase();
    return movimientos.filter(m =>
      (m.numero_grupo?.toString() || '').includes(q) ||
      (m.nombre || '').toLowerCase().includes(q) ||
      (m.observaciones || '').toLowerCase().includes(q) ||
      (m.periodo || '').toLowerCase().includes(q)
    );
  }, [movimientos, searchFilter]);

  // Estilos compartidos
  const tabStyle = (isActive) => ({
    padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 800,
    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
    background: isActive ? '#10b981' : 'var(--surface)',
    color: isActive ? 'white' : 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', gap: '8px',
  });

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '12px',
    border: '1px solid var(--border-light)', background: 'var(--surface)',
    color: 'var(--text-primary)', fontSize: '13.5px', outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle = { fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' };

  return (
    <div style={{ padding: '0 20px 40px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Título Principal */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ background: '#10b981', color: 'white', padding: '10px', borderRadius: '14px' }}>
            <Banknote size={22} />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em' }}>Ingreso Diario (Efectivo)</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14.5px', fontWeight: 500 }}>
          Registro de cobranzas presenciales en efectivo (EFC) · Impactan directamente en Cuenta Corriente y Contaduría
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <KPICard icon={<Calendar size={18} />} label="HOY (EFECTIVO)" value={`$${fmt(kpis.todayTotal)}`} sub={`${kpis.todayCount} cobros`} color="#10b981" />
        <KPICard icon={<TrendingUp size={18} />} label="ESTA SEMANA" value={`$${fmt(kpis.weekTotal)}`} sub={`${kpis.weekCount} cobros`} color="#6366f1" />
        <KPICard icon={<DollarSign size={18} />} label={`MES ${selectedPeriod}`} value={`$${fmt(kpis.monthTotal)}`} sub={`${kpis.monthCount} cobros en ${selectedPeriod}`} color="#10b981" />
        <KPICard icon={<CheckCircle2 size={18} />} label="HISTORIAL REGISTROS" value={`${kpis.totalCount}`} sub="Cobros en efectivo" color="#0ea5e9" />
      </div>

      {/* Panel de Carga */}
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>

        {/* Pestañas de Modo */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('individual')} style={tabStyle(activeTab === 'individual')}>
            <Banknote size={16} /> Pago Individual Presencial
          </button>
          <button onClick={() => setActiveTab('lote')} style={tabStyle(activeTab === 'lote')}>
            <ClipboardPaste size={16} /> Pegar Lote de Efectivo (Excel / Bloque)
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Filtro Período:</span>
            <input type="month" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{ ...inputStyle, width: '160px', padding: '6px 12px', fontSize: '13px' }} />
          </div>
        </div>

        {/* Contenido de la Pestaña */}
        <div style={{ padding: '24px' }}>

          {/* ========================================================= */}
          {/* MODO 1: PAGO INDIVIDUAL PRESENCIAL */}
          {/* ========================================================= */}
          {activeTab === 'individual' && (
            <div style={{ maxWidth: '640px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', padding: '12px 16px', background: 'rgba(16,185,129,0.08)', borderRadius: '14px', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Banknote size={18} style={{ color: '#10b981' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>Cobro presencial en ventanilla / mutual (1 a 1)</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>
                    Fecha de Pago
                    <span style={{ marginLeft: '6px', fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
                      (Últimos 3 días)
                    </span>
                  </label>
                  <input
                    type="date"
                    value={individualData.fecha}
                    min={minAllowedDate}
                    max={maxAllowedDate}
                    onChange={(e) => setIndividualData(prev => ({ ...prev, fecha: e.target.value }))}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                    Permitido: {formatFecha(minAllowedDate)} al {formatFecha(maxAllowedDate)}
                  </span>
                </div>

                <GrupoInput
                  value={individualData.numero_grupo}
                  onChange={(v) => setIndividualData(prev => ({ ...prev, numero_grupo: v }))}
                  grupos={grupos}
                  getGrupo={getGrupo}
                  grupoSuggestions={grupoSuggestions}
                  inputStyle={inputStyle}
                  labelStyle={labelStyle}
                />

                {/* Resumen de deudas pendientes del grupo */}
                {pendingLiqsForIndividual.length > 0 && (
                  <div style={{ gridColumn: 'span 2', padding: '12px 16px', borderRadius: '12px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#3b82f6', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Info size={14} /> Facturas con deuda pendiente para este grupo:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {pendingLiqsForIndividual.map(l => {
                        const pendiente = Number(l.monto_total_facturado) - Number(l.monto_abonado || 0);
                        return (
                          <div key={l.liquidacion_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                            <span>Período <strong>{l.periodo}</strong> (Total: ${fmt(l.monto_total_facturado)} | Abonado: ${fmt(l.monto_abonado)})</span>
                            <button
                              type="button"
                              onClick={() => {
                                setIndividualData(prev => ({
                                  ...prev,
                                  periodo: l.periodo,
                                  monto: String(Math.round(pendiente * 100) / 100)
                                }));
                              }}
                              style={{
                                padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                background: 'rgba(59,130,246,0.15)', color: '#2563eb', border: 'none', cursor: 'pointer'
                              }}
                            >
                              Saldar deuda: ${fmt(pendiente)}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Monto a Cobrar ($)</label>
                  <input
                    type="number"
                    value={individualData.monto}
                    onChange={(e) => setIndividualData(prev => ({ ...prev, monto: e.target.value }))}
                    placeholder="0.00"
                    step="0.01"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Período a Imputar</label>
                  <select
                    value={individualData.periodo}
                    onChange={(e) => setIndividualData(prev => ({ ...prev, periodo: e.target.value }))}
                    style={{ ...inputStyle, fontWeight: 700 }}
                  >
                    <option value="AUTO">Automático (Deuda más antigua FIFO)</option>
                    {pendingLiqsForIndividual.map(l => (
                      <option key={l.liquidacion_id} value={l.periodo}>
                        Período {l.periodo} (Factura pendiente)
                      </option>
                    ))}
                    {['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map(p => (
                      <option key={p} value={p}>Período {p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Nro. Recibo (Opcional)</label>
                  <input
                    type="text"
                    value={individualData.recibo}
                    onChange={(e) => setIndividualData(prev => ({ ...prev, recibo: e.target.value }))}
                    placeholder="Ej: REC-1049"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Observaciones (Opcional)</label>
                  <input
                    type="text"
                    value={individualData.observaciones}
                    onChange={(e) => setIndividualData(prev => ({ ...prev, observaciones: e.target.value }))}
                    placeholder="Detalle adicional..."
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: 'span 2', marginTop: '10px' }}>
                  <button
                    onClick={handleSaveIndividual}
                    disabled={saving}
                    style={{
                      width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white',
                      fontSize: '14px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      opacity: saving ? 0.7 : 1, boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
                    }}
                  >
                    {saving ? <Loader2 className="animate-spin" size={18} /> : <><Banknote size={18} /> Registrar Cobro en Efectivo</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODO 2: PEGAR LOTE DE EFECTIVO */}
          {/* ========================================================= */}
          {activeTab === 'lote' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--surface)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                <div>
                  <label style={labelStyle}>📌 Período a Imputar (Facturas a Cancelar)</label>
                  <select
                    value={lotePeriodoTarget}
                    onChange={(e) => setLotePeriodoTarget(e.target.value)}
                    style={{ ...inputStyle, width: '220px', fontWeight: 800, color: '#10b981' }}
                  >
                    {['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map(p => (
                      <option key={p} value={p}>Período {p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Asignación de Fecha</label>
                  <select
                    value={loteFechaMetodo}
                    onChange={(e) => setLoteFechaMetodo(e.target.value)}
                    style={{ ...inputStyle, width: '260px' }}
                  >
                    <option value="detect">Detectar de cada fila (últimos 3 días)</option>
                    <option value="force">Forzar fecha fija para todos</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>
                    Fecha de Referencia
                    <span style={{ marginLeft: '6px', fontSize: '11px', color: '#10b981' }}>(Últimos 3 días)</span>
                  </label>
                  <input
                    type="date"
                    value={loteFechaRef}
                    min={minAllowedDate}
                    max={maxAllowedDate}
                    onChange={(e) => setLoteFechaRef(e.target.value)}
                    style={{ ...inputStyle, width: '160px' }}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Pegar filas copiadas de Excel o texto plano:</label>
                <textarea
                  rows={6}
                  value={loteText}
                  onChange={(e) => setLoteText(e.target.value)}
                  placeholder={`Ejemplo:\n123  06/10/2026  Perez Juan  $15.000,00  CLARO\n140  07/10/2026  Gaspardi C. $30.444,05  CLARO`}
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  onClick={handleParseLote}
                  disabled={saving || !loteText.trim()}
                  className="action-button"
                  style={{
                    padding: '10px 20px', borderRadius: '12px', fontWeight: 800, border: 'none',
                    background: '#10b981', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  <ClipboardPaste size={16} /> Analizar y Procesar Lote
                </button>
                {loteRows.length > 0 && (
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Total detectado: <strong>{loteRows.length}</strong> cobros (${fmt(loteRows.filter(r => r.include).reduce((a, r) => a + r.monto, 0))})
                  </span>
                )}
              </div>

              {/* Vista previa de filas del lote */}
              {loteRows.length > 0 && (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={loteRows.length > 0 && loteRows.every(r => r.include)}
                            onChange={(e) => setLoteRows(prev => prev.map(r => ({ ...r, include: e.target.checked })))}
                          />
                        </th>
                        <th>Fecha</th>
                        <th style={{ textAlign: 'center' }}>Grupo</th>
                        <th>Socio Titular</th>
                        <th>Operadora</th>
                        <th style={{ textAlign: 'right' }}>Monto ($)</th>
                        <th>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loteRows.map(r => (
                        <tr key={r.id} style={{ opacity: r.include ? 1 : 0.6 }}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={r.include}
                              onChange={(e) => setLoteRows(prev => prev.map(x => x.id === r.id ? { ...x, include: e.target.checked } : x))}
                            />
                          </td>
                          <td>
                            <input
                              type="date"
                              value={r.fecha}
                              min={minAllowedDate}
                              max={maxAllowedDate}
                              onChange={(e) => {
                                const newDate = e.target.value;
                                setLoteRows(prev => prev.map(x => x.id === r.id ? { ...x, fecha: newDate, isDateValid: isDateWithinAllowedRange(newDate) } : x));
                              }}
                              style={{ ...inputStyle, padding: '4px 8px', fontSize: '11px', width: '130px' }}
                            />
                            {!r.isDateValid && (
                              <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, marginTop: '2px' }}>
                                ⚠️ Fuera de los 3 días
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 800 }}>{r.numero_grupo}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.titular}</div>
                            {r.alreadyRegistered && (
                              <span style={{ fontSize: '10px', color: '#0284c7', background: 'rgba(2,132,199,0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                ℹ️ Ya registrado previamente
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: '12px' }}>{r.empresa}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#10b981' }}>${fmt(r.monto)}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.observaciones || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ padding: '16px', display: 'flex', justifyContent: 'flex-end', background: 'var(--surface)' }}>
                    <button
                      onClick={handleSaveLote}
                      disabled={saving || loteRows.filter(r => r.include).length === 0}
                      style={{
                        padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#10b981',
                        color: 'white', fontWeight: 800, fontSize: '13.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                      }}
                    >
                      {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCheck size={16} />}
                      Confirmar y Aplicar {loteRows.filter(r => r.include).length} Cobros en Efectivo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Historial de Cobros en Efectivo */}
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Banknote size={18} style={{ color: '#10b981' }} /> Cobros en Efectivo Registrados
          </div>
          <div className="search-bar" style={{ flex: 1, minWidth: '200px', maxWidth: '400px' }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar grupo, socio o recibo..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)' }}
            />
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
                <th>Socio Titular</th>
                <th>Medio</th>
                <th style={{ textAlign: 'right' }}>Monto ($)</th>
                <th style={{ textAlign: 'center' }}>Período</th>
                <th>Observaciones / Recibo</th>
                <th style={{ textAlign: 'center', width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && movimientos.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '60px', textAlign: 'center' }}>
                    <Loader2 className="animate-spin" size={28} style={{ margin: '0 auto', color: '#10b981' }} />
                  </td>
                </tr>
              ) : filteredMovs.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No hay ingresos en efectivo registrados
                  </td>
                </tr>
              ) : (
                filteredMovs.map(mov => (
                  <tr key={mov.id}>
                    <td style={{ padding: '12px 20px', fontWeight: 600, fontSize: '13px' }}>
                      {formatFecha(mov.fecha)}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 800 }}>
                      {mov.numero_grupo || '—'}
                    </td>
                    <td style={{ fontSize: '13px', fontWeight: 600 }}>
                      {mov.nombre || '—'}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16,185,129,0.12)', color: '#10b981', padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>
                        <Banknote size={12} /> EFECTIVO
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '14px', color: '#10b981' }}>
                      ${fmt(Math.abs(parseFloat(mov.importe)))}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {mov.periodo || '—'}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {mov.observaciones || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleDelete(mov)}
                        title="Eliminar cobro y revertir deuda"
                        className="icon-button-edit"
                        style={{
                          background: 'var(--surface)', border: '1px solid var(--border-light)',
                          borderRadius: '8px', cursor: 'pointer', display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px'
                        }}
                      >
                        <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Comprobante Oficial */}
      {comprobanteModalOpen && comprobanteData && (
        <ComprobanteCobroModal
          isOpen={comprobanteModalOpen}
          onClose={() => setComprobanteModalOpen(false)}
          cobroData={comprobanteData}
        />
      )}
    </div>
  );
}

// ============================================================================
// SUBCOMPONENTES
// ============================================================================
function KPICard({ icon, label, value, sub, color }) {
  return (
    <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>{sub}</div>
    </div>
  );
}

function GrupoInput({ value, onChange, grupos, getGrupo, grupoSuggestions, inputStyle, labelStyle, label = 'Grupo' }) {
  const [open, setOpen] = useState(false);
  const grupo = getGrupo(value);
  const suggestions = grupoSuggestions(value);

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Nro. de grupo..."
        style={inputStyle}
      />
      {grupo && (
        <span style={{ fontSize: '11.5px', color: '#10b981', fontWeight: 600, marginTop: '4px', display: 'block' }}>
          ✓ {grupo.titular}
        </span>
      )}

      {open && suggestions.length > 0 && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            background: 'var(--surface-dropdown)', border: '1px solid var(--border-light)',
            borderRadius: '12px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
          }}>
            {suggestions.map(g => (
              <div
                key={g.numero_grupo}
                onClick={() => { onChange(String(g.numero_grupo)); setOpen(false); }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                  borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between'
                }}
              >
                <strong>Grupo {g.numero_grupo}</strong>
                <span style={{ color: 'var(--text-secondary)' }}>{g.titular}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
