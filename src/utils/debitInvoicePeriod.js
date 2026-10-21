export function getPreviousPeriod(period) {
  const match = String(period || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodFromDate(dateValue) {
  const value = String(dateValue || '').trim();
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
  const localMatch = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4}|\d{2})$/);
  if (!localMatch) return '';
  const year = localMatch[3].length === 2 ? `20${localMatch[3]}` : localMatch[3];
  return `${year}-${localMatch[2]}`;
}

export function resolveDebitInvoicePeriod({ bankDate, selectedPeriod, groupNumber, socioGroups = [], liquidations = [] }) {
  const bankPeriod = getPeriodFromDate(bankDate);
  if (!bankPeriod) return selectedPeriod || '';

  const previousPeriod = getPreviousPeriod(bankPeriod);
  const groupSet = new Set((groupNumber ? [groupNumber] : socioGroups).map(Number));
  const hasPreviousDebt = previousPeriod && (liquidations || []).some(liq =>
    liq && groupSet.has(Number(liq.numero_grupo)) && liq.periodo === previousPeriod &&
    liq.estado_pago !== 'ABONADO' &&
    Number(liq.monto_total_facturado || 0) - Number(liq.monto_abonado || 0) > 2.00
  );

  return hasPreviousDebt ? previousPeriod : (selectedPeriod || bankPeriod);
}
