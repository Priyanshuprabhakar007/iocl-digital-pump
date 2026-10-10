import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';

describe('Phase 3 DU Nozzle Capacity & Fuel Topology Hardened Suite', () => {
  let env: { DB: any; DOCUMENTS_BUCKET: any };
  let dbPath: string;
  let localD1: any;
  let adminCookie = '';
  let dealerCookie = '';

  const getCookie = (res: Response) => {
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return '';
    return setCookie.split(';')[0];
  };

  const loginAs = async (email: string) => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password: 'Password@123' }),
      }),
      env
    );
    const cookie = getCookie(res);
    const json = (await res.json()) as any;
    return { res, cookie, json };
  };

  beforeEach(async () => {
    dbPath = `./.sqlite/test_phase3_du_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = { DB: localD1, DOCUMENTS_BUCKET: null as any };

    const adminLogin = await loginAs('admin@iocl.in');
    adminCookie = adminLogin.cookie;

    const dealerLogin = await loginAs('dealer.parkstreet@iocl.in');
    dealerCookie = dealerLogin.cookie;
  });

  afterEach(() => {
    try {
      localD1.close();
    } catch (e) {}

    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch (e) {}
  });

  // =========================================================================
  // 1. MIGRATION 0024 & DB CHECK CONSTRAINTS
  // =========================================================================

  it('1. Migration 0024 enforces nozzle_capacity CHECK (2, 4, 6) in database', async () => {
    const db = getDb(localD1);

    // Existing dispensers from seed should have valid nozzle_capacity
    const dispList = await db.select().from(schema.dispensers);
    expect(dispList.length).toBeGreaterThan(0);
    for (const d of dispList) {
      expect([2, 4, 6]).toContain(d.nozzleCapacity);
    }

    // Direct SQL inserts with valid capacity: 2, 4, 6 succeed
    for (const cap of [2, 4, 6]) {
      await localD1.prepare(`
        INSERT INTO dispensers (
          id, outlet_id, dispenser_number, name, nozzle_capacity, status, created_at, updated_at, created_by
        ) VALUES (
          'disp-valid-cap-${cap}', 'ro-1001', ${100 + cap}, 'DU Cap ${cap}', ${cap}, 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
        )
      `).run();
    }

    // Direct SQL inserts with invalid capacities: 1, 3, 5, 8 must fail SQLite CHECK constraint
    for (const invalidCap of [1, 3, 5, 8]) {
      await expect(
        localD1.prepare(`
          INSERT INTO dispensers (
            id, outlet_id, dispenser_number, name, nozzle_capacity, status, created_at, updated_at, created_by
          ) VALUES (
            'disp-invalid-cap-${invalidCap}', 'ro-1001', ${200 + invalidCap}, 'Invalid DU ${invalidCap}', ${invalidCap}, 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
          )
        `).run()
      ).rejects.toThrow();
    }
  });

  it('2. GLOBAL ADMIN creates XP100 product via POST /api/v1/products', async () => {
    const createRes = await app.fetch(
      new Request('http://localhost/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'XP100',
          name: 'XP100 Premium Petrol',
          category: 'XP100',
          unit: 'LITRE',
          status: 'ACTIVE',
        }),
      }),
      env
    );

    expect(createRes.status).toBe(201);
    const json = (await createRes.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.code).toBe('XP100');
    expect(json.data.category).toBe('XP100');
    expect(json.data.unit).toBe('LITRE');
    expect(json.data.status).toBe('ACTIVE');
  });

  // =========================================================================
  // 2. DB TRIGGER INTEGRITY: NOZZLE CAPACITY PROTECTION
  // =========================================================================

  it('3. Direct SQL insert of nozzle with nozzle_number > dispenser nozzle_capacity is aborted by trigger', async () => {
    // disp-ro1-1 has nozzleCapacity = 4. Attempt to insert nozzle #5 directly
    await expect(
      localD1.prepare(`
        INSERT INTO nozzles (
          id, outlet_id, dispenser_id, nozzle_number, product_id, tank_id, status, created_at, updated_at, created_by
        ) VALUES (
          'nozz-exceed', 'ro-1001', 'disp-ro1-1', 5, 'prod-ms', 'tank-ro1-1', 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
        )
      `).run()
    ).rejects.toThrow('NOZZLE_CAPACITY_EXCEEDED');
  });

  it('4. Direct SQL insert of nozzle with nozzle_number < 1 is aborted by trigger', async () => {
    await expect(
      localD1.prepare(`
        INSERT INTO nozzles (
          id, outlet_id, dispenser_id, nozzle_number, product_id, tank_id, status, created_at, updated_at, created_by
        ) VALUES (
          'nozz-zero', 'ro-1001', 'disp-ro1-1', 0, 'prod-ms', 'tank-ro1-1', 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
        )
      `).run()
    ).rejects.toThrow('NOZZLE_CAPACITY_EXCEEDED');
  });

  it('5. Direct SQL update of nozzle_number > dispenser nozzle_capacity is aborted by trigger', async () => {
    // Existing nozzle is nozz-ro1-1-1 on disp-ro1-1 (capacity 4). Update to #7
    await expect(
      localD1.prepare(`
        UPDATE nozzles SET nozzle_number = 7 WHERE id = 'nozz-ro1-1-1'
      `).run()
    ).rejects.toThrow('NOZZLE_CAPACITY_EXCEEDED');
  });

  // =========================================================================
  // 3. DB TRIGGER INTEGRITY: DISPENSER CAPACITY REDUCTION GUARD
  // =========================================================================

  it('6. Reducing dispenser nozzle_capacity below existing configured nozzles is aborted by trigger', async () => {
    // disp-ro1-1 has nozzle 1 and nozzle 2.
    // Insert nozzle 3 (allowed since capacity is 4)
    await localD1.prepare(`
      INSERT INTO nozzles (
        id, outlet_id, dispenser_id, nozzle_number, product_id, tank_id, status, created_at, updated_at, created_by
      ) VALUES (
        'nozz-ro1-1-3', 'ro-1001', 'disp-ro1-1', 3, 'prod-ms', 'tank-ro1-1', 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
      )
    `).run();

    // Now try reducing capacity to 2 -> must be rejected because nozzle #3 exists
    await expect(
      localD1.prepare(`
        UPDATE dispensers SET nozzle_capacity = 2 WHERE id = 'disp-ro1-1'
      `).run()
    ).rejects.toThrow('DISPENSER_CAPACITY_BELOW_EXISTING_NOZZLES');
  });

  it('7. Reducing dispenser nozzle_capacity when all nozzles are within new capacity succeeds', async () => {
    // disp-ro1-2 has nozzles 1 and 2, capacity 4. Reducing to 2 should succeed
    await localD1.prepare(`
      UPDATE dispensers SET nozzle_capacity = 2 WHERE id = 'disp-ro1-2'
    `).run();

    const db = getDb(localD1);
    const [d] = await db.select().from(schema.dispensers).where(eq(schema.dispensers.id, 'disp-ro1-2'));
    expect(d.nozzleCapacity).toBe(2);
  });

  // =========================================================================
  // 4. DB TRIGGER INTEGRITY: TOPOLOGY & CROSS-OUTLET MAPPING
  // =========================================================================

  it('8. Direct SQL insert of nozzle with dispenser from different outlet is aborted', async () => {
    await expect(
      localD1.prepare(`
        INSERT INTO nozzles (
          id, outlet_id, dispenser_id, nozzle_number, product_id, tank_id, status, created_at, updated_at, created_by
        ) VALUES (
          'nozz-wrong-disp', 'ro-1002', 'disp-ro1-1', 3, 'prod-ms', 'tank-ro1-1', 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
        )
      `).run()
    ).rejects.toThrow('NOZZLE_DISPENSER_OUTLET_MISMATCH');
  });

  it('9. Direct SQL insert of nozzle with tank from different outlet is aborted', async () => {
    // Create tank at ro-1002
    await localD1.prepare(`
      INSERT INTO tanks (
        id, outlet_id, tank_number, name, product_id, capacity_litres, safe_fill_capacity_litres, minimum_operating_level_litres, status, created_at, updated_at, created_by
      ) VALUES (
        'tank-ro2-1', 'ro-1002', 1, 'Tank RO2 MS', 'prod-ms', 20000, 19000, 1000, 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
      )
    `).run();

    await expect(
      localD1.prepare(`
        INSERT INTO nozzles (
          id, outlet_id, dispenser_id, nozzle_number, product_id, tank_id, status, created_at, updated_at, created_by
        ) VALUES (
          'nozz-wrong-tank', 'ro-1001', 'disp-ro1-1', 3, 'prod-ms', 'tank-ro2-1', 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
        )
      `).run()
    ).rejects.toThrow('NOZZLE_TANK_OUTLET_MISMATCH');
  });

  it('10. Direct SQL insert of nozzle with product mismatched from tank product is aborted', async () => {
    // tank-ro1-1 is MS product. Try attaching HSD nozzle to MS tank
    await expect(
      localD1.prepare(`
        INSERT INTO nozzles (
          id, outlet_id, dispenser_id, nozzle_number, product_id, tank_id, status, created_at, updated_at, created_by
        ) VALUES (
          'nozz-mismatch', 'ro-1001', 'disp-ro1-1', 3, 'prod-hsd', 'tank-ro1-1', 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
        )
      `).run()
    ).rejects.toThrow('NOZZLE_TANK_PRODUCT_MISMATCH');
  });

  it('11. Direct SQL insert of nozzle with product not mapped to retail outlet is aborted', async () => {
    // CNG is not mapped to ro-1001 outlet_products.
    // Create a CNG tank at ro-1001 (for testing trigger)
    await localD1.prepare(`
      INSERT INTO tanks (
        id, outlet_id, tank_number, name, product_id, capacity_litres, safe_fill_capacity_litres, minimum_operating_level_litres, status, created_at, updated_at, created_by
      ) VALUES (
        'tank-ro1-cng', 'ro-1001', 9, 'Tank CNG', 'prod-cng', 5000, 4500, 500, 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
      )
    `).run();

    await expect(
      localD1.prepare(`
        INSERT INTO nozzles (
          id, outlet_id, dispenser_id, nozzle_number, product_id, tank_id, status, created_at, updated_at, created_by
        ) VALUES (
          'nozz-unmapped', 'ro-1001', 'disp-ro1-1', 3, 'prod-cng', 'tank-ro1-cng', 'ACTIVE', datetime('now'), datetime('now'), 'user-admin'
        )
      `).run()
    ).rejects.toThrow('NOZZLE_OUTLET_PRODUCT_NOT_MAPPED');
  });

  // =========================================================================
  // 5. API LEVEL: DISPENSER CREATION & CAPACITY VALIDATION
  // =========================================================================

  it('12. API supports creating 2, 4, and 6 nozzle dispensers and rejects invalid capacities', async () => {
    // 2-nozzle dispenser
    const res2 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dispenserNumber: 10,
          name: 'DU 2-Nozzle Unit',
          manufacturer: 'Wayne Dresser',
          model: 'Helix 1000',
          nozzleCapacity: 2,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(res2.status).toBe(201);
    const data2 = (await res2.json()) as any;
    expect(data2.data.nozzleCapacity).toBe(2);

    // 4-nozzle dispenser
    const res4 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dispenserNumber: 11,
          name: 'DU 4-Nozzle Unit',
          nozzleCapacity: 4,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(res4.status).toBe(201);
    const data4 = (await res4.json()) as any;
    expect(data4.data.nozzleCapacity).toBe(4);

    // 6-nozzle dispenser (default when omitted)
    const res6 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dispenserNumber: 12,
          name: 'DU 6-Nozzle Unit (Default)',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(res6.status).toBe(201);
    const data6 = (await res6.json()) as any;
    expect(data6.data.nozzleCapacity).toBe(6);

    // Invalid capacity (3) rejected with 400 validation error
    const resInvalid = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dispenserNumber: 13,
          name: 'Invalid DU',
          nozzleCapacity: 3,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(resInvalid.status).toBe(400);
  });

  it('13. API enforces nozzle capacity limits on 2, 4, and 6 nozzle DUs', async () => {
    // 2-nozzle DU: #1 succeeds, #2 succeeds, #3 rejected
    const du2Res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ dispenserNumber: 20, name: '2-Nozzle DU', nozzleCapacity: 2, status: 'ACTIVE' }),
      }),
      env
    );
    const du2 = ((await du2Res.json()) as any).data;

    const nozz1 = await app.fetch(new Request(`http://localhost/api/v1/dispensers/${du2.id}/nozzles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' }, body: JSON.stringify({ nozzleNumber: 1, productId: 'prod-ms', tankId: 'tank-ro1-1', status: 'ACTIVE' }) }), env);
    expect(nozz1.status).toBe(201);

    const nozz2 = await app.fetch(new Request(`http://localhost/api/v1/dispensers/${du2.id}/nozzles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' }, body: JSON.stringify({ nozzleNumber: 2, productId: 'prod-hsd', tankId: 'tank-ro1-2', status: 'ACTIVE' }) }), env);
    expect(nozz2.status).toBe(201);

    const nozz3 = await app.fetch(new Request(`http://localhost/api/v1/dispensers/${du2.id}/nozzles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' }, body: JSON.stringify({ nozzleNumber: 3, productId: 'prod-ms', tankId: 'tank-ro1-1', status: 'ACTIVE' }) }), env);
    expect(nozz3.status).toBe(400);

    // 4-nozzle DU: #4 succeeds, #5 rejected
    const du4Res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ dispenserNumber: 21, name: '4-Nozzle DU', nozzleCapacity: 4, status: 'ACTIVE' }),
      }),
      env
    );
    const du4 = ((await du4Res.json()) as any).data;

    const nozz4 = await app.fetch(new Request(`http://localhost/api/v1/dispensers/${du4.id}/nozzles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' }, body: JSON.stringify({ nozzleNumber: 4, productId: 'prod-ms', tankId: 'tank-ro1-1', status: 'ACTIVE' }) }), env);
    expect(nozz4.status).toBe(201);

    const nozz5 = await app.fetch(new Request(`http://localhost/api/v1/dispensers/${du4.id}/nozzles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' }, body: JSON.stringify({ nozzleNumber: 5, productId: 'prod-ms', tankId: 'tank-ro1-1', status: 'ACTIVE' }) }), env);
    expect(nozz5.status).toBe(400);

    // 6-nozzle DU: #6 succeeds, #7 rejected
    const du6Res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ dispenserNumber: 22, name: '6-Nozzle DU', nozzleCapacity: 6, status: 'ACTIVE' }),
      }),
      env
    );
    const du6 = ((await du6Res.json()) as any).data;

    const nozz6 = await app.fetch(new Request(`http://localhost/api/v1/dispensers/${du6.id}/nozzles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' }, body: JSON.stringify({ nozzleNumber: 6, productId: 'prod-ms', tankId: 'tank-ro1-1', status: 'ACTIVE' }) }), env);
    expect(nozz6.status).toBe(201);

    const nozz7 = await app.fetch(new Request(`http://localhost/api/v1/dispensers/${du6.id}/nozzles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' }, body: JSON.stringify({ nozzleNumber: 7, productId: 'prod-ms', tankId: 'tank-ro1-1', status: 'ACTIVE' }) }), env);
    expect(nozz7.status).toBe(400);
  });

  it('14. API rejects reducing dispenser nozzle capacity below existing nozzles (HTTP 409)', async () => {
    // disp-ro1-1 has nozzle 1 and nozzle 2
    // Add nozzle 3 (capacity is 4)
    const addNozz3 = await app.fetch(
      new Request(`http://localhost/api/v1/dispensers/disp-ro1-1/nozzles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleNumber: 3,
          productId: 'prod-ms',
          tankId: 'tank-ro1-1',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(addNozz3.status).toBe(201);

    // Attempt to reduce disp-ro1-1 nozzleCapacity from 4 to 2
    const updateRes = await app.fetch(
      new Request(`http://localhost/api/v1/dispensers/disp-ro1-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleCapacity: 2,
        }),
      }),
      env
    );
    expect(updateRes.status).toBe(409);
    const updateJson = (await updateRes.json()) as any;
    expect(updateJson.error.code).toBe('DISPENSER_CAPACITY_BELOW_EXISTING_NOZZLES');

    // Increasing capacity from 4 to 6 succeeds
    const incRes = await app.fetch(
      new Request(`http://localhost/api/v1/dispensers/disp-ro1-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleCapacity: 6,
        }),
      }),
      env
    );
    expect(incRes.status).toBe(200);
    const incJson = (await incRes.json()) as any;
    expect(incJson.data.nozzleCapacity).toBe(6);
  });

  // =========================================================================
  // 6. PRODUCT REGRESSION TESTS (MS, HSD, XP95, XTRAGREEN, CNG)
  // =========================================================================

  it('15. Standard fuel products (MS, HSD, XP95, XTRAGREEN) support liquid tanks and nozzles', async () => {
    const db = getDb(localD1);
    const allProducts = await db.select().from(schema.products);
    const codes = allProducts.map(p => p.code);

    expect(codes).toContain('MS');
    expect(codes).toContain('HSD');
    expect(codes).toContain('XP95');
    expect(codes).toContain('XTRAGREEN');

    // CNG/KG product rejects liquid tank creation
    const cngProd = allProducts.find(p => p.code === 'CNG');
    expect(cngProd).toBeDefined();

    const cngTankRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankNumber: 99,
          name: 'Invalid CNG Tank',
          productId: cngProd!.id,
          capacityLitres: 10000,
          safeFillCapacityLitres: 9000,
          minimumOperatingLevelLitres: 1000,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(cngTankRes.status).toBe(400);
    const cngJson = (await cngTankRes.json()) as any;
    expect(cngJson.error.code).toBe('UNIT_NOT_SUPPORTED_BY_LIQUID_TANK');
  });

  // =========================================================================
  // 7. END-TO-END XP100 FUEL TOPOLOGY WORKFLOW
  // =========================================================================

  it('16. Complete XP100 physical fuel topology: Admin Create Product -> Outlet Map -> Tank -> 4-Nozzle DU -> Nozzle', async () => {
    // Step 1: Admin creates XP100 in product catalog
    const createProdRes = await app.fetch(
      new Request('http://localhost/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'XP100',
          name: 'XP100 Premium Petrol',
          category: 'XP100',
          unit: 'LITRE',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(createProdRes.status).toBe(201);
    const xp100 = ((await createProdRes.json()) as any).data;
    expect(xp100.code).toBe('XP100');

    // Step 2: Map XP100 to Retail Outlet (Park Street RO ro-1001)
    const mapRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          productId: xp100.id,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(mapRes.status).toBe(201);

    // Step 3: Create dedicated Underground Tank for XP100 (Tank 4)
    const tankRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankNumber: 4,
          name: 'Tank 4 - XP100 Octane Premium (10 KL)',
          productId: xp100.id,
          capacityLitres: 10000,
          safeFillCapacityLitres: 9500,
          minimumOperatingLevelLitres: 500,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(tankRes.status).toBe(201);
    const tank = ((await tankRes.json()) as any).data;
    expect(tank.productId).toBe(xp100.id);

    // Step 4: Create a dedicated 4-nozzle DU (MPD #3)
    const duRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dispenserNumber: 3,
          name: 'Multi-Product Dispenser 03 (XP100 Premium)',
          manufacturer: 'Gilbarco',
          model: 'Encore 700 S',
          serialNumber: 'GB-XP100-2024',
          nozzleCapacity: 4,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(duRes.status).toBe(201);
    const du = ((await duRes.json()) as any).data;
    expect(du.nozzleCapacity).toBe(4);

    // Step 5: Configure XP100 Nozzle #1 on MPD #3
    const nozzleRes = await app.fetch(
      new Request(`http://localhost/api/v1/dispensers/${du.id}/nozzles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleNumber: 1,
          productId: xp100.id,
          tankId: tank.id,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(nozzleRes.status).toBe(201);
    const nozzle = ((await nozzleRes.json()) as any).data;
    expect(nozzle.nozzleNumber).toBe(1);
    expect(nozzle.productId).toBe(xp100.id);
    expect(nozzle.tankId).toBe(tank.id);
    expect(nozzle.dispenserId).toBe(du.id);

    // Step 6: Verify nozzle listing includes enriched tank and dispenser data
    const listRes = await app.fetch(
      new Request(`http://localhost/api/v1/dispensers/${du.id}/nozzles`, {
        method: 'GET',
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(listRes.status).toBe(200);
    const listJson = ((await listRes.json()) as any).data;
    expect(listJson.length).toBe(1);
    expect(listJson[0].productCode).toBe('XP100');
    expect(listJson[0].dispenserNumber).toBe(3);
    expect(listJson[0].tankNumber).toBe(4);
  });
});
