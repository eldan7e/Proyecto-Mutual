import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Phone, FileText } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import SocioDatos from './SocioDatos';
import SocioLineas from './SocioLineas';
import SocioHistorial from './SocioHistorial';

export default function SocioFicha({ id, onBack }) {
  const [socio, setSocio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('datos');
  const [errorState, setErrorState] = useState(null);

  useEffect(() => {
    fetchSocio();
  }, [id]);

  const fetchSocio = async () => {
    setLoading(true);
    setErrorState(null);
    try {
      const { data, error } = await supabase
        .from('socios')
        .select(`
          *,
          grupo_socio(numero_grupo),
          lineas:lineas!lineas_socio_id_fkey(*, planes_abonos(*), proveedores:proveedor_id(*), responsable:socios!lineas_socio_responsable_id_fkey(socio_id, nombre_completo))
        `)
        .eq('socio_id', id)
        .single();
      
      if (error) throw error;

      const { data: lineasACargo, error: lacErr } = await supabase
        .from('lineas')
        .select('*, planes_abonos(*), proveedores:proveedor_id(*), socios:socios!lineas_socio_id_fkey(socio_id, nombre_completo)')
        .eq('socio_responsable_id', id);

      if (lacErr) throw lacErr;

      setSocio({
        ...data,
        lineasACargo: lineasACargo || []
      });
    } catch (err) {
      console.error('Error fetching socio:', err);
      setErrorState(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '24px' }}>Cargando ficha del socio...</div>;
  }

  if (errorState || !socio) {
    return (
      <div style={{ padding: '24px', color: '#ef4444' }}>
        <h2>Socio no encontrado o Error de Carga</h2>
        {errorState && (
          <pre style={{ 
            background: 'rgba(239, 68, 68, 0.08)', 
            padding: '16px', 
            borderRadius: '12px', 
            border: '1px solid rgba(239, 68, 68, 0.2)',
            overflowX: 'auto',
            marginBottom: '16px',
            fontFamily: 'monospace',
            fontSize: '13px'
          }}>
            {JSON.stringify(errorState, null, 2) || errorState.message || String(errorState)}
          </pre>
        )}
        <button className="action-button" onClick={onBack}>Volver</button>
      </div>
    );
  }


  return (
    <div className="glass-panel" style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <button 
          className="action-button" 
          onClick={onBack}
          style={{ padding: '8px', borderRadius: '50%' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>
            {socio.nombre_completo}
          </h1>
          <div style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span>DNI: {socio.dni || 'N/A'}</span>
            <span>•</span>
            <span>Grupo: {socio.grupo_socio?.[0]?.numero_grupo ?? 'N/A'}</span>
            <span>•</span>
            <span>Alta: {socio.created_at ? new Date(socio.created_at).toLocaleDateString('es-AR') : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--border-light)', marginBottom: '32px' }}>
        <button 
          onClick={() => setActiveTab('datos')}
          style={{ 
            background: 'none', border: 'none', 
            padding: '12px 0', 
            fontSize: '15px', fontWeight: '600',
            color: activeTab === 'datos' ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'datos' ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <User size={18} /> Datos Personales
        </button>
        <button 
          onClick={() => setActiveTab('lineas')}
          style={{ 
            background: 'none', border: 'none', 
            padding: '12px 0', 
            fontSize: '15px', fontWeight: '600',
            color: activeTab === 'lineas' ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'lineas' ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Phone size={18} /> Líneas ({socio.lineas?.length || 0})
        </button>
        <button 
          onClick={() => setActiveTab('historial')}
          style={{ 
            background: 'none', border: 'none', 
            padding: '12px 0', 
            fontSize: '15px', fontWeight: '600',
            color: activeTab === 'historial' ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'historial' ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <FileText size={18} /> Historial
        </button>
      </div>

      {/* Content */}
      <div>
        {activeTab === 'datos' && (
          <SocioDatos socio={socio} onUpdate={fetchSocio} />
        )}
        {activeTab === 'lineas' && (
          <SocioLineas socio={socio} onUpdate={fetchSocio} />
        )}
        {activeTab === 'historial' && (
          <SocioHistorial socio={socio} />
        )}
      </div>
    </div>
  );
}
