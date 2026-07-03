import { useState, useCallback } from 'react';

export function usePagination(initialPage = 1, initialPageSize = 50) {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);

  const reset = useCallback(() => setPage(1), []);
  const goToPage = useCallback((p) => setPage(Math.max(1, p)), []);
  const nextPage = useCallback(() => setPage(p => p + 1), []);
  const prevPage = useCallback(() => setPage(p => Math.max(1, p - 1)), []);

  return {
    page,
    pageSize,
    total,
    setTotal,
    reset,
    goToPage,
    nextPage,
    prevPage,
    setPageSize,
  };
}
