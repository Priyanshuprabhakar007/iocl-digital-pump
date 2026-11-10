import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import * as schema from '../src/db/schema';
import { seedDatabase } from '../src/db/seed';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

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

describe('IOCL End-to-End Tank Calibration Management & Governance Suite', () => {
  let localD1: any;
  let env: any;
  let adminToken: string;
  let operatorToken: string;
  let currentTestDbPath: string;
  let vaultDocumentId: string;

  beforeEach(async () => {
    currentTestDbPath = `./.sqlite/test_e2e_calibration_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}.db`;
    const dir = path.dirname(currentTestDbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    localD1 = createLocalD1Database(currentTestDbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    const nowIso = '2026-10-15T10:00:00.000Z';

    // Seed COCO 22 (RO Code 396187) with Tank #1 (Rev #1 ACTIVE verified + Rev #2 DRAFT) and Tank #2 (unverified 20 KL)
    await db
      .insert(schema.retailOutlets)
      .values({
        id: 'outlet-1',
        roCode: '396187',
        name: 'COCO 22',
        outletType: 'COCO',
        stateId: 'state-wb',
        divisionId: 'div-kol',
        salesAreaId: 'sa-cen',
        address: 'COCO 22 Highway Plot',
        city: 'Kolkata',
        district: 'Kolkata',
        pincode: '700022',
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.tanks)
      .values([
        {
          id: 'tank-1',
          outletId: 'outlet-1',
          tankNumber: 1,
          name: 'Tank 1 - MS (20 KL)',
          productId: 'prod-ms',
          capacityLitres: 20000,
          safeFillCapacityLitres: 19000,
          minimumOperatingLevelLitres: 1000,
          status: 'ACTIVE',
          commissionedAt: nowIso,
          createdAt: nowIso,
          createdBy: 'user-admin',
          updatedAt: nowIso,
        },
        {
          id: 'tank-2',
          outletId: 'outlet-1',
          tankNumber: 2,
          name: 'Tank 2 - HSD (20 KL)',
          productId: 'prod-hsd',
          capacityLitres: 20000,
          safeFillCapacityLitres: 19000,
          minimumOperatingLevelLitres: 1000,
          status: 'ACTIVE',
          commissionedAt: nowIso,
          createdAt: nowIso,
          createdBy: 'user-admin',
          updatedAt: nowIso,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.tankCalibrationCharts)
      .values([
        {
          id: 'tcc-coco22-t1-r1',
          tankId: 'tank-1',
          revisionNumber: 1,
          status: 'ACTIVE',
          chartUnitDip: 'MM',
          chartUnitVolume: 'LITRES',
          tankDiameterMmMilliunits: 2100000,
          tankLengthMmMilliunits: 6250000,
          maxDipMmMilliunits: 2100000,
          chartCapacityMilliunits: 20000000,
          sourceFileName: 'COCO22_T1_CERT_REV1.pdf',
          referenceDocument: 'WM/IOCL/COCO22/T1-CERT-001',
          effectiveFrom: '2026-01-01',
          notes: 'COCO 22 Tank #1 Initial Active Calibration',
          createdBy: 'user-admin',
          createdAt: nowIso,
          updatedAt: nowIso,
          approvedBy: 'user-admin',
          approvedAt: nowIso,
        },
        {
          id: 'tcc-coco22-t1-r2-draft',
          tankId: 'tank-1',
          revisionNumber: 2,
          status: 'DRAFT',
          chartUnitDip: 'MM',
          chartUnitVolume: 'LITRES',
          tankDiameterMmMilliunits: 2100000,
          tankLengthMmMilliunits: 6250000,
          maxDipMmMilliunits: 2100000,
          chartCapacityMilliunits: 21628930,
          sourceFileName: 'COCO22_T1_REV2_DRAFT.pdf',
          referenceDocument: 'WM/IOCL/COCO22/T1-DRAFT-002',
          effectiveFrom: '2026-11-01',
          notes: 'COCO 22 Tank #1 Revision #2 DRAFT (preserved)',
          createdBy: 'user-admin',
          createdAt: nowIso,
          updatedAt: nowIso,
          approvedBy: null,
          approvedAt: null,
        },
        {
          id: 'tcc-coco22-t2-r1-unverified',
          tankId: 'tank-2',
          revisionNumber: 1,
          status: 'ACTIVE',
          chartUnitDip: 'MM',
          chartUnitVolume: 'LITRES',
          tankDiameterMmMilliunits: null,
          tankLengthMmMilliunits: null,
          maxDipMmMilliunits: null,
          chartCapacityMilliunits: 20000000,
          sourceFileName: null,
          referenceDocument: null,
          effectiveFrom: '2026-01-01',
          notes: 'Tank #2 unverified initial chart',
          createdBy: 'user-admin',
          createdAt: nowIso,
          updatedAt: nowIso,
          approvedBy: 'user-admin',
          approvedAt: nowIso,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.tankCalibrationPoints)
      .values([
        {
          id: 'tcp-c22-t1-r1-0',
          tankId: 'tank-1',
          chartId: 'tcc-coco22-t1-r1',
          dipMillimetresMilliunits: 0,
          volumeMilliunits: 0,
          createdBy: 'user-admin',
          createdAt: nowIso,
        },
        {
          id: 'tcp-c22-t1-r1-1050',
          tankId: 'tank-1',
          chartId: 'tcc-coco22-t1-r1',
          dipMillimetresMilliunits: 1050000,
          volumeMilliunits: 10000000,
          createdBy: 'user-admin',
          createdAt: nowIso,
        },
        {
          id: 'tcp-c22-t1-r1-2100',
          tankId: 'tank-1',
          chartId: 'tcc-coco22-t1-r1',
          dipMillimetresMilliunits: 2100000,
          volumeMilliunits: 20000000,
          createdBy: 'user-admin',
          createdAt: nowIso,
        },
        {
          id: 'tcp-c22-t1-r2-0',
          tankId: 'tank-1',
          chartId: 'tcc-coco22-t1-r2-draft',
          dipMillimetresMilliunits: 0,
          volumeMilliunits: 0,
          createdBy: 'user-admin',
          createdAt: nowIso,
        },
        {
          id: 'tcp-c22-t1-r2-2100',
          tankId: 'tank-1',
          chartId: 'tcc-coco22-t1-r2-draft',
          dipMillimetresMilliunits: 2100000,
          volumeMilliunits: 21628930,
          createdBy: 'user-admin',
          createdAt: nowIso,
        },
        {
          id: 'tcp-c22-t2-r1-0',
          tankId: 'tank-2',
          chartId: 'tcc-coco22-t2-r1-unverified',
          dipMillimetresMilliunits: 0,
          volumeMilliunits: 0,
          createdBy: 'user-admin',
          createdAt: nowIso,
        },
        {
          id: 'tcp-c22-t2-r1-2100',
          tankId: 'tank-2',
          chartId: 'tcc-coco22-t2-r1-unverified',
          dipMillimetresMilliunits: 2100000,
          volumeMilliunits: 20000000,
          createdBy: 'user-admin',
          createdAt: nowIso,
        },
      ])
      .onConflictDoNothing();

    // Insert a real supporting calibration certificate in Document Vault (schema.documents)
    vaultDocumentId = 'doc-vault-calib-cert-2026';
    await db.insert(schema.documents).values({
      id: vaultDocumentId,
      r2Key: 'documents/wm-iocl-coco22-cert-2026.pdf',
      name: 'Weights & Measures Certified Tank Calibration Chart 2026.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 245760,
      outletId: 'outlet-1',
      uploadedByUserId: 'user-admin',
      createdAt: nowIso,
    });

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: '*',
    };

    const adminRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      },
      env
    );
    const adminJson = (await adminRes.json()) as any;
    expect(adminJson.success).toBe(true);
    adminToken = adminJson.data.token;

    const opRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fo.central@iocl.in', password: 'Password@123' }),
      },
      env
    );
    const opJson = (await opRes.json()) as any;
    expect(opJson.success).toBe(true);
    operatorToken = opJson.data.token;
  });

  afterEach(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${currentTestDbPath}${suffix}`;
      if (p && fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore
        }
      }
    }
  });

  it('1. Verifies exact point count, maximum volume, and non-duplication for 10 KL, 15 KL, and 20 KL reference charts & Final Dashboard Status Indicators', async () => {
    const dashRes = await app.request(
      '/api/v1/calibration-templates/management-dashboard?outletId=outlet-1',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      env
    );
    expect(dashRes.status).toBe(200);
    const dashJson = (await dashRes.json()) as any;
    expect(dashJson.success).toBe(true);

    const data = dashJson.data;
    // Three separate status indicators
    expect(data.statusSummary.referenceDataImported.status).toBe('REFERENCE DATA IMPORTED');
    expect(data.statusSummary.referenceDataImported.complete).toBe(true);
    expect(data.statusSummary.engineeringVerified.status).toBe('ENGINEERING VERIFIED');
    expect(data.statusSummary.engineeringVerified.complete).toBe(false);
    expect(data.statusSummary.operationallyActive.status).toBe('OPERATIONALLY ACTIVE');
    // Never mark Operationally Complete while engineering verification and tank activations are pending
    expect(data.statusSummary.isOperationallyComplete).toBe(false);
    expect(data.statusSummary.blockingReasons.length).toBeGreaterThan(0);

    const templates = data.templates as any[];
    const tpl10 = templates.find(t => t.code === 'EXCEL_10KL_REFERENCE');
    const tpl15 = templates.find(t => t.code === 'EXCEL_15KL_REFERENCE');
    const tpl20 = templates.find(t => t.code === 'EXCEL_20KL_REFERENCE');

    expect(tpl10).toBeDefined();
    expect(tpl10.pointsCount).toBe(195);
    expect(tpl10.maxVolumeLitres).toBe(11073.41);
    expect(tpl10.nominalCapacityLitres).toBe(10000);
    expect(tpl10.tankDiameterMm).toBe(1940);
    expect(tpl10.tankLengthMm).toBe(3750);
    expect(tpl10.maxDipMm).toBe(1940);

    expect(tpl15).toBeDefined();
    expect(tpl15.pointsCount).toBe(195);
    expect(tpl15.maxVolumeLitres).toBe(16246.13);
    expect(tpl15.nominalCapacityLitres).toBe(15000);
    expect(tpl15.tankDiameterMm).toBe(1940);
    expect(tpl15.tankLengthMm).toBe(5500);
    expect(tpl15.maxDipMm).toBe(1940);

    expect(tpl20).toBeDefined();
    expect(tpl20.pointsCount).toBe(211);
    expect(tpl20.maxVolumeLitres).toBe(21628.93);
    expect(tpl20.nominalCapacityLitres).toBe(20000);
    expect(tpl20.tankDiameterMm).toBe(2100);
    expect(tpl20.tankLengthMm).toBe(6250);
    expect(tpl20.maxDipMm).toBe(2100);

    // Calling dashboard again must never duplicate templates or alter recorded points
    const dashRes2 = await app.request(
      '/api/v1/calibration-templates/management-dashboard?outletId=outlet-1',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      env
    );
    const dashJson2 = (await dashRes2.json()) as any;
    const templates2 = dashJson2.data.templates as any[];
    expect(templates2.filter(t => t.code === 'EXCEL_10KL_REFERENCE')).toHaveLength(1);
    expect(templates2.filter(t => t.code === 'EXCEL_15KL_REFERENCE')).toHaveLength(1);
    expect(templates2.filter(t => t.code === 'EXCEL_20KL_REFERENCE')).toHaveLength(1);
  });

  it('2, 3 & 4. Verifies boundary tests at 0 mm and maxDipMm, exact dip lookup, linear interpolation between points, and out-of-range dip rejection', async () => {
    // Ensure reference templates exist
    await app.request(
      '/api/v1/calibration-templates/management-dashboard',
      { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } },
      env
    );

    // Boundary 0 mm on 20 KL
    const zeroRes = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/interpolate',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipMillimetres: 0 }),
      },
      env
    );
    expect(zeroRes.status).toBe(200);
    const zeroJson = (await zeroRes.json()) as any;
    expect(zeroJson.data.interpolatedVolumeLitres).toBe(0);

    // Boundary maxDipMm (2100 mm) on 20 KL -> 21,628.93 L
    const maxRes = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/interpolate',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipMillimetres: 2100 }),
      },
      env
    );
    expect(maxRes.status).toBe(200);
    const maxJson = (await maxRes.json()) as any;
    expect(maxJson.data.interpolatedVolumeLitres).toBe(21628.93);

    // Boundary maxDipMm (1940 mm) on 10 KL -> 11,073.41 L
    const max10Res = await app.request(
      '/api/v1/calibration-templates/gtct-excel-10kl-ref/interpolate',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipMillimetres: 1940 }),
      },
      env
    );
    expect(max10Res.status).toBe(200);
    const max10Json = (await max10Res.json()) as any;
    expect(max10Json.data.interpolatedVolumeLitres).toBe(11073.41);

    // Linear interpolation between 10 mm and 20 mm on 20 KL (at 15 mm)
    const pt10Res = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/interpolate',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipMillimetres: 10 }),
      },
      env
    );
    const pt20Res = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/interpolate',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipMillimetres: 20 }),
      },
      env
    );
    const v10 = ((await pt10Res.json()) as any).data.interpolatedVolumeLitres;
    const v20 = ((await pt20Res.json()) as any).data.interpolatedVolumeLitres;

    const midRes = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/interpolate',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipMillimetres: 15 }),
      },
      env
    );
    expect(midRes.status).toBe(200);
    const midJson = (await midRes.json()) as any;
    const expectedMid = Math.round(((v10 + v20) / 2) * 1000) / 1000;
    expect(midJson.data.interpolatedVolumeLitres).toBeCloseTo(expectedMid, 3);

    // Out-of-range dip rejection (> maxDipMm, never extrapolate beyond chart limits)
    const overRes = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/interpolate',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipMillimetres: 2105 }),
      },
      env
    );
    expect(overRes.status).toBe(400);
    const overJson = (await overRes.json()) as any;
    expect(overJson.error.code).toBe('DIP_OUT_OF_RANGE');

    // Negative dip rejection
    const negRes = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/interpolate',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipMillimetres: -5 }),
      },
      env
    );
    expect(negRes.status).toBe(400);
    const negJson = (await negRes.json()) as any;
    expect(negJson.error.code).toBe('DIP_OUT_OF_RANGE');
  });

  it('5 & 12. Verifies ADMIN Calibration Test Console water-dip subtraction, read-only simulation, and role-based ADMIN access control', async () => {
    await app.request(
      '/api/v1/calibration-templates/management-dashboard',
      { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } },
      env
    );

    // Non-ADMIN operator must be blocked (403 FORBIDDEN)
    const forbiddenRes = await app.request(
      '/api/v1/calibration-templates/test-console',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${operatorToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletId: 'outlet-1',
          tankId: 'tank-1',
          dipMillimetres: 1050,
          waterDipMillimetres: 20,
          proposedTemplateId: 'gtct-excel-20kl-ref',
        }),
      },
      env
    );
    expect(forbiddenRes.status).toBe(403);

    // ADMIN simulation with product dip 1050 mm and water dip 20 mm
    const simRes = await app.request(
      '/api/v1/calibration-templates/test-console',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletId: 'outlet-1',
          tankId: 'tank-1',
          dipMillimetres: 1050,
          waterDipMillimetres: 20,
          proposedTemplateId: 'gtct-excel-20kl-ref',
        }),
      },
      env
    );
    expect(simRes.status).toBe(200);
    const simJson = (await simRes.json()) as any;
    expect(simJson.success).toBe(true);
    const sim = simJson.data;
    expect(sim.simulationMode).toBe('READ_ONLY_SIMULATION');
    expect(sim.activeRevision).toBeDefined();
    expect(sim.proposedRevision).toBeDefined();
    expect(sim.proposedRevision.grossVolumeLitres).toBeGreaterThan(0);
    expect(sim.proposedRevision.waterVolumeLitres).toBeGreaterThan(0);
    expect(sim.proposedRevision.netProductVolumeLitres).toBeCloseTo(
      sim.proposedRevision.grossVolumeLitres - sim.proposedRevision.waterVolumeLitres,
      3
    );
    expect(sim.proposedRevision.boundaryZeroMmVolumeLitres).toBe(0);
    expect(sim.proposedRevision.boundaryMaxDipVolumeLitres).toBe(21628.93);
  });

  it('6, 7 & 8. Enforces Engineering Verification with Document Vault evidence, 10 KL scoped policy exception, and 15 KL length conflict resolution before approval', async () => {
    await app.request(
      '/api/v1/calibration-templates/management-dashboard',
      { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } },
      env
    );

    // 6a. Attempt to approve EXCEL_20KL_REFERENCE without Engineering Verification -> rejected
    const unverifiedApprove20 = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/status',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          allowOverCapacity: true,
          confirmOverCapacity: true,
        }),
      },
      env
    );
    expect(unverifiedApprove20.status).toBe(400);
    const unverifiedApprove20Json = (await unverifiedApprove20.json()) as any;
    expect(unverifiedApprove20Json.error.code).toBe('ENGINEERING_VERIFICATION_REQUIRED');

    // 6b. Attempt to record Engineering Verification using an Excel filename as certificate or missing Document Vault ID -> rejected
    const fakeCertRes = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/engineering-verify',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankIdentifier: 'COCO22-T1',
          tankSerialNumber: 'SN-20KL-001',
          verifiedCapacityLitres: 20000,
          verifiedDiameterMm: 2100,
          verifiedLengthMm: 6250,
          verifiedMaxDipMm: 2100,
          issuingAuthority: 'IOCL Engineering',
          certificateNumber: '20KL_15KL_10KL_calibration_Dip_chart.xlsx',
          verificationDate: '2026-11-01',
          engineeringApprover: 'Er. R. Sharma',
          decision: 'VERIFIED',
          supportingDocumentId: vaultDocumentId,
        }),
      },
      env
    );
    expect(fakeCertRes.status).toBe(400);
    expect(((await fakeCertRes.json()) as any).error.code).toBe('INVALID_CERTIFICATE_REFERENCE');

    // 7. 10 KL (`EXCEL_10KL_REFERENCE`): Verify that engineering verification without scoped policy exception leaves approval blocked
    const verify10WithoutException = await app.request(
      '/api/v1/calibration-templates/gtct-excel-10kl-ref/engineering-verify',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankIdentifier: 'REF-10KL',
          tankSerialNumber: 'SN-10KL-001',
          verifiedCapacityLitres: 10000,
          verifiedDiameterMm: 1940,
          verifiedLengthMm: 3750,
          verifiedMaxDipMm: 1940,
          issuingAuthority: 'Legal Metrology',
          certificateNumber: 'LM/CERT/10KL/2026-01',
          verificationDate: '2026-11-01',
          engineeringApprover: 'Er. R. Sharma',
          decision: 'VERIFIED',
          supportingDocumentId: vaultDocumentId,
          allowScopedPolicyException: false,
        }),
      },
      env
    );
    expect(verify10WithoutException.status).toBe(200);

    const blocked10Approve = await app.request(
      '/api/v1/calibration-templates/gtct-excel-10kl-ref/status',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          allowOverCapacity: true,
          confirmOverCapacity: true,
        }),
      },
      env
    );
    expect(blocked10Approve.status).toBe(400);
    expect(((await blocked10Approve.json()) as any).error.code).toBe(
      'OVER_CAPACITY_CEILING_EXCEEDED'
    );

    // Record narrowly scoped policy exception for 10 KL backed by Document Vault certificate and governing policy
    const verify10WithException = await app.request(
      '/api/v1/calibration-templates/gtct-excel-10kl-ref/engineering-verify',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankIdentifier: 'REF-10KL',
          tankSerialNumber: 'SN-10KL-001',
          verifiedCapacityLitres: 10000,
          verifiedDiameterMm: 1940,
          verifiedLengthMm: 3750,
          verifiedMaxDipMm: 1940,
          issuingAuthority: 'Legal Metrology',
          certificateNumber: 'LM/CERT/10KL/2026-01',
          verificationDate: '2026-11-01',
          engineeringApprover: 'Er. R. Sharma',
          decision: 'VERIFIED',
          supportingDocumentId: vaultDocumentId,
          allowScopedPolicyException: true,
          governingPolicyReference: 'IOCL-ENG-POL-UGT-DISH-END-2026',
          discrepancyResolutionNote:
            'Hydro-strapping verified 11,073.41 L total dished-end volume (+73.41 L above +10% ceiling)',
        }),
      },
      env
    );
    expect(verify10WithException.status).toBe(200);

    const allowed10Approve = await app.request(
      '/api/v1/calibration-templates/gtct-excel-10kl-ref/status',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          allowOverCapacity: true,
          confirmOverCapacity: true,
        }),
      },
      env
    );
    expect(allowed10Approve.status).toBe(200);
    expect(((await allowed10Approve.json()) as any).data.status).toBe('APPROVED');

    // 8. 15 KL (`EXCEL_15KL_REFERENCE`): Verify that approval is blocked until the 5,500 mm vs 3,750 mm length conflict is resolved
    const verify15Unresolved = await app.request(
      '/api/v1/calibration-templates/gtct-excel-15kl-ref/engineering-verify',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankIdentifier: 'REF-15KL',
          tankSerialNumber: 'SN-15KL-001',
          verifiedCapacityLitres: 15000,
          verifiedDiameterMm: 1940,
          verifiedLengthMm: 5500,
          verifiedMaxDipMm: 1940,
          issuingAuthority: 'Legal Metrology',
          certificateNumber: 'LM/CERT/15KL/2026-01',
          verificationDate: '2026-11-01',
          engineeringApprover: 'Er. R. Sharma',
          decision: 'VERIFIED',
          supportingDocumentId: vaultDocumentId,
          resolveLengthConflict: false,
        }),
      },
      env
    );
    expect(verify15Unresolved.status).toBe(400);
    expect(((await verify15Unresolved.json()) as any).error.code).toBe(
      'DIMENSION_CONFLICT_UNRESOLVED'
    );

    const verify15Resolved = await app.request(
      '/api/v1/calibration-templates/gtct-excel-15kl-ref/engineering-verify',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankIdentifier: 'REF-15KL',
          tankSerialNumber: 'SN-15KL-001',
          verifiedCapacityLitres: 15000,
          verifiedDiameterMm: 1940,
          verifiedLengthMm: 5500,
          verifiedMaxDipMm: 1940,
          issuingAuthority: 'Legal Metrology',
          certificateNumber: 'LM/CERT/15KL/2026-01',
          verificationDate: '2026-11-01',
          engineeringApprover: 'Er. R. Sharma',
          decision: 'VERIFIED',
          supportingDocumentId: vaultDocumentId,
          resolveLengthConflict: true,
          confirmedLengthMm: 5500,
          lengthResolutionNotes:
            'Confirmed physical 15 KL shell length is 5,500 mm; 3,750 mm header in Excel was copy-pasted from 10 KL sheet.',
        }),
      },
      env
    );
    expect(verify15Resolved.status).toBe(200);

    const approve15Res = await app.request(
      '/api/v1/calibration-templates/gtct-excel-15kl-ref/status',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          allowOverCapacity: true,
          confirmOverCapacity: true,
        }),
      },
      env
    );
    expect(approve15Res.status).toBe(200);
  });

  it('9. Compares EXCEL_20KL_REFERENCE against STANDARD_20KL across all 211 dip points', async () => {
    const cmpRes = await app.request(
      '/api/v1/calibration-templates/compare-20kl',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      env
    );
    expect(cmpRes.status).toBe(200);
    const cmpJson = (await cmpRes.json()) as any;
    expect(cmpJson.success).toBe(true);
    const report = cmpJson.data;
    expect(report.primaryTemplateCode).toBe('EXCEL_20KL_REFERENCE');
    expect(report.benchmarkTemplateCode).toBe('STANDARD_20KL');
    expect(report.totalDipPointsCompared).toBe(211);
    expect(report.primaryMaxVolumeLitres).toBe(21628.93);
    expect(report.differingPointsCount).toBeGreaterThan(0);
    expect(report.rows).toHaveLength(211);
  });

  it('10 & 11. Prevents incompatible tank assignment (10 KL/15 KL to 20 KL tank), preserves COCO 22 Tank #1 ACTIVE Rev #1 and Rev #2 DRAFT, and supports controlled activation on Tank #2 after tank-specific verification', async () => {
    await app.request(
      '/api/v1/calibration-templates/management-dashboard',
      { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } },
      env
    );

    // Approve EXCEL_15KL_REFERENCE and EXCEL_20KL_REFERENCE after engineering verification
    await app.request(
      '/api/v1/calibration-templates/gtct-excel-15kl-ref/engineering-verify',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankIdentifier: 'REF-15KL',
          tankSerialNumber: 'SN-15KL-001',
          verifiedCapacityLitres: 15000,
          verifiedDiameterMm: 1940,
          verifiedLengthMm: 5500,
          verifiedMaxDipMm: 1940,
          issuingAuthority: 'Legal Metrology',
          certificateNumber: 'LM/CERT/15KL/2026-01',
          verificationDate: '2026-11-01',
          engineeringApprover: 'Er. R. Sharma',
          decision: 'VERIFIED',
          supportingDocumentId: vaultDocumentId,
          resolveLengthConflict: true,
          confirmedLengthMm: 5500,
          lengthResolutionNotes: 'Confirmed 5,500 mm shell length',
        }),
      },
      env
    );
    await app.request(
      '/api/v1/calibration-templates/gtct-excel-15kl-ref/status',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED', allowOverCapacity: true, confirmOverCapacity: true }),
      },
      env
    );

    // 10a. Attempt to assign 15 KL chart to COCO 22 Tank #1 (20,000 L) -> must fail with CAPACITY_MISMATCH
    const mismatchRes = await app.request(
      '/api/v1/calibration-templates/gtct-excel-15kl-ref/assign',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tankIds: ['tank-1'] }),
      },
      env
    );
    expect(mismatchRes.status).toBe(400);
    const mismatchJson = (await mismatchRes.json()) as any;
    expect(['INCOMPATIBLE_TANK', 'CAPACITY_MISMATCH']).toContain(mismatchJson.error.code);
    expect(mismatchJson.error.message).toMatch(/15,?000|20,?000|capacity/i);

    // Verify & approve EXCEL_20KL_REFERENCE
    await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/engineering-verify',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankIdentifier: 'REF-20KL',
          tankSerialNumber: 'SN-20KL-001',
          verifiedCapacityLitres: 20000,
          verifiedDiameterMm: 2100,
          verifiedLengthMm: 6250,
          verifiedMaxDipMm: 2100,
          issuingAuthority: 'Legal Metrology',
          certificateNumber: 'LM/CERT/20KL/2026-01',
          verificationDate: '2026-11-01',
          engineeringApprover: 'Er. R. Sharma',
          decision: 'VERIFIED',
          supportingDocumentId: vaultDocumentId,
        }),
      },
      env
    );
    const approve20 = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/status',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED', allowOverCapacity: true, confirmOverCapacity: true }),
      },
      env
    );
    expect(approve20.status).toBe(200);

    // 10b. Attempt to assign EXCEL_20KL_REFERENCE to unverified Tank #2 -> blocked with INCOMPATIBLE_TANK / unverified dimensions
    const unverifiedTank2Assign = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/assign',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tankIds: ['tank-2'] }),
      },
      env
    );
    expect(unverifiedTank2Assign.status).toBe(400);
    const unverifiedTank2Json = (await unverifiedTank2Assign.json()) as any;
    expect([
      'UNVERIFIED_TANK_DIMENSIONS',
      'INCOMPATIBLE_TANK',
      'TANK_DIMENSIONS_UNVERIFIED',
    ]).toContain(unverifiedTank2Json.error.code);

    // 11a. Assign to Tank #1 -> must preserve Tank #1 existing ACTIVE Rev #1 and existing Rev #2 DRAFT untouched
    const assignTank1Res = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/assign',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tankIds: ['tank-1'], preserveExistingDraft: true }),
      },
      env
    );
    expect(assignTank1Res.status).toBe(200);
    const assignTank1Json = (await assignTank1Res.json()) as any;
    expect(assignTank1Json.data.assignments[0].preservedExistingDraft).toBe(true);
    expect(assignTank1Json.data.assignments[0].revisionNumber).toBe(2);

    // 11b. Verify Tank #2 physical dimensions & calibration certificate with Document Vault evidence
    const verifyTank2Res = await app.request(
      '/api/v1/tanks/tank-2/calibration/engineering-verify',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankIdentifier: 'COCO22-TANK-2',
          tankSerialNumber: 'SN-COCO22-T2-2026',
          verifiedCapacityLitres: 20000,
          verifiedDiameterMm: 2100,
          verifiedLengthMm: 6250,
          verifiedMaxDipMm: 2100,
          issuingAuthority: 'Legal Metrology',
          certificateNumber: 'LM/COCO22/T2/CERT-2026',
          verificationDate: '2026-11-01',
          engineeringApprover: 'Er. R. Sharma',
          decision: 'VERIFIED',
          supportingDocumentId: vaultDocumentId,
        }),
      },
      env
    );
    expect(verifyTank2Res.status).toBe(200);

    // Assign EXCEL_20KL_REFERENCE to verified Tank #2 as DRAFT
    const assignTank2Res = await app.request(
      '/api/v1/calibration-templates/gtct-excel-20kl-ref/assign',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tankIds: ['tank-2'], activateImmediately: false }),
      },
      env
    );
    expect(assignTank2Res.status).toBe(200);
    const assignTank2Json = (await assignTank2Res.json()) as any;
    const stagedChartId = assignTank2Json.data.assignments[0].chartId;
    expect(assignTank2Json.data.assignments[0].status).toBe('DRAFT');
    expect(assignTank2Json.data.assignments[0].pointsCount).toBe(211);

    // Attempt activation without confirmActivation -> rejected
    const activateNoConfirm = await app.request(
      `/api/v1/tanks/tank-2/calibration/charts/${stagedChartId}/activate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmActivation: false }),
      },
      env
    );
    expect(activateNoConfirm.status).toBe(400);
    expect(((await activateNoConfirm.json()) as any).error.code).toBe(
      'ACTIVATION_CONFIRMATION_REQUIRED'
    );

    // Controlled activation with confirmActivation: true
    const activateRes = await app.request(
      `/api/v1/tanks/tank-2/calibration/charts/${stagedChartId}/activate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmActivation: true,
          effectiveFrom: '2026-11-10',
          notes: 'Authorised controlled activation for Tank #2',
        }),
      },
      env
    );
    expect(activateRes.status).toBe(200);
    const activateJson = (await activateRes.json()) as any;
    expect(activateJson.data.status).toBe('ACTIVE');

    // Verify Tank #1 Rev #1 ACTIVE and Rev #2 DRAFT remain 100% preserved in database
    const db = getDb(localD1);
    const tank1Charts = await db
      .select()
      .from(schema.tankCalibrationCharts)
      .where(eq(schema.tankCalibrationCharts.tankId, 'tank-1'));
    const t1Rev1 = tank1Charts.find(c => c.revisionNumber === 1);
    const t1Rev2 = tank1Charts.find(c => c.revisionNumber === 2);
    expect(t1Rev1?.status).toBe('ACTIVE');
    expect(t1Rev2?.status).toBe('DRAFT');
  });
});
