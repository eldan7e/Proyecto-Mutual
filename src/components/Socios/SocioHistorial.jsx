import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Activity, Loader2, MessageSquare, Clock } from 'lucide-react';

import { fetchSocioConsumosData, fetchSocioIncidentsData } from '../../services/socioService';

export default function SocioHistorial({ socio }) {
  const [consumos, setConsumos] = useState([]);
  const [incidentes, setIncidentes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, [socio.socio_id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        { consumos: consumosData },
        incidentesData
      ] = await Promise.all([
        fetchSocioConsumosData(socio.socio_id),
        fetchSocioIncidentsData(socio.socio_id)
      ]);
      
      setConsumos(consumosData || []);
      setIncidentes(incidentesData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredConsumos = consumos.filter(c => 
    c.numero_linea?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.periodo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="animate-spin" size={28} style={{ margin: '0 auto', color: 'var(--accent)' }} /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Consumos Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} color="var(--accent)" /> Historial de Facturación
          </h4>
          
          {consumos.length > 0 && (
            <input
              type="text"
              placeholder="Buscar por línea o período..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="air-input"
              style={{
                maxWidth: '240px',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: 'var(--surface-overlay)',
                color: 'var(--text-primary)'
              }}
            />
          )}
        </div>
        
        {consumos.length === 0 ? (
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No se registran consumos mensuales facturados para este socio.
          </div>
        ) : (
          <div className="glass-panel" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
              <table className="premium-table" style={{ width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th>Período</th>
                    <th>Línea</th>
                    <th style={{ textAlign: 'right' }}>Abono Base</th>
                    <th style={{ textAlign: 'right' }}>Excedentes</th>
                    <th style={{ textAlign: 'right' }}>Extra</th>
                    <th style={{ textAlign: 'right' }}>Dto.</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConsumos.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>
                        No se encontraron consumos que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredConsumos.map((c, idx) => {
                      const prevConsumo = consumos
                        .filter(x => x.numero_linea === c.numero_linea && x.periodo < c.periodo)
                        .sort((a, b) => b.periodo.localeCompare(a.periodo))[0];

                      let diffPct = null;
                      if (prevConsumo) {
                        const currentVal = c.calculado?.totalCobrar || 0;
                        const prevVal = prevConsumo.calculado?.totalCobrar || 0;
                        if (prevVal > 0) {
                          diffPct = ((currentVal - prevVal) / prevVal) * 100;
                        }
                      }

                      return (
                        <tr key={`${c.consumo_id}-${idx}`}>
                          <td style={{ fontWeight: 800 }}>{c.periodo}</td>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: '13px' }}>{c.numero_linea}</div>
                            {c.lineas?.planes_abonos?.nombre_plan && (
                              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: 500 }}>
                                {c.lineas.planes_abonos.nombre_plan}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>${Number(c.calculado?.baseAb || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{c.calculado?.excedentes > 0 ? `+$${Number(c.calculado.excedentes).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>
                          <td style={{ textAlign: 'right', color: '#ef4444' }}>{c.calculado?.extraAmount > 0 ? `+$${Number(c.calculado.extraAmount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>
                          <td style={{ textAlign: 'right', color: '#10b981' }}>{c.calculado?.bonifManual > 0 ? `-$${Number(c.calculado.bonifManual).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 900 }}>
                            <div>${Number(c.calculado?.totalCobrar || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            {diffPct !== null && (
                              <div style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                color: diffPct === 0 ? 'var(--text-secondary)' : diffPct > 0 ? '#ef4444' : '#16a34a',
                                marginTop: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                gap: '2px'
                              }}>
                                {diffPct > 0.05 ? `↑ +${diffPct.toFixed(1)}%` : diffPct < -0.05 ? `↓ ${diffPct.toFixed(1)}%` : '0.0%'}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              padding: '4px 8px', borderRadius: '100px', fontSize: '9px', fontWeight: 900,
                              background: (c.estado_pago === 'ABONADO' || c.estado_pago === 'LIQUIDADO') ? 'rgba(34, 197, 94, 0.1)' : c.estado_pago === 'PENDIENTE' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                              color: (c.estado_pago === 'ABONADO' || c.estado_pago === 'LIQUIDADO') ? '#22c55e' : c.estado_pago === 'PENDIENTE' ? '#ef4444' : '#f59e0b'
                            }}>
                              {c.estado_pago === 'ABONADO' ? 'PAGO' : c.estado_pago}
                            </span>
                            {c.pagado_por_otro && c.liq_socio_nombre && (
                              <div 
                                title={`Responsable del grupo: ${c.liq_socio_nombre}`}
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: 'var(--text-secondary)',
                                  marginTop: '4px',
                                  maxWidth: '110px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  margin: '4px auto 0 auto'
                                }}
                              >
                                {(c.estado_pago === 'ABONADO' || c.estado_pago === 'LIQUIDADO') 
                                  ? `Por: ${c.liq_socio_nombre}` 
                                  : `Resp: ${c.liq_socio_nombre}`
                                }
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Incidentes Section */}
      <div>
        <h4 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={20} color="var(--accent)" /> Tickets de Reclamo
        </h4>
        
        {incidentes.length === 0 ? (
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No hay tickets registrados para las líneas de este socio.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {incidentes.map(inc => (
              <div key={inc.id_incidente} className="glass-panel-sub" style={{ padding: '20px', borderRadius: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 900, textTransform: 'uppercase' }}>{inc.tipo_incidente}</div>
                    <div style={{ fontSize: '16px', fontWeight: 900 }}>Línea: {inc.numero_linea}</div>
                  </div>
                  <span style={{ 
                    padding: '6px 12px', borderRadius: '100px', fontSize: '10px', fontWeight: 900,
                    background: inc.estado === 'Abierto' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                    color: inc.estado === 'Abierto' ? '#ef4444' : '#22c55e'
                  }}>
                    {inc.estado.toUpperCase()}
                  </span>
                </div>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', fontWeight: 500 }}>
                  {inc.descripcion_problema}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    <Clock size={12} style={{ marginRight: '4px' }} /> {new Date(inc.fecha_creacion).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
