export const detectarTipoMovimiento = (concepto, monto) => {
  if (!concepto) return 'OTRO';
  const conceptoUpper = concepto.toUpperCase();
  
  // Impuestos
  if (
    /\b(GRAVAMEN|IMPUESTO|IMP|IVA)\b/i.test(conceptoUpper) ||
    /I\.V\.A\./i.test(conceptoUpper) ||
    (conceptoUpper.includes('LEY 25') && conceptoUpper.includes('413'))
  ) {
    return 'IMPUESTO';
  }
  
  // Comisiones
  if (/\b(COM|COMIS|COMISION|DEB\.TRAN\.INTERB|MANTENIMIENTO|MANT)\b/i.test(conceptoUpper)) {
    return 'COMISION';
  }
  
  // Suscripciones
  if (conceptoUpper.includes('SUSCRIPCION') || conceptoUpper.includes('PERIODICO')) {
    return 'SUSCRIPCION';
  }

  // Pago ARCA
  if (
    conceptoUpper.includes('ARCA') || 
    conceptoUpper.includes('OBLIGACIONES A ARCA') ||
    conceptoUpper.includes('OBLIGACIONES ARCA')
  ) {
    return 'PAGO_ARCA';
  }

  // Pago VEP
  if (
    /\bVEP\b/i.test(conceptoUpper) || 
    conceptoUpper.includes('AFIP VEP') ||
    conceptoUpper.includes('VOLANTE ELECTRONICO')
  ) {
    return 'PAGO_VEP';
  }

  // Pago de Servicios
  if (
    conceptoUpper.includes('PAGO DE SERVICIO') ||
    conceptoUpper.includes('PAGO DE SERVICIOS') ||
    conceptoUpper.includes('PAG.SERVICIOS') ||
    conceptoUpper.includes('PAG.SERV') ||
    conceptoUpper.includes('PAGO SERV') ||
    conceptoUpper.includes('SERV.PUBLICOS') ||
    conceptoUpper.includes('PAGO MIS CUENTAS') ||
    /\bPMC\b/i.test(conceptoUpper) ||
    conceptoUpper.includes('LINK PAGOS') ||
    conceptoUpper.includes('PAGO DE IMPUESTOS Y SERVICIOS') ||
    conceptoUpper.includes('MOVISTAR') ||
    conceptoUpper.includes('EDELAP') ||
    conceptoUpper.includes('TELECOM') ||
    conceptoUpper.includes('TELEFONICA') ||
    conceptoUpper.includes('CLARO') ||
    conceptoUpper.includes('PERSONAL')
  ) {
    return 'PAGO_SERVICIO';
  }
  
  // Transferencias
  if (/\b(TRANSF|TRANSFERENCIA|DEBIN|CRED\.INMED\.)\b/i.test(conceptoUpper)) {
    return monto > 0 ? 'TRANSFERENCIA_RECIBIDA' : 'TRANSFERENCIA_ENVIADA';
  }
  
  // Fallbacks
  return monto > 0 ? 'OTRO_INGRESO' : 'OTRO_EGRESO';
};

const deduplicarMovimientos = (movimientos) => {
  const finalMovs = [];
  
  for (let i = 0; i < movimientos.length; i++) {
    const current = movimientos[i];
    let isDuplicate = false;
    
    for (let j = 0; j < finalMovs.length; j++) {
      const prev = finalMovs[j];
      
      // Check date and amount
      if (current.fecha === prev.fecha && Math.abs(Math.abs(current.netoReal) - Math.abs(prev.netoReal)) < 0.01) {
        const comp1 = (current.comprobante || '').trim();
        const comp2 = (prev.comprobante || '').trim();
        const hasComp1 = comp1 && comp1 !== '0';
        const hasComp2 = comp2 && comp2 !== '0';
        
        if (hasComp1 && hasComp2) {
          if (comp1 === comp2) {
            isDuplicate = true;
            // Merge concepts: keep the longer or more descriptive one
            if (current.concepto.length > prev.concepto.length) {
              prev.concepto = current.concepto;
              if (current.tipo_movimiento !== 'OTRO' && current.tipo_movimiento !== 'OTRO_INGRESO' && current.tipo_movimiento !== 'OTRO_EGRESO') {
                prev.tipo_movimiento = current.tipo_movimiento;
              }
            }
            break;
          }
        } else {
          // If no comprobante, compare normalized concepts
          const c1 = current.concepto.toUpperCase().replace(/\s+/g, ' ').trim();
          const c2 = prev.concepto.toUpperCase().replace(/\s+/g, ' ').trim();
          if (c1 === c2) {
            isDuplicate = true;
            break;
          }
        }
      }
    }
    
    if (!isDuplicate) {
      finalMovs.push(current);
    }
  }
  
  return finalMovs;
};

