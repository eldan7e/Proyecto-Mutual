import assert from 'node:assert/strict';
import test from 'node:test';
import { debitCoversSelectedBalances, detectDebitColumns, extractPeriodFromDebitFile, getPendingDebitLiquidations, isDebitRowValid, parseDebitText, resolveDebitColumns } from './debitTextParser.js';

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

test('replaces a persisted CBU mapping that points to an OK/status column', () => {
  const headers = ['CBU 22 DIG_1', 'CBU 22 DIG', 'IMPORTE $', 'RESULT', 'GRUPO NRO'];
  const rows = [
    { 'CBU 22 DIG_1': 'OK', 'CBU 22 DIG': '0140999803200053715709', 'IMPORTE $': '$ 39,690.82', RESULT: 'Deb. Ok', 'GRUPO NRO': 139 }
  ];

  const mapping = resolveDebitColumns(headers, rows, { cbuCol: 'CBU 22 DIG_1', montoCol: 'IMPORTE $' });
  assert.equal(mapping.cbuCol, 'CBU 22 DIG');
  assert.equal(mapping.montoCol, 'IMPORTE $');
});

test('does not offer already settled invoices for a new debit reconciliation', () => {
  const pending = getPendingDebitLiquidations([
    { liquidacion_id: 1, monto_total_facturado: 100, monto_abonado: 100, estado_pago: 'ABONADO' },
    { liquidacion_id: 2, monto_total_facturado: 100, monto_abonado: 99.99, estado_pago: 'PARCIAL' },
    { liquidacion_id: 3, monto_total_facturado: 100, monto_abonado: 20, estado_pago: 'PARCIAL' }
  ]);

  assert.deepEqual(pending.map(liq => liq.liquidacion_id), [3]);
});

test('only marks a debit ready when it covers the selected invoice balances', () => {
  const invoices = [
    { liquidacion_id: 1, monto_total_facturado: 100, monto_abonado: 25 },
    { liquidacion_id: 2, monto_total_facturado: 50, monto_abonado: 0 }
  ];

  assert.equal(debitCoversSelectedBalances(75, invoices, ['1']), true);
  assert.equal(debitCoversSelectedBalances(74.99, invoices, ['1']), false);
  assert.equal(debitCoversSelectedBalances(125, invoices, ['1', '2']), true);
  assert.equal(debitCoversSelectedBalances(75, invoices, ['1', '2']), false);
});

test('tolerates minor cent rounding discrepancies when tolerance is provided', () => {
  const invoices = [
    { liquidacion_id: 1, monto_total_facturado: 34388.18, monto_abonado: 0 },
    { liquidacion_id: 2, monto_total_facturado: 25306.85, monto_abonado: 0 }
  ];
  // Total is 59695.03, debit is 59695.01 (2 cents difference)
  assert.equal(debitCoversSelectedBalances(59695.01, invoices, ['1', '2']), false);
  assert.equal(debitCoversSelectedBalances(59695.01, invoices, ['1', '2'], 0.05), true);
});

test('extracts period from filename or row content', () => {
  assert.equal(extractPeriodFromDebitFile('2026-09 DEBITOS (09) (VTO OCTUBRE 2026).xlsx'), '2026-09');
  assert.equal(extractPeriodFromDebitFile('DEBITOS_2026_08.csv'), '2026-08');
  assert.equal(extractPeriodFromDebitFile('archivo_sin_fecha.xlsx', [
    { LEYENDA: 'PERIODO 09.2026', SOCIO: 'Test' }
  ]), '2026-09');
  // Row with bank execution date in October (mes vencido -> factura de septiembre)
  assert.equal(extractPeriodFromDebitFile('extracto_debitos.csv', [
    { FECHA: '13/10/2026', CBU: '0140999803200053715709', MONTO: '15000' }
  ]), '2026-09');
});

test('isDebitRowValid filters out rows without CBU or socio data, or with zero amount', () => {
  const mapping = {
    cbuCol: 'CBU EN 22 OK',
    montoCol: 'IMPORTE $',
    idCol: 'CUIT AUNAR',
    estadoCol: 'RESULT',
    grupoCol: 'GRUPO NRO'
  };

  // Valid row: CBU + socio name + amount
  const validRow1 = {
    'CBU EN 22 OK': '0110881930088100203515',
    'IMPORTE $': '$15.465,43',
    'CUIT AUNAR': '30708841656',
    'GRUPO NRO': '120',
    'RESULT': 'Deb. Ok',
    'SOCIO': 'Galante, Melina'
  };
  assert.equal(isDebitRowValid(validRow1, mapping), true);

  // Valid row: CBU + amount, no socio name in excel
  const validRow2 = {
    'CBU EN 22 OK': '0070105730004899205349',
    'IMPORTE $': '59151.27',
    'GRUPO NRO': '121'
  };
  assert.equal(isDebitRowValid(validRow2, mapping), true);

  // Junk row: like row 122 from user screenshot (no CBU, no socio data, 0 amount)
  const junkRow122 = {
    'CBU EN 22 OK': '',
    'IMPORTE $': '0',
    'CUIT AUNAR': '',
    'GRUPO NRO': '',
    'SOCIO': ''
  };
  assert.equal(isDebitRowValid(junkRow122, mapping), false);

  // Junk row with $0.00 and S/C
  const junkRowSC = {
    'CBU EN 22 OK': 'S/C',
    'IMPORTE $': '$0,00',
    'SOCIO': 'Desconocido'
  };
  assert.equal(isDebitRowValid(junkRowSC, mapping), false);

  // Summary row: "TOTAL GENERAL" with amount but no CBU and no socio data
  const summaryRow = {
    'IMPORTE $': '$ 4.460.405,39',
    'SOCIO': 'TOTAL GENERAL',
    'CBU EN 22 OK': ''
  };
  assert.equal(isDebitRowValid(summaryRow, mapping), false);
});

