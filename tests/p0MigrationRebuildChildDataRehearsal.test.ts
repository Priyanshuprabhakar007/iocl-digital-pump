import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import Database from 'better-sqlite3';

type Rehearsal = {
  migration: string;
  extractSql: (source: string) => string;
  parent: string;
  setup: string;
};

const extractBetween = (sql: string, start: string, end: string): string => {
  const startAt = sql.indexOf(start);
  const endAt = sql.indexOf(end, startAt + start.length);
  if (startAt < 0 || endAt < 0) throw new Error('MIGRATION_SQL_BOUNDARY_CHANGED_REVIEW_REQUIRED');
  return sql.slice(startAt, endAt);
};

const cases: Rehearsal[] = [
  {
    migration: '0004_phase2a_integrity.sql',
    parent: 'nozzle_meter_readings',
    // Exact original SQL for the full table rebuild. Earlier permission seed
    // section is intentionally excluded: this test isolates FK consequences.
    extractSql: sql => sql.slice(sql.indexOf('-- 2. Rebuild nozzle_meter_readings')),
    setup: `
      CREATE TABLE retail_outlets(id TEXT PRIMARY KEY);
      CREATE TABLE operational_shifts(id TEXT PRIMARY KEY);
      CREATE TABLE nozzles(id TEXT PRIMARY KEY);
      CREATE TABLE users(id TEXT PRIMARY KEY);
      CREATE TABLE nozzle_meter_readings (
        id TEXT PRIMARY KEY, operational_shift_id TEXT NOT NULL, outlet_id TEXT NOT NULL,
        nozzle_id TEXT NOT NULL, opening_totalizer_milliunits INTEGER,
        closing_totalizer_milliunits INTEGER, testing_quantity_milliunits INTEGER,
        gross_sales_quantity_milliunits INTEGER, net_sales_quantity_milliunits INTEGER,
        opening_variance_milliunits INTEGER, recorded_by_user_id TEXT,
        has_opening_variance INTEGER, variance_reason TEXT, created_at TEXT, updated_at TEXT,
        opening_totalizer REAL, closing_totalizer REAL, testing_quantity REAL,
        gross_sales_quantity REAL, net_sales_quantity REAL, opening_variance_quantity REAL
      );
      INSERT INTO retail_outlets VALUES ('o1');
      INSERT INTO operational_shifts VALUES ('s1');
      INSERT INTO nozzles VALUES ('n1');
      INSERT INTO users VALUES ('u1');
      INSERT INTO nozzle_meter_readings (
        id,operational_shift_id,outlet_id,nozzle_id,opening_totalizer_milliunits,
        closing_totalizer_milliunits,testing_quantity_milliunits,gross_sales_quantity_milliunits,
        net_sales_quantity_milliunits,opening_variance_milliunits,recorded_by_user_id,
        has_opening_variance,created_at,updated_at
      ) VALUES ('p1','s1','o1','n1',1000,2000,0,1000,1000,0,'u1',0,'now','now');
    `,
  },
  {
    migration: '0011_phase2c_completion.sql',
    parent: 'outlet_product_prices',
    // Use the migration's first exact rebuild fragment. Other five rebuilds
    // still require separately reviewed hosted-compatible rehearsals.
    extractSql: sql => extractBetween(sql, '-- outlet_product_prices\n', '-- operational_shift_product_prices\n'),
    setup: `
      CREATE TABLE retail_outlets(id TEXT PRIMARY KEY);
      CREATE TABLE products(id TEXT PRIMARY KEY);
      CREATE TABLE users(id TEXT PRIMARY KEY);
      CREATE TABLE outlet_product_prices (
        id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL, product_id TEXT NOT NULL,
        price_paise_per_unit INTEGER NOT NULL, effective_from TEXT NOT NULL,
        effective_to TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL, created_by TEXT NOT NULL
      );
      INSERT INTO retail_outlets VALUES ('o1');
      INSERT INTO products VALUES ('fuel1');
      INSERT INTO users VALUES ('u1');
      INSERT INTO outlet_product_prices VALUES ('price1','o1','fuel1',9300,'2026-11-16',NULL,'ACTIVE','now','u1');
    `,
  },
  {
    migration: '0032_global_designation_and_shift_masters.sql',
    parent: 'operational_shifts',
    // Isolate the exact shift-table rebuild in this much larger migration.
    // Do NOT claim this is a complete simulation of all 0032 data updates.
    extractSql: sql => extractBetween(sql, 'CREATE TABLE "operational_shifts_rebuild"', '-- 5B.'),
    setup: `
      CREATE TABLE retail_outlets(id TEXT PRIMARY KEY);
      CREATE TABLE users(id TEXT PRIMARY KEY);
      CREATE TABLE operational_shifts (
        id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL, shift_template_id TEXT NOT NULL,
        business_date TEXT NOT NULL, started_at TEXT NOT NULL, closed_at TEXT,
        status TEXT NOT NULL, opened_by_user_id TEXT NOT NULL, closed_by_user_id TEXT,
        notes TEXT, created_at TEXT NOT NULL, updated_at TEXT
      );
      INSERT INTO retail_outlets VALUES ('o1');
      INSERT INTO users VALUES ('u1');
      INSERT INTO operational_shifts VALUES (
        's1','o1','st1','2026-11-16','now',NULL,'OPEN','u1',NULL,NULL,'now','now'
      );
    `,
  },
];

describe('P0 risky migration dependent-data rehearsal — disposable SQLite only', () => {
  for (const item of cases) {
    it(`${item.migration} detects child-row loss from original table rebuild and rolls back`, () => {
      const db = new Database(':memory:');
      try {
        db.pragma('foreign_keys = ON');
        db.exec(item.setup);
        db.exec(`CREATE TABLE dependent_record (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL REFERENCES "${item.parent}"(id) ON DELETE CASCADE
        );`);
        db.prepare('INSERT INTO dependent_record(id,parent_id) VALUES (?,?)')
          .run('preserve-me', item.parent === 'nozzle_meter_readings' ? 'p1' :
            item.parent === 'outlet_product_prices' ? 'price1' : 's1');
        expect((db.prepare('SELECT COUNT(*) AS n FROM dependent_record').get() as {n:number}).n).toBe(1);
        const sql = fs.readFileSync(`migrations/${item.migration}`, 'utf8');
        const rebuildSql = item.extractSql(sql);
        expect(rebuildSql).toContain(`DROP TABLE ${item.parent === 'operational_shifts' ? '"operational_shifts"' :
          item.parent === 'nozzle_meter_readings' ? '`nozzle_meter_readings`' : 'outlet_product_prices'};`);
        let lostDuringRebuild = false;
        expect(() => db.transaction(() => {
          db.exec(rebuildSql);
          lostDuringRebuild = (db.prepare('SELECT COUNT(*) AS n FROM dependent_record').get() as {n:number}).n === 0;
          if (lostDuringRebuild) throw new Error('DEPENDENT_DATA_LOSS_BLOCKER');
        })()).toThrow('DEPENDENT_DATA_LOSS_BLOCKER');
        expect(lostDuringRebuild).toBe(true);
        expect((db.prepare('SELECT COUNT(*) AS n FROM dependent_record').get() as {n:number}).n).toBe(1);
        expect((db.prepare(`SELECT COUNT(*) AS n FROM "${item.parent}"`).get() as {n:number}).n).toBe(1);
        expect((db.pragma('foreign_key_check') as unknown[]).toHaveLength(0);
      } finally {
        db.close();
      }
    });
  }
});
