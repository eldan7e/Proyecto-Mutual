import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Socios from './Socios';
import Grupos from './Grupos';
import Planes from './Planes';
import Descuentos from './Descuentos';
import { Users, UserIcon, Layers, Tag } from 'lucide-react';

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
            Administración centralizada de socios, grupos familiares/facturación, descuentos y catálogo de planes
          </p>
        </div>
      </div>

      {/* Render Component Dynamically */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'socios' && <Socios hideHeader={true} />}
        {activeTab === 'grupos' && <Grupos />}
        {activeTab === 'planes' && <Planes hideHeader={true} />}
        {activeTab === 'descuentos' && <Descuentos />}
      </div>
    </div>
  );
}
