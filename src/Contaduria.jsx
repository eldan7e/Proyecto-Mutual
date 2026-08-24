import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calculator, Search, DollarSign, TrendingUp, AlertTriangle, 
  Loader2, RefreshCw, Plus, CheckCircle2, ChevronRight, ChevronDown, ChevronUp, ShieldCheck, 
  Download, ArrowUpRight, ArrowDownLeft, Settings, Building, Calendar, 
  FileText, Users, Eye, Edit3, X, Receipt, Filter, Clock, Sparkles,
  FileCheck, AlertCircle, Phone, ArrowRight, CornerDownRight, Percent, Sliders
} from 'lucide-react';
import { supabase } from './supabaseClient';
import Modal from './components/Modal';
import ComprobanteCobroModal from './components/ComprobanteCobroModal';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import { 
  getParametrosCuenta, updateTasaAnual, fetchGruposUnicos, 
  fetchMovimientosGrupo, fetchInformeSaldosGeneral, registrarCobroCuenta 
} from './services/cuentaCorrienteService';
import { fetchPeriods } from './services/conciliacionService';
import { 
  recalcularSaldosGrupo, imputarCobroFIFO, formatMoney, 
  calcularDiasMora, calcularInteresMora, DEFAULT_TNA 
} from './utils/cuentaCorrienteEngine';

