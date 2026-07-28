import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Search, Printer, Download, FileText, CheckCircle2, AlertCircle, RefreshCw, Loader2, ArrowUpRight } from 'lucide-react';
import { formatMoney } from '../../utils/cuentaCorrienteEngine';

export default function HistorialEmitidosTab({ onVerPDF }) {
  const [comprobantes, setComprobantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('');

  useEffect(() => {
    fetchEmitidos();
  }, []);

  async function fetchEmitidos() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('afip_emitidas')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      setComprobantes(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = comprobantes.filter(item => {
    const s = search.toLowerCase();
    const matchSearch = !s || 
      String(item.id || '').includes(s) ||
      String(item.numero_grupo || '').includes(s) ||
      (item.denominacion_receptor || '').toLowerCase().includes(s) ||
      (item.cod_autorizacion || '').toLowerCase().includes(s);

    const matchTipo = !filterTipo || item.tipo === filterTipo;
    return matchSearch && matchTipo;
  });

  return (
    <div className="glass-panel" style={{ borderRadius: '28px', overflow: 'hidden' }}>
      {/* Search & Filters */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por número, CAE, receptor o grupo..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: 'var(--text-primary)' }}
          />
        </div>

        <select 
          className="premium-input" 
          style={{ width: '180px', padding: '10px' }}
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          <option value="Recibo de Cobro">Recibos de Cobro</option>
          <option value="Factura B">Facturas B</option>
          <option value="Factura C">Facturas C</option>
          <option value="Factura A">Facturas A</option>
          <option value="Nota de Crédito B">Notas de Crédito B</option>
        </select>

        <button onClick={fetchEmitidos} className="icon-button-edit">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="premium-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '24px' }}>Comprobante</th>
              <th>Fecha</th>
              <th>Receptor / Grupo</th>
              <th>CAE / Control</th>
              <th style={{ textAlign: 'right' }}>Importe Total</th>
              <th style={{ textAlign: 'center', width: '120px' }}>Estado</th>
              <th style={{ textAlign: 'right', paddingRight: '24px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ padding: '80px', textAlign: 'center' }}><Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--accent)' }} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No se encontraron comprobantes emitidos.
                </td>
              </tr>
            ) : (
              filtered.map(item => {
                const isAFIP = item.tipo?.startsWith('Factura') || item.tipo?.startsWith('Nota');
                return (
                  <tr key={item.id}>
                    <td style={{ paddingLeft: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          background: isAFIP ? 'var(--accent-light)' : 'rgba(16, 185, 129, 0.1)',
                          color: isAFIP ? 'var(--accent)' : '#10b981',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <FileText size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '13px' }}>{item.tipo}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>N° {String(item.id).padStart(8, '0')}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.fecha}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '13px' }}>{item.denominacion_receptor || 'Consumidor Final'}</div>
                      {item.numero_grupo && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Grupo #{item.numero_grupo}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700 }}>{item.cod_autorizacion || 'PROVISORIO'}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{isAFIP ? 'CAE AFIP' : 'Control Interno'}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, fontSize: '15px', color: 'var(--text-primary)' }}>
                        {formatMoney(item.imp_total || 0)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 800,
                        background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px'
                      }}>
                        <CheckCircle2 size={12} /> Autorizado
                      </span>
                    </td>
                    <td style={{ paddingRight: '24px', textAlign: 'right' }}>
                      <button 
                        onClick={() => onVerPDF(item)}
                        className="air-btn" 
                        style={{ background: 'var(--surface-light)', border: '1px solid var(--border-light)', padding: '6px 12px', fontSize: '12px' }}
                      >
                        <Printer size={14} style={{ marginRight: '4px' }} /> Imprimir PDF
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
