import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  Banknote, ClipboardPaste, Calendar, TrendingUp, DollarSign, Search,
  RefreshCw, Trash2, CheckCircle2, AlertTriangle, Loader2, Printer,
  Info, Check, X, ArrowRight, FileText, ChevronDown, CheckCheck,
  Phone, Users, Smartphone, ListFilter
} from 'lucide-react';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import { registrarCobroCuenta, sincronizarSaldosPersistidosGrupo } from './services/cuentaCorrienteService';
import ComprobanteCobroModal from './components/ComprobanteCobroModal';
import { formatFecha, formatMoney } from './utils/cuentaCorrienteEngine';

// ============================================================================
// HELPERS
// ============================================================================
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  const [periodosValidos, setPeriodosValidos] = useState([getCurrentPeriod()]);
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [searchFilter, setSearchFilter] = useState('');
  const [saving, setSaving] = useState(false);

  // Tabs principales: 'presencial' | 'lote'
  const [activeTab, setActiveTab] = useState('presencial');

  // Modal Comprobante
  const [comprobanteModalOpen, setComprobanteModalOpen] = useState(false);
  const [comprobanteData, setComprobanteData] = useState(null);

  // --------------------------------------------------------------------------
  // ESTADOS FORMULARIO PRESENCIAL
  // --------------------------------------------------------------------------
  // Modo de cobro presencial: 'total' (Grupo/s total) | 'lineas' (Por líneas específicas)
  const [subModoCobro, setSubModoCobro] = useState('total');

  const [presencialInput, setPresencialInput] = useState(''); // Puede ser "106", "106, 178, 536", o una línea "2215735025"
  const [presencialFecha, setPresencialFecha] = useState(todayISO());
  const [presencialPeriodo, setPresencialPeriodo] = useState(getCurrentPeriod());
  const [presencialRecibo, setPresencialRecibo] = useState('');
  const [presencialObservaciones, setPresencialObservaciones] = useState('');

  // Para Caso A: Un solo grupo
  const [singleGrupoMonto, setSingleGrupoMonto] = useState('');

  // Para Caso A múltiple: Lista de grupos detectados en la DB
  const [multiGruposData, setMultiGruposData] = useState([]);
  const [loadingMultiGrupos, setLoadingMultiGrupos] = useState(false);

  // Para Caso B: Líneas del grupo
  const [lineasGrupo, setLineasGrupo] = useState([]);
  const [selectedLineas, setSelectedLineas] = useState(new Set());
  const [loadingLineas, setLoadingLineas] = useState(false);
  const [lineasInputText, setLineasInputText] = useState(''); // Input para tipear líneas

  // --------------------------------------------------------------------------
  // ESTADOS FORMULARIO LOTE
  // --------------------------------------------------------------------------
  const [loteText, setLoteText] = useState('');
  const [loteRows, setLoteRows] = useState([]);
  const [lotePeriodoTarget, setLotePeriodoTarget] = useState(getCurrentPeriod());
  const [loteFechaMetodo, setLoteFechaMetodo] = useState('detect');
  const [loteFechaRef, setLoteFechaRef] = useState(todayISO());

  // ==========================================================================
  // CARGA INICIAL Y PERÍODOS VÁLIDOS (ÚLTIMOS 3 PERÍODOS)
  // ==========================================================================
  useEffect(() => {
    initPeriodosYDatos();
  }, []);

  async function initPeriodosYDatos() {
    setLoading(true);
    try {
      // 1. Obtener los últimos 3 períodos disponibles en la DB
      const { data: liqPeriods } = await supabase
        .from('liquidaciones_grupos')
        .select('periodo')
        .not('periodo', 'is', null)
        .order('periodo', { ascending: false })
        .limit(100);

      const periodSet = new Set();
      (liqPeriods || []).forEach(l => { if (l.periodo) periodSet.add(l.periodo); });
      periodSet.add(getCurrentPeriod());

      const top3 = Array.from(periodSet).sort().reverse().slice(0, 3);
      setPeriodosValidos(top3);
      if (top3.length > 0) {
        setSelectedPeriod(top3[0]);
        setPresencialPeriodo(top3[0]);
        setLotePeriodoTarget(top3[0]);
      }

      await Promise.all([fetchMovimientos(), fetchGrupos(), fetchLiquidaciones(top3)]);
    } catch (err) {
      console.error('Error inicializando Ingreso Diario:', err);
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
        .limit(400);

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

  async function fetchLiquidaciones(allowedPeriods) {
    try {
      let query = supabase
        .from('liquidaciones_grupos')
        .select('liquidacion_id, numero_grupo, periodo, monto_total_facturado, monto_abonado, estado_pago, proveedor_id, proveedores:proveedor_id(nombre)')
        .neq('estado_pago', 'ABONADO');

      if (allowedPeriods && allowedPeriods.length > 0) {
        query = query.in('periodo', allowedPeriods);
      }

      const { data, error } = await query;
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
    const q = input.toString().toLowerCase().trim();
    return grupos.filter(g =>
      g.numero_grupo.toString().startsWith(q) ||
      g.titular.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [grupos]);

  // ==========================================================================
  // PARSING DINÁMICO DE ENTRADA PRESENCIAL (GRUPO/S O LÍNEA)
  // ==========================================================================
  // Analizar lo que el usuario tipea en presencialInput
  const parsedInputInfo = useMemo(() => {
    const raw = presencialInput.trim();
    if (!raw) return { type: 'empty', items: [] };

    // Si contiene comas o múltiples números separados
    const rawTokens = raw.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);

    // Verificar si es un número de teléfono de 10 dígitos o empieza con 11 / 221
    if (rawTokens.length === 1 && (rawTokens[0].length >= 8 && /^\d+$/.test(rawTokens[0]))) {
      return { type: 'linea', items: [rawTokens[0]] };
    }

    const groupNums = rawTokens.map(t => parseInt(t, 10)).filter(n => !isNaN(n) && n > 0 && n < 999999);
    if (groupNums.length > 1) {
      return { type: 'multi_grupos', items: groupNums };
    }
    if (groupNums.length === 1) {
      return { type: 'single_grupo', items: groupNums };
    }

    return { type: 'text', items: [raw] };
  }, [presencialInput]);

  // Si se ingresan múltiples grupos, cargar su deuda en la DB
  useEffect(() => {
    if (parsedInputInfo.type === 'multi_grupos') {
      loadMultiGrupos(parsedInputInfo.items);
    } else {
      setMultiGruposData([]);
    }
  }, [parsedInputInfo, liquidaciones, presencialPeriodo]);

  async function loadMultiGrupos(groupNums) {
    setLoadingMultiGrupos(true);
    try {
      const results = groupNums.map(gNum => {
        const grupoObj = getGrupo(gNum);
        const liqsG = liquidaciones.filter(l => l.numero_grupo === gNum);
        const liqsEnPeriodo = liqsG.filter(l => l.periodo === presencialPeriodo);
        const deudaEnPeriodo = liqsEnPeriodo.reduce((s, l) => s + (Number(l.monto_total_facturado) - Number(l.monto_abonado || 0)), 0);
        const deudaTotal3P = liqsG.reduce((s, l) => s + (Number(l.monto_total_facturado) - Number(l.monto_abonado || 0)), 0);

        return {
          numero_grupo: gNum,
          titular: grupoObj?.titular || `Grupo ${gNum}`,
          deudaEnPeriodo: Math.round(deudaEnPeriodo * 100) / 100,
          deudaTotal3P: Math.round(deudaTotal3P * 100) / 100,
          montoACobrar: Math.round(deudaEnPeriodo * 100) / 100 || Math.round(deudaTotal3P * 100) / 100 || 0,
          periodo: presencialPeriodo,
          incluir: true,
          liqs: liqsG
        };
      });
      setMultiGruposData(results);
    } finally {
      setLoadingMultiGrupos(false);
    }
  }

  // Si se ingresa una línea directamente, buscar a qué grupo pertenece en la DB
  useEffect(() => {
    if (parsedInputInfo.type === 'linea') {
      const lineaNum = parsedInputInfo.items[0];
      buscarGrupoPorLinea(lineaNum);
    }
  }, [parsedInputInfo.type, parsedInputInfo.items]);

  async function buscarGrupoPorLinea(lineaNum) {
    try {
      const { data } = await supabase
        .from('lineas')
        .select('numero_linea, numero_grupo, socio_id, socios:socio_id(nombre_completo)')
        .eq('numero_linea', lineaNum)
        .limit(1)
        .single();

      if (data && data.numero_grupo) {
        addToast(`Línea ${lineaNum} localizada en Grupo ${data.numero_grupo} (${data.socios?.nombre_completo || 'Socio'})`, 'info');
        setSubModoCobro('lineas');
        setPresencialInput(String(data.numero_grupo));
        setSelectedLineas(new Set([lineaNum]));
      }
    } catch (_) {
      // No encontrada en lineas
    }
  }

  // Deudas del grupo único seleccionado
  const activeSingleGrupo = useMemo(() => {
    if (parsedInputInfo.type === 'single_grupo') {
      return parsedInputInfo.items[0];
    }
    return null;
  }, [parsedInputInfo]);

  const liqsSingleGrupo = useMemo(() => {
    if (!activeSingleGrupo) return [];
    return liquidaciones.filter(l => l.numero_grupo === activeSingleGrupo);
  }, [activeSingleGrupo, liquidaciones]);

  const deudaTotalSingleGrupo = useMemo(() => {
    return liqsSingleGrupo.reduce((s, l) => s + (Number(l.monto_total_facturado) - Number(l.monto_abonado || 0)), 0);
  }, [liqsSingleGrupo]);

  // Si cambia el grupo único y estamos en cobro total, autocompletar el monto
  useEffect(() => {
    if (activeSingleGrupo && subModoCobro === 'total') {
      const liqsPeriodo = liqsSingleGrupo.filter(l => l.periodo === presencialPeriodo);
      const deudaPeriodo = liqsPeriodo.reduce((s, l) => s + (Number(l.monto_total_facturado) - Number(l.monto_abonado || 0)), 0);
      if (deudaPeriodo > 0) {
        setSingleGrupoMonto(String(Math.round(deudaPeriodo * 100) / 100));
      } else if (deudaTotalSingleGrupo > 0) {
        setSingleGrupoMonto(String(Math.round(deudaTotalSingleGrupo * 100) / 100));
      }
    }
  }, [activeSingleGrupo, presencialPeriodo, subModoCobro, liqsSingleGrupo, deudaTotalSingleGrupo]);

  // ==========================================================================
  // CARGA DE LÍNEAS DEL GRUPO (CASO B: COBRO POR LÍNEAS EN LA DB)
  // ==========================================================================
  useEffect(() => {
    if (activeSingleGrupo && subModoCobro === 'lineas') {
      fetchLineasDelGrupo(activeSingleGrupo, presencialPeriodo);
    } else {
      setLineasGrupo([]);
      setSelectedLineas(new Set());
    }
  }, [activeSingleGrupo, presencialPeriodo, subModoCobro]);

  async function fetchLineasDelGrupo(gNum, periodo) {
    setLoadingLineas(true);
    try {
      // 1. Obtener socios del grupo desde v_socios_busqueda
      const { data: sociosGrupo } = await supabase
        .from('v_socios_busqueda')
        .select('socio_id')
        .filter('grupo_codigo_str', 'imatch', '\\y' + gNum + '\\y');
      const socioIds = (sociosGrupo || []).map(s => s.socio_id).filter(Boolean);

      let orConds = [`numero_grupo.eq.${gNum}`];
      if (socioIds.length > 0) {
        orConds.push(`socio_id.in.(${socioIds.join(',')})`);
      }

      // 2. Obtener líneas activas
      const { data: rawLineas } = await supabase
        .from('lineas')
        .select('numero_linea, proveedor_id, proveedores:proveedor_id(nombre), socio_id, socios:socio_id(nombre_completo), planes_abonos:plan_id(nombre_plan, precio), estado')
        .or(orConds.join(','));

      const activas = (rawLineas || []).filter(l => (l.estado || 'ACTIVA').toUpperCase() !== 'BAJA');
      const lineNums = activas.map(l => l.numero_linea).filter(Boolean);

      // 3. Obtener facturación/consumos de las líneas para el período
      let billingMap = {};
      if (lineNums.length > 0 && periodo) {
        const { data: billingData } = await supabase
          .from('v_historial_facturacion_socio')
          .select('numero_linea, total_linea, nombre_plan, costo_abono_real, nombre_completo')
          .eq('periodo', periodo)
          .in('numero_linea', lineNums);

        if (billingData) {
          billingData.forEach(b => {
            billingMap[b.numero_linea] = b;
          });
        }
      }

      // 4. Obtener pagos ya registrados para estas líneas
      let pagosData = [];
      if (periodo) {
        const { data: pData } = await supabase
          .from('movimientos_cuenta')
          .select('numero_linea, importe, observaciones')
          .eq('numero_grupo', gNum)
          .eq('periodo', periodo)
          .eq('tipo', 'PAGO');
        pagosData = pData || [];
      }

      const enriched = activas.map(l => {
        const b = billingMap[l.numero_linea];
        const rawVal = b ? parseFloat(b.total_linea) : (parseFloat(l.planes_abonos?.precio) || 0);

        const estaAbonada = pagosData.some(p => {
          if (p.numero_linea && p.numero_linea === l.numero_linea) return true;
          if (p.observaciones && p.observaciones.includes(l.numero_linea)) return true;
          return false;
        });

        return {
          numero_linea: l.numero_linea,
          socio_nombre: b?.nombre_completo || l.socios?.nombre_completo || 'Sin socio asignado',
          proveedor_nombre: l.proveedores?.nombre || 'MUTUAL',
          nombre_plan: b?.nombre_plan || l.planes_abonos?.nombre_plan || 'Plan Estándar',
          total_linea: Math.round(rawVal * 100) / 100,
          esta_abonada: estaAbonada
        };
      });

      setLineasGrupo(enriched);
    } catch (err) {
      console.error('Error cargando líneas del grupo:', err);
    } finally {
      setLoadingLineas(false);
    }
  }

  // Toggle selección de línea
  function toggleLineaSelection(numeroLinea) {
    setSelectedLineas(prev => {
      const next = new Set(prev);
      if (next.has(numeroLinea)) next.delete(numeroLinea);
      else next.add(numeroLinea);
      return next;
    });
  }

  // Parsear input manual de líneas a abonar (por ej: "2215735025, 1160118643")
  function handleLineasInputBlur() {
    if (!lineasInputText.trim()) return;
    const tokens = lineasInputText.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
    const newSelected = new Set(selectedLineas);
    tokens.forEach(t => {
      if (lineasGrupo.some(l => l.numero_linea === t)) {
        newSelected.add(t);
      }
    });
    setSelectedLineas(newSelected);
  }

  // Suma de líneas seleccionadas
  const totalMontoLineasSeleccionadas = useMemo(() => {
    let sum = 0;
    lineasGrupo.forEach(l => {
      if (selectedLineas.has(l.numero_linea)) {
        sum += l.total_linea;
      }
    });
    return Math.round(sum * 100) / 100;
  }, [lineasGrupo, selectedLineas]);

  // Sincronizar monto cuando cambia la selección de líneas
  useEffect(() => {
    if (subModoCobro === 'lineas' && totalMontoLineasSeleccionadas > 0) {
      setSingleGrupoMonto(String(totalMontoLineasSeleccionadas));
    }
  }, [subModoCobro, totalMontoLineasSeleccionadas]);

  // ==========================================================================
  // REGISTRAR COBRO INDIVIDUAL (GRUPO ÚNICO O POR LÍNEAS)
  // ==========================================================================
  async function handleSaveSingleCobro() {
    if (!activeSingleGrupo) {
      addToast('Ingresá un número de grupo válido', 'warning');
      return;
    }
    const monto = parseFloat(singleGrupoMonto);
    if (isNaN(monto) || monto <= 0) {
      addToast('Ingresá un monto mayor a $0', 'warning');
      return;
    }

    if (!periodosValidos.includes(presencialPeriodo)) {
      addToast(`Solo se permite imputar a los últimos 3 períodos (${periodosValidos.join(', ')})`, 'warning');
      return;
    }

    setSaving(true);
    try {
      const grupoObj = getGrupo(activeSingleGrupo);
      const titularLabel = grupoObj?.titular || `Grupo ${activeSingleGrupo}`;

      let lineasArr = [];
      if (subModoCobro === 'lineas' && selectedLineas.size > 0) {
        lineasArr = Array.from(selectedLineas);
      }

      const lineaDesc = lineasArr.length > 0 ? ` - Línea(s): ${lineasArr.join(', ')}` : '';
      const obsFinal = `Cobro Efectivo (Mutual) - Período ${presencialPeriodo}${lineaDesc}${presencialRecibo ? ` - Recibo: ${presencialRecibo}` : ''}${presencialObservaciones ? ` - ${presencialObservaciones}` : ''}`;

      await registrarCobroCuenta({
        numero_grupo: activeSingleGrupo,
        nombre: titularLabel,
        importe: monto,
        medio_pago: 'EFECTIVO',
        observaciones: obsFinal,
        fecha: presencialFecha,
        periodo: presencialPeriodo,
        numero_linea: lineasArr.length === 1 ? lineasArr[0] : (lineasArr.length > 1 ? lineasArr.join(',') : null),
        skipLiqUpdate: false
      });

      addToast(`✓ Cobro en efectivo de $${fmt(monto)} registrado para Grupo ${activeSingleGrupo}`, 'success');

      // Comprobante
      const reciboNum = presencialRecibo || `REC-${presencialFecha.replace(/-/g, '')}-${activeSingleGrupo}`;
      setComprobanteData({
        reciboNumero: reciboNum,
        fecha: presencialFecha,
        numero_grupo: activeSingleGrupo,
        nombre_titular: titularLabel,
        monto_cobrado: monto,
        medio_pago: 'EFECTIVO EN MUT',
        observaciones: obsFinal,
        efectivo_entregado: monto
      });
      setComprobanteModalOpen(true);

      // Limpiar y refrescar
      setPresencialInput('');
      setSingleGrupoMonto('');
      setPresencialRecibo('');
      setPresencialObservaciones('');
      setSelectedLineas(new Set());
      setLineasInputText('');

      await fetchMovimientos();
      await fetchLiquidaciones(periodosValidos);
    } catch (err) {
      console.error('Error al registrar cobro:', err);
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ==========================================================================
  // REGISTRAR COBRO MÚLTIPLES GRUPOS EN EFECTIVO (PAGO TOTAL LOTE)
  // ==========================================================================
  async function handleSaveMultiGrupos() {
    const toSave = multiGruposData.filter(g => g.incluir && g.montoACobrar > 0);
    if (toSave.length === 0) {
      addToast('No hay grupos seleccionados con saldo mayor a $0', 'warning');
      return;
    }

    const totalMonto = toSave.reduce((s, g) => s + g.montoACobrar, 0);
    const accepted = await confirm({
      title: 'Confirmar Cobro Total de Múltiples Grupos',
      message: `¿Deseas registrar en efectivo el cobro de ${toSave.length} grupos por un total de $${fmt(totalMonto)}?\n\nPeríodo a imputar: ${presencialPeriodo}\nImpactará directamente en Cuenta Corriente y cancelará las facturas correspondientes.`,
      confirmText: 'Registrar Cobros',
      cancelText: 'Cancelar'
    });
    if (!accepted) return;

    setSaving(true);
    try {
      let saved = 0;
      for (const item of toSave) {
        const obs = `Cobro Efectivo (Mutual) - Pago Total Período ${presencialPeriodo}${presencialRecibo ? ` - Recibo: ${presencialRecibo}` : ''}`;
        await registrarCobroCuenta({
          numero_grupo: item.numero_grupo,
          nombre: item.titular,
          importe: item.montoACobrar,
          medio_pago: 'EFECTIVO',
          observaciones: obs,
          fecha: presencialFecha,
          periodo: presencialPeriodo,
          skipLiqUpdate: false
        });
        saved++;
      }

      addToast(`✓ Se registraron exitosamente ${saved} cobros en efectivo en Contaduría`, 'success');
      setPresencialInput('');
      setMultiGruposData([]);
      await fetchMovimientos();
      await fetchLiquidaciones(periodosValidos);
    } catch (err) {
      console.error('Error al procesar cobros múltiples:', err);
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ==========================================================================
  // PARSER Y GUARDADO LOTE (EXCEL / TEXTO)
  // ==========================================================================
  async function handleParseLote() {
    if (!loteText.trim()) {
      addToast('Pegá el bloque de cobros en efectivo primero', 'warning');
      return;
    }

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
      let monto = 0;
      let linea = '';
      let observaciones = '';

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

      for (const p of parts) {
        if ((p.includes(',') || p.toLowerCase().includes('s/ socios')) && !p.includes('$') && isNaN(parseFloat(p.replace(/,/g, '')))) {
          titular = p.replace(/\s+S\/\s+SOCIOS.*$/i, '').trim();
          break;
        }
      }

      const phoneMatch = line.match(/\b(11\d{8}|221\d{7}|\d{10})\b/);
      if (phoneMatch) linea = phoneMatch[1];

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
          numero_grupo: gNum,
          titular: finalTitular,
          monto,
          linea,
          observaciones,
          include: !isDuplicate,
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

    const totalMonto = toSave.reduce((a, r) => a + r.monto, 0);
    const accepted = await confirm({
      title: 'Confirmar Lote en Efectivo',
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
        const obs = `Cobro Efectivo (Mutual)${row.linea ? ` - Línea ${row.linea}` : ''}${row.observaciones ? ` - ${row.observaciones}` : ''}`;

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

      addToast(`✓ ${saved} pagos en efectivo registrados exitosamente e imputados a ${lotePeriodoTarget}`, 'success');
      setLoteText('');
      setLoteRows([]);
      await fetchMovimientos();
      await fetchLiquidaciones(periodosValidos);
    } catch (err) {
      console.error('Error al guardar lote de efectivo:', err);
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ==========================================================================
  // ELIMINAR COBRO (REVERTIR DEUDA)
  // ==========================================================================
  async function handleDelete(mov) {
    const ok = await confirm({
      title: 'Eliminar cobro en efectivo',
      message: `¿Eliminar cobro en efectivo de $${fmt(Math.abs(mov.importe))} para Grupo ${mov.numero_grupo} (${mov.nombre})?\n\nSe restablecerá la deuda en la liquidación y se actualizará el saldo de cuenta corriente.`,
      confirmText: 'Eliminar Cobro',
      variant: 'danger'
    });
    if (!ok) return;

    try {
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

      await supabase.from('movimientos_cuenta').delete().eq('id', mov.id);
      await sincronizarSaldosPersistidosGrupo(mov.numero_grupo);

      await supabase.from('audit_log').insert({
        tipo_evento: 'INGRESO_EFECTIVO_ELIMINADO',
        descripcion: `Cobro Efectivo eliminado: Grupo ${mov.numero_grupo} por $${Math.abs(mov.importe)} - Período ${mov.periodo || 'N/A'}`,
        monto: -Math.abs(mov.importe),
        usuario: 'dante@admin.com'
      });

      addToast('Cobro en efectivo eliminado y saldo restablecido', 'success');
      await fetchMovimientos();
      await fetchLiquidaciones(periodosValidos);
    } catch (err) {
      console.error('Error al eliminar cobro:', err);
      addToast(`Error: ${err.message}`, 'error');
    }
  }

  // ==========================================================================
  // KPIS
  // ==========================================================================
  const kpis = useMemo(() => {
    const today = todayISO();
    const todayMovs = movimientos.filter(m => m.fecha === today);
    const periodMovs = movimientos.filter(m => m.periodo === selectedPeriod || m.fecha?.startsWith(selectedPeriod));

    const deudaTotal3P = liquidaciones.reduce((s, l) => s + (Number(l.monto_total_facturado) - Number(l.monto_abonado || 0)), 0);

    return {
      todayCount: todayMovs.length,
      todayTotal: todayMovs.reduce((a, m) => a + Math.abs(parseFloat(m.importe || 0)), 0),
      periodCount: periodMovs.length,
      periodTotal: periodMovs.reduce((a, m) => a + Math.abs(parseFloat(m.importe || 0)), 0),
      deudaPendiente3P: Math.round(deudaTotal3P * 100) / 100,
      totalCount: movimientos.length,
    };
  }, [movimientos, selectedPeriod, liquidaciones]);

  // Filtro de tabla
  const filteredMovs = useMemo(() => {
    let list = movimientos;
    if (selectedPeriod && selectedPeriod !== 'TODOS') {
      list = list.filter(m => m.periodo === selectedPeriod || m.fecha?.startsWith(selectedPeriod));
    }
    if (!searchFilter.trim()) return list;
    const q = searchFilter.toLowerCase();
    return list.filter(m =>
      (m.numero_grupo?.toString() || '').includes(q) ||
      (m.nombre || '').toLowerCase().includes(q) ||
      (m.observaciones || '').toLowerCase().includes(q) ||
      (m.periodo || '').toLowerCase().includes(q) ||
      (m.numero_linea || '').includes(q)
    );
  }, [movimientos, searchFilter, selectedPeriod]);

  // Estilos
  const tabStyle = (isActive) => ({
    padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 800,
    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
    background: isActive ? '#10b981' : 'var(--surface)',
    color: isActive ? 'white' : 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', gap: '8px',
  });

  const subTabStyle = (isActive) => ({
    padding: '7px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
    border: isActive ? '1px solid #10b981' : '1px solid var(--border-light)',
    cursor: 'pointer', transition: 'all 0.15s',
    background: isActive ? 'rgba(16,185,129,0.12)' : 'var(--surface)',
    color: isActive ? '#059669' : 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', gap: '6px',
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
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.03em', margin: 0 }}>Ingreso Diario (Efectivo)</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', fontWeight: 500, margin: '4px 0 0 0' }}>
              Cobranzas presenciales en ventanilla · Imputación a los últimos 3 períodos · Búsqueda por Grupo(s) o por Líneas
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <KPICard icon={<Calendar size={18} />} label="HOY (EFECTIVO)" value={`$${fmt(kpis.todayTotal)}`} sub={`${kpis.todayCount} cobros hoy`} color="#10b981" />
        <KPICard icon={<DollarSign size={18} />} label={`MES ${selectedPeriod}`} value={`$${fmt(kpis.periodTotal)}`} sub={`${kpis.periodCount} cobros en ${selectedPeriod}`} color="#059669" />
        <KPICard icon={<TrendingUp size={18} />} label="DEUDA EN 3 PERÍODOS" value={`$${fmt(kpis.deudaPendiente3P)}`} sub={`Períodos: ${periodosValidos.join(', ')}`} color="#f59e0b" />
        <KPICard icon={<CheckCircle2 size={18} />} label="TOTAL REGISTROS" value={`${kpis.totalCount}`} sub="Cobros en efectivo" color="#6366f1" />
      </div>

      {/* Panel de Carga */}
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>

        {/* Pestañas Principales */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('presencial')} style={tabStyle(activeTab === 'presencial')}>
            <Banknote size={16} /> Cobro Presencial (Grupo / Líneas)
          </button>
          <button onClick={() => setActiveTab('lote')} style={tabStyle(activeTab === 'lote')}>
            <ClipboardPaste size={16} /> Pegar Lote de Efectivo (Excel / Bloque)
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Período Activo:</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {periodosValidos.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setSelectedPeriod(p); setPresencialPeriodo(p); setLotePeriodoTarget(p); }}
                  style={{
                    padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800,
                    border: selectedPeriod === p ? '1px solid #10b981' : '1px solid var(--border-light)',
                    background: selectedPeriod === p ? '#10b981' : 'var(--surface)',
                    color: selectedPeriod === p ? 'white' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div style={{ padding: '24px' }}>

          {/* ========================================================= */}
          {/* MODO 1: COBRO PRESENCIAL (GRUPO / MÚLTIPLES / LÍNEAS) */}
          {/* ========================================================= */}
          {activeTab === 'presencial' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Barra superior de configuración rápida */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', background: 'rgba(16,185,129,0.04)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(16,185,129,0.15)' }}>
                <div>
                  <label style={labelStyle}>Fecha de Cobro Físico</label>
                  <input
                    type="date"
                    value={presencialFecha}
                    onChange={(e) => setPresencialFecha(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>📌 Período a Imputar (Últimos 3 Períodos)</label>
                  <select
                    value={presencialPeriodo}
                    onChange={(e) => setPresencialPeriodo(e.target.value)}
                    style={{ ...inputStyle, fontWeight: 800, color: '#10b981' }}
                  >
                    {periodosValidos.map(p => (
                      <option key={p} value={p}>Período {p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Recibo / Comprobante (Opcional)</label>
                  <input
                    type="text"
                    value={presencialRecibo}
                    onChange={(e) => setPresencialRecibo(e.target.value)}
                    placeholder="Ej: REC-2026-1049"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Observaciones Generales</label>
                  <input
                    type="text"
                    value={presencialObservaciones}
                    onChange={(e) => setPresencialObservaciones(e.target.value)}
                    placeholder="Detalle adicional..."
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Selector de Grupo / Múltiples Grupos / Líneas */}
              <div>
                <label style={{ ...labelStyle, fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Ingresar Grupo(s) o Línea(s) a Abonar:
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={presencialInput}
                    onChange={(e) => setPresencialInput(e.target.value)}
                    placeholder="Ejemplos:  106  (un grupo)  ·  106, 178, 536  (múltiples grupos)  ·  2215735025  (línea directa)"
                    style={{ ...inputStyle, fontSize: '14.5px', padding: '12px 16px', fontWeight: 600 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  <span>💡 Tipeá uno o varios grupos separados por coma para saldar en lote.</span>
                  <span>📞 O tipeá el número de teléfono celular para buscar automáticamente su grupo y consumo.</span>
                </div>
              </div>

              {/* ----------------------------------------------------------- */}
              {/* CASO A MÚLTIPLE: SE INGRESARON VARIOS GRUPOS */}
              {/* ----------------------------------------------------------- */}
              {parsedInputInfo.type === 'multi_grupos' && (
                <div style={{ border: '1px solid var(--border-light)', borderRadius: '16px', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '13.5px', color: '#4f46e5' }}>
                      <Users size={16} /> Múltiples Grupos Detectados ({multiGruposData.length})
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>
                      Total a Cobrar: <strong style={{ color: '#10b981' }}>${fmt(multiGruposData.filter(g => g.incluir).reduce((s, g) => s + g.montoACobrar, 0))}</strong>
                    </span>
                  </div>

                  {loadingMultiGrupos ? (
                    <div style={{ padding: '30px', textAlign: 'center' }}>
                      <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto', color: '#6366f1' }} />
                    </div>
                  ) : (
                    <div>
                      <table className="premium-table" style={{ fontSize: '12.5px' }}>
                        <thead>
                          <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={multiGruposData.length > 0 && multiGruposData.every(g => g.incluir)}
                                onChange={(e) => setMultiGruposData(prev => prev.map(g => ({ ...g, incluir: e.target.checked })))}
                              />
                            </th>
                            <th style={{ textAlign: 'center' }}>Grupo</th>
                            <th>Titular</th>
                            <th style={{ textAlign: 'right' }}>Deuda en {presencialPeriodo}</th>
                            <th style={{ textAlign: 'right' }}>Deuda Total (3 Períodos)</th>
                            <th style={{ textAlign: 'right', width: '140px' }}>Monto a Cobrar ($)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {multiGruposData.map(g => (
                            <tr key={g.numero_grupo} style={{ opacity: g.incluir ? 1 : 0.5 }}>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={g.incluir}
                                  onChange={(e) => setMultiGruposData(prev => prev.map(x => x.numero_grupo === g.numero_grupo ? { ...x, incluir: e.target.checked } : x))}
                                />
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 800 }}>{g.numero_grupo}</td>
                              <td style={{ fontWeight: 600 }}>{g.titular}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: g.deudaEnPeriodo > 0 ? '#ef4444' : '#10b981' }}>
                                ${fmt(g.deudaEnPeriodo)}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700 }}>${fmt(g.deudaTotal3P)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <input
                                  type="number"
                                  value={g.montoACobrar}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setMultiGruposData(prev => prev.map(x => x.numero_grupo === g.numero_grupo ? { ...x, montoACobrar: val } : x));
                                  }}
                                  style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div style={{ padding: '16px', background: 'var(--surface)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)' }}>
                        <button
                          onClick={handleSaveMultiGrupos}
                          disabled={saving || multiGruposData.filter(g => g.incluir).length === 0}
                          style={{
                            padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#10b981',
                            color: 'white', fontWeight: 800, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                          }}
                        >
                          {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCheck size={16} />}
                          Confirmar Cobro Total de {multiGruposData.filter(g => g.incluir).length} Grupos (${fmt(multiGruposData.filter(g => g.incluir).reduce((s, g) => s + g.montoACobrar, 0))})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ----------------------------------------------------------- */}
              {/* CASO B: UN SOLO GRUPO SELECCIONADO (TOTAL O POR LÍNEAS) */}
              {/* ----------------------------------------------------------- */}
              {activeSingleGrupo && (
                <div style={{ border: '1px solid var(--border-light)', borderRadius: '18px', padding: '20px', background: 'var(--surface)' }}>

                  {/* Header del Grupo */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '16px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px', fontWeight: 900 }}>Grupo {activeSingleGrupo}</span>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          · {getGrupo(activeSingleGrupo)?.titular || 'Titular no encontrado'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Deuda pendiente total en los 3 períodos: <strong style={{ color: deudaTotalSingleGrupo > 0 ? '#ef4444' : '#10b981' }}>${fmt(deudaTotalSingleGrupo)}</strong>
                      </div>
                    </div>

                    {/* Selector de Sub-Modo: Total vs Líneas */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setSubModoCobro('total')}
                        style={subTabStyle(subModoCobro === 'total')}
                      >
                        <Banknote size={14} /> Pago Total del Grupo
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubModoCobro('lineas')}
                        style={subTabStyle(subModoCobro === 'lineas')}
                      >
                        <Phone size={14} /> Pago por Líneas del Grupo
                      </button>
                    </div>
                  </div>

                  {/* SUB-MODO 1: PAGO TOTAL */}
                  {subModoCobro === 'total' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Facturas pendientes del grupo */}
                      {liqsSingleGrupo.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(59,130,246,0.05)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.15)' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Info size={14} /> Facturas pendientes para este grupo en los 3 períodos:
                          </span>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
                            {liqsSingleGrupo.map(l => {
                              const pendiente = Number(l.monto_total_facturado) - Number(l.monto_abonado || 0);
                              return (
                                <div key={l.liquidacion_id} style={{ padding: '10px 12px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontWeight: 800, fontSize: '12.5px' }}>Período {l.periodo}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                      Facturado: ${fmt(l.monto_total_facturado)} | Pendiente: ${fmt(pendiente)}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPresencialPeriodo(l.periodo);
                                      setSingleGrupoMonto(String(Math.round(pendiente * 100) / 100));
                                    }}
                                    style={{
                                      padding: '4px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                                      background: 'rgba(59,130,246,0.12)', color: '#2563eb', border: 'none', cursor: 'pointer'
                                    }}
                                  >
                                    Saldar: ${fmt(pendiente)}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.08)', borderRadius: '12px', color: '#059669', fontSize: '12.5px', fontWeight: 600 }}>
                          ✓ Este grupo no registra facturas pendientes en los últimos 3 períodos. Podés registrar un pago a cuenta.
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={labelStyle}>Monto a Cobrar ($)</label>
                          <input
                            type="number"
                            value={singleGrupoMonto}
                            onChange={(e) => setSingleGrupoMonto(e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            style={{ ...inputStyle, fontSize: '16px', fontWeight: 800, color: '#10b981' }}
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>Imputar al Período</label>
                          <select
                            value={presencialPeriodo}
                            onChange={(e) => setPresencialPeriodo(e.target.value)}
                            style={{ ...inputStyle, fontWeight: 700 }}
                          >
                            {periodosValidos.map(p => (
                              <option key={p} value={p}>Período {p}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button
                        onClick={handleSaveSingleCobro}
                        disabled={saving}
                        style={{
                          width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white',
                          fontSize: '14px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
                        }}
                      >
                        {saving ? <Loader2 className="animate-spin" size={18} /> : <><Banknote size={18} /> Confirmar Pago Total en Efectivo (${fmt(parseFloat(singleGrupoMonto) || 0)})</>}
                      </button>
                    </div>
                  )}

                  {/* SUB-MODO 2: PAGO POR LÍNEAS DEL GRUPO */}
                  {subModoCobro === 'lineas' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          Seleccioná las líneas que abona el socio para el <strong>Período {presencialPeriodo}</strong>:
                        </span>

                        {/* Input para tipear números de línea directamente */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={lineasInputText}
                            onChange={(e) => setLineasInputText(e.target.value)}
                            onBlur={handleLineasInputBlur}
                            placeholder="Tipear línea/s (ej: 2215735025)"
                            style={{ ...inputStyle, width: '220px', padding: '6px 10px', fontSize: '12px' }}
                          />
                          <button
                            type="button"
                            onClick={handleLineasInputBlur}
                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--surface)', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Marcar
                          </button>
                        </div>
                      </div>

                      {loadingLineas ? (
                        <div style={{ padding: '40px', textAlign: 'center' }}>
                          <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto', color: '#10b981' }} />
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                            Consultando líneas y consumos en la base de datos...
                          </span>
                        </div>
                      ) : lineasGrupo.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                          No se encontraron líneas activas para este grupo en la base de datos.
                        </div>
                      ) : (
                        <div style={{ border: '1px solid var(--border-light)', borderRadius: '14px', overflow: 'hidden' }}>
                          <table className="premium-table" style={{ fontSize: '12px' }}>
                            <thead>
                              <tr>
                                <th style={{ width: '40px', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={lineasGrupo.length > 0 && lineasGrupo.filter(l => !l.esta_abonada).every(l => selectedLineas.has(l.numero_linea))}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedLineas(new Set(lineasGrupo.filter(l => !l.esta_abonada).map(l => l.numero_linea)));
                                      } else {
                                        setSelectedLineas(new Set());
                                      }
                                    }}
                                  />
                                </th>
                                <th>Línea / Teléfono</th>
                                <th>Socio Asignado</th>
                                <th>Operadora / Plan</th>
                                <th style={{ textAlign: 'right' }}>Importe Período</th>
                                <th style={{ textAlign: 'center' }}>Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineasGrupo.map(l => {
                                const isChecked = selectedLineas.has(l.numero_linea);
                                return (
                                  <tr
                                    key={l.numero_linea}
                                    onClick={() => !l.esta_abonada && toggleLineaSelection(l.numero_linea)}
                                    style={{
                                      cursor: l.esta_abonada ? 'default' : 'pointer',
                                      background: isChecked ? 'rgba(16,185,129,0.06)' : 'transparent',
                                      opacity: l.esta_abonada ? 0.5 : 1
                                    }}
                                  >
                                    <td style={{ textAlign: 'center' }}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={l.esta_abonada}
                                        onChange={() => !l.esta_abonada && toggleLineaSelection(l.numero_linea)}
                                      />
                                    </td>
                                    <td style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '12.5px', color: '#059669' }}>
                                      📞 {l.numero_linea}
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{l.socio_nombre}</td>
                                    <td style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                      {l.proveedor_nombre} · {l.nombre_plan}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#10b981' }}>
                                      ${fmt(l.total_linea)}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      {l.esta_abonada ? (
                                        <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                                          ✓ Abonada
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                                          Pendiente
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* Footer de resumen de líneas seleccionadas */}
                          <div style={{ padding: '16px', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)' }}>
                            <div style={{ fontSize: '13px' }}>
                              Líneas a abonar: <strong>{selectedLineas.size}</strong> de {lineasGrupo.length} · Total: <strong style={{ color: '#10b981', fontSize: '15px' }}>${fmt(totalMontoLineasSeleccionadas)}</strong>
                            </div>

                            <button
                              onClick={handleSaveSingleCobro}
                              disabled={saving || selectedLineas.size === 0}
                              style={{
                                padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#10b981',
                                color: 'white', fontWeight: 800, fontSize: '14px', cursor: (saving || selectedLineas.size === 0) ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px', opacity: (saving || selectedLineas.size === 0) ? 0.6 : 1
                              }}
                            >
                              {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCheck size={16} />}
                              Confirmar Cobro de {selectedLineas.size} Línea(s) (${fmt(totalMontoLineasSeleccionadas)})
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}

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
                    {periodosValidos.map(p => (
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
                    <option value="detect">Detectar de cada fila (texto)</option>
                    <option value="force">Forzar fecha fija para todos</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Fecha de Referencia</label>
                  <input
                    type="date"
                    value={loteFechaRef}
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
                              onChange={(e) => {
                                const newDate = e.target.value;
                                setLoteRows(prev => prev.map(x => x.id === r.id ? { ...x, fecha: newDate } : x));
                              }}
                              style={{ ...inputStyle, padding: '4px 8px', fontSize: '11px', width: '130px' }}
                            />
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
            <Banknote size={18} style={{ color: '#10b981' }} /> Cobros en Efectivo Registrados ({filteredMovs.length})
          </div>

          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginRight: '4px' }}>Filtrar Período:</span>
            <button
              onClick={() => setSelectedPeriod('TODOS')}
              style={{
                padding: '4px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                border: selectedPeriod === 'TODOS' ? '1px solid #10b981' : '1px solid var(--border-light)',
                background: selectedPeriod === 'TODOS' ? '#10b981' : 'transparent',
                color: selectedPeriod === 'TODOS' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              Todos
            </button>
            {periodosValidos.map(p => (
              <button
                key={p}
                onClick={() => setSelectedPeriod(p)}
                style={{
                  padding: '4px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                  border: selectedPeriod === p ? '1px solid #10b981' : '1px solid var(--border-light)',
                  background: selectedPeriod === p ? '#10b981' : 'transparent',
                  color: selectedPeriod === p ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="search-bar" style={{ flex: 1, minWidth: '200px', maxWidth: '350px', marginLeft: 'auto' }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar grupo, socio, línea o recibo..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)' }}
            />
          </div>
          <button onClick={fetchMovimientos} className="icon-button-edit" style={{ height: '38px', width: '38px' }}>
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
                <th>Línea(s)</th>
                <th>Medio</th>
                <th style={{ textAlign: 'right' }}>Monto ($)</th>
                <th style={{ textAlign: 'center' }}>Período</th>
                <th>Observaciones / Recibo</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && movimientos.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '60px', textAlign: 'center' }}>
                    <Loader2 className="animate-spin" size={28} style={{ margin: '0 auto', color: '#10b981' }} />
                  </td>
                </tr>
              ) : filteredMovs.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No hay cobros en efectivo registrados para este filtro
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
                      {mov.numero_linea ? (
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11.5px', background: 'rgba(59,130,246,0.08)', color: '#2563eb', padding: '2px 6px', borderRadius: '6px' }}>
                          📞 {mov.numero_linea}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Grupo Total</span>
                      )}
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
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          onClick={() => {
                            setComprobanteData({
                              reciboNumero: `REC-${mov.id}`,
                              fecha: mov.fecha,
                              numero_grupo: mov.numero_grupo,
                              nombre_titular: mov.nombre,
                              monto_cobrado: Math.abs(parseFloat(mov.importe)),
                              medio_pago: 'EFECTIVO EN MUT',
                              observaciones: mov.observaciones,
                              efectivo_entregado: Math.abs(parseFloat(mov.importe))
                            });
                            setComprobanteModalOpen(true);
                          }}
                          title="Ver Recibo Oficial"
                          className="icon-button-edit"
                          style={{
                            background: 'var(--surface)', border: '1px solid var(--border-light)',
                            borderRadius: '8px', cursor: 'pointer', display: 'inline-flex',
                            alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px'
                          }}
                        >
                          <Printer size={13} style={{ color: '#059669' }} />
                        </button>
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
                      </div>
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
// KPICard
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
