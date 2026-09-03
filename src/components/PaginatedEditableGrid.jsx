import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, AlertTriangle, TrendingUp, Hash, Info, Percent, RefreshCw, Loader2, Tag, Zap
} from 'lucide-react';
import DescuentoModal from './CargaManual/DescuentoModal';

const isFixedOrInternet = (p) => {
  if (!p) return false;
  const l = p.toLowerCase();
  return l.includes('fijo') || l.includes('fija') || l.includes('internet') || l.includes('a100e') || l.includes('ctf14');
};

export const arePlansEquivalent = (p1, p2) => {
  if (!p1 || !p2) return false;
  if (isFixedOrInternet(p1) && isFixedOrInternet(p2)) return true;
  const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").replace(/personal|claro|movistar|plan/g, "");
  return normalize(p1) === normalize(p2);
};

function DropdownItem({ label, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ 
        padding: '8px 12px', 
        fontSize: '11px', 
        cursor: 'pointer',
        borderBottom: '1px solid var(--border-light)',
        fontWeight: 600,
        color: hover ? 'var(--accent)' : 'var(--text-primary)',
        background: hover ? 'var(--accent-light)' : 'transparent',
        transition: 'all 0.15s ease'
      }}
    >
      {label}
    </div>
  );
}

function SearchableSocioSelect({ allSocios, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredSocios = React.useMemo(() => {
    if (!searchTerm) return allSocios.slice(0, 100);
    return allSocios.filter(s => 
      s.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 100);
  }, [allSocios, searchTerm]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClose = () => setIsOpen(false);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [isOpen]);

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: '100%', minWidth: '180px' }} onClick={e => e.stopPropagation()}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          background: 'var(--surface)', 
          border: '1px solid var(--border-light)', 
          borderRadius: '8px', 
          padding: '4px 8px',
          cursor: 'pointer'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Search size={12} style={{ opacity: 0.5, marginRight: '6px' }} />
        <input 
          type="text" 
          placeholder="+ Vincular Socio..." 
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            outline: 'none', 
            width: '100%', 
            fontSize: '11px', 
            color: 'var(--text-primary)',
            padding: 0
          }}
        />
      </div>
      {isOpen && (
        <div style={{ 
          position: 'absolute', 
          top: '100%', 
          left: 0, 
          right: 0, 
          maxHeight: '200px', 
          overflowY: 'auto', 
          background: 'var(--modal-bg, #ffffff)', 
          border: '1px solid var(--border-light)', 
          borderRadius: '8px', 
          zIndex: 1000,
          boxShadow: 'var(--shadow-premium)',
          marginTop: '4px'
        }}>
          {filteredSocios.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-secondary)' }}>Sin resultados</div>
          ) : (
            filteredSocios.map(s => (
              <DropdownItem 
                key={s.socio_id}
                label={s.nombre_completo}
                onClick={() => {
                  onSelect(s.socio_id);
                  setSearchTerm('');
                  setIsOpen(false);
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SearchableLineaSelect({ dbLines, selectedProvider, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const currentProvId = { 'claro': 1, 'movistar': 2, 'personal': 3 }[selectedProvider];
  
  const filteredLines = React.useMemo(() => {
    const list = Array.from(dbLines.entries())
      .filter(([norm, info]) => info.proveedor_id === currentProvId)
      .map(([norm, info]) => ({ norm, info }));
      
    if (!searchTerm) return list.slice(0, 100);
    
    return list.filter(item => 
      item.norm.includes(searchTerm) || 
      item.info.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 100);
  }, [dbLines, selectedProvider, searchTerm, currentProvId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClose = () => setIsOpen(false);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [isOpen]);

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: '100%', minWidth: '180px' }} onClick={e => e.stopPropagation()}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          background: 'var(--surface)', 
          border: '1px solid var(--border-light)', 
          borderRadius: '8px', 
          padding: '4px 8px',
          cursor: 'pointer'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Search size={12} style={{ opacity: 0.5, marginRight: '6px' }} />
        <input 
          type="text" 
          placeholder="+ Vincular Línea..." 
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            outline: 'none', 
            width: '100%', 
            fontSize: '11px', 
            color: 'var(--text-primary)',
            padding: 0
          }}
        />
      </div>
      {isOpen && (
        <div style={{ 
          position: 'absolute', 
          top: '100%', 
          left: 0, 
          right: 0, 
          maxHeight: '200px', 
          overflowY: 'auto', 
          background: 'var(--modal-bg, #ffffff)', 
          border: '1px solid var(--border-light)', 
          borderRadius: '8px', 
          zIndex: 1000,
          boxShadow: 'var(--shadow-premium)',
          marginTop: '4px'
        }}>
          {filteredLines.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-secondary)' }}>Sin resultados</div>
          ) : (
            filteredLines.map(item => (
              <DropdownItem 
                key={item.norm}
                label={`${item.norm} - ${item.info.nombre || 'Sin socio'}`}
                onClick={() => {
                  onSelect(item.norm);
                  setSearchTerm('');
                  setIsOpen(false);
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---- Memoized Row Component ----
const descuentoBtnStyle = {
  background: 'rgba(16, 185, 129, 0.1)',
  color: '#10b981',
  border: '1px solid rgba(16, 185, 129, 0.2)',
  fontSize: '11px',
  fontWeight: 700,
  padding: '4px 8px',
  borderRadius: '6px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px'
};

const updatePlanBtnStyle = {
  background: 'rgba(37, 99, 235, 0.1)',
  border: 'none',
  color: '#2563eb',
  fontSize: '9px',
  fontWeight: 800,
  padding: '2px 6px',
  borderRadius: '4px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
  transition: 'all 0.2s'
};

const GridRow = React.memo(function GridRow({ row, selectedProvider, dbLines, allSocios, handleAssignLinea, handleAssignSocio, onUpdateLineaPlan, onOpenDescuento }) {
  const prevPrice = row.prevAbonoBase || 0;
  const currentPrice = row.abono || 0;
  const diffPct = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
  const isError = row.montoFactura < row.abono;

  return (
    <tr className={isError ? 'row-error' : ''} style={{ 
      background: isError ? '#fef2f2' : 'transparent',
      borderLeft: row.auditStatus === 'WARN' ? '4px solid #ef4444' : 'none'
    }}>
      <td>
        {row.linea.startsWith('SUELTA_') ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontWeight: 800, fontSize: '14px', color: '#ef4444' }}>{row.linea}</div>
            <SearchableLineaSelect 
              dbLines={dbLines}
              selectedProvider={selectedProvider}
              onSelect={(newLinea) => handleAssignLinea(row.linea, newLinea)}
            />
          </div>
        ) : (
          <div style={{ fontWeight: 800, fontSize: '14px' }}>{row.linea}</div>
        )}
         <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Mut: {row.planOficial}</div>
        <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
          <span>Fac: {row.plan}</span>
           {row.plan && !arePlansEquivalent(row.plan, row.planOficial) && onUpdateLineaPlan && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateLineaPlan(row.linea, row.plan, row.abono || 0);
              }}
              style={updatePlanBtnStyle}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(37, 99, 235, 0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(37, 99, 235, 0.1)'}
            >
              Actualizar en DB
            </button>
          )}
        </div>
        
        {/* Renderizado de Alertas Dinámicas */}
        {row.alertas?.map((alerta, i) => (
          <div key={i} style={{ 
            fontSize: '9px', 
            color: alerta.tipo === 'CRITICAL' ? '#ef4444' : alerta.tipo === 'INFO' ? '#3b82f6' : '#10b981', 
            fontWeight: 800, 
            marginTop: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {alerta.tipo === 'CRITICAL' && <AlertTriangle size={10} />}
            {alerta.tipo === 'INFO' && <Info size={10} />}
            {alerta.msg}
          </div>
        ))}
      </td>
      <td>
        {row.isValid ? (
          <div style={{ fontWeight: 700, fontSize: '13px' }}>{row.socioNombre}</div>
        ) : (
          <SearchableSocioSelect 
            allSocios={allSocios} 
            onSelect={(socioId) => handleAssignSocio(row.linea, socioId)} 
          />
        )}
      </td>
      {(selectedProvider === 'claro' || selectedProvider === 'movistar' || selectedProvider === 'personal') && (
        <>
          <td style={{ textAlign: 'center', color: '#64748b', fontSize: '11px' }}>
            <div style={{fontSize: '9px', color: '#94a3b8'}}>LISTA</div>
            {(() => {
              const displayListPrice = (Number(row.precioListaOriginal) > 0) ? Number(row.precioListaOriginal) : Number(row.precioOficial || 0);
              return displayListPrice > 0 ? `$${displayListPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '--';
            })()}
          </td>
          <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 600, fontSize: '11px' }}>
            <div style={{fontSize: '9px', color: '#94a3b8'}}>DESCUENTOS</div>
            {selectedProvider === 'claro' ? (
              Number(row.descuentoOriginal || 0) !== 0 ? `-$${Math.abs(Number(row.descuentoOriginal)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'
            ) : (
              (() => {
                const pLista = (Number(row.precioListaOriginal) > 0) ? Number(row.precioListaOriginal) : (Number(row.precioOficial) || 0);
                const descPct = pLista > 0 ? ((pLista - row.abono) / pLista) * 100 : 0;
                const expectedPct = row.descuentoEsperado || (selectedProvider === 'claro' ? 85 : 80);
                const meets80 = descPct >= (expectedPct - 2.5);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ color: meets80 ? '#10b981' : '#ef4444', fontWeight: 800 }}>
                      {descPct > 0 ? `${descPct.toFixed(2)}%` : '0%'}
                    </span>
                    <span style={{ fontSize: '9px', color: meets80 ? '#059669' : '#dc2626' }}>
                      (Esp: {expectedPct}%)
                    </span>
                  </div>
                );
              })()
            )}
          </td>
        </>
      )}
      <td style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{prevPrice > 0 ? `$${prevPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '--'}</div>
      </td>
      <td style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: '14px' }}>${currentPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
      </td>
      <td style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '13px', color: '#f59e0b', fontWeight: 600 }}>
          {row.excedentes > 0 ? `$${row.excedentes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '--'}
        </div>
      </td>
      <td style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: '14px', color: 'var(--text-primary)' }}>${row.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
        {row.montoFactura === 0 && <div style={{ fontSize: '9px', color: '#10b981', fontWeight: 800 }}>(Fac: $0,00)</div>}
      </td>
      <td style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          {prevPrice > 0 ? (
            <div style={{ 
              fontSize: '10px', 
              fontWeight: 800, 
              color: diffPct > 1 ? '#ef4444' : diffPct < -1 ? '#3b82f6' : '#10b981' 
            }}>
              {Math.abs(diffPct) < 0.1 ? (
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>0% (Sin var.)</span>
              ) : (
                <span>{diffPct > 0 ? '↑' : '↓'} {Math.abs(diffPct).toFixed(1)}% {diffPct > 0 ? 'AUMENTO' : 'BAJA'}</span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '9px', color: '#94a3b8' }}>Sin datos previos</div>
          )}
        </div>
      </td>
      <td style={{ textAlign: 'center' }}>
        <button
          onClick={() => onOpenDescuento(row)}
          title="Aplicar o gestionar descuento"
          className="air-btn"
          style={descuentoBtnStyle}
        >
          <Tag size={12} /> Descuento
        </button>
      </td>
    </tr>
  );
});

export function PaginatedEditableGrid({
  fileData,
  setFileData,
  dbLines,
  search,
  setSearch,
  sortByAnomalies,
  setSortByAnomalies,
  selectedProvider,
  onIncidentClick,
  allSocios,
  handleAssignSocio,
  handleAssignLinea,
  prevConsumosData,
  selectedRows,
  setSelectedRows,
  onUpdateLineaPlan,
  onUpdateAllLineasPlanes,
  isUpdatingPlanes,
  onApplyDescuento
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [filterExcedentes, setFilterExcedentes] = useState(false);
  const [filterBonificacion, setFilterBonificacion] = useState(false);
  const [filterAumentos, setFilterAumentos] = useState(false);
  const [selectedRowForDescuento, setSelectedRowForDescuento] = useState(null);
  const [isDescuentoModalOpen, setIsDescuentoModalOpen] = useState(false);
  const [showBonifDropdown, setShowBonifDropdown] = useState(false);
  const [filterBonifPct, setFilterBonifPct] = useState(null);

  // Identifica si una fila tiene cambio de plan, plan sin registrar o número sin datos
  const isPlanOrDataIssue = useCallback((row) => {
    if (!row) return false;
    // 1. Cambio de plan: el plan facturado difiere del oficial registrado
    const hasPlanDiff = Boolean(
      row.plan && 
      row.planOficial && 
      row.planOficial !== 'No registrado' && 
      !arePlansEquivalent(row.plan, row.planOficial)
    );
    // 2. Plan sin registrar en DB o sin plan
    const hasUnregisteredPlan = Boolean(
      !row.planOficial || 
      row.planOficial === 'No registrado' || 
      !row.plan
    );
    // 3. Número sin datos (línea suelta, no válida en DB o sin socio asignado)
    const isNumeroSinDatos = Boolean(
      !row.isValid || 
      row.linea?.startsWith('SUELTA_') || 
      !row.socioNombre || 
      row.socioNombre === 'Sin asignar' || 
      row.socioNombre === 'No registrado' ||
      !row.socioId
    );

    return hasPlanDiff || hasUnregisteredPlan || isNumeroSinDatos;
  }, []);

  const pendingPlanOrDataCount = React.useMemo(() => {
    return (fileData || []).filter(row => isPlanOrDataIssue(row)).length;
  }, [fileData, isPlanOrDataIssue]);

  const pendingPlanUpdatesCount = React.useMemo(() => {
    return (fileData || []).filter(row => row.plan && !arePlansEquivalent(row.plan, row.planOficial)).length;
  }, [fileData]);

  // Calcular grupos de % de bonificación presentes en los datos
  const bonifGroups = React.useMemo(() => {
    if (!fileData || !fileData.length) return [];
    const countByPct = new Map();
    fileData.forEach(row => {
      const pLista = Number(row.precioListaOriginal) > 0 ? Number(row.precioListaOriginal) : Number(row.precioOficial || 0);
      if (pLista <= 0) return;
      const abono = row.abono || 0;
      const descPct = ((pLista - abono) / pLista) * 100;
      if (descPct < 0 || descPct > 100) return;
      // Redondear al entero más cercano para agrupar
      const rounded = Math.round(descPct);
      countByPct.set(rounded, (countByPct.get(rounded) || 0) + 1);
    });
    // Ordenar de mayor a menor porcentaje
    return Array.from(countByPct.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([pct, count]) => ({ pct, count }));
  }, [fileData]);


  const filteredData = React.useMemo(() => {
    return fileData
      .filter(row => {
        const matchesSearch = row.linea.includes(search) || row.socioNombre?.toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;

        if (sortByAnomalies) {
          return isPlanOrDataIssue(row);
        }

        if (filterExcedentes) {
          return (row.excedentes || 0) > 0;
        }

        if (filterBonifPct !== null) {
          const pLista = Number(row.precioListaOriginal) > 0 ? Number(row.precioListaOriginal) : Number(row.precioOficial || 0);
          if (pLista <= 0) return false;
          const descPct = ((pLista - (row.abono || 0)) / pLista) * 100;
          return Math.round(descPct) === filterBonifPct;
        }

        if (filterBonificacion) {
          const hasBonifAlert = (row.alertas || []).some(al => 
            al.msg.includes('BONIF') || al.msg.includes('DESVÍO') || al.msg.includes('DESVIO')
          );
          const anyBonifAlert = fileData.some(r => (r.alertas || []).some(al => al.msg.includes('BONIF') || al.msg.includes('DESVÍO') || al.msg.includes('DESVIO')));
          if (anyBonifAlert) {
            return hasBonifAlert;
          }
          return true;
        }

        if (filterAumentos) {
          const currentPrice = row.abono || 0;
          const prevPrice = row.prevAbonoBase || 0;
          const hasPriceIncrease = prevPrice > 0 ? (currentPrice - prevPrice) > 0.05 : false;
          const hasIncreaseAlert = (row.alertas || []).some(al => 
            al.msg.includes('AUMENTO') || al.msg.includes('DESVÍO') || al.msg.includes('DESVIO') || al.msg.includes('VAR')
          );
          const anyIncrease = fileData.some(r => {
            const cp = r.abono || 0;
            const pp = r.prevAbonoBase || 0;
            return (pp > 0 && (cp - pp) > 0.05) || (r.alertas || []).some(al => al.msg.includes('AUMENTO') || al.msg.includes('VAR'));
          });
          if (anyIncrease) {
            return hasPriceIncrease || hasIncreaseAlert;
          }
          return true;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortByAnomalies) {
          // 1. Números sin datos o líneas sueltas primero (mayor urgencia)
          const aNoData = (!a.isValid || a.linea?.startsWith('SUELTA_') || !a.socioNombre) ? 1 : 0;
          const bNoData = (!b.isValid || b.linea?.startsWith('SUELTA_') || !b.socioNombre) ? 1 : 0;
          if (bNoData !== aNoData) return bNoData - aNoData;

          // 2. Planes no registrados
          const aNoPlan = (!a.planOficial || a.planOficial === 'No registrado') ? 1 : 0;
          const bNoPlan = (!b.planOficial || b.planOficial === 'No registrado') ? 1 : 0;
          if (bNoPlan !== aNoPlan) return bNoPlan - aNoPlan;

          // 3. Cambios de plan (plan facturado difiere del registrado en DB)
          const aPlanDiff = (a.plan && !arePlansEquivalent(a.plan, a.planOficial)) ? 1 : 0;
          const bPlanDiff = (b.plan && !arePlansEquivalent(b.plan, b.planOficial)) ? 1 : 0;
          return bPlanDiff - aPlanDiff;
        }

        if (filterExcedentes) {
          const excA = a.excedentes || 0;
          const excB = b.excedentes || 0;
          return excB - excA; 
        }

        if (filterBonificacion && filterBonifPct === null) {
          const pListaA = Number(a.precioListaOriginal) > 0 ? Number(a.precioListaOriginal) : Number(a.precioOficial || 0);
          const discA = pListaA > 0 ? ((pListaA - (a.abono || 0)) / pListaA) * 100 : 0;
          const expectedA = a.descuentoEsperado || (selectedProvider === 'claro' ? 85 : 80);
          const devA = expectedA - discA;

          const pListaB = Number(b.precioListaOriginal) > 0 ? Number(b.precioListaOriginal) : Number(b.precioOficial || 0);
          const discB = pListaB > 0 ? ((pListaB - (b.abono || 0)) / pListaB) * 100 : 0;
          const expectedB = b.descuentoEsperado || (selectedProvider === 'claro' ? 85 : 80);
          const devB = expectedB - discB;

          if (Math.abs(devB - devA) > 0.01) {
            return devB - devA;
          }
          return discA - discB;
        }

        if (filterAumentos) {
          const prevA = a.prevAbonoBase || 0;
          const currA = a.abono || 0;
          const pctA = prevA > 0 ? ((currA - prevA) / prevA) * 100 : 0;
          const diffA = currA - prevA;

          const prevB = b.prevAbonoBase || 0;
          const currB = b.abono || 0;
          const pctB = prevB > 0 ? ((currB - prevB) / prevB) * 100 : 0;
          const diffB = currB - prevB;

          // De menor a mayor aumento
          if (Math.abs(pctA - pctB) > 0.001) {
            return pctA - pctB;
          }
          return diffA - diffB;
        }

        return 0;
      });
  }, [fileData, search, sortByAnomalies, filterExcedentes, filterBonificacion, filterBonifPct, filterAumentos, selectedProvider]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(new Set(filteredData.map(r => r.linea)));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (linea) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(linea)) newSelected.delete(linea);
    else newSelected.add(linea);
    setSelectedRows(newSelected);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortByAnomalies, filterExcedentes, filterBonificacion, filterBonifPct, filterAumentos]);

  // Cerrar dropdown de bonif al hacer click afuera
  useEffect(() => {
    if (!showBonifDropdown) return;
    const close = () => setShowBonifDropdown(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showBonifDropdown]);

  return (
    <div className="air-card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>Previsualización Detallada</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          
          {/* Button 1: Priorizar Cambios de Plan */}
          <button 
            title="Mostrar cambios de plan, planes no registrados o números sin datos"
            onClick={() => {
              setFilterExcedentes(false);
              setFilterBonificacion(false);
              setFilterBonifPct(null);
              setShowBonifDropdown(false);
              setFilterAumentos(false);
              setSortByAnomalies(!sortByAnomalies);
            }}
            className="air-btn" 
            style={{ 
              background: sortByAnomalies ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface)', 
              color: sortByAnomalies ? '#ef4444' : 'var(--text-secondary)',
              border: `1px solid ${sortByAnomalies ? '#ef4444' : 'var(--border-light)'}`,
              display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <AlertTriangle size={16} /> Priorizar Cambios de Plan {pendingPlanOrDataCount > 0 && (
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                background: sortByAnomalies ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
                color: sortByAnomalies ? '#ffffff' : '#ef4444',
                padding: '1px 6px',
                borderRadius: '8px'
              }}>{pendingPlanOrDataCount}</span>
            )}
          </button>
          
          {/* Button 2: Priorizar Bonificación + Dropdown de % */}
          <div style={{ position: 'relative', display: 'inline-flex' }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => {
                setSortByAnomalies(false);
                setFilterExcedentes(false);
                setFilterAumentos(false);
                setShowBonifDropdown(false);
                if (filterBonifPct !== null || filterBonificacion) {
                  setFilterBonificacion(false);
                  setFilterBonifPct(null);
                } else {
                  setFilterBonificacion(true);
                }
              }}
              className="air-btn" 
              style={{ 
                background: (filterBonificacion || filterBonifPct !== null) ? 'rgba(168, 85, 247, 0.1)' : 'var(--surface)', 
                color: (filterBonificacion || filterBonifPct !== null) ? '#9333ea' : 'var(--text-secondary)',
                border: `1px solid ${(filterBonificacion || filterBonifPct !== null) ? '#9333ea' : 'var(--border-light)'}`,
                display: 'flex', alignItems: 'center', gap: '8px',
                borderRadius: '10px 0 0 10px',
                borderRight: 'none'
              }}
            >
              <Percent size={16} /> {filterBonifPct !== null ? `Bonif: ${filterBonifPct}%` : 'Priorizar Bonificación'}
            </button>
            {/* Chevron para abrir el dropdown de % de bonificación */}
            <button
              title="Ver distribución de % de bonificación"
              onClick={() => setShowBonifDropdown(prev => !prev)}
              className="air-btn"
              style={{
                background: showBonifDropdown || filterBonifPct !== null || filterBonificacion ? 'rgba(168, 85, 247, 0.18)' : 'var(--surface)',
                color: (filterBonifPct !== null || filterBonificacion) ? '#9333ea' : 'var(--text-secondary)',
                border: `1px solid ${(filterBonifPct !== null || filterBonificacion) ? '#9333ea' : 'var(--border-light)'}`,
                borderRadius: '0 10px 10px 0',
                padding: '8px 10px',
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '11px', fontWeight: 700
              }}
            >
              ▾
            </button>
            {/* Dropdown */}
            {showBonifDropdown && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                minWidth: '220px',
                background: 'var(--modal-bg, #ffffff)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                boxShadow: 'var(--shadow-premium)',
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
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-light)',
                    background: (filterBonifPct === null && !filterBonificacion) ? 'rgba(168, 85, 247, 0.08)' : 'transparent',
                    color: (filterBonifPct === null && !filterBonificacion) ? '#9333ea' : 'var(--text-secondary)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <span>Todos los socios</span>
                  <span style={{ fontSize: '10px', background: 'var(--border-light)', padding: '2px 6px', borderRadius: '6px' }}>{fileData.length}</span>
                </div>
                {bonifGroups.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-secondary)' }}>Sin datos de lista de precios</div>
                ) : (
                  bonifGroups.map(({ pct, count }) => (
                    <div
                      key={pct}
                      onClick={() => {
                        setFilterBonifPct(pct);
                        setFilterBonificacion(true);
                        setFilterExcedentes(false);
                        setSortByAnomalies(false);
                        setFilterAumentos(false);
                        setShowBonifDropdown(false);
                      }}
                      style={{
                        padding: '8px 14px',
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
                      <span>
                        <span style={{ color: '#9333ea', marginRight: '6px' }}>●</span>
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

          {/* Button 3: Priorizar Excedentes */}
          <button 
            onClick={() => {
              setSortByAnomalies(false);
              setFilterBonificacion(false);
              setFilterBonifPct(null);
              setShowBonifDropdown(false);
              setFilterAumentos(false);
              setFilterExcedentes(!filterExcedentes);
            }}
            className="air-btn" 
            style={{ 
              background: filterExcedentes ? 'rgba(245, 158, 11, 0.12)' : 'var(--surface)', 
              color: filterExcedentes ? '#d97706' : 'var(--text-secondary)',
              border: `1px solid ${filterExcedentes ? '#f59e0b' : 'var(--border-light)'}`,
              display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <Zap size={16} /> Priorizar Excedentes
          </button>

          {/* Button 4: Priorizar Aumentos (de menor a mayor) */}
          <button 
            title="Priorizar aumentos de menor a mayor"
            onClick={() => {
              setSortByAnomalies(false);
              setFilterBonificacion(false);
              setFilterBonifPct(null);
              setShowBonifDropdown(false);
              setFilterExcedentes(false);
              setFilterAumentos(!filterAumentos);
            }}
            className="air-btn" 
            style={{ 
              background: filterAumentos ? 'rgba(37, 99, 235, 0.1)' : 'var(--surface)', 
              color: filterAumentos ? '#2563eb' : 'var(--text-secondary)',
              border: `1px solid ${filterAumentos ? '#2563eb' : 'var(--border-light)'}`,
              display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <TrendingUp size={16} /> Priorizar Aumentos
          </button>

          <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--border-light)', minWidth: '240px' }}>
            <Search size={16} color="var(--text-secondary)" />
            <input 
              type="text" 
              placeholder="Buscar por línea o socio..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '13px', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
      <table className="air-table">
        <thead>
            <tr>
              <th>Línea / Plan</th>
              <th>Socio</th>
              {(selectedProvider === 'claro' || selectedProvider === 'movistar' || selectedProvider === 'personal') && (
                <>
                  <th style={{ textAlign: 'center' }}>Precio Lista</th>
                  <th style={{ textAlign: 'center' }}>Descuentos</th>
                </>
              )}
              <th style={{ textAlign: 'center' }}>Mes Ant.</th>
              <th style={{ textAlign: 'center' }}>Mes Actual</th>
              <th style={{ textAlign: 'center' }}>Excedentes</th>
              <th style={{ textAlign: 'center' }}>Total</th>
              <th style={{ textAlign: 'center' }}>Variación</th>
              <th style={{ textAlign: 'center' }}>Acciones</th>
            </tr>
        </thead>
        <tbody>
          {paginatedData.map((row, idx) => (
              <GridRow 
                key={row.linea || idx}
                row={row}
                selectedProvider={selectedProvider}
                dbLines={dbLines}
                allSocios={allSocios}
                handleAssignLinea={handleAssignLinea}
                handleAssignSocio={handleAssignSocio}
                onUpdateLineaPlan={onUpdateLineaPlan}
                onOpenDescuento={(r) => {
                  setSelectedRowForDescuento(r);
                  setIsDescuentoModalOpen(true);
                }}
              />
            ))}
          {paginatedData.length === 0 && (
            <tr>
              <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                No se encontraron líneas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border-light)', background: 'var(--surface)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>
            Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredData.length)} de {filteredData.length} líneas
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="air-btn"
              style={{ padding: '6px 12px', fontSize: '12px', opacity: currentPage === 1 ? 0.5 : 1 }}
            >
              Anterior
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '700' }}>
              Página {currentPage} de {totalPages}
            </div>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="air-btn"
              style={{ padding: '6px 12px', fontSize: '12px', opacity: currentPage === totalPages ? 0.5 : 1 }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modal de Aplicación de Descuento */}
      {isDescuentoModalOpen && selectedRowForDescuento && (
        <DescuentoModal
          isOpen={isDescuentoModalOpen}
          onClose={() => {
            setIsDescuentoModalOpen(false);
            setSelectedRowForDescuento(null);
          }}
          row={selectedRowForDescuento}
          onApply={async (data) => {
            if (onApplyDescuento) {
              await onApplyDescuento(data);
            }
          }}
        />
      )}
    </div>
  );
}
