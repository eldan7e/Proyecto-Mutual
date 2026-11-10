/**
 * Normaliza un texto para búsquedas insensibles a mayúsculas, minúsculas y tildes/diacríticos.
 */
export function normalizeSearchText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Divide un término de búsqueda en tokens normalizados, removiendo comas y caracteres especiales de PostgREST.
 */
export function getSearchTokens(term) {
  const normalized = normalizeSearchText(term)
    .replace(/[,()*]+/g, ' ')
    .trim();
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/**
 * Verifica del lado del cliente si `targetText` contiene todos los tokens de `queryTerm`
 * (insensible a mayúsculas, tildes, comas y orden de palabras).
 */
export function matchesSearchTokens(targetText, queryTerm) {
  const tokens = getSearchTokens(queryTerm);
  if (tokens.length === 0) return true;
  const normTarget = normalizeSearchText(targetText);
  return tokens.every(tok => normTarget.includes(tok));
}

/**
 * Aplica búsqueda inteligente sobre la vista `v_socios_busqueda`.
 * Soporta búsqueda por DNI, CUIT, N° Socio, N° Grupo, Cód. Lex, Email, Teléfono,
 * y nombres con o sin comas, tildes, mayúsculas o en cualquier orden de palabras.
 */
export function applySociosSearchFilter(query, rawTerm) {
  const term = String(rawTerm || '').trim();
  if (!term) return query;

  const cleanDigits = term.replace(/\D/g, '');
  const isNumeric = /^\d+$/.test(term);

  if (isNumeric) {
    const orConditions = [
      `dni.ilike.%${term}%`,
      `cuit.ilike.%${term}%`,
      `nombre_completo.ilike.%${term}%`,
      `codigo_lex.ilike.%${term}%`
    ];

    // Búsqueda por número de grupo exacto (solo números cortos de hasta 5 dígitos)
    if (term.length <= 5) {
      orConditions.push(`grupo_codigo_str.imatch.\\y${term}\\y`);
    }

    // Solo buscar por nro_socio si es un número válido y menor a 2.147.483.647 (para no desbordar INTEGER en Postgres)
    const parsedNum = parseInt(term, 10);
    if (!isNaN(parsedNum) && parsedNum > 0 && parsedNum <= 2147483647 && term.length <= 6) {
      orConditions.push(`nro_socio.eq.${parsedNum}`);
    }

    // Para números de 6+ dígitos (líneas telefónicas, celulares, DNIs largos) buscar dentro de search_text
    if (term.length >= 6) {
      orConditions.push(`search_text.ilike.%${term}%`);
    }

    return query.or(orConditions.join(','));
  }

  // Si es un teléfono formateado con guiones/espacios (sin letras) y >= 6 dígitos
  if (!/[a-zA-ZñÑáéíóúÁÉÍÓÚ]/.test(term) && cleanDigits.length >= 6) {
    return query.ilike('search_text', `%${cleanDigits}%`);
  }

  const tokens = getSearchTokens(term);
  let filteredQuery = query;
  for (const tok of tokens) {
    const escaped = tok.replace(/[%_\\]/g, '\\$&');
    filteredQuery = filteredQuery.ilike('search_text', `%${escaped}%`);
  }
  return filteredQuery;
}
