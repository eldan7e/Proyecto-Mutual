/**
 * Formats an ISO string to DD/MM/YYYY without applying timezone offsets.
 * Prevents issues where UTC-3 shifts dates backwards by 1 day.
 * @param {string} isoString - e.g., "2026-05-29T00:00:00Z" or "2026-05-29"
 * @returns {string} e.g., "29/05/2026"
 */
export function formatUTCDate(isoString) {
  if (!isoString) return '';
  const datePart = isoString.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return datePart; // Fallback
  
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Formatea un número como moneda argentina (ARS)
 */
export const formatCurrency = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '$ 0,00';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Formatea una fecha ISO a formato local (DD/MM/YYYY)
 */
export const formatDate = (dateStr, locale = 'es-AR') => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

/**
 * Formatea fecha y hora
 */
export const formatDateTime = (dateStr, locale = 'es-AR') => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Retorna tiempo relativo (hace X días, ayer, etc.)
 */
export const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 60) return 'hace unos momentos';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHrs < 24) return `hace ${diffHrs} ${diffHrs === 1 ? 'hora' : 'horas'}`;
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return formatDate(dateStr);
};

/**
 * Convierte fecha ISO (YYYY-MM-DD) a DD/MM/YYYY
 */
export const isoToArDate = (iso) => {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

/**
 * Convierte DD/MM/YYYY o DD-MM-YYYY a YYYY-MM-DD
 */
export const arDateToIso = (arDate) => {
  if (!arDate) return '';
  const parts = arDate.split(/[\/\-]/);
  if (parts.length !== 3) return arDate;
  let day = parts[0].padStart(2, '0');
  let month = parts[1].padStart(2, '0');
  let year = parts[2];
  if (year.length === 2) year = '20' + year;
  return `${year}-${month}-${day}`;
};
