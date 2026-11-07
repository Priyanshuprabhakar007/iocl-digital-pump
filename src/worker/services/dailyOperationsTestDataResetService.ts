import { and, eq, gte, inArray, lte, ne, asc, desc } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { formatMilliunits } from '../../shared/precision';
import { UserContext } from '../../shared/types';

export const RESET_CONFIRMATION_PHRASE = 'RESET COCO TEST DATA';

export type ResetBlockerCategory =
  | 'LOCKED_SHIFT'
  | 'CLOSED_SHIFT_IMMUTABILITY_GUARD'
  | 'POTENTIAL_OFFICIAL_FUEL_RECEIPT'
  | 'OFFICIAL_BANK_DEPOSIT'
  | 'SETTLED_CASH_HANDOVER'
  | 'EXTERNAL_SETTLED_COLLECTION'
  | 'FINALIZED_DG_DAILY_LOG';

export interface ResetBlockerItem {
  id: string;
  blockerId: string;
  category: ResetBlockerCategory;
  severity: 'CRITICAL' | 'HIGH';
  entityType: string;
  entityId: string;
  shiftId: string | null;
  businessDate: string;
  title: string;
  description: string;
  requiresOwnerReview: boolean;
  reviewed: boolean;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

export interface ShiftDependentPreviewItem {
  shift: {
    id: string;
    outletId: string;
    shiftTemplateId: string;
    shiftTemplateCode: string;
    shiftTemplateName: string;
    businessDate: string;
    status: 'OPEN' | 'CLOSING' | 'CLOSED' | 'LOCKED';
    startedAt: string;
    closedAt: string | null;
    openedByUserId: string;
    closedByUserId: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  counts: {
    operationalShiftNozzles: number;
    operationalShiftTanks: number;
    operationalShiftProductPrices: number;
    tankStockReadings: number;
    openingTankDips: number;
    closingTankDips: number;
    prePostReceiptTankDips: number;
    waterDipPositiveReadings: number;
    nozzleMeterReadings: number;
    nozzleTestingPositiveReadings: number;
    nozzleUnavailabilityRecords: number;
    fuelReceipts: number;
    fuelReceiptTankLines: number;
    shiftStockReconciliations: number;
    shiftCollections: number;
    cashHandoverLogs: number;
    bankDeposits: number;
    shiftFinancialReconciliations: number;
    cngShiftLogs: number;
    cngPressureReadings: number;
    lubeShiftSales: number;
    totalShiftAndDependentRecords: number;
  };
  recordIdsByTable: Record<string, string[]>;
  details: {
    tankReadings: Array<{
      id: string;
      tankId: string;
      readingType: string;
      productDipMm: string;
      waterDipMm: string;
      netProductVolumeLitres: string;
      recordedAt: string;
    }>;
    nozzleReadings: Array<{
      id: string;
      nozzleId: string;
      openingTotalizer: string;
      closingTotalizer: string;
      testingQuantity: string;
      grossSales: string;
      netSales: string;
      createdAt: string;
    }>;
    fuelReceipts: Array<{
      id: string;
      ttNumber: string;
      invoiceNumber: string;
      invoiceDate: string;
      status: string;
      arrivalAt: string;
      lineCount: number;
    }>;
    stockReconciliations: Array<{
      id: string;
      tankId: string;
      openingStockLitres: string;
      receiptQuantityLitres: string;
      salesQuantityLitres: string;
      physicalClosingStockLitres: string;
      varianceLitres: string;
      varianceStatus: string;
    }>;
    collections: Array<{
      id: string;
      collectionType: string;
      amountPaise: number;
      referenceNumber: string | null;
      collectedAt: string;
    }>;
    bankDeposits: Array<{
      id: string;
      depositChannel: string;
      amountPaise: number;
      status: string;
      referenceNumber: string | null;
      documentId: string | null;
      depositDate: string;
    }>;
  };
  blockers: ResetBlockerItem[];
}

export interface BusinessDatePreviewGroup {
  businessDate: string;
  outletId: string;
  roCode: string;
  outletName: string;
  shiftsCount: number;
  totalRecordsInDate: number;
  unreviewedBlockersCount: number;
  shifts: ShiftDependentPreviewItem[];
}

export interface ProtectedDataPreservationSummary {
  retailOutletsTotal: number;
  otherOutletsShiftsCount: number;
  sameOutletOutsideRangeShiftsCount: number;
  outletTanksCount: number;
  outletDispensersCount: number;
  outletNozzlesCount: number;
  globalShiftTemplatesCount: number;
  outletShiftTemplatesCount: number;
  productsCount: number;
  outletProductsCount: number;
  outletProductPricesCount: number;
  globalCalibrationTemplatesCount: number;
  outletCalibrationChartsCount: number;
  outletCalibrationPointsCount: number;
  outletHrStaffCount: number;
  outletDocumentsCount: number;
  outletComplianceRecordsCount: number;
  auditLogsCount: number;
}

export interface DailyOperationsResetDryRunPreview {
  outlet: {
    id: string;
    roCode: string;
    name: string;
    outletType: string;
    city: string;
    district: string;
    status: string;
  };
  dateRange: {
    fromBusinessDate: string;
    toBusinessDate: string;
  };
  generatedAt: string;
  generatedBy: {
    userId: string;
    name: string;
    email: string;
  };
  summaryCounts: {
    operationalShifts: number;
    openShifts: number;
    closingShifts: number;
    closedShifts: number;
    lockedShifts: number;
    operationalShiftNozzles: number;
    operationalShiftTanks: number;
    operationalShiftProductPrices: number;
    tankStockReadings: number;
    openingTankDips: number;
    closingTankDips: number;
    prePostReceiptTankDips: number;
    waterDipPositiveReadings: number;
    nozzleMeterReadings: number;
    nozzleTestingPositiveReadings: number;
    nozzleUnavailabilityRecords: number;
    fuelReceipts: number;
    fuelReceiptTankLines: number;
    shiftStockReconciliations: number;
    shiftCollections: number;
    cashHandoverLogs: number;
    bankDeposits: number;
    shiftFinancialReconciliations: number;
    cngShiftLogs: number;
    cngPressureReadings: number;
    lubeShiftSales: number;
    idempotencyKeysLinked: number;
    totalAffectedRecords: number;
  };
  inventoryByTable: Record<string, { count: number; recordIds: string[] }>;
  groupedByBusinessDate: BusinessDatePreviewGroup[];
  blockers: ResetBlockerItem[];
  unreviewedBlockersCount: number;
  hasUnreviewedBlockers: boolean;
  canCreateBackup: boolean;
  canProceedToReset: boolean;
  protectedDataSummary: ProtectedDataPreservationSummary;
  dateScopedAdvisories: {
    dgDailyLogsInDateRange: number;
    finalizedDgDailyLogsInDateRange: number;
  };
}

export interface DailyOperationsResetBackupPayload {
  backupId: string;
  schemaVersion: string;
  outlet: {
    id: string;
    roCode: string;
    name: string;
  };
  dateRange: {
    fromBusinessDate: string;
    toBusinessDate: string;
  };
  reason: string;
  createdAt: string;
  createdBy: {
    userId: string;
    name: string;
    email: string;
  };
  inventory: {
    totalRecords: number;
    byTable: Record<string, { count: number; recordIds: string[] }>;
  };
  tables: {
    operational_shifts: any[];
    operational_shift_nozzles: any[];
    operational_shift_tanks: any[];
    operational_shift_product_prices: any[];
    tank_stock_readings: any[];
    nozzle_meter_readings: any[];
    nozzle_unavailability_records: any[];
    fuel_receipts: any[];
    fuel_receipt_tank_lines: any[];
    shift_stock_reconciliations: any[];
    shift_collections: any[];
    cash_handover_logs: any[];
    bank_deposits: any[];
    shift_financial_reconciliations: any[];
    cng_shift_logs: any[];
    cng_pressure_readings: any[];
    lube_shift_sales: any[];
    idempotency_keys: any[];
  };
  sha256Checksum: string;
  r2ObjectKey: string | null;
}

export interface DailyOperationsResetApprovalRecord {
  approvalId: string;
  backupId: string;
  backupSha256Checksum: string;
  outletId: string;
  roCode: string;
  outletName: string;
  fromBusinessDate: string;
  toBusinessDate: string;
  totalAffectedRecords: number;
  approvalReason: string;
  confirmIrreversibleReset: boolean;
  confirmClosedShiftReset: boolean;
  confirmationPhrase: string;
  approvedBy: {
    userId: string;
    name: string;
    email: string;
  };
  approvedAt: string;
  status: 'APPROVED' | 'EXECUTED';
  executedAt?: string | null;
  executionAuditId?: string | null;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isExplicitTestMarker(text?: string | null): boolean {
  if (!text) return false;
  return /\b(test|uat|demo|sample|dummy|sandbox|pre-go-live)\b/i.test(text);
}

async function computeSha256Hex(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalizeBackupDataForHash(
  inventory: DailyOperationsResetBackupPayload['inventory'],
  tables: DailyOperationsResetBackupPayload['tables']
): string {
  return JSON.stringify({ inventory, tables });
}

export class DailyOperationsTestDataResetService {
  /**
   * Enforces strict ADMIN role + GLOBAL scope check.
   */
  static assertGlobalAdminAuthority(userCtx?: UserContext | null): {
    allowed: boolean;
    errorCode?: string;
    errorMessage?: string;
  } {
    if (!userCtx || !userCtx.user) {
      return {
        allowed: false,
        errorCode: 'UNAUTHORIZED',
        errorMessage: 'Authentication is required.',
      };
    }
    if (!userCtx.roles.includes('ADMIN') || !userCtx.isGlobalScope) {
      return {
        allowed: false,
        errorCode: 'FORBIDDEN',
        errorMessage:
          'Access denied. Daily Operations Test Data Reset is restricted to Global Administrators (ADMIN role with GLOBAL scope).',
      };
    }
    return { allowed: true };
  }

  /**
   * Validates business date range parameters.
   */
  static validateDateRange(
    fromBusinessDate: string,
    toBusinessDate: string
  ): { valid: boolean; message?: string } {
    if (!DATE_REGEX.test(fromBusinessDate) || !DATE_REGEX.test(toBusinessDate)) {
      return {
        valid: false,
        message: 'fromBusinessDate and toBusinessDate must be valid YYYY-MM-DD dates.',
      };
    }
    if (fromBusinessDate > toBusinessDate) {
      return {
        valid: false,
        message: 'fromBusinessDate must be less than or equal to toBusinessDate.',
      };
    }
    return { valid: true };
  }

  /**
   * Resolves target outlet by outletId or roCode (e.g., '396187' for COCO 22).
   */
  static async resolveTargetOutlet(
    db: AppDatabase,
    identifier: { outletId?: string; roCode?: string }
  ) {
    if (identifier.outletId) {
      const byId = await db
        .select()
        .from(schema.retailOutlets)
        .where(eq(schema.retailOutlets.id, identifier.outletId));
      if (byId.length > 0) return byId[0];

      // Also allow passing roCode inside outletId field for convenience
      const byCodeFallback = await db
        .select()
        .from(schema.retailOutlets)
        .where(eq(schema.retailOutlets.roCode, identifier.outletId));
      if (byCodeFallback.length > 0) return byCodeFallback[0];
    }

    if (identifier.roCode) {
      const byCode = await db
        .select()
        .from(schema.retailOutlets)
        .where(eq(schema.retailOutlets.roCode, identifier.roCode));
      if (byCode.length > 0) return byCode[0];
    }

    return null;
  }

  /**
   * Loads all admin blocker reviews recorded in audit_logs for this outlet.
   */
  static async loadReviewedBlockersMap(
    db: AppDatabase,
    outletId: string
  ): Promise<
    Map<
      string,
      {
        reviewedByUserId: string;
        reviewedByName: string;
        reviewedAt: string;
        reviewNotes: string;
      }
    >
  > {
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, 'DAILY_OPS_RESET_BLOCKER_REVIEW'),
          eq(schema.auditLogs.entityId, outletId)
        )
      )
      .orderBy(asc(schema.auditLogs.createdAt));

    const map = new Map<
      string,
      {
        reviewedByUserId: string;
        reviewedByName: string;
        reviewedAt: string;
        reviewNotes: string;
      }
    >();

    for (const log of logs) {
      if (!log.newValueJson) continue;
      try {
        const parsed = JSON.parse(log.newValueJson);
        const blockerIds: string[] = Array.isArray(parsed.blockerIds) ? parsed.blockerIds : [];
        for (const bId of blockerIds) {
          map.set(bId, {
            reviewedByUserId: parsed.reviewedByUserId || log.userId || 'ADMIN',
            reviewedByName: parsed.reviewedByName || 'Administrator',
            reviewedAt: parsed.reviewedAt || log.createdAt,
            reviewNotes: parsed.reviewNotes || '',
          });
        }
      } catch {
        // ignore malformed json
      }
    }

    return map;
  }

