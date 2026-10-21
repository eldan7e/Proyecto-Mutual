import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreviousPeriod, resolveDebitInvoicePeriod } from './debitInvoicePeriod.js';

test('resolves an October bank debit to the pending October invoice for its group', () => {
  const period = resolveDebitInvoicePeriod({
    bankDate: '2026-10-13',
    selectedPeriod: '2026-09',
    groupNumber: 218,
    liquidations: [{
      liquidacion_id: 25962,
      numero_grupo: 218,
      periodo: '2026-10',
      monto_total_facturado: 169273.22,
      monto_abonado: 0,
      estado_pago: 'PENDIENTE'
    }]
  });

  assert.equal(period, '2026-10');
});

test('prefers the bank month when both bank and selected periods have debt', () => {
  const period = resolveDebitInvoicePeriod({
    bankDate: '2026-10-13',
    selectedPeriod: '2026-09',
    groupNumber: 218,
    liquidations: [
      { numero_grupo: 218, periodo: '2026-10', monto_total_facturado: 169273.22, monto_abonado: 0, estado_pago: 'PENDIENTE' },
      { numero_grupo: 218, periodo: '2026-09', monto_total_facturado: 169273.22, monto_abonado: 0, estado_pago: 'PENDIENTE' }
    ]
  });

  assert.equal(period, '2026-10');
});

test('uses the selected period when the bank month has no debt for this group', () => {
  const period = resolveDebitInvoicePeriod({
    bankDate: '13/10/2026',
    selectedPeriod: '2026-10',
    groupNumber: 218,
    liquidations: [{
      numero_grupo: 218,
      periodo: '2026-09',
      monto_total_facturado: 169273.22,
      monto_abonado: 169273.22,
      estado_pago: 'ABONADO'
    }]
  });

  assert.equal(period, '2026-10');
});

test('falls back to selected period when there is no bank movement date', () => {
  assert.equal(resolveDebitInvoicePeriod({ selectedPeriod: '2026-09' }), '2026-09');
});

test('handles year boundaries when finding the previous period', () => {
  assert.equal(getPreviousPeriod('2027-01'), '2026-12');
});
