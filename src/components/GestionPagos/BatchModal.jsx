import { useState } from 'react';
import { X, Settings2, DollarSign, RefreshCw } from 'lucide-react';
import { Loader2, CheckCircle2 } from 'lucide-react';

export default function BatchModal({ isPeriodoLiquidado, selectedPeriodo, initialBatchPlans, onSave, onClose, isSaving, handleLoadPreviousPeriodPrices }) {
  const [batchPlans, setBatchPlans] = useState(initialBatchPlans);
  const [globalTarifaAunar, setGlobalTarifaAunar] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="glass-panel-sub" style={{ width: '560px', padding: '24px', borderRadius: '24px', position: 'relative', background: 'var(--modal-bg)' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="var(--text-secondary)" /></button>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', marginRight: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '8px', borderRadius: '10px' }}><Settings2 size={20} /></div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>Matriz Histórica: {selectedPeriodo}</h3>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>Ajusta los valores para este periodo.</p>
            </div>
          </div>
          {!isPeriodoLiquidado && (
            <button 
              onClick={handleLoadPreviousPeriodPrices}
              className="air-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-light)', padding: '6px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}
            >
              <RefreshCw size={16} />
              Copiar Período Anterior
            </button>
          )}
        </div>

        {isPeriodoLiquidado && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: '#d97706',
            padding: '10px 14px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 700,
            lineHeight: '1.4',
            marginBottom: '16px'
          }}>
            ⚠️ Este período ya tiene liquidaciones generadas. Modificar la matriz actualizará los consumos, pero deberás regenerar las liquidaciones de los socios para que reflejen los nuevos precios.
          </div>
        )}

        <div style={{ background: 'var(--surface)', padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border-light)', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '6px', borderRadius: '8px' }}><DollarSign size={16} /></div>
            <div>
              <span style={{ fontWeight: 800, fontSize: '13px', display: 'block' }}>Tarifa Aunar Global</span>
            </div>
          </div>
          <input 
            type="number"
            className="premium-input"
            style={{ height: '32px', width: '120px', fontSize: '14px', textAlign: 'center', fontWeight: 800, padding: '4px 8px' }}
            value={globalTarifaAunar}
            placeholder="0"
            onFocus={e => e.target.select()}
            onChange={e => {
              const valStr = e.target.value;
              setGlobalTarifaAunar(valStr);
              if (valStr !== '') {
                const valNum = Number(valStr);
                setBatchPlans(prev => prev.map(p => ({ ...p, tarifa: valNum })));
              }
            }}
          />
        </div>

        <div style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-light)' }}>
                <th style={{ padding: '8px', fontSize: '10px', fontWeight: 800 }}>PLAN</th>
                <th style={{ padding: '8px', fontSize: '10px', fontWeight: 800, textAlign: 'right' }}>COSTO LISTA ($)</th>
                <th style={{ padding: '8px', fontSize: '10px', fontWeight: 800, textAlign: 'right' }}>TARIFA AUNAR ($)</th>
              </tr>
            </thead>
            <tbody>
              {batchPlans.map((plan, idx) => (
                <tr key={plan.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '8px', fontWeight: 700, fontSize: '12px' }}>{plan.nombre}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <input 
                      type="number"
                      className="premium-input"
                      style={{ padding: '4px 8px', height: 'auto', width: '100px', textAlign: 'right', fontSize: '13px', fontWeight: 600 }}
                      value={plan.precio}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const newPlans = [...batchPlans];
                        newPlans[idx].precio = e.target.value === '' ? '' : Number(e.target.value);
                        setBatchPlans(newPlans);
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <input 
                      type="number"
                      className="premium-input"
                      style={{ padding: '4px 8px', height: 'auto', width: '100px', textAlign: 'right', fontSize: '13px', fontWeight: 600 }}
                      value={plan.tarifa}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const newPlans = [...batchPlans];
                        newPlans[idx].tarifa = e.target.value === '' ? '' : Number(e.target.value);
                        setBatchPlans(newPlans);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} className="air-btn" style={{ flex: 1, padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Cancelar</button>
          <button onClick={() => onSave(batchPlans)} disabled={isSaving} className="air-btn" style={{ flex: 2, background: 'var(--accent)', color: 'white', padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
