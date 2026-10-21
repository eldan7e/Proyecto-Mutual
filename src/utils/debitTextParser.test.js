import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDebitColumns, parseDebitText } from './debitTextParser.js';

const sampleLine = '139\t\tDeb. Ok\tFisher, Maria Agustina\t$ 39,690.82\t0140999803200053715709';

test('infers debit columns from tab-separated rows without headers', () => {
  const { headers, dataRows } = parseDebitText(`${sampleLine}\n197\t\tR10\tBarrosa, Monica\t$ 18,048.72\t0140303703694953818439`);

  assert.equal(dataRows.length, 2);
  assert.equal(headers[0], 'Grupo');
  assert.equal(headers[2], 'Resultado');
  assert.equal(headers[3], 'Nombre');
  assert.equal(headers[4], 'Importe');
  assert.equal(headers[5], 'CBU');
});

test('detects columns when first row has missing values and CBU contains spaces', () => {
  const text = [
    '139\t\tDeb. Ok\tFisher, Maria Agustina\t\t',
    '197\t\tDeb. Ok\tBarrosa, Monica\t$ 18,048.72\t014030370369 4953818439'
  ].join('\n');
  const { headers, dataRows } = parseDebitText(text);

  assert.equal(dataRows.length, 2);
  assert.equal(headers[0], 'Grupo');
  assert.equal(headers[2], 'Resultado');
  assert.equal(headers[4], 'Importe');
  assert.equal(headers[5], 'CBU');
});

test('parses whitespace-separated debit rows', () => {
  const line = '139   Deb. Ok   Fisher, Maria Agustina   $ 39,690.82   0140999803200053715709';
  const { headers, dataRows } = parseDebitText(line);

  assert.equal(dataRows.length, 1);
  assert.equal(headers[0], 'Grupo');
  assert.equal(headers[2], 'Resultado');
  assert.equal(headers[4], 'Importe');
  assert.equal(headers[5], 'CBU');
  assert.equal(dataRows[0][4], '$ 39,690.82');
});

test('keeps explicit headers and excludes the header row from data', () => {
  const { headers, dataRows } = parseDebitText(
    'Grupo\tResultado\tNombre\tImporte\tCBU\n139\tDeb. Ok\tSocio Ejemplo\t$ 39,690.82\t0140999803200053715709'
  );

  assert.deepEqual(headers, ['Grupo', 'Resultado', 'Nombre', 'Importe', 'CBU']);
  assert.equal(dataRows.length, 1);
});

test('selects the CBU column by its values when another CBU-named column contains OK flags', () => {
  const headers = ['CBU 22 DIG_1', 'CBU 22 DIG', 'IMPORTE $', 'RESULT', 'GRUPO NRO'];
  const rows = [
    { 'CBU 22 DIG_1': 'OK', 'CBU 22 DIG': '0140999803200053715709', 'IMPORTE $': '$ 39,690.82', RESULT: 'Deb. Ok', 'GRUPO NRO': 139 },
    { 'CBU 22 DIG_1': 'OK', 'CBU 22 DIG': '0140303703694953818439', 'IMPORTE $': '$ 18,048.72', RESULT: 'Deb. Ok', 'GRUPO NRO': '197' }
  ];

  const columns = detectDebitColumns(headers, rows);
  assert.equal(columns.cbuCol, 'CBU 22 DIG');
  assert.equal(columns.montoCol, 'IMPORTE $');
  assert.equal(columns.estadoCol, 'RESULT');
  assert.equal(columns.grupoCol, 'GRUPO NRO');
  assert.equal(columns.idCol, '');
});
