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
    try {
      fs.unlinkSync(dbPath);
    } catch {}
  }

  const localD1 = createLocalD1Database(dbPath);
  const db = getDb(localD1);

  console.log('🌱 Seeding database using seedDatabase()...');
  await seedDatabase(db);
  localD1.close();

  console.log('📦 Reading seeded tables and generating demo-seed.sql...');
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

  const tables = sqliteDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_d1_migrations' ORDER BY name"
  ).all() as { name: string }[];

  let sqlOutput = `-- ======================================================================\n`;
  sqlOutput += `-- IOCL Digital Pump Manager - Remote Demo Seed SQL\n`;
  sqlOutput += `-- Generated automatically by scripts/exportDemoSeedSql.ts\n`;
  sqlOutput += `-- ======================================================================\n\n`;
  sqlOutput += `PRAGMA foreign_keys = OFF;\n\n`;

  let totalRowsExported = 0;

  for (const { name: tableName } of tables) {
    const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, any>[];
    if (rows.length === 0) continue;

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

  sqlOutput += `PRAGMA foreign_keys = ON;\n`;

  const outputPath = path.resolve(process.cwd(), 'demo-seed.sql');
  fs.writeFileSync(outputPath, sqlOutput, 'utf8');

  sqliteDb.close();
  try {
    fs.unlinkSync(dbPath);
  } catch {}

  console.log(`✅ demo-seed.sql generated successfully with ${totalRowsExported} total rows exported!`);
}

exportDemoSeed().catch(err => {
  console.error('❌ Demo seed export failed:', err);
  process.exit(1);
});
