import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Search, Plus, RefreshCw, Loader2, FileCheck, Building2, AlertCircle } from 'lucide-react';
import { formatMoney } from '../../utils/cuentaCorrienteEngine';

export default function FacturasRecibidasTab() {
  const [recibidas, setRecibidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [proveedores, setProveedores] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    tipo: 'Factura A',
    cod_autorizacion: '',
    nro_doc_emisor: '',
    denominacion_emisor: '',
    imp_total: '',
    proveedor_id: ''
  });

  useEffect(() => {
    fetchRecibidas();
    fetchProveedores();
  }, []);

  async function fetchProveedores() {
    const { data } = await supabase.from('proveedores').select('id, nombre').order('nombre');
    setProveedores(data || []);
  }

  async function fetchRecibidas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('afip_recibidas')
        .select('*')
        .order('id', { ascending: false });
      if (error) throw error;
      setRecibidas(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRecibida(e) {
    e.preventDefault();
    if (!form.denominacion_emisor || !form.imp_total) return alert('Completa los campos obligatorios');

    try {
      const payload = {
        fecha: form.fecha,
        tipo: form.tipo,
        cod_autorizacion: form.cod_autorizacion,
        nro_doc_emisor: form.nro_doc_emisor,
        denominacion_emisor: form.denominacion_emisor,
        imp_total: parseFloat(form.imp_total),
        proveedor_id: form.proveedor_id ? parseInt(form.proveedor_id) : null
      };

      const { error } = await supabase.from('afip_recibidas').insert([payload]);
      if (error) throw error;

      setIsModalOpen(false);
      setForm({ fecha: new Date().toISOString().split('T')[0], tipo: 'Factura A', cod_autorizacion: '', nro_doc_emisor: '', denominacion_emisor: '', imp_total: '', proveedor_id: '' });
      fetchRecibidas();
    } catch (err) {
      alert('Error al guardar comprobante: ' + err.message);
    }
  }

  const filtered = recibidas.filter(r => {
    const s = search.toLowerCase();
    return !s || 
      (r.denominacion_emisor || '').toLowerCase().includes(s) ||
      (r.nro_doc_emisor || '').includes(s) ||
      (r.cod_autorizacion || '').toLowerCase().includes(s);
  });

  return (
    <div className="glass-panel" style={{ borderRadius: '28px', overflow: 'hidden' }}>
      {/* Header Bar */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: '400px' }}>
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por emisor, CUIT o CAE..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setIsModalOpen(true)} className="air-btn air-btn-primary" style={{ padding: '8px 18px', fontSize: '13px' }}>
            <Plus size={16} style={{ marginRight: '6px' }} /> Registrar Factura Recibida
          </button>
          <button onClick={fetchRecibidas} className="icon-button-edit">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="premium-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '24px' }}>Fecha</th>
              <th>Emisor / Proveedor</th>
              <th>CUIT Emisor</th>
              <th>Tipo Comprobante</th>
              <th>CAE / Control</th>
              <th style={{ textAlign: 'right', paddingRight: '24px' }}>Importe Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ padding: '80px', textAlign: 'center' }}><Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent)' }} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No hay comprobantes de compra/proveedor registrados.
                </td>
              </tr>
            ) : (
              filtered.map(item => (
                <tr key={item.id}>
                  <td style={{ paddingLeft: '24px', fontWeight: 600 }}>{item.fecha}</td>
                  <td>
                    <div style={{ fontWeight: 800, fontSize: '13px' }}>{item.denominacion_emisor}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>{item.nro_doc_emisor || '—'}</div>
                  </td>
                  <td>
                    <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: 'var(--surface-light)', border: '1px solid var(--border-light)' }}>
                      {item.tipo}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700 }}>{item.cod_autorizacion || '—'}</div>
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '24px', fontWeight: 900, fontSize: '15px' }}>
                    {formatMoney(item.imp_total || 0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Carga Factura Recibida */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '540px', padding: '28px', borderRadius: '24px' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 800 }}>Registrar Comprobante Recibido</h3>
            <form onSubmit={handleCreateRecibida} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Fecha</label>
                  <input type="date" className="premium-input" style={{ width: '100%', padding: '10px' }} value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} required />
                </div>
                <div>
                  <label className="form-label">Tipo Comprobante</label>
                  <select className="premium-input" style={{ width: '100%', padding: '10px' }} value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}>
                    <option>Factura A</option>
                    <option>Factura B</option>
                    <option>Factura C</option>
                    <option>Nota de Crédito A</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Proveedor / Emisor</label>
                <input className="premium-input" style={{ width: '100%', padding: '10px' }} placeholder="Ej: Telecom Argentina S.A." value={form.denominacion_emisor} onChange={e => setForm({...form, denominacion_emisor: e.target.value})} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">CUIT Emisor</label>
                  <input className="premium-input" style={{ width: '100%', padding: '10px' }} placeholder="30-54673891-3" value={form.nro_doc_emisor} onChange={e => setForm({...form, nro_doc_emisor: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">CAE / N° Autorización</label>
                  <input className="premium-input" style={{ width: '100%', padding: '10px' }} placeholder="Opcional" value={form.cod_autorizacion} onChange={e => setForm({...form, cod_autorizacion: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="form-label">Importe Total ($)</label>
                <input type="number" step="0.01" className="premium-input" style={{ width: '100%', padding: '10px' }} placeholder="0.00" value={form.imp_total} onChange={e => setForm({...form, imp_total: e.target.value})} required />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="air-btn" style={{ padding: '10px 18px', background: 'var(--surface-light)' }}>Cancelar</button>
                <button type="submit" className="air-btn air-btn-primary" style={{ padding: '10px 22px' }}>Guardar Factura</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
