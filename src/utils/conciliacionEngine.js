/**
 * Motor de Detección Inteligente de Conciliación Bancaria
 * Especializado en extractos de Banco Credicoop y Banco Nación Argentina.
 */

// CUITs bancarios e institucionales a ignorar al buscar al transferente
const INSTITUTIONAL_CUITS = new Set([
  '30500010912', // Banco de la Nación Argentina
  '30571421352', // Banco Credicoop Cooperativo Limitado
  '30999032083', // BCRA
  '33693450239', // AFIP / ARCA
  '30712067086'  // Otros entes recaudadores
]);

// Palabras clave bancarias genéricas que deben eliminarse al analizar nombres
const BANK_STOPWORDS = new Set([
  'transf', 'transferencia', 'inmediata', 'dist', 'titular', 'propio', 'ctas',
  'cuenta', 'cuentas', 'credito', 'debin', 'spot', 'origen', 'destino', 'banco',
  'cuit', 'cuil', 'cpbte', 'comprobante', 'lineas', 'recaudacion', 'debito',
  'directo', 'automatico', 'home', 'banking', 'terminal', 'interbanking',
  'bna', 'sucursal', 'operacion', 'ticket', 'var', 'fac', 'cuo', 'hon',
  's/cred', 'cred', 'inmed', 'pago', 'cobro', 'sueldo', 'haberes', 'otros',
  'fondos', 'importe', 'neto', 'bruto', 'pesos', 'ars', 'enlace', 'red'
]);

/**
 * Normaliza una cadena quitando tildes, símbolos y convirtiendo a minúsculas.
 */
export const normalizeText = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

/**
 * Tokeniza un texto en palabras relevantes (mínimo 3 letras, sin stopwords).
 */
export const extractMeaningfulWords = (text) => {
  const norm = normalizeText(text);
  return norm
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !BANK_STOPWORDS.has(w));
};

/**
 * Calcula similitud simple entre dos palabras (exacta o distancia Levenshtein <= 1).
 */
export const isSimilarWord = (w1, w2) => {
  if (!w1 || !w2) return false;
  if (w1 === w2) return true;
  if (Math.abs(w1.length - w2.length) > 1) return false;
  
  // Si una contiene a la otra con longitud >= 4
  if (w1.length >= 4 && w2.length >= 4) {
    if (w1.includes(w2) || w2.includes(w1)) return true;
  }

  let diff = 0;
  let i = 0, j = 0;
  while (i < w1.length && j < w2.length) {
    if (w1[i] !== w2[j]) {
      diff++;
      if (diff > 1) return false;
      if (w1.length > w2.length) i++;
      else if (w2.length > w1.length) j++;
      else { i++; j++; }
    } else {
      i++; j++;
    }
  }
  return true;
};

/**
 * Extrae metadatos estructurados del concepto bancario según el banco detectado.
 * @param {string} concepto - Concepto del extracto bancario.
 * @param {string} detectedBanco - 'CREDICOOP', 'NACION' o 'AUTO'.
 * @returns {Object} Metadatos extraídos (cuits, cbus, nombreTransferente, etc.).
 */
