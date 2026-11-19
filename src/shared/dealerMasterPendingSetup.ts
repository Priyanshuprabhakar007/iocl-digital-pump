import type { DealerDraftRow } from './dealerMasterDraft';

/**
 * Read-only projection of draft source rows against the COMPLETE live directory,
 * including archived/hidden RO Codes. Does not write to operational storage.
 * Never misreport invalid or duplicate source rows as existing matches.
 */
export function reconcilePendingDealerRows(
  sourceRows: readonly DealerDraftRow[],
  existingRoCodes: ReadonlySet<string>,
): {
  pendingRows: DealerDraftRow[];
  existingMatches: number;
  invalidRows: number;
  duplicateRows: number;
} {
  const knownCodes = new Set([...existingRoCodes].map(code => code.trim()));
  const seenCodes = new Set<string>();
  const pendingRows: DealerDraftRow[] = [];
  let existingMatches = 0;
  let invalidRows = 0;
  let duplicateRows = 0;

  for (const row of sourceRows) {
    const code = row.roCode.trim();
    if (!/^\d{4,12}$/.test(code)) {
      invalidRows++;
      continue;
    }
    if (seenCodes.has(code)) {
      duplicateRows++;
      continue;
    }
    seenCodes.add(code);
    if (knownCodes.has(code)) {
      existingMatches++;
    } else {
      pendingRows.push(row);
    }
  }

  return { pendingRows, existingMatches, invalidRows, duplicateRows };
}
