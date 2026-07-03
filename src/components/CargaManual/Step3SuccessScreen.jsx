import { Calendar, Database, FileText, CreditCard, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function Step3SuccessScreen({
  periodo,
  selectedProvider,
  fileData,
  invoiceTotals,
  setStep,
  setSelectedProvider,
  setRawData,
  navigate
}) {
  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', padding: '40px 0' }}>
      <div style={{ 
        position: 'relative',
        width: '100%',
        maxWidth: '600px',
        padding: '48px',
        borderRadius: '32px',
        background: 'linear-gradient(145deg, var(--surface) 0%, rgba(30, 41, 59, 0.4) 100%)',
        border: '1px solid var(--border-light)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
        overflow: 'hidden',
        textAlign: 'center'
      }}>
        {/* Efecto de brillo de fondo */}
        <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '300px', height: '300px', background: 'var(--accent)', filter: 'blur(100px)', opacity: 0.15, borderRadius: '50%', pointerEvents: 'none' }}></div>

        <div style={{ 
          width: '80px', height: '80px', 
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', 
          borderRadius: '24px', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          margin: '0 auto 24px', color: 'white',
          boxShadow: '0 10px 25px rgba(34, 197, 94, 0.4)',
          transform: 'scale(1)',
          animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
        }}>
          <CheckCircle2 size={40} strokeWidth={2.5} />
        </div>
        
        <h2 style={{ fontSize: '32px', fontWeight: '900', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.02em' }}>¡Carga Exitosa!</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginBottom: '32px', maxWidth: '400px', margin: '0 auto 32px' }}>
          Los consumos han sido procesados y guardados en la base de datos de forma segura.
        </p>

        {/* Stats Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
          gap: '12px', 
          marginBottom: '40px',
          textAlign: 'left'
        }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={12} /> Período
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent)' }}>{periodo}</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={12} /> Proveedor
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{selectedProvider}</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={12} /> Líneas Guardadas
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>{fileData.length}</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CreditCard size={12} /> Total Base Aprox.
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>
              ${(invoiceTotals.total || fileData.reduce((acc, curr) => acc + curr.montoFactura, 0)).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes popIn {
            0% { transform: scale(0.5); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          .btn-shine {
            position: relative;
            overflow: hidden;
          }
          .btn-shine::after {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%);
            transform: rotate(30deg);
            animation: shine 3s infinite;
          }
          @keyframes shine {
            0% { left: -100%; }
            20% { left: 100%; }
            100% { left: 100%; }
          }
        `}</style>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <button 
            onClick={() => navigate(`/gestion-pagos?periodo=${periodo}&proveedor=${selectedProvider === 'claro' ? 1 : selectedProvider === 'movistar' ? 2 : 3}`)} 
            className="air-btn btn-shine" 
            style={{ 
              background: 'var(--accent)', 
              color: 'white', 
              flex: 1, 
              fontWeight: 800,
              padding: '16px',
              fontSize: '15px',
              boxShadow: '0 8px 20px rgba(99, 102, 241, 0.3)'
            }}
          >
            <ArrowRight size={18} style={{ marginRight: '8px' }} />
            Ir a Auditar Período
          </button>
          <button 
            onClick={() => { setStep(1); setSelectedProvider(null); setRawData(''); }} 
            className="air-btn air-btn-secondary" 
            style={{ flex: 1, padding: '16px', fontSize: '15px' }}
          >
            <RefreshCw size={18} style={{ marginRight: '8px' }} />
            Cargar otro archivo
          </button>
        </div>
      </div>
    </div>
  );
}
