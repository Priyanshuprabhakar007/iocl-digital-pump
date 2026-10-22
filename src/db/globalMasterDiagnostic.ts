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

/**
 * Asserts that no conflicting definitions exist in hr_designations or shift_templates before migration.
 * If conflicts exist, throws a detailed error to abort migration and prevent data corruption.
 */
export function assertNoGlobalMasterConflictsBeforeMigration(sqlite: any): void {
  const desigConflicts = detectDesignationConflicts(sqlite);
  const shiftConflicts = detectShiftTemplateConflicts(sqlite);

  if (desigConflicts.length === 0 && shiftConflicts.length === 0) {
    return;
  }

  const conflictLines: string[] = [];
  for (const dc of desigConflicts) {
    conflictLines.push(
      `- Designation [${dc.normalizedCode}]: ${dc.reason} (outlets: ${dc.outletIds.join(', ')})`
    );
  }
  for (const sc of shiftConflicts) {
    conflictLines.push(
      `- Shift Template [${sc.normalizedCode}]: ${sc.reason} (outlets: ${sc.outletIds.join(', ')})`
    );
  }

  throw new Error(
    `GLOBAL_MASTER_MIGRATION_CONFLICT: Cannot apply global masters migration because conflicting definitions were detected across outlets (no rows were modified or deleted):\n${conflictLines.join('\n')}`
  );
}
