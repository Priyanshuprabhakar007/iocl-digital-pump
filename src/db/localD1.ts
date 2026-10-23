import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { assertNoDuplicateRecordsBeforeMigration } from './duplicateDiagnostic';
import { assertNoGlobalMasterSemanticConflictsBeforeMigration } from './globalMasterDiagnostic';

const nodeRequire = typeof require !== 'undefined' ? require : createRequire(import.meta.url);

interface SqliteStatement {
  get(...params: any[]): any;
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  all(...params: any[]): any[];
  raw?(enable: boolean): { all(...params: any[]): any[] };
  values?(...params: any[]): any[];
}

interface SqliteDb {
  exec(sql: string): void;
  prepare?(sql: string): SqliteStatement;
  query?(sql: string): SqliteStatement;
  close(): void;
}

export class LocalD1PreparedStatement {
  private params: any[];

  constructor(private db: SqliteDb, private sql: string, params: any[] = []) {
    this.params = params.map(val => {
      if (val === undefined) return null;
      if (typeof val === 'boolean') return val ? 1 : 0;
      if (val instanceof Date) return val.toISOString();
      return val;
    });
  }

  bind(...values: any[]): D1PreparedStatement {
    return new LocalD1PreparedStatement(this.db, this.sql, values) as unknown as D1PreparedStatement;
  }

