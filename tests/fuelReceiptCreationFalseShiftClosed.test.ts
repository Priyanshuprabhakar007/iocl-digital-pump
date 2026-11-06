import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import * as schema from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';
import {
  evaluateReceiptBusinessDateAlignment,
  formatFuelReceiptErrorMessage,
} from '../src/frontend/pages/StockOperationsPage';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = './.sqlite/test_fuel_receipt_creation_false_shift_closed.db';

class MockR2Bucket {
  private store = new Map<string, { data: Uint8Array; metadata: Record<string, string> }>();
  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: item.data,
      arrayBuffer: async () => item.data.buffer,
      customMetadata: item.metadata,
    };
  }
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: any) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, { data, metadata: options?.customMetadata || {} });
    return { key, size: data.byteLength };
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

describe('Fuel Receipt Creation — False SHIFT_CLOSED Regression & Multi-Receipt Shift Guarantees', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${TEST_DB_PATH}${suffix}`;
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }

    localD1 = createLocalD1Database(TEST_DB_PATH);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      SESSION_SECRET: 'test-session-secret-key-12345678901234567890',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(async () => {
    if (localD1) {
      localD1.close();
    }
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${TEST_DB_PATH}${suffix}`;
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }
  });

  async function loginAs(email: string, password = 'Password@123') {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password }),
      }),
      env
    );
    const cookie = res.headers.get('set-cookie') || '';
    const json: any = await res.json();
    return { cookie, user: json.data?.user };
  }

  async function openShift(cookie: string, businessDate = '2026-11-02') {
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate,
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const json: any = await openRes.json();
    return json.data.id as string;
  }

  it('1. allows multiple distinct tanker receipts within one OPEN shift while previous receipts are ARRIVED or VERIFIED, and binds only D1-safe primitive parameters', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');
    const shiftId = await openShift(cookie, '2026-11-02');

    // Wrap localD1.prepare to assert that no raw JS boolean is ever bound to D1 statements
    const originalPrepare = localD1.prepare.bind(localD1);
    const boundParamTypes: string[] = [];
    localD1.prepare = (query: string) => {
      const stmt = originalPrepare(query);
      const origBind = stmt.bind.bind(stmt);
      stmt.bind = (...values: any[]) => {
        for (const v of values) {
          boundParamTypes.push(typeof v);
          if (typeof v === 'boolean') {
            throw new Error(`D1_TYPE_ERROR: Raw boolean value (${v}) passed to D1PreparedStatement.bind for query: ${query}`);
          }
        }
        return origBind(...values);
      };
      return stmt;
    };

    // Receipt #1: TT PB29AJ7443 — Invoice 19914781 (ARRIVED)
    const r1Res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'PB29AJ7443',
          invoiceNumber: '19914781',
          invoiceDate: '2026-11-02',
          arrivalAt: '2026-11-02T09:15:00.000Z',
          sealVerified: true,
          lines: [
            {
              tankId: 'tank-ro1-1',
              productId: 'prod-ms',
              invoiceQuantity: '12000.000',
              invoiceDensity: '740.000',
              density: '740.400',
              temperature: '27.500',
            },
          ],
        }),
      }),
      env
    );
    expect(r1Res.status).toBe(201);
    const r1Json: any = await r1Res.json();
    expect(r1Json.success).toBe(true);
    expect(r1Json.data.status).toBe('ARRIVED');
    expect(r1Json.data.invoiceNumber).toBe('19914781');
    const r1Id = r1Json.data.id as string;

    // Receipt #2: TT PB13AL9133 — Invoice 19932641 created while Receipt #1 is still ARRIVED
    const r2Res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'PB13AL9133',
          invoiceNumber: '19932641',
          invoiceDate: '2026-11-02',
          arrivalAt: '2026-11-02T11:30:00.000Z',
          sealVerified: true,
          lines: [
            {
              tankId: 'tank-ro1-2',
              productId: 'prod-hsd',
              invoiceQuantity: '18000.000',
              invoiceDensity: '830.000',
              density: '830.500',
              temperature: '28.000',
            },
          ],
        }),
      }),
      env
    );
    expect(r2Res.status).toBe(201);
    const r2Json: any = await r2Res.json();
    expect(r2Json.success).toBe(true);
    expect(r2Json.data.status).toBe('ARRIVED');
    expect(r2Json.data.invoiceNumber).toBe('19932641');

    // Transition Receipt #1 to VERIFIED
    const verifyR1Res = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${r1Id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'VERIFIED', sealVerified: true }),
      }),
      env
    );
    expect(verifyR1Res.status).toBe(200);

    // Receipt #3: TT PB10XY5566 — Multi-compartment receipt with sealVerified: false & sealExceptionReason
    // Created while Receipt #1 is VERIFIED and Receipt #2 is ARRIVED
    const r3Res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'PB10XY5566',
          invoiceNumber: '19940001',
          invoiceDate: '2026-11-02',
          arrivalAt: '2026-11-02T14:00:00.000Z',
          sealVerified: false,
          sealExceptionReason: 'Secondary dust seal wire slightly frayed; primary lock intact and verified by manager',
          lines: [
            {
              tankId: 'tank-ro1-1',
              productId: 'prod-ms',
              invoiceQuantity: '6000.000',
              invoiceDensity: '740.000',
              density: '740.200',
              temperature: '27.000',
            },
            {
              tankId: 'tank-ro1-3',
              productId: 'prod-xp95',
              invoiceQuantity: '6000.000',
              invoiceDensity: '748.000',
              density: '748.100',
              temperature: '27.000',
            },
          ],
        }),
      }),
      env
    );
    expect(r3Res.status).toBe(201);
    const r3Json: any = await r3Res.json();
    expect(r3Json.success).toBe(true);
    expect(r3Json.data.status).toBe('ARRIVED');
    expect(r3Json.data.sealVerified).toBe(false);
    expect(r3Json.data.lines).toHaveLength(2);
    expect(boundParamTypes).not.toContain('boolean');

    // Verify GET /shifts/:shiftId/fuel-receipts lists all 3 receipts without modifying existing statuses
    const listRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'GET',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(listRes.status).toBe(200);
    const listJson: any = await listRes.json();
    expect(listJson.data).toHaveLength(3);
    const byInvoice = Object.fromEntries(listJson.data.map((r: any) => [r.invoiceNumber, r]));
    expect(byInvoice['19914781'].status).toBe('VERIFIED');
    expect(byInvoice['19932641'].status).toBe('ARRIVED');
    expect(byInvoice['19940001'].status).toBe('ARRIVED');
  });

  it('2. genuinely rejects fuel receipt creation with HTTP 409 SHIFT_CLOSED when the shift is CLOSED or LOCKED', async () => {
    const { cookie, user } = await loginAs('dealer.parkstreet@iocl.in');
    const shiftId = await openShift(cookie, '2026-11-03');

    const db = getDb(localD1);
    await db
      .update(schema.operationalShifts)
      .set({ status: 'CLOSED', closedAt: new Date().toISOString() })
      .where(eq(schema.operationalShifts.id, shiftId));

    const closedRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'PB29AJ7443',
          invoiceNumber: 'INV-CLOSED-001',
          invoiceDate: '2026-11-03',
          arrivalAt: '2026-11-03T10:00:00.000Z',
          sealVerified: true,
          lines: [
            {
              tankId: 'tank-ro1-1',
              productId: 'prod-ms',
              invoiceQuantity: '12000.000',
              invoiceDensity: '740.000',
              density: '740.300',
              temperature: '27.000',
            },
          ],
        }),
      }),
      env
    );
    expect(closedRes.status).toBe(409);
    const closedJson: any = await closedRes.json();
    expect(closedJson.error.code).toBe('SHIFT_CLOSED');
    expect(closedJson.error.message).toContain('CLOSED');

    // Also test when shift becomes CLOSED right at the repository conditional boundary
    const nowIso = new Date().toISOString();
    const pumpRepo = new PumpRepository(db);
    const repoClosedResult = await pumpRepo.createFuelReceiptConditional(
      {
        id: 'fr-closed-test',
        outletId: 'ro-1001',
        operationalShiftId: shiftId,
        ttNumber: 'PB29AJ7443',
        invoiceNumber: 'INV-CLOSED-002',
        invoiceDate: '2026-11-03',
        arrivalAt: nowIso,
        sealVerified: true,
        sealExceptionReason: null,
        recordedByUserId: user?.id || 'user-dealer-1',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      [
        {
          id: 'frl-closed-test-1',
          fuelReceiptId: 'fr-closed-test',
          tankId: 'tank-ro1-1',
          productId: 'prod-ms',
          invoiceQuantityMilliunits: 12000000,
          densityMilliunits: 740300,
          temperatureMilliunits: 27000,
          invoiceDensityMilliunits: 740000,
          densityVarianceMilliunits: 300,
          qualityStatus: 'PASS',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ]
    );
    expect(repoClosedResult.success).toBe(false);
    expect(repoClosedResult.shiftClosed).toBe(true);
    expect(repoClosedResult.errorCode).toBe('SHIFT_CLOSED');
  });

  it('3. does NOT misreport database errors as SHIFT_CLOSED while the shift is OPEN (returns 500 RECEIPT_CREATE_FAILED and redacts SQL internals)', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');
    const shiftId = await openShift(cookie, '2026-11-04');

    // Simulate a database batch failure while the shift remains OPEN
    const originalBatch = localD1.batch.bind(localD1);
    localD1.batch = async () => {
      throw new Error('SQLITE_IOERR: disk I/O error while executing INSERT INTO fuel_receipts');
    };

    try {
      const failRes = await app.fetch(
        new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            ttNumber: 'PB29AJ7443',
            invoiceNumber: 'INV-DB-ERR-001',
            invoiceDate: '2026-11-04',
            arrivalAt: '2026-11-04T09:00:00.000Z',
            sealVerified: true,
            lines: [
              {
                tankId: 'tank-ro1-1',
                productId: 'prod-ms',
                invoiceQuantity: '12000.000',
                invoiceDensity: '740.000',
                density: '740.300',
                temperature: '27.000',
              },
            ],
          }),
        }),
        env
      );

      expect(failRes.status).toBe(500);
      const failJson: any = await failRes.json();
      expect(failJson.success).toBe(false);
      expect(failJson.error.code).toBe('RECEIPT_CREATE_FAILED');
      expect(failJson.error.code).not.toBe('SHIFT_CLOSED');
      // Must not leak internal SQLite or table details to the user
      expect(failJson.error.message).not.toMatch(/SQLITE_IOERR|fuel_receipts/i);
      expect(failJson.error.message).toContain('while the shift is OPEN');
    } finally {
      localD1.batch = originalBatch;
    }

    // Confirm shift is still OPEN and zero receipts were persisted
    const db = getDb(localD1);
    const shiftAfter = await db.query.operationalShifts.findFirst({
      where: eq(schema.operationalShifts.id, shiftId),
    });
    expect(shiftAfter?.status).toBe('OPEN');

    const receiptsAfter = await db.query.fuelReceipts.findMany({
      where: eq(schema.fuelReceipts.operationalShiftId, shiftId),
    });
    expect(receiptsAfter).toHaveLength(0);
  });

  it('4. handles duplicate invoice submissions, duplicate tank lines, idempotency replay, and re-entry after CANCELLED accurately without returning SHIFT_CLOSED', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');
    const shiftId = await openShift(cookie, '2026-11-05');

    const payload = {
      ttNumber: 'PB29AJ7443',
      invoiceNumber: '19950001',
      invoiceDate: '2026-11-05',
      arrivalAt: '2026-11-05T09:30:00.000Z',
      sealVerified: true,
      lines: [
        {
          tankId: 'tank-ro1-1',
          productId: 'prod-ms',
          invoiceQuantity: '12000.000',
          invoiceDensity: '740.000',
          density: '740.200',
          temperature: '27.000',
        },
      ],
    };

    // 4a. Idempotent submission with Idempotency-Key
    const idemKey = 'idem-receipt-19950001-key';
    const firstRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify(payload),
      }),
      env
    );
    expect(firstRes.status).toBe(201);
    const firstJson: any = await firstRes.json();
    const firstReceiptId = firstJson.data.id as string;

    // Retrying with the exact same Idempotency-Key replays the 201 response without creating a duplicate row
    const replayRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: 'http://localhost:3000',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify(payload),
      }),
      env
    );
    expect(replayRes.status).toBe(201);
    expect(replayRes.headers.get('X-Idempotent-Replay')).toBe('true');
    const replayJson: any = await replayRes.json();
    expect(replayJson.data.id).toBe(firstReceiptId);

    // 4b. Submitting another receipt with the same invoice number (without idempotency replay) returns 409 DUPLICATE_FUEL_RECEIPT_INVOICE (NOT SHIFT_CLOSED)
    const dupInvoiceRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ...payload,
          ttNumber: 'PB13AL9133',
        }),
      }),
      env
    );
    expect(dupInvoiceRes.status).toBe(409);
    const dupInvoiceJson: any = await dupInvoiceRes.json();
    expect(dupInvoiceJson.error.code).toBe('DUPLICATE_FUEL_RECEIPT_INVOICE');
    expect(dupInvoiceJson.error.code).not.toBe('SHIFT_CLOSED');
    expect(dupInvoiceJson.error.message).toContain('invoice number already exists');

    // 4c. Submitting a receipt with duplicate tankId lines returns 409 DUPLICATE_RECEIPT_TANK_LINE (NOT SHIFT_CLOSED)
    const dupTankLineRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'PB13AL9133',
          invoiceNumber: '19950002',
          invoiceDate: '2026-11-05',
          arrivalAt: '2026-11-05T11:00:00.000Z',
          sealVerified: true,
          lines: [
            {
              tankId: 'tank-ro1-1',
              productId: 'prod-ms',
              invoiceQuantity: '6000.000',
              invoiceDensity: '740.000',
              density: '740.200',
              temperature: '27.000',
            },
            {
              tankId: 'tank-ro1-1',
              productId: 'prod-ms',
              invoiceQuantity: '6000.000',
              invoiceDensity: '740.000',
              density: '740.200',
              temperature: '27.000',
            },
          ],
        }),
      }),
      env
    );
    expect(dupTankLineRes.status).toBe(409);
    const dupTankLineJson: any = await dupTankLineRes.json();
    expect(dupTankLineJson.error.code).toBe('DUPLICATE_RECEIPT_TANK_LINE');
    expect(dupTankLineJson.error.code).not.toBe('SHIFT_CLOSED');

    // 4d. If the original receipt is CANCELLED, re-creating a receipt with invoice 19950001 succeeds
    const cancelRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${firstReceiptId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          status: 'CANCELLED',
          cancellationReason: 'Entered wrong compartment volume on initial arrival entry',
        }),
      }),
      env
    );
    expect(cancelRes.status).toBe(200);

    const recreateRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify(payload),
      }),
      env
    );
    expect(recreateRes.status).toBe(201);
    const recreateJson: any = await recreateRes.json();
    expect(recreateJson.data.status).toBe('ARRIVED');
    expect(recreateJson.data.id).not.toBe(firstReceiptId);
  });

  it('5. guarantees atomicity of receipt header and receipt-line creation so failed line inserts never leave partial receipt records', async () => {
    const { cookie, user } = await loginAs('dealer.parkstreet@iocl.in');
    const shiftId = await openShift(cookie, '2026-11-06');

    const db = getDb(localD1);
    const pumpRepo = new PumpRepository(db);
    const nowIso = new Date().toISOString();

    // Attempt to create a receipt where the 2nd line references a non-existent productId (foreign key violation)
    const atomicFailResult = await pumpRepo.createFuelReceiptConditional(
      {
        id: 'fr-atomic-fail-1',
        outletId: 'ro-1001',
        operationalShiftId: shiftId,
        ttNumber: 'PB29AJ7443',
        invoiceNumber: 'INV-ATOMIC-FAIL-001',
        invoiceDate: '2026-11-06',
        arrivalAt: nowIso,
        sealVerified: true,
        sealExceptionReason: null,
        recordedByUserId: user?.id || 'user-dealer-1',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      [
        {
          id: 'frl-atomic-1',
          fuelReceiptId: 'fr-atomic-fail-1',
          tankId: 'tank-ro1-1',
          productId: 'prod-ms',
          invoiceQuantityMilliunits: 6000000,
          densityMilliunits: 740000,
          temperatureMilliunits: 27000,
          invoiceDensityMilliunits: 740000,
          densityVarianceMilliunits: 0,
          qualityStatus: 'PASS',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        {
          id: 'frl-atomic-2',
          fuelReceiptId: 'fr-atomic-fail-1',
          tankId: 'tank-ro1-2',
          productId: 'prod-non-existent-fk', // triggers FOREIGN KEY constraint failed on line 2
          invoiceQuantityMilliunits: 6000000,
          densityMilliunits: 830000,
          temperatureMilliunits: 27000,
          invoiceDensityMilliunits: 830000,
          densityVarianceMilliunits: 0,
          qualityStatus: 'PASS',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ]
    );

    expect(atomicFailResult.success).toBe(false);
    expect(atomicFailResult.shiftClosed).toBe(false);
    expect(atomicFailResult.errorCode).toBe('RECEIPT_CREATE_FAILED');

    // Verify neither the header nor line 1 remains in the database
    const orphanHeader = await db.query.fuelReceipts.findFirst({
      where: eq(schema.fuelReceipts.id, 'fr-atomic-fail-1'),
    });
    expect(orphanHeader).toBeUndefined();

    const orphanLines = await db.query.fuelReceiptTankLines.findMany({
      where: eq(schema.fuelReceiptTankLines.fuelReceiptId, 'fr-atomic-fail-1'),
    });
    expect(orphanLines).toHaveLength(0);
  });

  it('6. validates frontend business-date alignment warning (including overnight shift allowance), error formatting, pre-submit shift refresh, and form preservation', () => {
    // 6a. Exact match -> no warning
    const exactMatch = evaluateReceiptBusinessDateAlignment(
      '2026-11-02',
      '2026-11-02',
      '2026-11-02T10:30'
    );
    expect(exactMatch.hasWarning).toBe(false);
    expect(exactMatch.warningMessage).toBeNull();

    // 6b. Legitimate overnight shift: arrival on next calendar morning (businessDate + 1 day)
    const overnightArrival = evaluateReceiptBusinessDateAlignment(
      '2026-11-02',
      '2026-11-02',
      '2026-11-03T01:45'
    );
    expect(overnightArrival.hasWarning).toBe(true);
    expect(overnightArrival.isOvernightShiftAllowance).toBe(true);
    expect(overnightArrival.warningMessage).toContain('Overnight shift deliveries and prior-day terminal dispatches are permitted');

    // 6c. Prior-day terminal dispatch invoice (businessDate - 1 day)
    const priorDayInvoice = evaluateReceiptBusinessDateAlignment(
      '2026-11-02',
      '2026-11-01',
      '2026-11-02T06:15'
    );
    expect(priorDayInvoice.hasWarning).toBe(true);
    expect(priorDayInvoice.isOvernightShiftAllowance).toBe(true);
    expect(priorDayInvoice.warningMessage).toContain('Overnight shift deliveries and prior-day terminal dispatches are permitted');

    // 6d. Multi-day mismatch -> warning advising operator to verify selected shift
    const multiDayMismatch = evaluateReceiptBusinessDateAlignment(
      '2026-11-02',
      '2026-11-06',
      '2026-11-06T12:00'
    );
    expect(multiDayMismatch.hasWarning).toBe(true);
    expect(multiDayMismatch.isOvernightShiftAllowance).toBe(false);
    expect(multiDayMismatch.warningMessage).toContain('Date Mismatch Warning');

    // 6e. Safe backend error formatting vs raw SQL redaction
    expect(
      formatFuelReceiptErrorMessage(
        { code: 'DUPLICATE_FUEL_RECEIPT_INVOICE', message: 'A fuel receipt with this invoice number already exists for this outlet.' },
        'Fallback error'
      )
    ).toBe('A fuel receipt with this invoice number already exists for this outlet.');

    expect(
      formatFuelReceiptErrorMessage(
        { code: 'RECEIPT_CREATE_FAILED', message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: fuel_receipts.invoice_number' },
        'Safe fallback error'
      )
    ).toBe('Failed to record fuel receipt due to a database error. Please verify the receipt details and try again.');

    // 6f. Verify StockOperationsPage.tsx source contract for pre-submit shift refresh and form preservation on error
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/frontend/pages/StockOperationsPage.tsx'),
      'utf8'
    );
    // Refreshes shift status from backend before POSTing receipt
    expect(pageSource).toContain('apiFetch<OperationalShift>(`/api/v1/shifts/${selectedShiftId}`)');
    // Refreshes shift list and shift data on failure
    expect(pageSource).toContain('await loadShifts(selectedOutletId, selectedShiftId);');
    expect(pageSource).toContain('await loadShiftData(selectedShiftId);');
    // Displays receiptModalError and receiptDateWarning inside the modal
    expect(pageSource).toContain('data-testid="receipt-modal-error"');
    expect(pageSource).toContain('data-testid="receipt-date-warning"');
  });
});
