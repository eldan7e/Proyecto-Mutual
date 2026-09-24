import React, { useState, useEffect } from 'react';
import { StickyNote, Save, Loader2, Calendar, PlusCircle, CheckCircle2, Ticket, ExternalLink, ShieldAlert } from 'lucide-react';
import { updateSocioNotas } from '../../services/socioService';
import { globalToast } from '../ui/ToastProvider';
import { useNavigate } from 'react-router-dom';

export default function SocioNotas({ socio, onUpdate }) {
  const navigate = useNavigate();
  const [notas, setNotas] = useState(socio?.notas_internas || '');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setNotas(socio?.notas_internas || '');
    setHasChanges(false);
  }, [socio?.socio_id, socio?.notas_internas]);

  const handleChange = (e) => {
    setNotas(e.target.value);
    setHasChanges(true);
  };

  const handleInsertTimestamp = (prefix = '') => {
    const now = new Date();
    const formatted = now.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ' ' + now.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const stamp = `\n[${formatted}${prefix ? ` - ${prefix}` : ''}]: `;
    setNotas(prev => (prev ? prev.trimEnd() + stamp : stamp.trimStart()));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSocioNotas(socio.socio_id, notas.trim());
      globalToast.success('Notas guardadas correctamente');
      setHasChanges(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error al guardar notas del socio:', err);
      globalToast.error(err.message || 'Error al guardar notas');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '32px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '860px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'rgba(234, 179, 8, 0.15)',
              color: '#d97706',
              padding: '8px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <StickyNote size={20} />
            </div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Notas Internas y Observaciones
            </h3>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Registro privado del socio visible para el equipo administrativo. Podés anotar bajas de líneas, suspensiones, acuerdos de pago o novedades.
          </p>
        </div>

        {/* Acceso a Tareas / Tickets */}
        <button
          type="button"
          onClick={() => navigate('/tareas')}
          className="btn-ghost"
          style={{
            padding: '8px 14px',
            fontSize: '12.5px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            borderRadius: '10px',
            border: '1px solid var(--border-light)',
            cursor: 'pointer'
          }}
          title="Abrir módulo de Tareas y Tickets"
        >
          <Ticket size={15} color="var(--accent)" />
          <span>Gestionar Tickets</span>
          <ExternalLink size={12} opacity={0.6} />
        </button>
      </div>

      {/* Botones de inserción rápida */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        flexWrap: 'wrap', 
        alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(0, 0, 0, 0.02)',
        borderRadius: '14px',
        border: '1px solid var(--border-light)'
      }}>
        <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginRight: '4px' }}>
          Insertar rápido:
        </span>
        <button
          type="button"
          onClick={() => handleInsertTimestamp()}
          className="btn-ghost"
          style={{
            padding: '5px 10px',
            fontSize: '11.5px',
            fontWeight: 700,
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <Calendar size={13} color="var(--accent)" />
          Fecha y Hora
        </button>
        <button
          type="button"
          onClick={() => handleInsertTimestamp('Baja de Línea')}
          className="btn-ghost"
          style={{
            padding: '5px 10px',
            fontSize: '11.5px',
            fontWeight: 700,
            borderRadius: '8px',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            background: 'rgba(239, 68, 68, 0.05)',
            color: '#dc2626',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          🛑 Baja de Línea
        </button>
        <button
          type="button"
          onClick={() => handleInsertTimestamp('Suspensión')}
          className="btn-ghost"
          style={{
            padding: '5px 10px',
            fontSize: '11.5px',
            fontWeight: 700,
            borderRadius: '8px',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            background: 'rgba(245, 158, 11, 0.05)',
            color: '#d97706',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          ⏸️ Suspensión
        </button>
        <button
          type="button"
          onClick={() => handleInsertTimestamp('Contacto')}
          className="btn-ghost"
          style={{
            padding: '5px 10px',
            fontSize: '11.5px',
            fontWeight: 700,
            borderRadius: '8px',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            background: 'rgba(59, 130, 246, 0.05)',
            color: '#2563eb',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          💬 Contacto
        </button>
      </div>

      {/* Editor de notas */}
      <div style={{ position: 'relative' }}>
        <textarea
          value={notas}
          onChange={handleChange}
          placeholder="Escribí aquí las notas u observaciones internas sobre el socio (ej: acuerdos de cobro, números dados de baja, gestiones telefónicas, motivos de suspensión)..."
          rows={10}
          className="premium-input"
          style={{
            width: '100%',
            padding: '16px',
            lineHeight: 1.6,
            fontSize: '14px',
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: '220px',
            border: hasChanges ? '1.5px solid var(--accent)' : '1px solid var(--border-light)'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          <span>{notas ? `${notas.length} caracteres` : 'Sin notas registradas'}</span>
          {hasChanges && <span style={{ color: '#d97706', fontWeight: 700 }}>● Hay cambios sin guardar</span>}
        </div>
      </div>

      {/* Botón Guardar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="action-button"
          style={{
            padding: '12px 28px',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            opacity: !hasChanges && !saving ? 0.6 : 1,
            cursor: !hasChanges && !saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          <span>Guardar Notas</span>
        </button>
      </div>
    </div>
  );
}
