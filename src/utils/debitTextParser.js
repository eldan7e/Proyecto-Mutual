const normalizeText = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const digitsOnly = value => String(value || '').replace(/\D/g, '');

const isCbu = value => digitsOnly(value).length === 22;

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
