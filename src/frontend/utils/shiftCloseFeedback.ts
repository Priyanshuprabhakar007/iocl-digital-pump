/**
 * Presentation only. An API error does not always mean a shift is still OPEN:
 * finalization can succeed before a downstream audit response fails.
 *
 * Do not change close/financial policy or assume any mutation was rolled back.
 */
const definitivelyRejectedCodes = new Set([
  'INCOMPLETE_TANK_STOCK_DATA',
  'INCOMPLETE_SHIFT_READINGS',
  'INCOMPLETE_CNG_DATA',
  'CNG_PRICE_SNAPSHOT_UNAVAILABLE',
  'CNG_PRICE_SNAPSHOT_AMBIGUOUS',
  'VARIANCE_REASON_REQUIRED',
  'PRICE_SNAPSHOT_MISSING',
  'FINANCIAL_AMOUNT_OVERFLOW',
  'FORBIDDEN',
  'VALIDATION_ERROR',
]);

export function getShiftCloseErrorGuidance(
  error?: { code?: string; message?: string } | null,
): string {
  const message = error?.message?.trim();
  const code = error?.code || '';

  if (definitivelyRejectedCodes.has(code)) {
    return message || 'Shift closure was rejected. Review the required readings and reconciliation.';
  }

  const prefix = message ? message.replace(/[.\s]+$/, '') + '. ' : '';
  return (
    prefix +
    'The close status may be uncertain. Use Refresh to check whether the shift is OPEN, CLOSING or CLOSED before retrying.'
  );
}
