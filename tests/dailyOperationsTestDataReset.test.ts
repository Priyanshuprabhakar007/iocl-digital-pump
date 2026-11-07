import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import * as schema from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';
import { DailyOperationsTestDataResetService } from '../src/worker/services/dailyOperationsTestDataResetService';
import fs from 'fs';

const TEST_DB_PATH = './.sqlite/test_daily_operations_test_data_reset.db';

class MockR2Bucket {
  public store = new Map<string, { data: Uint8Array; metadata: Record<string, string> }>();

  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: item.data,
      arrayBuffer: async () => item.data.buffer,
      text: async () => new TextDecoder().decode(item.data),
      customMetadata: item.metadata,
    };
  }

  async put(key: string, value: string | ArrayBuffer | Uint8Array, options?: any) {
    const data =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : value instanceof Uint8Array
          ? value
          : new Uint8Array(value);
    this.store.set(key, { data, metadata: options?.customMetadata || {} });
    return { key, size: data.byteLength };
  }

  async delete(key: string) {
    this.store.delete(key);
  }
}

describe('Controlled Reset of Pre-Go-Live Daily Operations Test Data (COCO 22 — RO Code 396187)', () => {
  let localD1: any;
  let db: ReturnType<typeof getDb>;
  let r2Bucket: MockR2Bucket;
  let env: any;

  const COCO22_ID = 'ro-coco-22';
  const COCO22_RO_CODE = '396187';
  const TARGET_FROM = '2026-10-23';
  const TARGET_TO = '2026-11-07';

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
    db = getDb(localD1);
    await seedDatabase(db);
    r2Bucket = new MockR2Bucket();

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: r2Bucket,
      SESSION_SECRET: 'test-session-secret-key-12345678901234567890',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };

    await seedCoco22Environment();
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

  async function seedCoco22Environment() {
    const now = '2026-10-01T08:00:00.000Z';

    // 1. Seed COCO 22 — RO Code 396187 retail outlet
    await db.insert(schema.retailOutlets).values({
      id: COCO22_ID,
      roCode: COCO22_RO_CODE,
      name: 'COCO 22',
      outletType: 'COCO',
      stateId: 'state-pb',
      divisionId: 'div-ldh',
      salesAreaId: 'sa-ldh-cen',
      address: 'Sector 22, Chandigarh',
      city: 'Chandigarh',
      district: 'Chandigarh',
      pincode: '160022',
      latitude: 30.7333,
      longitude: 76.7794,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Seed Outlet Products & Prices for COCO 22
    await db.insert(schema.outletProducts).values([
      {
        id: 'op-coco22-ms',
        outletId: COCO22_ID,
        productId: 'prod-ms',
        status: 'ACTIVE',
        createdAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'op-coco22-hsd',
        outletId: COCO22_ID,
        productId: 'prod-hsd',
        status: 'ACTIVE',
        createdAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'op-coco22-cng',
        outletId: COCO22_ID,
        productId: 'prod-cng',
        status: 'ACTIVE',
        createdAt: now,
        createdBy: 'user-admin',
      },
    ]);

    await db.insert(schema.outletProductPrices).values([
      {
        id: 'opp-coco22-ms',
        outletId: COCO22_ID,
        productId: 'prod-ms',
        pricePaisePerUnit: 10541,
        effectiveFrom: '2026-10-01T06:00:00.000Z',
        status: 'ACTIVE',
        createdAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'opp-coco22-hsd',
        outletId: COCO22_ID,
        productId: 'prod-hsd',
        pricePaisePerUnit: 9217,
        effectiveFrom: '2026-10-01T06:00:00.000Z',
        status: 'ACTIVE',
        createdAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'opp-coco22-cng',
        outletId: COCO22_ID,
        productId: 'prod-cng',
        pricePaisePerUnit: 8950,
        effectiveFrom: '2026-10-01T06:00:00.000Z',
        status: 'ACTIVE',
        createdAt: now,
        createdBy: 'user-admin',
      },
    ]);

    // 3. Seed Tanks, Calibration Charts (including Tank #1 Rev #1 ACTIVE + Protected Rev #2 DRAFT), Dispensers, Nozzles
    await db.insert(schema.tanks).values([
      {
        id: 'tank-coco22-1',
        outletId: COCO22_ID,
        tankNumber: 1,
        name: 'Tank 1 - MS 20KL',
        productId: 'prod-ms',
        capacityLitres: 20000,
        safeFillCapacityLitres: 19000,
        minimumOperatingLevelLitres: 1500,
        status: 'ACTIVE',
        commissionedAt: '2020-04-01T00:00:00Z',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'tank-coco22-2',
        outletId: COCO22_ID,
        tankNumber: 2,
        name: 'Tank 2 - HSD 20KL',
        productId: 'prod-hsd',
        capacityLitres: 20000,
        safeFillCapacityLitres: 19000,
        minimumOperatingLevelLitres: 1500,
        status: 'ACTIVE',
        commissionedAt: '2020-04-01T00:00:00Z',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user-admin',
      },
    ]);

    await db.insert(schema.tankCalibrationCharts).values([
      {
        id: 'cal-coco22-t1-rev1',
        tankId: 'tank-coco22-1',
        revisionNumber: 1,
        status: 'ACTIVE',
        chartUnitDip: 'MM',
        chartUnitVolume: 'LITRES',
        tankDiameterMmMilliunits: 2250000,
        tankLengthMmMilliunits: 5350000,
        maxDipMmMilliunits: 2100000,
        chartCapacityMilliunits: 20000000,
        referenceDocument: 'CPWD-COCO22-T1-R1',
        effectiveFrom: '2026-01-01',
        approvedBy: 'user-admin',
        approvedAt: now,
        createdAt: now,
        createdBy: 'user-admin',
        updatedAt: now,
        updatedBy: 'user-admin',
      },
      {
        id: 'cal-coco22-t1-rev2-draft',
        tankId: 'tank-coco22-1',
        revisionNumber: 2,
        status: 'DRAFT',
        chartUnitDip: 'MM',
        chartUnitVolume: 'LITRES',
        tankDiameterMmMilliunits: 2250000,
        tankLengthMmMilliunits: 5350000,
        maxDipMmMilliunits: 2100000,
        chartCapacityMilliunits: 20000000,
        referenceDocument: 'CPWD-COCO22-T1-R2-PROTECTED-DRAFT',
        effectiveFrom: '2026-12-01',
        createdAt: now,
        createdBy: 'user-admin',
        updatedAt: now,
        updatedBy: 'user-admin',
      },
      {
        id: 'cal-coco22-t2-rev1',
        tankId: 'tank-coco22-2',
        revisionNumber: 1,
        status: 'ACTIVE',
        chartUnitDip: 'MM',
        chartUnitVolume: 'LITRES',
        tankDiameterMmMilliunits: 2250000,
        tankLengthMmMilliunits: 5350000,
        maxDipMmMilliunits: 2100000,
        chartCapacityMilliunits: 20000000,
        referenceDocument: 'CPWD-COCO22-T2-R1',
        effectiveFrom: '2026-01-01',
        approvedBy: 'user-admin',
        approvedAt: now,
        createdAt: now,
        createdBy: 'user-admin',
        updatedAt: now,
        updatedBy: 'user-admin',
      },
    ]);

    await db.insert(schema.tankCalibrationPoints).values([
      {
        id: 'calpt-coco22-t1-0',
        chartId: 'cal-coco22-t1-rev1',
        tankId: 'tank-coco22-1',
        dipMillimetresMilliunits: 0,
        volumeMilliunits: 0,
        createdAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'calpt-coco22-t1-1000',
        chartId: 'cal-coco22-t1-rev1',
        tankId: 'tank-coco22-1',
        dipMillimetresMilliunits: 1000000,
        volumeMilliunits: 10000000,
        createdAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'calpt-coco22-t1-2100',
        chartId: 'cal-coco22-t1-rev1',
        tankId: 'tank-coco22-1',
        dipMillimetresMilliunits: 2100000,
        volumeMilliunits: 20000000,
        createdAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'calpt-coco22-t1-draft-0',
        chartId: 'cal-coco22-t1-rev2-draft',
        tankId: 'tank-coco22-1',
        dipMillimetresMilliunits: 0,
        volumeMilliunits: 0,
        createdAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'calpt-coco22-t2-0',
        chartId: 'cal-coco22-t2-rev1',
        tankId: 'tank-coco22-2',
        dipMillimetresMilliunits: 0,
        volumeMilliunits: 0,
        createdAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'calpt-coco22-t2-2100',
        chartId: 'cal-coco22-t2-rev1',
        tankId: 'tank-coco22-2',
        dipMillimetresMilliunits: 2100000,
        volumeMilliunits: 20000000,
        createdAt: now,
        createdBy: 'user-admin',
      },
    ]);

    await db.insert(schema.dispensers).values({
      id: 'disp-coco22-1',
      outletId: COCO22_ID,
      dispenserNumber: 1,
      name: 'MPD 1',
      manufacturer: 'Gilbarco',
      model: 'Encore 500S',
      serialNumber: 'GVR-COCO22-001',
      nozzleCapacity: 2,
      status: 'ACTIVE',
      commissionedAt: '2020-04-01T00:00:00Z',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    });

    await db.insert(schema.nozzles).values([
      {
        id: 'noz-coco22-1',
        outletId: COCO22_ID,
        dispenserId: 'disp-coco22-1',
        nozzleNumber: 1,
        productId: 'prod-ms',
        tankId: 'tank-coco22-1',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user-admin',
      },
      {
        id: 'noz-coco22-2',
        outletId: COCO22_ID,
        dispenserId: 'disp-coco22-1',
        nozzleNumber: 2,
        productId: 'prod-hsd',
        tankId: 'tank-coco22-2',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user-admin',
      },
    ]);

    await db.insert(schema.shiftTemplates).values({
      id: 'st-coco22-day',
      outletId: COCO22_ID,
      code: 'SHIFT_1',
      name: 'Shift 1 (Morning)',
      startTime: '06:00',
      endTime: '14:00',
      sequence: 1,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    });

    // 4. Seed Protected Non-Shift Records at COCO 22 (Document Vault, Compliance, Lube SKU & Stock)
    await db.insert(schema.documents).values({
      id: 'doc-coco22-peso-license',
      r2Key: 'outlets/ro-coco-22/peso-license.pdf',
      name: 'peso-license.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 102400,
      outletId: COCO22_ID,
      uploadedByUserId: 'user-admin',
      createdAt: now,
    });

    await db.insert(schema.cocoComplianceRecords).values({
      id: 'comp-coco22-peso',
      outletId: COCO22_ID,
      roCodeSnapshot: COCO22_RO_CODE,
      categoryCode: 'EXPLOSIVES_LICENSE',
      categoryName: 'Explosives License (PESO)',
      displayOrder: 1,
      isCustomCategory: 0,
      documentTitle: 'PESO License 396187',
      referenceNumber: 'P/HQ/CH/14/396187',
      issueDate: '2025-01-01',
      validityDueDate: '2028-12-31',
      paymentStatus: 'PAID',
      complianceStatus: 'VALID',
      statusYesNo: 'YES',
      attachmentDocumentIdsJson: JSON.stringify(['doc-coco22-peso-license']),
      createdBy: 'user-admin',
      updatedBy: 'user-admin',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.lubeSkus).values({
      id: 'lsku-coco22-servo4t',
      outletId: COCO22_ID,
      skuCode: 'SERVO-4T-1L',
      name: 'Servo 4T 20W-40 (1L Pack)',
      category: '2W_ENGINE_OIL',
      stockUnit: 'PACK',
      reorderThresholdSubunits: 5000,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    });

    await db.insert(schema.lubeSkuPrices).values({
      id: 'lsp-coco22-servo4t',
      outletId: COCO22_ID,
      lubeSkuId: 'lsku-coco22-servo4t',
      pricePaisePerUnit: 42000,
      effectiveFrom: '2026-10-01',
      status: 'ACTIVE',
      createdAt: now,
      createdBy: 'user-admin',
    });

    await db.insert(schema.lubeStockTransactions).values({
      id: 'lst-coco22-open-1',
      outletId: COCO22_ID,
      lubeSkuId: 'lsku-coco22-servo4t',
      transactionType: 'OPENING_BALANCE',
      quantitySubunits: 50000, // 50 packs available
      occurredAt: '2026-10-01T08:00:00.000Z',
      referenceNumber: 'OPEN-COCO22-001',
      notes: 'Initial opening stock',
      createdBy: 'user-admin',
      createdAt: now,
    });

    // 5. Seed Out-of-Range Shifts at COCO 22 (2026-10-20 BEFORE range, 2026-11-08 AFTER range)
    await db.insert(schema.operationalShifts).values([
      {
        id: 'shift-coco22-before-2026-10-20',
        outletId: COCO22_ID,
        shiftTemplateId: 'st-ro1-1',
        businessDate: '2026-10-20',
        startedAt: '2026-10-20T06:00:00.000Z',
        closedAt: '2026-10-20T14:00:00.000Z',
        status: 'CLOSED',
        openedByUserId: 'user-admin',
        closedByUserId: 'user-admin',
        notes: 'Historical closed shift before reset date range',
        createdAt: '2026-10-20T06:00:00.000Z',
        updatedAt: '2026-10-20T14:00:00.000Z',
      },
      {
        id: 'shift-coco22-after-2026-11-08',
        outletId: COCO22_ID,
        shiftTemplateId: 'st-ro1-1',
        businessDate: '2026-11-08',
        startedAt: '2026-11-08T06:00:00.000Z',
        closedAt: '2026-11-08T14:00:00.000Z',
        status: 'CLOSED',
        openedByUserId: 'user-admin',
        closedByUserId: 'user-admin',
        notes: 'Future shift after reset date range',
        createdAt: '2026-11-08T06:00:00.000Z',
        updatedAt: '2026-11-08T14:00:00.000Z',
      },
    ]);

    // 6. Seed In-Range Shifts at COCO 22 (2026-10-23 CLOSED, 2026-11-02 OPEN with the two real TT receipts, 2026-11-07 CLOSED)
    await db.insert(schema.operationalShifts).values([
      {
        id: 'shift-coco22-2026-10-23',
        outletId: COCO22_ID,
        shiftTemplateId: 'st-ro1-1',
        businessDate: '2026-10-23',
        startedAt: '2026-10-23T06:00:00.000Z',
        closedAt: '2026-10-23T14:00:00.000Z',
        status: 'CLOSED',
        openedByUserId: 'user-admin',
        closedByUserId: 'user-admin',
        notes: 'UAT test shift Day 1',
        createdAt: '2026-10-23T06:00:00.000Z',
        updatedAt: '2026-10-23T14:00:00.000Z',
      },
      {
        id: 'shift-coco22-2026-11-02',
        outletId: COCO22_ID,
        shiftTemplateId: 'st-ro1-1',
        businessDate: '2026-11-02',
        startedAt: '2026-11-02T06:00:00.000Z',
        status: 'OPEN',
        openedByUserId: 'user-admin',
        notes: 'UAT shift with TT PB29AJ7443 and TT PB13AL9133',
        // Deliberately set created_at outside the date range to verify business_date scoping!
        createdAt: '2026-11-15T14:20:00.000Z',
        updatedAt: '2026-11-15T14:20:00.000Z',
      },
      {
        id: 'shift-coco22-2026-11-07',
        outletId: COCO22_ID,
        shiftTemplateId: 'st-ro1-1',
        businessDate: '2026-11-07',
        startedAt: '2026-11-07T06:00:00.000Z',
        closedAt: '2026-11-07T14:00:00.000Z',
        status: 'CLOSED',
        openedByUserId: 'user-admin',
        closedByUserId: 'user-admin',
        notes: 'UAT shift final day of range',
        createdAt: '2026-11-07T06:00:00.000Z',
        updatedAt: '2026-11-07T14:00:00.000Z',
      },
    ]);

    // Seed snapshots for the 3 in-range shifts
    for (const shiftId of [
      'shift-coco22-2026-10-23',
      'shift-coco22-2026-11-02',
      'shift-coco22-2026-11-07',
    ]) {
      await db.insert(schema.operationalShiftNozzles).values([
        {
          id: `osn-${shiftId}-1`,
          operationalShiftId: shiftId,
          outletId: COCO22_ID,
          nozzleId: 'noz-coco22-1',
          dispenserId: 'disp-coco22-1',
          dispenserNumber: 1,
          dispenserName: 'MPD 1',
          nozzleNumber: 1,
          productId: 'prod-ms',
          productCode: 'MS',
          productName: 'Motor Spirit (Petrol)',
          productCategory: 'MS',
          productUnit: 'LITRE',
          tankId: 'tank-coco22-1',
          tankNumber: 1,
          snapshotStatus: 'ACTIVE',
          createdAt: now,
        },
        {
          id: `osn-${shiftId}-2`,
          operationalShiftId: shiftId,
          outletId: COCO22_ID,
          nozzleId: 'noz-coco22-2',
          dispenserId: 'disp-coco22-1',
          dispenserNumber: 1,
          dispenserName: 'MPD 1',
          nozzleNumber: 2,
          productId: 'prod-hsd',
          productCode: 'HSD',
          productName: 'High Speed Diesel',
          productCategory: 'HSD',
          productUnit: 'LITRE',
          tankId: 'tank-coco22-2',
          tankNumber: 2,
          snapshotStatus: 'ACTIVE',
          createdAt: now,
        },
      ]);

      await db.insert(schema.operationalShiftTanks).values([
        {
          id: `ost-${shiftId}-1`,
          operationalShiftId: shiftId,
          outletId: COCO22_ID,
          tankId: 'tank-coco22-1',
          tankNumber: 1,
          tankName: 'Tank 1 - MS 20KL',
          productId: 'prod-ms',
          productCode: 'MS',
          productName: 'Motor Spirit (Petrol)',
          productUnit: 'LITRE',
          capacityMilliunits: 20000000,
          safeFillCapacityMilliunits: 19000000,
          calibrationChartId: 'cal-coco22-t1-rev1',
          calibrationRevision: 1,
          createdAt: now,
        },
        {
          id: `ost-${shiftId}-2`,
          operationalShiftId: shiftId,
          outletId: COCO22_ID,
          tankId: 'tank-coco22-2',
          tankNumber: 2,
          tankName: 'Tank 2 - HSD 20KL',
          productId: 'prod-hsd',
          productCode: 'HSD',
          productName: 'High Speed Diesel',
          productUnit: 'LITRE',
          capacityMilliunits: 20000000,
          safeFillCapacityMilliunits: 19000000,
          calibrationChartId: 'cal-coco22-t2-rev1',
          calibrationRevision: 1,
          createdAt: now,
        },
      ]);

      await db.insert(schema.operationalShiftProductPrices).values([
        {
          id: `ospp-${shiftId}-ms`,
          operationalShiftId: shiftId,
          outletId: COCO22_ID,
          productId: 'prod-ms',
          productCode: 'MS',
          productName: 'Motor Spirit (Petrol)',
          unit: 'LITRE',
          productCategory: 'MS',
          pricePaisePerUnit: 10541,
          sourcePriceId: 'opp-coco22-ms',
          createdAt: now,
        },
      ]);
    }

    // Seed Tank Stock Readings (OPENING, CLOSING, PRE_RECEIPT, POST_RECEIPT, water dips)
    await db.insert(schema.tankStockReadings).values([
      {
        id: 'tsr-coco22-1023-open-t1',
        operationalShiftId: 'shift-coco22-2026-10-23',
        outletId: COCO22_ID,
        tankId: 'tank-coco22-1',
        productId: 'prod-ms',
        readingType: 'OPENING',
        source: 'MANUAL',
        productDipMmMilliunits: 1200000,
        waterDipMmMilliunits: 5000, // positive water dip
        grossObservedVolumeMilliunits: 11500000,
        waterVolumeMilliunits: 12000,
        netProductVolumeMilliunits: 11488000,
        calibrationChartId: 'cal-coco22-t1-rev1',
        calibrationRevision: 1,
        recordedAt: '2026-10-23T06:05:00.000Z',
        recordedByUserId: 'user-admin',
        createdAt: '2026-10-23T06:05:00.000Z',
        updatedAt: '2026-10-23T06:05:00.000Z',
      },
      {
        id: 'tsr-coco22-1023-close-t1',
        operationalShiftId: 'shift-coco22-2026-10-23',
        outletId: COCO22_ID,
        tankId: 'tank-coco22-1',
        productId: 'prod-ms',
        readingType: 'CLOSING',
        source: 'MANUAL',
        productDipMmMilliunits: 1050000,
        waterDipMmMilliunits: 5000,
        grossObservedVolumeMilliunits: 10200000,
        waterVolumeMilliunits: 12000,
        netProductVolumeMilliunits: 10188000,
        calibrationChartId: 'cal-coco22-t1-rev1',
        calibrationRevision: 1,
        recordedAt: '2026-10-23T13:55:00.000Z',
        recordedByUserId: 'user-admin',
        createdAt: '2026-10-23T13:55:00.000Z',
        updatedAt: '2026-10-23T13:55:00.000Z',
      },
      {
        id: 'tsr-coco22-1102-pre-t1',
        operationalShiftId: 'shift-coco22-2026-11-02',
        outletId: COCO22_ID,
        tankId: 'tank-coco22-1',
        productId: 'prod-ms',
        readingType: 'PRE_RECEIPT',
        source: 'MANUAL',
        productDipMmMilliunits: 900000,
        waterDipMmMilliunits: 0,
        grossObservedVolumeMilliunits: 8500000,
        waterVolumeMilliunits: 0,
        netProductVolumeMilliunits: 8500000,
        calibrationChartId: 'cal-coco22-t1-rev1',
        calibrationRevision: 1,
        recordedAt: '2026-11-02T10:00:00.000Z',
        recordedByUserId: 'user-admin',
        // Deliberately late timestamp to verify timestamp-agnostic shift scoping
        createdAt: '2026-11-20T09:00:00.000Z',
        updatedAt: '2026-11-20T09:00:00.000Z',
      },
      {
        id: 'tsr-coco22-1102-post-t1',
        operationalShiftId: 'shift-coco22-2026-11-02',
        outletId: COCO22_ID,
        tankId: 'tank-coco22-1',
        productId: 'prod-ms',
        readingType: 'POST_RECEIPT',
        source: 'MANUAL',
        productDipMmMilliunits: 1950000,
        waterDipMmMilliunits: 0,
        grossObservedVolumeMilliunits: 18500000,
        waterVolumeMilliunits: 0,
        netProductVolumeMilliunits: 18500000,
        calibrationChartId: 'cal-coco22-t1-rev1',
        calibrationRevision: 1,
        recordedAt: '2026-11-02T11:30:00.000Z',
        recordedByUserId: 'user-admin',
        createdAt: '2026-11-20T10:00:00.000Z',
        updatedAt: '2026-11-20T10:00:00.000Z',
      },
    ]);

    // Seed Nozzle Meter Readings (including 5.000 L testing quantities) & Unavailability
    await db.insert(schema.nozzleMeterReadings).values([
      {
        id: 'nmr-coco22-1023-n1',
        operationalShiftId: 'shift-coco22-2026-10-23',
        outletId: COCO22_ID,
        nozzleId: 'noz-coco22-1',
        openingTotalizerMilliunits: 100000000,
        closingTotalizerMilliunits: 101305000,
        testingQuantityMilliunits: 5000, // 5.000 L testing
        grossSalesQuantityMilliunits: 1305000,
        netSalesQuantityMilliunits: 1300000,
        openingVarianceMilliunits: 0,
        recordedByUserId: 'user-admin',
        hasOpeningVariance: false,
        createdAt: '2026-10-23T13:30:00.000Z',
        updatedAt: '2026-10-23T13:30:00.000Z',
      },
      {
        id: 'nmr-coco22-1102-n1',
        operationalShiftId: 'shift-coco22-2026-11-02',
        outletId: COCO22_ID,
        nozzleId: 'noz-coco22-1',
        openingTotalizerMilliunits: 101305000,
        closingTotalizerMilliunits: 102110000,
        testingQuantityMilliunits: 5000, // 5.000 L testing
        grossSalesQuantityMilliunits: 805000,
        netSalesQuantityMilliunits: 800000,
        openingVarianceMilliunits: 0,
        recordedByUserId: 'user-admin',
        hasOpeningVariance: false,
        createdAt: '2026-11-18T11:00:00.000Z',
        updatedAt: '2026-11-18T11:00:00.000Z',
      },
    ]);

    await db.insert(schema.nozzleUnavailabilityRecords).values({
      id: 'nur-coco22-1107-n2',
      operationalShiftId: 'shift-coco22-2026-11-07',
      nozzleId: 'noz-coco22-2',
      reason: 'UAT test unavailability entry',
      recordedBy: 'user-admin',
      createdAt: '2026-11-07T08:00:00.000Z',
    });

    // Seed the 2 fuel receipts on 2026-11-02: TT PB29AJ7443 (19914781) and TT PB13AL9133 (19932641)
    await db.insert(schema.fuelReceipts).values([
      {
        id: 'fr-coco22-19914781',
        outletId: COCO22_ID,
        operationalShiftId: 'shift-coco22-2026-11-02',
        ttNumber: 'PB29AJ7443',
        invoiceNumber: '19914781',
        invoiceDate: '2026-11-02',
        arrivalAt: '2026-11-02T09:30:00.000Z',
        sealVerified: true,
        status: 'ARRIVED',
        recordedByUserId: 'user-admin',
        createdAt: '2026-11-02T09:30:00.000Z',
        updatedAt: '2026-11-02T09:30:00.000Z',
      },
      {
        id: 'fr-coco22-19932641',
        outletId: COCO22_ID,
        operationalShiftId: 'shift-coco22-2026-11-02',
        ttNumber: 'PB13AL9133',
        invoiceNumber: '19932641',
        invoiceDate: '2026-11-02',
        arrivalAt: '2026-11-02T12:15:00.000Z',
        sealVerified: true,
        status: 'ARRIVED',
        recordedByUserId: 'user-admin',
        createdAt: '2026-11-02T12:15:00.000Z',
        updatedAt: '2026-11-02T12:15:00.000Z',
      },
    ]);

    await db.insert(schema.fuelReceiptTankLines).values({
      id: 'frtl-coco22-19914781-t1',
      fuelReceiptId: 'fr-coco22-19914781',
      tankId: 'tank-coco22-1',
      productId: 'prod-ms',
      invoiceQuantityMilliunits: 10000000,
      preDecantReadingId: 'tsr-coco22-1102-pre-t1',
      postDecantReadingId: 'tsr-coco22-1102-post-t1',
      measuredReceivedQuantityMilliunits: 10000000,
      receiptVarianceMilliunits: 0,
      qualityStatus: 'PASS',
      createdAt: '2026-11-02T11:35:00.000Z',
      updatedAt: '2026-11-02T11:35:00.000Z',
    });

    // Seed Stock Reconciliation, Collections, Cash Handover, Bank Deposit, Financial Reconciliation
    await db.insert(schema.shiftStockReconciliations).values({
      id: 'ssr-coco22-1023-t1',
      operationalShiftId: 'shift-coco22-2026-10-23',
      outletId: COCO22_ID,
      tankId: 'tank-coco22-1',
      productId: 'prod-ms',
      openingStockMilliunits: 11488000,
      receiptQuantityMilliunits: 0,
      salesQuantityMilliunits: 1300000,
      theoreticalClosingStockMilliunits: 10188000,
      physicalClosingStockMilliunits: 10188000,
      varianceMilliunits: 0,
      varianceStatus: 'BALANCED',
      calculatedAt: '2026-10-23T13:58:00.000Z',
      createdAt: '2026-10-23T13:58:00.000Z',
      updatedAt: '2026-10-23T13:58:00.000Z',
    });

    await db.insert(schema.shiftCollections).values({
      id: 'sc-coco22-1023-upi',
      operationalShiftId: 'shift-coco22-2026-10-23',
      outletId: COCO22_ID,
      collectionType: 'UPI',
      amountPaise: 5000000,
      provider: 'SBI_PAYTM_QR',
      referenceNumber: 'UTR-COCO22-UAT-9988',
      collectedAt: '2026-10-23T13:40:00.000Z',
      recordedByUserId: 'user-admin',
      createdAt: '2026-10-23T13:40:00.000Z',
      updatedAt: '2026-10-23T13:40:00.000Z',
    });

    await db.insert(schema.cashHandoverLogs).values({
      id: 'chl-coco22-1023-1',
      operationalShiftId: 'shift-coco22-2026-10-23',
      outletId: COCO22_ID,
      amountPaise: 8703300,
      handedOverByUserId: 'user-admin',
      receivedByUserId: 'user-admin',
      handedOverAt: '2026-10-23T13:45:00.000Z',
      receivedAt: '2026-10-23T13:50:00.000Z',
      status: 'ACKNOWLEDGED',
      createdAt: '2026-10-23T13:45:00.000Z',
      updatedAt: '2026-10-23T13:50:00.000Z',
    });

    await db.insert(schema.bankDeposits).values({
      id: 'bd-coco22-1023-1',
      outletId: COCO22_ID,
      operationalShiftId: 'shift-coco22-2026-10-23',
      depositChannel: 'BANK_BRANCH',
      amountPaise: 8703300,
      depositDate: '2026-10-23',
      referenceNumber: 'SBI-UTR-COCO22-1023',
      status: 'VERIFIED',
      recordedByUserId: 'user-admin',
      verifiedByUserId: 'user-admin',
      verifiedAt: '2026-10-23T13:55:00.000Z',
      createdAt: '2026-10-23T13:52:00.000Z',
      updatedAt: '2026-10-23T13:55:00.000Z',
    });

    await db.insert(schema.shiftFinancialReconciliations).values({
      id: 'sfr-coco22-1023-1',
      operationalShiftId: 'shift-coco22-2026-10-23',
      outletId: COCO22_ID,
      fuelSalesRevenuePaise: 13703300,
      cngSalesRevenuePaise: 0,
      lubeSalesRevenuePaise: 0,
      authoritativeSalesRevenuePaise: 13703300,
      cashCollectionPaise: 8703300,
      posCollectionPaise: 0,
      upiCollectionPaise: 5000000,
      fleetCardCollectionPaise: 0,
      creditSalesPaise: 0,
      directBankDropPaise: 0,
      totalCollectionsPaise: 13703300,
      salesCollectionVariancePaise: 0,
      varianceStatus: 'BALANCED',
      calculatedAt: '2026-10-23T13:59:00.000Z',
      createdAt: '2026-10-23T13:59:00.000Z',
      updatedAt: '2026-10-23T13:59:00.000Z',
    });

    // Seed CNG shift log & pressure reading on 2026-11-02 (OPEN shift)
    await db.insert(schema.cngShiftLogs).values({
      id: 'cng-log-coco22-1102',
      operationalShiftId: 'shift-coco22-2026-11-02',
      outletId: COCO22_ID,
      mfmOpeningKgMilliunits: 50000000,
      mfmClosingKgMilliunits: 50250000,
      netSalesKgMilliunits: 250000,
      recordedByUserId: 'user-admin',
      createdAt: '2026-11-02T15:00:00.000Z',
      updatedAt: '2026-11-02T15:00:00.000Z',
    });

    await db.insert(schema.cngPressureReadings).values({
      id: 'cng-pr-coco22-1102',
      operationalShiftId: 'shift-coco22-2026-11-02',
      outletId: COCO22_ID,
      recordedAt: '2026-11-02T06:15:00.000Z',
      pressureUnit: 'BAR',
      suctionPressureMilliunits: 45000,
      dischargePressureMilliunits: 245000,
      cascadePressureMilliunits: 205000,
      recordedByUserId: 'user-admin',
      createdAt: '2026-11-02T06:15:00.000Z',
      updatedAt: '2026-11-02T06:15:00.000Z',
    });

    // Seed Lube Shift Sale on 2026-11-02 (OPEN shift so BEFORE INSERT trigger passes)
    await db.insert(schema.lubeShiftSales).values({
      id: 'lss-coco22-1102-1',
      operationalShiftId: 'shift-coco22-2026-11-02',
      outletId: COCO22_ID,
      lubeSkuId: 'lsku-coco22-servo4t',
      skuCode: 'SERVO-4T-1L',
      skuName: 'Servo 4T 20W-40 (1L Pack)',
      category: '2W_ENGINE_OIL',
      stockUnit: 'PACK',
      quantitySubunits: 2000, // 2 packs
      unitPricePaise: 42000,
      revenuePaise: 84000,
      soldAt: '2026-11-02T16:00:00.000Z',
      recordedByUserId: 'user-admin',
      createdAt: '2026-11-02T16:00:00.000Z',
      updatedAt: '2026-11-02T16:00:00.000Z',
    });

    // Seed linked idempotency key for 2026-11-02 shift
    await db.insert(schema.idempotencyKeys).values({
      id: 'idem-coco22-1102-fr1',
      idempotencyKey: 'idem-key-coco22-fr-19914781',
      actorId: 'user-admin',
      route: 'POST:/api/v1/shifts/shift-coco22-2026-11-02/fuel-receipts',
      requestFingerprint: 'hash-19914781',
      responseStatus: 201,
      entityId: 'fr-coco22-19914781',
      responseBody: JSON.stringify({ success: true, data: { id: 'fr-coco22-19914781' } }),
      createdAt: '2026-11-02T09:30:00.000Z',
    });
  }

  it('1. Enforces strict ADMIN-only access control on all Daily Operations Reset endpoints', async () => {
    // 1a. Unauthenticated request -> 401
    const unauthRes = await app.fetch(
      new Request(
        `http://localhost/api/v1/admin/daily-ops-reset/preview?roCode=${COCO22_RO_CODE}&fromBusinessDate=${TARGET_FROM}&toBusinessDate=${TARGET_TO}`
      ),
      env
    );
    expect(unauthRes.status).toBe(401);

    // 1b. Non-ADMIN roles (DEALER, CSP, FIELD_OFFICER, DIVISIONAL_OFFICE, STATE_OFFICE) -> 403
    for (const email of [
      'dealer.parkstreet@iocl.in',
      'csp.parkstreet@iocl.in',
      'fo.central@iocl.in',
      'kolkatado@iocl.in',
      'wbso@iocl.in',
    ]) {
      const { cookie } = await loginAs(email);
      const res = await app.fetch(
        new Request(
          `http://localhost/api/v1/admin/daily-ops-reset/preview?roCode=${COCO22_RO_CODE}&fromBusinessDate=${TARGET_FROM}&toBusinessDate=${TARGET_TO}`,
          { headers: { Cookie: cookie } }
        ),
        env
      );
      expect(res.status).toBe(403);
    }

    // 1c. Global ADMIN -> 200 OK
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');
    const adminRes = await app.fetch(
      new Request(
        `http://localhost/api/v1/admin/daily-ops-reset/preview?roCode=${COCO22_RO_CODE}&fromBusinessDate=${TARGET_FROM}&toBusinessDate=${TARGET_TO}`,
        { headers: { Cookie: adminCookie } }
      ),
      env
    );
    expect(adminRes.status).toBe(200);
  });

  it('2. Generates accurate DRY-RUN PREVIEW for COCO 22 (396187) across 2026-10-23..2026-11-07, groups by businessDate, includes records with outside created_at timestamps, and detects official data blockers', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/admin/daily-ops-reset/preview?roCode=${COCO22_RO_CODE}&fromBusinessDate=${TARGET_FROM}&toBusinessDate=${TARGET_TO}`,
        { headers: { Cookie: adminCookie } }
      ),
      env
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);

    const preview = json.data;
    expect(preview.outlet.id).toBe(COCO22_ID);
    expect(preview.outlet.roCode).toBe('396187');
    expect(preview.outlet.name).toBe('COCO 22');
    expect(preview.dateRange).toEqual({
      fromBusinessDate: '2026-10-23',
      toBusinessDate: '2026-11-07',
    });

    // Verify exact shift counts and dependent record counts
    expect(preview.summaryCounts.operationalShifts).toBe(3);
    expect(preview.summaryCounts.openShifts).toBe(1);
    expect(preview.summaryCounts.closedShifts).toBe(2);
    expect(preview.summaryCounts.operationalShiftNozzles).toBe(6);
    expect(preview.summaryCounts.operationalShiftTanks).toBe(6);
    expect(preview.summaryCounts.operationalShiftProductPrices).toBe(3);
    expect(preview.summaryCounts.tankStockReadings).toBe(4); // includes 2026-11-20 created_at records!
    expect(preview.summaryCounts.openingTankDips).toBe(1);
    expect(preview.summaryCounts.closingTankDips).toBe(1);
    expect(preview.summaryCounts.prePostReceiptTankDips).toBe(2);
    expect(preview.summaryCounts.waterDipPositiveReadings).toBe(2);
    expect(preview.summaryCounts.nozzleMeterReadings).toBe(2); // includes 2026-11-18 created_at record!
    expect(preview.summaryCounts.nozzleTestingPositiveReadings).toBe(2); // 5.000 L testing records
    expect(preview.summaryCounts.nozzleUnavailabilityRecords).toBe(1);
    expect(preview.summaryCounts.fuelReceipts).toBe(2);
    expect(preview.summaryCounts.fuelReceiptTankLines).toBe(1);
    expect(preview.summaryCounts.shiftStockReconciliations).toBe(1);
    expect(preview.summaryCounts.shiftCollections).toBe(1);
    expect(preview.summaryCounts.cashHandoverLogs).toBe(1);
    expect(preview.summaryCounts.bankDeposits).toBe(1);
    expect(preview.summaryCounts.shiftFinancialReconciliations).toBe(1);
    expect(preview.summaryCounts.cngShiftLogs).toBe(1);
    expect(preview.summaryCounts.cngPressureReadings).toBe(1);
    expect(preview.summaryCounts.lubeShiftSales).toBe(1);
    expect(preview.summaryCounts.idempotencyKeysLinked).toBe(1);

    // Verify grouping by businessDate
    expect(preview.groupedByBusinessDate.map((g: any) => g.businessDate)).toEqual([
      '2026-10-23',
      '2026-11-02',
      '2026-11-07',
    ]);

    // Verify official & historical data blockers are detected and block reset until reviewed
    expect(preview.hasUnreviewedBlockers).toBe(true);
    expect(preview.canCreateBackup).toBe(true);
    expect(preview.canProceedToReset).toBe(false);

    const blockerIds = preview.blockers.map((b: any) => b.blockerId);
    expect(blockerIds).toContain('blk:shift:shift-coco22-2026-10-23:CLOSED_SHIFT');
    expect(blockerIds).toContain('blk:shift:shift-coco22-2026-11-07:CLOSED_SHIFT');
    expect(blockerIds).toContain(
      'blk:receipt:fr-coco22-19914781:POTENTIAL_OFFICIAL_FUEL_RECEIPT'
    ); // TT PB29AJ7443 — Invoice 19914781
    expect(blockerIds).toContain(
      'blk:receipt:fr-coco22-19932641:POTENTIAL_OFFICIAL_FUEL_RECEIPT'
    ); // TT PB13AL9133 — Invoice 19932641
    expect(blockerIds).toContain('blk:deposit:bd-coco22-1023-1:OFFICIAL_BANK_DEPOSIT');
    expect(blockerIds).toContain('blk:handover:chl-coco22-1023-1:SETTLED_CASH_HANDOVER');
    expect(blockerIds).toContain('blk:collection:sc-coco22-1023-upi:EXTERNAL_SETTLED_COLLECTION');

    // Verify protected data summary shows out-of-range shifts, other outlets, and calibration charts preserved
    expect(preview.protectedDataSummary.sameOutletOutsideRangeShiftsCount).toBe(2); // 2026-10-20 and 2026-11-08
    expect(preview.protectedDataSummary.outletCalibrationChartsCount).toBe(3); // includes Rev #2 DRAFT
    expect(preview.protectedDataSummary.outletDocumentsCount).toBe(1);
    expect(preview.protectedDataSummary.outletComplianceRecordsCount).toBe(1);
  });

  it('3. Creates restorable backup with SHA-256 checksum & record ID inventory, verifies integrity, and detects tampering', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Create backup
    const createRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/backups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          roCode: COCO22_RO_CODE,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          reason: 'Pre-go-live UAT backup for COCO 22 (2026-10-23 to 2026-11-07)',
        }),
      }),
      env
    );
    expect(createRes.status).toBe(201);
    const createJson: any = await createRes.json();
    expect(createJson.success).toBe(true);

    const backup = createJson.data;
    expect(backup.backupId).toMatch(/^rst-bkp-/);
    expect(backup.sha256Checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(backup.verified).toBe(true);
    expect(backup.totalRecords).toBe(37);
    expect(backup.r2ObjectKey).toContain('system-backups/daily-ops-reset/396187/');

    // Verify backup integrity via endpoint
    const verifyRes = await app.fetch(
      new Request(
        `http://localhost/api/v1/admin/daily-ops-reset/backups/${encodeURIComponent(backup.backupId)}/verify`,
        {
          method: 'POST',
          headers: { Cookie: adminCookie, Origin: 'http://localhost:3000' },
        }
      ),
      env
    );
    expect(verifyRes.status).toBe(200);
    const verifyJson: any = await verifyRes.json();
    expect(verifyJson.data.verified).toBe(true);
    expect(verifyJson.data.checksumMatches).toBe(true);
    expect(verifyJson.data.inventoryMatches).toBe(true);
    expect(verifyJson.data.r2ObjectPresent).toBe(true);

    // Tamper with R2 backup payload and verify tamper detection catches checksum mismatch
    const r2Key = backup.r2ObjectKey;
    const originalR2 = r2Bucket.store.get(r2Key)!;
    await r2Bucket.put(r2Key, '{"tampered":true}');

    const tamperedVerifyRes = await app.fetch(
      new Request(
        `http://localhost/api/v1/admin/daily-ops-reset/backups/${encodeURIComponent(backup.backupId)}/verify`,
        {
          method: 'POST',
          headers: { Cookie: adminCookie, Origin: 'http://localhost:3000' },
        }
      ),
      env
    );
    expect(tamperedVerifyRes.status).toBe(409);
    const tamperedJson: any = await tamperedVerifyRes.json();
    expect(tamperedJson.data.verified).toBe(false);
    expect(tamperedJson.data.checksumMatches).toBe(false);

    // Restore original R2 object
    r2Bucket.store.set(r2Key, originalR2);
  });

  it('4. Blocks approval and execution until official/closed-shift blockers are reviewed & attested, and rejects LOCKED shifts', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Create backup first
    const bkpRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/backups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          roCode: COCO22_RO_CODE,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          reason: 'Backup before blocker check',
        }),
      }),
      env
    );
    const { backupId } = ((await bkpRes.json()) as any).data;

    // Attempt approval WITHOUT reviewing blockers -> 409 OFFICIAL_DATA_BLOCKER_UNREVIEWED
    const prematureApproveRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/approvals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          backupId,
          approvalReason: 'Attempting approval before reviewing blockers',
          confirmIrreversibleReset: true,
          confirmClosedShiftReset: true,
          confirmationPhrase: 'RESET COCO TEST DATA',
        }),
      }),
      env
    );
    expect(prematureApproveRes.status).toBe(409);
    const prematureJson: any = await prematureApproveRes.json();
    expect(prematureJson.error.code).toBe('OFFICIAL_DATA_BLOCKER_UNREVIEWED');

    // Verify LOCKED shift cannot be reviewed or deleted
    await db
      .update(schema.operationalShifts)
      .set({ status: 'LOCKED' })
      .where(eq(schema.operationalShifts.id, 'shift-coco22-2026-10-23'));

    const lockedReviewRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/review-blockers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          blockerIds: ['blk:shift:shift-coco22-2026-10-23:LOCKED_SHIFT'],
          reviewNotes: 'Trying to override locked shift',
          attestConfirmedUatTestData: true,
        }),
      }),
      env
    );
    expect(lockedReviewRes.status).toBe(409);
    const lockedJson: any = await lockedReviewRes.json();
    expect(lockedJson.error.code).toBe('LOCKED_SHIFT_RESET_FORBIDDEN');

    // Restore shift status to CLOSED
    await db
      .update(schema.operationalShifts)
      .set({ status: 'CLOSED' })
      .where(eq(schema.operationalShifts.id, 'shift-coco22-2026-10-23'));
  });

  it('5. Full End-to-End Controlled Reset Workflow: Review Blockers -> Backup -> Scope-Drift Guard -> Partial Failure Rollback -> Atomic Reset -> Post-Reset Verification -> Open Fresh Shift -> Restore from Backup', async () => {
    const { cookie: adminCookie, user: adminUser } = await loginAs('admin@iocl.in');
    const actor = {
      userId: adminUser.id,
      name: adminUser.name || 'Rajesh Sharma',
      email: adminUser.email,
    };

    // Step 1: Preview & get all blocker IDs
    const preview1 = await DailyOperationsTestDataResetService.generateDryRunPreview(db, {
      roCode: COCO22_RO_CODE,
      fromBusinessDate: TARGET_FROM,
      toBusinessDate: TARGET_TO,
      actor,
    });
    expect(preview1.unreviewedBlockersCount).toBe(7);

    // Step 2: Review and attest all 7 blockers as UAT test entries
    const allBlockerIds = preview1.blockers.map((b) => b.blockerId);
    const reviewRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/review-blockers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          blockerIds: allBlockerIds,
          reviewNotes:
            'Confirmed with COCO 22 Outlet Manager that TT PB29AJ7443 (19914781), TT PB13AL9133 (19932641), and Oct 23/Nov 7 shifts were pre-go-live UAT test entries.',
          attestConfirmedUatTestData: true,
        }),
      }),
      env
    );
    expect(reviewRes.status).toBe(200);
    const reviewJson: any = await reviewRes.json();
    expect(reviewJson.data.remainingUnreviewedBlockersCount).toBe(0);
    expect(reviewJson.data.canProceedToReset).toBe(true);

    // Step 3: Create & verify backup
    const backupRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/backups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          reason: 'Verified pre-reset backup for COCO 22 UAT data',
        }),
      }),
      env
    );
    expect(backupRes.status).toBe(201);
    const { backupId, sha256Checksum } = ((await backupRes.json()) as any).data;

    // Step 4: Verify Scope-Drift Guard if a new record appears after backup creation
    await db.insert(schema.nozzleUnavailabilityRecords).values({
      id: 'nur-drift-record',
      operationalShiftId: 'shift-coco22-2026-11-02',
      nozzleId: 'noz-coco22-2',
      reason: 'Added after backup was taken',
      recordedBy: 'user-admin',
      createdAt: '2026-11-02T18:00:00.000Z',
    });

    const driftApprovalRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/approvals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          backupId,
          approvalReason: 'Should fail due to scope drift',
          confirmIrreversibleReset: true,
          confirmClosedShiftReset: true,
          confirmationPhrase: 'RESET COCO TEST DATA',
        }),
      }),
      env
    );
    expect(driftApprovalRes.status).toBe(409);
    expect(((await driftApprovalRes.json()) as any).error.code).toBe(
      'SCOPE_DRIFT_DETECTED'
    );

    // Remove the drift record so scope matches the verified backup
    await db
      .delete(schema.nozzleUnavailabilityRecords)
      .where(eq(schema.nozzleUnavailabilityRecords.id, 'nur-drift-record'));

    // Step 5: Approve Reset Request
    const approveRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/approvals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          backupId,
          approvalReason: 'Authorised pre-go-live test data reset for COCO 22 (2026-10-23 to 2026-11-07)',
          confirmIrreversibleReset: true,
          confirmClosedShiftReset: true,
          confirmationPhrase: 'RESET COCO TEST DATA',
        }),
      }),
      env
    );
    expect(approveRes.status).toBe(201);
    const approval = ((await approveRes.json()) as any).data;
    expect(approval.approvalId).toMatch(/^rst-apr-/);

    // Step 6: Simulate mid-batch failure and verify 100% atomic rollback!
    await expect(
      DailyOperationsTestDataResetService.executeApprovedReset(localD1, db, r2Bucket as any, {
        approvalId: approval.approvalId,
        backupId,
        confirmationPhrase: 'RESET COCO TEST DATA',
        executionNotes: 'Simulated failure test',
        simulateFailureAfterDeletesForTest: true,
        actor,
      })
    ).rejects.toThrow();

    // Verify all 3 target shifts and all child records are still 100% intact after rollback
    const postRollbackPreview = await DailyOperationsTestDataResetService.generateDryRunPreview(
      db,
      {
        outletId: COCO22_ID,
        fromBusinessDate: TARGET_FROM,
        toBusinessDate: TARGET_TO,
        actor,
      }
    );
    expect(postRollbackPreview.summaryCounts.operationalShifts).toBe(3);
    expect(postRollbackPreview.summaryCounts.totalAffectedRecords).toBe(37);

    // Step 7: Execute Atomic Reset for real via API
    const execRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          backupId,
          approvalId: approval.approvalId,
          confirmationPhrase: 'RESET COCO TEST DATA',
          executionNotes: 'Final authorised reset of COCO 22 UAT shifts (2026-10-23..2026-11-07)',
        }),
      }),
      env
    );
    expect(execRes.status).toBe(200);
    const execJson: any = await execRes.json();
    expect(execJson.success).toBe(true);

    const execResult = execJson.data;
    expect(execResult.executionId).toMatch(/^aud-rst-exec-/);
    expect(execResult.backupId).toBe(backupId);
    expect(execResult.backupSha256Checksum).toBe(sha256Checksum);
    expect(execResult.totalDeletedRecords).toBe(37);
    expect(execResult.postResetVerification).toMatchObject({
      remainingTargetShiftsCount: 0,
      remainingTargetChildRecordsCount: 0,
      foreignKeyViolationsCount: 0,
      protectedTablesIntact: true,
      canOpenFreshShift: true,
    });

    // Step 8: Verify Repeat Execution is rejected with 409 RESET_ALREADY_EXECUTED
    const repeatExecRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          backupId,
          approvalId: approval.approvalId,
          confirmationPhrase: 'RESET COCO TEST DATA',
          executionNotes: 'Duplicate execution attempt',
        }),
      }),
      env
    );
    expect(repeatExecRes.status).toBe(409);
    expect(((await repeatExecRes.json()) as any).error.code).toBe('RESET_ALREADY_EXECUTED');

    // Step 9: Verify Scope Isolation & Protected Data Preservation
    // 9a. Out-of-range COCO 22 shifts (2026-10-20 and 2026-11-08) are still intact
    const remainingCoco22Shifts = await db
      .select()
      .from(schema.operationalShifts)
      .where(eq(schema.operationalShifts.outletId, COCO22_ID));
    expect(remainingCoco22Shifts.map((s) => s.businessDate).sort()).toEqual([
      '2026-10-20',
      '2026-11-08',
    ]);

    // 9b. COCO 22 Tank #1 Rev #1 ACTIVE + Rev #2 DRAFT calibration charts are 100% preserved
    const coco22Tanks = await db
      .select()
      .from(schema.tanks)
      .where(eq(schema.tanks.outletId, COCO22_ID));
    expect(coco22Tanks.length).toBe(2);

    const coco22Charts = await db
      .select()
      .from(schema.tankCalibrationCharts)
      .where(eq(schema.tankCalibrationCharts.tankId, 'tank-coco22-1'));
    expect(coco22Charts.length).toBe(2);
    expect(coco22Charts.some((c) => c.id === 'cal-coco22-t1-rev2-draft' && c.status === 'DRAFT')).toBe(
      true
    );

    // 9c. COCO 22 Document Vault & Compliance records are 100% preserved
    const coco22Docs = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.outletId, COCO22_ID));
    expect(coco22Docs.length).toBe(1);
    const coco22Comp = await db
      .select()
      .from(schema.cocoComplianceRecords)
      .where(eq(schema.cocoComplianceRecords.outletId, COCO22_ID));
    expect(coco22Comp.length).toBe(1);

    // Step 10: Verify COCO 22 can immediately open a fresh operational shift for 2026-11-02!
    const openFreshShiftRes = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${COCO22_ID}/shifts/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-11-02',
          notes: 'Fresh post-reset shift at COCO 22',
        }),
      }),
      env
    );
    expect(openFreshShiftRes.status).toBe(201);
    const freshShift = ((await openFreshShiftRes.json()) as any).data;
    expect(freshShift.outletId).toBe(COCO22_ID);
    expect(freshShift.businessDate).toBe('2026-11-02');
    expect(freshShift.status).toBe('OPEN');

    // Step 11: Test Authorised Restoration from Verified Backup
    // First remove the newly opened fresh shift so we can restore the backed-up 2026-10-23..2026-11-07 shifts cleanly
    const freshBkp = await DailyOperationsTestDataResetService.createResetBackup(
      db,
      r2Bucket as any,
      {
        outletId: COCO22_ID,
        fromBusinessDate: '2026-11-02',
        toBusinessDate: '2026-11-02',
        reason: 'Clear fresh shift before testing backup restore',
        actor,
      }
    );
    const freshApr = await DailyOperationsTestDataResetService.approveResetRequest(
      db,
      r2Bucket as any,
      {
        outletId: COCO22_ID,
        fromBusinessDate: '2026-11-02',
        toBusinessDate: '2026-11-02',
        backupId: freshBkp.backupId,
        approvalReason: 'Clear fresh shift before testing backup restore',
        confirmIrreversibleReset: true,
        confirmClosedShiftReset: true,
        confirmationPhrase: 'RESET COCO TEST DATA',
        actor,
      }
    );
    await DailyOperationsTestDataResetService.executeApprovedReset(localD1, db, r2Bucket as any, {
      approvalId: freshApr.approvalId,
      backupId: freshBkp.backupId,
      confirmationPhrase: 'RESET COCO TEST DATA',
      executionNotes: 'Clear fresh shift before testing backup restore',
      actor,
    });

    // Now invoke the Restore API for the original backupId!
    const restoreRes = await app.fetch(
      new Request(
        `http://localhost/api/v1/admin/daily-ops-reset/backups/${encodeURIComponent(backupId)}/restore`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminCookie,
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            restoreReason: 'Verify full restoration of backed-up COCO 22 shifts and child records',
          }),
        }
      ),
      env
    );
    expect(restoreRes.status).toBe(200);
    const restoreJson: any = await restoreRes.json();
    expect(restoreJson.success).toBe(true);
    expect(restoreJson.data.totalRestoredRecords).toBe(37);
    expect(restoreJson.data.foreignKeyViolationsCount).toBe(0);

    // Verify all 3 shifts and all 37 records are back in place!
    const restoredPreview = await DailyOperationsTestDataResetService.generateDryRunPreview(db, {
      outletId: COCO22_ID,
      fromBusinessDate: TARGET_FROM,
      toBusinessDate: TARGET_TO,
      actor,
    });
    expect(restoredPreview.summaryCounts.operationalShifts).toBe(3);
    expect(restoredPreview.summaryCounts.totalAffectedRecords).toBe(37);
  });

  it('6. Streamlined Admin Deletion Workflow: Check Data -> Automated Backup & Single Confirmation -> "Data Reset Successfully — 0 Records Remaining" & "No Data to Delete"', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // 1. Non-admin is blocked with HTTP 403
    const nonAdminRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/streamlined-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          confirmationPhrase: 'RESET COCO TEST DATA',
          confirmIrreversibleReset: true,
        }),
      }),
      env
    );
    expect(nonAdminRes.status).toBe(403);

    // 2. Missing phrase returns HTTP 400
    const badPhraseRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/streamlined-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          confirmationPhrase: 'WRONG PHRASE',
          confirmIrreversibleReset: true,
        }),
      }),
      env
    );
    expect(badPhraseRes.status).toBe(400);

    // 3. Unconfirmed irreversible returns HTTP 400
    const unconfirmedRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/streamlined-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          confirmationPhrase: 'RESET COCO TEST DATA',
          confirmIrreversibleReset: false,
        }),
      }),
      env
    );
    expect(unconfirmedRes.status).toBe(400);

    // 4. Missing UAT attestation when official blockers exist returns HTTP 409
    const noAttestRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/streamlined-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          confirmationPhrase: 'RESET COCO TEST DATA',
          confirmIrreversibleReset: true,
          attestConfirmedUatTestData: false,
        }),
      }),
      env
    );
    expect(noAttestRes.status).toBe(409);
    const noAttestJson: any = await noAttestRes.json();
    expect(noAttestJson.error.code).toBe('OFFICIAL_DATA_BLOCKER_UNREVIEWED');

    // 5. Successful Streamlined Reset Execution
    const deleteRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/streamlined-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          confirmationPhrase: 'RESET COCO TEST DATA',
          confirmIrreversibleReset: true,
          confirmClosedShiftReset: true,
          attestConfirmedUatTestData: true,
          reviewNotes: 'Authorised pre-go-live UAT test data cleanup for COCO 22',
        }),
      }),
      env
    );
    expect(deleteRes.status).toBe(200);
    const deleteJson: any = await deleteRes.json();
    expect(deleteJson.success).toBe(true);
    expect(deleteJson.data.totalDeletedRecords).toBe(37);
    expect(deleteJson.data.remainingRecords).toBe(0);
    expect(deleteJson.data.message).toBe('Data Reset Successfully — 0 Records Remaining');
    expect(deleteJson.data.backupId).toMatch(/^rst-bkp-/);
    expect(deleteJson.data.postResetVerification.remainingShiftsInRange).toBe(0);
    expect(deleteJson.data.postResetVerification.orphanedRecordsCount).toBe(0);

    // 6. Check Data after reset shows 0 shifts and 0 records ("No Data to Delete")
    const afterPreviewRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
        }),
      }),
      env
    );
    expect(afterPreviewRes.status).toBe(200);
    const afterPreviewJson: any = await afterPreviewRes.json();
    expect(afterPreviewJson.data.summaryCounts.operationalShifts).toBe(0);
    expect(afterPreviewJson.data.summaryCounts.totalAffectedRecords).toBe(0);

    // 7. Calling streamlined delete again on empty range fails with HTTP 409 NO_SHIFTS_IN_SCOPE
    const repeatRes = await app.fetch(
      new Request('http://localhost/api/v1/admin/daily-ops-reset/streamlined-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          outletId: COCO22_ID,
          fromBusinessDate: TARGET_FROM,
          toBusinessDate: TARGET_TO,
          confirmationPhrase: 'RESET COCO TEST DATA',
          confirmIrreversibleReset: true,
          attestConfirmedUatTestData: true,
          reviewNotes: 'Repeat call on empty scope',
        }),
      }),
      env
    );
    expect(repeatRes.status).toBe(409);
    const repeatJson: any = await repeatRes.json();
    expect(repeatJson.error.code).toBe('NO_SHIFTS_IN_SCOPE');

    // 8. Verify the panel UI file contains all required streamlined testids and messages
    const panelSource = fs.readFileSync(
      './src/frontend/components/pump/DailyOperationsTestDataResetPanel.tsx',
      'utf8'
    );
    expect(panelSource).toContain('check-data-btn');
    expect(panelSource).toContain('delete-test-data-btn');
    expect(panelSource).toContain('streamlined-delete-confirm-modal');
    expect(panelSource).toContain('confirm-delete-test-data-btn');
    expect(panelSource).toContain('advanced-admin-tools-toggle');
    expect(panelSource).toContain('Data Reset Successfully — 0 Records Remaining');
    expect(panelSource).toContain('No Data to Delete');

    // 9. Verify DailyOperationsPage.tsx control blocks invariant (must stay 11)
    const dailyOpsSource = fs.readFileSync('./src/frontend/pages/DailyOperationsPage.tsx', 'utf8');
    const inputBlocks = dailyOpsSource.match(/<input\b[\s\S]*?\/>/g) || [];
    const selectBlocks = dailyOpsSource.match(/<select\b[\s\S]*?>\s*\{/g) || [];
    const controlBlocks = [...inputBlocks, ...selectBlocks];
    expect(controlBlocks.length).toBe(11);
  });
});


