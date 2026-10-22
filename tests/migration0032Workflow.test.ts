import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createLocalD1Database } from '../src/db/localD1';
import {
  detectDesignationConflicts,
  detectShiftTemplateConflicts,
} from '../src/db/globalMasterDiagnostic';

const ROOT_DIR = path.resolve(__dirname, '..');
const DEPLOY_WORKFLOW_PATH = path.resolve(ROOT_DIR, '.github/workflows/deploy-cloudflare-demo.yml');
const STAGES_DIR = path.resolve(ROOT_DIR, 'migrations/0032_stages');

describe('Migration 0032 & Deployment Workflow Suite', () => {
  let dbPath: string;
  let localD1: any;

  afterEach(() => {
    try {
      if (localD1) localD1.close();
    } catch {}

    try {
      if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (dbPath && fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
      if (dbPath && fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
    } catch {}
  });

  // Helper to insert base hierarchy records (state, division, sales area, outlet, user)
  function setupPre0032Hierarchy(rawDb: any) {
    rawDb.exec(`
      INSERT OR IGNORE INTO states (id, code, name, status, created_at, updated_at)
      VALUES ('st-wb', 'WB', 'West Bengal', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

      INSERT OR IGNORE INTO divisions (id, state_id, code, name, status, created_at, updated_at)
      VALUES ('div-kol', 'st-wb', 'KOL_DO', 'Kolkata Divisional Office', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

      INSERT OR IGNORE INTO sales_areas (id, division_id, code, name, status, created_at, updated_at)
      VALUES ('sa-kol-c', 'div-kol', 'KOL_CENTRAL', 'Kolkata Central Sales Area', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

      INSERT OR IGNORE INTO retail_outlets (id, ro_code, name, outlet_type, state_id, division_id, sales_area_id, address, city, district, pincode, status, created_at, updated_at)
      VALUES
        ('ro-1', '396187', 'COCO Park Street', 'COCO', 'st-wb', 'div-kol', 'sa-kol-c', '1 Park Street', 'Kolkata', 'Kolkata', '700016', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('ro-2', '396188', 'COCO Salt Lake', 'COCO', 'st-wb', 'div-kol', 'sa-kol-c', 'Sector V', 'Kolkata', 'Kolkata', '700091', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

      INSERT OR IGNORE INTO users (id, emp_code, name, email, phone, password_hash, status, created_at, updated_at)
      VALUES ('usr-admin', 'EMP001', 'Admin User', 'admin@iocl.in', '9999999999', 'hash', 'ACTIVE', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    `);
  }

  // Helper to execute all stages A through F
  function apply0032Stages(rawDb: any) {
    const stageFiles = [
      '01_stage_a_create_global_masters.sql',
      '02_stage_b_populate_global_masters.sql',
      '03_stage_c_update_references.sql',
      '04_stage_d_rebuild_operational_shifts.sql',
      '05_stage_e_rebuild_hr_tables.sql',
      '06_stage_f_triggers_and_indexes.sql',
    ];

    for (const file of stageFiles) {
      const sqlContent = fs.readFileSync(path.join(STAGES_DIR, file), 'utf-8');
      rawDb.exec(sqlContent);
    }
  }

  // 1. Migration 0032 executes cleanly on empty DB
  it('1. Migration 0032 executes cleanly on empty DB', () => {
    dbPath = `./.sqlite/test_0032_empty_${Date.now()}_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath, {
      throughMigration: '0031_idempotency_and_unique_constraints.sql',
    });
    const rawDb = localD1.getNativeDb();

    // Verify global tables do NOT exist yet
    const preTables = rawDb.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('global_hr_designations', 'global_shift_templates');
    `).all() as any[];
    expect(preTables.length).toBe(0);

    // Apply Migration 0032 stages
    expect(() => apply0032Stages(rawDb)).not.toThrow();

    // Verify both global master tables now exist
    const postTables = rawDb.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('global_hr_designations', 'global_shift_templates');
    `).all() as any[];
    expect(postTables.length).toBe(2);

    // Verify foreign key checks pass
    const fkCheck = rawDb.prepare('PRAGMA foreign_key_check;').all() as any[];
    expect(fkCheck.length).toBe(0);
  });

  // 2. Migration 0032 executes cleanly on DB with existing outlet data
  it('2. Migration 0032 executes cleanly on DB with existing outlet data', () => {
    dbPath = `./.sqlite/test_0032_data_${Date.now()}_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath, {
      throughMigration: '0031_idempotency_and_unique_constraints.sql',
    });
    const rawDb = localD1.getNativeDb();

    setupPre0032Hierarchy(rawDb);

    rawDb.exec(`
      INSERT INTO hr_designations (id, outlet_id, code, name, skill_category, status, created_by, created_at, updated_at) VALUES
        ('desig-1', 'ro-1', 'DSM', 'Driveway Sales Manager', 'SKILLED', 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('desig-2', 'ro-1', 'CASHIER', 'Cashier', 'SEMI_SKILLED', 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

      INSERT INTO shift_templates (id, outlet_id, code, name, start_time, end_time, sequence, status, created_by, created_at, updated_at) VALUES
        ('shift-1', 'ro-1', 'MORNING', 'Morning Shift', '06:00', '14:00', 1, 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('shift-2', 'ro-1', 'EVENING', 'Evening Shift', '14:00', '22:00', 2, 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

      INSERT INTO operational_shifts (id, outlet_id, shift_template_id, business_date, started_at, status, opened_by_user_id, created_at, updated_at) VALUES
        ('op-1', 'ro-1', 'shift-1', '2026-03-30', '2026-03-30T06:00:00Z', 'CLOSED', 'usr-admin', '2026-03-30T06:00:00Z', '2026-03-30T14:00:00Z');

      INSERT INTO hr_staff (id, outlet_id, employee_code, full_name, designation_id, aadhaar_last4, emergency_contact_name, emergency_contact_phone, joining_date, employment_status, created_by, created_at, updated_at) VALUES
        ('st-1', 'ro-1', 'EMP001', 'Rahul Sharma', 'desig-1', '1234', 'Contact', '9876543210', '2026-01-15', 'ACTIVE', 'usr-admin', '2026-01-15T00:00:00Z', '2026-01-15T00:00:00Z');

      INSERT INTO hr_manpower_sanctions (id, outlet_id, designation_id, sanctioned_count, effective_from, created_by, created_at, updated_at) VALUES
        ('san-1', 'ro-1', 'desig-1', 4, '2026-01-01', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

      INSERT INTO hr_roster_assignments (id, outlet_id, staff_id, roster_date, shift_template_id, status, created_by, created_at, updated_at) VALUES
        ('rost-1', 'ro-1', 'st-1', '2026-03-30', 'shift-1', 'SCHEDULED', 'usr-admin', '2026-03-29T00:00:00Z', '2026-03-29T00:00:00Z');
    `);

    // Execute migration stages
    expect(() => apply0032Stages(rawDb)).not.toThrow();

    // Verify global tables populated
    const desigs = rawDb.prepare('SELECT COUNT(*) as count FROM global_hr_designations;').get() as any;
    const shifts = rawDb.prepare('SELECT COUNT(*) as count FROM global_shift_templates;').get() as any;
    expect(desigs.count).toBe(2);
    expect(shifts.count).toBe(2);

    // Verify foreign key integrity
    const fkCheck = rawDb.prepare('PRAGMA foreign_key_check;').all() as any[];
    expect(fkCheck.length).toBe(0);
  });

  // 3. Conflict detection correctly identifies conflicting designations
  it('3. Conflict detection correctly identifies conflicting designations', () => {
    dbPath = `./.sqlite/test_0032_desig_conf_${Date.now()}_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath, {
      throughMigration: '0031_idempotency_and_unique_constraints.sql',
    });
    const rawDb = localD1.getNativeDb();

    setupPre0032Hierarchy(rawDb);

    rawDb.exec(`
      INSERT INTO hr_designations (id, outlet_id, code, name, skill_category, status, created_by, created_at, updated_at) VALUES
        ('d-1', 'ro-1', 'CASHIER', 'Outlet Cashier', 'SEMI_SKILLED', 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('d-2', 'ro-2', 'CASHIER', 'Head Cashier', 'HIGHLY_SKILLED', 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    `);

    const conflictQuery = `
      SELECT
        UPPER(TRIM(code)) AS normalized_code,
        COUNT(*) AS count,
        GROUP_CONCAT(id) AS ids,
        GROUP_CONCAT(outlet_id) AS outlets,
        GROUP_CONCAT(name) AS names,
        GROUP_CONCAT(COALESCE(skill_category, 'NULL')) AS skill_categories,
        GROUP_CONCAT(status) AS statuses
      FROM hr_designations
      GROUP BY UPPER(TRIM(code))
      HAVING
        COUNT(DISTINCT TRIM(name)) > 1
        OR COUNT(DISTINCT COALESCE(skill_category, 'NULL')) > 1
        OR COUNT(DISTINCT status) > 1;
    `;
    const conflicts = rawDb.prepare(conflictQuery).all() as any[];
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].normalized_code).toBe('CASHIER');
    expect(conflicts[0].count).toBe(2);

    const tsConflicts = detectDesignationConflicts(rawDb);
    expect(tsConflicts.length).toBeGreaterThan(0);
    expect(tsConflicts[0].normalizedCode).toBe('CASHIER');
  });

  // 4. Conflict detection correctly identifies conflicting shifts
  it('4. Conflict detection correctly identifies conflicting shifts', () => {
    dbPath = `./.sqlite/test_0032_shift_conf_${Date.now()}_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath, {
      throughMigration: '0031_idempotency_and_unique_constraints.sql',
    });
    const rawDb = localD1.getNativeDb();

    setupPre0032Hierarchy(rawDb);

    rawDb.exec(`
      INSERT INTO shift_templates (id, outlet_id, code, name, start_time, end_time, sequence, status, created_by, created_at, updated_at) VALUES
        ('s-1', 'ro-1', 'GENERAL', 'General Shift', '09:00', '17:00', 1, 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('s-2', 'ro-2', 'GENERAL', 'General Shift', '10:00', '18:00', 1, 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    `);

    const conflictQuery = `
      SELECT
        UPPER(TRIM(code)) AS normalized_code,
        COUNT(*) AS count,
        GROUP_CONCAT(id) AS ids,
        GROUP_CONCAT(outlet_id) AS outlets,
        GROUP_CONCAT(name) AS names,
        GROUP_CONCAT(start_time) AS start_times,
        GROUP_CONCAT(end_time) AS end_times,
        GROUP_CONCAT(sequence) AS sequences
      FROM shift_templates
      GROUP BY UPPER(TRIM(code))
      HAVING
        COUNT(DISTINCT TRIM(name)) > 1
        OR COUNT(DISTINCT start_time) > 1
        OR COUNT(DISTINCT end_time) > 1
        OR COUNT(DISTINCT sequence) > 1;
    `;
    const conflicts = rawDb.prepare(conflictQuery).all() as any[];
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].normalized_code).toBe('GENERAL');
    expect(conflicts[0].count).toBe(2);

    const tsConflicts = detectShiftTemplateConflicts(rawDb);
    expect(tsConflicts.length).toBeGreaterThan(0);
    expect(tsConflicts[0].normalizedCode).toBe('GENERAL');
  });

  // 5. Post-migration row counts match pre-migration row counts
  it('5. Post-migration row counts match pre-migration row counts across all rebuilt tables', () => {
    dbPath = `./.sqlite/test_0032_counts_${Date.now()}_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath, {
      throughMigration: '0031_idempotency_and_unique_constraints.sql',
    });
    const rawDb = localD1.getNativeDb();

    setupPre0032Hierarchy(rawDb);

    rawDb.exec(`
      INSERT INTO hr_designations (id, outlet_id, code, name, skill_category, status, created_by, created_at, updated_at) VALUES ('d-1', 'ro-1', 'ATTENDANT', 'Pump Attendant', 'SKILLED', 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      INSERT INTO shift_templates (id, outlet_id, code, name, start_time, end_time, sequence, status, created_by, created_at, updated_at) VALUES ('s-1', 'ro-1', 'SHIFT_A', 'Shift A', '06:00', '14:00', 1, 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

      INSERT INTO operational_shifts (id, outlet_id, shift_template_id, business_date, started_at, status, opened_by_user_id, created_at, updated_at) VALUES ('op-1', 'ro-1', 's-1', '2026-03-29', '2026-03-29T06:00:00Z', 'CLOSED', 'usr-admin', '2026-03-29T06:00:00Z', '2026-03-29T14:00:00Z');
      INSERT INTO operational_shifts (id, outlet_id, shift_template_id, business_date, started_at, status, opened_by_user_id, created_at, updated_at) VALUES ('op-2', 'ro-1', 's-1', '2026-03-30', '2026-03-30T06:00:00Z', 'CLOSED', 'usr-admin', '2026-03-30T06:00:00Z', '2026-03-30T14:00:00Z');

      INSERT INTO hr_staff (id, outlet_id, employee_code, full_name, designation_id, aadhaar_last4, emergency_contact_name, emergency_contact_phone, joining_date, employment_status, created_by, created_at, updated_at) VALUES ('st-1', 'ro-1', 'EMP001', 'Aman Verma', 'd-1', '5555', 'Father', '9111111111', '2026-01-01', 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      INSERT INTO hr_manpower_sanctions (id, outlet_id, designation_id, sanctioned_count, effective_from, created_by, created_at, updated_at) VALUES ('san-1', 'ro-1', 'd-1', 5, '2026-01-01', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      INSERT INTO hr_roster_assignments (id, outlet_id, staff_id, roster_date, shift_template_id, status, created_by, created_at, updated_at) VALUES ('rost-1', 'ro-1', 'st-1', '2026-03-30', 's-1', 'SCHEDULED', 'usr-admin', '2026-03-29T00:00:00Z', '2026-03-29T00:00:00Z');
      INSERT INTO hr_attendance_records (id, outlet_id, staff_id, roster_assignment_id, attendance_date, shift_template_id, check_in_at, check_in_latitude, check_in_longitude, check_in_accuracy_metres, check_in_distance_metres, check_in_inside_geofence, status, created_by, created_at, updated_at) VALUES ('att-1', 'ro-1', 'st-1', 'rost-1', '2026-03-30', 's-1', '2026-03-30T06:05:00Z', 22.57, 88.36, 5.0, 10.0, 1, 'CHECKED_IN', 'usr-admin', '2026-03-30T06:05:00Z', '2026-03-30T06:05:00Z');
    `);

    // Capture pre-migration counts
    const tables = [
      'operational_shifts',
      'hr_staff',
      'hr_manpower_sanctions',
      'hr_roster_assignments',
      'hr_attendance_records',
    ];

    const preCounts: Record<string, number> = {};
    for (const t of tables) {
      preCounts[t] = (rawDb.prepare(`SELECT COUNT(*) as count FROM ${t}`).get() as any).count;
    }

    // Apply migration
    apply0032Stages(rawDb);

    // Verify post-migration counts match exactly
    for (const t of tables) {
      const postCount = (rawDb.prepare(`SELECT COUNT(*) as count FROM ${t}`).get() as any).count;
      expect(postCount).toBe(preCounts[t]);
    }
  });

  // 6. All rebuilt table references point to valid global IDs
  it('6. All rebuilt table references point to valid global IDs with 0 orphan references', () => {
    dbPath = `./.sqlite/test_0032_refs_${Date.now()}_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath, {
      throughMigration: '0031_idempotency_and_unique_constraints.sql',
    });
    const rawDb = localD1.getNativeDb();

    setupPre0032Hierarchy(rawDb);

    rawDb.exec(`
      INSERT INTO hr_designations (id, outlet_id, code, name, skill_category, status, created_by, created_at, updated_at) VALUES ('d-1', 'ro-1', 'MANAGER', 'Manager', 'HIGHLY_SKILLED', 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      INSERT INTO shift_templates (id, outlet_id, code, name, start_time, end_time, sequence, status, created_by, created_at, updated_at) VALUES ('s-1', 'ro-1', 'DAY', 'Day Shift', '08:00', '16:00', 1, 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

      INSERT INTO operational_shifts (id, outlet_id, shift_template_id, business_date, started_at, status, opened_by_user_id, created_at, updated_at) VALUES ('op-1', 'ro-1', 's-1', '2026-03-30', '2026-03-30T08:00:00Z', 'CLOSED', 'usr-admin', '2026-03-30T08:00:00Z', '2026-03-30T16:00:00Z');
      INSERT INTO hr_staff (id, outlet_id, employee_code, full_name, designation_id, aadhaar_last4, emergency_contact_name, emergency_contact_phone, joining_date, employment_status, created_by, created_at, updated_at) VALUES ('st-1', 'ro-1', 'EMP001', 'Suresh Kumar', 'd-1', '4321', 'Mother', '9888888888', '2026-01-01', 'ACTIVE', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      INSERT INTO hr_manpower_sanctions (id, outlet_id, designation_id, sanctioned_count, effective_from, created_by, created_at, updated_at) VALUES ('san-1', 'ro-1', 'd-1', 2, '2026-01-01', 'usr-admin', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
      INSERT INTO hr_roster_assignments (id, outlet_id, staff_id, roster_date, shift_template_id, status, created_by, created_at, updated_at) VALUES ('rost-1', 'ro-1', 'st-1', '2026-03-30', 's-1', 'SCHEDULED', 'usr-admin', '2026-03-29T00:00:00Z', '2026-03-29T00:00:00Z');
    `);

    apply0032Stages(rawDb);

    // Reference checks
    const orphanStaff = rawDb.prepare(`
      SELECT COUNT(*) AS count FROM hr_staff s
      LEFT JOIN global_hr_designations g ON s.designation_id = g.id
      WHERE g.id IS NULL;
    `).get() as any;
    expect(orphanStaff.count).toBe(0);

    const orphanShifts = rawDb.prepare(`
      SELECT COUNT(*) AS count FROM operational_shifts os
      LEFT JOIN global_shift_templates g ON os.shift_template_id = g.id
      WHERE g.id IS NULL;
    `).get() as any;
    expect(orphanShifts.count).toBe(0);

    const orphanSanctions = rawDb.prepare(`
      SELECT COUNT(*) AS count FROM hr_manpower_sanctions m
      LEFT JOIN global_hr_designations g ON m.designation_id = g.id
      WHERE g.id IS NULL;
    `).get() as any;
    expect(orphanSanctions.count).toBe(0);

    const orphanRoster = rawDb.prepare(`
      SELECT COUNT(*) AS count FROM hr_roster_assignments r
      LEFT JOIN global_shift_templates g ON r.shift_template_id = g.id
      WHERE g.id IS NULL;
    `).get() as any;
    expect(orphanRoster.count).toBe(0);
  });

  // 7. Workflow file syntax and step sequence are valid
  it('7. Workflow file syntax and step sequence are valid', () => {
    expect(fs.existsSync(DEPLOY_WORKFLOW_PATH)).toBe(true);
    const content = fs.readFileSync(DEPLOY_WORKFLOW_PATH, 'utf-8');

    // Check step sequence
    const step31Index = content.indexOf('name: Apply Migration 0031 via Ordered Remote Batches');
    const step32Index = content.indexOf('name: Apply Migration 0032 via Ordered Safe Stages');
    const verifyMigrationIndex = content.indexOf('name: Verify D1 Migration Completion');
    const deployIndex = content.indexOf('name: Deploy Worker to Cloudflare');

    expect(step31Index).toBeGreaterThan(-1);
    expect(step32Index).toBeGreaterThan(step31Index);
    expect(verifyMigrationIndex).toBeGreaterThan(step32Index);
    expect(deployIndex).toBeGreaterThan(verifyMigrationIndex);

    // Check required components within Migration 0032 step
    const step32Content = content.slice(step32Index, verifyMigrationIndex);

    // Precheck status
    expect(step32Content).toContain("SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '$MIGRATION_0032';");

    // Table state check
    expect(step32Content).toContain("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('global_hr_designations', 'global_shift_templates');");
    expect(step32Content).toContain('Partial migration state detected');
    expect(step32Content).toContain('Inconsistent migration state detected');

    // Conflict diagnostics
    expect(step32Content).toContain('HAVING COUNT(DISTINCT TRIM(name)) > 1 OR COUNT(DISTINCT COALESCE(skill_category, \'NULL\')) > 1 OR COUNT(DISTINCT status) > 1;');
    expect(step32Content).toContain('HAVING COUNT(DISTINCT TRIM(name)) > 1 OR COUNT(DISTINCT start_time) > 1 OR COUNT(DISTINCT end_time) > 1 OR COUNT(DISTINCT sequence) > 1;');

    // Pre-migration counts
    expect(step32Content).toContain('Capturing pre-migration counts');
    expect(step32Content).toContain('PRE_0032_OP_SHIFTS=');
    expect(step32Content).toContain('PRE_0032_HR_STAFF=');

    // Staged execution
    expect(step32Content).toContain('migrations/0032_stages/01_stage_a_create_global_masters.sql');
    expect(step32Content).toContain('migrations/0032_stages/02_stage_b_populate_global_masters.sql');
    expect(step32Content).toContain('migrations/0032_stages/03_stage_c_update_references.sql');
    expect(step32Content).toContain('migrations/0032_stages/04_stage_d_rebuild_operational_shifts.sql');
    expect(step32Content).toContain('migrations/0032_stages/05_stage_e_rebuild_hr_tables.sql');
    expect(step32Content).toContain('migrations/0032_stages/06_stage_f_triggers_and_indexes.sql');

    // Post-migration verification
    expect(step32Content).toContain('POST_GLOBAL_TABLE_COUNT');
    expect(step32Content).toContain('PRAGMA foreign_key_check;');
    expect(step32Content).toContain('operational_shifts count decreased');

    // Reference check
    expect(step32Content).toContain('SELECT COUNT(*) AS count FROM hr_staff s LEFT JOIN global_hr_designations g ON s.designation_id = g.id WHERE g.id IS NULL;');
    expect(step32Content).toContain('SELECT COUNT(*) AS count FROM operational_shifts os LEFT JOIN global_shift_templates g ON os.shift_template_id = g.id WHERE g.id IS NULL;');

    // Record migration
    expect(step32Content).toContain("INSERT OR IGNORE INTO d1_migrations (name) VALUES ('$MIGRATION_0032');");

    // Verify D1 Migration Completion expects >= 32
    const verifyStepContent = content.slice(verifyMigrationIndex, deployIndex);
    expect(verifyStepContent).toContain('if [ "$COUNT" -lt "32" ]; then');
    expect(verifyStepContent).toContain("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('global_hr_designations', 'global_shift_templates');");
    expect(verifyStepContent).toContain('global_shift_templates has 0 records when legacy shift_templates had');
  });
});
