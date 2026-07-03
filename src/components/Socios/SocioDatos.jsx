import React, { useState } from 'react';
import { Save, Loader2, TrendingUp } from 'lucide-react';
import { globalToast } from '../ui/ToastProvider';
import { upsertSocioDatos } from '../../services/socioService';

export default function SocioDatos({ socio, onUpdate }) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    if (data.nro_socio === '') data.nro_socio = null;
    else data.nro_socio = parseInt(data.nro_socio, 10);

    if (data.desc_adicionales === '') data.desc_adicionales = null;
    else data.desc_adicionales = parseFloat(data.desc_adicionales);

    if (data.cta_numero === '') data.cta_numero = null;
    else data.cta_numero = parseInt(data.cta_numero, 10);

    if (data.total_cuotas === '') data.total_cuotas = null;
    else data.total_cuotas = parseInt(data.total_cuotas, 10);

    if (data.dni === '') data.dni = null;
    if (data.cuit === '') data.cuit = null;
    if (data.email === '') data.email = null;
    if (data.codigo_lex === '') data.codigo_lex = null;
    if (data.cbu === '') data.cbu = null;

    try {
      await upsertSocioDatos(socio.socio_id, data);
      globalToast.success('Datos actualizados correctamente');
      onUpdate();
    } catch (error) {
      globalToast.error(error.message || 'Error al actualizar datos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px' }}>
      <div className="glass-panel" style={{ padding: '32px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Información Personal</h3>
        
        <div>
          <label className="form-label">Nombre Completo</label>
          <input className="premium-input" style={{ width: '100%', padding: '14px' }} name="nombre_completo" defaultValue={socio?.nombre_completo} required />
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label className="form-label">DNI</label>
            <input className="premium-input" style={{ width: '100%', padding: '14px' }} name="dni" defaultValue={socio?.dni} />
          </div>
          <div>
            <label className="form-label">CUIT</label>
            <input className="premium-input" style={{ width: '100%', padding: '14px' }} name="cuit" defaultValue={socio?.cuit} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label className="form-label">Código Lex</label>
            <input className="premium-input" style={{ width: '100%', padding: '14px' }} name="codigo_lex" defaultValue={socio?.codigo_lex} />
          </div>
          <div>
            <label className="form-label">Email Principal</label>
            <input className="premium-input" style={{ width: '100%', padding: '14px' }} type="email" name="email" defaultValue={socio?.email} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label className="form-label">Forma de Pago</label>
            <select className="premium-input" style={{ width: '100%', padding: '14px' }} name="fpago" defaultValue={socio?.fpago || 'M'}>
              <option value="M">Mutual (M)</option>
              <option value="BC">Banco (BC)</option>
              <option value="R">Recibo (R)</option>
            </select>
          </div>
          <div>
            <label className="form-label">Nro Socio</label>
            <input className="premium-input" style={{ width: '100%', padding: '14px' }} type="number" name="nro_socio" defaultValue={socio?.nro_socio} />
          </div>
        </div>

        <div>
          <label className="form-label">CBU / CVU</label>
          <input 
            className="premium-input" 
            style={{ width: '100%', padding: '14px' }} 
            name="cbu" 
            defaultValue={socio?.cbu} 
            placeholder="Ingrese el CBU o CVU del socio (22 dígitos)" 
            maxLength={22} 
          />
        </div>

        <div>
          <label className="form-label">Grupo de Facturación</label>
          <input 
            className="premium-input" 
            style={{ width: '100%', padding: '14px' }} 
            type="number" 
            name="numero_grupo" 
            defaultValue={socio?.grupo_socio?.[0]?.numero_grupo || ''} 
            placeholder="Nro del Grupo Familiar/Empresa (dejar vacío si no pertenece a ninguno)" 
          />
        </div>
        
      </div>

      <div className="glass-panel" style={{ padding: '32px', borderRadius: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={16} /> Beneficios y Cuotas
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div>
            <label className="form-label">Descuento (%)</label>
            <input className="premium-input" style={{ width: '100%', padding: '14px' }} type="number" name="desc_adicionales" defaultValue={socio?.desc_adicionales || 0} min="0" max="100" step="0.01" />
          </div>
          <div>
            <label className="form-label">Cuota Actual</label>
            <input className="premium-input" style={{ width: '100%', padding: '14px' }} type="number" name="cta_numero" defaultValue={socio?.cta_numero || 0} min="0" />
          </div>
          <div>
            <label className="form-label">Total Cuotas</label>
            <input className="premium-input" style={{ width: '100%', padding: '14px' }} type="number" name="total_cuotas" defaultValue={socio?.total_cuotas || 0} min="0" />
          </div>
        </div>
      </div>

      <button type="submit" className="action-button" style={{ padding: '16px', borderRadius: '16px', fontSize: '16px' }} disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <Save size={20} style={{ marginRight: '8px' }} />}
        Guardar Cambios
      </button>
    </form>
  );
}