export default function Contaduria() {
  const { addToast } = useToast();
  const confirm = useConfirm();

  const getTodayISO = () => new Date().toISOString().slice(0, 10);

  // --- ESTADOS PRINCIPALES XUBIO ---
  const [activeTab, setActiveTab] = useState('facturas'); // 'facturas' | 'saldos' | 'extracto' | 'lineas'
  const [estadoFilter, setEstadoFilter] = useState('TODAS'); // 'TODAS' | 'IMPAGAS' | 'PARCIALES' | 'COBRADAS'
  const [operadoraFilter, setOperadoraFilter] = useState('TODAS'); // 'TODAS' | 'CLARO' | 'MOVISTAR' | 'PERSONAL'
  const [expandedGruposFacturas, setExpandedGruposFacturas] = useState(new Set());
  
  // Listas de Datos
  const [gruposList, setGruposList] = useState([]);
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [liquidacionesAll, setLiquidacionesAll] = useState([]);
  const [liquidacionesGrupo, setLiquidacionesGrupo] = useState([]);
  const [lineasGrupo, setLineasGrupo] = useState([]);
  const [lineasPeriodoFiltro, setLineasPeriodoFiltro] = useState('2026-01');
  const [periodosDisponiblesState, setPeriodosDisponiblesState] = useState([]);

  // Loaders
  const [loading, setLoading] = useState(false);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [loadingLiqs, setLoadingLiqs] = useState(false);
  const [loadingLineas, setLoadingLineas] = useState(false);

  // Parámetros TNA
  const [tna, setTna] = useState(DEFAULT_TNA);
  const [editingTna, setEditingTna] = useState('120');
  const [savingTna, setSavingTna] = useState(false);
  const [isTnaModalOpen, setIsTnaModalOpen] = useState(false);

  // Filtros de Búsqueda
  const [searchGrupo, setSearchGrupo] = useState('');
  const [soloDeudores, setSoloDeudores] = useState(false);
  const [saldosData, setSaldosData] = useState([]);

  // Modal de cobro FIFO / Factura Específica
  const [cobroModalOpen, setCobroModalOpen] = useState(false);
  const [targetFactura, setTargetFactura] = useState(null); // Si se cobra una factura en particular
  const [montoCobro, setMontoCobro] = useState('');
  const [medioPago, setMedioPago] = useState('TRANSFERENCIA');
  const [observacionesCobro, setObservacionesCobro] = useState('');
  const [fechaCobro, setFechaCobro] = useState(getTodayISO());
  const [procesandoCobro, setProcesandoCobro] = useState(false);
  const [resultadoFifo, setResultadoFifo] = useState(null);

  // Modal de Nota de Crédito / Ajuste Contable (estilo Xubio)
  const [ajusteModalOpen, setAjusteModalOpen] = useState(false);
  const [tipoAjuste, setTipoAjuste] = useState('CREDITO'); // 'CREDITO' (descuento) | 'DEBITO' (recargo)
  const [montoAjuste, setMontoAjuste] = useState('');
  const [conceptoAjuste, setConceptoAjuste] = useState('');
  const [procesandoAjuste, setProcesandoAjuste] = useState(false);

  // Modal de Comprobante de Cobro
  const [comprobanteModalOpen, setComprobanteModalOpen] = useState(false);
  const [comprobanteData, setComprobanteData] = useState(null);

  // Modal de Edición Rápida de Grupo / Titular
  const [editGrupoModalOpen, setEditGrupoModalOpen] = useState(false);
  const [grupoEditData, setGrupoEditData] = useState(null);
  const [editTitularNombre, setEditTitularNombre] = useState('');
  const [savingGrupoEdit, setSavingGrupoEdit] = useState(false);

  // Modal de Desglose de Líneas de una Liquidación
  const [desgloseLiqModalOpen, setDesgloseLiqModalOpen] = useState(false);
  const [selectedLiqDesglose, setSelectedLiqDesglose] = useState(null);

  // --- CARGA INICIAL ---
  useEffect(() => {
    loadInicial();
  }, []);

  // Cargar saldos de informe general
  useEffect(() => {
    loadSaldosGeneral();
  }, [soloDeudores, tna]);

  // Cargar todas las liquidaciones (facturas)
  useEffect(() => {
    loadTodasLiquidaciones();
  }, []);

  // Cargar detalles cuando cambia el grupo seleccionado o el período de líneas
  useEffect(() => {
    if (selectedGrupo !== null) {
      loadMovimientos(selectedGrupo);
      loadLiquidaciones(selectedGrupo);
      loadLineasGrupo(selectedGrupo, lineasPeriodoFiltro);
    }
  }, [selectedGrupo, lineasPeriodoFiltro]);

  // Suscripción Realtime para actualizar movimientos en vivo
  useEffect(() => {
    if (!selectedGrupo) return;

    const channel = supabase
      .channel(`contaduria-full-${selectedGrupo}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'movimientos_cuenta'
        },
        () => {
          if (selectedGrupo) loadMovimientos(selectedGrupo);
          loadSaldosGeneral();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'liquidaciones_grupos'
        },
        () => {
          loadTodasLiquidaciones();
          if (selectedGrupo) loadLiquidaciones(selectedGrupo);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGrupo]);

  async function loadInicial() {
    setLoadingGrupos(true);
    try {
      const [params, grupos, periodos] = await Promise.all([
        getParametrosCuenta(),
        fetchGruposUnicos(),
        fetchPeriods()
      ]);

      if (params && params.tasa_anual) {
        setTna(params.tasa_anual);
        setEditingTna(String(params.tasa_anual));
      }
      setGruposList(grupos);
      if (grupos.length > 0 && selectedGrupo === null) {
        setSelectedGrupo(grupos[0].numero_grupo);
      }
      if (periodos && periodos.length > 0) {
        setPeriodosDisponiblesState(periodos);
      }
    } catch (err) {
      console.error('Error al cargar datos iniciales de contaduría:', err);
      addToast('Error al inicializar módulo de contaduría: ' + err.message, 'error');
    } finally {
      setLoadingGrupos(false);
    }
  }

  async function loadTodasLiquidaciones() {
    setLoadingLiqs(true);
    try {
      let allLiqs = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data: liqsData, error: liqsError } = await supabase
          .from('liquidaciones_grupos')
          .select('*, proveedores(nombre), socios(nombre_completo)')
          .range(from, from + pageSize - 1)
          .order('periodo', { ascending: false })
          .order('numero_grupo', { ascending: true });

        if (liqsError) throw liqsError;
        if (!liqsData || liqsData.length === 0) break;

        allLiqs = allLiqs.concat(liqsData);
        if (liqsData.length < pageSize) break;
        from += pageSize;
      }

      const listaCompleta = allLiqs
        .filter(l => l.numero_grupo !== 0 && Number(l.monto_total_facturado || 0) > 0)
        .map(l => ({
          liquidacion_id: l.liquidacion_id,
          numero_grupo: l.numero_grupo,
          periodo: l.periodo,
          monto_total_facturado: Number(l.monto_total_facturado || 0),
          monto_abonado: Number(l.monto_abonado || 0),
          estado_pago: l.estado_pago || 'IMPAGA',
          proveedores: l.proveedores || { nombre: 'MUTUAL' },
          socios: l.socios || { nombre_completo: l.nombre || `Grupo ${l.numero_grupo}` },
          total_lineas_lote: l.total_lineas_lote || 1,
          origen: 'LIQUIDACION'
        }))
        .sort((a, b) => {
          if (b.periodo !== a.periodo) return b.periodo.localeCompare(a.periodo);
          return a.numero_grupo - b.numero_grupo;
        });

      setLiquidacionesAll(listaCompleta);

      const pSet = new Set();
      listaCompleta.forEach(l => {
        if (l.periodo) pSet.add(l.periodo);
      });
      if (pSet.size > 0) {
        setPeriodosDisponiblesState(Array.from(pSet).sort().reverse());
      }
    } catch (err) {
      console.error('Error al cargar liquidaciones:', err);
    } finally {
      setLoadingLiqs(false);
    }
  }

  async function loadSaldosGeneral() {
    setLoading(true);
    try {
      const data = await fetchInformeSaldosGeneral({ search: searchGrupo, soloDeudores });
      setSaldosData(data);
    } catch (err) {
      console.error('Error al cargar informe de saldos:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMovimientos(numeroGrupo) {
    setLoading(true);
    try {
      const rawMovs = await fetchMovimientosGrupo(numeroGrupo);
      const procesados = recalcularSaldosGrupo(rawMovs, 0);
      setMovimientos(procesados);
    } catch (err) {
      console.error('Error al cargar movimientos:', err);
      addToast('Error al cargar movimientos del grupo ' + numeroGrupo, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadLiquidaciones(numeroGrupo) {
    try {
      const { data, error } = await supabase
        .from('liquidaciones_grupos')
        .select('*, proveedores(nombre), socios(nombre_completo)')
        .eq('numero_grupo', numeroGrupo)
        .order('periodo', { ascending: false });

      if (error) throw error;
      setLiquidacionesGrupo(data || []);
    } catch (err) {
      console.error('Error al cargar liquidaciones del grupo:', err);
    }
  }

  async function loadLineasGrupo(numeroGrupo, periodo = lineasPeriodoFiltro) {
    if (!numeroGrupo) {
      setLineasGrupo([]);
      return;
    }
    setLoadingLineas(true);
    try {
      // 1. Obtener socios del grupo desde v_socios_busqueda y grupo_socio
      const { data: sociosGrupo } = await supabase
        .from('v_socios_busqueda')
        .select('socio_id')
        .filter('grupo_codigo_str', 'imatch', '\\y' + numeroGrupo + '\\y');

      const socioIds = (sociosGrupo || []).map(s => s.socio_id).filter(Boolean);

      // 2. Armar filtro OR para traer lineas por numero_grupo O por socio_id del grupo
      let orConds = [`numero_grupo.eq.${numeroGrupo}`];
      if (socioIds.length > 0) {
        orConds.push(`socio_id.in.(${socioIds.join(',')})`);
      }

      const { data: rawLineas, error } = await supabase
        .from('lineas')
        .select('*, proveedores:proveedor_id(nombre), socios:socio_id(nombre_completo), planes_abonos:plan_id(nombre_plan, precio)')
        .or(orConds.join(','));

      if (error) throw error;

      // FILTRAR SOLO LÍNEAS ACTIVAS (las líneas dadas de baja no aparecen en la pestaña activa)
      const activas = (rawLineas || []).filter(l => (l.estado || 'ACTIVA').toUpperCase() !== 'BAJA');
      const lineNums = activas.map(l => l.numero_linea).filter(Boolean);

      // 3. Traer la liquidación oficial del grupo para el período seleccionado (la que figura en Factura / Libro Mayor)
      const { data: liqGrupo } = await supabase
        .from('liquidaciones_grupos')
        .select('monto_total_facturado, costo_operadora_neto, beneficio_aunar')
        .eq('numero_grupo', numeroGrupo)
        .eq('periodo', periodo)
        .maybeSingle();

      const grupoMontoFacturado = liqGrupo ? parseFloat(liqGrupo.monto_total_facturado) : 0;

      // 4. Traer los consumos de cada línea en ese período
      let billingMap = {};
      if (lineNums.length > 0 && periodo) {
        const { data: billingData } = await supabase
          .from('v_historial_facturacion_socio')
          .select('*')
          .eq('periodo', periodo)
          .in('numero_linea', lineNums);

        if (billingData) {
          billingData.forEach(b => {
            billingMap[b.numero_linea] = b;
          });
        }
      }

      // Calcular suma de consumos brutos de las líneas del grupo
      const rawSum = activas.reduce((acc, l) => {
        const b = billingMap[l.numero_linea];
        const val = b ? parseFloat(b.total_linea) : (parseFloat(l.planes_abonos?.precio) || 0);
        return acc + val;
      }, 0);

      // Factor de ajuste para que coincida exactamente con la Factura de Contaduría / Liquidación Oficial
      const factorAjuste = (grupoMontoFacturado > 0 && rawSum > 0) ? (grupoMontoFacturado / rawSum) : 1;

      // Enriquecer líneas activas con su facturación real sincronizada con la factura del grupo
      let acumulado = 0;
      const enriched = activas.map((l, index) => {
        const b = billingMap[l.numero_linea];
        const rawLineVal = b ? parseFloat(b.total_linea) : (parseFloat(l.planes_abonos?.precio) || 0);
        
        let facturadoFinal = 0;
        if (grupoMontoFacturado > 0) {
          if (index === activas.length - 1) {
            // Última línea ajusta el redondeo de centavos
            facturadoFinal = Math.max(0, Math.round((grupoMontoFacturado - acumulado) * 100) / 100);
          } else {
            facturadoFinal = Math.round((rawLineVal * factorAjuste) * 100) / 100;
            acumulado += facturadoFinal;
          }
        } else {
          facturadoFinal = rawLineVal;
        }

        return {
          ...l,
          facturado_periodo: facturadoFinal,
          costo_abono_real: b ? parseFloat(b.costo_abono_real) : (parseFloat(l.planes_abonos?.precio) || 0),
          excedentes: b ? parseFloat(b.excedentes) : 0,
          bonificaciones: b ? parseFloat(b.bonificaciones) : 0,
          plan_facturado: b?.nombre_plan || l.planes_abonos?.nombre_plan || 'Plan Estándar'
        };
      });

      setLineasGrupo(enriched);
    } catch (err) {
      console.error('Error al cargar líneas del grupo:', err);
      setLineasGrupo([]);
    } finally {
      setLoadingLineas(false);
    }
  }

  // Guardar TNA
  async function handleSaveTna(e) {
    e.preventDefault();
    setSavingTna(true);
    try {
      const val = parseFloat(editingTna);
      if (isNaN(val) || val <= 0) throw new Error('Tasa inválida');
      await updateTasaAnual(val);
      setTna(val);
      setIsTnaModalOpen(false);
      addToast(`Tasa TNA actualizada a ${val}%`, 'success');
      if (selectedGrupo) loadMovimientos(selectedGrupo);
      loadSaldosGeneral();
    } catch (err) {
      addToast('Error al guardar TNA: ' + err.message, 'error');
    } finally {
      setSavingTna(false);
    }
  }

  // Abrir Cobro para Factura Específica o Libre
  function handleOpenCobroModal(liq = null, grupoNum = null) {
    if (liq) {
      setTargetFactura(liq);
      setSelectedGrupo(liq.numero_grupo);
      const saldoPend = Math.max(0, Number(liq.monto_total_facturado) - Number(liq.monto_abonado || 0));
      setMontoCobro(saldoPend > 0 ? String(saldoPend) : String(liq.monto_total_facturado));
      setObservacionesCobro(`Cobro Facturación Período ${liq.periodo} (${liq.proveedores?.nombre || 'MUTUAL'})`);
    } else {
      setTargetFactura(null);
      if (grupoNum) setSelectedGrupo(grupoNum);
      setMontoCobro('');
      setObservacionesCobro('');
    }
    setCobroModalOpen(true);
  }

  // --- CÁLCULO DE FIFO Y COBRO ---
  useEffect(() => {
    if (!cobroModalOpen || !montoCobro || isNaN(parseFloat(montoCobro))) {
      setResultadoFifo(null);
      return;
    }

    const val = Math.abs(parseFloat(montoCobro));
    if (val <= 0) {
      setResultadoFifo(null);
      return;
    }

    const facturasPendientes = movimientos
      .filter(m => m.tipo === 'FACTURA' && (m.saldo_final > 0 || (m.importe - (m.pago_aplicado_capital || 0)) > 0))
      .map(m => ({
        id: m.id,
        fecha: m.fecha,
        numero_linea: m.numero_linea,
        empresa: m.empresa,
        observaciones: m.observaciones,
        importe: m.importe,
        pago_aplicado_capital: m.pago_aplicado_capital || 0,
        pago_aplicado_interes: m.pago_aplicado_interes || 0
      }));

    const resultado = imputarCobroFIFO(facturasPendientes, val, tna, fechaCobro);
    setResultadoFifo(resultado);
  }, [montoCobro, cobroModalOpen, movimientos, tna, fechaCobro]);

  // Ejecutar Cobro
  async function handleConfirmarCobro(e) {
    e.preventDefault();
    const val = parseFloat(montoCobro);
    if (isNaN(val) || val <= 0) {
      addToast('Ingrese un importe de cobro válido', 'warning');
      return;
    }

    const titularInfo = gruposList.find(g => g.numero_grupo === selectedGrupo);
    setProcesandoCobro(true);

    try {
      const nuevoMov = await registrarCobroCuenta({
        numero_grupo: selectedGrupo,
        nombre: titularInfo?.nombre || `Grupo ${selectedGrupo}`,
        importe: val,
        medio_pago: medioPago,
        observaciones: observacionesCobro || `Cobro registrado en Contaduría - ${medioPago}`,
        fecha: fechaCobro,
        periodo: targetFactura?.periodo || null,
        imputaciones: resultadoFifo?.desgloses || []
      });

      // Si el cobro se originó desde una factura específica, asegurar actualización directa
      if (targetFactura) {
        const pagadoActual = Number(targetFactura.monto_abonado || 0);
        const totalFact = Number(targetFactura.monto_total_facturado || 0);
        const nuevoAbonado = Math.min(totalFact, pagadoActual + val);
        const nuevoEstado = nuevoAbonado >= (totalFact - 1) ? 'ABONADO' : 'PARCIAL';

        await supabase
          .from('liquidaciones_grupos')
          .update({
            monto_abonado: Math.round(nuevoAbonado * 100) / 100,
            estado_pago: nuevoEstado,
            updated_at: new Date().toISOString()
          })
          .eq('liquidacion_id', targetFactura.liquidacion_id);
      }

      addToast(`Cobro de ${formatMoney(val)} registrado exitosamente.`, 'success');

      setComprobanteData({
        fecha: fechaCobro,
        grupo: selectedGrupo,
        titular: titularInfo?.nombre || `Grupo ${selectedGrupo}`,
        importe: val,
        medioPago,
        observaciones: observacionesCobro,
        interesPagado: resultadoFifo?.totalInteresCancelado || 0,
        capitalPagado: resultadoFifo?.totalCapitalCancelado || 0,
        remanenteSaldoAFavor: resultadoFifo?.remanenteSaldoAFavor || 0,
        desgloses: resultadoFifo?.desgloses || []
      });

      setCobroModalOpen(false);
      setTargetFactura(null);
      setMontoCobro('');
      setObservacionesCobro('');
      setResultadoFifo(null);

      await loadTodasLiquidaciones();
      if (selectedGrupo) {
        await loadMovimientos(selectedGrupo);
        await loadLiquidaciones(selectedGrupo);
      }
      await loadSaldosGeneral();

      setComprobanteModalOpen(true);
    } catch (err) {
      console.error('Error al registrar cobro:', err);
      addToast('Error al procesar el cobro: ' + err.message, 'error');
    } finally {
      setProcesandoCobro(false);
    }
  }

  // --- REGISTRAR NOTA DE CRÉDITO / AJUSTE CONTABLE ---
  async function handleConfirmarAjuste(e) {
    e.preventDefault();
    const val = parseFloat(montoAjuste);
    if (isNaN(val) || val <= 0) {
      addToast('Ingrese un importe de ajuste válido', 'warning');
      return;
    }

    if (!conceptoAjuste.trim()) {
      addToast('Ingrese el concepto o motivo del ajuste contable', 'warning');
      return;
    }

    setProcesandoAjuste(true);
    try {
      const isCredito = tipoAjuste === 'CREDITO';
      const importeFinal = isCredito ? -val : val; // Crédito resta deuda (negativo), Débito suma (positivo)
      const titularInfo = gruposList.find(g => g.numero_grupo === selectedGrupo);

      // 1. Obtener el último saldo
      const { data: ultimos } = await supabase
        .from('movimientos_cuenta')
        .select('saldo_capital')
        .eq('numero_grupo', selectedGrupo)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);

      const saldoAnt = ultimos && ultimos.length > 0 ? Number(ultimos[0].saldo_capital || 0) : 0;
      const nuevoSaldo = saldoAnt + importeFinal;

      // 2. Insertar movimiento AJUSTE
      await supabase.from('movimientos_cuenta').insert({
        fecha: getTodayISO(),
        numero_grupo: selectedGrupo,
        nombre: titularInfo?.nombre || `Grupo ${selectedGrupo}`,
        importe: importeFinal,
        tipo: isCredito ? 'NOTA_CREDITO' : 'NOTA_DEBITO',
        medio_pago: 'AJUSTE_CONTABLE',
        observaciones: `Ajuste Contable (${tipoAjuste}): ${conceptoAjuste}`,
        origen: 'CONTADURIA_XUBIO',
        saldo_capital_anterior: saldoAnt,
        saldo_capital: nuevoSaldo,
        saldo_final: nuevoSaldo
      });

      addToast(`Ajuste Contable de ${formatMoney(val)} aplicado a Grupo #${selectedGrupo}`, 'success');
      setAjusteModalOpen(false);
      setMontoAjuste('');
      setConceptoAjuste('');

      await loadMovimientos(selectedGrupo);
      await loadSaldosGeneral();
    } catch (err) {
      console.error('Error al aplicar ajuste:', err);
      addToast('Error al procesar ajuste: ' + err.message, 'error');
    } finally {
      setProcesandoAjuste(false);
    }
  }

  // --- EDICIÓN RÁPIDA DE TITULAR / GRUPO ---
  function handleOpenEditGrupo(grupoNum) {
    const info = gruposList.find(g => g.numero_grupo === grupoNum);
    setGrupoEditData(info);
    setEditTitularNombre(info?.nombre || '');
    setEditGrupoModalOpen(true);
  }

  async function handleSaveGrupoEdit(e) {
    e.preventDefault();
    if (!grupoEditData || !editTitularNombre.trim()) return;

    setSavingGrupoEdit(true);
    try {
      await supabase
        .from('movimientos_cuenta')
        .update({ nombre: editTitularNombre.trim() })
        .eq('numero_grupo', grupoEditData.numero_grupo);

      addToast(`Nombre del Grupo ${grupoEditData.numero_grupo} actualizado a "${editTitularNombre.trim()}"`, 'success');
      setEditGrupoModalOpen(false);
      loadInicial();
      loadSaldosGeneral();
      if (selectedGrupo) loadMovimientos(selectedGrupo);
    } catch (err) {
      addToast('Error al actualizar nombre: ' + err.message, 'error');
    } finally {
      setSavingGrupoEdit(false);
    }
  }

  // Filtro de Período y Paginación para Facturas
  const [periodoFilter, setPeriodoFilter] = useState('AUTO');
  const [currentPageFacturas, setCurrentPageFacturas] = useState(1);
  const pageSizeFacturas = 50;

  // Lista de períodos de facturación disponibles ordenados de más reciente a más antiguo
  const periodosDisponibles = useMemo(() => {
    const pSet = new Set(periodosDisponiblesState);
    liquidacionesAll.forEach(l => {
      if (l.periodo) pSet.add(l.periodo);
    });
    return Array.from(pSet).filter(Boolean).sort().reverse();
  }, [liquidacionesAll, periodosDisponiblesState]);

  // Reset página cuando cambian los filtros
  useEffect(() => {
    setCurrentPageFacturas(1);
  }, [searchGrupo, estadoFilter, operadoraFilter, periodoFilter]);

  // --- FILTRADO BASE DE COMPROBANTES PARA KPIS Y TABLA (SEGÚN PERÍODO, OPERADORA Y BÚSQUEDA) ---
  const liquidacionesBaseKPIs = useMemo(() => {
    const hasSearch = Boolean(searchGrupo.trim());
    let targetPeriod = null;

    if (periodoFilter === 'AUTO') {
      targetPeriod = periodosDisponibles.length > 0 ? periodosDisponibles[0] : null;
    } else if (periodoFilter !== 'TODOS') {
      targetPeriod = periodoFilter;
    }

    return liquidacionesAll.filter(l => {
      if (l.numero_grupo === 0) return false;

      // Filtro por Período
      if (targetPeriod && l.periodo !== targetPeriod) return false;

      // Filtro por Operadora
      const opNombre = (l.proveedores?.nombre || '').toUpperCase();
      if (operadoraFilter !== 'TODAS' && opNombre !== operadoraFilter) return false;

      // Buscador
      if (hasSearch) {
        const s = searchGrupo.toLowerCase().trim();
        const matchGrupo = String(l.numero_grupo).includes(s);
        const matchSocio = (l.socios?.nombre_completo || '').toLowerCase().includes(s);
        const matchPeriodo = (l.periodo || '').toLowerCase().includes(s);
        const matchOp = opNombre.toLowerCase().includes(s);
        if (!matchGrupo && !matchSocio && !matchPeriodo && !matchOp) return false;
      }

      return true;
    });
  }, [liquidacionesAll, operadoraFilter, searchGrupo, periodoFilter, periodosDisponibles]);

  // --- FILTRADO FINAL DE COMPROBANTES PARA LA TABLA (CON FILTRO DE ESTADO PAGO) ---
  const facturasFiltradas = useMemo(() => {
    return liquidacionesBaseKPIs.filter(l => {
      const totalFact = Number(l.monto_total_facturado || 0);
      const abonado = Number(l.monto_abonado || 0);
      const pendiente = totalFact - abonado;

      const isAbonada = l.estado_pago === 'ABONADO' || pendiente <= 1;
      const isParcial = l.estado_pago === 'PARCIAL' || (abonado > 0 && pendiente > 1);
      const isImpaga = !isAbonada && !isParcial;

      if (estadoFilter === 'IMPAGAS' && !isImpaga) return false;
      if (estadoFilter === 'PARCIALES' && !isParcial) return false;
      if (estadoFilter === 'COBRADAS' && !isAbonada) return false;

      return true;
    });
  }, [liquidacionesBaseKPIs, estadoFilter]);

  // --- AGRUPACIÓN DE FACTURAS POR GRUPO Y PERÍODO CON DETALLE MULTI-PROVEEDOR ---
  const facturasAgrupadas = useMemo(() => {
    const map = new Map();

    facturasFiltradas.forEach(liq => {
      const groupKey = `${liq.periodo}-${liq.numero_grupo}`;
      if (!map.has(groupKey)) {
        map.set(groupKey, {
          key: groupKey,
          periodo: liq.periodo,
          numero_grupo: liq.numero_grupo,
          socio: liq.socios,
          socio_id: liq.socio_id,
          total_lineas: 0,
          monto_total_facturado: 0,
          monto_abonado: 0,
          saldo_impago: 0,
          items: []
        });
      }

      const g = map.get(groupKey);
      const totalFact = Number(liq.monto_total_facturado || 0);
      const abonado = Number(liq.monto_abonado || 0);
      const pendiente = Math.max(0, totalFact - abonado);

      g.total_lineas += (liq.total_lineas_lote || 1);
      g.monto_total_facturado += totalFact;
      g.monto_abonado += abonado;
      g.saldo_impago += pendiente;
      g.items.push(liq);
    });

    return Array.from(map.values()).map(g => {
      const isCobrada = g.saldo_impago <= 1;
      const isParcial = !isCobrada && g.monto_abonado > 0;
      return {
        ...g,
        estado_consolidado: isCobrada ? 'ABONADO' : isParcial ? 'PARCIAL' : 'PENDIENTE',
        isMultiProvider: g.items.length > 1
      };
    });
  }, [facturasFiltradas]);

  const toggleExpandGrupo = (key) => {
    setExpandedGruposFacturas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalPagesFacturas = Math.ceil(facturasAgrupadas.length / pageSizeFacturas) || 1;

  const facturasPaginadas = useMemo(() => {
    const start = (currentPageFacturas - 1) * pageSizeFacturas;
    return facturasAgrupadas.slice(start, start + pageSizeFacturas);
  }, [facturasAgrupadas, currentPageFacturas]);

  // --- FILTRADO DE SALDOS / CUENTAS CORRIENTES ---
  const saldosFiltrados = useMemo(() => {
    return saldosData.filter(row => {
      if (row.numero_grupo === 0) return false;

      if (soloDeudores && row.saldoFinalUltimo <= 5) return false;

      if (searchGrupo.trim()) {
        const s = searchGrupo.toLowerCase().trim();
        const matchGrupo = String(row.numero_grupo).includes(s);
        const matchNombre = (row.nombre || '').toLowerCase().includes(s);
        const matchEmpresas = (row.empresas || '').toLowerCase().includes(s);
        if (!matchGrupo && !matchNombre && !matchEmpresas) return false;
      }

      return true;
    });
  }, [saldosData, soloDeudores, searchGrupo]);

  // --- CÁLCULO DE KPIs GLOBALES DINÁMICOS (ACTUALIZADOS SEGÚN PERÍODO / OPERADORA) ---
  const statsGlobales = useMemo(() => {
    let totalFacturado = 0;
    let totalCobrado = 0;
    let totalPendiente = 0;
    let comprobantesImpagosCount = 0;
    const gruposEnSeleccion = new Set();

    liquidacionesBaseKPIs.forEach(l => {
      const fact = Number(l.monto_total_facturado || 0);
      const abon = Number(l.monto_abonado || 0);
      const pend = Math.max(0, fact - abon);

      totalFacturado += fact;
      totalCobrado += abon;
      totalPendiente += pend;

      if (pend > 5) comprobantesImpagosCount++;
      if (l.numero_grupo) gruposEnSeleccion.add(l.numero_grupo);
    });

    let totalIntereses = 0;
    saldosData.forEach(g => {
      const hasFilter = periodoFilter !== 'TODOS' || operadoraFilter !== 'TODAS' || Boolean(searchGrupo.trim());
      if (!hasFilter || gruposEnSeleccion.has(g.numero_grupo)) {
        totalIntereses += g.interesPendUltimo || 0;
      }
    });

    const saldoNetoReal = totalFacturado - totalCobrado;
    const totalSaldosAFavor = Math.max(0, totalPendiente - saldoNetoReal);

    return {
      totalFacturado,
      totalCobrado,
      totalPendiente,
      saldoNetoReal,
      totalSaldosAFavor,
      comprobantesImpagosCount,
      totalIntereses,
      totalComprobantes: liquidacionesBaseKPIs.length
    };
  }, [liquidacionesBaseKPIs, saldosData, periodoFilter, operadoraFilter, searchGrupo]);

  // Informacion del titular del grupo seleccionado
  const titularSeleccionadoInfo = useMemo(() => {
    if (!selectedGrupo) return null;
    return gruposList.find(g => g.numero_grupo === selectedGrupo) || null;
  }, [selectedGrupo, gruposList]);

  // Movimientos del grupo seleccionado
  const ultimoMovGrupo = useMemo(() => {
    if (movimientos.length === 0) return null;
    return movimientos[movimientos.length - 1];
  }, [movimientos]);

  return (
    <div className="page-container animate-fade" style={{ paddingBottom: '60px' }}>
      
      {/* HEADER PRINCIPAL CONTADURÍA ESTILO XUBIO */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--accent)', color: 'white', padding: '12px', borderRadius: '16px', boxShadow: '0 10px 20px -5px rgba(22, 163, 74, 0.4)' }}>
              <Calculator size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: 'var(--text-primary)' }}>
                  Facturación y Contaduría
                </h1>
                <span style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                  SUITE ESTILO XUBIO
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0', fontWeight: 500 }}>
                Administración contable de saldos pagos, impagos, liquidaciones por grupo y cobranzas.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            onClick={() => {
              if (selectedGrupo) setAjusteModalOpen(true);
              else addToast('Seleccione un grupo primero para aplicar un ajuste', 'warning');
            }}
            className="air-btn"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 700 }}
          >
            <Plus size={16} /> Nota de Crédito / Ajuste
          </button>
          
          <button 
            onClick={() => handleOpenCobroModal()}
            className="air-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 800 }}
          >
            <DollarSign size={18} /> Registrar Cobro
          </button>
        </div>
      </div>

      {/* DASHBOARD KPIS XUBIO */}
      <div className="bento-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: '28px', gap: '16px' }}>
        <div className="bento-card" style={{ padding: '20px', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>FACTURACIÓN TOTAL</span>
            <FileText size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)' }}>
            {formatMoney(statsGlobales.totalFacturado)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
            {statsGlobales.totalComprobantes} comprobantes liquidados
          </div>
        </div>

        <div className="bento-card" style={{ padding: '20px', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>COBRADO E IMPUTADO</span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#10b981' }}>
            {formatMoney(statsGlobales.totalCobrado)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
            Ingresos reales acreditados
          </div>
        </div>

        <div className="bento-card" style={{ padding: '20px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>SALDO IMPAGO NETO</span>
            <AlertCircle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#ef4444' }}>
            {formatMoney(statsGlobales.saldoNetoReal)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
            <span style={{ color: '#ef4444', fontWeight: 700 }}>{statsGlobales.comprobantesImpagosCount} facturas pendientes</span>
            {statsGlobales.totalSaldosAFavor > 0 && (
              <span style={{ marginLeft: '4px', color: 'var(--text-secondary)' }}>· Deuda bruta: {formatMoney(statsGlobales.totalPendiente)}</span>
            )}
          </div>
        </div>

        <div className="bento-card" style={{ padding: '20px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>SALDOS A FAVOR / EXCEDENTES</span>
            <DollarSign size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#3b82f6' }}>
            {formatMoney(statsGlobales.totalSaldosAFavor)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
            Pagos adelantados / excedentes
          </div>
        </div>
      </div>

      {/* PESTAÑAS PRINCIPALES DEL MÓDULO ESTILO XUBIO */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(0,0,0,0.03)', padding: '6px', borderRadius: '18px', width: 'fit-content', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('facturas')}
          className={`nav-pill ${activeTab === 'facturas' ? 'active' : ''}`}
          style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
        >
          <Receipt size={16} /> Facturas y Comprobantes ({facturasAgrupadas.length})
        </button>
        <button
          onClick={() => setActiveTab('saldos')}
          className={`nav-pill ${activeTab === 'saldos' ? 'active' : ''}`}
          style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
        >
          <Building size={16} /> Cuentas Corrientes y Saldos ({saldosFiltrados.length})
        </button>
        <button
          onClick={() => setActiveTab('extracto')}
          className={`nav-pill ${activeTab === 'extracto' ? 'active' : ''}`}
          style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
        >
          <FileText size={16} /> Extracto / Libro Mayor (Grupo {selectedGrupo ? `#${selectedGrupo}` : ''})
        </button>
        <button
          onClick={() => setActiveTab('lineas')}
          className={`nav-pill ${activeTab === 'lineas' ? 'active' : ''}`}
          style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
        >
          <Phone size={16} /> Líneas del Grupo ({lineasGrupo.length})
        </button>
      </div>

      {/* PESTAÑA 1: GESTIÓN DE FACTURAS Y COMPROBANTES (VENTAS/LIQUIDACIONES ESTILO XUBIO) */}
      {activeTab === 'facturas' && (
        <div className="bento-card" style={{ padding: '24px' }}>
          
          {/* BARRA DE FILTROS CONTABLES ESTILO XUBIO */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            
            {/* FILTROS DE ESTADO PAGO */}
            <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.03)', padding: '4px', borderRadius: '12px' }}>
              {[
                { id: 'TODAS', label: 'Todas' },
                { id: 'IMPAGAS', label: 'Impagas / Vencidas' },
                { id: 'PARCIALES', label: 'Parciales' },
                { id: 'COBRADAS', label: 'Cobradas' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setEstadoFilter(f.id)}
                  style={{
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: estadoFilter === f.id ? 'var(--surface)' : 'transparent',
                    color: estadoFilter === f.id ? 'var(--accent)' : 'var(--text-secondary)',
                    boxShadow: estadoFilter === f.id ? 'var(--shadow-soft)' : 'none'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* FILTRO OPERADORA + PERÍODO + BUSCADOR */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={periodoFilter}
                onChange={(e) => setPeriodoFilter(e.target.value)}
                className="premium-input"
                style={{ fontSize: '12px', padding: '8px 12px', height: '40px', fontWeight: 800 }}
              >
                <option value="AUTO">Último Período ({periodosDisponibles[0] || 'Actual'})</option>
                <option value="TODOS">Todos los Períodos</option>
                {periodosDisponibles.map(p => (
                  <option key={p} value={p}>Período {p}</option>
                ))}
              </select>

              <select
                value={operadoraFilter}
                onChange={(e) => setOperadoraFilter(e.target.value)}
                className="premium-input"
                style={{ fontSize: '12px', padding: '8px 12px', height: '40px' }}
              >
                <option value="TODAS">Todas las Operadoras</option>
                <option value="CLARO">Claro</option>
                <option value="MOVISTAR">Movistar</option>
                <option value="PERSONAL">Personal</option>
              </select>

              <div style={{ position: 'relative', width: '260px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Buscar grupo, socio o período..."
                  value={searchGrupo}
                  onChange={(e) => setSearchGrupo(e.target.value)}
                  className="premium-input"
                  style={{ width: '100%', paddingLeft: '38px', height: '40px', fontSize: '12px' }}
                />
              </div>

              <button 
                onClick={loadTodasLiquidaciones}
                className="air-btn"
                style={{ padding: '8px 12px', height: '40px', borderRadius: '10px' }}
                title="Refrescar lista"
              >
                <RefreshCw size={14} className={loadingLiqs ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* TABLA PRINCIPAL DE COMPROBANTES XUBIO */}
          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px', borderRadius: '12px 0 0 12px' }}>PERÍODO / ID</th>
                  <th style={{ padding: '12px 14px' }}>GRUPO / SOCIO TITULAR</th>
                  <th style={{ padding: '12px 14px' }}>OPERADORA</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>TOTAL FACTURADO</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>ABONADO</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>SALDO IMPAGO</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>ESTADO CONTABLE</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', borderRadius: '0 12px 12px 0' }}>ACCIONES XUBIO</th>
                </tr>
              </thead>
              <tbody>
                {loadingLiqs ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
                      <Loader2 size={30} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                      <div style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>Cargando comprobantes y facturas contables...</div>
                    </td>
                  </tr>
                ) : facturasAgrupadas.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      No se encontraron comprobantes o facturas para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  facturasPaginadas.map((group) => {
                    const isExpanded = expandedGruposFacturas.has(group.key);
                    const isCobrada = group.estado_consolidado === 'ABONADO';
                    const isParcial = group.estado_consolidado === 'PARCIAL';

                    return (
                      <React.Fragment key={group.key}>
                        {/* FILA PRINCIPAL CONSOLIDADA */}
                        <tr 
                          onClick={() => group.isMultiProvider && toggleExpandGrupo(group.key)}
                          style={{ 
                            borderBottom: isExpanded ? 'none' : '1px solid var(--border-light)', 
                            background: selectedGrupo === group.numero_grupo ? 'rgba(16,185,129,0.03)' : isExpanded ? 'rgba(255,255,255,0.015)' : 'transparent',
                            cursor: group.isMultiProvider ? 'pointer' : 'default',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {/* 1. PERÍODO / ID */}
                          <td style={{ padding: '14px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                            <div style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{group.periodo}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500, marginTop: '2px' }}>
                              {group.isMultiProvider ? `${group.items.length} liquidaciones` : `#LIQ-${group.items[0]?.liquidacion_id}`}
                            </div>
                          </td>

                          {/* 2. GRUPO / SOCIO */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                              {group.socio?.nombre_completo || `Grupo ${group.numero_grupo}`}
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>Grupo #{group.numero_grupo} · {group.total_lineas} {group.total_lineas === 1 ? 'línea' : 'líneas'}</span>
                              {group.isMultiProvider && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpandGrupo(group.key);
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--accent)',
                                    cursor: 'pointer',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    padding: '0',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  {isExpanded ? 'Ocultar' : 'Ver desglose'}
                                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* 3. OPERADORAS */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {group.items.map(item => {
                                const op = item.proveedores?.nombre || 'OPERADORA';
                                const isClaro = op === 'CLARO';
                                const isMovistar = op === 'MOVISTAR';
                                return (
                                  <span 
                                    key={item.liquidacion_id} 
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      letterSpacing: '0.3px',
                                      background: isClaro ? 'rgba(239, 68, 68, 0.1)' : isMovistar ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                      color: isClaro ? '#f87171' : isMovistar ? '#34d399' : '#60a5fa',
                                      border: isClaro ? '1px solid rgba(239, 68, 68, 0.2)' : isMovistar ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(59, 130, 246, 0.2)'
                                    }}
                                  >
                                    {op}
                                  </span>
                                );
                              })}
                            </div>
                          </td>

                          {/* 4. TOTAL FACTURADO */}
                          <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, fontSize: '13.5px' }}>
                            {formatMoney(group.monto_total_facturado)}
                          </td>

                          {/* 5. ABONADO */}
                          <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, color: '#10b981', fontSize: '13.5px' }}>
                            {formatMoney(group.monto_abonado)}
                          </td>

                          {/* 6. SALDO IMPAGO */}
                          <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, fontSize: '13.5px', color: group.saldo_impago > 5 ? '#ef4444' : 'var(--text-primary)' }}>
                            {formatMoney(group.saldo_impago)}
                          </td>

                          {/* 7. ESTADO */}
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{
                              background: isCobrada ? 'rgba(16, 185, 129, 0.1)' : isParcial ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: isCobrada ? '#10b981' : isParcial ? '#f59e0b' : '#ef4444',
                              padding: '4px 10px', borderRadius: '8px', fontWeight: 800, fontSize: '11px'
                            }}>
                              {isCobrada ? 'COBRADA' : isParcial ? 'PARCIAL' : 'IMPAGA'}
                            </span>
                          </td>

                          {/* 8. ACCIONES */}
                          <td style={{ padding: '14px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              {!isCobrada && (
                                <button
                                  onClick={() => handleOpenCobroModal(group.items[0], group.numero_grupo)}
                                  className="air-btn-primary"
                                  style={{ padding: '5px 12px', fontSize: '11px', borderRadius: '8px', fontWeight: 800 }}
                                  title="Imputar cobro a este grupo"
                                >
                                  Imputar
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedGrupo(group.numero_grupo);
                                  setActiveTab('extracto');
                                }}
                                className="air-btn"
                                style={{ padding: '5px 12px', fontSize: '11px', borderRadius: '8px', fontWeight: 700 }}
                                title="Ver extracto de la cuenta"
                              >
                                Extracto
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* PANEL DESPLEGABLE ELEGANTE POR PROVEEDOR */}
                        {isExpanded && (
                          <tr style={{ background: 'transparent' }}>
                            <td colSpan="8" style={{ padding: '0 16px 14px 16px', borderBottom: '1px solid var(--border-light)' }}>
                              <div style={{
                                background: 'rgba(0, 0, 0, 0.25)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                padding: '14px 18px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.4px' }}>
                                    Desglose por Operadora · Grupo #{group.numero_grupo} ({group.periodo})
                                  </span>
                                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    {group.items.length} operadoras en este período
                                  </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {group.items.map(subLiq => {
                                    const subFact = Number(subLiq.monto_total_facturado || 0);
                                    const subAbonado = Number(subLiq.monto_abonado || 0);
                                    const subPendiente = Math.max(0, subFact - subAbonado);
                                    const subIsCobrada = subLiq.estado_pago === 'ABONADO' || subPendiente <= 1;
                                    const subIsParcial = subLiq.estado_pago === 'PARCIAL' || (subAbonado > 0 && subPendiente > 1);
                                    const subOp = subLiq.proveedores?.nombre || 'OPERADORA';
                                    const isClaro = subOp === 'CLARO';
                                    const isMovistar = subOp === 'MOVISTAR';

                                    return (
                                      <div 
                                        key={subLiq.liquidacion_id}
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          padding: '10px 14px',
                                          background: 'rgba(255, 255, 255, 0.02)',
                                          borderRadius: '8px',
                                          border: '1px solid rgba(255, 255, 255, 0.04)',
                                          flexWrap: 'wrap',
                                          gap: '12px'
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                          <span 
                                            style={{
                                              padding: '3px 9px',
                                              borderRadius: '6px',
                                              fontSize: '11px',
                                              fontWeight: 900,
                                              background: isClaro ? 'rgba(239, 68, 68, 0.15)' : isMovistar ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                              color: isClaro ? '#f87171' : isMovistar ? '#34d399' : '#60a5fa',
                                              border: isClaro ? '1px solid rgba(239, 68, 68, 0.3)' : isMovistar ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
                                            }}
                                          >
                                            {subOp}
                                          </span>
                                          <div>
                                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                              {subLiq.total_lineas_lote || 1} {subLiq.total_lineas_lote === 1 ? 'línea' : 'líneas'} asignadas
                                            </div>
                                            <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                                              Liquidación #LIQ-{subLiq.liquidacion_id}
                                            </div>
                                          </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                          <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Facturado</div>
                                            <div style={{ fontSize: '13px', fontWeight: 800 }}>{formatMoney(subFact)}</div>
                                          </div>

                                          <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Abonado</div>
                                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#10b981' }}>{formatMoney(subAbonado)}</div>
                                          </div>

                                          <div style={{ textAlign: 'right', minWidth: '90px' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Saldo</div>
                                            <div style={{ fontSize: '13px', fontWeight: 900, color: subPendiente > 5 ? '#ef4444' : 'var(--text-primary)' }}>
                                              {formatMoney(subPendiente)}
                                            </div>
                                          </div>

                                          <span style={{
                                            background: subIsCobrada ? 'rgba(16, 185, 129, 0.1)' : subIsParcial ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                            color: subIsCobrada ? '#10b981' : subIsParcial ? '#f59e0b' : '#ef4444',
                                            padding: '3px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '10px'
                                          }}>
                                            {subIsCobrada ? 'COBRADA' : subIsParcial ? 'PARCIAL' : 'IMPAGA'}
                                          </span>

                                          {!subIsCobrada && (
                                            <button
                                              onClick={() => handleOpenCobroModal(subLiq, group.numero_grupo)}
                                              className="air-btn"
                                              style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '6px', fontWeight: 700, borderColor: 'rgba(255,255,255,0.1)' }}
                                              title={`Imputar a ${subOp}`}
                                            >
                                              Imputar a {subOp}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* CONTROLES DE PAGINACIÓN */}
          {facturasAgrupadas.length > pageSizeFacturas && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Mostrando {((currentPageFacturas - 1) * pageSizeFacturas) + 1} - {Math.min(currentPageFacturas * pageSizeFacturas, facturasFiltradas.length)} de {facturasFiltradas.length} comprobantes
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  disabled={currentPageFacturas === 1}
                  onClick={() => setCurrentPageFacturas(p => Math.max(1, p - 1))}
                  className="air-btn"
                  style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, opacity: currentPageFacturas === 1 ? 0.5 : 1 }}
                >
                  Anterior
                </button>
                <span style={{ fontSize: '12px', fontWeight: 800, padding: '0 8px' }}>
                  Página {currentPageFacturas} de {totalPagesFacturas}
                </span>
                <button
                  disabled={currentPageFacturas >= totalPagesFacturas}
                  onClick={() => setCurrentPageFacturas(p => Math.min(totalPagesFacturas, p + 1))}
                  className="air-btn"
                  style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, opacity: currentPageFacturas >= totalPagesFacturas ? 0.5 : 1 }}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 2: ESTADO GENERAL DE CUENTAS (SALDOS POR GRUPO / AGING DE DEUDA) */}
      {activeTab === 'saldos' && (
        <div className="bento-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Buscar por grupo, socio o proveedor..."
                  value={searchGrupo}
                  onChange={(e) => setSearchGrupo(e.target.value)}
                  className="premium-input"
                  style={{ width: '100%', paddingLeft: '42px', height: '42px' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={soloDeudores}
                  onChange={(e) => setSoloDeudores(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                />
                Solo con Deuda (&gt; $5)
              </label>
            </div>

            <button 
              onClick={loadSaldosGeneral}
              className="air-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700 }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar Saldos
            </button>
          </div>

          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', borderRadius: '12px 0 0 12px' }}>GRUPO / CUENTA</th>
                  <th style={{ padding: '12px 16px' }}>TITULAR REGISTRADO</th>
                  <th style={{ padding: '12px 16px' }}>OPERADORA</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>FACTURADO</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>PAGADO</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>CAPITAL PEND.</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>INT. MORA</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>SALDO FINAL</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', borderRadius: '0 12px 12px 0' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '40px' }}>
                      <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                      <div style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Recalculando cuentas corrientes en vivo...</div>
                    </td>
                  </tr>
                ) : saldosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      No se encontraron cuentas o grupos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  saldosFiltrados.map((row) => {
                    const isDeudor = row.saldoFinalUltimo > 5;
                    const isCredito = row.saldoFinalUltimo < -5;

                    return (
                      <tr 
                        key={row.numero_grupo}
                        style={{ borderBottom: '1px solid var(--border-light)', background: selectedGrupo === row.numero_grupo ? 'rgba(16,185,129,0.05)' : 'transparent' }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 900 }}>
                          <span style={{ background: 'var(--surface-hover)', padding: '4px 10px', borderRadius: '8px', fontSize: '13px' }}>
                            Grupo #{row.numero_grupo}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {row.nombre}
                            <button 
                              onClick={() => handleOpenEditGrupo(row.numero_grupo)} 
                              style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
                              title="Editar nombre del titular"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {row.empresas}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(row.totalFacturas)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                          {formatMoney(row.totalPagos)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                          {formatMoney(row.saldoCapitalUltimo)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                          {formatMoney(row.interesPendUltimo)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, color: isDeudor ? '#ef4444' : isCredito ? '#3b82f6' : 'var(--accent)' }}>
                          {formatMoney(row.saldoFinalUltimo)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              onClick={() => {
                                setSelectedGrupo(row.numero_grupo);
                                setActiveTab('extracto');
                              }}
                              className="air-btn"
                              style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: '8px' }}
                            >
                              <Eye size={14} /> Extracto
                            </button>
                            <button
                              onClick={() => handleOpenCobroModal(null, row.numero_grupo)}
                              className="air-btn-primary"
                              style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, borderRadius: '8px' }}
                            >
                              Cobrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: DETALLE DE EXTRACTO Y LIBRO MAYOR (GRUPO SELECCIONADO) */}
      {activeTab === 'extracto' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="bento-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>SELECCIONAR GRUPO</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                  <select 
                    value={selectedGrupo || ''}
                    onChange={(e) => setSelectedGrupo(Number(e.target.value))}
                    className="premium-input"
                    style={{ fontSize: '16px', fontWeight: 900, padding: '8px 16px', height: '44px' }}
                  >
                    {gruposList.map(g => (
                      <option key={g.numero_grupo} value={g.numero_grupo}>
                        Grupo #{g.numero_grupo} - {g.nombre}
                      </option>
                    ))}
                  </select>

                  <button 
                    onClick={() => handleOpenEditGrupo(selectedGrupo)}
                    className="air-btn"
                    style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700 }}
                  >
                    <Edit3 size={14} /> Editar Titular
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>SALDO ACUMULADO FINAL</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: (ultimoMovGrupo?.saldo_final || 0) > 5 ? '#ef4444' : 'var(--accent)' }}>
                    {formatMoney(ultimoMovGrupo?.saldo_final || 0)}
                  </div>
                </div>

                <button 
                  onClick={() => handleOpenCobroModal(null, selectedGrupo)}
                  className="air-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 20px', borderRadius: '12px', fontWeight: 800 }}
                >
                  <Plus size={16} /> Imputar Cobro
                </button>
              </div>
            </div>
          </div>

          <div className="bento-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, margin: 0 }}>
                Extracto / Libro Mayor de Cuenta (Grupo #{selectedGrupo})
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Historial contable de Facturación y Cobros
              </span>
            </div>

            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 14px' }}>FECHA</th>
                    <th style={{ padding: '12px 14px' }}>TIPO</th>
                    <th style={{ padding: '12px 14px' }}>PERÍODO</th>
                    <th style={{ padding: '12px 14px' }}>OPERADORA / CONCEPTO</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>IMPORTE</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>SALDO ACUMULADO</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '30px' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                      </td>
                    </tr>
                  ) : movimientos.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                        Este grupo no registra movimientos de cuenta corriente aún.
                      </td>
                    </tr>
                  ) : (
                    movimientos.map((m) => {
                      const isPago = m.tipo === 'PAGO';
                      const isNC = m.tipo === 'NOTA_CREDITO';
                      return (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700 }}>{m.fecha}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              background: isPago || isNC ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: isPago || isNC ? '#10b981' : '#ef4444',
                              padding: '4px 10px', borderRadius: '6px', fontWeight: 800, fontSize: '11px'
                            }}>
                              {m.tipo}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '12px' }}>
                            {m.periodo || '—'}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 700 }}>{m.empresa || 'GENERAL'}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{m.observaciones || ''}</div>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: '13px', color: isPago || isNC ? '#10b981' : 'var(--text-primary)' }}>
                            {formatMoney(m.importe)}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: '13.5px', color: m.saldo_capital > 5 ? '#ef4444' : 'var(--accent)' }}>
                            {formatMoney(m.saldo_capital)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: LÍNEAS TELEFÓNICAS ASOCIADAS AL GRUPO */}
      {activeTab === 'lineas' && (
        <div className="bento-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 900, margin: '0 0 4px 0' }}>
                Líneas Activas y Facturación ({selectedGrupo ? `Grupo #${selectedGrupo}` : 'Seleccione Grupo'})
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                Desglose de lo facturado a cada línea activa del grupo para el período seleccionado.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* SELECTOR DE PERÍODO */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Período:</span>
                <select 
                  value={lineasPeriodoFiltro}
                  onChange={(e) => setLineasPeriodoFiltro(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '13px', fontWeight: 800, padding: '6px 12px', width: 'auto' }}
                >
                  {(periodosDisponiblesState.length > 0 ? periodosDisponiblesState : ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* SELECTOR DE GRUPO */}
              <select 
                value={selectedGrupo || ''}
                onChange={(e) => setSelectedGrupo(Number(e.target.value))}
                className="premium-input"
                style={{ fontSize: '13px', fontWeight: 800, padding: '8px 14px' }}
              >
                {gruposList.map(g => (
                  <option key={g.numero_grupo} value={g.numero_grupo}>
                    Grupo #{g.numero_grupo} - {g.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px' }}>LÍNEA TELEFÓNICA</th>
                  <th style={{ padding: '12px 14px' }}>SOCIO RESPONSABLE</th>
                  <th style={{ padding: '12px 14px' }}>OPERADORA</th>
                  <th style={{ padding: '12px 14px' }}>PLAN CONTRATADO</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>VALOR ABONO</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>EXCEDENTES</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>FACTURADO ({lineasPeriodoFiltro})</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {loadingLineas ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>
                      <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--accent)' }} />
                    </td>
                  </tr>
                ) : lineasGrupo.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      No hay líneas móviles activas asignadas a este grupo.
                    </td>
                  </tr>
                ) : (
                  <>
                    {lineasGrupo.map(l => (
                      <tr key={l.numero_linea} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 900, color: 'var(--accent)' }}>{l.numero_linea}</td>
                        <td style={{ padding: '12px 14px', fontWeight: 700 }}>{l.socios?.nombre_completo || 'Sin socio asignado'}</td>
                        <td style={{ padding: '12px 14px', fontWeight: 700 }}>{l.proveedores?.nombre || 'N/D'}</td>
                        <td style={{ padding: '12px 14px' }}>{l.plan_facturado || l.planes_abonos?.nombre_plan || 'Plan Estándar'}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>
                          {formatMoney(l.costo_abono_real || l.planes_abonos?.precio || 0)}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: (l.excedentes || 0) > 0 ? '#f59e0b' : 'var(--text-secondary)', fontWeight: (l.excedentes || 0) > 0 ? 800 : 500 }}>
                          {formatMoney(l.excedentes || 0)}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {formatMoney(l.facturado_periodo || 0)}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981',
                            padding: '4px 10px', borderRadius: '8px', fontWeight: 900, fontSize: '11px'
                          }}>
                            ACTIVA
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(0,0,0,0.02)', fontWeight: 900 }}>
                      <td colSpan="6" style={{ padding: '14px', textAlign: 'right', textTransform: 'uppercase', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        TOTAL FACTURADO LÍNEAS ACTIVAS ({lineasPeriodoFiltro}):
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right', fontSize: '14px', color: 'var(--accent)' }}>
                        {formatMoney(lineasGrupo.reduce((s, l) => s + (l.facturado_periodo || 0), 0))}
                      </td>
                      <td></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL COBRO FIFO / FACTURA ESPECÍFICA */}
      <Modal 
        isOpen={cobroModalOpen} 
        onClose={() => setCobroModalOpen(false)} 
        title={targetFactura ? `Imputar Cobro a Factura ${targetFactura.periodo} - Grupo #${selectedGrupo}` : `Registrar Cobro ${selectedGrupo ? `- Grupo #${selectedGrupo}` : ''}`} 
        maxWidth="600px"
      >
        <form onSubmit={handleConfirmarCobro} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* SELECTOR DE GRUPO / SOCIO */}
          <div>
            <label className="form-label">Seleccionar Grupo / Socio Titular</label>
            <select 
              value={selectedGrupo || ''} 
              onChange={(e) => {
                const gNum = Number(e.target.value);
                setSelectedGrupo(gNum);
              }}
              className="form-input"
              style={{ fontWeight: 800 }}
              required
            >
              <option value="" disabled>-- Seleccione un Grupo o Socio --</option>
              {gruposList.map(g => (
                <option key={g.numero_grupo} value={g.numero_grupo}>
                  Grupo #{g.numero_grupo} - {g.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* TARJETA DE RESUMEN DE DEUDA DEL GRUPO */}
          {selectedGrupo && (
            <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '14px 18px', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  DEUDA TOTAL GRUPO #{selectedGrupo} ({titularSeleccionadoInfo?.nombre || ''})
                </div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: (ultimoMovGrupo?.saldo_final || 0) > 5 ? '#ef4444' : 'var(--accent)' }}>
                  {formatMoney(ultimoMovGrupo?.saldo_final || 0)}
                </div>
              </div>
              {(ultimoMovGrupo?.saldo_final || 0) > 0 && (
                <button 
                  type="button" 
                  onClick={() => setMontoCobro(String((ultimoMovGrupo?.saldo_final || 0).toFixed(2)))} 
                  className="air-btn"
                  style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 800, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: '10px' }}
                >
                  Cargar Deuda Total
                </button>
              )}
            </div>
          )}

          {targetFactura && (
            <div style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 700 }}>
              Factura Seleccionada: Período {targetFactura.periodo} ({targetFactura.proveedores?.nombre || 'MUTUAL'}) — Total: {formatMoney(targetFactura.monto_total_facturado)} | Abonado: {formatMoney(targetFactura.monto_abonado || 0)}
            </div>
          )}

          <div>
            <label className="form-label">Fecha del Pago</label>
            <input 
              type="date" 
              value={fechaCobro} 
              onChange={(e) => setFechaCobro(e.target.value)} 
              className="form-input" 
              required 
            />
          </div>

          <div>
            <label className="form-label">Importe a Cobrar ($)</label>
            <input 
              type="number" 
              step="0.01" 
              placeholder="0.00" 
              value={montoCobro} 
              onChange={(e) => setMontoCobro(e.target.value)} 
              className="form-input" 
              autoFocus 
              required 
            />
          </div>

          <div>
            <label className="form-label">Medio de Pago</label>
            <select 
              value={medioPago} 
              onChange={(e) => setMedioPago(e.target.value)} 
              className="form-input"
            >
              <option value="TRANSFERENCIA">Transferencia Bancaria</option>
              <option value="DEBITO">Débito Automático</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="MERCADOPAGO">MercadoPago</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>

          <div>
            <label className="form-label">Observaciones / Referencia Contable</label>
            <input 
              type="text" 
              placeholder="Ej: Nro de Transferencia Banco / Recibo Xubio" 
              value={observacionesCobro} 
              onChange={(e) => setObservacionesCobro(e.target.value)} 
              className="form-input" 
            />
          </div>

          {/* DESGLOSE FIFO EN VIVO */}
          {resultadoFifo && (
            <div style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', borderRadius: '12px', fontSize: '12px' }}>
              <div style={{ fontWeight: 800, marginBottom: '8px', color: 'var(--accent)' }}>
                DESGLOSE DE IMPUTACIÓN AUTOMÁTICA (REGLA FIFO):
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Imputado a Intereses por Mora:</span>
                <strong style={{ color: '#f59e0b' }}>{formatMoney(resultadoFifo.totalInteresCancelado)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Imputado a Capital Deuda:</span>
                <strong>{formatMoney(resultadoFifo.totalCapitalCancelado)}</strong>
              </div>
              {resultadoFifo.remanenteSaldoAFavor > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3b82f6', fontWeight: 800, marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-light)' }}>
                  <span>Saldo a Favor del Grupo:</span>
                  <span>{formatMoney(resultadoFifo.remanenteSaldoAFavor)}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button 
              type="button" 
              onClick={() => setCobroModalOpen(false)} 
              className="air-btn" 
              style={{ flex: 1, padding: '12px' }}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={procesandoCobro} 
              className="air-btn-primary" 
              style={{ flex: 1, padding: '12px', fontWeight: 800 }}
            >
              {procesandoCobro ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Cobro'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL NOTA DE CRÉDITO / AJUSTE CONTABLE */}
      <Modal 
        isOpen={ajusteModalOpen} 
        onClose={() => setAjusteModalOpen(false)} 
        title={`Emitir Ajuste Contable ${selectedGrupo ? `- Grupo #${selectedGrupo}` : ''}`} 
        maxWidth="500px"
      >
        <form onSubmit={handleConfirmarAjuste} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* SELECTOR DE GRUPO / SOCIO */}
          <div>
            <label className="form-label">Seleccionar Grupo / Socio Titular</label>
            <select 
              value={selectedGrupo || ''} 
              onChange={(e) => setSelectedGrupo(Number(e.target.value))}
              className="form-input"
              style={{ fontWeight: 800 }}
              required
            >
              <option value="" disabled>-- Seleccione un Grupo o Socio --</option>
              {gruposList.map(g => (
                <option key={g.numero_grupo} value={g.numero_grupo}>
                  Grupo #{g.numero_grupo} - {g.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Tipo de Ajuste Contable</label>
            <select 
              value={tipoAjuste} 
              onChange={(e) => setTipoAjuste(e.target.value)} 
              className="form-input"
            >
              <option value="CREDITO">Nota de Crédito (Disminuye Deuda / Descuento)</option>
              <option value="DEBITO">Nota de Débito (Aumenta Deuda / Recargo)</option>
            </select>
          </div>

          <div>
            <label className="form-label">Monto del Ajuste ($)</label>
            <input 
              type="number" 
              step="0.01" 
              placeholder="0.00" 
              value={montoAjuste} 
              onChange={(e) => setMontoAjuste(e.target.value)} 
              className="form-input" 
              required 
            />
          </div>

          <div>
            <label className="form-label">Concepto / Motivo Contable</label>
            <input 
              type="text" 
              placeholder="Ej: Bonificación especial por reclamo de servicio" 
              value={conceptoAjuste} 
              onChange={(e) => setConceptoAjuste(e.target.value)} 
              className="form-input" 
              required 
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" onClick={() => setAjusteModalOpen(false)} className="air-btn" style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" disabled={procesandoAjuste} className="air-btn-primary" style={{ flex: 1, fontWeight: 800 }}>
              {procesandoAjuste ? <Loader2 size={16} className="animate-spin" /> : 'Aplicar Ajuste'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL CONFIGURACIÓN TNA */}
      <Modal isOpen={isTnaModalOpen} onClose={() => setIsTnaModalOpen(false)} title="Configuración de Tasa TNA" maxWidth="400px">
        <form onSubmit={handleSaveTna} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Tasa Nominal Anual (TNA %)</label>
            <input 
              type="number" 
              step="0.1" 
              value={editingTna} 
              onChange={(e) => setEditingTna(e.target.value)} 
              className="form-input" 
              required 
            />
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Tasa anual utilizada para el cálculo diario de mora. Default: 120%
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={() => setIsTnaModalOpen(false)} className="air-btn" style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" disabled={savingTna} className="air-btn-primary" style={{ flex: 1 }}>
              {savingTna ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Tasa'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL EDICIÓN RÁPIDA TITULAR */}
      <Modal isOpen={editGrupoModalOpen} onClose={() => setEditGrupoModalOpen(false)} title={`Editar Nombre Titular - Grupo #${grupoEditData?.numero_grupo}`} maxWidth="450px">
        <form onSubmit={handleSaveGrupoEdit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Nombre del Titular / Identificación del Grupo</label>
            <input 
              type="text" 
              value={editTitularNombre} 
              onChange={(e) => setEditTitularNombre(e.target.value)} 
              className="form-input" 
              required 
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={() => setEditGrupoModalOpen(false)} className="air-btn" style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" disabled={savingGrupoEdit} className="air-btn-primary" style={{ flex: 1 }}>
              {savingGrupoEdit ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Nombre'}
            </button>
          </div>
        </form>
      </Modal>

      {/* COMPROBANTE DE COBRO COMPONENT */}
      <ComprobanteCobroModal 
        isOpen={comprobanteModalOpen}
        onClose={() => setComprobanteModalOpen(false)}
        data={comprobanteData}
      />

    </div>
  );
}
