import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { runStage01KContract, verifyStage01KGuard } from '../scripts/stage01k/d1ContractProbe';
import standaloneWorker from '../scripts/stage01k/standaloneWorker';
import { verifyStage01KStagingConfig, type Stage01KConfig } from '../scripts/stage01k/configSafety';

const TOKEN = 'stage01k-only-disposable-synthetic-token-123456';
const PURPOSE = 'IOCL_STAGE01K_DISPOSABLE_ONLY';

async function tokenHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

describe('Stage 01K isolated D1 batch contract (local emulator, NOT hosted D1)', () => {
  let db: ReturnType<typeof createLocalD1Database>;
  let path: string;

  beforeEach(async () => {
    path = `./.sqlite/test_stage01k_${crypto.randomUUID()}.db`;
    db = createLocalD1Database(path);
    await seedDatabase(getDb(db));
    const schema = fs.readFileSync('scripts/stage01k/staging_schema.sql', 'utf8');
    await db.exec(schema);
  });

  afterEach(() => {
    if (db) db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(path + suffix); } catch { /* ephemeral fixture */ }
    }
  });

  async function provisionGuard(token = TOKEN) {
    const hash = await tokenHash(token);
    await db.prepare(
      'INSERT INTO stage01k_guard (purpose, marker_hash) VALUES (?, ?)',
    ).bind(PURPOSE, hash).run();
  }

  async function scratchCount(): Promise<number> {
    const row = await db.prepare('SELECT count(*) AS n FROM stage01k_contract_attempts')
      .first<{ n: number }>();
    return Number(row?.n ?? -1);
  }

  it('refuses all mutations if the dedicated staging approval marker is absent', async () => {
    await expect(runStage01KContract(db, TOKEN))
      .rejects.toThrow('STAGE01K_DISPOSABLE_DATABASE_GUARD_MISMATCH');
    expect(await scratchCount()).toBe(0);
  });

  it('refuses mismatched/short tokens without creating any scratch evidence', async () => {
    await provisionGuard();
    await expect(verifyStage01KGuard(db, 'short')).rejects.toThrow('STAGE01K_APPROVAL_TOKEN_REQUIRED');
    await expect(runStage01KContract(db, 'different-but-long-enough-token-123456'))
      .rejects.toThrow('STAGE01K_DISPOSABLE_DATABASE_GUARD_MISMATCH');
    expect(await scratchCount()).toBe(0);
  });

  it('passes all seven batch, conflict, retry, concurrency and append-only checks locally', async () => {
    await provisionGuard();
    const first = await runStage01KContract(db, TOKEN);
    expect(first.checks).toEqual([
      'K01_RESERVE_AND_REPLAY',
      'K02_KEY_REUSE_CONFLICT',
      'K03_RESERVATION_BATCH_ROLLBACK',
      'K04_COMMIT_AND_AUDIT_ROLLBACK',
      'K05_POST_COMMIT_RECONCILIATION',
      'K06_CONCURRENT_CLAIM_GUARD',
      'K07_APPEND_ONLY_GUARD',
    ]);
    expect(first.scratchAttemptCount).toBe(2);
    expect(first.scratchEventCount).toBe(3);
    const second = await runStage01KContract(db, TOKEN);
    expect(second.runId).not.toBe(first.runId);
    expect(second.checks).toEqual(first.checks);
    expect(await scratchCount()).toBe(4);
  });

  it('does not change seeded operational shift, stock or financial records', async () => {
    await provisionGuard();
    async function count(table: string): Promise<number> {
      const selected = ['operational_shifts', 'shift_stock_reconciliations', 'shift_financial_reconciliations', 'audit_logs'];
      if (!selected.includes(table)) throw new Error('Unexpected table');
      const row = await db.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
      return Number(row?.n ?? -1);
    }
    const names = ['operational_shifts', 'shift_stock_reconciliations', 'shift_financial_reconciliations', 'audit_logs'];
    const before = await Promise.all(names.map(count));
    await runStage01KContract(db, TOKEN);
    const after = await Promise.all(names.map(count));
    expect(after).toEqual(before);
  });

  it('standalone Worker rejects GET, absent secrets and bad authorization', async () => {
    await provisionGuard();
    const env = { STAGING_DB: db, STAGE01K_PROBE_TOKEN: TOKEN };
    const get = await standaloneWorker.fetch(new Request('https://example.invalid/stage01k/run'), env);
    expect(get.status).toBe(404);
    const unavailable = await standaloneWorker.fetch(new Request('https://example.invalid/stage01k/run', {
      method: 'POST',
    }), { STAGING_DB: db });
    expect(unavailable.status).toBe(503);
    const denied = await standaloneWorker.fetch(new Request('https://example.invalid/stage01k/run', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token', 'X-Stage01K-Acknowledge': 'isolated-disposable-staging' },
    }), env);
    expect(denied.status).toBe(403);
    expect(await scratchCount()).toBe(0);
  });

  it('standalone Worker permits a deliberate, authenticated contract run only', async () => {
    await provisionGuard();
    const response = await standaloneWorker.fetch(new Request('https://example.invalid/stage01k/run', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'X-Stage01K-Acknowledge': 'isolated-disposable-staging',
      },
    }), { STAGING_DB: db, STAGE01K_PROBE_TOKEN: TOKEN });
    expect(response.status).toBe(200);
    const data: any = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.checks).toHaveLength(7);
    expect(await scratchCount()).toBe(2);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('Stage 01K config preflight is fail-closed and never contacts Cloudflare', () => {
  const production: Stage01KConfig = {
    name: 'iocl-digital-pump-manager', main: 'src/worker/index.ts',
    d1_databases: [{ binding: 'DB', database_name: 'iocl-pump-manager-d1',
      database_id: '11111111-1111-4111-8111-111111111111' }],
  };
  const safe: Stage01KConfig = {
    name: 'stage01k-d1-disposable-probe', main: 'scripts/stage01k/standaloneWorker.ts',
    d1_databases: [{ binding: 'STAGING_DB', database_name: 'stage01k-disposable-d1',
      database_id: '22222222-2222-4222-8222-222222222222' }],
  };

  it('accepts a distinct disposable staging config', () => {
    expect(() => verifyStage01KStagingConfig(safe, production)).not.toThrow();
  });

  it('rejects production database ID and database name reuse', () => {
    expect(() => verifyStage01KStagingConfig({ ...safe,
      d1_databases: [{ ...safe.d1_databases[0], database_id: production.d1_databases[0].database_id }],
    }, production)).toThrow('STAGE01K_STAGING_CONFIG_UNSAFE');
    expect(() => verifyStage01KStagingConfig({ ...safe,
      d1_databases: [{ ...safe.d1_databases[0], database_name: production.d1_databases[0].database_name }],
    }, production)).toThrow('STAGE01K_STAGING_CONFIG_UNSAFE');
  });

  it('rejects invalid UUIDs, wrong binding, wrong entrypoint and multiple D1s', () => {
    const variants: Stage01KConfig[] = [
      { ...safe, d1_databases: [{ ...safe.d1_databases[0], database_id: 'REPLACE_ME' }] },
      { ...safe, d1_databases: [{ ...safe.d1_databases[0], binding: 'DB' }] },
      { ...safe, main: 'src/worker/index.ts' },
      { ...safe, d1_databases: [...safe.d1_databases, ...safe.d1_databases] },
    ];
    variants.forEach(x => expect(() => verifyStage01KStagingConfig(x, production))
      .toThrow('STAGE01K_STAGING_CONFIG_UNSAFE'));
  });
});
