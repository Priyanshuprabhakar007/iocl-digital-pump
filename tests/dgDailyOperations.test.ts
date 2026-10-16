import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { DgOperationsService } from '../src/worker/services/dgOperationsService';

describe('DG Daily Operations Suite', () => {
  let localD1: any;
  let testDbPath: string;

  beforeAll(async () => {
    testDbPath = `./.sqlite/test_dg_ops_${Date.now()}.db`;
    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);
  });

  afterAll(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it('creates, lists, and updates a DG log entry', async () => {
    const db = getDb(localD1);
    const outletId = 'ro-1001';
    // Get a DG equipment
    const equipment = await db.query.equipmentAssets.findFirst({
        where: (table, {eq, and}) => and(eq(table.outletId, outletId), eq(table.equipmentType, 'DG_SET'))
    });
    
    expect(equipment).toBeDefined();

    const input = {
      outletId,
      equipmentId: equipment!.id,
      logDate: '2026-10-16',
      openingRunHours: 100,
      closingRunHours: 108,
      dieselConsumedLitres: 20,
      unitsGeneratedKwh: 50,
      openingDieselBalanceLitres: 100,
      dieselAddedLitres: 10,
      gridFailureDurationMinutes: 30,
      powerCutEventsCount: 2,
      remarks: 'Test log'
    };

    const created = await DgOperationsService.createLog(db, input, 'user-admin');
    expect(created.totalRunHours).toBe(8);
    expect(created.closingDieselBalanceLitres).toBe(100 + 10 - 20);

    const logs = await DgOperationsService.listLogsByOutlet(db, outletId);
    expect(logs.length).toBeGreaterThan(0);

    const updated = await DgOperationsService.updateLog(db, created.id, { dieselConsumedLitres: 25 });
    expect(updated.dieselConsumedLitres).toBe(25);
    expect(updated.closingDieselBalanceLitres).toBe(100 + 10 - 25);
  });
});
