import EditableAbonoCell from './EditableAbonoCell';

export default function AuditLineRow({ d, isPeriodoLiquidado, adicionalesData, onEditBonif, onSaveAbono, onSaveExcedente }) {
  return (
    <tr className={d.error ? 'bg-red-50' : ''}>
      <td style={{ padding: '8px 12px' }}>
        <div style={{ fontWeight: 800, fontSize: '15px' }}>{d.numero_linea}</div>
        <div style={{ fontSize: '11px', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
          {d.lineas?.planes_abonos?.nombre_plan || 'Plan No Identificado'}
          {d.calculado?.isPorted && (
            <span style={{ 
              background: 'rgba(59, 130, 246, 0.1)', 
              color: '#3b82f6', 
              fontSize: '9px', 
              fontWeight: 800, 
              padding: '2px 6px', 
              borderRadius: '4px',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              lineHeight: '1',
              display: 'inline-block'
            }}>
              Portado a {d.lineas?.proveedores?.nombre || 'otra op.'}
            </span>
          )}
        </div>
        {d.calculado?.movistarAudit && (
          <div style={{ marginTop: '4px' }}>
            <span style={{
              background: d.calculado.movistarAudit.meetsAgreement ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: d.calculado.movistarAudit.meetsAgreement ? '#10b981' : '#ef4444',
              fontSize: '10px',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: '6px',
              border: d.calculado.movistarAudit.meetsAgreement ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              letterSpacing: '-0.01em'
            }}>
              {d.calculado.movistarAudit.meetsAgreement 
                ? `🟢 OK ${d.calculado.movistarAudit.expectedPct}% Mov` 
                : `⚠️ NO CUMPLE ${d.calculado.movistarAudit.expectedPct}% (${d.calculado.movistarAudit.actualDiscountPct}%)`}
              {!d.calculado.movistarAudit.meetsAgreement && ` [+$${d.calculado.movistarAudit.diferencia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}]`}
            </span>
          </div>
        )}
      </td>
      <td style={{ padding: '8px 12px' }}>
        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
          {d.lineas?.socios?.nombre_completo || 'Sin Socio'}
        </div>
        {d.lineas?.numero_grupo && (
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '2px' }}>
            Grupo {d.lineas.numero_grupo}
          </div>
        )}
      </td>
      <td style={{ textAlign: 'right' }}>
        <EditableAbonoCell 
          consumo_id={d.consumo_id}
          initialValue={d.calculado?.baseAb || 0}
          isPeriodoLiquidado={isPeriodoLiquidado}
          onSave={onSaveAbono}
        />
        {d.calculado?.portabilityWarning && (
          <div style={{ 
            fontSize: '9px', 
            color: '#c2410c',
            fontWeight: 800,
            background: '#ffedd5',
            padding: '3px 6px',
            borderRadius: '4px',
            marginTop: '4px',
            border: '1px solid #fdba74',
            display: 'inline-block',
            maxWidth: '120px',
            lineHeight: '1.2'
          }}>
            ⚠️ {d.calculado.portabilityWarning}
          </div>
        )}
        {d.calculado?.operatorDiscountPct > 0 && (
          <div style={{ 
            fontSize: '10px', 
            color: d.calculado.hasDiscountAlert ? '#dc2626' : '#16a34a',
            fontWeight: 800,
            background: d.calculado.hasDiscountAlert ? '#fee2e2' : '#f0fdf4',
            padding: '2px 6px',
            borderRadius: '4px',
            display: 'inline-block',
            marginTop: '4px',
            border: d.calculado.hasDiscountAlert ? '1px solid #fca5a5' : '1px solid #bcf0da'
          }}>
            {d.calculado.operatorDiscountPct}% Desc. Operadora
            {d.calculado.hasDiscountAlert && ' ⚠️'}
          </div>
        )}
      </td>
      <td style={{ textAlign: 'right' }}>${((d.calculado?.cAdmin || 0) + (d.calculado?.cIVA || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
      <td style={{ textAlign: 'right' }}>${(d.calculado?.tarifaAunar || 0).toLocaleString('es-AR')}</td>
      <td style={{ textAlign: 'right', color: (d.calculado?.excedentes || 0) > 0 ? 'var(--danger)' : 'inherit', fontWeight: (d.calculado?.excedentes || 0) > 0 ? 800 : 400 }}>
        <EditableAbonoCell 
          consumo_id={d.consumo_id}
          initialValue={d.calculado?.excedentes || 0}
          isPeriodoLiquidado={isPeriodoLiquidado}
          onSave={onSaveExcedente}
        />
      </td>
      <td style={{ textAlign: 'right', paddingRight: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {d.calculado?.hasExtras && (
            <div style={{ 
              background: '#eff6ff', 
              padding: '6px 10px', 
              borderRadius: '8px', 
              border: '1px solid #bfdbfe',
              textAlign: 'right'
            }}>
              <div style={{ fontWeight: 800, color: '#1d4ed8', fontSize: '14px' }}>
                +${d.calculado.extraAmount.toLocaleString('es-AR')}
              </div>
            </div>
          )}

          {Number(d.otros_cargos_op || 0) !== 0 && (
            <div style={{ 
              background: Number(d.otros_cargos_op) > 0 ? '#eff6ff' : '#fee2e2', 
              padding: '6px 10px', 
              borderRadius: '8px', 
              border: Number(d.otros_cargos_op) > 0 ? '1px solid #bfdbfe' : '1px solid #fca5a5',
              textAlign: 'right'
            }}>
              <div style={{ fontWeight: 800, color: Number(d.otros_cargos_op) > 0 ? '#1d4ed8' : '#ef4444', fontSize: '14px' }}>
                {Number(d.otros_cargos_op) > 0 ? '+' : ''}${Number(d.otros_cargos_op).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '9px', color: Number(d.otros_cargos_op) > 0 ? '#1d4ed8' : '#ef4444', fontWeight: 900, textTransform: 'uppercase' }}>
                AJUSTE OPERADORA
              </div>
            </div>
          )}

          <div style={{ 
            background: (d.calculado?.bonifManual || 0) !== 0 ? ((d.calculado?.bonifManual || 0) > 0 ? '#f0fdf4' : '#fee2e2') : 'transparent',
            padding: (d.calculado?.bonifManual || 0) !== 0 ? '6px 10px' : '0',
            borderRadius: '8px',
            display: 'inline-block',
            border: (d.calculado?.bonifManual || 0) !== 0 ? ((d.calculado?.bonifManual || 0) > 0 ? '1px solid #bcf0da' : '1px solid #fca5a5') : 'none',
            textAlign: 'right'
          }}>
            <div style={{ 
              fontWeight: (d.calculado?.bonifManual || 0) !== 0 ? 800 : 400,
              color: (d.calculado?.bonifManual || 0) !== 0 ? ((d.calculado?.bonifManual || 0) > 0 ? '#16a34a' : '#ef4444') : 'inherit',
              fontSize: '14px'
            }}>
              {(d.calculado?.bonifManual || 0) > 0 
                ? `-$${Math.abs(d.calculado.bonifManual).toLocaleString('es-AR')}` 
                : ((d.calculado?.bonifManual || 0) < 0 
                    ? `+$${Math.abs(d.calculado.bonifManual).toLocaleString('es-AR')}` 
                    : ((d.calculado?.hasExtras || (d.calculado?.appliedDiscountPct || 0) !== 0 || (d.otros_cargos_op && Number(d.otros_cargos_op) !== 0)) ? '' : '$0')
                  )
              }
            </div>
            {(d.calculado?.appliedDiscountPct || 0) !== 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ 
                  fontSize: '10px', 
                  color: (d.calculado?.appliedDiscountPct || 0) > 0 ? '#16a34a' : '#ef4444', 
                  fontWeight: 800, 
                  textTransform: 'uppercase', 
                  marginTop: '2px' 
                }}>
                  {Math.abs(d.calculado.appliedDiscountPct)}% {(d.calculado?.appliedDiscountPct || 0) > 0 ? 'Desc.' : 'Recargo'} Socio
                </div>
                {adicionalesData[d.numero_linea]?.filter(ad => (ad.tipo === 'DESCUENTO' || ad.tipo === 'CARGO_PCT') && ad.total_cuotas > 1).map(ad => (
                  <div key={ad.id} style={{ fontSize: '9px', color: ad.tipo === 'DESCUENTO' ? '#16a34a' : '#ef4444', fontWeight: 700 }}>
                    MES {ad.cta_numero} DE {ad.total_cuotas}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
      <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--accent)', paddingRight: '12px', fontSize: '15px' }}>
        ${(d.calculado?.totalCobrar || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
      </td>
    </tr>
  );
}
