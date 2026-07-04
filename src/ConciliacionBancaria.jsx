import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Calendar, Loader2 } from 'lucide-react';
import { parsearMovimientos } from './utils/bankParser';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import Modal from './components/Modal';
import * as XLSX from 'xlsx';
import * as conciliacionService from './services/conciliacionService';
import { formatUTCDate as formatISODateToAR } from './utils/formatters';

// Subcomponents imports
import PeriodSummaryCards from './components/Conciliacion/PeriodSummaryCards';
import DesgloseGrupoModal from './components/Conciliacion/DesgloseGrupoModal';
import HistorialMovimientosTab from './components/Conciliacion/HistorialMovimientosTab';
import DebitosAutomaticosTab from './components/Conciliacion/DebitosAutomaticosTab';
import NuevaConciliacionTab from './components/Conciliacion/NuevaConciliacionTab';

const parseDateToISODate = (dateStr) => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const match = dateStr.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4}|\d{2})\b/);
  if (!match) return new Date().toISOString().split('T')[0];
  const day = match[1];
  const month = match[2];
  let year = match[3];
  if (year.length === 2) year = '20' + year;
  return `${year}-${month}-${day}`;
};

// Helper to extract period from concept (e.g. Rel: 2026-05) or fallback to bank date period
const getBankPeriod = (concepto, bankDateISO) => {
  if (concepto) {
    const match = concepto.match(/\b(20\d{2})[-/](\d{2})\b/);
    if (match) return `${match[1]}-${match[2]}`;
  }
  return bankDateISO ? bankDateISO.substring(0, 7) : '';
};


// Helper to translate tipo_movimiento to Spanish user-friendly text
const getTipoMovimientoLabel = (tipo) => {
  switch(tipo) {
    case 'IMPUESTO': return 'Impuesto';
    case 'COMISION': return 'Comisión';
    case 'SUSCRIPCION': return 'Suscripción';
    case 'PAGO_VEP': return 'Pago VEP';
    case 'PAGO_ARCA': return 'Pago ARCA';
    case 'PAGO_SERVICIO': return 'Pago Servicio';
    case 'TRANSFERENCIA_RECIBIDA': return 'Transf. Recibida';
    case 'TRANSFERENCIA_ENVIADA': return 'Transf. Enviada';
    case 'OTRO_INGRESO': return 'Otro Ingreso';
    case 'OTRO_EGRESO': return 'Otro Egreso';
    default: return 'Otro';
  }
};

// Helper to render type badge
const renderTipoMovimientoBadge = (tipo) => {
  let label = 'Otro';
  let bgColor = 'rgba(107, 114, 128, 0.08)';
  let color = '#6b7280';
  
  switch(tipo) {
    case 'IMPUESTO':
      label = 'Impuesto';
      bgColor = 'rgba(249, 115, 22, 0.1)';
      color = '#f97316';
      break;
    case 'COMISION':
      label = 'Comisión';
      bgColor = 'rgba(234, 179, 8, 0.1)';
      color = '#eab308';
      break;
    case 'SUSCRIPCION':
      label = 'Suscripción';
      bgColor = 'rgba(16, 185, 129, 0.1)';
      color = '#a855f7';
      break;
    case 'PAGO_VEP':
      label = 'Pago VEP';
      bgColor = 'rgba(239, 68, 68, 0.1)';
      color = '#ef4444';
      break;
    case 'PAGO_ARCA':
      label = 'Pago ARCA';
      bgColor = 'rgba(99, 102, 241, 0.1)';
      color = '#6366f1';
      break;
    case 'PAGO_SERVICIO':
      label = 'Pago Servicio';
      bgColor = 'rgba(14, 165, 233, 0.1)';
      color = '#0ea5e9';
      break;
    case 'TRANSFERENCIA_RECIBIDA':
      label = 'Transf. Recibida';
      bgColor = 'rgba(16, 185, 129, 0.1)';
      color = '#10b981';
      break;
    case 'TRANSFERENCIA_ENVIADA':
      label = 'Transf. Enviada';
      bgColor = 'rgba(59, 130, 246, 0.1)';
      color = '#3b82f6';
      break;
    case 'OTRO_INGRESO':
      label = 'Otro Ingreso';
      bgColor = 'rgba(16, 185, 129, 0.05)';
      color = '#059669';
      break;
    case 'OTRO_EGRESO':
      label = 'Otro Egreso';
      bgColor = 'rgba(239, 68, 68, 0.05)';
      color = '#dc2626';
      break;
  }
  
  return (
    <span style={{ 
      fontSize: '11px', fontWeight: 800, padding: '4px 8px', borderRadius: '8px',
      background: bgColor, color: color, display: 'inline-block', whiteSpace: 'nowrap'
    }}>
      {label}
    </span>
  );
};

