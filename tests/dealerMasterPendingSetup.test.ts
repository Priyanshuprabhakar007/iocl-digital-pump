import { describe, expect, test } from 'vitest';
import type { DealerDraftRow } from '../src/shared/dealerMasterDraft';
import { reconcilePendingDealerRows } from '../src/shared/dealerMasterPendingSetup';

const record = (code: string): DealerDraftRow => ({
  sourceRow: 2, roCode: code, fields: { CUSTCODE: code },
  city: '', pincode: '', yellowHeaders: [],
});

describe('Pending Setup source-to-directory reconciliation', () => {
  test('131 saved source rows, 6 existing, yields 125 pending', () => {
    const source = Array.from({ length: 131 }, (_, index) => record(String(100000 + index)));
    const existing = new Set(source.slice(0, 6).map(row => row.roCode));
    const result = reconcilePendingDealerRows(source, existing);
    expect(result.pendingRows).toHaveLength(125);
    expect(result.existingMatches).toBe(6);
    expect(result.invalidRows).toBe(0);
    expect(result.duplicateRows).toBe(0);
  });

  test('accepts real numeric RO Codes, not an escaped regular expression', () => {
    expect(reconcilePendingDealerRows([record('373196')], new Set()).pendingRows)
      .toHaveLength(1);
  });

  test('excludes already-existing RO Codes including archived/hidden entries in the supplied directory', () => {
    const result = reconcilePendingDealerRows(
      [record('394355'), record('102790')],
      new Set(['394355']),
    );
    expect(result.pendingRows.map(row => row.roCode)).toEqual(['102790']);
    expect(result.existingMatches).toBe(1);
  });

  test('counts invalid and repeated source rows separately, never as existing matches', () => {
    const result = reconcilePendingDealerRows(
      [record('123456'), record('123456'), record('ABCD'), record('123457')],
      new Set(['123457']),
    );
    expect(result.pendingRows.map(row => row.roCode)).toEqual(['123456']);
    expect(result.existingMatches).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
  });
});
