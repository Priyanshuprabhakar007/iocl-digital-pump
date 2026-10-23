export interface MasterDiagnosticConflict {
  table: 'hr_designations' | 'shift_templates';
  normalizedCode: string;
  reason: string;
  outletIds: string[];
  sampleRows: Record<string, any>[];
}

export interface MasterDiagnosticReport {
  hasConflicts: boolean;
  checkedAt: string;
  designationConflicts: MasterDiagnosticConflict[];
  shiftConflicts: MasterDiagnosticConflict[];
}

function queryAll(sqlite: any, sqlQuery: string, ...params: any[]): any[] {
  if (typeof sqlite.prepare === 'function') {
    return sqlite.prepare(sqlQuery).all(...params);
  }
  if (typeof sqlite.query === 'function') {
    return sqlite.query(sqlQuery).all(...params);
  }
  return [];
}

function tableExists(sqlite: any, tableName: string): boolean {
  const rows = queryAll(
    sqlite,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    tableName
  );
  return rows.length > 0;
}

/**
 * Checks for conflicting definitions across outlets for the same code in hr_designations.
 * Two designations with the same normalized code are conflicting if:
 * - Names differ (case-insensitive trimmed)
 * - skillCategory differs
 * - status differs
 */
export function detectDesignationConflicts(sqlite: any): MasterDiagnosticConflict[] {
  if (!tableExists(sqlite, 'hr_designations')) {
    return [];
  }

  const conflicts: MasterDiagnosticConflict[] = [];

  // Group by normalized code
  const groups = queryAll(
    sqlite,
    `SELECT
       UPPER(TRIM(code)) as normalized_code,
       COUNT(*) as cnt,
       GROUP_CONCAT(id) as ids,
       GROUP_CONCAT(outlet_id) as outlet_ids,
       GROUP_CONCAT(name) as names
     FROM hr_designations
     GROUP BY UPPER(TRIM(code))
     HAVING COUNT(*) > 1`
  ) as Array<{
    normalized_code: string;
    cnt: number;
    ids: string;
    outlet_ids: string;
    names: string;
  }>;

  for (const group of groups) {
    const rows = queryAll(
      sqlite,
      `SELECT id, outlet_id, code, name, skill_category, status, notes
       FROM hr_designations
       WHERE UPPER(TRIM(code)) = ?`,
      group.normalized_code
    ) as Array<{
      id: string;
      outlet_id: string;
      code: string;
      name: string;
      skill_category: string | null;
      status: string;
      notes: string | null;
    }>;

    if (rows.length <= 1) continue;

    const first = rows[0];
    const firstNormName = first.name.trim().toUpperCase();
    const firstSkill = first.skill_category || null;
    const firstStatus = first.status.trim().toUpperCase();

    let hasMismatch = false;
    let reason = '';

    for (let i = 1; i < rows.length; i++) {
      const curr = rows[i];
      const currNormName = curr.name.trim().toUpperCase();
      const currSkill = curr.skill_category || null;
      const currStatus = curr.status.trim().toUpperCase();

      if (firstNormName !== currNormName) {
        hasMismatch = true;
        reason = `Conflicting names for designation code '${group.normalized_code}': '${first.name}' vs '${curr.name}'`;
        break;
      }
      if (firstSkill !== currSkill) {
        hasMismatch = true;
        reason = `Conflicting skill categories for designation code '${group.normalized_code}': '${firstSkill ?? 'NONE'}' vs '${currSkill ?? 'NONE'}'`;
        break;
      }
      if (firstStatus !== currStatus) {
        hasMismatch = true;
        reason = `Conflicting status for designation code '${group.normalized_code}': '${firstStatus}' vs '${currStatus}'`;
        break;
      }
    }

    if (hasMismatch) {
      conflicts.push({
        table: 'hr_designations',
        normalizedCode: group.normalized_code,
        reason,
        outletIds: rows.map(r => r.outlet_id),
        sampleRows: rows,
      });
    }
  }

  return conflicts;
}

/**
 * Checks for conflicting definitions across outlets for the same code in shift_templates.
 * Two shift templates with the same normalized code are conflicting if:
 * - start_time differs
 * - end_time differs
 * - names differ
 * - sequence differs
 */
