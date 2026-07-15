import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, ArrowUpDown, Loader2, Search
} from 'lucide-react';

export default function LiquidacionesSocio({
  sortedSocioData,
  socioLoading,
  search,
  sortConfig,
  setSortConfig,
  filterProv,
  periods,
  selectedPeriod,
  setSelectedPeriod,
  setFilterProv,
  totalSocioCobrar,
  totalFacturaSinCalcular,
  exportSociosToCSV,
  totalLote
}) {
  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Estados de filtros locales
  const [localSearch, setLocalSearch] = useState('');
  const [localProv, setLocalProv] = useState('');
  const [localFpago, setLocalFpago] = useState('');

  // Filtrar liquidaciones de socios localmente
  const filteredSocios = useMemo(() => {
    return (sortedSocioData || []).filter(d => {
      const matchSearch = !localSearch || 
        d.lineas?.socios?.nombre_completo?.toLowerCase()?.includes(localSearch.toLowerCase()) ||
        d.numero_linea?.includes(localSearch) ||
        d.lineas?.planes_abonos?.nombre_plan?.toLowerCase()?.includes(localSearch.toLowerCase());
      
      const matchProv = !localProv || d.lineas?.proveedores?.nombre === localProv || 
        (localProv === 'CLARO' && d.proveedor_id === 1) || 
        (localProv === 'MOVISTAR' && d.proveedor_id === 2) || 
        (localProv === 'PERSONAL' && d.proveedor_id === 3);
      
      const matchFpago = !localFpago || d.lineas?.socios?.fpago === localFpago;

      return matchSearch && matchProv && matchFpago;
    });
  }, [sortedSocioData, localSearch, localProv, localFpago]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredSocios]);

  const totalPages = Math.ceil(filteredSocios.length / pageSize) || 1;
  const paginatedData = filteredSocios.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Recalcular total dinámico según los registros filtrados
  const filteredTotalSocioCobrar = useMemo(() => {
    return filteredSocios.reduce((acc, d) => acc + Math.round(Number(d.calculado?.totalCobrar || 0) * 100), 0) / 100;
  }, [filteredSocios]);

  return (
    <div className="premium-table-container animate-fade">
      <div style={{ 
        padding: '24px 32px', 
        borderBottom: '1px solid var(--border-light)', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '24px',
        background: 'linear-gradient(to right, rgba(255,255,255,0.02), transparent)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Liquidaciones
            </h3>
            <div style={{ 
              background: 'rgba(59, 130, 246, 0.1)', 
              color: '#3b82f6', 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '12px', 
              fontWeight: 700 
            }}>
              {filteredSocios.length} de {sortedSocioData.length} registros
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 700 }}>
              Período: <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{selectedPeriod || 'Todos los Períodos'}</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)', 
            border: '1px solid rgba(16, 185, 129, 0.2)', 
            padding: '12px 20px', 
            borderRadius: '16px', 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'flex-end', 
            gap: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              TOTAL SOCIOS FILTRADO
            </span>
            <span style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              ${filteredTotalSocioCobrar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
            {totalLote > totalSocioCobrar && (
              <span style={{ fontSize: '10px', opacity: 0.8, color: 'var(--text-secondary)', fontWeight: 800, marginTop: '2px' }}>
                Total Lote (c/débito): ${totalLote.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
          <button 
            className="btn-primary" 
            onClick={exportSociosToCSV} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '14px 24px',
              borderRadius: '14px',
              fontSize: '14px',
              fontWeight: 700,
              boxShadow: '0 8px 16px rgba(16, 185, 129, 0.2)'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Filtros locales y Buscador */}
      <div style={{ padding: '16px 32px', background: 'rgba(0,0,0,0.01)', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ width: '280px', background: 'var(--surface)', margin: 0 }}>
          <Search size={18} />
          <input 
            placeholder="Buscar por socio, línea o plan..." 
            value={localSearch} 
            onChange={e => setLocalSearch(e.target.value)} 
          />
        </div>
        <select 
          className="btn-ghost" 
          value={localProv} 
          onChange={e => setLocalProv(e.target.value)}
          style={{ fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border-light)' }}
        >
          <option value="">Todas las Operadoras</option>
          <option value="CLARO">Claro</option>
          <option value="MOVISTAR">Movistar</option>
          <option value="PERSONAL">Personal</option>
        </select>
        <select 
          className="btn-ghost" 
          value={localFpago} 
          onChange={e => setLocalFpago(e.target.value)}
          style={{ fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border-light)' }}
        >
          <option value="">Todos los Medios de Pago</option>
          <option value="D">Débito Automático</option>
          <option value="M">Cobro Mutual</option>
          <option value="BC">Banco Credicoop</option>
          <option value="R">RapiPago / Pago Fácil</option>
          <option value="E">Efectivo</option>
        </select>
      </div>
      
      {socioLoading ? (
        <div style={{ padding: '100px', textAlign: 'center' }}><Loader2 className="animate-spin" size={40} style={{ color: 'var(--accent)', margin: '0 auto' }} /></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="premium-table" style={{ width: '100%', fontSize: '13px' }}>
            <thead>
              <tr>
                <th onClick={() => handleSort('socio')} style={{ padding: '16px 24px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Socio {sortConfig.key === 'socio' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                  </div>
                </th>
                <th onClick={() => handleSort('linea')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Línea / Plan {sortConfig.key === 'linea' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                  </div>
                </th>
                <th onClick={() => handleSort('baseAb')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                    Abono Base {sortConfig.key === 'baseAb' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                  </div>
                </th>
                <th onClick={() => handleSort('extras')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                    Cargos Extra {sortConfig.key === 'extras' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                  </div>
                </th>
                <th onClick={() => handleSort('descuentos')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                    Descuentos {sortConfig.key === 'descuentos' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                  </div>
                </th>
                <th onClick={() => handleSort('totalCobrar')} style={{ textAlign: 'right', paddingRight: '24px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                    Total a Cobrar {sortConfig.key === 'totalCobrar' ? (sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={12} opacity={0.3} />}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((d, i) => {
                const abonoBaseFull = (d.calculado?.baseAb || 0) + (d.calculado?.cAdmin || 0) + (d.calculado?.cIVA || 0) + (d.calculado?.tarifaAunar || 0);
                return (
                  <tr key={d.consumo_id || i}>
                    <td style={{ padding: '16px 24px', fontWeight: 800 }}>
                      {d.lineas?.socios?.nombre_completo || 'Sin Socio'}
                      {d.lineas?.socios?.nro_socio && (
                        <div style={{ fontSize: '11px', opacity: 0.5, fontWeight: 500 }}>Nº Socio: {d.lineas.socios.nro_socio}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{d.numero_linea}</div>
                      <div style={{ fontSize: '11px', opacity: 0.6 }}>{d.lineas?.planes_abonos?.nombre_plan || 'Plan S/D'}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      ${abonoBaseFull.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {d.calculado?.hasExtras ? (
                        <div style={{ display: 'inline-block', background: '#eff6ff', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                          <span style={{ fontWeight: 800, color: '#1d4ed8' }}>+${d.calculado.extraAmount.toLocaleString('es-AR')}</span>
                          {d.lineas?.socios?.total_cuotas > 0 && (
                            <div style={{ fontSize: '9px', color: '#1d4ed8', fontWeight: 800 }}>
                              CUOTA {d.lineas.socios.cta_numero}/{d.lineas.socios.total_cuotas}
                            </div>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {d.calculado?.bonifManual > 0 ? (
                        <div style={{ display: 'inline-block', background: '#ecfdf5', padding: '4px 8px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                          <span style={{ fontWeight: 800, color: '#059669' }}>
                            -${d.calculado.bonifManual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                          {d.calculado?.appliedDiscountPct > 0 && (
                            <div style={{ fontSize: '9px', color: '#059669', fontWeight: 800, textTransform: 'uppercase', marginTop: '2px' }}>
                              {d.calculado.appliedDiscountPct}% DESC.
                            </div>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--accent)', paddingRight: '24px', fontSize: '15px' }}>
                      ${(d.calculado?.totalCobrar || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              {filteredSocios.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '100px', opacity: 0.5 }}>
                    No se encontraron liquidaciones para este periodo y filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación Premium */}
      {filteredSocios.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 32px',
          borderTop: '1px solid var(--border-light)',
          flexWrap: 'wrap',
          gap: '16px',
          background: 'var(--surface-light)'
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Mostrando <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{Math.min(filteredSocios.length, (currentPage - 1) * pageSize + 1)}-{Math.min(filteredSocios.length, currentPage * pageSize)}</span> de <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{filteredSocios.length}</span> registros
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
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pNum = idx + 1;
                if (totalPages > 6 && pNum !== 1 && pNum !== totalPages && Math.abs(currentPage - pNum) > 1) {
                  if (pNum === 2 && currentPage > 3) return <span key="dots1" style={{ padding: '0 4px', opacity: 0.5 }}>...</span>;
                  if (pNum === totalPages - 1 && currentPage < totalPages - 2) return <span key="dots2" style={{ padding: '0 4px', opacity: 0.5 }}>...</span>;
                  return null;
                }
                
                return (
                  <button
                    key={pNum}
                    onClick={() => setCurrentPage(pNum)}
                    className={`pagination-btn-page ${currentPage === pNum ? 'active' : ''}`}
                  >
                    {pNum}
                  </button>
                );
              })}
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
    </div>
  );
}
