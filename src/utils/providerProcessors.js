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
        
        const esFijoOInternet = plan?.includes('A100E') || plan?.includes('3MC26') || plan?.includes('CTF14') || plan?.includes('TFT26') || plan?.toUpperCase().includes('TFT') || plan?.toUpperCase().includes('FIJO');
        
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
  // --- PASO 0: Pre-procesar líneas para limpiar artefactos de salto de página ---
  // El PDF concatena texto del footer/header de página al final de una línea de datos.
  // Ej: "Plan 4 GB 1 35.297,52 35.297,52Fecha Vencimiento 04/08/2026"
  const cleanedLines = [];
  for (const rawL of textLines) {
    // Separar contenido concatenado con "Fecha Vencimiento" (inicio del footer de página)
    const fvIdx = rawL.indexOf('Fecha Vencimiento');
    if (fvIdx > 0) {
      cleanedLines.push(rawL.substring(0, fvIdx));
      // El resto del footer será filtrado por el SKIP list
    } else {
      cleanedLines.push(rawL);
    }
  }

  // --- PASO 1: Detectar el total global de la factura (SUMAR valores distintos) ---
  const distinctTotals = new Set();
  // Guardar también los valores individuales como números para comparación posterior
  const individualTotalValues = new Set();
  cleanedLines.forEach(l => {
    const u = norm(l);
    if (u.startsWith('TOTALCARGOSDELMES') || (u.startsWith('TOTALCARGOS') && u.includes('DELMES'))) {
      const m = l.match(/\$\s*([\d\.]+,\d{1,2})/);
      if (m) {
        const val = parsePersonalNumber(m[1]);
        if (val > 1000) {
          distinctTotals.add(m[1]);
          individualTotalValues.add(val);
        }
      }
    }
  });
  let invoiceTotal = 0;
  distinctTotals.forEach(s => { invoiceTotal += parsePersonalNumber(s); });

  // --- PASO 1b: Detectar impuestos reales del PDF ---
  const distinctTaxes = new Set();
  cleanedLines.forEach(l => {
    const u = norm(l);
    if (u.startsWith('IMPUESTOS') && l.includes('$')) {
      const m = l.match(/\$\s*([\d\.]+,\d{1,2})/);
      if (m) distinctTaxes.add(m[1]);
    }
  });
  let invoiceTax = 0;
  distinctTaxes.forEach(s => { invoiceTax += parsePersonalNumber(s); });

  // --- PASO 2: Filtrar líneas de basura y encabezados de resumen global ---
  const SKIP = [
    'FACTURAN', 'PAGINA', 'FECHAVENCIMIENTO', 'PERIODOABONO', 'PERIODOCONSUMO',
    'DETALLEDECARGOSFACTURADOS', 'BENEFICIODUPLICATUSGIGASAUTOMATICO',
    'ABONOSMOVILES', 'CANTIDADCARGO', 'CARGOSFACTURADOSCANTIDAD',
    'IMPORTEENPESOS', 'IMPORTETOTAL',
    // Encabezados de sección que no deben llegar al parser de líneas
    'ABONOSENTUSNEGOCIOS', 'SERVICIOSMOVILES', 'SUBTOTALSINIMPUESTOS',
    // Líneas huérfanas de headers de tabla de página (post limpieza de salto de página)
    'UNITARIO'
  ];
  const lines = cleanedLines.filter(l => {
    const u = norm(l);
    if (!u) return false;
    if (/LINEA\d{7,10}/.test(u) || u.includes('2216824786')) return true;
    // Filtrar líneas huérfanas muy cortas que son restos de headers de tabla
    if (u === 'TOTAL' || u === 'PESOS' || u === 'CARGO') return false;
    return !SKIP.some(s => u.includes(s));
  });

  // --- PASO 3: Parsear línea por línea ---
  const results = [];
  let current = null;
  let lastLooseLineNumber = null;
  let hasSkippedPlanPrice = false;

  const closeCurrent = () => {
    if (current) { 
      // Si la línea tiene bruto o excedentes válidos, la guardamos
      if (current.bruto > 0 || current.excedentes > 0 || current.telefono.startsWith('Descuento')) {
        results.push({ ...current }); 
      }
      current = null; 
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const u = norm(rawLine);
    const cleanLineNorm = rawLine.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[\(\)\s\-\:\.]/g, '');

    // 1. Detectar encabezados con numero de linea explicito (ej. "LINEA 2216824786", "linea2216824786", "2216824786")
    const isTotalCargosLine = u.includes('TOTALCARGOSDELMES') || u.includes('TOTALCARGOS');
    const embeddedLineMatch = !isTotalCargosLine && (cleanLineNorm.match(/LINEA.*?(\d{8,10})/) || cleanLineNorm.match(/(2216824786)/));
    if (embeddedLineMatch) {
      closeCurrent();
      const phone = embeddedLineMatch[1] || embeddedLineMatch[0];
      const priceM = rawLine.match(/\$\s*([\d\.,]+)/);
      let bruto = 0;
      if (priceM) {
        bruto = parsePersonalNumber(priceM[1]);
      }

      let planName = 'Plan Personal';

      current = {
        telefono: phone,
        bruto: bruto,
        excedentes: 0,
        descuentoMonto: 0,
        descuentoPct: '',
        plan: planName
      };
      hasSkippedPlanPrice = false;
      lastLooseLineNumber = priceM ? null : phone;
      continue;
    }

    // 2. Capturar descuentos globales de la cooperativa/cuenta
    // Solo tratar como encabezado de sección si tiene $ (encabezado real) y NO es una línea
    // de detalle con cantidades (ej: "Descuento Conexión Total 1 -8.264,47 -8.264,47")
    const isDescSectionHeader = (u.startsWith('DESCUENTOSADICIONALES') && rawLine.includes('$'));
    if (isDescSectionHeader) {
      closeCurrent();
      let val = 0;
      const m = rawLine.match(/\$\s*(-?[\d\.,]+)/);
      if (m) val = parsePersonalNumber(m[1].replace('-', ''));
      
      if (val > 0) {
        let label = 'Descuentos Adicionales';
        // Intentar extraer el nombre específico de la línea de detalle
        if (idx + 1 < lines.length) {
          const nextLine = lines[idx + 1];
          const nextNorm = norm(nextLine);
          if (nextNorm.startsWith('DESCUENTOCONEXIONTOTAL') || nextNorm.startsWith('DESCUENTO')) {
            const descMatch = nextLine.match(/Descuento\s+([A-Za-zÀ-ÿ0-9\s]+?)(?=\s+\d|\s+-|\s+\$)/i);
            if (descMatch) {
              label = 'Descuento ' + descMatch[1].trim();
            }
          }
        }

        current = {
          telefono: label,
          bruto: -val,
          excedentes: 0,
          descuentoMonto: 0,
          descuentoPct: '',
          plan: 'Descuento Global'
        };
      }
      continue;
    }

    if (u.startsWith('DESCUENTOCONEXION')) {
      closeCurrent();
      continue;
    }

    // 3. LÍNEA MÓVIL o FIJA estándar (ej. "LÍNEA MOVIL (11)24041845 $ 20.617,77")
    const isNewPhoneHeader = /^(?:LINEA(?:MOVIL|FIJA)?\d{7,10}|\d{10})/.test(cleanLineNorm);

    if (isNewPhoneHeader) {
      closeCurrent();
      const phoneMatch = cleanLineNorm.match(/\b\d{7,10}\b/) || cleanLineNorm.match(/\d{7,10}/);
      const phone = phoneMatch ? phoneMatch[0] : (lastLooseLineNumber || 'LINEA SUELTA');
      
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
      lastLooseLineNumber = null;
      continue;
    }

    // 4. BRUTO EN LÍNEA SIGUIENTE O BLOQUE SUELTO
    if (current && current.bruto === 0) {
      const priceOnlyMatch = rawLine.trim().match(/^\$\s*([\d\.,]+)$/);
      if (priceOnlyMatch) {
        current.bruto = parsePersonalNumber(priceOnlyMatch[1]);
        continue;
      }
    }

    // 5. INTERNET / SERVICIOS DE INTERNET
    if (u.startsWith('ABONOSINTERNET') || u.startsWith('SERVICIOSDEINTERNET')) {
      let val = 0;
      if (rawLine.includes('$')) {
        const m = rawLine.match(/\$\s*([\d\.,]+)/);
        if (m) val = parsePersonalNumber(m[1]);
      } else if (idx + 1 < lines.length && lines[idx + 1].includes('$')) {
        const m = lines[idx + 1].match(/\$\s*([\d\.,]+)/);
        if (m) {
          val = parsePersonalNumber(m[1]);
          idx++;
        }
      }

      if (val > 0) {
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

    // 6. CARGOS DEL MES (Bloque de línea suelta)
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

    // 7. TOTAL CARGOS DEL MES (Cierre de bloque)
    if (u.includes('TOTALCARGOSDELMES')) {
      const m = rawLine.match(/\$\s*([\d\.,]+)/);
      if (m) {
        const val = parsePersonalNumber(m[1]);
        if (current) {
          const isGlobalTotal = individualTotalValues.has(val);
          if (!isGlobalTotal && current.bruto === 0) {
            current.bruto = val - (current._blockTax || 0);
            current._isConIva = true;
          }
          closeCurrent();
        }
      }
      closeCurrent();
      continue;
    }

    // 8. DETALLES, EXCEDENTES Y DESCUENTOS DENTRO DEL BLOQUE ACTUAL
    if (current) {
      // Capturar nombre del plan si aún no se asignó o es genérico
      if (u.includes('PLAN') && (current.plan === 'Plan Personal' || current.plan === 'Plan Fijo')) {
        const planMatch = rawLine.match(/Plan\s*(\d+\s*GB(?:\s*Control)?|\d+\s*MB)/i);
        if (planMatch) {
          current.plan = 'Plan ' + planMatch[1].trim();
        } else {
          const genericPlanMatch = rawLine.match(/Plan\s*([A-Za-z0-9\s]+?)(?=\s+\d|\s+-|\s+\$|$)/i);
          if (genericPlanMatch && !genericPlanMatch[1].toUpperCase().includes('SERVICIOS')) {
            current.plan = 'Plan ' + genericPlanMatch[1].trim();
          }
        }
      }

      if (u.includes('PLAN') || u.includes('INTERNET')) {
        const planPriceMatch = rawLine.match(/\b\d\s+([\d\.]*,\d{2})\s+([\d\.]*,\d{2})\b/);
        if (planPriceMatch && !current.precioLista) {
          const listPriceNet = parsePersonalNumber(planPriceMatch[2]);
          if (listPriceNet > 1000) {
            current.precioLista = listPriceNet * 1.21;
          }
        }
      }

      // Capturar porcentaje y monto de descuento del operador
      if (u.includes('DESCUENTO')) {
        const descMatch = rawLine.match(/[Dd]escuento\s*(\d+)%/);
        if (descMatch && !current.descuentoPct) {
          current.descuentoPct = descMatch[1] + '%';
        }
        const negMatch = rawLine.match(/-[\s\$]*([\d\.,]+)/g) || rawLine.match(/-([\d\.]*,\d{1,2})(?!\d)/g);
        if (negMatch) {
          const lastNeg = negMatch[negMatch.length - 1];
          const cleanNeg = lastNeg.replace(/[^\d\.,\-]/g, '');
          current.descuentoMonto += parsePersonalNumber(cleanNeg);
        }
      }

      // Extras / Excedentes (Roaming, Gigas, WiFi Pass, etc)
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
          if (!isNegative && val > 0 && val < 200000) {
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

  // --- PASO 3.5: Consolidar SERVICIOS DE INTERNET en la Línea Fija Principal 2212341812 ---
  let internetItem = null;
  let fijaIndex = -1;

  for (let i = 0; i < results.length; i++) {
    if (results[i].telefono === 'INTERNET') {
      internetItem = results[i];
    } else if (results[i].telefono.includes('2341812') || results[i].plan === 'Plan Fijo' || results[i].plan.includes('Fijo')) {
      if (fijaIndex === -1) fijaIndex = i;
    }
  }

  if (internetItem && fijaIndex !== -1) {
    const fija = results[fijaIndex];
    fija.bruto += internetItem.bruto;
    fija.excedentes += internetItem.excedentes;
    fija.descuentoMonto += internetItem.descuentoMonto;
    if (!fija.descuentoPct && internetItem.descuentoPct) {
      fija.descuentoPct = internetItem.descuentoPct;
    }
    if (internetItem.precioLista) {
      fija.precioLista = (fija.precioLista || 0) + internetItem.precioLista;
    }
    fija.plan = 'Plan Internet 300 MB + Fijo';

    // Eliminar el objeto 'INTERNET' independiente
    const intIdx = results.indexOf(internetItem);
    if (intIdx !== -1) results.splice(intIdx, 1);
  } else if (internetItem) {
    // Si no se encontró la línea fija en la lista, renombrar el registro de Internet a la línea 2212341812 por defecto
    internetItem.telefono = '2212341812';
    internetItem.plan = 'Plan Internet 300 MB + Fijo';
  }

  // --- PASO 4: Convertir montos netos a finales (incluyendo IVA 21%) ---
  const finalMap = new Map();
  results.forEach(r => {
    const tel = r.telefono;
    // Ignorar resúmenes o etiquetas vacías (mantener descuentos globales negativos si existen)
    if (!tel) return;
    if (tel.toLowerCase().startsWith('descuento')) return;
    if (tel !== 'INTERNET' && tel.length < 6 && !tel.includes('SUELTA')) return;
    if (r.bruto === 0 && r.excedentes === 0) return;

    const finalMonto = r._isConIva ? r.bruto : (r.bruto * 1.21);
    const netoExced = r.excedentes;

    let key = tel;
    if (tel === 'LINEA SUELTA') {
      key = 'SUELTA_' + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    if (!finalMap.has(key) || r.bruto > (finalMap.get(key)._bruto || 0)) {
      finalMap.set(key, {
        telefono: key,
        montoTotal: finalMonto,
        montoStr: finalMonto.toFixed(2),
        excedenteStr: (netoExced * 1.21).toFixed(2),
        abonoStr: (finalMonto - netoExced * 1.21).toFixed(2),
        descuentoPct: r.descuentoPct || '',
        descuentoStr: (r.descuentoMonto * 1.21).toFixed(2),
        precioListaStr: r.precioLista ? r.precioLista.toFixed(2) : '',
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

    if (amounts.length >= 2) { // Cuadro 1: Cargos Netos detallados (abono al inicio, total neto al final)
      existing.abonoNeto = parseMovistarNumber(amounts[0]);
      existing.montoNeto = parseMovistarNumber(amounts[amounts.length - 1]);
    } else if (amounts.length === 1) { // Cuadro 2: Total c/ Impuestos y Plan contratado
      existing.montoFinal = parseMovistarNumber(amounts[0]);
      const planTxt = text.replace(phone, '').replace(amounts[0], '').trim();
      if (planTxt && (!existing.plan || existing.plan === 'Movistar Móvil')) {
        existing.plan = planTxt;
      }
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

  const taxFactor = 1.21;

  let mappedLines = Array.from(phoneMap.values()).map(r => {
    let totalConImpuestos = 0;
    let abonoConImpuestos = 0;
    let excedenteConImpuestos = 0;
    let totalCalculadoConIVA = 0;

    if (r.montoNeto > 0) {
      totalCalculadoConIVA = Math.round(r.montoNeto * 1.21 * 100) / 100;
      const excedenteNeto = Math.max(0, r.montoNeto - r.abonoNeto);
      const extraChargesWithTax = r.montoFinal > 0 && r.montoFinal > totalCalculadoConIVA
        ? Math.max(0, Math.round((r.montoFinal - totalCalculadoConIVA) * 100) / 100)
        : 0;

      excedenteConImpuestos = Math.round(((excedenteNeto * 1.21) + extraChargesWithTax) * 100) / 100;
      totalConImpuestos = (r.montoFinal > 0 && r.montoFinal >= totalCalculadoConIVA) ? r.montoFinal : totalCalculadoConIVA;
      abonoConImpuestos = Math.round((totalConImpuestos - excedenteConImpuestos) * 100) / 100;
    } else if (r.montoFinal > 0) {
      totalConImpuestos = r.montoFinal;
      abonoConImpuestos = r.montoFinal;
    }

    const ivaMismatch = r.montoFinal > 0 && r.montoNeto > 0 && Math.abs(r.montoFinal - totalCalculadoConIVA) > 0.10;

    return {
      telefono: r.telefono,
      totalNet: totalConImpuestos,
      abonoNet: abonoConImpuestos,
      excedenteNet: excedenteConImpuestos,
      plan: r.plan || "Movistar Móvil",
      _montoNetoOriginal: r.montoNeto, // para heurística de filtrado
      ivaMismatch,
      montoCalculadoIVA: totalCalculadoConIVA,
      montoComprobante: r.montoFinal
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
        plan: r.plan,
        ivaMismatch: r.ivaMismatch,
        montoCalculadoIVA: r.montoCalculadoIVA.toFixed(2),
        montoComprobante: r.montoComprobante.toFixed(2)
      };
    }),
    invoiceTotal,
    invoiceTax
  };
};