export default function ConciliacionBancaria() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  
  // Persisted state initializers
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('cb_activeTab') || 'nueva';
  });
  
  const [parsedMovements, setParsedMovements] = useState(() => {
    try {
      const saved = localStorage.getItem('cb_parsedMovements');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [saldoAnterior, setSaldoAnterior] = useState(() => {
    const saved = localStorage.getItem('cb_saldoAnterior');
    return saved !== null ? Number(saved) : 0;
  });

  const [saldoFinalExtraido, setSaldoFinalExtraido] = useState(() => {
    try {
      const saved = localStorage.getItem('cb_saldoFinalExtraido');
      return saved !== null ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [rawData, setRawData] = useState(() => {
    return localStorage.getItem('cb_rawData') || '';
  });

  // Workbook ref for multi-sheet support
  const workbookRef = useRef(null);

  // Lote Débito State
  const [loteModal, setLoteModal] = useState(() => {
    try {
      const saved = localStorage.getItem('cb_loteModal');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          isOpen: parsed.isOpen || false,
          loading: false // never persist loading state as true
        };
      }
    } catch {}
    return {
      isOpen: false,
      row: null,
      excelRows: [],
      processedRows: [],
      columns: [],
      cbuCol: '',
      montoCol: '',
      idCol: '',
      estadoCol: '',
      grupoCol: '',
      sheets: [],
      selectedSheet: '',
      loading: false,
      fileName: '',
      inputType: 'file'
    };
  });

  // States for bank statements loading
  const [loading, setLoading] = useState(false);

  // Effects to save state changes to localStorage
  useEffect(() => {
    localStorage.setItem('cb_activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('cb_parsedMovements', JSON.stringify(parsedMovements));
  }, [parsedMovements]);

  useEffect(() => {
    localStorage.setItem('cb_saldoAnterior', String(saldoAnterior));
  }, [saldoAnterior]);

  useEffect(() => {
    localStorage.setItem('cb_saldoFinalExtraido', JSON.stringify(saldoFinalExtraido));
  }, [saldoFinalExtraido]);

  useEffect(() => {
    localStorage.setItem('cb_rawData', rawData);
  }, [rawData]);

  useEffect(() => {
    localStorage.setItem('cb_loteModal', JSON.stringify(loteModal));
  }, [loteModal]);

  // Master data
  const [socios, setSocios] = useState([]);
  const [titularMap, setTitularMap] = useState({});
  const [pendingLiquidaciones, setPendingLiquidaciones] = useState([]);
  const [periodConsumos, setPeriodConsumos] = useState([]);
  const [loadingMaster, setLoadingMaster] = useState(false);

  // Desglose de liquidaciones del grupo
  const [breakdownModal, setBreakdownModal] = useState({
    isOpen: false,
    loading: false,
    liquidacionId: null,
    groupInfo: null,
    members: [],
    payments: [],
    pendingRow: null
  });

  const [editConciliacionModal, setEditConciliacionModal] = useState({
    isOpen: false,
    movement: null,
    selectedSocioId: '',
    selectedSocioLabel: '',
    pendingList: [],
    selectedLiquidationId: '',
    saving: false
  });

  // Sincronización de períodos y resúmenes
  const [periodosList, setPeriodosList] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    return localStorage.getItem('cb_selectedPeriod') || '';
  });

  useEffect(() => {
    if (selectedPeriod) {
      localStorage.setItem('cb_selectedPeriod', selectedPeriod);
    }
  }, [selectedPeriod]);

  const [periodSummary, setPeriodSummary] = useState({
    totalBilled: 0,
    totalPaid: 0,
    totalPending: 0,
    loading: false
  });

  // States for 'historial'
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const fetchPeriods = async () => {
    try {
      const unique = await conciliacionService.fetchPeriods();
      setPeriodosList(unique);
      
      const savedPeriod = localStorage.getItem('cb_selectedPeriod');
      if (savedPeriod && unique.includes(savedPeriod)) {
        setSelectedPeriod(savedPeriod);
      } else if (unique.length > 0) {
        setSelectedPeriod(unique[0]);
      }
    } catch (err) {
      console.error("Error fetching unique periods:", err);
    }
  };

  const fetchPeriodSummary = async (period) => {
    if (!period) return;
    setPeriodSummary(prev => ({ ...prev, loading: true }));
    try {
      const summary = await conciliacionService.fetchPeriodSummary(period);
      setPeriodSummary({
        ...summary,
        loading: false
      });
    } catch (err) {
      console.error("Error fetching period summary:", err);
      setPeriodSummary(prev => ({ ...prev, loading: false }));
    }
  };

  // Sincronizar períodos en montaje
  useEffect(() => {
    fetchPeriods();
  }, []);

  // Cargar datos al cambiar el período seleccionado
  useEffect(() => {
    if (selectedPeriod) {
      fetchMasterData();
      fetchPeriodSummary(selectedPeriod);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    if (activeTab === 'historial') {
      fetchHistorial();
    }
  }, [activeTab, selectedPeriod]);

  const fetchMasterData = async () => {
    setLoadingMaster(true);
    try {
      const sociosData = await conciliacionService.fetchSocios();
      const titularData = await conciliacionService.fetchTitularData();
      const pendingData = await conciliacionService.fetchPendingLiquidaciones(selectedPeriod);

      const titMap = {};
      (titularData || []).forEach(t => {
        titMap[t.numero_grupo] = t.socio_id;
      });

      setSocios(sociosData || []);
      setTitularMap(titMap);
      setPendingLiquidaciones(pendingData || []);

      let consumosList = [];
      if (selectedPeriod) {
        consumosList = await conciliacionService.fetchConsumosMensuales(selectedPeriod);
      }
      setPeriodConsumos(consumosList);
      setLoadingMaster(false);
    } catch (err) {
      console.error("Error cargando datos maestros de conciliación:", err);
      addToast("Error al cargar datos maestros del servidor", "error");
      setLoadingMaster(false);
    }
  };

  const fetchHistorial = async () => {
    setLoadingHistorial(true);
    try {
      const data = await conciliacionService.fetchHistorial(selectedPeriod);
      setHistorial(data || []);
    } catch (err) {
      console.error("Error al cargar historial bancario:", err.message);
      addToast("Error al obtener el historial", "error");
    } finally {
      setLoadingHistorial(false);
    }
  };

  const handleResetearPeriodo = async () => {
    if (!selectedPeriod) {
      addToast("Debe seleccionar un período para resetear", "warning");
      return;
    }
    const accepted = await confirm({
      title: "Resetear Conciliaciones del Período",
      message: `¿Estás seguro de que querés ELIMINAR TODAS las conciliaciones y movimientos bancarios correspondientes al período ${selectedPeriod}? Esta acción restablecerá todas las facturas de este período a pendiente. NO se puede deshacer.`,
      isDanger: true,
      confirmText: "Sí, Borrar Todo",
      cancelText: "Cancelar"
    });

    if (!accepted) return;

    try {
      setLoadingHistorial(true);
      
      const liqs = await conciliacionService.fetchPendingLiquidaciones(selectedPeriod);
      const liqIds = liqs.map(l => l.liquidacion_id);
      
      if (liqIds.length > 0) {
        await conciliacionService.deleteMovimientosBancariosByLiquidations(liqIds);
      }

      const startDate = `${selectedPeriod}-01`;
      const [year, month] = selectedPeriod.split('-');
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      
      await conciliacionService.deleteMovimientosBancariosOrphans(startDate, endDate);

      if (liqIds.length > 0) {
        await conciliacionService.resetLiquidacionesGrupos(liqIds);
      }

      await conciliacionService.insertAuditLog({
        tipo_evento: 'RESETEO_PERIODO',
        descripcion: `RESETEO MASIVO: Se eliminaron todas las conciliaciones del período ${selectedPeriod}.`,
        monto: 0,
        usuario: 'dante@admin.com'
      });

      addToast(`Todas las conciliaciones del período ${selectedPeriod} fueron eliminadas.`, "success");
      
      fetchMasterData();
      fetchHistorial();
      fetchPeriodSummary(selectedPeriod);
      
    } catch (err) {
      console.error(err);
      addToast(`Error al resetear período: ${err.message}`, "error");
    } finally {
      setLoadingHistorial(false);
    }
  };

  const getCombinations = (array, size) => {
    const result = [];
    const f = (active, rest) => {
      if (active.length === size) {
        result.push(active);
        return;
      }
      for (let i = 0; i < rest.length; i++) {
        f([...active, rest[i]], rest.slice(i + 1));
      }
    };
    f([], array);
    return result;
  };

  // Helper para buscar liquidación por defecto
  const findDefaultLiquidation = (netoReal, pendingList, isManual = false) => {
    if (!pendingList || pendingList.length === 0) return { liqId: "", matchedIds: null };
    
    const filteredByPeriod = pendingList.filter(l => l.periodo === selectedPeriod);
    if (filteredByPeriod.length === 0) {
      return { liqId: "", matchedIds: null };
    }
    
    // 1. Buscar en deudas activas (monto pendiente > $2.00)
    const activePendingList = filteredByPeriod.filter(l => (Number(l.monto_total_facturado || 0) - Number(l.monto_abonado || 0)) > 2.00);
    
    if (activePendingList.length > 0) {
      // Buscar coincidencia exacta de monto (tolerancia de redondeo de $2.00)
      const exactMatch = activePendingList.find(liq => {
        const pendingAmount = Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0);
        return Math.abs(pendingAmount - netoReal) < 2.00;
      });
      if (exactMatch) return { liqId: String(exactMatch.liquidacion_id), matchedIds: null };
      
      // Si hay múltiples deudas y la suma total es muy cercana al netoReal (tolerancia de $150),
      // sugerimos saldar el grupo completo de manera masiva
      if (activePendingList.length > 1) {
        const totalPending = activePendingList.reduce((sum, liq) => sum + (Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0)), 0);
        if (Math.abs(totalPending - netoReal) < 150) {
          return { liqId: 'SALDAR_TODO', matchedIds: activePendingList.map(l => l.liquidacion_id) };
        }

        // Buscar combinaciones parciales de deudas que sumen netoReal (preferiendo combinaciones de tamaño menor)
        const n = activePendingList.length;
        for (let r = 2; r < n; r++) {
          const combos = getCombinations(activePendingList, r);
          for (const combo of combos) {
            const sum = combo.reduce((s, liq) => s + (Number(liq.monto_total_facturado || 0) - Number(liq.monto_abonado || 0)), 0);
            if (Math.abs(sum - netoReal) < 2.00) {
              return { liqId: 'SALDAR_TODO', matchedIds: combo.map(l => l.liquidacion_id) };
            }
          }
        }
      }

      // Si es manual, priorizamos la deuda activa más antigua antes de buscar pagadas
      if (isManual) {
        return { liqId: String(activePendingList[0].liquidacion_id), matchedIds: null };
      }
    }

    // 2. Buscar coincidencia exacta de monto facturado en TODAS las liquidaciones (incluyendo las pagadas/saldadas)
    const exactPaidMatch = filteredByPeriod.find(liq => {
      const totalBilled = Number(liq?.monto_total_facturado || 0);
      return Math.abs(totalBilled - netoReal) < 2.00;
    });
    if (exactPaidMatch) return { liqId: String(exactPaidMatch.liquidacion_id), matchedIds: null };

    // 2b. Buscar si la suma de múltiples liquidaciones pagadas coincide
    if (filteredByPeriod.length > 1) {
      const totalBilled = filteredByPeriod.reduce((sum, liq) => sum + Number(liq?.monto_total_facturado || 0), 0);
      if (Math.abs(totalBilled - netoReal) < 150) {
        return { liqId: 'SALDAR_TODO', matchedIds: filteredByPeriod.map(l => l.liquidacion_id) };
      }
      const n = filteredByPeriod.length;
      for (let r = 2; r < n; r++) {
        const combos = getCombinations(filteredByPeriod, r);
        for (const combo of combos) {
          const sum = combo.reduce((s, liq) => s + Number(liq.monto_total_facturado || 0), 0);
          if (Math.abs(sum - netoReal) < 2.00) {
            return { liqId: 'SALDAR_TODO', matchedIds: combo.map(l => l.liquidacion_id) };
          }
        }
      }
    }

    // 3. Fallback por defecto si hay deudas activas (la más antigua)
    if (activePendingList.length > 0) {
      return { liqId: String(activePendingList[0].liquidacion_id), matchedIds: null };
    }

    // 4. Fallback si no hay deudas activas pero hay deudas pagadas (la más reciente)
    return { liqId: String(filteredByPeriod[filteredByPeriod.length - 1].liquidacion_id), matchedIds: null };
  };

  const openBreakdownModal = async (liqId, pendingRow = null) => {
    if (!liqId || liqId === 'SALDAR_TODO') {
      addToast("No se puede ver el desglose de múltiples liquidaciones agrupadas al mismo tiempo. Seleccione una sola.", "warning");
      return;
    }
    
    let liqObj = pendingLiquidaciones.find(l => l.liquidacion_id === parseInt(liqId, 10));
    
    setBreakdownModal({
      isOpen: true,
      loading: true,
      liquidacionId: liqId,
      groupInfo: liqObj || null,
      members: [],
      payments: [],
      pendingRow
    });

    try {
      if (!liqObj) {
        const { data, error: fetchLiqError } = await supabase
          .from('liquidaciones_grupos')
          .select(`
            liquidacion_id,
            numero_grupo,
            periodo,
            monto_total_facturado,
            monto_abonado,
            estado_pago,
            proveedor_id,
            socio_id,
            socios!socio_id(fpago),
            proveedores!proveedor_id(nombre)
          `)
          .eq('liquidacion_id', parseInt(liqId, 10))
          .single();
        
        if (fetchLiqError) throw fetchLiqError;
        liqObj = data;
      }

      const { data: consumosData, error: consumosError } = await supabase
        .from('consumos_mensuales')
        .select(`
          total_linea,
          numero_linea,
          lineas!inner (
            socio_id,
            socios:socios!lineas_socio_id_fkey (
              nombre_completo,
              nro_socio
            )
          )
        `)
        .eq('periodo', liqObj.periodo)
        .eq('proveedor_id', liqObj.proveedor_id)
        .eq('lineas.numero_grupo', liqObj.numero_grupo);

      if (consumosError) throw consumosError;

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('movimientos_bancarios')
        .select(`
          movimiento_id,
          monto,
          fecha_movimiento,
          socio_id,
          socios (
            nombre_completo,
            nro_socio
          )
        `)
        .eq('liquidacion_id', parseInt(liqId, 10));

      if (paymentsError) throw paymentsError;

      setBreakdownModal({
        isOpen: true,
        loading: false,
        liquidacionId: liqId,
        groupInfo: liqObj,
        members: consumosData || [],
        payments: paymentsData || []
      });
    } catch (err) {
      console.error("Error al cargar detalles del desglose:", err);
      addToast("Error al cargar desglose del grupo", "error");
      setBreakdownModal(prev => ({ ...prev, loading: false }));
    }
  };

  // Helper to calculate Longest Common Prefix length
  const getLCP = (a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
      i++;
    }
    return i;
  };

  // Fuzzy word similarity to handle truncations and typos
  const isSimilarWord = (a, b) => {
    if (a.includes(b) || b.includes(a)) {
      const minLen = Math.min(a.length, b.length);
      return minLen >= 4; // Substring match must be at least 4 chars long
    }
    
    // Check common prefix
    const lcp = getLCP(a, b);
    if (lcp >= 4) {
      const minLen = Math.min(a.length, b.length);
      return lcp >= minLen - 2; // Allow at most 2 characters difference at the end
    }
    return false;
  };

  const GENERIC_KEYWORDS = new Set([
    'transf', 'transferencia', 'inmediata', 'ctas', 'dist', 'titular',
    'debin', 'credito', 'debito', 'spot', 'cbu', 'origen', 'recaudaciones',
    'directo', 'banco', 'nacion', 'sucursal', 'cta', 'coop', 'cooperativo',
    'limitado', 'comercial', 'cuenta', 'corriente', 'adicional', 'interb',
    'interbanking', 'e', 's', 'a', 'de', 'la', 'el', 'en', 'y', 'o', 'u',
    'por', 'para', 'con', 'del', 'los', 'las', 'una', 'uno', 'un', 'al', 'del',
    'var', 'cuo', 'fac', 'hon'
  ]);

  // Algoritmo de sugerencia inteligente
  const findSuggestedSocio = (concepto, sociosList) => {
    if (!concepto) return null;
    const normConcept = concepto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const rawWords = normConcept.split(/[^a-z0-9]+/).filter(Boolean);
    const conceptWords = rawWords.filter(w => !GENERIC_KEYWORDS.has(w));

    // 1. Coincidencia por CUIT/CUIL (11 dígitos)
    const cuitMatches = normConcept.match(/\b\d{11}\b/);
    if (cuitMatches) {
      const matchedCuit = cuitMatches[0];
      const socio = sociosList.find(s => s.cuit?.replace(/\D/g, '') === matchedCuit);
      if (socio) return { socio, reason: 'CUIT' };
    }

    // 1b. Coincidencia por CBU (22 dígitos)
    const cbuMatches = normConcept.match(/\b\d{22}\b/);
    if (cbuMatches) {
      const matchedCbu = cbuMatches[0];
      const socio = sociosList.find(s => s.cbu === matchedCbu);
      if (socio) return { socio, reason: 'CBU' };
    }

    // 2. Coincidencia por DNI (8 dígitos)
    const dniMatches = normConcept.match(/\b\d{8}\b/);
    if (dniMatches) {
      const matchedDni = dniMatches[0];
      const socio = sociosList.find(s => s.dni?.replace(/\D/g, '') === matchedDni || s.cuit?.replace(/\D/g, '').includes(matchedDni));
      if (socio) return { socio, reason: 'DNI' };
    }

    // 3. Coincidencia por patrón de grupo (ej: gpo 326, grupo 326, g326, g-326)
    const gpoMatch = normConcept.match(/gpo\s*(\d+)/) || normConcept.match(/grupo\s*(\d+)/) || normConcept.match(/\bg(?:po|rupo)?[- _]*(\d+)\b/);
    if (gpoMatch) {
      const groupNum = parseInt(gpoMatch[1], 10);
      const titularSocioId = titularMap[groupNum];
      if (titularSocioId) {
        const socio = sociosList.find(s => s.socio_id === titularSocioId);
        if (socio) return { socio, reason: `Grupo ${groupNum}` };
      }
      const socioInGroup = sociosList.find(s => s.grupo_socio?.some(gs => gs.numero_grupo === groupNum));
      if (socioInGroup) return { socio: socioInGroup, reason: `Grupo ${groupNum} (Miembro)` };
    }

    // 3b. Coincidencia por Número de Socio (ej: socio 345, nº 345, nro 345, #345, s345)
    const nroSocioMatch = normConcept.match(/\b(?:socio|nro|num|nº|no|#)\s*[-_#]*\s*(\d+)\b/i) || normConcept.match(/\bs[-_#]*(\d+)\b/i);
    if (nroSocioMatch) {
      const socioNum = parseInt(nroSocioMatch[1], 10);
      const socio = sociosList.find(s => s.nro_socio === socioNum);
      if (socio) return { socio, reason: `Nº Socio ${socioNum}` };
    }

    // 4. Coincidencia Inteligente por Nombre y Apellido con resolución de empates por deudas
    let bestSocio = null;
    let bestScore = 0;
    let candidates = [];

    sociosList.forEach(s => {
      const socioWords = s.nombre_completo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(w => w.length > 2);
      let matchCount = 0;
      
      socioWords.forEach(sw => {
        if (conceptWords.some(cw => isSimilarWord(cw, sw))) {
          matchCount++;
        }
      });
      
      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestSocio = s;
        candidates = [s];
      } else if (matchCount === bestScore && matchCount > 0) {
        candidates.push(s);
      }
    });

    if (bestScore >= 2) {
      if (candidates.length === 1) {
        return { socio: candidates[0], reason: 'Nombre/Fuzzy' };
      } else if (candidates.length > 1) {
        // En caso de empate, preferir al que tiene deudas pendientes
        const candidatesWithDebt = candidates.filter(s => {
          const sGroups = s.grupo_socio?.map(g => g?.numero_grupo) || [];
          return pendingLiquidaciones.some(liq => liq && sGroups.includes(liq.numero_grupo));
        });
        if (candidatesWithDebt.length === 1) {
          return { socio: candidatesWithDebt[0], reason: 'Nombre/Fuzzy (Con Deuda)' };
        }
        // Si no hay o hay varios, retornar el mejor candidato inicial
        return { socio: bestSocio, reason: 'Nombre/Fuzzy' };
      }
    }

    return null;
  };

  const calculateDefaultLines = (socioId, liqId, netoReal, allConsumos = periodConsumos) => {
    if (!liqId || !socioId) return [];
    const liqObj = pendingLiquidaciones.find(l => l.liquidacion_id === parseInt(liqId, 10));
    if (!liqObj) return [];
    const groupNum = liqObj.numero_grupo;
    const socioLines = allConsumos.filter(c => 
      c.lineas?.numero_grupo === parseInt(groupNum, 10) &&
      c.proveedor_id === liqObj.proveedor_id
    );
    const sorted = [...socioLines].sort((a, b) => Number(a.total_linea) - Number(b.total_linea));
    let remaining = Math.abs(netoReal);
    const defaults = [];
    sorted.forEach(item => {
      const cost = Number(item.total_linea);
      if (remaining >= cost - 0.05) {
        defaults.push(item.numero_linea);
        remaining = Math.round((remaining - cost) * 100) / 100;
      } else if (remaining > 0) {
        defaults.push(item.numero_linea);
        remaining = 0;
      }
    });
    return defaults;
  };

  // Re-calculate suggestions for pending parsed movements when period/master data changes
  useEffect(() => {
    if (parsedMovements.length === 0 || socios.length === 0) return;

    setParsedMovements(prev => {
      let changed = false;
      const next = prev.map(m => {
        if (m.isDbDuplicate || m.reconciledInSession) return m;

        const isTaxOrFee = m.tipo_movimiento === 'IMPUESTO' || m.tipo_movimiento === 'COMISION' || m.tipo_movimiento === 'SUSCRIPCION' || m.tipo_movimiento === 'PAGO_VEP' || m.tipo_movimiento === 'PAGO_SERVICIO' || m.tipo_movimiento === 'PAGO_ARCA' || m.tipo_movimiento === 'TRANSFERENCIA_ENVIADA';
        
        let targetSocio = null;
        let label = m.selectedSocioLabel;
        let socioId = m.selectedSocioId;

        if (m.selectedSocioId) {
          targetSocio = socios.find(s => s.socio_id === m.selectedSocioId);
        } else if (!isTaxOrFee) {
          const suggestion = findSuggestedSocio(m.concepto, socios);
          if (suggestion) {
            targetSocio = suggestion.socio;
            socioId = suggestion.socio.socio_id;
            label = `${suggestion.socio.nombre_completo} (Socio ${suggestion.socio.nro_socio || ''})`;
          }
        }

        const socioGroups = targetSocio ? (targetSocio.grupo_socio?.map(g => g.numero_grupo) || []) : [];
        const pendingForSocio = targetSocio
          ? pendingLiquidaciones.filter(liq => liq && socioGroups.includes(liq.numero_grupo) && liq.periodo === selectedPeriod)
          : [];

        const { liqId: defaultLiqId, matchedIds } = findDefaultLiquidation(m.netoReal, pendingForSocio);
        const defaultLines = calculateDefaultLines(targetSocio?.socio_id, defaultLiqId, m.netoReal, periodConsumos);

        let nextEstado = 'PENDIENTE';
        let isAlreadyPaidMatch = false;

        if (defaultLiqId && defaultLiqId !== 'SALDAR_TODO') {
          const matchedLiq = pendingForSocio.find(l => String(l.liquidacion_id) === String(defaultLiqId));
          if (matchedLiq) {
            const pendingAmount = Number(matchedLiq.monto_total_facturado || 0) - Number(matchedLiq.monto_abonado || 0);
            const isMatch = Math.abs(Number(matchedLiq.monto_total_facturado || 0) - m.netoReal) < 2.00;
            if (pendingAmount <= 2.00 && isMatch) {
              nextEstado = 'CONCILIADO';
              isAlreadyPaidMatch = true;
            }
          }
        } else if (defaultLiqId === 'SALDAR_TODO' && matchedIds && matchedIds.length > 0) {
          const sumPending = pendingForSocio
            .filter(l => matchedIds.includes(l.liquidacion_id))
            .reduce((sum, l) => sum + (Number(l.monto_total_facturado || 0) - Number(l.monto_abonado || 0)), 0);
          if (Math.abs(sumPending - m.netoReal) < 2.00) {
            nextEstado = 'CONCILIADO';
            isAlreadyPaidMatch = true;
          }
        }

        if (
          m.selectedSocioId !== socioId ||
          m.selectedSocioLabel !== label ||
          m.selectedLiquidationId !== defaultLiqId ||
          m.estado !== nextEstado ||
          m.isAlreadyPaidMatch !== isAlreadyPaidMatch ||
          JSON.stringify(m.pendingList) !== JSON.stringify(pendingForSocio) ||
          JSON.stringify(m.selectedLines) !== JSON.stringify(defaultLines) ||
          JSON.stringify(m.matchedLiquidationIds) !== JSON.stringify(matchedIds)
        ) {
          changed = true;
          return {
            ...m,
            selectedSocioId: socioId,
            selectedSocioLabel: label,
            pendingList: pendingForSocio,
            selectedLiquidationId: defaultLiqId,
            selectedLines: defaultLines,
            estado: nextEstado,
            isAlreadyPaidMatch: isAlreadyPaidMatch,
            matchedLiquidationIds: matchedIds
          };
        }
        return m;
      });

      return changed ? next : prev;
    });
  }, [pendingLiquidaciones, socios, periodConsumos, selectedPeriod]);

  // Re-calculate suggestions for lote processed rows when period/master data changes
  useEffect(() => {
    if (loteModal.excelRows.length === 0 || socios.length === 0) return;
    
    setLoteModal(prev => {
      const nextRows = processExcelRows(
        prev.excelRows,
        prev.cbuCol,
        prev.montoCol,
        prev.idCol,
        prev.estadoCol,
        prev.grupoCol,
        prev.selectedSheet
      );
      
      // Check if rows actually changed to prevent infinite loops
      let changed = false;
      if (prev.processedRows.length !== nextRows.length) {
        changed = true;
      } else {
        for (let i = 0; i < nextRows.length; i++) {
          if (
            prev.processedRows[i].selectedLiquidationId !== nextRows[i].selectedLiquidationId ||
            prev.processedRows[i].matchStatus !== nextRows[i].matchStatus ||
            JSON.stringify(prev.processedRows[i].selectedLiquidations) !== JSON.stringify(nextRows[i].selectedLiquidations) ||
            JSON.stringify(prev.processedRows[i].selectedLines) !== JSON.stringify(nextRows[i].selectedLines)
          ) {
            changed = true;
            break;
          }
        }
      }
      
      if (!changed) return prev;
      
      return {
        ...prev,
        processedRows: nextRows
      };
    });
  }, [selectedPeriod, pendingLiquidaciones, periodConsumos, socios]);

  const handleToggleLineSelection = (rowId, lineNumber, isChecked) => {
    setParsedMovements(prev => prev.map(m => {
      if (m.id !== rowId) return m;
      let newSelected = m.selectedLines || [];
      if (isChecked) {
        if (!newSelected.includes(lineNumber)) {
          newSelected = [...newSelected, lineNumber];
        }
      } else {
        newSelected = newSelected.filter(num => num !== lineNumber);
      }
      return { ...m, selectedLines: newSelected };
    }));
  };

  const handleSocioInputChange = (rowId, val) => {
    const searchVal = val.split(' - Gpo')[0].trim();
    setParsedMovements(prev => prev.map(m => {
      if (m.id !== rowId) return m;
      
      let matchedSocio = null;
      let socioId = "";
      let pendingForSocio = [];
      
      // 1. Detectar si el input es un Grupo (ej: "Grupo 5030", "gpo603", "gpo 603" o solo "5030")
      const groupMatch = searchVal.match(/^(?:grupo|gpo)\s*(\d+)/i);
      const groupNum = groupMatch ? parseInt(groupMatch[1], 10) : (isNaN(searchVal.trim()) ? null : parseInt(searchVal.trim(), 10));
      
      if (groupNum && (titularMap[groupNum] || socios.some(s => s.grupo_socio?.some(gs => gs.numero_grupo === groupNum)))) {
        // Encontrar titular o en su defecto cualquier miembro del grupo
        const titularSocioId = titularMap[groupNum];
        if (titularSocioId) {
          matchedSocio = socios.find(s => s.socio_id === titularSocioId);
        }
        if (!matchedSocio) {
          matchedSocio = socios.find(s => s.grupo_socio?.some(gs => gs.numero_grupo === groupNum));
        }
        
        socioId = matchedSocio ? matchedSocio.socio_id : "";
        pendingForSocio = pendingLiquidaciones.filter(liq => liq && liq.numero_grupo === groupNum && liq.periodo === selectedPeriod);
      } else {
        // Búsqueda normal por nombre de socio
        matchedSocio = socios.find(s => {
          const label = `${s.nombre_completo} (Socio ${s.nro_socio || ''})`;
          return label.toLowerCase() === searchVal.toLowerCase() || s.nombre_completo.toLowerCase() === searchVal.toLowerCase();
        });
        
        socioId = matchedSocio ? matchedSocio.socio_id : "";
        const socioGroups = matchedSocio ? (matchedSocio.grupo_socio?.map(g => g.numero_grupo) || []) : [];
        pendingForSocio = matchedSocio 
          ? pendingLiquidaciones.filter(liq => liq && socioGroups.includes(liq.numero_grupo) && liq.periodo === selectedPeriod)
          : [];
      }
      
      const { liqId: defaultLiqId, matchedIds } = findDefaultLiquidation(m.netoReal, pendingForSocio, true);
      
      let nextEstado = m.estado;
      let isAlreadyPaidMatch = false;
      if (m.isDbDuplicate) {
        nextEstado = 'CONCILIADO';
      } else {
        nextEstado = 'PENDIENTE';
        if (defaultLiqId && defaultLiqId !== 'SALDAR_TODO') {
          const matchedLiq = pendingForSocio.find(l => String(l.liquidacion_id) === String(defaultLiqId));
          if (matchedLiq) {
            const pendingAmount = Number(matchedLiq.monto_total_facturado || 0) - Number(matchedLiq.monto_abonado || 0);
            const isMatch = Math.abs(Number(matchedLiq.monto_total_facturado || 0) - m.netoReal) < 2.00;
            if (pendingAmount <= 2.00 && isMatch) {
              isAlreadyPaidMatch = true;
            }
          }
        } else if (defaultLiqId === 'SALDAR_TODO' && matchedIds && matchedIds.length > 0) {
          const sumPending = pendingForSocio
            .filter(l => matchedIds.includes(l.liquidacion_id))
            .reduce((sum, l) => sum + (Number(l.monto_total_facturado || 0) - Number(l.monto_abonado || 0)), 0);
          if (Math.abs(sumPending - m.netoReal) < 2.00) {
            isAlreadyPaidMatch = true;
          }
        }
      }

      let selectedLiqs = [];
      if (defaultLiqId === 'SALDAR_TODO' && matchedIds) {
        selectedLiqs = matchedIds.map(String);
      } else if (defaultLiqId) {
        selectedLiqs = [String(defaultLiqId)];
      }

      return {
        ...m,
        selectedSocioLabel: val,
        selectedSocioId: socioId,
        pendingList: pendingForSocio,
        selectedLiquidationId: defaultLiqId,
        selectedLiquidations: selectedLiqs,
        matchedLiquidationIds: matchedIds,
        isAlreadyPaidMatch: isAlreadyPaidMatch,
        estado: nextEstado
      };
    }));
  };

  const handleToggleLiquidation = (rowId, liqId) => {
    setParsedMovements(prev => prev.map(m => {
      if (m.id !== rowId) return m;
      const currentList = m.selectedLiquidations || [];
      const isSelected = currentList.includes(String(liqId));
      let newList;
      if (isSelected) {
        newList = currentList.filter(id => id !== String(liqId));
      } else {
        newList = [...currentList, String(liqId)];
      }

      let nextEstado = 'PENDIENTE';
      let isAlreadyPaidMatch = false;
      
      const nextSingleLiqId = newList.length === 1 
        ? newList[0] 
        : (newList.length > 1 ? 'SALDAR_TODO' : null);

      return {
        ...m,
        selectedLiquidations: newList,
        selectedLiquidationId: nextSingleLiqId,
        estado: nextEstado,
        isAlreadyPaidMatch
      };
    }));
  };

  const handleAddGroupToRow = (rowId, groupNum) => {
    const liqsForGroup = pendingLiquidaciones.filter(liq => liq && liq.numero_grupo === parseInt(groupNum, 10));
    if (liqsForGroup.length === 0) {
      addToast(`No se encontraron liquidaciones pendientes para el grupo ${groupNum}`, "warning");
      return;
    }
    setParsedMovements(prev => prev.map(m => {
      if (m.id !== rowId) return m;
      const existingIds = m.pendingList.map(l => String(l.liquidacion_id));
      const newLiqs = liqsForGroup.filter(l => !existingIds.includes(String(l.liquidacion_id)));
      if (newLiqs.length === 0) {
        addToast(`Las liquidaciones del grupo ${groupNum} ya estaban en la lista.`, "warning");
        return m;
      }
      return {
        ...m,
        pendingList: [...m.pendingList, ...newLiqs]
      };
    }));
    addToast(`Se agregaron liquidaciones del grupo ${groupNum} a la lista para saldar.`, "success");
  };



  // Lote Débito Helper functions
  const openLoteModal = (row) => {
    workbookRef.current = null;
    setLoteModal({
      isOpen: true,
      row,
      excelRows: [],
      processedRows: [],
      columns: [],
      cbuCol: '',
      montoCol: '',
      idCol: '',
      estadoCol: '',
      grupoCol: '',
      sheets: [],
      selectedSheet: '',
      loading: false,
      fileName: '',
      inputType: 'file'
    });
    setActiveTab('debitos');
  };

  const processExcelRows = (rows, cbuKey, montoKey, idKey, estadoKey, grupoKey, sheetName) => {
    const isFiltroResultados = String(sheetName || '').trim().toUpperCase() === 'FILTRO RESULTADOS';

    return rows.map((row, idx) => {
      const excelCbu = row[cbuKey] ? String(row[cbuKey]).trim() : '';
      const excelId = idKey && row[idKey] ? String(row[idKey]).trim() : '';
      const excelGrupo = grupoKey && row[grupoKey] ? String(row[grupoKey]).trim() : '';
      const excelMontoRaw = row[montoKey] !== undefined ? row[montoKey] : '';
      const excelEstado = estadoKey && row[estadoKey] ? String(row[estadoKey]).trim() : '';
      
      const cleanExcelCbu = excelCbu.replace(/\D/g, '');
      const cleanExcelId = excelId.replace(/\D/g, '');
      const cleanExcelGrupo = excelGrupo.replace(/\D/g, '');
      const nombreExcel = row['Nombre'] || row['Nombre y Apellido'] || row['Cliente'] || row['Integrante'] || row['APELLIDO, NOMBRE'] || row['APELLIDO Y NOMBRE'] || row['Apellido, Nombre'] || '';
      
      let parsedMonto = 0;
      if (typeof excelMontoRaw === 'number') {
        parsedMonto = Math.abs(excelMontoRaw);
      } else {
        let s = String(excelMontoRaw).replace('$', '').replace(/\s/g, '');
        // Handle US format with comma thousands and dot decimal: 3,588,973.61
        if (/^\-?\d{1,3}(,\d{3})*\.\d+$/.test(s)) {
          s = s.replace(/,/g, '');
          parsedMonto = Math.abs(parseFloat(s)) || 0;
        } else {
          // Handle Argentine format: 1.234.567,89
          if (s.includes('.') && s.includes(',')) {
            s = s.replace(/\./g, '').replace(',', '.');
          } else if (s.includes(',')) {
            s = s.replace(',', '.');
          }
          parsedMonto = Math.abs(parseFloat(s)) || 0;
        }
      }
      
      // Special cleanup for FILTRO RESULTADOS sheet where amounts have a concatenated 307 suffix divided by 100000
      if (isFiltroResultados && parsedMonto > 0) {
        const strVal = parsedMonto.toFixed(5);
        if (strVal.endsWith('307')) {
          const cents = Math.round(parsedMonto * 100000);
          const realCents = Math.floor(cents / 1000);
          parsedMonto = realCents / 100;
        }
      }
      
      // Match with database socios in memory
      let matchedSocio = null;
      let matchReason = '';
      
      // Try group-first matching if group number is provided in the Excel row
      if (cleanExcelGrupo) {
        const groupNum = parseInt(cleanExcelGrupo, 10);
        const groupSocios = socios.filter(s => 
          s.grupo_socio?.some(g => g.numero_grupo === groupNum)
        );
        
        if (groupSocios.length > 0) {
          // A. Match by Name among group members
          if (nombreExcel) {
            const cleanExcelName = nombreExcel.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const nameMatch = groupSocios.find(s => {
              if (!s.nombre_completo) return false;
              const cleanSocioName = s.nombre_completo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              return cleanSocioName === cleanExcelName;
            });
            if (nameMatch) {
              matchedSocio = nameMatch;
              matchReason = `Grupo ${groupNum} (Nombre)`;
            }
          }
          
          // B. Match by CBU among group members
          if (!matchedSocio && cleanExcelCbu) {
            const normExcelCbu = cleanExcelCbu.replace(/^0+/, '');
            const cbuMatch = groupSocios.find(s => {
              const cleanSocioCbu = s.cbu ? s.cbu.replace(/\D/g, '').replace(/^0+/, '') : '';
              return cleanSocioCbu && cleanSocioCbu === normExcelCbu;
            });
            if (cbuMatch) {
              matchedSocio = cbuMatch;
              matchReason = `Grupo ${groupNum} (CBU)`;
            }
          }
          
          // C. Match by CUIT/DNI among group members
          if (!matchedSocio && cleanExcelId) {
            const cuitDniMatch = groupSocios.find(s => {
              const cleanSocioCuit = s.cuit ? s.cuit.replace(/\D/g, '') : '';
              const cleanSocioDni = s.dni ? s.dni.replace(/\D/g, '') : '';
              return (cleanSocioCuit && cleanSocioCuit === cleanExcelId) || (cleanSocioDni && cleanSocioDni === cleanExcelId);
            });
            if (cuitDniMatch) {
              matchedSocio = cuitDniMatch;
              matchReason = `Grupo ${groupNum} (Identificación)`;
            }
          }
          
          // D. Fallback to titular of the group
          if (!matchedSocio) {
            const titularSocioId = titularMap[groupNum];
            if (titularSocioId) {
              matchedSocio = groupSocios.find(s => s.socio_id === titularSocioId);
              if (matchedSocio) matchReason = `Grupo ${groupNum} (Titular)`;
            }
          }
          
          // E. Fallback to first member of the group
          if (!matchedSocio) {
            matchedSocio = groupSocios[0];
            matchReason = `Grupo ${groupNum} (Miembro)`;
          }
        }
      }

      // regular fallback flow if no group matches were found or group was not provided
      if (!matchedSocio) {
        // 1. Match by CBU
        if (cleanExcelCbu) {
          const normExcelCbu = cleanExcelCbu.replace(/^0+/, '');
          
          const matchingSociosByCbu = socios.filter(s => {
            const cleanSocioCbu = s.cbu ? s.cbu.replace(/\D/g, '').replace(/^0+/, '') : '';
            return cleanSocioCbu && cleanSocioCbu === normExcelCbu;
          });

          if (matchingSociosByCbu.length > 0) {
            if (cleanExcelGrupo) {
              const groupNum = parseInt(cleanExcelGrupo, 10);
              const exactMatch = matchingSociosByCbu.find(s => 
                s.grupo_socio?.some(g => g.numero_grupo === groupNum)
              );
              if (exactMatch) {
                matchedSocio = exactMatch;
              }
            }
            
            if (!matchedSocio) {
              matchedSocio = matchingSociosByCbu[0];
            }
            matchReason = 'CBU';
          }
        }
        
        // 2. Match by Group Number (GPO)
        if (!matchedSocio && cleanExcelGrupo) {
          const groupNum = parseInt(cleanExcelGrupo, 10);
          const titularSocioId = titularMap[groupNum];
          if (titularSocioId) {
            matchedSocio = socios.find(s => s.socio_id === titularSocioId);
            if (matchedSocio) matchReason = `Grupo ${groupNum}`;
          }
        }
        
        // 3. Match by CUIT/DNI
        if (!matchedSocio && cleanExcelId) {
          matchedSocio = socios.find(s => {
            const cleanSocioCuit = s.cuit ? s.cuit.replace(/\D/g, '') : '';
            const cleanSocioDni = s.dni ? s.dni.replace(/\D/g, '') : '';
            return (cleanSocioCuit && cleanSocioCuit === cleanExcelId) || (cleanSocioDni && cleanSocioDni === cleanExcelId);
          });
          if (matchedSocio) matchReason = 'CUIT/DNI';
        }

        // 4. Match by Name (exact or close match ignoring case/accents)
        if (!matchedSocio && nombreExcel) {
          const cleanExcelName = nombreExcel.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          matchedSocio = socios.find(s => {
            if (!s.nombre_completo) return false;
            const cleanSocioName = s.nombre_completo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return cleanSocioName === cleanExcelName;
          });
          if (matchedSocio) matchReason = 'Nombre';
        }
      }
      
      let matchStatus = 'NO_FOUND'; // 'MATCH_DEBT', 'MATCH_NO_DEBT', 'NO_FOUND', 'INVALID_AMOUNT', 'EXCEL_REJECT'
      let reason = 'CBU / Grupo no coincide con ningún socio';
      let pendingList = [];
      let defaultLiqId = '';
      let matchedLiquidationIds = null;
      
      // Check if this row is rejected based on Excel status column
      let isRejected = false;
      if (excelEstado) {
        const cleanEstado = excelEstado.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (cleanEstado) {
          if (
            cleanEstado.includes('r10') || 
            cleanEstado.includes('fondos') || 
            cleanEstado.includes('rechaz') || 
            cleanEstado.includes('error') || 
            cleanEstado.includes('fall') || 
            cleanEstado.includes('insufic')
          ) {
            isRejected = true;
          } else {
            const exactOks = ['1', 's', 'si'];
            const partialOks = ['ok', 'exitoso', 'aprobado', 'cobrado', 'procesado', 'true'];
            const isOk = exactOks.includes(cleanEstado) || partialOks.some(okVal => cleanEstado.includes(okVal));
            if (!isOk) {
              isRejected = true;
            }
          }
        }
      }
      
      if (parsedMonto <= 0) {
        matchStatus = 'INVALID_AMOUNT';
        reason = 'Monto debe ser mayor a cero';
      } else if (matchedSocio) {
        let socioGroups = [];
        let sharingSocios = [];
        
        const cleanSocioCbu = matchedSocio.cbu ? matchedSocio.cbu.replace(/\D/g, '') : '';
        if (cleanSocioCbu) {
          sharingSocios = socios.filter(s => {
            const c = s.cbu ? s.cbu.replace(/\D/g, '') : '';
            return c && c === cleanSocioCbu;
          });
          
          const gNums = new Set();
          sharingSocios.forEach(s => {
            s.grupo_socio?.forEach(g => {
              if (g && g.numero_grupo) gNums.add(g.numero_grupo);
            });
          });
          socioGroups = Array.from(gNums);
        } else {
          sharingSocios = [matchedSocio];
          socioGroups = matchedSocio.grupo_socio?.filter(g => g).map(g => g.numero_grupo) || [];
        }
        
        if (cleanExcelGrupo) {
          const groupNum = parseInt(cleanExcelGrupo, 10);
          pendingList = pendingLiquidaciones.filter(liq => liq && liq.numero_grupo === groupNum && (!selectedPeriod || liq.periodo === selectedPeriod));
          if (pendingList.length === 0) {
            pendingList = pendingLiquidaciones.filter(liq => liq && socioGroups.includes(liq.numero_grupo) && (!selectedPeriod || liq.periodo === selectedPeriod));
          }
        } else {
          pendingList = pendingLiquidaciones.filter(liq => liq && socioGroups.includes(liq.numero_grupo) && (!selectedPeriod || liq.periodo === selectedPeriod));
        }
        const { liqId: dLiqId, matchedIds: dMatchedIds } = findDefaultLiquidation(parsedMonto, pendingList);
        defaultLiqId = dLiqId;
        matchedLiquidationIds = dMatchedIds;
        
        const activePendingList = pendingList.filter(l => (Number(l.monto_total_facturado) - Number(l.monto_abonado)) > 0);
        
        if (isRejected) {
          matchStatus = 'EXCEL_REJECT';
          reason = `Rechazado en Excel (${excelEstado})`;
          defaultLiqId = ''; // Clear suggested liquidation for rejected rows
        } else if (activePendingList.length > 0) {
          matchStatus = 'MATCH_DEBT';
          if (defaultLiqId === 'SALDAR_TODO') {
            const listToSum = matchedLiquidationIds && matchedLiquidationIds.length > 0
              ? activePendingList.filter(l => matchedLiquidationIds.includes(l.liquidacion_id))
              : activePendingList;
            const totalPending = listToSum.reduce((sum, liq) => sum + (Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0)), 0);
            reason = `Listo: (${matchReason}) Saldar deudas del grupo por $${totalPending.toLocaleString('es-AR')}`;
          } else {
            const matchedLiq = pendingList.find(l => l?.liquidacion_id === parseInt(defaultLiqId, 10));
            const pendingAmount = matchedLiq ? (Number(matchedLiq.monto_total_facturado || 0) - Number(matchedLiq.monto_abonado || 0)) : 0;
            reason = `Listo: (${matchReason}) Deuda de $${pendingAmount.toLocaleString('es-AR')}`;
          }
        } else {
          matchStatus = 'MATCH_NO_DEBT';
          reason = `Socio (${matchReason}) sin deuda pendiente en este período`;
        }
        
        // Expose sharing socios array
        matchedSocio._sharingNames = sharingSocios.map(s => `${s.nombre_completo} (Socio ${s.nro_socio || ''})`);
      }
      
      const defaultLines = (defaultLiqId && defaultLiqId !== 'SALDAR_TODO' && matchedSocio)
        ? calculateDefaultLines(matchedSocio.socio_id, defaultLiqId, parsedMonto)
        : [];
      
      let selectedLiqs = [];
      if (defaultLiqId === 'SALDAR_TODO' && matchedLiquidationIds) {
        selectedLiqs = matchedLiquidationIds.map(String);
      } else if (defaultLiqId) {
        selectedLiqs = [String(defaultLiqId)];
      }
      
      return {
        id: idx,
        nombreExcel: nombreExcel || (matchedSocio ? matchedSocio.nombre_completo : ''),
        cbu: excelCbu,
        cuitDni: excelId,
        monto: parsedMonto,
        estadoExcel: excelEstado,
        grupo: excelGrupo,
        socioId: matchedSocio ? matchedSocio.socio_id : null,
        nroSocio: matchedSocio ? matchedSocio.nro_socio : null,
        socioNombreCompleto: matchedSocio ? matchedSocio.nombre_completo : null,
        sharingSocios: matchedSocio ? matchedSocio._sharingNames : [],
        pendingList,
        selectedLiquidationId: defaultLiqId,
        matchedLiquidationIds: matchedLiquidationIds,
        selectedLiquidations: selectedLiqs,
        selectedLines: defaultLines,
        matchStatus,
        reason,
        checked: matchStatus === 'MATCH_DEBT' // check by default only those with debts
      };
    });
  };

  const handleTextPaste = (text) => {
    if (!text || !text.trim()) {
      addToast("Por favor pega el texto antes de procesar", "warning");
      return;
    }
    
    setLoteModal(prev => ({ ...prev, loading: true, fileName: 'Texto Pegado' }));
    
    try {
      const parsedRows = text.split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean)
        .map(line => line.split('\t').map(cell => cell.trim().replace(/^"(.*)"$/, '$1')));
        
      if (parsedRows.length === 0) {
        addToast("No se encontraron filas válidas en el texto pegado", "error");
        setLoteModal(prev => ({ ...prev, loading: false }));
        return;
      }
      
      const firstRow = parsedRows[0];
      const isHeaderRow = firstRow.every(cell => {
        const clean = String(cell).trim();
        if (clean.length > 8 && /^\d+$/.test(clean)) return false; // CBU or DNI
        return true;
      });
      
      let headers = [];
      let dataRows = [];
      
      if (isHeaderRow) {
        headers = firstRow.map((h, i) => h.trim() || `Columna ${i + 1}`);
        dataRows = parsedRows.slice(1);
      } else {
        headers = firstRow.map((val, i) => {
          const sample = val ? ` (${String(val).trim().slice(0, 12)})` : '';
          return `Columna ${i + 1}${sample}`;
        });
        dataRows = parsedRows;
      }
      
      const objects = dataRows.map(row => {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] || '';
        });
        return obj;
      });
      
      // Auto-detect columns
      let cbuCol = '';
      let montoCol = '';
      let idCol = '';
      let estadoCol = '';
      let grupoCol = '';
      
      headers.forEach(k => {
        const lowerK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (lowerK.includes('cbu')) {
          cbuCol = k;
        } else if (lowerK.includes('monto') || lowerK.includes('importe') || lowerK.includes('debito') || lowerK.includes('neto') || lowerK.includes('total') || lowerK.includes('valor') || lowerK.includes('aunar')) {
          if (!montoCol) montoCol = k;
        } else if (lowerK.includes('cuit') || lowerK.includes('cuil') || lowerK.includes('dni') || lowerK.includes('documento') || lowerK.includes('identi')) {
          if (!idCol) idCol = k;
        } else if (lowerK.includes('estado') || lowerK.includes('resultado') || lowerK.includes('status') || lowerK.includes('motivo') || lowerK.includes('rechazo') || lowerK.includes('codigo') || lowerK.includes('explicacion') || lowerK.includes('result')) {
          if (!estadoCol) estadoCol = k;
        } else if ((lowerK.includes('grupo') || lowerK.includes('gpo')) && !lowerK.includes('email') && !lowerK.includes('correo') && !lowerK.includes('nombre')) {
          if (!grupoCol) grupoCol = k;
        }
      });
      
      // Fallbacks if not auto-detected
      if (!cbuCol) cbuCol = headers.find(k => k.toLowerCase().includes('cbu')) || '';
      if (!montoCol) montoCol = headers.find(k => k.toLowerCase().includes('monto') || k.toLowerCase().includes('importe') || k.toLowerCase().includes('aunar')) || headers[1] || '';
      if (!grupoCol) grupoCol = headers.find(k => k.toLowerCase().includes('grupo') || k.toLowerCase() === 'gpo') || '';
      
      setLoteModal(prev => {
        const nextModal = {
          ...prev,
          excelRows: objects,
          columns: headers,
          cbuCol,
          montoCol,
          idCol,
          estadoCol,
          grupoCol,
          sheets: [],
          selectedSheet: 'Texto Pegado',
          loading: false
        };
        
        nextModal.processedRows = processExcelRows(objects, cbuCol, montoCol, idCol, estadoCol, grupoCol, 'Texto Pegado');
        return nextModal;
      });
      
      addToast(`Texto pegado procesado correctamente: ${objects.length} filas leídas`, "success");
    } catch (err) {
      console.error("Error al procesar texto pegado:", err);
      addToast("Error al parsear el texto pegado. Asegúrate de copiarlo desde Excel.", "error");
      setLoteModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setLoteModal(prev => ({ ...prev, loading: true, fileName: file.name }));
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        workbookRef.current = workbook;
        
        const sheets = workbook.SheetNames;
        // Auto-select sheets in order of preference: "FILTRO RESULTADOS", "CONTROL", "DATOS.LEX", otherwise sheets[0]
        let initialSheet = sheets[0];
        const prefSheets = ['FILTRO RESULTADOS', 'CONTROL', 'DATOS.LEX'];
        for (const pref of prefSheets) {
          const idx = sheets.findIndex(s => s.trim().toUpperCase() === pref);
          if (idx !== -1) {
            initialSheet = sheets[idx];
            break;
          }
        }
        const worksheet = workbook.Sheets[initialSheet];
        
        // Read full rows as JSON objects
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        // Filter out empty rows or formatting spacer rows
        const filteredJson = rawJson.filter(row => {
          return Object.entries(row).some(([key, val]) => {
            if (val === null || val === undefined) return false;
            const strVal = String(val).trim();
            return strVal !== '' && strVal !== '0' && strVal !== '0.00';
          });
        });
        
        if (filteredJson.length === 0) {
          addToast("El archivo Excel está vacío o no contiene filas válidas", "error");
          setLoteModal(prev => ({ ...prev, loading: false }));
          return;
        }
        
        // Auto-detect columns using first valid row
        let cbuCol = '';
        let montoCol = '';
        let idCol = '';
        let estadoCol = '';
        let grupoCol = '';
        
        const firstRow = filteredJson[0];
        const keys = Object.keys(firstRow);
        
        keys.forEach(k => {
          const lowerK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (lowerK.includes('cbu')) {
            cbuCol = k;
          } else if (lowerK.includes('monto') || lowerK.includes('importe') || lowerK.includes('debito') || lowerK.includes('neto') || lowerK.includes('total') || lowerK.includes('valor') || lowerK.includes('aunar')) {
            if (!montoCol) montoCol = k;
          } else if (lowerK.includes('cuit') || lowerK.includes('cuil') || lowerK.includes('dni') || lowerK.includes('documento') || lowerK.includes('identi')) {
            if (!idCol) idCol = k;
          } else if (lowerK.includes('estado') || lowerK.includes('resultado') || lowerK.includes('status') || lowerK.includes('motivo') || lowerK.includes('rechazo') || lowerK.includes('codigo') || lowerK.includes('explicacion') || lowerK.includes('result')) {
            if (!estadoCol) estadoCol = k;
          } else if ((lowerK.includes('grupo') || lowerK.includes('gpo')) && !lowerK.includes('email') && !lowerK.includes('correo') && !lowerK.includes('nombre')) {
            if (!grupoCol) grupoCol = k;
          }
        });
        
        // Fallbacks if not auto-detected
        if (!cbuCol) cbuCol = keys.find(k => k.toLowerCase().includes('cbu')) || '';
        if (!montoCol) montoCol = keys.find(k => k.toLowerCase().includes('monto') || k.toLowerCase().includes('importe') || k.toLowerCase().includes('aunar')) || keys[1] || '';
        if (!grupoCol) grupoCol = keys.find(k => k.toLowerCase().includes('grupo') || k.toLowerCase() === 'gpo') || '';
        
        setLoteModal(prev => {
          const nextModal = {
            ...prev,
            excelRows: filteredJson,
            columns: keys,
            cbuCol,
            montoCol,
            idCol,
            estadoCol,
            grupoCol,
            sheets,
            selectedSheet: initialSheet,
            loading: false
          };
          
          nextModal.processedRows = processExcelRows(filteredJson, cbuCol, montoCol, idCol, estadoCol, grupoCol, initialSheet);
          return nextModal;
        });
        
        addToast(`Excel leído: Pestaña "${initialSheet}" cargada correctamente`, "success");
      } catch (err) {
        console.error("Error al leer archivo Excel:", err);
        addToast("Error al parsear el archivo Excel. Verifica el formato.", "error");
        setLoteModal(prev => ({ ...prev, loading: false }));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetChange = (sheetName) => {
    if (!workbookRef.current) return;
    
    setLoteModal(prev => ({ ...prev, loading: true, selectedSheet: sheetName }));
    
    try {
      const workbook = workbookRef.current;
      const worksheet = workbook.Sheets[sheetName];
      const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      
      // Filter out empty rows or formatting spacer rows
      const filteredJson = rawJson.filter(row => {
        return Object.entries(row).some(([key, val]) => {
          if (val === null || val === undefined) return false;
          const strVal = String(val).trim();
          return strVal !== '' && strVal !== '0' && strVal !== '0.00';
        });
      });
      
      if (filteredJson.length === 0) {
        addToast(`La pestaña "${sheetName}" está vacía o no contiene filas válidas`, "error");
        setLoteModal(prev => ({ ...prev, loading: false }));
        return;
      }
      
      const firstRow = filteredJson[0];
      const keys = Object.keys(firstRow);
      
      // Auto-detect columns for this sheet
      let cbuCol = '';
      let montoCol = '';
      let idCol = '';
      let estadoCol = '';
      let grupoCol = '';
      
      keys.forEach(k => {
        const lowerK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (lowerK.includes('cbu')) {
          cbuCol = k;
        } else if (lowerK.includes('monto') || lowerK.includes('importe') || lowerK.includes('debito') || lowerK.includes('neto') || lowerK.includes('total') || lowerK.includes('valor') || lowerK.includes('aunar')) {
          if (!montoCol) montoCol = k;
        } else if (lowerK.includes('cuit') || lowerK.includes('cuil') || lowerK.includes('dni') || lowerK.includes('documento') || lowerK.includes('identi')) {
          if (!idCol) idCol = k;
        } else if (lowerK.includes('estado') || lowerK.includes('resultado') || lowerK.includes('status') || lowerK.includes('motivo') || lowerK.includes('rechazo') || lowerK.includes('codigo') || lowerK.includes('explicacion') || lowerK.includes('result')) {
          if (!estadoCol) estadoCol = k;
        } else if ((lowerK.includes('grupo') || lowerK.includes('gpo')) && !lowerK.includes('email') && !lowerK.includes('correo') && !lowerK.includes('nombre')) {
          if (!grupoCol) grupoCol = k;
        }
      });
      
      if (!cbuCol) cbuCol = keys.find(k => k.toLowerCase().includes('cbu')) || '';
      if (!montoCol) montoCol = keys.find(k => k.toLowerCase().includes('monto') || k.toLowerCase().includes('importe') || k.toLowerCase().includes('aunar')) || keys[1] || '';
      if (!grupoCol) grupoCol = keys.find(k => k.toLowerCase().includes('grupo') || k.toLowerCase() === 'gpo') || '';
      
      setLoteModal(prev => {
        const nextModal = {
          ...prev,
          excelRows: filteredJson,
          columns: keys,
          cbuCol,
          montoCol,
          idCol,
          estadoCol,
          grupoCol,
          selectedSheet: sheetName,
          loading: false
        };
        
        nextModal.processedRows = processExcelRows(filteredJson, cbuCol, montoCol, idCol, estadoCol, grupoCol, sheetName);
        return nextModal;
      });
      
      addToast(`Pestaña "${sheetName}" cargada correctamente`, "success");
    } catch (err) {
      console.error("Error al cambiar de hoja:", err);
      addToast("Error al cargar la hoja seleccionada", "error");
      setLoteModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handleColumnMappingChange = (type, val) => {
    setLoteModal(prev => {
      const nextModal = {
        ...prev,
        [type]: val
      };
      nextModal.processedRows = processExcelRows(
        nextModal.excelRows,
        nextModal.cbuCol,
        nextModal.montoCol,
        nextModal.idCol,
        nextModal.estadoCol,
        nextModal.grupoCol,
        nextModal.selectedSheet
      );
      return nextModal;
    });
  };

  const handleRowCheckChange = (rowId, val) => {
    setLoteModal(prev => ({
      ...prev,
      processedRows: prev.processedRows.map(r => r.id === rowId ? { ...r, checked: val } : r)
    }));
  };

  const handleRowLiquidationChange = (rowId, liqId) => {
    setLoteModal(prev => ({
      ...prev,
      processedRows: prev.processedRows.map(r => {
        if (r.id !== rowId) return r;
        
        let newSelectedLiqs = [];
        if (liqId === 'SALDAR_TODO') {
          newSelectedLiqs = r.pendingList.map(l => String(l.liquidacion_id));
        } else if (liqId) {
          newSelectedLiqs = [String(liqId)];
        }
        
        const defaultLines = (liqId && liqId !== 'SALDAR_TODO' && r.socioId)
          ? calculateDefaultLines(r.socioId, liqId, r.monto)
          : [];
        return {
          ...r,
          selectedLiquidationId: liqId,
          selectedLiquidations: newSelectedLiqs,
          selectedLines: defaultLines
        };
      })
    }));
  };

  const handleLoteRowToggleLiquidation = (rowId, liqId) => {
    setLoteModal(prev => ({
      ...prev,
      processedRows: prev.processedRows.map(r => {
        if (r.id !== rowId) return r;
        const currentList = r.selectedLiquidations || [];
        const isSelected = currentList.includes(String(liqId));
        let newList;
        if (isSelected) {
          newList = currentList.filter(id => id !== String(liqId));
        } else {
          newList = [...currentList, String(liqId)];
        }
        
        let nextSingleLiqId = '';
        if (newList.length === 1) {
          nextSingleLiqId = newList[0];
        } else if (newList.length > 1) {
          nextSingleLiqId = 'SALDAR_TODO';
        }
        
        const defaultLines = (newList.length === 1 && r.socioId)
          ? calculateDefaultLines(r.socioId, newList[0], r.monto)
          : [];
          
        return {
          ...r,
          selectedLiquidations: newList,
          selectedLiquidationId: nextSingleLiqId,
          selectedLines: defaultLines
        };
      })
    }));
  };

  const handleLoteRowToggleLineSelection = (rowId, lineNumber, isChecked) => {
    setLoteModal(prev => ({
      ...prev,
      processedRows: prev.processedRows.map(r => {
        if (r.id !== rowId) return r;
        let nextSelected = r.selectedLines ? [...r.selectedLines] : [];
        if (isChecked) {
          if (!nextSelected.includes(lineNumber)) {
            nextSelected.push(lineNumber);
          }
        } else {
          nextSelected = nextSelected.filter(ln => ln !== lineNumber);
        }
        return {
          ...r,
          selectedLines: nextSelected
        };
      })
    }));
  };

  const handleCheckAll = (val) => {
    setLoteModal(prev => ({
      ...prev,
      processedRows: prev.processedRows.map(r => {
        if (val) {
          return { ...r, checked: r.matchStatus === 'MATCH_DEBT' || r.matchStatus === 'MATCH_NO_DEBT' };
        } else {
          return { ...r, checked: false };
        }
      })
    }));
  };

  const saveLoteReconciliation = async () => {
    const checkedRows = loteModal.processedRows.filter(r => r.checked && r.socioId);
    if (checkedRows.length === 0) {
      addToast("No has seleccionado ninguna fila válida para conciliar", "warning");
      return;
    }
    
    const accepted = await confirm({
      title: "Confirmar Conciliación de Lote",
      message: `¿Estás seguro de registrar las conciliaciones para los ${checkedRows.length} socios seleccionados? Esto insertará los movimientos individuales en movimientos_bancarios y actualizará las facturas en liquidaciones_grupos.`,
      confirmText: "Confirmar Lote",
      cancelText: "Cancelar"
    });
    if (!accepted) return;
    
    setLoteModal(prev => ({ ...prev, loading: true }));
    
    try {
      const bankRow = loteModal.row;
      const bankDateISO = parseDateToISODate(bankRow.fecha);
      
      // 1. Prepare bulk movimientos_bancarios inserts
      const masterMov = {
        fecha_movimiento: bankDateISO,
        concepto: bankRow.concepto,
        monto: bankRow.netoReal,
        ingreso_bruto: bankRow.ingresoBruto,
        impuestos: bankRow.impuestos,
        banco: bankRow.banco,
        socio_id: null,
        liquidacion_id: null,
        tipo_movimiento: 'OTRO_INGRESO'
      };
      
      const indivMovs = [];
      const aggPayments = {}; // { liqId: amount }
      
      checkedRows.forEach(r => {
        if (r.selectedLiquidations && r.selectedLiquidations.length > 1) {
          // Distribute payment across all selected liquidations
          let remaining = r.monto;
          
          const listToPay = r.pendingList.filter(liq => r.selectedLiquidations.includes(String(liq.liquidacion_id)));
          listToPay.forEach((liq, lIdx) => {
            const pendingAmount = Math.max(0, Math.round((Number(liq.monto_total_facturado) - Number(liq.monto_abonado || 0)) * 100) / 100);
            
            // If it is the last liquidation, absorb any leftover
            const isLast = lIdx === listToPay.length - 1;
            let paymentForThis = 0;
            
            if (isLast) {
              paymentForThis = remaining;
            } else {
              paymentForThis = Math.min(remaining, pendingAmount);
            }
            
            paymentForThis = Math.round(paymentForThis * 100) / 100;
            remaining = Math.round((remaining - paymentForThis) * 100) / 100;
            
            if (paymentForThis > 0) {
              indivMovs.push({
                fecha_movimiento: bankDateISO,
                concepto: `Recaudación Débito CBU (Grupo) - ${r.socioNombreCompleto} (${liq.proveedores?.nombre || 'S/P'})`,
                monto: paymentForThis,
                ingreso_bruto: paymentForThis,
                impuestos: 0,
                banco: bankRow.banco,
                socio_id: parseInt(r.socioId, 10),
                liquidacion_id: parseInt(liq.liquidacion_id, 10),
                tipo_movimiento: 'TRANSFERENCIA_RECIBIDA'
              });
              
              const liqId = parseInt(liq.liquidacion_id, 10);
              if (!aggPayments[liqId]) aggPayments[liqId] = 0;
              aggPayments[liqId] += paymentForThis;
            }
          });
        } else {
          // Normal case: single liquidation
          let finalConcept = `Recaudación Débito CBU - ${r.socioNombreCompleto}`;
          if (r.selectedLines && r.selectedLines.length > 0) {
            finalConcept = `${finalConcept} | Líneas: ${r.selectedLines.join(', ')}`;
          }

          const singleLiqId = r.selectedLiquidations && r.selectedLiquidations.length === 1
            ? r.selectedLiquidations[0]
            : (r.selectedLiquidationId ? r.selectedLiquidationId : null);

          indivMovs.push({
            fecha_movimiento: bankDateISO,
            concepto: finalConcept,
            monto: r.monto,
            ingreso_bruto: r.monto,
            impuestos: 0,
            banco: bankRow.banco,
            socio_id: parseInt(r.socioId, 10),
            liquidacion_id: singleLiqId ? parseInt(singleLiqId, 10) : null,
            tipo_movimiento: 'TRANSFERENCIA_RECIBIDA'
          });
          
          if (singleLiqId) {
            const liqId = parseInt(singleLiqId, 10);
            if (!aggPayments[liqId]) aggPayments[liqId] = 0;
            aggPayments[liqId] += r.monto;
          }
        }
      });
      
      const allMovs = [masterMov, ...indivMovs];
      
      // ═══ PREVENCIÓN DE DUPLICADOS ═══
      // Verificar si ya existen movimientos idénticos en la DB antes de insertar
      const { data: existingLoteMovs } = await supabase
        .from('movimientos_bancarios')
        .select('movimiento_id, concepto, monto, fecha_movimiento, banco')
        .eq('fecha_movimiento', bankDateISO)
        .eq('banco', bankRow.banco);
      
      const normalize = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
      
      const filteredMovs = allMovs.filter(newMov => {
        if (!existingLoteMovs || existingLoteMovs.length === 0) return true;
        const isDuplicate = existingLoteMovs.some(dbMov => {
          if (Math.abs(Number(dbMov.monto) - Number(newMov.monto)) >= 0.02) return false;
          const dbConc = normalize(dbMov.concepto);
          const newConc = normalize(newMov.concepto);
          return dbConc === newConc || dbConc.includes(newConc) || newConc.includes(dbConc);
        });
        return !isDuplicate;
      });
      
      if (filteredMovs.length === 0) {
        addToast("Todos los movimientos de este lote ya fueron conciliados anteriormente. No se insertaron duplicados.", "warning");
        setParsedMovements(prev => prev.map(m => m.id === bankRow.id ? { ...m, estado: 'CONCILIADO', isDbDuplicate: true } : m));
        setLoteModal(prev => ({ ...prev, loading: false }));
        return;
      }
      
      const skippedCount = allMovs.length - filteredMovs.length;
      if (skippedCount > 0) {
        console.warn(`Prevención de duplicados: Se omitieron ${skippedCount} movimientos que ya existían en la DB.`);
        // Recalcular aggPayments con solo los movimientos que se insertarán
        Object.keys(aggPayments).forEach(liqId => { aggPayments[liqId] = 0; });
        filteredMovs.forEach(mov => {
          if (mov.liquidacion_id && mov.tipo_movimiento !== 'OTRO_INGRESO') {
            if (!aggPayments[mov.liquidacion_id]) aggPayments[mov.liquidacion_id] = 0;
            aggPayments[mov.liquidacion_id] += Number(mov.monto);
          }
        });
      }
      // ═══ FIN PREVENCIÓN DE DUPLICADOS ═══
      
      const { data: insertedMovs, error: insertMovsError } = await supabase
        .from('movimientos_bancarios')
        .insert(filteredMovs)
        .select();
        
      if (insertMovsError) throw insertMovsError;
      
      // 2. Aggregate and update liquidaciones_grupos
      const liqIds = Object.keys(aggPayments);
      for (const liqIdStr of liqIds) {
        const liqId = parseInt(liqIdStr, 10);
        const extraPaid = aggPayments[liqId];
        
        let liqObj = pendingLiquidaciones.find(l => l.liquidacion_id === liqId);
        if (!liqObj) {
          const { data: dbLiq, error: fetchLiqErr } = await supabase
            .from('liquidaciones_grupos')
            .select('monto_abonado, monto_total_facturado, numero_grupo')
            .eq('liquidacion_id', liqId)
            .single();
          if (fetchLiqErr) throw fetchLiqErr;
          liqObj = dbLiq;
        }
        
        if (liqObj) {
          const newMontoAbonado = Math.round((Number(liqObj.monto_abonado || 0) + extraPaid) * 100) / 100;
          const isFullyPaid = newMontoAbonado >= Number(liqObj.monto_total_facturado) - 2.00;
          
          const { error: updateLiqError } = await supabase
            .from('liquidaciones_grupos')
            .update({
              monto_abonado: newMontoAbonado,
              estado_pago: isFullyPaid ? 'ABONADO' : (newMontoAbonado > 0 ? 'PARCIAL' : 'PENDIENTE'),
              updated_at: new Date().toISOString()
            })
            .eq('liquidacion_id', liqId);
            
          if (updateLiqError) throw updateLiqError;
        }
      }
      
      // 3. Insert audit log
      const { error: auditError } = await supabase
        .from('audit_log')
        .insert({
          tipo_evento: 'CONCILIACION_LOTE_CBU',
          descripcion: `Conciliación exitosa de Lote CBU: Banco ${bankRow.banco} - Concepto: "${bankRow.concepto}" - Total Lote: $${bankRow.netoReal} - Integrantes Conciliados: ${checkedRows.length} (incluyendo deudas grupales completas)`,
          monto: bankRow.netoReal,
          usuario: 'dante@admin.com'
        });
      if (auditError) console.error("Error writing audit log:", auditError);
      
      // 4. Update local state
      setParsedMovements(prev => prev.map(m => m.id === bankRow.id ? { ...m, estado: 'CONCILIADO', selectedSocioLabel: 'Lote Débito Directo' } : m));
      
      // Actualizar datos de fondo sin bloquear la UI
      fetchMasterData();
      if (selectedPeriod) {
        fetchPeriodSummary(selectedPeriod);
      }
      
      addToast(`Lote conciliado con éxito. Se registraron ${checkedRows.length} pagos individuales.`, "success");
      
      workbookRef.current = null;
      setLoteModal({
        isOpen: false,
        row: null,
        excelRows: [],
        processedRows: [],
        columns: [],
        cbuCol: '',
        montoCol: '',
        idCol: '',
        estadoCol: '',
        grupoCol: '',
        sheets: [],
        selectedSheet: '',
        loading: false,
        fileName: ''
      });
      
      // Redirect to Nueva Conciliación tab
      setActiveTab('nueva');
      
    } catch (err) {
      console.error("Error al conciliar lote:", err);
      if (err.code === '23505') {
        addToast("Alguno de los movimientos de este lote ya fue conciliado anteriormente (detectado por la base de datos)", "warning");
        setParsedMovements(prev => prev.map(m => m.id === bankRow.id ? { ...m, estado: 'CONCILIADO', isDbDuplicate: true } : m));
      } else {
        addToast(`Error al conciliar lote: ${err.message}`, "error");
      }
    } finally {
      setLoteModal(prev => ({ ...prev, loading: false }));
    }
  };

  const conciliarFila = async (rowId, isSilent = false, customLines = null) => {
    const row = parsedMovements.find(m => m.id === rowId);
    if (!row || row.estado === 'CONCILIADO') return;

    try {
      setParsedMovements(prev => prev.map(m => m.id === rowId ? { ...m, estado: 'PROCESANDO' } : m));

      // EVITAR DUPLICADOS DE COBRO: Verificar si la liquidación seleccionada YA está saldada
      let isSelectedLiqAlreadyPaid = false;
      if (row.selectedLiquidations && row.selectedLiquidations.length > 0) {
        const allSelectedPaid = row.selectedLiquidations.every(liqId => {
          const liq = row.pendingList?.find(l => String(l.liquidacion_id) === String(liqId));
          if (!liq) return false;
          const pending = Number(liq.monto_total_facturado || 0) - Number(liq.monto_abonado || 0);
          return pending <= 2.00;
        });
        if (allSelectedPaid) isSelectedLiqAlreadyPaid = true;
      } else if (row.selectedLiquidationId && row.selectedLiquidationId !== 'SALDAR_TODO') {
        const liq = row.pendingList?.find(l => String(l.liquidacion_id) === String(row.selectedLiquidationId));
        if (liq) {
          const pending = Number(liq.monto_total_facturado || 0) - Number(liq.monto_abonado || 0);
          if (pending <= 2.00) isSelectedLiqAlreadyPaid = true;
        }
      }

      if (isSelectedLiqAlreadyPaid) {
        if (!isSilent) addToast("La liquidación seleccionada ya está saldada. No se generará un nuevo pago.", "warning");
        setParsedMovements(prev => prev.map(m => m.id === rowId ? { 
          ...m, estado: 'CONCILIADO', isAlreadyPaidMatch: true 
        } : m));
        return;
      }

      const bankDateISO = parseDateToISODate(row.fecha);
      let insertedId = null;

      // Prevención de duplicados: verificar si ya existe un movimiento idéntico en la DB
      {
        const { data: existingCheck } = await supabase
          .from('movimientos_bancarios')
          .select('movimiento_id, concepto')
          .eq('fecha_movimiento', bankDateISO)
          .eq('banco', row.banco)
          .gte('monto', (Math.abs(row.netoReal) - 0.02).toString())
          .lte('monto', (Math.abs(row.netoReal) + 0.02).toString());
        
        if (existingCheck && existingCheck.length > 0) {
          const normalize = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
          const rowConc = normalize(row.concepto);
          const isDup = existingCheck.some(dbMov => {
            const dbConc = normalize(dbMov.concepto);
            return dbConc === rowConc || dbConc.includes(rowConc) || rowConc.includes(dbConc);
          });
          if (isDup) {
            if (!isSilent) addToast("Este movimiento ya fue conciliado anteriormente", "warning");
            setParsedMovements(prev => prev.map(m => m.id === rowId ? { 
              ...m, estado: 'CONCILIADO', isDbDuplicate: true 
            } : m));
            return;
          }
        }
      }

      if (row.selectedLiquidations && row.selectedLiquidations.length > 1) {
        // 1. Distribute payment amount (row.netoReal) across all selected liquidations
        let remaining = row.netoReal;
        const indivMovs = [];
        const aggPayments = {};
        
        const listToPay = row.pendingList.filter(liq => row.selectedLiquidations.includes(String(liq.liquidacion_id)));
        
        listToPay.forEach((liq, lIdx) => {
          const pendingAmount = Math.max(0, Math.round((Number(liq.monto_total_facturado) - Number(liq.monto_abonado || 0)) * 100) / 100);
          const isLast = lIdx === listToPay.length - 1;
          let paymentForThis = 0;
          
          if (isLast) {
            paymentForThis = remaining;
          } else {
            paymentForThis = Math.min(remaining, pendingAmount);
          }
          
          paymentForThis = Math.round(paymentForThis * 100) / 100;
          remaining = Math.round((remaining - paymentForThis) * 100) / 100;
          
          if (paymentForThis > 0) {
            indivMovs.push({
              fecha_movimiento: bankDateISO,
              concepto: `Recaudación Banco (Grupo) - ${row.concepto} (${liq.proveedores?.nombre || 'S/P'})`,
              monto: paymentForThis,
              ingreso_bruto: paymentForThis,
              impuestos: 0,
              banco: row.banco,
              socio_id: row.selectedSocioId ? parseInt(row.selectedSocioId, 10) : null,
              liquidacion_id: parseInt(liq.liquidacion_id, 10),
              tipo_movimiento: 'TRANSFERENCIA_RECIBIDA'
            });
            
            const liqId = parseInt(liq.liquidacion_id, 10);
            aggPayments[liqId] = paymentForThis;
          }
        });

        // Insert master record with original monto/concepto for future duplicate detection
        const masterRecord = {
          fecha_movimiento: bankDateISO,
          concepto: row.concepto,
          monto: row.netoReal,
          ingreso_bruto: row.ingresoBruto || row.netoReal,
          impuestos: row.impuestos || 0,
          banco: row.banco,
          socio_id: row.selectedSocioId ? parseInt(row.selectedSocioId, 10) : null,
          liquidacion_id: null,
          tipo_movimiento: 'CONCILIACION_GRUPO_MASTER'
        };

        // Insert master + individual splits together
        const { data: insertedMovs, error: insertMovsError } = await supabase
          .from('movimientos_bancarios')
          .insert([masterRecord, ...indivMovs])
          .select();
        if (insertMovsError) throw insertMovsError;
        if (insertedMovs && insertedMovs.length > 0) {
          insertedId = insertedMovs[0].movimiento_id;
        }

        // Update liquidaciones_grupos
        for (const liqIdStr of Object.keys(aggPayments)) {
          const liqId = parseInt(liqIdStr, 10);
          const extraPaid = aggPayments[liqId];
          const liqObj = row.pendingList.find(l => l.liquidacion_id === liqId);
          
          if (liqObj) {
            const newMontoAbonado = Math.round((Number(liqObj.monto_abonado || 0) + extraPaid) * 100) / 100;
            const isFullyPaid = newMontoAbonado >= Number(liqObj.monto_total_facturado) - 2.00;
            
            const { error: liqError } = await supabase
              .from('liquidaciones_grupos')
              .update({
                monto_abonado: newMontoAbonado,
                estado_pago: isFullyPaid ? 'ABONADO' : (newMontoAbonado > 0 ? 'PARCIAL' : 'PENDIENTE'),
                updated_at: new Date().toISOString()
              })
              .eq('liquidacion_id', liqId);
            if (liqError) throw liqError;
          }
        }

        // Write audit log
        await supabase
          .from('audit_log')
          .insert({
            tipo_evento: 'CONCILIACION_PAGO_GRUPO',
            descripcion: `Conciliación exitosa de pago de grupo: Banco ${row.banco} - Concepto: "${row.concepto}" - Socio ID: ${row.selectedSocioId} - Total: $${row.netoReal} - Repartido en ${indivMovs.length} liquidaciones`,
            monto: row.netoReal,
            usuario: 'dante@admin.com'
          });
      } else {
        // Normal case: single liquidation
        let finalConcept = row.concepto;
        if (customLines && customLines.length > 0) {
          finalConcept = `${row.concepto} | Líneas: ${customLines.join(', ')}`;
        }

        const singleLiqId = row.selectedLiquidations && row.selectedLiquidations.length === 1 
          ? row.selectedLiquidations[0] 
          : (row.selectedLiquidationId ? row.selectedLiquidationId : null);

        const { data: movData, error: movError } = await supabase
          .from('movimientos_bancarios')
          .insert({
            fecha_movimiento: bankDateISO,
            concepto: finalConcept,
            monto: row.netoReal,
            ingreso_bruto: row.ingresoBruto,
            impuestos: row.impuestos,
            banco: row.banco,
            socio_id: row.selectedSocioId ? parseInt(row.selectedSocioId, 10) : null,
            liquidacion_id: singleLiqId ? parseInt(singleLiqId, 10) : null,
            tipo_movimiento: row.tipo_movimiento
          })
          .select();

        if (movError) throw movError;
        if (movData && movData.length > 0) {
          insertedId = movData[0].movimiento_id;
        }

        let groupNum = null;

        // If vinculated to bill, update liquidaciones_grupos
        if (singleLiqId) {
          const liqObj = row.pendingList.find(l => String(l.liquidacion_id) === String(singleLiqId));
          if (liqObj) {
            groupNum = liqObj.numero_grupo;
            const newMontoAbonado = Math.round((Number(liqObj.monto_abonado || 0) + Number(row.netoReal)) * 100) / 100;
            const isFullyPaid = newMontoAbonado >= Number(liqObj.monto_total_facturado) - 2.00;

            const { error: liqError } = await supabase
              .from('liquidaciones_grupos')
              .update({
                monto_abonado: newMontoAbonado,
                estado_pago: isFullyPaid ? 'ABONADO' : (newMontoAbonado > 0 ? 'PARCIAL' : 'PENDIENTE'),
                updated_at: new Date().toISOString()
              })
              .eq('liquidacion_id', parseInt(singleLiqId, 10));

            if (liqError) throw liqError;
          }
        }

        // Write audit log
        await supabase
          .from('audit_log')
          .insert({
            tipo_evento: 'CONCILIACION_MANUAL',
            descripcion: `Conciliación exitosa: Banco ${row.banco} - Concepto: "${finalConcept}" - Socio ID: ${row.selectedSocioId} - Liquidación: ${singleLiqId || 'N/A'} - Total: $${row.netoReal}`,
            monto: row.netoReal,
            usuario: 'dante@admin.com'
          });
      }

      // Auto-save CBU to socio if available
      try {
        const cbuMatch = row.cbu || row.concepto?.match(/\b\d{22}\b/)?.[0];
        if (cbuMatch && row.selectedSocioId) {
          const socioIdInt = parseInt(row.selectedSocioId, 10);
          const { data: socioData, error: fetchSocioError } = await supabase
            .from('socios')
            .select('cbu')
            .eq('socio_id', socioIdInt)
            .maybeSingle();

          if (!fetchSocioError && socioData && socioData.cbu !== cbuMatch) {
            await supabase
              .from('socios')
              .update({ cbu: cbuMatch })
              .eq('socio_id', socioIdInt);
            console.log(`CBU ${cbuMatch} guardada automáticamente para socio ID ${socioIdInt}`);
          }
        }
      } catch (cbuErr) {
        console.error("Error al guardar CBU automáticamente:", cbuErr);
      }

      // Actualizar el estado visual INMEDIATAMENTE para evitar demoras/parpadeos en la tabla
      setParsedMovements(prev => prev.map(m => m.id === rowId ? { 
        ...m, 
        estado: 'CONCILIADO', 
        reconciledInSession: true,
        movimiento_id: insertedId
      } : m));

      // Refrescar DB asíncronamente solo si no es un proceso masivo
      if (!isSilent) {
        fetchMasterData();
        if (selectedPeriod) {
          fetchPeriodSummary(selectedPeriod);
        }
        addToast("Movimiento conciliado con éxito", "success");
      }
    } catch (err) {
      console.error(err);
      if (err.code === '23505') {
        if (!isSilent) addToast("Este movimiento ya fue conciliado anteriormente (detectado por la base de datos)", "warning");
        setParsedMovements(prev => prev.map(m => m.id === rowId ? { ...m, estado: 'CONCILIADO', isDbDuplicate: true } : m));
      } else {
        setParsedMovements(prev => prev.map(m => m.id === rowId ? { ...m, estado: 'ERROR', errorMsg: err.message } : m));
        if (!isSilent) addToast("Error al conciliar la fila", "error");
      }
    }
  };

  const checkIsAmountMatch = (m, allConsumos = periodConsumos) => {
    const isTaxOrFee = ['IMPUESTO', 'COMISION', 'SUSCRIPCION', 'PAGO_VEP', 'PAGO_SERVICIO', 'PAGO_ARCA', 'TRANSFERENCIA_ENVIADA'].includes(m.tipo_movimiento);
    if (isTaxOrFee) return false;
    if (!m.selectedSocioId) return false;

    const liqs = m.selectedLiquidations && m.selectedLiquidations.length > 0
      ? m.selectedLiquidations
      : (m.selectedLiquidationId && m.selectedLiquidationId !== 'SALDAR_TODO' ? [m.selectedLiquidationId] : []);

    if (m.selectedLiquidationId === 'SALDAR_TODO') return true;
    if (liqs.length === 0) return false;

    if (liqs.length === 1) {
      const singleLiqId = liqs[0];
      const selectedLiq = m.pendingList?.find(l => String(l.liquidacion_id) === String(singleLiqId));
      if (!selectedLiq) return false;

      if (m.selectedLines && m.selectedLines.length > 0) {
        const selectedSum = m.selectedLines.reduce((sum, lineNum) => {
          const line = allConsumos.find(c => 
            c.numero_linea === lineNum && 
            c.lineas?.numero_grupo === parseInt(selectedLiq.numero_grupo, 10) &&
            c.proveedor_id === selectedLiq.proveedor_id
          );
          return sum + (line ? Number(line.total_linea) : 0);
        }, 0);
        return Math.abs(selectedSum - Math.abs(m.netoReal)) < 0.05;
      } else {
        if (m.isAlreadyPaidMatch) return true;
        const pendingAmount = Number(selectedLiq.monto_total_facturado || 0) - Number(selectedLiq.monto_abonado || 0);
        return Math.abs(pendingAmount - Math.abs(m.netoReal)) < 2.00;
      }
    } else {
      if (m.isAlreadyPaidMatch) return true;
      const sumPending = (m.pendingList || [])
        .filter(l => liqs.includes(String(l.liquidacion_id)))
        .reduce((sum, l) => sum + (Number(l.monto_total_facturado || 0) - Number(l.monto_abonado || 0)), 0);
      return Math.abs(sumPending - Math.abs(m.netoReal)) < 2.00;
    }
  };

  const handleConciliarTodos = async () => {
    const readyRows = parsedMovements.filter(m => 
      m.estado === 'PENDIENTE' && 
      checkIsAmountMatch(m, periodConsumos)
    );
    if (readyRows.length === 0) {
      addToast("No hay filas listas para conciliar (que tengan socio asignado o sean gastos bancarios/impuestos/servicios/transferencias enviadas)", "warning");
      return;
    }

    const accepted = await confirm({
      title: "Conciliación Masiva",
      message: `¿Desea conciliar de forma masiva los ${readyRows.length} movimientos seleccionados? (Incluye transferencias con socios asignados y gastos internos)`,
      confirmText: "Conciliar Todo",
      cancelText: "Cancelar"
    });

    if (!accepted) return;

    let successCount = 0;
    for (const r of readyRows) {
      try {
        await conciliarFila(r.id, true, r.selectedLines);
        successCount++;
      } catch (err) {
        console.error("Error en conciliación masiva para fila:", r.id, err);
      }
    }

    // Refrescar DB asíncronamente al final para no trabar la UI entre filas
    fetchMasterData();
    if (selectedPeriod) {
      fetchPeriodSummary(selectedPeriod);
    }

    addToast(`Conciliación masiva completa. Se conciliaron ${successCount} filas.`, 'success');
  };

  const openEditConciliacionModal = async (mov) => {
    if (!mov) return;

    // Normalize to database-like structure
    const normalizedMov = {
      movimiento_id: mov.movimiento_id,
      socio_id: mov.socio_id !== undefined ? mov.socio_id : (mov.selectedSocioId || null),
      liquidacion_id: mov.liquidacion_id !== undefined 
        ? mov.liquidacion_id 
        : (mov.selectedLiquidationId && mov.selectedLiquidationId !== 'SALDAR_TODO' ? parseInt(mov.selectedLiquidationId, 10) : null),
      monto: mov.monto !== undefined ? mov.monto : mov.netoReal,
      concepto: mov.concepto,
      banco: mov.banco,
      tipo_movimiento: mov.tipo_movimiento,
      fecha_movimiento: mov.fecha_movimiento !== undefined ? mov.fecha_movimiento : parseDateToISODate(mov.fecha)
    };

    const sId = normalizedMov.socio_id || '';
    let sLabel = '';
    if (sId) {
      const s = socios.find(soc => soc.socio_id === sId);
      if (s) {
        sLabel = `${s.nombre_completo} (Socio ${s.nro_socio || ''})`;
      }
    }

    let pList = [];
    if (sId) {
      const targetSocio = socios.find(soc => soc.socio_id === sId);
      const socioGroups = targetSocio ? (targetSocio.grupo_socio?.map(g => g.numero_grupo) || []) : [];
      
      try {
        const { data: liqData, error: liqError } = await supabase
          .from('liquidaciones_grupos')
          .select('*, proveedores:proveedor_id(nombre)')
          .in('numero_grupo', socioGroups);
        if (liqError) throw liqError;
        
        const bankPeriod = getBankPeriod(normalizedMov.concepto, normalizedMov.fecha_movimiento);
        pList = (liqData || []).filter(l => 
          (l.estado_pago === 'PENDIENTE' || l.estado_pago === 'PARCIAL' || l.liquidacion_id === normalizedMov.liquidacion_id) &&
          (!bankPeriod || l.periodo <= bankPeriod)
        );
      } catch (err) {
        console.error("Error fetching group liquidations for edit:", err);
      }
    }

    setEditConciliacionModal({
      isOpen: true,
      movement: normalizedMov,
      selectedSocioId: sId,
      selectedSocioLabel: sLabel,
      pendingList: pList,
      selectedLiquidationId: normalizedMov.liquidacion_id ? String(normalizedMov.liquidacion_id) : '',
      saving: false
    });
  };

  const handleEditSocioChange = async (val) => {
    const searchVal = val.split(' - Gpo')[0].trim();
    const matchedSocio = socios.find(s => {
      const label = `${s.nombre_completo} (Socio ${s.nro_socio || ''})`;
      return label.toLowerCase() === searchVal.toLowerCase() || s.nombre_completo.toLowerCase() === searchVal.toLowerCase();
    });

    const sId = matchedSocio ? matchedSocio.socio_id : '';
    let pList = [];

    if (sId) {
      const socioGroups = matchedSocio ? (matchedSocio.grupo_socio?.map(g => g.numero_grupo) || []) : [];
      try {
        const { data: liqData, error: liqError } = await supabase
          .from('liquidaciones_grupos')
          .select('*, proveedores:proveedor_id(nombre)')
          .in('numero_grupo', socioGroups);
        if (liqError) throw liqError;
        
        const bankPeriod = getBankPeriod(editConciliacionModal.movement?.concepto, editConciliacionModal.movement?.fecha_movimiento);
        pList = (liqData || []).filter(l => 
          (l.estado_pago === 'PENDIENTE' || l.estado_pago === 'PARCIAL' || l.liquidacion_id === editConciliacionModal.movement?.liquidacion_id) &&
          (!bankPeriod || l.periodo <= bankPeriod)
        );
      } catch (err) {
        console.error("Error fetching group liquidations for edit socio change:", err);
      }
    }

    setEditConciliacionModal(prev => ({
      ...prev,
      selectedSocioId: sId,
      selectedSocioLabel: val,
      pendingList: pList,
      selectedLiquidationId: ''
    }));
  };

  const handleSaveEditConciliacion = async () => {
    const { movement, selectedSocioId, selectedLiquidationId } = editConciliacionModal;
    if (!movement) return;

    setEditConciliacionModal(prev => ({ ...prev, saving: true }));

    try {
      const oldLiqId = movement.liquidacion_id;
      const newLiqId = selectedLiquidationId ? parseInt(selectedLiquidationId, 10) : null;
      const amount = Number(movement.monto);

      // 1. Deduct old
      if (oldLiqId && oldLiqId !== newLiqId) {
        const { data: oldLiq, error: getOldError } = await supabase
          .from('liquidaciones_grupos')
          .select('monto_abonado, monto_total_facturado')
          .eq('liquidacion_id', oldLiqId)
          .single();
        if (getOldError) throw getOldError;

        const newOldAbonado = Math.max(0, Math.round((Number(oldLiq.monto_abonado || 0) - amount) * 100) / 100);
        const isFullyPaidOld = newOldAbonado >= Number(oldLiq.monto_total_facturado) - 2.00;

        const { error: updateOldError } = await supabase
          .from('liquidaciones_grupos')
          .update({
            monto_abonado: newOldAbonado,
            estado_pago: isFullyPaidOld ? 'ABONADO' : (newOldAbonado > 0 ? 'PARCIAL' : 'PENDIENTE')
          })
          .eq('liquidacion_id', oldLiqId);
        if (updateOldError) throw updateOldError;
      }

      // 2. Add new
      if (newLiqId && oldLiqId !== newLiqId) {
        const { data: newLiq, error: getNewError } = await supabase
          .from('liquidaciones_grupos')
          .select('monto_abonado, monto_total_facturado')
          .eq('liquidacion_id', newLiqId)
          .single();
        if (getNewError) throw getNewError;

        const newNewAbonado = Math.round((Number(newLiq.monto_abonado || 0) + amount) * 100) / 100;
        const isFullyPaidNew = newNewAbonado >= Number(newLiq.monto_total_facturado) - 2.00;

        const { error: updateNewError } = await supabase
          .from('liquidaciones_grupos')
          .update({
            monto_abonado: newNewAbonado,
            estado_pago: isFullyPaidNew ? 'ABONADO' : (newNewAbonado > 0 ? 'PARCIAL' : 'PENDIENTE')
          })
          .eq('liquidacion_id', newLiqId);
        if (updateNewError) throw updateNewError;
      }

      // 3. Update movement
      const { error: moveError } = await supabase
        .from('movimientos_bancarios')
        .update({
          socio_id: selectedSocioId ? parseInt(selectedSocioId, 10) : null,
          liquidacion_id: newLiqId
        })
        .eq('movimiento_id', movement.movimiento_id);
      if (moveError) throw moveError;

      // 4. Audit
      await supabase
        .from('audit_log')
        .insert({
          tipo_evento: 'EDICION_CONCILIACION',
          descripcion: `Edición de conciliación manual: Movimiento ID ${movement.movimiento_id} (${movement.banco}, ${movement.concepto}, Monto: $${amount}). Socio: ${movement.socio_id} -> ${selectedSocioId || 'N/A'}. Liquidación ID: ${oldLiqId || 'N/A'} -> ${newLiqId || 'N/A'}.`,
          monto: amount,
          usuario: 'dante@admin.com'
        });

      addToast("Conciliación editada y saldos actualizados con éxito", "success");
      setEditConciliacionModal(prev => ({ ...prev, isOpen: false }));

      // 5. Update parsedMovements state in memory if it exists in draft workspace
      setParsedMovements(prev => prev.map(m => {
        if (m.movimiento_id === movement.movimiento_id) {
          const matchedSocio = socios.find(s => s.socio_id === (selectedSocioId ? parseInt(selectedSocioId, 10) : null));
          const sLabel = matchedSocio ? `${matchedSocio.nombre_completo} (Socio ${matchedSocio.nro_socio || ''})` : '';
          return {
            ...m,
            selectedSocioId: selectedSocioId ? parseInt(selectedSocioId, 10) : '',
            selectedSocioLabel: sLabel,
            selectedLiquidationId: selectedLiquidationId ? String(selectedLiquidationId) : '',
            estado: 'CONCILIADO'
          };
        }
        return m;
      }));

      await fetchMasterData();
      await fetchHistorial();
      if (selectedPeriod) {
        await fetchPeriodSummary(selectedPeriod);
      }
    } catch (err) {
      console.error(err);
      addToast(`Error al guardar edición: ${err.message}`, "error");
    } finally {
      setEditConciliacionModal(prev => ({ ...prev, saving: false }));
    }
  };

  const deshacerMatchLocal = (rowId) => {
    setParsedMovements(prev => prev.map(m => {
      if (m.id === rowId) {
        return { ...m, estado: 'PENDIENTE' };
      }
      return m;
    }));
  };

  const handleDeshacerConciliacion = async (movement) => {
    const accepted = await confirm({
      title: "Deshacer Conciliación",
      message: `¿Estás seguro de deshacer la conciliación del movimiento por $${movement.monto}? Se restablecerá la deuda original y se eliminará el registro de pago.`,
      isDanger: true,
      confirmText: "Deshacer Pago",
      cancelText: "Cancelar"
    });

    if (!accepted) return;

    try {
      setLoadingHistorial(true);
      
      // 1. Si tenía liquidación asociada, restar del monto abonado y volver a PENDIENTE
      if (movement.liquidacion_id) {
        const { data: liqData, error: liqFetchError } = await supabase
          .from('liquidaciones_grupos')
          .select('monto_abonado, monto_total_facturado, numero_grupo')
          .eq('liquidacion_id', movement.liquidacion_id)
          .single();

        if (liqFetchError) throw liqFetchError;

        if (liqData) {
          const newMontoAbonado = Math.max(0, Math.round((Number(liqData.monto_abonado || 0) - Number(movement.monto)) * 100) / 100);
          
          const { error: liqUpdError } = await supabase
            .from('liquidaciones_grupos')
            .update({
              monto_abonado: newMontoAbonado,
              estado_pago: 'PENDIENTE',
              updated_at: new Date().toISOString()
            })
            .eq('liquidacion_id', movement.liquidacion_id);

          if (liqUpdError) throw liqUpdError;

          // 2. Registrar la reversión en audit_log
          await supabase
            .from('audit_log')
            .insert({
              tipo_evento: 'REVERSION_CONCILIACION',
              descripcion: `REVERTIDO: Se eliminó movimiento bancario ID ${movement.movimiento_id} de Banco ${movement.banco} por $${movement.monto} y se restableció factura ID ${movement.liquidacion_id} a PENDIENTE.`,
              monto: movement.monto,
              numero_grupo: liqData.numero_grupo,
              usuario: 'dante@admin.com'
            });
        }
      } else {
        // Registrar reversión simple sin liquidación
        await supabase
          .from('audit_log')
          .insert({
            tipo_evento: 'REVERSION_CONCILIACION',
            descripcion: `REVERTIDO: Se eliminó movimiento bancario ID ${movement.movimiento_id} de Banco ${movement.banco} por $${movement.monto} sin factura vinculada.`,
            monto: movement.monto,
            usuario: 'dante@admin.com'
          });
      }

      // 3. Eliminar el movimiento bancario
      const { error: delError } = await supabase
        .from('movimientos_bancarios')
        .delete()
        .eq('movimiento_id', movement.movimiento_id);

      if (delError) throw delError;

      addToast("Conciliación deshecha con éxito", "success");
      
      // Recargar datos maestros e historial para que refleje los cambios
      fetchMasterData();
      fetchHistorial();
      if (selectedPeriod) {
        fetchPeriodSummary(selectedPeriod);
      }
    } catch (err) {
      console.error(err);
      addToast(`Error al deshacer: ${err.message}`, "error");
    } finally {
      setLoadingHistorial(false);
    }
  };

  const handleProcesar = async (textToProcess, bankOption) => {
    if (!textToProcess) {
      addToast("Por favor pega texto del banco primero", "warning");
      return;
    }
    setLoading(true);
    try {
      const datosProcesados = parsearMovimientos(textToProcess);
      
      // Diagnóstico de Parser
      {
        let _ing = 0, _egr = 0, _cI = 0, _cE = 0;
        datosProcesados.forEach(m => {
          if (m.netoReal > 0) { _ing += m.netoReal; _cI++; }
          else { _egr += m.netoReal; _cE++; }
        });
        console.log('%c[PARSER v3] Diagnóstico de Conciliación', 'color: #10b981; font-weight: bold; font-size: 14px');
        console.log(`  Movimientos: ${datosProcesados.length} (${_cI} ingresos + ${_cE} egresos)`);
        console.log(`  Ingresos: +$${_ing.toFixed(2)}`);
        console.log(`  Egresos: -$${Math.abs(_egr).toFixed(2)}`);
        console.log(`  Saldo Anterior: $${datosProcesados.saldoAnterior || 0}`);
        console.log(`  Saldo Final Extraído: $${datosProcesados.saldoFinalExtraido || 'N/A'}`);
        console.log(`  Saldo Calculado: $${((datosProcesados.saldoAnterior || 0) + _ing + _egr).toFixed(2)}`);
      }

      if (datosProcesados.length === 0) {
        addToast("No se encontraron movimientos para procesar", "warning");
        setLoading(false);
        return;
      }

      // Obtener rango de fechas para consultar a Supabase
      const dates = datosProcesados.map(m => parseDateToISODate(m.fecha)).filter(Boolean);
      let existingMovs = [];
      if (dates.length > 0) {
        const minDate = dates.reduce((a, b) => a < b ? a : b);
        const maxDate = dates.reduce((a, b) => a > b ? a : b);
        
        const { data: dbData, error: dbError } = await supabase
          .from('movimientos_bancarios')
          .select(`
            movimiento_id,
            fecha_movimiento,
            concepto,
            monto,
            banco,
            socio_id,
            liquidacion_id,
            tipo_movimiento,
            liquidaciones_grupos(periodo, numero_grupo, monto_total_facturado)
          `)
          .gte('fecha_movimiento', minDate)
          .lte('fecha_movimiento', maxDate);
        
        if (dbError) {
          console.error("Error al consultar movimientos existentes:", dbError);
        } else {
          existingMovs = dbData || [];
        }
      }

      const existingMovsPool = [...existingMovs];

      // Fetch consumos of the current selected period (with joined line/socio details)
      let consumosList = [];
      if (selectedPeriod) {
        const { data: cData, error: cError } = await supabase
          .from('consumos_mensuales')
          .select(`
            total_linea,
            numero_linea,
            periodo,
            proveedor_id,
            lineas!inner (
              socio_id,
              numero_grupo,
              socios:socios!lineas_socio_id_fkey (
                nombre_completo,
                nro_socio
              )
            )
          `)
          .eq('periodo', selectedPeriod);
        
        if (cError) {
          console.error("Error al consultar consumos_mensuales:", cError);
        } else {
          consumosList = cData || [];
        }
      }
      setPeriodConsumos(consumosList);

      const rows = datosProcesados.map((m, index) => {
        // Auto-detectar banco si es AUTO
        let detectedBanco = bankOption;
        if (detectedBanco === 'AUTO') {
          const upperRaw = textToProcess.toUpperCase();
          if (upperRaw.includes('CREDICOOP') || m.concepto.toUpperCase().includes('CREDICOOP') || m.concepto.toUpperCase().includes('DEBIN')) {
            detectedBanco = 'CREDICOOP';
          } else if (upperRaw.includes('NACION') || upperRaw.includes('LEY 25413')) {
            detectedBanco = 'NACION';
          } else {
            detectedBanco = 'CREDICOOP'; // Default fallback
          }
        }

        const isTaxOrFee = m.tipo_movimiento === 'IMPUESTO' || m.tipo_movimiento === 'COMISION' || m.tipo_movimiento === 'SUSCRIPCION' || m.tipo_movimiento === 'PAGO_VEP' || m.tipo_movimiento === 'PAGO_SERVICIO' || m.tipo_movimiento === 'PAGO_ARCA' || m.tipo_movimiento === 'TRANSFERENCIA_ENVIADA';
        const suggestion = isTaxOrFee ? null : findSuggestedSocio(m.concepto, socios);

        // Verificar duplicados (emparejamiento uno-a-uno)
        const rowDateISO = parseDateToISODate(m.fecha);
        
        // Paso 1: Buscar match directo (mismo monto, misma fecha, mismo banco, concepto contenido)
        let matchIndex = existingMovsPool.findIndex(dbMov => {
          if (dbMov.fecha_movimiento !== rowDateISO || Math.abs(Number(dbMov.monto) - m.netoReal) >= 0.01 || dbMov.banco !== detectedBanco) {
            return false;
          }
          const normalize = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
          const dbConc = normalize(dbMov.concepto);
          const rowConc = normalize(m.concepto);
          return dbConc === rowConc || dbConc.includes(rowConc) || rowConc.includes(dbConc);
        });

        // Paso 2: Si no hay match directo, buscar splits de conciliación multi-liquidación
        // (múltiples filas en DB cuyo concepto contiene el concepto original y cuyos montos suman ~netoReal)
        let isMultiLiqMatch = false;
        let multiLiqSocioId = null;
        let multiLiqIndices = [];
        
        if (matchIndex === -1 && m.netoReal > 0) {
          const normalize = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
          const rowConc = normalize(m.concepto);
          if (rowConc) {
            // Encontrar todas las filas de DB que contengan este concepto, misma fecha y banco
            const candidateIndices = [];
            existingMovsPool.forEach((dbMov, idx) => {
              if (dbMov.fecha_movimiento !== rowDateISO || dbMov.banco !== detectedBanco) return;
              const dbConc = normalize(dbMov.concepto);
              if (dbConc.includes(rowConc) || rowConc.includes(dbConc)) {
                candidateIndices.push(idx);
              }
            });
            
            if (candidateIndices.length > 1) {
              const sumMontos = candidateIndices.reduce((sum, idx) => sum + Number(existingMovsPool[idx].monto), 0);
              if (Math.abs(sumMontos - m.netoReal) < 2.00) {
                isMultiLiqMatch = true;
                multiLiqIndices = candidateIndices;
                // Usar el socio_id del primer split que tenga uno
                const firstWithSocio = candidateIndices.find(idx => existingMovsPool[idx].socio_id);
                multiLiqSocioId = firstWithSocio !== undefined ? existingMovsPool[firstWithSocio].socio_id : null;
              }
            }
          }
        }

        let matchedDbMov = matchIndex !== -1 ? existingMovsPool[matchIndex] : null;

        // Definir socio y etiqueta definitivos
        let targetSocio = null;
        let dbSocioId = "";
        let dbLabel = "";

        if (matchedDbMov && matchedDbMov.socio_id) {
          dbSocioId = matchedDbMov.socio_id;
          targetSocio = socios.find(s => s.socio_id === dbSocioId);
          dbLabel = targetSocio ? `${targetSocio.nombre_completo} (Socio ${targetSocio.nro_socio || ''})` : '';
        } else if (isMultiLiqMatch && multiLiqSocioId) {
          dbSocioId = multiLiqSocioId;
          targetSocio = socios.find(s => s.socio_id === dbSocioId);
          dbLabel = targetSocio ? `${targetSocio.nombre_completo} (Socio ${targetSocio.nro_socio || ''})` : '';
        } else if (suggestion) {
          targetSocio = suggestion.socio;
          dbSocioId = suggestion.socio.socio_id;
          dbLabel = `${suggestion.socio.nombre_completo} (Socio ${suggestion.socio.nro_socio || ''})`;
        }

        // Cargar grupos del socio
        const socioGroups = targetSocio ? (targetSocio.grupo_socio?.map(g => g.numero_grupo) || []) : [];
        const bankPeriod = getBankPeriod(m.concepto, rowDateISO);
        const pendingForSocio = targetSocio
          ? pendingLiquidaciones.filter(liq => liq && socioGroups.includes(liq.numero_grupo) && (liq.periodo <= bankPeriod))
          : [];
        
        const { liqId: calculatedLiqId, matchedIds } = matchedDbMov && matchedDbMov.liquidacion_id 
          ? { liqId: String(matchedDbMov.liquidacion_id), matchedIds: null } 
          : findDefaultLiquidation(m.netoReal, pendingForSocio);
        const activeLiqId = calculatedLiqId;

        let initialEstado = 'PENDIENTE';
        let isAlreadyPaidMatch = false;

        if (matchIndex !== -1) {
          initialEstado = 'CONCILIADO';
          existingMovsPool.splice(matchIndex, 1); // Remover del pool
        } else if (isMultiLiqMatch) {
          // Multi-liquidación: los splits en DB suman el monto original
          initialEstado = 'CONCILIADO';
          isAlreadyPaidMatch = true;
          // Remover todos los splits del pool (de mayor a menor para no romper índices)
          multiLiqIndices.sort((a, b) => b - a).forEach(idx => existingMovsPool.splice(idx, 1));
        } else if (activeLiqId && activeLiqId !== 'SALDAR_TODO') {
          const matchedLiq = pendingForSocio.find(l => String(l.liquidacion_id) === String(activeLiqId));
          if (matchedLiq) {
            const pendingAmount = Number(matchedLiq.monto_total_facturado || 0) - Number(matchedLiq.monto_abonado || 0);
            if (pendingAmount <= 2.00) {
              initialEstado = 'CONCILIADO';
              isAlreadyPaidMatch = true;
            }
          }
        } else if (activeLiqId === 'SALDAR_TODO' && matchedIds && matchedIds.length > 0) {
          const liquidations = pendingForSocio.filter(l => matchedIds.includes(l.liquidacion_id));
          const sumPending = liquidations.reduce((sum, l) => sum + (Number(l.monto_total_facturado || 0) - Number(l.monto_abonado || 0)), 0);
          
          if (sumPending <= 2.00) {
            initialEstado = 'CONCILIADO';
            isAlreadyPaidMatch = true;
          }
        }

        // Comprobación extra para el número de comprobante (evitar duplicados)
        let warningMsg = '';
        let isDuplicateCpbte = false;

        if (m.comprobante) {
          const cleanCpbte = m.comprobante.trim();
          if (cleanCpbte.length >= 3) {
            // 1. Duplicado interno (en lote)
            const isInternalDup = datosProcesados.some((other, oIdx) => 
              oIdx !== index && 
              other.comprobante && 
              other.comprobante.trim() === cleanCpbte
            );

            // 2. Duplicado en base de datos (excluyendo la coincidencia legítima si ya se concilió a través de matchIndex)
            const hasAnotherDbMov = existingMovs.some(dbMov => 
              dbMov !== matchedDbMov && 
              dbMov.concepto?.includes(cleanCpbte)
            );

            if (isInternalDup) {
              warningMsg = `Comprobante #${cleanCpbte} repetido en lote`;
              isDuplicateCpbte = true;
            } else if (hasAnotherDbMov) {
              warningMsg = `Comprobante #${cleanCpbte} ya registrado en base de datos`;
              isDuplicateCpbte = true;
            }
          }
        }

        const defaultLines = calculateDefaultLines(dbSocioId, activeLiqId, m.netoReal, consumosList);

        return {
          id: index,
          fecha: m.fecha,
          concepto: m.concepto,
          comprobante: m.comprobante || '',
          ingresoBruto: m.ingresoBruto,
          impuestos: m.impuestos,
          netoReal: m.netoReal,
          tipo_movimiento: m.tipo_movimiento || 'OTRO',
          detallesImpuestos: m.detallesImpuestos || [],
          banco: detectedBanco,
          suggestedSocio: suggestion,
          selectedSocioId: dbSocioId,
          selectedSocioLabel: dbLabel,
          pendingList: pendingForSocio,
          selectedLiquidationId: activeLiqId,
          matchedLiquidationIds: matchedIds,
          selectedLines: defaultLines,
          estado: initialEstado,
          isDbDuplicate: matchIndex !== -1 || isMultiLiqMatch,
          isAlreadyPaidMatch: isAlreadyPaidMatch,
          movimiento_id: matchedDbMov ? matchedDbMov.movimiento_id : null,
          dbLiquidationInfo: matchedDbMov ? matchedDbMov.liquidaciones_grupos : null,
          warningMsg: warningMsg,
          isDuplicateCpbte: isDuplicateCpbte,
          errorMsg: ''
        };
      });

      setParsedMovements(rows);
      setSaldoAnterior(datosProcesados.saldoAnterior || 0);
      setSaldoFinalExtraido(datosProcesados.saldoFinalExtraido || null);
      
      const reconciledCount = rows.filter(r => r.estado === 'CONCILIADO').length;
      if (reconciledCount > 0) {
        addToast(`Se procesaron ${rows.length} movimientos (${reconciledCount} ya registrados en base de datos).`, 'success');
      } else {
        addToast(`Se procesaron ${rows.length} movimientos.`, 'success');
      }
    } catch (e) {
      console.error(e);
      addToast('Error al parsear los datos: Verifica el formato.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Obtener la lista única de números de grupo de los socios para autocompletar por grupo
  const uniqueGroupNumbers = useMemo(() => {
    const gps = new Set();
    socios.forEach(s => {
      (s.grupo_socio || []).forEach(gs => {
        if (gs.numero_grupo) gps.add(gs.numero_grupo);
      });
    });
    return Array.from(gps).sort((a, b) => a - b);
  }, [socios]);

  const getTitularNameForGroup = (groupNum) => {
    const titularSocioId = titularMap[groupNum];
    if (titularSocioId) {
      const s = socios.find(s => s.socio_id === titularSocioId);
      if (s) return s.nombre_completo;
    }
    const member = socios.find(s => s.grupo_socio?.some(gs => gs?.numero_grupo === groupNum));
    return member ? member.nombre_completo : 'Desconocido';
  };

  // Movimientos candidatos para Débito Automático (Pendientes y positivo)
  const candidateMovements = useMemo(() => {
    return parsedMovements.filter(m => m.netoReal > 0 && m.estado === 'PENDIENTE');
  }, [parsedMovements]);

  return (
    <div style={{ animation: 'slideUpFade 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
      <datalist id="global-socios-list">
        {socios.map(s => {
          const groupStr = s.grupo_socio?.length 
            ? ` - Gpo ${s.grupo_socio.filter(g => g).map(g => `${g.numero_grupo} (gpo${g.numero_grupo})`).join(', ')}` 
            : '';
          return (
            <option 
              key={`socio-${s.socio_id}`} 
              value={`${s.nombre_completo} (Socio ${s.nro_socio || ''})${groupStr}`} 
            />
          );
        })}
      </datalist>

      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '8px' }}>Conciliación Bancaria</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Módulo de trazabilidad inteligente de transferencias e impuestos</p>
        </div>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Selector de Periodo premium */}
          <div 
            className="glass-panel hover-lift" 
            style={{ 
              padding: '8px 16px', 
              display: 'flex', 
              gap: '12px', 
              alignItems: 'center', 
              borderRadius: '16px', 
              border: '1px solid var(--border-light)', 
              background: 'var(--surface)',
              minWidth: '220px',
              height: '46px'
            }}
          >
            <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <label style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1px' }}>
                Período Conciliación
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13.5px',
                  fontWeight: '800',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                  width: '100%'
                }}
              >
                {periodosList.length === 0 ? (
                  <option value="" style={{ background: 'var(--surface)' }}>Cargando...</option>
                ) : (
                  periodosList.map(p => (
                    <option key={p} value={p} style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}>
                      {p}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Selector de Pestañas Premium */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.04)', padding: '4px', borderRadius: '16px', border: '1px solid var(--border-light)', height: '46px', alignItems: 'center' }}>
            <button 
              onClick={() => setActiveTab('nueva')}
              className="action-button"
              style={{ 
                background: activeTab === 'nueva' ? 'var(--accent)' : 'transparent', 
                color: activeTab === 'nueva' ? 'white' : 'var(--text-secondary)',
                padding: '8px 16px', 
                borderRadius: '12px',
                fontSize: '13px',
                height: '36px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              Nueva Conciliación
            </button>
            <button 
              onClick={() => setActiveTab('debitos')}
              className="action-button"
              style={{ 
                background: activeTab === 'debitos' ? 'var(--accent)' : 'transparent', 
                color: activeTab === 'debitos' ? 'white' : 'var(--text-secondary)',
                padding: '8px 16px', 
                borderRadius: '12px',
                fontSize: '13px',
                height: '36px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              Débitos Automáticos
            </button>
          </div>
        </div>
      </div>

      {/* Bento de Resumen de Período */}
      <PeriodSummaryCards periodSummary={periodSummary} selectedPeriod={selectedPeriod} />

      {/* Contenidos de Pestañas */}
      {activeTab === 'nueva' && (
        <NuevaConciliacionTab
          selectedPeriod={selectedPeriod}
          parsedMovements={parsedMovements}
          setParsedMovements={setParsedMovements}
          saldoAnterior={saldoAnterior}
          setSaldoAnterior={setSaldoAnterior}
          saldoFinalExtraido={saldoFinalExtraido}
          setSaldoFinalExtraido={setSaldoFinalExtraido}
          loading={loading}
          loadingMaster={loadingMaster}
          handleProcesar={handleProcesar}
          conciliarFila={conciliarFila}
          handleConciliarTodos={handleConciliarTodos}
          openLoteModal={openLoteModal}
          openBreakdownModal={openBreakdownModal}
          socios={socios}
          handleSocioInputChange={handleSocioInputChange}

          handleToggleLiquidation={handleToggleLiquidation}
          handleAddGroupToRow={handleAddGroupToRow}
          getTipoMovimientoLabel={getTipoMovimientoLabel}
          renderTipoMovimientoBadge={renderTipoMovimientoBadge}
          rawData={rawData}
          setRawData={setRawData}
          periodConsumos={periodConsumos}
          handleToggleLineSelection={handleToggleLineSelection}
          openEditConciliacionModal={openEditConciliacionModal}
          deshacerMatchLocal={deshacerMatchLocal}
          checkIsAmountMatch={checkIsAmountMatch}
        />
      )}

      {activeTab === 'debitos' && (
        <DebitosAutomaticosTab
          loteModal={loteModal}
          setLoteModal={setLoteModal}
          candidateMovements={candidateMovements}
          handleExcelUpload={handleExcelUpload}
          handleColumnMappingChange={handleColumnMappingChange}
          handleRowCheckChange={handleRowCheckChange}
          handleRowLiquidationChange={handleRowLiquidationChange}
          handleLoteRowToggleLiquidation={handleLoteRowToggleLiquidation}
          handleCheckAll={handleCheckAll}
          saveLoteReconciliation={saveLoteReconciliation}
          handleSheetChange={handleSheetChange}
          openBreakdownModal={openBreakdownModal}
          handleTextPaste={handleTextPaste}
          periodConsumos={periodConsumos}
          handleToggleLineSelection={handleLoteRowToggleLineSelection}
        />
      )}

      {/* Modal de Desglose de Grupo */}
      <DesgloseGrupoModal
        breakdownModal={breakdownModal}
        setBreakdownModal={setBreakdownModal}
        formatISODateToAR={formatISODateToAR}
        conciliarFila={conciliarFila}
      />

      {/* Modal para Editar Conciliación */}
      <Modal 
        isOpen={editConciliacionModal.isOpen} 
        onClose={() => setEditConciliacionModal(prev => ({ ...prev, isOpen: false }))} 
        title={`Editar Conciliación - Movimiento #${editConciliacionModal.movement?.movimiento_id || ''}`} 
        maxWidth="450px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border-light)', fontSize: '13px' }}>
            <p style={{ margin: '0 0 6px 0', color: 'var(--text-secondary)' }}>Detalle del Movimiento</p>
            <p style={{ margin: '0 0 4px 0', fontWeight: 700 }}>{editConciliacionModal.movement?.concepto}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div>
                <p style={{ margin: '0 0 2px 0', color: 'var(--text-secondary)', fontSize: '11px' }}>Banco</p>
                <p style={{ margin: 0, fontWeight: 600 }}>{editConciliacionModal.movement?.banco}</p>
              </div>
              <div>
                <p style={{ margin: '0 0 2px 0', color: 'var(--text-secondary)', fontSize: '11px' }}>Monto</p>
                <p style={{ margin: 0, fontWeight: 700, color: Number(editConciliacionModal.movement?.monto) > 0 ? '#10b981' : '#ef4444' }}>
                  ${Math.abs(Number(editConciliacionModal.movement?.monto || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="form-label">Asignar Socio / Titular</label>
            <input
              type="text"
              list="global-socios-list"
              className="form-input"
              value={editConciliacionModal.selectedSocioLabel}
              onChange={e => handleEditSocioChange(e.target.value)}
              placeholder="Buscar socio por nombre..."
              style={{ marginBottom: 0 }}
            />
          </div>

          <div>
            <label className="form-label">Saldar Factura Pendiente</label>
            <select
              className="form-input"
              value={editConciliacionModal.selectedLiquidationId}
              onChange={e => setEditConciliacionModal(prev => ({ ...prev, selectedLiquidationId: e.target.value }))}
              style={{ marginBottom: 0 }}
              disabled={!editConciliacionModal.selectedSocioId}
            >
              {!editConciliacionModal.selectedSocioId ? (
                <option value="">Asigne un socio primero</option>
              ) : editConciliacionModal.pendingList.length === 0 ? (
                <option value="">Ninguna deuda pendiente</option>
              ) : (
                <>
                  <option value="">-- No saldar deuda --</option>
                  {editConciliacionModal.pendingList.map(liq => {
                    const fact = Number(liq.monto_total_facturado || 0);
                    const ab = Number(liq.monto_abonado || 0);
                    const pend = fact - ab;
                    return (
                      <option key={liq.liquidacion_id} value={String(liq.liquidacion_id)}>
                        Periodo: {liq.periodo} | {liq.proveedores?.nombre || 'S/P'} (Fact: ${fact.toLocaleString('es-AR', { maximumFractionDigits: 0 })} | Pend: ${pend.toLocaleString('es-AR', { maximumFractionDigits: 0 })})
                      </option>
                    );
                  })}
                </>
              )}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button 
              onClick={() => setEditConciliacionModal(prev => ({ ...prev, isOpen: false }))} 
              className="action-button" 
              style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', width: '50%' }} 
              disabled={editConciliacionModal.saving}
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveEditConciliacion} 
              className="action-button" 
              style={{ width: '50%' }} 
              disabled={editConciliacionModal.saving || (!editConciliacionModal.selectedSocioId && editConciliacionModal.movement?.tipo_movimiento === 'TRANSFERENCIA_RECIBIDA')}
            >
              {editConciliacionModal.saving ? <Loader2 className="animate-spin" size={16} /> : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
