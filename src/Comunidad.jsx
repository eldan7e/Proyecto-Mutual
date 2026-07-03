import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Socios from './Socios';
import Grupos from './Grupos';
import Planes from './Planes';
import { Users, UserIcon, Layers } from 'lucide-react';

export default function Comunidad() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'socios';

  const handleTabChange = (tabName) => {
    setSearchParams({ tab: tabName });
  };

  return (
    <div className="animate-fade" style={{ padding: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ background: 'var(--accent)', color: 'white', padding: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={22} />
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>Gestión de Comunidad</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 500 }}>
            Administración centralizada de socios, grupos familiares/facturación y catálogo de planes
          </p>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '28px', 
        borderBottom: '1px solid var(--border-light)', 
        paddingBottom: '12px' 
      }}>
        <button
          onClick={() => handleTabChange('socios')}
          className={`nav-pill ${activeTab === 'socios' ? 'active' : ''}`}
          style={{ 
            border: 'none', 
            background: activeTab === 'socios' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'socios' ? 'white' : 'var(--text-secondary)',
            cursor: 'pointer', 
            padding: '10px 20px', 
            fontWeight: 700, 
            borderRadius: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            fontSize: '14px',
            boxShadow: activeTab === 'socios' ? '0 8px 18px -4px var(--accent-shadow)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          Socios
        </button>
        <button
          onClick={() => handleTabChange('grupos')}
          className={`nav-pill ${activeTab === 'grupos' ? 'active' : ''}`}
          style={{ 
            border: 'none', 
            background: activeTab === 'grupos' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'grupos' ? 'white' : 'var(--text-secondary)',
            cursor: 'pointer', 
            padding: '10px 20px', 
            fontWeight: 700, 
            borderRadius: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            fontSize: '14px',
            boxShadow: activeTab === 'grupos' ? '0 8px 18px -4px var(--accent-shadow)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          Gestión de Grupos
        </button>
        <button
          onClick={() => handleTabChange('planes')}
          className={`nav-pill ${activeTab === 'planes' ? 'active' : ''}`}
          style={{ 
            border: 'none', 
            background: activeTab === 'planes' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'planes' ? 'white' : 'var(--text-secondary)',
            cursor: 'pointer', 
            padding: '10px 20px', 
            fontWeight: 700, 
            borderRadius: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            fontSize: '14px',
            boxShadow: activeTab === 'planes' ? '0 8px 18px -4px var(--accent-shadow)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          Planes y Costos
        </button>
      </div>

      {/* Render Component Dynamically */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'socios' && <Socios hideHeader={true} />}
        {activeTab === 'grupos' && <Grupos />}
        {activeTab === 'planes' && <Planes hideHeader={true} />}
      </div>
    </div>
  );
}
