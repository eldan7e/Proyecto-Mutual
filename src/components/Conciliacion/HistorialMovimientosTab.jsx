import React, { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';

export default function HistorialMovimientosTab({
  historial,
  loadingHistorial,
  fetchHistorial,
  handleDeshacerConciliacion,
  handleResetearPeriodo,
  selectedPeriod,
  openBreakdownModal,
  formatISODateToAR,
  getTipoMovimientoLabel,
  renderTipoMovimientoBadge,
  openEditConciliacionModal
}) {
  const [searchHistorial, setSearchHistorial] = useState('');
  const [filtroTipoHistorial, setFiltroTipoHistorial] = useState('TODOS');
  const [filtroBancoHistorial, setFiltroBancoHistorial] = useState('TODOS');
  const [filtroVinculacion, setFiltroVinculacion] = useState('TODOS');
  const [currentPageHistorial, setCurrentPageHistorial] = useState(1);
  const itemsPerPage = 100;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPageHistorial(1);
  }, [filtroTipoHistorial, filtroBancoHistorial, filtroVinculacion, searchHistorial]);

  // Filter historial
  const filteredHistorial = useMemo(() => {
    // Excluir registros maestros de conciliación grupal (son solo marcadores de duplicado)
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
  }, [historial, searchHistorial, filtroTipoHistorial, filtroBancoHistorial, filtroVinculacion, getTipoMovimientoLabel]);

  const paginatedHistorial = useMemo(() => {
    return filteredHistorial.slice(
      (currentPageHistorial - 1) * itemsPerPage,
      currentPageHistorial * itemsPerPage
    );
  }, [filteredHistorial, currentPageHistorial]);

  const totalPagesHistorial = Math.ceil(filteredHistorial.length / itemsPerPage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>
        
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                Historial de Movimientos Conciliados
                {selectedPeriod && (
                  <span style={{ marginLeft: '12px', fontSize: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 8px', borderRadius: '8px', verticalAlign: 'middle' }}>
                    Período: {selectedPeriod}
                  </span>
                )}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Visualiza, busca y revierte movimientos conciliados en la base de datos</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={handleResetearPeriodo}
                className="action-button hover-lift"
                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px 16px', display: 'flex', alignItems: 'center', fontWeight: 600, borderRadius: '12px' }}
                disabled={loadingHistorial || !selectedPeriod}
                title="Eliminar TODAS las conciliaciones de este período"
              >
                <Trash2 size={16} style={{ marginRight: '8px' }} />
                Borrar Todo
              </button>
              <button 
                onClick={fetchHistorial}
                className="action-button"
                style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', padding: '10px 16px', display: 'flex', alignItems: 'center', borderRadius: '12px' }}
                disabled={loadingHistorial}
              >
                <RefreshCw size={16} className={loadingHistorial ? 'animate-spin' : ''} style={{ marginRight: '8px' }} />
                Actualizar
              </button>
            </div>
          </div>

          {/* Fila de Filtros y Búsqueda */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', background: 'rgba(0,0,0,0.01)', padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.02)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', flex: 1, minWidth: '240px' }}>
              <Search size={16} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Buscar movimientos por nombre, tipo o monto..."
                value={searchHistorial}
                onChange={(e) => setSearchHistorial(e.target.value)}
                style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Banco:</span>
                <select
                  className="premium-input"
                  style={{ padding: '4px 10px', height: '34px', fontSize: '13px', width: '120px', borderRadius: '8px' }}
                  value={filtroBancoHistorial}
                  onChange={e => setFiltroBancoHistorial(e.target.value)}
                >
                  <option value="TODOS">Todos</option>
                  <option value="CREDICOOP">Credicoop</option>
                  <option value="NACION">Nación</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Tipo:</span>
                <select
                  className="premium-input"
                  style={{ padding: '4px 10px', height: '34px', fontSize: '13px', width: '160px', borderRadius: '8px' }}
                  value={filtroTipoHistorial}
                  onChange={e => setFiltroTipoHistorial(e.target.value)}
                >
                  <option value="TODOS">Todos los tipos</option>
                  <option value="TRANSFERENCIA_RECIBIDA">Transf. Recibidas</option>
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
                  <option value="PENDIENTES">Solo Pendientes</option>
                  <option value="COMPLETOS">Solo Completos</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {loadingHistorial ? (
          <div style={{ padding: '64px', display: 'flex', justifyContent: 'center' }}>
            <RefreshCw className="animate-spin" size={40} style={{ color: 'var(--accent)' }} />
          </div>
        ) : filteredHistorial.length === 0 ? (
          <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <AlertCircle size={32} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p style={{ fontWeight: 600 }}>No se encontraron movimientos registrados</p>
          </div>
        ) : (
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Fecha / Banco</th>
                  <th style={{ minWidth: '220px' }}>Detalle del Movimiento</th>
                  <th style={{ width: '120px' }}>Débito</th>
                  <th style={{ width: '120px' }}>Crédito</th>
                  <th style={{ width: '280px' }}>Conciliado Con</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistorial.map(mov => (
                  <tr key={mov.movimiento_id} className="table-row-hover">
                    {/* 1. Fecha / Banco */}
                    <td style={{ fontSize: '13px', fontWeight: 600 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>{formatISODateToAR(mov.fecha_movimiento)}</span>
                        <div>
                          <span style={{ 
                            fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px',
                            background: mov.banco === 'NACION' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: mov.banco === 'NACION' ? '#3b82f6' : '#10b981',
                            display: 'inline-block'
                          }}>
                            {mov.banco}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 2. Detalle del Movimiento */}
                    <td style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>{mov.concepto}</span>
                        {renderTipoMovimientoBadge(mov.tipo_movimiento)}
                      </div>
                    </td>

                    {/* 3. Débito */}
                    <td>
                      {Number(mov.monto) < 0 ? (
                        <span style={{ fontWeight: 900, color: '#ef4444', fontSize: '13px' }}>
                          -${Math.abs(Number(mov.monto)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', opacity: 0.3 }}>-</span>
                      )}
                    </td>

                    {/* 4. Crédito */}
                    <td>
                      {Number(mov.monto) > 0 ? (
                        <span style={{ fontWeight: 900, color: '#10b981', fontSize: '13px' }}>
                          +${Number(mov.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', opacity: 0.3 }}>-</span>
                      )}
                    </td>

                    {/* 5. Conciliado Con */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {mov.socios ? (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{mov.socios.nombre_completo}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Nº Socio {mov.socios.nro_socio || 'Sin Nro'}</span>
                          </div>
                        ) : (mov.tipo_movimiento === 'IMPUESTO' || mov.tipo_movimiento === 'COMISION' || mov.tipo_movimiento === 'SUSCRIPCION' || mov.tipo_movimiento === 'PAGO_VEP' || mov.tipo_movimiento === 'PAGO_SERVICIO' || mov.tipo_movimiento === 'PAGO_ARCA') ? (
                          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontStyle: 'italic', fontWeight: 600 }}>
                            {mov.tipo_movimiento === 'IMPUESTO' ? 'Gasto Bancario General' :
                             mov.tipo_movimiento === 'COMISION' ? 'Pago Comisión' :
                             mov.tipo_movimiento === 'SUSCRIPCION' ? 'Suscripción General' :
                             mov.tipo_movimiento === 'PAGO_VEP' ? 'Pago de VEP (AFIP)' :
                             mov.tipo_movimiento === 'PAGO_ARCA' ? 'Pago de ARCA' :
                             mov.tipo_movimiento === 'PAGO_SERVICIO' ? 'Pago de Servicio General' : 'Gasto General'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '13px' }}>Sin socio asignado</span>
                        )}

                        {mov.liquidaciones_grupos ? (
                          <div style={{ marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            <span style={{ 
                              fontSize: '10.5px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                              background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}>
                              📌 Imputado a Factura: {mov.liquidaciones_grupos.periodo} (Gpo #{mov.liquidaciones_grupos.numero_grupo})
                            </span>
                            {mov.liquidacion_id && openBreakdownModal && (
                              <button
                                onClick={() => openBreakdownModal(mov.liquidacion_id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--accent)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  padding: 0,
                                  textDecoration: 'underline',
                                  textAlign: 'left',
                                  fontWeight: 'bold',
                                  marginTop: '2px'
                                }}
                              >
                                Ver desglose del grupo
                              </button>
                            )}
                          </div>
                        ) : mov.periodo ? (
                          <div style={{ marginTop: '2px' }}>
                            <span style={{ 
                              fontSize: '10.5px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                              background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}>
                              📌 Período Imputado: {mov.periodo}
                            </span>
                          </div>
                        ) : (
                          !(mov.tipo_movimiento === 'IMPUESTO' || mov.tipo_movimiento === 'COMISION' || mov.tipo_movimiento === 'SUSCRIPCION' || mov.tipo_movimiento === 'PAGO_VEP' || mov.tipo_movimiento === 'PAGO_SERVICIO' || mov.tipo_movimiento === 'PAGO_ARCA') && (
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
                            padding: '6px 12px', fontSize: '12px', borderRadius: '8px', cursor: 'pointer'
                          }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeshacerConciliacion(mov)}
                          className="action-button"
                          style={{ 
                            background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)',
                            padding: '6px 12px', fontSize: '12px', borderRadius: '8px', cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <Trash2 size={13} style={{ marginRight: '4px' }} />
                          Deshacer
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border-light)', background: 'var(--surface)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>
              Mostrando {(currentPageHistorial - 1) * itemsPerPage + 1} a {Math.min(currentPageHistorial * itemsPerPage, filteredHistorial.length)} de {filteredHistorial.length} movimientos
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => setCurrentPageHistorial(p => Math.max(1, p - 1))}
                disabled={currentPageHistorial === 1}
                className="action-button"
                style={{ padding: '6px 12px', fontSize: '12px', height: 'auto', background: currentPageHistorial === 1 ? 'transparent' : 'var(--accent)', color: currentPageHistorial === 1 ? 'var(--text-secondary)' : 'white', border: '1px solid var(--border-light)', opacity: currentPageHistorial === 1 ? 0.5 : 1 }}
              >
                Anterior
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '700' }}>
                Página {currentPageHistorial} de {totalPagesHistorial}
              </div>
              <button 
                onClick={() => setCurrentPageHistorial(p => Math.min(totalPagesHistorial, p + 1))}
                disabled={currentPageHistorial === totalPagesHistorial}
                className="action-button"
                style={{ padding: '6px 12px', fontSize: '12px', height: 'auto', background: currentPageHistorial === totalPagesHistorial ? 'transparent' : 'var(--accent)', color: currentPageHistorial === totalPagesHistorial ? 'var(--text-secondary)' : 'white', border: '1px solid var(--border-light)', opacity: currentPageHistorial === totalPagesHistorial ? 0.5 : 1 }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
