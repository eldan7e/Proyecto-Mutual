import { useEffect } from 'react';

/**
 * Custom hook to lock body scrolling when a modal/overlay is open,
 * preventing background page scrolling and scroll-chaining.
 * Uses reference counting so multiple open modals don't permanently freeze scrolling.
 *
 * @param {boolean} isOpen - Whether the modal or overlay is active
 */
let activeLocks = 0;
let initialPaddingRight = '';

export function useBodyScrollLock(isOpen) {
  useEffect(() => {
    if (!isOpen) return;

    if (activeLocks === 0) {
      initialPaddingRight = document.body.style.paddingRight || '';
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    activeLocks++;

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) {
        document.body.style.overflow = '';
        document.body.style.paddingRight = initialPaddingRight;
      }
    };
  }, [isOpen]);
}

export default useBodyScrollLock;
