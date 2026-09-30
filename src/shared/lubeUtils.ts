import { LubeStockUnit } from './types';

export function parseLubeQuantity(unit: LubeStockUnit, value: string): number {
  if (typeof value !== 'string') {
    throw new Error('INVALID_QUANTITY_FORMAT');
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error('INVALID_QUANTITY_FORMAT');
  }

  if (unit === 'PACK') {
    // Strict non-negative integer string
    if (!/^\d+$/.test(trimmed)) {
      throw new Error('INVALID_PACK_QUANTITY_FORMAT');
    }
    const val = BigInt(trimmed);
    if (val > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('QUANTITY_OVERFLOW');
    }
    return Number(val);
  }

  if (unit === 'LITRE') {
    // Strict non-negative decimal string, at most 3 decimal places
    if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) {
      throw new Error('INVALID_LITRE_QUANTITY_FORMAT');
    }
    const [wholePart, fracPart = ''] = trimmed.split('.');
    const paddedFrac = fracPart.padEnd(3, '0');
    const subunits = BigInt(wholePart) * 1000n + BigInt(paddedFrac);
    if (subunits > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('QUANTITY_OVERFLOW');
    }
    return Number(subunits);
  }

  throw new Error('INVALID_STOCK_UNIT');
}

export function formatLubeQuantity(unit: LubeStockUnit, subunits: number): string {
  if (!Number.isSafeInteger(subunits) || subunits < 0) {
    throw new Error('INVALID_SUBUNITS_VALUE');
  }

  if (unit === 'PACK') {
    return subunits.toString();
  }

  if (unit === 'LITRE') {
    const whole = Math.floor(subunits / 1000);
    const fraction = (subunits % 1000).toString().padStart(3, '0');
    return `${whole}.${fraction}`;
  }

  throw new Error('INVALID_STOCK_UNIT');
}

export function calculateLubeRevenuePaise(unit: LubeStockUnit, quantitySubunits: number, pricePaisePerUnit: number): number {
  if (
    !Number.isSafeInteger(quantitySubunits) ||
    !Number.isSafeInteger(pricePaisePerUnit) ||
    quantitySubunits < 0 ||
    pricePaisePerUnit < 0
  ) {
    throw new Error('INVALID_INPUT_VALUES');
  }

  if (unit === 'PACK') {
    const revenueBig = BigInt(quantitySubunits) * BigInt(pricePaisePerUnit);
    if (revenueBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('FINANCIAL_AMOUNT_OVERFLOW');
    }
    return Number(revenueBig);
  }

  if (unit === 'LITRE') {
    const numerator = BigInt(quantitySubunits) * BigInt(pricePaisePerUnit);
    const quotient = numerator / 1000n;
    const remainder = numerator % 1000n;
    let revenuePaise = quotient;
    if (remainder >= 500n) {
      revenuePaise += 1n;
    }
    if (revenuePaise > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('FINANCIAL_AMOUNT_OVERFLOW');
    }
    return Number(revenuePaise);
  }

  throw new Error('INVALID_STOCK_UNIT');
}

export function checkedSafeIntegerAdd(
  a: number,
  b: number,
  overflowError: 'FINANCIAL_AMOUNT_OVERFLOW' | 'QUANTITY_OVERFLOW' = 'FINANCIAL_AMOUNT_OVERFLOW'
): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new Error(overflowError);
  }
  const sum = BigInt(a) + BigInt(b);
  if (sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(overflowError);
  }
  return Number(sum);
}
