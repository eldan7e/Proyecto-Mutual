const normalizeText = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const digitsOnly = value => String(value || '').replace(/\D/g, '');

const isCbu = value => [21, 22].includes(digitsOnly(value).length);

const isAmount = value => {
  const normalized = String(value || '').replace(/[$\s]/g, '');
  return /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2}|,\d{2})$/.test(normalized) ||
    /^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(normalized);
};

const isResult = value => {
  const normalized = normalizeText(value);
  return /\bdeb(?:ito)?\.?\s*ok\b/.test(normalized) ||
    /^r\s*\d{1,3}\b/.test(normalized) ||
    /\b(rechaz|fondos|error|fall|insufic|aprobado|cobrado|procesado|exitoso)\b/.test(normalized);
};

const parseLooseLine = line => {
  const cbuMatch = line.match(/(?:\d[\s-]*){21}\d/);
  const amountMatch = line.match(/\$?\s*-?(?:\d{1,3}(?:[,.]\d{3})+|\d+)(?:[.,]\d{2})(?!\d)/);
  if (!cbuMatch || !amountMatch) return line.split(/\s{2,}/).map(cell => cell.trim());

  const prefix = line.slice(0, amountMatch.index).trim();
  const groupMatch = prefix.match(/^\D*(\d{1,6})\b/);
  const resultMatch = prefix.match(/\b(?:deb(?:ito)?\.?\s*ok|r\s*\d{1,3}|rechaz\w*|error|falta de fondos)\b/i);
  let name = prefix;
  if (groupMatch) name = name.slice(groupMatch.index + groupMatch[0].length).trim();
  if (resultMatch) {
    const resultStart = name.indexOf(resultMatch[0]);
    if (resultStart >= 0) name = name.slice(resultStart + resultMatch[0].length).trim();
  }

  return [
    groupMatch?.[1] || '',
    '',
    resultMatch?.[0] || '',
    name,
    amountMatch[0].trim(),
    cbuMatch[0].replace(/[\s-]/g, '')
  ];
};

const inferIndex = (rows, predicate, exclude = new Set()) => {
  const maxWidth = Math.max(0, ...rows.map(row => row.length));
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < maxWidth; index += 1) {
    if (exclude.has(index)) continue;
    const score = rows.reduce((count, row) => count + (predicate(row[index] || '') ? 1 : 0), 0);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return { index: bestIndex, score: bestScore };
};

export function detectDebitColumns(headers, rows) {
  const keys = headers || [];
  const data = rows || [];
  const normalizedKey = key => normalizeText(key).replace(/[^a-z0-9]+/g, ' ');
  const candidates = keys.filter(key => normalizedKey(key).includes('cbu'));
  const cbuCol = candidates
    .map(key => ({
      key,
      validCount: data.reduce((count, row) => count + (isCbu(row?.[key]) ? 1 : 0), 0),
      nonEmptyCount: data.reduce((count, row) => count + (String(row?.[key] || '').trim() ? 1 : 0), 0)
    }))
    .sort((a, b) => b.validCount - a.validCount || b.nonEmptyCount - a.nonEmptyCount)[0]?.key || '';
  const firstKeyMatching = predicate => keys.find(key => predicate(normalizedKey(key))) || '';

  return {
    cbuCol,
    montoCol: firstKeyMatching(key => /\b(monto|importe|debito|neto|total|valor|aunar)\b/.test(key)),
    idCol: firstKeyMatching(key => /\b(cuit|cuil|dni|documento|identificacion)\b/.test(key) && !key.includes('cbu')),
    estadoCol: firstKeyMatching(key => /\b(estado|resultado|status|motivo|rechazo|codigo|explicacion|result)\b/.test(key)),
    grupoCol: firstKeyMatching(key => /\b(grupo|gpo)\b/.test(key) && !/\b(email|correo|nombre)\b/.test(key))
  };
}

/** Keep a user-selected CBU column unless persisted/automatic mapping is clearly worse. */
export function resolveDebitColumns(headers, rows, selected = {}) {
  const detected = detectDebitColumns(headers, rows);
  const cbuCandidates = (headers || []).filter(key => normalizeText(key).includes('cbu'));
  const validCbuCount = key => key
    ? (rows || []).reduce((count, row) => count + (isCbu(row?.[key]) ? 1 : 0), 0)
    : 0;
  const selectedCbuCount = validCbuCount(selected.cbuCol);
  const detectedCbuCount = validCbuCount(detected.cbuCol);
  const cbuCol = detected.cbuCol && detectedCbuCount > selectedCbuCount
    ? detected.cbuCol
    : (cbuCandidates.includes(selected.cbuCol) ? selected.cbuCol : detected.cbuCol);

  return { ...detected, ...selected, cbuCol };
}

/** Liquidations available for a new debit reconciliation, excluding settled/zero-balance invoices. */
export function getPendingDebitLiquidations(liquidations) {
  return (liquidations || []).filter(liq => {
    const remaining = Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0);
    return liq && liq.estado_pago !== 'ABONADO' && remaining > 2.00;
  });
}

