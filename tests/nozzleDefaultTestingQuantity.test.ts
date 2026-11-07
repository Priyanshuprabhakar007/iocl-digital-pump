import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import * as schema from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';
import {
  DEFAULT_NOZZLE_TESTING_QUANTITY_LITRES,
  ZERO_NOZZLE_TESTING_QUANTITY_LITRES,
  NozzleDraftRow,
  createInitialNozzleDraftRow,
  buildInitialNozzleDraftsMap,
  updateNozzleDraftTestingQuantity,
  confirmNozzleDraftTesting,
  requiresNozzleTestingConfirmation,
  evaluateNozzleSaveGuard,
  computeNozzlePreviewSales,
} from '../src/frontend/pages/DailyOperationsPage';
import { DailyOperationsNozzleEntryRow, DailyOperationsShiftWorkspace } from '../src/shared/types';
import fs from 'fs';

const TEST_DB_PATH = './.sqlite/test_nozzle_default_testing_quantity.db';

function makeMockNozzleRow(
  index: number,
  overrides?: Partial<DailyOperationsNozzleEntryRow>
): DailyOperationsNozzleEntryRow {
  const dispenserNumber = Math.floor((index - 1) / 4) + 1;
  const products = [
    { id: 'prod-ms', code: 'MS', name: 'Motor Spirit', category: 'PETROL', tankId: 'tank-1', tankNo: 1 },
    { id: 'prod-hsd', code: 'HSD', name: 'High Speed Diesel', category: 'DIESEL', tankId: 'tank-2', tankNo: 2 },
    { id: 'prod-xp95', code: 'XP95', name: 'XtraPremium 95', category: 'PETROL', tankId: 'tank-3', tankNo: 3 },
    { id: 'prod-xg', code: 'XG', name: 'XtraGreen', category: 'DIESEL', tankId: 'tank-4', tankNo: 4 },
  ];
  const prod = products[(index - 1) % products.length];

  return {
    nozzleId: `nozz-16-${index}`,
    nozzleNumber: index,
    dispenserId: `disp-${dispenserNumber}`,
    dispenserNumber,
    dispenserName: `MPD-${dispenserNumber}`,
    productId: prod.id,
    productCode: prod.code,
    productName: prod.name,
    productCategory: prod.category,
    productUnit: 'LITRE',
    tankId: prod.tankId,
    tankNumber: prod.tankNo,
    snapshotStatus: 'ACTIVE',
    suggestedOpeningTotalizer: `${10000 + index * 100}.000`,
    suggestedOpeningTotalizerMilliunits: (10000 + index * 100) * 1000,
    previousShiftId: null,
    reading: null,
    unavailability: null,
    ...overrides,
  };
}

