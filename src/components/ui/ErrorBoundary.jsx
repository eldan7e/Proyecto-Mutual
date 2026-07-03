import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '40px' }}>
          <div className="glass-panel" style={{ padding: '40px', borderRadius: '24px', maxWidth: '500px', textAlign: 'center', border: '1px solid var(--border-light)' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '12px' }}>Ocurrió un error inesperado en este componente</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
              {this.state.error?.message || 'Ha ocurrido un fallo crítico al renderizar esta sección.'}
            </p>
            <button 
              className="action-button" 
              onClick={() => window.location.reload()}
              style={{ background: 'var(--accent)', color: 'white', borderRadius: '12px', padding: '12px 24px' }}
            >
              <RefreshCw size={16} style={{ marginRight: '8px' }} /> Recargar la página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