/** A debit may settle selected invoices only when it covers their full remaining balances (with optional cent rounding tolerance). */
export function debitCoversSelectedBalances(amount, liquidations, selectedIds, tolerance = 0) {
  const ids = [...new Set((selectedIds || []).map(String))];
  if (ids.length === 0) return false;
  const selected = (liquidations || []).filter(liq => ids.includes(String(liq?.liquidacion_id)));
  if (selected.length !== ids.length) return false;
  const remainingCents = selected.reduce((sum, liq) => {
    const balance = Math.max(0, Number(liq?.monto_total_facturado || 0) - Number(liq?.monto_abonado || 0));
    return sum + Math.round(balance * 100);
  }, 0);
  const debitCents = Math.round((Number(amount) || 0) * 100);
  const diffCents = remainingCents - debitCents;
  return diffCents <= Math.round((Number(tolerance) || 0) * 100);
}

/** Extracts the target period (YYYY-MM) from file name or row content (e.g. "PERIODO 09.2026", "2026-09 DEBITOS"). */
export function extractPeriodFromDebitFile(fileName = '', rows = []) {
  const cleanName = String(fileName || '');
  const fileMatch = cleanName.match(/(?:^|[^0-9])(20\d\d)[-_](0[1-9]|1[0-2])(?:[^0-9]|$)/);
  if (fileMatch) {
    return `${fileMatch[1]}-${fileMatch[2]}`;
  }

  if (Array.isArray(rows) && rows.length > 0) {
    const sample = rows.slice(0, 15);
    for (const r of sample) {
      if (!r || typeof r !== 'object') continue;
      for (const val of Object.values(r)) {
        if (!val) continue;
        const s = String(val).trim();
        const m1 = s.match(/(?:periodo|period)?\s*(0[1-9]|1[0-2])[\.\/-](20\d\d)/i);
        if (m1) {
          return `${m1[2]}-${m1[1]}`;
        }
        const m2 = s.match(/(20\d\d)[-\.\/](0[1-9]|1[0-2])/);
        if (m2) {
          return `${m2[1]}-${m2[2]}`;
        }
      }
    }
  }

  return null;
}

/** Parse a pasted debit file and infer columns from repeated row evidence. */
export function parseDebitText(text) {
  const parsedRows = String(text || '').split(/\r\n?|\n/)
    .filter(line => line.trim())
    .map(line => {
      if (line.includes('\t')) {
        return line.split('\t').map(cell => cell.trim().replace(/^"(.*)"$/, '$1'));
      }
      return parseLooseLine(line);
    });

  if (parsedRows.length === 0) return { headers: [], dataRows: [] };

  const firstRow = parsedRows[0];
  const evidenceRows = parsedRows.slice(0, Math.min(parsedRows.length, 30));
  const maxWidth = Math.max(0, ...parsedRows.map(row => row.length));
  const firstRowHasData = firstRow.some(cell => isCbu(cell) || isAmount(cell) || isResult(cell));
  const headerHints = /\b(cbu|importe|monto|grupo|gpo|estado|resultado|status|nombre|socio|debito|cuit|cuil|dni|identificacion)\b/;
  const isHeaderRow = !firstRowHasData && firstRow.some(cell => headerHints.test(normalizeText(cell)));

  if (isHeaderRow) {
    return {
      headers: Array.from({ length: maxWidth }, (_, index) => firstRow[index]?.trim() || `Columna ${index + 1}`),
      dataRows: parsedRows.slice(1)
    };
  }

  const cbu = inferIndex(evidenceRows, isCbu);
  const amount = inferIndex(evidenceRows, isAmount, new Set([cbu.index]));
  const result = inferIndex(evidenceRows, isResult, new Set([cbu.index, amount.index]));
  const group = inferIndex(evidenceRows, value => /^\d{1,6}$/.test(String(value).trim()), new Set([cbu.index, amount.index, result.index]));
  const excluded = new Set([cbu.index, amount.index, result.index, group.index]);
  const name = inferIndex(evidenceRows, value => /[a-z]/i.test(String(value)) && !isCbu(value) && !isAmount(value) && !isResult(value), excluded);

  const headers = Array.from({ length: maxWidth }, (_, index) => {
    const sample = firstRow[index] ? ` (${String(firstRow[index]).trim().slice(0, 12)})` : '';
    return `Columna ${index + 1}${sample}`;
  });
  if (group.index >= 0) headers[group.index] = 'Grupo';
  if (result.index >= 0) headers[result.index] = 'Resultado';
  if (name.index >= 0) headers[name.index] = 'Nombre';
  if (amount.index >= 0) headers[amount.index] = 'Importe';
  if (cbu.index >= 0) headers[cbu.index] = 'CBU';

  return { headers, dataRows: parsedRows };
}
