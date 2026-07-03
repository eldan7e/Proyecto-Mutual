import React from 'react';

export default function PeriodSummaryCards({ periodSummary, selectedPeriod }) {
  if (!selectedPeriod) return null;

  return (
    <div className="glass-panel" style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
      gap: '20px', 
      padding: '20px 24px', 
      borderRadius: '20px', 
      marginBottom: '32px',
      background: 'rgba(255,255,255,0.01)',
      border: '1px solid var(--border-light)'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Facturación Auditada del Periodo
        </span>
        <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)' }}>
          {periodSummary.loading ? '...' : `$${periodSummary.totalBilled.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
        </span>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
          Suma total facturada a grupos
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Pagos Imputados (Cobrado)
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '22px', fontWeight: 900, color: '#10b981' }}>
            {periodSummary.loading ? '...' : `$${periodSummary.totalPaid.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
          </span>
          {!periodSummary.loading && periodSummary.totalBilled > 0 && (
            <span style={{ 
              fontSize: '10.5px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.1)', color: '#10b981'
            }}>
              {Math.min(100, Math.round((periodSummary.totalPaid / periodSummary.totalBilled) * 100))}%
            </span>
          )}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
          Monto total conciliado y saldado
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Pendiente de Cobro
        </span>
        <span style={{ fontSize: '22px', fontWeight: 900, color: '#ef4444' }}>
          {periodSummary.loading ? '...' : `$${periodSummary.totalPending.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
        </span>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
          Facturación restante por cobrar
        </p>
      </div>
    </div>
  );
}
