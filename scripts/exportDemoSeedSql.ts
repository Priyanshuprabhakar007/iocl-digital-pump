import fs from 'fs';
import path from 'path';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';

function formatValue(val: any): string {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : 'NULL';
  }
  if (typeof val === 'boolean') {
    return val ? '1' : '0';
  }
  if (typeof val === 'bigint') {
    return String(val);
  }
  if (Buffer.isBuffer?.(val) || val instanceof Uint8Array) {
    return `X'${Buffer.from(val).toString('hex')}'`;
  }
  const str = String(val);
  return `'${str.replace(/'/g, "''")}'`;
}

async function exportDemoSeed() {
  console.log('🌱 Creating temporary LocalD1 database for demo seed export...');
  const dbPath = path.resolve(process.cwd(), './.sqlite/iocl_demo_export_temp.db');
  if (fs.existsSync(dbPath)) {
    try { fs.unlinkSync(dbPath); } catch {}
  }

  const localD1 = createLocalD1Database(dbPath);
  const db = getDb(localD1);

  console.log('🌱 Seeding database using seedDatabase()...');
  await seedDatabase(db);
  localD1.close();

  console.log('📦 Inspecting tables and building FK dependency graph...');
  const isBun = typeof (globalThis as any).Bun !== 'undefined';
  const nodeRequire = typeof require !== 'undefined' ? require : (await import('module')).createRequire(import.meta.url);
  let sqliteDb: any;
  if (isBun) {
    const { Database } = nodeRequire('bun:sqlite');
    sqliteDb = new Database(dbPath);
  } else {
    const BetterSqlite = nodeRequire('better-sqlite3');
    sqliteDb = new BetterSqlite(dbPath);
  }

  const rawTables = sqliteDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_d1_migrations'"
  ).all() as { name: string }[];

  const tableSet = new Set(rawTables.map(t => t.name));

  const adj = new Map<string, Set<string>>(); // parent -> set of children
  const inDegree = new Map<string, number>(); // child -> count of un-visited parents

  for (const t of tableSet) {
    if (!adj.has(t)) adj.set(t, new Set());
    if (!inDegree.has(t)) inDegree.set(t, 0);
  }

  for (const t of tableSet) {
    const fks = sqliteDb.prepare(`PRAGMA foreign_key_list("${t}")`).all() as { table: string }[];
    const parents = new Set<string>();
    for (const fk of fks) {
      if (tableSet.has(fk.table) && fk.table !== t) {
        parents.add(fk.table);
      }
    }

    for (const p of parents) {
      if (!adj.has(p)) adj.set(p, new Set());
      adj.get(p)!.add(t);
    }
    inDegree.set(t, parents.size);
  }

  // Topological sort (Kahn's algorithm with alphabetical tie-breaking)
  const queue: string[] = [];
  for (const [t, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(t);
    }
  }
  queue.sort();

  const sortedTables: string[] = [];

  while (queue.length > 0) {
    queue.sort();
    const u = queue.shift()!;
    sortedTables.push(u);

    const children = adj.get(u) || new Set();
    for (const v of children) {
      const currentDeg = inDegree.get(v)! - 1;
      inDegree.set(v, currentDeg);
      if (currentDeg === 0) {
        queue.push(v);
      }
    }
  }

  if (sortedTables.length !== tableSet.size) {
    const remaining = Array.from(tableSet).filter(t => !sortedTables.includes(t));
    throw new Error(`DEMO_SEED_FK_CYCLE: ${remaining.join(', ')}`);
  }

  console.log('\nDemo seed table order:');
  sortedTables.forEach((t, idx) => {
    console.log(`${idx + 1}. ${t}`);
  });
  console.log('');

  let sqlOutput = `-- ======================================================================\n`;
  sqlOutput += `-- IOCL Digital Pump Manager - Remote Demo Seed SQL (FK Sorted)\n`;
  sqlOutput += `-- Generated automatically by scripts/exportDemoSeedSql.ts\n`;
  sqlOutput += `-- ======================================================================\n\n`;

  let totalRowsExported = 0;
  let totalTablesExported = 0;

  for (const tableName of sortedTables) {
    const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, any>[];
    if (rows.length === 0) continue;

    totalTablesExported++;
    sqlOutput += `-- Table: ${tableName} (${rows.length} rows)\n`;
    const columns = Object.keys(rows[0]);
    const colList = columns.map(c => `"${c}"`).join(', ');

    for (const row of rows) {
      const vals = columns.map(c => formatValue(row[c])).join(', ');
      sqlOutput += `INSERT OR IGNORE INTO "${tableName}" (${colList}) VALUES (${vals});\n`;
      totalRowsExported++;
    }
    sqlOutput += `\n`;
  }

  const outputPath = path.resolve(process.cwd(), 'demo-seed.sql');
  fs.writeFileSync(outputPath, sqlOutput, 'utf8');

  sqliteDb.close();
  try { fs.unlinkSync(dbPath); } catch {}

  console.log(`total tables exported: ${totalTablesExported}`);
  console.log(`total rows exported: ${totalRowsExported}`);

  // 7. Validate generated seed locally against second temp DB
  console.log('\n🔍 Validating generated seed locally against a second temporary LocalD1 database...');
  const validateDbPath = path.resolve(process.cwd(), './.sqlite/iocl_demo_validate_temp.db');
  if (fs.existsSync(validateDbPath)) {
    try { fs.unlinkSync(validateDbPath); } catch {}
  }

  const validateLocalD1 = createLocalD1Database(validateDbPath);
  validateLocalD1.close();

  let valSqliteDb: any;
  if (isBun) {
    const { Database } = nodeRequire('bun:sqlite');
    valSqliteDb = new Database(validateDbPath);
  } else {
    const BetterSqlite = nodeRequire('better-sqlite3');
    valSqliteDb = new BetterSqlite(validateDbPath);
  }

  valSqliteDb.exec(sqlOutput);

  // Check FK violations
  const fkViolations = valSqliteDb.prepare('PRAGMA foreign_key_check;').all() as any[];
  if (fkViolations.length > 0) {
    console.error('❌ FOREIGN KEY CHECK FAILED:', fkViolations);
    for (const v of fkViolations) {
      console.error(`table: ${v.table}, rowid: ${v.rowid}, parent: ${v.parent}, fkid: ${v.fkid}`);
    }
    valSqliteDb.close();
    try { fs.unlinkSync(validateDbPath); } catch {}
    throw new Error('DEMO_SEED_FOREIGN_KEY_CHECK_FAILED');
  }

  // Check admin exists
  const adminRow = valSqliteDb.prepare("SELECT COUNT(*) as count FROM users WHERE email = 'admin@iocl.in'").get() as { count: number };
  if (!adminRow || adminRow.count !== 1) {
    valSqliteDb.close();
    try { fs.unlinkSync(validateDbPath); } catch {}
    throw new Error('DEMO_SEED_ADMIN_NOT_FOUND');
  }

  // Verify admin permissions count vs total permissions count
  const permCountRow = valSqliteDb.prepare("SELECT COUNT(*) as count FROM permissions").get() as { count: number };
  const adminPermCountRow = valSqliteDb.prepare("SELECT COUNT(DISTINCT permission_id) as count FROM role_permissions WHERE role_id = 'role-admin'").get() as { count: number };

  console.log(`🔒 Admin permissions check: ${adminPermCountRow.count} / ${permCountRow.count} permissions mapped to role-admin.`);
  if (adminPermCountRow.count !== permCountRow.count) {
    valSqliteDb.close();
    try { fs.unlinkSync(validateDbPath); } catch {}
    throw new Error(`DEMO_SEED_ADMIN_PERMISSIONS_MISMATCH: expected ${permCountRow.count}, got ${adminPermCountRow.count}`);
  }

  valSqliteDb.close();
  try { fs.unlinkSync(validateDbPath); } catch {}
  console.log('✅ Local seed validation passed successfully (Zero FK violations, Admin exists with all permissions)!');
}

exportDemoSeed().catch(err => {
  console.error('❌ Demo seed export failed:', err);
  process.exit(1);
});
