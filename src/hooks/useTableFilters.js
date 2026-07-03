import { useState, useMemo } from 'react';

/**
 * Custom Hook for generic table filtering and sorting.
 * 
 * @param {Array} initialData - The data array to filter and sort
 * @param {Object} options - Configuration options
 * @param {string} options.initialSortKey - Default sorting key
 * @param {string} options.initialSortDirection - 'asc' or 'desc'
 * @param {Array<string|Function>} options.searchFields - Fields or getter functions to search text against
 * @param {string|Function} options.providerField - Field or getter function for provider filtering
 * @param {Function} options.getSortValue - Optional custom getter function for sorting values: (item, key) => value
 */
export default function useTableFilters(initialData = [], options = {}) {
  const { 
    initialSortKey = '', 
    initialSortDirection = 'desc',
    searchFields = [], 
    providerField = 'proveedor', 
    getSortValue
  } = options;

  const [search, setSearch] = useState('');
  const [filterProv, setFilterProv] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: initialSortKey, direction: initialSortDirection });

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedData = useMemo(() => {
    let result = [...(initialData || [])];

    // 1. Filter by provider
    if (filterProv) {
      result = result.filter(item => {
        const provValue = typeof providerField === 'function' 
            ? providerField(item) 
            : item[providerField];
        
        return provValue === filterProv;
      });
    }

    // 2. Filter by search text
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(item => {
        return searchFields.some(field => {
          const val = typeof field === 'function' ? field(item) : item[field];
          return String(val || '').toLowerCase().includes(s);
        });
      });
    }

    // 3. Sort
    result.sort((a, b) => {
      if (!sortConfig.key) return 0;
      
      const aVal = getSortValue ? getSortValue(a, sortConfig.key) : a[sortConfig.key];
      const bVal = getSortValue ? getSortValue(b, sortConfig.key) : b[sortConfig.key];

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [initialData, search, filterProv, sortConfig, searchFields, providerField, getSortValue]);

  return {
    search,
    setSearch,
    filterProv,
    setFilterProv,
    sortConfig,
    setSortConfig,
    handleSort,
    filteredAndSortedData
  };
}
