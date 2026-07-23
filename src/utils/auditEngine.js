import { getParserByProvider } from './invoiceParsers.js';

/**
 * Motor de Auditoría Aunar - VERSIÓN FINAL CLAVADA AL EXCEL
 */

export function calculateAuditLine(consumo, lineInfo, config = {}) {
  // DEBUG: Log first 3 calls to verify the function receives correct data
  if (!calculateAuditLine._debugCount) calculateAuditLine._debugCount = 0;
  if (calculateAuditLine._debugCount < 3) {
    calculateAuditLine._debugCount++;
    console.log('AUDIT_DEBUG línea:', consumo?.numero_linea, 'costo_abono_real:', consumo?.costo_abono_real, 'providerId:', config?.providerId, 'plan:', lineInfo?.planes_abonos?.nombre_plan);
  }
  try {
    const { providerId, period, historicalPrice } = config;
    
    // Soporte para join de socios tanto en formato objeto como array
    const socioRaw = lineInfo?.socios;
    const socioInfo = Array.isArray(socioRaw) ? socioRaw[0] : socioRaw;
    
    const dbInfoRaw = lineInfo?.planes_abonos;
    const dbInfo = Array.isArray(dbInfoRaw) ? dbInfoRaw[0] : dbInfoRaw;
    const isPersonal = parseInt(providerId) === 3;
    const isMovistar = parseInt(providerId) === 2;
    const isClaro = parseInt(providerId) === 1;
    const isInternet = dbInfo?.es_plan_internet === true;
    
    const costoAbonoReal = Number(consumo.costo_abono_real || 0);
    const totalLinea = Number(consumo.total_linea || 0);
    let excedentes = Number(consumo.excedentes || 0);
    const otrosCargosOp = Number(consumo.otros_cargos_op || 0);
    
    // Tarifa Aunar: Prioridad a la guardada en el consumo, luego historicalPrice del periodo, luego plan default, y fallback
    let defaultTarifa = isClaro ? 7585 : 3280;
    if (config && config.tarifaAunar) defaultTarifa = Number(config.tarifaAunar);

    let tarifaAunarFija = defaultTarifa;
    const hasHistoricalTarifa = historicalPrice?.tarifa_aunar !== undefined && historicalPrice?.tarifa_aunar !== null && Number(historicalPrice.tarifa_aunar) > 0;
    const dbTarifa = dbInfo?.tarifa_aunar !== undefined && dbInfo?.tarifa_aunar !== null ? Number(dbInfo.tarifa_aunar) : 0;
    
    if (consumo.tarifa_aunar_aplicada !== undefined && consumo.tarifa_aunar_aplicada !== null && Number(consumo.tarifa_aunar_aplicada) > 0) {
      tarifaAunarFija = Number(consumo.tarifa_aunar_aplicada);
    } else if (hasHistoricalTarifa) {
      tarifaAunarFija = Number(historicalPrice.tarifa_aunar);
    } else if (config && config.tarifaAunar !== undefined && config.tarifaAunar !== null && Number(config.tarifaAunar) > 0) {
      tarifaAunarFija = Number(config.tarifaAunar);
    } else if (dbTarifa > 0) {
      tarifaAunarFija = dbTarifa;
    } else {
      tarifaAunarFija = isClaro ? 7585 : 6500;
    }



    // FORMULA: Si es plan de internet, NO se aplican gastos admin ni IVA
    // El monto de internet ya viene neto del proveedor
    // La línea 2216824786 (Anchordoquy) viene facturada aparte con IVA incluido en su abono base
    const isBilledSeparately = consumo.numero_linea === '2216824786';
    let adjustedCostoAbonoReal = costoAbonoReal;
    if (isBilledSeparately) {
      if (period && period.startsWith('2026-01')) {
        adjustedCostoAbonoReal = costoAbonoReal * 1.21;
      } else if (period && period >= '2026-04') {
        // En abril el excel viene sin el recargo del 1.24
        adjustedCostoAbonoReal = costoAbonoReal;
      } else {
        adjustedCostoAbonoReal = (costoAbonoReal + excedentes) * 1.2435385;
        excedentes = 0;
      }
    }
    let abonoBase = adjustedCostoAbonoReal + excedentes;
    let gastosAdmin = (isInternet && !isPersonal) ? 0 : adjustedCostoAbonoReal * 0.05;
    
    // El usuario confirmó que para Personal el Total Detectado ya trae IVA, por lo que no debemos sumar el 21%.
    let ivaFinal = 0;
    if (!isPersonal) {
      ivaFinal = ((isInternet) || isBilledSeparately) ? 0 : (abonoBase + gastosAdmin) * 0.21;
    }

    let totalBrutoSinAdicionales;

    if (isClaro) {
      // ============================================================
      // FÓRMULA REAL DEL EXCEL DE CLARO (hojas BONI + AUNAR)
      // ============================================================
      // BONI!E = precio_oficial_claro × 0.10 (90% descuento fijo Aunar)
      // Para líneas regulares: BONI!E ≈ costo_abono_real (Claro cobra 10% al corporativo)
      // Para A100E (Internet): BONI!E ≠ costo_abono_real (Claro cobra 29% al corporativo)
      //
      // AUNAR!D = (W + Y + Z + X + CTA_CEL + AA) × (1 + DESC/100)
      //   L = BONI!E (abono ajustado)
      //   U = L + excedentes
      //   V = U × 4.17%
      //   W = U + V
      //   X = W × 1%
      //   Y = Tarifa Aunar (7100)
      //   Z = factor bonificación (ej 1.07)
      //   AA = L × Z (monto bonificación)
      // ============================================================
      
      // Calcular abono base según fórmula BONI: precio_oficial × 0.10
      // Para líneas regulares: BONI!E ≈ costo_abono_real (Claro cobra 10% al corporativo)
      // EXCEPCIÓN CRÍTICA: Para planes fijos, internet o consolidados (A100E, 3MC26, CTF14, TFT26, Internet + Tel Fijo),
      // Claro NO cobra el 10% del precio de lista. El abono base es el costo real facturado por la operadora (costoAbonoReal).
      const pName = ((lineInfo?.plan || '') + ' ' + (dbInfo?.nombre_plan || '') + ' ' + (consumo.plan || '')).toUpperCase();
      const esPlanFijoOInternet = isInternet || pName.includes('A100E') || pName.includes('3MC26') || pName.includes('CTF14') || pName.includes('TFT26') || pName.includes('CONSOLIDADO') || pName.includes('FIJO');

      const precioOficialClaro = Number(consumo.precio_lista_factura || consumo.precio_lista_audit || lineInfo?.planes_abonos?.precio || dbInfo?.precio || 0);
      let abonoBaseClaro = costoAbonoReal;

      if (!esPlanFijoOInternet) {
        if (costoAbonoReal > 30000 && precioOficialClaro > 0 && Math.abs(costoAbonoReal - precioOficialClaro) < 1.0) {
          abonoBaseClaro = precioOficialClaro * 0.10;
        } else if (costoAbonoReal > 0) {
          abonoBaseClaro = costoAbonoReal;
        } else if (precioOficialClaro > 0) {
          abonoBaseClaro = precioOficialClaro * 0.10;
        }
      }
      
      let extraChargesClaro = isInternet ? 0 : excedentes;
      
      const U = abonoBaseClaro + extraChargesClaro;
      const V = U * 0.0417; // Impuesto 4.17%
      const W = U + V;
      const X = W * 0.01; // Impuesto 1% (Ley 26573)
      
      let marginPct = 7;
      if (esPlanFijoOInternet) {
        const parseMarginFijo = (val) => {
          if (val === undefined || val === null) return 7;
          const v = Number(val);
          if (v > 50) return v >= 80 ? v - 100 : v;
          if (v <= 2.0) return v * 100.0;
          return v;
        };
        if (consumo.mutual_margen_aplicado !== undefined && consumo.mutual_margen_aplicado !== null) {
          marginPct = parseMarginFijo(consumo.mutual_margen_aplicado);
        } else if (dbInfo && dbInfo.mutual_margen_pct !== undefined && dbInfo.mutual_margen_pct !== null) {
          marginPct = parseMarginFijo(dbInfo.mutual_margen_pct);
        }
      } else {
        if (consumo.mutual_margen_aplicado !== undefined && consumo.mutual_margen_aplicado !== null) {
          const val = Number(consumo.mutual_margen_aplicado);
          marginPct = val <= 2.0 ? val * 100.0 : val;
        } else if (dbInfo && dbInfo.mutual_margen_pct !== undefined && dbInfo.mutual_margen_pct !== null) {
          const val = Number(dbInfo.mutual_margen_pct);
          marginPct = val > 50 ? 7 : val;
        }
      }
      const Z_val = marginPct / 100.0;
      const AA = abonoBaseClaro * Z_val;
      
      gastosAdmin = V + X + AA;
      ivaFinal = 0;
      abonoBase = abonoBaseClaro;
      
      totalBrutoSinAdicionales = W + tarifaAunarFija + X + AA;
    } else if (isMovistar) {
      // ============================================================
      // FÓRMULA REAL DEL EXCEL DE MOVISTAR (verificada con archivo)
      // ============================================================
      // Columnas del Excel (hoja SOCIOS):
      //   V = COSTO EMPRESA = total_linea (lo que factura Movistar a la empresa)
      //   G = EXCED. $ INCL. = excedentes con IVA incluido (viene del cuadro de excedentes)
      //   Y = MOVISTAR SIN EXC = V - G (abono sin excedente)
      //   W = Costo Adm. = Y * 5% (admin se calcula solo sobre abono sin excedente)
      //   X = BONIFICACION EN LINEA = 2.1 (factor IVA: 2.1/10 = 21%)
      //   CuotaSocial = ABONOS!B2 = tarifa Aunar
      //   N = DESC y ADICIONALES (% descuento del socio)
      //
      // FORMULA: T.AUNAR = ROUND(((V + W + CuotaSocial) + (Y * X / 10)) * IF(N<>"", 1+N/100, 1), 2)
      // Simplificado: T.AUNAR = (total_linea + movistar_sin_exc*5% + aunar + movistar_sin_exc*21%) * descFactor
      // ============================================================

      // Usar defaults SOLO si no hay valores explícitos guardados en consumo o historial
      const hasAppliedTarifa = consumo.tarifa_aunar_aplicada !== undefined && consumo.tarifa_aunar_aplicada !== null && Number(consumo.tarifa_aunar_aplicada) > 0;
      if (!hasHistoricalTarifa && !hasAppliedTarifa && !(config && config.tarifaAunar)) {
        if (consumo.periodo && consumo.periodo >= '2026-02') {
          tarifaAunarFija = 6700;
        } else {
          tarifaAunarFija = dbInfo?.tarifa_aunar ? Number(dbInfo.tarifa_aunar) : 6500;
        }
      }

      if (consumo.periodo && consumo.periodo >= '2026-02') {
        // Febrero 2026 en adelante: fórmula real del Excel
        // En la base de datos costoAbonoReal se guardó con IVA 21%.
        // Pero Movistar tiene impuestos internos (~26.26%). Recuperamos el neto y aplicamos el multiplicador real:
        const trueAbonoNeto = costoAbonoReal / 1.21;
        // En abril de 2026 el Excel vino sin el recargo de impuestos internos (usó IVA simple 1.21)
        const isApril26OrLater = consumo.periodo >= '2026-04';
        const abonoRealTaxes = isApril26OrLater ? costoAbonoReal : (trueAbonoNeto * 1.26263157);
        
        const G = excedentes;                         // EXCED. $ INCL. (excedentes c/ IVA)
        const V = Math.round((abonoRealTaxes + G) * 100) / 100; // COSTO EMPRESA = total_linea de factura ajustado
        
        const Y_mov = Math.max(0, V - G);            // MOVISTAR SIN EXC = abono sin excedente (es igual a abonoRealTaxes)
        const W = Math.round(Y_mov * 0.05 * 100) / 100;  // Costo Adm = Y * 5%
        const ivaComponent = Y_mov * 2.1 / 10;       // IVA = Y * 21% (escrito como Y*2.1/10 en Excel)

        abonoBase = V;                                // Para mostrar en UI
        gastosAdmin = W;                              // Admin solo sobre abono sin excedente
        ivaFinal = Math.round(ivaComponent * 100) / 100;

        // T.AUNAR = ((V + W + CuotaSocial) + (Y * 2.1 / 10))
        totalBrutoSinAdicionales = Math.round((V + W + tarifaAunarFija + ivaComponent) * 100) / 100;
      } else {
        // Lógica vieja (Excel enero): Estimamos Y multiplicando por 1.2626
        const taxMultiplier = 1.26263157;
        const abonoWithTaxes = Math.round(costoAbonoReal * taxMultiplier * 100) / 100;
        abonoBase = abonoWithTaxes;
        gastosAdmin = Math.round(abonoWithTaxes * 0.05 * 100) / 100;
        totalBrutoSinAdicionales = abonoBase + excedentes + gastosAdmin + ivaFinal + tarifaAunarFija;
      }
    } else {
      totalBrutoSinAdicionales = abonoBase + gastosAdmin + ivaFinal + tarifaAunarFija;
    }
    
    // 4.1 PROCESAR ADICIONALES (Cargos fijos, Cuotas de equipo y Descuentos extra)
    let cargosExtra = 0;
    let descExtraPct = 0;
    
    if (config.adicionales && Array.isArray(config.adicionales)) {
      config.adicionales.forEach(ad => {
        if (ad.tipo === 'CARGO') {
          cargosExtra += Number(ad.valor || 0);
        } else if (ad.tipo === 'DESCUENTO') {
          descExtraPct += Number(ad.valor || 0);
        } else if (ad.tipo === 'CARGO_PCT') {
          descExtraPct -= Number(ad.valor || 0);
        }
      });
    }

    const totalBruto = totalBrutoSinAdicionales + cargosExtra + otrosCargosOp;

    // 5. DESCUENTO / ADICIONAL DEL SOCIO (Clavado al Excel con soporte para recargos y overrides)
    let discountPct = Number(socioInfo?.desc_adicionales || 0);

    // Si la línea tiene un descuento_esperado no nulo, tiene prioridad sobre el del socio (incluso si es 0)
    if (lineInfo?.descuento_esperado !== undefined && lineInfo?.descuento_esperado !== null) {
      // Los planes A100E (fijos/internet) no deben heredar o usar el 90% (evita arrastre de móviles)
      const isA100E = dbInfo?.nombre_plan?.includes('A100E') || lineInfo?.plan_db === 'A100E';
      if (!(isA100E && Number(lineInfo.descuento_esperado) === 90)) {
        discountPct = Number(lineInfo.descuento_esperado);
      }
    }
    
    if (consumo.numero_linea === '2213084915' && period && period.startsWith('2026-01')) {
      discountPct = 5;
    }

    if (consumo.numero_linea === '2215940741' && isPersonal) {
      if (period && period.startsWith('2026-01')) {
        discountPct = 0;
      } else {
        discountPct = 80;
      }
    }
    
    // Soporte para Overrides históricos específicos de Claro
    if (isClaro) {
      // Ignorar descuentos del 80%, 80.5% y 90% en Claro (son remanentes de Movistar por portabilidad)
      if (discountPct === 80 || discountPct === 80.5 || discountPct === 90) {
        discountPct = 0;
      }
    } else if (isPersonal) {
      if (discountPct === 80 || discountPct === 80.5 || discountPct === 90) {
        if (consumo.numero_linea !== '2215940741') {
          discountPct = 0;
        }
      }
    } else if (isMovistar) {
      let periodKey = '';
      if (typeof period === 'string') {
        const match = period.match(/^(\d{4}-\d{2})/);
        if (match) periodKey = match[1];
      }
      if (periodKey === '2026-04') {
        if (consumo.numero_linea === '2215310804' || consumo.numero_linea === '2215528933') {
          discountPct = 0;
        }
      }
    }
    
    // Los descuentos de Claro ahora se toman directamente de socios.desc_adicionales y lineas.descuento_esperado
    // Sin overrides hardcodeados por período/línea

    const pctBonifSocio = (discountPct + descExtraPct) / 100;
    const bonifManual = Number(consumo.bonificaciones || 0);

    let bonifSocio = 0;
    let totalCobrar = 0;

    if (isClaro) {
      // En Claro, desc_adicionales es POSITIVO para descuentos (ej 15 = 15% off, paga 85%)
      // y NEGATIVO para recargos (ej -11 = 11% recargo, paga 111%)
      // Excel: (W + Y + Z + X + CTA_CEL + AA) × (1 + DESC/100)
      // CTA_CEL (cargosExtra) va DENTRO del paréntesis, antes del factor de descuento
      const subtotalConCargos = totalBrutoSinAdicionales + cargosExtra;
      const baseCobrar = subtotalConCargos * (1 - pctBonifSocio);
      bonifSocio = subtotalConCargos - baseCobrar;
      totalCobrar = baseCobrar + otrosCargosOp - bonifManual;
    } else if (isMovistar) {
      // En Movistar, desc_adicionales se guarda positivo en DB (ej 10 = 10% off, paga 90%)
      // El descuento se aplica solo sobre el abono/tarifa (totalBrutoSinAdicionales)
      const baseCobrar = totalBrutoSinAdicionales * (1 - pctBonifSocio);
      bonifSocio = totalBrutoSinAdicionales - baseCobrar;
      totalCobrar = baseCobrar + cargosExtra + otrosCargosOp - bonifManual;
    } else {
      // Para Personal u otras: Excel pone CTA_CEL DENTRO del factor de descuento
      // Fórmula Excel: (V + W + CUOTA + CTA_CEL) × (1 + N/100)
      const subtotalConCargos = totalBrutoSinAdicionales + cargosExtra;
      bonifSocio = subtotalConCargos * pctBonifSocio;
      totalCobrar = (subtotalConCargos - bonifSocio) + otrosCargosOp - bonifManual;
    }

    // Auditoría específica de Movistar — Descuento escalonado por GB
    const precioLista = Number(consumo.precio_lista_audit || config.historicalPrice?.precio_lista || dbInfo?.precio || 0);
    let movistarAudit = null;
    if (parseInt(providerId) === 2 && precioLista > 0) {
      const gbIncluidos = Number(dbInfo?.gb_incluidos || 0);
      const expectedPct = gbIncluidos >= 10 ? 85 : 80;
      const tolerancePct = expectedPct - 2.1; // margen de tolerancia ~2%
      const actualDiscountPct = Math.round((1 - (costoAbonoReal / precioLista)) * 1000) / 10;
      const meetsAgreement = actualDiscountPct >= tolerancePct;
      const expectedCosto = precioLista * (1 - expectedPct / 100);
      movistarAudit = {
        precioLista,
        costoAbonoReal,
        actualDiscountPct,
        meetsAgreement,
        expectedPct,
        gbIncluidos,
        diferencia: Math.round((costoAbonoReal - expectedCosto) * 100) / 100
      };
    }

    const _finalBaseAb = Math.round(abonoBase * 100) / 100;
    const _finalTotalCobrar = (consumo.estado_pago === 'LIQUIDADO' && consumo.total_linea !== undefined && consumo.total_linea !== null) 
          ? Number(consumo.total_linea) 
          : Math.round(totalCobrar * 100) / 100;
    
    // DEBUG: verify final values for first 3 lines
    if (!calculateAuditLine._resultCount) calculateAuditLine._resultCount = 0;
    if (calculateAuditLine._resultCount < 3) {
      calculateAuditLine._resultCount++;
      console.log('AUDIT_RESULT línea:', consumo?.numero_linea, 'baseAb:', _finalBaseAb, 'tarifaAunar:', tarifaAunarFija, 'totalCobrar:', _finalTotalCobrar);
    }

    return {
      ...consumo,
      lineas: lineInfo,
      calculado: {
        baseAb: _finalBaseAb,
        cAdmin: Math.round(gastosAdmin * 100) / 100,
        cIVA: Math.round(ivaFinal * 100) / 100,
        tarifaAunar: tarifaAunarFija,
        excedentes: Math.round(excedentes * 100) / 100,
        totalBruto: Math.round(totalBruto * 100) / 100,
        totalCobrar: _finalTotalCobrar,
        bonifManual: Math.round((bonifManual + bonifSocio) * 100) / 100,
        appliedDiscountPct: Math.round(pctBonifSocio * 100),
        hasExtras: cargosExtra > 0,
        extraAmount: cargosExtra,
        isPorted: lineInfo?.proveedor_id !== parseInt(providerId),
        movistarAudit
      }
    };
  } catch (err) {
    console.error("ERROR AUDIT ENGINE línea:", consumo?.numero_linea, "Error:", err?.message, "Stack:", err?.stack);
    return { ...consumo, lineas: lineInfo, calculado: { baseAb: 0, cAdmin: 0, cIVA: 0, tarifaAunar: 0, excedentes: 0, totalBruto: 0, totalCobrar: 0, bonifManual: 0, appliedDiscountPct: 0, hasExtras: false, extraAmount: 0, isPorted: false, movistarAudit: null, error: true } };
  }
}

