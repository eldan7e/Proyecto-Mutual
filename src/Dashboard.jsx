import { useEffect, useState } from 'react';
import { Settings, User, Activity, TrendingUp, AlertCircle, TrendingDown } from 'lucide-react';
import { fetchDashboardData } from './services/dashboardService';
import { formatUTCDate } from './utils/formatters';

export default function Dashboard() {
  const [stats, setStats] = useState({
    socios: 0,
    lineas: 0,
    facturacion: 0,
    pendiente: 0
  });

  const [salesData, setSalesData] = useState([]);
  const [providerData, setProviderData] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [rawLiquidations, setRawLiquidations] = useState([]);
  const [monthlyDetail, setMonthlyDetail] = useState({});
  const [logs, setLogs] = useState([]);
  const [globalCounts, setGlobalCounts] = useState({ socios: 0, lineas: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const { liquidaciones, consumos, auditLogs, globalCounts: gCounts } = await fetchDashboardData();

        const aggregatedSales = {};
        const monthlyStats = {};

        if (liquidaciones) {
          setRawLiquidations(liquidaciones);
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

        setMonthlyDetail(monthlyStats);

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

        if (auditLogs) setLogs(auditLogs);
        
        setGlobalCounts({ socios: gCounts.sociosCount || 0, lineas: gCounts.lineasActivasCount || 0 });
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const [newStats, setNewStats] = useState({ socios: 0, lineas: 0 });

  useEffect(() => {
    if (!selectedPeriod || !rawLiquidations.length) return;

    // Estadísticas de las tarjetas superiores (contextuales al periodo)
    const facturacionPeriodo = rawLiquidations
      .filter(l => l.periodo === selectedPeriod)
      .reduce((acc, curr) => acc + Math.round(Number(curr.monto_total_facturado || 0) * 100), 0) / 100;
    
    const pendientePeriodo = rawLiquidations
      .filter(l => l.periodo === selectedPeriod && l.estado_pago === 'PENDIENTE')
      .reduce((acc, curr) => acc + Math.round(Number(curr.monto_total_facturado || 0) * 100), 0) / 100;

    const sociosPeriodo = monthlyDetail[selectedPeriod]?.socios.size || 0;
    const lineasPeriodo = monthlyDetail[selectedPeriod]?.lineas.size || 0;

    setStats({
      socios: sociosPeriodo,
      lineas: lineasPeriodo,
      facturacion: facturacionPeriodo,
      pendiente: pendientePeriodo
    });

    // Distribución por proveedor
    const aggregatedProviders = {};
    rawLiquidations.forEach(l => {
      if (l.periodo === selectedPeriod) {
        const monto = Number(l.monto_total_facturado);
        const provNombre = l.proveedores?.nombre || 'OTRO';
        if (!aggregatedProviders[provNombre]) aggregatedProviders[provNombre] = 0;
        aggregatedProviders[provNombre] += monto;
      }
    });

    const provData = Object.keys(aggregatedProviders).map(name => ({
      nombre: name,
      monto: aggregatedProviders[name]
    })).sort((a, b) => b.monto - a.monto);

    setProviderData(provData);

    // Cálculo de Crecimiento
    const sortedPeriods = Object.keys(monthlyDetail).sort();
    const currentIndex = sortedPeriods.indexOf(selectedPeriod);
    
    if (currentIndex > 0) {
      const prevPeriod = sortedPeriods[currentIndex - 1];
      const currentS = monthlyDetail[selectedPeriod]?.socios || new Set();
      const prevS = monthlyDetail[prevPeriod]?.socios || new Set();
      const currentL = monthlyDetail[selectedPeriod]?.lineas || new Set();
      const prevL = monthlyDetail[prevPeriod]?.lineas || new Set();

      const nSocios = [...currentS].filter(s => !prevS.has(s)).length;
      const nLineas = [...currentL].filter(l => !prevL.has(l)).length;
      
      setNewStats({ socios: nSocios, lineas: nLineas });
    } else {
      setNewStats({ socios: 0, lineas: 0 });
    }
  }, [selectedPeriod, rawLiquidations, monthlyDetail]);

  if (isLoading) {
    return (
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: '96px', borderRadius: '32px' }}></div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          <div className="skeleton" style={{ height: '400px', borderRadius: '32px' }}></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="skeleton" style={{ flex: 1, borderRadius: '32px' }}></div>
            <div className="skeleton" style={{ flex: 1, borderRadius: '32px' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* 4 Grandes Bento Cards Superiores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        {[
          { label: 'Total Socios', value: globalCounts.socios, icon: <User size={20} />, color: 'var(--accent)', bg: 'var(--accent-light)' },
          { label: 'Total Líneas', value: globalCounts.lineas, icon: <Activity size={20} />, color: '#6366f1', bg: '#eef2ff' },
          { label: `Facturado ${selectedPeriod || ''}`, value: `$${((stats.facturacion || 0) / 1000000).toFixed(2)}M`, icon: <TrendingUp size={20} />, color: '#10b981', bg: '#ecfdf5' },
          { label: 'Deuda Pendiente', value: `$${((stats.pendiente || 0) / 1000000).toFixed(2)}M`, icon: <AlertCircle size={20} />, color: '#ef4444', bg: '#fef2f2' },
        ].map((kpi, i) => (
          <div key={i} className="bento-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: 48, height: 48, borderRadius: '14px', background: kpi.bg, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {kpi.icon}
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>{typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bento-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        
        {/* Gráfico de Facturación */}
        <div className="bento-card" style={{ padding: '32px', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Facturación por Periodo</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Evolución de los últimos 7 meses</p>
            </div>
            <div style={{ background: 'var(--bg-app)', padding: '6px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700 }}>
              {selectedPeriod}
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            gap: '20px', 
            alignItems: 'flex-end', 
            height: '250px', 
            marginTop: 'auto',
            paddingBottom: '20px',
            borderBottom: '1px solid var(--border-light)'
          }}>
            {salesData.map((d, i) => {
              const maxMonto = Math.max(...salesData.map(s => s.monto), 1);
              const heightPerc = (d.monto / maxMonto) * 100;
              const isSelected = selectedPeriod === d.periodo;
              return (
                <div 
                  key={i} 
                  onClick={() => setSelectedPeriod(d.periodo)}
                  style={{ 
                    flex: 1, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
                  }}
                >
                  <div style={{ 
                    width: '100%',
                    background: isSelected ? 'linear-gradient(to top, var(--accent), #34d399)' : 'linear-gradient(to top, var(--border-light), rgba(0,0,0,0.05))', 
                    height: `${Math.max(heightPerc, 5)}%`, 
                    borderRadius: '10px 10px 4px 4px',
                    position: 'relative',
                    transform: isSelected ? 'scaleX(1.1) translateY(-2px)' : 'scaleX(1)',
                    boxShadow: isSelected ? '0 10px 30px rgba(52, 211, 153, 0.4)' : 'none',
                    transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  }}>
                    {isSelected && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '-30px', 
                        left: '50%', 
                        transform: 'translateX(-50%)', 
                        fontSize: '11px', 
                        fontWeight: 900,
                        color: 'var(--accent)',
                        whiteSpace: 'nowrap'
                      }}>
                        ${(d.monto / 1000000).toFixed(1)}M
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: isSelected ? 800 : 500, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {d.periodo}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Crecimiento y Actividad */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="bento-card" style={{ padding: '24px', flex: 1 }}>
             <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '24px' }}>Crecimiento Neto</h3>
             <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
               <div>
                 <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--accent)' }}>+{newStats.socios}</div>
                 <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Socios</div>
               </div>
               <div style={{ width: '1px', background: 'var(--border-light)' }}></div>
               <div>
                 <div style={{ fontSize: '32px', fontWeight: 900, color: '#6366f1' }}>+{newStats.lineas}</div>
                 <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Líneas</div>
               </div>
             </div>
             <p style={{ marginTop: '20px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
               Datos comparados con el mes anterior
             </p>
          </div>

          <div className="bento-card" style={{ padding: '24px', flex: 1.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Por Proveedor</h3>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-app)', padding: '4px 8px', borderRadius: '8px' }}>{selectedPeriod}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {providerData.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800 }}>{p.nombre}</div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--text-primary)' }}>${(p.monto / 1000000).toFixed(2)}M</div>
                </div>
              ))}
              {providerData.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '10px' }}>No hay datos por proveedor</div>
              )}
            </div>
          </div>

          <div className="bento-card" style={{ padding: '24px', flex: 1.5 }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '20px' }}>Actividad Reciente</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {logs.map((log, i) => (
                <div key={log.id} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Activity size={16} color="var(--accent)" />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{log.descripcion}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{formatUTCDate(log.fecha)}</div>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', fontSize: '13px' }}>
                  No hay actividad reciente
                </p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
