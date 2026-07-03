import React from 'react';
import {
  Database, CheckCircle2, Trash2, TrendingUp, ArrowRight,
  Clock, Zap
} from 'lucide-react';

export default function HistorialLotes({ batches, navigate, setSearchParams, handleDeleteBatch, stats }) {
  return (
    <div className="batch-grid">
      {(batches || []).map((batch, idx) => {
        const profit = batch.totalCobrar - batch.costoNeta;
        const profitPercent = (profit / (batch.totalCobrar || 1)) * 100;
        const provName = batch.proveedor?.nombre || 'OTRO';
        const opColor = provName === 'CLARO' ? '#e30613' : provName === 'MOVISTAR' ? '#5bc500' : '#0066ff';

        return (
          <div key={idx} className="batch-card">
            <div className="batch-header">
              <div>
                <div className="batch-period">{batch.periodo}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, marginTop: '4px' }}>
                  ID Lote: #{(batch.periodo || '').replace('-','')}{batch.proveedor?.proveedor_id || '0'}
                </div>
              </div>
              <span className="batch-operator-badge" style={{ background: `${opColor}15`, color: opColor }}>
                {provName}
              </span>
            </div>

            <div className="batch-stats-grid">
              <div className="batch-stat-item">
                <span className="batch-stat-label">Líneas Auditeadas</span>
                <span className="batch-stat-value">{batch.totalLineas}</span>
              </div>
              <div className="batch-stat-item">
                <span className="batch-stat-label">Grupos</span>
                <span className="batch-stat-value">{batch.gruposSet?.size || 0}</span>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.02)', padding: '20px', borderRadius: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)' }}>MARGEN DE GESTIÓN</span>
                <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--accent)' }}>{profitPercent.toFixed(1)}%</span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '4px' }}>
                ${profit.toLocaleString('es-AR')}
              </div>
              <div className="revenue-bar-container">
                <div className="revenue-bar-fill" style={{ width: `${profitPercent}%` }} />
              </div>
            </div>

            <div className="batch-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => navigate(`/gestion-pagos?periodo=${batch.periodo}&proveedor=${batch.proveedor?.proveedor_id}`)}
                className="btn-batch-secondary"
                style={{ flex: 1, minWidth: '140px', gap: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Database size={16} /> Auditoría
              </button>
              <button 
                onClick={() => setSearchParams({ tab: 'socios', periodo: batch.periodo, proveedor: batch.proveedor?.proveedor_id })}
                className="btn-batch-primary"
                style={{ flex: 1, minWidth: '140px', gap: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <CheckCircle2 size={16} /> Ver Liquidación
              </button>
              <button 
                onClick={() => handleDeleteBatch(batch.periodo, batch.proveedor?.proveedor_id)}
                className="btn-batch-secondary"
                style={{ flex: 'none', width: '42px', padding: 0 }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
