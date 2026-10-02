/**
 * Utility precision and money calculation helpers for Phase 4A Electricity & Sub-meter operations.
 *
 * Rules:
 * - Electricity meter readings are stored as integer milli-kWh (1 kWh = 1000 milli-kWh).
 * - Money is stored as integer paise (1 INR = 100 paise).
 * - All calculations avoid floating-point errors by using checked BigInt/integer arithmetic.
 * - Half-up rounding is applied when converting (consumptionMilliKwh * ratePaisePerKwh) / 1000 to chargePaise.
 */

const MAX_SAFE_PAISE = 9_000_000_000_000_000; // Safe integer boundary within Number.MAX_SAFE_INTEGER
const MAX_SAFE_MILLIKWH = 9_000_000_000_000_000;

/**
 * Parses a decimal string (up to 3 decimal places) into integer milli-kWh.
 * Examples:
 * - "1" -> 1000
 * - "123.456" -> 123456
 * - "0.5" -> 500
 * - "0.05" -> 50
 * - "0.005" -> 5
 */
export function parseMilliKwh(val: string | number): number {
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || isNaN(val) || val < 0 || !Number.isInteger(val)) {
      throw new Error('INVALID_MILLIKWH_NUMBER');
    }
    return val;
  }

  if (typeof val !== 'string') {
    throw new Error('INVALID_MILLIKWH_INPUT');
  }

  const trimmed = val.trim();
  if (!trimmed || trimmed === '') {
    throw new Error('EMPTY_MILLIKWH_STRING');
  }

  // Regex strictly matching non-negative numbers with up to 3 decimal places
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) {
    throw new Error('INVALID_MILLIKWH_FORMAT');
  }

  const parts = trimmed.split('.');
  const wholeStr = parts[0];
  const fracStr = parts[1] || '';

  const whole = parseInt(wholeStr, 10);
  if (!Number.isSafeInteger(whole)) {
    throw new Error('MILLIKWH_OVERFLOW');
  }

  const paddedFrac = fracStr.padEnd(3, '0');
  const frac = parseInt(paddedFrac, 10);

  const total = whole * 1000 + frac;
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_SAFE_MILLIKWH) {
    throw new Error('MILLIKWH_OVERFLOW');
  }

  return total;
}

/**
 * Formats integer milli-kWh to decimal string with 3 decimal places.
 * Example: 123456 -> "123.456", 0 -> "0.000"
 */
export function formatMilliKwh(milliKwh: number | null | undefined): string {
  if (milliKwh === null || milliKwh === undefined || isNaN(milliKwh) || milliKwh < 0) {
    return '0.000';
  }
  const whole = Math.floor(milliKwh / 1000);
  const frac = milliKwh % 1000;
  return `${whole}.${frac.toString().padStart(3, '0')}`;
}

/**
 * Parses a money string with up to 2 decimal places to integer paise.
 * Examples:
 * - "100" -> 10000
 * - "84500.50" -> 8450050
 * - "0.05" -> 5
 */
export function parseMoneyToPaise(val: string | number): number {
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || isNaN(val) || val < 0 || !Number.isInteger(val)) {
      throw new Error('INVALID_MONEY_NUMBER');
    }
    return val;
  }

  if (typeof val !== 'string') {
    throw new Error('INVALID_MONEY_INPUT');
  }

  const trimmed = val.trim();
  if (!trimmed || trimmed === '') {
    throw new Error('EMPTY_MONEY_STRING');
  }

  // Regex strictly matching non-negative money with up to 2 decimal places
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('INVALID_MONEY_FORMAT');
  }

  const parts = trimmed.split('.');
  const wholeStr = parts[0];
  const fracStr = parts[1] || '';

  const whole = parseInt(wholeStr, 10);
  if (!Number.isSafeInteger(whole)) {
    throw new Error('MONEY_OVERFLOW');
  }

  const paddedFrac = fracStr.padEnd(2, '0');
  const frac = parseInt(paddedFrac, 10);

  const total = whole * 100 + frac;
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_SAFE_PAISE) {
    throw new Error('MONEY_OVERFLOW');
  }

  return total;
}

/**
 * Formats integer paise to decimal INR string with 2 decimal places.
 * Example: 8450050 -> "84500.50", 0 -> "0.00"
 */
export function formatPaiseToMoney(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || isNaN(paise) || paise < 0) {
    return '0.00';
  }
  const whole = Math.floor(paise / 100);
  const frac = paise % 100;
  return `${whole}.${frac.toString().padStart(2, '0')}`;
}

/**
 * Computes sub-meter electricity charge in paise from consumption in milli-kWh and rate in paise/kWh.
 * Formula:
 *   chargePaise = roundHalfUp(consumptionMilliKwh * ratePaisePerKwh / 1000)
 * Checked BigInt arithmetic is used to guarantee no floating point drift or overflow.
 */
export function calculateSubMeterChargePaise(
  consumptionMilliKwh: number,
  ratePaisePerKwh: number
): number {
  if (consumptionMilliKwh < 0 || ratePaisePerKwh < 0) {
    throw new Error('INVALID_NEGATIVE_CHARGE_INPUT');
  }
  if (!Number.isSafeInteger(consumptionMilliKwh) || !Number.isSafeInteger(ratePaisePerKwh)) {
    throw new Error('UTILITY_CHARGE_OVERFLOW');
  }

  if (consumptionMilliKwh === 0 || ratePaisePerKwh === 0) {
    return 0;
  }

  const c = BigInt(consumptionMilliKwh);
  const r = BigInt(ratePaisePerKwh);
  const numerator = c * r;

  // Round half-up: (numerator + 500) / 1000
  const resultBigInt = (numerator + 500n) / 1000n;

  if (resultBigInt > BigInt(MAX_SAFE_PAISE)) {
    throw new Error('UTILITY_CHARGE_OVERFLOW');
  }

  return Number(resultBigInt);
}
