import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { 
  Search, RefreshCw, AlertCircle, Trash2, Plus, Calendar, DollarSign, 
  TrendingUp, TrendingDown, Landmark, CheckCircle, HelpCircle, User, Loader2
} from 'lucide-react';
import Modal from './components/Modal';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import DesgloseGrupoModal from './components/Conciliacion/DesgloseGrupoModal';
import { formatUTCDate as formatISODateToAR } from './utils/formatters';

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
    case 'PAGO_EFECTIVO': return 'Pago Efectivo';
    case 'PAGO_DIRECTO': return 'Pago Directo';
    case 'PAGO_PABLO': return 'Pago a Pablo';
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
      bgColor = 'rgba(168, 85, 247, 0.1)';
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
      bgColor = 'rgba(239, 68, 68, 0.1)';
      color = '#ef4444';
      break;
    case 'PAGO_EFECTIVO':
      label = 'Pago Efectivo';
      bgColor = 'rgba(16, 185, 129, 0.15)';
      color = '#059669';
      break;
    case 'PAGO_DIRECTO':
      label = 'Pago Directo';
      bgColor = 'rgba(79, 70, 229, 0.15)';
      color = '#4f46e5';
      break;
    case 'PAGO_PABLO':
      label = 'Pago a Pablo';
      bgColor = 'rgba(219, 39, 119, 0.15)';
      color = '#db2777';
      break;
    case 'OTRO_INGRESO':
      label = 'Otro Ingreso';
      bgColor = 'rgba(16, 185, 129, 0.1)';
      color = '#10b981';
      break;
    case 'OTRO_EGRESO':
      label = 'Otro Egreso';
      bgColor = 'rgba(239, 68, 68, 0.1)';
      color = '#ef4444';
      break;
    default:
      label = getTipoMovimientoLabel(tipo);
  }

  return (
    <span style={{ 
      fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '8px',
      background: bgColor, color: color, textTransform: 'uppercase', display: 'inline-block'
    }}>
      {label}
    </span>
  );
};