/**
 * Extracts and calculates the invoice totals (tax and total amount) based on heuristic rules
 * and provider specifics. Moved from CargaManual.jsx to decouple logic.
 * 
 * @param {string} rawData - The raw text payload from the invoice
 * @param {Array<string>} lines - The raw text split by lines
 * @param {Array<Object>} finalResults - The parsed line data items
 * @param {Object} response - The object returned by the provider parser (procesarMovistar, etc.)
 * @param {string} selectedProvider - The current selected provider ('movistar', 'claro', 'personal')
 * @returns {Object} - An object containing { tax, total, subtotalLines }
 */
export function calculateInvoiceTotals(rawData, lines, finalResults, response, selectedProvider) {
  const parseNum = getParserByProvider(selectedProvider);

  // --- DETECCIÓN DE CARGOS GLOBALES (Bonos, Packs, Adicionales sin línea) ---
  let globalExtraNeto = 0;
  const keywords = ['bono', 'adicional', 'pack', 'cargo general', 'servicio global'];
  
  lines.forEach(line => {
    const l = line.toLowerCase();
    const hasKeyword = keywords.some(k => l.includes(k));
    const hasPhone = /\d{10}/.test(line);
    
    if (hasKeyword && !hasPhone) {
      const amounts = line.match(/[\d\.]+,?\d{2}/g);
      if (amounts) {
        const val = parseNum(amounts[amounts.length - 1]);
        // Evitamos sumar totales que ya procesamos (ej: Total factura)
        if (val > 0 && !l.includes('total') && !l.includes('importe final')) {
          globalExtraNeto += val;
        }
      }
    }
  });

  // Detectar reconexión para excluir del total en Movistar
  let reconexionAmount = 0;
  if (selectedProvider === 'movistar') {
    const reconexionRegex = /(?:reconexi[oó]n|rehabilitaci[oó]n)[^0-9]+?([\d\.]+(?:,\d{2})?)/i;
    const reconexionMatch = rawData.match(reconexionRegex);
    if (reconexionMatch) {
      reconexionAmount = parseNum(reconexionMatch[1]);
    }
  }

  let subtotalLines = finalResults.reduce((acc, r) => acc + parseNum(r.montoStr), 0);
  if (selectedProvider !== 'movistar') {
    subtotalLines += globalExtraNeto; // Movistar ya lo prorratea en montoStr
  }

  let invoiceTotalDetected = null;
  let invoiceTaxDetected = null;

  if (response.invoiceTotal > 0) {
    invoiceTotalDetected = response.invoiceTotal;
  } else if (invoiceTotalDetected === 0 || !invoiceTotalDetected) {
    // Fallback Heurístico
    const allAmounts = rawData.match(/[\d\.]+,?\d{2}/g);
    if (allAmounts) {
      for (let i = allAmounts.length - 1; i >= 0; i--) {
        const val = parseNum(allAmounts[i]);
        if (val > subtotalLines && val < (subtotalLines * 1.5)) {
          invoiceTotalDetected = val;
          break;
        }
      }
    }
  }

  // Si es Movistar, nos aseguramos de que el total detectado también excluya la reconexión
  if (selectedProvider === 'movistar' && reconexionAmount > 0) {
    if (invoiceTotalDetected > 0 && (invoiceTotalDetected - subtotalLines) > 1.00) {
      if (invoiceTotalDetected >= reconexionAmount) {
        invoiceTotalDetected = invoiceTotalDetected - reconexionAmount;
      }
    }
  }

  if (selectedProvider === 'claro') {
    // Claro ya incluye IVA en los montos por línea
    invoiceTaxDetected = 0;
    if (!invoiceTotalDetected) invoiceTotalDetected = subtotalLines;
  } else if (selectedProvider === 'movistar') {
    if (response.invoiceTax > 0) {
      invoiceTaxDetected = response.invoiceTax;
    } else {
      invoiceTaxDetected = 0; // No estimamos IVA del 21% porque montoStr ya es con IVA
    }
    if (!invoiceTotalDetected) invoiceTotalDetected = subtotalLines;
  } else {
    if (response.invoiceTax > 0) {
      invoiceTaxDetected = response.invoiceTax;
    } else if (invoiceTotalDetected > 0) {
      invoiceTaxDetected = Math.max(0, invoiceTotalDetected - subtotalLines);
    } else {
      invoiceTaxDetected = subtotalLines * 0.21;
    }
  }

  return {
    tax: invoiceTaxDetected,
    total: invoiceTotalDetected || (subtotalLines + invoiceTaxDetected),
    subtotalLines
  };
}