  /**
   * Collects raw rows across all 17 shift-linked tables + linked idempotency_keys
   * strictly scoped by (outletId, operational_shifts.business_date BETWEEN fromBusinessDate AND toBusinessDate).
   * Never uses record creation timestamps to decide what belongs to a shift.
   */
  static async collectScopedOperationalData(
    db: AppDatabase,
    outletId: string,
    fromBusinessDate: string,
    toBusinessDate: string
  ) {
    const shifts = await db
      .select()
      .from(schema.operationalShifts)
      .where(
        and(
          eq(schema.operationalShifts.outletId, outletId),
          gte(schema.operationalShifts.businessDate, fromBusinessDate),
          lte(schema.operationalShifts.businessDate, toBusinessDate)
        )
      )
      .orderBy(asc(schema.operationalShifts.businessDate), asc(schema.operationalShifts.startedAt));

    const shiftIds = shifts.map((s) => s.id);

    if (shiftIds.length === 0) {
      return {
        shifts: [],
        shiftNozzles: [],
        shiftTanks: [],
        shiftProductPrices: [],
        tankStockReadings: [],
        nozzleMeterReadings: [],
        nozzleUnavailabilityRecords: [],
        fuelReceipts: [],
        fuelReceiptTankLines: [],
        shiftStockReconciliations: [],
        shiftCollections: [],
        cashHandoverLogs: [],
        bankDeposits: [],
        shiftFinancialReconciliations: [],
        cngShiftLogs: [],
        cngPressureReadings: [],
        lubeShiftSales: [],
        idempotencyKeys: [],
      };
    }

    const [
      shiftNozzles,
      shiftTanks,
      shiftProductPrices,
      tankStockReadings,
      nozzleMeterReadings,
      nozzleUnavailabilityRecords,
      fuelReceipts,
      shiftStockReconciliations,
      shiftCollections,
      cashHandoverLogs,
      bankDeposits,
      shiftFinancialReconciliations,
      cngShiftLogs,
      cngPressureReadings,
      lubeShiftSales,
    ] = await Promise.all([
      db
        .select()
        .from(schema.operationalShiftNozzles)
        .where(
          and(
            eq(schema.operationalShiftNozzles.outletId, outletId),
            inArray(schema.operationalShiftNozzles.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.operationalShiftTanks)
        .where(
          and(
            eq(schema.operationalShiftTanks.outletId, outletId),
            inArray(schema.operationalShiftTanks.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.operationalShiftProductPrices)
        .where(
          and(
            eq(schema.operationalShiftProductPrices.outletId, outletId),
            inArray(schema.operationalShiftProductPrices.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.tankStockReadings)
        .where(
          and(
            eq(schema.tankStockReadings.outletId, outletId),
            inArray(schema.tankStockReadings.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.nozzleMeterReadings)
        .where(
          and(
            eq(schema.nozzleMeterReadings.outletId, outletId),
            inArray(schema.nozzleMeterReadings.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.nozzleUnavailabilityRecords)
        .where(inArray(schema.nozzleUnavailabilityRecords.operationalShiftId, shiftIds)),
      db
        .select()
        .from(schema.fuelReceipts)
        .where(
          and(
            eq(schema.fuelReceipts.outletId, outletId),
            inArray(schema.fuelReceipts.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.shiftStockReconciliations)
        .where(
          and(
            eq(schema.shiftStockReconciliations.outletId, outletId),
            inArray(schema.shiftStockReconciliations.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.shiftCollections)
        .where(
          and(
            eq(schema.shiftCollections.outletId, outletId),
            inArray(schema.shiftCollections.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.cashHandoverLogs)
        .where(
          and(
            eq(schema.cashHandoverLogs.outletId, outletId),
            inArray(schema.cashHandoverLogs.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.bankDeposits)
        .where(
          and(
            eq(schema.bankDeposits.outletId, outletId),
            inArray(schema.bankDeposits.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.shiftFinancialReconciliations)
        .where(
          and(
            eq(schema.shiftFinancialReconciliations.outletId, outletId),
            inArray(schema.shiftFinancialReconciliations.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.cngShiftLogs)
        .where(
          and(
            eq(schema.cngShiftLogs.outletId, outletId),
            inArray(schema.cngShiftLogs.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.cngPressureReadings)
        .where(
          and(
            eq(schema.cngPressureReadings.outletId, outletId),
            inArray(schema.cngPressureReadings.operationalShiftId, shiftIds)
          )
        ),
      db
        .select()
        .from(schema.lubeShiftSales)
        .where(
          and(
            eq(schema.lubeShiftSales.outletId, outletId),
            inArray(schema.lubeShiftSales.operationalShiftId, shiftIds)
          )
        ),
    ]);

    const receiptIds = fuelReceipts.map((r) => r.id);
    const fuelReceiptTankLines =
      receiptIds.length > 0
        ? await db
            .select()
            .from(schema.fuelReceiptTankLines)
            .where(inArray(schema.fuelReceiptTankLines.fuelReceiptId, receiptIds))
        : [];

    const allEntityIds = [
      ...shiftIds,
      ...tankStockReadings.map((r) => r.id),
      ...nozzleMeterReadings.map((r) => r.id),
      ...fuelReceipts.map((r) => r.id),
      ...shiftCollections.map((r) => r.id),
      ...cashHandoverLogs.map((r) => r.id),
      ...bankDeposits.map((r) => r.id),
      ...cngShiftLogs.map((r) => r.id),
      ...cngPressureReadings.map((r) => r.id),
      ...lubeShiftSales.map((r) => r.id),
    ];

    const idempotencyKeys =
      allEntityIds.length > 0
        ? await db
            .select()
            .from(schema.idempotencyKeys)
            .where(inArray(schema.idempotencyKeys.entityId, allEntityIds))
        : [];

    return {
      shifts,
      shiftNozzles,
      shiftTanks,
      shiftProductPrices,
      tankStockReadings,
      nozzleMeterReadings,
      nozzleUnavailabilityRecords,
      fuelReceipts,
      fuelReceiptTankLines,
      shiftStockReconciliations,
      shiftCollections,
      cashHandoverLogs,
      bankDeposits,
      shiftFinancialReconciliations,
      cngShiftLogs,
      cngPressureReadings,
      lubeShiftSales,
      idempotencyKeys,
    };
  }

  /**
   * Generates a complete Dry-Run Preview of all affected operational shifts and dependent records,
   * grouped by businessDate and outlet, along with official-data blockers and protected table counts.
   */
  static async generateDryRunPreview(
    db: AppDatabase,
    params: {
      outletId?: string;
      roCode?: string;
      fromBusinessDate: string;
      toBusinessDate: string;
      actor: { userId: string; name: string; email: string };
    }
  ): Promise<DailyOperationsResetDryRunPreview> {
    const rangeCheck = this.validateDateRange(params.fromBusinessDate, params.toBusinessDate);
    if (!rangeCheck.valid) {
      throw new Error(`VALIDATION_ERROR:${rangeCheck.message}`);
    }

    const outlet = await this.resolveTargetOutlet(db, {
      outletId: params.outletId,
      roCode: params.roCode,
    });
    if (!outlet) {
      throw new Error('OUTLET_NOT_FOUND:Target retail outlet was not found.');
    }

    const [
      scoped,
      reviewedBlockersMap,
      globalShiftTemplates,
      outletShiftTemplates,
      allOutlets,
      otherOutletsShifts,
      allThisOutletShifts,
      outletTanks,
      outletDispensers,
      outletNozzles,
      allProducts,
      outletProductsList,
      outletProductPricesList,
      globalCalTemplates,
      outletDocuments,
      outletCompliance,
      allAuditLogs,
      outletHrStaff,
      dgLogsInRange,
    ] = await Promise.all([
      this.collectScopedOperationalData(
        db,
        outlet.id,
        params.fromBusinessDate,
        params.toBusinessDate
      ),
      this.loadReviewedBlockersMap(db, outlet.id),
      db.select().from(schema.globalShiftTemplates),
      db
        .select()
        .from(schema.shiftTemplates)
        .where(eq(schema.shiftTemplates.outletId, outlet.id)),
      db.select().from(schema.retailOutlets),
      db
        .select()
        .from(schema.operationalShifts)
        .where(ne(schema.operationalShifts.outletId, outlet.id)),
      db
        .select()
        .from(schema.operationalShifts)
        .where(eq(schema.operationalShifts.outletId, outlet.id)),
      db.select().from(schema.tanks).where(eq(schema.tanks.outletId, outlet.id)),
      db.select().from(schema.dispensers).where(eq(schema.dispensers.outletId, outlet.id)),
      db.select().from(schema.nozzles).where(eq(schema.nozzles.outletId, outlet.id)),
      db.select().from(schema.products),
      db
        .select()
        .from(schema.outletProducts)
        .where(eq(schema.outletProducts.outletId, outlet.id)),
      db
        .select()
        .from(schema.outletProductPrices)
        .where(eq(schema.outletProductPrices.outletId, outlet.id)),
      db.select().from(schema.globalTankCalibrationTemplates),
      db.select().from(schema.documents).where(eq(schema.documents.outletId, outlet.id)),
      db
        .select()
        .from(schema.cocoComplianceRecords)
        .where(eq(schema.cocoComplianceRecords.outletId, outlet.id)),
      db.select().from(schema.auditLogs),
      db.select().from(schema.hrStaff).where(eq(schema.hrStaff.outletId, outlet.id)),
      db
        .select()
        .from(schema.dgDailyLogs)
        .where(
          and(
            eq(schema.dgDailyLogs.outletId, outlet.id),
            gte(schema.dgDailyLogs.businessDate, params.fromBusinessDate),
            lte(schema.dgDailyLogs.businessDate, params.toBusinessDate)
          )
        ),
    ]);

    const tankIds = outletTanks.map((t) => t.id);
    const [outletCalibrationCharts, outletCalibrationPoints] =
      tankIds.length > 0
        ? await Promise.all([
            db
              .select()
              .from(schema.tankCalibrationCharts)
              .where(inArray(schema.tankCalibrationCharts.tankId, tankIds)),
            db
              .select()
              .from(schema.tankCalibrationPoints)
              .where(inArray(schema.tankCalibrationPoints.tankId, tankIds)),
          ])
        : [[], []];

    const templateMap = new Map<string, { code: string; name: string }>();
    for (const gt of globalShiftTemplates) {
      templateMap.set(gt.id, { code: gt.code, name: gt.name });
    }
    for (const ot of outletShiftTemplates) {
      if (!templateMap.has(ot.id)) {
        templateMap.set(ot.id, { code: ot.code, name: ot.name });
      }
    }

    const allBlockers: ResetBlockerItem[] = [];
    const applyReviewStatus = (blocker: Omit<ResetBlockerItem, 'blockerId' | 'reviewed' | 'reviewedByUserId' | 'reviewedByName' | 'reviewedAt' | 'reviewNotes'>): ResetBlockerItem => {
      const rev = reviewedBlockersMap.get(blocker.id);
      return {
        ...blocker,
        blockerId: blocker.id,
        reviewed: Boolean(rev),
        reviewedByUserId: rev?.reviewedByUserId || null,
        reviewedByName: rev?.reviewedByName || null,
        reviewedAt: rev?.reviewedAt || null,
        reviewNotes: rev?.reviewNotes || null,
      };
    };

    const shiftPreviewItems: ShiftDependentPreviewItem[] = scoped.shifts.map((shift) => {
      const tpl = templateMap.get(shift.shiftTemplateId) || {
        code: shift.shiftTemplateId,
        name: 'Operational Shift',
      };

      const sNozzles = scoped.shiftNozzles.filter((r) => r.operationalShiftId === shift.id);
      const sTanks = scoped.shiftTanks.filter((r) => r.operationalShiftId === shift.id);
      const sPrices = scoped.shiftProductPrices.filter((r) => r.operationalShiftId === shift.id);
      const sTankReadings = scoped.tankStockReadings.filter((r) => r.operationalShiftId === shift.id);
      const sNozzleReadings = scoped.nozzleMeterReadings.filter(
        (r) => r.operationalShiftId === shift.id
      );
      const sUnavailability = scoped.nozzleUnavailabilityRecords.filter(
        (r) => r.operationalShiftId === shift.id
      );
      const sReceipts = scoped.fuelReceipts.filter((r) => r.operationalShiftId === shift.id);
      const sReceiptIds = new Set(sReceipts.map((r) => r.id));
      const sReceiptLines = scoped.fuelReceiptTankLines.filter((l) =>
        sReceiptIds.has(l.fuelReceiptId)
      );
      const sStockRecons = scoped.shiftStockReconciliations.filter(
        (r) => r.operationalShiftId === shift.id
      );
      const sCollections = scoped.shiftCollections.filter(
        (r) => r.operationalShiftId === shift.id
      );
      const sHandovers = scoped.cashHandoverLogs.filter(
        (r) => r.operationalShiftId === shift.id
      );
      const sDeposits = scoped.bankDeposits.filter((r) => r.operationalShiftId === shift.id);
      const sFinRecons = scoped.shiftFinancialReconciliations.filter(
        (r) => r.operationalShiftId === shift.id
      );
      const sCngLogs = scoped.cngShiftLogs.filter((r) => r.operationalShiftId === shift.id);
      const sCngPressures = scoped.cngPressureReadings.filter(
        (r) => r.operationalShiftId === shift.id
      );
      const sLubeSales = scoped.lubeShiftSales.filter((r) => r.operationalShiftId === shift.id);

      const shiftBlockers: ResetBlockerItem[] = [];

      // 1. Check LOCKED shift
      if (shift.status === 'LOCKED') {
        shiftBlockers.push(
          applyReviewStatus({
            id: `blk:shift:${shift.id}:LOCKED_SHIFT`,
            category: 'LOCKED_SHIFT',
            severity: 'CRITICAL',
            entityType: 'OPERATIONAL_SHIFT',
            entityId: shift.id,
            shiftId: shift.id,
            businessDate: shift.businessDate,
            title: `Locked Operational Shift (${shift.businessDate})`,
            description: `Shift ${shift.id} is in LOCKED status. Locked shifts are protected against modification and require explicit administrator review before UAT reset.`,
            requiresOwnerReview: true,
          })
        );
      }

      // 2. Check CLOSED shift historical immutability guard
      if (shift.status === 'CLOSED') {
        shiftBlockers.push(
          applyReviewStatus({
            id: `blk:shift:${shift.id}:CLOSED_SHIFT`,
            category: 'CLOSED_SHIFT_IMMUTABILITY_GUARD',
            severity: 'HIGH',
            entityType: 'OPERATIONAL_SHIFT',
            entityId: shift.id,
            shiftId: shift.id,
            businessDate: shift.businessDate,
            title: `Closed Shift Immutability Guard (${shift.businessDate})`,
            description: `Shift ${shift.id} was closed at ${shift.closedAt || 'N/A'}. Closed shifts are historically immutable unless explicitly attested as pre-go-live UAT test data by an authorised administrator.`,
            requiresOwnerReview: true,
          })
        );
      }

      // 3. Check Fuel Receipts (real tanker receipts / verified / decanted / completed / non-test invoices)
      for (const rcpt of sReceipts) {
        const hasExplicitTestTag =
          isExplicitTestMarker(rcpt.invoiceNumber) ||
          isExplicitTestMarker(rcpt.ttNumber) ||
          isExplicitTestMarker(rcpt.sealExceptionReason);
        const isFinalizedReceipt = ['VERIFIED', 'DECANTED', 'COMPLETED'].includes(rcpt.status);
        const isUnreviewedActiveReceipt = rcpt.status !== 'CANCELLED' && (!hasExplicitTestTag || isFinalizedReceipt);

        if (isUnreviewedActiveReceipt) {
          shiftBlockers.push(
            applyReviewStatus({
              id: `blk:receipt:${rcpt.id}:POTENTIAL_OFFICIAL_FUEL_RECEIPT`,
              category: 'POTENTIAL_OFFICIAL_FUEL_RECEIPT',
              severity: 'CRITICAL',
              entityType: 'FUEL_RECEIPT',
              entityId: rcpt.id,
              shiftId: shift.id,
              businessDate: shift.businessDate,
              title: `Tanker Receipt TT ${rcpt.ttNumber} — Invoice ${rcpt.invoiceNumber} (${rcpt.status})`,
              description: `Fuel receipt ${rcpt.id} (TT: ${rcpt.ttNumber}, Invoice: ${rcpt.invoiceNumber}, Status: ${rcpt.status}) resembles an official tanker delivery or active receipt. Authorised owner must review and confirm this is UAT test data before reset.`,
              requiresOwnerReview: true,
            })
          );
        }
      }

      // 4. Check Bank Deposits
      for (const dep of sDeposits) {
        if (dep.status === 'VERIFIED' || dep.documentId || (dep.referenceNumber && !isExplicitTestMarker(dep.referenceNumber))) {
          shiftBlockers.push(
            applyReviewStatus({
              id: `blk:deposit:${dep.id}:OFFICIAL_BANK_DEPOSIT`,
              category: 'OFFICIAL_BANK_DEPOSIT',
              severity: 'CRITICAL',
              entityType: 'BANK_DEPOSIT',
              entityId: dep.id,
              shiftId: shift.id,
              businessDate: shift.businessDate,
              title: `Bank Deposit (${dep.depositChannel} — ₹${(dep.amountPaise / 100).toFixed(2)}, ${dep.status})`,
              description: `Bank deposit ${dep.id} (Ref: ${dep.referenceNumber || 'N/A'}, Status: ${dep.status}, Vault Doc: ${dep.documentId || 'None'}) represents a potentially genuine bank deposit and requires owner review before reset.`,
              requiresOwnerReview: true,
            })
          );
        }
      }

      // 5. Check Acknowledged Cash Handovers
      for (const ho of sHandovers) {
        if (ho.status === 'ACKNOWLEDGED') {
          shiftBlockers.push(
            applyReviewStatus({
              id: `blk:handover:${ho.id}:SETTLED_CASH_HANDOVER`,
              category: 'SETTLED_CASH_HANDOVER',
              severity: 'HIGH',
              entityType: 'CASH_HANDOVER_LOG',
              entityId: ho.id,
              shiftId: shift.id,
              businessDate: shift.businessDate,
              title: `Acknowledged Cash Handover (₹${(ho.amountPaise / 100).toFixed(2)})`,
              description: `Cash handover ${ho.id} has been ACKNOWLEDGED and requires owner review to confirm it is UAT test data.`,
              requiresOwnerReview: true,
            })
          );
        }
      }

      // 6. Check Settled / External Shift Collections
      for (const col of sCollections) {
        const hasExternalRef =
          Boolean(col.referenceNumber && !isExplicitTestMarker(col.referenceNumber)) ||
          Boolean(col.creditPartyId);
        const isElectronicOrCredit = [
          'POS_CARD',
          'UPI',
          'FLEET_CARD',
          'CREDIT_SALE',
          'DIRECT_BANK_DROP',
        ].includes(col.collectionType);

        if ((hasExternalRef || isElectronicOrCredit) && !isExplicitTestMarker(col.notes)) {
          shiftBlockers.push(
            applyReviewStatus({
              id: `blk:collection:${col.id}:EXTERNAL_SETTLED_COLLECTION`,
              category: 'EXTERNAL_SETTLED_COLLECTION',
              severity: 'HIGH',
              entityType: 'SHIFT_COLLECTION',
              entityId: col.id,
              shiftId: shift.id,
              businessDate: shift.businessDate,
              title: `Settled/External Collection (${col.collectionType} — ₹${(col.amountPaise / 100).toFixed(2)})`,
              description: `Collection ${col.id} (${col.collectionType}, Ref: ${col.referenceNumber || 'N/A'}) is an external/settled payment mode or credit party entry. Owner review is required before reset.`,
              requiresOwnerReview: true,
            })
          );
        }
      }

      allBlockers.push(...shiftBlockers);

      const totalShiftRecords =
        1 +
        sNozzles.length +
        sTanks.length +
        sPrices.length +
        sTankReadings.length +
        sNozzleReadings.length +
        sUnavailability.length +
        sReceipts.length +
        sReceiptLines.length +
        sStockRecons.length +
        sCollections.length +
        sHandovers.length +
        sDeposits.length +
        sFinRecons.length +
        sCngLogs.length +
        sCngPressures.length +
        sLubeSales.length;

      return {
        shift: {
          id: shift.id,
          outletId: shift.outletId,
          shiftTemplateId: shift.shiftTemplateId,
          shiftTemplateCode: tpl.code,
          shiftTemplateName: tpl.name,
          businessDate: shift.businessDate,
          status: shift.status,
          startedAt: shift.startedAt,
          closedAt: shift.closedAt,
          openedByUserId: shift.openedByUserId,
          closedByUserId: shift.closedByUserId,
          notes: shift.notes,
          createdAt: shift.createdAt,
          updatedAt: shift.updatedAt,
        },
        counts: {
          operationalShiftNozzles: sNozzles.length,
          operationalShiftTanks: sTanks.length,
          operationalShiftProductPrices: sPrices.length,
          tankStockReadings: sTankReadings.length,
          openingTankDips: sTankReadings.filter((r) => r.readingType === 'OPENING').length,
          closingTankDips: sTankReadings.filter((r) => r.readingType === 'CLOSING').length,
          prePostReceiptTankDips: sTankReadings.filter((r) =>
            ['PRE_RECEIPT', 'POST_RECEIPT'].includes(r.readingType)
          ).length,
          waterDipPositiveReadings: sTankReadings.filter((r) => r.waterDipMmMilliunits > 0).length,
          nozzleMeterReadings: sNozzleReadings.length,
          nozzleTestingPositiveReadings: sNozzleReadings.filter(
            (r) => r.testingQuantityMilliunits > 0
          ).length,
          nozzleUnavailabilityRecords: sUnavailability.length,
          fuelReceipts: sReceipts.length,
          fuelReceiptTankLines: sReceiptLines.length,
          shiftStockReconciliations: sStockRecons.length,
          shiftCollections: sCollections.length,
          cashHandoverLogs: sHandovers.length,
          bankDeposits: sDeposits.length,
          shiftFinancialReconciliations: sFinRecons.length,
          cngShiftLogs: sCngLogs.length,
          cngPressureReadings: sCngPressures.length,
          lubeShiftSales: sLubeSales.length,
          totalShiftAndDependentRecords: totalShiftRecords,
        },
        recordIdsByTable: {
          operational_shifts: [shift.id],
          operational_shift_nozzles: sNozzles.map((r) => r.id),
          operational_shift_tanks: sTanks.map((r) => r.id),
          operational_shift_product_prices: sPrices.map((r) => r.id),
          tank_stock_readings: sTankReadings.map((r) => r.id),
          nozzle_meter_readings: sNozzleReadings.map((r) => r.id),
          nozzle_unavailability_records: sUnavailability.map((r) => r.id),
          fuel_receipts: sReceipts.map((r) => r.id),
          fuel_receipt_tank_lines: sReceiptLines.map((r) => r.id),
          shift_stock_reconciliations: sStockRecons.map((r) => r.id),
          shift_collections: sCollections.map((r) => r.id),
          cash_handover_logs: sHandovers.map((r) => r.id),
          bank_deposits: sDeposits.map((r) => r.id),
          shift_financial_reconciliations: sFinRecons.map((r) => r.id),
          cng_shift_logs: sCngLogs.map((r) => r.id),
          cng_pressure_readings: sCngPressures.map((r) => r.id),
          lube_shift_sales: sLubeSales.map((r) => r.id),
        },
        details: {
          tankReadings: sTankReadings.map((r) => ({
            id: r.id,
            tankId: r.tankId,
            readingType: r.readingType,
            productDipMm: formatMilliunits(r.productDipMmMilliunits),
            waterDipMm: formatMilliunits(r.waterDipMmMilliunits),
            netProductVolumeLitres: formatMilliunits(r.netProductVolumeMilliunits),
            recordedAt: r.recordedAt,
          })),
          nozzleReadings: sNozzleReadings.map((r) => ({
            id: r.id,
            nozzleId: r.nozzleId,
            openingTotalizer: formatMilliunits(r.openingTotalizerMilliunits),
            closingTotalizer: formatMilliunits(r.closingTotalizerMilliunits),
            testingQuantity: formatMilliunits(r.testingQuantityMilliunits),
            grossSales: formatMilliunits(r.grossSalesQuantityMilliunits),
            netSales: formatMilliunits(r.netSalesQuantityMilliunits),
            createdAt: r.createdAt,
          })),
          fuelReceipts: sReceipts.map((r) => ({
            id: r.id,
            ttNumber: r.ttNumber,
            invoiceNumber: r.invoiceNumber,
            invoiceDate: r.invoiceDate,
            status: r.status,
            arrivalAt: r.arrivalAt,
            lineCount: sReceiptLines.filter((l) => l.fuelReceiptId === r.id).length,
          })),
          stockReconciliations: sStockRecons.map((r) => ({
            id: r.id,
            tankId: r.tankId,
            openingStockLitres: formatMilliunits(r.openingStockMilliunits),
            receiptQuantityLitres: formatMilliunits(r.receiptQuantityMilliunits),
            salesQuantityLitres: formatMilliunits(r.salesQuantityMilliunits),
            physicalClosingStockLitres: formatMilliunits(r.physicalClosingStockMilliunits),
            varianceLitres: formatMilliunits(r.varianceMilliunits),
            varianceStatus: r.varianceStatus,
          })),
          collections: sCollections.map((r) => ({
            id: r.id,
            collectionType: r.collectionType,
            amountPaise: r.amountPaise,
            referenceNumber: r.referenceNumber,
            collectedAt: r.collectedAt,
          })),
          bankDeposits: sDeposits.map((r) => ({
            id: r.id,
            depositChannel: r.depositChannel,
            amountPaise: r.amountPaise,
            status: r.status,
            referenceNumber: r.referenceNumber,
            documentId: r.documentId,
            depositDate: r.depositDate,
          })),
        },
        blockers: shiftBlockers,
      };
    });

    // Group by businessDate
    const dateGroupsMap = new Map<string, ShiftDependentPreviewItem[]>();
    for (const item of shiftPreviewItems) {
      const bDate = item.shift.businessDate;
      if (!dateGroupsMap.has(bDate)) {
        dateGroupsMap.set(bDate, []);
      }
      dateGroupsMap.get(bDate)!.push(item);
    }

    const groupedByBusinessDate: BusinessDatePreviewGroup[] = Array.from(dateGroupsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([businessDate, items]) => ({
        businessDate,
        outletId: outlet.id,
        roCode: outlet.roCode,
        outletName: outlet.name,
        shiftsCount: items.length,
        totalRecordsInDate: items.reduce(
          (sum, it) => sum + it.counts.totalShiftAndDependentRecords,
          0
        ),
        unreviewedBlockersCount: items.reduce(
          (sum, it) => sum + it.blockers.filter((b) => !b.reviewed).length,
          0
        ),
        shifts: items,
      }));

    const inventoryByTable: Record<string, { count: number; recordIds: string[] }> = {
      operational_shifts: {
        count: scoped.shifts.length,
        recordIds: scoped.shifts.map((r) => r.id),
      },
      operational_shift_nozzles: {
        count: scoped.shiftNozzles.length,
        recordIds: scoped.shiftNozzles.map((r) => r.id),
      },
      operational_shift_tanks: {
        count: scoped.shiftTanks.length,
        recordIds: scoped.shiftTanks.map((r) => r.id),
      },
      operational_shift_product_prices: {
        count: scoped.shiftProductPrices.length,
        recordIds: scoped.shiftProductPrices.map((r) => r.id),
      },
      tank_stock_readings: {
        count: scoped.tankStockReadings.length,
        recordIds: scoped.tankStockReadings.map((r) => r.id),
      },
      nozzle_meter_readings: {
        count: scoped.nozzleMeterReadings.length,
        recordIds: scoped.nozzleMeterReadings.map((r) => r.id),
      },
      nozzle_unavailability_records: {
        count: scoped.nozzleUnavailabilityRecords.length,
        recordIds: scoped.nozzleUnavailabilityRecords.map((r) => r.id),
      },
      fuel_receipts: {
        count: scoped.fuelReceipts.length,
        recordIds: scoped.fuelReceipts.map((r) => r.id),
      },
      fuel_receipt_tank_lines: {
        count: scoped.fuelReceiptTankLines.length,
        recordIds: scoped.fuelReceiptTankLines.map((r) => r.id),
      },
      shift_stock_reconciliations: {
        count: scoped.shiftStockReconciliations.length,
        recordIds: scoped.shiftStockReconciliations.map((r) => r.id),
      },
      shift_collections: {
        count: scoped.shiftCollections.length,
        recordIds: scoped.shiftCollections.map((r) => r.id),
      },
      cash_handover_logs: {
        count: scoped.cashHandoverLogs.length,
        recordIds: scoped.cashHandoverLogs.map((r) => r.id),
      },
      bank_deposits: {
        count: scoped.bankDeposits.length,
        recordIds: scoped.bankDeposits.map((r) => r.id),
      },
      shift_financial_reconciliations: {
        count: scoped.shiftFinancialReconciliations.length,
        recordIds: scoped.shiftFinancialReconciliations.map((r) => r.id),
      },
      cng_shift_logs: {
        count: scoped.cngShiftLogs.length,
        recordIds: scoped.cngShiftLogs.map((r) => r.id),
      },
      cng_pressure_readings: {
        count: scoped.cngPressureReadings.length,
        recordIds: scoped.cngPressureReadings.map((r) => r.id),
      },
      lube_shift_sales: {
        count: scoped.lubeShiftSales.length,
        recordIds: scoped.lubeShiftSales.map((r) => r.id),
      },
      idempotency_keys: {
        count: scoped.idempotencyKeys.length,
        recordIds: scoped.idempotencyKeys.map((r) => r.id),
      },
    };

    const totalAffectedRecords = Object.values(inventoryByTable).reduce(
      (sum, entry) => sum + entry.count,
      0
    );

    const unreviewedBlockersCount = allBlockers.filter((b) => !b.reviewed).length;
    const sameOutletOutsideRangeShiftsCount =
      allThisOutletShifts.length - scoped.shifts.length;

    return {
      outlet: {
        id: outlet.id,
        roCode: outlet.roCode,
        name: outlet.name,
        outletType: outlet.outletType,
        city: outlet.city,
        district: outlet.district,
        status: outlet.status,
      },
      dateRange: {
        fromBusinessDate: params.fromBusinessDate,
        toBusinessDate: params.toBusinessDate,
      },
      generatedAt: new Date().toISOString(),
      generatedBy: params.actor,
      summaryCounts: {
        operationalShifts: scoped.shifts.length,
        openShifts: scoped.shifts.filter((s) => s.status === 'OPEN').length,
        closingShifts: scoped.shifts.filter((s) => s.status === 'CLOSING').length,
        closedShifts: scoped.shifts.filter((s) => s.status === 'CLOSED').length,
        lockedShifts: scoped.shifts.filter((s) => s.status === 'LOCKED').length,
        operationalShiftNozzles: scoped.shiftNozzles.length,
        operationalShiftTanks: scoped.shiftTanks.length,
        operationalShiftProductPrices: scoped.shiftProductPrices.length,
        tankStockReadings: scoped.tankStockReadings.length,
        openingTankDips: scoped.tankStockReadings.filter((r) => r.readingType === 'OPENING').length,
        closingTankDips: scoped.tankStockReadings.filter((r) => r.readingType === 'CLOSING').length,
        prePostReceiptTankDips: scoped.tankStockReadings.filter((r) =>
          ['PRE_RECEIPT', 'POST_RECEIPT'].includes(r.readingType)
        ).length,
        waterDipPositiveReadings: scoped.tankStockReadings.filter(
          (r) => r.waterDipMmMilliunits > 0
        ).length,
        nozzleMeterReadings: scoped.nozzleMeterReadings.length,
        nozzleTestingPositiveReadings: scoped.nozzleMeterReadings.filter(
          (r) => r.testingQuantityMilliunits > 0
        ).length,
        nozzleUnavailabilityRecords: scoped.nozzleUnavailabilityRecords.length,
        fuelReceipts: scoped.fuelReceipts.length,
        fuelReceiptTankLines: scoped.fuelReceiptTankLines.length,
        shiftStockReconciliations: scoped.shiftStockReconciliations.length,
        shiftCollections: scoped.shiftCollections.length,
        cashHandoverLogs: scoped.cashHandoverLogs.length,
        bankDeposits: scoped.bankDeposits.length,
        shiftFinancialReconciliations: scoped.shiftFinancialReconciliations.length,
        cngShiftLogs: scoped.cngShiftLogs.length,
        cngPressureReadings: scoped.cngPressureReadings.length,
        lubeShiftSales: scoped.lubeShiftSales.length,
        idempotencyKeysLinked: scoped.idempotencyKeys.length,
        totalAffectedRecords,
      },
      inventoryByTable,
      groupedByBusinessDate,
      blockers: allBlockers,
      unreviewedBlockersCount,
      hasUnreviewedBlockers: unreviewedBlockersCount > 0,
      canCreateBackup: scoped.shifts.length > 0,
      canProceedToReset: scoped.shifts.length > 0 && unreviewedBlockersCount === 0,
      protectedDataSummary: {
        retailOutletsTotal: allOutlets.length,
        otherOutletsShiftsCount: otherOutletsShifts.length,
        sameOutletOutsideRangeShiftsCount,
        outletTanksCount: outletTanks.length,
        outletDispensersCount: outletDispensers.length,
        outletNozzlesCount: outletNozzles.length,
        globalShiftTemplatesCount: globalShiftTemplates.length,
        outletShiftTemplatesCount: outletShiftTemplates.length,
        productsCount: allProducts.length,
        outletProductsCount: outletProductsList.length,
        outletProductPricesCount: outletProductPricesList.length,
        globalCalibrationTemplatesCount: globalCalTemplates.length,
        outletCalibrationChartsCount: outletCalibrationCharts.length,
        outletCalibrationPointsCount: outletCalibrationPoints.length,
        outletHrStaffCount: outletHrStaff.length,
        outletDocumentsCount: outletDocuments.length,
        outletComplianceRecordsCount: outletCompliance.length,
        auditLogsCount: allAuditLogs.length,
      },
      dateScopedAdvisories: {
        dgDailyLogsInDateRange: dgLogsInRange.length,
        finalizedDgDailyLogsInDateRange: dgLogsInRange.filter((d) => d.status === 'FINAL').length,
      },
    };
  }

  /**
   * Records authorised administrator review of detected official/closed-shift blockers,
   * attesting that the reviewed items are confirmed UAT test records eligible for reset.
   */
  static async reviewOfficialDataBlockers(
    db: AppDatabase,
    params: {
      outletId?: string;
      roCode?: string;
      fromBusinessDate: string;
      toBusinessDate: string;
      blockerIds: string[];
      reviewNotes: string;
      attestConfirmedUatTestData: boolean;
      actor: { userId: string; name: string; email: string };
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ) {
    if (!params.attestConfirmedUatTestData) {
      throw new Error(
        'VALIDATION_ERROR:You must explicitly attest that all reviewed blockers are confirmed pre-go-live UAT test records.'
      );
    }
    const cleanNotes = (params.reviewNotes || '').trim();
    if (cleanNotes.length < 10) {
      throw new Error(
        'VALIDATION_ERROR:reviewNotes must be at least 10 characters explaining why the flagged records are confirmed UAT test data.'
      );
    }
    if (!Array.isArray(params.blockerIds) || params.blockerIds.length === 0) {
      throw new Error('VALIDATION_ERROR:At least one blockerId must be provided for review.');
    }

    if (params.blockerIds.some((id) => String(id).includes('LOCKED_SHIFT'))) {
      throw new Error(
        'LOCKED_SHIFT_RESET_FORBIDDEN:Locked shifts are permanently sealed and cannot be overridden by UAT test data reset.'
      );
    }

    const outlet = await this.resolveTargetOutlet(db, {
      outletId: params.outletId,
      roCode: params.roCode,
    });
    if (!outlet) {
      throw new Error('OUTLET_NOT_FOUND:Target retail outlet was not found.');
    }

    const nowIso = new Date().toISOString();
    const reviewId = `aud-blk-rev-${crypto.randomUUID()}`;
    const payload = {
      reviewId,
      outletId: outlet.id,
      roCode: outlet.roCode,
      fromBusinessDate: params.fromBusinessDate,
      toBusinessDate: params.toBusinessDate,
      blockerIds: Array.from(new Set(params.blockerIds)),
      reviewNotes: cleanNotes,
      attestConfirmedUatTestData: true,
      reviewedByUserId: params.actor.userId,
      reviewedByName: params.actor.name,
      reviewedByEmail: params.actor.email,
      reviewedAt: nowIso,
    };

    await db.insert(schema.auditLogs).values({
      id: reviewId,
      userId: params.actor.userId,
      action: 'DAILY_OPS_RESET_BLOCKER_REVIEWED',
      entityType: 'DAILY_OPS_RESET_BLOCKER_REVIEW',
      entityId: outlet.id,
      oldValueJson: null,
      newValueJson: JSON.stringify(payload),
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      createdAt: nowIso,
    });

    const updatedPreview = await this.generateDryRunPreview(db, {
      outletId: outlet.id,
      fromBusinessDate: params.fromBusinessDate,
      toBusinessDate: params.toBusinessDate,
      actor: params.actor,
    });

    return {
      review: payload,
      preview: updatedPreview,
      remainingUnreviewedBlockersCount: updatedPreview.unreviewedBlockersCount,
      canProceedToReset: updatedPreview.canProceedToReset,
    };
  }

  /**
   * Generates a restorable, access-controlled backup of all affected operational shifts and
   * dependent records, verifies SHA-256 & inventory integrity, and stores it in audit_logs + R2.
   */
  static async createResetBackup(
    db: AppDatabase,
    r2Bucket: R2Bucket | undefined,
    params: {
      outletId?: string;
      roCode?: string;
      fromBusinessDate: string;
      toBusinessDate: string;
      reason: string;
      actor: { userId: string; name: string; email: string };
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ) {
    const cleanReason = (params.reason || '').trim();
    if (cleanReason.length < 5) {
      throw new Error('VALIDATION_ERROR:Backup reason is required (minimum 5 characters).');
    }

    const rangeCheck = this.validateDateRange(params.fromBusinessDate, params.toBusinessDate);
    if (!rangeCheck.valid) {
      throw new Error(`VALIDATION_ERROR:${rangeCheck.message}`);
    }

    const outlet = await this.resolveTargetOutlet(db, {
      outletId: params.outletId,
      roCode: params.roCode,
    });
    if (!outlet) {
      throw new Error('OUTLET_NOT_FOUND:Target retail outlet was not found.');
    }

    const scoped = await this.collectScopedOperationalData(
      db,
      outlet.id,
      params.fromBusinessDate,
      params.toBusinessDate
    );

    if (scoped.shifts.length === 0) {
      throw new Error(
        'NO_SHIFTS_IN_SCOPE:No operational shifts exist in the selected outlet and business-date range to back up.'
      );
    }

    const tables: DailyOperationsResetBackupPayload['tables'] = {
      operational_shifts: scoped.shifts,
      operational_shift_nozzles: scoped.shiftNozzles,
      operational_shift_tanks: scoped.shiftTanks,
      operational_shift_product_prices: scoped.shiftProductPrices,
      tank_stock_readings: scoped.tankStockReadings,
      nozzle_meter_readings: scoped.nozzleMeterReadings,
      nozzle_unavailability_records: scoped.nozzleUnavailabilityRecords,
      fuel_receipts: scoped.fuelReceipts,
      fuel_receipt_tank_lines: scoped.fuelReceiptTankLines,
      shift_stock_reconciliations: scoped.shiftStockReconciliations,
      shift_collections: scoped.shiftCollections,
      cash_handover_logs: scoped.cashHandoverLogs,
      bank_deposits: scoped.bankDeposits,
      shift_financial_reconciliations: scoped.shiftFinancialReconciliations,
      cng_shift_logs: scoped.cngShiftLogs,
      cng_pressure_readings: scoped.cngPressureReadings,
      lube_shift_sales: scoped.lubeShiftSales,
      idempotency_keys: scoped.idempotencyKeys,
    };

    const byTable: Record<string, { count: number; recordIds: string[] }> = {};
    let totalRecords = 0;

    for (const [tableName, rows] of Object.entries(tables)) {
      byTable[tableName] = {
        count: rows.length,
        recordIds: rows.map((r: any) => String(r.id)),
      };
      totalRecords += rows.length;
    }

    const inventory = {
      totalRecords,
      byTable,
    };

    const sha256Checksum = await computeSha256Hex(canonicalizeBackupDataForHash(inventory, tables));
    const nowIso = new Date().toISOString();
    const backupId = `rst-bkp-${crypto.randomUUID()}`;
    const r2ObjectKey = `system-backups/daily-ops-reset/${outlet.roCode}/${backupId}.json`;

    const backupPayload: DailyOperationsResetBackupPayload = {
      backupId,
      schemaVersion: '0035_coco_compliance_records',
      outlet: {
        id: outlet.id,
        roCode: outlet.roCode,
        name: outlet.name,
      },
      dateRange: {
        fromBusinessDate: params.fromBusinessDate,
        toBusinessDate: params.toBusinessDate,
      },
      reason: cleanReason,
      createdAt: nowIso,
      createdBy: params.actor,
      inventory,
      tables,
      sha256Checksum,
      r2ObjectKey: r2Bucket ? r2ObjectKey : null,
    };

    const serializedBackup = JSON.stringify(backupPayload);

    if (r2Bucket) {
      await r2Bucket.put(r2ObjectKey, new TextEncoder().encode(serializedBackup), {
        customMetadata: {
          backupId,
          outletId: outlet.id,
          roCode: outlet.roCode,
          sha256Checksum,
          createdBy: params.actor.userId,
        },
      });
    }

    await db.insert(schema.auditLogs).values({
      id: `aud-bkp-${crypto.randomUUID()}`,
      userId: params.actor.userId,
      action: 'DAILY_OPS_RESET_BACKUP_CREATED',
      entityType: 'DAILY_OPS_RESET_BACKUP',
      entityId: backupId,
      oldValueJson: JSON.stringify({
        outletId: outlet.id,
        roCode: outlet.roCode,
        fromBusinessDate: params.fromBusinessDate,
        toBusinessDate: params.toBusinessDate,
        totalRecords,
        sha256Checksum,
      }),
      newValueJson: serializedBackup,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      createdAt: nowIso,
    });

    const verification = await this.verifyBackupIntegrity(db, r2Bucket, backupId);
    if (!verification.verified) {
      throw new Error(
        `BACKUP_INTEGRITY_FAILED:${verification.errorMessage || 'Backup integrity verification failed.'}`
      );
    }

    return {
      backupId,
      outlet: backupPayload.outlet,
      dateRange: backupPayload.dateRange,
      reason: backupPayload.reason,
      createdAt: backupPayload.createdAt,
      createdBy: backupPayload.createdBy,
      inventory: backupPayload.inventory,
      totalRecords: backupPayload.inventory.totalRecords,
      sha256Checksum: backupPayload.sha256Checksum,
      r2ObjectKey: backupPayload.r2ObjectKey,
      verified: verification.verified,
      verification,
    };
  }

  /**
   * Loads a stored backup payload by backupId from audit_logs (or R2 fallback).
   */
  static async getBackupById(
    db: AppDatabase,
    r2Bucket: R2Bucket | undefined,
    backupId: string
  ): Promise<DailyOperationsResetBackupPayload | null> {
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, 'DAILY_OPS_RESET_BACKUP'),
          eq(schema.auditLogs.entityId, backupId),
          eq(schema.auditLogs.action, 'DAILY_OPS_RESET_BACKUP_CREATED')
        )
      )
      .orderBy(desc(schema.auditLogs.createdAt));

    if (logs.length > 0 && logs[0].newValueJson) {
      return JSON.parse(logs[0].newValueJson) as DailyOperationsResetBackupPayload;
    }

    return null;
  }

  /**
   * Lists metadata for all Daily Operations Reset Backups (optionally filtered by outletId).
   */
  static async listBackups(db: AppDatabase, outletId?: string) {
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, 'DAILY_OPS_RESET_BACKUP'),
          eq(schema.auditLogs.action, 'DAILY_OPS_RESET_BACKUP_CREATED')
        )
      )
      .orderBy(desc(schema.auditLogs.createdAt));

    const results = [];
    for (const log of logs) {
      if (!log.newValueJson) continue;
      try {
        const parsed = JSON.parse(log.newValueJson) as DailyOperationsResetBackupPayload;
        if (outletId && parsed.outlet.id !== outletId && parsed.outlet.roCode !== outletId) {
          continue;
        }
        results.push({
          backupId: parsed.backupId,
          outlet: parsed.outlet,
          dateRange: parsed.dateRange,
          reason: parsed.reason,
          createdAt: parsed.createdAt,
          createdBy: parsed.createdBy,
          totalRecords: parsed.inventory.totalRecords,
          shiftsCount: parsed.inventory.byTable.operational_shifts?.count || 0,
          sha256Checksum: parsed.sha256Checksum,
          r2ObjectKey: parsed.r2ObjectKey,
        });
      } catch {
        // ignore
      }
    }
    return results;
  }

  /**
   * Verifies backup integrity: recomputes SHA-256 over canonical tables + inventory,
   * validates per-table row counts and record IDs, and checks R2 object parity if stored in R2.
   */
  static async verifyBackupIntegrity(
    db: AppDatabase,
    r2Bucket: R2Bucket | undefined,
    backupId: string
  ): Promise<{
    verified: boolean;
    backupId: string;
    sha256Checksum: string | null;
    computedSha256Checksum: string | null;
    totalRecords: number;
    r2Verified: boolean;
    checksumMatches?: boolean;
    inventoryMatches?: boolean;
    r2ObjectPresent?: boolean;
    verifiedAt: string;
    errorMessage?: string;
  }> {
    const verifiedAt = new Date().toISOString();
    const backup = await this.getBackupById(db, r2Bucket, backupId);
    if (!backup) {
      return {
        verified: false,
        backupId,
        sha256Checksum: null,
        computedSha256Checksum: null,
        totalRecords: 0,
        r2Verified: false,
        verifiedAt,
        errorMessage: `Backup ${backupId} not found.`,
      };
    }

    const computedSha256Checksum = await computeSha256Hex(
      canonicalizeBackupDataForHash(backup.inventory, backup.tables)
    );

    if (computedSha256Checksum !== backup.sha256Checksum) {
      return {
        verified: false,
        backupId,
        sha256Checksum: backup.sha256Checksum,
        computedSha256Checksum,
        totalRecords: backup.inventory.totalRecords,
        r2Verified: false,
        verifiedAt,
        errorMessage: 'Backup SHA-256 checksum mismatch detected.',
      };
    }

    let countedTotal = 0;
    for (const [tableName, rows] of Object.entries(backup.tables)) {
      const invEntry = backup.inventory.byTable[tableName];
      if (!invEntry) {
        return {
          verified: false,
          backupId,
          sha256Checksum: backup.sha256Checksum,
          computedSha256Checksum,
          totalRecords: backup.inventory.totalRecords,
          r2Verified: false,
          verifiedAt,
          errorMessage: `Missing inventory entry for table ${tableName}.`,
        };
      }
      if (!Array.isArray(rows) || rows.length !== invEntry.count) {
        return {
          verified: false,
          backupId,
          sha256Checksum: backup.sha256Checksum,
          computedSha256Checksum,
          totalRecords: backup.inventory.totalRecords,
          r2Verified: false,
          verifiedAt,
          errorMessage: `Row count mismatch in backup table ${tableName}.`,
        };
      }
      const rowIds = rows.map((r: any) => String(r.id));
      if (JSON.stringify(rowIds) !== JSON.stringify(invEntry.recordIds)) {
        return {
          verified: false,
          backupId,
          sha256Checksum: backup.sha256Checksum,
          computedSha256Checksum,
          totalRecords: backup.inventory.totalRecords,
          r2Verified: false,
          verifiedAt,
          errorMessage: `Record ID inventory mismatch in backup table ${tableName}.`,
        };
      }
      countedTotal += rows.length;
    }

    if (countedTotal !== backup.inventory.totalRecords) {
      return {
        verified: false,
        backupId,
        sha256Checksum: backup.sha256Checksum,
        computedSha256Checksum,
        totalRecords: backup.inventory.totalRecords,
        r2Verified: false,
        verifiedAt,
        errorMessage: 'Total record count mismatch in backup inventory.',
      };
    }

    let r2Verified = true;
    let r2ObjectPresent = false;
    if (r2Bucket && backup.r2ObjectKey) {
      const obj = await r2Bucket.get(backup.r2ObjectKey);
      if (obj) {
        r2ObjectPresent = true;
        const buf = await obj.arrayBuffer();
        const r2Text = new TextDecoder().decode(buf);
        try {
          const r2Parsed = JSON.parse(r2Text) as DailyOperationsResetBackupPayload;
          const r2Hash = await computeSha256Hex(
            canonicalizeBackupDataForHash(r2Parsed.inventory, r2Parsed.tables)
          );
          if (r2Hash !== backup.sha256Checksum) {
            return {
              verified: false,
              backupId,
              sha256Checksum: backup.sha256Checksum,
              computedSha256Checksum: r2Hash,
              totalRecords: backup.inventory.totalRecords,
              r2Verified: false,
              checksumMatches: false,
              inventoryMatches: true,
              r2ObjectPresent: true,
              verifiedAt,
              errorMessage: 'R2 backup object checksum mismatch.',
            };
          }
        } catch {
          return {
            verified: false,
            backupId,
            sha256Checksum: backup.sha256Checksum,
            computedSha256Checksum: null,
            totalRecords: backup.inventory.totalRecords,
            r2Verified: false,
            checksumMatches: false,
            inventoryMatches: false,
            r2ObjectPresent: true,
            verifiedAt,
            errorMessage: 'R2 backup object payload is corrupted or unreadable.',
          };
        }
      }
    }

    return {
      verified: true,
      backupId,
      sha256Checksum: backup.sha256Checksum,
      computedSha256Checksum,
      totalRecords: backup.inventory.totalRecords,
      r2Verified,
      checksumMatches: true,
      inventoryMatches: true,
      r2ObjectPresent,
      verifiedAt,
    };
  }

  /**
   * Records separate administrator approval before executing a reset.
   * Validates backup integrity, zero unreviewed blockers, scope parity, and irreversible warning confirmation.
   */
  static async approveResetRequest(
    db: AppDatabase,
    r2Bucket: R2Bucket | undefined,
    params: {
      backupId: string;
      outletId?: string;
      roCode?: string;
      fromBusinessDate: string;
      toBusinessDate: string;
      approvalReason: string;
      confirmIrreversibleReset: boolean;
      confirmClosedShiftReset: boolean;
      confirmationPhrase: string;
      actor: { userId: string; name: string; email: string };
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ): Promise<DailyOperationsResetApprovalRecord> {
    if (!params.confirmIrreversibleReset) {
      throw new Error(
        'VALIDATION_ERROR:You must explicitly confirm the irreversible-operation warning (confirmIrreversibleReset: true).'
      );
    }
    if ((params.confirmationPhrase || '').trim() !== RESET_CONFIRMATION_PHRASE) {
      throw new Error(
        `VALIDATION_ERROR:Confirmation phrase must match "${RESET_CONFIRMATION_PHRASE}" exactly.`
      );
    }
    const cleanReason = (params.approvalReason || '').trim();
    if (cleanReason.length < 10) {
      throw new Error(
        'VALIDATION_ERROR:approvalReason is required (minimum 10 characters).'
      );
    }

    const backup = await this.getBackupById(db, r2Bucket, params.backupId);
    if (!backup) {
      throw new Error('BACKUP_NOT_FOUND:Specified backupId does not exist.');
    }

    const verification = await this.verifyBackupIntegrity(db, r2Bucket, params.backupId);
    if (!verification.verified) {
      throw new Error(
        `BACKUP_INTEGRITY_FAILED:${verification.errorMessage || 'Backup failed integrity verification.'}`
      );
    }

    const outlet = await this.resolveTargetOutlet(db, {
      outletId: params.outletId || backup.outlet.id,
      roCode: params.roCode || backup.outlet.roCode,
    });
    if (!outlet || outlet.id !== backup.outlet.id) {
      throw new Error(
        'SCOPE_MISMATCH:Target outlet does not match the outlet recorded in the backup.'
      );
    }

    if (
      params.fromBusinessDate !== backup.dateRange.fromBusinessDate ||
      params.toBusinessDate !== backup.dateRange.toBusinessDate
    ) {
      throw new Error(
        'SCOPE_MISMATCH:Requested business-date range does not match the backup date range.'
      );
    }

    const livePreview = await this.generateDryRunPreview(db, {
      outletId: outlet.id,
      fromBusinessDate: params.fromBusinessDate,
      toBusinessDate: params.toBusinessDate,
      actor: params.actor,
    });

    if (livePreview.hasUnreviewedBlockers) {
      throw new Error(
        `OFFICIAL_DATA_BLOCKER_UNREVIEWED:Cannot approve reset while ${livePreview.unreviewedBlockersCount} official/protected data blocker(s) remain unreviewed.`
      );
    }

    if (
      (livePreview.summaryCounts.closedShifts > 0 || livePreview.summaryCounts.lockedShifts > 0) &&
      !params.confirmClosedShiftReset
    ) {
      throw new Error(
        'CLOSED_SHIFT_CONFIRMATION_REQUIRED:Scope includes CLOSED or LOCKED shifts. Explicit confirmClosedShiftReset: true is required.'
      );
    }

    // Verify live record inventory matches backup inventory (excluding idempotency_keys which are auxiliary)
    const coreTables = Object.keys(backup.inventory.byTable).filter(
      (t) => t !== 'idempotency_keys'
    );
    for (const table of coreTables) {
      const bkpIds = backup.inventory.byTable[table]?.recordIds || [];
      const liveIds = livePreview.inventoryByTable[table]?.recordIds || [];
      if (JSON.stringify(bkpIds) !== JSON.stringify(liveIds)) {
        throw new Error(
          `SCOPE_DRIFT_DETECTED:Live records in table "${table}" have changed since backup ${params.backupId} was created. Generate a fresh preview and backup before approving.`
        );
      }
    }

    const nowIso = new Date().toISOString();
    const approvalId = `rst-apr-${crypto.randomUUID()}`;

    const approvalRecord: DailyOperationsResetApprovalRecord = {
      approvalId,
      backupId: backup.backupId,
      backupSha256Checksum: backup.sha256Checksum,
      outletId: outlet.id,
      roCode: outlet.roCode,
      outletName: outlet.name,
      fromBusinessDate: params.fromBusinessDate,
      toBusinessDate: params.toBusinessDate,
      totalAffectedRecords: backup.inventory.totalRecords,
      approvalReason: cleanReason,
      confirmIrreversibleReset: true,
      confirmClosedShiftReset: Boolean(params.confirmClosedShiftReset),
      confirmationPhrase: RESET_CONFIRMATION_PHRASE,
      approvedBy: params.actor,
      approvedAt: nowIso,
      status: 'APPROVED',
      executedAt: null,
      executionAuditId: null,
    };

    await db.insert(schema.auditLogs).values({
      id: `aud-apr-${crypto.randomUUID()}`,
      userId: params.actor.userId,
      action: 'DAILY_OPS_RESET_APPROVED',
      entityType: 'DAILY_OPS_RESET_APPROVAL',
      entityId: approvalId,
      oldValueJson: null,
      newValueJson: JSON.stringify(approvalRecord),
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      createdAt: nowIso,
    });

    return approvalRecord;
  }

  /**
   * Retrieves an approval record by approvalId and checks if it has already been executed.
   */
  static async getApprovalById(
    db: AppDatabase,
    approvalId: string
  ): Promise<DailyOperationsResetApprovalRecord | null> {
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, 'DAILY_OPS_RESET_APPROVAL'),
          eq(schema.auditLogs.entityId, approvalId),
          eq(schema.auditLogs.action, 'DAILY_OPS_RESET_APPROVED')
        )
      )
      .orderBy(desc(schema.auditLogs.createdAt));

    if (logs.length === 0 || !logs[0].newValueJson) return null;
    const record = JSON.parse(logs[0].newValueJson) as DailyOperationsResetApprovalRecord;

    const executedLogs = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, 'DAILY_OPS_TEST_DATA_RESET'),
          eq(schema.auditLogs.entityId, approvalId),
          eq(schema.auditLogs.action, 'DAILY_OPS_RESET_EXECUTED')
        )
      );

    if (executedLogs.length > 0) {
      record.status = 'EXECUTED';
      record.executedAt = executedLogs[0].createdAt;
      record.executionAuditId = executedLogs[0].id;
    }

    return record;
  }

  /**
   * Executes an authorised, atomic, foreign-key-safe reset of pre-go-live UAT daily operations data.
   * Rolls back completely on any failure and verifies post-reset invariants.
   */
  static async executeApprovedReset(
    d1: D1Database,
    db: AppDatabase,
    r2Bucket: R2Bucket | undefined,
    params: {
      approvalId: string;
      backupId: string;
      confirmationPhrase: string;
      executionNotes?: string;
      simulateFailureAfterDeletesForTest?: boolean;
      actor: { userId: string; name: string; email: string };
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ) {
    if ((params.confirmationPhrase || '').trim() !== RESET_CONFIRMATION_PHRASE) {
      throw new Error(
        `VALIDATION_ERROR:Confirmation phrase must match "${RESET_CONFIRMATION_PHRASE}" exactly.`
      );
    }

    const approval = await this.getApprovalById(db, params.approvalId);
    if (!approval) {
      throw new Error('APPROVAL_NOT_FOUND:Specified approvalId was not found.');
    }
    if (approval.status === 'EXECUTED') {
      throw new Error(
        `RESET_ALREADY_EXECUTED:Approval ${params.approvalId} was already executed at ${approval.executedAt}. Repeat execution is blocked.`
      );
    }
    if (approval.backupId !== params.backupId) {
      throw new Error(
        'BACKUP_MISMATCH:Provided backupId does not match the approved backupId.'
      );
    }

    const backup = await this.getBackupById(db, r2Bucket, params.backupId);
    if (!backup) {
      throw new Error('BACKUP_NOT_FOUND:Backup referenced by approval does not exist.');
    }

    const verification = await this.verifyBackupIntegrity(db, r2Bucket, params.backupId);
    if (!verification.verified) {
      throw new Error(
        `BACKUP_INTEGRITY_FAILED:${verification.errorMessage || 'Backup integrity check failed.'}`
      );
    }

    const livePreview = await this.generateDryRunPreview(db, {
      outletId: approval.outletId,
      fromBusinessDate: approval.fromBusinessDate,
      toBusinessDate: approval.toBusinessDate,
      actor: params.actor,
    });

    if (livePreview.hasUnreviewedBlockers) {
      throw new Error(
        `OFFICIAL_DATA_BLOCKER_UNREVIEWED:Cannot execute reset while ${livePreview.unreviewedBlockersCount} blocker(s) remain unreviewed.`
      );
    }

    const coreTables = Object.keys(backup.inventory.byTable).filter(
      (t) => t !== 'idempotency_keys'
    );
    for (const table of coreTables) {
      const bkpIds = backup.inventory.byTable[table]?.recordIds || [];
      const liveIds = livePreview.inventoryByTable[table]?.recordIds || [];
      if (JSON.stringify(bkpIds) !== JSON.stringify(liveIds)) {
        throw new Error(
          `SCOPE_DRIFT_DETECTED:Live records in table "${table}" drifted since backup ${params.backupId}. Execution aborted to protect unbacked-up data.`
        );
      }
    }

    const preProtectedSummary = livePreview.protectedDataSummary;

    // Check if an outside-range shift for this same outlet is currently OPEN/CLOSING
    // (needed if we temporarily transition a CLOSED target shift with lube_shift_sales to OPEN)
    const outsideActiveShifts = await db
      .select()
      .from(schema.operationalShifts)
      .where(
        and(
          eq(schema.operationalShifts.outletId, approval.outletId),
          inArray(schema.operationalShifts.status, ['OPEN', 'CLOSING'])
        )
      );

    const targetShiftIdsSet = new Set(
      backup.tables.operational_shifts.map((s: any) => String(s.id))
    );
    const outsideOpenShifts = outsideActiveShifts.filter(
      (s) => !targetShiftIdsSet.has(s.id)
    );

    // Order target shifts so any currently OPEN/CLOSING target shifts are processed first
    const orderedTargetShifts = [...backup.tables.operational_shifts].sort((a: any, b: any) => {
      const aActive = a.status === 'OPEN' || a.status === 'CLOSING' ? 0 : 1;
      const bActive = b.status === 'OPEN' || b.status === 'CLOSING' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return String(a.businessDate).localeCompare(String(b.businessDate));
    });

    const stmts: D1PreparedStatement[] = [];

    // If an outside-range shift is OPEN/CLOSING and any target shift has lube_shift_sales,
    // temporarily park the outside-range shift as 'CLOSED' inside this atomic transaction
    // so idx_operational_shifts_single_active is respected when transitioning target shifts.
    const anyTargetHasLubeSales = backup.tables.lube_shift_sales.length > 0;
    if (anyTargetHasLubeSales && outsideOpenShifts.length > 0) {
      for (const outShift of outsideOpenShifts) {
        stmts.push(
          d1
            .prepare(`UPDATE operational_shifts SET status = 'CLOSED' WHERE id = ? AND outlet_id = ?`)
            .bind(outShift.id, approval.outletId)
        );
      }
    }

    for (const shift of orderedTargetShifts) {
      const shiftId = String(shift.id);
      const outletId = approval.outletId;

      // 1. Delete fuel_receipt_tank_lines referencing fuel_receipts of this shift
      // (must happen BEFORE tank_stock_readings due to pre_decant_reading_id / post_decant_reading_id FK!)
      stmts.push(
        d1
          .prepare(
            `DELETE FROM fuel_receipt_tank_lines WHERE fuel_receipt_id IN (SELECT id FROM fuel_receipts WHERE operational_shift_id = ? AND outlet_id = ?)`
          )
          .bind(shiftId, outletId)
      );

      // 2. Delete fuel_receipts
      stmts.push(
        d1
          .prepare(`DELETE FROM fuel_receipts WHERE operational_shift_id = ? AND outlet_id = ?`)
          .bind(shiftId, outletId)
      );

      // 3. Delete shift_stock_reconciliations
      stmts.push(
        d1
          .prepare(
            `DELETE FROM shift_stock_reconciliations WHERE operational_shift_id = ? AND outlet_id = ?`
          )
          .bind(shiftId, outletId)
      );

      // 4. Delete tank_stock_readings
      stmts.push(
        d1
          .prepare(
            `DELETE FROM tank_stock_readings WHERE operational_shift_id = ? AND outlet_id = ?`
          )
          .bind(shiftId, outletId)
      );

      // 5. Delete nozzle_meter_readings
      stmts.push(
        d1
          .prepare(
            `DELETE FROM nozzle_meter_readings WHERE operational_shift_id = ? AND outlet_id = ?`
          )
          .bind(shiftId, outletId)
      );

      // 6. Delete nozzle_unavailability_records
      stmts.push(
        d1
          .prepare(`DELETE FROM nozzle_unavailability_records WHERE operational_shift_id = ?`)
          .bind(shiftId)
      );

      // 7. Delete shift_financial_reconciliations
      stmts.push(
        d1
          .prepare(
            `DELETE FROM shift_financial_reconciliations WHERE operational_shift_id = ? AND outlet_id = ?`
          )
          .bind(shiftId, outletId)
      );

      // 8. Delete bank_deposits (Vault documents in `documents` table are preserved!)
      stmts.push(
        d1
          .prepare(`DELETE FROM bank_deposits WHERE operational_shift_id = ? AND outlet_id = ?`)
          .bind(shiftId, outletId)
      );

      // 9. Delete cash_handover_logs
      stmts.push(
        d1
          .prepare(
            `DELETE FROM cash_handover_logs WHERE operational_shift_id = ? AND outlet_id = ?`
          )
          .bind(shiftId, outletId)
      );

      // 10. Delete shift_collections
      stmts.push(
        d1
          .prepare(`DELETE FROM shift_collections WHERE operational_shift_id = ? AND outlet_id = ?`)
          .bind(shiftId, outletId)
      );

      // 11. Delete cng_pressure_readings
      stmts.push(
        d1
          .prepare(
            `DELETE FROM cng_pressure_readings WHERE operational_shift_id = ? AND outlet_id = ?`
          )
          .bind(shiftId, outletId)
      );

      // 12. Delete cng_shift_logs
      stmts.push(
        d1
          .prepare(`DELETE FROM cng_shift_logs WHERE operational_shift_id = ? AND outlet_id = ?`)
          .bind(shiftId, outletId)
      );

      // 13. Handle lube_shift_sales (trigger check_lube_stock_on_sale_delete requires shift status = 'OPEN')
      const shiftHasLubeSales = backup.tables.lube_shift_sales.some(
        (l: any) => String(l.operationalShiftId) === shiftId
      );
      if (shiftHasLubeSales) {
        if (shift.status !== 'OPEN') {
          stmts.push(
            d1
              .prepare(
                `UPDATE operational_shifts SET status = 'OPEN' WHERE id = ? AND outlet_id = ?`
              )
              .bind(shiftId, outletId)
          );
        }
        stmts.push(
          d1
            .prepare(
              `DELETE FROM lube_shift_sales WHERE operational_shift_id = ? AND outlet_id = ?`
            )
            .bind(shiftId, outletId)
        );
      }

      // 14. Delete operational_shift_product_prices
      stmts.push(
        d1
          .prepare(
            `DELETE FROM operational_shift_product_prices WHERE operational_shift_id = ? AND outlet_id = ?`
          )
          .bind(shiftId, outletId)
      );

      // 15. Delete operational_shift_tanks
      stmts.push(
        d1
          .prepare(
            `DELETE FROM operational_shift_tanks WHERE operational_shift_id = ? AND outlet_id = ?`
          )
          .bind(shiftId, outletId)
      );

      // 16. Delete operational_shift_nozzles
      stmts.push(
        d1
          .prepare(
            `DELETE FROM operational_shift_nozzles WHERE operational_shift_id = ? AND outlet_id = ?`
          )
          .bind(shiftId, outletId)
      );

      // 17. Delete operational_shifts row itself
      stmts.push(
        d1
          .prepare(`DELETE FROM operational_shifts WHERE id = ? AND outlet_id = ?`)
          .bind(shiftId, outletId)
      );
    }

    // Restore any outside-range shift that was temporarily parked
    if (anyTargetHasLubeSales && outsideOpenShifts.length > 0) {
      for (const outShift of outsideOpenShifts) {
        stmts.push(
          d1
            .prepare(`UPDATE operational_shifts SET status = ? WHERE id = ? AND outlet_id = ?`)
            .bind(outShift.status, outShift.id, approval.outletId)
        );
      }
    }

    // 18. Delete linked idempotency_keys so fresh shift entry does not collide with old keys
    for (const idem of backup.tables.idempotency_keys) {
      stmts.push(d1.prepare(`DELETE FROM idempotency_keys WHERE id = ?`).bind(String(idem.id)));
    }

    // Optional fault injection for atomic rollback verification in tests
    if (params.simulateFailureAfterDeletesForTest) {
      stmts.push(
        d1
          .prepare(
            `INSERT INTO operational_shifts (id, outlet_id, shift_template_id, business_date, started_at, status, opened_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'INVALID_STATUS_FOR_ROLLBACK_TEST', ?, ?, ?)`
          )
          .bind('fail-id', approval.outletId, 'bad-tpl', '2026-11-01', '2026-11-01T00:00:00Z', params.actor.userId, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')
      );
    }

    const nowIso = new Date().toISOString();
    const executionAuditId = `aud-rst-exec-${crypto.randomUUID()}`;
    const permanentAuditPayload = {
      executionAuditId,
      approvalId: approval.approvalId,
      backupId: backup.backupId,
      backupSha256Checksum: backup.sha256Checksum,
      r2ObjectKey: backup.r2ObjectKey,
      outlet: backup.outlet,
      dateRange: backup.dateRange,
      operator: params.actor,
      approver: approval.approvedBy,
      backupCreatedBy: backup.createdBy,
      reason: approval.approvalReason,
      executionNotes: params.executionNotes || null,
      affectedRecordCounts: backup.inventory,
      executedAt: nowIso,
    };

    stmts.push(
      d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value_json, new_value_json, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          executionAuditId,
          params.actor.userId,
          'DAILY_OPS_RESET_EXECUTED',
          'DAILY_OPS_TEST_DATA_RESET',
          approval.approvalId,
          JSON.stringify({
            outletId: approval.outletId,
            roCode: approval.roCode,
            fromBusinessDate: approval.fromBusinessDate,
            toBusinessDate: approval.toBusinessDate,
            backupId: backup.backupId,
            totalRecordsBeforeReset: backup.inventory.totalRecords,
          }),
          JSON.stringify(permanentAuditPayload),
          params.ipAddress ?? null,
          params.userAgent ?? null,
          nowIso
        )
    );

    // Execute all deletions + permanent audit log inside a single atomic D1 batch transaction
    await d1.batch(stmts);

    // Post-reset verification (Requirement 11)
    const postPreview = await this.generateDryRunPreview(db, {
      outletId: approval.outletId,
      fromBusinessDate: approval.fromBusinessDate,
      toBusinessDate: approval.toBusinessDate,
      actor: params.actor,
    });

    const fkCheckRes = await d1.prepare('PRAGMA foreign_key_check;').all();
    const fkViolationsCount = fkCheckRes.results?.length || 0;

    // Verify no orphaned records remain for any of the deleted shift IDs across all 16 child tables
    const deletedShiftIds = backup.tables.operational_shifts.map((s: any) => String(s.id));
    let orphanedRecordsCount = 0;
    if (deletedShiftIds.length > 0) {
      const childChecks = await Promise.all([
        db
          .select()
          .from(schema.operationalShiftNozzles)
          .where(inArray(schema.operationalShiftNozzles.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.operationalShiftTanks)
          .where(inArray(schema.operationalShiftTanks.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.operationalShiftProductPrices)
          .where(inArray(schema.operationalShiftProductPrices.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.tankStockReadings)
          .where(inArray(schema.tankStockReadings.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.nozzleMeterReadings)
          .where(inArray(schema.nozzleMeterReadings.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.nozzleUnavailabilityRecords)
          .where(inArray(schema.nozzleUnavailabilityRecords.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.fuelReceipts)
          .where(inArray(schema.fuelReceipts.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.shiftStockReconciliations)
          .where(inArray(schema.shiftStockReconciliations.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.shiftCollections)
          .where(inArray(schema.shiftCollections.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.cashHandoverLogs)
          .where(inArray(schema.cashHandoverLogs.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.bankDeposits)
          .where(inArray(schema.bankDeposits.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.shiftFinancialReconciliations)
          .where(inArray(schema.shiftFinancialReconciliations.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.cngShiftLogs)
          .where(inArray(schema.cngShiftLogs.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.cngPressureReadings)
          .where(inArray(schema.cngPressureReadings.operationalShiftId, deletedShiftIds)),
        db
          .select()
          .from(schema.lubeShiftSales)
          .where(inArray(schema.lubeShiftSales.operationalShiftId, deletedShiftIds)),
      ]);
      orphanedRecordsCount = childChecks.reduce((acc, rows) => acc + rows.length, 0);
    }

    const postProtected = postPreview.protectedDataSummary;
    const protectedTablesIntact =
      postProtected.retailOutletsTotal === preProtectedSummary.retailOutletsTotal &&
      postProtected.otherOutletsShiftsCount === preProtectedSummary.otherOutletsShiftsCount &&
      postProtected.sameOutletOutsideRangeShiftsCount ===
        preProtectedSummary.sameOutletOutsideRangeShiftsCount &&
      postProtected.outletTanksCount === preProtectedSummary.outletTanksCount &&
      postProtected.outletDispensersCount === preProtectedSummary.outletDispensersCount &&
      postProtected.outletNozzlesCount === preProtectedSummary.outletNozzlesCount &&
      postProtected.globalShiftTemplatesCount === preProtectedSummary.globalShiftTemplatesCount &&
      postProtected.outletShiftTemplatesCount === preProtectedSummary.outletShiftTemplatesCount &&
      postProtected.productsCount === preProtectedSummary.productsCount &&
      postProtected.outletProductsCount === preProtectedSummary.outletProductsCount &&
      postProtected.outletProductPricesCount === preProtectedSummary.outletProductPricesCount &&
      postProtected.globalCalibrationTemplatesCount ===
        preProtectedSummary.globalCalibrationTemplatesCount &&
      postProtected.outletCalibrationChartsCount ===
        preProtectedSummary.outletCalibrationChartsCount &&
      postProtected.outletCalibrationPointsCount ===
        preProtectedSummary.outletCalibrationPointsCount &&
      postProtected.outletHrStaffCount === preProtectedSummary.outletHrStaffCount &&
      postProtected.outletDocumentsCount === preProtectedSummary.outletDocumentsCount &&
      postProtected.outletComplianceRecordsCount ===
        preProtectedSummary.outletComplianceRecordsCount &&
      postProtected.auditLogsCount >= preProtectedSummary.auditLogsCount + 1;

    return {
      executionId: executionAuditId,
      executionAuditId,
      approvalId: approval.approvalId,
      backupId: backup.backupId,
      backupSha256Checksum: backup.sha256Checksum,
      outlet: backup.outlet,
      dateRange: backup.dateRange,
      operator: params.actor,
      approver: approval.approvedBy,
      executedAt: nowIso,
      deletedCounts: backup.inventory,
      totalDeletedRecords: backup.inventory.totalRecords,
      postResetVerification: {
        remainingShiftsInRange: postPreview.summaryCounts.operationalShifts,
        remainingTargetShiftsCount: postPreview.summaryCounts.operationalShifts,
        remainingDependentRecordsInRange: postPreview.summaryCounts.totalAffectedRecords,
        remainingTargetChildRecordsCount: postPreview.summaryCounts.totalAffectedRecords,
        orphanedRecordsCount,
        foreignKeyViolationsCount: fkViolationsCount,
        protectedTablesIntact,
        canOpenFreshShift:
          postPreview.summaryCounts.operationalShifts === 0 &&
          orphanedRecordsCount === 0 &&
          fkViolationsCount === 0 &&
          protectedTablesIntact,
        readyForFreshShiftCreation:
          postPreview.summaryCounts.operationalShifts === 0 &&
          orphanedRecordsCount === 0 &&
          fkViolationsCount === 0 &&
          protectedTablesIntact,
        protectedDataSummary: postProtected,
      },
    };
  }

  /**
   * Authorised Restoration Procedure:
   * Restores all backed-up shifts and dependent operational records atomically from a verified backup.
   */
  static async restoreFromBackup(
    d1: D1Database,
    db: AppDatabase,
    r2Bucket: R2Bucket | undefined,
    params: {
      backupId: string;
      restoreReason: string;
      actor: { userId: string; name: string; email: string };
      ipAddress?: string | null;
      userAgent?: string | null;
    }
  ) {
    const cleanReason = (params.restoreReason || '').trim();
    if (cleanReason.length < 5) {
      throw new Error('VALIDATION_ERROR:restoreReason is required (minimum 5 characters).');
    }

    const backup = await this.getBackupById(db, r2Bucket, params.backupId);
    if (!backup) {
      throw new Error('BACKUP_NOT_FOUND:Specified backupId was not found.');
    }

    const verification = await this.verifyBackupIntegrity(db, r2Bucket, params.backupId);
    if (!verification.verified) {
      throw new Error(
        `BACKUP_INTEGRITY_FAILED:${verification.errorMessage || 'Backup integrity verification failed.'}`
      );
    }

    const shiftIds = backup.tables.operational_shifts.map((s: any) => String(s.id));
    if (shiftIds.length > 0) {
      const existingShifts = await db
        .select()
        .from(schema.operationalShifts)
        .where(inArray(schema.operationalShifts.id, shiftIds));
      if (existingShifts.length > 0) {
        throw new Error(
          `RESTORE_CONFLICT:Cannot restore backup ${params.backupId} because ${existingShifts.length} shift(s) from this backup currently exist in the database.`
        );
      }
    }

    // Check if an active shift currently exists for this outlet
    const activeShiftsOnOutlet = await db
      .select()
      .from(schema.operationalShifts)
      .where(
        and(
          eq(schema.operationalShifts.outletId, backup.outlet.id),
          inArray(schema.operationalShifts.status, ['OPEN', 'CLOSING'])
        )
      );

    const backedUpHasOpenShift = backup.tables.operational_shifts.some(
      (s: any) => s.status === 'OPEN' || s.status === 'CLOSING'
    );
    if (backedUpHasOpenShift && activeShiftsOnOutlet.length > 0) {
      throw new Error(
        `RESTORE_CONFLICT:Outlet ${backup.outlet.roCode} currently has an active OPEN shift (${activeShiftsOnOutlet[0].id}). Close or reset it before restoring a backup containing an OPEN shift.`
      );
    }

    const stmts: D1PreparedStatement[] = [];

    // Temporarily park any active shift on the outlet if we need to restore CLOSED shifts that had lube_shift_sales
    const needTempOpenForLube = backup.tables.lube_shift_sales.length > 0;
    if (needTempOpenForLube && activeShiftsOnOutlet.length > 0) {
      for (const act of activeShiftsOnOutlet) {
        stmts.push(
          d1
            .prepare(`UPDATE operational_shifts SET status = 'CLOSED' WHERE id = ? AND outlet_id = ?`)
            .bind(act.id, backup.outlet.id)
        );
      }
    }

    // Restore each shift and its children in root-to-leaf order
    // Process CLOSED/LOCKED shifts before OPEN/CLOSING shifts so idx_operational_shifts_single_active is never violated!
    const orderedShiftsForRestore = [...backup.tables.operational_shifts].sort(
      (a: any, b: any) => {
        const aIsOpen = a.status === 'OPEN' || a.status === 'CLOSING' ? 1 : 0;
        const bIsOpen = b.status === 'OPEN' || b.status === 'CLOSING' ? 1 : 0;
        if (aIsOpen !== bIsOpen) return aIsOpen - bIsOpen;
        return String(a.businessDate).localeCompare(String(b.businessDate));
      }
    );

    for (const s of orderedShiftsForRestore) {
      const shiftId = String(s.id);
      const shiftLubeSales = backup.tables.lube_shift_sales.filter(
        (l: any) => String(l.operationalShiftId) === shiftId
      );
      const initialInsertStatus = shiftLubeSales.length > 0 ? 'OPEN' : s.status;

      // 1. Insert operational_shifts
      stmts.push(
        d1
          .prepare(
            `INSERT INTO operational_shifts (id, outlet_id, shift_template_id, business_date, started_at, closed_at, status, opened_by_user_id, closed_by_user_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            s.id,
            s.outletId,
            s.shiftTemplateId,
            s.businessDate,
            s.startedAt,
            s.closedAt,
            initialInsertStatus,
            s.openedByUserId,
            s.closedByUserId,
            s.notes,
            s.createdAt,
            s.updatedAt
          )
      );

      // 2. Insert operational_shift_nozzles
      for (const r of backup.tables.operational_shift_nozzles.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO operational_shift_nozzles (id, operational_shift_id, outlet_id, nozzle_id, dispenser_id, dispenser_number, dispenser_name, nozzle_number, product_id, product_code, product_name, product_category, product_unit, tank_id, tank_number, snapshot_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.nozzleId,
              r.dispenserId,
              r.dispenserNumber,
              r.dispenserName,
              r.nozzleNumber,
              r.productId,
              r.productCode,
              r.productName,
              r.productCategory,
              r.productUnit,
              r.tankId,
              r.tankNumber,
              r.snapshotStatus,
              r.createdAt
            )
        );
      }

      // 3. Insert operational_shift_tanks
      for (const r of backup.tables.operational_shift_tanks.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO operational_shift_tanks (id, operational_shift_id, outlet_id, tank_id, tank_number, tank_name, product_id, product_code, product_name, product_unit, capacity_milliunits, safe_fill_capacity_milliunits, calibration_chart_id, calibration_revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.tankId,
              r.tankNumber,
              r.tankName,
              r.productId,
              r.productCode,
              r.productName,
              r.productUnit,
              r.capacityMilliunits,
              r.safeFillCapacityMilliunits,
              r.calibrationChartId ?? null,
              r.calibrationRevision ?? null,
              r.createdAt
            )
        );
      }

      // 4. Insert operational_shift_product_prices
      for (const r of backup.tables.operational_shift_product_prices.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO operational_shift_product_prices (id, operational_shift_id, outlet_id, product_id, product_code, product_name, unit, product_category, price_paise_per_unit, source_price_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.productId,
              r.productCode,
              r.productName,
              r.unit,
              r.productCategory ?? null,
              r.pricePaisePerUnit,
              r.sourcePriceId,
              r.createdAt
            )
        );
      }

      // 5. Insert tank_stock_readings (must precede fuel_receipt_tank_lines!)
      for (const r of backup.tables.tank_stock_readings.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO tank_stock_readings (id, operational_shift_id, outlet_id, tank_id, product_id, reading_type, source, product_dip_mm_milliunits, water_dip_mm_milliunits, gross_observed_volume_milliunits, water_volume_milliunits, net_product_volume_milliunits, calibration_chart_id, calibration_revision, recorded_at, recorded_by_user_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.tankId,
              r.productId,
              r.readingType,
              r.source,
              r.productDipMmMilliunits,
              r.waterDipMmMilliunits,
              r.grossObservedVolumeMilliunits,
              r.waterVolumeMilliunits,
              r.netProductVolumeMilliunits,
              r.calibrationChartId ?? null,
              r.calibrationRevision ?? null,
              r.recordedAt,
              r.recordedByUserId,
              r.notes ?? null,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      // 6. Insert nozzle_meter_readings
      for (const r of backup.tables.nozzle_meter_readings.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO nozzle_meter_readings (id, operational_shift_id, outlet_id, nozzle_id, opening_totalizer_milliunits, closing_totalizer_milliunits, testing_quantity_milliunits, gross_sales_quantity_milliunits, net_sales_quantity_milliunits, opening_variance_milliunits, recorded_by_user_id, has_opening_variance, variance_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.nozzleId,
              r.openingTotalizerMilliunits,
              r.closingTotalizerMilliunits,
              r.testingQuantityMilliunits,
              r.grossSalesQuantityMilliunits,
              r.netSalesQuantityMilliunits,
              r.openingVarianceMilliunits,
              r.recordedByUserId,
              r.hasOpeningVariance ? 1 : 0,
              r.varianceReason ?? null,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      // 7. Insert nozzle_unavailability_records
      for (const r of backup.tables.nozzle_unavailability_records.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO nozzle_unavailability_records (id, operational_shift_id, nozzle_id, reason, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`
            )
            .bind(r.id, r.operationalShiftId, r.nozzleId, r.reason, r.recordedBy, r.createdAt)
        );
      }

      // 8. Insert fuel_receipts & fuel_receipt_tank_lines
      const shiftReceipts = backup.tables.fuel_receipts.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      );
      for (const r of shiftReceipts) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO fuel_receipts (id, outlet_id, operational_shift_id, tt_number, invoice_number, invoice_date, arrival_at, decantation_started_at, decantation_completed_at, seal_verified, seal_exception_reason, status, recorded_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.outletId,
              r.operationalShiftId,
              r.ttNumber,
              r.invoiceNumber,
              r.invoiceDate,
              r.arrivalAt,
              r.decantationStartedAt ?? null,
              r.decantationCompletedAt ?? null,
              r.sealVerified ? 1 : 0,
              r.sealExceptionReason ?? null,
              r.status,
              r.recordedByUserId,
              r.createdAt,
              r.updatedAt
            )
        );

        const rcptLines = backup.tables.fuel_receipt_tank_lines.filter(
          (l: any) => String(l.fuelReceiptId) === String(r.id)
        );
        for (const l of rcptLines) {
          stmts.push(
            d1
              .prepare(
                `INSERT INTO fuel_receipt_tank_lines (id, fuel_receipt_id, tank_id, product_id, invoice_quantity_milliunits, pre_decant_reading_id, post_decant_reading_id, measured_received_quantity_milliunits, receipt_variance_milliunits, density_milliunits, temperature_milliunits, invoice_density_milliunits, density_variance_milliunits, quality_status, applied_tolerance_setting_id, applied_density_tolerance_milliunits, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                l.id,
                l.fuelReceiptId,
                l.tankId,
                l.productId,
                l.invoiceQuantityMilliunits,
                l.preDecantReadingId ?? null,
                l.postDecantReadingId ?? null,
                l.measuredReceivedQuantityMilliunits ?? null,
                l.receiptVarianceMilliunits ?? null,
                l.densityMilliunits ?? null,
                l.temperatureMilliunits ?? null,
                l.invoiceDensityMilliunits ?? null,
                l.densityVarianceMilliunits ?? null,
                l.qualityStatus,
                l.appliedToleranceSettingId ?? null,
                l.appliedDensityToleranceMilliunits ?? null,
                l.createdAt,
                l.updatedAt
              )
          );
        }
      }

      // 9. Insert shift_stock_reconciliations
      for (const r of backup.tables.shift_stock_reconciliations.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO shift_stock_reconciliations (id, operational_shift_id, outlet_id, tank_id, product_id, opening_stock_milliunits, receipt_quantity_milliunits, sales_quantity_milliunits, theoretical_closing_stock_milliunits, physical_closing_stock_milliunits, variance_milliunits, variance_status, calculated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.tankId,
              r.productId,
              r.openingStockMilliunits,
              r.receiptQuantityMilliunits,
              r.salesQuantityMilliunits,
              r.theoreticalClosingStockMilliunits,
              r.physicalClosingStockMilliunits,
              r.varianceMilliunits,
              r.varianceStatus,
              r.calculatedAt,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      // 10. Insert shift_collections
      for (const r of backup.tables.shift_collections.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO shift_collections (id, operational_shift_id, outlet_id, collection_type, amount_paise, provider, reference_number, credit_party_id, credit_party_code_snapshot, credit_party_name_snapshot, collected_at, recorded_by_user_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.collectionType,
              r.amountPaise,
              r.provider ?? null,
              r.referenceNumber ?? null,
              r.creditPartyId ?? null,
              r.creditPartyCodeSnapshot ?? null,
              r.creditPartyNameSnapshot ?? null,
              r.collectedAt,
              r.recordedByUserId,
              r.notes ?? null,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      // 11. Insert cash_handover_logs
      for (const r of backup.tables.cash_handover_logs.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO cash_handover_logs (id, operational_shift_id, outlet_id, amount_paise, handed_over_by_user_id, received_by_user_id, handed_over_at, received_at, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.amountPaise,
              r.handedOverByUserId,
              r.receivedByUserId ?? null,
              r.handedOverAt,
              r.receivedAt ?? null,
              r.status,
              r.notes ?? null,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      // 12. Insert bank_deposits
      for (const r of backup.tables.bank_deposits.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO bank_deposits (id, outlet_id, operational_shift_id, deposit_channel, amount_paise, deposit_date, reference_number, document_id, status, recorded_by_user_id, verified_by_user_id, verified_at, rejection_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.outletId,
              r.operationalShiftId,
              r.depositChannel,
              r.amountPaise,
              r.depositDate,
              r.referenceNumber ?? null,
              r.documentId ?? null,
              r.status,
              r.recordedByUserId,
              r.verifiedByUserId ?? null,
              r.verifiedAt ?? null,
              r.rejectionReason ?? null,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      // 13. Insert shift_financial_reconciliations
      for (const r of backup.tables.shift_financial_reconciliations.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO shift_financial_reconciliations (id, operational_shift_id, outlet_id, fuel_sales_revenue_paise, cng_sales_revenue_paise, lube_sales_revenue_paise, authoritative_sales_revenue_paise, cash_collection_paise, pos_collection_paise, upi_collection_paise, fleet_card_collection_paise, credit_sales_paise, direct_bank_drop_paise, total_collections_paise, sales_collection_variance_paise, variance_status, variance_reason, calculated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.fuelSalesRevenuePaise,
              r.cngSalesRevenuePaise ?? null,
              r.lubeSalesRevenuePaise ?? null,
              r.authoritativeSalesRevenuePaise,
              r.cashCollectionPaise,
              r.posCollectionPaise,
              r.upiCollectionPaise,
              r.fleetCardCollectionPaise,
              r.creditSalesPaise,
              r.directBankDropPaise,
              r.totalCollectionsPaise,
              r.salesCollectionVariancePaise,
              r.varianceStatus,
              r.varianceReason ?? null,
              r.calculatedAt,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      // 14. Insert cng_shift_logs & cng_pressure_readings
      for (const r of backup.tables.cng_shift_logs.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO cng_shift_logs (id, operational_shift_id, outlet_id, mfm_opening_kg_milliunits, mfm_closing_kg_milliunits, net_sales_kg_milliunits, grid_intake_kg_milliunits, grid_sales_variance_kg_milliunits, recorded_by_user_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.mfmOpeningKgMilliunits,
              r.mfmClosingKgMilliunits,
              r.netSalesKgMilliunits,
              r.gridIntakeKgMilliunits ?? null,
              r.gridSalesVarianceKgMilliunits ?? null,
              r.recordedByUserId,
              r.notes ?? null,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      for (const r of backup.tables.cng_pressure_readings.filter(
        (x: any) => String(x.operationalShiftId) === shiftId
      )) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO cng_pressure_readings (id, operational_shift_id, outlet_id, recorded_at, pressure_unit, suction_pressure_milliunits, discharge_pressure_milliunits, cascade_pressure_milliunits, recorded_by_user_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.recordedAt,
              r.pressureUnit,
              r.suctionPressureMilliunits ?? null,
              r.dischargePressureMilliunits ?? null,
              r.cascadePressureMilliunits ?? null,
              r.recordedByUserId,
              r.notes ?? null,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      // 15. Insert lube_shift_sales (shift is currently OPEN so check_lube_stock_on_sale_insert passes)
      for (const r of shiftLubeSales) {
        stmts.push(
          d1
            .prepare(
              `INSERT INTO lube_shift_sales (id, operational_shift_id, outlet_id, lube_sku_id, sku_code, sku_name, category, stock_unit, quantity_subunits, unit_price_paise, revenue_paise, sold_at, recorded_by_user_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              r.id,
              r.operationalShiftId,
              r.outletId,
              r.lubeSkuId,
              r.skuCode,
              r.skuName,
              r.category,
              r.stockUnit,
              r.quantitySubunits,
              r.unitPricePaise,
              r.revenuePaise,
              r.soldAt,
              r.recordedByUserId,
              r.notes ?? null,
              r.createdAt,
              r.updatedAt
            )
        );
      }

      // Restore shift status to its backed-up status if we temporarily inserted as OPEN
      if (initialInsertStatus !== s.status) {
        stmts.push(
          d1
            .prepare(
              `UPDATE operational_shifts SET status = ?, closed_at = ?, closed_by_user_id = ? WHERE id = ? AND outlet_id = ?`
            )
            .bind(s.status, s.closedAt ?? null, s.closedByUserId ?? null, s.id, s.outletId)
        );
      }
    }

    // Restore any active shift on the outlet that was temporarily parked
    if (needTempOpenForLube && activeShiftsOnOutlet.length > 0) {
      for (const act of activeShiftsOnOutlet) {
        stmts.push(
          d1
            .prepare(`UPDATE operational_shifts SET status = ? WHERE id = ? AND outlet_id = ?`)
            .bind(act.status, act.id, backup.outlet.id)
        );
      }
    }

    // Restore backed-up idempotency_keys
    for (const idem of backup.tables.idempotency_keys) {
      stmts.push(
        d1
          .prepare(
            `INSERT OR IGNORE INTO idempotency_keys (id, idempotency_key, actor_id, route, request_fingerprint, response_status, entity_id, response_body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            idem.id,
            idem.idempotencyKey,
            idem.actorId,
            idem.route,
            idem.requestFingerprint,
            idem.responseStatus,
            idem.entityId ?? null,
            idem.responseBody,
            idem.createdAt
          )
      );
    }

    const nowIso = new Date().toISOString();
    const restoreAuditId = `aud-rst-rest-${crypto.randomUUID()}`;
    stmts.push(
      d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value_json, new_value_json, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          restoreAuditId,
          params.actor.userId,
          'DAILY_OPS_RESET_RESTORED',
          'DAILY_OPS_RESET_BACKUP',
          backup.backupId,
          null,
          JSON.stringify({
            restoreAuditId,
            backupId: backup.backupId,
            outlet: backup.outlet,
            dateRange: backup.dateRange,
            restoreReason: cleanReason,
            restoredBy: params.actor,
            restoredAt: nowIso,
            restoredCounts: backup.inventory,
          }),
          params.ipAddress ?? null,
          params.userAgent ?? null,
          nowIso
        )
    );

    await d1.batch(stmts);

    const fkCheckRes = await d1.prepare('PRAGMA foreign_key_check;').all();
    const fkViolationsCount = fkCheckRes.results?.length || 0;

    return {
      restoreAuditId,
      backupId: backup.backupId,
      outlet: backup.outlet,
      dateRange: backup.dateRange,
      restoredBy: params.actor,
      restoredAt: nowIso,
      restoredCounts: backup.inventory,
      totalRestoredRecords: backup.inventory.totalRecords,
      foreignKeyViolationsCount: fkViolationsCount,
    };
  }

  /**
   * Lists the permanent audit history of all Daily Operations Test Data Reset actions.
   */
  static async listResetAuditHistory(db: AppDatabase, outletId?: string) {
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(
        inArray(schema.auditLogs.entityType, [
          'DAILY_OPS_TEST_DATA_RESET',
          'DAILY_OPS_RESET_BACKUP',
          'DAILY_OPS_RESET_APPROVAL',
          'DAILY_OPS_RESET_BLOCKER_REVIEW',
        ])
      )
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(100);

    return logs
      .map((l) => {
        let parsedNew: any = null;
        try {
          parsedNew = l.newValueJson ? JSON.parse(l.newValueJson) : null;
        } catch {
          parsedNew = null;
        }
        return {
          id: l.id,
          userId: l.userId,
          action: l.action,
          entityType: l.entityType,
          entityId: l.entityId,
          createdAt: l.createdAt,
          summary: parsedNew
            ? {
                outlet: parsedNew.outlet || {
                  id: parsedNew.outletId,
                  roCode: parsedNew.roCode,
                  name: parsedNew.outletName,
                },
                dateRange: parsedNew.dateRange || {
                  fromBusinessDate: parsedNew.fromBusinessDate,
                  toBusinessDate: parsedNew.toBusinessDate,
                },
                backupId: parsedNew.backupId,
                approvalId: parsedNew.approvalId,
                reason:
                  parsedNew.reason ||
                  parsedNew.approvalReason ||
                  parsedNew.reviewNotes ||
                  parsedNew.restoreReason,
                operator: parsedNew.operator || parsedNew.createdBy || parsedNew.restoredBy,
                approver: parsedNew.approver || parsedNew.approvedBy,
                totalRecords:
                  parsedNew.affectedRecordCounts?.totalRecords ??
                  parsedNew.inventory?.totalRecords ??
                  parsedNew.totalAffectedRecords ??
                  parsedNew.restoredCounts?.totalRecords ??
                  null,
              }
            : null,
        };
      })
      .filter((item) => {
        if (!outletId) return true;
        const oId = item.summary?.outlet?.id;
        const roCode = item.summary?.outlet?.roCode;
        return oId === outletId || roCode === outletId || item.entityId === outletId;
      });
  }
}