export default function MovimientosBancarios() {
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(() => localStorage.getItem('mb_selectedPeriod') || '');
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [socios, setSocios] = useState([]);
  const [searchHistorial, setSearchHistorial] = useState('');
  const [filtroTipoHistorial, setFiltroTipoHistorial] = useState('TODOS');
  const [filtroBancoHistorial, setFiltroBancoHistorial] = useState('TODOS');
  const [filtroVinculacion, setFiltroVinculacion] = useState('TODOS');
  const [currentPageHistorial, setCurrentPageHistorial] = useState(1);
  const itemsPerPage = 50;

  // Manual payment modal state
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    concepto: '',
    monto: '',
    tipoPago: 'PAGO_EFECTIVO', // PAGO_EFECTIVO, PAGO_DIRECTO, PAGO_PABLO, TRANSFERENCIA_RECIBIDA, OTRO_INGRESO
    banco: 'EFECTIVO', // EFECTIVO, DIRECTO, PAGO_PABLO, CREDICOOP, NACION
    selectedSocioLabel: '',
    selectedSocioId: '',
    selectedLiquidationId: '',
    comprobante: '',
    observaciones: ''
  });
  const [manualPendingList, setManualPendingList] = useState([]);

  // Edit movement modal state
  const [editModal, setEditModal] = useState({
    isOpen: false,
    saving: false,
    movement: null,
    selectedSocioLabel: '',
    selectedSocioId: '',
    selectedLiquidationId: '',
    pendingList: []
  });

  // Breakdown modal state
  const [breakdownModal, setBreakdownModal] = useState({
    isOpen: false,
    loading: false,
    liquidacionId: null,
    groupInfo: null,
    members: [],
    payments: [],
    pendingRow: null
  });

  // Synchronize period list
  const fetchPeriods = async () => {
    try {
      const { data, error } = await supabase
        .from('unique_periods_view')
        .select('periodo');
      if (error) throw error;
      
      const pList = data?.map(d => d.periodo).filter(Boolean) || [];
      setPeriods(pList);
      
      if (pList.length > 0 && !selectedPeriod) {
        setSelectedPeriod(pList[0]);
      }
    } catch (err) {
      console.error("Error fetching unique periods:", err);
    }
  };

  const fetchSocios = async () => {
    try {
      const { data, error } = await supabase
        .from('socios')
        .select(`
          socio_id,
          nombre_completo,
          nro_socio,
          grupo_socio(numero_grupo)
        `)
        .order('nombre_completo');
      if (error) throw error;
      setSocios(data || []);
    } catch (err) {
      console.error("Error fetching active partners:", err);
    }
  };

  const fetchHistorial = async () => {
    setLoadingHistorial(true);
    try {
      let query = supabase
        .from('movimientos_bancarios')
        .select(`
          movimiento_id,
          fecha_movimiento,
          concepto,
          monto,
          ingreso_bruto,
          impuestos,
          banco,
          created_at,
          socio_id,
          liquidacion_id,
          tipo_movimiento,
          comprobante,
          observaciones,
          socios(nombre_completo, nro_socio),
          liquidaciones_grupos(periodo, numero_grupo, monto_total_facturado)
        `)
        .order('fecha_movimiento', { ascending: false });

      if (selectedPeriod) {
        const [year, month] = selectedPeriod.split('-');
        const startDate = `${selectedPeriod}-01`;
        const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
        query = query.gte('fecha_movimiento', startDate).lte('fecha_movimiento', endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      setHistorial(data || []);
    } catch (err) {
      console.error("Error fetching movement history:", err);
      addToast("Error al cargar el historial de movimientos", "error");
    } finally {
      setLoadingHistorial(false);
    }
  };

  useEffect(() => {
    fetchPeriods();
    fetchSocios();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      localStorage.setItem('mb_selectedPeriod', selectedPeriod);
    }
    fetchHistorial();
  }, [selectedPeriod]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPageHistorial(1);
  }, [filtroTipoHistorial, filtroBancoHistorial, filtroVinculacion, searchHistorial]);

  // Filter historial
  const filteredHistorial = useMemo(() => {
    // Exclude master markers if they exist
    let result = historial.filter(h => h.tipo_movimiento !== 'CONCILIACION_GRUPO_MASTER');
    if (searchHistorial) {
      const term = searchHistorial.toLowerCase();
      result = result.filter(h => {
        const matchConcepto = h.concepto?.toLowerCase().includes(term);
        const matchSocio = h.socios?.nombre_completo?.toLowerCase().includes(term);
        const matchBanco = h.banco?.toLowerCase().includes(term);
        const matchTipo = (h.tipo_movimiento || '').toLowerCase().includes(term) || getTipoMovimientoLabel(h.tipo_movimiento).toLowerCase().includes(term);
        const amountStr = Math.abs(Number(h.monto || 0)).toString();
        const matchMonto = amountStr.includes(term) || amountStr.replace('.', '').replace(',', '').includes(term);
        
        return matchConcepto || matchSocio || matchBanco || matchTipo || matchMonto;
      });
    }
    if (filtroTipoHistorial !== 'TODOS') {
      result = result.filter(h => h.tipo_movimiento === filtroTipoHistorial);
    }
    if (filtroBancoHistorial !== 'TODOS') {
      result = result.filter(h => h.banco === filtroBancoHistorial);
    }
    if (filtroVinculacion === 'PENDIENTES') {
      result = result.filter(h => !h.socio_id || !h.liquidacion_id);
    } else if (filtroVinculacion === 'COMPLETOS') {
      result = result.filter(h => h.socio_id && h.liquidacion_id);
    }
    return result;
  }, [historial, searchHistorial, filtroTipoHistorial, filtroBancoHistorial, filtroVinculacion]);

  const paginatedHistorial = useMemo(() => {
    return filteredHistorial.slice(
      (currentPageHistorial - 1) * itemsPerPage,
      currentPageHistorial * itemsPerPage
    );
  }, [filteredHistorial, currentPageHistorial]);

  const totalPagesHistorial = Math.ceil(filteredHistorial.length / itemsPerPage) || 1;

  // Metric aggregates for the filtered/selected history
  const metrics = useMemo(() => {
    let ing = 0, egr = 0, conc = 0, imp = 0;
    filteredHistorial.forEach(m => {
      const val = Number(m.monto || 0);
      if (val > 0) {
        ing += val;
        if (m.liquidacion_id) {
          conc += val;
        }
      } else {
        egr += Math.abs(val);
        if (['IMPUESTO', 'COMISION'].includes(m.tipo_movimiento)) {
          imp += Math.abs(val);
        }
      }
    });
    return {
      totalIngresos: ing,
      totalEgresos: egr,
      totalConciliado: conc,
      totalImpuestos: imp
    };
  }, [filteredHistorial]);

  // Undo / Delete reconciliation movement
  const handleDeshacerConciliacion = async (movement) => {
    const accepted = await confirm({
      title: "Eliminar / Deshacer Movimiento",
      message: `¿Estás seguro de eliminar el movimiento por $${movement.monto}? Si estaba conciliado, se restablecerá la deuda original y se actualizará el estado de la factura.`,
      isDanger: true,
      confirmText: "Eliminar",
      cancelText: "Cancelar"
    });

    if (!accepted) return;

    try {
      setLoadingHistorial(true);
      
      // 1. If it was linked to a liquidation, reduce the paid amount
      if (movement.liquidacion_id) {
        const { data: liqData, error: liqFetchError } = await supabase
          .from('liquidaciones_grupos')
          .select('monto_abonado, monto_total_facturado, numero_grupo')
          .eq('liquidacion_id', movement.liquidacion_id)
          .single();

        if (liqFetchError) throw liqFetchError;

        if (liqData) {
          const newMontoAbonado = Math.max(0, Math.round((Number(liqData.monto_abonado || 0) - Number(movement.monto)) * 100) / 100);
          const state = newMontoAbonado === 0 ? 'PENDIENTE' : 'PARCIAL';

          const { error: liqUpdError } = await supabase
            .from('liquidaciones_grupos')
            .update({
              monto_abonado: newMontoAbonado,
              estado_pago: state,
              updated_at: new Date().toISOString()
            })
            .eq('liquidacion_id', movement.liquidacion_id);

          if (liqUpdError) throw liqUpdError;

          // Write audit log
          await supabase
            .from('audit_log')
            .insert({
              tipo_evento: 'REVERSION_CONCILIACION',
              descripcion: `REVERTIDO: Se eliminó movimiento ID ${movement.movimiento_id} de Banco/Canal ${movement.banco} por $${movement.monto} y se restableció factura ID ${movement.liquidacion_id} a ${state}.`,
              monto: movement.monto,
              numero_grupo: liqData.numero_grupo,
              usuario: 'dante@admin.com'
            });
        }
      } else {
        // Simple audit log
        await supabase
          .from('audit_log')
          .insert({
            tipo_evento: 'ELIMINACION_MOVIMIENTO',
            descripcion: `ELIMINADO: Se eliminó movimiento bancario manual/diario ID ${movement.movimiento_id} de Banco/Canal ${movement.banco} por $${movement.monto}.`,
            monto: movement.monto,
            usuario: 'dante@admin.com'
          });
      }

      // 3. Delete the movement
      const { error: delError } = await supabase
        .from('movimientos_bancarios')
        .delete()
        .eq('movimiento_id', movement.movimiento_id);

      if (delError) throw delError;

      addToast("Movimiento eliminado con éxito", "success");
      fetchHistorial();
    } catch (err) {
      console.error(err);
      addToast(`Error al deshacer movimiento: ${err.message}`, "error");
    } finally {
      setLoadingHistorial(false);
    }
  };

  // Mass reset for the period
  const handleResetearPeriodo = async () => {
    if (!selectedPeriod) {
      addToast("Debe seleccionar un período para resetear", "warning");
      return;
    }
    const accepted = await confirm({
      title: "Resetear Movimientos del Período",
      message: `¿Estás seguro de que querés ELIMINAR TODOS los movimientos bancarios y conciliaciones correspondientes al período ${selectedPeriod}? Esta acción restablecerá todas las facturas de este período a pendiente. NO se puede deshacer.`,
      isDanger: true,
      confirmText: "Sí, Borrar Todo",
      cancelText: "Cancelar"
    });

    if (!accepted) return;

    try {
      setLoadingHistorial(true);
      
      const { data: liqs, error: fetchErr } = await supabase
        .from('liquidaciones_grupos')
        .select('liquidacion_id')
        .eq('periodo', selectedPeriod);
      
      if (fetchErr) throw fetchErr;
      const liqIds = liqs?.map(l => l.liquidacion_id) || [];
      
      if (liqIds.length > 0) {
        await supabase.from('movimientos_bancarios').delete().in('liquidacion_id', liqIds);
      }

      const startDate = `${selectedPeriod}-01`;
      const [year, month] = selectedPeriod.split('-');
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      
      await supabase.from('movimientos_bancarios').delete().is('liquidacion_id', null).gte('fecha_movimiento', startDate).lte('fecha_movimiento', endDate);

      if (liqIds.length > 0) {
        await supabase.from('liquidaciones_grupos').update({
          monto_abonado: 0,
          estado_pago: 'PENDIENTE',
          updated_at: new Date().toISOString()
        }).in('liquidacion_id', liqIds);
      }

      await supabase.from('audit_log').insert({
        tipo_evento: 'RESETEO_PERIODO',
        descripcion: `RESETEO MASIVO: Se eliminaron todos los movimientos y conciliaciones del período ${selectedPeriod}.`,
        monto: 0,
        usuario: 'dante@admin.com'
      });

      addToast(`Todos los movimientos y conciliaciones del período ${selectedPeriod} fueron eliminados.`, "success");
      fetchHistorial();
    } catch (err) {
      console.error(err);
      addToast(`Error al resetear período: ${err.message}`, "error");
    } finally {
      setLoadingHistorial(false);
    }
  };

  // Open breakdown details modal
  const openBreakdownModal = async (liqId) => {
    setBreakdownModal({
      isOpen: true,
      loading: true,
      liquidacionId: liqId,
      groupInfo: null,
      members: [],
      payments: [],
      pendingRow: null
    });

    try {
      // 1. Fetch group billing row info
      const { data: liqObj, error: fetchLiqErr } = await supabase
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
          socios!socio_id(nombre_completo, nro_socio)
        `)
        .eq('liquidacion_id', liqId)
        .single();
      
      if (fetchLiqErr) throw fetchLiqErr;

      // 2. Fetch group members
      const { data: membersList, error: fetchMembersErr } = await supabase
        .from('grupo_socio')
        .select(`
          numero_grupo,
          socio_id,
          es_titular,
          socios:socio_id(nombre_completo, nro_socio)
        `)
        .eq('numero_grupo', liqObj.numero_grupo);
      
      if (fetchMembersErr) throw fetchMembersErr;

      // 3. Fetch consumos of the group for lines detail
      const { data: linesData, error: linesErr } = await supabase
        .from('consumos_mensuales')
        .select(`
          total_linea,
          numero_linea,
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
        .eq('periodo', liqObj.periodo)
        .eq('lineas.numero_grupo', liqObj.numero_grupo)
        .eq('proveedor_id', liqObj.proveedor_id);

      if (linesErr) throw linesErr;

      // 4. Fetch movements registered for this specific group/liquidation
      const { data: payList, error: payErr } = await supabase
        .from('movimientos_bancarios')
        .select(`
          movimiento_id,
          fecha_movimiento,
          concepto,
          monto,
          banco,
          tipo_movimiento
        `)
        .eq('liquidacion_id', liqId);
      
      if (payErr) throw payErr;

      // Map lines to member objects
      const finalMembers = (membersList || []).map(m => {
        const memberLines = (linesData || []).filter(line => line.lineas?.socio_id === m.socio_id);
        const totalLinesAmount = memberLines.reduce((sum, l) => sum + Number(l.total_linea || 0), 0);
        return {
          ...m,
          totalAmount: totalLinesAmount,
          lines: memberLines.map(l => ({ number: l.numero_linea, amount: l.total_linea }))
        };
      });

      setBreakdownModal({
        isOpen: true,
        loading: false,
        liquidacionId: liqId,
        groupInfo: liqObj,
        members: finalMembers,
        payments: payList || [],
        pendingRow: null
      });
    } catch (err) {
      console.error("Error loading breakdown details:", err);
      addToast("Error al cargar detalles de liquidación", "error");
      setBreakdownModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  // Setup Edit Movement Modal
  const openEditConciliacionModal = async (mov) => {
    let sLabel = '';
    let sId = mov.socio_id || '';
    if (mov.socios) {
      sLabel = `${mov.socios.nombre_completo} - Gpo: ${mov.liquidaciones_grupos?.numero_grupo || 'Sin Grupo'}`;
    }

    setEditModal({
      isOpen: true,
      saving: false,
      movement: mov,
      selectedSocioLabel: sLabel,
      selectedSocioId: sId,
      selectedLiquidationId: mov.liquidacion_id ? String(mov.liquidacion_id) : '',
      pendingList: []
    });

    if (sId) {
      await loadPendingListForEdit(sId, mov.liquidacion_id);
    }
  };

  const loadPendingListForEdit = async (socioId, currentLiqId) => {
    try {
      // Get partner groups
      const { data: gData } = await supabase
        .from('grupo_socio')
        .select('numero_grupo')
        .eq('socio_id', socioId);
      
      const groupNums = gData?.map(g => g.numero_grupo) || [];
      if (groupNums.length === 0) return;

      const { data: liqData, error: liqError } = await supabase
        .from('liquidaciones_grupos')
        .select('*, proveedores:proveedor_id(nombre)')
        .in('numero_grupo', groupNums);
      
      if (liqError) throw liqError;

      // Filter: only PENDIENTE/PARCIAL or the currently edited liquidation ID
      const filtered = (liqData || []).filter(l => 
        l.estado_pago === 'PENDIENTE' || l.estado_pago === 'PARCIAL' || l.liquidacion_id === currentLiqId
      );

      setEditModal(prev => ({ ...prev, pendingList: filtered }));
    } catch (err) {
      console.error("Error loading pending list for edit:", err);
    }
  };

  const handleEditSocioChange = async (val) => {
    setEditModal(prev => ({ ...prev, selectedSocioLabel: val }));

    const matched = socios.find(s => {
      const gpoText = s.grupo_socio?.map(g => g.numero_grupo).join(', ') || 'Sin Grupo';
      const label = `${s.nombre_completo} (Nº ${s.nro_socio || 'S/N'} - Gpos: ${gpoText})`;
      return label.toLowerCase() === val.toLowerCase() || s.nombre_completo.toLowerCase() === val.toLowerCase();
    });

    if (matched) {
      setEditModal(prev => ({ ...prev, selectedSocioId: matched.socio_id, selectedLiquidationId: '' }));
      await loadPendingListForEdit(matched.socio_id, editModal.movement?.liquidacion_id);
    } else {
      setEditModal(prev => ({ ...prev, selectedSocioId: '', selectedLiquidationId: '', pendingList: [] }));
    }
  };

  const handleSaveEditConciliacion = async () => {
    const { movement, selectedSocioId, selectedLiquidationId } = editModal;
    if (!movement) return;

    setEditModal(prev => ({ ...prev, saving: true }));
    try {
      const oldLiqId = movement.liquidacion_id;
      const newLiqId = selectedLiquidationId ? parseInt(selectedLiquidationId, 10) : null;
      const amount = Number(movement.monto);

      // 1. Revert Old Liquidation if changed
      if (oldLiqId && oldLiqId !== newLiqId) {
        const { data: oldLiq, error: getOldError } = await supabase
          .from('liquidaciones_grupos')
          .select('monto_abonado, monto_total_facturado')
          .eq('liquidacion_id', oldLiqId)
          .single();
        if (getOldError) throw getOldError;

        const newOldAbonado = Math.max(0, Math.round((Number(oldLiq.monto_abonado || 0) - amount) * 100) / 100);
        const stateOld = newOldAbonado >= Number(oldLiq.monto_total_facturado) - 2.00 ? 'ABONADO' : (newOldAbonado > 0 ? 'PARCIAL' : 'PENDIENTE');

        await supabase
          .from('liquidaciones_grupos')
          .update({
            monto_abonado: newOldAbonado,
            estado_pago: stateOld
          })
          .eq('liquidacion_id', oldLiqId);
      }

      // 2. Add to New Liquidation
      if (newLiqId && oldLiqId !== newLiqId) {
        const { data: newLiq, error: getNewError } = await supabase
          .from('liquidaciones_grupos')
          .select('monto_abonado, monto_total_facturado')
          .eq('liquidacion_id', newLiqId)
          .single();
        if (getNewError) throw getNewError;

        const newNewAbonado = Math.round((Number(newLiq.monto_abonado || 0) + amount) * 100) / 100;
        const stateNew = newNewAbonado >= Number(newLiq.monto_total_facturado) - 2.00 ? 'ABONADO' : (newNewAbonado > 0 ? 'PARCIAL' : 'PENDIENTE');

        await supabase
          .from('liquidaciones_grupos')
          .update({
            monto_abonado: newNewAbonado,
            estado_pago: stateNew
          })
          .eq('liquidacion_id', newLiqId);
      }

      // 3. Update the movement row
      const { error: moveError } = await supabase
        .from('movimientos_bancarios')
        .update({
          socio_id: selectedSocioId ? parseInt(selectedSocioId, 10) : null,
          liquidacion_id: newLiqId
        })
        .eq('movimiento_id', movement.movimiento_id);
      if (moveError) throw moveError;

      addToast("Movimiento actualizado y conciliación reorganizada con éxito", "success");
      setEditModal(prev => ({ ...prev, isOpen: false }));
      fetchHistorial();
    } catch (err) {
      console.error(err);
      addToast(`Error al guardar cambios: ${err.message}`, "error");
    } finally {
      setEditModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Manual payment actions
  const handleManualSocioChange = async (val) => {
    setManualForm(prev => ({ ...prev, selectedSocioLabel: val }));

    const matched = socios.find(s => {
      const gpoText = s.grupo_socio?.map(g => g.numero_grupo).join(', ') || 'Sin Grupo';
      const label = `${s.nombre_completo} (Nº ${s.nro_socio || 'S/N'} - Gpos: ${gpoText})`;
      return label.toLowerCase() === val.toLowerCase() || s.nombre_completo.toLowerCase() === val.toLowerCase();
    });

    if (matched) {
      setManualForm(prev => ({ ...prev, selectedSocioId: matched.socio_id, selectedLiquidationId: '' }));
      
      // Load pending bills
      try {
        const groupNums = matched.grupo_socio?.map(g => g.numero_grupo) || [];
        if (groupNums.length > 0) {
          const { data: liqData } = await supabase
            .from('liquidaciones_grupos')
            .select('*, proveedores:proveedor_id(nombre)')
            .in('numero_grupo', groupNums);
          
          const filtered = (liqData || []).filter(l => 
            l.estado_pago === 'PENDIENTE' || l.estado_pago === 'PARCIAL'
          );
          setManualPendingList(filtered);
          
          // Suggest exact match if possible
          if (manualForm.monto) {
            const parsedMonto = parseFloat(manualForm.monto);
            const exact = filtered.find(l => {
              const pend = Number(l.monto_total_facturado || 0) - Number(l.monto_abonado || 0);
              return Math.abs(pend - parsedMonto) < 2.00;
            });
            if (exact) {
              setManualForm(prev => ({ ...prev, selectedLiquidationId: String(exact.liquidacion_id) }));
            }
          }
        }
      } catch (err) {
        console.error("Error loading pending list for manual payment:", err);
      }
    } else {
      setManualForm(prev => ({ ...prev, selectedSocioId: '', selectedLiquidationId: '' }));
      setManualPendingList([]);
    }
  };

  // Handle saving new manual payment
  const handleSaveManualPayment = async (e) => {
    e.preventDefault();
    if (!manualForm.concepto || !manualForm.monto) {
      addToast("Por favor complete los campos obligatorios", "warning");
      return;
    }

    setManualSaving(true);
    try {
      const parsedMonto = parseFloat(manualForm.monto);
      const isIncome = parsedMonto > 0;
      
      // Determine banco and tipo_movimiento based on type selected
      let finalBanco = manualForm.banco;
      let finalTipo = manualForm.tipoPago;

      // Ensure defaults match selection
      if (manualForm.tipoPago === 'PAGO_EFECTIVO') finalBanco = 'EFECTIVO';
      else if (manualForm.tipoPago === 'PAGO_DIRECTO') finalBanco = 'DIRECTO';
      else if (manualForm.tipoPago === 'PAGO_PABLO') finalBanco = 'PAGO_PABLO';

      const sPeriod = manualForm.fecha.substring(0, 7);

      // 1. If linking to liquidation, update liquidaciones_grupos first
      let linkedLiqId = null;
      if (manualForm.selectedLiquidationId) {
        linkedLiqId = parseInt(manualForm.selectedLiquidationId, 10);
        const targetLiq = manualPendingList.find(l => l.liquidacion_id === linkedLiqId);
        
        if (targetLiq) {
          const newAbonado = Math.round((Number(targetLiq.monto_abonado || 0) + parsedMonto) * 100) / 100;
          const isFullyPaid = newAbonado >= Number(targetLiq.monto_total_facturado) - 2.00;
          const status = isFullyPaid ? 'ABONADO' : 'PARCIAL';

          const { error: liqUpdError } = await supabase
            .from('liquidaciones_grupos')
            .update({
              monto_abonado: newAbonado,
              estado_pago: status,
              updated_at: new Date().toISOString()
            })
            .eq('liquidacion_id', linkedLiqId);

          if (liqUpdError) throw liqUpdError;
        }
      }

      // 2. Insert into movimientos_bancarios
      const { error: insertError } = await supabase
        .from('movimientos_bancarios')
        .insert({
          fecha_movimiento: manualForm.fecha,
          concepto: manualForm.concepto,
          monto: parsedMonto,
          banco: finalBanco,
          tipo_movimiento: finalTipo,
          socio_id: manualForm.selectedSocioId ? parseInt(manualForm.selectedSocioId, 10) : null,
          liquidacion_id: linkedLiqId,
          comprobante: manualForm.comprobante || null,
          observaciones: manualForm.observaciones || null,
          periodo: sPeriod,
          origen: 'DIARIO'
        });

      if (insertError) throw insertError;

      // 3. Write Audit Log
      await supabase
        .from('audit_log')
        .insert({
          tipo_evento: 'CONCILIACION_MANUAL',
          descripcion: `MANUAL: Se computó movimiento manual por $${parsedMonto} (${getTipoMovimientoLabel(finalTipo)}) en ${finalBanco} - Socio: ${manualForm.selectedSocioLabel || 'N/A'}.`,
          monto: parsedMonto,
          usuario: 'dante@admin.com'
        });

      addToast("Pago manual computado y registrado con éxito", "success");
      setIsManualModalOpen(false);
      
      // Reset form
      setManualForm({
        fecha: new Date().toISOString().split('T')[0],
        concepto: '',
        monto: '',
        tipoPago: 'PAGO_EFECTIVO',
        banco: 'EFECTIVO',
        selectedSocioLabel: '',
        selectedSocioId: '',
        selectedLiquidationId: '',
        comprobante: '',
        observaciones: ''
      });
      setManualPendingList([]);

      fetchHistorial();
    } catch (err) {
      console.error(err);
      addToast(`Error al registrar pago manual: ${err.message}`, "error");
    } finally {
      setManualSaving(false);
    }
  };

  // Adjust bank selection automatically when changing tipoPago in manual form
  const handleManualTipoPagoChange = (typeVal) => {
    let bankVal = 'EFECTIVO';
    if (typeVal === 'PAGO_EFECTIVO') bankVal = 'EFECTIVO';
    else if (typeVal === 'PAGO_DIRECTO') bankVal = 'DIRECTO';
    else if (typeVal === 'PAGO_PABLO') bankVal = 'PAGO_PABLO';
    else if (typeVal === 'TRANSFERENCIA_RECIBIDA') bankVal = 'CREDICOOP';
    else bankVal = 'EFECTIVO';

    setManualForm(prev => ({ ...prev, tipoPago: typeVal, banco: bankVal }));
  };

  return (
    <div style={{ padding: '0 40px 40px 40px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* DATALIST PARA AUTOCOMPLETADO DE SOCIOS */}
      <datalist id="global-socios-list">
        {socios.map(s => {
          const gpoText = s.grupo_socio?.map(g => g.numero_grupo).join(', ') || 'Sin Grupo';
          return (
            <option 
              key={s.socio_id} 
              value={`${s.nombre_completo} (Nº ${s.nro_socio || 'S/N'} - Gpos: ${gpoText})`} 
            />
          );
        })}
      </datalist>

      {/* Header Panel */}
      <div className="dashboard-header animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            Historial de Movimientos
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 500, marginTop: '4px', margin: 0 }}>
            Módulo de visualización, auditoría y carga manual de pagos (efectivo, directo, Pablo y transferencias)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {/* Period selector */}
          <div style={{ 
            background: 'var(--surface)', 
            border: '1px solid var(--border-light)', 
            borderRadius: '16px', 
            padding: '6px 16px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            boxShadow: 'var(--shadow-soft)'
          }}>
            <Calendar size={18} style={{ color: 'var(--accent)' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Período Conciliado</span>
              <select
                value={selectedPeriod}
                onChange={e => setSelectedPeriod(e.target.value)}
                style={{ 
                  background: 'none', border: 'none', color: 'var(--text-primary)', 
                  fontWeight: 800, fontSize: '14px', outline: 'none', cursor: 'pointer', padding: 0 
                }}
              >
                <option value="">Todos los Períodos</option>
                {periods.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <button 
            className="btn-primary" 
            onClick={() => setIsManualModalOpen(true)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '12px 24px', 
              borderRadius: '16px', 
              fontWeight: 700,
              boxShadow: '0 8px 16px rgba(16, 185, 129, 0.2)' 
            }}
          >
            <Plus size={18} />
            Registrar Pago Manual
          </button>
        </div>
      </div>

      {/* Grid of KPI Cards (Premium redisenio) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }} className="animate-fade">
        {/* Card 1: Total Ingresos */}
        <div className="premium-card hover-lift" style={{ 
          background: 'linear-gradient(135deg, var(--surface) 0%, rgba(16, 185, 129, 0.02) 100%)', 
          borderLeft: '5px solid #10b981' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              INGRESOS TOTALES (CRÉDITO)
            </span>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '8px', borderRadius: '12px' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)', margin: '12px 0 4px 0', letterSpacing: '-0.02em' }}>
            ${metrics.totalIngresos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Suma de todos los ingresos del período
          </p>
        </div>

        {/* Card 2: Total Conciliado */}
        <div className="premium-card hover-lift" style={{ 
          background: 'linear-gradient(135deg, var(--surface) 0%, rgba(59, 130, 246, 0.02) 100%)', 
          borderLeft: '5px solid #3b82f6' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              IMPUTADOS / CONCILIADOS
            </span>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '8px', borderRadius: '12px' }}>
              <CheckCircle size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)', margin: '12px 0 4px 0', letterSpacing: '-0.02em' }}>
            ${metrics.totalConciliado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Ingresos vinculados a facturas/socios ({Math.round(metrics.totalIngresos > 0 ? (metrics.totalConciliado / metrics.totalIngresos) * 100 : 0)}%)
          </p>
        </div>

        {/* Card 3: Total Egresos */}
        <div className="premium-card hover-lift" style={{ 
          background: 'linear-gradient(135deg, var(--surface) 0%, rgba(239, 68, 68, 0.02) 100%)', 
          borderLeft: '5px solid #ef4444' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              EGRESOS TOTALES (DÉBITO)
            </span>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '8px', borderRadius: '12px' }}>
              <TrendingDown size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)', margin: '12px 0 4px 0', letterSpacing: '-0.02em' }}>
            ${metrics.totalEgresos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Pagos, impuestos, suscripciones y comisiones
          </p>
        </div>

        {/* Card 4: Gastos y Comisiones */}
        <div className="premium-card hover-lift" style={{ 
          background: 'linear-gradient(135deg, var(--surface) 0%, rgba(249, 115, 22, 0.02) 100%)', 
          borderLeft: '5px solid #f97316' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              IMPUESTOS Y COMISIONES
            </span>
            <div style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', padding: '8px', borderRadius: '12px' }}>
              <Landmark size={20} />
            </div>
          </div>
          <h3 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)', margin: '12px 0 4px 0', letterSpacing: '-0.02em' }}>
            ${metrics.totalImpuestos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Impuestos y comisiones del período
          </p>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="glass-panel animate-fade" style={{ borderRadius: '24px', overflow: 'hidden' }}>
        
        {/* Table Toolbar / Filters */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                Listado de Movimientos Registrados
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                Buscá, auditá, editá o deshacé conciliaciones del período seleccionado.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={handleResetearPeriodo}
                className="action-button hover-lift"
                style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '10px 16px', display: 'flex', alignItems: 'center', fontWeight: 700, borderRadius: '12px' }}
                disabled={loadingHistorial || !selectedPeriod}
              >
                <Trash2 size={16} style={{ marginRight: '8px' }} />
                Resetear Período
              </button>
              <button 
                onClick={fetchHistorial}
                className="action-button"
                style={{ background: 'rgba(0,0,0,0.02)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', padding: '10px 16px', display: 'flex', alignItems: 'center', borderRadius: '12px' }}
                disabled={loadingHistorial}
              >
                <RefreshCw size={16} className={loadingHistorial ? 'animate-spin' : ''} style={{ marginRight: '8px' }} />
                Actualizar
              </button>
            </div>
          </div>

          {/* Fila de Filtros y Búsqueda */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', background: 'rgba(0,0,0,0.01)', padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', flex: 1, minWidth: '240px', margin: 0 }}>
              <Search size={16} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Buscar movimientos por concepto, socio, banco o monto..."
                value={searchHistorial}
                onChange={(e) => setSearchHistorial(e.target.value)}
                style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Banco/Canal:</span>
                <select
                  className="premium-input"
                  style={{ padding: '4px 10px', height: '34px', fontSize: '13px', width: '130px', borderRadius: '8px' }}
                  value={filtroBancoHistorial}
                  onChange={e => setFiltroBancoHistorial(e.target.value)}
                >
                  <option value="TODOS">Todos</option>
                  <option value="CREDICOOP">Credicoop</option>
                  <option value="NACION">Nación</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="DIRECTO">Pago Directo</option>
                  <option value="PAGO_PABLO">Pago a Pablo</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Tipo:</span>
                <select
                  className="premium-input"
                  style={{ padding: '4px 10px', height: '34px', fontSize: '13px', width: '170px', borderRadius: '8px' }}
                  value={filtroTipoHistorial}
                  onChange={e => setFiltroTipoHistorial(e.target.value)}
                >
                  <option value="TODOS">Todos los tipos</option>
                  <option value="TRANSFERENCIA_RECIBIDA">Transf. Recibidas</option>
                  <option value="PAGO_EFECTIVO">Pagos en Efectivo</option>
                  <option value="PAGO_DIRECTO">Pagos Directos</option>
                  <option value="PAGO_PABLO">Pagos a Pablo</option>
                  <option value="TRANSFERENCIA_ENVIADA">Transf. Enviadas</option>
                  <option value="IMPUESTO">Impuestos</option>
                  <option value="COMISION">Comisiones</option>
                  <option value="SUSCRIPCION">Suscripciones</option>
                  <option value="PAGO_ARCA">Pagos ARCA</option>
                  <option value="PAGO_VEP">Pagos VEP</option>
                  <option value="PAGO_SERVICIO">Pagos de Servicios</option>
                  <option value="OTRO_INGRESO">Otros Ingresos</option>
                  <option value="OTRO_EGRESO">Otros Egresos</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Estado:</span>
                <select
                  className="premium-input"
                  style={{ padding: '4px 10px', height: '34px', fontSize: '13px', width: '140px', borderRadius: '8px' }}
                  value={filtroVinculacion}
                  onChange={e => setFiltroVinculacion(e.target.value)}
                >
                  <option value="TODOS">Todos</option>
                  <option value="PENDIENTES">Sin Imputar</option>
                  <option value="COMPLETOS">Imputados / Conciliados</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {loadingHistorial ? (
          <div style={{ padding: '100px', display: 'flex', justifyContent: 'center' }}>
            <Loader2 className="animate-spin" size={40} style={{ color: 'var(--accent)' }} />
          </div>
        ) : filteredHistorial.length === 0 ? (
          <div style={{ padding: '100px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <AlertCircle size={40} style={{ margin: '0 auto 16px', opacity: 0.5, color: 'var(--text-secondary)' }} />
            <p style={{ fontWeight: 700, fontSize: '15px' }}>No se encontraron movimientos registrados</p>
            <p style={{ fontSize: '13px', opacity: 0.7 }}>Pruebe cambiando los filtros o el período seleccionado.</p>
          </div>
        ) : (
          <div className="premium-table-container">
            <table className="premium-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ width: '130px', padding: '16px 24px' }}>Fecha / Banco</th>
                  <th style={{ minWidth: '240px' }}>Detalle del Movimiento</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Débito</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Crédito</th>
                  <th style={{ width: '280px' }}>Conciliado Con</th>
                  <th style={{ width: '160px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistorial.map(mov => (
                  <tr key={mov.movimiento_id} className="table-row-hover">
                    {/* 1. Fecha / Banco */}
                    <td style={{ padding: '16px 24px', fontWeight: 600 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>{formatISODateToAR(mov.fecha_movimiento)}</span>
                        <div>
                          <span style={{ 
                            fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px',
                            background: mov.banco === 'NACION' ? 'rgba(59, 130, 246, 0.1)' : 
                                        mov.banco === 'CREDICOOP' ? 'rgba(16, 185, 129, 0.1)' :
                                        mov.banco === 'EFECTIVO' ? 'rgba(16, 185, 129, 0.15)' :
                                        mov.banco === 'DIRECTO' ? 'rgba(79, 70, 229, 0.15)' : 'rgba(219, 39,  pink, 0.15)',
                            color: mov.banco === 'NACION' ? '#3b82f6' : 
                                   mov.banco === 'CREDICOOP' ? '#10b981' :
                                   mov.banco === 'EFECTIVO' ? '#059669' :
                                   mov.banco === 'DIRECTO' ? '#4f46e5' : '#db2777',
                            display: 'inline-block'
                          }}>
                            {mov.banco}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 2. Detalle del Movimiento */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700 }}>{mov.concepto}</span>
                          {renderTipoMovimientoBadge(mov.tipo_movimiento)}
                        </div>
                        {mov.comprobante && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Comprobante: <span style={{ fontWeight: 600 }}>{mov.comprobante}</span>
                          </div>
                        )}
                        {mov.observaciones && (
                          <div style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                            Obs: {mov.observaciones}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 3. Débito */}
                    <td style={{ textAlign: 'right' }}>
                      {Number(mov.monto) < 0 ? (
                        <span style={{ fontWeight: 900, color: '#ef4444' }}>
                          -${Math.abs(Number(mov.monto)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', opacity: 0.2 }}>-</span>
                      )}
                    </td>

                    {/* 4. Crédito */}
                    <td style={{ textAlign: 'right' }}>
                      {Number(mov.monto) > 0 ? (
                        <span style={{ fontWeight: 900, color: '#10b981' }}>
                          +${Number(mov.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', opacity: 0.2 }}>-</span>
                      )}
                    </td>

                    {/* 5. Conciliado Con */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {mov.socios ? (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700 }}>{mov.socios.nombre_completo}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Nº Socio {mov.socios.nro_socio || 'Sin Nro'}</span>
                          </div>
                        ) : (['IMPUESTO', 'COMISION', 'SUSCRIPCION', 'PAGO_VEP', 'PAGO_SERVICIO', 'PAGO_ARCA'].includes(mov.tipo_movimiento)) ? (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', fontWeight: 600 }}>
                            {mov.tipo_movimiento === 'IMPUESTO' ? 'Gasto Bancario General' :
                             mov.tipo_movimiento === 'COMISION' ? 'Pago Comisión' :
                             mov.tipo_movimiento === 'SUSCRIPCION' ? 'Suscripción General' :
                             mov.tipo_movimiento === 'PAGO_VEP' ? 'Pago de VEP (AFIP)' :
                             mov.tipo_movimiento === 'PAGO_ARCA' ? 'Pago de ARCA' :
                             mov.tipo_movimiento === 'PAGO_SERVICIO' ? 'Pago de Servicio General' : 'Gasto General'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Sin socio asignado</span>
                        )}

                        {mov.liquidaciones_grupos ? (
                          <div style={{ marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            <span style={{ 
                              fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px',
                              background: 'rgba(46, 125, 50, 0.08)', color: 'var(--accent)', display: 'inline-block'
                            }}>
                              Vinc: {mov.liquidaciones_grupos.periodo} - Gpo {mov.liquidaciones_grupos.numero_grupo}
                            </span>
                            {mov.liquidacion_id && (
                              <button
                                onClick={() => openBreakdownModal(mov.liquidacion_id)}
                                style={{
                                  background: 'none', border: 'none', color: 'var(--accent)',
                                  fontSize: '11px', cursor: 'pointer', padding: 0, textDecoration: 'underline',
                                  textAlign: 'left', fontWeight: 'bold'
                                }}
                              >
                                Ver desglose del grupo
                              </button>
                            )}
                          </div>
                        ) : (
                          !(['IMPUESTO', 'COMISION', 'SUSCRIPCION', 'PAGO_VEP', 'PAGO_SERVICIO', 'PAGO_ARCA'].includes(mov.tipo_movimiento)) && (
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Sin factura vinculada</span>
                          )
                        )}
                      </div>
                    </td>

                    {/* 6. Acciones */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          onClick={() => openEditConciliacionModal(mov)}
                          className="action-button"
                          style={{ 
                            background: 'transparent', color: 'var(--accent)', border: '1px solid var(--border-light)',
                            padding: '6px 12px', fontSize: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700
                          }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeshacerConciliacion(mov)}
                          className="action-button"
                          style={{ 
                            background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.15)',
                            padding: '6px 12px', fontSize: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Controles de Paginación para Historial */}
        {totalPagesHistorial > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderTop: '1px solid var(--border-light)', background: 'var(--surface-light)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>
              Mostrando <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{(currentPageHistorial - 1) * itemsPerPage + 1}</span> a <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{Math.min(currentPageHistorial * itemsPerPage, filteredHistorial.length)}</span> de <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{filteredHistorial.length}</span> movimientos
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={() => setCurrentPageHistorial(p => Math.max(1, p - 1))}
                disabled={currentPageHistorial === 1}
                className="pagination-btn-nav"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Anterior
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: '700' }}>
                Página {currentPageHistorial} de {totalPagesHistorial}
              </div>
              <button 
                onClick={() => setCurrentPageHistorial(p => Math.min(totalPagesHistorial, p + 1))}
                disabled={currentPageHistorial === totalPagesHistorial}
                className="pagination-btn-nav"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 1. Modal para Registrar Pago Manual */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title="Registrar Pago Manual / Extra-bancario"
        maxWidth="500px"
      >
        <form onSubmit={handleSaveManualPayment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">Canal / Medio de Pago *</label>
              <select
                className="form-input"
                value={manualForm.tipoPago}
                onChange={e => handleManualTipoPagoChange(e.target.value)}
                required
              >
                <option value="PAGO_EFECTIVO">Efectivo</option>
                <option value="PAGO_DIRECTO">Pago Directo / Transf. Directa</option>
                <option value="PAGO_PABLO">Pago a Pablo</option>
                <option value="TRANSFERENCIA_RECIBIDA">Banco (Transferencia)</option>
                <option value="OTRO_INGRESO">Otro Ingreso</option>
              </select>
            </div>
            <div>
              <label className="form-label">Banco / Caja *</label>
              <select
                className="form-input"
                value={manualForm.banco}
                onChange={e => setManualForm(prev => ({ ...prev, banco: e.target.value }))}
                required
                disabled={['PAGO_EFECTIVO', 'PAGO_DIRECTO', 'PAGO_PABLO'].includes(manualForm.tipoPago)}
              >
                <option value="EFECTIVO">Caja de Efectivo</option>
                <option value="DIRECTO">Pago Directo</option>
                <option value="PAGO_PABLO">Caja Pablo</option>
                <option value="CREDICOOP">Banco Credicoop</option>
                <option value="NACION">Banco Nación</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">Fecha del Pago *</label>
              <input
                type="date"
                className="form-input"
                value={manualForm.fecha}
                onChange={e => setManualForm(prev => ({ ...prev, fecha: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="form-label">Monto ($) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="Ej: 15400"
                className="form-input"
                value={manualForm.monto}
                onChange={e => setManualForm(prev => ({ ...prev, monto: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label">Concepto / Detalle *</label>
            <input
              type="text"
              placeholder="Ej: Pago de abono Julio - Efectivo"
              className="form-input"
              value={manualForm.concepto}
              onChange={e => setManualForm(prev => ({ ...prev, concepto: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="form-label">Socio / Titular (Opcional)</label>
            <input
              type="text"
              list="global-socios-list"
              className="form-input"
              value={manualForm.selectedSocioLabel}
              onChange={e => handleManualSocioChange(e.target.value)}
              placeholder="Escriba para buscar socio..."
            />
          </div>

          <div>
            <label className="form-label">Vincular a Factura Pendiente</label>
            <select
              className="form-input"
              value={manualForm.selectedLiquidationId}
              onChange={e => setManualForm(prev => ({ ...prev, selectedLiquidationId: e.target.value }))}
              disabled={!manualForm.selectedSocioId}
            >
              {!manualForm.selectedSocioId ? (
                <option value="">Seleccione un socio para ver facturas</option>
              ) : manualPendingList.length === 0 ? (
                <option value="">El socio no tiene deudas pendientes en este periodo</option>
              ) : (
                <>
                  <option value="">-- No vincular a deuda (reconciliar más tarde) --</option>
                  {manualPendingList.map(liq => {
                    const fact = Number(liq.monto_total_facturado || 0);
                    const ab = Number(liq.monto_abonado || 0);
                    const pend = fact - ab;
                    return (
                      <option key={liq.liquidacion_id} value={String(liq.liquidacion_id)}>
                        Periodo: {liq.periodo} | {liq.proveedores?.nombre || 'S/D'} (Total: ${fact.toLocaleString('es-AR')} | Pend: ${pend.toLocaleString('es-AR')})
                      </option>
                    );
                  })}
                </>
              )}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="form-label">Nro Comprobante (Opcional)</label>
              <input
                type="text"
                placeholder="Ej: REC-00234"
                className="form-input"
                value={manualForm.comprobante}
                onChange={e => setManualForm(prev => ({ ...prev, comprobante: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">Observaciones (Opcional)</label>
              <input
                type="text"
                placeholder="Cualquier aclaración adicional..."
                className="form-input"
                value={manualForm.observaciones}
                onChange={e => setManualForm(prev => ({ ...prev, observaciones: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              type="button"
              className="action-button"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', width: '40%' }}
              onClick={() => setIsManualModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ width: '60%', justifyContent: 'center' }}
              disabled={manualSaving}
            >
              {manualSaving ? <Loader2 className="animate-spin" size={16} /> : 'Registrar Pago'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Modal para Editar Conciliación / Movimiento */}
      <Modal 
        isOpen={editModal.isOpen} 
        onClose={() => setEditModal(prev => ({ ...prev, isOpen: false }))} 
        title={`Editar Conciliación - Movimiento #${editModal.movement?.movimiento_id || ''}`} 
        maxWidth="450px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border-light)', fontSize: '13px' }}>
            <p style={{ margin: '0 0 6px 0', color: 'var(--text-secondary)', fontWeight: 600 }}>Detalle del Movimiento</p>
            <p style={{ margin: '0 0 4px 0', fontWeight: 800 }}>{editModal.movement?.concepto}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div>
                <p style={{ margin: '0 0 2px 0', color: 'var(--text-secondary)', fontSize: '11px' }}>Banco / Caja</p>
                <p style={{ margin: 0, fontWeight: 700 }}>{editModal.movement?.banco}</p>
              </div>
              <div>
                <p style={{ margin: '0 0 2px 0', color: 'var(--text-secondary)', fontSize: '11px' }}>Monto</p>
                <p style={{ margin: 0, fontWeight: 800, color: Number(editModal.movement?.monto) > 0 ? '#10b981' : '#ef4444' }}>
                  ${Math.abs(Number(editModal.movement?.monto || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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
              value={editModal.selectedSocioLabel}
              onChange={e => handleEditSocioChange(e.target.value)}
              placeholder="Buscar socio por nombre..."
              style={{ marginBottom: 0 }}
            />
          </div>

          <div>
            <label className="form-label">Saldar Factura Pendiente</label>
            <select
              className="form-input"
              value={editModal.selectedLiquidationId}
              onChange={e => setEditModal(prev => ({ ...prev, selectedLiquidationId: e.target.value }))}
              style={{ marginBottom: 0 }}
              disabled={!editModal.selectedSocioId}
            >
              {!editModal.selectedSocioId ? (
                <option value="">Asigne un socio primero</option>
              ) : editModal.pendingList.length === 0 ? (
                <option value="">Ninguna deuda pendiente</option>
              ) : (
                <>
                  <option value="">-- No saldar deuda --</option>
                  {editModal.pendingList.map(liq => {
                    const fact = Number(liq.monto_total_facturado || 0);
                    const ab = Number(liq.monto_abonado || 0);
                    const pend = fact - ab;
                    return (
                      <option key={liq.liquidacion_id} value={String(liq.liquidacion_id)}>
                        Periodo: {liq.periodo} | {liq.proveedores?.nombre || 'S/D'} (Fact: ${fact.toLocaleString('es-AR', { maximumFractionDigits: 0 })} | Pend: ${pend.toLocaleString('es-AR', { maximumFractionDigits: 0 })})
                      </option>
                    );
                  })}
                </>
              )}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button 
              onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))} 
              className="action-button" 
              style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', width: '50%' }} 
              disabled={editModal.saving}
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveEditConciliacion} 
              className="action-button" 
              style={{ width: '50%', fontWeight: 700 }} 
              disabled={editModal.saving || (!editModal.selectedSocioId && editModal.movement?.tipo_movimiento === 'TRANSFERENCIA_RECIBIDA')}
            >
              {editModal.saving ? <Loader2 className="animate-spin" size={16} /> : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 3. Modal para Ver Desglose de Grupo */}
      <DesgloseGrupoModal
        isOpen={breakdownModal.isOpen}
        onClose={() => setBreakdownModal(prev => ({ ...prev, isOpen: false }))}
        loading={breakdownModal.loading}
        groupInfo={breakdownModal.groupInfo}
        members={breakdownModal.members}
        payments={breakdownModal.payments}
        formatISODateToAR={formatISODateToAR}
      />
    </div>
  );
}
