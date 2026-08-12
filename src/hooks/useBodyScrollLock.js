import { useEffect } from 'react';

/**
 * Custom hook to lock body scrolling when a modal/overlay is open,
 * preventing background page scrolling and scroll-chaining.
 *
 * @param {boolean} isOpen - Whether the modal or overlay is active
 */
export function useBodyScrollLock(isOpen) {
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isOpen]);
}

export default useBodyScrollLock;
