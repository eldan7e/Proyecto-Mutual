import { useMemo } from 'react';

/**
 * Custom Hook to absorb the complex useMemo data calculations
 * from the Facturacion.jsx component.
 */
export default function useFacturacionData(liquidaciones, socioLiquidaciones, activeTab, selectedPeriod, filterProv, search) {
  
  const filteredLiquidaciones = useMemo(() => {
    return (liquidaciones || []).filter(l => {
      const matchPeriod = !selectedPeriod || l.periodo === selectedPeriod;
      const matchSearch = !search || 
        l.socios?.nombre_completo?.toLowerCase()?.includes(search.toLowerCase()) ||
        l.grupos?.alias_grupo?.toLowerCase()?.includes(search.toLowerCase()) ||
        l.numero_grupo?.toString().includes(search);
      const matchProv = !filterProv || l.proveedores?.nombre === filterProv;
      return matchPeriod && matchSearch && matchProv;
    });
  }, [liquidaciones, selectedPeriod, search, filterProv]);

  const stats = useMemo(() => {
    // Use filtered liquidaciones (already filtered by period + provider)
    const periodLiquidaciones = filteredLiquidaciones;

    const totalCosto = periodLiquidaciones.reduce((acc, l) => acc + Math.round(Number(l.costo_operadora_neto || 0) * 100), 0) / 100;
    const totalCobrar = periodLiquidaciones.reduce((acc, l) => acc + Math.round(Number(l.monto_total_facturado || 0) * 100), 0) / 100;
    const totalPagado = periodLiquidaciones.reduce((acc, l) => acc + Math.round(Number(l.monto_abonado || 0) * 100), 0) / 100;
    const totalMargenGestion = periodLiquidaciones.reduce((acc, l) => acc + Math.round(Number(l.beneficio_aunar || 0) * 100), 0) / 100;

    return {
      totalCosto,
      totalCobrar,
      totalPagado,
      totalMargenGestion,
      targetPeriodUsed: selectedPeriod,
      pendientes: periodLiquidaciones.filter(l => l.estado_pago === 'PENDIENTE').length
    };
  }, [filteredLiquidaciones, selectedPeriod]);

  const batches = useMemo(() => {
    const batchesMap = (liquidaciones || []).reduce((acc, l) => {
      if (!l.periodo) return acc;
      // Filtrar por período seleccionado si está definido
      if (selectedPeriod && l.periodo !== selectedPeriod) return acc;

      const prov = l.proveedores;
      const key = `${l.periodo}-${prov?.nombre || 'OTRO'}`;
      if (!acc[key]) {
        acc[key] = {
          periodo: l.periodo,
          proveedor: prov,
          gruposSet: new Set(),
          totalLineas: 0,
          costoNeta: 0,
          totalCobrar: 0,
          montoAbonado: 0,
          estado: 'PENDIENTE'
        };
      }
      acc[key].gruposSet.add(l.numero_grupo);
      const rawCount = Number(l.total_lineas_lote || 0);
      acc[key].totalLineas += rawCount > 0 ? rawCount : 1;
      acc[key].costoNeta = Math.round(acc[key].costoNeta * 100 + Math.round(Number(l.costo_operadora_neto || 0) * 100)) / 100;
      acc[key].totalCobrar = Math.round(acc[key].totalCobrar * 100 + Math.round(Number(l.monto_total_facturado || 0) * 100)) / 100;
      acc[key].montoAbonado = Math.round(acc[key].montoAbonado * 100 + Math.round(Number(l.monto_abonado || 0) * 100)) / 100;
      if (l.estado_pago === 'ABONADO') acc[key].estado = 'ABONADO';
      return acc;
    }, {});

    return Object.values(batchesMap)
      .filter(b => !filterProv || b.proveedor?.nombre === filterProv)
      .sort((a, b) => (b.periodo || '').localeCompare(a.periodo || ''));
  }, [liquidaciones, filterProv, selectedPeriod]);

  const liquidacionesAgrupadas = useMemo(() => {
    if (activeTab !== 'resumen') return [];
    
    const agrupadasMap = filteredLiquidaciones.reduce((acc, l) => {
      const key = `${l.numero_grupo || 0}-${l.periodo || 'S/P'}`;
      if (!acc[key]) acc[key] = { ...l, total_grupo: 0, sum_total_lineas: 0, items: [] };
      acc[key].total_grupo = Math.round(acc[key].total_grupo * 100 + Math.round(Number(l.monto_total_facturado || 0) * 100)) / 100;
      acc[key].sum_total_lineas += Number(l.total_lineas_lote || 0);
      acc[key].items.push(l);
      return acc;
    }, {});

    return Object.values(agrupadasMap);
  }, [filteredLiquidaciones, activeTab]);

  const totalSocioCobrar = useMemo(() => {
    return (socioLiquidaciones || []).reduce((acc, d) => acc + Math.round(Number(d.calculado?.totalCobrar || 0) * 100), 0) / 100;
  }, [socioLiquidaciones]);

  const totalFacturaSinCalcular = useMemo(() => {
    return (socioLiquidaciones || []).reduce((acc, d) => acc + Math.round(Number(d.costo_abono_real || 0) * 100) + Math.round(Number(d.excedentes || 0) * 100) + Math.round(Number(d.otros_cargos_op || 0) * 100), 0) / 100;
  }, [socioLiquidaciones]);

  return {
    filteredLiquidaciones,
    stats,
    batches,
    liquidacionesAgrupadas,
    totalSocioCobrar,
    totalFacturaSinCalcular
  };
}
