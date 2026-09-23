// Sincronización final - Auditoría Aunar 2026 - OK
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { 
  Loader2, Calculator, CheckCircle2, AlertCircle, Save, 
  Calendar, Search, Filter, ArrowRight, Download, RefreshCw,
  TrendingUp, Users, ShieldCheck, DollarSign, Edit2, X, Trash2,
  Settings2, AlertTriangle, ArrowUpDown, ChevronDown, ChevronUp,
  Percent
} from 'lucide-react';

import { useSearchParams, Link } from 'react-router-dom';
import { calculateAuditLine } from './utils/auditEngine';

import { generarLiquidaciones, eliminarLiquidacion, eliminarCargaMasiva } from './services/liquidacionService';
import { fetchLineas as fetchLineasService, updateConsumoMensual } from './services/auditoriaDataService';
import useTableFilters from './hooks/useTableFilters';
import useDebounce from './hooks/useDebounce';
import BatchModal from './components/GestionPagos/BatchModal';
import AuditLineRow from './components/GestionPagos/AuditLineRow';
import DescuentoModal from './components/CargaManual/DescuentoModal';
import { exportAuditoriaLineasXLSX } from './utils/exportFacturacion';
import { crearTicketVencimientoBonificacion, getOpenVencimientoTickets } from './services/ticketService';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import useBodyScrollLock from './hooks/useBodyScrollLock';

