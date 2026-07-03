import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

const ConfirmContext = createContext(null);

export const ConfirmProvider = ({ children }) => {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    onConfirm: null,
    onCancel: null,
    isDanger: false,
  });

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title: options.title || 'Confirmación',
        message: options.message || '¿Estás seguro?',
        confirmText: options.confirmText || 'Confirmar',
        cancelText: options.cancelText || 'Cancelar',
        isDanger: options.isDanger || false,
        onConfirm: () => {
          setConfirmState(s => ({ ...s, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setConfirmState(s => ({ ...s, isOpen: false }));
          resolve(false);
        }
      });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {confirmState.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="air-card animate-fade" style={{ width: '400px', padding: '32px', textAlign: 'center' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: confirmState.isDanger ? '#fee2e2' : '#f0fdf4',
              color: confirmState.isDanger ? '#dc2626' : '#16a34a'
            }}>
              {confirmState.isDanger ? <AlertTriangle size={32} /> : <CheckCircle2 size={32} />}
            </div>
            
            <h3 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '12px', color: 'var(--text-primary)' }}>
              {confirmState.title}
            </h3>
            
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: 1.5, fontWeight: 500 }}>
              {confirmState.message}
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={confirmState.onCancel}
                className="air-btn"
                style={{ flex: 1, background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              >
                {confirmState.cancelText}
              </button>
              <button 
                onClick={confirmState.onConfirm}
                className="air-btn"
                style={{ flex: 1, background: confirmState.isDanger ? '#dc2626' : 'var(--accent)', color: 'white', border: 'none' }}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

// Global helper for services
export const globalConfirm = {
  ask: async () => true, // Fallback
  setFunction: (fn) => {
    globalConfirm.ask = fn;
  }
};
