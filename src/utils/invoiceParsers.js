/**
 * utilidades de procesamiento de facturas para Portal Aunar
 * Separa la lógica de cada operadora para evitar errores cruzados.
 */

export const normalizePhone = (phone) => {
  if (!phone) return '';
  let clean = String(phone).replace(/[^0-9]/g, '').replace(/^0+/, ''); 
  if (clean.startsWith('549')) clean = clean.slice(3);
  else if (clean.startsWith('54')) clean = clean.slice(2);
  return clean.slice(-10);
};

// --- SMART NUMBER PARSER (Handles both US and local formats) ---
const parseSmartNumber = (val) => {
  if (!val) return 0;
  let s = val.toString().trim().replace(/[\$"\s]/g, '');
  if (s.includes(',') && s.includes('.')) {
    const commaIndex = s.indexOf(',');
    const dotIndex = s.indexOf('.');
    if (commaIndex < dotIndex) {
      // US format: 19,722.96 -> remove commas
      s = s.replace(/,/g, '');
    } else {
      // Local format: 19.722,96 -> remove dots, replace comma with dot
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else {
    if (s.includes(',')) {
      if (/,\d{2}$/.test(s)) {
        s = s.replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    }
  }
  return parseFloat(s) || 0;
};

// --- PARSER CLARO ---
export const parseClaroNumber = (val) => {
  if (!val) return 0;
  let s = val.toString().trim().replace(/[\$"]/g, '');
  // Formato Claro: "9.498 50" (Punto miles, Espacio decimal)
  if (/\s\d{2}$/.test(s)) {
    s = s.replace(/\./g, ''); // Quitar miles
    s = s.replace(/\s(\d{2})$/, '.$1'); // Espacio a decimal
    return parseFloat(s) || 0;
  }
  return parseSmartNumber(val);
};

// --- PARSER PERSONAL ---
export const parsePersonalNumber = (val) => {
  return parseSmartNumber(val);
};

// --- PARSER MOVISTAR ---
export const parseMovistarNumber = (val) => {
  return parseSmartNumber(val);
};

/**
 * Selector universal de parser según proveedor
 */
export const getParserByProvider = (provider) => {
  switch (provider?.toLowerCase()) {
    case 'claro': return parseClaroNumber;
    case 'personal': return parsePersonalNumber;
    case 'movistar': return parseMovistarNumber;
    default: return (val) => parseFloat(val) || 0;
  }
};
