import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import useBodyScrollLock from '../hooks/useBodyScrollLock';

export default function Modal({ isOpen, onClose, title, children, maxWidth = '500px' }) {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 11, 15, 0.8)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      overscrollBehavior: 'contain'
    }}>
      <div className="bento-card modal-container" style={{
        maxWidth: maxWidth,
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        position: 'relative',
        background: 'var(--modal-bg)',
        boxShadow: 'var(--shadow-premium)',
        animation: 'modalAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        transform: 'none',
        transition: 'none',
        overscrollBehavior: 'contain'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em' }}>{title}</h2>
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
            className="modal-close-btn"
          >
            <X size={18} />
          </button>
        </div>
        
        {children}

        <style>{`
          @keyframes modalAppear {
            from { opacity: 0; transform: scale(0.96) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          .modal-container:hover {
            transform: none !important;
            box-shadow: var(--shadow-premium) !important;
          }
          .modal-close-btn:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: var(--text-primary) !important;
          }
          .form-input {
            width: 100%;
            padding: 12px 16px;
            border-radius: 12px;
            border: 1px solid var(--border-light);
            background: rgba(255, 255, 255, 0.02);
            margin-bottom: 16px;
            font-size: 14px;
            color: var(--text-primary);
            outline: none;
            transition: all 0.2s;
          }
          .form-input:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px var(--accent-light);
          }
          .form-label {
            display: block;
            font-size: 13px;
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-weight: 600;
          }
          /* Custom sleek scrollbar for modal */
          .modal-container::-webkit-scrollbar {
            width: 8px;
          }
          .modal-container::-webkit-scrollbar-track {
            background: transparent;
          }
          .modal-container::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 4px;
          }
          .modal-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}
