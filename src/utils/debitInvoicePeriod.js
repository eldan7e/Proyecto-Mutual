export function getPreviousPeriod(period) {
  const match = String(period || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getPeriodFromDate(dateValue) {
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
  const prevBankPeriod = bankPeriod ? getPreviousPeriod(bankPeriod) : '';
  const groupSet = new Set((groupNumber ? [groupNumber] : socioGroups).map(Number));
  
  const hasDebtInPeriod = period => period && (liquidations || []).some(liq =>
    liq && groupSet.has(Number(liq.numero_grupo)) && liq.periodo === period &&
    liq.estado_pago !== 'ABONADO' &&
    Number(liq.monto_total_facturado || 0) - Number(liq.monto_abonado || 0) > 2.00
  );

  // 1. PRIORIDAD MÁXIMA: Si el usuario seleccionó un período explícito en la UI (ej. '2026-09') y tiene deuda, respetar ese período
  if (hasDebtInPeriod(selectedPeriod)) return selectedPeriod;

  // 2. Facturación a mes vencido: los cobros bancarios del mes M (ej. Octubre 2026-10) pagan las facturas de consumo del mes M-1 (ej. Septiembre 2026-09)
  if (hasDebtInPeriod(prevBankPeriod)) return prevBankPeriod;

  // 3. Fallback: si no hay deuda en el mes vencido pero sí en el mes calendario del banco
  if (hasDebtInPeriod(bankPeriod)) return bankPeriod;

  // 4. Default si no hay deuda pendiente detectada:
  // Priorizar el período seleccionado por el usuario, luego el mes vencido, y por último el mes bancario
  return selectedPeriod || prevBankPeriod || bankPeriod;
}
