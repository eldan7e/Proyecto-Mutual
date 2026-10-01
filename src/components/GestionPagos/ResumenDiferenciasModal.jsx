import React, { useState, useMemo } from 'react';
import { 
  X, Download, TrendingUp, TrendingDown, Users, AlertTriangle, 
  Search, ShieldCheck, CheckCircle2, ArrowRight, Smartphone,
  Layers, ArrowUpDown, ChevronRight, HelpCircle, Calendar
} from 'lucide-react';
import { exportResumenDiferenciasXLSX } from '../../services/resumenDiferenciasService';

export default function ResumenDiferenciasModal({
  isOpen,
  onClose,
  resumen,
  operadoraName,
  initialTab = 'faltantes'
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchTerm, setSearchTerm] = useState('');

  // Sincronizar tab si cambia initialTab
  React.useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  if (!isOpen || !resumen) return null;

  const { stats, tarifas, lineasFaltantes = [], lineasNuevas = [], planAverages = [], bonifBreakdown = [] } = resumen;

  // Filtrado en pestaña de faltantes
  const filteredFaltantes = lineasFaltantes.filter(f => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      f.numero_linea?.toLowerCase().includes(term) ||
      f.socioNombre?.toLowerCase().includes(term) ||
      String(f.numeroGrupo).toLowerCase().includes(term) ||
      f.planNombre?.toLowerCase().includes(term) ||
      f.label?.toLowerCase().includes(term)
    );
  });

  // Filtrado en pestaña de nuevas
  const filteredNuevas = lineasNuevas.filter(a => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      a.numero_linea?.toLowerCase().includes(term) ||
      a.socioNombre?.toLowerCase().includes(term) ||
      String(a.numeroGrupo).toLowerCase().includes(term) ||
      a.planNombre?.toLowerCase().includes(term)
    );
  });

  const handleDownloadExcel = () => {
    exportResumenDiferenciasXLSX({
      resumen,
      operadora: operadoraName
    });
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div 
        className="glass-panel animate-fade"
        style={{
          width: '100%',
          maxWidth: '1020px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '24px',
          background: 'var(--surface)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden'
        }}
      >
        {/* ── HEADER ── */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{
                background: 'linear-gradient(135deg, var(--accent) 0%, #16a34a 100%)',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 900,
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                Liquidación Confirmada
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                {operadoraName?.toUpperCase()}
              </span>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
              Resumen de Diferencias y Variación de Facturación
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0', fontWeight: 500 }}>
              Comparativa entre <strong style={{ color: 'var(--text-primary)' }}>{resumen.prevPeriodoLabel || resumen.prevPeriodo}</strong> y <strong style={{ color: 'var(--text-primary)' }}>{resumen.currPeriodoLabel || resumen.periodo}</strong>
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '8px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── TOP KPI CARDS ── */}
        <div style={{
          padding: '20px 28px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
          background: 'rgba(0, 0, 0, 0.15)',
          borderBottom: '1px solid var(--border-light)'
        }}>
          {/* Card 1: Comparativa Líneas */}
          <div style={{
            background: 'var(--bg-app)',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Líneas Mes Anterior vs Actual
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>
                {stats.currCount}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                (vs {stats.prevCount})
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px',
                background: stats.diffCount >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: stats.diffCount >= 0 ? '#16a34a' : '#ef4444',
                marginLeft: 'auto'
              }}>
                {stats.diffCount >= 0 ? `+${stats.diffCount}` : stats.diffCount} netas
              </span>
            </div>
          </div>

          {/* Card 2: Tarifa Aunar */}
          <div style={{
            background: 'var(--bg-app)',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Tarifa Aunar
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: tarifas.variacionTarifa !== 0 ? 'line-through' : 'none' }}>
                ${tarifas.tarifaAnterior.toLocaleString('es-AR')}
              </span>
              <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--accent)' }}>
                ${tarifas.tarifaActual.toLocaleString('es-AR')}
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px',
                background: Math.abs(tarifas.variacionTarifa) < 0.1 ? 'rgba(255, 255, 255, 0.05)' : tarifas.variacionTarifa > 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: Math.abs(tarifas.variacionTarifa) < 0.1 ? 'var(--text-secondary)' : tarifas.variacionTarifa > 0 ? '#16a34a' : '#ef4444',
                marginLeft: 'auto'
              }}>
                {tarifas.variacionTarifa > 0 ? `+${tarifas.variacionTarifa.toFixed(1)}%` : `${tarifas.variacionTarifa.toFixed(1)}%`}
              </span>
            </div>
          </div>

          {/* Card 3: Faltantes / No vinieron */}
          <div 
            onClick={() => setActiveTab('faltantes')}
            style={{
              background: activeTab === 'faltantes' ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-app)',
              padding: '16px',
              borderRadius: '16px',
              border: activeTab === 'faltantes' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-light)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '6px' }}>
              No Vinieron Más
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: stats.countFaltantes > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
              {stats.countFaltantes}
            </div>
          </div>

          {/* Card 4: Altas */}
          <div 
            onClick={() => setActiveTab('altas')}
            style={{
              background: activeTab === 'altas' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-app)',
              padding: '16px',
              borderRadius: '16px',
              border: activeTab === 'altas' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-light)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', marginBottom: '6px' }}>
              Líneas Nuevas (Altas)
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: stats.countAltas > 0 ? '#10b981' : 'var(--text-secondary)' }}>
              {stats.countAltas}
            </div>
          </div>
        </div>

        {/* ── BANNER BONIFICACIONES PORCENTUALES ── */}
        {bonifBreakdown && bonifBreakdown.length > 0 && (
          <div style={{
            padding: '12px 28px',
            background: 'rgba(168, 85, 247, 0.05)',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              🎁 Bonificaciones por %:
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
              {bonifBreakdown.map((b, i) => (
                <div
                  key={i}
                  onClick={() => setActiveTab('bonificaciones')}
                  style={{
                    background: activeTab === 'bonificaciones' ? 'rgba(168, 85, 247, 0.2)' : 'var(--bg-app)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s'
                  }}
                  title={`Ver detalle de líneas con ${b.label}`}
                >
                  <span style={{ fontWeight: 900, color: '#a855f7' }}>{b.label}</span>
                  <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{b.count}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>({b.pctOfTotal.toFixed(1)}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TABS NAVIGATION ── */}
        <div style={{
          padding: '12px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--border-light)',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('faltantes')}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'faltantes' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'faltantes' ? 'white' : 'var(--text-secondary)'
              }}
            >
              📉 No Vinieron Más ({stats.countFaltantes})
            </button>

            <button
              onClick={() => setActiveTab('altas')}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'altas' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'altas' ? 'white' : 'var(--text-secondary)'
              }}
            >
              📈 Nuevas Altas ({stats.countAltas})
            </button>

            <button
              onClick={() => setActiveTab('planes')}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'planes' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'planes' ? 'white' : 'var(--text-secondary)'
              }}
            >
              📊 Variación Promedio por Plan ({planAverages.length})
            </button>

            <button
              onClick={() => setActiveTab('bonificaciones')}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'bonificaciones' ? '#a855f7' : 'transparent',
                color: activeTab === 'bonificaciones' ? 'white' : 'var(--text-secondary)'
              }}
            >
              🎁 Bonificaciones por % ({bonifBreakdown.length})
            </button>
          </div>

          {(activeTab === 'faltantes' || activeTab === 'altas') && (
            <div className="search-bar" style={{ width: '260px', height: '36px' }}>
              <Search size={14} />
              <input
                placeholder="Buscar línea, socio, plan..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ fontSize: '12px' }}
              />
            </div>
          )}
        </div>

        {/* ── TAB CONTENT ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {/* TAB 1: NO VINIERON MÁS */}
          {activeTab === 'faltantes' && (
            <div>
              {filteredFaltantes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={40} color="#10b981" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                    {searchTerm ? 'No se encontraron líneas con ese criterio.' : '¡Excelente! Todas las líneas del mes pasado vinieron facturadas este mes.'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <th style={{ padding: '10px 14px' }}>Línea</th>
                        <th style={{ padding: '10px 14px' }}>Socio / Grupo</th>
                        <th style={{ padding: '10px 14px' }}>Plan Anterior</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Abono Anterior</th>
                        <th style={{ padding: '10px 14px' }}>Diagnóstico / Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFaltantes.map((f, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {f.numero_linea}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{f.socioNombre}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Grupo {f.numeroGrupo}</div>
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {f.planNombre}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>
                            ${f.abonoAnterior.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: f.badgeBg,
                              color: f.badgeColor,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              {f.label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: NUEVAS ALTAS */}
          {activeTab === 'altas' && (
            <div>
              {filteredNuevas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                  <p style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                    {searchTerm ? 'No se encontraron líneas con ese criterio.' : 'No hubo nuevas líneas incorporadas en este período respecto al mes anterior.'}
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <th style={{ padding: '10px 14px' }}>Línea</th>
                        <th style={{ padding: '10px 14px' }}>Socio / Grupo</th>
                        <th style={{ padding: '10px 14px' }}>Plan Actual</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Abono Factura</th>
                        <th style={{ padding: '10px 14px' }}>Condición</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNuevas.map((a, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {a.numero_linea}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{a.socioNombre}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Grupo {a.numeroGrupo}</div>
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {a.planNombre}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                            ${a.abonoActual.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#10b981'
                            }}>
                              Alta / Incorporación
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VARIACIÓN PROMEDIO POR PLAN */}
          {activeTab === 'planes' && (
            <div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '10px 14px' }}>Plan</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>Líneas</th>
                      <th style={{ padding: '10px 14px' }}>Abono Base Promedio</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>Variación %</th>
                      <th style={{ padding: '10px 14px' }}>Precio de Lista</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planAverages.map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {p.plan}
                        </td>
                        <td style={{ padding: '14px', textAlign: 'center', fontWeight: 700 }}>
                          {p.linesCount}
                        </td>
                        <td style={{ padding: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {p.avgPrevAbono > 0 ? (
                              <span style={{ color: 'var(--text-secondary)', textDecoration: 'line-through', fontSize: '12px' }}>
                                ${p.avgPrevAbono.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : null}
                            {p.avgPrevAbono > 0 && <ArrowRight size={12} color="var(--text-secondary)" />}
                            <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                              ${p.avgCurrAbono.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {p.avgPrevAbono > 0 && p.diffAbono !== 0 && (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: p.diffAbono > 0 ? '#ef4444' : '#10b981' }}>
                                ({p.diffAbono >= 0 ? '+' : '-'}${Math.abs(p.diffAbono).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 900,
                            background: Math.abs(p.variacionPct) < 0.2 ? 'rgba(255, 255, 255, 0.05)' : p.variacionPct > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                            color: Math.abs(p.variacionPct) < 0.2 ? 'var(--text-secondary)' : p.variacionPct > 0 ? '#ef4444' : '#10b981',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            {Math.abs(p.variacionPct) < 0.2 ? (
                              '0.0%'
                            ) : p.variacionPct > 0 ? (
                              <><TrendingUp size={12} /> +{p.variacionPct.toFixed(1)}%</>
                            ) : (
                              <><TrendingDown size={12} /> {p.variacionPct.toFixed(1)}%</>
                            )}
                          </span>
                        </td>
                        <td style={{ padding: '14px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                          {p.currListPrice > 0 || p.prevListPrice > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {p.prevListPrice > 0 && (
                                <span style={{ textDecoration: 'line-through' }}>
                                  ${p.prevListPrice.toLocaleString('es-AR')}
                                </span>
                              )}
                              {p.prevListPrice > 0 && <ArrowRight size={12} />}
                              <span style={{ color: 'var(--accent)', fontWeight: 800 }}>
                                ${p.currListPrice.toLocaleString('es-AR')}
                              </span>
                            </div>
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: BONIFICACIONES POR % */}
          {activeTab === 'bonificaciones' && (
            <div>
              <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                    Distribución de Bonificaciones del Lote
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                    Cantidad de líneas agrupadas por porcentaje de descuento aplicado en el período.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                    Con Bonificación: {stats.totalWithBonif || 0} líneas
                  </span>
                  {stats.totalSinBonif > 0 && (
                    <span style={{ fontSize: '12px', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                      Sin Bonificación: {stats.totalSinBonif} líneas
                    </span>
                  )}
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '10px 14px' }}>Porcentaje</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>Cantidad de Líneas</th>
                      <th style={{ padding: '10px 14px' }}>Participación en el Lote</th>
                      <th style={{ padding: '10px 14px' }}>Condición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bonifBreakdown.map((b, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '14px', fontWeight: 900, color: b.pct > 0 ? '#a855f7' : 'var(--text-secondary)', fontSize: '15px' }}>
                          {b.label}
                        </td>
                        <td style={{ padding: '14px', textAlign: 'center', fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>
                          {b.count}
                        </td>
                        <td style={{ padding: '14px', minWidth: '220px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1, height: '8px', background: 'var(--border-light)', borderRadius: '100px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${b.pctOfTotal}%`,
                                height: '100%',
                                background: b.pct >= 80 ? 'linear-gradient(90deg, #a855f7, #6366f1)' : b.pct > 0 ? '#3b82f6' : '#94a3b8',
                                borderRadius: '100px'
                              }} />
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', width: '45px', textAlign: 'right' }}>
                              {b.pctOfTotal.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 800,
                            background: b.pct >= 80 ? 'rgba(34, 197, 94, 0.12)' : b.pct > 0 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: b.pct >= 80 ? '#16a34a' : b.pct > 0 ? '#3b82f6' : '#ef4444'
                          }}>
                            {b.pct >= 80 ? 'Bonificación Estándar / Convenio' : b.pct > 0 ? 'Bonificación Parcial' : 'Tarifa Plena / Sin Descuento'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(0, 0, 0, 0.1)'
        }}>
          <button
            onClick={handleDownloadExcel}
            className="air-btn"
            style={{
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 800,
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#16a34a',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
          >
            <Download size={16} />
            Descargar Resumen Excel (.xlsx)
          </button>

          <button
            onClick={onClose}
            className="air-btn air-btn-primary"
            style={{
              padding: '10px 24px',
              fontSize: '13px',
              fontWeight: 800,
              borderRadius: '12px',
              cursor: 'pointer'
            }}
          >
            Entendido / Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
