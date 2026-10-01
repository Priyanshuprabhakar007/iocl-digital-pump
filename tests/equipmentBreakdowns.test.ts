import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';

const TEST_DB_PATH = './.sqlite/test_equipment.db';

describe('Phase 3C-1 Equipment Breakdown Management Suite', () => {
  let localD1: any;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(TEST_DB_PATH);
    await seedDatabase(getDb(localD1));
  });

  it('Migration 0015 creates equipment tables', async () => {
    const db = getDb(localD1);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'equipment_%'");
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('equipment_assets');
    expect(tableNames).toContain('equipment_breakdown_tickets');
    expect(tableNames).toContain('equipment_breakdown_events');
  });

  it('Should successfully create an auxiliary asset', async () => {
      const response = await app.request('/api/v1/outlets/ro-1001/equipment/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer admin-token' },
          body: JSON.stringify({
              assetCode: 'ATG-001',
              equipmentType: 'ATG',
              name: 'Main Tank ATG',
              status: 'ACTIVE'
          })
      }, { DB: localD1 });
      expect(response.status).toBe(201);
      const data = await response.json() as any;
      expect(data.data.assetCode).toBe('ATG-001');
  });

  it('Should successfully create a breakdown ticket for a dispenser', async () => {
      // Need a valid dispenserId from seed. 
      // The dispenser 'disp-ro1-1' exists for 'ro-1001'.
      const response = await app.request('/api/v1/outlets/ro-1001/equipment/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer admin-token' },
          body: JSON.stringify({
              dispenserId: 'disp-ro1-1',
              priority: 'HIGH',
              failureCategory: 'MECHANICAL',
              description: 'Dispenser nozzle leaking',
              breakdownAt: new Date().toISOString()
          })
      }, { DB: localD1 });
      expect(response.status).toBe(201);
      const data = await response.json() as any;
      expect(data.data.equipmentTypeSnapshot).toBe('DISPENSER');
  });
});
