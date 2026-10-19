import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { createLocalD1Database } from "../src/db/localD1";
import { getDb } from "../src/db";
import { seedDatabase } from "../src/db/seed";
import { MonthlyOperationsReportService } from "../src/worker/services/monthlyOperationsReportService";
import app from "../src/worker/app";
import * as schema from "../src/db/schema";

describe("Monthly Operations Register Aggregation Hardening", () => {
  let localD1: any;
  let testDbPath: string;
  let adminToken: string;
  let dealerToken: string;
  const nowIso = "2026-10-01T00:00:00.000Z";

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_aggr_${Date.now()}_${Math.random()}.db`;
    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    const loginRes = await app.request(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "admin@iocl.in", password: "Password@123" }),
      },
      { DB: localD1 }
    );
    const loginJson: any = await loginRes.json();
    adminToken = loginJson.data?.token || "";

    const dealerRes = await app.request(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "dealer.parkstreet@iocl.in", password: "Password@123" }),
      },
      { DB: localD1 }
    );
    const dealerJson: any = await dealerRes.json();
    dealerToken = dealerJson.data?.token || "";
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch (e) {}
  });

  // 1. INDEPENDENT CUMULATIVE SALES
  it("1. Independent cumulative sales for MS and HSD", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    // Day 1 Shift
    await db.insert(schema.operationalShifts).values({
      id: "shift-cum-1",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-01",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-01T06:00:00Z",
      endedAt: "2026-10-01T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    // Day 2 Shift
    await db.insert(schema.operationalShifts).values({
      id: "shift-cum-2",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-02",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-02T06:00:00Z",
      endedAt: "2026-10-02T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    // Prices for MS and HSD
    await db.insert(schema.operationalShiftProductPrices).values([
      {
        id: "opp-cum-ms-1",
        operationalShiftId: "shift-cum-1",
        outletId,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        unit: "LITRE",
        pricePaisePerUnit: 10000,
        sourcePriceId: "opp-seed-1",
        createdAt: nowIso,
      },
      {
        id: "opp-cum-hsd-1",
        operationalShiftId: "shift-cum-1",
        outletId,
        productId: "prod-hsd",
        productCode: "HSD",
        productName: "High Speed Diesel",
        unit: "LITRE",
        pricePaisePerUnit: 9000,
        sourcePriceId: "opp-seed-2",
        createdAt: nowIso,
      },
      {
        id: "opp-cum-ms-2",
        operationalShiftId: "shift-cum-2",
        outletId,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        unit: "LITRE",
        pricePaisePerUnit: 10000,
        sourcePriceId: "opp-seed-1",
        createdAt: nowIso,
      },
      {
        id: "opp-cum-hsd-2",
        operationalShiftId: "shift-cum-2",
        outletId,
        productId: "prod-hsd",
        productCode: "HSD",
        productName: "High Speed Diesel",
        unit: "LITRE",
        pricePaisePerUnit: 9000,
        sourcePriceId: "opp-seed-2",
        createdAt: nowIso,
      },
    ] as any);

    // Nozzles
    await db.insert(schema.operationalShiftNozzles).values([
      {
        id: "osn-cum-ms-1",
        operationalShiftId: "shift-cum-1",
        outletId,
        nozzleId: "nozz-ro1-1-1",
        dispenserId: "disp-ro1-1",
        dispenserNumber: 1,
        dispenserName: "Dispenser 1",
        nozzleNumber: 1,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        productCategory: "MS",
        productUnit: "LITRE",
        tankId: "tank-ro1-1",
        tankNumber: 1,
        snapshotStatus: "ACTIVE",
        createdAt: nowIso,
      },
      {
        id: "osn-cum-hsd-1",
        operationalShiftId: "shift-cum-1",
        outletId,
        nozzleId: "nozz-ro1-1-2",
        dispenserId: "disp-ro1-1",
        dispenserNumber: 1,
        dispenserName: "Dispenser 1",
        nozzleNumber: 2,
        productId: "prod-hsd",
        productCode: "HSD",
        productName: "High Speed Diesel",
        productCategory: "HSD",
        productUnit: "LITRE",
        tankId: "tank-ro1-2",
        tankNumber: 2,
        snapshotStatus: "ACTIVE",
        createdAt: nowIso,
      },
      {
        id: "osn-cum-ms-2",
        operationalShiftId: "shift-cum-2",
        outletId,
        nozzleId: "nozz-ro1-1-1",
        dispenserId: "disp-ro1-1",
        dispenserNumber: 1,
        dispenserName: "Dispenser 1",
        nozzleNumber: 1,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        productCategory: "MS",
        productUnit: "LITRE",
        tankId: "tank-ro1-1",
        tankNumber: 1,
        snapshotStatus: "ACTIVE",
        createdAt: nowIso,
      },
      {
        id: "osn-cum-hsd-2",
        operationalShiftId: "shift-cum-2",
        outletId,
        nozzleId: "nozz-ro1-1-2",
        dispenserId: "disp-ro1-1",
        dispenserNumber: 1,
        dispenserName: "Dispenser 1",
        nozzleNumber: 2,
        productId: "prod-hsd",
        productCode: "HSD",
        productName: "High Speed Diesel",
        productCategory: "HSD",
        productUnit: "LITRE",
        tankId: "tank-ro1-2",
        tankNumber: 2,
        snapshotStatus: "ACTIVE",
        createdAt: nowIso,
      },
    ] as any);

    // Readings:
    // MS Day 1: 100 L (100000 milliunits)
    // MS Day 2: 150 L (150000 milliunits)
    // HSD Day 1: 40 L (40000 milliunits)
    // HSD Day 2: 60 L (60000 milliunits)
    await db.insert(schema.nozzleMeterReadings).values([
      {
        id: "nmr-cum-ms-1",
        operationalShiftId: "shift-cum-1",
        outletId,
        nozzleId: "nozz-ro1-1-1",
        openingTotalizerMilliunits: 100000,
        closingTotalizerMilliunits: 200000,
        grossSalesQuantityMilliunits: 100000,
        testingQuantityMilliunits: 0,
        netSalesQuantityMilliunits: 100000,
        recordedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "nmr-cum-hsd-1",
        operationalShiftId: "shift-cum-1",
        outletId,
        nozzleId: "nozz-ro1-1-2",
        openingTotalizerMilliunits: 50000,
        closingTotalizerMilliunits: 90000,
        grossSalesQuantityMilliunits: 40000,
        testingQuantityMilliunits: 0,
        netSalesQuantityMilliunits: 40000,
        recordedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "nmr-cum-ms-2",
        operationalShiftId: "shift-cum-2",
        outletId,
        nozzleId: "nozz-ro1-1-1",
        openingTotalizerMilliunits: 200000,
        closingTotalizerMilliunits: 350000,
        grossSalesQuantityMilliunits: 150000,
        testingQuantityMilliunits: 0,
        netSalesQuantityMilliunits: 150000,
        recordedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "nmr-cum-hsd-2",
        operationalShiftId: "shift-cum-2",
        outletId,
        nozzleId: "nozz-ro1-1-2",
        openingTotalizerMilliunits: 90000,
        closingTotalizerMilliunits: 150000,
        grossSalesQuantityMilliunits: 60000,
        testingQuantityMilliunits: 0,
        netSalesQuantityMilliunits: 60000,
        recordedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const msSection = report.productSections.find((s) => s.productId === "prod-ms");
    const hsdSection = report.productSections.find((s) => s.productId === "prod-hsd");

    expect(msSection).not.toBeUndefined();
    expect(hsdSection).not.toBeUndefined();

    const msRow1 = msSection!.rows.find((r) => r.businessDate === "2026-10-01");
    const msRow2 = msSection!.rows.find((r) => r.businessDate === "2026-10-02");
    expect(msRow1?.netSalesL).toBe(100);
    expect(msRow1?.cumulativeSalesL).toBe(100);
    expect(msRow2?.netSalesL).toBe(150);
    expect(msRow2?.cumulativeSalesL).toBe(250);

    const hsdRow1 = hsdSection!.rows.find((r) => r.businessDate === "2026-10-01");
    const hsdRow2 = hsdSection!.rows.find((r) => r.businessDate === "2026-10-02");
    expect(hsdRow1?.netSalesL).toBe(40);
    expect(hsdRow1?.cumulativeSalesL).toBe(40);
    expect(hsdRow2?.netSalesL).toBe(60);
    expect(hsdRow2?.cumulativeSalesL).toBe(100);
  });

  // 2. EXACT PRODUCT TOTALS
  it("2. Calculates exact product totals from generated rows", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    await db.insert(schema.operationalShifts).values([
      {
        id: "shift-tot-1",
        outletId,
        shiftTemplateId: "st-ro1-1",
        businessDate: "2026-10-01",
        shiftNumber: 1,
        status: "CLOSED",
        startedAt: "2026-10-01T06:00:00Z",
        endedAt: "2026-10-01T14:00:00Z",
        openedByUserId: "user-admin",
        closedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "shift-tot-2",
        outletId,
        shiftTemplateId: "st-ro1-1",
        businessDate: "2026-10-02",
        shiftNumber: 1,
        status: "CLOSED",
        startedAt: "2026-10-02T06:00:00Z",
        endedAt: "2026-10-02T14:00:00Z",
        openedByUserId: "user-admin",
        closedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    await db.insert(schema.operationalShiftProductPrices).values([
      {
        id: "opp-tot-1",
        operationalShiftId: "shift-tot-1",
        outletId,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        unit: "LITRE",
        pricePaisePerUnit: 10000,
        sourcePriceId: "opp-seed-1",
        createdAt: nowIso,
      },
      {
        id: "opp-tot-2",
        operationalShiftId: "shift-tot-2",
        outletId,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        unit: "LITRE",
        pricePaisePerUnit: 10000,
        sourcePriceId: "opp-seed-1",
        createdAt: nowIso,
      },
    ] as any);

    await db.insert(schema.operationalShiftNozzles).values([
      {
        id: "osn-tot-1",
        operationalShiftId: "shift-tot-1",
        outletId,
        nozzleId: "nozz-ro1-1-1",
        dispenserId: "disp-ro1-1",
        dispenserNumber: 1,
        dispenserName: "Dispenser 1",
        nozzleNumber: 1,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        productCategory: "MS",
        productUnit: "LITRE",
        tankId: "tank-ro1-1",
        tankNumber: 1,
        snapshotStatus: "ACTIVE",
        createdAt: nowIso,
      },
      {
        id: "osn-tot-2",
        operationalShiftId: "shift-tot-2",
        outletId,
        nozzleId: "nozz-ro1-1-1",
        dispenserId: "disp-ro1-1",
        dispenserNumber: 1,
        dispenserName: "Dispenser 1",
        nozzleNumber: 1,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        productCategory: "MS",
        productUnit: "LITRE",
        tankId: "tank-ro1-1",
        tankNumber: 1,
        snapshotStatus: "ACTIVE",
        createdAt: nowIso,
      },
    ] as any);

    await db.insert(schema.nozzleMeterReadings).values([
      {
        id: "nmr-tot-1",
        operationalShiftId: "shift-tot-1",
        outletId,
        nozzleId: "nozz-ro1-1-1",
        openingTotalizerMilliunits: 100000,
        closingTotalizerMilliunits: 200000,
        grossSalesQuantityMilliunits: 100000,
        testingQuantityMilliunits: 0,
        netSalesQuantityMilliunits: 100000,
        recordedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "nmr-tot-2",
        operationalShiftId: "shift-tot-2",
        outletId,
        nozzleId: "nozz-ro1-1-1",
        openingTotalizerMilliunits: 200000,
        closingTotalizerMilliunits: 355000,
        grossSalesQuantityMilliunits: 155000,
        testingQuantityMilliunits: 5000,
        netSalesQuantityMilliunits: 150000,
        recordedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    await db.insert(schema.shiftStockReconciliations).values([
      {
        id: "ssr-tot-1",
        operationalShiftId: "shift-tot-1",
        outletId,
        tankId: "tank-ro1-1",
        productId: "prod-ms",
        openingStockMilliunits: 10000000,
        receiptQuantityMilliunits: 300000,
        salesQuantityMilliunits: 100000,
        theoreticalClosingStockMilliunits: 10200000,
        physicalClosingStockMilliunits: 10210000,
        varianceMilliunits: 10000,
        varianceStatus: "GAIN",
        calculatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "ssr-tot-2",
        operationalShiftId: "shift-tot-2",
        outletId,
        tankId: "tank-ro1-1",
        productId: "prod-ms",
        openingStockMilliunits: 10210000,
        receiptQuantityMilliunits: 400000,
        salesQuantityMilliunits: 150000,
        theoreticalClosingStockMilliunits: 10460000,
        physicalClosingStockMilliunits: 10485000,
        varianceMilliunits: 25000,
        varianceStatus: "GAIN",
        calculatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const msSection = report.productSections.find((s) => s.productId === "prod-ms");

    expect(msSection).not.toBeUndefined();
    expect(msSection!.totals.totalMeterSalesL).toBe(250);
    expect(msSection!.totals.totalTestingL).toBe(5);
    expect(msSection!.totals.totalNetSalesL).toBe(250);
    expect(msSection!.totals.totalReceiptsL).toBe(700);
    expect(msSection!.totals.totalVarianceL).toBe(25);
  });

  // 3. PRODUCT DISCOVERY
  it("3. Product discovered from nozzle snapshot even if RSP missing (NOZZLE-ONLY)", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    await db.insert(schema.operationalShifts).values({
      id: "shift-nozz-only",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-10",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-10T06:00:00Z",
      endedAt: "2026-10-10T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    await db.insert(schema.operationalShiftNozzles).values({
      id: "osn-only-xp95",
      operationalShiftId: "shift-nozz-only",
      outletId,
      nozzleId: "nozz-ro1-1-1",
      dispenserId: "disp-ro1-1",
      dispenserNumber: 1,
      dispenserName: "Dispenser 1",
      nozzleNumber: 1,
      productId: "prod-xp95",
      productCode: "XP95",
      productName: "XP95 Premium Petrol",
      productCategory: "XP95",
      productUnit: "LITRE",
      tankId: "tank-ro1-3",
      tankNumber: 3,
      snapshotStatus: "ACTIVE",
      createdAt: nowIso,
    } as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const xp95Section = report.productSections.find((s) => s.productId === "prod-xp95");

    expect(xp95Section).not.toBeUndefined();
    expect(xp95Section?.productId).toBe("prod-xp95");
    const row = xp95Section!.rows.find((r) => r.businessDate === "2026-10-10");
    expect(row?.status).toBe("PARTIAL");
    expect(row?.missingFields).toContain("No RSP snapshot");
  });

  it("4. Product discovered from tank snapshot even if price missing (TANK-ONLY)", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    await db.insert(schema.operationalShifts).values({
      id: "shift-tank-only",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-12",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-12T06:00:00Z",
      endedAt: "2026-10-12T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    await db.insert(schema.operationalShiftTanks).values({
      id: "ost-only-xtra",
      operationalShiftId: "shift-tank-only",
      outletId,
      tankId: "tank-ro1-2",
      tankNumber: 2,
      tankName: "Tank 2 - XTRAGREEN",
      productId: "prod-xtragreen",
      productCode: "XTRAGREEN",
      productName: "XTRAGREEN Diesel",
      productUnit: "LITRE",
      capacityMilliunits: 25000000,
      safeFillCapacityMilliunits: 23750000,
      createdAt: nowIso,
    } as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const xtraSection = report.productSections.find((s) => s.productId === "prod-xtragreen");

    expect(xtraSection).not.toBeUndefined();
    expect(xtraSection?.productId).toBe("prod-xtragreen");
    const row = xtraSection!.rows.find((r) => r.businessDate === "2026-10-12");
    expect(row?.status).toBe("PARTIAL");
    expect(row?.missingFields).toContain("No RSP snapshot");
  });

  // 4. RSP TESTS
  it("5. Multiple RSPs on same day set changedWithinDay === true", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    await db.insert(schema.operationalShifts).values([
      {
        id: "shift-rsp-1",
        outletId,
        shiftTemplateId: "st-ro1-1",
        businessDate: "2026-10-05",
        shiftNumber: 1,
        status: "CLOSED",
        startedAt: "2026-10-05T06:00:00Z",
        endedAt: "2026-10-05T14:00:00Z",
        openedByUserId: "user-admin",
        closedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "shift-rsp-2",
        outletId,
        shiftTemplateId: "st-ro1-2",
        businessDate: "2026-10-05",
        shiftNumber: 2,
        status: "CLOSED",
        startedAt: "2026-10-05T14:00:00Z",
        endedAt: "2026-10-05T22:00:00Z",
        openedByUserId: "user-admin",
        closedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    await db.insert(schema.operationalShiftProductPrices).values([
      {
        id: "opp-rsp-1",
        operationalShiftId: "shift-rsp-1",
        outletId,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        unit: "LITRE",
        pricePaisePerUnit: 10000,
        sourcePriceId: "opp-seed-1",
        createdAt: nowIso,
      },
      {
        id: "opp-rsp-2",
        operationalShiftId: "shift-rsp-2",
        outletId,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        unit: "LITRE",
        pricePaisePerUnit: 10100,
        sourcePriceId: "opp-seed-1",
        createdAt: nowIso,
      },
    ] as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const msSection = report.productSections.find((s) => s.productId === "prod-ms");
    const row = msSection!.rows.find((r) => r.businessDate === "2026-10-05");

    expect(row).not.toBeUndefined();
    expect(row?.rspPaise).toEqual([10000, 10100]);
    expect(row?.changedWithinDay).toBe(true);
  });

  // 5. NOZZLE SALES
  it("6. Nozzle sales aggregate exact gross, testing, net, and daily sales", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    await db.insert(schema.operationalShifts).values({
      id: "shift-sale-1",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-07",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-07T06:00:00Z",
      endedAt: "2026-10-07T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    await db.insert(schema.operationalShiftNozzles).values({
      id: "osn-sale-1",
      operationalShiftId: "shift-sale-1",
      outletId,
      nozzleId: "nozz-ro1-1-1",
      dispenserId: "disp-ro1-1",
      dispenserNumber: 1,
      dispenserName: "Dispenser 1",
      nozzleNumber: 1,
      productId: "prod-ms",
      productCode: "MS",
      productName: "Motor Spirit",
      productCategory: "MS",
      productUnit: "LITRE",
      tankId: "tank-ro1-1",
      tankNumber: 1,
      snapshotStatus: "ACTIVE",
      createdAt: nowIso,
    } as any);

    await db.insert(schema.nozzleMeterReadings).values({
      id: "nmr-sale-1",
      operationalShiftId: "shift-sale-1",
      outletId,
      nozzleId: "nozz-ro1-1-1",
      openingTotalizerMilliunits: 100000,
      closingTotalizerMilliunits: 205000,
      grossSalesQuantityMilliunits: 105000,
      testingQuantityMilliunits: 5000,
      netSalesQuantityMilliunits: 100000,
      recordedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const msSection = report.productSections.find((s) => s.productId === "prod-ms");
    const row = msSection!.rows.find((r) => r.businessDate === "2026-10-07");

    expect(row).not.toBeUndefined();
    expect(row?.grossSalesL).toBe(105);
    expect(row?.testingL).toBe(5);
    expect(row?.netSalesL).toBe(100);
    expect(row?.dailySalesL).toBe(100);
  });

  // 6. MISSING NOZZLE READING
  it("7. Missing expected nozzle meter reading produces PARTIAL status and descriptive missingFields", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    await db.insert(schema.operationalShifts).values({
      id: "shift-miss-nozz",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-08",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-08T06:00:00Z",
      endedAt: "2026-10-08T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    await db.insert(schema.operationalShiftProductPrices).values({
      id: "opp-miss-nozz",
      operationalShiftId: "shift-miss-nozz",
      outletId,
      productId: "prod-ms",
      productCode: "MS",
      productName: "Motor Spirit",
      unit: "LITRE",
      pricePaisePerUnit: 10000,
      sourcePriceId: "opp-seed-1",
      createdAt: nowIso,
    } as any);

    await db.insert(schema.operationalShiftNozzles).values({
      id: "osn-miss-nozz",
      operationalShiftId: "shift-miss-nozz",
      outletId,
      nozzleId: "nozz-ro1-1-2",
      dispenserId: "disp-ro1-1",
      dispenserNumber: 1,
      dispenserName: "Dispenser 1",
      nozzleNumber: 2,
      productId: "prod-ms",
      productCode: "MS",
      productName: "Motor Spirit",
      productCategory: "MS",
      productUnit: "LITRE",
      tankId: "tank-ro1-1",
      tankNumber: 1,
      snapshotStatus: "ACTIVE",
      createdAt: nowIso,
    } as any);

    await db.insert(schema.shiftStockReconciliations).values({
      id: "ssr-miss-nozz",
      operationalShiftId: "shift-miss-nozz",
      outletId,
      tankId: "tank-ro1-1",
      productId: "prod-ms",
      openingStockMilliunits: 10000000,
      receiptQuantityMilliunits: 0,
      salesQuantityMilliunits: 0,
      theoreticalClosingStockMilliunits: 10000000,
      physicalClosingStockMilliunits: 10000000,
      varianceMilliunits: 0,
      varianceStatus: "BALANCED",
      calculatedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const msSection = report.productSections.find((s) => s.productId === "prod-ms");
    const row = msSection!.rows.find((r) => r.businessDate === "2026-10-08");

    expect(row?.status).toBe("PARTIAL");
    expect(row?.missingFields).toContain("DU 1 / Nozzle 2 missing meter reading");
  });

  // 7. STOCK / RECEIPTS
  it("8. Stock reconciliation uses earliest opening, latest closing/variance, and sums receipts across shifts", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    await db.insert(schema.operationalShifts).values([
      {
        id: "shift-stk-1",
        outletId,
        shiftTemplateId: "st-ro1-1",
        businessDate: "2026-10-14",
        shiftNumber: 1,
        status: "CLOSED",
        startedAt: "2026-10-14T06:00:00Z",
        endedAt: "2026-10-14T14:00:00Z",
        openedByUserId: "user-admin",
        closedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "shift-stk-2",
        outletId,
        shiftTemplateId: "st-ro1-2",
        businessDate: "2026-10-14",
        shiftNumber: 2,
        status: "CLOSED",
        startedAt: "2026-10-14T14:00:00Z",
        endedAt: "2026-10-14T22:00:00Z",
        openedByUserId: "user-admin",
        closedByUserId: "user-admin",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    await db.insert(schema.operationalShiftProductPrices).values([
      {
        id: "opp-stk-1",
        operationalShiftId: "shift-stk-1",
        outletId,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        unit: "LITRE",
        pricePaisePerUnit: 10000,
        sourcePriceId: "opp-seed-1",
        createdAt: nowIso,
      },
      {
        id: "opp-stk-2",
        operationalShiftId: "shift-stk-2",
        outletId,
        productId: "prod-ms",
        productCode: "MS",
        productName: "Motor Spirit",
        unit: "LITRE",
        pricePaisePerUnit: 10000,
        sourcePriceId: "opp-seed-1",
        createdAt: nowIso,
      },
    ] as any);

    await db.insert(schema.shiftStockReconciliations).values([
      {
        id: "ssr-stk-1",
        operationalShiftId: "shift-stk-1",
        outletId,
        tankId: "tank-ro1-1",
        productId: "prod-ms",
        openingStockMilliunits: 10000000,
        receiptQuantityMilliunits: 500000,
        salesQuantityMilliunits: 0,
        theoreticalClosingStockMilliunits: 10500000,
        physicalClosingStockMilliunits: 10500000,
        varianceMilliunits: 0,
        varianceStatus: "BALANCED",
        calculatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: "ssr-stk-2",
        operationalShiftId: "shift-stk-2",
        outletId,
        tankId: "tank-ro1-1",
        productId: "prod-ms",
        openingStockMilliunits: 10500000,
        receiptQuantityMilliunits: 200000,
        salesQuantityMilliunits: 0,
        theoreticalClosingStockMilliunits: 9180000,
        physicalClosingStockMilliunits: 9200000,
        varianceMilliunits: 20000,
        varianceStatus: "GAIN",
        calculatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ] as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const msSection = report.productSections.find((s) => s.productId === "prod-ms");
    const row = msSection!.rows.find((r) => r.businessDate === "2026-10-14");

    expect(row).not.toBeUndefined();
    expect(row?.tankOpeningStockL).toBe(10000);
    expect(row?.tankClosingStockL).toBe(9200);
    expect(row?.physicalClosingL).toBe(9200);
    expect(row?.theoreticalClosingL).toBe(9180);
    expect(row?.varianceL).toBe(20);
    expect(row?.receiptsL).toBe(700);
  });

  // 8. STATUS TESTS: NO_ENTRY, PARTIAL, COMPLETE
  it("9. Status rules: NO_ENTRY for inactive dates, PARTIAL for missing data, COMPLETE when all valid", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    // Shift 1: COMPLETE day (2026-10-18)
    await db.insert(schema.operationalShifts).values({
      id: "shift-status-comp",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-18",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-18T06:00:00Z",
      endedAt: "2026-10-18T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    await db.insert(schema.operationalShiftProductPrices).values({
      id: "opp-status-comp",
      operationalShiftId: "shift-status-comp",
      outletId,
      productId: "prod-ms",
      productCode: "MS",
      productName: "Motor Spirit",
      unit: "LITRE",
      pricePaisePerUnit: 10000,
      sourcePriceId: "opp-seed-1",
      createdAt: nowIso,
    } as any);

    await db.insert(schema.operationalShiftNozzles).values({
      id: "osn-status-comp",
      operationalShiftId: "shift-status-comp",
      outletId,
      nozzleId: "nozz-ro1-1-1",
      dispenserId: "disp-ro1-1",
      dispenserNumber: 1,
      dispenserName: "Dispenser 1",
      nozzleNumber: 1,
      productId: "prod-ms",
      productCode: "MS",
      productName: "Motor Spirit",
      productCategory: "MS",
      productUnit: "LITRE",
      tankId: "tank-ro1-1",
      tankNumber: 1,
      snapshotStatus: "ACTIVE",
      createdAt: nowIso,
    } as any);

    await db.insert(schema.nozzleMeterReadings).values({
      id: "nmr-status-comp",
      operationalShiftId: "shift-status-comp",
      outletId,
      nozzleId: "nozz-ro1-1-1",
      openingTotalizerMilliunits: 100000,
      closingTotalizerMilliunits: 150000,
      grossSalesQuantityMilliunits: 50000,
      testingQuantityMilliunits: 0,
      netSalesQuantityMilliunits: 50000,
      recordedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    await db.insert(schema.shiftStockReconciliations).values({
      id: "ssr-status-comp",
      operationalShiftId: "shift-status-comp",
      outletId,
      tankId: "tank-ro1-1",
      productId: "prod-ms",
      openingStockMilliunits: 5000000,
      receiptQuantityMilliunits: 0,
      salesQuantityMilliunits: 50000,
      theoreticalClosingStockMilliunits: 4950000,
      physicalClosingStockMilliunits: 4950000,
      varianceMilliunits: 0,
      varianceStatus: "BALANCED",
      calculatedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    // Shift 2: PARTIAL day (2026-10-19) - missing closing tank reading
    await db.insert(schema.operationalShifts).values({
      id: "shift-status-part",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-19",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-19T06:00:00Z",
      endedAt: "2026-10-19T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    await db.insert(schema.operationalShiftProductPrices).values({
      id: "opp-status-part",
      operationalShiftId: "shift-status-part",
      outletId,
      productId: "prod-ms",
      productCode: "MS",
      productName: "Motor Spirit",
      unit: "LITRE",
      pricePaisePerUnit: 10000,
      sourcePriceId: "opp-seed-1",
      createdAt: nowIso,
    } as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const msSection = report.productSections.find((s) => s.productId === "prod-ms");

    expect(msSection).not.toBeUndefined();

    // 1. NO_ENTRY on inactive date 2026-10-01
    const noEntryRow = msSection!.rows.find((r) => r.businessDate === "2026-10-01");
    expect(noEntryRow?.status).toBe("NO_ENTRY");

    // 2. COMPLETE on 2026-10-18
    const compRow = msSection!.rows.find((r) => r.businessDate === "2026-10-18");
    expect(compRow?.status).toBe("COMPLETE");
    expect(compRow?.missingFields).toEqual([]);

    // 3. PARTIAL on 2026-10-19 (missing closing tank reading)
    const partRow = msSection!.rows.find((r) => r.businessDate === "2026-10-19");
    expect(partRow?.status).toBe("PARTIAL");
    expect(partRow?.missingFields).toContain("No closing tank reading");
  });

  // 9. latestDataDate
  it("10. Calculates latestDataDate accurately for MONTH_END, SELECTED_DATE, and LATEST_DATA", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    await db.insert(schema.operationalShifts).values({
      id: "shift-latest-16",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-16",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-16T06:00:00Z",
      endedAt: "2026-10-16T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    // MONTH_END
    const reportMonthEnd = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    expect(reportMonthEnd.cutoffDate).toBe("2026-10-31");
    expect(reportMonthEnd.latestDataDate).toBe("2026-10-16");

    // SELECTED_DATE
    const reportSelected = await MonthlyOperationsReportService.generateReport(
      db,
      outletId,
      month,
      "SELECTED_DATE",
      "2026-10-20"
    );
    expect(reportSelected.cutoffDate).toBe("2026-10-20");
    expect(reportSelected.latestDataDate).toBe("2026-10-16");

    // LATEST_DATA
    const reportLatest = await MonthlyOperationsReportService.generateReport(db, outletId, month, "LATEST_DATA");
    expect(reportLatest.cutoffDate).toBe("2026-10-16");
    expect(reportLatest.latestDataDate).toBe("2026-10-16");
  });

  // 10. DG STATUS
  it("11. DG row status rules: DRAFT -> PARTIAL, FINAL -> COMPLETE, missing -> NO_ENTRY", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";
    const month = "2026-10";

    const equipment = await db.query.equipmentAssets.findFirst({
      where: (table, { eq, and }) => and(eq(table.outletId, outletId), eq(table.equipmentType, "DG_SET")),
    });

    // Day 1: DRAFT log => PARTIAL
    await db.insert(schema.dgDailyLogs).values({
      id: "dg-log-draft",
      outletId,
      equipmentAssetId: equipment!.id,
      businessDate: "2026-10-01",
      hsdConsumedMilliunits: 5000,
      hsdRatePaisePerLitre: 9500,
      amountPaise: 47500,
      status: "DRAFT",
      recordedByUserId: "user-admin",
      updatedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    // Day 2: FINAL log => COMPLETE
    await db.insert(schema.dgDailyLogs).values({
      id: "dg-log-final",
      outletId,
      equipmentAssetId: equipment!.id,
      businessDate: "2026-10-02",
      hsdConsumedMilliunits: 6000,
      hsdRatePaisePerLitre: 9500,
      amountPaise: 57000,
      status: "FINAL",
      recordedByUserId: "user-admin",
      updatedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    const report = await MonthlyOperationsReportService.generateReport(db, outletId, month, "MONTH_END");
    const dgRows = report.dgSection.rows;

    const row1 = dgRows.find((r) => r.businessDate === "2026-10-01");
    expect(row1?.status).toBe("PARTIAL");

    const row2 = dgRows.find((r) => r.businessDate === "2026-10-02");
    expect(row2?.status).toBe("COMPLETE");

    const row3 = dgRows.find((r) => r.businessDate === "2026-10-03");
    expect(row3?.status).toBe("NO_ENTRY");
  });

  // 11. KEEP SECURITY TEST
  it("12. Dealer scoped to ro-1001 requesting ro-1002 remains 403", async () => {
    const res = await app.request(
      `/api/v1/outlets/ro-1002/reports/monthly-operations?month=2026-10&cutoffMode=MONTH_END`,
      {
        headers: {
          Authorization: `Bearer ${dealerToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );
    expect(res.status).toBe(403);
  });
});