export function detectShiftTemplateConflicts(sqlite: any): MasterDiagnosticConflict[] {
  if (!tableExists(sqlite, 'shift_templates')) {
    return [];
  }

  const conflicts: MasterDiagnosticConflict[] = [];

  const groups = queryAll(
    sqlite,
    `SELECT
       UPPER(TRIM(code)) as normalized_code,
       COUNT(*) as cnt,
       GROUP_CONCAT(id) as ids,
       GROUP_CONCAT(outlet_id) as outlet_ids,
       GROUP_CONCAT(name) as names
     FROM shift_templates
     GROUP BY UPPER(TRIM(code))
     HAVING COUNT(*) > 1`
  ) as Array<{
    normalized_code: string;
    cnt: number;
    ids: string;
    outlet_ids: string;
    names: string;
  }>;

  for (const group of groups) {
    const rows = queryAll(
      sqlite,
      `SELECT id, outlet_id, code, name, start_time, end_time, sequence, status
       FROM shift_templates
       WHERE UPPER(TRIM(code)) = ?`,
      group.normalized_code
    ) as Array<{
      id: string;
      outlet_id: string;
      code: string;
      name: string;
      start_time: string;
      end_time: string;
      sequence: number;
      status: string;
    }>;

    if (rows.length <= 1) continue;

    const first = rows[0];
    const firstStart = first.start_time.trim();
    const firstEnd = first.end_time.trim();
    const firstNormName = first.name.trim().toUpperCase();

    let hasMismatch = false;
    let reason = '';

    for (let i = 1; i < rows.length; i++) {
      const curr = rows[i];
      const currStart = curr.start_time.trim();
      const currEnd = curr.end_time.trim();
      const currNormName = curr.name.trim().toUpperCase();

      if (firstStart !== currStart || firstEnd !== currEnd) {
        hasMismatch = true;
        reason = `Conflicting shift hours for shift code '${group.normalized_code}': (${firstStart} - ${firstEnd}) vs (${currStart} - ${currEnd})`;
        break;
      }
      if (firstNormName !== currNormName) {
        hasMismatch = true;
        reason = `Conflicting names for shift code '${group.normalized_code}': '${first.name}' vs '${curr.name}'`;
        break;
      }
      if (first.sequence !== curr.sequence) {
        hasMismatch = true;
        reason = `Conflicting sequence numbers for shift code '${group.normalized_code}': ${first.sequence} vs ${curr.sequence}`;
        break;
      }
    }

    if (hasMismatch) {
      conflicts.push({
        table: 'shift_templates',
        normalizedCode: group.normalized_code,
        reason,
        outletIds: rows.map(r => r.outlet_id),
        sampleRows: rows,
      });
    }
  }

  return conflicts;
}

export const EXPLICIT_LEGACY_DESIGNATION_MAPPING_IDS = [
  'desig-54163d40-b7ab-4e62-accd-4350f1f8cf11',
  'desig-5b5ec560-d9f0-452b-a46c-f2bcfb5ff840',
  'desig-19d0f3f8-ba1e-4746-80c0-9657d45bd5ab',
  'desig-deb087be-1961-4a77-babd-2fee3c889c69',
  'desig-b3aee108-20d3-40b7-ad2d-1750abf0ee13',
  'desig-85b89423-f6b0-4e96-859f-c9082440a332',
  'desig-cad800e2-a71f-4327-bd4a-84d362833cf0',
  'desig-b3fe3aa3-4b1c-4c4a-9711-66ab2ae2ec45',
  'desig-246089cb-4253-49a2-896a-6b4dfbcb104f',
  'desig-7b7fd190-84e1-46d1-9d44-9c83e30146a2',
  'desig-82b4a909-aabd-4b80-84a4-2119f3b8f8f8',
  'desig-a13b3799-ec57-4757-b3c1-c26b8d677eb3',
  'desig-c18ae4a5-7b8f-45a7-b50b-51fbbdb3b54d',
  'desig-e2411a12-3084-48f4-b8d4-39f37626a59d',
];

export function detectUnmappedLegacyDesignations(sqlite: any): any[] {
  if (!tableExists(sqlite, 'hr_designations')) {
    return [];
  }
  const allLegacy = queryAll(
    sqlite,
    `SELECT id, outlet_id, code, name, skill_category FROM hr_designations`
  );
  return allLegacy.filter(
    (row: any) => !EXPLICIT_LEGACY_DESIGNATION_MAPPING_IDS.includes(row.id)
  );
}

export function assertNoGlobalMasterSemanticConflictsBeforeMigration(sqlite: any): void {
  const desigConflicts = detectDesignationConflicts(sqlite);
  if (desigConflicts.length > 0) {
    for (const dc of desigConflicts) {
      console.warn(
        `[Migration 0032 Warning] Legacy outlet-local designation code '${dc.normalizedCode}' has multiple meanings across outlets: ${dc.reason}. Proceeding using explicit designation ID mapping.`
      );
    }
  }

  const shiftConflicts = detectShiftTemplateConflicts(sqlite);
  if (shiftConflicts.length === 0) {
    return;
  }

  const conflictLines: string[] = [];
  for (const sc of shiftConflicts) {
    conflictLines.push(
      `- Shift Template [${sc.normalizedCode}]: ${sc.reason} (outlets: ${sc.outletIds.join(', ')})`
    );
  }

  throw new Error(
    `GLOBAL_MASTER_MIGRATION_CONFLICT: Cannot apply global masters migration because conflicting shift template definitions were detected across outlets (no rows were modified or deleted):\n${conflictLines.join('\n')}`
  );
}

/**
 * Asserts that all legacy designations in hr_designations are explicitly mapped to canonical global IDs.
 * This strict check is intended for production deployment prechecks and dedicated migration tests.
 */
export function assertAllProductionLegacyDesignationsMapped(sqlite: any): void {
  const unmapped = detectUnmappedLegacyDesignations(sqlite);
  if (unmapped.length > 0) {
    const unmappedLines = unmapped.map(
      u => `id: ${u.id}, outlet: ${u.outlet_id}, code: ${u.code}, name: ${u.name}, skill: ${u.skill_category}`
    );
    throw new Error(
      `UNMAPPED_LEGACY_DESIGNATION: Found ${unmapped.length} unmapped legacy designation(s) in hr_designations:\n${unmappedLines.join('\n')}`
    );
  }
}

/**
 * Combined pre-migration assertion that checks both semantic conflicts and unmapped production legacy designations.
 */
export function assertNoGlobalMasterConflictsBeforeMigration(sqlite: any): void {
  assertAllProductionLegacyDesignationsMapped(sqlite);
  assertNoGlobalMasterSemanticConflictsBeforeMigration(sqlite);
}
