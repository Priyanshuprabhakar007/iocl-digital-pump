import {z} from 'zod';
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

/** Editable setup metadata, stored separately from immutable 26-field Excel evidence.
 * Blank City/PIN and partial hierarchy are explicitly allowed during setup.
 */
export const pendingSetupValuesSchema=z.object({
  name:z.string().trim().min(1).max(200),
  outletType:z.union([z.enum(['COCO','CODO','A_SITE']),z.literal('')]),
  address:z.string().trim().min(1).max(1000),
  district:z.string().trim().min(1).max(120),
  stateId:z.string().trim().max(100),
  divisionId:z.string().trim().max(100),
  salesAreaId:z.string().trim().max(100),
  city:z.string().trim().max(120),
  pincode:z.string().trim().refine(v=>!v||/^\d{6}$/.test(v),'PIN must contain exactly 6 digits if entered'),
}).strict();
export const pendingSetupSaveSchema=z.object({
  values:pendingSetupValuesSchema,
  expectedRevision:z.number().int().min(0),
}).strict();
export type PendingSetupValues=z.infer<typeof pendingSetupValuesSchema>;
export type PendingSetupRecord={
  roCode:string;values:PendingSetupValues;revision:number;updatedAt:string;
};