/**
 * Performs cross-validation for a specific line, comparing it against the official plan 
 * and historical data to flag anomalies.
 * 
 * @param {Object} item - The parsed line item
 * @param {Object} dbInfo - Database record for this line
 * @param {Object} context - { selectedProvider, periodPrices, prevConsumosData, parseNum }
 * @returns {Object} - Audit result object containing status, alerts, and calculated amounts
 */
export function auditLineItem(item, dbInfo, context) {
  const { selectedProvider, periodPrices, prevConsumosData, parseNum } = context;
  
  const alertas = [];
  let auditStatus = 'OK';

  const provMap = { 'claro': 1, 'movistar': 2, 'personal': 3 };
  if (dbInfo && dbInfo.proveedor_id !== provMap[selectedProvider]) {
    const currentProvName = dbInfo.proveedor_id === 1 ? 'CLARO' : dbInfo.proveedor_id === 2 ? 'MOVISTAR' : 'PERSONAL';
    alertas.push({ 
      tipo: 'INFO', 
      msg: `ℹ️ Histórico: En este mes era ${selectedProvider.toUpperCase()} (DB hoy: ${currentProvName})` 
    });
  }
  
  let montoFacturado = parseNum(item.montoStr);
  let excMonto = parseNum(item.excedenteStr);

  const isBilledSeparately = item.telefono === '2216824786';
  if (isBilledSeparately && selectedProvider === 'personal') {
    const neto = montoFacturado / 1.21;
    const netoExc = excMonto / 1.21;
    const period = context.periodo;
    if (period && period.startsWith('2026-01')) {
      montoFacturado = neto * 1.21;
    } else {
      montoFacturado = (neto + netoExc) * 1.2435385;
      excMonto = 0;
    }
    montoFacturado = Math.round(montoFacturado * 100) / 100;
  }

  // Identificación de planes para auditoría
  let planDisplay = item.plan;
  if ((planDisplay === 'Movistar Móvil' || planDisplay === 'Plan Personal' || planDisplay === 'Claro') && dbInfo?.plan_db) {
    planDisplay = dbInfo.plan_db;
  }
  const esA100E = item.plan?.includes('A100E') || item.plan?.includes('3MC26') || dbInfo?.plan_db === 'A100E' || dbInfo?.plan_db === '3MC26';
  const esPlanFija = esA100E || item.plan?.includes('CTF14') || item.plan?.includes('TFT26') || item.plan?.toUpperCase().includes('TFT') || item.plan?.toUpperCase().includes('FIJO');
  
  // Precios base para auditoría: preferir precio de lista de la factura si viene > 0, sino base de datos
  // Excepción: planes fijos/internet (A100E, CTF14) — su precio de lista real está en el catálogo, no en la factura
  const dbPrecioLista = periodPrices.get(dbInfo?.plan_id) || dbInfo?.precio_oficial || 0;
  const parsedPrecioLista = item.precioListaStr ? Number(item.precioListaStr) : 0;
  const precioLista = (selectedProvider === 'claro' && parsedPrecioLista > 0 && !esPlanFija)
    ? parsedPrecioLista
    : (dbPrecioLista || 0);

  // --- CARGA DE COSTOS REALES (OPERADORA) ---
  const realAbono = montoFacturado - excMonto;
  const montoTotalSocio = montoFacturado;

  // --- AUDITORÍA DE BONIFICACIÓN (CLARO) ---
  if (selectedProvider === 'claro' && precioLista > 0) {
    const descuentoReal = ((precioLista - realAbono) / precioLista) * 100;
    const esCTF14 = item.plan?.includes('CTF14') || dbInfo?.plan_db?.includes('CTF14');
    const descuentoEsperado = (dbInfo && dbInfo.descuento_operadora_pct > 0) 
      ? Number(dbInfo.descuento_operadora_pct) 
      : (esCTF14 ? 75 : 90);
    const diffPct = descuentoReal - descuentoEsperado;

    if (Math.abs(diffPct) > 2.0) { 
      auditStatus = 'WARN';
      if (diffPct < -2.0) {
        alertas.push({ 
          tipo: 'CRITICAL', 
          msg: `DESVÍO BONIF: ${descuentoReal.toFixed(1)}% (Esperado ${descuentoEsperado}%)`,
          diff: realAbono - (precioLista * (1 - descuentoEsperado/100))
        });
      } else {
        alertas.push({ 
          tipo: 'CRITICAL', 
          msg: `BONIF EXTRA: ${descuentoReal.toFixed(1)}% (Esperado ${descuentoEsperado}%)`,
          diff: (precioLista * (1 - descuentoEsperado/100)) - realAbono
        });
      }
    } else {
      alertas.push({ tipo: 'STABLE', msg: `Bonif. OK (${descuentoReal.toFixed(1)}%)` });
    }
  }

  // AUDITORÍA: Comparación contra el mes pasado (SOLO ABONO BASE)
  const prevData = prevConsumosData.find(c => c.numero_linea && c.numero_linea.endsWith(item.telefono.slice(-10)));
  const prevAbonoBase = prevData ? Number(prevData.costo_abono_real) : 0;
  const variacion = realAbono - prevAbonoBase;

  return {
    planDisplay,
    precioLista,
    realAbono,
    montoTotalSocio,
    montoFacturado,
    excMonto,
    auditStatus,
    alertas,
    prevAbonoBase,
    variacion
  };
}

