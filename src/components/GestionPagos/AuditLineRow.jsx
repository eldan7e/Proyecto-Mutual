import EditableAbonoCell from './EditableAbonoCell';
import { Plus, Tag, Ticket } from 'lucide-react';

export default function AuditLineRow({ d, isPeriodoLiquidado, adicionalesData, onEditBonif, onSaveAbono, onSaveExcedente, onOpenDescuento, onCreateTicket, openTickets }) {
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
                ? `🟢 OK ${d.calculado.movistarAudit.expectedPct}%` 
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
        {((d.calculado?.operatorDiscountPct > 0) || (d.calculado?.descuentoMesesRestantes !== undefined && d.calculado?.descuentoMesesRestantes !== null)) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', marginTop: '4px' }}>
            {d.calculado?.operatorDiscountPct > 0 && (
              <div style={{ 
                fontSize: '10px', 
                color: d.calculado.hasDiscountAlert ? '#dc2626' : '#16a34a',
                fontWeight: 800,
                background: d.calculado.hasDiscountAlert ? '#fee2e2' : '#f0fdf4',
                padding: '2px 6px',
                borderRadius: '4px',
                display: 'inline-block',
                border: d.calculado.hasDiscountAlert ? '1px solid #fca5a5' : '1px solid #bcf0da'
              }}>
                {d.calculado.operatorDiscountPct}% Desc. Operadora
                {d.calculado.hasDiscountAlert && ' ⚠️'}
              </div>
            )}
            
            {(() => {
              const mRest = d.calculado?.descuentoMesesRestantes ?? d.descuento_meses_restantes ?? d.lineas?.descuento_meses_restantes;
              const mActual = d.calculado?.descuentoMesActual ?? d.descuento_mes_actual ?? d.lineas?.descuento_mes_actual;
              const mTotal = d.calculado?.descuentoMesesTotal ?? d.descuento_meses_total ?? d.lineas?.descuento_meses_total;
              const vigenciaStr = d.calculado?.descuentoVigencia ?? d.descuento_vigencia ?? d.lineas?.descuento_vigencia;
              
              if (mRest === undefined || mRest === null) return null;
              const isExpiring = mRest === 0;
              const cleanLineaNum = String(d.numero_linea || '').replace(/\D/g, '');
              const hasOpenTicket = openTickets ? openTickets.has(cleanLineaNum) : false;

              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{
                    background: isExpiring ? '#fef2f2' : '#eef2ff',
                    color: isExpiring ? '#dc2626' : '#4f46e5',
                    border: isExpiring ? '1px solid #fca5a5' : '1px solid #c7d2fe',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    whiteSpace: 'nowrap'
                  }} title={`Mes ${mActual || '?'} de ${mTotal || '?'} (${mRest} restantes)`}>
                    {isExpiring ? '⚠️ Vence este mes' : `${vigenciaStr || `Mes ${mActual}/${mTotal}`} (${mRest}m rest.)`}
                  </span>
                  {onCreateTicket && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateTicket(d);
                      }}
                      style={{
                        background: hasOpenTicket ? '#f1f5f9' : (isExpiring || mRest <= 1) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.08)',
                        color: hasOpenTicket ? '#64748b' : (isExpiring || mRest <= 1) ? '#dc2626' : '#4f46e5',
                        border: hasOpenTicket ? '1px solid #cbd5e1' : (isExpiring || mRest <= 1) ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(99, 102, 241, 0.25)',
                        borderRadius: '4px',
                        padding: '1px 5px',
                        fontSize: '9px',
                        fontWeight: 800,
                        cursor: hasOpenTicket ? 'default' : 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                      disabled={hasOpenTicket}
                      title={hasOpenTicket ? 'Ya existe un ticket abierto en Tareas' : 'Crear ticket de vencimiento en Tareas'}
                    >
                      <Ticket size={9} />
                      {hasOpenTicket ? 'Ticket Creado' : 'Crear Ticket'}
                    </button>
                  )}
                </div>
              );
            })()}
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
            <div 
              onClick={() => onOpenDescuento && onOpenDescuento(d)}
              title="Hacé clic para modificar o eliminar este ajuste de operadora"
              style={{ 
                cursor: 'pointer',
                background: Number(d.otros_cargos_op) > 0 ? '#eff6ff' : '#fee2e2', 
                padding: '6px 10px', 
                borderRadius: '8px', 
                border: Number(d.otros_cargos_op) > 0 ? '1px solid #bfdbfe' : '1px solid #fca5a5',
                textAlign: 'right',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ fontWeight: 800, color: Number(d.otros_cargos_op) > 0 ? '#1d4ed8' : '#ef4444', fontSize: '14px' }}>
                {Number(d.otros_cargos_op) > 0 ? '+' : ''}${Number(d.otros_cargos_op).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '9px', color: Number(d.otros_cargos_op) > 0 ? '#1d4ed8' : '#ef4444', fontWeight: 900, textTransform: 'uppercase' }}>
                AJUSTE OPERADORA
              </div>
            </div>
          )}

          {/* Descuentos / Cargos editables */}
          {(Math.abs(d.calculado?.bonifManual || 0) > 0.01 || (d.calculado?.appliedDiscountPct || 0) !== 0) ? (
            <div
              onClick={() => onOpenDescuento && onOpenDescuento(d)}
              title="Hacé clic para modificar o eliminar este descuento/cargo"
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '2px',
                padding: '4px 8px',
                borderRadius: '8px',
                transition: 'all 0.15s ease',
                background: (d.calculado?.appliedDiscountPct || 0) >= 0 && (d.calculado?.bonifManual || 0) >= 0 ? '#f0fdf4' : '#fff7ed',
                border: (d.calculado?.appliedDiscountPct || 0) >= 0 && (d.calculado?.bonifManual || 0) >= 0 ? '1px solid #bcf0da' : '1px solid #ffedd5'
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ fontWeight: 800, color: ((d.calculado?.bonifManual || 0) > 0 || (d.calculado?.appliedDiscountPct || 0) > 0) ? '#16a34a' : '#c2410c', fontSize: '14px' }}>
                  {(d.calculado?.bonifManual || 0) > 0 || (d.calculado?.appliedDiscountPct || 0) > 0 ? '-' : '+'}${Math.abs(d.calculado?.bonifManual || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
                <Tag size={12} color={((d.calculado?.bonifManual || 0) > 0 || (d.calculado?.appliedDiscountPct || 0) > 0) ? '#16a34a' : '#c2410c'} />
              </div>
              
              {(d.calculado?.appliedDiscountPct || 0) !== 0 && (
                <div style={{ 
                  fontSize: '10px', 
                  color: (d.calculado?.appliedDiscountPct || 0) > 0 ? '#16a34a' : '#c2410c', 
                  fontWeight: 800, 
                  textTransform: 'uppercase'
                }}>
                  {Math.abs(d.calculado.appliedDiscountPct)}% {(d.calculado?.appliedDiscountPct || 0) > 0 ? 'Desc.' : 'Cargo'} Socio
                </div>
              )}

              {adicionalesData[d.numero_linea]?.filter(ad => (ad.tipo === 'DESCUENTO' || ad.tipo === 'CARGO_PCT' || ad.tipo === 'CARGO') && ad.total_cuotas > 1).map(ad => {
                const isDesc = ad.tipo === 'DESCUENTO';
                const remaining = Math.max(0, (ad.total_cuotas || 1) - (ad.cta_numero || 1));
                const [pYear, pMonth] = (d.periodo || '').split('-').map(Number);
                const baseMonth = (pMonth && !isNaN(pMonth)) ? pMonth - 1 : new Date().getMonth();
                const baseYear = (pYear && !isNaN(pYear)) ? pYear : new Date().getFullYear();
                const endMonth = (baseMonth + remaining) % 12;
                const endYear = baseYear + Math.floor((baseMonth + remaining) / 12);
                const shortMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                const endStr = `${shortMonths[endMonth]} ${endYear}`;
                return (
                  <div key={ad.id} style={{ fontSize: '9px', color: isDesc ? '#16a34a' : '#c2410c', fontWeight: 700 }}>
                    MES {ad.cta_numero} DE {ad.total_cuotas} (Fin: {endStr})
                  </div>
                );
              })}
            </div>
          ) : (
            <button
              onClick={() => onOpenDescuento && onOpenDescuento(d)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                border: '1px dashed var(--border-light)',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                background: 'rgba(0,0,0,0.02)',
                transition: 'all 0.15s ease'
              }}
              title="Crear descuento o cargo para esta línea"
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
            >
              <Plus size={11} /> $0 (Crear)
            </button>
          )}
        </div>
      </td>
      <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--accent)', paddingRight: '12px', fontSize: '15px' }}>
        ${(d.calculado?.totalCobrar || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
      </td>
    </tr>
  );
}
