/**
 * Stage 01R — source-snapshot comparison contract.
 *
 * PURE / NOT WIRED TO ROUTES. A successful comparison is only a prerequisite
 * for a future atomic DB-side version fence. This cannot prevent writes
 * between this check and a later database transaction.
 */
export type SourceCollection =
  | 'meter_readings'
  | 'tank_stock_readings'
  | 'fuel_receipts'
  | 'fuel_receipt_lines'
  | 'financial_inputs'
  | 'price_snapshots'
  | 'shift_nozzle_snapshots'
  | 'shift_tank_snapshots'
  | 'calibration_references';

export interface SourceRow {
  id: string;
  /** Captures every field used to compute reconciliation, including versions. */
  values: Record<string, unknown>;
}

export type SourceSnapshot = Record<SourceCollection, readonly SourceRow[]>;
export type FenceResult =
  | { safeToProceedToAtomicFence: true; changedCollections: [] }
  | { safeToProceedToAtomicFence: false; changedCollections: SourceCollection[] };

export const COLLECTIONS: readonly SourceCollection[] = [
  'meter_readings', 'tank_stock_readings', 'fuel_receipts',
  'fuel_receipt_lines', 'financial_inputs', 'price_snapshots',
  'shift_nozzle_snapshots', 'shift_tank_snapshots', 'calibration_references',
] as const;

function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Invalid numeric source value; use exact integer units');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    if (entries.some(([, v]) => v === undefined)) throw new Error('Undefined source field');
    return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  }
  throw new Error('Unsupported source field type');
}

function canonicalRows(rows: readonly SourceRow[]): string {
  if (!Array.isArray(rows)) throw new Error('Missing source collection');
  const keys = new Set<string>();
  const entries: string[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id.trim() ||
        keys.has(row.id) || !row.values || Array.isArray(row.values) ||
        typeof row.values !== 'object') {
      throw new Error('Invalid/duplicate source row identifier or values');
    }
    keys.add(row.id);
    entries.push(JSON.stringify(row.id) + ':' + canonical(row.values));
  }
  entries.sort();
  return entries.join('|');
}

export function compareCloseSourceSnapshots(
  before: SourceSnapshot,
  after: SourceSnapshot,
): FenceResult {
  if (!before || !after) throw new Error('Both source snapshots required');
  // Validate all collections before returning a positive result.
  const changed: SourceCollection[] = [];
  for (const name of COLLECTIONS) {
    const beforeRows = canonicalRows(before[name]);
    const afterRows = canonicalRows(after[name]);
    if (beforeRows !== afterRows) changed.push(name);
  }
  return changed.length
    ? { safeToProceedToAtomicFence: false, changedCollections: changed }
    : { safeToProceedToAtomicFence: true, changedCollections: [] };
}
