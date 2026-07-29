import { useState, useEffect } from 'react';
import { FileText, Plus, CheckCircle2, FileCheck, ArrowUpRight, Search, Printer, ShieldCheck, Database } from 'lucide-react';
import EmisionComprobanteForm from './components/AFIP/EmisionComprobanteForm';
import HistorialEmitidosTab from './components/AFIP/HistorialEmitidosTab';
import FacturasRecibidasTab from './components/AFIP/FacturasRecibidasTab';
import ConfiguracionAFIPTab from './components/AFIP/ConfiguracionAFIPTab';
import ComprobantePDFModal from './components/AFIP/ComprobantePDFModal';
import { supabase } from './supabaseClient';
import { formatMoney } from './utils/cuentaCorrienteEngine';

export default function ComprobantesAFIP() {
  const [activeTab, setActiveTab] = useState('emitir'); // 'emitir' | 'emitidos' | 'recibidas' | 'config'
  const [comprobantePDF, setComprobantePDF] = useState(null);

  const [stats, setStats] = useState({
    totalEmitidos: 0,
    montoEmitidos: 0,
    totalRecibidas: 0,
    montoRecibidas: 0
  });

  useEffect(() => {
    fetchStats();
  }, [activeTab]);

  async function fetchStats() {
    try {
      const [{ data: emitidos }, { data: recibidas }] = await Promise.all([
        supabase.from('afip_emitidas').select('imp_total'),
        supabase.from('afip_recibidas').select('imp_total')
      ]);

      const sumE = (emitidos || []).reduce((acc, curr) => acc + (Number(curr.imp_total) || 0), 0);
      const sumR = (recibidas || []).reduce((acc, curr) => acc + (Number(curr.imp_total) || 0), 0);

      setStats({
        totalEmitidos: emitidos?.length || 0,
        montoEmitidos: sumE,
        totalRecibidas: recibidas?.length || 0,
        montoRecibidas: sumR
      });
    } catch (err) {
      console.error(err);
    }
  }

  const handleComprobanteEmitido = (comprobante) => {
    setComprobantePDF(comprobante);
    fetchStats();
  };

  return (
    <div style={{ padding: '0 20px 40px 20px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{ background: 'var(--accent)', color: 'white', padding: '8px', borderRadius: '12px' }}>
              <FileCheck size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.03em', margin: 0 }}>Comprobantes y Facturas AFIP</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, margin: '2px 0 0 0' }}>
                Emisión de Recibos de Cobro, Facturación Electrónica AFIP con CAE, Códigos QR y Gestión de Compras
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>TOTAL EMITIDO</span>
            <FileText size={16} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>
            {formatMoney(stats.montoEmitidos)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {stats.totalEmitidos} comprobantes emitidos
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>COMPROBANTES RECIBIDOS</span>
            <Database size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#10b981' }}>
            {formatMoney(stats.montoRecibidas)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {stats.totalRecibidas} facturas de compras cargadas
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>SERVICIO AFIP WSFE</span>
            <ShieldCheck size={16} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#f59e0b', marginTop: '4px' }}>
            Configurable / WSFE v1
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Certificados Digitales & CUIT Emisor
          </div>
        </div>

      </div>

      {/* Tabs Switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'var(--surface-light)', padding: '4px', borderRadius: '14px', width: 'fit-content', border: '1px solid var(--border-light)' }}>
        <button 
          onClick={() => setActiveTab('emitir')}
          style={{
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: activeTab === 'emitir' ? 'var(--surface)' : 'transparent',
            color: activeTab === 'emitir' ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: 800, fontSize: '13px', cursor: 'pointer',
            boxShadow: activeTab === 'emitir' ? 'var(--shadow-soft)' : 'none', transition: 'all 0.2s'
          }}
        >
          📜 Emitir Comprobante / Factura
        </button>
        <button 
          onClick={() => setActiveTab('emitidos')}
          style={{
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: activeTab === 'emitidos' ? 'var(--surface)' : 'transparent',
            color: activeTab === 'emitidos' ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: 800, fontSize: '13px', cursor: 'pointer',
            boxShadow: activeTab === 'emitidos' ? 'var(--shadow-soft)' : 'none', transition: 'all 0.2s'
          }}
        >
          🧾 Comprobantes Emitidos
        </button>
        <button 
          onClick={() => setActiveTab('recibidas')}
          style={{
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: activeTab === 'recibidas' ? 'var(--surface)' : 'transparent',
            color: activeTab === 'recibidas' ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: 800, fontSize: '13px', cursor: 'pointer',
            boxShadow: activeTab === 'recibidas' ? 'var(--shadow-soft)' : 'none', transition: 'all 0.2s'
          }}
        >
          📑 Facturas Recibidas (Compras)
        </button>
        <button 
          onClick={() => setActiveTab('config')}
          style={{
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: activeTab === 'config' ? 'var(--surface)' : 'transparent',
            color: activeTab === 'config' ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: 800, fontSize: '13px', cursor: 'pointer',
            boxShadow: activeTab === 'config' ? 'var(--shadow-soft)' : 'none', transition: 'all 0.2s'
          }}
        >
          ⚙️ Configuración AFIP / Certificados
        </button>
      </div>

      {/* Active Tab Content */}
      <div style={{ flex: 1 }}>
        {activeTab === 'emitir' && (
          <EmisionComprobanteForm onComprobanteEmitido={handleComprobanteEmitido} />
        )}
        {activeTab === 'emitidos' && (
          <HistorialEmitidosTab onVerPDF={(comp) => setComprobantePDF(comp)} onRefetchStats={fetchStats} />
        )}
        {activeTab === 'recibidas' && (
          <FacturasRecibidasTab onRefetchStats={fetchStats} />
        )}
        {activeTab === 'config' && (
          <ConfiguracionAFIPTab />
        )}
      </div>

      {/* PDF Modal */}
      {comprobantePDF && (
        <ComprobantePDFModal 
          comprobante={comprobantePDF} 
          onClose={() => setComprobantePDF(null)} 
        />
      )}
    </div>
  );
}
