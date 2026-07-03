/**
 * Validates that pasted invoice text matches the selected provider.
 * Returns an error message string if mismatch detected, or null if OK.
 */
export function verificarTextoCruzado(texto, selectedProvider) {
  const t = texto.toLowerCase();
  
  if (selectedProvider === 'claro' && (t.includes('total cargos del mes') || t.includes('telecom'))) {
    return "⚠️ Parece que pegaste el texto de una factura de Personal, pero seleccionaste CLARO.";
  }
  if (selectedProvider === 'personal' && t.includes('claro') && !t.includes('telecom')) {
    return "⚠️ Parece que pegaste el texto de una factura de Claro, pero seleccionaste PERSONAL.";
  }
  if (selectedProvider === 'movistar' && (t.includes('total cargos del mes') || t.includes('telecom'))) {
    return "⚠️ Parece que pegaste el texto de una factura de Personal, pero seleccionaste MOVISTAR.";
  }
  return null;
}

/**
 * Valida formato de email
 */
export const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
export const validateEmail = isValidEmail;

/**
 * Valida DNI (8 dígitos)
 */
export const isValidDNI = (dni) => {
  return /^\d{7,8}$/.test(dni);
};
export const validateDNI = isValidDNI;

/**
 * Valida CUIT/CUIL (11 dígitos con guiones opcionales)
 */
export const isValidCUIT = (cuit) => {
  if (!cuit) return false;
  const clean = cuit.toString().replace(/\D/g, '');
  return clean.length === 11;
};
export const validateCUIT = isValidCUIT;

/**
 * Valida CBU (22 dígitos)
 */
export const isValidCBU = (cbu) => {
  if (!cbu) return false;
  const clean = cbu.toString().replace(/\D/g, '');
  return clean.length === 22;
};

/**
 * Valida número de teléfono (normalizado a 10 dígitos)
 */
export const isValidPhone = (phone) => {
  if (!phone) return false;
  const clean = phone.toString().replace(/\D/g, '');
  return clean.length >= 8 && clean.length <= 11;
};
export const validatePhone = isValidPhone;