export default function GestionPagos() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [periodos, setPeriodos] = useState([]);
  const [selectedPeriodo, setSelectedPeriodo] = useState(searchParams.get('periodo') || '');
  const [proveedores, setProveedores] = useState([]);
  const [selectedProveedor, setSelectedProveedor] = useState(searchParams.get('proveedor') || '');
  const [lineasData, setLineasData] = useState([]);
  const [adicionalesData, setAdicionalesData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [missingLines, setMissingLines] = useState([]);
  const [showMissing, setShowMissing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [openTickets, setOpenTickets] = useState(new Set());

  useEffect(() => {
    if (lineasData && lineasData.length > 0) {
      const lineas = lineasData.map(l => l.numero_linea);
      getOpenVencimientoTickets(lineas).then(setOpenTickets);
    }
  }, [lineasData]);

  const filterOptions = useMemo(() => ({
    initialSortKey: 'totalCobrar',
    initialSortDirection: 'desc',
    searchFields: [
      (item) => item.numero_linea,
      (item) => item.lineas?.socios?.nombre_completo,
      (item) => item.lineas?.planes_abonos?.nombre_plan,
      (item) => item.lineas?.numero_grupo?.toString() || '',
      (item) => item.lineas?.socios?.nro_socio?.toString() || '',
      (item) => item.lineas?.socios?.dni || '',
      (item) => item.lineas?.socios?.cuit || ''
    ],
    getSortValue: (item, key) => {
      switch (key) {
        case 'linea': return item.numero_linea;
        case 'grupo': return item.lineas?.numero_grupo || 0;
        case 'socio': return item.lineas?.socios?.nombre_completo || '';
        case 'nroSocio': return item.lineas?.socios?.nro_socio || 0;
        case 'baseAb': return item.calculado?.baseAb || 0;
        case 'adminIVA': return (item.calculado?.cAdmin || 0) + (item.calculado?.cIVA || 0);
        case 'tarifa': return item.calculado?.tarifaAunar || 0;
        case 'excedentes': return item.calculado?.excedentes || 0;
        case 'ajustes': return item.calculado?.bonifManual || 0;
        case 'totalCobrar': return item.calculado?.totalCobrar || 0;
        case 'variacion': return item.calculado?.movistarAudit?.actualDiscountPct || 100;
        default: return item[key] || 0;
      }
    }
  }), []);

  const [filterAumentos, setFilterAumentos] = useState(false);
  const [filterBonificacion, setFilterBonificacion] = useState(false);
  const [filterBonifPct, setFilterBonifPct] = useState(null);
  const [showBonifDropdown, setShowBonifDropdown] = useState(false);

  // Helper para obtener el % de bonificación de una línea
  const getBonifPct = useCallback((d) => {
    if (d.calculado?.operatorDiscountPct !== undefined && d.calculado?.operatorDiscountPct !== null && Number(d.calculado.operatorDiscountPct) > 0) {
      return Math.round(Number(d.calculado.operatorDiscountPct));
    }
    if (d.calculado?.movistarAudit?.actualDiscountPct !== undefined && d.calculado?.movistarAudit?.actualDiscountPct !== null && Number(d.calculado.movistarAudit.actualDiscountPct) > 0) {
      return Math.round(Number(d.calculado.movistarAudit.actualDiscountPct));
    }
    if (d.descuento_pct !== undefined && d.descuento_pct !== null && Number(d.descuento_pct) > 0) {
      return Math.round(Number(d.descuento_pct));
    }
    const pLista = Number(d.precio_lista_audit || d.lineas?.planes_abonos?.precio || 0);
    const costo = Number(d.costo_abono_real || d.calculado?.baseAb || 0);
    if (pLista > 0 && costo > 0 && costo < pLista) {
      return Math.round(((pLista - costo) / pLista) * 100);
    }
    return null;
  }, []);

  // Calcular grupos de % de bonificación presentes en los datos
  const bonifGroups = useMemo(() => {
    if (!lineasData || !lineasData.length) return [];
    const countByPct = new Map();
    lineasData.forEach(d => {
      const pct = getBonifPct(d);
      if (pct !== null && pct >= 0 && pct <= 100) {
        countByPct.set(pct, (countByPct.get(pct) || 0) + 1);
      }
    });
    return Array.from(countByPct.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([pct, count]) => ({ pct, count }));
  }, [lineasData, getBonifPct]);

  // Cerrar dropdown de bonificación al hacer clic afuera
  useEffect(() => {
    if (!showBonifDropdown) return;
    const close = () => setShowBonifDropdown(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showBonifDropdown]);

  const processedDataForFilters = useMemo(() => {
    let data = lineasData;

    if (filterBonifPct !== null) {
      data = data.filter(d => getBonifPct(d) === filterBonifPct);
    } else if (filterBonificacion) {
      const hasAnyBonifAlert = lineasData.some(d => 
        d.calculado?.hasDiscountAlert || 
        (d.calculado?.movistarAudit && !d.calculado.movistarAudit.meetsAgreement)
      );
      if (hasAnyBonifAlert) {
        data = data.filter(d => 
          d.calculado?.hasDiscountAlert || 
          (d.calculado?.movistarAudit && !d.calculado.movistarAudit.meetsAgreement)
        );
      } else {
        data = data.filter(d => {
          const pct = getBonifPct(d);
          return pct !== null && pct > 0;
        });
      }
    }

    if (filterAumentos) {
      data = data.filter(d => {
        const hasPortabilityWarning = !!d.calculado?.portabilityWarning;
        const isMovistarUnmet = d.calculado?.movistarAudit && !d.calculado.movistarAudit.meetsAgreement;
        const hasDiscountAlert = d.calculado?.hasDiscountAlert || d.calculado?.auditStatus === 'WARN';
        const hasExcedentes = (d.calculado?.excedentes || 0) > 0;
        return hasPortabilityWarning || isMovistarUnmet || hasDiscountAlert || hasExcedentes;
      });
    }

    return data;
  }, [lineasData, filterAumentos, filterBonificacion, filterBonifPct, getBonifPct]);

  const {
    search,
    setSearch,
    sortConfig,
    handleSort,
    filteredAndSortedData: sortedData
  } = useTableFilters(processedDataForFilters, filterOptions);

  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

  const [isPeriodoLiquidado, setIsPeriodoLiquidado] = useState(false);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingConsumo, setEditingConsumo] = useState(null);
  const [tempBonif, setTempBonif] = useState(0);
  const [adjMode, setAdjMode] = useState('$');
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchPlans, setBatchPlans] = useState([]);
  const [globalTarifaAunar, setGlobalTarifaAunar] = useState(0);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [globalDiscountType, setGlobalDiscountType] = useState('$'); // '%' or '$'
  const [editingAbonoId, setEditingAbonoId] = useState(null);
  const [tempAbono, setTempAbono] = useState("");

  const [selectedRowForDescuento, setSelectedRowForDescuento] = useState(null);
  const [isDescuentoModalOpen, setIsDescuentoModalOpen] = useState(false);

  const handleOpenDescuento = (d) => {
    const abonoBaseFull = (d.calculado?.baseAb || 0) + (d.calculado?.cAdmin || 0) + (d.calculado?.cIVA || 0) + (d.calculado?.tarifaAunar || 0);
    setSelectedRowForDescuento({
      linea: d.numero_linea,
      socioNombre: d.lineas?.socios?.nombre_completo,
      socioId: d.lineas?.socios?.socio_id,
      planOficial: d.lineas?.planes_abonos?.nombre_plan,
      abono: abonoBaseFull,
      consumoId: d.consumo_id,
      currentDiscountPct: d.calculado?.appliedDiscountPct || 0,
      bonifManual: d.calculado?.bonifManual || 0,
      otros_cargos_op: Number(d.otros_cargos_op || 0),
      adicionales: adicionalesData[d.numero_linea] || []
    });
    setIsDescuentoModalOpen(true);
  };

  const handleApplyDescuentoGestionPagos = async ({ linea, socioId, tipo, valor, esPorcentaje, esDuradero, cuotas, descripcion, consumoId, action }) => {
    try {
      if (action === 'DELETE') {
        await supabase.from('adicionales').delete().eq('numero_linea', linea);
        await supabase.from('lineas').update({ descuento_esperado: null }).eq('numero_linea', linea);
        if (socioId) {
          await supabase.from('socios').update({ desc_adicionales: 0 }).eq('socio_id', socioId);
        }
        if (consumoId) {
          await supabase.from('consumos_mensuales').update({ bonificaciones: 0, otros_cargos_op: 0 }).eq('consumo_id', consumoId);
        }
        addToast(`Descuento/Cargo eliminado para la línea ${linea}`, 'success');
        fetchLineas();
        return;
      }

      const numValor = Number(valor);
      if (isNaN(numValor) || numValor <= 0) return;

      const isDesc = tipo === 'DESCUENTO';  // true = descuento, false = cargo

      // Limpiar siempre el estado previo de la línea
      await supabase.from('adicionales').delete().eq('numero_linea', linea);
      if (consumoId) {
        await supabase.from('consumos_mensuales')
          .update({ bonificaciones: 0, otros_cargos_op: 0 })
          .eq('consumo_id', consumoId);
      }

      if (esPorcentaje) {
        // ── AJUSTE PORCENTUAL (%) ──────────────────────────────────────────
        // Se guarda en 'adicionales' independientemente de si es puntual o duradero.
        // El auditEngine lo aplica como multiplicador sobre el subtotal.
        const tipoAdicional = isDesc ? 'DESCUENTO' : 'CARGO_PCT';
        const numCuotas = esDuradero ? (Number(cuotas) || 12) : 1;

        const { error: errAdicional } = await supabase.from('adicionales').insert({
          socio_id: socioId || null,
          numero_linea: linea,
          tipo: tipoAdicional,
          descripcion: descripcion || `${isDesc ? 'Descuento' : 'Cargo'} ${numValor}% (${numCuotas} ${numCuotas === 1 ? 'mes' : 'meses'})`,
          valor: numValor,
          cta_numero: 1,
          total_cuotas: numCuotas,
          activo: true,
          periodo_inicio: selectedPeriodo || new Date().toISOString().substring(0, 7)
        });
        if (errAdicional) throw errAdicional;

        // Para descuentos duraderos también actualizar lineas y socios
        if (esDuradero) {
          if (isDesc) {
            await supabase.from('lineas').update({ descuento_esperado: numValor }).eq('numero_linea', linea);
            if (socioId) {
              await supabase.from('socios').update({ desc_adicionales: numValor }).eq('socio_id', socioId);
            }
          } else {
            if (socioId) {
              await supabase.from('socios').update({ desc_adicionales: -numValor }).eq('socio_id', socioId);
            }
          }
        }

        addToast(
          `${isDesc ? 'Descuento' : 'Cargo'} de ${numValor}% (${numCuotas === 1 ? 'este período' : numCuotas + ' meses'}) aplicado correctamente`,
          'success'
        );
      } else {
        // ── AJUSTE MONTO FIJO ($) ──────────────────────────────────────────
        if (esDuradero) {
          // Duradero: guardar en adicionales (CARGO o DESCUENTO_FIJO)
          const tipoAdicional = isDesc ? 'DESCUENTO_FIJO' : 'CARGO';
          const numCuotas = Number(cuotas) || 12;

          const { error: errAdicional } = await supabase.from('adicionales').insert({
            socio_id: socioId || null,
            numero_linea: linea,
            tipo: tipoAdicional,
            descripcion: descripcion || `${isDesc ? 'Descuento' : 'Cargo'} fijo $${numValor} (${numCuotas} meses)`,
            valor: numValor,
            cta_numero: 1,
            total_cuotas: numCuotas,
            activo: true,
            periodo_inicio: selectedPeriodo || new Date().toISOString().substring(0, 7)
          });
          if (errAdicional) throw errAdicional;

          addToast(`${isDesc ? 'Descuento' : 'Cargo'} fijo de $${numValor} (${numCuotas} meses) guardado correctamente`, 'success');
        } else {
          // Puntual: guardar en consumo del período actual
          if (consumoId) {
            const updates = isDesc
              ? { bonificaciones: numValor, otros_cargos_op: 0 }
              : { otros_cargos_op: numValor, bonificaciones: 0 };
            const { error: errConsumo } = await supabase.from('consumos_mensuales').update(updates).eq('consumo_id', consumoId);
            if (errConsumo) throw errConsumo;
          }
          addToast(`${isDesc ? 'Descuento' : 'Cargo'} fijo de $${numValor} aplicado para este período`, 'success');
        }
      }

      fetchLineas();
    } catch (err) {
      console.error("Error al aplicar ajuste en gestión de pagos:", err);
      addToast("Error al guardar el ajuste: " + (err.message || err), "error");
    }
  };

  const updateUrlParams = (key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  // Sincronizar searchParams → estado cuando cambian los params de URL
  useEffect(() => {
    const periodoParam = searchParams.get('periodo') || '';
    const proveedorParam = searchParams.get('proveedor') || '';
    if (periodoParam !== selectedPeriodo) {
      setSelectedPeriodo(periodoParam);
    }
    if (proveedorParam !== selectedProveedor) {
      setSelectedProveedor(proveedorParam);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedPeriodo && selectedProveedor) {
      fetchLineas();
    }
  }, [selectedPeriodo, selectedProveedor]);

  useBodyScrollLock(isEditModalOpen || isBatchModalOpen);

  function getPreviousPeriod(periodStr) {
    if (!periodStr) return '';
    const [year, month] = periodStr.split('-').map(Number);
    if (!year || !month) return '';
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    const prevMonthStr = String(prevMonth).padStart(2, '0');
    return `${prevYear}-${prevMonthStr}`;
  }

  async function handleLoadPreviousPeriodPrices() {
    const prevPeriod = getPreviousPeriod(selectedPeriodo);
    if (!prevPeriod) return;
    
    try {
      const { data: prevPrices, error } = await supabase
        .from('precios_auditoria_periodo')
        .select('*')
        .eq('periodo', prevPeriod);
      
      if (error) throw error;
      
      if (!prevPrices || prevPrices.length === 0) {
        addToast(`No hay precios históricos guardados para el período anterior (${prevPeriod}).`, 'warning');
        return;
      }
      
      const prevMap = {};
      prevPrices.forEach(p => { prevMap[p.plan_id] = p; });
      
      setBatchPlans(prevPlans => prevPlans.map(p => {
        const prevData = prevMap[p.id];
        if (!prevData) return p;
        return {
          ...p,
          precio: prevData.precio_lista !== undefined && prevData.precio_lista !== null ? Number(prevData.precio_lista) : p.precio,
          tarifa: prevData.tarifa_aunar !== undefined && prevData.tarifa_aunar !== null ? Number(prevData.tarifa_aunar) : p.tarifa
        };
      }));
      
      addToast(`Valores del período ${prevPeriod} cargados en la tabla.`, 'success');
    } catch (err) {
      addToast("Error al cargar período anterior: " + err.message, 'error');
    }
  }

  async function fetchInitialData() {
    try {
      const [{ data: pData }, { data: provData }] = await Promise.all([
        supabase.from('vw_periodos_consumos').select('periodo'),
        supabase.from('proveedores').select('*')
      ]);
      const uniquePeriods = [...new Set(pData?.map(d => d.periodo))].sort().reverse();
      setPeriodos(uniquePeriods);
      setProveedores(provData || []);
    } catch (err) {
      console.error('Error al cargar datos iniciales:', err);
    }
  }

  const fetchLineasRef = useRef(0);

  async function fetchLineas() {
    if (!selectedPeriodo || !selectedProveedor) return;
    
    setGlobalDiscount(0);
    setGlobalDiscountType('$');
    setFilterAumentos(false);
    setFilterBonificacion(false);
    setFilterBonifPct(null);
    setShowBonifDropdown(false);
    
    const periodo = selectedPeriodo;
    const providerId = parseInt(selectedProveedor);
    const currentFetchId = ++fetchLineasRef.current;

    try {
      setLoading(true);
      setError(null);
      setLineasData([]);
      setIsPeriodoLiquidado(false);

      const result = await fetchLineasService(periodo, providerId);
      
      if (currentFetchId === fetchLineasRef.current) {
        setLineasData(result.lineasData);
        setAdicionalesData(result.adicionalesMap);
        setIsPeriodoLiquidado(result.isPeriodoLiquidado);
        setBatchPlans(result.batchPlans);
        setGlobalTarifaAunar(result.defaultTarifaAunar);
        
        if (result.lineasData.length === 0) {
          setError(`Sin datos para ${periodo}.`);
        }
      }
    } catch (err) {
      if (currentFetchId === fetchLineasRef.current) {
        setError('Error: ' + err.message);
      }
    } finally {
      if (currentFetchId === fetchLineasRef.current) {
        setLoading(false);
      }
    }
  }

  async function handleApplyBatchPrices(plansToApply) {
    setIsSaving(true);
    try {
      // 1. Guardar en la tabla de persistencia histórica
      const upserts = plansToApply.map(plan => ({
        periodo: selectedPeriodo,
        plan_id: plan.id,
        precio_lista: plan.precio,
        tarifa_aunar: plan.tarifa
      }));

      const { error: upsertErr } = await supabase
        .from('precios_auditoria_periodo')
        .upsert(upserts, { onConflict: 'periodo,plan_id' });
      if (upsertErr) throw upsertErr;

      // 2. Actualizar consumos_mensuales con los precios y tarifas por plan
      for (const plan of plansToApply) {
        const idsToUpdate = lineasData
          .filter(d => d.plan_id === plan.id || d.lineas?.plan_id === plan.id || d.lineas?.planes_abonos?.plan_id === plan.id)
          .map(d => d.consumo_id);

        if (idsToUpdate.length > 0) {
          const { error: updateErr } = await supabase
            .from('consumos_mensuales')
            .update({ 
              precio_lista_audit: plan.precio,
              tarifa_aunar_aplicada: plan.tarifa
            })
            .in('consumo_id', idsToUpdate);
          if (updateErr) throw updateErr;
        }
      }
      // 3. Actualizar también el catálogo base planes_abonos para mantenerlo sincronizado
      for (const plan of plansToApply) {
        const updateCatalog = {};
        if (plan.precio !== undefined && plan.precio !== '' && Number(plan.precio) > 0) {
          updateCatalog.precio = Number(plan.precio);
        }
        if (plan.tarifa !== undefined && plan.tarifa !== '' && Number(plan.tarifa) > 0) {
          updateCatalog.tarifa_aunar = Number(plan.tarifa);
        }
        if (Object.keys(updateCatalog).length > 0) {
          await supabase
            .from('planes_abonos')
            .update(updateCatalog)
            .eq('plan_id', plan.id);
        }
      }

      const sanitizedPlans = plansToApply.map(p => ({
        ...p,
        precio: p.precio === '' ? 0 : Number(p.precio),
        tarifa: p.tarifa === '' ? 0 : Number(p.tarifa)
      }));
      setBatchPlans(sanitizedPlans);
      addToast('¡Unificado! Se aplicaron los precios a todas las líneas y al catálogo.', 'success');
      setIsBatchModalOpen(false);
      fetchLineas();
    } catch (e) {
      addToast("Error al unificar: " + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  const handleCreateTicket = useCallback(async (d) => {
    try {
      const mRest = d.calculado?.descuentoMesesRestantes ?? d.descuento_meses_restantes ?? d.lineas?.descuento_meses_restantes;
      const vigenciaStr = d.calculado?.descuentoVigencia ?? d.descuento_vigencia ?? d.lineas?.descuento_vigencia;
      const descPct = d.calculado?.operatorDiscountPct ?? d.descuento_pct;
      const provName = proveedores.find(p => p.proveedor_id === Number(selectedProveedor))?.nombre_proveedor || 'Operadora';

      const res = await crearTicketVencimientoBonificacion({
        linea: d.numero_linea,
        socioNombre: d.lineas?.socios?.nombre_completo,
        numeroGrupo: d.lineas?.numero_grupo,
        plan: d.lineas?.planes_abonos?.nombre_plan,
        vigencia: vigenciaStr,
        mesesRestantes: mRest,
        descuentoPct: descPct,
        proveedor: provName
      });

      if (!res.success && res.alreadyExists) {
        addToast(res.message, 'warning');
        setOpenTickets(prev => new Set([...prev, String(d.numero_linea).replace(/\D/g, '')]));
        return;
      }

      addToast(res.message, 'success');
      setOpenTickets(prev => new Set([...prev, String(d.numero_linea).replace(/\D/g, '')]));
    } catch (err) {
      console.error("Error creating ticket:", err);
      addToast("Error al crear ticket: " + err.message, 'error');
    }
  }, [proveedores, selectedProveedor, addToast]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [sortedData]);

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const renderedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function handleGenerarLiquidaciones() {
    const isConfirmed = await confirm({
      title: 'Generar Liquidación',
      message: '¿Generar liquidaciones para este periodo y proveedor?'
    });
    if (!isConfirmed) return;
    setIsSaving(true);
    try {
      const result = await generarLiquidaciones({ lineasData, selectedPeriodo, selectedProveedor, globalDiscount, globalDiscountType });
      addToast(`Se generaron ${result.count} liquidaciones correctamente.`, 'success');
      setGlobalDiscount(0);
      setGlobalDiscountType('$');
      fetchLineas();
    } catch (e) {
      addToast('Error: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEliminarLiquidacion() {
    const isConfirmed = await confirm({
      title: 'Eliminar Liquidación',
      message: '¿Estás seguro que deseas ELIMINAR la liquidación de este periodo y proveedor? Los datos volverán al estado pre-liquidación y se borrarán las facturas de grupos.',
      isDanger: true,
      confirmText: 'Eliminar'
    });
    if (!isConfirmed) return;
    
    setIsSaving(true);
    try {
      await eliminarLiquidacion({ lineasData, selectedPeriodo, selectedProveedor });
      addToast('Liquidación eliminada correctamente.', 'success');
      fetchLineas();
    } catch (e) {
      addToast('Error: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEliminarCargaMasiva() {
    const message = isPeriodoLiquidado
      ? '¿Seguro que deseas eliminar TODOS los datos cargados y las liquidaciones generadas para este período y operadora? Esta acción no se puede deshacer.'
      : '¿Seguro que deseas eliminar TODOS los datos cargados para este período y operadora? Esta acción no se puede deshacer.';

    const isConfirmed = await confirm({
      title: 'Eliminar Carga Masiva',
      message: message,
      isDanger: true,
      confirmText: 'Eliminar Lote'
    });
    if (!isConfirmed) return;

    setIsSaving(true);
    try {
      await eliminarCargaMasiva({ selectedPeriodo, selectedProveedor });
      addToast('Datos cargados eliminados correctamente. Puedes volver a subir el CSV en Carga Manual.', 'success');
      setLineasData([]);
      await fetchInitialData();
      fetchLineas();
    } catch (e) {
      addToast('Error al eliminar datos: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  const handleSaveBonificacion = async () => {
    if (!editingConsumo) return;
    setIsSaving(true);
    let finalAmount = Number(tempBonif);
    
    if (adjMode === '%') {
      const totalAntes = editingConsumo.calculado.totalCobrar + editingConsumo.calculado.bonifManual;
      finalAmount = (Number(tempBonif) / 100) * totalAntes;
    }
    
    try {
      await updateConsumoMensual(editingConsumo.consumo_id, selectedPeriodo, parseInt(selectedProveedor), { bonificaciones: finalAmount });
      setIsEditModalOpen(false);
      fetchLineas();
    } catch (error) {
      addToast("Error al actualizar: " + error.message, 'error');
    }
    setIsSaving(false);
  };

  const handleSaveAbono = async (consumo_id, newValue) => {
    let valueToSave = newValue;
    if (selectedProveedor === '2') {
      valueToSave = newValue / 1.26263157;
    }

    try {
      await updateConsumoMensual(consumo_id, selectedPeriodo, parseInt(selectedProveedor), { costo_abono_real: valueToSave });
      fetchLineas();
    } catch (error) {
      addToast("Error al guardar Abono Base: " + error.message, 'error');
    }
  };

  const handleSaveExcedente = async (consumo_id, newValue) => {
    try {
      await updateConsumoMensual(consumo_id, selectedPeriodo, parseInt(selectedProveedor), { excedentes: newValue });
      fetchLineas();
    } catch (error) {
      addToast("Error al guardar Excedente: " + error.message, 'error');
    }
  };

  const totals = useMemo(() => {
    const rawFinal = sortedData.reduce((acc, l) => acc + Math.round(Number(l.calculado?.totalCobrar || 0) * 100), 0) / 100;
    const discountVal = Number(globalDiscount) || 0;
    const discountAmount = globalDiscountType === '%' 
      ? rawFinal * (discountVal / 100) 
      : discountVal;
    
    return {
      neto: sortedData.reduce((acc, l) => acc + Math.round(Number(l.calculado?.baseAb || 0) * 100), 0) / 100,
      admin: sortedData.reduce((acc, l) => acc + Math.round(Number(l.calculado?.cAdmin || 0) * 100), 0) / 100,
      iva: sortedData.reduce((acc, l) => acc + Math.round(Number(l.calculado?.cIVA || 0) * 100), 0) / 100,
      aunar: sortedData.reduce((acc, l) => acc + Math.round(Number(l.calculado?.tarifaAunar || 0) * 100), 0) / 100,
      final: rawFinal,
      discountAmount: discountAmount,
      finalWithDiscount: Math.max(0, rawFinal - discountAmount),
      faltantes: (missingLines || []).length
    };
  }, [sortedData, missingLines, globalDiscount, globalDiscountType]);

  const provName = proveedores.find(p => p.proveedor_id.toString() === selectedProveedor)?.nombre?.toUpperCase() || 'LOTE';

  return (
    <div className="animate-fade" style={{ padding: '0px' }}>

      {error && (
        <div style={{ padding: '16px', background: '#fee2e2', border: '1px solid #ef4444', color: '#b91c1c', marginBottom: '20px', borderRadius: '16px', fontWeight: 600 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '20px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>Auditoría de Liquidación</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>Procesa y audita los montos finales a cobrar por línea y socio.</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>PERIODO</label>
            <select 
              key={periodos.length}
              value={selectedPeriodo} 
              onChange={e => {
                setSelectedPeriodo(e.target.value);
                updateUrlParams('periodo', e.target.value);
              }}
              className="premium-input notranslate"
              translate="no"
              style={{ padding: '8px 12px', minWidth: '120px', height: '40px' }}
            >
              <option value="" className="notranslate" translate="no">Seleccione...</option>
              {periodos.map(p => <option key={p} value={p} className="notranslate" translate="no">{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>OPERADORA</label>
            <select 
              value={selectedProveedor} 
              onChange={e => {
                setSelectedProveedor(e.target.value);
                updateUrlParams('proveedor', e.target.value);
              }}
              className="premium-input"
              style={{ padding: '8px 12px', width: '140px', height: '40px' }}
            >
              <option value="">Seleccione...</option>
              {proveedores.map(p => <option key={p.proveedor_id} value={p.proveedor_id.toString()}>{p.nombre}</option>)}
            </select>
          </div>
          <button 
            onClick={() => setIsBatchModalOpen(true)}
            className="btn-ghost"
            style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', borderRadius: '12px' }}
          >
            <Settings2 size={16} />
            <span style={{ fontSize: '13px', fontWeight: 700 }}>Matriz de Costos</span>
          </button>
          {selectedProveedor === '2' && (
            <button 
              onClick={() => setSortConfig({ key: 'variacion', direction: 'asc' })}
              className="btn-ghost"
              style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', borderRadius: '12px', color: 'var(--accent)' }}
              title="Ordenar líneas poniendo primero las que tienen menor % de descuento"
            >
              <TrendingUp size={16} />
              <span style={{ fontSize: '13px', fontWeight: 700 }}>Ordenar por Bonif.</span>
            </button>
          )}
          <button 
            onClick={() => exportAuditoriaLineasXLSX({ data: sortedData, periodo: selectedPeriodo, operadora: provName })}
            disabled={sortedData.length === 0}
            className="btn-ghost"
            style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', borderRadius: '12px', color: sortedData.length === 0 ? 'var(--text-secondary)' : '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)', cursor: sortedData.length === 0 ? 'not-allowed' : 'pointer' }}
            title="Exportar auditoría a Excel (.xlsx)"
          >
            <Download size={16} />
            <span style={{ fontSize: '13px', fontWeight: 700 }}>Exportar Excel</span>
          </button>
          <button 
            onClick={handleEliminarCargaMasiva}
            className="btn-ghost"
            style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', borderRadius: '12px', color: '#ef4444' }}
            title="Eliminar Lote Cargado"
          >
            <Trash2 size={16} />
          </button>
          <button onClick={fetchLineas} className="icon-button-edit" style={{ height: '40px', width: '40px' }}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div className="glass-panel" style={{ padding: '24px 28px', borderRadius: '20px', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>A RECAUDAR (SOCIOS)</span>
            <DollarSign size={16} color="var(--accent)" />
          </div>
          {totals.discountAmount > 0 ? (
            <div>
              <span style={{ fontSize: '14px', opacity: 0.35, textDecoration: 'line-through', marginRight: '8px' }}>
                ${totals.final.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--accent)', lineHeight: 1.2, marginTop: '4px' }}>
                ${totals.finalWithDiscount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--accent)', lineHeight: 1.2 }}>
              ${totals.final.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '8px' }}>
            <span style={{color: '#94a3b8'}}>Costo Operadora:</span> ${totals.neto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px 28px', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>LÍNEAS ACTIVAS</span>
            <Users size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, lineHeight: 1.2 }}>{sortedData.length}</div>
        </div>

        <div 
          className="glass-panel" 
          onClick={() => totals.faltantes > 0 && setShowMissing(true)}
          style={{ padding: '24px 28px', borderRadius: '20px', cursor: totals.faltantes > 0 ? 'pointer' : 'default', border: totals.faltantes > 0 ? '1px solid rgba(245,158,11,0.3)' : undefined, transition: 'border-color 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>FALTANTES</span>
            <AlertTriangle size={16} color={totals.faltantes > 0 ? '#f59e0b' : 'var(--text-secondary)'} />
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, lineHeight: 1.2, color: totals.faltantes > 0 ? '#f59e0b' : 'inherit' }}>{totals.faltantes}</div>
        </div>
      </div>

      {/* DESC. LOTE + Botón principal */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', alignItems: 'stretch' }}>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 20px', borderRadius: '16px', minWidth: '220px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>DESC. LOTE</span>
          <input 
            type="number"
            value={globalDiscount || ''}
            onChange={e => setGlobalDiscount(Number(e.target.value))}
            placeholder="0"
            className="premium-input"
            style={{ height: '36px', fontSize: '13px', width: '80px', padding: '0 8px', textAlign: 'right', fontWeight: 700 }}
          />
          <button 
            onClick={() => setGlobalDiscountType(globalDiscountType === '%' ? '$' : '%')}
            style={{ height: '32px', width: '32px', padding: 0, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, background: 'var(--surface-light)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer' }}
          >
            {globalDiscountType}
          </button>
        </div>

        {!isPeriodoLiquidado ? (
          <button 
            disabled={isSaving || lineasData.length === 0}
            onClick={handleGenerarLiquidaciones}
            className="btn-primary"
            style={{ flex: 1, padding: '16px 24px', borderRadius: '16px', border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 800, fontSize: '14px', cursor: lineasData.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: lineasData.length === 0 ? 0.5 : 1, boxShadow: '0 4px 20px rgba(16,185,129,0.15)', transition: 'transform 0.15s, box-shadow 0.15s' }}
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            GENERAR LIQUIDACIONES
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
            <div className="glass-panel" style={{ padding: '16px 24px', borderRadius: '16px', border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.05)', color: '#10b981', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
              <ShieldCheck size={20} /> LIQUIDADO
            </div>
            <Link 
              to={`/facturacion?tab=socios&periodo=${selectedPeriodo}&proveedor=${selectedProveedor}`}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#10b981', color: 'white', border: 'none', padding: '16px 24px', borderRadius: '16px', fontSize: '14px', fontWeight: 800, textDecoration: 'none', flex: 2, boxShadow: '0 4px 16px rgba(16,185,129,0.15)' }}
            >
              <DollarSign size={18} /> VER LIQUIDACIONES Y PAGOS
            </Link>
            <button onClick={handleEliminarLiquidacion} style={{ padding: '0 20px', borderRadius: '16px', background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Deshacer Liquidación">
              <Trash2 size={20} />
            </button>
          </div>
        )}
      </div>


      <div className="glass-panel" style={{ borderRadius: '24px' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0 }}>
            Detalle por Línea (Auditoría)
          </h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                className="premium-input"
                style={{ width: '100%', paddingLeft: '42px', height: '42px', borderRadius: '14px' }}
                placeholder="Buscar línea o socio..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>
            {/* Botón: Priorizar Bonificación + Dropdown de % */}
            <div style={{ position: 'relative', display: 'inline-flex' }} onClick={e => e.stopPropagation()}>
              <button 
                onClick={() => {
                  setFilterAumentos(false);
                  setShowBonifDropdown(false);
                  if (filterBonifPct !== null || filterBonificacion) {
                    setFilterBonificacion(false);
                    setFilterBonifPct(null);
                  } else {
                    setFilterBonificacion(true);
                  }
                }}
                style={{ 
                  height: '42px',
                  padding: '0 14px',
                  background: (filterBonificacion || filterBonifPct !== null) ? 'rgba(168, 85, 247, 0.1)' : 'var(--surface)', 
                  color: (filterBonificacion || filterBonifPct !== null) ? '#9333ea' : 'var(--text-secondary)',
                  border: `1px solid ${(filterBonificacion || filterBonifPct !== null) ? '#9333ea' : 'var(--border-light)'}`,
                  borderRight: 'none',
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  borderRadius: '14px 0 0 14px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title={filterBonifPct !== null || filterBonificacion ? "Quitar filtro de bonificación" : "Priorizar o filtrar por bonificación"}
              >
                <Percent size={16} /> 
                <span>{filterBonifPct !== null ? `Bonif: ${filterBonifPct}%` : 'Priorizar Bonificación'}</span>
              </button>
              <button
                title="Ver distribución de % de bonificación"
                onClick={() => setShowBonifDropdown(prev => !prev)}
                style={{
                  height: '42px',
                  padding: '0 10px',
                  background: showBonifDropdown || filterBonifPct !== null || filterBonificacion ? 'rgba(168, 85, 247, 0.18)' : 'var(--surface)',
                  color: (filterBonifPct !== null || filterBonificacion) ? '#9333ea' : 'var(--text-secondary)',
                  border: `1px solid ${(filterBonifPct !== null || filterBonificacion) ? '#9333ea' : 'var(--border-light)'}`,
                  borderRadius: '0 14px 14px 0',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '12px', 
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                ▾
              </button>

              {/* Dropdown de % de bonificación */}
              {showBonifDropdown && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: '230px',
                  background: 'var(--modal-bg, #ffffff)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '14px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  zIndex: 1000,
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                    % BONIFICACIÓN POR GRUPO
                  </div>
                  {/* Opción para quitar el filtro */}
                  <div
                    onClick={() => { setFilterBonifPct(null); setFilterBonificacion(false); setShowBonifDropdown(false); }}
                    style={{
                      padding: '9px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-light)',
                      background: (filterBonifPct === null && !filterBonificacion) ? 'rgba(168, 85, 247, 0.08)' : 'transparent',
                      color: (filterBonifPct === null && !filterBonificacion) ? '#9333ea' : 'var(--text-secondary)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => { if (filterBonifPct !== null || filterBonificacion) e.currentTarget.style.background = 'rgba(168, 85, 247, 0.05)'; }}
                    onMouseLeave={e => { if (filterBonifPct !== null || filterBonificacion) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span>Todas las líneas</span>
                    <span style={{ fontSize: '10px', background: 'var(--border-light)', padding: '2px 6px', borderRadius: '6px', fontWeight: 800 }}>{lineasData.length}</span>
                  </div>
                  {bonifGroups.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-secondary)' }}>Sin datos de bonificación</div>
                  ) : (
                    bonifGroups.map(({ pct, count }) => (
                      <div
                        key={pct}
                        onClick={() => {
                          setFilterBonifPct(pct);
                          setFilterBonificacion(true);
                          setFilterAumentos(false);
                          setShowBonifDropdown(false);
                        }}
                        style={{
                          padding: '9px 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border-light)',
                          background: filterBonifPct === pct ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                          color: filterBonifPct === pct ? '#9333ea' : 'var(--text-primary)',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => { if (filterBonifPct !== pct) e.currentTarget.style.background = 'rgba(168, 85, 247, 0.05)'; }}
                        onMouseLeave={e => { if (filterBonifPct !== pct) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#9333ea' }}>●</span>
                          Bonif. {pct}%
                        </span>
                        <span style={{
                          fontSize: '10px',
                          background: filterBonifPct === pct ? 'rgba(168, 85, 247, 0.15)' : 'var(--border-light)',
                          color: filterBonifPct === pct ? '#9333ea' : 'var(--text-secondary)',
                          padding: '2px 7px', borderRadius: '6px', fontWeight: 800
                        }}>{count} líneas</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button 
              onClick={() => {
                setFilterBonificacion(false);
                setFilterBonifPct(null);
                setShowBonifDropdown(false);
                setFilterAumentos(!filterAumentos);
              }}
              className="icon-button-edit" 
              style={{ 
                height: '42px', 
                width: '42px', 
                background: filterAumentos ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface)', 
                color: filterAumentos ? '#ef4444' : 'var(--text-secondary)',
                border: `1px solid ${filterAumentos ? '#ef4444' : 'var(--border-light)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: '14px',
                transition: 'all 0.15s ease'
              }}
              title={filterAumentos ? "Mostrar todos" : "Filtrar aumentos, desvíos y excedentes"}
            >
              <Filter size={18} />
            </button>
            <button 
              onClick={() => exportAuditoriaLineasXLSX({ data: sortedData, periodo: selectedPeriodo, operadora: provName })}
              disabled={sortedData.length === 0}
              className="btn-ghost" 
              style={{ 
                height: '42px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '0 16px', 
                borderRadius: '14px', 
                color: sortedData.length === 0 ? 'var(--text-secondary)' : '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                background: 'rgba(16, 185, 129, 0.06)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: sortedData.length === 0 ? 'not-allowed' : 'pointer',
                opacity: sortedData.length === 0 ? 0.5 : 1
              }}
              title="Descargar detalle de auditoría a Excel (.xlsx) con las mismas columnas"
            >
              <Download size={16} />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="skeleton" style={{ height: '52px', width: '100%', borderRadius: '12px' }}></div>
            ))}
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
            <table className="premium-table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('linea')} style={{ padding: '12px 16px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Línea / Plan {sortConfig.key === 'linea' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                      </div>
                    </th>
                    <th onClick={() => handleSort('socio')} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Socio {sortConfig.key === 'socio' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                      </div>
                    </th>
                    <th onClick={() => handleSort('baseAb')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        Abono Neto {sortConfig.key === 'baseAb' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                      </div>
                    </th>
                    <th onClick={() => handleSort('adminIVA')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        Admin + IVA {sortConfig.key === 'adminIVA' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                      </div>
                    </th>
                    <th onClick={() => handleSort('tarifa')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        Tarifa {sortConfig.key === 'tarifa' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                      </div>
                    </th>
                    <th onClick={() => handleSort('excedentes')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        Excedentes {sortConfig.key === 'excedentes' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                      </div>
                    </th>
                    <th onClick={() => handleSort('ajustes')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        Descuentos {sortConfig.key === 'ajustes' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                      </div>
                    </th>
                    <th onClick={() => handleSort('totalCobrar')} style={{ textAlign: 'right', paddingRight: '12px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                        TOTAL {sortConfig.key === 'totalCobrar' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {renderedData.map((d, i) => (
                    <AuditLineRow
                      key={d.consumo_id || i}
                      d={d}
                      isPeriodoLiquidado={isPeriodoLiquidado}
                      adicionalesData={adicionalesData}
                      onSaveAbono={handleSaveAbono}
                      onSaveExcedente={handleSaveExcedente}
                      onOpenDescuento={handleOpenDescuento}
                      onCreateTicket={handleCreateTicket}
                      openTickets={openTickets}
                    />
                  ))}
                  {sortedData.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '100px', opacity: 0.5 }}>
                        No se encontraron datos para este periodo y operadora.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          {/* Paginación Premium */}
          {sortedData.length > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 32px',
              borderTop: '1px solid var(--border-light)',
              flexWrap: 'wrap',
              gap: '16px',
              background: 'var(--surface-light)',
              borderBottomLeftRadius: '24px',
              borderBottomRightRadius: '24px'
            }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Mostrando <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{Math.min(sortedData.length, (currentPage - 1) * pageSize + 1)}-{Math.min(sortedData.length, currentPage * pageSize)}</span> de <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{sortedData.length}</span> registros
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="pagination-btn-nav"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  Anterior
                </button>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {(() => {
                    const pages = [];
                    for (let i = 1; i <= totalPages; i++) {
                      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                        pages.push(
                          <button
                            key={i}
                            onClick={() => setCurrentPage(i)}
                            className={`pagination-btn-page ${currentPage === i ? 'active' : ''}`}
                          >
                            {i}
                          </button>
                        );
                      } else if (i === currentPage - 2 || i === currentPage + 2) {
                        pages.push(<span key={`dots-${i}`} style={{ padding: '0 4px', opacity: 0.5 }}>...</span>);
                      }
                    }
                    return pages;
                  })()}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="pagination-btn-nav"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  Siguiente
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>Filas por página:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="premium-input"
                  style={{ padding: '4px 8px', borderRadius: '8px', fontSize: '13px', height: '32px', minWidth: '70px' }}
                >
                  {[25, 50, 100, 200].map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Modal de Ajuste Individual */}
      {isEditModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel-sub" style={{ width: '400px', padding: '32px', borderRadius: '28px', background: 'var(--modal-bg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>Ajuste de Liquidación</h3>
              <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Línea: {editingConsumo?.numero_linea}</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{editingConsumo?.lineas?.socios?.nombre_completo}</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
               <input 
                 type="number" 
                 value={tempBonif} 
                 onChange={e => setTempBonif(e.target.value)}
                 className="premium-input" 
                 style={{ flex: 1 }}
                 placeholder="Monto a ajustar"
               />
               <button onClick={handleSaveBonificacion} className="air-btn" style={{ background: 'var(--accent)', color: 'white' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {isBatchModalOpen && (
        <BatchModal 
          isPeriodoLiquidado={isPeriodoLiquidado}
          selectedPeriodo={selectedPeriodo}
          initialBatchPlans={batchPlans}
          onSave={(newPlans) => {
            setBatchPlans(newPlans);
            handleApplyBatchPrices(newPlans);
          }}
          onClose={() => setIsBatchModalOpen(false)}
          isSaving={isSaving}
          handleLoadPreviousPeriodPrices={handleLoadPreviousPeriodPrices}
        />
      )}

      {/* Modal de Descuento */}
      {isDescuentoModalOpen && selectedRowForDescuento && (
        <DescuentoModal
          isOpen={isDescuentoModalOpen}
          onClose={() => {
            setIsDescuentoModalOpen(false);
            setSelectedRowForDescuento(null);
          }}
          row={selectedRowForDescuento}
          onApply={handleApplyDescuentoGestionPagos}
        />
      )}
    </div>
  );
}
