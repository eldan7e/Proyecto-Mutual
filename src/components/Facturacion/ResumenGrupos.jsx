import React from 'react';
import {
  ChevronDown, ChevronUp, Edit2, Download, Loader2
} from 'lucide-react';

export default function ResumenGrupos({
  liquidacionesAgrupadas,
  periods,
  selectedPeriod,
  setSelectedPeriod,
  expandedGroups,
  setExpandedGroups,
  exportResumenToCSV,
  socioLiquidaciones,
  socioLoading
}) {
  return (
    <div className="premium-table-container">
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {liquidacionesAgrupadas.length} Grupos liquidados en {selectedPeriod || 'Todos los Períodos'}
          </div>
        </div>
        <button onClick={exportResumenToCSV} className="btn-batch-primary" style={{ flex: 'none', padding: '10px 20px' }}>
          <Download size={16} /> Exportar Excel
        </button>
      </div>
      <table className="premium-table">
        <thead>
          <tr>
            <th style={{ width: '40px' }}></th>
            <th>Grupo / Responsable</th>
            <th style={{ textAlign: 'center' }}>Líneas</th>
            <th style={{ textAlign: 'right' }}>Total a Cobrar</th>
            <th style={{ textAlign: 'center' }}>Estado</th>
            <th style={{ textAlign: 'right' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {liquidacionesAgrupadas.map(g => {
            const key = `${g.numero_grupo || 0}-${g.periodo || 'S/P'}`;
            const isExpanded = expandedGroups[key];
            return (
              <React.Fragment key={key}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }))}>
                  <td>{isExpanded ? <ChevronUp size={18} color="var(--accent)" /> : <ChevronDown size={18} style={{ opacity: 0.5 }} />}</td>
                  <td>
                    <div style={{ fontWeight: 900, color: 'var(--text-primary)' }}>{g.grupos?.alias_grupo || `Grupo ${g.numero_grupo}`}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Socio: {g.socios?.nombre_completo || 'Sin Nombre'}</div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{g.sum_total_lineas}</td>
                  <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--accent)', fontSize: '16px' }}>
                    ${(g.total_grupo || 0).toLocaleString('es-AR')}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ 
                      padding: '6px 12px', borderRadius: '100px', fontSize: '11px', fontWeight: 800,
                      background: g.estado_pago === 'ABONADO' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: g.estado_pago === 'ABONADO' ? '#10b981' : '#f59e0b'
                    }}>
                      {g.estado_pago || 'PENDIENTE'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="icon-button-edit"><Edit2 size={16} /></button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan="6" style={{ padding: '0 32px 32px 32px', background: 'rgba(0,0,0,0.01)' }}>
                      <div className="glass-panel-sub" style={{ padding: '24px', background: 'var(--bg-app)', borderRadius: '20px' }}>
                        {socioLoading ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px' }}>
                            <Loader2 className="animate-spin" size={20} style={{ color: 'var(--accent)' }} />
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>Cargando desglose de integrantes...</span>
                          </div>
                        ) : (
                          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ color: 'var(--text-secondary)', padding: '12px 8px', fontSize: '11px', fontWeight: 800, textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>INTEGRANTE</th>
                                <th style={{ color: 'var(--text-secondary)', padding: '12px 8px', fontSize: '11px', fontWeight: 800, textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>LÍNEA</th>
                                <th style={{ color: 'var(--text-secondary)', padding: '12px 8px', fontSize: '11px', fontWeight: 800, textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>PLAN</th>
                                <th style={{ color: 'var(--text-secondary)', padding: '12px 8px', fontSize: '11px', fontWeight: 800, textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>TOTAL</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const groupDetails = (socioLiquidaciones || []).filter(sl => {
                                  const slGroup = sl.lineas?.numero_grupo;
                                  const gGroup = g.numero_grupo;
                                  return slGroup === gGroup && sl.proveedor_id === g.proveedor_id;
                                });
                                
                                if (groupDetails.length > 0) {
                                  return (
                                    <>
                                      {groupDetails.map((sl, ii) => (
                                        <tr key={sl.numero_linea || ii}>
                                          <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            {sl.lineas?.socios?.nombre_completo || 'Titular de Línea'}
                                          </td>
                                          <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            {sl.numero_linea}
                                          </td>
                                          <td style={{ padding: '12px 8px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            {sl.lineas?.planes_abonos?.nombre_plan || 'Plan S/D'}
                                          </td>
                                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            ${Number(sl.calculado?.totalCobrar || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                          </td>
                                        </tr>
                                      ))}
                                      {g.socios?.fpago === 'D' && (
                                        <tr>
                                          <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            Costo Débito Automático
                                          </td>
                                          <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            —
                                          </td>
                                          <td style={{ padding: '12px 8px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            Cargo Administrativo
                                          </td>
                                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            $12,12
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  );
                                } else {
                                  return (
                                    <>
                                      {(g.items || []).map((item, ii) => (
                                        <tr key={item.liquidacion_id || ii}>
                                          <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            {item.socios?.nombre_completo || 'Responsable de Grupo'}
                                          </td>
                                          <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            {item.numero_linea || 'Lote Completo'}
                                          </td>
                                          <td style={{ padding: '12px 8px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            {item.nombre_plan || 'Resumen Lote'}
                                          </td>
                                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            ${Number(item.monto_total_facturado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                          </td>
                                        </tr>
                                      ))}
                                      {g.socios?.fpago === 'D' && (
                                        <tr>
                                          <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            Costo Débito Automático
                                          </td>
                                          <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            —
                                          </td>
                                          <td style={{ padding: '12px 8px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            Cargo Administrativo
                                          </td>
                                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                            $12,12
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  );
                                }
                              })()}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
