import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, X, Info } from 'lucide-react';

const ToastContext = createContext(null);

let toastId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => {
      setToasts((prev) => prev.filter(t => t.id !== id));
    }, 300); // Matches the exit animation duration
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.type} ${toast.leaving ? 'toast-leaving' : 'toast-entering'}`}>
            <div className="toast-icon">
              {toast.type === 'success' && <CheckCircle2 size={18} />}
              {toast.type === 'error' && <AlertCircle size={18} />}
              {toast.type === 'warning' && <AlertTriangle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
            </div>
            <div className="toast-message">{toast.message}</div>
            <button className="toast-close" onClick={() => removeToast(toast.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Global helper for non-react files (like services)
// Note: This is a bit of a hack to allow services to trigger toasts without hooks.
// It requires the root component to attach the addToast function here.
export const globalToast = {
  success: (msg) => console.log('Success:', msg),
  error: (msg) => console.log('Error:', msg),
  warning: (msg) => console.log('Warning:', msg),
  info: (msg) => console.log('Info:', msg),
  setFunctions: (addFn) => {
    globalToast.success = (msg) => addFn(msg, 'success');
    globalToast.error = (msg) => addFn(msg, 'error', 6000);
    globalToast.warning = (msg) => addFn(msg, 'warning', 5000);
    globalToast.info = (msg) => addFn(msg, 'info');
  }
};
