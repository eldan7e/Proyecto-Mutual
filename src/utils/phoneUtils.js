/**
 * Normaliza número de teléfono: elimina espacios, guiones, etc., y asegura 10 dígitos
 */
export const normalizePhone = (phone) => {
  if (!phone) return '';
  let clean = phone.toString().replace(/[\s\-\(\)]/g, '');
  // Si comienza con 0, quitar
  if (clean.startsWith('0')) clean = clean.substring(1);
  // Si comienza con 54 (ARG), quitar
  if (clean.startsWith('54')) clean = clean.substring(2);
  // Asegurar 10 dígitos (código de área + número)
  if (clean.length === 10) return clean;
  // Si es más largo, tomar últimos 10
  if (clean.length > 10) return clean.slice(-10);
  // Si es más corto, rellenar con ceros a la izquierda
  return clean.padStart(10, '0');
};

/**
 * Formatea teléfono para mostrar: (011) 1234-5678
 */
export const formatPhone = (phone) => {
  const norm = normalizePhone(phone);
  if (norm.length !== 10) return phone;
  const area = norm.slice(0, 3);
  const prefix = norm.slice(3, 7);
  const suffix = norm.slice(7);
  return `(${area}) ${prefix}-${suffix}`;
};
