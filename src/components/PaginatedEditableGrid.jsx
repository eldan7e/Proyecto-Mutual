import React, { useState, useEffect } from 'react';
import {
  Search, AlertTriangle, TrendingUp, Hash, Info, Percent
} from 'lucide-react';

const isFixedOrInternet = (p) => {
  if (!p) return false;
  const l = p.toLowerCase();
  return l.includes('fijo') || l.includes('fija') || l.includes('internet') || l.includes('a100e') || l.includes('ctf14');
};

const arePlansEquivalent = (p1, p2) => {
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
                label={`${item.norm} (${item.info.nombre})`}
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
  onUpdateLineaPlan
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [filterExcedentes, setFilterExcedentes] = useState(false);
  const [filterBajasBonif, setFilterBajasBonif] = useState(false);

  const filteredData = React.useMemo(() => {
    return fileData
      .filter(row => {
        const matchesSearch = row.linea.includes(search) || row.socioNombre?.toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;
        if (filterExcedentes) {
          return (row.excedentes || 0) > 0;
        }
        
        return true;
      })
      .sort((a, b) => {
        if (sortByAnomalies) {
          const aCritical = (!a.isValid || a.linea.startsWith('SUELTA_') || a.planOficial === 'No registrado' || a.auditStatus === 'WARN') ? 1 : 0;
          const bCritical = (!b.isValid || b.linea.startsWith('SUELTA_') || b.planOficial === 'No registrado' || b.auditStatus === 'WARN') ? 1 : 0;
          if (bCritical !== aCritical) return bCritical - aCritical;

          const aAlerts = a.alertas && a.alertas.length > 0 ? 1 : 0;
          const bAlerts = b.alertas && b.alertas.length > 0 ? 1 : 0;
          return bAlerts - aAlerts;
        }
        if (filterExcedentes) {
          const excA = a.excedentes || 0;
          const excB = b.excedentes || 0;
          return excB - excA; // Mayor a Menor excedente
        }
        if (filterBajasBonif) {
          const discA = a.precioOficial > 0 ? Math.abs(((a.precioOficial - a.abono) / a.precioOficial) * 100) : 0;
          const discB = b.precioOficial > 0 ? Math.abs(((b.precioOficial - b.abono) / b.precioOficial) * 100) : 0;
          return discA - discB;
        }
        return 0;
      });
  }, [fileData, search, sortByAnomalies, filterExcedentes, filterBajasBonif, selectedProvider]);

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
  }, [search, sortByAnomalies, filterExcedentes, filterBajasBonif]);

  return (
    <div className="air-card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>Previsualización Detallada</h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          
          {/* Button 1: Priorizar Cambios */}
          <button 
            onClick={() => {
              setFilterExcedentes(false);
              setFilterBajasBonif(false);
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
            <AlertTriangle size={16} /> Priorizar Cambios
          </button>
          
          {/* Button 2: Priorizar Excedentes */}
          <button 
            onClick={() => {
              setSortByAnomalies(false);
              setFilterBajasBonif(false);
              setFilterExcedentes(!filterExcedentes);
            }}
            className="air-btn" 
            style={{ 
              background: filterExcedentes ? 'rgba(16, 185, 129, 0.1)' : 'var(--surface)', 
              color: filterExcedentes ? '#10b981' : 'var(--text-secondary)',
              border: `1px solid ${filterExcedentes ? '#10b981' : 'var(--border-light)'}`,
              display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <TrendingUp size={16} /> Priorizar Excedentes
          </button>

          {/* Button 3: Priorizar Bonificación */}
          <button 
            onClick={() => {
              setFilterExcedentes(false);
              setSortByAnomalies(false);
              setFilterBajasBonif(!filterBajasBonif);
            }}
            className="air-btn" 
            style={{ 
              background: filterBajasBonif ? 'rgba(168, 85, 247, 0.1)' : 'var(--surface)', 
              color: filterBajasBonif ? '#a855f7' : 'var(--text-secondary)',
              border: `1px solid ${filterBajasBonif ? '#a855f7' : 'var(--border-light)'}`,
              display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <Percent size={16} /> Priorizar Bonificación
          </button>
          <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--border-light)', width: '300px' }}>
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
              {(selectedProvider === 'claro' || selectedProvider === 'movistar') && (
                <>
                  <th style={{ textAlign: 'center' }}>Precio Lista</th>
                  <th style={{ textAlign: 'center' }}>Bonif.</th>
                </>
              )}
              <th style={{ textAlign: 'center' }}>Mes Ant.</th>
              <th style={{ textAlign: 'center' }}>Mes Actual</th>
              <th style={{ textAlign: 'center' }}>Excedentes</th>
              <th style={{ textAlign: 'center' }}>Total</th>
              <th style={{ textAlign: 'center' }}>Audit. Variación</th>
            </tr>
        </thead>
        <tbody>
          {paginatedData.map((row, idx) => {
            const currentProvId = selectedProvider === 'claro' ? 1 : selectedProvider === 'movistar' ? 2 : 3;
            const prevPrice = row.prevAbonoBase || 0;
            
            const currentPrice = row.abono || 0;
            const diffPct = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
            
            const isError = row.montoFactura < row.abono;

            return (
              <tr key={idx} className={isError ? 'row-error' : ''} style={{ 
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
                        style={{
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
                        }}
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
                {(selectedProvider === 'claro' || selectedProvider === 'movistar') && (
                  <>
                    <td style={{ textAlign: 'center', color: '#64748b', fontSize: '11px' }}>
                      <div style={{fontSize: '9px', color: '#94a3b8'}}>LISTA</div>
                      {selectedProvider === 'claro' ? (
                        `$${Number(row.precioListaOriginal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                      ) : (
                        `$${Number(row.precioOficial || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                      )}
                    </td>
                    <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 600, fontSize: '11px' }}>
                      <div style={{fontSize: '9px', color: '#94a3b8'}}>BONIF.</div>
                      {selectedProvider === 'claro' ? (
                        Number(row.descuentoOriginal || 0) !== 0 ? `-$${Math.abs(Number(row.descuentoOriginal)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'
                      ) : (
                        (() => {
                          const realAbonoNeto = row.abono / 1.21;
                          const descPct = row.precioOficial > 0 ? ((row.precioOficial - realAbonoNeto) / row.precioOficial) * 100 : 0;
                          return descPct > 0 ? `${descPct.toFixed(1)}%` : '-';
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
                  {row.auditStatus === 'WARN' ? (
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>
                      ❌ NOT OK
                    </div>
                  ) : prevPrice > 0 ? (
                    <div style={{ 
                      fontSize: '11px', 
                      fontWeight: 800, 
                      color: diffPct > 1 ? '#ef4444' : '#10b981' 
                    }}>
                      {Math.abs(diffPct) < 1 ? '✔ OK' : (
                        <span>{diffPct > 0 ? '↑' : '↓'} {Math.abs(diffPct).toFixed(1)}% {diffPct > 0 ? 'AUMENTO' : 'BAJA'}</span>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Sin datos previos</div>
                  )}
                </td>
              </tr>
            );
          })}
          {paginatedData.length === 0 && (
            <tr>
              <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
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
    </div>
  );
}
