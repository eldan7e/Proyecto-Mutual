import React, { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, Edit2, Download, Loader2, Search, X
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../ui/ToastProvider';

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
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  // Estados de filtros locales
  const [localSearch, setLocalSearch] = useState('');
  const [localState, setLocalState] = useState('');
  const [localProv, setLocalProv] = useState('');

  // Estados para modal de edición de pago
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [newEstado, setNewEstado] = useState('PENDIENTE');
  const [newMontoAbonado, setNewMontoAbonado] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Filtrar grupos localmente
  const filteredGroups = useMemo(() => {
    return (liquidacionesAgrupadas || []).filter(g => {
      const matchSearch = !localSearch || 
        g.grupos?.alias_grupo?.toLowerCase()?.includes(localSearch.toLowerCase()) ||
        g.numero_grupo?.toString()?.includes(localSearch) ||
        g.socios?.nombre_completo?.toLowerCase()?.includes(localSearch.toLowerCase());

      const matchState = !localState || g.estado_pago === localState;

      const matchProv = !localProv || g.proveedores?.nombre === localProv || 
        (localProv === 'CLARO' && g.proveedor_id === 1) || 
        (localProv === 'MOVISTAR' && g.proveedor_id === 2) || 
        (localProv === 'PERSONAL' && g.proveedor_id === 3);

      return matchSearch && matchState && matchProv;
    });
  }, [liquidacionesAgrupadas, localSearch, localState, localProv]);

  const handleEditClick = (g) => {
    setEditingGroup(g);
    setNewEstado(g.estado_pago || 'PENDIENTE');
    setNewMontoAbonado(g.monto_abonado || (g.estado_pago === 'ABONADO' ? g.total_grupo : 0));
    setIsEditModalOpen(true);
  };

  const handleEstadoChange = (status) => {
    setNewEstado(status);
    if (status === 'ABONADO') {
      setNewMontoAbonado(editingGroup?.total_grupo || 0);
    } else if (status === 'PENDIENTE') {
      setNewMontoAbonado(0);
    }
  };

  const handleSavePayment = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('liquidaciones_grupos')
        .update({ 
          estado_pago: newEstado, 
          monto_abonado: Number(newMontoAbonado || 0) 
        })
        .eq('periodo', editingGroup.periodo)
        .eq('numero_grupo', editingGroup.numero_grupo)
        .eq('proveedor_id', editingGroup.proveedor_id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['liquidaciones'] });
      queryClient.invalidateQueries({ queryKey: ['socioLiquidaciones'] });
      addToast('Estado de pago de grupo actualizado correctamente', 'success');
      setIsEditModalOpen(false);
    } catch (err) {
      console.error(err);
      addToast('Error al actualizar pago: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="premium-table-container">
      {/* Título de la tabla */}
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {filteredGroups.length} de {liquidacionesAgrupadas.length} Grupos liquidados en {selectedPeriod || 'Todos los Períodos'}
          </div>
        </div>
        <button onClick={exportResumenToCSV} className="btn-batch-primary" style={{ flex: 'none', padding: '10px 20px' }}>
          <Download size={16} /> Exportar Excel
        </button>
      </div>

      {/* Filtros locales y Buscador */}
      <div style={{ padding: '16px 24px', background: 'rgba(0,0,0,0.01)', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ width: '280px', background: 'var(--surface)', margin: 0 }}>
          <Search size={18} />
          <input 
            placeholder="Buscar grupo o responsable..." 
            value={localSearch} 
            onChange={e => setLocalSearch(e.target.value)} 
          />
        </div>
        <select 
          className="btn-ghost" 
          value={localState} 
          onChange={e => setLocalState(e.target.value)}
          style={{ fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border-light)' }}
        >
          <option value="">Todos los Estados</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="ABONADO">Abonados</option>
        </select>
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
          {filteredGroups.map(g => {
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
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleEditClick(g); }} 
                      className="icon-button-edit"
                      style={{ cursor: 'pointer' }}
                    >
                      <Edit2 size={16} />
                    </button>
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

      {/* Modal de edición */}
      {isEditModalOpen && editingGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="bento-card" style={{ width: '100%', maxWidth: '450px', padding: '24px', background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)' }}>
                Editar Estado de Pago
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} style={{ border: 'none', background: 'rgba(0,0,0,0.05)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
              Grupo: <strong>{editingGroup.grupos?.alias_grupo || `Grupo ${editingGroup.numero_grupo}`}</strong><br/>
              Responsable: <strong>{editingGroup.socios?.nombre_completo || 'Sin Socio'}</strong><br/>
              Monto Total Facturado: <strong>${(editingGroup.total_grupo || 0).toLocaleString('es-AR')}</strong>
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado de Pago</label>
                <select 
                  value={newEstado} 
                  onChange={e => handleEstadoChange(e.target.value)} 
                  className="btn-ghost" 
                  style={{ width: '100%', marginTop: '6px', background: 'var(--bg-app)', border: '1px solid var(--border-light)', padding: '10px 14px', borderRadius: '10px', height: '42px', fontWeight: 700 }}
                >
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="ABONADO">ABONADO</option>
                  <option value="PARCIAL">PARCIAL</option>
                </select>
              </div>
              
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monto Abonado ($)</label>
                <input 
                  type="number" 
                  value={newMontoAbonado} 
                  onChange={e => setNewMontoAbonado(e.target.value)} 
                  style={{ width: '100%', marginTop: '6px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--bg-app)', color: 'var(--text-primary)', outline: 'none', height: '42px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setIsEditModalOpen(false)} 
                className="btn-batch-secondary"
                style={{ padding: '8px 16px', borderRadius: '10px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSavePayment} 
                className="btn-batch-primary"
                style={{ padding: '8px 16px', borderRadius: '10px', cursor: 'pointer' }}
                disabled={isSaving}
              >
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