export const parsearMovimientos = (rawText) => {
  if (!rawText) return [];
  const rawLines = rawText.split('\n').map(l => l.replace(/[\r\n\s]+$/, '')).filter(l => l.trim() !== '' && !/^[,\s]+$/.test(l));
  if (rawLines.length === 0) return [];

  // Detect date format by looking at all dates in the input
  let hasFirstGroupGreaterThan12 = false;
  let hasSecondGroupGreaterThan12 = false;
  const dateRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})\b/g;
  let dateMatch;
  while ((dateMatch = dateRegex.exec(rawText)) !== null) {
    const first = parseInt(dateMatch[1], 10);
    const second = parseInt(dateMatch[2], 10);
    if (first > 12) hasFirstGroupGreaterThan12 = true;
    if (second > 12) hasSecondGroupGreaterThan12 = true;
  }
  const dateLocale = (hasSecondGroupGreaterThan12 && !hasFirstGroupGreaterThan12) ? 'US' : 'AR';

  // Helper to parse date string DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY or M/D/YY or Excel serial date
  const parseDateStr = (str) => {
    if (!str) return null;
    
    // Handle Excel serial date
    if (/^\d{5}$/.test(String(str).trim())) {
      const serial = parseInt(str, 10);
      const utcDays = Math.floor(serial - 25569);
      const date = new Date(utcDays * 86400 * 1000);
      const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60 * 1000);
      return localDate;
    }

    const match = str.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})\b/);
    if (!match) return null;
    const a = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    
    let day, month;
    if (dateLocale === 'US') {
      day = b;
      month = a;
    } else {
      day = a;
      month = b;
    }
    return new Date(year, month - 1, day);
  };

  // Format date as DD/MM/YYYY from any input
  const formatDateAR = (str) => {
    if (!str) return new Date().toLocaleDateString('es-AR');
    const parsed = parseDateStr(str);
    if (!parsed || isNaN(parsed.getTime())) return str;
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
  };

  const cleanVal = (val) => {
    if (!val && val !== 0) return 0;
    let s = String(val).replace('$', '').replace(/\s/g, '');
    // Reject date patterns (e.g. "08/01/2026" or "08-01-26") to avoid parsing dates as numbers (parseFloat("08/01/26") = 8)
    if (/^\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?$/.test(s)) {
      return 0;
    }
    // Handle US format with comma thousands and dot decimal: 3,588,973.61
    if (/^\-?\d{1,3}(,\d{3})*\.\d+$/.test(s)) {
      s = s.replace(/,/g, '');
      return parseFloat(s) || 0;
    }
    // Handle Argentine format: 1.234.567,89
    if (s.includes('.') && s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    return parseFloat(s) || 0;
  };

  // Extract "SALDO ANTERIOR"
  let saldoAnterior = 0;
  for (let line of rawLines) {
    const upperLine = line.toUpperCase().replace(/−/g, '-');
    if (upperLine.includes('SALDO ANTERIOR')) {
      const regex = /(-?\b\d{1,3}(?:\.\d{3})*,\d{2}\b|-?\b\d{1,3}(?:,\d{3})*\.\d{2}\b|-?\b\d+,\d{2}\b|-?\b\d+\.\d{2}\b)/g;
      const matches = line.match(regex);
      if (matches && matches.length > 0) {
        saldoAnterior = cleanVal(matches[matches.length - 1]);
        break;
      }
    }
  }

  // Extract "SALDO FINAL" or "SALDO AL..."
  let saldoFinalExtraido = null;
  for (let line of rawLines) {
    const upperLine = line.toUpperCase().replace(/−/g, '-');
    if (upperLine.includes('SALDO AL') || upperLine.includes('SALDO ACTUAL') || upperLine.includes('SALDO FINAL')) {
      if (upperLine.includes('SALDO ANTERIOR')) continue;
      const regex = /(-?\b\d{1,3}(?:\.\d{3})*,\d{2}\b|-?\b\d{1,3}(?:,\d{3})*\.\d{2}\b|-?\b\d+,\d{2}\b|-?\b\d+\.\d{2}\b)/g;
      const matches = line.match(regex);
      if (matches && matches.length > 0) {
        saldoFinalExtraido = cleanVal(matches[matches.length - 1]);
      }
    }
  }

  // Helper to split CSV line respecting quotes and dynamic delimiter
  let delimiter = ',';
  if (rawLines && rawLines.length > 0) {
    if (rawLines[0].includes('\t')) {
      delimiter = '\t';
    } else if (rawLines[0].includes(';')) {
      delimiter = ';';
    }
  }

  const splitCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // --- Detect file format ---
  const firstLine = rawLines[0].toUpperCase();
  const isCSV = firstLine.includes('FECHA') && 
                (firstLine.includes('CONCEPTO') || firstLine.includes('COMPROBANTE') || firstLine.includes('MOVIMIENTO') || firstLine.includes('CPBTE')) &&
                (firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t'));
  
  let resultados = [];
  
  if (isCSV) {
    // Parse header to detect dialect
    const headerCols = splitCSVLine(rawLines[0]);
    const headerUpper = headerCols.map(h => h.toUpperCase().trim());

    // Detect Credicoop raw: first col often empty, has "Fecha","Concepto","Nro.Cpbte.",...
    // Detect Nacion raw: has "NRO MOV.","FECHA","MOVIMIENTOS","COMPROB.",...
    
    let dialect = 'UNKNOWN';
    let colMap = {};

    if (headerUpper.some(h => h.includes('NRO MOV'))) {
      // Nacion raw format: NRO MOV., FECHA, MOVIMIENTOS, COMPROB., DEBITOS *-1, CREDITOS, SALDO, ...
      dialect = 'NACION_RAW';
      colMap.nroMov = headerUpper.findIndex(h => h.includes('NRO MOV'));
      colMap.fecha = headerUpper.findIndex(h => h.includes('FECHA'));
      colMap.concepto = headerUpper.findIndex(h => h.includes('MOVIMIENTO'));
      colMap.comprobante = headerUpper.findIndex(h => h.includes('COMPROB'));
      colMap.debito = headerUpper.findIndex(h => h.includes('DEBITO'));
      colMap.credito = headerUpper.findIndex(h => h.includes('CREDITO'));
    } else if (
      headerUpper.some(h => h.includes('IMPORTE') || h.includes('MONTO') || h.includes('VALOR')) &&
      headerUpper.some(h => h.includes('SALDO')) &&
      headerUpper.some(h => h.includes('COMPROB') || h.includes('CPBTE') || h.includes('TICKET'))
    ) {
      // Nacion CSV format: Fecha,Comprobante,Concepto,Importe,Saldo
      dialect = 'NACION_CSV';
      colMap.fecha = headerUpper.findIndex(h => h.includes('FECHA'));
      colMap.concepto = headerUpper.findIndex(h => h.includes('CONCEPTO') || h.includes('DETALLE') || h.includes('DESCRIPCION'));
      colMap.comprobante = headerUpper.findIndex(h => h.includes('COMPROB') || h.includes('CPBTE') || h.includes('TICKET'));
      colMap.importe = headerUpper.findIndex(h => h.includes('IMPORTE') || h.includes('MONTO') || h.includes('VALOR'));
    } else if (
      headerUpper.some(h => h.includes('CPBTE') || h.includes('COMPROBANTE')) &&
      (headerUpper.some(h => h.includes('BITO')) || headerUpper.some(h => h.includes('DITO')))
    ) {
      // Credicoop raw: (empty),Fecha,Concepto,Nro.Cpbte.,Débito,Crédito,Saldo,Cód.
      dialect = 'CREDICOOP_RAW';
      colMap.fecha = headerUpper.findIndex(h => h.includes('FECHA'));
      colMap.concepto = headerUpper.findIndex(h => h.includes('CONCEPTO'));
      colMap.comprobante = headerUpper.findIndex(h => h.includes('CPBTE') || h.includes('COMPROBANTE'));
      colMap.debito = headerUpper.findIndex(h => h.includes('BITO'));  // Débito
      colMap.credito = headerUpper.findIndex(h => h.includes('DITO') && !h.includes('BITO')); // Crédito
      if (colMap.credito === -1 && colMap.debito !== -1) {
        // Fallback: find by position relative to debito
        colMap.credito = colMap.debito + 1;
      }
    } else {
      // Generic fallback: try old approach based on column count
      dialect = 'GENERIC';
    }

    // Skip header
    const dataLines = rawLines.slice(1);
    
    if (dialect === 'GENERIC') {
      // Fall back to old column-count based logic
      const genericRes = parsearGenericCSV(dataLines, splitCSVLine, cleanVal, parseDateStr, formatDateAR);
      genericRes.saldoAnterior = saldoAnterior;
      genericRes.saldoFinalExtraido = saldoFinalExtraido;
      return genericRes;
    }
    
    // Parse all data rows
    const rows = dataLines
      .map(line => splitCSVLine(line))
      .filter(cols => {
        // Skip empty rows  
        const nonEmpty = cols.filter(c => c !== '');
        return nonEmpty.length >= 2;
      });
    
    // Detect sort order
    let isDescending = false;
    const dates = rows.map(cols => {
      const dateCol = cols[colMap.fecha];
      return dateCol ? parseDateStr(dateCol) : null;
    }).filter(Boolean);
    if (dates.length >= 2) {
      isDescending = dates[0] > dates[dates.length - 1];
    }
    
    const orderedRows = isDescending ? [...rows].reverse() : rows;

    orderedRows.forEach(cols => {
      const rawFecha = cols[colMap.fecha] || '';
      const fecha = formatDateAR(rawFecha);
      const concepto = (cols[colMap.concepto] || '').replace(/^[,\s]+|[,\s]+$/g, '').trim();
      const ticket = cols[colMap.comprobante] || '';
      
      const upperConcept = concepto.toUpperCase();
      if (
        upperConcept.includes('SALDO ANTERIOR') ||
        upperConcept.includes('SALDO FINAL') ||
        upperConcept.includes('SALDO ACTUAL') ||
        upperConcept.includes('SALDO AL')
      ) {
        return;
      }

      let monto = 0;
      if (dialect === 'NACION_RAW') {
        // Nacion: separate debit and credit columns
        const debito = cleanVal(cols[colMap.debito]);
        const credito = cleanVal(cols[colMap.credito]);
        monto = credito + debito; // debito is already negative
      } else if (dialect === 'NACION_CSV') {
        // Nacion CSV: single Importe column, with signed values (e.g. "$ -699,30" or "$ 116.550,00")
        monto = cleanVal(cols[colMap.importe]);
      } else if (dialect === 'CREDICOOP_RAW') {
        // Credicoop: Débito and Crédito are positive, debits reduce balance
        const debito = cleanVal(cols[colMap.debito]);
        const credito = cleanVal(cols[colMap.credito]);
        monto = credito - debito; // credit is income, debit is expense
      }
      
      const tx = {
        fecha,
        concepto: concepto,
        comprobante: ticket,
        ingresoBruto: monto,
        impuestos: 0,
        netoReal: monto,
        detallesImpuestos: [],
        tipo_movimiento: detectarTipoMovimiento(concepto, monto)
      };
      resultados.push(tx);
    });
    
    // Do not reverse, return ascending order (oldest first) as requested by user
    const finalRes = deduplicarMovimientos(resultados);
    finalRes.saldoAnterior = saldoAnterior;
    finalRes.saldoFinalExtraido = saldoFinalExtraido;
    return finalRes;
    
  } else {
    // Case: Raw copy-paste text (fallback)
    const rawRes = parsearRawText(rawLines, cleanVal, parseDateStr, formatDateAR, saldoAnterior);
    rawRes.saldoAnterior = saldoAnterior;
    rawRes.saldoFinalExtraido = saldoFinalExtraido;
    return rawRes;
  }
};

// Generic CSV fallback (old logic based on column count)
function parsearGenericCSV(dataLines, splitCSVLine, cleanVal, parseDateStr, formatDateAR) {
  const rows = dataLines.map(line => splitCSVLine(line)).filter(cols => cols.length >= 3 && cols.some(c => c !== ''));
  
  let isDescending = false;
  const dates = rows.map(cols => parseDateStr(cols[0])).filter(Boolean);
  if (dates.length >= 2) {
    isDescending = dates[0] > dates[dates.length - 1];
  }
  
  const orderedRows = isDescending ? [...rows].reverse() : rows;
  let resultados = [];

  orderedRows.forEach(cols => {
    let fecha = formatDateAR(cols[0]);
    let concepto = '';
    let ticket = '';
    let monto = 0;
    
    if (cols.length >= 7) {
      // Credicoop: Fecha,Concepto,Nro.Cpbte.,Débito,Crédito,Saldo,Cód.
      concepto = cols[1];
      ticket = cols[2];
      const debito = cleanVal(cols[3]);
      const credito = cleanVal(cols[4]);
      monto = credito - debito;
    } else {
      // Nacion: Fecha,Comprobante,Concepto,Importe,Saldo
      ticket = cols[1];
      concepto = cols[2];
      monto = cleanVal(cols[3]);
    }
    
    let cleanConcept = concepto.replace(/^[,\s]+|[,\s]+$/g, '').trim();
    
    const upperConcept = cleanConcept.toUpperCase();
    if (
      upperConcept.includes('SALDO ANTERIOR') ||
      upperConcept.includes('SALDO FINAL') ||
      upperConcept.includes('SALDO ACTUAL') ||
      upperConcept.includes('SALDO AL')
    ) {
      return;
    }

    const tx = {
      fecha,
      concepto: cleanConcept,
      comprobante: ticket,
      ingresoBruto: monto,
      impuestos: 0,
      netoReal: monto,
      detallesImpuestos: [],
      tipo_movimiento: detectarTipoMovimiento(cleanConcept, monto)
    };
    resultados.push(tx);
  });
  
  return deduplicarMovimientos(resultados); // keep chronological ascending
}

// Raw text fallback (copy-paste from PDF bank statements)
// Raw text fallback (copy-paste from PDF bank statements)
function parsearRawText(rawLines, cleanVal, parseDateStr, formatDateAR, saldoAnterior = 0) {
  const checkShouldIgnore = (line) => {
    const upper = line.toUpperCase().replace(/−/g, '-').trim();
    if (!upper) return true;
    if (upper.length < 3) return true;
    if (/^\s*\d+\s*$/.test(upper)) return true;
    if (/^[\s\-\,\–\—\−\+_\*]+$/.test(upper)) return true;
    
    const ignorePhrases = [
      'PAGINA', 'PÁGINA', 'HOJA:', 'SUC:',
      'VIENE DE', 'CONTINUA EN', 'SIGUIENTE',
      'BANCO CREDICOOP', 'CREDICOOP RESPONDE', 'CALIDAD DE SERVICIOS', 'SITIO DE INTERNET',
      'CUENTA CORRIENTE', 'DEBITO DIRECTO', 'CBU DE SU CUENTA', 'RESUMEN DE CUENTA',
      'SALDO ANTERIOR', 'SALDO FINAL', 'SALDO AL', 'SALDO ACTUAL',
      'TOTAL GRAV.', 'TOTAL GRAV', 'TOTAL GRAVAMEN', 'NACION ARGENTINA', 'BANCO DE LA',
      'CUIT 30-', 'IVA RESPONSABLE', 'ASOCIACION MUTUAL', '13E/48Y49', '1900 LA PLATA',
      'BUENOS AIRES', 'NRO. CUENTA', 'TOLOSA', 'FECHA MOVIMIENTOS', 'MOVIMIENTOS COMPROB',
      'DEBITOS CREDITOS', 'TOTAL GRAV. LEY', 'TOTAL GRAV. LEY 25413', 'TRANSPORTE',
      'SUCURSAL CLAVE', 'BANCARIA UNIFORME', '0110717520071700076587'
    ];
    
    if (ignorePhrases.some(phrase => upper.includes(phrase))) {
      return true;
    }
    return false;
  };

  // Keyword classifier for Banco Credicoop copy-paste text
  const clasificarEsDebitoPorConcepto = (concepto) => {
    if (!concepto) return null;
    const conceptoUpper = concepto.toUpperCase();
    
    // 1. Obvious debits that override credits
    if (
      conceptoUpper.includes('DEBITO INMEDIATO') ||
      conceptoUpper.includes('O/BCO') ||
      conceptoUpper.includes('O/BANCO') ||
      conceptoUpper.includes('O.BCO')
    ) {
      return true;
    }
    
    // 2. Credits / ingresos (positive)
    if (
      conceptoUpper.includes('CREDITO INMEDIATO') ||
      conceptoUpper.includes('RECAUDACIONES') ||
      conceptoUpper.includes('INTERBANKING') ||
      conceptoUpper.includes('DIST. TITULAR') ||
      conceptoUpper.includes('DISTINTO TITULAR')
    ) {
      return false;
    }
    
    // 3. General debits
    if (
      conceptoUpper.includes('IMPUESTO') ||
      conceptoUpper.includes('LEY 25') ||
      /\bIVA\b/.test(conceptoUpper) ||
      /\bI\.V\.A\.\b/.test(conceptoUpper) ||
      conceptoUpper.includes('I.V.A.') ||
      conceptoUpper.includes('COMISION') ||
      conceptoUpper.includes('COMIS') ||
      conceptoUpper.includes('COM.') ||
      conceptoUpper.includes('MANTENIMIENTO') ||
      conceptoUpper.includes('MANT.') ||
      conceptoUpper.includes('SUSCRIPCION') ||
      conceptoUpper.includes('PERIODICO') ||
      conceptoUpper.includes('PAGO DE SERVICIO') ||
      conceptoUpper.includes('PAGO DE SERVICIOS') ||
      conceptoUpper.includes('PAG.SERVICIOS') ||
      conceptoUpper.includes('ENTE:') ||
      conceptoUpper.includes('MOVISTAR') ||
      conceptoUpper.includes('EDELAP') ||
      conceptoUpper.includes('TELECOM')
    ) {
      return true;
    }
    
    return null;
  };

  // Balance solver for intervals between known balances
  const solveIntervalSigns = (startBalance, endBalance, intervalBlocks) => {
    const targetDiff = endBalance - startBalance;
    const defaultSigns = intervalBlocks.map(b => b.isDebit ? -1 : 1);
    const sumHeuristic = intervalBlocks.reduce((sum, b, i) => sum + defaultSigns[i] * b.montoVal, 0);
    
    if (Math.abs(sumHeuristic - targetDiff) < 0.05) {
      return defaultSigns;
    }
    
    let statesVisited = 0;
    const maxStates = 1000;
    
    const solve = (index, currentSum, signs) => {
      statesVisited++;
      if (statesVisited > maxStates) return null;
      
      if (index === intervalBlocks.length) {
        if (Math.abs(currentSum - targetDiff) < 0.05) {
          return [...signs];
        }
        return null;
      }
      
      const amt = intervalBlocks[index].montoVal;
      const preferredSign = defaultSigns[index];
      const otherSign = -preferredSign;
      
      signs[index] = preferredSign;
      let res = solve(index + 1, currentSum + preferredSign * amt, signs);
      if (res) return res;
      
      signs[index] = otherSign;
      res = solve(index + 1, currentSum + otherSign * amt, signs);
      if (res) return res;
      
      return null;
    };
    
    const signsBuffer = new Array(intervalBlocks.length).fill(0);
    const solution = solve(0, 0, signsBuffer);
    return solution || defaultSigns;
  };

  // --- STEP 1: Detect if input has tab characters ---
  let isTabSeparated = false;
  let tabCount = 0;
  for (let i = 0; i < Math.min(rawLines.length, 50); i++) {
    if (rawLines[i].includes('\t')) {
      tabCount++;
    }
  }
  if (tabCount > 3) {
    isTabSeparated = true;
  }

  // Column variables for space-separated mode
  let colDebitoEnd = -1, colCreditoEnd = -1;
  let debitCreditThreshold = 79; // default midpoint end-pos

  if (!isTabSeparated) {
    // Try to find header line first to get some bounds
    for (const line of rawLines) {
      const upper = line.toUpperCase().replace(/−/g, '-');
      if ((upper.includes('DEBITO') || upper.includes('DÉBITO')) && 
          (upper.includes('CREDITO') || upper.includes('CRÉDITO')) &&
          (upper.includes('SALDO'))) {
        const debitoMatch = upper.match(/(D[EÉ]BITO)/);
        const creditoMatch = upper.match(/(CR[EÉ]DITO)/);
        
        if (debitoMatch) colDebitoEnd = upper.indexOf(debitoMatch[0]) + debitoMatch[0].length;
        if (creditoMatch) colCreditoEnd = upper.indexOf(creditoMatch[0]) + creditoMatch[0].length;
        break;
      }
    }

    // Dynamic column detection via clustering of number END positions
    const firstNumEnds = [];
    
    rawLines.forEach(originalLine => {
      const line = originalLine.replace(/−/g, '-').trim();
      if (!line) return;
      if (checkShouldIgnore(line)) return;

      const dateMatch = line.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
      if (dateMatch) {
        const dateStr = dateMatch[1];
        const dateIdx = originalLine.indexOf(dateStr);
        
        const allNumbers = [];
        const regex = /(-?\b\d{1,3}(?:\.\d{3})*,\d{2}\b|-?\b\d{1,3}(?:,\d{3})*\.\d{2}\b|-?\b\d+,\d{2}\b|-?\b\d+\.\d{2}\b)/g;
        let match;
        while ((match = regex.exec(originalLine)) !== null) {
          if (match.index > dateIdx + dateStr.length) {
            allNumbers.push({
              value: match[0],
              endIndex: match.index + match[0].length
            });
          }
        }

        if (allNumbers.length > 0) {
          firstNumEnds.push(allNumbers[0].endIndex);
        }
      }
    });

    if (firstNumEnds.length > 0) {
      // Find clusters in firstNumEnds
      const sorted = [...firstNumEnds].sort((a, b) => a - b);
      let maxGap = 0;
      let gapIndex = -1;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i+1] - sorted[i];
        if (gap > maxGap) {
          maxGap = gap;
          gapIndex = i;
        }
      }
      
      if (maxGap >= 5 && gapIndex !== -1) {
        debitCreditThreshold = (sorted[gapIndex] + sorted[gapIndex + 1]) / 2;
        colDebitoEnd = sorted[0];
        colCreditoEnd = sorted[sorted.length - 1];
      } else {
        if (colDebitoEnd < 0) colDebitoEnd = 74;
        if (colCreditoEnd < 0) colCreditoEnd = 92;
        debitCreditThreshold = (colDebitoEnd + colCreditoEnd) / 2;
      }
    } else {
      if (colDebitoEnd < 0) colDebitoEnd = 74;
      if (colCreditoEnd < 0) colCreditoEnd = 92;
      debitCreditThreshold = (colDebitoEnd + colCreditoEnd) / 2;
    }
  }

  // --- STEP 2: Build transaction blocks ---
  const blocks = [];
  let currentBlock = null;

  rawLines.forEach(originalLine => {
    // Normalize Unicode dash characters to normal hyphen
    const line = originalLine.replace(/[\u2212\u2013\u2014]/g, '-').trim();
    if (!line) return;

    const upper = line.toUpperCase();
    if (
      upper.includes('SALDO ANTERIOR') ||
      upper.includes('SALDO FINAL') ||
      upper.includes('SALDO ACTUAL') ||
      upper.includes('SALDO AL')
    ) {
      return;
    }

    const dateMatch = line.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      
      let debitoVal = 0, creditoVal = 0, saldoVal = null;
      let cleanConcept = '';
      let cpbte = '';
      let isDebit = false;
      let montoVal = 0;

      if (isTabSeparated) {
        const parts = originalLine.split('\t');
        const dateColIdx = parts.findIndex(p => p.includes(dateStr));
        
        if (dateColIdx >= 0) {
          const remainingParts = parts.slice(dateColIdx);
          let isNacionExcel = false;
          
          if (remainingParts.length >= 4) {
            const numericVals = [];
            for (let j = 3; j < remainingParts.length; j++) {
              const val = cleanVal(remainingParts[j]);
              if (val !== 0) {
                numericVals.push({ val, index: j });
              }
            }
            
            if (numericVals.length >= 3) {
              const val3 = numericVals[0].val; // amount
              const val4 = numericVals[1].val; // previous balance
              const lastVal = numericVals[numericVals.length - 1].val; // new balance
              if (Math.abs(val4 + val3 - lastVal) < 0.05) {
                isNacionExcel = true;
              }
            }
            
            if (!isNacionExcel) {
              const p1 = (remainingParts[1] || '').trim();
              const p2 = (remainingParts[2] || '').trim();
              const p3 = (remainingParts[3] || '').trim();
              
              const p1IsNumericOrEmpty = p1 === '' || /^\d+$/.test(p1);
              const p2IsText = p2.length > 8 && !/^\d+$/.test(p2);
              const p3IsAmount = p3 && !isNaN(cleanVal(p3)) && cleanVal(p3) !== 0;
              
              if (p1IsNumericOrEmpty && p2IsText && p3IsAmount) {
                isNacionExcel = true;
              }
            }
          }
          
          if (isNacionExcel) {
            cpbte = (remainingParts[1] || '').trim();
            cleanConcept = (remainingParts[2] || '').trim();
            
            const numericVals = [];
            for (let j = 3; j < remainingParts.length; j++) {
              const val = cleanVal(remainingParts[j]);
              if (val !== 0) {
                numericVals.push(val);
              }
            }
            
            const rawMonto = numericVals.length > 0 ? numericVals[0] : 0;
            isDebit = rawMonto < 0;
            montoVal = Math.abs(rawMonto);
            saldoVal = numericVals.length >= 2 ? numericVals[numericVals.length - 1] : null;
          } else {
            cleanConcept = (remainingParts[1] || '').trim();
            cpbte = (remainingParts[2] || '').trim();
            
            const debStr = remainingParts[3] || '';
            const credStr = remainingParts[4] || '';
            const salStr = remainingParts[5] || '';
            
            debitoVal = cleanVal(debStr);
            creditoVal = cleanVal(credStr);
            saldoVal = salStr ? cleanVal(salStr) : null;
            montoVal = creditoVal > 0 ? creditoVal : (debitoVal > 0 ? debitoVal : 0);
            isDebit = debitoVal > 0 && creditoVal === 0;
          }
        }
      } else {
        const dateIdx = originalLine.indexOf(dateStr);
        const allNumbers = [];
        const regex = /(-?\b\d{1,3}(?:\.\d{3})*,\d{2}\b|-?\b\d{1,3}(?:,\d{3})*\.\d{2}\b|-?\b\d+,\d{2}\b|-?\b\d+\.\d{2}\b)/g;
        let match;
        while ((match = regex.exec(originalLine)) !== null) {
          if (match.index > dateIdx + dateStr.length) {
            allNumbers.push({
              value: match[0],
              endIndex: match.index + match[0].length
            });
          }
        }

        const lineAfterDate = line.substring(line.indexOf(dateStr) + dateStr.length).trim();
        let descPart = lineAfterDate;
        allNumbers.forEach(num => {
          descPart = descPart.replace(num.value, '');
        });
        descPart = descPart.replace(/\s+/g, ' ').trim();
        
        const comprobanteMatch = descPart.match(/^\s*(\d{3,8})\s+/);
        cleanConcept = descPart;
        if (comprobanteMatch) {
          cpbte = comprobanteMatch[1];
          cleanConcept = descPart.substring(comprobanteMatch[0].length).trim();
        }

        if (allNumbers.length === 1) {
          const num = allNumbers[0];
          montoVal = cleanVal(num.value);
          isDebit = num.endIndex < debitCreditThreshold;
          saldoVal = null;
        } else if (allNumbers.length >= 2) {
          const candidates = allNumbers.slice(0, -1);
          saldoVal = cleanVal(allNumbers[allNumbers.length - 1].value);
          
          const nonZero = candidates.find(c => cleanVal(c.value) !== 0);
          const chosenNum = nonZero || candidates[candidates.length - 1];
          
          montoVal = cleanVal(chosenNum.value);
          isDebit = chosenNum.endIndex < debitCreditThreshold;
        }
      }

      currentBlock = {
        fechaStr: dateStr,
        fechaDate: parseDateStr(dateStr),
        fechaFormateada: formatDateAR(dateStr),
        comprobante: cpbte,
        conceptoLines: [cleanConcept],
        montoVal: montoVal,
        saldoVal: saldoVal,
        isDebit: isDebit,
        rawLine: originalLine
      };
      blocks.push(currentBlock);
    } else {
      if (checkShouldIgnore(line)) {
        return;
      }
      if (currentBlock) {
        let cleanCont = line.trim();
        const regex = /(-?\b\d{1,3}(?:\.\d{3})*,\d{2}\b|-?\b\d+,\d{2}\b|-?\b\d+\.\d{2}\b)/g;
        cleanCont = cleanCont.replace(regex, '').replace(/\s+/g, ' ').trim();
        if (cleanCont) {
          currentBlock.conceptoLines.push(cleanCont);
        }
      }
    }
  });

  const validBlocks = blocks.filter(b => b.fechaDate && !isNaN(b.fechaDate.getTime()));
  
  let isDescending = false;
  const blockDates = validBlocks.map(b => b.fechaDate).filter(Boolean);
  if (blockDates.length >= 2) {
    let descCount = 0;
    let ascCount = 0;
    for (let i = 0; i < blockDates.length - 1; i++) {
      if (blockDates[i] > blockDates[i+1]) descCount++;
      else if (blockDates[i] < blockDates[i+1]) ascCount++;
    }
    if (descCount > ascCount) {
      isDescending = true;
    }
  }

  if (isDescending) validBlocks.reverse();
  
  validBlocks.forEach((b, idx) => { b.chronologicalIndex = idx; });
  validBlocks.sort((a, b) => {
    const diff = a.fechaDate - b.fechaDate;
    if (diff !== 0) return diff;
    return a.chronologicalIndex - b.chronologicalIndex;
  });

  // 1. First Pass: Assembles full concepts and applies keyword classification
  validBlocks.forEach(tx => {
    const concepto = tx.conceptoLines.join(' ').replace(/\s+/g, ' ').trim();
    tx.conceptoFull = concepto;
    const kwDebit = clasificarEsDebitoPorConcepto(concepto);
    if (kwDebit !== null) {
      tx.isDebit = kwDebit;
    }
  });

  // 2. Second Pass: Reconcile daily running balance intervals (fail-safe solver)
  let prevSaldo = Number(saldoAnterior) || 0;
  let currentInterval = [];

  validBlocks.forEach((tx, idx) => {
    currentInterval.push(tx);
    if (tx.saldoVal !== null || idx === validBlocks.length - 1) {
      const hasTarget = tx.saldoVal !== null;
      let targetEnd = prevSaldo;
      if (hasTarget) {
        targetEnd = tx.saldoVal;
      } else {
        // Accumulate using current guesses
        currentInterval.forEach(item => {
          const sign = item.isDebit ? -1 : 1;
          targetEnd += sign * item.montoVal;
        });
      }

      const solvedSigns = solveIntervalSigns(prevSaldo, targetEnd, currentInterval);
      
      // Apply solved signs
      currentInterval.forEach((item, intervalIdx) => {
        item.isDebit = solvedSigns[intervalIdx] === -1;
      });

      // Update running prevSaldo
      if (hasTarget) {
        prevSaldo = tx.saldoVal;
      } else {
        currentInterval.forEach(item => {
          const sign = item.isDebit ? -1 : 1;
          prevSaldo += sign * item.montoVal;
        });
      }
      currentInterval = [];
    }
  });

  // Build final results
  const finalResults = [];
  validBlocks.forEach(tx => {
    const conceptFull = tx.conceptoFull;
    const sign = tx.isDebit ? -1 : 1;
    const netoReal = sign * tx.montoVal;
    
    finalResults.push({
      fecha: tx.fechaFormateada,
      concepto: conceptFull,
      comprobante: tx.comprobante,
      ingresoBruto: netoReal,
      impuestos: 0,
      netoReal: netoReal,
      tipo_movimiento: detectarTipoMovimiento(conceptFull, netoReal)
    });
  });

  return deduplicarMovimientos(finalResults);
}

// Parse Excel file buffer (ArrayBuffer from FileReader)
export const parsearExcel = (arrayBuffer, fileName) => {
  // Dynamic import handled by the caller - we receive the XLSX module
  // This function is called from the component which imports xlsx
  const XLSX = window.XLSX || null;
  if (!XLSX) {
    throw new Error('La libreria XLSX no esta disponible');
  }
  
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheetName];
  const csvContent = XLSX.utils.sheet_to_csv(ws);
  
  return parsearMovimientos(csvContent);
};