  private getStatement(): SqliteStatement {
    if (typeof this.db.query === 'function') {
      return this.db.query(this.sql);
    }
    if (typeof this.db.prepare === 'function') {
      return this.db.prepare(this.sql);
    }
    throw new Error('Unsupported sqlite database instance');
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const stmt = this.getStatement();
    const row = stmt.get(...this.params) as any;
    if (!row) return null;
    if (colName) return row[colName] ?? null;
    return row as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.getStatement();
    const info = stmt.run(...this.params);
    return {
      results: [],
      success: true,
      meta: {
        duration: 1,
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        served_by: 'local-sqlite',
        queries_executed: 1,
        size_after: 0,
        rows_read: 0,
        rows_written: info.changes,
        changed_db: false,
      },
    };
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.getStatement();
    let results: T[] = [];
    try {
      // Better-sqlite3 throws if .all() is called on a non-row-returning statement
      results = stmt.all(...this.params) as T[];
    } catch (err: any) {
      // Fallback to .run() for non-row-returning statements (INSERT, UPDATE, DELETE)
      try {
        const info = stmt.run(...this.params);
        return {
          results: [],
          success: true,
          meta: {
            duration: 1,
            changes: info.changes,
            last_row_id: Number(info.lastInsertRowid),
            served_by: 'local-sqlite',
            queries_executed: 1,
            size_after: 0,
            rows_read: 0,
            rows_written: info.changes,
            changed_db: true,
          },
        };
      } catch (runErr) {
        // If run also fails, throw the run error as it's likely more relevant (e.g. constraint violation)
        throw runErr;
      }
    }
    return {
      results,
      success: true,
      meta: {
        duration: 1,
        changes: 0,
        last_row_id: 0,
        served_by: 'local-sqlite',
        queries_executed: 1,
        size_after: 0,
        rows_read: results.length,
        rows_written: 0,
        changed_db: false,
      },
    };
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<any> {
    const stmt = this.getStatement();
    if (typeof stmt.values === 'function') {
      return stmt.values(...this.params);
    }
    if (typeof stmt.raw === 'function') {
      return stmt.raw(true).all(...this.params);
    }
    return stmt.all(...this.params);
  }
}

export interface LocalD1Options {
  throughMigration?: string;
}

const migrationSqlCache = new Map<string, string>();
let cachedMigrationFiles: string[] | null = null;

function getMigrationFiles(migrationsDir: string): string[] {
  if (!cachedMigrationFiles) {
    cachedMigrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
  }
  return [...cachedMigrationFiles];
}

function getMigrationSql(migrationsDir: string, file: string): string {
  let sql = migrationSqlCache.get(file);
  if (sql === undefined) {
    sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    migrationSqlCache.set(file, sql);
  }
  return sql;
}

let cachedTemplatePath: string | null = null;

function ensureMigratedTemplate(migrationsDir: string): string | null {
  if (cachedTemplatePath && fs.existsSync(cachedTemplatePath)) {
    return cachedTemplatePath;
  }
  if (!fs.existsSync(migrationsDir)) return null;

  const templateDir = path.resolve(process.cwd(), '.sqlite');
  if (!fs.existsSync(templateDir)) {
    fs.mkdirSync(templateDir, { recursive: true });
  }
  const tplPath = path.join(templateDir, `_template_schema_${process.pid}.db`);
  if (fs.existsSync(tplPath)) {
    cachedTemplatePath = tplPath;
    return tplPath;
  }

  const isBun = typeof (globalThis as any).Bun !== 'undefined';
  let tdb: SqliteDb;
  if (isBun) {
    const { Database: BunDatabase } = nodeRequire('bun:sqlite');
    tdb = new BunDatabase(tplPath);
  } else {
    const BetterSqlite = nodeRequire('better-sqlite3');
    tdb = new BetterSqlite(tplPath);
  }

  tdb.exec('PRAGMA foreign_keys = OFF;');
  tdb.exec('PRAGMA legacy_alter_table = ON;');
  tdb.exec(`
    CREATE TABLE IF NOT EXISTS _d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const files = getMigrationFiles(migrationsDir);
  for (const file of files) {
    const sql = getMigrationSql(migrationsDir, file);
    tdb.exec(sql);
    if (typeof tdb.prepare === 'function') {
      tdb.prepare('INSERT INTO _d1_migrations (name) VALUES (?)').run(file);
    } else if (typeof tdb.query === 'function') {
      tdb.query('INSERT INTO _d1_migrations (name) VALUES (?)').run(file);
    }
  }
  tdb.exec('PRAGMA legacy_alter_table = OFF;');
  tdb.exec('PRAGMA foreign_keys = ON;');
  tdb.close();
  cachedTemplatePath = tplPath;
  process.once('exit', () => {
    try {
      if (fs.existsSync(tplPath)) fs.unlinkSync(tplPath);
      if (fs.existsSync(tplPath + '-wal')) fs.unlinkSync(tplPath + '-wal');
      if (fs.existsSync(tplPath + '-shm')) fs.unlinkSync(tplPath + '-shm');
    } catch {}
  });
  return tplPath;
}

export class LocalD1Database {
  private db: SqliteDb;
  private options?: LocalD1Options;

  constructor(dbPath: string, options?: LocalD1Options) {
    this.options = options;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const isFreshDefaultDb = !options?.throughMigration && dbPath !== ':memory:' && !fs.existsSync(dbPath);
    if (isFreshDefaultDb) {
      const migrationsDir = path.resolve(process.cwd(), 'migrations');
      const tpl = ensureMigratedTemplate(migrationsDir);
      if (tpl && fs.existsSync(tpl)) {
        fs.copyFileSync(tpl, dbPath);
      }
    }

    const isBun = typeof (globalThis as any).Bun !== 'undefined';
    if (isBun) {
      const { Database: BunDatabase } = nodeRequire('bun:sqlite');
      const bdb = new BunDatabase(dbPath);
      bdb.exec('PRAGMA journal_mode = WAL;');
      bdb.exec('PRAGMA synchronous = OFF;');
      bdb.exec('PRAGMA temp_store = MEMORY;');
      bdb.exec('PRAGMA foreign_keys = ON;');
      this.db = bdb;
    } else {
      const BetterSqlite = nodeRequire('better-sqlite3');
      const sdb = new BetterSqlite(dbPath);
      sdb.pragma('journal_mode = WAL');
      sdb.pragma('synchronous = OFF');
      sdb.pragma('temp_store = MEMORY');
      sdb.pragma('foreign_keys = ON');
      this.db = sdb;
    }

    if (!isFreshDefaultDb) {
      this.initSchema();
    }
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _d1_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);

    let applied = new Set<string>();
    try {
      if (typeof this.db.prepare === 'function') {
        const rows = this.db.prepare('SELECT name FROM _d1_migrations').all() as { name: string }[];
        applied = new Set(rows.map(r => r.name));
      } else if (typeof this.db.query === 'function') {
        const rows = this.db.query('SELECT name FROM _d1_migrations').all() as { name: string }[];
        applied = new Set(rows.map(r => r.name));
      }
    } catch (e) {
      // ignore
    }

    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    if (fs.existsSync(migrationsDir)) {
      let files = getMigrationFiles(migrationsDir);

      if (this.options?.throughMigration) {
        const cutoff = this.options.throughMigration;
        const cutoffIndex = files.indexOf(cutoff);
        if (cutoffIndex === -1) {
          throw new Error(`LOCAL_D1_MIGRATION_CUTOFF_NOT_FOUND: ${cutoff}`);
        }
        files = files.slice(0, cutoffIndex + 1);
      }

      for (const file of files) {
        if (!applied.has(file)) {
          if (file === '0031_idempotency_and_unique_constraints.sql' && applied.size > 0) {
            assertNoDuplicateRecordsBeforeMigration(this.db);
          }
          if (file === '0032_global_designation_and_shift_masters.sql') {
            assertNoGlobalMasterSemanticConflictsBeforeMigration(this.db);
          }
          const sql = getMigrationSql(migrationsDir, file);
          this.db.exec(sql);
          if (typeof this.db.prepare === 'function') {
            this.db.prepare('INSERT INTO _d1_migrations (name) VALUES (?)').run(file);
          } else if (typeof this.db.query === 'function') {
            this.db.query('INSERT INTO _d1_migrations (name) VALUES (?)').run(file);
          }
        }
      }
    }
  }

  prepare(query: string): D1PreparedStatement {
    return new LocalD1PreparedStatement(this.db, query) as unknown as D1PreparedStatement;
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('dump not implemented in LocalD1');
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    this.db.exec('BEGIN TRANSACTION;');
    try {
      for (const stmt of statements) {
        const res = await stmt.all<T>();
        results.push(res);
      }
      this.db.exec('COMMIT;');
      return results;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch (e) {
        // ignore rollback errors if already aborted
      }
      throw err;
    }
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.db.exec(query);
    return {
      count: 1,
      duration: 1,
    };
  }

  getNativeDb(): SqliteDb {
    return this.db;
  }

  close(): void {
    try {
      this.db.close();
    } catch (e) {
      // ignore if already closed
    }
  }
}

export function createLocalD1Database(
  dbPath = './.sqlite/iocl_local.db',
  options?: LocalD1Options
): D1Database & { close: () => void; getNativeDb: () => any } {
  return new LocalD1Database(dbPath, options) as unknown as D1Database & { close: () => void; getNativeDb: () => any };
}
