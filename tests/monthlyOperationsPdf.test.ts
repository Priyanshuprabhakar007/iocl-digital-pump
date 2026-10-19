import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { createLocalD1Database } from "../src/db/localD1";
import { getDb } from "../src/db";
import { seedDatabase } from "../src/db/seed";
import app from "../src/worker/app";
import * as schema from "../src/db/schema";

describe("Monthly Operations Register PDF Endpoint & Generation", () => {
  let localD1: any;
  let testDbPath: string;
  let adminToken: string;
  let dealerToken: string;
  let cspToken: string;
  const nowIso = "2026-10-01T00:00:00.000Z";

  beforeEach(async () => {
    testDbPath = `./.sqlite/test_pdf_${Date.now()}_${Math.random()}.db`;
    localD1 = createLocalD1Database(testDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    // Admin login (has all permissions including REPORTS_GENERATE)
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

    // Dealer login (scoped to ro-1001, has REPORTS_GENERATE)
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

    // CSP login (does NOT have REPORTS_GENERATE)
    const cspRes = await app.request(
      "/api/v1/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "csp.parkstreet@iocl.in", password: "Password@123" }),
      },
      { DB: localD1 }
    );
    const cspJson: any = await cspRes.json();
    cspToken = cspJson.data?.token || "";
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch (e) {}
  });

  // Source Regression Guard
  it("Regression Guard: monthlyOperationsPdfService.ts does NOT contain unintended escaped interpolations \\${", () => {
    const serviceContent = fs.readFileSync("src/worker/services/monthlyOperationsPdfService.ts", "utf8");
    expect(serviceContent.includes("\\${")).toBe(false);
  });

  // Role Permissions Test
  it("Seeded DB role-permission mappings match specification", async () => {
    const db = getDb(localD1);
    const roles = await db.select().from(schema.roles);
    const permissions = await db.select().from(schema.permissions);
    const rolePerms = await db.select().from(schema.rolePermissions);

    const permMap = new Map(permissions.map((p) => [p.id, p.code]));
    const rolePermCodesMap = new Map<string, Set<string>>();

    for (const r of roles) {
      rolePermCodesMap.set(r.code, new Set());
    }

    for (const rp of rolePerms) {
      const permCode = permMap.get(rp.permissionId);
      const role = roles.find((r) => r.id === rp.roleId);
      if (role && permCode) {
        rolePermCodesMap.get(role.code)?.add(permCode);
      }
    }

    const supervisoryRoles = ["STATE_OFFICE", "DIVISIONAL_OFFICE", "BUSINESS_MANAGER", "FIELD_OFFICER"];
    for (const roleCode of supervisoryRoles) {
      const perms = rolePermCodesMap.get(roleCode);
      expect(perms?.has("dg_log.read")).toBe(true);
      expect(perms?.has("reports.read")).toBe(true);
      expect(perms?.has("reports.generate")).toBe(true);
    }

    const dealerPerms = rolePermCodesMap.get("DEALER");
    expect(dealerPerms?.has("dg_log.read")).toBe(true);
    expect(dealerPerms?.has("dg_log.write")).toBe(true);
    expect(dealerPerms?.has("reports.read")).toBe(true);
    expect(dealerPerms?.has("reports.generate")).toBe(true);

    const cspPerms = rolePermCodesMap.get("CSP");
    expect(cspPerms?.has("dg_log.read")).toBe(true);
    expect(cspPerms?.has("dg_log.write")).toBe(true);
    expect(cspPerms?.has("reports.read")).toBe(true);
    expect(cspPerms?.has("reports.generate")).toBe(false);
  });

  // Dealer PDF Success Test
  it("Dealer assigned to ro-1001 can request PDF successfully", async () => {
    const res = await app.request(
      "/api/v1/outlets/ro-1001/reports/monthly-operations/pdf?month=2026-10&cutoffMode=MONTH_END",
      {
        headers: {
          Authorization: `Bearer ${dealerToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  // 1-4. Authorized admin receives HTTP 200, Content-Type application/pdf, %PDF magic bytes, non-empty
  it("1-4. Authorized admin receives HTTP 200 with non-empty application/pdf starting with %PDF", async () => {
    const res = await app.request(
      "/api/v1/outlets/ro-1001/reports/monthly-operations/pdf?month=2026-10&cutoffMode=MONTH_END",
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment; filename=");
    expect(res.headers.get("Content-Disposition")).toContain("monthly-operations-ro-1001-2026-10.pdf");

    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    expect(bytes.length).toBeGreaterThan(100);

    const header = new TextDecoder().decode(bytes.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  // 5. Foreign scoped dealer receives 403
  it("5. Foreign scoped dealer receives 403 when accessing another outlet", async () => {
    const res = await app.request(
      "/api/v1/outlets/ro-1002/reports/monthly-operations/pdf?month=2026-10&cutoffMode=MONTH_END",
      {
        headers: {
          Authorization: `Bearer ${dealerToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );

    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.error?.code).toBe("FORBIDDEN");
  });

  // 6. User without REPORTS_GENERATE receives 403
  it("6. User without REPORTS_GENERATE receives 403", async () => {
    const res = await app.request(
      "/api/v1/outlets/ro-1001/reports/monthly-operations/pdf?month=2026-10&cutoffMode=MONTH_END",
      {
        headers: {
          Authorization: `Bearer ${cspToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );

    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.error?.code).toBe("FORBIDDEN");
    expect(json.error?.message).toContain("reports.generate");
  });

  // 7. Invalid SELECTED_DATE query returns validation error
  it("7. Invalid SELECTED_DATE query without cutoffDate returns validation error (400)", async () => {
    const res = await app.request(
      "/api/v1/outlets/ro-1001/reports/monthly-operations/pdf?month=2026-10&cutoffMode=SELECTED_DATE",
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error?.code).toBe("VALIDATION_ERROR");
  });

  // 8. MONTH_END PDF succeeds
  it("8. MONTH_END PDF succeeds", async () => {
    const res = await app.request(
      "/api/v1/outlets/ro-1001/reports/monthly-operations/pdf?month=2026-10&cutoffMode=MONTH_END",
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );

    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  // 9. LATEST_DATA PDF succeeds
  it("9. LATEST_DATA PDF succeeds", async () => {
    const res = await app.request(
      "/api/v1/outlets/ro-1001/reports/monthly-operations/pdf?month=2026-10&cutoffMode=LATEST_DATA",
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );

    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  // 10. DG-only report still produces PDF
  it("10. DG-only report still produces valid PDF", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";

    const equipment = await db.query.equipmentAssets.findFirst({
      where: (table, { eq, and }) => and(eq(table.outletId, outletId), eq(table.equipmentType, "DG_SET")),
    });

    await db.insert(schema.dgDailyLogs).values({
      id: "dg-only-log",
      outletId,
      equipmentAssetId: equipment!.id,
      businessDate: "2026-10-05",
      meterReadingFromMilliunits: 100000,
      meterReadingToMilliunits: 120000,
      hsdConsumedMilliunits: 15000,
      hsdRatePaisePerLitre: 9500,
      amountPaise: 142500,
      status: "FINAL",
      recordedByUserId: "user-admin",
      updatedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    const res = await app.request(
      "/api/v1/outlets/ro-1001/reports/monthly-operations/pdf?month=2026-10&cutoffMode=MONTH_END",
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );

    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  // 11. Fuel-only report still produces PDF
  it("11. Fuel-only report still produces valid PDF", async () => {
    const db = getDb(localD1);
    const outletId = "ro-1001";

    await db.insert(schema.operationalShifts).values({
      id: "shift-fuel-pdf",
      outletId,
      shiftTemplateId: "st-ro1-1",
      businessDate: "2026-10-06",
      shiftNumber: 1,
      status: "CLOSED",
      startedAt: "2026-10-06T06:00:00Z",
      endedAt: "2026-10-06T14:00:00Z",
      openedByUserId: "user-admin",
      closedByUserId: "user-admin",
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    await db.insert(schema.operationalShiftProductPrices).values({
      id: "opp-fuel-pdf",
      operationalShiftId: "shift-fuel-pdf",
      outletId,
      productId: "prod-ms",
      productCode: "MS",
      productName: "Motor Spirit",
      unit: "LITRE",
      pricePaisePerUnit: 10000,
      sourcePriceId: "opp-seed-1",
      createdAt: nowIso,
    } as any);

    const res = await app.request(
      "/api/v1/outlets/ro-1001/reports/monthly-operations/pdf?month=2026-10&cutoffMode=MONTH_END",
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Origin: "http://localhost:3000",
        },
      },
      { DB: localD1 }
    );

    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });
});
