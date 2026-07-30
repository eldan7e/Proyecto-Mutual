import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ClipboardPaste, Table, UserX, CheckCircle2, 
  AlertCircle, Save, Smartphone, Receipt, Search,
  ArrowRight, RefreshCw, Info, PieChart, TrendingUp, TrendingDown,
  FileText, Loader2, Calendar, Sparkles, Database, Zap,
  Flag, MessageSquare, AlertTriangle, CheckSquare, CreditCard, Download
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { normalizePhone, getParserByProvider } from './utils/invoiceParsers';
import { procesarClaro, procesarMovistar, procesarPersonal } from './utils/providerProcessors';
import { verificarTextoCruzado } from './utils/validators';
import { calculateInvoiceTotals, auditLineItem, consolidateFixedServices } from './utils/auditEngine';
import { saveFacturacion } from './services/facturacionService';
import Modal from './components/Modal';
import { PaginatedEditableGrid as EditableGrid, arePlansEquivalent } from './components/PaginatedEditableGrid';
import Step3SuccessScreen from './components/CargaManual/Step3SuccessScreen';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';

export default function CargaManual() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('procesamiento');
  const [rawData, setRawData] = useState('');
  const [fileData, setFileData] = useState([]);
  const [dbLines, setDbLines] = useState(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [invoiceTotals, setInvoiceTotals] = useState({ tax: null, total: null });
  const [prevConsumosData, setPrevConsumosData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState(1); 
  const [allSocios, setAllSocios] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null); // 'movistar', 'personal', 'claro'
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [periodPrices, setPeriodPrices] = useState(new Map());
  
  const [isDbLinesLoading, setIsDbLinesLoading] = useState(true);
  const [isPeriodPricesLoading, setIsPeriodPricesLoading] = useState(true);
  const isDbReady = !isDbLinesLoading && !isPeriodPricesLoading;

  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [incidentData, setIncidentData] = useState(null);
  const [search, setSearch] = useState('');
  
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmStats, setConfirmStats] = useState(null);
  const [forceSave, setForceSave] = useState(false);
  const [sortByAnomalies, setSortByAnomalies] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [isUpdatingPlanes, setIsUpdatingPlanes] = useState(false);

  const pendingPlanUpdates = React.useMemo(() => {
    return (fileData || []).filter(row => row.plan && !arePlansEquivalent(row.plan, row.planOficial));
  }, [fileData]);

  const getPrevPeriodStrHelper = (pStr) => {
    if (!pStr) return '';
    const [year, month] = pStr.split('-').map(Number);
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  };

  // Cargar precios de la matriz para el periodo seleccionado y el periodo anterior
  useEffect(() => {
    async function fetchPeriodPrices() {
      setIsPeriodPricesLoading(true);
      if (!periodo) {
        setIsPeriodPricesLoading(false);
        return;
      }
      try {
        const prevPeriodStr = getPrevPeriodStrHelper(periodo);

        const [currRes, prevRes] = await Promise.all([
          supabase.from('precios_auditoria_periodo').select('*').eq('periodo', periodo),
          prevPeriodStr ? supabase.from('precios_auditoria_periodo').select('*').eq('periodo', prevPeriodStr) : Promise.resolve({ data: [] })
        ]);

        const cMap = new Map();
        (currRes.data || []).forEach(p => {
          cMap.set(p.plan_id, Number(p.precio_lista) || 0);
        });

        const pMap = new Map();
        (prevRes.data || []).forEach(p => {
          pMap.set(p.plan_id, Number(p.precio_lista) || 0);
        });

        setPeriodPrices(cMap);
        setPrevPeriodPrices(pMap);
      } catch (err) {
        console.error("Error al cargar precios de auditoría:", err);
      } finally {
        setIsPeriodPricesLoading(false);
      }
    }
    fetchPeriodPrices();
  }, [periodo]);

  useEffect(() => {
    async function fetchSocios() {
      setIsDbLinesLoading(true);
      try {
        const { data: lineasData, error: lineasError } = await supabase
          .from('lineas')
          .select(`
            numero_linea, 
            proveedor_id,
            plan_id,
            descuento_esperado,
            cargo_equipo,
            numero_grupo,
            socios:socios!lineas_socio_id_fkey(nombre_completo, socio_id, desc_adicionales, cta_numero, total_cuotas),
            planes_abonos(plan_id, precio, nombre_plan, gb_incluidos, tarifa_aunar, mutual_margen_pct, descuento_operadora_pct)
          `);
        
        if (lineasError) throw lineasError;

        const map = new Map();
        lineasData?.forEach(l => {
          if (l.numero_linea) {
            map.set(normalizePhone(l.numero_linea), {
              nombre: l.socios?.nombre_completo || 'Socio no identificado',
              socio_id: l.socios?.socio_id,
              proveedor_id: l.proveedor_id,
              plan_id: l.plan_id || l.planes_abonos?.plan_id,
              numero_grupo: l.numero_grupo,
              desc_pct: Number(l.socios?.desc_adicionales) || 0,
              cta_numero: Number(l.socios?.cta_numero) || 0,
              total_cuotas: Number(l.socios?.total_cuotas) || 0,
              cargo_equipo: Number(l.cargo_equipo) || 0,
              descuento_esperado: Number(l.descuento_esperado) || 0,
              precio_oficial: Number(l.planes_abonos?.precio) || 0,
              tarifa_aunar: Number(l.planes_abonos?.tarifa_aunar) || 0,
              mutual_margen_pct: Number(l.planes_abonos?.mutual_margen_pct) || 0,
              descuento_operadora_pct: Number(l.planes_abonos?.descuento_operadora_pct) || 0,
              plan_db: l.planes_abonos?.nombre_plan,
              gb_db: l.planes_abonos?.gb_incluidos
            });
          }
        });
        setDbLines(map);

        const { data: sData, error: sociosError } = await supabase.from('socios').select('socio_id, nombre_completo, grupo_socio(numero_grupo)').order('nombre_completo');
        if (sociosError) throw sociosError;

        setAllSocios(sData || []);
      } catch (err) {
        console.error("Error fetching db lines or socios:", err);
        addToast('Error al conectar con la base de datos: ' + err.message, 'error');
      } finally {
        setIsDbLinesLoading(false);
      }
    }
    fetchSocios();
  }, []);

  // Cargar datos del mes anterior cada vez que cambia el periodo o proveedor
  useEffect(() => {
    async function loadPrevMonth() {
      if (!periodo || !selectedProvider) return;
      
      const provMap = { 'claro': 1, 'movistar': 2, 'personal': 3 };
      const currentProvId = provMap[selectedProvider];

      // Find the most recent period for this provider strictly before `periodo`
      const { data: latestPeriods } = await supabase
        .from('consumos_mensuales')
        .select('periodo')
        .eq('proveedor_id', currentProvId)
        .lt('periodo', periodo)
        .order('periodo', { ascending: false })
        .limit(1);

      let prevPeriodToFetch = null;
      if (latestPeriods && latestPeriods.length > 0) {
        prevPeriodToFetch = latestPeriods[0].periodo;
      }

      if (prevPeriodToFetch) {
        const { data } = await supabase
          .from('consumos_mensuales')
          .select('*, lineas(plan_id, planes_abonos(gb_incluidos, tarifa_aunar))')
          .eq('periodo', prevPeriodToFetch)
          .eq('proveedor_id', currentProvId);
        
        setPrevConsumosData(data || []);
      } else {
        setPrevConsumosData([]);
      }
    }
    loadPrevMonth();
  }, [periodo, selectedProvider]);

  const [existingPeriods, setExistingPeriods] = useState([]);
  useEffect(() => {
    async function fetchExistingPeriods() {
      if (!selectedProvider) return;
      const provMap = { 'claro': 1, 'movistar': 2, 'personal': 3 };
      const { data } = await supabase
        .from('consumos_mensuales')
        .select('periodo')
        .eq('proveedor_id', provMap[selectedProvider]);
      
      const unique = [...new Set(data?.map(d => d.periodo))].sort().reverse();
      setExistingPeriods(unique);
    }
    fetchExistingPeriods();
  }, [selectedProvider]);


  // Funciones de procesamiento refactorizadas y movidas a /utils

  const handleProcesar = async () => {
    if (!rawData) return;
    
    // Validación de Prevención de Errores Cruzados
    const errorMsg = verificarTextoCruzado(rawData, selectedProvider);
    if (errorMsg) {
      const isConfirmed = await confirm({
        title: 'Líneas Faltantes o Adicionales',
        message: errorMsg + '\n\n¿Estás seguro de que deseas continuar con la carga?',
        isDanger: true,
        confirmText: 'Continuar'
      });
      if (!isConfirmed) return;
    }

    setIsProcessing(true);
      setTimeout(() => {
      try {
        const lines = rawData.split(/\r?\n/);
        let finalResults = [];
        let invoiceTotalDetected = null;
        let invoiceTaxDetected = null;

        let response;
        if (selectedProvider === 'movistar') response = procesarMovistar(lines);
        else if (selectedProvider === 'personal') response = procesarPersonal(lines);
        else if (selectedProvider === 'claro') response = procesarClaro(lines);

        finalResults = response.lines;

        const parseNum = getParserByProvider(selectedProvider);

        // --- CALCULATE TOTALS VIA AUDITORIA ENGINE ---
        const totalsResult = calculateInvoiceTotals(rawData, lines, finalResults, response, selectedProvider);
        
        setInvoiceTotals({ 
          tax: totalsResult.tax, 
          total: totalsResult.total 
        });

        // --- AUDIT EACH LINE ---
        const resultados = finalResults.map(item => {
          const normPhone = item.telefono.includes('SUELTA') ? item.telefono : normalizePhone(item.telefono);
          const dbInfo = dbLines.get(normPhone);

          const auditData = auditLineItem(item, dbInfo, {
            selectedProvider,
            periodPrices,
            prevConsumosData,
            parseNum,
            periodo
          });

          return {
            linea: normPhone,
            proveedorIdDb: dbInfo?.proveedor_id,
            plan: auditData.planDisplay,
            planOficial: dbInfo?.plan_db || 'No registrado',
            gbOficial: dbInfo?.gb_db,
            abono: auditData.realAbono, 
            excedentes: auditData.excMonto,
            monto: auditData.montoTotalSocio,
            montoFactura: auditData.montoFacturado,
            precioOficial: auditData.precioLista,
            socioNombre: dbInfo?.nombre || 'Socio no identificado',
            socioId: dbInfo?.socio_id,
            numeroGrupo: dbInfo?.numero_grupo,
            isValid: !!dbInfo?.socio_id,
            auditStatus: auditData.auditStatus,
            alertas: auditData.alertas,
            isManuallyAssigned: false,
            precioListaOriginal: item.precioListaStr,
            descuentoOriginal: item.descuentoStr,
            prevAbonoBase: auditData.prevAbonoBase
          };
        });

        // --- CONSOLIDATE FIXED SERVICES ---
        const resultadosLimpios = consolidateFixedServices(resultados, selectedProvider);

        setFileData(resultadosLimpios);
        setStep(2);
      } catch (err) {
        console.error("Error al procesar:", err);
        addToast("Error crítico al procesar los datos: " + err.message, 'error');
      } finally {
        setIsProcessing(false);
      }
    }, 0);
  };

  const handleAssignSocio = (lineaNum, socioId) => {
    const socio = allSocios.find(s => s.socio_id === parseInt(socioId));
    setFileData(prev => prev.map(row => {
      if (row.linea === lineaNum) {
        return {
          ...row,
          socioNombre: socio?.nombre_completo,
          socioId: socio?.socio_id,
          numeroGrupo: socio?.grupo_socio?.[0]?.numero_grupo,
          isValid: true,
          isManuallyAssigned: true
        };
      }
      return row;
    }));
  };

  const handleAssignLinea = (sueltaId, nuevaLinea) => {
    setFileData(prev => prev.map(row => {
      if (row.linea === sueltaId) {
        const normPhone = normalizePhone(nuevaLinea);
        const dbInfo = dbLines.get(normPhone);
        return {
          ...row,
          linea: nuevaLinea,
          socioNombre: dbInfo?.nombre || 'Socio no identificado',
          socioId: dbInfo?.socio_id,
          numeroGrupo: dbInfo?.numero_grupo,
          isValid: !!dbInfo,
          planOficial: dbInfo?.plan_db || 'No registrado',
          isManuallyAssigned: true
        };
      }
      return row;
    }));
  };

  const handleUpdateLineaPlan = async (lineaNum, planName, planPrice) => {
    const provMap = { 'claro': 1, 'movistar': 2, 'personal': 3 };
    const currentProvId = provMap[selectedProvider];

    try {
      // 1. Buscar si el plan ya existe en la base de datos
      let { data: planData, error: planFetchErr } = await supabase
        .from('planes_abonos')
        .select('plan_id, nombre_plan')
        .eq('proveedor_id', currentProvId)
        .ilike('nombre_plan', planName)
        .maybeSingle();

      if (planFetchErr) throw planFetchErr;

      let targetPlanId = planData?.plan_id;

      if (!targetPlanId) {
        // Confirmar creación con modal premium
        const confirmCreate = await confirm({
          title: 'Crear Nuevo Plan',
          message: `El plan "${planName}" no existe en la base de datos de ${selectedProvider.toUpperCase()}.\n\n¿Desea crearlo automáticamente con un precio base de $${planPrice.toLocaleString('es-AR')} y asignarlo a esta línea?`,
          confirmText: 'Crear y Asignar'
        });
        if (!confirmCreate) return;

        // Insertar plan en Supabase
        const { data: newPlan, error: insertErr } = await supabase
          .from('planes_abonos')
          .insert({
            nombre_plan: planName,
            proveedor_id: currentProvId,
            precio: planPrice || 0,
            es_plan_internet: planName.toLowerCase().includes('internet')
          })
          .select()
          .single();

        if (insertErr) throw insertErr;
        targetPlanId = newPlan.plan_id;
        addToast('Plan creado correctamente', 'success');
      }

      // 2. Actualizar el plan de la línea en Supabase
      const { error: lineUpdateErr } = await supabase
        .from('lineas')
        .update({ plan_id: targetPlanId })
        .eq('numero_linea', lineaNum);

      if (lineUpdateErr) throw lineUpdateErr;

      // 3. Actualizar la grilla local para quitar la alerta y actualizar planOficial
      setFileData(prev => prev.map(row => {
        if (row.linea === lineaNum) {
          return {
            ...row,
            planOficial: planName,
            alertas: row.alertas?.filter(a => !a.msg.includes('PLAN') && !a.msg.includes('DESVÍO'))
          };
        }
        return row;
      }));

      // 4. Actualizar el caché de líneas en memoria para evitar desfases
      setDbLines(prev => {
        const next = new Map(prev);
        const norm = normalizePhone(lineaNum);
        const cached = next.get(norm);
        if (cached) {
          next.set(norm, {
            ...cached,
            plan_id: targetPlanId,
            plan_db: planName,
            precio_oficial: planPrice || cached.precio_oficial
          });
        }
        return next;
      });

      addToast(`Plan de línea ${lineaNum} actualizado a "${planName}" exitosamente`, 'success');
    } catch (err) {
      console.error("Error updating plan for line:", err);
      addToast('Error al actualizar el plan: ' + err.message, 'error');
    }
  };

  const handleUpdateAllLineasPlanes = async () => {
    const provMap = { 'claro': 1, 'movistar': 2, 'personal': 3 };
    const currentProvId = provMap[selectedProvider];

    const linesToUpdate = fileData.filter(
      row => row.plan && !arePlansEquivalent(row.plan, row.planOficial)
    );

    if (linesToUpdate.length === 0) {
      addToast('No hay planes pendientes de actualizar en DB', 'info');
      return;
    }

    setIsUpdatingPlanes(true);
    try {
      // 1. Cargar planes existentes para este proveedor
      const { data: dbPlanes, error: planesErr } = await supabase
        .from('planes_abonos')
        .select('*')
        .eq('proveedor_id', currentProvId);

      if (planesErr) throw planesErr;

      const planMap = new Map();
      (dbPlanes || []).forEach(p => {
        if (p.nombre_plan) planMap.set(p.nombre_plan.toLowerCase().trim(), p);
      });

      const updatedRowMap = new Map();
      const lineasPayload = [];

      // 2. Identificar o crear plan para cada línea
      for (const row of linesToUpdate) {
        const targetPlanName = row.plan.trim();
        const normName = targetPlanName.toLowerCase();
        let existingPlan = planMap.get(normName);

        if (!existingPlan) {
          const planPrice = row.abono || row.precioListaOriginal || 0;
          const { data: newPlan, error: createErr } = await supabase
            .from('planes_abonos')
            .insert({
              nombre_plan: targetPlanName,
              proveedor_id: currentProvId,
              precio: planPrice,
              es_plan_internet: targetPlanName.toLowerCase().includes('internet')
            })
            .select()
            .single();

          if (createErr) throw createErr;
          existingPlan = newPlan;
          planMap.set(normName, newPlan);
        }

        lineasPayload.push({
          numero_linea: row.linea,
          plan_id: existingPlan.plan_id
        });

        updatedRowMap.set(row.linea, {
          targetPlanId: existingPlan.plan_id,
          planName: existingPlan.nombre_plan,
          planPrice: existingPlan.precio
        });
      }

      // 3. Actualizar la tabla lineas en DB
      for (const item of lineasPayload) {
        const { error: lineUpdErr } = await supabase
          .from('lineas')
          .update({ plan_id: item.plan_id })
          .eq('numero_linea', item.numero_linea);

        if (lineUpdErr) throw lineUpdErr;
      }

      // 4. Actualizar la grilla local
      setFileData(prev => prev.map(row => {
        const info = updatedRowMap.get(row.linea);
        if (info) {
          return {
            ...row,
            planOficial: info.planName,
            alertas: row.alertas?.filter(a => !a.msg.includes('PLAN') && !a.msg.includes('DESVÍO') && !a.msg.includes('DESVIO'))
          };
        }
        return row;
      }));

      // 5. Actualizar el caché dbLines
      setDbLines(prev => {
        const next = new Map(prev);
        updatedRowMap.forEach((info, lineaNum) => {
          const norm = normalizePhone(lineaNum);
          const cached = next.get(norm);
          if (cached) {
            next.set(norm, {
              ...cached,
              plan_id: info.targetPlanId,
              plan_db: info.planName,
              precio_oficial: info.planPrice || cached.precio_oficial
            });
          }
        });
        return next;
      });

      addToast(`¡Se actualizaron ${linesToUpdate.length} línea(s) con sus nuevos planes en DB exitosamente!`, 'success');
    } catch (err) {
      console.error("Error al actualizar todos los planes:", err);
      addToast('Error al actualizar planes en masa: ' + err.message, 'error');
    } finally {
      setIsUpdatingPlanes(false);
    }
  };

  const handlePreSave = () => {
    // BLOQUEAR GUARDADO SI HAY PLANES PENDIENTES DE ACTUALIZAR
    if (pendingPlanUpdates.length > 0) {
      addToast(
        `⚠️ No se puede guardar la liquidación. Hay ${pendingPlanUpdates.length} línea(s) con planes pendientes de actualizar en DB. Actualice los planes antes de continuar.`,
        'error'
      );
      return;
    }

    const currentProvId = selectedProvider === 'claro' ? 1 : selectedProvider === 'movistar' ? 2 : 3;
    const prevLinesCount = (prevConsumosData || []).filter(c => Number(c.proveedor_id || 0) === currentProvId).length;
    const currentLinesCount = fileData.length;
    
    let sinPlan = 0;
    let sinSocio = 0;
    let sinGrupo = 0;
    
    fileData.forEach(row => {
      if (row.planOficial === 'No registrado') sinPlan++;
      if (!row.isValid) sinSocio++;
      if (row.numeroGrupo === undefined || row.numeroGrupo === null) sinGrupo++;
    });

    // --- NUEVO: Cálculo de aumento promedio por plan ---
    const planIncreases = [];
    const groupedByPlan = {};
    
    fileData.forEach(row => {
      // Ignorar si la línea pertenece a otro proveedor en DB (ej: portabilidad)
      if (row.proveedorIdDb && row.proveedorIdDb !== currentProvId) {
        return;
      }

      let planName = row.planOficial !== 'No registrado' ? row.planOficial : row.plan;
      
      // Normalizar y buscar coincidencia en dbLines para agrupar duplicados (ej: Plan4GB vs Plan 4 GB)
      if (planName) {
        const normName = planName.toLowerCase().replace(/\s+/g, '');
        for (const dbLine of dbLines.values()) {
          if (dbLine.plan_db && dbLine.plan_db.toLowerCase().replace(/\s+/g, '') === normName) {
            planName = dbLine.plan_db;
            break;
          }
        }
      }

      if (!groupedByPlan[planName]) {
        groupedByPlan[planName] = [];
      }
      if (row.prevAbonoBase > 0) {
        groupedByPlan[planName].push(row);
      }
    });

    for (const [planName, lines] of Object.entries(groupedByPlan)) {
      // Priorizar líneas sin excedentes
      let cleanLines = lines.filter(l => (l.excedentes || 0) === 0);
      if (cleanLines.length === 0) {
        cleanLines = lines; // Fallback a líneas con excedentes
      }
      
      const sample = cleanLines.slice(0, 4); // Tomar hasta 4 líneas
      let avgPct = 0;
      if (sample.length > 0) {
        let totalPct = 0;
        sample.forEach(l => {
          const pct = ((l.abono - l.prevAbonoBase) / l.prevAbonoBase) * 100;
          totalPct += pct;
        });
        avgPct = totalPct / sample.length;
      }

      // Calcular promedio real de abono base del mes anterior y actual para este plan
      let totalPrev = 0;
      let totalCurr = 0;
      let countVal = 0;
      lines.forEach(l => {
        if (l.prevAbonoBase > 0) {
          totalPrev += l.prevAbonoBase;
          totalCurr += l.abono;
          countVal++;
        }
      });
      const avgPrev = countVal > 0 ? (totalPrev / countVal) : 0;
      const avgCurr = countVal > 0 ? (totalCurr / countVal) : 0;

      // Buscar plan_id en dbLines para obtener los precios de lista del mes anterior y actual
      let dbPlanInfo = null;
      const normPlanName = planName.toLowerCase().replace(/\s+/g, '');
      for (const dbLine of dbLines.values()) {
        if (dbLine.plan_db && dbLine.plan_db.toLowerCase().replace(/\s+/g, '') === normPlanName && dbLine.planes_abonos) {
          dbPlanInfo = dbLine.planes_abonos;
          break;
        }
      }
      const planId = dbPlanInfo?.plan_id;

      // Precio de lista actual
      let currListPrice = 0;
      if (planId && periodPrices.has(planId) && periodPrices.get(planId) > 0) {
        currListPrice = periodPrices.get(planId);
      } else {
        currListPrice = dbPlanInfo?.precio_oficial || dbPlanInfo?.precio || 0;
      }
      const sampleWithList = lines.find(l => Number(l.precioListaOriginal) > 0 || Number(l.precioOficial) > 0);
      if (sampleWithList) {
        const parsedList = Number(sampleWithList.precioListaOriginal || sampleWithList.precioOficial);
        if (parsedList > 0) currListPrice = parsedList;
      }

      // Precio de lista anterior
      let prevListPrice = 0;
      if (planId && prevPeriodPrices.has(planId) && prevPeriodPrices.get(planId) > 0) {
        prevListPrice = prevPeriodPrices.get(planId);
      } else {
        if (avgPct !== 0 && currListPrice > 0) {
          prevListPrice = Math.round(currListPrice / (1 + avgPct / 100));
        }
      }

      planIncreases.push({ 
        plan: planName, 
        increase: avgPct,
        avgPrevAbono: avgPrev,
        avgCurrAbono: avgCurr,
        prevListPrice,
        currListPrice
      });
    }
    
    // Ordenar los de mayor aumento primero
    planIncreases.sort((a, b) => b.increase - a.increase);

    // Calcular aumento sugerido a la Tarifa Aunar basado en el aumento puro de los planes más bajos sin excedentes
    let candidateRows = fileData.filter(row => row.prevAbonoBase > 0 && (row.excedentes || 0) === 0);
    // Filtrar aumentos distorsionados (> 10%) causados por pérdida de bonificaciones de operadora
    const pureLines = candidateRows.filter(row => {
      const pct = ((row.abono - row.prevAbonoBase) / row.prevAbonoBase) * 100;
      return pct <= 10.0;
    });

    const targetRows = pureLines.length > 0 ? pureLines : (candidateRows.length > 0 ? candidateRows : fileData.filter(row => row.prevAbonoBase > 0));

    let totalLinesWithPrev = 0;
    let sumPct = 0;
    targetRows.forEach(row => {
      const pct = ((row.abono - row.prevAbonoBase) / row.prevAbonoBase) * 100;
      sumPct += pct;
      totalLinesWithPrev++;
    });
    const weightedAvgPct = totalLinesWithPrev > 0 ? (sumPct / totalLinesWithPrev) : 0;

    // Buscar la tarifa Aunar actual de este proveedor
    let curTarifa = 0;
    for (const dbLine of dbLines.values()) {
      if (dbLine.proveedor_id === currentProvId && dbLine.tarifa_aunar > 0) {
        curTarifa = dbLine.tarifa_aunar;
        break;
      }
    }
    // Redondear sugerido a múltiplos de $5 para alinearse a las tarifas comerciales usuales
    const sugTarifaRaw = curTarifa * (1 + weightedAvgPct / 100);
    const sugTarifa = Math.round(sugTarifaRaw / 5) * 5;

    const getShortMonthName = (pStr) => {
      if (!pStr) return '';
      const m = parseInt(pStr.split('-')[1], 10);
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return months[m - 1] || '';
    };
    const getPrevPeriodStr = (pStr) => {
      if (!pStr) return '';
      const [year, month] = pStr.split('-').map(Number);
      let prevYear = year;
      let prevMonth = month - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    };

    const currMonthLabel = getShortMonthName(periodo);
    const prevMonthLabel = getShortMonthName(getPrevPeriodStr(periodo));

    setConfirmStats({
      prevCount: prevLinesCount,
      currCount: currentLinesCount,
      diff: currentLinesCount - prevLinesCount,
      sinPlan,
      sinSocio,
      sinGrupo,
      planIncreases,
      weightedAvgPct,
      curTarifa,
      sugTarifa,
      prevMonthLabel,
      currMonthLabel
    });
    
    setForceSave(false);
    setIsConfirmModalOpen(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const provMap = { 'claro': 1, 'movistar': 2, 'personal': 3 };
      const currentProviderId = provMap[selectedProvider];

      await saveFacturacion({
        periodo,
        proveedorId: currentProviderId,
        proveedorName: selectedProvider,
        fileData,
        sugTarifa: confirmStats?.sugTarifa,
        planIncreases: confirmStats?.planIncreases
      });

      setStep(3);
    } catch (error) {
      console.error('Error crítico en handleSave:', error);
      addToast('FALLÓ EL GUARDADO: ' + (error.message || 'Error de conexión con la base de datos'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="animate-fade" style={{ padding: '0px' }}>

      {/* ── HEADER: Título + Selectores inline ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Carga de Facturación</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginTop: '6px', fontWeight: 500 }}>Configurá el periodo, la operadora y pegá los datos.</p>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {step === 2 && (
            <>
              <button
                onClick={() => {
                  const headers = ['Linea', 'Socio', 'Plan', 'Abono', 'Monto Facturado'];
                  const rows = fileData.map(r => [r.linea, r.socioNombre || '', r.plan || '', r.abono || 0, r.montoFactura || 0]);
                  const csvContent = [headers, ...rows]
                    .map(row => row.map(cell => '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"').join(','))
                    .join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `carga_${selectedProvider}_${periodo}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="btn-ghost"
                style={{ height: '44px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', borderRadius: '12px' }}
              >
                <Download size={16} /> Exportar
              </button>
              <button
                onClick={() => { setStep(1); setFileData([]); }}
                className="btn-ghost"
                style={{ height: '44px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', borderRadius: '12px' }}
              >
                <RefreshCw size={16} /> Recargar
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── STEP 1: Pegado de datos ── */}
      {step === 1 && (
        <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Fila de Controles: Periodo y Proveedores */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            
            {/* Botón Periodo */}
            <div 
              className="glass-panel hover-lift" 
              style={{ 
                padding: '16px 24px', 
                display: 'flex', 
                gap: '16px', 
                alignItems: 'center', 
                borderRadius: '16px', 
                border: '1px solid var(--border-light)', 
                cursor: 'pointer',
                background: 'var(--surface)',
                minWidth: '220px'
              }} 
              onClick={() => document.getElementById('periodo-input').showPicker()}
            >
              <div style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '12px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={22} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px', cursor: 'pointer' }}>
                  Período de Factura
                </label>
                <input 
                  id="periodo-input"
                  type="month" 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)} 
                  onClick={(e) => { e.stopPropagation(); e.target.showPicker(); }}
                  className="no-calendar-icon"
                  style={{ 
                    padding: '0', 
                    background: 'transparent', 
                    border: 'none', 
                    outline: 'none',
                    fontSize: '16px',
                    fontWeight: '800',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            {/* Botones Proveedor */}
            <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '300px' }}>
              {['movistar', 'personal', 'claro'].map(p => (
                <button 
                  key={p}
                  onClick={() => setSelectedProvider(p)}
                  className="glass-panel hover-lift"
                  style={{
                    flex: 1,
                    padding: '16px 20px',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    border: selectedProvider === p ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                    background: selectedProvider === p ? 'var(--accent-light)' : 'var(--surface)',
                    transition: 'all 0.25s ease',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ 
                    fontSize: '16px', 
                    fontWeight: 800, 
                    color: selectedProvider === p ? 'var(--accent)' : 'var(--text-primary)',
                    letterSpacing: '-0.01em'
                  }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
                    {p === 'movistar' && 'Archivo PDF'}
                    {p === 'personal' && 'Archivo PDF'}
                    {p === 'claro' && 'Archivo CSV'}
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          {/* Info por proveedor */}
          <div className="glass-panel" style={{ 
            padding: '20px 24px', 
            borderRadius: '16px', 
            display: 'flex', 
            gap: '16px', 
            alignItems: 'center',
            background: 'rgba(34, 197, 94, 0.05)',
            border: '1px solid rgba(34, 197, 94, 0.2)'
          }}>
            <Info size={20} color="#22c55e" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {selectedProvider === 'claro' && 'Claro envía las facturas en Excel/CSV o PDF con tablas. Copiá el contenido completo de la tabla de detalles (incluyendo precio lista, bonificación y excedentes) y pegalo abajo.'}
              {selectedProvider === 'personal' && 'Abrí el PDF de Personal, presioná Ctrl + A para seleccionar todo el texto del documento, copialo y pegalo acá. El sistema detecta las líneas fijas y móviles automáticamente.'}
              {selectedProvider === 'movistar' && 'Buscá en el PDF la sección de Resumen de Líneas o Detalle de Consumos, seleccioná todas las filas y pegá el texto acá.'}
              {!selectedProvider && 'Seleccioná una operadora en el menú superior para ver las instrucciones.'}
            </div>
          </div>

          {/* Área de texto principal */}
          <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden', padding: '0', border: '1px solid var(--border-light)' }}>
            <textarea
              className="air-textarea"
              placeholder={selectedProvider ? `Pegá aquí el contenido de la factura de ${selectedProvider}...` : 'Seleccioná un proveedor primero...'}
              value={rawData}
              onChange={(e) => setRawData(e.target.value)}
              disabled={!selectedProvider}
              style={{ 
                minHeight: '400px', 
                borderRadius: '0', 
                border: 'none', 
                borderBottom: '1px solid var(--border-light)',
                margin: 0,
                background: 'rgba(0, 0, 0, 0.2)',
                fontSize: '15px',
                padding: '32px'
              }}
            />
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '20px 32px',
              background: 'var(--surface)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <button 
                  onClick={() => setRawData('')} 
                  className="btn-ghost"
                  style={{ padding: '10px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 600 }}
                >
                  Limpiar
                </button>
                {rawData && (
                  <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>
                    {rawData.split('\n').filter(l => l.trim()).length} renglones de texto detectados
                  </span>
                )}
              </div>
              <button
                onClick={handleProcesar}
                disabled={!rawData || isProcessing || !isDbReady || !selectedProvider}
                className="air-btn air-btn-primary"
                style={{ padding: '14px 32px', fontSize: '15px', fontWeight: 800, borderRadius: '16px' }}
              >
                {isProcessing ? <Loader2 className="animate-spin" size={20} /> : !isDbReady ? 'Cargando DB...' : `Procesar Datos`}
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Grilla de auditoría ── */}
      {step === 2 && (
        <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Panel resumen oscuro */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr', gap: '16px' }}>
            <div className="glass-panel hover-lift" style={{ padding: '24px 28px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>TOTAL AUDITADO (LÍNEAS)</span>
                <Receipt size={18} color="var(--accent)" />
              </div>
              <div style={{ fontSize: '32px', fontWeight: 900, lineHeight: 1, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
                ${((selectedProvider === 'personal' && invoiceTotals.total > 0) ? invoiceTotals.total : (fileData.reduce((acc, curr) => acc + Math.round(Number(curr.montoFactura || 0) * 100), 0) / 100)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                {selectedProvider === 'personal' && invoiceTotals.total > 0 ? (
                  <>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      <span style={{color: '#94a3b8'}}>Suma Líneas:</span> ${(fileData.filter(f => f.linea !== '2216824786').reduce((acc, curr) => acc + Math.round(Number(curr.montoFactura || 0) * 100), 0) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      <span style={{color: '#38bdf8'}}>Línea Suelta (2216824786) c/imp:</span> ${(fileData.find(f => f.linea === '2216824786')?.montoFactura || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </>
                ) : (
                  invoiceTotals.total > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      <span style={{color: '#94a3b8'}}>Factura PDF:</span> ${invoiceTotals.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  )
                )}
                {selectedProvider !== 'claro' && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <span style={{color: '#94a3b8'}}>IVA est.:</span> ${(invoiceTotals.tax > 0 ? invoiceTotals.tax : fileData.reduce((acc, curr) => acc + (selectedProvider === 'personal' ? curr.montoFactura * 0.27 : curr.montoFactura - (curr.montoFactura / 1.21)), 0)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                )}
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  <span style={{color: '#f59e0b'}}>Excedentes Totales:</span> ${(fileData.reduce((acc, curr) => acc + (curr.excedentes || 0), 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="glass-panel hover-lift" style={{ padding: '24px 28px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>LÍNEAS EN ARCHIVO</span>
                <Smartphone size={18} color="var(--text-secondary)" />
              </div>
              <div style={{ fontSize: '32px', fontWeight: 900, lineHeight: 1, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {fileData.length}
              </div>
              <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  <span style={{color: '#10b981'}}>Vinculadas:</span> {fileData.filter(f => f.isValid).length}
                </div>
                {fileData.filter(f => !f.isValid).length > 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <span style={{color: '#ef4444'}}>Sin Socio:</span> {fileData.filter(f => !f.isValid).length}
                  </div>
                )}
              </div>
            </div>

            <div className="glass-panel hover-lift" style={{ padding: '24px 28px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>VARIACIONES / ALERTAS</span>
                <AlertTriangle size={18} color={fileData.filter(f => f.auditStatus === 'WARN' || !f.isValid || f.planOficial === 'No registrado' || f.montoFactura === 0).length > 0 ? '#ef4444' : 'var(--text-secondary)'} />
              </div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: 900, 
                lineHeight: 1, 
                color: fileData.filter(f => f.auditStatus === 'WARN' || !f.isValid || f.planOficial === 'No registrado' || f.montoFactura === 0).length > 0 ? '#ef4444' : 'var(--text-primary)',
                letterSpacing: '-0.02em'
              }}>
                {fileData.filter(f => f.auditStatus === 'WARN' || !f.isValid || f.planOficial === 'No registrado' || f.montoFactura === 0).length}
              </div>
              <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                {fileData.filter(f => f.auditStatus === 'WARN' || !f.isValid || f.planOficial === 'No registrado' || f.montoFactura === 0).length > 0 ? (
                  <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700 }}>
                    ⚠️ Requiere revisión
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 700 }}>
                    ✨ Todo en orden
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
            <button
              onClick={() => setStep(1)}
              className="air-btn hover-lift"
              style={{ padding: '16px 24px', fontSize: '15px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            >
              <RefreshCw size={20} /> Volver a Editar
            </button>
            {pendingPlanUpdates.length > 0 && (
              <button
                onClick={handleUpdateAllLineasPlanes}
                disabled={isUpdatingPlanes}
                className="air-btn hover-lift"
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 700,
                  padding: '16px 24px',
                  fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isUpdatingPlanes ? <Loader2 className="animate-spin" size={20} /> : <><RefreshCw size={20}/> Actualizar Todos los Planes en DB ({pendingPlanUpdates.length})</>}
              </button>
            )}
            <button
              onClick={handlePreSave}
              disabled={isSaving}
              className="air-btn air-btn-primary hover-lift"
              style={{ flex: 1, justifyContent: 'center', padding: '16px', fontSize: '15px' }}
            >
              {isSaving ? <Loader2 className="animate-spin" /> : <><Save size={20}/> Confirmar y Guardar en DB</>}
            </button>
          </div>

          {/* Grilla */}
          <EditableGrid
            fileData={fileData}
            setFileData={setFileData}
            dbLines={dbLines}
            search={search}
            setSearch={setSearch}
            sortByAnomalies={sortByAnomalies}
            setSortByAnomalies={setSortByAnomalies}
            selectedProvider={selectedProvider}
            onIncidentClick={(data) => { setIncidentData(data); setIsIncidentModalOpen(true); }}
            allSocios={allSocios}
            handleAssignSocio={handleAssignSocio}
            handleAssignLinea={handleAssignLinea}
            prevConsumosData={prevConsumosData}
            selectedRows={selectedRows}
            setSelectedRows={setSelectedRows}
            onUpdateLineaPlan={handleUpdateLineaPlan}
            onUpdateAllLineasPlanes={handleUpdateAllLineasPlanes}
            isUpdatingPlanes={isUpdatingPlanes}
          />
        </div>
      )}

      {/* ── STEP 3: Pantalla de éxito ── */}
      {step === 3 && (
        <Step3SuccessScreen
          periodo={periodo}
          selectedProvider={selectedProvider}
          fileData={fileData}
          invoiceTotals={invoiceTotals}
          setStep={setStep}
          setSelectedProvider={setSelectedProvider}
          setRawData={setRawData}
          navigate={navigate}
        />
      )}

      {/* ── MODAL: Confirmar Liquidación ── */}
      <Modal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} title="Confirmar Liquidación">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel-sub" style={{ padding: '24px', borderRadius: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Resumen de Auditoría</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ padding: '16px', background: 'var(--bg-app)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '4px' }}>LÍNEAS MES ANTERIOR</div>
                <div style={{ fontSize: '24px', fontWeight: 900 }}>{confirmStats?.prevCount}</div>
              </div>
              <div style={{ padding: '16px', background: 'var(--bg-app)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '4px' }}>LÍNEAS MES ACTUAL</div>
                <div style={{ fontSize: '24px', fontWeight: 900 }}>{confirmStats?.currCount}</div>
              </div>
            </div>

            {confirmStats?.diff !== 0 && (
              <div style={{ padding: '12px', background: confirmStats?.diff > 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: confirmStats?.diff > 0 ? '#16a34a' : '#ef4444', borderRadius: '12px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                {confirmStats?.diff > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                Diferencia de {Math.abs(confirmStats?.diff)} líneas respecto al mes anterior
              </div>
            )}

            {/* --- NUEVO: Visualización de Variación Promedio por Plan --- */}
            {confirmStats?.planIncreases && confirmStats.planIncreases.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Variación Promedio por Plan</h4>
                <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
                  {confirmStats.planIncreases.map((p, idx) => {
                    // Buscar tarifa actual y precio del plan en la base de datos
                    let dbPlanInfo = null;
                    for (const dbLine of dbLines.values()) {
                      if (dbLine.plan_db === p.plan) {
                        dbPlanInfo = dbLine;
                        break;
                      }
                    }

                    const hasData = !!dbPlanInfo;
                    const curPrecio = dbPlanInfo?.precio_oficial || 0;
                    const hasAbonoData = p.avgPrevAbono > 0 && p.avgCurrAbono > 0;
                    const diffAbono = p.avgCurrAbono - p.avgPrevAbono;
                    const multiplier = 1 + (p.increase / 100);
                    const sugPrecio = Math.round(curPrecio * multiplier);

                    return (
                      <div key={idx} style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: idx < confirmStats.planIncreases.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.plan}</div>
                          <div style={{ fontSize: '13px', fontWeight: 900, color: Math.abs(p.increase) < 0.5 ? 'var(--text-secondary)' : p.increase > 0 ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {Math.abs(p.increase) < 0.5 ? (
                              '0.0%'
                            ) : p.increase > 0 ? (
                              <><TrendingUp size={14} /> {p.increase.toFixed(1)}% AUMENTO</>
                            ) : (
                              <><TrendingDown size={14} /> {Math.abs(p.increase).toFixed(1)}% BAJA</>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {hasAbonoData && (
                            <span>Abono Base Factura: <span style={{ textDecoration: 'line-through' }}>${p.avgPrevAbono.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ({confirmStats?.prevMonthLabel || 'Mes Ant.'}) → <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>${p.avgCurrAbono.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ({confirmStats?.currMonthLabel || 'Actual'}) <span style={{ color: diffAbono > 0 ? '#ef4444' : '#10b981', marginLeft: '4px' }}>({diffAbono >= 0 ? '+' : '-'}${Math.abs(diffAbono).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span></span>
                          )}
                          {(p.prevListPrice > 0 || p.currListPrice > 0 || hasData) && (
                            <span>
                              Precio Lista: {p.prevListPrice > 0 ? (
                                <><span style={{ textDecoration: 'line-through' }}>${p.prevListPrice.toLocaleString('es-AR')}</span> ({confirmStats?.prevMonthLabel || 'Mes Ant.'}) → </>
                              ) : ''}
                              <span style={{ color: 'var(--accent)', fontWeight: 800 }}>${(p.currListPrice || curPrecio).toLocaleString('es-AR')}</span> ({confirmStats?.currMonthLabel || 'Actual'})
                              {p.prevListPrice > 0 && p.currListPrice > 0 && (
                                <span style={{ color: p.currListPrice >= p.prevListPrice ? '#ef4444' : '#10b981', marginLeft: '4px' }}>
                                  ({p.currListPrice >= p.prevListPrice ? '+' : '-'}${Math.abs(p.currListPrice - p.prevListPrice).toLocaleString('es-AR')})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {confirmStats?.weightedAvgPct !== undefined && confirmStats?.curTarifa > 0 && (
                    <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.08)', borderTop: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tarifa Aunar Sugerida (Proveedor)</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap', fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>
                          <span>Tarifa Actual:</span>
                          <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)', fontWeight: 600 }}>${confirmStats.curTarifa.toLocaleString('es-AR')}</span>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>→ Sugerida:</span>
                          <span style={{ color: 'var(--accent)', fontSize: '18px', fontWeight: 900 }}>${confirmStats.sugTarifa.toLocaleString('es-AR')}</span>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 800, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '3px 10px', borderRadius: '100px', whiteSpace: 'nowrap' }}>
                          {confirmStats.weightedAvgPct >= 0 ? '+' : ''}{confirmStats.weightedAvgPct.toFixed(1)}% {selectedProvider === 'movistar' ? '(Planes Base)' : 'Ponderado'}
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {selectedProvider === 'movistar' 
                          ? 'Aumento sugerido basado en el incremento puro (~2%) de los planes base sin excedentes.' 
                          : 'Aumento calculado ponderando la variación real de las líneas activas.'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(confirmStats?.sinPlan > 0 || confirmStats?.sinSocio > 0 || confirmStats?.sinGrupo > 0) && (
              <div style={{ padding: '16px', background: 'rgba(249, 115, 22, 0.1)', borderRadius: '12px', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#ea580c', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> FALTAN ASIGNACIONES</div>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#c2410c', fontSize: '13px', fontWeight: 600 }}>
                  {confirmStats?.sinPlan > 0 && <li>{confirmStats.sinPlan} líneas sin Plan asignado</li>}
                  {confirmStats?.sinSocio > 0 && <li>{confirmStats.sinSocio} líneas sin Socio asignado</li>}
                  {confirmStats?.sinGrupo > 0 && <li>{confirmStats.sinGrupo} líneas sin Grupo asociado</li>}
                </ul>
              </div>
            )}
            
            {(confirmStats?.diff !== 0 || confirmStats?.sinPlan > 0 || confirmStats?.sinSocio > 0 || confirmStats?.sinGrupo > 0) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border-light)', cursor: 'pointer', marginTop: '8px' }}>
                <input 
                  type="checkbox" 
                  checked={forceSave} 
                  onChange={(e) => setForceSave(e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Soy consciente de estas advertencias y deseo continuar con el guardado.</span>
              </label>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={() => setIsConfirmModalOpen(false)} className="air-btn" style={{ flex: 1, background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}>Revisar de nuevo</button>
            <button 
              type="button" 
              onClick={() => { setIsConfirmModalOpen(false); handleSave(); }} 
              disabled={(confirmStats?.diff !== 0 || confirmStats?.sinPlan > 0 || confirmStats?.sinSocio > 0 || confirmStats?.sinGrupo > 0) && !forceSave}
              className="air-btn air-btn-primary" 
              style={{ flex: 1, display: 'flex', justifyContent: 'center', opacity: ((confirmStats?.diff !== 0 || confirmStats?.sinPlan > 0 || confirmStats?.sinSocio > 0 || confirmStats?.sinGrupo > 0) && !forceSave) ? 0.5 : 1, cursor: ((confirmStats?.diff !== 0 || confirmStats?.sinPlan > 0 || confirmStats?.sinSocio > 0 || confirmStats?.sinGrupo > 0) && !forceSave) ? 'not-allowed' : 'pointer' }}
            >
              <CheckCircle2 size={18} /> Confirmar y Guardar
            </button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL: Incidente ── */}
      {isIncidentModalOpen && incidentData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="air-card animate-fade" style={{ maxWidth: '500px', width: '100%', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ width: '40px', height: '40px', background: 'var(--accent-light)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                <Flag size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Abrir Reclamo a Operadora</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Línea: {incidentData.linea}</p>
              </div>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const { error } = await supabase.from('incidentes_lineas').insert({
                numero_linea: incidentData.linea,
                tipo_incidente: formData.get('tipo'),
                descripcion_problema: formData.get('descripcion'),
                monto_a_reclamar: formData.get('monto'),
                monto_auditado: incidentData.monto_auditado || 0,
                monto_facturado: incidentData.monto_facturado || 0,
                estado: 'Abierto'
              });
              if (error) addToast(error.message, 'error');
              else {
                setIsIncidentModalOpen(false);
                setIncidentData(null);
                addToast("Reclamo registrado correctamente.", 'success');
              }
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px' }}>TIPO DE INCIDENTE</label>
                  <select name="tipo" defaultValue={incidentData.tipo} className="air-textarea" style={{ height: '45px', padding: '0 16px' }}>
                    <option value="Bonificación Incumplida">Bonificación Incumplida</option>
                    <option value="Problema Técnico/Señal">Problema Técnico/Señal</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px' }}>MONTO A RECLAMAR ($)</label>
                  <input name="monto" type="number" step="0.01" defaultValue={incidentData.monto} className="air-textarea" style={{ height: '45px', padding: '0 16px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '6px' }}>DESCRIPCIÓN / OBSERVACIONES</label>
                  <textarea name="descripcion" defaultValue={incidentData.descripcion} className="air-textarea" style={{ height: '100px' }}></textarea>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                <button type="button" onClick={() => setIsIncidentModalOpen(false)} style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '1px solid var(--border-light)', background: 'none', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ flex: 2, padding: '14px', borderRadius: '14px', border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 800, cursor: 'pointer' }}>Guardar Reclamo</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