export const extractConceptMetadata = (concepto = '', detectedBanco = 'AUTO') => {
  const normConcept = normalizeText(concepto);
  const rawUpper = String(concepto || '').toUpperCase();

  // 1. Detectar Banco
  let banco = detectedBanco;
  if (banco === 'AUTO' || !banco) {
    if (rawUpper.includes('CREDICOOP') || rawUpper.includes('DEBIN') || rawUpper.includes('DIST. TITULAR')) {
      banco = 'CREDICOOP';
    } else if (rawUpper.includes('NACION') || rawUpper.includes('LEY 25413') || rawUpper.includes('B.N.A.') || rawUpper.includes('HOME BANKING')) {
      banco = 'NACION';
    } else {
      banco = 'CREDICOOP';
    }
  }

  // 2. Extraer CUITs válidos (11 dígitos)
  const allCuitMatches = concepto.match(/\b\d{11}\b/g) || [];
  const cuits = allCuitMatches.filter(c => !INSTITUTIONAL_CUITS.has(c));
  const primaryCuit = cuits[0] || null;

  // 3. Extraer CBUs válidos (22 dígitos)
  const allCbuMatches = concepto.match(/\b\d{22}\b/g) || [];
  const primaryCbu = allCbuMatches[0] || null;

  // 4. Extraer Nombre del Transferente
  let rawExtractedName = '';
  let hasExplicitName = false;

  // Formato típico Credicoop: "... 20117012574-VAR-MENDEZ, RUBEN ALFREDO CBU Origen: ..."
  const credicoopTagMatch = concepto.match(/(?:var|fac|cuo|hon)[- /]+([^|]+?)(?:\s+cbu\s+origen|\s+cbu|\s*\|\s*l[ií]neas|\s*$)/i);
  if (credicoopTagMatch) {
    rawExtractedName = credicoopTagMatch[1].trim();
    hasExplicitName = true;
  }

  // Formato Credicoop sin tag pero con guion: "... 20117012574 - MENDEZ, RUBEN ALFREDO ..."
  if (!rawExtractedName) {
    const credicoopDashMatch = concepto.match(/\b\d{11}\s*[-/]\s*([a-zA-Z\s,.'´]+?)(?:\s+cbu|\s*\|\s*l[ií]neas|\s*$)/i);
    if (credicoopDashMatch) {
      rawExtractedName = credicoopDashMatch[1].trim();
      hasExplicitName = true;
    }
  }

  // Formato Débito Automático: "Debito Automatico Bancario - Sagardoy, Walter Matías"
  if (!rawExtractedName) {
    const debitoMatch = concepto.match(/debito\s+automatico(?:\s+bancario)?\s*[-–—]\s*([a-zA-Z\s,.'´]+)/i);
    if (debitoMatch) {
      rawExtractedName = debitoMatch[1].trim();
      hasExplicitName = true;
    }
  }

  // Formato Nación con nombre (si viniera): "TRANSF. POR HOME BANKING 20241674259 DILLON IGNACIO"
  if (!rawExtractedName && banco === 'NACION') {
    const nacionNameMatch = concepto.match(/\b\d{11}\b\s*[- /]?\s*([a-zA-Z\s,.'´]{4,})/i);
    if (nacionNameMatch) {
      const candidate = nacionNameMatch[1].trim();
      const testWords = extractMeaningfulWords(candidate);
      if (testWords.length >= 1) {
        rawExtractedName = candidate;
        hasExplicitName = true;
      }
    }
  }

  // Limpiar el nombre extraído de cualquier residuo numérico o de stopwords
  const transferNameWords = extractMeaningfulWords(rawExtractedName);

  // 5. Extraer mención explícita de Grupo en el concepto (ej: "Gpo 70040", "Grupo 70040", "G-70040")
  const gpoMatch = normConcept.match(/gpo\s*(\d+)/) || 
                   normConcept.match(/grupo\s*(\d+)/) || 
                   normConcept.match(/\bg(?:po|rupo)?[- _]*(\d+)\b/);
  const explicitGroup = gpoMatch ? parseInt(gpoMatch[1], 10) : null;

  // 6. Extraer mención explícita de Nº de Socio (ej: "Socio 3", "Nro 3", "#3")
  const nroSocioMatch = normConcept.match(/\b(?:socio|nro|num|nº|no|#)\s*[-_#]*\s*(\d+)\b/i) || 
                        normConcept.match(/\bs[-_#]*(\d+)\b/i);
  const explicitNroSocio = nroSocioMatch ? parseInt(nroSocioMatch[1], 10) : null;

  // 7. Extraer DNI de 8 dígitos
  const dniMatch = normConcept.match(/\b\d{8}\b/);
  const extractedDni = dniMatch ? dniMatch[0] : null;

  return {
    banco,
    cuit: primaryCuit,
    cbu: primaryCbu,
    rawExtractedName,
    hasExplicitName,
    transferWords: transferNameWords,
    explicitGroup,
    explicitNroSocio,
    dni: extractedDni
  };
};

/**
 * Algoritmo de sugerencia inteligente con memoria de aprendizaje histórico robusta
 * para Banco Credicoop y Banco Nación.
 * 
 * @param {Object} params
 * @param {string} params.concepto - Texto completo del concepto bancario.
 * @param {number} params.monto - Importe real del movimiento.
 * @param {string} params.banco - 'CREDICOOP', 'NACION' o 'AUTO'.
 * @param {string} params.selectedPeriod - Período contable actual (ej: '2026-08').
 * @param {Array} params.sociosList - Lista completa de socios.
 * @param {Array} params.historicoList - Mapeos históricos de conciliación.
 * @param {Array} params.pendingLiquidaciones - Liquidaciones pendientes del período.
 * @param {Object} params.titularMap - Mapeo de número_grupo -> titular socio_id.
 * @returns {Object|null} Sugerencia encontrada con métricas de confianza.
 */
export const findSuggestedSocioAdvanced = ({
  concepto,
  monto = 0,
  banco = 'AUTO',
  selectedPeriod = '',
  sociosList = [],
  historicoList = [],
  pendingLiquidaciones = [],
  titularMap = {}
}) => {
  if (!concepto || !sociosList || sociosList.length === 0) return null;

  const meta = extractConceptMetadata(concepto, banco);
  const absMonto = Math.abs(Number(monto || 0));

  // Mapa de deudas pendientes por socio para enriquecer el scoring
  const socioDebtsMap = new Map();
  if (pendingLiquidaciones && pendingLiquidaciones.length > 0) {
    pendingLiquidaciones.forEach(liq => {
      if (!liq) return;
      const gNum = liq.numero_grupo;
      const sId = liq.socio_id;
      const pendingAmount = Number(liq.monto_total_facturado || 0) - Number(liq.monto_abonado || 0);
      if (sId) {
        const cur = socioDebtsMap.get(sId) || [];
        cur.push({ gNum, pendingAmount, liqId: liq.liquidacion_id, periodo: liq.periodo });
        socioDebtsMap.set(sId, cur);
      }
    });
  }

  // =========================================================================
  // 1. COINCIDENCIA OFICIAL DIRECTA (Prioridad Máxima: padrón oficial de socios)
  // =========================================================================

  // 1a. CUIT oficial directo
  if (meta.cuit) {
    const cleanTargetCuit = meta.cuit;
    const officialSocio = sociosList.find(s => s.cuit && s.cuit.replace(/\D/g, '') === cleanTargetCuit);
    if (officialSocio) {
      return {
        socio: officialSocio,
        reason: 'CUIT Oficial',
        confianza: 99,
        vecesVisto: 1,
        isLearned: false,
        montoCoincide: checkAmountMatchesSocio(officialSocio.socio_id, absMonto, socioDebtsMap)
      };
    }
  }

  // 1b. CBU oficial directo
  if (meta.cbu) {
    const cleanTargetCbu = meta.cbu.replace(/^0+/, '');
    const officialSocio = sociosList.find(s => {
      const sCbu = s.cbu ? s.cbu.replace(/\D/g, '').replace(/^0+/, '') : '';
      return sCbu && sCbu === cleanTargetCbu;
    });
    if (officialSocio) {
      return {
        socio: officialSocio,
        reason: 'CBU Oficial',
        confianza: 99,
        vecesVisto: 1,
        isLearned: false,
        montoCoincide: checkAmountMatchesSocio(officialSocio.socio_id, absMonto, socioDebtsMap)
      };
    }
  }

  // =========================================================================
  // 2. APRENDIZAJE HISTÓRICO CON VALIDACIÓN SEGÚN BANCO (Nación vs Credicoop)
  // =========================================================================
  let matchedHist = null;
  let histType = '';

  // Buscar por CUIT en histórico
  if (meta.cuit) {
    matchedHist = (historicoList || []).find(h => h.cuit_transferente === meta.cuit);
    if (matchedHist) histType = 'CUIT';
  }

  // Si no encontró por CUIT, buscar por CBU en histórico (muy frecuente en Credicoop)
  if (!matchedHist && meta.cbu) {
    const cleanTargetCbu = meta.cbu.replace(/^0+/, '');
    matchedHist = (historicoList || []).find(h => {
      const hCbu = h.cbu_transferente ? h.cbu_transferente.replace(/\D/g, '').replace(/^0+/, '') : '';
      return hCbu && hCbu === cleanTargetCbu;
    });
    if (matchedHist) histType = 'CBU';
  }

  if (matchedHist) {
    let socio = sociosList.find(s => s.socio_id === matchedHist.socio_id);
    if (!socio) {
      socio = {
        socio_id: matchedHist.socio_id,
        nombre_completo: matchedHist.socio_nombre || `Socio Grupo ${matchedHist.numero_grupo}`,
        nro_socio: ''
      };
    }

    const veces = matchedHist.veces_visto || 1;
    const histSocioName = matchedHist.socio_nombre || socio.nombre_completo || '';
    const histWords = extractMeaningfulWords(histSocioName);

    // ¿El concepto tiene un nombre explícito? (típico en Credicoop)
    let hasNameContradiction = false;
    let hasNameConfirmation = false;

    if (meta.hasExplicitName && meta.transferWords.length > 0) {
      // Verificar si alguna palabra del transferente coincide con el socio histórico
      const matchesAnyWord = meta.transferWords.some(tw => 
        histWords.some(hw => isSimilarWord(tw, hw))
      );
      if (matchesAnyWord) {
        hasNameConfirmation = true;
      } else {
        // El concepto trajo un nombre explícito y NO coincide en ninguna palabra con el histórico
        hasNameContradiction = true;
      }
    }

    // Regla de Protección contra envenenamiento de memoria:
    // Si hay contradicción flagrante de nombres y fue visto pocas veces (< 3),
    // NO aceptar el histórico de forma ciega; descartarlo para permitir match por nombre real.
    const shouldAcceptHist = !hasNameContradiction || (veces >= 3);

    if (shouldAcceptHist) {
      // Calcular confianza progresiva calibrada
      let calculatedConfianza = 60;
      if (veces === 2) calculatedConfianza = 75;
      else if (veces === 3) calculatedConfianza = 88;
      else if (veces >= 4) calculatedConfianza = Math.min(99, 90 + veces);

      // Si el nombre lo confirmó explícitamente, aumentar la confianza
      if (hasNameConfirmation) {
        calculatedConfianza = Math.min(99, calculatedConfianza + 10);
      }

      // Si es Banco Nación y el socio tiene una deuda por un monto similar (+- $2)
      const hasDebtMatch = checkAmountMatchesSocio(socio.socio_id, absMonto, socioDebtsMap);
      if (hasDebtMatch) {
        calculatedConfianza = Math.min(99, calculatedConfianza + 8);
      }

      const bankLabel = meta.banco === 'NACION' ? 'Nación' : (meta.banco === 'CREDICOOP' ? 'Credicoop' : '');

      return {
        socio,
        reason: `🧠 Aprendido ${histType}${bankLabel ? ' ' + bankLabel : ''} (Grupo ${matchedHist.numero_grupo})`,
        learnedGroup: matchedHist.numero_grupo,
        confianza: calculatedConfianza,
        vecesVisto: veces,
        isLearned: true,
        learnedId: matchedHist.id,
        learnedCuit: matchedHist.cuit_transferente,
        learnedCbu: matchedHist.cbu_transferente,
        montoCoincide: hasDebtMatch
      };
    }
  }

  // =========================================================================
  // 3. COINCIDENCIA POR DNI (8 dígitos)
  // =========================================================================
  if (meta.dni) {
    const matchedSocio = sociosList.find(s => 
      (s.dni && s.dni.replace(/\D/g, '') === meta.dni) || 
      (s.cuit && s.cuit.replace(/\D/g, '').includes(meta.dni))
    );
    if (matchedSocio) {
      return { 
        socio: matchedSocio, 
        reason: 'DNI', 
        confianza: 92, 
        vecesVisto: 1, 
        isLearned: false,
        montoCoincide: checkAmountMatchesSocio(matchedSocio.socio_id, absMonto, socioDebtsMap)
      };
    }
  }

  // =========================================================================
  // 4. COINCIDENCIA POR GRUPO EXPLÍCITO EN CONCEPTO (ej: Gpo 70040)
  // =========================================================================
  if (meta.explicitGroup) {
    const groupNum = meta.explicitGroup;
    const titularSocioId = titularMap[groupNum];
    if (titularSocioId) {
      const socio = sociosList.find(s => s.socio_id === titularSocioId);
      if (socio) {
        return { 
          socio, 
          reason: `Grupo ${groupNum} (Titular)`, 
          confianza: 90, 
          vecesVisto: 1, 
          isLearned: false,
          montoCoincide: checkAmountMatchesSocio(socio.socio_id, absMonto, socioDebtsMap)
        };
      }
    }
    const memberSocio = sociosList.find(s => s.grupo_socio?.some(gs => gs.numero_grupo === groupNum));
    if (memberSocio) {
      return { 
        socio: memberSocio, 
        reason: `Grupo ${groupNum}`, 
        confianza: 85, 
        vecesVisto: 1, 
        isLearned: false,
        montoCoincide: checkAmountMatchesSocio(memberSocio.socio_id, absMonto, socioDebtsMap)
      };
    }
  }

  // =========================================================================
  // 5. COINCIDENCIA POR NÚMERO DE SOCIO EXPLÍCITO (ej: Socio 3)
  // =========================================================================
  if (meta.explicitNroSocio) {
    const socioNum = meta.explicitNroSocio;
    const socio = sociosList.find(s => s.nro_socio === socioNum);
    if (socio) {
      return { 
        socio, 
        reason: `Nº Socio ${socioNum}`, 
        confianza: 90, 
        vecesVisto: 1, 
        isLearned: false,
        montoCoincide: checkAmountMatchesSocio(socio.socio_id, absMonto, socioDebtsMap)
      };
    }
  }

  // =========================================================================
  // 6. COINCIDENCIA INTELIGENTE POR NOMBRE Y APELLIDO (Token / Fuzzy Matching)
  // =========================================================================
  const wordsToCompare = meta.transferWords.length > 0 
    ? meta.transferWords 
    : extractMeaningfulWords(concepto);

  if (wordsToCompare.length > 0) {
    let bestSocio = null;
    let bestScore = 0;
    let candidates = [];

    sociosList.forEach(s => {
      const socioWords = extractMeaningfulWords(s.nombre_completo);
      if (socioWords.length === 0) return;

      let score = 0;
      let hasExactSurnameMatch = false;
      let hasFirstNameMatch = false;

      const socioSurname = socioWords[0];
      const socioOtherWords = socioWords.slice(1);

      wordsToCompare.forEach(cw => {
        if (socioSurname && isSimilarWord(cw, socioSurname)) {
          hasExactSurnameMatch = true;
          score += 2.5; // Peso mayor para apellido
        } else if (socioOtherWords.some(sw => isSimilarWord(cw, sw))) {
          hasFirstNameMatch = true;
          score += 1.8;
        } else if (socioWords.some(sw => isSimilarWord(cw, sw))) {
          score += 1.0;
        }
      });

      // Bonus si coincidieron apellido y nombre
      if (hasExactSurnameMatch && hasFirstNameMatch) {
        score += 3.5;
      }

      // Bonus si el socio tiene una liquidación por este monto en el período
      if (score >= 2.5 && checkAmountMatchesSocio(s.socio_id, absMonto, socioDebtsMap)) {
        score += 2.0;
      }

      if (score > bestScore) {
        bestScore = score;
        bestSocio = s;
        candidates = [s];
      } else if (score === bestScore && score > 0) {
        candidates.push(s);
      }
    });

    // Exigir al menos score >= 3.5 (garantiza apellido + nombre o múltiples coincidencias fuertes)
    if (bestScore >= 3.5) {
      let finalSocio = bestSocio;
      let reason = 'Nombre/Fuzzy';

      if (candidates.length > 1) {
        // En caso de empate, desempatar por el que tiene deudas pendientes en el período
        const candidatesWithDebt = candidates.filter(s => checkAmountMatchesSocio(s.socio_id, absMonto, socioDebtsMap));
        if (candidatesWithDebt.length === 1) {
          finalSocio = candidatesWithDebt[0];
          reason = 'Nombre/Fuzzy (Monto Deuda Coincidente)';
        }
      }

      const hasDebtMatch = checkAmountMatchesSocio(finalSocio.socio_id, absMonto, socioDebtsMap);
      const calculatedConfianza = Math.min(95, Math.round(bestScore * 14));

      return {
        socio: finalSocio,
        reason,
        confianza: calculatedConfianza,
        vecesVisto: 1,
        isLearned: false,
        montoCoincide: hasDebtMatch
      };
    }
  }

  // =========================================================================
  // 7. DESEMPATE FINAL PARA BANCO NACIÓN: COINCIDENCIA POR IMPORTE ÚNICO
  // Si en Banco Nación no vino CUIT oficial ni histórico, pero exactamente UN
  // solo socio tiene una factura pendiente por este importe exacto (+- $1.00)
  // =========================================================================
  if (meta.banco === 'NACION' && absMonto > 500 && pendingLiquidaciones.length > 0) {
    const matchingLiqs = pendingLiquidaciones.filter(l => {
      if (!l) return false;
      const pending = Number(l.monto_total_facturado || 0) - Number(l.monto_abonado || 0);
      return Math.abs(pending - absMonto) <= 1.00;
    });

    if (matchingLiqs.length === 1) {
      const targetLiq = matchingLiqs[0];
      const socio = sociosList.find(s => s.socio_id === targetLiq.socio_id);
      if (socio) {
        return {
          socio,
          reason: `Importe Exacto Nación ($${absMonto.toLocaleString('es-AR')})`,
          learnedGroup: targetLiq.numero_grupo,
          confianza: 70, // Sugerencia tentativa para que el usuario valide
          vecesVisto: 1,
          isLearned: false,
          montoCoincide: true
        };
      }
    }
  }

  return null;
};

/**
 * Función auxiliar para verificar si un socio tiene deuda coincidente con el monto.
 */
function checkAmountMatchesSocio(socioId, absMonto, debtsMap) {
  if (!socioId || !absMonto || !debtsMap) return false;
  const debts = debtsMap.get(socioId);
  if (!debts || debts.length === 0) return false;
  return debts.some(d => Math.abs(d.pendingAmount - absMonto) <= 2.00);
}