describe('Daily Operations Nozzle Meter Entry Grid — 5.000 L Default Testing Quantity & Confirmation Suite', () => {
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

  it('1. initializes all 16 configured nozzle rows on an OPEN shift with 5.000 L default testing quantity and requires confirmation before saving', () => {
    const sixteenNozzles = Array.from({ length: 16 }, (_, idx) => makeMockNozzleRow(idx + 1));
    const shiftWorkspace: DailyOperationsShiftWorkspace = {
      shift: {
        id: 'shift-open-16',
        outletId: 'ro-1001',
        shiftTemplateId: 'st-ro1-1',
        businessDate: '2026-11-06',
        status: 'OPEN',
        openedByUserId: 'user-1',
        startedAt: '2026-11-06T06:00:00Z',
        closedByUserId: null,
        closedAt: null,
        notes: null,
        createdAt: '2026-11-06T06:00:00Z',
        updatedAt: '2026-11-06T06:00:00Z',
      },
      shiftTemplateCode: 'SHIFT-A',
      shiftTemplateName: 'Morning Shift',
      tanks: [],
      nozzles: sixteenNozzles,
      receipts: [],
      reconciliations: [],
    };

    const draftsMap = buildInitialNozzleDraftsMap([shiftWorkspace]);
    expect(Object.keys(draftsMap)).toHaveLength(16);

    for (const nozzle of sixteenNozzles) {
      const key = `shift-open-16:${nozzle.nozzleId}`;
      const draft = draftsMap[key];
      expect(draft).toBeDefined();
      expect(draft.testingQuantity).toBe(DEFAULT_NOZZLE_TESTING_QUANTITY_LITRES);
      expect(draft.testingQuantity).toBe('5.000');
      expect(draft.saveStatus).toBe('IDLE');
      expect(draft.isTestingDefaultPrefilled).toBe(true);
      expect(draft.testingConfirmed).toBe(false);
      expect(requiresNozzleTestingConfirmation(draft, nozzle)).toBe(true);
    }

    // Enter closing totalizers on all 16 nozzles (+200.000 L gross per nozzle)
    const candidateItems = sixteenNozzles.map((nozzle, i) => {
      const key = `shift-open-16:${nozzle.nozzleId}`;
      const closingStr = `${10000 + (i + 1) * 100 + 200}.000`;
      const updatedDraft: NozzleDraftRow = {
        ...draftsMap[key],
        closingTotalizer: closingStr,
        saveStatus: 'DIRTY',
      };
      draftsMap[key] = updatedDraft;

      // Verify preview calculation uses 5.000 L testing: Gross = 200.000, Net = 195.000
      const preview = computeNozzlePreviewSales(
        updatedDraft.openingTotalizer,
        updatedDraft.closingTotalizer,
        updatedDraft.testingQuantity,
        nozzle.reading
      );
      expect(preview.grossSalesStr).toBe('200.000');
      expect(preview.netSalesStr).toBe('195.000');

      return { nozzle, draft: updatedDraft };
    });

    // Save guard blocks immediate save until operator confirms physical testing was performed
    const guardBeforeConfirm = evaluateNozzleSaveGuard(candidateItems);
    expect(guardBeforeConfirm.canProceedImmediately).toBe(false);
    expect(guardBeforeConfirm.unconfirmedNozzles).toHaveLength(16);

    // Operator confirms physical testing across all 16 nozzles
    const confirmedItems = candidateItems.map(({ nozzle, draft }) => ({
      nozzle,
      draft: confirmNozzleDraftTesting(draft),
    }));

    const guardAfterConfirm = evaluateNozzleSaveGuard(confirmedItems);
    expect(guardAfterConfirm.canProceedImmediately).toBe(true);
    expect(guardAfterConfirm.unconfirmedNozzles).toHaveLength(0);
  });

  it('2. allows manual edits including 0.000 L (zero testing) and custom testing quantities without blocking save', () => {
    const nozzle = makeMockNozzleRow(1);
    const initialDraft = createInitialNozzleDraftRow(nozzle, 'OPEN');
    expect(initialDraft.testingQuantity).toBe('5.000');
    expect(requiresNozzleTestingConfirmation(initialDraft, nozzle)).toBe(true);

    // Case A: Operator sets testing quantity to 0.000 because no testing was performed
    const zeroDraft: NozzleDraftRow = {
      ...updateNozzleDraftTestingQuantity(initialDraft, ZERO_NOZZLE_TESTING_QUANTITY_LITRES),
      closingTotalizer: '10350.000', // Opening is 10100.000 -> Gross 250.000 L
    };
    expect(zeroDraft.testingQuantity).toBe('0.000');
    expect(zeroDraft.isTestingDefaultPrefilled).toBe(false);
    expect(zeroDraft.testingConfirmed).toBe(true);
    expect(requiresNozzleTestingConfirmation(zeroDraft, nozzle)).toBe(false);

    const zeroGuard = evaluateNozzleSaveGuard([{ nozzle, draft: zeroDraft }]);
    expect(zeroGuard.canProceedImmediately).toBe(true);
    expect(zeroGuard.unconfirmedNozzles).toHaveLength(0);

    const zeroPreview = computeNozzlePreviewSales(
      zeroDraft.openingTotalizer,
      zeroDraft.closingTotalizer,
      zeroDraft.testingQuantity,
      null
    );
    expect(zeroPreview.grossSalesStr).toBe('250.000');
    expect(zeroPreview.netSalesStr).toBe('250.000');

    // Case B: Operator manually enters a custom testing quantity of 10.000 L (e.g. double 5L calibration check)
    const customDraft: NozzleDraftRow = {
      ...updateNozzleDraftTestingQuantity(initialDraft, '10.000'),
      closingTotalizer: '10350.000',
    };
    expect(customDraft.testingQuantity).toBe('10.000');
    expect(customDraft.isTestingDefaultPrefilled).toBe(false);
    expect(customDraft.testingConfirmed).toBe(true);
    expect(requiresNozzleTestingConfirmation(customDraft, nozzle)).toBe(false);

    const customPreview = computeNozzlePreviewSales(
      customDraft.openingTotalizer,
      customDraft.closingTotalizer,
      customDraft.testingQuantity,
      null
    );
    expect(customPreview.grossSalesStr).toBe('250.000');
    expect(customPreview.netSalesStr).toBe('240.000');
  });

  it('3. never overwrites previously saved nozzle readings (including saved 0.000 L or saved nonzero values) or CLOSED shifts', () => {
    const savedZeroNozzle = makeMockNozzleRow(1, {
      reading: {
        id: 'nmr-saved-zero',
        outletId: 'ro-1001',
        operationalShiftId: 'shift-1',
        nozzleId: 'nozz-16-1',
        openingTotalizer: 10100,
        openingTotalizerMilliunits: 10100000,
        openingTotalizerStr: '10100.000',
        closingTotalizer: 10400,
        closingTotalizerMilliunits: 10400000,
        closingTotalizerStr: '10400.000',
        grossSalesQuantity: 300,
        grossSalesQuantityMilliunits: 300000,
        grossSalesQuantityStr: '300.000',
        testingQuantity: 0,
        testingQuantityMilliunits: 0,
        testingQuantityStr: '0.000',
        netSalesQuantity: 300,
        netSalesQuantityMilliunits: 300000,
        netSalesQuantityStr: '300.000',
        hasOpeningVariance: false,
        openingVarianceQuantity: 0,
        varianceReason: null,
        recordedByUserId: 'user-1',
        createdAt: '2026-11-06T10:00:00Z',
        updatedAt: '2026-11-06T10:00:00Z',
      },
    });

    const savedCustomNozzle = makeMockNozzleRow(2, {
      reading: {
        id: 'nmr-saved-custom',
        outletId: 'ro-1001',
        operationalShiftId: 'shift-1',
        nozzleId: 'nozz-16-2',
        openingTotalizer: 10200,
        openingTotalizerMilliunits: 10200000,
        openingTotalizerStr: '10200.000',
        closingTotalizer: 10700,
        closingTotalizerMilliunits: 10700000,
        closingTotalizerStr: '10700.000',
        grossSalesQuantity: 500,
        grossSalesQuantityMilliunits: 500000,
        grossSalesQuantityStr: '500.000',
        testingQuantity: 7.5,
        testingQuantityMilliunits: 7500,
        testingQuantityStr: '7.500',
        netSalesQuantity: 492.5,
        netSalesQuantityMilliunits: 492500,
        netSalesQuantityStr: '492.500',
        hasOpeningVariance: false,
        openingVarianceQuantity: 0,
        varianceReason: null,
        recordedByUserId: 'user-1',
        createdAt: '2026-11-06T10:00:00Z',
        updatedAt: '2026-11-06T10:00:00Z',
      },
    });

    const unsavedOpenNozzle = makeMockNozzleRow(3);

    const openShiftWs: DailyOperationsShiftWorkspace = {
      shift: {
        id: 'shift-1',
        outletId: 'ro-1001',
        shiftTemplateId: 'st-ro1-1',
        businessDate: '2026-11-06',
        status: 'OPEN',
        openedByUserId: 'user-1',
        startedAt: '2026-11-06T06:00:00Z',
        closedByUserId: null,
        closedAt: null,
        notes: null,
        createdAt: '2026-11-06T06:00:00Z',
        updatedAt: '2026-11-06T06:00:00Z',
      },
      shiftTemplateCode: 'SHIFT-A',
      shiftTemplateName: 'Morning Shift',
      tanks: [],
      nozzles: [savedZeroNozzle, savedCustomNozzle, unsavedOpenNozzle],
      receipts: [],
      reconciliations: [],
    };

    const closedShiftWs: DailyOperationsShiftWorkspace = {
      ...openShiftWs,
      shift: { ...openShiftWs.shift, id: 'shift-closed-hist', status: 'CLOSED' },
      nozzles: [makeMockNozzleRow(4)],
    };

    const drafts = buildInitialNozzleDraftsMap([openShiftWs, closedShiftWs]);

    // Saved 0.000 L reading is preserved as '0.000' (not overwritten by '5.000')
    expect(drafts['shift-1:nozz-16-1'].testingQuantity).toBe('0.000');
    expect(drafts['shift-1:nozz-16-1'].saveStatus).toBe('SAVED');
    expect(drafts['shift-1:nozz-16-1'].isTestingDefaultPrefilled).toBe(false);
    expect(requiresNozzleTestingConfirmation(drafts['shift-1:nozz-16-1'], savedZeroNozzle)).toBe(false);

    // Saved 7.500 L reading is preserved as '7.500'
    expect(drafts['shift-1:nozz-16-2'].testingQuantity).toBe('7.500');
    expect(drafts['shift-1:nozz-16-2'].saveStatus).toBe('SAVED');
    expect(drafts['shift-1:nozz-16-2'].isTestingDefaultPrefilled).toBe(false);
    expect(requiresNozzleTestingConfirmation(drafts['shift-1:nozz-16-2'], savedCustomNozzle)).toBe(false);

    // Unsaved nozzle on OPEN shift gets '5.000' default
    expect(drafts['shift-1:nozz-16-3'].testingQuantity).toBe('5.000');
    expect(drafts['shift-1:nozz-16-3'].saveStatus).toBe('IDLE');
    expect(drafts['shift-1:nozz-16-3'].isTestingDefaultPrefilled).toBe(true);
    expect(requiresNozzleTestingConfirmation(drafts['shift-1:nozz-16-3'], unsavedOpenNozzle)).toBe(true);

    // Historical CLOSED shift without a reading does not prefill '5.000'
    expect(drafts['shift-closed-hist:nozz-16-4'].testingQuantity).toBe('0.000');
    expect(drafts['shift-closed-hist:nozz-16-4'].isTestingDefaultPrefilled).toBe(false);
  });

  it('4. end-to-end 16-nozzle shift workflow: does not auto-save 5.000 L on shift open, saves confirmed 5.000 L / 0.000 L / custom testing, and computes accurate gross, net, reconciliation & DSR totals', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);
    const nowIso = new Date().toISOString();
    const outletId = 'ro-1001';

    // Expand seeded ro-1001 (which has disp-ro1-1 & disp-ro1-2 with 2 nozzles each = 4 nozzles)
    // to 4 dispensers × 4 nozzles = 16 active nozzles
    await db.insert(schema.dispensers).values([
      {
        id: 'disp-ro1-3',
        outletId,
        dispenserNumber: 3,
        name: 'MPD-03',
        manufacturer: 'Gilbarco',
        model: 'Encore 500S',
        serialNumber: 'GB-RO1-03',
        nozzleCapacity: 6,
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'user-admin',
      },
      {
        id: 'disp-ro1-4',
        outletId,
        dispenserNumber: 4,
        name: 'MPD-04',
        manufacturer: 'Gilbarco',
        model: 'Encore 500S',
        serialNumber: 'GB-RO1-04',
        nozzleCapacity: 6,
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'user-admin',
      },
    ] as any);

    const extraNozzles: any[] = [];
    for (let d = 1; d <= 4; d++) {
      const startNoz = d <= 2 ? 3 : 1;
      for (let n = startNoz; n <= 4; n++) {
        const isMs = n % 2 === 1;
        extraNozzles.push({
          id: `nozz-ro1-${d}-${n}`,
          outletId,
          dispenserId: `disp-ro1-${d}`,
          nozzleNumber: n,
          productId: isMs ? 'prod-ms' : 'prod-hsd',
          tankId: isMs ? 'tank-ro1-1' : 'tank-ro1-2',
          status: 'ACTIVE',
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: 'user-admin',
        });
      }
    }
    await db.insert(schema.nozzles).values(extraNozzles);

    // Open a new operational shift on 2026-11-06
    const openRes = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${outletId}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-11-06',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = ((await openRes.json()) as any).data.id as string;

    // Fetch Daily Operations bootstrap and verify 5.000 L was NOT automatically saved to the database
    const bootRes = await app.fetch(
      new Request(
        `http://localhost/api/v1/outlets/${outletId}/daily-operations?businessDate=2026-11-06`,
        {
          method: 'GET',
          headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
        }
      ),
      env
    );
    expect(bootRes.status).toBe(200);
    const bootData = ((await bootRes.json()) as any).data;
    expect(bootData.shifts).toHaveLength(1);
    expect(bootData.shifts[0].nozzles).toHaveLength(16);
    for (const n of bootData.shifts[0].nozzles) {
      expect(n.reading).toBeNull();
    }

    // Hydrate frontend drafts for all 16 nozzles -> all 16 show '5.000' L editable form default
    const drafts = buildInitialNozzleDraftsMap(bootData.shifts);
    for (const n of bootData.shifts[0].nozzles) {
      const k = `${shiftId}:${n.nozzleId}`;
      expect(drafts[k].testingQuantity).toBe('5.000');
      expect(drafts[k].isTestingDefaultPrefilled).toBe(true);
      expect(drafts[k].testingConfirmed).toBe(false);
    }

    // Operator workflow across the 16 nozzles:
    // - Indices 0..11 (12 nozzles): keep prefilled 5.000 L and confirm physical testing
    // - Indices 12..13 (2 nozzles): set to 0.000 L (no testing performed)
    // - Indices 14..15 (2 nozzles): manually edit to 10.000 L
    // Every nozzle has Opening = 1000.000 L, Closing = 1100.000 L (Gross = 100.000 L each; Total Gross = 1600.000 L)
    const batchPayload: Array<{ nozzle: DailyOperationsNozzleEntryRow; draft: NozzleDraftRow }> =
      bootData.shifts[0].nozzles.map(
        (n: DailyOperationsNozzleEntryRow, idx: number) => {
          const k = `${shiftId}:${n.nozzleId}`;
          let d: NozzleDraftRow = {
            ...drafts[k],
            openingTotalizer: '1000.000',
            closingTotalizer: '1100.000',
            saveStatus: 'DIRTY',
          };
          if (idx < 12) {
            d = confirmNozzleDraftTesting(d);
          } else if (idx < 14) {
            d = updateNozzleDraftTestingQuantity(d, '0.000');
          } else {
            d = updateNozzleDraftTestingQuantity(d, '10.000');
          }
          drafts[k] = d;
          return {
            nozzle: n,
            draft: d,
          };
        }
      );

    // Verify save guard now passes for all 16 nozzles
    const saveGuard = evaluateNozzleSaveGuard(batchPayload);
    expect(saveGuard.canProceedImmediately).toBe(true);

    // Save batch meter readings to the backend
    const batchSaveRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          readings: batchPayload.map(({ nozzle, draft }) => ({
            nozzleId: nozzle.nozzleId,
            openingTotalizer: draft.openingTotalizer,
            closingTotalizer: draft.closingTotalizer,
            testingQuantity: draft.testingQuantity,
            varianceReason: null,
          })),
        }),
      }),
      env
    );
    expect(batchSaveRes.status).toBe(200);

    // Record tank opening and closing dips for all 3 tanks on ro-1001
    const tankBatchRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          readings: [
            { tankId: 'tank-ro1-1', readingType: 'OPENING', source: 'MANUAL', productDipMm: '1250.000', waterDipMm: '0.000' },
            { tankId: 'tank-ro1-1', readingType: 'CLOSING', source: 'MANUAL', productDipMm: '1000.000', waterDipMm: '0.000' },
            { tankId: 'tank-ro1-2', readingType: 'OPENING', source: 'MANUAL', productDipMm: '1250.000', waterDipMm: '0.000' },
            { tankId: 'tank-ro1-2', readingType: 'CLOSING', source: 'MANUAL', productDipMm: '1000.000', waterDipMm: '0.000' },
            { tankId: 'tank-ro1-3', readingType: 'OPENING', source: 'MANUAL', productDipMm: '1000.000', waterDipMm: '0.000' },
            { tankId: 'tank-ro1-3', readingType: 'CLOSING', source: 'MANUAL', productDipMm: '1000.000', waterDipMm: '0.000' },
          ],
        }),
      }),
      env
    );
    expect(tankBatchRes.status).toBe(200);

    // Verify Daily Fuel Summary / DSR calculations reflect the confirmed testing quantities:
    // Total Gross = 16 * 100 L = 1,600.000 L (1,600,000 milliunits)
    // Total Testing = (12 * 5 L) + (2 * 0 L) + (2 * 10 L) = 80.000 L (80,000 milliunits)
    // Total Net Sales = 1,600.000 - 80.000 = 1,520.000 L (1,520,000 milliunits)
    const summaryRes = await app.fetch(
      new Request(
        `http://localhost/api/v1/outlets/${outletId}/fuel/daily-summary?businessDate=2026-11-06`,
        {
          method: 'GET',
          headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
        }
      ),
      env
    );
    expect(summaryRes.status).toBe(200);
    const summary = ((await summaryRes.json()) as any).data;
    expect(summary.totals.grossSalesMilliunits).toBe(1600000); // 1,600.000 L
    expect(summary.totals.testingMilliunits).toBe(80000); // 80.000 L
    expect(summary.totals.netSalesMilliunits).toBe(1520000); // 1,520.000 L

    // Reload bootstrap after save and verify saved values (5.000, 0.000, 10.000) are preserved and never overwritten
    const reloadBootRes = await app.fetch(
      new Request(
        `http://localhost/api/v1/outlets/${outletId}/daily-operations?businessDate=2026-11-06`,
        {
          method: 'GET',
          headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
        }
      ),
      env
    );
    const reloadedBoot = ((await reloadBootRes.json()) as any).data;
    const reloadedDrafts = buildInitialNozzleDraftsMap(reloadedBoot.shifts);

    const firstNozId = reloadedBoot.shifts[0].nozzles[0].nozzleId;
    const zeroNozId = reloadedBoot.shifts[0].nozzles[12].nozzleId;
    const customNozId = reloadedBoot.shifts[0].nozzles[14].nozzleId;

    expect(reloadedDrafts[`${shiftId}:${firstNozId}`].testingQuantity).toBe('5.000');
    expect(reloadedDrafts[`${shiftId}:${firstNozId}`].saveStatus).toBe('SAVED');
    expect(reloadedDrafts[`${shiftId}:${zeroNozId}`].testingQuantity).toBe('0.000');
    expect(reloadedDrafts[`${shiftId}:${zeroNozId}`].saveStatus).toBe('SAVED');
    expect(reloadedDrafts[`${shiftId}:${customNozId}`].testingQuantity).toBe('10.000');
    expect(reloadedDrafts[`${shiftId}:${customNozId}`].saveStatus).toBe('SAVED');
  });
});
