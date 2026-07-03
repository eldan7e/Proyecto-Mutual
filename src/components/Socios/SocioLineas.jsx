import React, { useState, useEffect } from 'react';
import { fetchAuxDataForLineas, deleteSocioLinea, upsertSocioLinea, fetchAllLinesForAssociation } from '../../services/socioService';
import { supabase } from '../../supabaseClient';
import { Plus, Edit2, Trash2, Smartphone, Loader2, Save, Link2, ArrowRightLeft, Search, UserCheck } from 'lucide-react';
import { globalToast } from '../ui/ToastProvider';
import { globalConfirm } from '../ui/ConfirmProvider';
import Modal from '../Modal';

export default function SocioLineas({ socio, onUpdate }) {
  const [planes, setPlanes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [allLines, setAllLines] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentLinea, setCurrentLinea] = useState(null);
  const [loading, setLoading] = useState(false);

  // Modal mode: 'new' (add new line), 'associate' (associate existing), 'edit' (edit properties), 'transfer' (transfer to another socio)
  const [modalType, setModalType] = useState('new'); 
  const [associatedLineInfo, setAssociatedLineInfo] = useState(null);

  // States for controlled inputs in the form
  const [typedNumber, setTypedNumber] = useState('');
  const [selectedProvId, setSelectedProvId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('Activa');
  const [descuentoEsperado, setDescuentoEsperado] = useState(0);
  
  // Autocomplete states for association mode
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Transfer modal states
  const [transferLines, setTransferLines] = useState([]); // lines selected for transfer
  const [transferSearch, setTransferSearch] = useState('');
  const [transferSuggestions, setTransferSuggestions] = useState([]);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [showTransferSuggestions, setShowTransferSuggestions] = useState(false);
  const [transferHoveredIdx, setTransferHoveredIdx] = useState(null);

  useEffect(() => {
    fetchAuxData();
  }, []);

  const fetchAuxData = async () => {
    try {
      const { planes: planesData, proveedores: provData } = await fetchAuxDataForLineas();
      setPlanes(planesData || []);
      setProveedores(provData || []);
      
      const linesData = await fetchAllLinesForAssociation();
      setAllLines(linesData || []);
    } catch (err) {
      console.error("Error fetching aux data", err);
    }
  };

  const getProviderName = (id) => proveedores.find(p => String(p.proveedor_id) === String(id))?.nombre || 'Desconocido';
  const getPlanName = (id) => planes.find(p => String(p.plan_id) === String(id))?.nombre_plan || 'Sin Plan';

  const handleDelete = async (numero_linea) => {
    const confirm = await globalConfirm.ask({
      title: 'Eliminar Línea',
      message: `¿Estás seguro de eliminar la línea ${numero_linea}? Esto no se puede deshacer.`,
      isDanger: true,
      confirmText: 'Eliminar'
    });

    if (confirm) {
      try {
        await deleteSocioLinea(numero_linea);
        globalToast.success('Línea eliminada correctamente');
        // Refresh all lines lists
        const linesData = await fetchAllLinesForAssociation();
        setAllLines(linesData || []);
        onUpdate();
      } catch (error) {
        globalToast.error(error.message || 'Error al eliminar línea');
      }
    }
  };

  // Autocomplete search handler for association mode
  const handleNumberChangeAssociate = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Keep only digits
    setTypedNumber(value);
    setAssociatedLineInfo(null);
    
    if (value.length >= 2) {
      const filtered = allLines.filter(l => 
        l.numero_linea.includes(value)
      ).slice(0, 6);
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Detect exact match as user types or pastes in association mode
  useEffect(() => {
    if (modalType === 'associate' && typedNumber) {
      const exactMatch = allLines.find(l => l.numero_linea === typedNumber);
      if (exactMatch) {
        setAssociatedLineInfo(exactMatch);
        setSelectedProvId(exactMatch.proveedor_id || '');
        setSelectedPlanId(exactMatch.plan_id || '');
        setSelectedEstado(exactMatch.estado || 'Activa');
        setDescuentoEsperado(exactMatch.descuento_esperado || 0);
      } else {
        setAssociatedLineInfo(null);
      }
    }
  }, [typedNumber, modalType, allLines]);

  const handleSelectSuggestion = (linea) => {
    setTypedNumber(linea.numero_linea);
    setSelectedProvId(linea.proveedor_id || '');
    setSelectedPlanId(linea.plan_id || '');
    setSelectedEstado(linea.estado || 'Activa');
    setDescuentoEsperado(linea.descuento_esperado || 0);
    setAssociatedLineInfo(linea);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!typedNumber) {
      globalToast.error('Por favor, ingrese un número de línea');
      return;
    }

    if (modalType === 'associate' && !associatedLineInfo) {
      globalToast.error('Debe seleccionar una línea existente en la lista para poder asociarla');
      return;
    }

    setLoading(true);

    const data = {
      numero_linea: typedNumber,
      proveedor_id: parseInt(selectedProvId, 10),
      plan_id: selectedPlanId ? parseInt(selectedPlanId, 10) : null,
      estado: selectedEstado,
      socio_id: socio.socio_id,
      numero_grupo: socio.grupo_socio?.[0]?.numero_grupo || 0,
      descuento_esperado: parseFloat(descuentoEsperado || 0)
    };

    try {
      if (modalType === 'edit' && currentLinea) {
        await upsertSocioLinea(data, currentLinea.numero_linea);
      } else {
        await upsertSocioLinea(data);
      }
      globalToast.success(modalType === 'associate' ? 'Línea asociada correctamente' : 'Línea guardada correctamente');
      setIsModalOpen(false);
      setCurrentLinea(null);
      
      // Refresh local autocomplete list and trigger parent update
      const linesData = await fetchAllLinesForAssociation();
      setAllLines(linesData || []);
      onUpdate();
    } catch (err) {
      console.error("Error saving linea", err);
      globalToast.error(err.message || 'Error al guardar la línea');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (type, linea = null) => {
    setModalType(type);
    setCurrentLinea(linea);
    if (type === 'transfer') {
      // Pre-select all lines or just the one clicked
      if (linea) {
        setTransferLines([linea.numero_linea]);
      } else {
        setTransferLines((socio.lineas || []).map(l => l.numero_linea));
      }
      setTransferSearch('');
      setTransferSuggestions([]);
      setTransferTarget(null);
      setTransferLoading(false);
      setShowTransferSuggestions(false);
      setIsModalOpen(true);
      return;
    }
    if (linea) {
      setTypedNumber(linea.numero_linea);
      setSelectedProvId(linea.proveedor_id || '');
      setSelectedPlanId(linea.plan_id || '');
      setSelectedEstado(linea.estado || 'Activa');
      setDescuentoEsperado(linea.descuento_esperado || 0);
    } else {
      setTypedNumber('');
      setSelectedProvId('');
      setSelectedPlanId('');
      setSelectedEstado('Activa');
      setDescuentoEsperado(0);
    }
    setAssociatedLineInfo(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setIsModalOpen(true);
  };

  // Transfer: search for target socio
  const handleTransferSearch = async (val) => {
    setTransferSearch(val);
    setTransferTarget(null);
    if (val.trim().length < 2) {
      setTransferSuggestions([]);
      setShowTransferSuggestions(false);
      return;
    }
    try {
      const term = val.trim().toLowerCase();
      const { data, error } = await supabase
        .from('v_socios_busqueda')
        .select('socio_id, nombre_completo, nro_socio, dni, grupo_socio')
        .ilike('search_text', `%${term}%`)
        .neq('socio_id', socio.socio_id)
        .limit(8);
      if (error) throw error;
      setTransferSuggestions(data || []);
      setShowTransferSuggestions(true);
    } catch (err) {
      console.error('Error searching socios for transfer:', err);
    }
  };

  const handleSelectTransferTarget = (targetSocio) => {
    setTransferTarget(targetSocio);
    setTransferSearch(`${targetSocio.nombre_completo} (Socio ${targetSocio.nro_socio || ''})`);
    setShowTransferSuggestions(false);
  };

  const handleToggleTransferLine = (numero_linea) => {
    setTransferLines(prev => 
      prev.includes(numero_linea) 
        ? prev.filter(n => n !== numero_linea) 
        : [...prev, numero_linea]
    );
  };

  const handleRemoveResponsible = async (numero_linea) => {
    const confirmed = await globalConfirm.ask({
      title: 'Quitar Responsable de Pago',
      message: `¿Estás seguro de quitar el responsable de pago de la línea ${numero_linea}? El cobro volverá a imputarse al titular original.`,
      confirmText: 'Quitar',
      isDanger: true
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('lineas')
        .update({ socio_responsable_id: null })
        .eq('numero_linea', numero_linea);
      if (error) throw error;

      globalToast.success('Responsable de pago removido');
      // Refresh local autocomplete list and trigger parent update
      const linesData = await fetchAllLinesForAssociation();
      setAllLines(linesData || []);
      onUpdate();
    } catch (err) {
      console.error('Error removing responsible partner:', err);
      globalToast.error(err.message || 'Error al quitar responsable');
    }
  };

  const handleExecuteTransfer = async () => {
    if (!transferTarget || transferLines.length === 0) {
      globalToast.error('Seleccioná al menos una línea y un socio responsable');
      return;
    }

    const confirmed = await globalConfirm.ask({
      title: 'Confirmar Responsable de Pago',
      message: `¿Estás seguro de establecer a ${transferTarget.nombre_completo} como responsable de pago para ${transferLines.length} línea(s)? Las líneas seguirán perteneciendo a ${socio.nombre_completo} pero se cobrarán en la cuenta del responsable.`,
      confirmText: 'Asignar',
      isDanger: false
    });
    if (!confirmed) return;

    setTransferLoading(true);
    try {
      // Update each line's socio_responsable_id
      for (const numero_linea of transferLines) {
        const { error } = await supabase
          .from('lineas')
          .update({ 
            socio_responsable_id: transferTarget.socio_id
          })
          .eq('numero_linea', numero_linea);
        if (error) throw error;
      }

      globalToast.success(`Responsable de pago asignado a ${transferTarget.nombre_completo} para ${transferLines.length} línea(s)`);
      setIsModalOpen(false);

      // Refresh data
      const linesData = await fetchAllLinesForAssociation();
      setAllLines(linesData || []);
      onUpdate();
    } catch (err) {
      console.error('Error setting responsible partner:', err);
      globalToast.error(`Error al asignar responsable: ${err.message}`);
    } finally {
      setTransferLoading(false);
    }
  };

  return (
    <>
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {/* Header Premium con 2 botones distintos */}
        <div style={{ 
          padding: '24px', 
          borderBottom: '1px solid var(--border-light)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Líneas Telefónicas</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {socio.lineas?.length > 0 && (
              <button 
                onClick={() => openModal('transfer')} 
                className="btn-ghost" 
                style={{ 
                  padding: '10px 18px', 
                  fontSize: '13px', 
                  fontWeight: 700, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  borderRadius: '12px',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  background: 'rgba(59, 130, 246, 0.05)',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <ArrowRightLeft size={16} /> A Cargo de Otro
              </button>
            )}
            <button 
              onClick={() => openModal('associate')} 
              className="btn-ghost" 
              style={{ 
                padding: '10px 18px', 
                fontSize: '13px', 
                fontWeight: 700, 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                borderRadius: '12px',
                border: '1px solid var(--border-light)',
                cursor: 'pointer'
              }}
            >
              <Link2 size={16} /> Asociar Línea Existente
            </button>
            
            <button 
              onClick={() => openModal('new')} 
              className="action-button" 
              style={{ 
                padding: '10px 18px', 
                fontSize: '13px', 
                fontWeight: 700, 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                borderRadius: '12px',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} /> Agregar Nueva Línea
            </button>
          </div>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table className="premium-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Operadora</th>
                <th>Plan de Abono</th>
                <th>Dcto. Especial</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(!socio.lineas || socio.lineas.length === 0) ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                    <Smartphone size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                    <div>Este socio no tiene líneas asignadas.</div>
                  </td>
                </tr>
              ) : proveedores.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px' }}>
                    <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto', color: 'var(--accent)' }} />
                  </td>
                </tr>
              ) : (
                socio.lineas.map(linea => {
                  const isActive = linea.estado?.toLowerCase() === 'activa';
                  const provId = Number(linea.proveedor_id);
                  return (
                    <tr key={linea.numero_linea}>
                      <td style={{ fontWeight: 800 }}>
                        <div>{linea.numero_linea}</div>
                        {linea.socio_responsable_id && linea.socio_responsable_id !== socio.socio_id && (
                          <div style={{ 
                            fontSize: '11px', 
                            color: '#3b82f6', 
                            fontWeight: 600, 
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <span style={{ 
                              padding: '2px 6px', 
                              borderRadius: '6px', 
                              background: 'rgba(59, 130, 246, 0.08)',
                              border: '1px solid rgba(59, 130, 246, 0.15)'
                            }}>
                              A cargo de: {linea.responsable?.nombre_completo || 'Cargando...'}
                            </span>
                            <button 
                              onClick={() => handleRemoveResponsible(linea.numero_linea)}
                              title="Quitar responsable de pago"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                                lineHeight: 1
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ 
                          padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800,
                          background: provId === 1 ? 'rgba(239, 68, 68, 0.1)' : provId === 2 ? 'rgba(59, 130, 246, 0.1)' : provId === 3 ? 'rgba(139, 92, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                          color: provId === 1 ? '#ef4444' : provId === 2 ? '#3b82f6' : provId === 3 ? '#8b5cf6' : '#6b7280',
                        }}>
                          {getProviderName(linea.proveedor_id)}
                        </span>
                      </td>
                      <td>{getPlanName(linea.plan_id)}</td>
                      <td>
                        {linea.descuento_esperado && Number(linea.descuento_esperado) !== 0 ? (
                          <span style={{ fontWeight: 800, color: '#10b981', fontSize: '13px' }}>
                            {linea.descuento_esperado}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500 }}>
                            Usa el del socio
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ 
                          padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800,
                          background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: isActive ? '#10b981' : '#ef4444'
                        }}>
                          {linea.estado?.toUpperCase() || 'DESCONOCIDO'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => openModal('transfer', linea)} title="Asignar Responsable de Pago" style={{
                            width: '32px', height: '32px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)',
                            background: 'rgba(59, 130, 246, 0.06)', color: '#3b82f6', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                          }}><ArrowRightLeft size={14} /></button>
                          <button onClick={() => openModal('edit', linea)} className="icon-button-edit"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(linea.numero_linea)} className="icon-button-delete"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Transfer Modal */}
        <Modal 
          isOpen={isModalOpen && modalType === 'transfer'} 
          onClose={() => setIsModalOpen(false)} 
          title="Establecer Responsable de Pago"
          maxWidth="560px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Source info */}
            <div style={{
              padding: '14px 16px', borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)',
              fontSize: '13px'
            }}>
              <div style={{ fontWeight: 800, marginBottom: '4px', color: '#ef4444', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Titular Original</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{socio.nombre_completo}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Nº Socio: {socio.nro_socio || 'N/A'} • Grupo: {socio.grupo_socio?.[0]?.numero_grupo || 'N/A'}</div>
            </div>

            {/* Line selection */}
            <div>
              <label className="form-label">Seleccionar Líneas</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(socio.lineas || []).map(linea => {
                  const isSelected = transferLines.includes(linea.numero_linea);
                  return (
                    <div 
                      key={linea.numero_linea}
                      onClick={() => handleToggleTransferLine(linea.numero_linea)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                        background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'rgba(0,0,0,0.02)',
                        border: isSelected ? '1.5px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-light)',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                        border: isSelected ? '2px solid #3b82f6' : '2px solid var(--border-light)',
                        background: isSelected ? '#3b82f6' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s'
                      }}>
                        {isSelected && <span style={{ color: 'white', fontSize: '12px', fontWeight: 900 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 800, fontSize: '14px' }}>{linea.numero_linea}</span>
                        <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {getProviderName(linea.proveedor_id)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Target socio search */}
            <div style={{ position: 'relative' }}>
              <label className="form-label">Buscar Socio Responsable</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  className="premium-input" 
                  style={{ width: '100%', padding: '12px 12px 12px 36px' }} 
                  value={transferSearch} 
                  onChange={(e) => handleTransferSearch(e.target.value)}
                  onFocus={() => transferSuggestions.length > 0 && setShowTransferSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTransferSuggestions(false), 200)}
                  placeholder="Buscar por nombre, DNI, Nro socio..."
                  autoComplete="off"
                />
              </div>
              {showTransferSuggestions && transferSuggestions.length > 0 && (
                <div style={{ 
                  position: 'absolute', top: '100%', left: 0, right: 0, 
                  background: 'var(--surface)', border: '1px solid var(--border-light)', 
                  borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', 
                  zIndex: 10, maxHeight: '200px', overflowY: 'auto', marginTop: '4px'
                }}>
                  {transferSuggestions.map((s, idx) => (
                    <div 
                      key={s.socio_id}
                      onClick={() => handleSelectTransferTarget(s)}
                      onMouseEnter={() => setTransferHoveredIdx(idx)}
                      onMouseLeave={() => setTransferHoveredIdx(null)}
                      style={{ 
                        padding: '12px 16px', cursor: 'pointer', 
                        borderBottom: '1px solid var(--border-light)',
                        background: transferHoveredIdx === idx ? 'var(--border-light)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
                        {s.nombre_completo}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                        <span>Nº Socio: {s.nro_socio || '---'}</span>
                        <span>•</span>
                        <span>DNI: {s.dni || '---'}</span>
                        <span>•</span>
                        <span>Grupo: {s.grupo_socio?.map(g => g.numero_grupo).join(', ') || 'Sin grupo'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Target confirmed badge */}
            {transferTarget && (
              <div style={{
                padding: '14px 16px', borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: 800, marginBottom: '4px', color: '#10b981', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <UserCheck size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Socio Responsable Seleccionado
                </div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{transferTarget.nombre_completo}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Nº Socio: {transferTarget.nro_socio || 'N/A'} • Grupo: {transferTarget.grupo_socio?.map(g => g.numero_grupo).join(', ') || 'N/A'}</div>
              </div>
            )}

            {/* Summary and action */}
            <button 
              onClick={handleExecuteTransfer}
              className="action-button"
              style={{ 
                width: '100%', padding: '16px', borderRadius: '16px',
                background: (transferTarget && transferLines.length > 0) ? '#3b82f6' : 'rgba(0,0,0,0.1)',
                cursor: (transferTarget && transferLines.length > 0) ? 'pointer' : 'not-allowed',
                opacity: (transferTarget && transferLines.length > 0) ? 1 : 0.5
              }}
              disabled={!transferTarget || transferLines.length === 0 || transferLoading}
            >
              {transferLoading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <UserCheck size={18} style={{ marginRight: '8px' }} />
                  Asignar Responsable a {transferLines.length} línea(s)
                </>
              )}
            </button>
          </div>
        </Modal>
      </div>

      {/* Secondary panel for lines under charge */}
      {socio.lineasACargo && socio.lineasACargo.length > 0 && (
        <div className="glass-panel" style={{ marginTop: '24px', overflow: 'hidden' }}>
          <div style={{ 
            padding: '24px', 
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Líneas a Cargo de este Socio (Hijos u otros)
            </h3>
            <span style={{ 
              background: 'rgba(59, 130, 246, 0.1)', 
              color: '#3b82f6', 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '12px', 
              fontWeight: 800 
            }}>
              {socio.lineasACargo.length} {socio.lineasACargo.length === 1 ? 'línea' : 'líneas'}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="premium-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Titular Original</th>
                  <th>Operadora</th>
                  <th>Plan de Abono</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {socio.lineasACargo.map(linea => {
                  const isActive = linea.estado?.toLowerCase() === 'activa';
                  const provId = Number(linea.proveedor_id);
                  const ownerName = linea.socios?.nombre_completo || 'Desconocido';
                  return (
                    <tr key={linea.numero_linea}>
                      <td style={{ fontWeight: 800 }}>{linea.numero_linea}</td>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ownerName}</td>
                      <td>
                        <span style={{ 
                          padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800,
                          background: provId === 1 ? 'rgba(239, 68, 68, 0.1)' : provId === 2 ? 'rgba(59, 130, 246, 0.1)' : provId === 3 ? 'rgba(139, 92, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                          color: provId === 1 ? '#ef4444' : provId === 2 ? '#3b82f6' : provId === 3 ? '#8b5cf6' : '#6b7280',
                        }}>
                          {getProviderName(linea.proveedor_id)}
                        </span>
                      </td>
                      <td>{getPlanName(linea.plan_id)}</td>
                      <td>
                        <span style={{ 
                          padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800,
                          background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: isActive ? '#10b981' : '#ef4444'
                        }}>
                          {linea.estado?.toUpperCase() || 'DESCONOCIDO'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => handleRemoveResponsible(linea.numero_linea)}
                          className="btn-ghost" 
                          style={{ 
                            padding: '6px 12px', 
                            fontSize: '12px', 
                            fontWeight: 700, 
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            background: 'rgba(239, 68, 68, 0.05)',
                            borderRadius: '8px',
                            cursor: 'pointer'
                          }}
                        >
                          Quitar de mi cargo
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Original Modal for new/edit/associate */}
      <Modal 
        isOpen={isModalOpen && modalType !== 'transfer'} 
        onClose={() => setIsModalOpen(false)} 
        title={
          modalType === 'new' 
            ? 'Agregar Nueva Línea' 
            : modalType === 'associate' 
              ? 'Asociar Línea Existente' 
              : 'Editar Línea'
        }
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Autocomplete Search input for 'associate' mode */}
          {modalType === 'associate' ? (
            <div style={{ position: 'relative' }}>
              <label className="form-label">Buscar Línea Existente</label>
              <input 
                className="premium-input" 
                style={{ width: '100%', padding: '12px' }} 
                value={typedNumber} 
                onChange={handleNumberChangeAssociate}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Escribí o buscá el número..."
                autoComplete="off"
                required 
              />
              {showSuggestions && suggestions.length > 0 && (
                <div 
                  style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    left: 0, 
                    right: 0, 
                    background: 'var(--surface)', 
                    border: '1px solid var(--border-light)', 
                    borderRadius: '12px', 
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)', 
                    zIndex: 10, 
                    maxHeight: '180px', 
                    overflowY: 'auto',
                    marginTop: '4px'
                  }}
                >
                  {suggestions.map((l, idx) => (
                    <div 
                      key={l.numero_linea}
                      onClick={() => handleSelectSuggestion(l)}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      style={{ 
                        padding: '12px 16px', 
                        cursor: 'pointer', 
                        borderBottom: '1px solid var(--border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px',
                        background: hoveredIdx === idx ? 'var(--border-light)' : 'transparent',
                        transition: 'background 0.2s'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{l.numero_linea}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px', fontWeight: 600 }}>
                          ({getProviderName(l.proveedor_id)})
                        </span>
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        fontWeight: 700,
                        color: l.socios ? '#ef4444' : 'var(--accent)'
                      }}>
                        {l.socios ? `Asignada: ${l.socios.nombre_completo}` : 'Sin asignar'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Informative assignment badge */}
              {associatedLineInfo && (
                <div 
                  style={{ 
                    marginTop: '12px',
                    padding: '12px 16px', 
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    background: associatedLineInfo.socios ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                    border: associatedLineInfo.socios ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
                    color: associatedLineInfo.socios ? '#ef4444' : '#10b981'
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '2px' }}>
                    {associatedLineInfo.socios ? '⚠️ Línea ya asignada' : '✅ Línea disponible'}
                  </div>
                  {associatedLineInfo.socios ? (
                    <>Pertenece a <strong>{associatedLineInfo.socios.nombre_completo}</strong>. Al guardarla, se reasignará al socio actual.</>
                  ) : (
                    <>Línea cargada en el sistema sin titular asignado.</>
                  )}
                </div>
              )}

              {!associatedLineInfo && typedNumber.length >= 8 && (
                <div 
                  style={{ 
                    marginTop: '12px',
                    padding: '12px 16px', 
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    background: 'rgba(249, 115, 22, 0.08)',
                    border: '1px solid rgba(249, 115, 22, 0.2)',
                    color: '#ea580c'
                  }}
                >
                  ⚠️ El número ingresado no existe en el sistema. Si querés dar de alta una línea nueva, usá el botón **"Agregar Nueva Línea"**.
                </div>
              )}
            </div>
          ) : (
            // Text input for 'new' or 'edit' modes
            <div>
              <label className="form-label">Número de Línea</label>
              <input 
                className="premium-input" 
                style={{ width: '100%', padding: '12px' }} 
                name="numero_linea" 
                value={typedNumber} 
                onChange={(e) => setTypedNumber(e.target.value.replace(/\D/g, ''))}
                readOnly={modalType === 'edit'}
                placeholder="Ej: 2216640415"
                required 
              />
            </div>
          )}

          {/* Form fields for operadora, plan and estado */}
          <div>
            <label className="form-label">Operadora</label>
            <select 
              className="premium-input" 
              style={{ width: '100%', padding: '12px' }} 
              name="proveedor_id" 
              value={selectedProvId} 
              onChange={e => setSelectedProvId(e.target.value)} 
              disabled={modalType === 'associate' && !associatedLineInfo}
              required
            >
              <option value="">Seleccione Operadora...</option>
              {proveedores.map(p => (
                <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Plan de Abono</label>
            <select 
              className="premium-input" 
              style={{ width: '100%', padding: '12px' }} 
              name="plan_id" 
              value={selectedPlanId} 
              onChange={e => setSelectedPlanId(e.target.value)}
              disabled={modalType === 'associate' && !associatedLineInfo}
            >
              <option value="">Sin Plan asignado</option>
              {planes.map(p => (
                <option key={p.plan_id} value={p.plan_id}>{p.nombre_plan}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Estado</label>
            <select 
              className="premium-input" 
              style={{ width: '100%', padding: '12px' }} 
              name="estado" 
              value={selectedEstado} 
              onChange={e => setSelectedEstado(e.target.value)}
              disabled={modalType === 'associate' && !associatedLineInfo}
            >
              <option value="Activa">Activa</option>
              <option value="Suspendida">Suspendida</option>
              <option value="Baja">Baja</option>
            </select>
          </div>

          <div>
            <label className="form-label">Descuento Especial de Línea (%)</label>
            <input 
              className="premium-input" 
              style={{ width: '100%', padding: '12px' }} 
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={descuentoEsperado} 
              onChange={e => setDescuentoEsperado(e.target.value)}
              disabled={modalType === 'associate' && !associatedLineInfo}
              placeholder="Ej: 0 para usar el del socio, o 90 para esta línea"
            />
          </div>

          <button 
            type="submit" 
            className="action-button" 
            style={{ width: '100%', padding: '16px', borderRadius: '16px', marginTop: '8px' }} 
            disabled={loading || (modalType === 'associate' && !associatedLineInfo)}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Save size={18} style={{ marginRight: '8px' }} />}
            {modalType === 'associate' ? 'Asociar y Guardar Línea' : 'Guardar Línea'}
          </button>
        </form>
      </Modal>
    </>
  );
}
