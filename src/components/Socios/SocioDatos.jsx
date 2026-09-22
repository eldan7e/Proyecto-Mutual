import React, { useState, useEffect } from 'react';
import { Save, Loader2, TrendingUp, Users, AlertCircle } from 'lucide-react';
import { globalToast } from '../ui/ToastProvider';
import { upsertSocioDatos } from '../../services/socioService';
import { supabase } from '../../supabaseClient';

export default function SocioDatos({ socio, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [grupoNum, setGrupoNum] = useState(socio?.grupo_socio?.[0]?.numero_grupo ? String(socio.grupo_socio[0].numero_grupo) : '');
  const [emailPrincipal, setEmailPrincipal] = useState(socio?.email || '');
  const [emailGrupo, setEmailGrupo] = useState('');
  const [sumarEmailAGrupo, setSumarEmailAGrupo] = useState(false);
  const [grupoInfo, setGrupoInfo] = useState(null);
  const [loadingGrupoInfo, setLoadingGrupoInfo] = useState(false);

  useEffect(() => {
    setGrupoNum(socio?.grupo_socio?.[0]?.numero_grupo ? String(socio.grupo_socio[0].numero_grupo) : '');
    setEmailPrincipal(socio?.email || '');
    setEmailGrupo('');
    setSumarEmailAGrupo(false);
  }, [socio]);

  useEffect(() => {
    const clean = String(grupoNum).trim();
    if (!clean || isNaN(clean)) {
      setGrupoInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingGrupoInfo(true);
      try {
        const { data } = await supabase
          .from('grupos')
          .select('numero_grupo, alias_grupo, email_facturacion, emails_integrantes')
          .eq('numero_grupo', parseInt(clean, 10))
          .maybeSingle();
        setGrupoInfo(data || null);
      } catch (err) {
        console.error('Error al consultar grupo en SocioDatos:', err);
        setGrupoInfo(null);
      } finally {
        setLoadingGrupoInfo(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [grupoNum]);

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
      await upsertSocioDatos(socio.socio_id, {
        ...data,
        sumar_email_a_grupo: sumarEmailAGrupo
      });
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
            <input 
              className="premium-input" 
              style={{ width: '100%', padding: '14px' }} 
              type="email" 
              name="email" 
              value={emailPrincipal}
              onChange={(e) => setEmailPrincipal(e.target.value)}
            />
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label className="form-label">CBU / CVU</label>
            <input 
              className="premium-input" 
              style={{ width: '100%', padding: '14px' }} 
              name="cbu" 
              defaultValue={socio?.cbu} 
              placeholder="Ingrese el CBU o CVU (22 dígitos)" 
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
              value={grupoNum}
              onChange={(e) => setGrupoNum(e.target.value)}
              placeholder="Nº Grupo (dejar vacío si es individual)" 
            />
          </div>
        </div>

        {/* Sección Mail Grupal */}
        <div style={{ 
          background: 'var(--bg-app, rgba(0,0,0,0.02))', 
          border: '1px solid var(--border-light)', 
          borderRadius: '16px', 
          padding: '20px' 
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="form-label" style={{ marginBottom: 0, fontWeight: 700 }}>Mail Grupal</label>
                {emailPrincipal && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmailGrupo(emailPrincipal);
                      setSumarEmailAGrupo(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                    title="Copiar Email Principal"
                  >
                    Copiar Principal
                  </button>
                )}
              </div>
              <input 
                className="premium-input" 
                style={{ width: '100%', padding: '12px' }} 
                type="email" 
                name="email_grupo" 
                value={emailGrupo}
                onChange={(e) => setEmailGrupo(e.target.value)}
                placeholder="correo.grupo@ejemplo.com"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', cursor: 'pointer', userSelect: 'none' }}>
                <input 
                  type="checkbox" 
                  name="sumar_email_a_grupo" 
                  checked={sumarEmailAGrupo || !!emailGrupo}
                  onChange={(e) => setSumarEmailAGrupo(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Sumar a los mails del grupo ya creado
              </label>
            </div>

            <div>
              <label className="form-label" style={{ marginBottom: '8px', opacity: 0.8 }}>Estado del Grupo</label>
              {loadingGrupoInfo ? (
                <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'rgba(0,0,0,0.03)', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={15} className="animate-spin" /> Verificando grupo #{grupoNum}...
                </div>
              ) : grupoInfo ? (
                <div style={{ 
                  padding: '12px 14px', 
                  borderRadius: '12px', 
                  background: 'rgba(59, 130, 246, 0.08)', 
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#2563eb' }}>
                    <Users size={14} /> Grupo #{grupoInfo.numero_grupo} {grupoInfo.alias_grupo ? `(${grupoInfo.alias_grupo})` : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Mails actuales:</strong> {grupoInfo.emails_integrantes || grupoInfo.email_facturacion || 'Sin mails previos'}
                  </div>
                </div>
              ) : grupoNum ? (
                <div style={{ 
                  padding: '12px 14px', 
                  borderRadius: '12px', 
                  background: 'rgba(234, 179, 8, 0.08)', 
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                  fontSize: '11.5px',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600
                }}>
                  <AlertCircle size={15} /> Grupo #{grupoNum} nuevo (se creará al guardar)
                </div>
              ) : (
                <div style={{ 
                  padding: '12px 14px', 
                  borderRadius: '12px', 
                  background: 'rgba(0,0,0,0.02)', 
                  border: '1px dashed var(--border-light)',
                  fontSize: '11.5px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4
                }}>
                  Ingresá el Grupo de Facturación para sumar este mail a los correos del grupo.
                </div>
              )}
            </div>
          </div>
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
