import { useState, useEffect } from 'react';
import { ShieldCheck, Save, Key, FileCode, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { getAfipConfig, saveAfipConfig } from '../../services/afipService';

export default function ConfiguracionAFIPTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [form, setForm] = useState({
    cuit: '',
    puntoVenta: 1,
    environment: 'testing',
    enabled: true,
    cert: '',
    key: ''
  });

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const cfg = await getAfipConfig();
      setForm({
        cuit: cfg.cuit || '',
        puntoVenta: cfg.puntoVenta || 1,
        environment: cfg.environment || 'testing',
        enabled: cfg.enabled,
        cert: cfg.cert || '',
        key: cfg.key || ''
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await saveAfipConfig(form);
      setMessage({ type: 'success', text: 'Configuración y certificados de AFIP guardados correctamente.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error al guardar la configuración: ' + err.message });
    } finally {
      setSaving(false);
    }
  }

  const handleFileUpload = (e, field) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setForm(prev => ({ ...prev, [field]: event.target.result }));
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '80px', textAlign: 'center', borderRadius: '28px' }}>
        <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent)' }} />
        <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Cargando configuración de AFIP...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '32px', borderRadius: '28px' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '10px', borderRadius: '14px' }}>
          <ShieldCheck size={26} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>Configuración de Certificados AFIP WSFE</h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Carga de CUIT emisor, Punto de Venta, Certificado Digital (.crt) y Clave Privada (.key) para pruebas o producción.
          </p>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '14px 18px', borderRadius: '14px', marginBottom: '24px', fontSize: '13px', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: '10px',
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: message.type === 'success' ? '#10b981' : '#ef4444',
          border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
        }}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Habilitar Conexión */}
        <div style={{
          padding: '18px 24px', background: 'var(--surface-light)', borderRadius: '18px',
          border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800 }}>Activar Facturación AFIP en Vivo</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Al estar activo, el sistema enviará las facturas a los servidores de AFIP usando tus certificados.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 800 }}>
            <input 
              type="checkbox" 
              checked={form.enabled} 
              onChange={e => setForm({...form, enabled: e.target.checked})}
              style={{ width: '20px', height: '20px', accentColor: 'var(--accent)' }}
            />
            <span>{form.enabled ? 'Habilitado' : 'Desactivado'}</span>
          </label>
        </div>

        {/* Datos Principales */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div>
            <label className="form-label">CUIT Emisor (Titular / Mutual)</label>
            <input 
              className="premium-input" 
              style={{ width: '100%', padding: '12px' }}
              placeholder="Ej: 20123456789 o 30712345678"
              value={form.cuit}
              onChange={e => setForm({...form, cuit: e.target.value})}
              required
            />
          </div>

          <div>
            <label className="form-label">Punto de Venta AFIP</label>
            <input 
              type="number" 
              min="1"
              max="9999"
              className="premium-input" 
              style={{ width: '100%', padding: '12px' }}
              placeholder="1"
              value={form.puntoVenta}
              onChange={e => setForm({...form, puntoVenta: e.target.value})}
              required
            />
          </div>

          <div>
            <label className="form-label">Modo / Entorno AFIP</label>
            <select 
              className="premium-input" 
              style={{ width: '100%', padding: '12px' }}
              value={form.environment}
              onChange={e => setForm({...form, environment: e.target.value})}
            >
              <option value="testing">Homologación (Pruebas AFIP)</option>
              <option value="production">Producción (Facturación Oficial)</option>
            </select>
          </div>
        </div>

        {/* Certificado Digital (.crt) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileCode size={16} color="var(--accent)" /> Certificado Digital (.crt / PEM)
            </label>
            <input 
              type="file" 
              accept=".crt,.pem,.txt" 
              onChange={e => handleFileUpload(e, 'cert')}
              style={{ fontSize: '12px' }}
            />
          </div>
          <textarea 
            className="premium-input" 
            rows={5}
            style={{ width: '100%', padding: '12px', fontFamily: 'monospace', fontSize: '11px' }}
            placeholder="-----BEGIN CERTIFICATE-----&#10;Pegar aquí el contenido del archivo .crt otorgado por AFIP...&#10;-----END CERTIFICATE-----"
            value={form.cert}
            onChange={e => setForm({...form, cert: e.target.value})}
          />
        </div>

        {/* Clave Privada (.key) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Key size={16} color="var(--accent)" /> Clave Privada (.key / PEM)
            </label>
            <input 
              type="file" 
              accept=".key,.pem,.txt" 
              onChange={e => handleFileUpload(e, 'key')}
              style={{ fontSize: '12px' }}
            />
          </div>
          <textarea 
            className="premium-input" 
            rows={5}
            style={{ width: '100%', padding: '12px', fontFamily: 'monospace', fontSize: '11px' }}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;Pegar aquí el contenido de la clave privada .key...&#10;-----END PRIVATE KEY-----"
            value={form.key}
            onChange={e => setForm({...form, key: e.target.value})}
          />
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
          <button 
            type="submit" 
            className="air-btn air-btn-primary"
            style={{ padding: '12px 32px', fontSize: '14px', borderRadius: '14px' }}
            disabled={saving}
          >
            {saving ? <Loader2 className="animate-spin" size={18} style={{ marginRight: '8px' }} /> : <Save size={18} style={{ marginRight: '8px' }} />}
            Guardar Configuración AFIP
          </button>
        </div>

      </form>
    </div>
  );
}
