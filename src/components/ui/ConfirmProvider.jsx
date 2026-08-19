import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';

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

  useBodyScrollLock(confirmState.isOpen);

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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, overscrollBehavior: 'contain', padding: '20px' }}>
          <div className="glass-panel animate-scale-up" style={{ width: '100%', maxWidth: '460px', padding: '32px', textAlign: 'center', borderRadius: '24px', background: 'var(--surface)', border: '1px solid var(--border-light)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: confirmState.isDanger ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              color: confirmState.isDanger ? '#ef4444' : '#10b981',
              border: `1px solid ${confirmState.isDanger ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`
            }}>
              {confirmState.isDanger ? <AlertTriangle size={32} /> : <CheckCircle2 size={32} />}
            </div>
            
            <h3 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '14px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {confirmState.title}
            </h3>
            
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px', lineHeight: 1.6, fontWeight: 500, whiteSpace: 'pre-line' }}>
              {confirmState.message}
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={confirmState.onCancel}
                className="air-btn"
                style={{ flex: 1, background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '12px 16px', fontSize: '13.5px', fontWeight: 700 }}
              >
                {confirmState.cancelText}
              </button>
              <button 
                onClick={confirmState.onConfirm}
                className="air-btn-primary"
                style={{ flex: 1, background: confirmState.isDanger ? '#dc2626' : 'var(--accent)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 16px', fontSize: '13.5px', fontWeight: 800 }}
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
