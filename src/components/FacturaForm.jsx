import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, Trash2, Search, Save, X, FileCheck } from 'lucide-react';

export default function FacturaForm({ onSave, onClose }) {
  const [tipoComprobante, setTipoComprobante] = useState('Factura B');
  const [targetType, setTargetType] = useState('grupo');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  
  const [items, setItems] = useState([{ id: 1, descripcion: '', monto: '' }]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchTerm.length > 2) {
      searchTarget();
    }
  }, [searchTerm, targetType]);

  async function searchTarget() {
    let query;
    if (targetType === 'grupo') {
      query = supabase.from('grupos').select('numero_grupo, alias_grupo, email_facturacion').ilike('alias_grupo', `%${searchTerm}%`);
    } else {
      query = supabase.from('socios').select('socio_id, nombre_completo, dni').ilike('nombre_completo', `%${searchTerm}%`);
    }
    const { data } = await query.limit(5);
    setSearchResults(data || []);
  }

  const addItem = () => setItems([...items, { id: Date.now(), descripcion: '', monto: '' }]);
  const removeItem = (id) => setItems(items.filter(i => i.id !== id));
  
  const updateItem = (id, field, value) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const total = items.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);

  async function handleEmitir() {
    if (!selectedTarget) return alert('Selecciona un receptor');
    setLoading(true);

    try {
      // 1. Llamar a la Edge Function de AFIP
      const { data, error: functionError } = await supabase.functions.invoke('afip-invoice', {
        body: { 
          denominacion_receptor: targetType === 'grupo' ? selectedTarget.alias_grupo : selectedTarget.nombre_completo,
          imp_total: total,
          tipo: tipoComprobante,
          numero_grupo: targetType === 'grupo' ? selectedTarget.numero_grupo : null
        }
      });

      if (functionError) throw functionError;

      // 2. Guardar en la base de datos con el CAE obtenido
      const invoiceData = {
        fecha: new Date().toISOString().split('T')[0],
        tipo: tipoComprobante,
        denominacion_receptor: targetType === 'grupo' ? selectedTarget.alias_grupo : selectedTarget.nombre_completo,
        numero_grupo: targetType === 'grupo' ? selectedTarget.numero_grupo : null,
        imp_total: total,
        cod_autorizacion: data.cae, // CAE real de AFIP
        id: data.nro_comprobante // Usamos el número de factura de AFIP
      };

      const { error: dbError } = await supabase.from('afip_emitidas').insert([invoiceData]);
      if (dbError) throw dbError;

      alert(`Factura emitida con éxito. CAE: ${data.cae}`);
      onSave();
    } catch (err) {
      console.error(err);
      alert('Error al conectar con AFIP: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div>
          <label className="form-label">Tipo de Comprobante</label>
          <select className="form-input" value={tipoComprobante} onChange={(e) => setTipoComprobante(e.target.value)}>
            <option>Factura B</option>
            <option>Factura C</option>
            <option>Nota de Crédito B</option>
          </select>
        </div>
        <div>
          <label className="form-label">Receptor</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button 
              className="nav-pill" 
              style={{ flex: 1, background: targetType === 'grupo' ? 'var(--accent)' : 'var(--accent-light)', color: targetType === 'grupo' ? 'white' : 'var(--accent)', border: 'none' }}
              onClick={() => { setTargetType('grupo'); setSelectedTarget(null); }}
            >Grupo</button>
            <button 
              className="nav-pill" 
              style={{ flex: 1, background: targetType === 'socio' ? 'var(--accent)' : 'var(--accent-light)', color: targetType === 'socio' ? 'white' : 'var(--accent)', border: 'none' }}
              onClick={() => { setTargetType('socio'); setSelectedTarget(null); }}
            >Socio</button>
          </div>
          
          {!selectedTarget ? (
            <div style={{ position: 'relative' }}>
              <div className="search-pill" style={{ width: '100%', background: '#f9fafb', boxShadow: 'none', border: '1px solid var(--border-light)' }}>
                <Search size={16} color="var(--text-secondary)" />
                <input 
                  placeholder={targetType === 'grupo' ? "Buscar Grupo..." : "Buscar Socio..."} 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', zIndex: 10, borderRadius: '12px', boxShadow: 'var(--shadow-soft)', border: '1px solid var(--border-light)', marginTop: '4px' }}>
                  {searchResults.map(res => (
                    <div 
                      key={targetType === 'grupo' ? res.numero_grupo : res.socio_id}
                      onClick={() => { setSelectedTarget(res); setSearchResults([]); setSearchTerm(''); }}
                      style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}
                    >
                      <p style={{ fontSize: '14px', fontWeight: 500 }}>{targetType === 'grupo' ? res.alias_grupo : res.nombre_completo}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{targetType === 'grupo' ? `Nro: ${res.numero_grupo}` : `DNI: ${res.dni}`}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--accent-light)', borderRadius: '12px', border: '1px solid var(--accent)' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}>{targetType === 'grupo' ? selectedTarget.alias_grupo : selectedTarget.nombre_completo}</p>
                <p style={{ fontSize: '12px', color: 'var(--accent)' }}>{targetType === 'grupo' ? `Grupo ${selectedTarget.numero_grupo}` : `Socio ID: ${selectedTarget.socio_id}`}</p>
              </div>
              <button onClick={() => setSelectedTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)' }}><X size={18} /></button>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>Detalle de Factura</h3>
        <table style={{ marginBottom: '12px' }}>
          <thead>
            <tr>
              <th style={{ width: '70%' }}>Descripción</th>
              <th style={{ width: '20%' }}>Monto</th>
              <th style={{ width: '10%' }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input className="form-input" style={{ marginBottom: 0 }} placeholder="Ej: Abono Mensual" value={item.descripcion} onChange={(e) => updateItem(item.id, 'descripcion', e.target.value)} />
                </td>
                <td>
                  <input className="form-input" type="number" style={{ marginBottom: 0 }} placeholder="0.00" value={item.monto} onChange={(e) => updateItem(item.id, 'monto', e.target.value)} />
                </td>
                <td>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                      <Trash2 size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="nav-pill" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', cursor: 'pointer' }}>
          <Plus size={16} /> Agregar Ítem
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '24px', borderTop: '1px solid var(--border-light)', paddingTop: '20px', marginTop: '24px' }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Total a Facturar</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>${total.toLocaleString()}</p>
        </div>
        <button className="action-button" onClick={handleEmitir} disabled={loading || total <= 0}>
          <FileCheck size={18} style={{ marginRight: '8px' }} /> {loading ? 'Conectando AFIP...' : 'Emitir con AFIP'}
        </button>
      </div>
    </div>
  );
}
