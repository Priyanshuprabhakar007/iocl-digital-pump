import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import * as schema from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';
import {
  evaluateReceiptCompletionReadiness,
  summarizeShiftReceiptReadiness,
} from '../src/frontend/pages/StockOperationsPage';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = './.sqlite/test_fuel_receipt_completion_shift_close.db';

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

describe('Fuel Receipt Lifecycle Completion, Audited Cancellation, Stock Reconciliation & Shift Closing', () => {
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

  async function setupShiftWithOpeningClosingAndNozzles(cookie: string, businessDate: string) {
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
    const shiftId = ((await openRes.json()) as any).data.id as string;

    // Record OPENING tank readings for all 3 tanks:
    // Tank 1 (MS): 1000mm -> 8500 L
    // Tank 2 (HSD): 1000mm -> 9500 L
    // Tank 3 (XP95): 1000mm -> 6800 L
    for (const tankId of ['tank-ro1-1', 'tank-ro1-2', 'tank-ro1-3']) {
      const r = await app.fetch(
        new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            tankId,
            readingType: 'OPENING',
            source: 'MANUAL',
            productDipMm: '1000.000',
            waterDipMm: '0.000',
          }),
        }),
        env
      );
      expect(r.status).toBe(201);
    }

    // Record nozzle readings for all 4 active nozzles:
    // MS sales: 500 L + 300 L = 800 L
    // HSD sales: 800 L + 200 L = 1000 L
    const nozzlePayloads = [
      { nozzleId: 'nozz-ro1-1-1', openingTotalizer: '1000.000', closingTotalizer: '1500.000', testingQuantity: '0.000' },
      { nozzleId: 'nozz-ro1-1-2', openingTotalizer: '2000.000', closingTotalizer: '2800.000', testingQuantity: '0.000' },
      { nozzleId: 'nozz-ro1-2-1', openingTotalizer: '3000.000', closingTotalizer: '3300.000', testingQuantity: '0.000' },
      { nozzleId: 'nozz-ro1-2-2', openingTotalizer: '4000.000', closingTotalizer: '4200.000', testingQuantity: '0.000' },
    ];
    for (const np of nozzlePayloads) {
      const r = await app.fetch(
        new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify(np),
        }),
        env
      );
      expect(r.status).toBe(201);
    }

    // Record CLOSING tank readings for all 3 tanks:
    // Tank 1 (MS): 1250mm -> 11500 L
    // Tank 2 (HSD): 1000mm -> 9500 L
    // Tank 3 (XP95): 1000mm -> 6800 L
    const closingDips = [
      { tankId: 'tank-ro1-1', dip: '1250.000' },
      { tankId: 'tank-ro1-2', dip: '1000.000' },
      { tankId: 'tank-ro1-3', dip: '1000.000' },
    ];
    for (const cd of closingDips) {
      const r = await app.fetch(
        new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            tankId: cd.tankId,
            readingType: 'CLOSING',
            source: 'MANUAL',
            productDipMm: cd.dip,
            waterDipMm: '0.000',
          }),
        }),
        env
      );
      expect(r.status).toBe(201);
    }

    return shiftId;
  }

  it('1. Shift 2026-11-02 with two ARRIVED receipts (TT PB29AJ7443 Inv 19914781 & TT PB13AL9133 Inv 19932641) blocks shift close until one is COMPLETED via PRE/POST dips and the second is CANCELLED with an audit reason', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');
    const shiftId = await setupShiftWithOpeningClosingAndNozzles(dealerCookie, '2026-11-02');

    // Create the two ARRIVED fuel receipts from the production scenario:
    // Receipt 1: TT PB29AJ7443 — Invoice 19914781 (MS into Tank #1, Invoice Qty 5400.000 L)
    const createR1Res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
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
              invoiceQuantity: '5400.000',
              density: '744.500',
              invoiceDensity: '744.000',
              temperature: '28.500',
            },
          ],
        }),
      }),
      env
    );
    expect(createR1Res.status).toBe(201);
    const receipt1 = ((await createR1Res.json()) as any).data;
    expect(receipt1.status).toBe('ARRIVED');

    // Receipt 2: TT PB13AL9133 — Invoice 19932641 (HSD into Tank #2, Invoice Qty 12000.000 L)
    const createR2Res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'PB13AL9133',
          invoiceNumber: '19932641',
          invoiceDate: '2026-11-02',
          arrivalAt: '2026-11-02T10:30:00.000Z',
          sealVerified: true,
          lines: [
            {
              tankId: 'tank-ro1-2',
              productId: 'prod-hsd',
              invoiceQuantity: '12000.000',
              density: '830.000',
              invoiceDensity: '829.500',
              temperature: '29.000',
            },
          ],
        }),
      }),
      env
    );
    expect(createR2Res.status).toBe(201);
    const receipt2 = ((await createR2Res.json()) as any).data;
    expect(receipt2.status).toBe('ARRIVED');

    // Verify shift receipt summary reports 2 pending receipts blocking shift close
    const listBeforeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const receiptsBefore = ((await listBeforeRes.json()) as any).data;
    const summaryBefore = summarizeShiftReceiptReadiness(receiptsBefore);
    expect(summaryBefore.totalReceipts).toBe(2);
    expect(summaryBefore.pendingReceipts.length).toBe(2);
    expect(summaryBefore.allReceiptsFinalized).toBe(false);
    expect(summaryBefore.shiftCloseBlockedByReceipts).toBe(true);

    // Attempt to close shift while both receipts are ARRIVED -> 400 INCOMPLETE_RECEIPTS
    const blockedCloseRes1 = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Closing shift check' }),
      }),
      env
    );
    expect(blockedCloseRes1.status).toBe(400);
    const blockedCloseBody1: any = await blockedCloseRes1.json();
    expect(blockedCloseBody1.error.code).toBe('INCOMPLETE_RECEIPTS');
    expect(blockedCloseBody1.error.message).toMatch(/PB29AJ7443|PB13AL9133/);
    expect(blockedCloseBody1.error.message).toContain('ARRIVED');

    // Verify frontend completion readiness helper reports exact missing requirements for Receipt 1
    const readingsInitialRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const readingsInitial = ((await readingsInitialRes.json()) as any).data;
    const r1ReadinessInitial = evaluateReceiptCompletionReadiness(receipt1, readingsInitial);
    expect(r1ReadinessInitial.canComplete).toBe(false);
    expect(r1ReadinessInitial.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Missing PRE_RECEIPT tank dip reading'),
        expect.stringContaining('Missing POST_RECEIPT tank dip reading'),
        expect.stringContaining('Receipt status is ARRIVED'),
      ])
    );

    // Step 1 for Receipt 1 (TT PB29AJ7443): Transition ARRIVED -> VERIFIED
    const verifyR1Res = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receipt1.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'VERIFIED', sealVerified: true }),
      }),
      env
    );
    expect(verifyR1Res.status).toBe(200);
    expect(((await verifyR1Res.json()) as any).data.status).toBe('VERIFIED');

    // Step 2 for Receipt 1: Transition VERIFIED -> DECANTED (before linking readings)
    const decantR1Res = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receipt1.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          status: 'DECANTED',
          decantationStartedAt: '2026-11-02T09:30:00.000Z',
        }),
      }),
      env
    );
    expect(decantR1Res.status).toBe(200);
    const r1Decanted = ((await decantR1Res.json()) as any).data;
    expect(r1Decanted.status).toBe('DECANTED');

    // Attempt to COMPLETE Receipt 1 while PRE/POST readings are still missing -> 400 INCOMPLETE_LINE_DECANTATION
    const prematureCompleteRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receipt1.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      }),
      env
    );
    expect(prematureCompleteRes.status).toBe(400);
    expect(((await prematureCompleteRes.json()) as any).error.code).toBe('INCOMPLETE_LINE_DECANTATION');

    // Record actual PRE_RECEIPT tank dip on Tank #1 (500.000 mm -> 3100.000 L net)
    const preDipRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'PRE_RECEIPT',
          source: 'MANUAL',
          productDipMm: '500.000',
          waterDipMm: '0.000',
          notes: 'PRE_RECEIPT dip for TT PB29AJ7443 / Inv 19914781',
        }),
      }),
      env
    );
    expect(preDipRes.status).toBe(201);
    const preReading = ((await preDipRes.json()) as any).data;
    expect(preReading.netProductVolumeStr).toBe('3100.000');

    // Ensure strictly later timestamp for POST_RECEIPT reading
    await new Promise(resolve => setTimeout(resolve, 10));

    // Record actual POST_RECEIPT tank dip on Tank #1 (1000.000 mm -> 8500.000 L net; measured received = 5400.000 L)
    const postDipRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'POST_RECEIPT',
          source: 'MANUAL',
          productDipMm: '1000.000',
          waterDipMm: '0.000',
          notes: 'POST_RECEIPT dip for TT PB29AJ7443 / Inv 19914781',
        }),
      }),
      env
    );
    expect(postDipRes.status).toBe(201);
    const postReading = ((await postDipRes.json()) as any).data;
    expect(postReading.netProductVolumeStr).toBe('8500.000');

    // Link PRE_RECEIPT and POST_RECEIPT readings to Receipt 1 line & verify measured received volume & quality
    const r1LineId = receipt1.lines[0].id;
    const linkR1LineRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipt-lines/${r1LineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          preDecantReadingId: preReading.id,
          postDecantReadingId: postReading.id,
          density: '744.500',
          invoiceDensity: '744.000',
          temperature: '28.500',
        }),
      }),
      env
    );
    expect(linkR1LineRes.status).toBe(200);
    const updatedR1Line = ((await linkR1LineRes.json()) as any).data;
    expect(updatedR1Line.measuredReceivedQuantityStr).toBe('5400.000');
    expect(updatedR1Line.receiptVarianceStr).toBe('0.000');
    expect(updatedR1Line.qualityStatus).toBe('PASS');

    // Fetch updated receipt & readings and verify frontend readiness helper reports canComplete = true
    const r1AfterLinkRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receipt1.id}`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const r1AfterLink = ((await r1AfterLinkRes.json()) as any).data;
    const readingsAfterDipsRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const readingsAfterDips = ((await readingsAfterDipsRes.json()) as any).data;
    const r1ReadinessReady = evaluateReceiptCompletionReadiness(r1AfterLink, readingsAfterDips);
    expect(r1ReadinessReady.canComplete).toBe(true);
    expect(r1ReadinessReady.missingRequirements).toEqual([]);

    // Step 3 for Receipt 1: Transition DECANTED -> COMPLETED
    const completeR1Res = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receipt1.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          status: 'COMPLETED',
          decantationCompletedAt: '2026-11-02T10:10:00.000Z',
        }),
      }),
      env
    );
    expect(completeR1Res.status).toBe(200);
    const r1Completed = ((await completeR1Res.json()) as any).data;
    expect(r1Completed.status).toBe('COMPLETED');
    expect(r1Completed.lines[0].measuredReceivedQuantityStr).toBe('5400.000');

    // Shift close must STILL be blocked because Receipt 2 (TT PB13AL9133) is still ARRIVED
    const blockedCloseRes2 = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Closing shift check' }),
      }),
      env
    );
    expect(blockedCloseRes2.status).toBe(400);
    const blockedCloseBody2: any = await blockedCloseRes2.json();
    expect(blockedCloseBody2.error.code).toBe('INCOMPLETE_RECEIPTS');
    expect(blockedCloseBody2.error.message).toContain('PB13AL9133');
    expect(blockedCloseBody2.error.message).toContain('19932641');

    // Now test Authorised Cancellation for Receipt 2 (TT PB13AL9133 — Invoice 19932641):
    // First verify too-short cancellationReason is rejected with 400 VALIDATION_ERROR
    const shortCancelRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receipt2.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          status: 'CANCELLED',
          cancellationReason: 'no',
        }),
      }),
      env
    );
    expect(shortCancelRes.status).toBe(400);

    // Valid authorised cancellation with audit reason
    const auditReason = 'Duplicate invoice entry — tanker PB13AL9133 reassigned to next day shift';
    const cancelR2Res = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receipt2.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          status: 'CANCELLED',
          cancellationReason: auditReason,
        }),
      }),
      env
    );
    expect(cancelR2Res.status).toBe(200);
    const r2Cancelled = ((await cancelR2Res.json()) as any).data;
    expect(r2Cancelled.status).toBe('CANCELLED');
    expect(r2Cancelled.sealExceptionReason).toContain(auditReason);

    // Verify historical record is preserved in DB and audit log contains cancellationReason
    const db = getDb(localD1);
    const auditRows = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, receipt2.id));
    const statusUpdateAudit = auditRows.find(a => a.action === 'FUEL_RECEIPT_STATUS_UPDATE');
    expect(statusUpdateAudit).toBeDefined();
    expect(statusUpdateAudit!.newValueJson).toContain(auditReason);

    // Verify all receipts for the shift are now finalised
    const listAfterRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const receiptsAfter = ((await listAfterRes.json()) as any).data;
    const summaryAfter = summarizeShiftReceiptReadiness(receiptsAfter);
    expect(summaryAfter.allReceiptsFinalized).toBe(true);
    expect(summaryAfter.shiftCloseBlockedByReceipts).toBe(false);
    expect(summaryAfter.completedCount).toBe(1);
    expect(summaryAfter.cancelledCount).toBe(1);

    // Recompute Stock Reconciliation and verify only COMPLETED receipt volume (5400.000 L on Tank #1) is included,
    // while CANCELLED receipt volume (12000.000 L on Tank #2) is excluded (0.000 L)
    const computeReconRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/stock-reconciliation/compute`, {
        method: 'POST',
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(computeReconRes.status).toBe(200);

    const getReconRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/stock-reconciliation`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(getReconRes.status).toBe(200);
    const reconData = ((await getReconRes.json()) as any).data;
    const tank1Recon = reconData.byTank.find((t: any) => t.tankId === 'tank-ro1-1');
    const tank2Recon = reconData.byTank.find((t: any) => t.tankId === 'tank-ro1-2');

    expect(tank1Recon.openingStockStr).toBe('8500.000');
    expect(tank1Recon.receiptQuantityStr).toBe('5400.000');
    expect(tank1Recon.salesQuantityStr).toBe('800.000');
    // Theoretical closing for Tank 1 = 8500 + 5400 - 800 = 13100.000 L
    expect(tank1Recon.theoreticalClosingStockStr).toBe('13100.000');

    expect(tank2Recon.openingStockStr).toBe('9500.000');
    expect(tank2Recon.receiptQuantityStr).toBe('0.000'); // Cancelled receipt excluded
    expect(tank2Recon.salesQuantityStr).toBe('1000.000');
    expect(tank2Recon.theoreticalClosingStockStr).toBe('8500.000');

    // Finally close the operational shift — succeeds with 200 OK and status CLOSED
    const finalCloseRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ varianceReason: 'Verified decantation and stock reconciliation complete' }),
      }),
      env
    );
    expect(finalCloseRes.status).toBe(200);
    const finalCloseData = ((await finalCloseRes.json()) as any).data;
    expect(finalCloseData.status).toBe('CLOSED');
  });

  it('2. StockOperationsPage.tsx includes Manage Receipt modal, PRE/POST dip linking, readiness checks, and audited cancellation via apiFetch', () => {
    const pagePath = path.resolve(__dirname, '../src/frontend/pages/StockOperationsPage.tsx');
    const source = fs.readFileSync(pagePath, 'utf-8');

    expect(source).toContain('Manage Receipt');
    expect(source).toContain('evaluateReceiptCompletionReadiness');
    expect(source).toContain('summarizeShiftReceiptReadiness');
    expect(source).toContain('/api/v1/fuel-receipts/${rcpt.id}/status');
    expect(source).toContain('/api/v1/fuel-receipt-lines/${line.id}');
    expect(source).toContain('PRE_RECEIPT');
    expect(source).toContain('POST_RECEIPT');
    expect(source).toContain('cancellationReason');
    expect(source).toContain('Recompute Stock Reconciliation');
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it('3. evaluateReceiptCompletionReadiness detects negative decanted volume, inverted PRE/POST timestamps, and finalized status', () => {
    const baseReceipt: any = {
      id: 'fr-1',
      outletId: 'ro-1001',
      operationalShiftId: 'shift-1',
      ttNumber: 'PB29AJ7443',
      invoiceNumber: '19914781',
      invoiceDate: '2026-11-02',
      arrivalAt: '2026-11-02T08:00:00.000Z',
      decantationStartedAt: '2026-11-02T09:00:00.000Z',
      decantationCompletedAt: null,
      status: 'DECANTED',
      sealVerified: true,
      sealExceptionReason: null,
      lines: [
        {
          id: 'line-1',
          fuelReceiptId: 'fr-1',
          tankId: 'tank-ro1-1',
          tankNumber: 1,
          productId: 'prod-ms',
          productCode: 'MS',
          invoiceQuantityMilliunits: 5000000,
          invoiceQuantityStr: '5000.000',
          preDecantReadingId: 'pre-1',
          postDecantReadingId: 'post-1',
          qualityStatus: 'PASS',
        },
      ],
    };

    const invertedAndNegativeReadings: any[] = [
      {
        id: 'pre-1',
        operationalShiftId: 'shift-1',
        outletId: 'ro-1001',
        tankId: 'tank-ro1-1',
        productId: 'prod-ms',
        readingType: 'PRE_RECEIPT',
        source: 'MANUAL',
        productDipMmStr: '1000.000',
        waterDipMmStr: '0.000',
        netProductVolumeMilliunits: 8500000,
        netProductVolumeStr: '8500.000',
        recordedAt: '2026-11-02T09:30:00.000Z',
      },
      {
        id: 'post-1',
        operationalShiftId: 'shift-1',
        outletId: 'ro-1001',
        tankId: 'tank-ro1-1',
        productId: 'prod-ms',
        readingType: 'POST_RECEIPT',
        source: 'MANUAL',
        productDipMmStr: '500.000',
        waterDipMmStr: '0.000',
        netProductVolumeMilliunits: 3100000,
        netProductVolumeStr: '3100.000',
        recordedAt: '2026-11-02T09:15:00.000Z',
      },
    ];

    const resInvalid = evaluateReceiptCompletionReadiness(
      baseReceipt,
      invertedAndNegativeReadings,
      '2026-11-02T09:00:00.000Z',
      '2026-11-02T08:30:00.000Z'
    );
    expect(resInvalid.canComplete).toBe(false);
    expect(resInvalid.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('POST_RECEIPT reading timestamp must be strictly after PRE_RECEIPT reading timestamp'),
        expect.stringContaining('Measured received volume cannot be negative'),
        expect.stringContaining('Decantation completion timestamp cannot be earlier than decantation start timestamp'),
      ])
    );

    const finalizedRes = evaluateReceiptCompletionReadiness(
      { ...baseReceipt, status: 'COMPLETED' },
      invertedAndNegativeReadings
    );
    expect(finalizedRes.canComplete).toBe(false);
    expect(finalizedRes.canCancel).toBe(false);
  });
});
