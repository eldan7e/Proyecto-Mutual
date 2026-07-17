import { parseClaroNumber, parsePersonalNumber, parseMovistarNumber, normalizePhone } from './invoiceParsers.js';

/**
 * LÓGICA DE PROCESAMIENTO CLARO
 */
export const procesarClaro = (lines) => {
  const results = [];

  lines.forEach((line) => {
    const text = line.trim();
    if (!text || text.toLowerCase().includes('total por linea')) return;

    let delim = '\t';
    if (text.includes(';')) delim = ';';

    const parts = text.split(delim).map(p => p.trim().replace(/"/g, ''));

    if (/^\d/.test(parts[0]) || (parts.length > 3 && /^\d/.test(parts[3]))) {
      let tel = "", total = 0, exced = 0, plan = "", precioLista = 0, bonif = 0;

      if (parts.length >= 12) {
        tel = parts[0];
        plan = parts[2];
        precioLista = parseClaroNumber(parts[3]);
        bonif = parseClaroNumber(parts[5]);
        for (let i = 6; i <= 11; i++) exced += parseClaroNumber(parts[i]);
        total = (precioLista + bonif) + exced;
      } else if (parts.length >= 8) {
        tel = parts[0];
        plan = parts[2];
        const valPlanParsed = parseClaroNumber(parts[3]);
        const valTotalParsed = parseClaroNumber(parts[8] || parts[7]);
        
        const esFijoOInternet = plan?.includes('A100E') || plan?.includes('CTF14') || plan?.toUpperCase().includes('FIJO');
        
        if (esFijoOInternet) {
          precioLista = 0;
          total = valTotalParsed;
          bonif = 0;
          exced = 0;
        } else {
          precioLista = valPlanParsed;
          total = valTotalParsed;
          bonif = parseClaroNumber(parts[5] || "0");
          exced = total - (precioLista + bonif);
        }
      }

      if (tel && total !== 0) {
        results.push({
          telefono: tel.length < 10 ? tel : normalizePhone(tel),
          montoStr: total.toFixed(2),
          excedenteStr: exced.toFixed(2),
          abonoStr: (total - exced).toFixed(2),
          plan: plan || "Claro",
          precioListaStr: (precioLista || 0).toFixed(2),
          descuentoStr: (bonif || 0).toFixed(2)
        });
      }
    }
  });

  return { lines: results, invoiceTotal: 0, invoiceTax: 0 };
};

/**
 * Helper: normaliza texto quitando tildes y espacios, en mayúsculas
 */
const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, '');

/**
 * LÓGICA DE PROCESAMIENTO PERSONAL
 *
 * Estructura del PDF:
 *  - "LÍNEAMÓVIL(221)XXXXXXX $XX.XXX,XX" → el $ de esa misma línea ES el total de esa línea
 *  - "LÍNEAFIJA(221)XXXXXXX $XX.XXX,XX"  → ídem
 *  - "ABONOSINTERNET $XX.XXX,XX"          → total del servicio de internet
 *  - "LINEA221XXXXXXXCARGOSDELMES"        → bloque sin header de monto; el total viene en TOTALCARGOSDELMES abajo
 *  - "TOTALCARGOSDELMES $1.103.606,87"    → total de TODA la factura, se repite cada página. IGNORAR.
 *  - Las líneas de detalle (Plan, Descuento, etc.) se ignoran para el total.
 *  - Las líneas de extras (Roaming, Pack, Gigas, WiFiPass, SMS) se acumulan como excedente.
 */
export const procesarPersonal = (textLines) => {
  // --- PASO 1: Detectar el total global de la factura (SUMAR valores distintos) ---
  const distinctTotals = new Set();
  textLines.forEach(l => {
    const u = norm(l);
    if (u.startsWith('TOTALCARGOSDELMES') || (u.startsWith('TOTALCARGOS') && u.includes('DELMES'))) {
      const m = l.match(/\$\s*([\d\.]+,\d{1,2})/);
      if (m) distinctTotals.add(m[1]);
    }
  });
  let invoiceTotal = 0;
  distinctTotals.forEach(s => { invoiceTotal += parsePersonalNumber(s); });

  // --- PASO 1b: Detectar impuestos reales del PDF (SUMAR valores distintos) ---
  const distinctTaxes = new Set();
  textLines.forEach(l => {
    const u = norm(l);
    if (u.startsWith('IMPUESTOS') && l.includes('$')) {
      const m = l.match(/\$\s*([\d\.]+,\d{1,2})/);
      if (m) distinctTaxes.add(m[1]);
    }
  });
  let invoiceTax = 0;
  distinctTaxes.forEach(s => { invoiceTax += parsePersonalNumber(s); });

  // --- PASO 2: Filtrar líneas de basura ---
  const SKIP = [
    'FACTURAN', 'PAGINA', 'FECHAVENCIMIENTO', 'PERIODOABONO', 'PERIODOCONSUMO',
    'DETALLEDECARGOSFACTURADOS', 'BENEFICIODUPLICATUSGIGASAUTOMATICO',
    'ABONOSMOVILES', 'CANTIDADCARGO', 'CARGOSFACTURADOSCANTIDAD',
    'IMPORTEENPESOS', 'IMPORTETOTAL'
  ];
  const lines = textLines.filter(l => {
    const u = norm(l);
    if (!u) return false;
    return !SKIP.some(s => u.includes(s));
  });

  // --- PASO 3: Parsear línea por línea ---
  const results = [];
  let current = null;
  let lastLooseLineNumber = null;
  let hasSkippedPlanPrice = false;

  const closeCurrent = () => {
    if (current) { results.push({ ...current }); current = null; }
  };

  for (const rawLine of lines) {
    const u = norm(rawLine);

    // LÍNEA MÓVIL o FIJA (soporta formatos viejos y nuevos de 10 dígitos)
    const cleanLineNorm = rawLine.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[\(\)\s]/g, '');
    const isNewPhoneHeader = /^(?:LINEA(?:MOVIL|FIJA)?\d{7,10}|\d{10})/.test(cleanLineNorm);

    if (isNewPhoneHeader) {
      closeCurrent();
      const phoneMatch = cleanLineNorm.match(/\b\d{7,10}\b/) || cleanLineNorm.match(/\d{7,10}/);
      const phone = phoneMatch ? phoneMatch[0] : 'LINEA SUELTA';
      
      const priceM = rawLine.match(/\$\s*([\d\.,]+)/);
      let bruto = 0;
      if (priceM) {
        bruto = parsePersonalNumber(priceM[1]);
      }
      
      let planName = cleanLineNorm.includes('FIJA') ? 'Plan Fijo' : 'Plan Personal';
      if (!priceM) {
        const planMatch = rawLine.match(/Plan\s*[^(\n]+/i);
        if (planMatch) {
          planName = planMatch[0].trim().replace(/\s*¹\s*/g, '');
        }
      }
      
      current = {
        telefono: phone,
        bruto: bruto,
        excedentes: 0,
        descuentoMonto: 0,
        descuentoPct: '',
        plan: planName
      };
      hasSkippedPlanPrice = false;
      continue;
    }

    // --- CORRECCIÓN: BRUTO EN LÍNEA SIGUIENTE ---
    if (current && current.bruto === 0) {
      const priceOnlyMatch = rawLine.trim().match(/^\$\s*([\d\.,]+)$/);
      if (priceOnlyMatch) {
        current.bruto = parsePersonalNumber(priceOnlyMatch[1]);
        continue;
      }
    }

    // INTERNET (sin número de teléfono)
    // Ej: ABONOSINTERNET $13.061,66 o SERVICIOSDEINTERNET $16.652,89
    if ((u.startsWith('ABONOSINTERNET') || u.startsWith('SERVICIOSDEINTERNET')) && rawLine.includes('$')) {
      const m = rawLine.match(/\$\s*([\d\.,]+)/);
      if (m) {
        const val = parsePersonalNumber(m[1]);
        if (current) {
          current.bruto += val;
          current.plan = 'Plan Internet + Fijo';
        } else {
          current = {
            telefono: 'INTERNET',
            bruto: val,
            excedentes: 0,
            descuentoMonto: 0,
            descuentoPct: '',
            plan: 'Plan Internet'
          };
        }
      }
      hasSkippedPlanPrice = false;
      continue;
    }

    // TELEFONÍA FIJA como sección (sin monto en el header de sección, el monto viene en LÍNEAFIJA)
    // ABONOSTELEFONÍAFIJA → skip, la línea LÍNEAFIJA la maneja el caso de arriba
    // También puede decir SERVICIOSDETELEFONIAFIJA
    if ((u.startsWith('ABONOSTELEFONI') || u.startsWith('SERVICIOSDETELEFONI')) && (!rawLine.includes('$') || u.includes('FIJA'))) {
      if (u.includes('FIJA') && !u.startsWith('LINEAFIJA')) continue; 
    }

    // Guardar temporalmente si aparece una línea sin "CARGOSDELMES" en el mismo renglón
    const looseLineMatch = u.match(/^LINEA(?:MOVIL\(?\d{2,4}\)?)?(\d{6,})$/);
    if (looseLineMatch) {
      if (current && current.telefono === 'LINEA SUELTA') {
        current.telefono = looseLineMatch[1].slice(-10);
      } else {
        lastLooseLineNumber = looseLineMatch[1].slice(-10);
      }
      continue;
    }

    // Bloque suelto SIN número de teléfono explícito: CARGOSDELMES Cant...
    if (u.startsWith('CARGOSDELMES') && !u.includes('TOTAL') && !current) {
      current = {
        telefono: lastLooseLineNumber ? lastLooseLineNumber : 'LINEA SUELTA',
        bruto: 0,
        excedentes: 0,
        descuentoMonto: 0,
        descuentoPct: '',
        plan: 'Plan Personal'
      };
      lastLooseLineNumber = null;
      hasSkippedPlanPrice = false;
      continue;
    }

    // TOTAL CARGOS DEL MES (Global de factura)
    if (u.includes('TOTALCARGOSDELMES')) {
      const m = rawLine.match(/\$\s*([\d\.,]+)/);
      if (m) {
        const val = parsePersonalNumber(m[1]);
        if (current) {
          // Si NO es el total de toda la factura, es el total de este bloque
          if (val !== invoiceTotal && current.bruto === 0) {
            current.bruto = val - (current._blockTax || 0);
          }
          closeCurrent();
        }
      }
      continue;
    }

    // EXTRAS (excedentes): Roaming, Packs, Gigas adicionales, WiFiPass, SMS Premium
    // Ignoramos: Plan, Descuento, ServicioBasico, IVA, Impuestos, PLANESYSERVICIOS, OTROSCARGOS
    if (current) {
      // Intentar extraer el nombre del plan para líneas sueltas
      if (u.includes('PLAN') && (current.plan === 'Plan Personal' || current.plan.toUpperCase() === 'PLANESYSERVICIOS')) {
        const planMatch = rawLine.match(/(?:_?\s*)(Plan[\w\d]+(?:\(\d+-\d+-\d+-\d+\))?)/i);
        if (planMatch && !planMatch[1].toUpperCase().includes('SERVICIOS')) {
          current.plan = planMatch[1];
        }
      }

      // Capturar descuento del operador
      if (u.includes('DESCUENTO')) {
        const descMatch = rawLine.match(/[Dd]escuento\s*(\d+)%/);
        if (descMatch && !current.descuentoPct) {
          current.descuentoPct = descMatch[1] + '%';
        }
        // Acumular montos negativos de descuento (último número negativo de la línea)
        const negMatch = rawLine.match(/-[\s\$]*([\d\.,]+)/g) || rawLine.match(/-([\d\.]*,\d{1,2})(?!\d)/g);
        if (negMatch) {
          const lastNeg = negMatch[negMatch.length - 1];
          const cleanNeg = lastNeg.replace(/[^\d\.,\-]/g, '');
          current.descuentoMonto += parsePersonalNumber(cleanNeg);
        }
      }

      // Capturar IMPUESTOS del bloque suelto (bruto aún no asignado)
      if (u.startsWith('IMPUESTOS') && rawLine.includes('$') && current.bruto === 0) {
        const taxM = rawLine.match(/\$\s*([\d\.,]+)/);
        if (taxM) current._blockTax = (current._blockTax || 0) + parsePersonalNumber(taxM[1]);
      }

      // TOTALCARGOSDELMES dentro de un bloque: si bruto=0, es el total del bloque suelto
      if (u.startsWith('TOTALCARGOSDELMES') || (u.startsWith('TOTALCARGOS') && u.includes('DELMES'))) {
        if (current.bruto === 0) {
          const tm = rawLine.match(/\$\s*([\d\.,]+)/);
          if (tm) current.bruto = parsePersonalNumber(tm[1]) - (current._blockTax || 0);
        }
        continue;
      }

      const isSkippedDetail = u.includes('PLAN') || u.includes('DESCUENTO') ||
        u.includes('SERVICIOBASICO') || u.includes('PLANESYSERVICIOS') ||
        u.includes('OTROSCARGOS') || u.includes('IMPUESTOS') ||
        u.includes('IVA') || u.includes('PERCEP') || u.includes('INTERNOS') ||
        u.includes('DESCUENTOSADICIONALES') || u.includes('DESCUENTOCONEXION') ||
        u.startsWith('INTERNET');

      if (!isSkippedDetail) {
        const amounts = rawLine.match(/-?[\d\.]+(?:,\d{2})\b/g) || rawLine.match(/-?[\d,]+(?:\.\d{2})\b/g);
        if (amounts) {
          const valStr = amounts[amounts.length - 1];
          const isNegative = valStr.includes('-');
          const val = parsePersonalNumber(valStr.replace('-', ''));
          // Acumular solo valores positivos razonables (excedentes reales)
          if (!isNegative && val > 0 && val < 200000) {
            // --- CORRECCIÓN: SALTAR EL PRIMER VALOR POSITIVO (PLAN LIST PRICE) ---
            if (!hasSkippedPlanPrice) {
              hasSkippedPlanPrice = true;
              continue;
            }
            current.excedentes += val;
          }
        }
      }
    }
  }

  closeCurrent();

  // --- PASO 3.5: Fusionar INTERNET con LÍNEA FIJA ---
  while (true) {
    const internetIndex = results.findIndex(r => r.telefono === 'INTERNET');
    let fijaIndex = results.findIndex(r => r.plan === 'Plan Fijo');
    
    // Fallback: Si no dice explícitamente "FIJA", buscar por el número conocido
    if (fijaIndex === -1) {
      fijaIndex = results.findIndex(r => r.telefono && r.telefono.includes('2341812'));
    }

    if (internetIndex === -1 || fijaIndex === -1) break;

    const internet = results[internetIndex];
    const fija = results[fijaIndex];
    
    fija.bruto += internet.bruto;
    fija.excedentes += internet.excedentes;
    fija.descuentoMonto += internet.descuentoMonto;
    
    if (!fija.descuentoPct && internet.descuentoPct) {
      fija.descuentoPct = internet.descuentoPct;
    }
    fija.plan = 'Plan Internet + Fijo';
    
    results.splice(internetIndex, 1);
  }

  // --- PASO 4: Convertir a neto y deduplicar ---
  // IMPORTANTE: En Personal, los montos extraídos de la factura ya son netos (pre-impuestos)
  const finalMap = new Map();
  results.forEach(r => {
    const tel = r.telefono;
    if (!tel || (tel !== 'INTERNET' && !tel.includes('SUELTA') && tel.length < 6)) return;
    if (r.bruto === 0) return; // Descartar entradas vacías

    const netoTotal = r.bruto;
    const netoExced = r.excedentes;

    let key = tel;
    if (tel === 'LINEA SUELTA') {
      key = 'SUELTA_' + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    if (!finalMap.has(key) || r.bruto > (finalMap.get(key)._bruto || 0)) {
      // Personal extrae Neto, por lo que sumamos IVA 21% para comparar peras con peras
      finalMap.set(key, {
        telefono: key,
        montoTotal: netoTotal * 1.21,
        montoStr: (netoTotal * 1.21).toFixed(2),
        excedenteStr: (netoExced * 1.21).toFixed(2),
        abonoStr: ((netoTotal - netoExced) * 1.21).toFixed(2),
        descuentoPct: r.descuentoPct || '',
        descuentoStr: (r.descuentoMonto * 1.21).toFixed(2),
        plan: r.plan,
        _bruto: r.bruto
      });
    }
  });

  return {
    lines: Array.from(finalMap.values()).map(({ _bruto, ...r }) => r),
    invoiceTotal,
    invoiceTax
  };
};

/**
 * LÓGICA DE PROCESAMIENTO MOVISTAR
 */
export const procesarMovistar = (lines) => {
  const phoneMap = new Map();
  let invoiceTotal = 0;
  let invoiceTax = 0;

  lines.forEach(line => {
    const text = line.trim();
    if (!text) return;

    // Detectar fila de totales globales (mejorada)
    const lowerText = text.toLowerCase();
    if (lowerText.startsWith('totales') || lowerText.startsWith('total factura') || lowerText.startsWith('total a pagar') || lowerText.startsWith('importe a pagar') || lowerText.startsWith('total comprobante')) {
      const allAmounts = text.match(/[\d\.,]+/g) || [];
      const amounts = allAmounts.filter(m => {
        const clean = m.replace(/[,.]/g, '');
        return clean.length >= 2;
      });
      
      if (amounts.length > 0) {
        const possibleTotal = parseMovistarNumber(amounts[amounts.length - 1]);
        if (possibleTotal > invoiceTotal) {
          invoiceTotal = possibleTotal;
          if (amounts.length >= 2) {
            invoiceTax = parseMovistarNumber(amounts[amounts.length - 2]);
          }
        }
      }
    }

    const phoneMatch = text.match(/\b\d{10}\b/);
    if (!phoneMatch) return;
    const phone = phoneMatch[0];
    const allAmounts = text.match(/[\d\.]+,?\d{1,2}/g) || [];
    const amounts = allAmounts.filter(m => m.includes(',') && m.split(',')[1].length === 2);
    const existing = phoneMap.get(phone) || { telefono: phone, montoNeto: 0, abonoNeto: 0, montoFinal: 0, plan: '' };

    if (amounts.length >= 10) { // Cuadro 1: Cargos Netos detallados (suele tener ~16 montos)
      existing.abonoNeto = parseMovistarNumber(amounts[0]);
      existing.montoNeto = parseMovistarNumber(amounts[amounts.length - 1]);
    } else if (amounts.length === 1) { // Cuadro 2: Total c/ Impuestos (tiene solo 1 monto al final)
      existing.montoFinal = parseMovistarNumber(amounts[0]);
      const planTxt = text.replace(phone, '').replace(amounts[0], '').trim();
      if (planTxt) existing.plan = planTxt;
    }
    phoneMap.set(phone, existing);
  });

  const fullText = lines.join('\n');
  const reconexionRegex = /(?:reconexi[oó]n|rehabilitaci[oó]n|cargo por mora)[^0-9]+?([\d\.]+(?:,\d{2})?)/i;
  const reconexionMatch = fullText.match(reconexionRegex);
  let reconexionAmount = 0;
  if (reconexionMatch) {
    reconexionAmount = parseMovistarNumber(reconexionMatch[1]);
  }

  // Si no se encontró invoiceTotal con las palabras clave, intentar fallback con el regex general de la app
  if (invoiceTotal === 0) {
    const totalRegex = /total(?: a pagar)?\s+([\d\.]+(?:,\d{2})?)/i;
    const tMatch = fullText.match(totalRegex);
    if (tMatch) invoiceTotal = parseMovistarNumber(tMatch[1]);
  }

  // Descontar la reconexión del total de factura general
  if (reconexionAmount > 0 && invoiceTotal > 0) {
    invoiceTotal = Math.max(0, invoiceTotal - reconexionAmount);
  }

  // Calcular taxFactor dinámico usando la moda de los ratios para evitar desvíos por anomalías
  const ratios = [];
  for (const r of phoneMap.values()) {
    if (r.montoNeto > 100 && r.montoFinal > 100) {
      ratios.push(r.montoFinal / r.montoNeto);
    }
  }
  let taxFactor = 1.21;
  if (ratios.length > 0) {
    const groups = {};
    ratios.forEach(ratio => {
      const rounded = Math.round(ratio * 100) / 100;
      groups[rounded] = (groups[rounded] || 0) + 1;
    });
    
    let bestGroup = '1.21';
    let maxCount = 0;
    for (const [g, count] of Object.entries(groups)) {
      if (count > maxCount) {
        maxCount = count;
        bestGroup = g;
      }
    }
    
    const targetGroupVal = parseFloat(bestGroup);
    const validRatios = ratios.filter(r => Math.abs(r - targetGroupVal) < 0.02);
    if (validRatios.length > 0) {
      const sum = validRatios.reduce((acc, v) => acc + v, 0);
      taxFactor = Math.round((sum / validRatios.length) * 10000) / 10000;
    } else {
      taxFactor = targetGroupVal;
    }
  }

  let mappedLines = Array.from(phoneMap.values()).map(r => {
    const totalConImpuestos = r.montoFinal > 0 ? r.montoFinal : (r.montoNeto * taxFactor);
    const excedenteNeto = r.montoNeto > 0 ? Math.max(0, r.montoNeto - r.abonoNeto) : 0;
    
    // Capturar cargos/adicionales cobrados solo con impuestos en la factura (ej: bonos adicionales)
    const extraChargesWithTax = r.montoFinal > 0 && r.montoNeto > 0
      ? Math.max(0, r.montoFinal - (r.montoNeto * taxFactor))
      : 0;

    const excedenteConImpuestos = (excedenteNeto * taxFactor) + extraChargesWithTax;
    const abonoConImpuestos = totalConImpuestos - excedenteConImpuestos;
      
    return {
      telefono: r.telefono,
      totalNet: totalConImpuestos,
      abonoNet: abonoConImpuestos,
      excedenteNet: excedenteConImpuestos,
      plan: r.plan || "Movistar Móvil",
      _montoNetoOriginal: r.montoNeto // para heurística de filtrado
    };
  });

  // Filtrar líneas falsas (ej. la de reconexión que Movistar pone con un número de cuenta de 10 dígitos)
  mappedLines = mappedLines.filter(r => {
    // Si la línea tiene exactamente el monto de reconexión, y no estuvo en el cuadro de cargos fijos (montoNeto = 0)
    if (reconexionAmount > 0 && Math.abs(r.totalNet - reconexionAmount) < 0.5 && r._montoNetoOriginal === 0) {
      return false;
    }
    // Si hay un descuento global o ajuste gigante y no tiene plan
    if (r.totalNet > 100000 && r._montoNetoOriginal === 0) {
        return false;
    }
    return true;
  });

  return {
    lines: mappedLines.map(r => {
      return {
        telefono: r.telefono,
        montoStr: r.totalNet.toFixed(2),
        excedenteStr: r.excedenteNet.toFixed(2),
        abonoStr: r.abonoNet.toFixed(2),
        plan: r.plan
      };
    }),
    invoiceTotal,
    invoiceTax
  };
};
