import { useEffect, useState } from 'react';
import {
  Users, Smartphone, TrendingUp, TrendingDown, AlertCircle,
  Activity, BarChart3, Calendar, ArrowRight, CircleDollarSign,
  CreditCard, Wallet, Zap
} from 'lucide-react';
import { fetchDashboardData } from './services/dashboardService';
import { formatUTCDate, formatCurrency, formatRelativeTime } from './utils/formatters';

export default function Dashboard() {
  const [stats, setStats] = useState({
    socios: 0,
    lineas: 0,
    facturacion: 0,
    pendiente: 0,
    crecimientoSocios: 0,
    crecimientoLineas: 0,
  });
  const [salesData, setSalesData] = useState([]);
  const [providerData, setProviderData] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [logs, setLogs] = useState([]);
  const [globalCounts, setGlobalCounts] = useState({ socios: 0, lineas: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredBar, setHoveredBar] = useState(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const { liquidaciones, consumos, auditLogs, globalCounts: gCounts } = await fetchDashboardData();

        const aggregatedSales = {};
        const monthlyStats = {};
        if (liquidaciones) {
          liquidaciones.forEach(l => {
            const monto = Number(l.monto_total_facturado);
            if (!aggregatedSales[l.periodo]) aggregatedSales[l.periodo] = 0;
            aggregatedSales[l.periodo] += monto;
          });
        }
        if (consumos) {
          consumos.forEach(c => {
            if (!monthlyStats[c.periodo]) {
              monthlyStats[c.periodo] = { lineas: new Set(), socios: new Set() };
            }
            monthlyStats[c.periodo].lineas.add(c.numero_linea);
            if (c.lineas?.socio_id) {
              monthlyStats[c.periodo].socios.add(c.lineas.socio_id);
            }
          });
        }

        const sortedPeriods = Object.keys(aggregatedSales).sort();
        const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
        setSelectedPeriod(lastPeriod);

        const chartData = sortedPeriods.slice(-7).map(p => ({
          periodo: p,
          monto: aggregatedSales[p],
          lineas: monthlyStats[p]?.lineas ? monthlyStats[p].lineas.size : 0,
          socios: monthlyStats[p]?.socios ? monthlyStats[p].socios.size : 0
        }));
        setSalesData(chartData);

        // Proveedores
        const aggregatedProviders = {};
        liquidaciones.forEach(l => {
          const monto = Number(l.monto_total_facturado);
          const provNombre = l.proveedores?.nombre || 'OTRO';
          if (!aggregatedProviders[provNombre]) aggregatedProviders[provNombre] = 0;
          aggregatedProviders[provNombre] += monto;
        });
        const provData = Object.keys(aggregatedProviders).map(name => ({
          nombre: name,
          monto: aggregatedProviders[name]
        })).sort((a, b) => b.monto - a.monto);
        setProviderData(provData);

        if (auditLogs) setLogs(auditLogs);
        setGlobalCounts({ socios: gCounts.sociosCount || 0, lineas: gCounts.lineasActivasCount || 0 });

        // Estadísticas contextuales del período seleccionado
        const facturacionPeriodo = liquidaciones
          .filter(l => l.periodo === lastPeriod)
          .reduce((acc, curr) => acc + Math.round(Number(curr.monto_total_facturado || 0) * 100), 0) / 100;
        const pendientePeriodo = liquidaciones
          .filter(l => l.periodo === lastPeriod && l.estado_pago === 'PENDIENTE')
          .reduce((acc, curr) => acc + Math.round(Number(curr.monto_total_facturado || 0) * 100), 0) / 100;
        const sociosPeriodo = monthlyStats[lastPeriod]?.socios.size || 0;
        const lineasPeriodo = monthlyStats[lastPeriod]?.lineas.size || 0;

        // Crecimiento vs mes anterior
        const currentIndex = sortedPeriods.indexOf(lastPeriod);
        let crecimientoSocios = 0, crecimientoLineas = 0;
        if (currentIndex > 0) {
          const prevPeriod = sortedPeriods[currentIndex - 1];
          const currentS = monthlyStats[lastPeriod]?.socios || new Set();
          const prevS = monthlyStats[prevPeriod]?.socios || new Set();
          const currentL = monthlyStats[lastPeriod]?.lineas || new Set();
          const prevL = monthlyStats[prevPeriod]?.lineas || new Set();
          crecimientoSocios = [...currentS].filter(s => !prevS.has(s)).length;
          crecimientoLineas = [...currentL].filter(l => !prevL.has(l)).length;
        }

        setStats({
          socios: sociosPeriodo,
          lineas: lineasPeriodo,
          facturacion: facturacionPeriodo,
          pendiente: pendientePeriodo,
          crecimientoSocios,
          crecimientoLineas
        });

      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Formateador de moneda
  const fmt = (n) => formatCurrency(n);

  // Obtener el mes más reciente para mostrar
  const currentMonth = selectedPeriod ? new Date(selectedPeriod + '-01').toLocaleString('es-AR', { month: 'long', year: 'numeric' }) : '';

  if (isLoading) {
    return (
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: '120px', borderRadius: '24px' }}></div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          <div className="skeleton" style={{ height: '400px', borderRadius: '24px' }}></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="skeleton" style={{ flex: 1, borderRadius: '24px' }}></div>
            <div className="skeleton" style={{ flex: 1, borderRadius: '24px' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* ===== 4 KPI CARDS CON TENDENCIA ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px'
      }}>
        {/* Total Socios */}
        <KpiCard
          icon={<Users size={22} />}
          label="Socios"
          value={globalCounts.socios.toLocaleString()}
          trend={stats.crecimientoSocios}
          color="#2e7d32"
          bg="rgba(46,125,50,0.08)"
          subtitle={`+${stats.crecimientoSocios} este mes`}
        />
        {/* Total Líneas */}
        <KpiCard
          icon={<Smartphone size={22} />}
          label="Líneas"
          value={globalCounts.lineas.toLocaleString()}
          trend={stats.crecimientoLineas}
          color="#6366f1"
          bg="rgba(99,102,241,0.08)"
          subtitle={`+${stats.crecimientoLineas} este mes`}
        />
        {/* Facturación */}
        <KpiCard
          icon={<CircleDollarSign size={22} />}
          label={`Facturación (${currentMonth})`}
          value={fmt(stats.facturacion)}
          trend={null}
          color="#10b981"
          bg="rgba(16,185,129,0.08)"
          subtitle={`${stats.socios} socios activos`}
        />
        {/* Deuda Pendiente */}
        <KpiCard
          icon={<AlertCircle size={22} />}
          label="Deuda Pendiente"
          value={fmt(stats.pendiente)}
          trend={null}
          color="#ef4444"
          bg="rgba(239,68,68,0.08)"
          subtitle={`${((stats.pendiente / (stats.facturacion || 1)) * 100).toFixed(1)}% del facturado`}
        />
      </div>

      {/* ===== GRÁFICO + COLUMNA DERECHA ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '24px',
        alignItems: 'stretch'
      }}>

        {/* GRÁFICO DE FACTURACIÓN */}
        <div className="bento-card" style={{
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '380px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Facturación por período
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Últimos {salesData.length} meses
              </p>
            </div>
            <div style={{
              background: 'var(--accent-light)',
              color: 'var(--accent)',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700
            }}>
              {selectedPeriod}
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            height: '220px',
            gap: '12px',
            paddingBottom: '8px',
            borderBottom: '1px solid var(--border-light)'
          }}>
            {salesData.map((d, i) => {
              const maxMonto = Math.max(...salesData.map(s => s.monto), 1);
              const heightPerc = Math.max((d.monto / maxMonto) * 100, 5);
              const isSelected = selectedPeriod === d.periodo;

              return (
                <div
                  key={i}
                  onClick={() => setSelectedPeriod(d.periodo)}
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '48px',
                    height: `${heightPerc}%`,
                    minHeight: '8px',
                    background: isSelected
                      ? 'linear-gradient(180deg, var(--accent), #34d399)'
                      : 'linear-gradient(180deg, var(--border-light), rgba(0,0,0,0.04))',
                    borderRadius: '6px 6px 4px 4px',
                    boxShadow: isSelected ? '0 4px 16px rgba(46,125,50,0.25)' : 'none',
                    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transform: isSelected || hoveredBar === i ? 'scaleX(1.05) translateY(-3px)' : 'scaleX(1)'
                  }}>
                    {(isSelected || hoveredBar === i) && (
                      <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 8px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--surface)',
                        color: 'var(--text-primary)',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        boxShadow: 'var(--shadow-soft)',
                        whiteSpace: 'nowrap',
                        border: '1px solid var(--border-light)'
                      }}>
                        ${(d.monto / 1000000).toFixed(1)}M
                      </div>
                    )}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    fontWeight: isSelected ? 800 : 500,
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    textAlign: 'center',
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {d.periodo.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{
            marginTop: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            fontWeight: 600
          }}>
            <span>💡 Hacé clic en una barra para filtrar</span>
            <span>Max: ${(Math.max(...salesData.map(s => s.monto)) / 1000000).toFixed(1)}M</span>
          </div>
        </div>

        {/* COLUMNA DERECHA: Crecimiento + Proveedores */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Crecimiento Neto */}
          <div className="bento-card" style={{ padding: '24px 20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>
              Crecimiento Neto
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--accent)' }}>
                  +{stats.crecimientoSocios}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Socios
                </div>
              </div>
              <div style={{ width: '1px', background: 'var(--border-light)' }} />
              <div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#6366f1' }}>
                  +{stats.crecimientoLineas}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Líneas
                </div>
              </div>
            </div>
            <p style={{
              marginTop: '12px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              vs mes anterior
            </p>
          </div>

          {/* Proveedores */}
          <div className="bento-card" style={{ padding: '24px 20px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Distribución por Operadora
              </h3>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                background: 'var(--bg-app)',
                padding: '2px 10px',
                borderRadius: '12px'
              }}>
                {selectedPeriod}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {providerData.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Sin datos para este período
                </p>
              ) : (
                providerData.map((p, i) => {
                  const total = providerData.reduce((acc, cur) => acc + cur.monto, 0);
                  const pct = total > 0 ? (p.monto / total) * 100 : 0;
                  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
                  const color = colors[i % colors.length];
                  return (
                    <div key={i}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        fontWeight: 600,
                        marginBottom: '4px'
                      }}>
                        <span style={{ color: 'var(--text-primary)' }}>{p.nombre}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          ${(p.monto / 1000000).toFixed(2)}M
                          <span style={{ marginLeft: '6px', fontWeight: 800, color }}>({pct.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div style={{
                        height: '6px',
                        background: 'var(--bg-app)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: color,
                          borderRadius: '4px',
                          transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)'
                        }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ===== ACTIVIDAD RECIENTE ===== */}
      <div className="bento-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Actividad Reciente
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Últimos 10 eventos
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {logs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px 0' }}>
              No hay actividad reciente
            </p>
          ) : (
            logs.slice(0, 10).map((log) => {
              const colors = ['#2e7d32', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
              const hash = log.id ? (typeof log.id === 'number' ? log.id : parseInt(String(log.id).slice(0, 8), 16) || 0) : 0;
              const avatarColor = colors[hash % colors.length];
              const initial = log.descripcion ? log.descripcion.charAt(0).toUpperCase() : 'A';
              return (
                <div key={log.id} style={{
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border-light)',
                  transition: 'background 0.15s'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: `${avatarColor}15`,
                    color: avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '16px',
                    flexShrink: 0
                  }}>
                    {initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {log.descripcion}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {formatRelativeTime(log.fecha)}
                    </div>
                  </div>
                  {log.monto && (
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: Number(log.monto) >= 0 ? 'var(--accent)' : 'var(--danger)'
                    }}>
                      {Number(log.monto) >= 0 ? '+' : ''}{fmt(log.monto)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}

// ===== COMPONENTE KPI CARD REUTILIZABLE =====
const KpiCard = ({ icon, label, value, trend, color, bg, subtitle }) => {
  const isPositive = trend > 0;
  const isNegative = trend < 0;
  const showTrend = trend !== null && trend !== undefined;

  return (
    <div className="bento-card" style={{
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'default'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = 'var(--shadow-premium)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '14px',
          background: bg,
          color: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {icon}
        </div>
        {showTrend && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '13px',
            fontWeight: 700,
            color: isPositive ? '#10b981' : isNegative ? '#ef4444' : 'var(--text-secondary)'
          }}>
            {isPositive ? <TrendingUp size={16} /> : isNegative ? <TrendingDown size={16} /> : null}
            <span>{isPositive ? '+' : ''}{trend}</span>
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {label}
        </div>
        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {value}
        </div>
        {subtitle && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
