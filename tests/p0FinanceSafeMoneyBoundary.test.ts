import { describe, expect, it } from 'vitest';
import {
  formatPaiseToMoney,
  checkedMoneyAdd,
  calculateRevenuePaise,
  parseMoneyToPaise,
} from '../src/shared/financialUtils';

describe('P0 Finance — safe money boundaries', () => {
  it('preserves exact paise for representative daily collections and refunds', () => {
    for (const paise of [0, 1, 99, 100, 101, -1, -99, -100, 123456789, -123456789]) {
      const formatted = formatPaiseToMoney(paise);
      const abs = parseMoneyToPaise(formatted.replace('-', ''));
      expect(formatted.startsWith('-') ? -abs : abs).toBe(paise);
    }
  });

  it('rejects unsafe integer amounts rather than silently formatting rounded totals', () => {
    expect(() => formatPaiseToMoney(Number.MAX_SAFE_INTEGER + 1)).toThrow('INVALID_PAISE_VALUE');
    expect(() => formatPaiseToMoney(-(Number.MAX_SAFE_INTEGER + 1))).toThrow('INVALID_PAISE_VALUE');
    expect(() => formatPaiseToMoney(Number.POSITIVE_INFINITY)).toThrow('INVALID_PAISE_VALUE');
    expect(() => formatPaiseToMoney(0.5)).toThrow('INVALID_PAISE_VALUE');
  });

  it('keeps money totals checked and revenue calculations deterministic', () => {
    expect(checkedMoneyAdd(100000, -250, 1250)).toBe(101000);
    expect(calculateRevenuePaise(1250, 10000)).toBe(12500);
    expect(() => checkedMoneyAdd(Number.MAX_SAFE_INTEGER, 1)).toThrow('FINANCIAL_AMOUNT_OVERFLOW');
  });
});