/**
 * Consolidates fixed services (like A100E and CTF14 in Claro).
 * 
 * @param {Array<Object>} resultados - Processed row results
 * @returns {Array<Object>} - Cleaned and merged row results
 */
export function consolidateFixedServices(resultados, selectedProvider) {
  const provStr = selectedProvider?.toString().toLowerCase();
  if (provStr !== 'claro' && provStr !== '1') return resultados;

  const getLine = (r) => (r?.numero_linea || r?.linea || '').toString();
  const getPlan = (r) => ((r?.plan || '') + ' ' + (r?.planOficial || '') + ' ' + (r?.lineas?.planes_abonos?.nombre_plan || '') + ' ' + (r?.lineas?.plan || '')).toUpperCase();
  const getSocioId = (r) => r?.socioId || r?.lineas?.socio_id || r?.lineas?.socios?.socio_id;
  const getGrupoNum = (r) => r?.numeroGrupo || r?.lineas?.numero_grupo;
  const getSocioNombre = (r) => r?.socioNombre || r?.lineas?.socios?.nombre_completo || '';

  // 1. Identificar cuentas técnicas de internet de Claro (< 10 dígitos o números 000...)
  const cuentasInternet = resultados.filter(r => {
    const l = getLine(r);
    return l && (l.length < 10 || l.startsWith('000'));
  });

  // 2. Identificar ÚNICAMENTE líneas de Teléfono Fijo asociadas (CTF14, TFT26, o con subplan fijo)
  const lineasFijas = resultados.filter(r => {
    const l = getLine(r);
    if (!l || (l.length < 10 && !l.startsWith('221')) || l.startsWith('000')) return false;
    const p = getPlan(r);
    return p.includes('CTF14') || p.includes('TFT26') || p.includes('A100E') || p.includes('3MC26') || p.includes('CTF') || p.includes('TFT') || p.includes('FIJO');
  });

  if (cuentasInternet.length > 0 && lineasFijas.length > 0) {
    lineasFijas.forEach((fija, idx) => {
      const pFija = getPlan(fija);
      const fijaLine = getLine(fija);
      const esCTF14 = pFija.includes('CTF14') || pFija.includes('A100E');
      const esTFT26 = pFija.includes('TFT26') || pFija.includes('3MC26');

      const sIdFija = getSocioId(fija);
      const gNumFija = getGrupoNum(fija);
      const sNombreFija = getSocioNombre(fija);

      // Buscar coincidencia exacta en cuentasInternet
      const matchInternet = cuentasInternet.find(c => !c.isMerged && (
        (sIdFija && getSocioId(c) && sIdFija === getSocioId(c)) ||
        (gNumFija && getGrupoNum(c) && gNumFija === getGrupoNum(c)) ||
        (sNombreFija && getSocioNombre(c) && sNombreFija !== 'Socio no identificado' && sNombreFija.trim().toLowerCase() === getSocioNombre(c).trim().toLowerCase()) ||
        (esCTF14 && (getPlan(c).includes('A100E') || getLine(c).includes('2982898'))) ||
        (esTFT26 && (getPlan(c).includes('3MC26') || getLine(c).includes('3409596')))
      )) || cuentasInternet.find(c => !c.isMerged) || cuentasInternet[idx];

      if (matchInternet && !matchInternet.isMerged && matchInternet !== fija) {
        // Herencia de socio si la cuenta de internet lo tenía asignado
        if (!sIdFija && getSocioId(matchInternet)) {
          if (fija.lineas) {
            fija.lineas.socio_id = getSocioId(matchInternet);
          }
          fija.socioId = getSocioId(matchInternet);
          fija.socioNombre = getSocioNombre(matchInternet);
          fija.numeroGrupo = getGrupoNum(matchInternet);
          fija.isValid = true;
        }

        fija.plan = `Internet + Tel Fijo (CONSOLIDADO)`;

        // Sumar los importes reales facturados (Cuenta Internet + Línea Fija)
        const fijaAbonoInit = Number(fija.costo_abono_real ?? fija.abono ?? 0);
        const internetAbonoInit = Number(matchInternet.costo_abono_real ?? matchInternet.abono ?? 0);
        const combinedCostoAbono = Math.round((fijaAbonoInit + internetAbonoInit) * 100) / 100;

        const fijaExcInit = Number(fija.excedentes || 0);
        const internetExcInit = Number(matchInternet.excedentes || 0);
        const combinedExcedentes = Math.round((fijaExcInit + internetExcInit) * 100) / 100;

        const combinedMontoTotal = Math.round((combinedCostoAbono + combinedExcedentes) * 100) / 100;

        fija.costo_abono_real = combinedCostoAbono;
        fija.abono = combinedCostoAbono;
        fija.excedentes = combinedExcedentes;
        fija.montoFactura = combinedMontoTotal;
        fija.monto = combinedMontoTotal;

        // Recalcular métricas de auditoría para la línea fija con el nuevo abono neto consolidado
        if (fija.calculado) {
          const consumoUpdated = {
            ...fija,
            costo_abono_real: combinedCostoAbono,
            total_linea: combinedCostoAbono
          };
          const recalculated = calculateAuditLine(
            consumoUpdated,
            fija.lineas || fija,
            { providerId: 1, period: fija.periodo, tarifaAunar: fija.calculado?.tarifaAunar }
          );
          fija.calculado = recalculated.calculado;
          fija.baseAb = recalculated.calculado.baseAb;
          fija.cAdmin = recalculated.calculado.cAdmin;
          fija.cIVA = recalculated.calculado.cIVA;
          fija.totalCobrar = recalculated.calculado.totalCobrar;
        }

        matchInternet.isMerged = true;
      }
    });
  }

  // Filtrar ÚNICAMENTE las cuentas técnicas de internet fusionadas o de < 10 dígitos
  return resultados.filter(row => {
    const l = getLine(row);
    const esCuentaInternetTecnica = l && (l.length < 10 || l.startsWith('000'));
    return !row.isMerged && !esCuentaInternetTecnica;
  });
}
