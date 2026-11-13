import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, or, desc, asc, sql, ne, inArray, lte, isNull } from 'drizzle-orm';
import {
  Product,
  OutletProduct,
  Tank,
  Dispenser,
  Nozzle,
  NozzleIntegrityStatus,
  NozzleDiagnosticItem,
  NozzleSlotDiagnostic,
  OutletNozzleDiagnosticsReport,
  ShiftTemplate,
  GlobalShiftTemplate,
  OperationalShift,
  OperationalShiftNozzleSnapshot,
  OperationalShiftTankSnapshot,
  NozzleMeterReading,
  NozzleUnavailabilityRecord,
  ShiftSalesSummary,
  ShiftEntryGridItem,
  UnitQuantitySummary,
  ProductUnit,
  TankCalibrationChart,
  TankCalibrationChartStatus,
  TankCalibrationPoint,
  TankStockReading,
  TankReadingType,
  TankReadingSource,
  FuelReceipt,
  FuelReceiptTankLine,
  FuelReceiptStatus,
  QualityStatus,
  QualityToleranceSetting,
  QualityScopeType,
  ShiftStockReconciliation,
  ShiftStockSummary,
  VarianceStatus,
  CalibrationEngineeringVerificationRecord,
} from '../../shared/types';
import { parseMilliunits, formatMilliunits, MILLIUNIT_SCALE } from '../../shared/precision';
import { mapDatabaseUniqueError } from '../services/duplicateErrorMapper';

export const SNAPSHOT_INSERT_CHUNK_SIZE = 5;

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export class PumpRepository {
  constructor(private db: AppDatabase) {}

  // ==========================================
  // 1. PRODUCT MASTER
  // ==========================================

  async listProducts(): Promise<Product[]> {
    const list = await this.db.select().from(schema.products).orderBy(schema.products.code);
    return list as Product[];
  }

  async findProductById(id: string): Promise<Product | null> {
    const [prod] = await this.db.select().from(schema.products).where(eq(schema.products.id, id));
    return (prod as Product) || null;
  }

  async findProductByCode(code: string): Promise<Product | null> {
    const [prod] = await this.db.select().from(schema.products).where(eq(schema.products.code, code.toUpperCase()));
    return (prod as Product) || null;
  }

  async createProduct(data: {
    id: string;
    code: string;
    name: string;
    category: string;
    unit: 'LITRE' | 'KG';
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
    updatedAt: string;
  }): Promise<Product> {
    await this.db.insert(schema.products).values({
      ...data,
      code: data.code.toUpperCase(),
    });
    return (await this.findProductById(data.id))!;
  }

  async updateProduct(id: string, data: Partial<{
    name: string;
    category: string;
    unit: 'LITRE' | 'KG';
    status: 'ACTIVE' | 'INACTIVE';
    updatedAt: string;
  }>): Promise<Product | null> {
    await this.db.update(schema.products).set(data).where(eq(schema.products.id, id));
    return this.findProductById(id);
  }

  // ==========================================
  // 2. OUTLET PRODUCTS MAPPING
  // ==========================================

  async listOutletProducts(outletId: string): Promise<OutletProduct[]> {
    const rows = await this.db
      .select({
        mapping: schema.outletProducts,
        product: schema.products,
      })
      .from(schema.outletProducts)
      .innerJoin(schema.products, eq(schema.outletProducts.productId, schema.products.id))
      .where(eq(schema.outletProducts.outletId, outletId));

    return rows.map(r => ({
      id: r.mapping.id,
      outletId: r.mapping.outletId,
      productId: r.mapping.productId,
      status: r.mapping.status as 'ACTIVE' | 'INACTIVE',
      createdAt: r.mapping.createdAt,
      createdBy: r.mapping.createdBy,
      product: r.product as Product,
    }));
  }

  async findOutletProduct(outletId: string, productId: string): Promise<OutletProduct | null> {
    const [row] = await this.db
      .select({
        mapping: schema.outletProducts,
        product: schema.products,
      })
      .from(schema.outletProducts)
      .innerJoin(schema.products, eq(schema.outletProducts.productId, schema.products.id))
      .where(and(eq(schema.outletProducts.outletId, outletId), eq(schema.outletProducts.productId, productId)));

    if (!row) return null;
    return {
      id: row.mapping.id,
      outletId: row.mapping.outletId,
      productId: row.mapping.productId,
      status: row.mapping.status as 'ACTIVE' | 'INACTIVE',
      createdAt: row.mapping.createdAt,
      createdBy: row.mapping.createdBy,
      product: row.product as Product,
    };
  }

  async mapProductToOutlet(data: {
    id: string;
    outletId: string;
    productId: string;
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
    createdBy: string;
  }): Promise<OutletProduct> {
    await this.db.insert(schema.outletProducts).values(data);
    return (await this.findOutletProduct(data.outletId, data.productId))!;
  }

  async updateOutletProductStatus(outletId: string, productId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<OutletProduct | null> {
    await this.db
      .update(schema.outletProducts)
      .set({ status })
      .where(and(eq(schema.outletProducts.outletId, outletId), eq(schema.outletProducts.productId, productId)));
    return this.findOutletProduct(outletId, productId);
  }

  async findActiveTanksAndNozzlesForOutletProduct(outletId: string, productId: string): Promise<{ tanksCount: number; nozzlesCount: number }> {
    const [tanksResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tanks)
      .where(and(eq(schema.tanks.outletId, outletId), eq(schema.tanks.productId, productId), eq(schema.tanks.status, 'ACTIVE')));

    const [nozzlesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.nozzles)
      .where(and(eq(schema.nozzles.outletId, outletId), eq(schema.nozzles.productId, productId), eq(schema.nozzles.status, 'ACTIVE')));

    return {
      tanksCount: Number(tanksResult?.count || 0),
      nozzlesCount: Number(nozzlesResult?.count || 0),
    };
  }

  // ==========================================
  // 3. UNDERGROUND TANKS
  // ==========================================

  async listTanksByOutlet(outletId: string): Promise<Tank[]> {
    const rows = await this.db
      .select({
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.tanks)
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .where(eq(schema.tanks.outletId, outletId))
      .orderBy(schema.tanks.tankNumber);

    return rows.map(r => ({
      ...r.tank,
      status: r.tank.status as any,
      productName: r.product.name,
      productCode: r.product.code,
    }));
  }

  async findTankById(id: string): Promise<Tank | null> {
    const [row] = await this.db
      .select({
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.tanks)
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .where(eq(schema.tanks.id, id));

    if (!row) return null;
    return {
      ...row.tank,
      status: row.tank.status as any,
      productName: row.product.name,
      productCode: row.product.code,
    };
  }

  async findTankByOutletAndNumber(outletId: string, tankNumber: number): Promise<Tank | null> {
    const [row] = await this.db
      .select({
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.tanks)
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .where(and(eq(schema.tanks.outletId, outletId), eq(schema.tanks.tankNumber, tankNumber)));

    if (!row) return null;
    return {
      ...row.tank,
      status: row.tank.status as any,
      productName: row.product.name,
      productCode: row.product.code,
    };
  }

  async findNozzlesReferencingTank(tankId: string): Promise<Nozzle[]> {
    const rows = await this.db.select().from(schema.nozzles).where(eq(schema.nozzles.tankId, tankId));
    return rows as Nozzle[];
  }

  async findActiveNozzlesReferencingTank(tankId: string): Promise<Nozzle[]> {
    const rows = await this.db
      .select()
      .from(schema.nozzles)
      .where(and(eq(schema.nozzles.tankId, tankId), eq(schema.nozzles.status, 'ACTIVE')));
    return rows as Nozzle[];
  }

  async checkTankProductChangeEligibility(tankId: string): Promise<{
    canChange: boolean;
    blockedReason?: string;
    details: {
      nozzlesCount: number;
      stockReadingsCount: number;
      receiptLinesCount: number;
      shiftSnapshotsCount: number;
    };
  }> {
    const [nozzleRes] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.nozzles)
      .where(eq(schema.nozzles.tankId, tankId));
    const nozzlesCount = Number(nozzleRes?.count || 0);

    const [readingRes] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.tankStockReadings)
      .where(eq(schema.tankStockReadings.tankId, tankId));
    const stockReadingsCount = Number(readingRes?.count || 0);

    const [receiptRes] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.fuelReceiptTankLines)
      .where(eq(schema.fuelReceiptTankLines.tankId, tankId));
    const receiptLinesCount = Number(receiptRes?.count || 0);

    const [snapshotRes] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.operationalShiftTanks)
      .where(eq(schema.operationalShiftTanks.tankId, tankId));
    const shiftSnapshotsCount = Number(snapshotRes?.count || 0);

    const details = { nozzlesCount, stockReadingsCount, receiptLinesCount, shiftSnapshotsCount };

    if (nozzlesCount > 0) {
      return {
        canChange: false,
        blockedReason: `Cannot change tank product because ${nozzlesCount} nozzle(s) currently reference this tank.`,
        details,
      };
    }

    if (stockReadingsCount > 0) {
      return {
        canChange: false,
        blockedReason: `Cannot change tank product because ${stockReadingsCount} historical stock reading(s) exist for this tank.`,
        details,
      };
    }

    if (receiptLinesCount > 0) {
      return {
        canChange: false,
        blockedReason: `Cannot change tank product because ${receiptLinesCount} fuel receipt line(s) exist for this tank.`,
        details,
      };
    }

    if (shiftSnapshotsCount > 0) {
      return {
        canChange: false,
        blockedReason: `Cannot change tank product because ${shiftSnapshotsCount} operational shift snapshot(s) exist for this tank.`,
        details,
      };
    }

    return {
      canChange: true,
      details,
    };
  }

  async createTank(data: {
    id: string;
    outletId: string;
    tankNumber: number;
    name: string;
    productId: string;
    capacityLitres: number;
    safeFillCapacityLitres: number;
    minimumOperatingLevelLitres: number;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    commissionedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }): Promise<Tank> {
    await this.db.insert(schema.tanks).values(data);
    return (await this.findTankById(data.id))!;
  }

  async updateTank(id: string, data: Partial<{
    name: string;
    productId: string;
    capacityLitres: number;
    safeFillCapacityLitres: number;
    minimumOperatingLevelLitres: number;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    commissionedAt: string | null;
    updatedAt: string;
  }>): Promise<Tank | null> {
    await this.db.update(schema.tanks).set(data).where(eq(schema.tanks.id, id));
    return this.findTankById(id);
  }

  // ==========================================
  // 4. DISPENSERS
  // ==========================================

  async listDispensersByOutlet(outletId: string): Promise<Dispenser[]> {
    const dispList = await this.db
      .select()
      .from(schema.dispensers)
      .where(eq(schema.dispensers.outletId, outletId))
      .orderBy(schema.dispensers.dispenserNumber);

    const validNozzles = await this.listNozzlesByOutlet(outletId);
    const validCountByDisp = new Map<string, number>();
    for (const n of validNozzles) {
      validCountByDisp.set(n.dispenserId, (validCountByDisp.get(n.dispenserId) || 0) + 1);
    }

    return dispList.map((d) => ({
      ...d,
      status: d.status as any,
      nozzlesCount: validCountByDisp.get(d.id) || 0,
    }));
  }

  async findDispenserById(id: string): Promise<Dispenser | null> {
    const [disp] = await this.db.select().from(schema.dispensers).where(eq(schema.dispensers.id, id));
    if (!disp) return null;
    return disp as Dispenser;
  }

  async findDispenserByOutletAndNumber(outletId: string, dispenserNumber: number): Promise<Dispenser | null> {
    const [disp] = await this.db
      .select()
      .from(schema.dispensers)
      .where(and(eq(schema.dispensers.outletId, outletId), eq(schema.dispensers.dispenserNumber, dispenserNumber)));
    return (disp as Dispenser) || null;
  }

  async findDispenserBySerialNumber(serialNumber: string): Promise<Dispenser | null> {
    const [disp] = await this.db
      .select()
      .from(schema.dispensers)
      .where(eq(schema.dispensers.serialNumber, serialNumber));
    return (disp as Dispenser) || null;
  }

  async createDispenser(data: {
    id: string;
    outletId: string;
    dispenserNumber: number;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    nozzleCapacity?: number;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    commissionedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }): Promise<Dispenser> {
    await this.db.insert(schema.dispensers).values(data);
    return (await this.findDispenserById(data.id))!;
  }

  async updateDispenser(id: string, data: Partial<{
    name: string;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    nozzleCapacity: number;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    commissionedAt: string | null;
    updatedAt: string;
  }>): Promise<Dispenser | null> {
    await this.db.update(schema.dispensers).set(data).where(eq(schema.dispensers.id, id));
    return this.findDispenserById(id);
  }

  async findMaxNozzleNumberByDispenser(dispenserId: string): Promise<number> {
    const [result] = await this.db
      .select({ maxNozzle: sql<number>`COALESCE(MAX(nozzle_number), 0)` })
      .from(schema.nozzles)
      .where(eq(schema.nozzles.dispenserId, dispenserId));
    return Number(result?.maxNozzle || 0);
  }

  // ==========================================
  // 5. NOZZLES
  // ==========================================

  private evaluateNozzleRowIntegrity(
    row: {
      nozzle: typeof schema.nozzles.$inferSelect;
      dispenser: typeof schema.dispensers.$inferSelect | null;
      product: typeof schema.products.$inferSelect | null;
      tank: typeof schema.tanks.$inferSelect | null;
    },
    expectedOutletId?: string
  ): NozzleDiagnosticItem {
    const targetOutletId = expectedOutletId || row.nozzle.outletId;
    const brokenRelations: string[] = [];

    if (!row.dispenser) {
      brokenRelations.push('MISSING_DISPENSER');
    } else {
      if (row.dispenser.outletId !== targetOutletId || row.nozzle.outletId !== row.dispenser.outletId) {
        brokenRelations.push('DISPENSER_OUTLET_MISMATCH');
      }
      const cap = row.dispenser.nozzleCapacity || 6;
      if (row.nozzle.nozzleNumber < 1 || row.nozzle.nozzleNumber > cap) {
        brokenRelations.push('NOZZLE_CAPACITY_EXCEEDED');
      }
    }

    if (!row.product) {
      brokenRelations.push('MISSING_PRODUCT');
    }

    if (!row.tank) {
      brokenRelations.push('MISSING_TANK');
    } else {
      if (row.tank.outletId !== targetOutletId || row.nozzle.outletId !== row.tank.outletId) {
        brokenRelations.push('TANK_OUTLET_MISMATCH');
      }
      if (row.tank.productId !== row.nozzle.productId) {
        brokenRelations.push('TANK_PRODUCT_MISMATCH');
      }
    }

    let integrityStatus: NozzleIntegrityStatus = 'VALID';
    if (
      brokenRelations.includes('MISSING_DISPENSER') ||
      brokenRelations.includes('DISPENSER_OUTLET_MISMATCH') ||
      brokenRelations.includes('NOZZLE_CAPACITY_EXCEEDED')
    ) {
      integrityStatus = 'MISSING_DISPENSER';
    } else if (brokenRelations.includes('MISSING_PRODUCT')) {
      integrityStatus = 'MISSING_PRODUCT';
    } else if (
      brokenRelations.includes('MISSING_TANK') ||
      brokenRelations.includes('TANK_OUTLET_MISMATCH') ||
      brokenRelations.includes('TANK_PRODUCT_MISMATCH')
    ) {
      integrityStatus = 'MISSING_TANK';
    }

    return {
      ...row.nozzle,
      status: row.nozzle.status as any,
      dispenserNumber: row.dispenser?.dispenserNumber,
      dispenserName: row.dispenser?.name,
      productName: row.product?.name,
      productCode: row.product?.code,
      tankNumber: row.tank?.tankNumber,
      tankName: row.tank?.name,
      integrityStatus,
      brokenRelations,
    };
  }

  async inspectNozzlesByOutlet(outletId: string): Promise<NozzleDiagnosticItem[]> {
    const rows = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .leftJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .leftJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .leftJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(
        or(
          eq(schema.nozzles.outletId, outletId),
          eq(schema.dispensers.outletId, outletId)
        )
      );

    const items = rows.map(r => this.evaluateNozzleRowIntegrity(r, outletId));
    items.sort((a, b) => {
      const dispA = a.dispenserNumber ?? 999999;
      const dispB = b.dispenserNumber ?? 999999;
      if (dispA !== dispB) return dispA - dispB;
      return a.nozzleNumber - b.nozzleNumber;
    });
    return items;
  }

  async inspectNozzlesByDispenser(dispenserId: string): Promise<NozzleDiagnosticItem[]> {
    const disp = await this.findDispenserById(dispenserId);
    const rows = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .leftJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .leftJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .leftJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(eq(schema.nozzles.dispenserId, dispenserId))
      .orderBy(schema.nozzles.nozzleNumber);

    return rows.map(r => this.evaluateNozzleRowIntegrity(r, disp?.outletId || r.nozzle.outletId));
  }

  async inspectNozzleById(id: string): Promise<NozzleDiagnosticItem | null> {
    const [row] = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .leftJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .leftJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .leftJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(eq(schema.nozzles.id, id));

    if (!row) return null;
    return this.evaluateNozzleRowIntegrity(row, row.dispenser?.outletId || row.nozzle.outletId);
  }

  async findRawNozzleById(id: string): Promise<Nozzle | null> {
    const [n] = await this.db
      .select()
      .from(schema.nozzles)
      .where(eq(schema.nozzles.id, id));
    return (n as Nozzle) || null;
  }

  async inspectNozzleSlot(
    outletId: string,
    dispenserId: string,
    nozzleNumber: number
  ): Promise<NozzleSlotDiagnostic> {
    const [rawRow] = await this.db
      .select()
      .from(schema.nozzles)
      .where(
        and(
          eq(schema.nozzles.dispenserId, dispenserId),
          eq(schema.nozzles.nozzleNumber, nozzleNumber)
        )
      );

    const joinedList = await this.listNozzlesByOutlet(outletId);
    const joinedNozzle =
      joinedList.find(n => n.dispenserId === dispenserId && n.nozzleNumber === nozzleNumber) || null;

    if (!rawRow) {
      return {
        outletId,
        dispenserId,
        nozzleNumber,
        existsInRawTable: false,
        appearsInJoinedList: false,
        rawNozzle: null,
        joinedNozzle: null,
        integrityStatus: 'NOT_FOUND',
        brokenRelations: [],
      };
    }

    const inspected = await this.inspectNozzleById(rawRow.id);
    const brokenRelations = [...(inspected?.brokenRelations || [])];
    if (rawRow.outletId !== outletId && !brokenRelations.includes('DISPENSER_OUTLET_MISMATCH')) {
      brokenRelations.push('DISPENSER_OUTLET_MISMATCH');
    }

    const integrityStatus: NozzleIntegrityStatus =
      joinedNozzle && brokenRelations.length === 0
        ? 'VALID'
        : inspected?.integrityStatus && inspected.integrityStatus !== 'VALID'
          ? inspected.integrityStatus
          : brokenRelations.includes('MISSING_PRODUCT')
            ? 'MISSING_PRODUCT'
            : brokenRelations.includes('MISSING_TANK') ||
                brokenRelations.includes('TANK_OUTLET_MISMATCH') ||
                brokenRelations.includes('TANK_PRODUCT_MISMATCH')
              ? 'MISSING_TANK'
              : 'MISSING_DISPENSER';

    return {
      outletId,
      dispenserId,
      nozzleNumber,
      existsInRawTable: true,
      appearsInJoinedList: Boolean(joinedNozzle),
      rawNozzle: {
        ...rawRow,
        status: rawRow.status as any,
      },
      joinedNozzle,
      integrityStatus,
      brokenRelations,
    };
  }

  async diagnoseOutletNozzles(outletId: string): Promise<OutletNozzleDiagnosticsReport> {
    const items = await this.inspectNozzlesByOutlet(outletId);
    const validNozzles = items.filter(i => i.integrityStatus === 'VALID');
    const orphanNozzles = items.filter(i => i.integrityStatus !== 'VALID');
    const dispensersList = await this.db
      .select()
      .from(schema.dispensers)
      .where(eq(schema.dispensers.outletId, outletId))
      .orderBy(schema.dispensers.dispenserNumber);

    const missingPositions = dispensersList.map(d => {
      const cap = d.nozzleCapacity || 6;
      const validNums = new Set(
        validNozzles.filter(n => n.dispenserId === d.id).map(n => n.nozzleNumber)
      );
      const orphanNums = new Set(
        orphanNozzles.filter(n => n.dispenserId === d.id).map(n => n.nozzleNumber)
      );
      const missingNozzleNumbers: number[] = [];
      for (let num = 1; num <= cap; num++) {
        if (!validNums.has(num)) {
          missingNozzleNumbers.push(num);
        }
      }
      return {
        dispenserId: d.id,
        dispenserNumber: d.dispenserNumber,
        dispenserName: d.name,
        nozzleCapacity: cap,
        missingNozzleNumbers,
        orphanNozzleNumbers: Array.from(orphanNums).sort((a, b) => a - b),
      };
    });

    return {
      outletId,
      rawNozzlesCount: items.length,
      validNozzlesCount: validNozzles.length,
      orphanNozzlesCount: orphanNozzles.length,
      items,
      orphanNozzles,
      missingPositions,
    };
  }

  async listNozzlesByOutlet(
    outletId: string,
    options?: { includeInvalid?: boolean }
  ): Promise<Nozzle[]> {
    if (options?.includeInvalid) {
      return this.inspectNozzlesByOutlet(outletId);
    }

    const rows = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(
        and(
          eq(schema.nozzles.outletId, outletId),
          eq(schema.dispensers.outletId, outletId),
          eq(schema.tanks.outletId, outletId),
          eq(schema.tanks.productId, schema.nozzles.productId)
        )
      )
      .orderBy(schema.dispensers.dispenserNumber, schema.nozzles.nozzleNumber);

    return rows.map(r => ({
      ...r.nozzle,
      status: r.nozzle.status as any,
      dispenserNumber: r.dispenser.dispenserNumber,
      dispenserName: r.dispenser.name,
      productName: r.product.name,
      productCode: r.product.code,
      tankNumber: r.tank.tankNumber,
      tankName: r.tank.name,
      integrityStatus: 'VALID' as const,
      brokenRelations: [],
    }));
  }

  async listNozzlesByDispenser(
    dispenserId: string,
    options?: { includeInvalid?: boolean }
  ): Promise<Nozzle[]> {
    if (options?.includeInvalid) {
      return this.inspectNozzlesByDispenser(dispenserId);
    }

    const rows = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(
        and(
          eq(schema.nozzles.dispenserId, dispenserId),
          eq(schema.nozzles.outletId, schema.dispensers.outletId),
          eq(schema.tanks.outletId, schema.dispensers.outletId),
          eq(schema.tanks.productId, schema.nozzles.productId)
        )
      )
      .orderBy(schema.nozzles.nozzleNumber);

    return rows.map(r => ({
      ...r.nozzle,
      status: r.nozzle.status as any,
      dispenserNumber: r.dispenser.dispenserNumber,
      dispenserName: r.dispenser.name,
      productName: r.product.name,
      productCode: r.product.code,
      tankNumber: r.tank.tankNumber,
      tankName: r.tank.name,
      integrityStatus: 'VALID' as const,
      brokenRelations: [],
    }));
  }

  async findActiveNozzlesByDispenser(dispenserId: string): Promise<Nozzle[]> {
    const rows = await this.db
      .select()
      .from(schema.nozzles)
      .where(and(eq(schema.nozzles.dispenserId, dispenserId), eq(schema.nozzles.status, 'ACTIVE')));
    return rows as Nozzle[];
  }

  async findNozzleById(id: string): Promise<Nozzle | null> {
    const [row] = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(
        and(
          eq(schema.nozzles.id, id),
          eq(schema.nozzles.outletId, schema.dispensers.outletId),
          eq(schema.tanks.outletId, schema.dispensers.outletId),
          eq(schema.tanks.productId, schema.nozzles.productId)
        )
      );

    if (!row) return null;
    return {
      ...row.nozzle,
      status: row.nozzle.status as any,
      dispenserNumber: row.dispenser.dispenserNumber,
      dispenserName: row.dispenser.name,
      productName: row.product.name,
      productCode: row.product.code,
      tankNumber: row.tank.tankNumber,
      tankName: row.tank.name,
      integrityStatus: 'VALID' as const,
      brokenRelations: [],
    };
  }

  async findNozzleByDispenserAndNumber(dispenserId: string, nozzleNumber: number): Promise<Nozzle | null> {
    const [n] = await this.db
      .select()
      .from(schema.nozzles)
      .where(and(eq(schema.nozzles.dispenserId, dispenserId), eq(schema.nozzles.nozzleNumber, nozzleNumber)));
    return (n as Nozzle) || null;
  }

  async createNozzle(data: {
    id: string;
    outletId: string;
    dispenserId: string;
    nozzleNumber: number;
    productId: string;
    tankId: string;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }): Promise<Nozzle> {
    await this.db.insert(schema.nozzles).values(data);
    return (await this.findNozzleById(data.id))!;
  }

  async updateNozzle(id: string, data: Partial<{
    outletId: string;
    dispenserId: string;
    nozzleNumber: number;
    productId: string;
    tankId: string;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    updatedAt: string;
  }>): Promise<Nozzle | null> {
    await this.db.update(schema.nozzles).set(data).where(eq(schema.nozzles.id, id));
    return this.findNozzleById(id);
  }

  async reconcileNozzleSlot(data: {
    outletId: string;
    dispenserId: string;
    nozzleNumber: number;
    productId: string;
    tankId: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    createdBy: string;
    nowIso?: string;
  }): Promise<{
    action: 'REPAIRED' | 'CREATED' | 'UNCHANGED';
    nozzle: Nozzle;
    preservedId: string;
    previousIntegrityStatus: NozzleIntegrityStatus | 'NOT_FOUND';
    repairedRelations: string[];
  }> {
    const nowIso = data.nowIso || new Date().toISOString();
    const slotDiag = await this.inspectNozzleSlot(data.outletId, data.dispenserId, data.nozzleNumber);

    if (slotDiag.existsInRawTable && slotDiag.rawNozzle) {
      const existingId = slotDiag.rawNozzle.id;
      const targetStatus = data.status || slotDiag.rawNozzle.status || 'ACTIVE';

      if (
        slotDiag.appearsInJoinedList &&
        slotDiag.integrityStatus === 'VALID' &&
        slotDiag.rawNozzle.outletId === data.outletId &&
        slotDiag.rawNozzle.dispenserId === data.dispenserId &&
        slotDiag.rawNozzle.productId === data.productId &&
        slotDiag.rawNozzle.tankId === data.tankId &&
        slotDiag.rawNozzle.status === targetStatus
      ) {
        return {
          action: 'UNCHANGED',
          nozzle: slotDiag.joinedNozzle!,
          preservedId: existingId,
          previousIntegrityStatus: 'VALID',
          repairedRelations: [],
        };
      }

      const repaired = await this.updateNozzle(existingId, {
        outletId: data.outletId,
        dispenserId: data.dispenserId,
        nozzleNumber: data.nozzleNumber,
        productId: data.productId,
        tankId: data.tankId,
        status: targetStatus,
        updatedAt: nowIso,
      });

      if (!repaired) {
        throw new Error('NOZZLE_TOPOLOGY_REPAIR_FAILED');
      }

      return {
        action: 'REPAIRED',
        nozzle: repaired,
        preservedId: existingId,
        previousIntegrityStatus: slotDiag.integrityStatus,
        repairedRelations: slotDiag.brokenRelations,
      };
    }

    const created = await this.createNozzle({
      id: `nozz-${crypto.randomUUID()}`,
      outletId: data.outletId,
      dispenserId: data.dispenserId,
      nozzleNumber: data.nozzleNumber,
      productId: data.productId,
      tankId: data.tankId,
      status: data.status || 'ACTIVE',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: data.createdBy,
    });

    return {
      action: 'CREATED',
      nozzle: created,
      preservedId: created.id,
      previousIntegrityStatus: 'NOT_FOUND',
      repairedRelations: [],
    };
  }

  // ==========================================
  // 6. SHIFT TEMPLATES
  // ==========================================

  // ==========================================
  // 6. GLOBAL SHIFT TEMPLATES & LEGACY FALLBACK
  // ==========================================

  async listGlobalShiftTemplates(status?: 'ACTIVE' | 'INACTIVE'): Promise<GlobalShiftTemplate[]> {
    const query = this.db.select().from(schema.globalShiftTemplates);
    if (status) {
      const list = await query.where(eq(schema.globalShiftTemplates.status, status)).orderBy(asc(schema.globalShiftTemplates.sequence));
      return list as GlobalShiftTemplate[];
    }
    const list = await query.orderBy(asc(schema.globalShiftTemplates.sequence));
    return list as GlobalShiftTemplate[];
  }

  async findGlobalShiftTemplateById(id: string): Promise<GlobalShiftTemplate | null> {
    const [row] = await this.db
      .select()
      .from(schema.globalShiftTemplates)
      .where(eq(schema.globalShiftTemplates.id, id));
    return (row as GlobalShiftTemplate) || null;
  }

  async findGlobalShiftTemplateByCode(code: string): Promise<GlobalShiftTemplate | null> {
    const [row] = await this.db
      .select()
      .from(schema.globalShiftTemplates)
      .where(eq(schema.globalShiftTemplates.code, code.toUpperCase()));
    return (row as GlobalShiftTemplate) || null;
  }

  async createGlobalShiftTemplate(data: {
    id: string;
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    sequence: number;
    status: 'ACTIVE' | 'INACTIVE';
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<GlobalShiftTemplate> {
    await this.db.insert(schema.globalShiftTemplates).values({
      ...data,
      code: data.code.toUpperCase(),
    });
    return (await this.findGlobalShiftTemplateById(data.id))!;
  }

  async updateGlobalShiftTemplate(
    id: string,
    data: Partial<{
      name: string;
      startTime: string;
      endTime: string;
      sequence: number;
      status: 'ACTIVE' | 'INACTIVE';
      updatedAt: string;
    }>
  ): Promise<GlobalShiftTemplate | null> {
    await this.db.update(schema.globalShiftTemplates).set(data).where(eq(schema.globalShiftTemplates.id, id));
    return this.findGlobalShiftTemplateById(id);
  }

  async updateGlobalShiftTemplateStatus(
    id: string,
    status: 'ACTIVE' | 'INACTIVE',
    updatedAt: string
  ): Promise<GlobalShiftTemplate | null> {
    await this.db
      .update(schema.globalShiftTemplates)
      .set({ status, updatedAt })
      .where(eq(schema.globalShiftTemplates.id, id));
    return this.findGlobalShiftTemplateById(id);
  }

  // Compatibility methods returning global templates or legacy fallbacks
  async listShiftTemplatesByOutlet(outletId: string): Promise<ShiftTemplate[]> {
    const globals = await this.listGlobalShiftTemplates('ACTIVE');
    if (globals.length > 0) {
      return globals.map(g => ({
        ...g,
        outletId,
      })) as ShiftTemplate[];
    }
    const list = await this.db
      .select()
      .from(schema.shiftTemplates)
      .where(eq(schema.shiftTemplates.outletId, outletId))
      .orderBy(schema.shiftTemplates.sequence);

    return list as ShiftTemplate[];
  }

  async findShiftTemplateById(id: string): Promise<ShiftTemplate | null> {
    const [globalTpl] = await this.db
      .select()
      .from(schema.globalShiftTemplates)
      .where(eq(schema.globalShiftTemplates.id, id));
    if (globalTpl) {
      return globalTpl as ShiftTemplate;
    }
    const [tpl] = await this.db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, id));
    return (tpl as ShiftTemplate) || null;
  }

  async findShiftTemplateByCode(outletId: string, code: string): Promise<ShiftTemplate | null> {
    const [globalTpl] = await this.db
      .select()
      .from(schema.globalShiftTemplates)
      .where(eq(schema.globalShiftTemplates.code, code.toUpperCase()));
    if (globalTpl) {
      return {
        ...globalTpl,
        outletId,
      } as ShiftTemplate;
    }
    const [tpl] = await this.db
      .select()
      .from(schema.shiftTemplates)
      .where(and(eq(schema.shiftTemplates.outletId, outletId), eq(schema.shiftTemplates.code, code.toUpperCase())));
    return (tpl as ShiftTemplate) || null;
  }

  async createShiftTemplate(data: {
    id: string;
    outletId: string;
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    sequence: number;
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }): Promise<ShiftTemplate> {
    await this.db.insert(schema.shiftTemplates).values({
      ...data,
      code: data.code.toUpperCase(),
    });
    return (await this.findShiftTemplateById(data.id))!;
  }

  async updateShiftTemplate(id: string, data: Partial<{
    name: string;
    startTime: string;
    endTime: string;
    sequence: number;
    status: 'ACTIVE' | 'INACTIVE';
    updatedAt: string;
  }>): Promise<ShiftTemplate | null> {
    await this.db.update(schema.shiftTemplates).set(data).where(eq(schema.shiftTemplates.id, id));
    return this.findShiftTemplateById(id);
  }

  // ==========================================
  // 7. OPERATIONAL SHIFTS & SNAPSHOTS
  // ==========================================

  async listOperationalShiftsByOutlet(outletId: string, limit = 50): Promise<OperationalShift[]> {
    const rows = await this.db
      .select({
        shift: schema.operationalShifts,
        template: schema.shiftTemplates,
        globalTemplate: schema.globalShiftTemplates,
        openedBy: schema.users,
      })
      .from(schema.operationalShifts)
      .leftJoin(schema.globalShiftTemplates, eq(schema.operationalShifts.shiftTemplateId, schema.globalShiftTemplates.id))
      .leftJoin(schema.shiftTemplates, eq(schema.operationalShifts.shiftTemplateId, schema.shiftTemplates.id))
      .innerJoin(schema.users, eq(schema.operationalShifts.openedByUserId, schema.users.id))
      .where(eq(schema.operationalShifts.outletId, outletId))
      .orderBy(desc(schema.operationalShifts.businessDate), desc(schema.operationalShifts.startedAt))
      .limit(limit);

    return rows.map(r => ({
      ...r.shift,
      status: r.shift.status as any,
      shiftTemplateName: r.globalTemplate?.name || r.template?.name || 'Unknown',
      shiftTemplateCode: r.globalTemplate?.code || r.template?.code || 'UNKNOWN',
      openedByName: r.openedBy.name,
    }));
  }

  async listOperationalShiftsByOutletAndDate(outletId: string, businessDate: string): Promise<OperationalShift[]> {
    const rows = await this.db
      .select({
        shift: schema.operationalShifts,
        template: schema.shiftTemplates,
        globalTemplate: schema.globalShiftTemplates,
        openedBy: schema.users,
      })
      .from(schema.operationalShifts)
      .leftJoin(schema.globalShiftTemplates, eq(schema.operationalShifts.shiftTemplateId, schema.globalShiftTemplates.id))
      .leftJoin(schema.shiftTemplates, eq(schema.operationalShifts.shiftTemplateId, schema.shiftTemplates.id))
      .innerJoin(schema.users, eq(schema.operationalShifts.openedByUserId, schema.users.id))
      .where(
        and(
          eq(schema.operationalShifts.outletId, outletId),
          eq(schema.operationalShifts.businessDate, businessDate)
        )
      )
      .orderBy(asc(schema.operationalShifts.startedAt), asc(schema.operationalShifts.createdAt));

    return rows.map(r => ({
      ...r.shift,
      status: r.shift.status as any,
      shiftTemplateName: r.globalTemplate?.name || r.template?.name || 'Unknown',
      shiftTemplateCode: r.globalTemplate?.code || r.template?.code || 'UNKNOWN',
      openedByName: r.openedBy.name,
    }));
  }

  async findOperationalShiftById(id: string): Promise<OperationalShift | null> {
    const [row] = await this.db
      .select({
        shift: schema.operationalShifts,
        template: schema.shiftTemplates,
        globalTemplate: schema.globalShiftTemplates,
        openedBy: schema.users,
        outlet: schema.retailOutlets,
      })
      .from(schema.operationalShifts)
      .leftJoin(schema.globalShiftTemplates, eq(schema.operationalShifts.shiftTemplateId, schema.globalShiftTemplates.id))
      .leftJoin(schema.shiftTemplates, eq(schema.operationalShifts.shiftTemplateId, schema.shiftTemplates.id))
      .innerJoin(schema.users, eq(schema.operationalShifts.openedByUserId, schema.users.id))
      .innerJoin(schema.retailOutlets, eq(schema.operationalShifts.outletId, schema.retailOutlets.id))
      .where(eq(schema.operationalShifts.id, id));

    if (!row) return null;

    let closedByName: string | undefined;
    if (row.shift.closedByUserId) {
      const [u] = await this.db.select().from(schema.users).where(eq(schema.users.id, row.shift.closedByUserId));
      closedByName = u?.name;
    }

    return {
      ...row.shift,
      status: row.shift.status as any,
      shiftTemplateName: row.globalTemplate?.name || row.template?.name || 'Unknown',
      shiftTemplateCode: row.globalTemplate?.code || row.template?.code || 'UNKNOWN',
      openedByName: row.openedBy.name,
      closedByName,
      outletName: row.outlet.name,
      roCode: row.outlet.roCode,
    };
  }

  async findActiveOperationalShift(outletId: string): Promise<OperationalShift | null> {
    const [row] = await this.db
      .select()
      .from(schema.operationalShifts)
      .where(
        and(
          eq(schema.operationalShifts.outletId, outletId),
          inArray(schema.operationalShifts.status, ['OPEN', 'CLOSING'])
        )
      );
    return (row as OperationalShift) || null;
  }

  async findActiveOpenShift(outletId: string): Promise<OperationalShift | null> {
    return this.findActiveOperationalShift(outletId);
  }

  async findExistingShift(outletId: string, shiftTemplateId: string, businessDate: string): Promise<OperationalShift | null> {
    const [s] = await this.db
      .select()
      .from(schema.operationalShifts)
      .where(
        and(
          eq(schema.operationalShifts.outletId, outletId),
          eq(schema.operationalShifts.shiftTemplateId, shiftTemplateId),
          eq(schema.operationalShifts.businessDate, businessDate)
        )
      );
    return (s as OperationalShift) || null;
  }

  /**
   * Opens an operational shift and snapshots all participating active nozzles atomically.
   */
  async openOperationalShiftWithSnapshot(data: {
    id: string;
    outletId: string;
    shiftTemplateId: string;
    businessDate: string;
    startedAt: string;
    openedByUserId: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<{ success: boolean; shift: OperationalShift | null; snapshotsCount: number; error?: string; message?: string; unpricedProducts?: Array<{ id: string; code: string; name: string; unit: string }> }> {
    // 1. Resolve all participating active nozzles with active dispensers, active tanks, active products, and active outlet_products mappings
    const activeParticipatingNozzles = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .innerJoin(
        schema.outletProducts,
        and(
          eq(schema.outletProducts.outletId, schema.nozzles.outletId),
          eq(schema.outletProducts.productId, schema.nozzles.productId)
        )
      )
      .where(
        and(
          eq(schema.nozzles.outletId, data.outletId),
          eq(schema.nozzles.status, 'ACTIVE'),
          eq(schema.dispensers.status, 'ACTIVE'),
          eq(schema.dispensers.outletId, data.outletId),
          eq(schema.tanks.status, 'ACTIVE'),
          eq(schema.tanks.outletId, data.outletId),
          eq(schema.tanks.productId, schema.nozzles.productId),
          eq(schema.products.status, 'ACTIVE'),
          eq(schema.outletProducts.status, 'ACTIVE')
        )
      );

    // 1b. Resolve participating active liquid tanks
    const activeParticipatingTanks = await this.db
      .select({
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.tanks)
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .innerJoin(
        schema.outletProducts,
        and(
          eq(schema.outletProducts.outletId, schema.tanks.outletId),
          eq(schema.outletProducts.productId, schema.tanks.productId)
        )
      )
      .where(
        and(
          eq(schema.tanks.outletId, data.outletId),
          eq(schema.tanks.status, 'ACTIVE'),
          eq(schema.products.status, 'ACTIVE'),
          eq(schema.products.unit, 'LITRE'),
          eq(schema.outletProducts.status, 'ACTIVE')
        )
      );

    // 1c. Resolve active CNG/KG products with ambiguity check before price lookup
    const activeCngProducts = await this.db
      .select({ product: schema.products, outletProduct: schema.outletProducts })
      .from(schema.outletProducts)
      .innerJoin(schema.products, eq(schema.outletProducts.productId, schema.products.id))
      .where(
        and(
          eq(schema.outletProducts.outletId, data.outletId),
          eq(schema.outletProducts.status, 'ACTIVE'),
          eq(schema.products.status, 'ACTIVE'),
          eq(schema.products.category, 'CNG'),
          eq(schema.products.unit, 'KG')
        )
      );

    if (activeCngProducts.length > 1) {
      return {
        success: false,
        shift: null,
        snapshotsCount: 0,
        error: 'AMBIGUOUS_CNG_PRODUCT_CONFIGURATION',
        message: 'Outlet has more than one active CNG/KG product configured.',
      };
    }

    const cngProduct = activeCngProducts.length === 1 ? activeCngProducts[0].product : null;

    // 1d. Build unified priced product set (unique nozzle products + CNG product if present)
    const fuelProducts = activeParticipatingNozzles.map(n => n.product);
    const uniqueFuelProducts = Array.from(new Set(fuelProducts.map(p => p.id)))
      .map(id => fuelProducts.find(p => p.id === id)!);

    const pricedProducts = [
      ...uniqueFuelProducts,
      ...(cngProduct ? [cngProduct] : [])
    ];

    const productIds = pricedProducts.map(p => p.id);

    const prices = await this.db
      .select()
      .from(schema.outletProductPrices)
      .where(
        and(
          eq(schema.outletProductPrices.outletId, data.outletId),
          inArray(schema.outletProductPrices.productId, productIds),
          eq(schema.outletProductPrices.status, 'ACTIVE'),
          lte(schema.outletProductPrices.effectiveFrom, data.businessDate),
          sql`(${schema.outletProductPrices.effectiveTo} IS NULL OR ${schema.outletProductPrices.effectiveTo} >= ${data.businessDate})`
        )
      )
      .orderBy(desc(schema.outletProductPrices.effectiveFrom));

    const resolvedPrices = new Map<string, typeof prices[0]>();
    prices.forEach(p => {
      if (!resolvedPrices.has(p.productId)) {
        resolvedPrices.set(p.productId, p);
      }
    });

    const unpricedProducts = pricedProducts.filter(p => {
      const pr = resolvedPrices.get(p.id);
      return !pr || pr.pricePaisePerUnit <= 0;
    }).map(p => ({ id: p.id, code: p.code, name: p.name, unit: p.unit }));

    if (resolvedPrices.size < productIds.length || unpricedProducts.length > 0) {
      return {
        success: false,
        shift: null,
        snapshotsCount: 0,
        error: 'PRODUCT_PRICE_NOT_CONFIGURED',
        message: 'One or more products in this shift do not have a configured active price for the business date.',
        unpricedProducts,
      };
    }


    // 2. Prevent empty operational shifts
    if (activeParticipatingNozzles.length === 0) {
      return {
        success: false,
        shift: null,
        snapshotsCount: 0,
        error: 'NO_OPERATIONAL_NOZZLES',
        message: 'No operational active nozzles with valid active dependencies exist to open a shift.',
      };
    }

    // Pre-batch FK validation
    const [stCheck] = await this.db.select().from(schema.globalShiftTemplates).where(eq(schema.globalShiftTemplates.id, data.shiftTemplateId)).limit(1);
    if (!stCheck) {
      return { success: false, shift: null, snapshotsCount: 0, error: 'SHIFT_SNAPSHOT_REFERENCE_INVALID', message: 'Shift template reference does not exist.' };
    }
    const [userCheck] = await this.db.select().from(schema.users).where(eq(schema.users.id, data.openedByUserId)).limit(1);
    if (!userCheck) {
      return { success: false, shift: null, snapshotsCount: 0, error: 'SHIFT_SNAPSHOT_REFERENCE_INVALID', message: 'Opening user reference does not exist.' };
    }
    const [outletCheck] = await this.db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, data.outletId)).limit(1);
    if (!outletCheck) {
      return { success: false, shift: null, snapshotsCount: 0, error: 'SHIFT_SNAPSHOT_REFERENCE_INVALID', message: 'Outlet reference does not exist.' };
    }

    // 3. Prepare shift insert
    const shiftInsert = this.db.insert(schema.operationalShifts).values({
      id: data.id,
      outletId: data.outletId,
      shiftTemplateId: data.shiftTemplateId,
      businessDate: data.businessDate,
      startedAt: data.startedAt,
      status: 'OPEN',
      openedByUserId: data.openedByUserId,
      closedAt: null,
      closedByUserId: null,
      notes: data.notes || null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });

    // 4. Atomically insert shift, nozzle snapshots, and tank snapshots together
    const snapshotRows = activeParticipatingNozzles.map(n => ({
      id: `osn-${crypto.randomUUID()}`,
      operationalShiftId: data.id,
      outletId: data.outletId,
      nozzleId: n.nozzle.id,
      dispenserId: n.dispenser.id,
      dispenserNumber: n.dispenser.dispenserNumber,
      dispenserName: n.dispenser.name,
      nozzleNumber: n.nozzle.nozzleNumber,
      productId: n.product.id,
      productCode: n.product.code,
      productName: n.product.name,
      productCategory: n.product.category,
      productUnit: n.product.unit as ProductUnit,
      tankId: n.tank.id,
      tankNumber: n.tank.tankNumber,
      snapshotStatus: 'ACTIVE',
      createdAt: data.createdAt,
    }));

    // Resolve active calibration charts for participating tanks
    const participatingTankIds = activeParticipatingTanks.map(t => t.tank.id);
    const activeCalCharts = participatingTankIds.length > 0
      ? await this.db
          .select()
          .from(schema.tankCalibrationCharts)
          .where(
            and(
              inArray(schema.tankCalibrationCharts.tankId, participatingTankIds),
              eq(schema.tankCalibrationCharts.status, 'ACTIVE')
            )
          )
      : [];
    const activeCalChartByTankId = new Map(activeCalCharts.map(c => [c.tankId, c]));

    const tankSnapshotRows = activeParticipatingTanks.map(t => {
      const activeCal = activeCalChartByTankId.get(t.tank.id);
      return {
        id: `ost-${crypto.randomUUID()}`,
        operationalShiftId: data.id,
        outletId: data.outletId,
        tankId: t.tank.id,
        tankNumber: t.tank.tankNumber,
        tankName: t.tank.name,
        productId: t.product.id,
        productCode: t.product.code,
        productName: t.product.name,
        productUnit: t.product.unit as ProductUnit,
        capacityMilliunits: Math.round(t.tank.capacityLitres * MILLIUNIT_SCALE),
        safeFillCapacityMilliunits: Math.round(t.tank.safeFillCapacityLitres * MILLIUNIT_SCALE),
        calibrationChartId: activeCal?.id ?? null,
        calibrationRevision: activeCal?.revisionNumber ?? null,
        createdAt: data.createdAt,
      };
    });

    const priceSnapshotRows = pricedProducts.map(p => {
      const pr = resolvedPrices.get(p.id)!;
      return {
        id: `ospp-${crypto.randomUUID()}`,
        operationalShiftId: data.id,
        outletId: data.outletId,
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        unit: p.unit,
        productCategory: p.category,
        pricePaisePerUnit: pr.pricePaisePerUnit,
        sourcePriceId: pr.id,
        createdAt: data.createdAt,
      };
    });

    const nozzleChunks = chunkArray(snapshotRows, SNAPSHOT_INSERT_CHUNK_SIZE);
    const priceChunks = chunkArray(priceSnapshotRows, SNAPSHOT_INSERT_CHUNK_SIZE);
    const tankChunks = chunkArray(tankSnapshotRows, SNAPSHOT_INSERT_CHUNK_SIZE);

    const batch: any[] = [shiftInsert];

    for (const chunk of nozzleChunks) {
      if (chunk.length > 0) {
        batch.push(
          this.db.insert(schema.operationalShiftNozzles).values(chunk)
        );
      }
    }

    for (const chunk of priceChunks) {
      if (chunk.length > 0) {
        batch.push(
          this.db.insert(schema.operationalShiftProductPrices).values(chunk)
        );
      }
    }

    for (const chunk of tankChunks) {
      if (chunk.length > 0) {
        batch.push(
          this.db.insert(schema.operationalShiftTanks).values(chunk)
        );
      }
    }

    console.log('[SHIFT_OPEN_BATCH_PRECHECK]', {
      outletId: data.outletId,
      shiftTemplateId: data.shiftTemplateId,
      businessDate: data.businessDate,
      nozzleSnapshots: snapshotRows.length,
      nozzleChunks: nozzleChunks.length,
      tankSnapshots: tankSnapshotRows.length,
      tankChunks: tankChunks.length,
      priceSnapshots: priceSnapshotRows.length,
      priceChunks: priceChunks.length,
      batchStatements: batch.length,
      productCodes: priceSnapshotRows.map(x => x.productCode),
    });

    try {
      await (this.db as any).batch(batch);
    } catch (err) {
      console.error(
        '[SHIFT_OPEN_BATCH_ERROR]',
        JSON.stringify({
          message: err instanceof Error ? err.message : String(err),
          cause: err instanceof Error && 'cause' in err
            ? String((err as any).cause)
            : undefined,
          outletId: data.outletId,
          shiftTemplateId: data.shiftTemplateId,
          businessDate: data.businessDate,
          nozzleSnapshots: snapshotRows.length,
          nozzleChunks: nozzleChunks.length,
          tankSnapshots: tankSnapshotRows.length,
          tankChunks: tankChunks.length,
          priceSnapshots: priceSnapshotRows.length,
          priceChunks: priceChunks.length,
          batchStatements: batch.length,
        })
      );
      throw err;
    }

    const shift = (await this.findOperationalShiftById(data.id))!;
    return { success: true, shift, snapshotsCount: activeParticipatingNozzles.length };
  }

  async listShiftNozzleSnapshots(shiftId: string): Promise<OperationalShiftNozzleSnapshot[]> {
    const rows = await this.db
      .select()
      .from(schema.operationalShiftNozzles)
      .where(eq(schema.operationalShiftNozzles.operationalShiftId, shiftId))
      .orderBy(schema.operationalShiftNozzles.dispenserNumber, schema.operationalShiftNozzles.nozzleNumber);

    return rows as OperationalShiftNozzleSnapshot[];
  }

  async findShiftNozzleSnapshot(shiftId: string, nozzleId: string): Promise<OperationalShiftNozzleSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.operationalShiftNozzles)
      .where(
        and(
          eq(schema.operationalShiftNozzles.operationalShiftId, shiftId),
          eq(schema.operationalShiftNozzles.nozzleId, nozzleId)
        )
      );
    return (row as OperationalShiftNozzleSnapshot) || null;
  }

  async listShiftTankSnapshots(shiftId: string): Promise<OperationalShiftTankSnapshot[]> {
    const rows = await this.db
      .select()
      .from(schema.operationalShiftTanks)
      .where(eq(schema.operationalShiftTanks.operationalShiftId, shiftId))
      .orderBy(schema.operationalShiftTanks.tankNumber);

    return rows.map(r => ({
      ...r,
      productUnit: r.productUnit as ProductUnit,
      capacityLitresStr: formatMilliunits(r.capacityMilliunits),
      safeFillLitresStr: formatMilliunits(r.safeFillCapacityMilliunits),
    }));
  }

  async findShiftTankSnapshot(shiftId: string, tankId: string): Promise<OperationalShiftTankSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.operationalShiftTanks)
      .where(
        and(
          eq(schema.operationalShiftTanks.operationalShiftId, shiftId),
          eq(schema.operationalShiftTanks.tankId, tankId)
        )
      );
    if (!row) return null;
    return {
      ...row,
      productUnit: row.productUnit as ProductUnit,
      capacityLitresStr: formatMilliunits(row.capacityMilliunits),
      safeFillLitresStr: formatMilliunits(row.safeFillCapacityMilliunits),
    };
  }

  async validateShiftCompleteness(shiftId: string): Promise<{
    valid: boolean;
    error?: string;
    message?: string;
    details?: Record<string, unknown>;
  }> {
    const existing = await this.findOperationalShiftById(shiftId);
    if (!existing) {
      return { valid: false, error: 'NOT_FOUND', message: 'Shift not found' };
    }

    // 1. Check all participating liquid tanks in shift snapshot
    const tankSnapshots = await this.listShiftTankSnapshots(shiftId);
    const tankReadings = await this.listShiftTankReadings(shiftId);

    if (tankSnapshots.length > 0) {
      for (const ts of tankSnapshots) {
        const hasOpening = tankReadings.some(r => r.tankId === ts.tankId && r.readingType === 'OPENING');
        const hasClosing = tankReadings.some(r => r.tankId === ts.tankId && r.readingType === 'CLOSING');

        if (!hasOpening || !hasClosing) {
          const missingReadingTypes: ('OPENING' | 'CLOSING')[] = [];
          if (!hasOpening) missingReadingTypes.push('OPENING');
          if (!hasClosing) missingReadingTypes.push('CLOSING');

          return {
            valid: false,
            error: 'INCOMPLETE_TANK_STOCK_DATA',
            message: `Tank #${ts.tankNumber} (${ts.tankName}) is missing ${missingReadingTypes.join(' and ')} stock reading(s).`,
            details: {
              tankId: ts.tankId,
              tankNumber: ts.tankNumber,
              missingReadingTypes,
            },
          };
        }
      }
    }

    // 2. Check all fuel receipts for this shift are terminal (COMPLETED or CANCELLED)
    const receipts = await this.listFuelReceiptsByShift(shiftId);
    for (const rcpt of receipts) {
      if (rcpt.status !== 'COMPLETED' && rcpt.status !== 'CANCELLED') {
        return {
          valid: false,
          error: 'INCOMPLETE_RECEIPTS',
          message: `Fuel receipt (TT: ${rcpt.ttNumber}, Inv: ${rcpt.invoiceNumber}) is in ${rcpt.status} status. Complete or cancel all fuel receipts before closing the shift.`,
        };
      }

      if (rcpt.status === 'COMPLETED' && rcpt.lines) {
        for (const line of rcpt.lines) {
          if (!line.preDecantReadingId || !line.postDecantReadingId) {
            return {
              valid: false,
              error: 'INCOMPLETE_DECANTATION_DATA',
              message: `Completed fuel receipt line for tank #${line.tankNumber || line.tankId} is missing PRE or POST decantation reading.`,
            };
          }

          const pre = tankReadings.find(r => r.id === line.preDecantReadingId);
          const post = tankReadings.find(r => r.id === line.postDecantReadingId);

          if (!pre || pre.readingType !== 'PRE_RECEIPT' || pre.operationalShiftId !== shiftId || pre.tankId !== line.tankId || pre.productId !== line.productId) {
            return {
              valid: false,
              error: 'INVALID_DECANTATION_READING',
              message: `PRE reading linked to receipt line is invalid or from a different shift/tank/product.`,
            };
          }

          if (!post || post.readingType !== 'POST_RECEIPT' || post.operationalShiftId !== shiftId || post.tankId !== line.tankId || post.productId !== line.productId) {
            return {
              valid: false,
              error: 'INVALID_DECANTATION_READING',
              message: `POST reading linked to receipt line is invalid or from a different shift/tank/product.`,
            };
          }

          if (post.recordedAt <= pre.recordedAt) {
            return {
              valid: false,
              error: 'INVALID_DECANTATION_TIMESTAMPS',
              message: `POST decantation reading timestamp must be strictly after PRE reading timestamp.`,
            };
          }

          const measured = post.netProductVolumeMilliunits - pre.netProductVolumeMilliunits;
          if (measured < 0) {
            return {
              valid: false,
              error: 'INVALID_DECANTATION_VOLUME',
              message: `Measured received volume (${measured / 1000} L) cannot be negative.`,
            };
          }
        }
      }
    }

    return { valid: true };
  }

  async closeOperationalShiftConditional(shiftId: string, closedByUserId: string): Promise<{ success: boolean; shift: OperationalShift | null; alreadyClosed: boolean; error?: string; message?: string; details?: Record<string, unknown> }> {
    const nowIso = new Date().toISOString();

    // 1. Conditional transition OPEN -> CLOSING
    const transitionToClosing = await this.db.all<{ id: string }>(
      sql`UPDATE operational_shifts
          SET status = 'CLOSING', updated_at = ${nowIso}
          WHERE id = ${shiftId} AND status = 'OPEN'
          RETURNING id`
    );

    if (!transitionToClosing || transitionToClosing.length === 0) {
      const latest = await this.findOperationalShiftById(shiftId);
      return {
        success: false,
        shift: latest,
        alreadyClosed: true,
        error: 'SHIFT_CLOSED_OR_CLOSING',
        message: 'Shift is already closing, closed, or locked',
      };
    }

    // 2. Centralized shift completeness validation in CLOSING state
    const check = await this.validateShiftCompleteness(shiftId);
    if (!check.valid) {
      // Revert status CLOSING -> OPEN on validation error
      await this.db.run(
        sql`UPDATE operational_shifts SET status = 'OPEN', updated_at = ${nowIso} WHERE id = ${shiftId} AND status = 'CLOSING'`
      );
      const current = await this.findOperationalShiftById(shiftId);
      return {
        success: false,
        shift: current,
        alreadyClosed: false,
        error: check.error,
        message: check.message,
        details: check.details,
      };
    }

    // 3. Calculate and save stock reconciliation in CLOSING state
    try {
      await this.calculateAndSaveShiftStockReconciliation(shiftId);
    } catch (err: any) {
      // Revert status CLOSING -> OPEN on reconciliation error
      await this.db.run(
        sql`UPDATE operational_shifts SET status = 'OPEN', updated_at = ${nowIso} WHERE id = ${shiftId} AND status = 'CLOSING'`
      );
      const current = await this.findOperationalShiftById(shiftId);
      return {
        success: false,
        shift: current,
        alreadyClosed: false,
        error: err?.code || 'RECONCILIATION_FAILED',
        message: err?.message || 'Failed to compute stock reconciliation',
      };
    }

    // 4. Final transition CLOSING -> CLOSED
    const transitionToClosed = await this.db.all<{ id: string; status: string }>(
      sql`UPDATE operational_shifts 
          SET status = 'CLOSED', closed_at = ${nowIso}, closed_by_user_id = ${closedByUserId}, updated_at = ${nowIso} 
          WHERE id = ${shiftId} AND status = 'CLOSING' 
          RETURNING id, status`
    );

    if (!transitionToClosed || transitionToClosed.length === 0) {
      const latest = await this.findOperationalShiftById(shiftId);
      return {
        success: false,
        shift: latest,
        alreadyClosed: true,
        error: 'SHIFT_CLOSED_OR_CLOSING',
        message: 'Shift is already closing or closed',
      };
    }

    const shift = await this.findOperationalShiftById(shiftId);
    return { success: true, shift, alreadyClosed: false };
  }

  /**
   * Admin-only empty-shift close. A single conditional UPDATE enforces emptiness
   * at the exact point of transition, preventing concurrent entry races.
   * Equipment/tank/price snapshots created on open are intentionally permitted.
   * This path does not calculate or write reconciliation or sales figures.
   */
  async closeEmptyShiftConditional(shiftId: string, closedByUserId: string): Promise<{ success: boolean; shift: OperationalShift | null }> {
    const nowIso = new Date().toISOString();
    const result = await this.db.all<{ id: string }>(
      sql`UPDATE operational_shifts
          SET status = 'CLOSED',
              closed_at = ${nowIso},
              closed_by_user_id = ${closedByUserId},
              updated_at = ${nowIso}
          WHERE id = ${shiftId} AND status = 'OPEN'
            AND NOT EXISTS (SELECT 1 FROM nozzle_meter_readings WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM nozzle_unavailability_records WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM tank_stock_readings WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM fuel_receipts WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM shift_stock_reconciliations WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM shift_collections WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM cash_handover_logs WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM bank_deposits WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM shift_financial_reconciliations WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM cng_shift_logs WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM cng_pressure_readings WHERE operational_shift_id = ${shiftId})
            AND NOT EXISTS (SELECT 1 FROM lube_shift_sales WHERE operational_shift_id = ${shiftId})
          RETURNING id`
    );
    return {
      success: result.length > 0,
      shift: await this.findOperationalShiftById(shiftId),
    };
  }

  async beginCloseConditional(shiftId: string): Promise<{ success: boolean; shift: OperationalShift | null }> {
    const nowIso = new Date().toISOString();
    const res = await this.db.all<{ id: string }>(
      sql`UPDATE operational_shifts
          SET status = 'CLOSING', updated_at = ${nowIso}
          WHERE id = ${shiftId} AND status = 'OPEN'
          RETURNING id`
    );
    const shift = await this.findOperationalShiftById(shiftId);
    return { success: Boolean(res && res.length > 0), shift };
  }

  async restoreOpenFromClosing(shiftId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db.run(
      sql`UPDATE operational_shifts SET status = 'OPEN', updated_at = ${nowIso} WHERE id = ${shiftId} AND status = 'CLOSING'`
    );
  }

  async finalizeCloseConditional(shiftId: string, closedByUserId: string): Promise<{ success: boolean; shift: OperationalShift | null }> {
    const nowIso = new Date().toISOString();
    const res = await this.db.all<{ id: string }>(
      sql`UPDATE operational_shifts 
          SET status = 'CLOSED', closed_at = ${nowIso}, closed_by_user_id = ${closedByUserId}, updated_at = ${nowIso} 
          WHERE id = ${shiftId} AND status = 'CLOSING' 
          RETURNING id`
    );
    const shift = await this.findOperationalShiftById(shiftId);
    return { success: Boolean(res && res.length > 0), shift };
  }

  // ==========================================
  // 8. NOZZLE METER READINGS & CONTINUITY
  // ==========================================

  async getLatestClosedReadingForNozzle(nozzleId: string): Promise<NozzleMeterReading | null> {
    const rows = await this.db
      .select({
        reading: schema.nozzleMeterReadings,
        shift: schema.operationalShifts,
      })
      .from(schema.nozzleMeterReadings)
      .innerJoin(schema.operationalShifts, eq(schema.nozzleMeterReadings.operationalShiftId, schema.operationalShifts.id))
      .where(
        and(
          eq(schema.nozzleMeterReadings.nozzleId, nozzleId),
          eq(schema.operationalShifts.status, 'CLOSED')
        )
      )
      .orderBy(
        desc(schema.operationalShifts.businessDate),
        desc(schema.operationalShifts.startedAt),
        desc(schema.nozzleMeterReadings.createdAt)
      )
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0].reading;
    const openingMilli = r.openingTotalizerMilliunits;
    const closingMilli = r.closingTotalizerMilliunits;
    const testingMilli = r.testingQuantityMilliunits;
    const grossMilli = r.grossSalesQuantityMilliunits;
    const netMilli = r.netSalesQuantityMilliunits;
    const varMilli = r.openingVarianceMilliunits;

    return {
      ...r,
      openingTotalizer: openingMilli / MILLIUNIT_SCALE,
      closingTotalizer: closingMilli / MILLIUNIT_SCALE,
      testingQuantity: testingMilli / MILLIUNIT_SCALE,
      grossSalesQuantity: grossMilli / MILLIUNIT_SCALE,
      netSalesQuantity: netMilli / MILLIUNIT_SCALE,
      openingTotalizerMilliunits: openingMilli,
      closingTotalizerMilliunits: closingMilli,
      testingQuantityMilliunits: testingMilli,
      grossSalesQuantityMilliunits: grossMilli,
      netSalesQuantityMilliunits: netMilli,
      openingVarianceMilliunits: varMilli,
      openingTotalizerStr: formatMilliunits(openingMilli),
      closingTotalizerStr: formatMilliunits(closingMilli),
      testingQuantityStr: formatMilliunits(testingMilli),
      grossSalesQuantityStr: formatMilliunits(grossMilli),
      netSalesQuantityStr: formatMilliunits(netMilli),
      openingVarianceStr: formatMilliunits(varMilli),
      hasOpeningVariance: Boolean(r.hasOpeningVariance),
      openingVarianceQuantity: varMilli / MILLIUNIT_SCALE,
    };
  }

  async listReadingsForShift(shiftId: string): Promise<NozzleMeterReading[]> {
    const rows = await this.db
      .select({
        reading: schema.nozzleMeterReadings,
        user: schema.users,
      })
      .from(schema.nozzleMeterReadings)
      .innerJoin(schema.users, eq(schema.nozzleMeterReadings.recordedByUserId, schema.users.id))
      .where(eq(schema.nozzleMeterReadings.operationalShiftId, shiftId));

    return rows.map(r => {
      const rd = r.reading;
      const openingMilli = rd.openingTotalizerMilliunits;
      const closingMilli = rd.closingTotalizerMilliunits;
      const testingMilli = rd.testingQuantityMilliunits;
      const grossMilli = rd.grossSalesQuantityMilliunits;
      const netMilli = rd.netSalesQuantityMilliunits;
      const varMilli = rd.openingVarianceMilliunits;

      return {
        ...rd,
        openingTotalizer: openingMilli / MILLIUNIT_SCALE,
        closingTotalizer: closingMilli / MILLIUNIT_SCALE,
        testingQuantity: testingMilli / MILLIUNIT_SCALE,
        grossSalesQuantity: grossMilli / MILLIUNIT_SCALE,
        netSalesQuantity: netMilli / MILLIUNIT_SCALE,
        openingTotalizerMilliunits: openingMilli,
        closingTotalizerMilliunits: closingMilli,
        testingQuantityMilliunits: testingMilli,
        grossSalesQuantityMilliunits: grossMilli,
        netSalesQuantityMilliunits: netMilli,
        openingVarianceMilliunits: varMilli,
        openingTotalizerStr: formatMilliunits(openingMilli),
        closingTotalizerStr: formatMilliunits(closingMilli),
        testingQuantityStr: formatMilliunits(testingMilli),
        grossSalesQuantityStr: formatMilliunits(grossMilli),
        netSalesQuantityStr: formatMilliunits(netMilli),
        openingVarianceStr: formatMilliunits(varMilli),
        hasOpeningVariance: Boolean(rd.hasOpeningVariance),
        openingVarianceQuantity: varMilli / MILLIUNIT_SCALE,
        recorderName: r.user.name,
      };
    });
  }

  async findReadingByShiftAndNozzle(shiftId: string, nozzleId: string): Promise<NozzleMeterReading | null> {
    const [row] = await this.db
      .select()
      .from(schema.nozzleMeterReadings)
      .where(
        and(
          eq(schema.nozzleMeterReadings.operationalShiftId, shiftId),
          eq(schema.nozzleMeterReadings.nozzleId, nozzleId)
        )
      );
    if (!row) return null;

    const openingMilli = row.openingTotalizerMilliunits;
    const closingMilli = row.closingTotalizerMilliunits;
    const testingMilli = row.testingQuantityMilliunits;
    const grossMilli = row.grossSalesQuantityMilliunits;
    const netMilli = row.netSalesQuantityMilliunits;
    const varMilli = row.openingVarianceMilliunits;

    return {
      ...row,
      openingTotalizer: openingMilli / MILLIUNIT_SCALE,
      closingTotalizer: closingMilli / MILLIUNIT_SCALE,
      testingQuantity: testingMilli / MILLIUNIT_SCALE,
      grossSalesQuantity: grossMilli / MILLIUNIT_SCALE,
      netSalesQuantity: netMilli / MILLIUNIT_SCALE,
      openingTotalizerMilliunits: openingMilli,
      closingTotalizerMilliunits: closingMilli,
      testingQuantityMilliunits: testingMilli,
      grossSalesQuantityMilliunits: grossMilli,
      netSalesQuantityMilliunits: netMilli,
      openingVarianceMilliunits: varMilli,
      openingTotalizerStr: formatMilliunits(openingMilli),
      closingTotalizerStr: formatMilliunits(closingMilli),
      testingQuantityStr: formatMilliunits(testingMilli),
      grossSalesQuantityStr: formatMilliunits(grossMilli),
      netSalesQuantityStr: formatMilliunits(netMilli),
      openingVarianceStr: formatMilliunits(varMilli),
      hasOpeningVariance: Boolean(row.hasOpeningVariance),
      openingVarianceQuantity: varMilli / MILLIUNIT_SCALE,
    };
  }

  async createReading(data: {
    id: string;
    operationalShiftId: string;
    outletId: string;
    nozzleId: string;
    openingMilliunits: number;
    closingMilliunits: number;
    testingMilliunits: number;
    grossMilliunits: number;
    netMilliunits: number;
    recordedByUserId: string;
    hasOpeningVariance: boolean;
    openingVarianceMilliunits: number;
    varianceReason: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<{ reading: NozzleMeterReading | null; shiftClosed: boolean }> {
    const hasVarianceNum = data.hasOpeningVariance ? 1 : 0;
    const inserted = await this.db.all<{ id: string }>(
      sql`INSERT INTO nozzle_meter_readings (
        id, operational_shift_id, outlet_id, nozzle_id,
        opening_totalizer_milliunits, closing_totalizer_milliunits, testing_quantity_milliunits,
        gross_sales_quantity_milliunits, net_sales_quantity_milliunits, opening_variance_milliunits,
        recorded_by_user_id, has_opening_variance, variance_reason, created_at, updated_at
      )
      SELECT
        ${data.id}, ${data.operationalShiftId}, ${data.outletId}, ${data.nozzleId},
        ${data.openingMilliunits}, ${data.closingMilliunits}, ${data.testingMilliunits},
        ${data.grossMilliunits}, ${data.netMilliunits}, ${data.openingVarianceMilliunits},
        ${data.recordedByUserId}, ${hasVarianceNum}, ${data.varianceReason}, ${data.createdAt}, ${data.updatedAt}
      WHERE EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${data.operationalShiftId} AND status = 'OPEN')
      RETURNING id`
    );

    if (!inserted || inserted.length === 0) {
      const shift = await this.findOperationalShiftById(data.operationalShiftId);
      if (shift && shift.status !== 'OPEN') {
        return { reading: null, shiftClosed: true };
      }
      return { reading: null, shiftClosed: false };
    }

    const reading = await this.findReadingByShiftAndNozzle(data.operationalShiftId, data.nozzleId);
    return { reading, shiftClosed: false };
  }

  async updateReading(shiftId: string, nozzleId: string, data: {
    openingMilliunits: number;
    closingMilliunits: number;
    testingMilliunits: number;
    grossMilliunits: number;
    netMilliunits: number;
    hasOpeningVariance: boolean;
    openingVarianceMilliunits: number;
    varianceReason: string | null;
    updatedAt: string;
  }): Promise<{ reading: NozzleMeterReading | null; shiftClosed: boolean }> {
    const hasVarianceNum = data.hasOpeningVariance ? 1 : 0;
    const updated = await this.db.all<{ id: string }>(
      sql`UPDATE nozzle_meter_readings
          SET
            opening_totalizer_milliunits = ${data.openingMilliunits},
            closing_totalizer_milliunits = ${data.closingMilliunits},
            testing_quantity_milliunits = ${data.testingMilliunits},
            gross_sales_quantity_milliunits = ${data.grossMilliunits},
            net_sales_quantity_milliunits = ${data.netMilliunits},
            has_opening_variance = ${hasVarianceNum},
            opening_variance_milliunits = ${data.openingVarianceMilliunits},
            variance_reason = ${data.varianceReason},
            updated_at = ${data.updatedAt}
          WHERE operational_shift_id = ${shiftId} AND nozzle_id = ${nozzleId}
            AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${shiftId} AND status = 'OPEN')
          RETURNING id`
    );

    if (!updated || updated.length === 0) {
      const shift = await this.findOperationalShiftById(shiftId);
      if (shift && shift.status !== 'OPEN') {
        return { reading: null, shiftClosed: true };
      }
      return { reading: null, shiftClosed: false };
    }

    const reading = await this.findReadingByShiftAndNozzle(shiftId, nozzleId);
    return { reading, shiftClosed: false };
  }

  // ==========================================
  // 9. NOZZLE UNAVAILABILITY RECORDS
  // ==========================================

  async listUnavailabilityForShift(shiftId: string): Promise<NozzleUnavailabilityRecord[]> {
    const rows = await this.db
      .select({
        record: schema.nozzleUnavailabilityRecords,
        user: schema.users,
      })
      .from(schema.nozzleUnavailabilityRecords)
      .innerJoin(schema.users, eq(schema.nozzleUnavailabilityRecords.recordedBy, schema.users.id))
      .where(eq(schema.nozzleUnavailabilityRecords.operationalShiftId, shiftId));

    return rows.map(r => ({
      ...r.record,
      recordedByName: r.user.name,
    }));
  }

  async findUnavailability(shiftId: string, nozzleId: string): Promise<NozzleUnavailabilityRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.nozzleUnavailabilityRecords)
      .where(
        and(
          eq(schema.nozzleUnavailabilityRecords.operationalShiftId, shiftId),
          eq(schema.nozzleUnavailabilityRecords.nozzleId, nozzleId)
        )
      );
    return (row as NozzleUnavailabilityRecord) || null;
  }

  async recordUnavailability(data: {
    id: string;
    operationalShiftId: string;
    nozzleId: string;
    reason: string;
    recordedBy: string;
    createdAt: string;
  }): Promise<{ record: NozzleUnavailabilityRecord | null; shiftClosed: boolean }> {
    const inserted = await this.db.all<{ id: string }>(
      sql`INSERT INTO nozzle_unavailability_records (
        id, operational_shift_id, nozzle_id, reason, recorded_by, created_at
      )
      SELECT
        ${data.id}, ${data.operationalShiftId}, ${data.nozzleId}, ${data.reason}, ${data.recordedBy}, ${data.createdAt}
      WHERE EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${data.operationalShiftId} AND status = 'OPEN')
      RETURNING id`
    );

    if (!inserted || inserted.length === 0) {
      const shift = await this.findOperationalShiftById(data.operationalShiftId);
      if (shift && shift.status !== 'OPEN') {
        return { record: null, shiftClosed: true };
      }
      return { record: null, shiftClosed: false };
    }

    const record = await this.findUnavailability(data.operationalShiftId, data.nozzleId);
    return { record, shiftClosed: false };
  }

  async removeUnavailability(shiftId: string, nozzleId: string): Promise<{ success: boolean; shiftClosed: boolean }> {
    const deleted = await this.db.all<{ id: string }>(
      sql`DELETE FROM nozzle_unavailability_records
          WHERE operational_shift_id = ${shiftId} AND nozzle_id = ${nozzleId}
            AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${shiftId} AND status = 'OPEN')
          RETURNING id`
    );

    if (!deleted || deleted.length === 0) {
      const shift = await this.findOperationalShiftById(shiftId);
      if (shift && shift.status !== 'OPEN') {
        return { success: false, shiftClosed: true };
      }
      return { success: false, shiftClosed: false };
    }

    return { success: true, shiftClosed: false };
  }

  // ==========================================
  // 10. SHIFT ENTRY GRID (USING HISTORICAL SNAPSHOT)
  // ==========================================

  async getShiftEntryGrid(shiftId: string): Promise<ShiftEntryGridItem[]> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) return [];

    // CRITICAL: Retrieve participating nozzles from historical snapshot in parallel
    const [snapshots, readings, unavails] = await Promise.all([
      this.listShiftNozzleSnapshots(shiftId),
      this.listReadingsForShift(shiftId),
      this.listUnavailabilityForShift(shiftId),
    ]);

    const readingMap = new Map<string, NozzleMeterReading>();
    readings.forEach(r => readingMap.set(r.nozzleId, r));

    const unavailMap = new Map<string, NozzleUnavailabilityRecord>();
    unavails.forEach(u => unavailMap.set(u.nozzleId, u));

    // Parallelize previous reading lookups across all nozzles
    const prevReadings = await Promise.all(
      snapshots.map(s => this.getLatestClosedReadingForNozzle(s.nozzleId))
    );
    const prevReadingMap = new Map<string, NozzleMeterReading | null>();
    snapshots.forEach((s, idx) => {
      prevReadingMap.set(s.nozzleId, prevReadings[idx]);
    });

    const grid: ShiftEntryGridItem[] = [];

    for (const snapshot of snapshots) {
      const reading = readingMap.get(snapshot.nozzleId) || null;
      const unavail = unavailMap.get(snapshot.nozzleId) || null;
      const prevReading = prevReadingMap.get(snapshot.nozzleId) || null;
      const suggestedOpeningTotalizer = prevReading ? prevReading.closingTotalizerStr : '0.000';

      grid.push({
        snapshot,
        reading,
        unavailability: unavail,
        suggestedOpeningTotalizer,
        hasPreviousShift: prevReading !== null,
      });
    }

    return grid;
  }

  // ==========================================
  // 11. AUTHORITATIVE SALES SUMMARY (USING HISTORICAL SNAPSHOT & EXACT SCALED INTEGERS)
  // ==========================================

  async getSalesSummary(shiftId: string): Promise<ShiftSalesSummary | null> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) return null;

    // CRITICAL: Must use the shift snapshot, NOT current master!
    const snapshots = await this.listShiftNozzleSnapshots(shiftId);
    const readings = await this.listReadingsForShift(shiftId);
    const unavails = await this.listUnavailabilityForShift(shiftId);

    const readingMap = new Map<string, NozzleMeterReading>();
    readings.forEach(r => readingMap.set(r.nozzleId, r));

    const unavailMap = new Map<string, NozzleUnavailabilityRecord>();
    unavails.forEach(u => unavailMap.set(u.nozzleId, u));

    // Per nozzle aggregation
    const byNozzle: ShiftSalesSummary['byNozzle'] = [];
    for (const snap of snapshots) {
      const r = readingMap.get(snap.nozzleId);
      const u = unavailMap.get(snap.nozzleId);

      const grossMilli = r ? (r.grossSalesQuantityMilliunits ?? (r.closingTotalizerMilliunits! - r.openingTotalizerMilliunits!)) : 0;
      const testMilli = r ? (r.testingQuantityMilliunits ?? 0) : 0;
      const netMilli = r ? (r.netSalesQuantityMilliunits ?? (grossMilli - testMilli)) : 0;
      const varMilli = r ? (r.openingVarianceMilliunits ?? 0) : 0;

      byNozzle.push({
        nozzleId: snap.nozzleId,
        nozzleNumber: snap.nozzleNumber,
        dispenserId: snap.dispenserId,
        dispenserNumber: snap.dispenserNumber,
        dispenserName: snap.dispenserName,
        productId: snap.productId,
        productCode: snap.productCode,
        productName: snap.productName,
        productCategory: snap.productCategory,
        unit: snap.productUnit,
        openingTotalizerStr: r ? r.openingTotalizerStr : null,
        closingTotalizerStr: r ? r.closingTotalizerStr : null,
        grossQuantity: formatMilliunits(grossMilli),
        testingQuantity: formatMilliunits(testMilli),
        netQuantity: formatMilliunits(netMilli),
        openingTotalizer: r ? (r.openingTotalizerMilliunits ?? 0) / MILLIUNIT_SCALE : null,
        closingTotalizer: r ? (r.closingTotalizerMilliunits ?? 0) / MILLIUNIT_SCALE : null,
        isUnavailable: Boolean(u),
        unavailableReason: u ? u.reason : null,
        hasVariance: r ? Boolean(r.hasOpeningVariance) : false,
        varianceQuantity: formatMilliunits(varMilli),
      });
    }

    // Per dispenser aggregation
    const dispenserMap = new Map<string, {
      dispenserId: string;
      dispenserNumber: number;
      name: string;
      unitMap: Map<ProductUnit, { gross: number; test: number; net: number }>;
    }>();

    for (const item of byNozzle) {
      let d = dispenserMap.get(item.dispenserId);
      if (!d) {
        d = {
          dispenserId: item.dispenserId,
          dispenserNumber: item.dispenserNumber,
          name: item.dispenserName || `Dispenser #${item.dispenserNumber}`,
          unitMap: new Map(),
        };
        dispenserMap.set(item.dispenserId, d);
      }

      const r = readingMap.get(item.nozzleId);
      const grossMilli = r ? (r.grossSalesQuantityMilliunits ?? 0) : 0;
      const testMilli = r ? (r.testingQuantityMilliunits ?? 0) : 0;
      const netMilli = r ? (r.netSalesQuantityMilliunits ?? 0) : 0;

      let uData = d.unitMap.get(item.unit);
      if (!uData) {
        uData = { gross: 0, test: 0, net: 0 };
        d.unitMap.set(item.unit, uData);
      }
      uData.gross += grossMilli;
      uData.test += testMilli;
      uData.net += netMilli;
    }

    const byDispenser = Array.from(dispenserMap.values()).map(d => ({
      dispenserId: d.dispenserId,
      dispenserNumber: d.dispenserNumber,
      name: d.name,
      totalsByUnit: Array.from(d.unitMap.entries()).map(([unit, totals]) => ({
        unit,
        grossQuantity: formatMilliunits(totals.gross),
        testingQuantity: formatMilliunits(totals.test),
        netQuantity: formatMilliunits(totals.net),
      })),
    })).sort((a, b) => a.dispenserNumber - b.dispenserNumber);

    // By product aggregation
    const productMap = new Map<string, {
      productId: string;
      productCode: string;
      productName: string;
      productCategory: string;
      unit: ProductUnit;
      grossMilli: number;
      testMilli: number;
      netMilli: number;
    }>();

    for (const snap of snapshots) {
      let p = productMap.get(snap.productId);
      if (!p) {
        p = {
          productId: snap.productId,
          productCode: snap.productCode,
          productName: snap.productName,
          productCategory: snap.productCategory,
          unit: snap.productUnit,
          grossMilli: 0,
          testMilli: 0,
          netMilli: 0,
        };
        productMap.set(snap.productId, p);
      }

      const r = readingMap.get(snap.nozzleId);
      if (r) {
        p.grossMilli += r.grossSalesQuantityMilliunits ?? 0;
        p.testMilli += r.testingQuantityMilliunits ?? 0;
        p.netMilli += r.netSalesQuantityMilliunits ?? 0;
      }
    }

    const byProduct = Array.from(productMap.values()).map(p => ({
      productId: p.productId,
      productCode: p.productCode,
      productName: p.productName,
      productCategory: p.productCategory,
      unit: p.unit,
      grossQuantity: formatMilliunits(p.grossMilli),
      testingQuantity: formatMilliunits(p.testMilli),
      netQuantity: formatMilliunits(p.netMilli),
    }));

    // Overall Totals Grouped By Physical Unit (NEVER merge Litres and KG)
    const overallUnitMap = new Map<ProductUnit, { gross: number; test: number; net: number }>();
    for (const p of productMap.values()) {
      let u = overallUnitMap.get(p.unit);
      if (!u) {
        u = { gross: 0, test: 0, net: 0 };
        overallUnitMap.set(p.unit, u);
      }
      u.gross += p.grossMilli;
      u.test += p.testMilli;
      u.net += p.netMilli;
    }

    const totalsByUnit: UnitQuantitySummary[] = Array.from(overallUnitMap.entries()).map(([unit, t]) => ({
      unit,
      grossQuantity: formatMilliunits(t.gross),
      testingQuantity: formatMilliunits(t.test),
      netQuantity: formatMilliunits(t.net),
    }));

    return {
      operationalShiftId: shift.id,
      businessDate: shift.businessDate,
      status: shift.status,
      outletId: shift.outletId,
      byNozzle,
      byDispenser,
      byProduct,
      totalsByUnit,
    };
  }

  // ==========================================
  // PHASE 2B: TANK CALIBRATION CHARTS & POINTS
  // ==========================================

  private formatCalibrationChartRow(
    row: typeof schema.tankCalibrationCharts.$inferSelect,
    extra?: {
      pointsCount?: number;
      isReferenced?: boolean;
      referencedReadingsCount?: number;
      referencedShiftsCount?: number;
    }
  ): TankCalibrationChart {
    return {
      ...row,
      status: row.status as TankCalibrationChartStatus,
      chartUnitDip: (row.chartUnitDip || 'MM') as 'MM',
      chartUnitVolume: (row.chartUnitVolume || 'LITRES') as 'LITRES',
      tankDiameterMmStr:
        row.tankDiameterMmMilliunits != null
          ? formatMilliunits(row.tankDiameterMmMilliunits)
          : null,
      tankLengthMmStr:
        row.tankLengthMmMilliunits != null
          ? formatMilliunits(row.tankLengthMmMilliunits)
          : null,
      maxDipMmStr:
        row.maxDipMmMilliunits != null
          ? formatMilliunits(row.maxDipMmMilliunits)
          : null,
      chartCapacityLitreStr:
        row.chartCapacityMilliunits != null
          ? formatMilliunits(row.chartCapacityMilliunits)
          : null,
      chartCapacityLitresStr:
        row.chartCapacityMilliunits != null
          ? formatMilliunits(row.chartCapacityMilliunits)
          : null,
      pointsCount: extra?.pointsCount,
      isReferenced: extra?.isReferenced ?? false,
      referencedReadingsCount: extra?.referencedReadingsCount ?? 0,
      referencedShiftsCount: extra?.referencedShiftsCount ?? 0,
    };
  }

  /**
   * Ensures any legacy unversioned calibration points (`chart_id IS NULL`) for a tank
   * are linked to an initial Revision 1 ACTIVE chart header without losing data.
   */
  async ensureInitialCalibrationChartForLegacyPoints(
    tankId: string,
    actorUserId?: string
  ): Promise<void> {
    const legacyPoints = await this.db
      .select()
      .from(schema.tankCalibrationPoints)
      .where(
        and(
          eq(schema.tankCalibrationPoints.tankId, tankId),
          isNull(schema.tankCalibrationPoints.chartId)
        )
      )
      .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits));

    if (legacyPoints.length === 0) {
      return;
    }

    const existingCharts = await this.db
      .select()
      .from(schema.tankCalibrationCharts)
      .where(eq(schema.tankCalibrationCharts.tankId, tankId))
      .orderBy(asc(schema.tankCalibrationCharts.revisionNumber));

    let targetChart = existingCharts.find(c => c.status === 'ACTIVE') || existingCharts[0];

    if (!targetChart) {
      const maxDip = Math.max(...legacyPoints.map(p => p.dipMillimetresMilliunits));
      const maxVol = Math.max(...legacyPoints.map(p => p.volumeMilliunits));
      const earliestCreated = legacyPoints[0].createdAt || new Date().toISOString();
      const creator = actorUserId || legacyPoints[0].createdBy || null;
      const chartId = `tcc-legacy-${tankId}-r1`;

      await this.db
        .insert(schema.tankCalibrationCharts)
        .values({
          id: chartId,
          tankId,
          revisionNumber: 1,
          status: 'ACTIVE',
          chartUnitDip: 'MM',
          chartUnitVolume: 'LITRES',
          tankDiameterMmMilliunits: maxDip,
          tankLengthMmMilliunits: null,
          maxDipMmMilliunits: maxDip,
          chartCapacityMilliunits: maxVol,
          sourceFileName: 'legacy-d1-preserved',
          referenceDocument: 'REV-1-INITIAL',
          notes: 'Automatically preserved initial calibration chart from existing points',
          effectiveFrom: earliestCreated.slice(0, 10),
          effectiveTo: null,
          approvedBy: creator,
          approvedAt: earliestCreated,
          createdAt: earliestCreated,
          createdBy: creator,
          updatedAt: earliestCreated,
          updatedBy: creator,
        })
        .onConflictDoNothing();

      const [inserted] = await this.db
        .select()
        .from(schema.tankCalibrationCharts)
        .where(eq(schema.tankCalibrationCharts.id, chartId))
        .limit(1);
      targetChart = inserted;
    }

    if (targetChart) {
      await this.db
        .update(schema.tankCalibrationPoints)
        .set({ chartId: targetChart.id })
        .where(
          and(
            eq(schema.tankCalibrationPoints.tankId, tankId),
            isNull(schema.tankCalibrationPoints.chartId)
          )
        );
    }
  }

  /**
   * Checks whether a specific calibration chart revision is referenced by any saved
   * historical tank stock readings (`OPENING`, `CLOSING`, `PRE_RECEIPT`, `POST_RECEIPT`, `ADHOC`).
   */
  async isCalibrationChartReferenced(
    tankId: string,
    chartId: string,
    revisionNumber?: number
  ): Promise<{
    isReferenced: boolean;
    referencedReadingsCount: number;
    referencedShiftsCount: number;
  }> {
    const readings = await this.db
      .select({
        id: schema.tankStockReadings.id,
        operationalShiftId: schema.tankStockReadings.operationalShiftId,
        calibrationChartId: schema.tankStockReadings.calibrationChartId,
      })
      .from(schema.tankStockReadings)
      .where(
        and(
          eq(schema.tankStockReadings.tankId, tankId),
          revisionNumber === 1
            ? or(
                eq(schema.tankStockReadings.calibrationChartId, chartId),
                isNull(schema.tankStockReadings.calibrationChartId)
              )
            : eq(schema.tankStockReadings.calibrationChartId, chartId)
        )
      );

    const shiftIds = new Set(readings.map(r => r.operationalShiftId));
    return {
      isReferenced: readings.length > 0,
      referencedReadingsCount: readings.length,
      referencedShiftsCount: shiftIds.size,
    };
  }

  async listCalibrationCharts(tankId: string): Promise<TankCalibrationChart[]> {
    await this.ensureInitialCalibrationChartForLegacyPoints(tankId);

    const charts = await this.db
      .select()
      .from(schema.tankCalibrationCharts)
      .where(eq(schema.tankCalibrationCharts.tankId, tankId))
      .orderBy(desc(schema.tankCalibrationCharts.revisionNumber));

    if (charts.length === 0) {
      return [];
    }

    const allPoints = await this.db
      .select({
        id: schema.tankCalibrationPoints.id,
        chartId: schema.tankCalibrationPoints.chartId,
      })
      .from(schema.tankCalibrationPoints)
      .where(eq(schema.tankCalibrationPoints.tankId, tankId));

    const pointsCountByChart = new Map<string, number>();
    for (const pt of allPoints) {
      if (pt.chartId) {
        pointsCountByChart.set(pt.chartId, (pointsCountByChart.get(pt.chartId) || 0) + 1);
      }
    }

    const enriched: TankCalibrationChart[] = [];
    for (const c of charts) {
      const refStats = await this.isCalibrationChartReferenced(
        tankId,
        c.id,
        c.revisionNumber
      );
      enriched.push(
        this.formatCalibrationChartRow(c, {
          pointsCount: pointsCountByChart.get(c.id) || 0,
          ...refStats,
        })
      );
    }

    return enriched;
  }

  async findCalibrationChartById(chartId: string): Promise<TankCalibrationChart | null> {
    const [row] = await this.db
      .select()
      .from(schema.tankCalibrationCharts)
      .where(eq(schema.tankCalibrationCharts.id, chartId))
      .limit(1);

    if (!row) return null;

    const pts = await this.db
      .select({ id: schema.tankCalibrationPoints.id })
      .from(schema.tankCalibrationPoints)
      .where(eq(schema.tankCalibrationPoints.chartId, row.id));

    const refStats = await this.isCalibrationChartReferenced(
      row.tankId,
      row.id,
      row.revisionNumber
    );

    return this.formatCalibrationChartRow(row, {
      pointsCount: pts.length,
      ...refStats,
    });
  }

  async findActiveCalibrationChart(tankId: string): Promise<TankCalibrationChart | null> {
    await this.ensureInitialCalibrationChartForLegacyPoints(tankId);

    const [row] = await this.db
      .select()
      .from(schema.tankCalibrationCharts)
      .where(
        and(
          eq(schema.tankCalibrationCharts.tankId, tankId),
          eq(schema.tankCalibrationCharts.status, 'ACTIVE')
        )
      )
      .limit(1);

    if (!row) return null;
    return this.findCalibrationChartById(row.id);
  }

  async listCalibrationPoints(
    tankId: string,
    options?: { chartId?: string | null; revisionNumber?: number | null }
  ): Promise<TankCalibrationPoint[]> {
    await this.ensureInitialCalibrationChartForLegacyPoints(tankId);

    let targetChartId = options?.chartId || null;

    if (!targetChartId && options?.revisionNumber != null) {
      const [revChart] = await this.db
        .select()
        .from(schema.tankCalibrationCharts)
        .where(
          and(
            eq(schema.tankCalibrationCharts.tankId, tankId),
            eq(schema.tankCalibrationCharts.revisionNumber, options.revisionNumber)
          )
        )
        .limit(1);
      if (!revChart) {
        return [];
      }
      targetChartId = revChart.id;
    }

    if (!targetChartId) {
      const [activeChart] = await this.db
        .select()
        .from(schema.tankCalibrationCharts)
        .where(
          and(
            eq(schema.tankCalibrationCharts.tankId, tankId),
            eq(schema.tankCalibrationCharts.status, 'ACTIVE')
          )
        )
        .limit(1);

      if (activeChart) {
        targetChartId = activeChart.id;
      } else {
        // If no ACTIVE chart exists yet, check if there are any charts at all
        const [anyChart] = await this.db
          .select()
          .from(schema.tankCalibrationCharts)
          .where(eq(schema.tankCalibrationCharts.tankId, tankId))
          .orderBy(desc(schema.tankCalibrationCharts.revisionNumber))
          .limit(1);

        if (anyChart) {
          // Note: For operational callers (`listCalibrationPoints(tankId)` without options),
          // only ACTIVE charts should be treated as operationally calibrated!
          return [];
        }
      }
    }

    const rows = targetChartId
      ? await this.db
          .select()
          .from(schema.tankCalibrationPoints)
          .where(
            and(
              eq(schema.tankCalibrationPoints.tankId, tankId),
              eq(schema.tankCalibrationPoints.chartId, targetChartId)
            )
          )
          .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits))
      : await this.db
          .select()
          .from(schema.tankCalibrationPoints)
          .where(eq(schema.tankCalibrationPoints.tankId, tankId))
          .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits));

    return rows.map(r => ({
      ...r,
      dipMmStr: formatMilliunits(r.dipMillimetresMilliunits),
      volumeLitreStr: formatMilliunits(r.volumeMilliunits),
    }));
  }

  async findCalibrationPointById(id: string): Promise<TankCalibrationPoint | null> {
    const [row] = await this.db.select().from(schema.tankCalibrationPoints).where(eq(schema.tankCalibrationPoints.id, id));
    if (!row) return null;
    return {
      ...row,
      dipMmStr: formatMilliunits(row.dipMillimetresMilliunits),
      volumeLitreStr: formatMilliunits(row.volumeMilliunits),
    };
  }

  /**
   * Ensures a target calibration chart exists and is NOT locked by historical readings
   * before allowing in-place single-point mutations (`createCalibrationPoint`, `updateCalibrationPoint`, `deleteCalibrationPoint`).
   */
  async resolveEditableChartForSinglePoint(
    tankId: string,
    actorUserId: string,
    preferredChartId?: string | null
  ): Promise<TankCalibrationChart> {
    await this.ensureInitialCalibrationChartForLegacyPoints(tankId, actorUserId);

    let chart: TankCalibrationChart | null = null;
    if (preferredChartId) {
      chart = await this.findCalibrationChartById(preferredChartId);
      if (!chart || chart.tankId !== tankId) {
        const err = new Error('Specified tank calibration chart revision was not found for this tank');
        (err as any).code = 'CHART_NOT_FOUND';
        throw err;
      }
    } else {
      chart = await this.findActiveCalibrationChart(tankId);
      if (!chart) {
        const charts = await this.listCalibrationCharts(tankId);
        chart = charts.find(c => c.status === 'DRAFT' || c.status === 'APPROVED') || null;
      }
    }

    if (!chart) {
      const nowIso = new Date().toISOString();
      const newChartId = `tcc-${tankId}-r1`;
      await this.db.insert(schema.tankCalibrationCharts).values({
        id: newChartId,
        tankId,
        revisionNumber: 1,
        status: 'ACTIVE',
        chartUnitDip: 'MM',
        chartUnitVolume: 'LITRES',
        tankDiameterMmMilliunits: null,
        tankLengthMmMilliunits: null,
        maxDipMmMilliunits: null,
        chartCapacityMilliunits: null,
        sourceFileName: null,
        referenceDocument: 'REV-1-INITIAL',
        notes: 'Initial calibration chart created via point entry',
        effectiveFrom: nowIso.slice(0, 10),
        effectiveTo: null,
        approvedBy: actorUserId,
        approvedAt: nowIso,
        createdAt: nowIso,
        createdBy: actorUserId,
        updatedAt: nowIso,
        updatedBy: actorUserId,
      });
      chart = (await this.findCalibrationChartById(newChartId))!;
    }

    if (chart.status === 'SUPERSEDED' || chart.status === 'ARCHIVED') {
      const err = new Error(
        `Calibration chart Revision #${chart.revisionNumber} is ${chart.status} and cannot be modified in place. Please create or edit a new revision.`
      );
      (err as any).code = 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE';
      throw err;
    }

    if (chart.isReferenced) {
      const err = new Error(
        `Calibration chart Revision #${chart.revisionNumber} is referenced by ${chart.referencedReadingsCount} saved tank dip reading(s) across ${chart.referencedShiftsCount} shift(s) and cannot be overwritten in place. Create a new chart revision instead.`
      );
      (err as any).code = 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE';
      throw err;
    }

    return chart;
  }

  private async refreshChartComputedBounds(chartId: string, actorUserId?: string): Promise<void> {
    const pts = await this.db
      .select()
      .from(schema.tankCalibrationPoints)
      .where(eq(schema.tankCalibrationPoints.chartId, chartId))
      .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits));

    const maxDip = pts.length > 0 ? pts[pts.length - 1].dipMillimetresMilliunits : null;
    const maxVol = pts.length > 0 ? pts[pts.length - 1].volumeMilliunits : null;

    await this.db
      .update(schema.tankCalibrationCharts)
      .set({
        maxDipMmMilliunits: maxDip,
        chartCapacityMilliunits: maxVol,
        updatedAt: new Date().toISOString(),
        ...(actorUserId ? { updatedBy: actorUserId } : {}),
      })
      .where(eq(schema.tankCalibrationCharts.id, chartId));
  }

  async createCalibrationPoint(data: {
    id: string;
    chartId?: string | null;
    tankId: string;
    dipMillimetresMilliunits: number;
    volumeMilliunits: number;
    createdAt: string;
    createdBy: string;
  }): Promise<TankCalibrationPoint> {
    const editableChart = await this.resolveEditableChartForSinglePoint(
      data.tankId,
      data.createdBy,
      data.chartId
    );

    await this.db.insert(schema.tankCalibrationPoints).values({
      ...data,
      chartId: editableChart.id,
    });
    await this.refreshChartComputedBounds(editableChart.id, data.createdBy);
    return (await this.findCalibrationPointById(data.id))!;
  }

  async updateCalibrationPoint(
    id: string,
    data: Partial<{
      dipMillimetresMilliunits: number;
      volumeMilliunits: number;
    }>,
    actorUserId?: string
  ): Promise<TankCalibrationPoint | null> {
    const existing = await this.findCalibrationPointById(id);
    if (!existing) return null;

    const editableChart = await this.resolveEditableChartForSinglePoint(
      existing.tankId,
      actorUserId || existing.createdBy,
      existing.chartId
    );

    await this.db
      .update(schema.tankCalibrationPoints)
      .set(data)
      .where(eq(schema.tankCalibrationPoints.id, id));
    await this.refreshChartComputedBounds(editableChart.id, actorUserId);
    return this.findCalibrationPointById(id);
  }

  async deleteCalibrationPoint(id: string, actorUserId?: string): Promise<boolean> {
    const existing = await this.findCalibrationPointById(id);
    if (!existing) return false;

    const editableChart = await this.resolveEditableChartForSinglePoint(
      existing.tankId,
      actorUserId || existing.createdBy,
      existing.chartId
    );

    await this.db
      .delete(schema.tankCalibrationPoints)
      .where(eq(schema.tankCalibrationPoints.id, id));
    await this.refreshChartComputedBounds(editableChart.id, actorUserId);
    return true;
  }

  async bulkImportCalibrationPoints(
    tankId: string,
    points: Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }>,
    createdBy: string,
    options?: {
      metadata?: {
        chartUnitDip?: 'MM';
        chartUnitVolume?: 'LITRES';
        tankDiameterMmMilliunits?: number | null;
        tankLengthMmMilliunits?: number | null;
        maxDipMmMilliunits?: number | null;
        chartCapacityMilliunits?: number | null;
        sourceFileName?: string | null;
        referenceDocument?: string | null;
        notes?: string | null;
        effectiveFrom?: string;
        effectiveTo?: string | null;
      };
      saveMode?: 'ACTIVE' | 'DRAFT' | 'APPROVED';
      activateImmediately?: boolean;
      createNewRevision?: boolean;
      chartId?: string | null;
    }
  ): Promise<TankCalibrationPoint[]> {
    const nowIso = new Date().toISOString();
    const sorted = [...points].sort((a, b) => a.dipMillimetresMilliunits - b.dipMillimetresMilliunits);

    if (sorted.length < 2) {
      throw new Error('At least 2 calibration points are required to define a calibration chart');
    }

    // Validate monotonicity & duplicates
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].dipMillimetresMilliunits === sorted[i + 1].dipMillimetresMilliunits) {
        throw new Error(`Duplicate dip height ${formatMilliunits(sorted[i].dipMillimetresMilliunits)} mm in calibration chart`);
      }
      if (sorted[i].volumeMilliunits > sorted[i + 1].volumeMilliunits) {
        throw new Error(
          `Non-monotonic calibration chart: volume ${formatMilliunits(sorted[i].volumeMilliunits)} L at ${formatMilliunits(sorted[i].dipMillimetresMilliunits)} mm is greater than volume ${formatMilliunits(sorted[i + 1].volumeMilliunits)} L at ${formatMilliunits(sorted[i + 1].dipMillimetresMilliunits)} mm`
        );
      }
    }

    await this.ensureInitialCalibrationChartForLegacyPoints(tankId, createdBy);
    const existingCharts = await this.listCalibrationCharts(tankId);
    const maxRevision = existingCharts.reduce(
      (max, c) => (c.revisionNumber > max ? c.revisionNumber : max),
      0
    );
    const currentActiveChart = existingCharts.find(c => c.status === 'ACTIVE') || null;

    const requestedSaveMode: 'ACTIVE' | 'DRAFT' | 'APPROVED' =
      options?.activateImmediately === true || options?.saveMode === 'ACTIVE'
        ? 'ACTIVE'
        : options?.saveMode === 'APPROVED'
          ? 'APPROVED'
          : 'DRAFT';
    const meta = options?.metadata || {};
    const computedMaxDip = meta.maxDipMmMilliunits ?? sorted[sorted.length - 1].dipMillimetresMilliunits;
    const computedMaxVol = meta.chartCapacityMilliunits ?? sorted[sorted.length - 1].volumeMilliunits;
    const effectiveFrom = meta.effectiveFrom || nowIso.slice(0, 10);

    // Determine whether we can update an unreferenced chart in place or must create a new revision
    let targetChart: TankCalibrationChart | null = null;
    if (options?.chartId) {
      targetChart = existingCharts.find(c => c.id === options.chartId) || null;
      if (
        targetChart &&
        options.createNewRevision === false &&
        (targetChart.isReferenced ||
          targetChart.status === 'SUPERSEDED' ||
          targetChart.status === 'ARCHIVED')
      ) {
        const err = new Error(
          `Calibration chart Revision #${targetChart.revisionNumber} is locked by historical operational records (${targetChart.referencedReadingsCount ?? 0} readings, ${targetChart.referencedShiftsCount ?? 0} shifts) and cannot be overwritten in place.`
        );
        (err as any).code = 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE';
        throw err;
      }
    } else if (!options?.createNewRevision && currentActiveChart && !currentActiveChart.isReferenced && requestedSaveMode === 'ACTIVE') {
      targetChart = currentActiveChart;
    }

    const mustCreateNewRevision =
      !targetChart ||
      Boolean(options?.createNewRevision) ||
      Boolean(targetChart.isReferenced) ||
      targetChart.status === 'SUPERSEDED' ||
      targetChart.status === 'ARCHIVED' ||
      (targetChart.status === 'ACTIVE' && requestedSaveMode !== 'ACTIVE');

    const batchStmts: any[] = [];
    let finalChartId: string;

    if (mustCreateNewRevision) {
      const nextRevision = maxRevision + 1;
      finalChartId = `tcc-${tankId}-r${nextRevision}-${crypto.randomUUID().slice(0, 8)}`;

      // If activating immediately, supersede any currently ACTIVE chart for this tank
      if (requestedSaveMode === 'ACTIVE' && currentActiveChart) {
        batchStmts.push(
          this.db
            .update(schema.tankCalibrationCharts)
            .set({
              status: 'SUPERSEDED',
              effectiveTo: effectiveFrom,
              updatedAt: nowIso,
              updatedBy: createdBy,
            })
            .where(
              and(
                eq(schema.tankCalibrationCharts.tankId, tankId),
                eq(schema.tankCalibrationCharts.status, 'ACTIVE')
              )
            )
        );
      }

      batchStmts.push(
        this.db.insert(schema.tankCalibrationCharts).values({
          id: finalChartId,
          tankId,
          revisionNumber: nextRevision,
          status: requestedSaveMode,
          chartUnitDip: 'MM',
          chartUnitVolume: 'LITRES',
          tankDiameterMmMilliunits:
            meta.tankDiameterMmMilliunits ??
            currentActiveChart?.tankDiameterMmMilliunits ??
            computedMaxDip,
          tankLengthMmMilliunits:
            meta.tankLengthMmMilliunits ??
            currentActiveChart?.tankLengthMmMilliunits ??
            null,
          maxDipMmMilliunits: computedMaxDip,
          chartCapacityMilliunits: computedMaxVol,
          sourceFileName: meta.sourceFileName ?? null,
          referenceDocument: meta.referenceDocument ?? `REV-${nextRevision}`,
          notes: meta.notes ?? null,
          effectiveFrom,
          effectiveTo: meta.effectiveTo ?? null,
          approvedBy:
            requestedSaveMode === 'ACTIVE' || requestedSaveMode === 'APPROVED'
              ? createdBy
              : null,
          approvedAt:
            requestedSaveMode === 'ACTIVE' || requestedSaveMode === 'APPROVED'
              ? nowIso
              : null,
          createdAt: nowIso,
          createdBy,
          updatedAt: nowIso,
          updatedBy: createdBy,
        })
      );
    } else {
      // Unreferenced chart: safe to update in place
      finalChartId = targetChart!.id;

      if (requestedSaveMode === 'ACTIVE' && currentActiveChart && currentActiveChart.id !== finalChartId) {
        batchStmts.push(
          this.db
            .update(schema.tankCalibrationCharts)
            .set({
              status: 'SUPERSEDED',
              effectiveTo: effectiveFrom,
              updatedAt: nowIso,
              updatedBy: createdBy,
            })
            .where(
              and(
                eq(schema.tankCalibrationCharts.tankId, tankId),
                eq(schema.tankCalibrationCharts.status, 'ACTIVE')
              )
            )
        );
      }

      batchStmts.push(
        this.db
          .update(schema.tankCalibrationCharts)
          .set({
            status: requestedSaveMode,
            tankDiameterMmMilliunits:
              meta.tankDiameterMmMilliunits !== undefined
                ? meta.tankDiameterMmMilliunits
                : targetChart!.tankDiameterMmMilliunits ?? computedMaxDip,
            tankLengthMmMilliunits:
              meta.tankLengthMmMilliunits !== undefined
                ? meta.tankLengthMmMilliunits
                : targetChart!.tankLengthMmMilliunits,
            maxDipMmMilliunits: computedMaxDip,
            chartCapacityMilliunits: computedMaxVol,
            sourceFileName:
              meta.sourceFileName !== undefined
                ? meta.sourceFileName
                : targetChart!.sourceFileName,
            referenceDocument:
              meta.referenceDocument !== undefined
                ? meta.referenceDocument
                : targetChart!.referenceDocument,
            notes:
              meta.notes !== undefined ? meta.notes : targetChart!.notes,
            effectiveFrom: meta.effectiveFrom || targetChart!.effectiveFrom || effectiveFrom,
            effectiveTo:
              meta.effectiveTo !== undefined
                ? meta.effectiveTo
                : targetChart!.effectiveTo,
            approvedBy:
              requestedSaveMode === 'ACTIVE' || requestedSaveMode === 'APPROVED'
                ? createdBy
                : targetChart!.approvedBy,
            approvedAt:
              requestedSaveMode === 'ACTIVE' || requestedSaveMode === 'APPROVED'
                ? nowIso
                : targetChart!.approvedAt,
            updatedAt: nowIso,
            updatedBy: createdBy,
          })
          .where(eq(schema.tankCalibrationCharts.id, finalChartId))
      );

      batchStmts.push(
        this.db
          .delete(schema.tankCalibrationPoints)
          .where(eq(schema.tankCalibrationPoints.chartId, finalChartId))
      );
    }

    const insertRows = sorted.map(p => ({
      id: `tcp-${crypto.randomUUID()}`,
      chartId: finalChartId,
      tankId,
      dipMillimetresMilliunits: p.dipMillimetresMilliunits,
      volumeMilliunits: p.volumeMilliunits,
      createdAt: nowIso,
      createdBy,
    }));

    for (const chunk of chunkArray(insertRows, SNAPSHOT_INSERT_CHUNK_SIZE)) {
      if (chunk.length > 0) {
        batchStmts.push(this.db.insert(schema.tankCalibrationPoints).values(chunk));
      }
    }

    await (this.db as any).batch(batchStmts);

    return this.listCalibrationPoints(tankId, { chartId: finalChartId });
  }

  /**
   * Transitions a calibration chart revision (`DRAFT -> APPROVED`, `DRAFT/APPROVED -> ACTIVE`, or `ARCHIVED`).
   * Activating a revision atomically marks any previous ACTIVE revision for the tank as `SUPERSEDED`.
   */
  async updateCalibrationChartStatus(
    tankId: string,
    chartId: string,
    nextStatus: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED',
    actorUserId: string,
    options?: {
      effectiveFrom?: string;
      effectiveTo?: string | null;
      notes?: string | null;
    }
  ): Promise<TankCalibrationChart> {
    const chart = await this.findCalibrationChartById(chartId);
    if (!chart || chart.tankId !== tankId) {
      const err = new Error('Tank calibration chart revision not found');
      (err as any).code = 'CHART_NOT_FOUND';
      throw err;
    }

    if (
      chart.status === 'SUPERSEDED' ||
      chart.status === 'ARCHIVED' ||
      (chart.isReferenced && (nextStatus === 'DRAFT' || nextStatus === 'ARCHIVED' || nextStatus === 'APPROVED')) ||
      (chart.status === 'ACTIVE' && (nextStatus === 'DRAFT' || nextStatus === 'APPROVED'))
    ) {
      const err = new Error(
        `Calibration chart Revision #${chart.revisionNumber} (${chart.status}) is immutable or referenced by historical operational records and cannot transition to ${nextStatus}. Fork a new revision instead.`
      );
      (err as any).code = 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE';
      throw err;
    }

    const pts = await this.listCalibrationPoints(tankId, { chartId });
    if ((nextStatus === 'APPROVED' || nextStatus === 'ACTIVE') && pts.length < 2) {
      const err = new Error(
        'Cannot approve or activate a calibration chart revision with fewer than 2 calibration points'
      );
      (err as any).code = 'INSUFFICIENT_CALIBRATION_POINTS';
      throw err;
    }

    const nowIso = new Date().toISOString();
    const effectiveFrom = options?.effectiveFrom || chart.effectiveFrom || nowIso.slice(0, 10);
    const batchStmts: any[] = [];

    if (nextStatus === 'ACTIVE') {
      batchStmts.push(
        this.db
          .update(schema.tankCalibrationCharts)
          .set({
            status: 'SUPERSEDED',
            effectiveTo: effectiveFrom,
            updatedAt: nowIso,
            updatedBy: actorUserId,
          })
          .where(
            and(
              eq(schema.tankCalibrationCharts.tankId, tankId),
              eq(schema.tankCalibrationCharts.status, 'ACTIVE'),
              ne(schema.tankCalibrationCharts.id, chartId)
            )
          )
      );
    }

    batchStmts.push(
      this.db
        .update(schema.tankCalibrationCharts)
        .set({
          status: nextStatus,
          effectiveFrom,
          effectiveTo:
            options?.effectiveTo !== undefined
              ? options.effectiveTo
              : nextStatus === 'ARCHIVED'
                ? nowIso.slice(0, 10)
                : chart.effectiveTo,
          notes: options?.notes !== undefined ? options.notes : chart.notes,
          approvedBy:
            nextStatus === 'APPROVED' || nextStatus === 'ACTIVE'
              ? actorUserId
              : chart.approvedBy,
          approvedAt:
            nextStatus === 'APPROVED' || nextStatus === 'ACTIVE'
              ? nowIso
              : chart.approvedAt,
          updatedAt: nowIso,
          updatedBy: actorUserId,
        })
        .where(eq(schema.tankCalibrationCharts.id, chartId))
    );

    await (this.db as any).batch(batchStmts);
    return (await this.findCalibrationChartById(chartId))!;
  }

  /**
   * Forks an existing chart revision (e.g. a locked ACTIVE chart) into a new DRAFT (or ACTIVE)
   * revision so single points or metadata can be edited without mutating historical readings.
   */
  async forkCalibrationChartRevision(
    tankId: string,
    sourceChartId: string | null,
    actorUserId: string,
    options?: {
      saveMode?: 'DRAFT' | 'ACTIVE';
      notes?: string | null;
      effectiveFrom?: string;
    }
  ): Promise<{ chart: TankCalibrationChart; points: TankCalibrationPoint[] }> {
    await this.ensureInitialCalibrationChartForLegacyPoints(tankId, actorUserId);

    const sourceChart = sourceChartId
      ? await this.findCalibrationChartById(sourceChartId)
      : await this.findActiveCalibrationChart(tankId);

    if (!sourceChart || sourceChart.tankId !== tankId) {
      const err = new Error('Source calibration chart revision not found for this tank');
      (err as any).code = 'CHART_NOT_FOUND';
      throw err;
    }

    const sourcePoints = await this.listCalibrationPoints(tankId, {
      chartId: sourceChart.id,
    });

    const newPoints = await this.bulkImportCalibrationPoints(
      tankId,
      sourcePoints.map(p => ({
        dipMillimetresMilliunits: p.dipMillimetresMilliunits,
        volumeMilliunits: p.volumeMilliunits,
      })),
      actorUserId,
      {
        createNewRevision: true,
        saveMode: options?.saveMode || 'DRAFT',
        metadata: {
          tankDiameterMmMilliunits: sourceChart.tankDiameterMmMilliunits,
          tankLengthMmMilliunits: sourceChart.tankLengthMmMilliunits,
          maxDipMmMilliunits: sourceChart.maxDipMmMilliunits,
          chartCapacityMilliunits: sourceChart.chartCapacityMilliunits,
          sourceFileName: sourceChart.sourceFileName,
          referenceDocument: `CLONED-FROM-REV-${sourceChart.revisionNumber}`,
          notes:
            options?.notes ||
            `Cloned from Revision #${sourceChart.revisionNumber} for controlled update`,
          effectiveFrom: options?.effectiveFrom || new Date().toISOString().slice(0, 10),
        },
      }
    );

    const newChartId = newPoints[0]?.chartId;
    const newChart = newChartId
      ? (await this.findCalibrationChartById(newChartId))!
      : (await this.listCalibrationCharts(tankId))[0];

    return { chart: newChart, points: newPoints };
  }

  // ==========================================
  // PHASE 2B: TANK STOCK READINGS
  // ==========================================

  async listShiftTankReadings(shiftId: string): Promise<TankStockReading[]> {
    const rows = await this.db
      .select({
        reading: schema.tankStockReadings,
        tank: schema.tanks,
        product: schema.products,
        user: schema.users,
      })
      .from(schema.tankStockReadings)
      .innerJoin(schema.tanks, eq(schema.tankStockReadings.tankId, schema.tanks.id))
      .innerJoin(schema.products, eq(schema.tankStockReadings.productId, schema.products.id))
      .innerJoin(schema.users, eq(schema.tankStockReadings.recordedByUserId, schema.users.id))
      .where(eq(schema.tankStockReadings.operationalShiftId, shiftId))
      .orderBy(asc(schema.tankStockReadings.recordedAt), asc(schema.tanks.tankNumber));

    return rows.map(r => ({
      ...r.reading,
      readingType: r.reading.readingType as TankReadingType,
      source: r.reading.source as TankReadingSource,
      productDipMmStr: formatMilliunits(r.reading.productDipMmMilliunits),
      waterDipMmStr: formatMilliunits(r.reading.waterDipMmMilliunits),
      grossObservedVolumeStr: formatMilliunits(r.reading.grossObservedVolumeMilliunits),
      waterVolumeStr: formatMilliunits(r.reading.waterVolumeMilliunits),
      netProductVolumeStr: formatMilliunits(r.reading.netProductVolumeMilliunits),
      tankNumber: r.tank.tankNumber,
      tankName: r.tank.name,
      productCode: r.product.code,
      productName: r.product.name,
      recorderName: r.user.name,
    }));
  }

  async findTankReadingById(id: string): Promise<TankStockReading | null> {
    const [row] = await this.db
      .select({
        reading: schema.tankStockReadings,
        tank: schema.tanks,
        product: schema.products,
        user: schema.users,
      })
      .from(schema.tankStockReadings)
      .innerJoin(schema.tanks, eq(schema.tankStockReadings.tankId, schema.tanks.id))
      .innerJoin(schema.products, eq(schema.tankStockReadings.productId, schema.products.id))
      .innerJoin(schema.users, eq(schema.tankStockReadings.recordedByUserId, schema.users.id))
      .where(eq(schema.tankStockReadings.id, id));

    if (!row) return null;
    return {
      ...row.reading,
      readingType: row.reading.readingType as TankReadingType,
      source: row.reading.source as TankReadingSource,
      productDipMmStr: formatMilliunits(row.reading.productDipMmMilliunits),
      waterDipMmStr: formatMilliunits(row.reading.waterDipMmMilliunits),
      grossObservedVolumeStr: formatMilliunits(row.reading.grossObservedVolumeMilliunits),
      waterVolumeStr: formatMilliunits(row.reading.waterVolumeMilliunits),
      netProductVolumeStr: formatMilliunits(row.reading.netProductVolumeMilliunits),
      tankNumber: row.tank.tankNumber,
      tankName: row.tank.name,
      productCode: row.product.code,
      productName: row.product.name,
      recorderName: row.user.name,
    };
  }

  async findShiftTankReadingByType(shiftId: string, tankId: string, readingType: TankReadingType): Promise<TankStockReading | null> {
    const [row] = await this.db
      .select()
      .from(schema.tankStockReadings)
      .where(
        and(
          eq(schema.tankStockReadings.operationalShiftId, shiftId),
          eq(schema.tankStockReadings.tankId, tankId),
          eq(schema.tankStockReadings.readingType, readingType)
        )
      );
    if (!row) return null;
    return this.findTankReadingById(row.id);
  }

  async findPreviousShiftClosingStock(
    outletId: string,
    tankId: string,
    beforeStartedAt?: string
  ): Promise<{ closingStockMilliunits: number; closingStockStr: string; shiftId: string; businessDate: string } | null> {
    const rows = await this.db
      .select({
        reading: schema.tankStockReadings,
        shift: schema.operationalShifts,
      })
      .from(schema.tankStockReadings)
      .innerJoin(schema.operationalShifts, eq(schema.tankStockReadings.operationalShiftId, schema.operationalShifts.id))
      .where(
        and(
          eq(schema.tankStockReadings.outletId, outletId),
          eq(schema.tankStockReadings.tankId, tankId),
          eq(schema.tankStockReadings.readingType, 'CLOSING'),
          eq(schema.operationalShifts.status, 'CLOSED')
        )
      )
      .orderBy(desc(schema.operationalShifts.businessDate), desc(schema.operationalShifts.startedAt))
      .limit(1);

    if (!rows || rows.length === 0) return null;
    const item = rows[0];
    return {
      closingStockMilliunits: item.reading.netProductVolumeMilliunits,
      closingStockStr: formatMilliunits(item.reading.netProductVolumeMilliunits),
      shiftId: item.shift.id,
      businessDate: item.shift.businessDate,
    };
  }

  /**
   * Persist all prepared tank readings in a single D1 batch transaction.
   * Any constraint or shift-status failure rolls back the entire batch,
   * including updates to existing OPENING/CLOSING readings.
   *
   * Accepts already-calibrated values; deliberately does not change
   * conversion, chart assignment, or pump infrastructure.
   */
  async saveTankReadingsBatchAtomic(
    rows: Array<{
      id: string;
      operationalShiftId: string;
      outletId: string;
      tankId: string;
      productId: string;
      readingType: TankReadingType;
      source: TankReadingSource;
      productDipMmMilliunits: number;
      waterDipMmMilliunits: number;
      grossObservedVolumeMilliunits: number;
      waterVolumeMilliunits: number;
      netProductVolumeMilliunits: number;
      calibrationChartId: string | null;
      calibrationRevision: number | null;
      recordedAt: string;
      recordedByUserId: string;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
      action: 'CREATED' | 'UPDATED';
    }>
  ): Promise<Array<{ action: 'CREATED' | 'UPDATED'; reading: TankStockReading }>> {
    if (rows.length === 0) return [];
    const shiftId = rows[0].operationalShiftId;
    if (rows.some(row => row.operationalShiftId !== shiftId)) {
      throw new Error('BATCH_SHIFT_MISMATCH');
    }

    const statements = rows.map(row => {
      // A NOT NULL constraint is deliberately used to abort the entire D1
      // transaction if the shift is not OPEN at statement execution time.
      // A WHERE status=OPEN alone would silently affect 0 rows and let a
      // preceding successful statement commit.
      const guardedDip = sql<number>`CASE WHEN EXISTS (
        SELECT 1 FROM operational_shifts
        WHERE id = ${row.operationalShiftId} AND status = 'OPEN'
      ) THEN ${row.productDipMmMilliunits} ELSE NULL END`;

      return this.db.insert(schema.tankStockReadings).values({
        id: row.id,
        operationalShiftId: row.operationalShiftId,
        outletId: row.outletId,
        tankId: row.tankId,
        productId: row.productId,
        readingType: row.readingType,
        source: row.source,
        productDipMmMilliunits: guardedDip,
        waterDipMmMilliunits: row.waterDipMmMilliunits,
        grossObservedVolumeMilliunits: row.grossObservedVolumeMilliunits,
        waterVolumeMilliunits: row.waterVolumeMilliunits,
        netProductVolumeMilliunits: row.netProductVolumeMilliunits,
        calibrationChartId: row.calibrationChartId,
        calibrationRevision: row.calibrationRevision,
        recordedAt: row.recordedAt,
        recordedByUserId: row.recordedByUserId,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }).onConflictDoUpdate({
        target: schema.tankStockReadings.id,
        set: {
          source: row.source,
          productDipMmMilliunits: guardedDip,
          waterDipMmMilliunits: row.waterDipMmMilliunits,
          grossObservedVolumeMilliunits: row.grossObservedVolumeMilliunits,
          waterVolumeMilliunits: row.waterVolumeMilliunits,
          netProductVolumeMilliunits: row.netProductVolumeMilliunits,
          calibrationChartId: row.calibrationChartId ?? sql`calibration_chart_id`,
          calibrationRevision: row.calibrationRevision ?? sql`calibration_revision`,
          recordedAt: row.recordedAt,
          recordedByUserId: row.recordedByUserId,
          notes: row.notes,
          updatedAt: row.updatedAt,
        },
      }).returning({ id: schema.tankStockReadings.id });
    });

    // Drizzle's D1 batch delegates to D1Database.batch, which is
    // transactional, unlike a loop of individual awaited insert/update calls.
    const batchResults = await (this.db as any).batch(statements);
    // If D1.batch has resolved, the transaction may already be committed.
    // Report a distinct status instead of claiming that the batch was rolled back.
    if (!Array.isArray(batchResults) || batchResults.length !== rows.length ||
      batchResults.some((result: any, index: number) =>
        !Array.isArray(result) || result.length !== 1 || result[0]?.id !== rows[index].id
      )) {
      throw new Error('BATCH_COMMITTED_UNVERIFIED');
    }

    let persisted: Array<TankStockReading | null>;
    try {
      persisted = await Promise.all(rows.map(row => this.findTankReadingById(row.id)));
    } catch {
      throw new Error('BATCH_COMMITTED_UNVERIFIED');
    }
    if (persisted.some(reading => !reading)) throw new Error('BATCH_COMMITTED_UNVERIFIED');
    return persisted.map((reading, index) => ({
      action: rows[index].action,
      reading: reading as TankStockReading,
    }));
  }

  async createTankReadingConditional(data: {
    id: string;
    operationalShiftId: string;
    outletId: string;
    tankId: string;
    productId: string;
    readingType: TankReadingType;
    source: TankReadingSource;
    productDipMmMilliunits: number;
    waterDipMmMilliunits: number;
    grossObservedVolumeMilliunits: number;
    waterVolumeMilliunits: number;
    netProductVolumeMilliunits: number;
    calibrationChartId?: string | null;
    calibrationRevision?: number | null;
    recordedAt: string;
    recordedByUserId: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<{ success: boolean; reading: TankStockReading | null; shiftClosed?: boolean; conflict?: boolean; error?: string }> {
    const insertedRows = await this.db.all<{ id: string }>(
      sql`INSERT INTO tank_stock_readings (
            id, operational_shift_id, outlet_id, tank_id, product_id,
            reading_type, source, product_dip_mm_milliunits, water_dip_mm_milliunits,
            gross_observed_volume_milliunits, water_volume_milliunits, net_product_volume_milliunits,
            calibration_chart_id, calibration_revision,
            recorded_at, recorded_by_user_id, notes, created_at, updated_at
          )
          SELECT 
            ${data.id}, ${data.operationalShiftId}, ${data.outletId}, ${data.tankId}, ${data.productId},
            ${data.readingType}, ${data.source}, ${data.productDipMmMilliunits}, ${data.waterDipMmMilliunits},
            ${data.grossObservedVolumeMilliunits}, ${data.waterVolumeMilliunits}, ${data.netProductVolumeMilliunits},
            ${data.calibrationChartId ?? null}, ${data.calibrationRevision ?? null},
            ${data.recordedAt}, ${data.recordedByUserId}, ${data.notes || null}, ${data.createdAt}, ${data.updatedAt}
          WHERE EXISTS (
            SELECT 1 FROM operational_shifts WHERE id = ${data.operationalShiftId} AND status = 'OPEN'
          )
          RETURNING id`
    );

    if (!insertedRows || insertedRows.length === 0) {
      const shift = await this.findOperationalShiftById(data.operationalShiftId);
      if (!shift || shift.status !== 'OPEN') {
        return { success: false, reading: null, shiftClosed: true, error: 'SHIFT_CLOSED' };
      }
      return { success: false, reading: null, conflict: true, error: 'CONFLICT' };
    }

    const reading = await this.findTankReadingById(data.id);
    return { success: true, reading };
  }

  async findLatestClosedTankClosingReading(
    outletId: string,
    tankId: string
  ): Promise<{
    productDipMmMilliunits: number;
    productDipMmStr: string;
    waterDipMmMilliunits: number;
    waterDipMmStr: string;
    netProductVolumeMilliunits: number;
    netProductVolumeStr: string;
    shiftId: string;
    businessDate: string;
  } | null> {
    const rows = await this.db
      .select({
        reading: schema.tankStockReadings,
        shift: schema.operationalShifts,
      })
      .from(schema.tankStockReadings)
      .innerJoin(schema.operationalShifts, eq(schema.tankStockReadings.operationalShiftId, schema.operationalShifts.id))
      .where(
        and(
          eq(schema.tankStockReadings.outletId, outletId),
          eq(schema.tankStockReadings.tankId, tankId),
          eq(schema.tankStockReadings.readingType, 'CLOSING'),
          eq(schema.operationalShifts.status, 'CLOSED')
        )
      )
      .orderBy(desc(schema.operationalShifts.businessDate), desc(schema.operationalShifts.startedAt))
      .limit(1);

    if (!rows || rows.length === 0) return null;
    const item = rows[0];
    return {
      productDipMmMilliunits: item.reading.productDipMmMilliunits,
      productDipMmStr: formatMilliunits(item.reading.productDipMmMilliunits),
      waterDipMmMilliunits: item.reading.waterDipMmMilliunits,
      waterDipMmStr: formatMilliunits(item.reading.waterDipMmMilliunits),
      netProductVolumeMilliunits: item.reading.netProductVolumeMilliunits,
      netProductVolumeStr: formatMilliunits(item.reading.netProductVolumeMilliunits),
      shiftId: item.shift.id,
      businessDate: item.shift.businessDate,
    };
  }

  async updateTankReadingConditional(
    id: string,
    operationalShiftId: string,
    data: {
      source: TankReadingSource;
      productDipMmMilliunits: number;
      waterDipMmMilliunits: number;
      grossObservedVolumeMilliunits: number;
      waterVolumeMilliunits: number;
      netProductVolumeMilliunits: number;
      calibrationChartId?: string | null;
      calibrationRevision?: number | null;
      recordedAt: string;
      recordedByUserId: string;
      notes?: string | null;
      updatedAt: string;
    }
  ): Promise<{ success: boolean; reading: TankStockReading | null; shiftClosed?: boolean; error?: string }> {
    const updatedRows = await this.db.all<{ id: string }>(
      sql`UPDATE tank_stock_readings
          SET
            source = ${data.source},
            product_dip_mm_milliunits = ${data.productDipMmMilliunits},
            water_dip_mm_milliunits = ${data.waterDipMmMilliunits},
            gross_observed_volume_milliunits = ${data.grossObservedVolumeMilliunits},
            water_volume_milliunits = ${data.waterVolumeMilliunits},
            net_product_volume_milliunits = ${data.netProductVolumeMilliunits},
            calibration_chart_id = COALESCE(${data.calibrationChartId ?? null}, calibration_chart_id),
            calibration_revision = COALESCE(${data.calibrationRevision ?? null}, calibration_revision),
            recorded_at = ${data.recordedAt},
            recorded_by_user_id = ${data.recordedByUserId},
            notes = ${data.notes || null},
            updated_at = ${data.updatedAt}
          WHERE id = ${id} AND operational_shift_id = ${operationalShiftId}
            AND EXISTS (
              SELECT 1 FROM operational_shifts WHERE id = ${operationalShiftId} AND status = 'OPEN'
            )
          RETURNING id`
    );

    if (!updatedRows || updatedRows.length === 0) {
      const shift = await this.findOperationalShiftById(operationalShiftId);
      if (!shift || shift.status !== 'OPEN') {
        return { success: false, reading: null, shiftClosed: true, error: 'SHIFT_CLOSED' };
      }
      return { success: false, reading: null, error: 'NOT_FOUND' };
    }

    const reading = await this.findTankReadingById(id);
    return { success: true, reading };
  }

  async createTankReading(data: {
    id: string;
    operationalShiftId: string;
    outletId: string;
    tankId: string;
    productId: string;
    readingType: TankReadingType;
    source: TankReadingSource;
    productDipMmMilliunits: number;
    waterDipMmMilliunits: number;
    grossObservedVolumeMilliunits: number;
    waterVolumeMilliunits: number;
    netProductVolumeMilliunits: number;
    calibrationChartId?: string | null;
    calibrationRevision?: number | null;
    recordedAt: string;
    recordedByUserId: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<TankStockReading> {
    const res = await this.createTankReadingConditional(data);
    if (!res.success || !res.reading) {
      throw new Error(res.error || 'Failed to create tank reading');
    }
    return res.reading;
  }

  // ==========================================
  // PHASE 2B: FUEL RECEIPTS & TANK LINES
  // ==========================================

  async listFuelReceiptsByShift(shiftId: string): Promise<FuelReceipt[]> {
    const receiptRows = await this.db
      .select({
        receipt: schema.fuelReceipts,
        user: schema.users,
      })
      .from(schema.fuelReceipts)
      .innerJoin(schema.users, eq(schema.fuelReceipts.recordedByUserId, schema.users.id))
      .where(eq(schema.fuelReceipts.operationalShiftId, shiftId))
      .orderBy(desc(schema.fuelReceipts.createdAt));

    const lineRows = await this.db
      .select({
        line: schema.fuelReceiptTankLines,
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.fuelReceiptTankLines)
      .innerJoin(schema.tanks, eq(schema.fuelReceiptTankLines.tankId, schema.tanks.id))
      .innerJoin(schema.products, eq(schema.fuelReceiptTankLines.productId, schema.products.id))
      .innerJoin(schema.fuelReceipts, eq(schema.fuelReceiptTankLines.fuelReceiptId, schema.fuelReceipts.id))
      .where(eq(schema.fuelReceipts.operationalShiftId, shiftId));

    const lineMap = new Map<string, FuelReceiptTankLine[]>();
    for (const l of lineRows) {
      const arr = lineMap.get(l.line.fuelReceiptId) || [];
      arr.push({
        ...l.line,
        qualityStatus: l.line.qualityStatus as QualityStatus,
        invoiceQuantityStr: formatMilliunits(l.line.invoiceQuantityMilliunits),
        measuredReceivedQuantityStr: l.line.measuredReceivedQuantityMilliunits != null ? formatMilliunits(l.line.measuredReceivedQuantityMilliunits) : null,
        receiptVarianceStr: l.line.receiptVarianceMilliunits != null ? formatMilliunits(l.line.receiptVarianceMilliunits) : null,
        densityStr: l.line.densityMilliunits != null ? formatMilliunits(l.line.densityMilliunits) : null,
        temperatureStr: l.line.temperatureMilliunits != null ? formatMilliunits(l.line.temperatureMilliunits) : null,
        invoiceDensityStr: l.line.invoiceDensityMilliunits != null ? formatMilliunits(l.line.invoiceDensityMilliunits) : null,
        densityVarianceStr: l.line.densityVarianceMilliunits != null ? formatMilliunits(l.line.densityVarianceMilliunits) : null,
        tankNumber: l.tank.tankNumber,
        tankName: l.tank.name,
        productCode: l.product.code,
        productName: l.product.name,
      });
      lineMap.set(l.line.fuelReceiptId, arr);
    }

    return receiptRows.map(r => ({
      ...r.receipt,
      status: r.receipt.status as FuelReceiptStatus,
      sealVerified: Boolean(r.receipt.sealVerified),
      lines: lineMap.get(r.receipt.id) || [],
      recorderName: r.user.name,
    }));
  }

  async findFuelReceiptById(id: string): Promise<FuelReceipt | null> {
    const [row] = await this.db
      .select({
        receipt: schema.fuelReceipts,
        user: schema.users,
      })
      .from(schema.fuelReceipts)
      .innerJoin(schema.users, eq(schema.fuelReceipts.recordedByUserId, schema.users.id))
      .where(eq(schema.fuelReceipts.id, id));

    if (!row) return null;

    const lineRows = await this.db
      .select({
        line: schema.fuelReceiptTankLines,
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.fuelReceiptTankLines)
      .innerJoin(schema.tanks, eq(schema.fuelReceiptTankLines.tankId, schema.tanks.id))
      .innerJoin(schema.products, eq(schema.fuelReceiptTankLines.productId, schema.products.id))
      .where(eq(schema.fuelReceiptTankLines.fuelReceiptId, id));

    const lines: FuelReceiptTankLine[] = lineRows.map(l => ({
      ...l.line,
      qualityStatus: l.line.qualityStatus as QualityStatus,
      invoiceQuantityStr: formatMilliunits(l.line.invoiceQuantityMilliunits),
      measuredReceivedQuantityStr: l.line.measuredReceivedQuantityMilliunits != null ? formatMilliunits(l.line.measuredReceivedQuantityMilliunits) : null,
      receiptVarianceStr: l.line.receiptVarianceMilliunits != null ? formatMilliunits(l.line.receiptVarianceMilliunits) : null,
      densityStr: l.line.densityMilliunits != null ? formatMilliunits(l.line.densityMilliunits) : null,
      temperatureStr: l.line.temperatureMilliunits != null ? formatMilliunits(l.line.temperatureMilliunits) : null,
      invoiceDensityStr: l.line.invoiceDensityMilliunits != null ? formatMilliunits(l.line.invoiceDensityMilliunits) : null,
      densityVarianceStr: l.line.densityVarianceMilliunits != null ? formatMilliunits(l.line.densityVarianceMilliunits) : null,
      tankNumber: l.tank.tankNumber,
      tankName: l.tank.name,
      productCode: l.product.code,
      productName: l.product.name,
    }));

    return {
      ...row.receipt,
      status: row.receipt.status as FuelReceiptStatus,
      sealVerified: Boolean(row.receipt.sealVerified),
      lines,
      recorderName: row.user.name,
    };
  }

  async createFuelReceiptConditional(
    receiptData: {
      id: string;
      outletId: string;
      operationalShiftId: string;
      ttNumber: string;
      invoiceNumber: string;
      invoiceDate: string;
      arrivalAt: string;
      sealVerified: boolean;
      sealExceptionReason?: string | null;
      recordedByUserId: string;
      createdAt: string;
      updatedAt: string;
    },
    linesData: Array<{
      id: string;
      fuelReceiptId: string;
      tankId: string;
      productId: string;
      invoiceQuantityMilliunits: number;
      densityMilliunits?: number | null;
      temperatureMilliunits?: number | null;
      invoiceDensityMilliunits?: number | null;
      densityVarianceMilliunits?: number | null;
      qualityStatus: QualityStatus;
      appliedToleranceSettingId?: string | null;
      appliedDensityToleranceMilliunits?: number | null;
      createdAt: string;
      updatedAt: string;
    }>
  ): Promise<{
    success: boolean;
    receipt: FuelReceipt | null;
    shiftClosed?: boolean;
    shiftNotFound?: boolean;
    shiftStatus?: string;
    duplicate?: boolean;
    errorCode?: string;
    errorMessage?: string;
    error?: string;
  }> {
    const sealVerifiedNum = receiptData.sealVerified ? 1 : 0;
    const sealExceptionVal = receiptData.sealExceptionReason ?? null;

    // 1. Verify shift exists and is genuinely OPEN
    const [shift] = await this.db
      .select()
      .from(schema.operationalShifts)
      .where(eq(schema.operationalShifts.id, receiptData.operationalShiftId));

    if (!shift) {
      return {
        success: false,
        receipt: null,
        shiftClosed: false,
        shiftNotFound: true,
        error: 'NOT_FOUND',
        errorCode: 'NOT_FOUND',
        errorMessage: 'Operational shift not found.',
      };
    }

    if (shift.status === 'CLOSED' || shift.status === 'LOCKED' || shift.status !== 'OPEN') {
      return {
        success: false,
        receipt: null,
        shiftClosed: true,
        shiftStatus: shift.status,
        error: 'SHIFT_CLOSED',
        errorCode: 'SHIFT_CLOSED',
        errorMessage: `Operational shift is ${shift.status}. Recording fuel receipts on a closed shift is prohibited.`,
      };
    }

    if (!linesData || linesData.length === 0) {
      return {
        success: false,
        receipt: null,
        shiftClosed: false,
        error: 'VALIDATION_ERROR',
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'At least one receiving tank line is required to record a fuel receipt.',
      };
    }

    // 2. Validate duplicate tank lines within the same receipt
    const seenTanks = new Set<string>();
    for (const line of linesData) {
      if (seenTanks.has(line.tankId)) {
        return {
          success: false,
          receipt: null,
          shiftClosed: false,
          duplicate: true,
          error: 'DUPLICATE_RECEIPT_TANK_LINE',
          errorCode: 'DUPLICATE_RECEIPT_TANK_LINE',
          errorMessage: 'A decantation line for this tank already exists on this fuel receipt.',
        };
      }
      seenTanks.add(line.tankId);
    }

    // 3. Check natural business key uniqueness: (outlet_id, invoice_number) WHERE status != 'CANCELLED'
    const [existingInvoice] = await this.db
      .select({ id: schema.fuelReceipts.id })
      .from(schema.fuelReceipts)
      .where(
        and(
          eq(schema.fuelReceipts.outletId, receiptData.outletId),
          eq(schema.fuelReceipts.invoiceNumber, receiptData.invoiceNumber),
          ne(schema.fuelReceipts.status, 'CANCELLED')
        )
      )
      .limit(1);

    if (existingInvoice) {
      return {
        success: false,
        receipt: null,
        shiftClosed: false,
        duplicate: true,
        error: 'DUPLICATE_FUEL_RECEIPT_INVOICE',
        errorCode: 'DUPLICATE_FUEL_RECEIPT_INVOICE',
        errorMessage: 'A fuel receipt with this invoice number already exists for this outlet.',
      };
    }

    // 4. Conditional header INSERT using D1-compatible integer (0/1) for seal_verified
    const conditionalHeaderInsert = this.db.insert(schema.fuelReceipts).select(
      this.db
        .select({
          id: sql<string>`${receiptData.id}`.as('id'),
          outletId: sql<string>`${receiptData.outletId}`.as('outlet_id'),
          operationalShiftId: schema.operationalShifts.id,
          ttNumber: sql<string>`${receiptData.ttNumber}`.as('tt_number'),
          invoiceNumber: sql<string>`${receiptData.invoiceNumber}`.as('invoice_number'),
          invoiceDate: sql<string>`${receiptData.invoiceDate}`.as('invoice_date'),
          arrivalAt: sql<string>`${receiptData.arrivalAt}`.as('arrival_at'),
          decantationStartedAt: sql<string | null>`null`.as('decantation_started_at'),
          decantationCompletedAt: sql<string | null>`null`.as('decantation_completed_at'),
          sealVerified: sql<boolean>`${sealVerifiedNum}`.as('seal_verified'),
          sealExceptionReason: sql<string | null>`${sealExceptionVal}`.as('seal_exception_reason'),
          status: sql<string>`'ARRIVED'`.as('status'),
          recordedByUserId: sql<string>`${receiptData.recordedByUserId}`.as('recorded_by_user_id'),
          createdAt: sql<string>`${receiptData.createdAt}`.as('created_at'),
          updatedAt: sql<string>`${receiptData.updatedAt}`.as('updated_at'),
        })
        .from(schema.operationalShifts)
        .where(
          and(
            eq(schema.operationalShifts.id, receiptData.operationalShiftId),
            eq(schema.operationalShifts.status, 'OPEN')
          )
        )
    );

    // 5. Conditional tanker-line INSERTs that only insert if the parent receipt header exists and shift is OPEN
    const lineInserts = linesData.map(line =>
      this.db.insert(schema.fuelReceiptTankLines).select(
        this.db
          .select({
            id: sql<string>`${line.id}`.as('id'),
            fuelReceiptId: schema.fuelReceipts.id,
            tankId: sql<string>`${line.tankId}`.as('tank_id'),
            productId: sql<string>`${line.productId}`.as('product_id'),
            invoiceQuantityMilliunits: sql<number>`${line.invoiceQuantityMilliunits}`.as(
              'invoice_quantity_milliunits'
            ),
            preDecantReadingId: sql<string | null>`null`.as('pre_decant_reading_id'),
            postDecantReadingId: sql<string | null>`null`.as('post_decant_reading_id'),
            measuredReceivedQuantityMilliunits: sql<number | null>`null`.as(
              'measured_received_quantity_milliunits'
            ),
            receiptVarianceMilliunits: sql<number | null>`null`.as('receipt_variance_milliunits'),
            densityMilliunits: sql<number | null>`${line.densityMilliunits ?? null}`.as('density_milliunits'),
            temperatureMilliunits: sql<number | null>`${line.temperatureMilliunits ?? null}`.as(
              'temperature_milliunits'
            ),
            invoiceDensityMilliunits: sql<number | null>`${line.invoiceDensityMilliunits ?? null}`.as(
              'invoice_density_milliunits'
            ),
            densityVarianceMilliunits: sql<number | null>`${line.densityVarianceMilliunits ?? null}`.as(
              'density_variance_milliunits'
            ),
            qualityStatus: sql<string>`${line.qualityStatus}`.as('quality_status'),
            appliedToleranceSettingId: sql<string | null>`${line.appliedToleranceSettingId ?? null}`.as(
              'applied_tolerance_setting_id'
            ),
            appliedDensityToleranceMilliunits: sql<number | null>`${
              line.appliedDensityToleranceMilliunits ?? null
            }`.as('applied_density_tolerance_milliunits'),
            createdAt: sql<string>`${line.createdAt}`.as('created_at'),
            updatedAt: sql<string>`${line.updatedAt}`.as('updated_at'),
          })
          .from(schema.fuelReceipts)
          .innerJoin(
            schema.operationalShifts,
            eq(schema.fuelReceipts.operationalShiftId, schema.operationalShifts.id)
          )
          .where(
            and(
              eq(schema.fuelReceipts.id, receiptData.id),
              eq(schema.operationalShifts.id, receiptData.operationalShiftId),
              eq(schema.operationalShifts.status, 'OPEN')
            )
          )
      )
    );

    try {
      await (this.db as any).batch([conditionalHeaderInsert, ...lineInserts]);
    } catch (err: any) {
      console.error(
        '[FUEL_RECEIPT_CREATE_DB_ERROR]',
        JSON.stringify({
          outletId: receiptData.outletId,
          operationalShiftId: receiptData.operationalShiftId,
          receiptId: receiptData.id,
          lineCount: linesData.length,
          errorName: err instanceof Error ? err.name : 'UnknownError',
          errorMessage: err instanceof Error ? err.message : String(err),
          cause: err instanceof Error && 'cause' in err ? String((err as any).cause) : undefined,
        })
      );

      const mappedDuplicate = mapDatabaseUniqueError(err);
      if (mappedDuplicate) {
        return {
          success: false,
          receipt: null,
          shiftClosed: false,
          duplicate: true,
          error: mappedDuplicate.code,
          errorCode: mappedDuplicate.code,
          errorMessage: mappedDuplicate.message,
        };
      }

      try {
        const [currentShift] = await this.db
          .select()
          .from(schema.operationalShifts)
          .where(eq(schema.operationalShifts.id, receiptData.operationalShiftId));
        if (currentShift && (currentShift.status === 'CLOSED' || currentShift.status === 'LOCKED')) {
          return {
            success: false,
            receipt: null,
            shiftClosed: true,
            shiftStatus: currentShift.status,
            error: 'SHIFT_CLOSED',
            errorCode: 'SHIFT_CLOSED',
            errorMessage: `Operational shift is ${currentShift.status}. Recording fuel receipts on a closed shift is prohibited.`,
          };
        }
      } catch {
        // Do not misreport database failure as SHIFT_CLOSED
      }

      return {
        success: false,
        receipt: null,
        shiftClosed: false,
        error: 'RECEIPT_CREATE_FAILED',
        errorCode: 'RECEIPT_CREATE_FAILED',
        errorMessage: 'Failed to record fuel receipt due to a database error while the shift is OPEN. Please try again.',
      };
    }

    const created = await this.findFuelReceiptById(receiptData.id);
    if (!created || (linesData.length > 0 && (!created.lines || created.lines.length !== linesData.length))) {
      if (created) {
        // Defensive cleanup so partial receipt records can never remain
        try {
          await this.db.delete(schema.fuelReceipts).where(eq(schema.fuelReceipts.id, receiptData.id));
        } catch (cleanupErr) {
          console.error(
            '[FUEL_RECEIPT_PARTIAL_CLEANUP_ERROR]',
            JSON.stringify({
              receiptId: receiptData.id,
              message: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            })
          );
        }
      }

      try {
        const [currentShift] = await this.db
          .select()
          .from(schema.operationalShifts)
          .where(eq(schema.operationalShifts.id, receiptData.operationalShiftId));
        if (currentShift && (currentShift.status === 'CLOSED' || currentShift.status === 'LOCKED')) {
          return {
            success: false,
            receipt: null,
            shiftClosed: true,
            shiftStatus: currentShift.status,
            error: 'SHIFT_CLOSED',
            errorCode: 'SHIFT_CLOSED',
            errorMessage: `Operational shift is ${currentShift.status}. Recording fuel receipts on a closed shift is prohibited.`,
          };
        }
      } catch {
        // Do not misreport database failure as SHIFT_CLOSED
      }

      return {
        success: false,
        receipt: null,
        shiftClosed: false,
        error: 'RECEIPT_CREATE_FAILED',
        errorCode: 'RECEIPT_CREATE_FAILED',
        errorMessage: 'Failed to create complete fuel receipt record. No partial receipt was saved.',
      };
    }

    return { success: true, receipt: created, shiftClosed: false };
  }

  async updateFuelReceiptStatusConditional(
    id: string,
    shiftId: string,
    data: Partial<{
      status: FuelReceiptStatus;
      decantationStartedAt: string | null;
      decantationCompletedAt: string | null;
      sealVerified: boolean;
      sealExceptionReason: string | null;
      updatedAt: string;
    }>,
    expectedCurrentStatus?: FuelReceiptStatus | null
  ): Promise<{ success: boolean; receipt: FuelReceipt | null; shiftClosed?: boolean; finalized?: boolean; error?: string }> {
    const nowIso = new Date().toISOString();
    const updatedRows = await this.db.all<{ id: string }>(
      sql`UPDATE fuel_receipts
          SET status = COALESCE(${data.status || null}, status),
              decantation_started_at = COALESCE(${data.decantationStartedAt || null}, decantation_started_at),
              decantation_completed_at = COALESCE(${data.decantationCompletedAt || null}, decantation_completed_at),
              seal_verified = COALESCE(${data.sealVerified !== undefined ? (data.sealVerified ? 1 : 0) : null}, seal_verified),
              seal_exception_reason = COALESCE(${data.sealExceptionReason || null}, seal_exception_reason),
              updated_at = ${nowIso}
          WHERE id = ${id} AND operational_shift_id = ${shiftId}
            AND status NOT IN ('COMPLETED', 'CANCELLED')
            ${expectedCurrentStatus ? sql`AND status = ${expectedCurrentStatus}` : sql``}
            AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${shiftId} AND status = 'OPEN')
          RETURNING id`
    );

    if (!updatedRows || updatedRows.length === 0) {
      const existing = await this.findFuelReceiptById(id);
      if (existing && (existing.status === 'COMPLETED' || existing.status === 'CANCELLED')) {
        return { success: false, receipt: existing, finalized: true, error: 'RECEIPT_FINALIZED' };
      }
      if (existing && expectedCurrentStatus && existing.status !== expectedCurrentStatus) {
        return { success: false, receipt: existing, error: 'RECEIPT_STATE_CHANGED' };
      }
      const [shift] = await this.db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, shiftId));
      if (!shift || shift.status !== 'OPEN') {
        return { success: false, receipt: existing || null, shiftClosed: true, error: 'SHIFT_CLOSED' };
      }
      return { success: false, receipt: existing || null, error: 'RECEIPT_STATE_CHANGED' };
    }

    const updated = await this.findFuelReceiptById(id);
    return { success: true, receipt: updated };
  }

  async updateFuelReceiptLineConditional(
    lineId: string,
    shiftId: string,
    data: Partial<{
      preDecantReadingId: string | null;
      postDecantReadingId: string | null;
      measuredReceivedQuantityMilliunits: number | null;
      receiptVarianceMilliunits: number | null;
      densityMilliunits: number | null;
      temperatureMilliunits: number | null;
      invoiceDensityMilliunits: number | null;
      densityVarianceMilliunits: number | null;
      qualityStatus: QualityStatus;
      appliedToleranceSettingId: string | null;
      appliedDensityToleranceMilliunits: number | null;
      updatedAt: string;
    }>
  ): Promise<{ success: boolean; line: FuelReceiptTankLine | null; shiftClosed?: boolean; finalized?: boolean; error?: string }> {
    const nowIso = new Date().toISOString();
    const updatedRows = await this.db.all<{ id: string }>(
      sql`UPDATE fuel_receipt_tank_lines
          SET pre_decant_reading_id = COALESCE(${data.preDecantReadingId !== undefined ? data.preDecantReadingId : null}, pre_decant_reading_id),
              post_decant_reading_id = COALESCE(${data.postDecantReadingId !== undefined ? data.postDecantReadingId : null}, post_decant_reading_id),
              measured_received_quantity_milliunits = COALESCE(${data.measuredReceivedQuantityMilliunits != null ? data.measuredReceivedQuantityMilliunits : null}, measured_received_quantity_milliunits),
              receipt_variance_milliunits = COALESCE(${data.receiptVarianceMilliunits != null ? data.receiptVarianceMilliunits : null}, receipt_variance_milliunits),
              density_milliunits = COALESCE(${data.densityMilliunits != null ? data.densityMilliunits : null}, density_milliunits),
              temperature_milliunits = COALESCE(${data.temperatureMilliunits != null ? data.temperatureMilliunits : null}, temperature_milliunits),
              invoice_density_milliunits = COALESCE(${data.invoiceDensityMilliunits != null ? data.invoiceDensityMilliunits : null}, invoice_density_milliunits),
              density_variance_milliunits = COALESCE(${data.densityVarianceMilliunits != null ? data.densityVarianceMilliunits : null}, density_variance_milliunits),
              quality_status = COALESCE(${data.qualityStatus || null}, quality_status),
              applied_tolerance_setting_id = COALESCE(${data.appliedToleranceSettingId || null}, applied_tolerance_setting_id),
              applied_density_tolerance_milliunits = COALESCE(${data.appliedDensityToleranceMilliunits != null ? data.appliedDensityToleranceMilliunits : null}, applied_density_tolerance_milliunits),
              updated_at = ${nowIso}
          WHERE id = ${lineId}
            AND EXISTS (
              SELECT 1 FROM fuel_receipts fr
              INNER JOIN operational_shifts os ON fr.operational_shift_id = os.id
              WHERE fr.id = fuel_receipt_tank_lines.fuel_receipt_id
                AND os.id = ${shiftId}
                AND fr.status NOT IN ('COMPLETED', 'CANCELLED')
                AND os.status = 'OPEN'
            )
          RETURNING id`
    );

    if (!updatedRows || updatedRows.length === 0) {
      const [lineRow] = await this.db.select().from(schema.fuelReceiptTankLines).where(eq(schema.fuelReceiptTankLines.id, lineId));
      if (lineRow) {
        const parentReceipt = await this.findFuelReceiptById(lineRow.fuelReceiptId);
        if (parentReceipt && (parentReceipt.status === 'COMPLETED' || parentReceipt.status === 'CANCELLED')) {
          return { success: false, line: null, finalized: true, error: 'RECEIPT_FINALIZED' };
        }
      }
      return { success: false, line: null, shiftClosed: true, error: 'SHIFT_CLOSED' };
    }

    const [lineRow] = await this.db.select().from(schema.fuelReceiptTankLines).where(eq(schema.fuelReceiptTankLines.id, lineId));
    if (!lineRow) return { success: false, line: null, error: 'NOT_FOUND' };

    const [tank] = await this.db.select().from(schema.tanks).where(eq(schema.tanks.id, lineRow.tankId));
    const [product] = await this.db.select().from(schema.products).where(eq(schema.products.id, lineRow.productId));

    const line: FuelReceiptTankLine = {
      ...lineRow,
      qualityStatus: lineRow.qualityStatus as QualityStatus,
      invoiceQuantityStr: formatMilliunits(lineRow.invoiceQuantityMilliunits),
      measuredReceivedQuantityStr: lineRow.measuredReceivedQuantityMilliunits != null ? formatMilliunits(lineRow.measuredReceivedQuantityMilliunits) : null,
      receiptVarianceStr: lineRow.receiptVarianceMilliunits != null ? formatMilliunits(lineRow.receiptVarianceMilliunits) : null,
      densityStr: lineRow.densityMilliunits != null ? formatMilliunits(lineRow.densityMilliunits) : null,
      temperatureStr: lineRow.temperatureMilliunits != null ? formatMilliunits(lineRow.temperatureMilliunits) : null,
      invoiceDensityStr: lineRow.invoiceDensityMilliunits != null ? formatMilliunits(lineRow.invoiceDensityMilliunits) : null,
      densityVarianceStr: lineRow.densityVarianceMilliunits != null ? formatMilliunits(lineRow.densityVarianceMilliunits) : null,
      tankNumber: tank?.tankNumber || 0,
      tankName: tank?.name || '',
      productCode: product?.code || '',
      productName: product?.name || '',
    };

    return { success: true, line };
  }

  // ==========================================
  // PHASE 2B: QUALITY TOLERANCE SETTINGS
  // ==========================================

  async listQualityTolerances(scopeType?: QualityScopeType, scopeEntityId?: string | null): Promise<QualityToleranceSetting[]> {
    const conditions: any[] = [];
    if (scopeType) {
      conditions.push(eq(schema.qualityToleranceSettings.scopeType, scopeType));
    }
    if (scopeEntityId !== undefined && scopeEntityId !== null) {
      conditions.push(eq(schema.qualityToleranceSettings.scopeEntityId, scopeEntityId));
    }

    let query = this.db
      .select({
        tolerance: schema.qualityToleranceSettings,
        product: schema.products,
      })
      .from(schema.qualityToleranceSettings)
      .leftJoin(schema.products, eq(schema.qualityToleranceSettings.productId, schema.products.id));

    if (conditions.length > 0) {
      query = (query as any).where(and(...conditions));
    }

    const rows = await query.orderBy(desc(schema.qualityToleranceSettings.createdAt));

    return rows.map(r => ({
      ...r.tolerance,
      scopeType: r.tolerance.scopeType as QualityScopeType,
      densityToleranceStr: formatMilliunits(r.tolerance.densityToleranceMilliunits),
      productCode: r.product?.code,
      productName: r.product?.name,
    }));
  }

  async findQualityToleranceById(id: string): Promise<QualityToleranceSetting | null> {
    const [row] = await this.db
      .select({
        tolerance: schema.qualityToleranceSettings,
        product: schema.products,
      })
      .from(schema.qualityToleranceSettings)
      .leftJoin(schema.products, eq(schema.qualityToleranceSettings.productId, schema.products.id))
      .where(eq(schema.qualityToleranceSettings.id, id));

    if (!row) return null;
    return {
      ...row.tolerance,
      scopeType: row.tolerance.scopeType as QualityScopeType,
      densityToleranceStr: formatMilliunits(row.tolerance.densityToleranceMilliunits),
      productCode: row.product?.code,
      productName: row.product?.name,
    };
  }

  async createQualityTolerance(data: {
    id: string;
    scopeType: QualityScopeType;
    scopeEntityId?: string | null;
    productId?: string | null;
    densityToleranceMilliunits: number;
    status: 'ACTIVE' | 'INACTIVE';
    effectiveFrom: string;
    effectiveTo?: string | null;
    createdAt: string;
    createdBy: string;
  }): Promise<QualityToleranceSetting> {
    await this.db.insert(schema.qualityToleranceSettings).values(data);
    return (await this.findQualityToleranceById(data.id))!;
  }

  async updateQualityTolerance(id: string, data: Partial<{
    scopeType: QualityScopeType;
    scopeEntityId: string | null;
    productId: string | null;
    densityToleranceMilliunits: number;
    status: 'ACTIVE' | 'INACTIVE';
    effectiveFrom: string;
    effectiveTo: string | null;
  }>): Promise<QualityToleranceSetting | null> {
    await this.db.update(schema.qualityToleranceSettings).set(data).where(eq(schema.qualityToleranceSettings.id, id));
    return this.findQualityToleranceById(id);
  }

  async deleteQualityTolerance(id: string): Promise<boolean> {
    await this.db.delete(schema.qualityToleranceSettings).where(eq(schema.qualityToleranceSettings.id, id));
    return true;
  }

  // ==========================================
  // PHASE 2B: STOCK RECONCILIATION
  // ==========================================

  async calculateAndSaveShiftStockReconciliation(
    shiftId: string,
    options: { failOnExisting?: boolean } = {},
  ): Promise<ShiftStockReconciliation[]> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) throw new Error('Shift not found');

    const tankSnapshots = await this.listShiftTankSnapshots(shiftId);
    const nozzleSnapshots = await this.listShiftNozzleSnapshots(shiftId);
    const tankReadings = await this.listShiftTankReadings(shiftId);
    const meterReadings = await this.listReadingsForShift(shiftId);
    const receipts = await this.listFuelReceiptsByShift(shiftId);

    for (const ts of tankSnapshots) {
      const hasOpening = tankReadings.some(r => r.tankId === ts.tankId && r.readingType === 'OPENING');
      const hasClosing = tankReadings.some(r => r.tankId === ts.tankId && r.readingType === 'CLOSING');
      if (!hasOpening || !hasClosing) {
        const err = new Error(`Cannot calculate stock reconciliation: Tank #${ts.tankNumber} (${ts.tankName}) missing OPENING or CLOSING reading.`) as any;
        err.code = 'INCOMPLETE_TANK_STOCK_DATA';
        throw err;
      }
    }

    const nowIso = new Date().toISOString();
    const reconResults: ShiftStockReconciliation[] = [];

    for (const ts of tankSnapshots) {
      const openingReading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === 'OPENING')!;
      const closingReading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === 'CLOSING')!;

      const openingStockMilli = openingReading.netProductVolumeMilliunits;
      const physicalClosingMilli = closingReading.netProductVolumeMilliunits;

      let receiptMilli = 0;
      for (const rcpt of receipts) {
        if (rcpt.status === 'COMPLETED' && rcpt.lines) {
          for (const line of rcpt.lines) {
            if (line.tankId === ts.tankId && line.measuredReceivedQuantityMilliunits != null) {
              receiptMilli += line.measuredReceivedQuantityMilliunits;
            }
          }
        }
      }

      let salesMilli = 0;
      const nozzlesForTank = nozzleSnapshots.filter(n => n.tankId === ts.tankId);
      for (const n of nozzlesForTank) {
        const mr = meterReadings.find(r => r.nozzleId === n.nozzleId);
        if (mr && mr.netSalesQuantityMilliunits != null) {
          salesMilli += mr.netSalesQuantityMilliunits;
        }
      }

      const theoreticalClosingMilli = openingStockMilli + receiptMilli - salesMilli;
      const varianceMilli = physicalClosingMilli - theoreticalClosingMilli;
      let varianceStatus: VarianceStatus = 'BALANCED';
      if (varianceMilli > 0) varianceStatus = 'GAIN';
      else if (varianceMilli < 0) varianceStatus = 'LOSS';

      const reconId = `ssr-${shiftId}-${ts.tankId}`;
      const reconData = {
        id: reconId,
        operationalShiftId: shiftId,
        outletId: shift.outletId,
        tankId: ts.tankId,
        productId: ts.productId,
        openingStockMilliunits: openingStockMilli,
        receiptQuantityMilliunits: receiptMilli,
        salesQuantityMilliunits: salesMilli,
        theoreticalClosingStockMilliunits: theoreticalClosingMilli,
        physicalClosingStockMilliunits: physicalClosingMilli,
        varianceMilliunits: varianceMilli,
        varianceStatus,
        calculatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // During shift closure, never overwrite an existing reconciliation:
      // a conflict must surface for manual review, not silently rewrite history.
      const insert = this.db.insert(schema.shiftStockReconciliations).values(reconData);
      if (options.failOnExisting) {
        await insert;
      } else {
        await insert.onConflictDoUpdate({
          target: [schema.shiftStockReconciliations.operationalShiftId, schema.shiftStockReconciliations.tankId],
          set: {
            openingStockMilliunits: openingStockMilli,
            receiptQuantityMilliunits: receiptMilli,
            salesQuantityMilliunits: salesMilli,
            theoreticalClosingStockMilliunits: theoreticalClosingMilli,
            physicalClosingStockMilliunits: physicalClosingMilli,
            varianceMilliunits: varianceMilli,
            varianceStatus,
            calculatedAt: nowIso,
            updatedAt: nowIso,
          },
        });
      }

      reconResults.push({
        ...reconData,
        openingStockStr: formatMilliunits(openingStockMilli),
        receiptQuantityStr: formatMilliunits(receiptMilli),
        salesQuantityStr: formatMilliunits(salesMilli),
        theoreticalClosingStockStr: formatMilliunits(theoreticalClosingMilli),
        physicalClosingStockStr: formatMilliunits(physicalClosingMilli),
        varianceStr: formatMilliunits(varianceMilli),
        tankNumber: ts.tankNumber,
        tankName: ts.tankName,
        productCode: ts.productCode,
        productName: ts.productName,
        productUnit: ts.productUnit,
      });
    }

    return reconResults;
  }

  async getShiftStockSummary(shiftId: string): Promise<ShiftStockSummary> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) throw new Error('Shift not found');

    const tankSnapshots = await this.listShiftTankSnapshots(shiftId);
    const nozzleSnapshots = await this.listShiftNozzleSnapshots(shiftId);
    const tankReadings = await this.listShiftTankReadings(shiftId);
    const meterReadings = await this.listReadingsForShift(shiftId);
    const receipts = await this.listFuelReceiptsByShift(shiftId);

    const productMap = new Map<string, {
      productId: string;
      productCode: string;
      productName: string;
      productUnit: ProductUnit;
      openingMilli: number | null;
      receiptMilli: number;
      salesMilli: number;
      theoreticalMilli: number | null;
      physicalMilli: number | null;
      varianceMilli: number | null;
    }>();

    const byTank = tankSnapshots.map(ts => {
      const openingReading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === 'OPENING');
      const closingReading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === 'CLOSING');

      const hasOpeningReading = Boolean(openingReading);
      const hasClosingReading = Boolean(closingReading);

      const openingStockMilli = openingReading ? openingReading.netProductVolumeMilliunits : null;
      const physicalClosingMilli = closingReading ? closingReading.netProductVolumeMilliunits : null;

      let receiptMilli = 0;
      let rcptCount = 0;
      for (const rcpt of receipts) {
        if (rcpt.status === 'COMPLETED' && rcpt.lines) {
          for (const line of rcpt.lines) {
            if (line.tankId === ts.tankId && line.measuredReceivedQuantityMilliunits != null) {
              receiptMilli += line.measuredReceivedQuantityMilliunits;
              rcptCount++;
            }
          }
        }
      }

      let salesMilli = 0;
      const nozzlesForTank = nozzleSnapshots.filter(n => n.tankId === ts.tankId);
      for (const n of nozzlesForTank) {
        const mr = meterReadings.find(r => r.nozzleId === n.nozzleId);
        if (mr && mr.netSalesQuantityMilliunits != null) {
          salesMilli += mr.netSalesQuantityMilliunits;
        }
      }

      let theoreticalClosingMilli: number | null = null;
      if (openingStockMilli != null) {
        theoreticalClosingMilli = openingStockMilli + receiptMilli - salesMilli;
      }

      let varianceMilli: number | null = null;
      let varianceStatus: VarianceStatus | null = null;
      if (physicalClosingMilli != null && theoreticalClosingMilli != null) {
        varianceMilli = physicalClosingMilli - theoreticalClosingMilli;
        if (varianceMilli > 0) varianceStatus = 'GAIN';
        else if (varianceMilli < 0) varianceStatus = 'LOSS';
        else varianceStatus = 'BALANCED';
      }

      let p = productMap.get(ts.productId);
      if (!p) {
        p = {
          productId: ts.productId,
          productCode: ts.productCode,
          productName: ts.productName,
          productUnit: ts.productUnit,
          openingMilli: openingStockMilli,
          receiptMilli,
          salesMilli,
          theoreticalMilli: theoreticalClosingMilli,
          physicalMilli: physicalClosingMilli,
          varianceMilli,
        };
        productMap.set(ts.productId, p);
      } else {
        if (openingStockMilli != null && p.openingMilli != null) {
          p.openingMilli += openingStockMilli;
        } else {
          p.openingMilli = null;
        }
        p.receiptMilli += receiptMilli;
        p.salesMilli += salesMilli;
        if (theoreticalClosingMilli != null && p.theoreticalMilli != null) {
          p.theoreticalMilli += theoreticalClosingMilli;
        } else {
          p.theoreticalMilli = null;
        }
        if (physicalClosingMilli != null && p.physicalMilli != null) {
          p.physicalMilli += physicalClosingMilli;
        } else {
          p.physicalMilli = null;
        }
        if (varianceMilli != null && p.varianceMilli != null) {
          p.varianceMilli += varianceMilli;
        } else {
          p.varianceMilli = null;
        }
      }

      return {
        tankId: ts.tankId,
        tankNumber: ts.tankNumber,
        tankName: ts.tankName,
        productId: ts.productId,
        productCode: ts.productCode,
        productName: ts.productName,
        productUnit: ts.productUnit,
        openingStockStr: openingStockMilli != null ? formatMilliunits(openingStockMilli) : null,
        receiptQuantityStr: formatMilliunits(receiptMilli),
        salesQuantityStr: formatMilliunits(salesMilli),
        theoreticalClosingStockStr: theoreticalClosingMilli != null ? formatMilliunits(theoreticalClosingMilli) : null,
        physicalClosingStockStr: physicalClosingMilli != null ? formatMilliunits(physicalClosingMilli) : null,
        varianceStr: varianceMilli != null ? formatMilliunits(varianceMilli) : null,
        varianceStatus,
        hasOpeningReading,
        hasClosingReading,
        receiptsCount: rcptCount,
      };
    });

    const byProduct = Array.from(productMap.values()).map(p => {
      let varianceStatus: VarianceStatus | null = null;
      if (p.varianceMilli != null) {
        if (p.varianceMilli > 0) varianceStatus = 'GAIN';
        else if (p.varianceMilli < 0) varianceStatus = 'LOSS';
        else varianceStatus = 'BALANCED';
      }

      return {
        productId: p.productId,
        productCode: p.productCode,
        productName: p.productName,
        productUnit: p.productUnit,
        openingStockStr: p.openingMilli != null ? formatMilliunits(p.openingMilli) : null,
        receiptQuantityStr: formatMilliunits(p.receiptMilli),
        salesQuantityStr: formatMilliunits(p.salesMilli),
        theoreticalClosingStockStr: p.theoreticalMilli != null ? formatMilliunits(p.theoreticalMilli) : null,
        physicalClosingStockStr: p.physicalMilli != null ? formatMilliunits(p.physicalMilli) : null,
        varianceStr: p.varianceMilli != null ? formatMilliunits(p.varianceMilli) : null,
        varianceStatus,
      };
    });

    return {
      operationalShiftId: shift.id,
      businessDate: shift.businessDate,
      outletId: shift.outletId,
      byTank,
      byProduct,
    };
  }

  async listShiftStockReconciliations(shiftId: string): Promise<ShiftStockReconciliation[]> {
    const rows = await this.db
      .select({
        recon: schema.shiftStockReconciliations,
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.shiftStockReconciliations)
      .leftJoin(schema.tanks, eq(schema.shiftStockReconciliations.tankId, schema.tanks.id))
      .leftJoin(schema.products, eq(schema.shiftStockReconciliations.productId, schema.products.id))
      .where(eq(schema.shiftStockReconciliations.operationalShiftId, shiftId));

    return rows.map(r => ({
      ...r.recon,
      varianceStatus: r.recon.varianceStatus as VarianceStatus,
      openingStockStr: formatMilliunits(r.recon.openingStockMilliunits),
      receiptQuantityStr: formatMilliunits(r.recon.receiptQuantityMilliunits),
      salesQuantityStr: formatMilliunits(r.recon.salesQuantityMilliunits),
      theoreticalClosingStockStr: formatMilliunits(r.recon.theoreticalClosingStockMilliunits),
      physicalClosingStockStr: formatMilliunits(r.recon.physicalClosingStockMilliunits),
      varianceStr: formatMilliunits(r.recon.varianceMilliunits),
      tankNumber: r.tank?.tankNumber,
      tankName: r.tank?.name,
      productCode: r.product?.code,
      productName: r.product?.name,
      productUnit: (r.product?.unit as ProductUnit) || 'LITRE',
    }));
  }

  async deleteStockReconciliation(shiftId: string): Promise<void> {
    await this.db.delete(schema.shiftStockReconciliations).where(eq(schema.shiftStockReconciliations.operationalShiftId, shiftId));
  }

  // ==========================================
  // 21. GLOBAL TANK CALIBRATION TEMPLATES
  // ==========================================

  async getEngineeringVerificationsMap(
    targetType: 'GLOBAL_TEMPLATE' | 'TANK'
  ): Promise<Map<string, any>> {
    const entityType =
      targetType === 'GLOBAL_TEMPLATE'
        ? 'CALIBRATION_ENGINEERING_VERIFICATION'
        : 'TANK_CALIBRATION_ENGINEERING_VERIFICATION';

    const logs = await this.db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityType, entityType))
      .orderBy(desc(schema.auditLogs.createdAt));

    const docs = await this.db.select().from(schema.documents);
    const validDocMap = new Map<string, typeof schema.documents.$inferSelect>();
    for (const d of docs) {
      const isSpreadsheet = /\.(xlsx|xls)$/i.test(d.name || '');
      if (!isSpreadsheet) {
        validDocMap.set(d.id, d);
      }
    }

    const result = new Map<string, any>();
    for (const log of logs) {
      if (result.has(log.entityId)) continue;
      if (!log.newValueJson) continue;
      try {
        const parsed = JSON.parse(log.newValueJson);
        if (parsed && parsed.supportingDocumentId && validDocMap.has(parsed.supportingDocumentId)) {
          const doc = validDocMap.get(parsed.supportingDocumentId)!;
          result.set(log.entityId, {
            ...parsed,
            supportingDocumentName: doc.name,
            supportingDocumentMimeType: doc.mimeType,
          });
        }
      } catch {
        // ignore malformed json
      }
    }
    return result;
  }

  private enrichTemplateWithEngineeringAndLifecycle(
    row: typeof schema.globalTankCalibrationTemplates.$inferSelect,
    ptsCount: number,
    maxVolMilli: number | null,
    engVerification: any | null,
    assignmentStats?: { stagedDraftCount: number; activeCount: number; compatibleTanksCount?: number }
  ): any {
    const nomMilli = Math.round(row.nominalCapacityLitres * 1000);
    const maxCeilingMilli = Math.round(nomMilli * 1.1);
    const isOverCeiling = maxVolMilli != null ? maxVolMilli > maxCeilingMilli : false;
    const isExcel10kl = row.code === 'EXCEL_10KL_REFERENCE';
    const isExcel15kl =
      row.code === 'EXCEL_15KL_REFERENCE' || Boolean(row.notes && row.notes.includes('3,750 mm'));
    const isExcel20kl = row.code === 'EXCEL_20KL_REFERENCE';
    const isExcelTemplate = isExcel10kl || isExcel15kl || isExcel20kl;

    const is10klPolicyResolved = Boolean(
      engVerification &&
        engVerification.decision === 'VERIFIED' &&
        engVerification.allowScopedPolicyException === true &&
        engVerification.supportingDocumentId &&
        engVerification.governingPolicyReference &&
        String(engVerification.governingPolicyReference).trim().length >= 3
    );

    const is15klLengthResolved = Boolean(
      engVerification &&
        engVerification.decision === 'VERIFIED' &&
        engVerification.resolveLengthConflict === true &&
        Number(engVerification.confirmedLengthMm) === 5500 &&
        engVerification.supportingDocumentId
    );

    const is20klVerified = Boolean(
      engVerification &&
        engVerification.decision === 'VERIFIED' &&
        engVerification.supportingDocumentId &&
        engVerification.comparedAgainstStandard20kl !== false
    );

    const isGenericVerified = Boolean(
      engVerification &&
        engVerification.decision === 'VERIFIED' &&
        engVerification.supportingDocumentId
    );

    const requiresEngineeringReview = isOverCeiling && !is10klPolicyResolved;
    const requiresDimensionVerification = isExcel15kl && !is15klLengthResolved;

    const isEngineeringVerified = isExcel10kl
      ? is10klPolicyResolved
      : isExcel15kl
        ? is15klLengthResolved
        : isExcel20kl
          ? is20klVerified
          : isGenericVerified || row.status === 'APPROVED' || row.status === 'ACTIVE';

    let reviewStatusLabel: string = row.status;
    if (row.status === 'DRAFT') {
      if (requiresEngineeringReview) {
        reviewStatusLabel = 'DRAFT / ENGINEERING REVIEW REQUIRED';
      } else if (requiresDimensionVerification) {
        reviewStatusLabel = 'DRAFT / DIMENSION VERIFICATION REQUIRED';
      } else if (isEngineeringVerified && isExcelTemplate) {
        reviewStatusLabel = 'VERIFIED / PENDING ADMIN APPROVAL';
      } else if (ptsCount >= 2) {
        reviewStatusLabel = 'DRAFT / PENDING VERIFICATION';
      } else {
        reviewStatusLabel = 'DRAFT';
      }
    }

    const referenceDataStatus: 'REFERENCE DATA IMPORTED' | 'PENDING IMPORT' =
      ptsCount >= 2 ? 'REFERENCE DATA IMPORTED' : 'PENDING IMPORT';

    let engineeringVerificationStatus:
      | 'ENGINEERING VERIFIED'
      | 'PENDING ENGINEERING VERIFICATION'
      | 'BLOCKED — ENGINEERING REVIEW REQUIRED'
      | 'BLOCKED — DIMENSION VERIFICATION REQUIRED'
      | 'REJECTED' = 'PENDING ENGINEERING VERIFICATION';

    if (engVerification?.decision === 'REJECTED') {
      engineeringVerificationStatus = 'REJECTED';
    } else if (isEngineeringVerified) {
      engineeringVerificationStatus = 'ENGINEERING VERIFIED';
    } else if (requiresEngineeringReview) {
      engineeringVerificationStatus = 'BLOCKED — ENGINEERING REVIEW REQUIRED';
    } else if (requiresDimensionVerification) {
      engineeringVerificationStatus = 'BLOCKED — DIMENSION VERIFICATION REQUIRED';
    }

    const activeCount = assignmentStats?.activeCount ?? 0;
    const stagedDraftCount = assignmentStats?.stagedDraftCount ?? 0;
    const operationalActivationStatus:
      | 'OPERATIONALLY ACTIVE'
      | 'STAGED AS DRAFT'
      | 'NOT ASSIGNED' =
      activeCount > 0
        ? 'OPERATIONALLY ACTIVE'
        : stagedDraftCount > 0
          ? 'STAGED AS DRAFT'
          : 'NOT ASSIGNED';

    let lifecycleStage:
      | 'IMPORTED DRAFT'
      | 'ENGINEERING REVIEW'
      | 'VERIFIED'
      | 'ADMIN APPROVED'
      | 'ASSIGNED TO COMPATIBLE TANK AS DRAFT'
      | 'TANK-SPECIFIC AUTHORISED ACTIVATION' = 'IMPORTED DRAFT';

    if (activeCount > 0) {
      lifecycleStage = 'TANK-SPECIFIC AUTHORISED ACTIVATION';
    } else if (stagedDraftCount > 0) {
      lifecycleStage = 'ASSIGNED TO COMPATIBLE TANK AS DRAFT';
    } else if (row.status === 'APPROVED' || row.status === 'ACTIVE') {
      lifecycleStage = 'ADMIN APPROVED';
    } else if (isEngineeringVerified) {
      lifecycleStage = 'VERIFIED';
    } else if (requiresEngineeringReview || requiresDimensionVerification) {
      lifecycleStage = 'ENGINEERING REVIEW';
    } else {
      lifecycleStage = 'IMPORTED DRAFT';
    }

    let blockingReason: string | null = null;
    if (ptsCount < 2) {
      blockingReason = 'Calibration dip-to-volume points have not been imported yet.';
    } else if (requiresEngineeringReview) {
      blockingReason = `Nominal capacity is ${row.nominalCapacityLitres.toLocaleString()} L (permitted +10% ceiling: ${(row.nominalCapacityLitres * 1.1).toLocaleString()} L), but source chart maximum volume is ${maxVolMilli != null ? formatMilliunits(maxVolMilli) : '11073.410'} L. Approval, tank assignment, and activation are blocked until formal Engineering Verification with a Document Vault calibration certificate and governing policy exception is recorded.`;
    } else if (requiresDimensionVerification) {
      blockingReason =
        'Dimensional conflict between 5,500 mm main sheet length and 3,750 mm worksheet annotation is unresolved. Approval and assignment are blocked until confirmed against the physical tank calibration certificate in the Document Vault.';
    } else if (!isEngineeringVerified) {
      blockingReason =
        'Pending formal Engineering Verification with a supporting calibration certificate in the Document Vault (an uploaded workbook filename or manually entered reference number is not sufficient proof of certification).';
    } else if (row.status !== 'APPROVED' && row.status !== 'ACTIVE') {
      blockingReason =
        'Engineering verification is complete; awaiting Authorised Admin Approval before tank-wise DRAFT assignment.';
    } else if (activeCount === 0 && stagedDraftCount === 0) {
      blockingReason =
        'Template is Admin Approved; awaiting assignment as DRAFT to a compatible tank with verified dimensions and certificate.';
    } else if (activeCount === 0 && stagedDraftCount > 0) {
      blockingReason =
        'Staged on compatible tank(s) as DRAFT; awaiting Tank-Specific Authorised Activation with administrator confirmation.';
    }

    return {
      ...row,
      pointsCount: ptsCount,
      maxVolumeMilliunits: maxVolMilli,
      maxVolumeLitres: maxVolMilli != null ? maxVolMilli / 1000 : null,
      maxVolumeLitresStr: maxVolMilli != null ? formatMilliunits(maxVolMilli) : null,
      isOverNominalCapacity: maxVolMilli != null ? maxVolMilli > nomMilli : false,
      isOverCapacityCeiling: isOverCeiling,
      requiresEngineeringReview,
      requiresDimensionVerification,
      reviewStatusLabel,
      lifecycleStage,
      referenceDataStatus,
      engineeringVerificationStatus,
      operationalActivationStatus,
      blockingReason,
      engineeringVerification: engVerification,
      compatibleTanksCount: assignmentStats?.compatibleTanksCount ?? 0,
      stagedDraftTanksCount: stagedDraftCount,
      activeAssignedTanksCount: activeCount,
      nominalCapacityLitresStr: row.nominalCapacityLitres.toString(),
      maxDipMm: row.maxDipMmMilliunits != null ? row.maxDipMmMilliunits / 1000 : null,
      tankDiameterMm: row.tankDiameterMmMilliunits != null ? row.tankDiameterMmMilliunits / 1000 : null,
      tankLengthMm: row.tankLengthMmMilliunits != null ? row.tankLengthMmMilliunits / 1000 : null,
      maxDipMmStr: row.maxDipMmMilliunits != null ? formatMilliunits(row.maxDipMmMilliunits) : null,
      tankDiameterMmStr:
        row.tankDiameterMmMilliunits != null ? formatMilliunits(row.tankDiameterMmMilliunits) : null,
      tankLengthMmStr:
        row.tankLengthMmMilliunits != null ? formatMilliunits(row.tankLengthMmMilliunits) : null,
    };
  }

  async listGlobalTankCalibrationTemplates(options?: {
    status?: string;
    nominalCapacityLitres?: number;
  }): Promise<any[]> {
    const query = this.db.select().from(schema.globalTankCalibrationTemplates);
    const conditions: any[] = [];
    if (options?.status) {
      conditions.push(eq(schema.globalTankCalibrationTemplates.status, options.status as any));
    }
    if (options?.nominalCapacityLitres) {
      conditions.push(
        eq(
          schema.globalTankCalibrationTemplates.nominalCapacityLitres,
          options.nominalCapacityLitres
        )
      );
    }
    const rows =
      conditions.length > 0
        ? await query
            .where(and(...conditions))
            .orderBy(desc(schema.globalTankCalibrationTemplates.createdAt))
        : await query.orderBy(desc(schema.globalTankCalibrationTemplates.createdAt));

    const points = await this.db
      .select({
        templateId: schema.globalTankCalibrationTemplatePoints.templateId,
        count: sql<number>`count(*)`,
        maxVolumeMilliunits: sql<number>`max(${schema.globalTankCalibrationTemplatePoints.volumeMilliunits})`,
      })
      .from(schema.globalTankCalibrationTemplatePoints)
      .groupBy(schema.globalTankCalibrationTemplatePoints.templateId);

    const countMap = new Map<string, number>();
    const maxVolMap = new Map<string, number | null>();
    for (const p of points) {
      countMap.set(p.templateId, Number(p.count || 0));
      maxVolMap.set(
        p.templateId,
        p.maxVolumeMilliunits != null ? Number(p.maxVolumeMilliunits) : null
      );
    }

    const engVerifMap = await this.getEngineeringVerificationsMap('GLOBAL_TEMPLATE');
    const assignedCharts = await this.db
      .select({
        sourceTemplateId: schema.tankCalibrationCharts.sourceTemplateId,
        status: schema.tankCalibrationCharts.status,
      })
      .from(schema.tankCalibrationCharts);

    const statsByTemplate = new Map<string, { stagedDraftCount: number; activeCount: number }>();
    for (const ch of assignedCharts) {
      if (!ch.sourceTemplateId) continue;
      const cur = statsByTemplate.get(ch.sourceTemplateId) || {
        stagedDraftCount: 0,
        activeCount: 0,
      };
      if (ch.status === 'ACTIVE') cur.activeCount += 1;
      if (ch.status === 'DRAFT' || ch.status === 'APPROVED') cur.stagedDraftCount += 1;
      statsByTemplate.set(ch.sourceTemplateId, cur);
    }

    return rows.map((r) => {
      const maxVolMilli = maxVolMap.get(r.id) ?? null;
      const ptsCount = countMap.get(r.id) || 0;
      const engVerif = engVerifMap.get(r.id) || null;
      const stats = statsByTemplate.get(r.id) || { stagedDraftCount: 0, activeCount: 0 };
      return this.enrichTemplateWithEngineeringAndLifecycle(
        r,
        ptsCount,
        maxVolMilli,
        engVerif,
        stats
      );
    });
  }

  async findGlobalTankCalibrationTemplateById(idOrCode: string): Promise<any | null> {
    let [row] = await this.db
      .select()
      .from(schema.globalTankCalibrationTemplates)
      .where(eq(schema.globalTankCalibrationTemplates.id, idOrCode));

    if (!row) {
      const aliasMap: Record<string, string> = {
        'gtct-excel-10kl-ref': 'EXCEL_10KL_REFERENCE',
        'gtct-excel-15kl-ref': 'EXCEL_15KL_REFERENCE',
        'gtct-excel-20kl-ref': 'EXCEL_20KL_REFERENCE',
      };
      const mappedCode = aliasMap[idOrCode.toLowerCase()] || idOrCode.toUpperCase();
      [row] = await this.db
        .select()
        .from(schema.globalTankCalibrationTemplates)
        .where(eq(schema.globalTankCalibrationTemplates.code, mappedCode));
    }

    if (!row) return null;

    const points = await this.listGlobalTankCalibrationTemplatePoints(row.id);
    const maxVolMilli =
      points.length > 0 ? points[points.length - 1].volumeMilliunits : null;
    const engVerifMap = await this.getEngineeringVerificationsMap('GLOBAL_TEMPLATE');
    const engVerif = engVerifMap.get(row.id) || null;

    const assignedCharts = await this.db
      .select({
        status: schema.tankCalibrationCharts.status,
      })
      .from(schema.tankCalibrationCharts)
      .where(eq(schema.tankCalibrationCharts.sourceTemplateId, row.id));

    let stagedDraftCount = 0;
    let activeCount = 0;
    for (const ch of assignedCharts) {
      if (ch.status === 'ACTIVE') activeCount += 1;
      if (ch.status === 'DRAFT' || ch.status === 'APPROVED') stagedDraftCount += 1;
    }

    const enriched = this.enrichTemplateWithEngineeringAndLifecycle(
      row,
      points.length,
      maxVolMilli,
      engVerif,
      { stagedDraftCount, activeCount }
    );

    return {
      ...enriched,
      points,
    };
  }

  async findGlobalTankCalibrationTemplateByCode(code: string): Promise<any | null> {
    const [row] = await this.db
      .select()
      .from(schema.globalTankCalibrationTemplates)
      .where(eq(schema.globalTankCalibrationTemplates.code, code.toUpperCase()));

    if (!row) return null;
    return this.findGlobalTankCalibrationTemplateById(row.id);
  }

  async listGlobalTankCalibrationTemplatePoints(templateId: string): Promise<any[]> {
    const rows = await this.db
      .select()
      .from(schema.globalTankCalibrationTemplatePoints)
      .where(eq(schema.globalTankCalibrationTemplatePoints.templateId, templateId))
      .orderBy(asc(schema.globalTankCalibrationTemplatePoints.dipMillimetresMilliunits));

    return rows.map(r => ({
      ...r,
      dipMmStr: formatMilliunits(r.dipMillimetresMilliunits),
      volumeLitreStr: formatMilliunits(r.volumeMilliunits),
      dipMillimetres: r.dipMillimetresMilliunits / 1000,
      volumeLitres: r.volumeMilliunits / 1000,
    }));
  }

  validateGlobalTemplatePoints(
    points: Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }>,
    options: {
      nominalCapacityLitres: number;
      tankDiameterMmMilliunits?: number | null;
      maxDipMmMilliunits?: number | null;
      allowOverCapacity?: boolean;
      allowEngineeringReviewReference?: boolean;
      requireCompleteRange?: boolean;
    }
  ): Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }> {
    if (!Array.isArray(points) || points.length < 2) {
      const err = new Error('At least 2 validated dip-to-volume calibration points are required');
      (err as any).code = 'TEMPLATE_POINTS_REQUIRED';
      throw err;
    }

    const sorted = [...points].sort((a, b) => a.dipMillimetresMilliunits - b.dipMillimetresMilliunits);

    for (let i = 0; i < sorted.length; i++) {
      const pt = sorted[i];
      if (!Number.isFinite(pt.dipMillimetresMilliunits) || !Number.isFinite(pt.volumeMilliunits)) {
        const err = new Error(`Invalid calibration point at row ${i + 1}`);
        (err as any).code = 'INVALID_POINT_VALUE';
        throw err;
      }
      if (pt.dipMillimetresMilliunits < 0 || pt.volumeMilliunits < 0) {
        const err = new Error(`Negative dip or volume is not allowed (row ${i + 1})`);
        (err as any).code = 'NEGATIVE_POINT_VALUE';
        throw err;
      }
      if (i < sorted.length - 1) {
        if (pt.dipMillimetresMilliunits === sorted[i + 1].dipMillimetresMilliunits) {
          const err = new Error(
            `Duplicate dip height ${formatMilliunits(pt.dipMillimetresMilliunits)} mm in global calibration template`
          );
          (err as any).code = 'DUPLICATE_DIP';
          throw err;
        }
        if (pt.volumeMilliunits > sorted[i + 1].volumeMilliunits) {
          const err = new Error(
            `Non-monotonic calibration chart: volume ${formatMilliunits(pt.volumeMilliunits)} L at ${formatMilliunits(pt.dipMillimetresMilliunits)} mm is greater than volume ${formatMilliunits(sorted[i + 1].volumeMilliunits)} L at ${formatMilliunits(sorted[i + 1].dipMillimetresMilliunits)} mm`
          );
          (err as any).code = 'NON_MONOTONIC_CALIBRATION';
          throw err;
        }
      }
    }

    // Scanned IOCL reference charts (e.g. 210 printed readings from 10 mm to 2100 mm)
    // omit the 0 mm / 0 L baseline row on paper; infer and prepend 0 mm / 0 L when a
    // full-density table (>= 200 readings) starts at the first printed step (<= 20 mm).
    if (
      sorted.length >= 200 &&
      sorted[0].dipMillimetresMilliunits > 0 &&
      sorted[0].dipMillimetresMilliunits <= 20000 &&
      sorted[0].volumeMilliunits >= 0
    ) {
      sorted.unshift({
        dipMillimetresMilliunits: 0,
        volumeMilliunits: 0,
      });
    }

    const maxPointDip = sorted[sorted.length - 1].dipMillimetresMilliunits;
    const maxPointVol = sorted[sorted.length - 1].volumeMilliunits;

    if (
      options.maxDipMmMilliunits != null &&
      options.tankDiameterMmMilliunits != null &&
      options.maxDipMmMilliunits > options.tankDiameterMmMilliunits
    ) {
      const err = new Error(
        `Configured maximum dip (${formatMilliunits(options.maxDipMmMilliunits)} mm) cannot exceed tank diameter (${formatMilliunits(options.tankDiameterMmMilliunits)} mm)`
      );
      (err as any).code = 'MAX_DIP_EXCEEDS_DIAMETER';
      throw err;
    }

    if (options.maxDipMmMilliunits != null && maxPointDip > options.maxDipMmMilliunits) {
      const err = new Error(
        `Chart maximum dip ${formatMilliunits(maxPointDip)} mm exceeds declared maximum dip range ${formatMilliunits(options.maxDipMmMilliunits)} mm`
      );
      (err as any).code = 'MAX_DIP_RANGE_EXCEEDED';
      throw err;
    }

    if (options.tankDiameterMmMilliunits != null && maxPointDip > options.tankDiameterMmMilliunits) {
      const err = new Error(
        `Chart maximum dip ${formatMilliunits(maxPointDip)} mm exceeds internal tank diameter ${formatMilliunits(options.tankDiameterMmMilliunits)} mm`
      );
      (err as any).code = 'MAX_DIP_EXCEEDS_DIAMETER';
      throw err;
    }

    const nominalCapacityMilliunits = Math.round(options.nominalCapacityLitres * 1000);
    const maxOverCapacityMilliunits = Math.round(nominalCapacityMilliunits * 1.1);
    if (!options.allowOverCapacity && !options.allowEngineeringReviewReference && maxPointVol > nominalCapacityMilliunits) {
      const err = new Error(
        `Chart maximum volume ${formatMilliunits(maxPointVol)} L exceeds nominal template capacity ${options.nominalCapacityLitres.toLocaleString()} L`
      );
      (err as any).code = 'CAPACITY_CONFLICT';
      throw err;
    }

    if (!options.allowEngineeringReviewReference && options.allowOverCapacity && maxPointVol > maxOverCapacityMilliunits) {
      const err = new Error(
        `Chart maximum volume ${formatMilliunits(maxPointVol)} L exceeds the maximum permitted +10% over-capacity ceiling of ${formatMilliunits(maxOverCapacityMilliunits)} L (nominal ${options.nominalCapacityLitres.toLocaleString()} L)`
      );
      (err as any).code = 'OVER_CAPACITY_CEILING_EXCEEDED';
      throw err;
    }

    if (options.requireCompleteRange) {
      if (sorted[0].dipMillimetresMilliunits !== 0) {
        const err = new Error(
          `Approved global calibration template must start at 0.000 mm dip (found ${formatMilliunits(sorted[0].dipMillimetresMilliunits)} mm)`
        );
        (err as any).code = 'INCOMPLETE_CALIBRATION_RANGE';
        throw err;
      }
      if (options.maxDipMmMilliunits != null && maxPointDip !== options.maxDipMmMilliunits) {
        const err = new Error(
          `Approved global calibration template must cover full max dip range up to ${formatMilliunits(options.maxDipMmMilliunits)} mm (found max dip ${formatMilliunits(maxPointDip)} mm)`
        );
        (err as any).code = 'INCOMPLETE_CALIBRATION_RANGE';
        throw err;
      }
    }

    return sorted;
  }

  async createGlobalTankCalibrationTemplate(data: {
    id: string;
    code: string;
    name: string;
    nominalCapacityLitres: number;
    tankDiameterMmMilliunits?: number | null;
    tankLengthMmMilliunits?: number | null;
    maxDipMmMilliunits?: number | null;
    status?: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
    sourceFileName?: string | null;
    referenceDocument?: string | null;
    notes?: string | null;
    createdBy: string;
    createdAt: string;
    approvedBy?: string | null;
    approvedAt?: string | null;
    allowOverCapacity?: boolean;
    allowEngineeringReviewReference?: boolean;
  }, points: Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }>): Promise<any> {
    const codeUpper = data.code.toUpperCase();
    const requestedStatus = data.status || 'DRAFT';
    const requiresApprovalValidation = requestedStatus === 'APPROVED' || requestedStatus === 'ACTIVE';
    const isStandardReferenceTemplate =
      codeUpper === 'STANDARD_20KL' || codeUpper === 'STANDARD_50KL';

    if (requiresApprovalValidation && (!points || points.length < 2)) {
      const err = new Error(
        'Cannot label global calibration template as APPROVED unless actual dip-to-volume points have been imported and validated'
      );
      (err as any).code = 'TEMPLATE_POINTS_NOT_VALIDATED';
      throw err;
    }

    // Narrowly scoped engineering-review reference storage: strictly permitted ONLY on non-standard DRAFT templates
    const allowEngineeringReviewReference =
      Boolean(data.allowEngineeringReviewReference) &&
      !requiresApprovalValidation &&
      !isStandardReferenceTemplate;

    const validatedPoints = points && points.length > 0
      ? this.validateGlobalTemplatePoints(points, {
          nominalCapacityLitres: data.nominalCapacityLitres,
          tankDiameterMmMilliunits: data.tankDiameterMmMilliunits,
          maxDipMmMilliunits: data.maxDipMmMilliunits,
          allowOverCapacity: data.allowOverCapacity,
          allowEngineeringReviewReference,
          requireCompleteRange: requiresApprovalValidation || allowEngineeringReviewReference,
        })
      : [];

    const batchStmts: any[] = [
      this.db.insert(schema.globalTankCalibrationTemplates).values({
        id: data.id,
        code: codeUpper,
        name: data.name,
        nominalCapacityLitres: data.nominalCapacityLitres,
        tankDiameterMmMilliunits: data.tankDiameterMmMilliunits ?? null,
        tankLengthMmMilliunits: data.tankLengthMmMilliunits ?? null,
        maxDipMmMilliunits: data.maxDipMmMilliunits ?? null,
        revisionNumber: 1,
        status: requestedStatus,
        sourceFileName: data.sourceFileName ?? null,
        referenceDocument: data.referenceDocument ?? null,
        notes: data.notes ?? null,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        approvedBy: requiresApprovalValidation ? (data.approvedBy ?? data.createdBy) : null,
        approvedAt: requiresApprovalValidation ? (data.approvedAt ?? data.createdAt) : null,
        updatedAt: data.createdAt,
      }),
    ];

    if (validatedPoints.length > 0) {
      const ptRows = validatedPoints.map((p, idx) => ({
        id: `gtctp-${data.id}-${idx + 1}`,
        templateId: data.id,
        dipMillimetresMilliunits: p.dipMillimetresMilliunits,
        volumeMilliunits: p.volumeMilliunits,
        createdAt: data.createdAt,
        createdBy: data.createdBy,
      }));
      for (const chunk of chunkArray(ptRows, SNAPSHOT_INSERT_CHUNK_SIZE)) {
        if (chunk.length > 0) {
          batchStmts.push(this.db.insert(schema.globalTankCalibrationTemplatePoints).values(chunk));
        }
      }
    }

    await (this.db as any).batch(batchStmts);

    return (await this.findGlobalTankCalibrationTemplateById(data.id))!;
  }

  async importGlobalTankCalibrationTemplatePoints(
    idOrCode: string,
    points: Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }>,
    actorUserId: string,
    options?: {
      status?: 'DRAFT' | 'APPROVED' | 'ACTIVE';
      approveImmediately?: boolean;
      allowOverCapacity?: boolean;
      allowEngineeringReviewReference?: boolean;
      tankDiameterMmMilliunits?: number | null;
      tankLengthMmMilliunits?: number | null;
      maxDipMmMilliunits?: number | null;
      sourceFileName?: string | null;
      referenceDocument?: string | null;
      notes?: string | null;
    }
  ): Promise<any> {
    const existing = await this.findGlobalTankCalibrationTemplateById(idOrCode);
    if (!existing) {
      const err = new Error(`Global calibration template not found: ${idOrCode}`);
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const effectiveDiameter =
      options?.tankDiameterMmMilliunits !== undefined
        ? options.tankDiameterMmMilliunits
        : existing.tankDiameterMmMilliunits;
    const effectiveLength =
      options?.tankLengthMmMilliunits !== undefined
        ? options.tankLengthMmMilliunits
        : existing.tankLengthMmMilliunits;
    const effectiveMaxDip =
      options?.maxDipMmMilliunits !== undefined
        ? options.maxDipMmMilliunits
        : existing.maxDipMmMilliunits;

    const targetStatus: 'DRAFT' | 'APPROVED' | 'ACTIVE' =
      options?.status
        ? options.status
        : options?.approveImmediately === true
          ? 'APPROVED'
          : 'DRAFT';

    const requiresApprovalValidation = targetStatus === 'APPROVED' || targetStatus === 'ACTIVE';
    const isStandardReferenceTemplate =
      existing.code === 'STANDARD_20KL' || existing.code === 'STANDARD_50KL';

    // Narrowly scoped engineering-review reference storage: strictly permitted ONLY on non-standard DRAFT templates
    const allowEngineeringReviewReference =
      Boolean(options?.allowEngineeringReviewReference) &&
      !requiresApprovalValidation &&
      !isStandardReferenceTemplate;

    const validatedPoints = this.validateGlobalTemplatePoints(points, {
      nominalCapacityLitres: existing.nominalCapacityLitres,
      tankDiameterMmMilliunits: effectiveDiameter,
      maxDipMmMilliunits: effectiveMaxDip,
      allowOverCapacity: options?.allowOverCapacity,
      allowEngineeringReviewReference,
      requireCompleteRange:
        requiresApprovalValidation || isStandardReferenceTemplate || allowEngineeringReviewReference,
    });

    const nowIso = new Date().toISOString();
    const batchStmts: any[] = [
      this.db
        .delete(schema.globalTankCalibrationTemplatePoints)
        .where(eq(schema.globalTankCalibrationTemplatePoints.templateId, existing.id)),
      this.db
        .update(schema.globalTankCalibrationTemplates)
        .set({
          tankDiameterMmMilliunits: effectiveDiameter,
          tankLengthMmMilliunits: effectiveLength,
          maxDipMmMilliunits: effectiveMaxDip ?? validatedPoints[validatedPoints.length - 1].dipMillimetresMilliunits,
          status: targetStatus,
          sourceFileName: options?.sourceFileName !== undefined ? options.sourceFileName : existing.sourceFileName,
          referenceDocument:
            options?.referenceDocument !== undefined ? options.referenceDocument : existing.referenceDocument,
          notes: options?.notes !== undefined ? options.notes : existing.notes,
          approvedBy: requiresApprovalValidation ? actorUserId : null,
          approvedAt: requiresApprovalValidation ? nowIso : null,
          updatedAt: nowIso,
        })
        .where(eq(schema.globalTankCalibrationTemplates.id, existing.id)),
    ];

    const ptRows = validatedPoints.map((p, idx) => ({
      id: `gtctp-${existing.id}-${idx + 1}`,
      templateId: existing.id,
      dipMillimetresMilliunits: p.dipMillimetresMilliunits,
      volumeMilliunits: p.volumeMilliunits,
      createdAt: nowIso,
      createdBy: actorUserId,
    }));

    for (const chunk of chunkArray(ptRows, SNAPSHOT_INSERT_CHUNK_SIZE)) {
      if (chunk.length > 0) {
        batchStmts.push(this.db.insert(schema.globalTankCalibrationTemplatePoints).values(chunk));
      }
    }

    await (this.db as any).batch(batchStmts);

    return (await this.findGlobalTankCalibrationTemplateById(existing.id))!;
  }

  async updateGlobalTankCalibrationTemplateStatus(
    idOrCode: string,
    status: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED',
    userId: string,
    updatedAt: string,
    options?: {
      allowOverCapacity?: boolean;
      confirmOverCapacity?: boolean;
    }
  ): Promise<any | null> {
    const existing = await this.findGlobalTankCalibrationTemplateById(idOrCode);
    if (!existing) return null;

    if (status === 'APPROVED' || status === 'ACTIVE') {
      const rawPoints = (existing.points || []).map((p: any) => ({
        dipMillimetresMilliunits: p.dipMillimetresMilliunits,
        volumeMilliunits: p.volumeMilliunits,
      }));
      if (rawPoints.length < 2) {
        const err = new Error(
          `Cannot mark global template ${existing.code} as ${status} unless complete dip-to-volume calibration points have been imported and validated`
        );
        (err as any).code = 'TEMPLATE_POINTS_NOT_VALIDATED';
        throw err;
      }

      const codeUpper = String(existing.code || '').toUpperCase();
      const isExcelReference = codeUpper.startsWith('EXCEL_');
      const nominalCapacityMilliunits = Math.round(existing.nominalCapacityLitres * 1000);
      const maxOverCapacityMilliunits = Math.round(nominalCapacityMilliunits * 1.1);
      const maxStoredVol = rawPoints.reduce(
        (m: number, p: { volumeMilliunits: number }) => Math.max(m, p.volumeMilliunits),
        0
      );
      const overCapacityConfirmed = Boolean(
        options?.allowOverCapacity || options?.confirmOverCapacity
      );

      const hasScopedPolicyException = Boolean(
        codeUpper === 'EXCEL_10KL_REFERENCE' &&
          existing.engineeringVerification?.decision === 'VERIFIED' &&
          existing.engineeringVerification?.allowScopedPolicyException === true &&
          existing.engineeringVerification?.governingPolicyReference &&
          existing.engineeringVerification?.discrepancyResolutionNote &&
          existing.engineeringVerification?.supportingDocumentId
      );

      if (maxStoredVol > maxOverCapacityMilliunits && !hasScopedPolicyException) {
        const err = new Error(
          `Cannot approve global template ${existing.code}: chart maximum volume ${formatMilliunits(maxStoredVol)} L exceeds the maximum permitted +10% over-capacity ceiling of ${formatMilliunits(maxOverCapacityMilliunits)} L (nominal ${existing.nominalCapacityLitres.toLocaleString()} L). Engineering review is required before this reference chart can be approved, assigned, or used in DSR calculations.`
        );
        (err as any).code = 'OVER_CAPACITY_CEILING_EXCEEDED';
        throw err;
      }

      if (codeUpper === 'EXCEL_15KL_REFERENCE' && existing.requiresDimensionVerification) {
        const err = new Error(
          `Cannot approve global template ${existing.code}: dimensional conflict between 5,500 mm and 3,750 mm length references is unresolved. Complete Engineering Verification against the tank's certified calibration chart (confirming 5,500 mm length and attaching supporting certification in Document Vault) before approval.`
        );
        (err as any).code = 'DIMENSION_CONFLICT_UNRESOLVED';
        throw err;
      }

      if (isExcelReference && existing.engineeringVerification?.decision !== 'VERIFIED') {
        const err = new Error(
          `Cannot approve global template ${existing.code}: Engineering Verification is required (with a certified calibration document in the Document Vault, verified tank dimensions, issuing authority, and engineering approver) before an imported Excel reference chart can transition to APPROVED.`
        );
        (err as any).code = 'ENGINEERING_VERIFICATION_REQUIRED';
        throw err;
      }

      if (maxStoredVol > nominalCapacityMilliunits && !overCapacityConfirmed) {
        const err = new Error(
          `Chart maximum volume ${formatMilliunits(maxStoredVol)} L exceeds nominal template capacity ${existing.nominalCapacityLitres.toLocaleString()} L. Explicit confirmation of above-nominal chart volume (up to the +10% ceiling of ${formatMilliunits(maxOverCapacityMilliunits)} L) is required to approve this template.`
        );
        (err as any).code = 'OVER_CAPACITY_CONFIRMATION_REQUIRED';
        throw err;
      }

      this.validateGlobalTemplatePoints(rawPoints, {
        nominalCapacityLitres: existing.nominalCapacityLitres,
        tankDiameterMmMilliunits: existing.tankDiameterMmMilliunits,
        maxDipMmMilliunits: existing.maxDipMmMilliunits,
        allowOverCapacity: overCapacityConfirmed,
        allowEngineeringReviewReference: hasScopedPolicyException,
        requireCompleteRange: true,
      });
    }

    const updates: any = {
      status,
      updatedAt,
    };
    if (status === 'APPROVED' || status === 'ACTIVE') {
      updates.approvedBy = userId;
      updates.approvedAt = updatedAt;
    } else if (status === 'DRAFT') {
      updates.approvedBy = null;
      updates.approvedAt = null;
    }
    await this.db
      .update(schema.globalTankCalibrationTemplates)
      .set(updates)
      .where(eq(schema.globalTankCalibrationTemplates.id, existing.id));
    return this.findGlobalTankCalibrationTemplateById(existing.id);
  }

  private isExcelWorkbookOrPlaceholderReference(ref: string | null | undefined): boolean {
    if (!ref) return true;
    const trimmed = String(ref).trim();
    if (!trimmed) return true;
    if (/\.xlsx?$/i.test(trimmed)) return true;
    if (/-EXCEL$/i.test(trimmed)) return true;
    if (/^legacy-d1-preserved$/i.test(trimmed)) return true;
    return false;
  }

  async recordGlobalTemplateEngineeringVerification(
    templateIdOrCode: string,
    payload: {
      decision: 'VERIFIED' | 'REJECTED' | 'PENDING_REVIEW';
      tankIdentifier: string;
      tankSerialNumber: string;
      verifiedCapacityLitres: number;
      verifiedDiameterMm: number;
      verifiedLengthMm: number;
      verifiedMaxDipMm: number;
      issuingAuthority: string;
      certificateNumber: string;
      verificationDate: string;
      engineeringApprover: string;
      supportingDocumentId: string;
      resolveLengthConflict?: boolean;
      confirmedLengthMm?: number | null;
      lengthResolutionNotes?: string | null;
      allowScopedPolicyException?: boolean;
      governingPolicyReference?: string | null;
      discrepancyResolutionNote?: string | null;
      comparedAgainstStandard20kl?: boolean;
      notes?: string | null;
    },
    userId: string
  ): Promise<{
    template: any;
    verification: CalibrationEngineeringVerificationRecord;
  }> {
    const template = await this.findGlobalTankCalibrationTemplateById(templateIdOrCode);
    if (!template) {
      const err = new Error(`Global calibration template not found: ${templateIdOrCode}`);
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const docId = String(payload.supportingDocumentId || '').trim();
    if (!docId) {
      const err = new Error(
        'Supporting certification document in Document Vault (supportingDocumentId) is required. An uploaded workbook filename or manually entered reference number cannot, by itself, serve as proof of certification.'
      );
      (err as any).code = 'SUPPORTING_DOCUMENT_REQUIRED';
      throw err;
    }

    const docRows = await this.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .limit(1);
    const doc = docRows[0];
    if (!doc) {
      const err = new Error(
        `Supporting document '${docId}' was not found in the Document Vault. Upload or select an official calibration certificate in the Document Vault first.`
      );
      (err as any).code = 'SUPPORTING_DOCUMENT_NOT_FOUND';
      throw err;
    }

    if (/\.xlsx?$/i.test(doc.name || '')) {
      const err = new Error(
        `Supporting document '${doc.name}' is an Excel workbook. An uploaded Excel workbook filename cannot serve as certification evidence; attach a certified calibration chart or Legal Metrology / Engineering certificate (PDF/image).`
      );
      (err as any).code = 'INVALID_CERTIFICATION_DOCUMENT';
      throw err;
    }

    const certNumber = String(payload.certificateNumber || '').trim();
    if (!certNumber || this.isExcelWorkbookOrPlaceholderReference(certNumber)) {
      const err = new Error(
        'A valid official calibration certificate/reference number is required (an Excel filename or -EXCEL placeholder is not accepted as proof of certification).'
      );
      (err as any).code = 'INVALID_CERTIFICATE_REFERENCE';
      throw err;
    }

    const tankIdentifier = String(payload.tankIdentifier || '').trim();
    const tankSerialNumber = String(payload.tankSerialNumber || '').trim();
    const issuingAuthority = String(payload.issuingAuthority || '').trim();
    const verificationDate = String(payload.verificationDate || '').trim();
    const engineeringApprover = String(payload.engineeringApprover || '').trim();

    if (!tankIdentifier || !tankSerialNumber || !issuingAuthority || !verificationDate || !engineeringApprover) {
      const err = new Error(
        'Tank identifier, serial/reference number, issuing authority, verification date, and engineering approver are all required for Engineering Verification.'
      );
      (err as any).code = 'MISSING_VERIFICATION_FIELDS';
      throw err;
    }

    const verifiedCapacityLitres = Number(payload.verifiedCapacityLitres);
    const verifiedDiameterMm = Number(payload.verifiedDiameterMm);
    const verifiedLengthMm = Number(payload.verifiedLengthMm);
    const verifiedMaxDipMm = Number(payload.verifiedMaxDipMm);

    if (
      !Number.isFinite(verifiedCapacityLitres) ||
      verifiedCapacityLitres <= 0 ||
      !Number.isFinite(verifiedDiameterMm) ||
      verifiedDiameterMm <= 0 ||
      !Number.isFinite(verifiedLengthMm) ||
      verifiedLengthMm <= 0 ||
      !Number.isFinite(verifiedMaxDipMm) ||
      verifiedMaxDipMm <= 0
    ) {
      const err = new Error('Verified capacity, diameter, length, and maximum dip must all be positive numbers.');
      (err as any).code = 'INVALID_VERIFIED_DIMENSIONS';
      throw err;
    }

    const codeUpper = String(template.code || '').toUpperCase();

    if (payload.decision === 'VERIFIED') {
      if (verifiedCapacityLitres !== template.nominalCapacityLitres) {
        const err = new Error(
          `Verified nominal capacity (${verifiedCapacityLitres.toLocaleString()} L) does not match template nominal capacity (${template.nominalCapacityLitres.toLocaleString()} L). Never alter nominal capacity to force approval.`
        );
        (err as any).code = 'VERIFIED_CAPACITY_MISMATCH';
        throw err;
      }

      if (
        (template.tankDiameterMm != null && verifiedDiameterMm !== template.tankDiameterMm) ||
        (template.tankLengthMm != null && verifiedLengthMm !== template.tankLengthMm) ||
        (template.maxDipMm != null && verifiedMaxDipMm !== template.maxDipMm)
      ) {
        const err = new Error(
          `Verified tank dimensions (${verifiedDiameterMm}×${verifiedLengthMm} mm, Max Dip ${verifiedMaxDipMm} mm) do not match template geometry (${template.tankDiameterMm}×${template.tankLengthMm} mm, Max Dip ${template.maxDipMm} mm).`
        );
        (err as any).code = 'VERIFIED_DIMENSION_MISMATCH';
        throw err;
      }

      if (codeUpper === 'EXCEL_10KL_REFERENCE' && payload.allowScopedPolicyException) {
        const govRef = String(payload.governingPolicyReference || '').trim();
        const discNote = String(payload.discrepancyResolutionNote || '').trim();
        if (!govRef || !discNote) {
          const err = new Error(
            'EXCEL_10KL_REFERENCE scoped policy exception requires both governingPolicyReference and discrepancyResolutionNote.'
          );
          (err as any).code = 'SCOPED_POLICY_EXCEPTION_REQUIRED';
          throw err;
        }
      }

      if (codeUpper === 'EXCEL_15KL_REFERENCE') {
        const lenNote = String(payload.lengthResolutionNotes || '').trim();
        if (
          !payload.resolveLengthConflict ||
          Number(payload.confirmedLengthMm) !== 5500 ||
          verifiedLengthMm !== 5500 ||
          !lenNote
        ) {
          const err = new Error(
            'EXCEL_15KL_REFERENCE has a dimensional conflict between 5,500 mm (calibration sheet) and 3,750 mm (workbook auxiliary note). Verification as VERIFIED requires resolveLengthConflict: true, confirmedLengthMm: 5500, and lengthResolutionNotes confirming the physical tank certificate.'
          );
          (err as any).code = 'DIMENSION_CONFLICT_UNRESOLVED';
          throw err;
        }
      }
    }

    const nowIso = new Date().toISOString();
    const recordId = `cev-tpl-${template.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const verificationRecord: CalibrationEngineeringVerificationRecord = {
      id: recordId,
      targetType: 'GLOBAL_TEMPLATE',
      targetId: template.id,
      templateCode: template.code,
      decision: payload.decision,
      tankIdentifier,
      tankSerialNumber,
      verifiedCapacityLitres,
      verifiedDiameterMm,
      verifiedLengthMm,
      verifiedMaxDipMm,
      issuingAuthority,
      certificateNumber: certNumber,
      verificationDate,
      engineeringApprover,
      supportingDocumentId: doc.id,
      supportingDocumentName: doc.name,
      supportingDocumentTitle: doc.name,
      supportingDocumentFileName: doc.name,
      supportingDocumentCategory: 'TANK_CALIBRATION_CHART',
      resolveLengthConflict: Boolean(payload.resolveLengthConflict),
      confirmedLengthMm: payload.confirmedLengthMm ?? verifiedLengthMm,
      lengthResolutionNotes: payload.lengthResolutionNotes ?? null,
      allowScopedPolicyException: Boolean(payload.allowScopedPolicyException),
      governingPolicyReference: payload.governingPolicyReference ?? null,
      discrepancyResolutionNote: payload.discrepancyResolutionNote ?? null,
      comparedAgainstStandard20kl:
        payload.comparedAgainstStandard20kl !== undefined
          ? Boolean(payload.comparedAgainstStandard20kl)
          : true,
      notes: payload.notes ?? null,
      verifiedByUserId: userId,
      verifiedAt: nowIso,
    };

    await this.db.insert(schema.auditLogs).values({
      id: recordId,
      userId,
      action: 'GLOBAL_TEMPLATE_ENGINEERING_VERIFICATION',
      entityType: 'CALIBRATION_ENGINEERING_VERIFICATION',
      entityId: template.id,
      newValueJson: JSON.stringify(verificationRecord),
      createdAt: nowIso,
    });

    await this.db.insert(schema.auditLogs).values({
      id: `${recordId}-audit`,
      userId,
      action: 'GLOBAL_TEMPLATE_ENGINEERING_VERIFICATION',
      entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      entityId: template.id,
      newValueJson: JSON.stringify(verificationRecord),
      createdAt: nowIso,
    });

    const updatedTemplate = await this.findGlobalTankCalibrationTemplateById(template.id);
    return {
      template: updatedTemplate,
      verification: updatedTemplate?.engineeringVerification || verificationRecord,
    };
  }

  async recordTankEngineeringVerification(
    tankId: string,
    payload: {
      decision: 'VERIFIED' | 'REJECTED' | 'PENDING_REVIEW';
      tankIdentifier: string;
      tankSerialNumber: string;
      verifiedCapacityLitres: number;
      verifiedDiameterMm: number;
      verifiedLengthMm: number;
      verifiedMaxDipMm: number;
      issuingAuthority: string;
      certificateNumber: string;
      verificationDate: string;
      engineeringApprover: string;
      supportingDocumentId: string;
      notes?: string | null;
    },
    userId: string
  ): Promise<{
    tank: Tank;
    verification: CalibrationEngineeringVerificationRecord;
  }> {
    const tank = await this.findTankById(tankId);
    if (!tank) {
      const err = new Error(`Tank not found: ${tankId}`);
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const docId = String(payload.supportingDocumentId || '').trim();
    if (!docId) {
      const err = new Error(
        'Supporting tank calibration certificate in Document Vault (supportingDocumentId) is required. An uploaded workbook filename or manually entered reference number cannot, by itself, serve as proof of certification.'
      );
      (err as any).code = 'SUPPORTING_DOCUMENT_REQUIRED';
      throw err;
    }

    const docRows = await this.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .limit(1);
    const doc = docRows[0];
    if (!doc) {
      const err = new Error(
        `Supporting document '${docId}' was not found in the Document Vault. Upload or select an official tank calibration certificate in the Document Vault first.`
      );
      (err as any).code = 'SUPPORTING_DOCUMENT_NOT_FOUND';
      throw err;
    }

    if (/\.xlsx?$/i.test(doc.name || '')) {
      const err = new Error(
        `Supporting document '${doc.name}' is an Excel workbook. Attach an official tank calibration certificate (PDF/image) in the Document Vault.`
      );
      (err as any).code = 'INVALID_CERTIFICATION_DOCUMENT';
      throw err;
    }

    const certNumber = String(payload.certificateNumber || '').trim();
    if (!certNumber || this.isExcelWorkbookOrPlaceholderReference(certNumber)) {
      const err = new Error(
        'A valid official tank calibration certificate/reference number is required (an Excel filename or -EXCEL placeholder is not accepted as proof of certification).'
      );
      (err as any).code = 'INVALID_CERTIFICATE_REFERENCE';
      throw err;
    }

    const tankIdentifier = String(payload.tankIdentifier || '').trim();
    const tankSerialNumber = String(payload.tankSerialNumber || '').trim();
    const issuingAuthority = String(payload.issuingAuthority || '').trim();
    const verificationDate = String(payload.verificationDate || '').trim();
    const engineeringApprover = String(payload.engineeringApprover || '').trim();

    if (!tankIdentifier || !tankSerialNumber || !issuingAuthority || !verificationDate || !engineeringApprover) {
      const err = new Error(
        'Tank identifier, serial/reference number, issuing authority, verification date, and engineering approver are all required for Tank Engineering Verification.'
      );
      (err as any).code = 'MISSING_VERIFICATION_FIELDS';
      throw err;
    }

    const verifiedCapacityLitres = Number(payload.verifiedCapacityLitres);
    const verifiedDiameterMm = Number(payload.verifiedDiameterMm);
    const verifiedLengthMm = Number(payload.verifiedLengthMm);
    const verifiedMaxDipMm = Number(payload.verifiedMaxDipMm);

    if (
      !Number.isFinite(verifiedCapacityLitres) ||
      verifiedCapacityLitres <= 0 ||
      !Number.isFinite(verifiedDiameterMm) ||
      verifiedDiameterMm <= 0 ||
      !Number.isFinite(verifiedLengthMm) ||
      verifiedLengthMm <= 0 ||
      !Number.isFinite(verifiedMaxDipMm) ||
      verifiedMaxDipMm <= 0
    ) {
      const err = new Error('Verified capacity, diameter, length, and maximum dip must all be positive numbers.');
      (err as any).code = 'INVALID_VERIFIED_DIMENSIONS';
      throw err;
    }

    if (payload.decision === 'VERIFIED' && verifiedCapacityLitres !== tank.capacityLitres) {
      const err = new Error(
        `Verified tank capacity (${verifiedCapacityLitres.toLocaleString()} L) does not match configured Tank #${tank.tankNumber} nominal capacity (${tank.capacityLitres.toLocaleString()} L).`
      );
      (err as any).code = 'VERIFIED_CAPACITY_MISMATCH';
      throw err;
    }

    const nowIso = new Date().toISOString();
    const recordId = `cev-tank-${tank.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const verificationRecord: CalibrationEngineeringVerificationRecord = {
      id: recordId,
      targetType: 'TANK',
      targetId: tank.id,
      decision: payload.decision,
      tankIdentifier,
      tankSerialNumber,
      verifiedCapacityLitres,
      verifiedDiameterMm,
      verifiedLengthMm,
      verifiedMaxDipMm,
      issuingAuthority,
      certificateNumber: certNumber,
      verificationDate,
      engineeringApprover,
      supportingDocumentId: doc.id,
      supportingDocumentName: doc.name,
      supportingDocumentTitle: doc.name,
      supportingDocumentFileName: doc.name,
      supportingDocumentCategory: 'TANK_CALIBRATION_CHART',
      notes: payload.notes ?? null,
      verifiedByUserId: userId,
      verifiedAt: nowIso,
    };

    await this.db.insert(schema.auditLogs).values({
      id: recordId,
      userId,
      action: 'TANK_CALIBRATION_ENGINEERING_VERIFICATION',
      entityType: 'TANK_CALIBRATION_ENGINEERING_VERIFICATION',
      entityId: tank.id,
      newValueJson: JSON.stringify(verificationRecord),
      createdAt: nowIso,
    });

    await this.db.insert(schema.auditLogs).values({
      id: `${recordId}-audit`,
      userId,
      action: 'TANK_CALIBRATION_ENGINEERING_VERIFICATION',
      entityType: 'GLOBAL_TANK_CALIBRATION_TEMPLATE',
      entityId: tank.id,
      newValueJson: JSON.stringify(verificationRecord),
      createdAt: nowIso,
    });

    return {
      tank,
      verification: verificationRecord,
    };
  }

  async suggestGlobalTemplateForTank(tankId: string): Promise<{
    tank: Tank;
    suggestedTemplate: any | null;
    matchReason: string;
    eligibilityStatus?: 'ELIGIBLE' | 'UNVERIFIED' | 'INELIGIBLE';
  }> {
    const tank = await this.findTankById(tankId);
    if (!tank) throw new Error(`Tank not found: ${tankId}`);

    const charts = await this.listCalibrationCharts(tankId);
    const tankVerifMap = await this.getEngineeringVerificationsMap('TANK');
    const physicalDimensions = this.resolveTankPhysicalDimensions(charts, tankVerifMap.get(tankId) || null);

    if (!physicalDimensions.isDimensionVerified || !physicalDimensions.isCertified) {
      return {
        tank,
        suggestedTemplate: null,
        eligibilityStatus: 'UNVERIFIED',
        matchReason: !physicalDimensions.isDimensionVerified
          ? 'UNVERIFIED: Tank-specific physical dimensions (diameter, length, max dip) are missing. Verify tank dimensions before matching a global calibration template.'
          : 'UNVERIFIED: Tank calibration certification / reference document is missing. Verify tank certification before matching a global calibration template.',
      };
    }

    const templates = await this.listGlobalTankCalibrationTemplates({ status: 'APPROVED' });
    let bestMatch: any | null = null;
    let dimensionMismatchReason: string | null = null;

    for (const t of templates) {
      if ((t.pointsCount || 0) < 2) continue;
      if (t.nominalCapacityLitres !== tank.capacityLitres) continue;

      const diaMatch =
        t.tankDiameterMm != null &&
        physicalDimensions.diameterMm != null &&
        t.tankDiameterMm === physicalDimensions.diameterMm;
      const lenMatch =
        t.tankLengthMm != null &&
        physicalDimensions.lengthMm != null &&
        t.tankLengthMm === physicalDimensions.lengthMm;
      const dipMatch =
        t.maxDipMm == null ||
        (physicalDimensions.maxDipMm != null && t.maxDipMm === physicalDimensions.maxDipMm);

      if (diaMatch && lenMatch && dipMatch) {
        bestMatch = t;
        break;
      } else {
        dimensionMismatchReason = `Nominal capacity ${tank.capacityLitres.toLocaleString()} L matches ${t.code}, but verified tank dimensions (${physicalDimensions.diameterMm}×${physicalDimensions.lengthMm} mm, Max Dip ${physicalDimensions.maxDipMm} mm) do not match ${t.code} (${t.tankDiameterMm}×${t.tankLengthMm} mm, Max Dip ${t.maxDipMm} mm)`;
      }
    }

    return {
      tank,
      suggestedTemplate: bestMatch,
      eligibilityStatus: bestMatch ? 'ELIGIBLE' : 'INELIGIBLE',
      matchReason: bestMatch
        ? `Exact nominal capacity (${tank.capacityLitres.toLocaleString()} L) and verified tank dimensions (${physicalDimensions.diameterMm}×${physicalDimensions.lengthMm} mm, Max Dip ${physicalDimensions.maxDipMm} mm) match APPROVED template ${bestMatch.code}`
        : dimensionMismatchReason ||
          `No validated APPROVED global template matches exact nominal capacity ${tank.capacityLitres.toLocaleString()} L and verified dimensions (${physicalDimensions.diameterMm}×${physicalDimensions.lengthMm} mm)`,
    };
  }

  private resolveTankPhysicalDimensions(
    charts: any[],
    tankVerification?: CalibrationEngineeringVerificationRecord | null
  ): {
    diameterMm: number | null;
    lengthMm: number | null;
    maxDipMm: number | null;
    source: 'ENGINEERING_VERIFIED' | 'ACTIVE_CHART' | 'APPROVED_CHART' | 'DRAFT_CHART' | 'UNVERIFIED';
    isDimensionVerified: boolean;
    isCertified: boolean;
    referenceDocument: string | null;
    sourceFileName: string | null;
    supportingDocumentId?: string | null;
    certificateNumber?: string | null;
    issuingAuthority?: string | null;
    engineeringApprover?: string | null;
  } {
    if (
      tankVerification &&
      tankVerification.decision === 'VERIFIED' &&
      tankVerification.verifiedDiameterMm > 0 &&
      tankVerification.verifiedLengthMm > 0 &&
      tankVerification.verifiedMaxDipMm > 0 &&
      tankVerification.supportingDocumentId &&
      !this.isExcelWorkbookOrPlaceholderReference(tankVerification.certificateNumber)
    ) {
      return {
        diameterMm: tankVerification.verifiedDiameterMm,
        lengthMm: tankVerification.verifiedLengthMm,
        maxDipMm: tankVerification.verifiedMaxDipMm,
        source: 'ENGINEERING_VERIFIED',
        isDimensionVerified: true,
        isCertified: true,
        referenceDocument: tankVerification.certificateNumber,
        sourceFileName: tankVerification.supportingDocumentFileName ?? null,
        supportingDocumentId: tankVerification.supportingDocumentId,
        certificateNumber: tankVerification.certificateNumber,
        issuingAuthority: tankVerification.issuingAuthority,
        engineeringApprover: tankVerification.engineeringApprover,
      };
    }

    const activeChart = charts.find(ch => ch.status === 'ACTIVE') || null;
    const approvedChart = charts.find(ch => ch.status === 'APPROVED') || null;
    const draftChart = charts.find(ch => ch.status === 'DRAFT') || null;
    const candidates = [activeChart, approvedChart, draftChart].filter(Boolean);

    for (const chart of candidates) {
      const hasDimensions =
        typeof chart.tankDiameterMmMilliunits === 'number' &&
        chart.tankDiameterMmMilliunits > 0 &&
        typeof chart.tankLengthMmMilliunits === 'number' &&
        chart.tankLengthMmMilliunits > 0 &&
        typeof chart.maxDipMmMilliunits === 'number' &&
        chart.maxDipMmMilliunits > 0;

      if (!hasDimensions) {
        continue;
      }

      const refDoc = chart.referenceDocument ? String(chart.referenceDocument).trim() : '';
      const srcFile = chart.sourceFileName ? String(chart.sourceFileName).trim() : '';
      const isLegacyBackfillWithoutRef =
        srcFile === 'legacy-d1-preserved' && refDoc.length === 0;

      // An uploaded workbook filename (.xlsx/.xls) or -EXCEL placeholder must NOT by itself be treated as proof of certification
      const hasValidReferenceDoc =
        refDoc.length > 0 && !this.isExcelWorkbookOrPlaceholderReference(refDoc);
      const hasValidSourceFile =
        srcFile.length > 0 && !this.isExcelWorkbookOrPlaceholderReference(srcFile);

      const hasCertification =
        !isLegacyBackfillWithoutRef &&
        Boolean(
          hasValidReferenceDoc ||
            hasValidSourceFile ||
            (chart.approvedBy && String(chart.approvedBy).trim().length > 0 && !this.isExcelWorkbookOrPlaceholderReference(refDoc || srcFile))
        );

      const diameterMm = Math.round(chart.tankDiameterMmMilliunits / 1000);
      const lengthMm = Math.round(chart.tankLengthMmMilliunits / 1000);
      const maxDipMm = Math.round(chart.maxDipMmMilliunits / 1000);

      if (hasCertification) {
        const source =
          chart.status === 'ACTIVE'
            ? 'ACTIVE_CHART'
            : chart.status === 'APPROVED'
              ? 'APPROVED_CHART'
              : 'DRAFT_CHART';
        return {
          diameterMm,
          lengthMm,
          maxDipMm,
          source,
          isDimensionVerified: true,
          isCertified: true,
          referenceDocument: chart.referenceDocument ?? null,
          sourceFileName: chart.sourceFileName ?? null,
        };
      }

      return {
        diameterMm,
        lengthMm,
        maxDipMm,
        source: 'UNVERIFIED',
        isDimensionVerified: true,
        isCertified: false,
        referenceDocument: null,
        sourceFileName: chart.sourceFileName ?? null,
      };
    }

    // Never infer or assume tank dimensions from nominal capacity
    return {
      diameterMm: null,
      lengthMm: null,
      maxDipMm: null,
      source: 'UNVERIFIED',
      isDimensionVerified: false,
      isCertified: false,
      referenceDocument: null,
      sourceFileName: null,
    };
  }

  private evaluateTankCompatibilityWithTemplate(
    tank: {
      id: string;
      tankNumber: number;
      name: string;
      capacityLitres: number;
    },
    outletType: string,
    charts: any[],
    template: {
      code: string;
      nominalCapacityLitres: number;
      tankDiameterMm: number | null;
      tankLengthMm: number | null;
      maxDipMm: number | null;
      requiresEngineeringReview?: boolean;
      requiresDimensionVerification?: boolean;
      isOverCapacityCeiling?: boolean;
      maxVolumeLitresStr?: string | null;
      engineeringVerification?: CalibrationEngineeringVerificationRecord | null;
    },
    tankVerification?: CalibrationEngineeringVerificationRecord | null
  ): {
    physicalDimensions: {
      diameterMm: number | null;
      lengthMm: number | null;
      maxDipMm: number | null;
      source: 'ENGINEERING_VERIFIED' | 'ACTIVE_CHART' | 'APPROVED_CHART' | 'DRAFT_CHART' | 'UNVERIFIED';
      referenceDocument: string | null;
      sourceFileName: string | null;
      supportingDocumentId?: string | null;
      certificateNumber?: string | null;
      issuingAuthority?: string | null;
      engineeringApprover?: string | null;
    };
    isCapacityMatch: boolean;
    isDimensionVerified: boolean;
    isCertified: boolean;
    isDimensionMatch: boolean;
    isCompatible: boolean;
    eligibilityStatus: 'ELIGIBLE' | 'UNVERIFIED' | 'INELIGIBLE';
    ineligibilityReason: string | null;
    capacityDifferenceLitres: number;
    tankEngineeringVerification: CalibrationEngineeringVerificationRecord | null;
  } {
    const resolvedDims = this.resolveTankPhysicalDimensions(charts, tankVerification);
    const { isDimensionVerified, isCertified, ...physicalDimensions } = resolvedDims;
    const isVerified = isDimensionVerified && isCertified;

    // Requirement 1: Exact nominal capacity match only (no ±5,000 L tolerance)
    const capacityDifferenceLitres = Math.abs(tank.capacityLitres - template.nominalCapacityLitres);
    const isCapacityMatch = tank.capacityLitres === template.nominalCapacityLitres;

    // Requirement 2 & 3: Physical compatibility requires verified tank-specific dimensions matching the template
    const templateDia = template.tankDiameterMm;
    const templateLen = template.tankLengthMm;
    const templateMaxDip = template.maxDipMm;

    const isDimensionMatch = Boolean(
      isVerified &&
        templateDia != null &&
        templateLen != null &&
        physicalDimensions.diameterMm != null &&
        physicalDimensions.lengthMm != null &&
        physicalDimensions.diameterMm === templateDia &&
        physicalDimensions.lengthMm === templateLen &&
        (templateMaxDip == null ||
          (physicalDimensions.maxDipMm != null &&
            physicalDimensions.maxDipMm === templateMaxDip))
    );

    const isCoco = outletType === 'COCO';
    const hasScopedPolicyException = Boolean(
      String(template.code || '').toUpperCase() === 'EXCEL_10KL_REFERENCE' &&
        template.engineeringVerification?.decision === 'VERIFIED' &&
        template.engineeringVerification?.allowScopedPolicyException === true
    );
    const isReviewBlocked = Boolean(
      template.requiresEngineeringReview || (template.isOverCapacityCeiling && !hasScopedPolicyException)
    );
    const isDimensionConflictBlocked = Boolean(template.requiresDimensionVerification);
    const isCompatible =
      isCoco &&
      isCapacityMatch &&
      isVerified &&
      isDimensionMatch &&
      !isReviewBlocked &&
      !isDimensionConflictBlocked;

    let eligibilityStatus: 'ELIGIBLE' | 'UNVERIFIED' | 'INELIGIBLE' = 'ELIGIBLE';
    let ineligibilityReason: string | null = null;

    if (!isCompatible) {
      if (isReviewBlocked) {
        eligibilityStatus = 'INELIGIBLE';
        ineligibilityReason = `ENGINEERING REVIEW REQUIRED: Reference template ${template.code} exceeds the +10% operational capacity ceiling (${template.maxVolumeLitresStr || 'above limit'} L vs ${(template.nominalCapacityLitres * 1.1).toLocaleString()} L ceiling) and cannot be assigned, activated, or used in DSR calculations until verified by an authorised engineer.`;
      } else if (isDimensionConflictBlocked) {
        eligibilityStatus = 'INELIGIBLE';
        ineligibilityReason = `DIMENSION VERIFICATION REQUIRED: Reference template ${template.code} has an unresolved length conflict (5,500 mm vs 3,750 mm note) and cannot be assigned until engineering verification confirms the physical tank certificate.`;
      } else if (!isCoco) {
        eligibilityStatus = 'INELIGIBLE';
        ineligibilityReason = `Outlet type is ${outletType}. Only COCO retail outlet tanks are eligible for Global Calibration Master assignment.`;
      } else if (!isCapacityMatch) {
        eligibilityStatus = 'INELIGIBLE';
        const unverifiedNote = !isDimensionVerified
          ? ' (Tank physical dimensions are also unverified.)'
          : !isCertified
            ? ' (Tank calibration certification is also missing.)'
            : '';
        ineligibilityReason = `Nominal capacity mismatch: Tank is ${tank.capacityLitres.toLocaleString()} L, but ${template.code} requires exact ${template.nominalCapacityLitres.toLocaleString()} L nominal capacity.${unverifiedNote}`;
      } else if (!isDimensionVerified) {
        eligibilityStatus = 'UNVERIFIED';
        ineligibilityReason =
          'UNVERIFIED: Missing verified tank-specific physical dimensions (diameter, length, max dip). Operational assignment is blocked until tank dimensions and certification are verified.';
      } else if (!isCertified) {
        eligibilityStatus = 'UNVERIFIED';
        ineligibilityReason =
          'UNVERIFIED: Missing calibration certification / reference document for tank physical dimensions. Operational assignment is blocked until certification is verified.';
      } else {
        eligibilityStatus = 'INELIGIBLE';
        ineligibilityReason = `Physical dimension mismatch: Verified tank dimensions are ${physicalDimensions.diameterMm?.toLocaleString()} mm Dia × ${physicalDimensions.lengthMm?.toLocaleString()} mm Len (Max Dip ${physicalDimensions.maxDipMm?.toLocaleString()} mm), which do not match ${template.code} (${templateDia?.toLocaleString()} mm Dia × ${templateLen?.toLocaleString()} mm Len, Max Dip ${templateMaxDip?.toLocaleString()} mm).`;
      }
    }

    return {
      physicalDimensions,
      isCapacityMatch,
      isDimensionVerified,
      isCertified,
      isDimensionMatch,
      isCompatible,
      eligibilityStatus,
      ineligibilityReason,
      capacityDifferenceLitres,
      tankEngineeringVerification: tankVerification ?? null,
    };
  }

  async listEligibleCocoTanksForTemplate(
    templateIdOrCode: string,
    options?: { outletId?: string; includeNonMatching?: boolean; onlyCompatible?: boolean }
  ): Promise<{
    template: any;
    tanks: any[];
    eligibleTanks: any[];
    ineligibleTanks: any[];
  }> {
    const template = await this.findGlobalTankCalibrationTemplateById(templateIdOrCode);
    if (!template) {
      const err = new Error(`Global calibration template not found: ${templateIdOrCode}`);
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const conditions: any[] = [eq(schema.retailOutlets.outletType, 'COCO')];
    if (options?.outletId) {
      conditions.push(eq(schema.tanks.outletId, options.outletId));
    }

    const rows = await this.db
      .select({
        tank: schema.tanks,
        outletCode: schema.retailOutlets.roCode,
        outletName: schema.retailOutlets.name,
        outletType: schema.retailOutlets.outletType,
        productCode: schema.products.code,
        productName: schema.products.name,
      })
      .from(schema.tanks)
      .innerJoin(schema.retailOutlets, eq(schema.tanks.outletId, schema.retailOutlets.id))
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(asc(schema.retailOutlets.roCode), asc(schema.tanks.tankNumber));

    const tankVerifMap = await this.getEngineeringVerificationsMap('TANK');
    const allEvaluated: any[] = [];

    for (const r of rows) {
      const charts = await this.listCalibrationCharts(r.tank.id);
      const activeChart = charts.find(ch => ch.status === 'ACTIVE') || null;
      const draftChart = charts.find(ch => ch.status === 'DRAFT') || null;

      const evalResult = this.evaluateTankCompatibilityWithTemplate(
        r.tank,
        r.outletType,
        charts,
        template,
        tankVerifMap.get(r.tank.id) || null
      );

      if (options?.onlyCompatible && !evalResult.isCompatible) {
        continue;
      }

      const maxRev = charts.reduce((m, c) => Math.max(m, c.revisionNumber), 0);

      allEvaluated.push({
        tankId: r.tank.id,
        tankNumber: r.tank.tankNumber,
        tankName: r.tank.name,
        outletId: r.tank.outletId,
        outletCode: r.outletCode,
        outletName: r.outletName,
        outletType: r.outletType,
        productId: r.tank.productId,
        productCode: r.productCode,
        productName: r.productName,
        capacityLitres: r.tank.capacityLitres,
        safeFillCapacityLitres: r.tank.safeFillCapacityLitres,
        status: r.tank.status,
        physicalDimensions: evalResult.physicalDimensions,
        tankEngineeringVerification: evalResult.tankEngineeringVerification,
        currentActiveChart: activeChart
          ? {
              id: activeChart.id,
              revisionNumber: activeChart.revisionNumber,
              pointsCount: activeChart.pointsCount ?? 0,
              status: activeChart.status,
              sourceTemplateId: (activeChart as any).sourceTemplateId ?? null,
            }
          : null,
        existingDraftChart: draftChart
          ? {
              id: draftChart.id,
              revisionNumber: draftChart.revisionNumber,
              pointsCount: draftChart.pointsCount ?? 0,
              status: draftChart.status,
              notes: draftChart.notes ?? null,
              sourceFileName: draftChart.sourceFileName ?? null,
              sourceTemplateId: (draftChart as any).sourceTemplateId ?? null,
            }
          : null,
        hasProtectedDraft: Boolean(draftChart),
        isCapacityMatch: evalResult.isCapacityMatch,
        isDimensionVerified: evalResult.isDimensionVerified,
        isCertified: evalResult.isCertified,
        isDimensionMatch: evalResult.isDimensionMatch,
        isCompatible: evalResult.isCompatible,
        eligibilityStatus: evalResult.eligibilityStatus,
        ineligibilityReason: evalResult.ineligibilityReason,
        targetRevisionNumber: maxRev + 1,
      });
    }

    const eligibleTanks = allEvaluated.filter(t => t.isCompatible && t.eligibilityStatus === 'ELIGIBLE');
    const ineligibleTanks = allEvaluated.filter(
      t => !t.isCompatible || t.eligibilityStatus !== 'ELIGIBLE'
    );

    // Order eligible tanks first, then unverified, then ineligible
    const sortedTanks = [...eligibleTanks, ...ineligibleTanks];

    return {
      template,
      tanks: sortedTanks,
      eligibleTanks,
      ineligibleTanks,
    };
  }

  async previewGlobalTemplateAssignment(
    templateIdOrCode: string,
    tankIds: string[]
  ): Promise<{
    template: any;
    totalTanksSelected: number;
    previews: any[];
  }> {
    const template = await this.findGlobalTankCalibrationTemplateById(templateIdOrCode);
    if (!template) {
      const err = new Error(`Global calibration template not found: ${templateIdOrCode}`);
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const hasScopedPolicyException = Boolean(
      String(template.code || '').toUpperCase() === 'EXCEL_10KL_REFERENCE' &&
        template.engineeringVerification?.decision === 'VERIFIED' &&
        template.engineeringVerification?.allowScopedPolicyException === true
    );

    if (template.requiresEngineeringReview || (template.isOverCapacityCeiling && !hasScopedPolicyException)) {
      const err = new Error(
        `Global reference template ${template.code} requires engineering review (chart maximum volume ${template.maxVolumeLitresStr} L exceeds the +10% operational capacity ceiling) and cannot be assigned, activated, or used in DSR calculations.`
      );
      (err as any).code = 'ENGINEERING_REVIEW_REQUIRED';
      throw err;
    }

    if (template.requiresDimensionVerification) {
      const err = new Error(
        `Global reference template ${template.code} has an unresolved dimensional conflict (5,500 mm vs 3,750 mm length note) and cannot be assigned until engineering verification confirms the physical tank certificate.`
      );
      (err as any).code = 'DIMENSION_CONFLICT_UNRESOLVED';
      throw err;
    }

    if (!Array.isArray(tankIds) || tankIds.length === 0) {
      const err = new Error('tankIds array is required');
      (err as any).code = 'BAD_REQUEST';
      throw err;
    }

    const tankVerifMap = await this.getEngineeringVerificationsMap('TANK');
    const previews: any[] = [];

    for (const tankId of tankIds) {
      const tank = await this.findTankById(tankId);
      if (!tank) {
        const err = new Error(`Tank not found: ${tankId}`);
        (err as any).code = 'INVALID_TANK';
        throw err;
      }

      const outletRows = await this.db
        .select({
          outletType: schema.retailOutlets.outletType,
          outletCode: schema.retailOutlets.roCode,
          outletName: schema.retailOutlets.name,
        })
        .from(schema.retailOutlets)
        .where(eq(schema.retailOutlets.id, tank.outletId))
        .limit(1);
      const outlet = outletRows[0];
      const outletType = outlet?.outletType || 'COCO';

      const charts = await this.listCalibrationCharts(tankId);
      const activeChart = charts.find(ch => ch.status === 'ACTIVE') || null;
      const draftChart = charts.find(ch => ch.status === 'DRAFT') || null;

      const evalResult = this.evaluateTankCompatibilityWithTemplate(
        tank,
        outletType,
        charts,
        template,
        tankVerifMap.get(tankId) || null
      );

      // Requirement 6: Reject incompatible or unverified tank IDs even if submitted directly through the API
      if (!evalResult.isCompatible) {
        const err = new Error(
          `Tank #${tank.tankNumber} (${tank.name}, ${tank.capacityLitres.toLocaleString()} L) is not eligible for ${template.code}: ${evalResult.ineligibilityReason}`
        );
        (err as any).code =
          evalResult.eligibilityStatus === 'UNVERIFIED'
            ? 'UNVERIFIED_TANK_DIMENSIONS'
            : 'INCOMPATIBLE_TANK';
        throw err;
      }

      const nextRev = charts.reduce((m, c) => Math.max(m, c.revisionNumber), 0) + 1;

      previews.push({
        tankId: tank.id,
        tankNumber: tank.tankNumber,
        tankName: tank.name,
        outletId: tank.outletId,
        outletCode: outlet?.outletCode,
        outletName: outlet?.outletName,
        outletType,
        productCode: tank.productCode,
        productName: tank.productName,
        capacityLitres: tank.capacityLitres,
        physicalDimensions: evalResult.physicalDimensions,
        currentActiveChart: activeChart
          ? {
              id: activeChart.id,
              revisionNumber: activeChart.revisionNumber,
              pointsCount: activeChart.pointsCount,
              status: activeChart.status,
            }
          : null,
        existingDraftChart: draftChart
          ? {
              id: draftChart.id,
              revisionNumber: draftChart.revisionNumber,
              pointsCount: draftChart.pointsCount,
              status: draftChart.status,
              notes: draftChart.notes,
            }
          : null,
        hasProtectedDraft: Boolean(draftChart),
        targetRevisionNumber: draftChart ? draftChart.revisionNumber : nextRev,
        targetStatus: 'DRAFT',
        isCapacityMatch: evalResult.isCapacityMatch,
        isDimensionVerified: evalResult.isDimensionVerified,
        isCertified: evalResult.isCertified,
        isDimensionMatch: evalResult.isDimensionMatch,
        isCompatible: true,
        eligibilityStatus: 'ELIGIBLE',
        ineligibilityReason: null,
        capacityDifferenceLitres: evalResult.capacityDifferenceLitres,
        recommendation: draftChart
          ? `Existing Rev #${draftChart.revisionNumber} DRAFT is preserved (will not overwrite)`
          : `Verified ${tank.capacityLitres.toLocaleString()} L tank (${evalResult.physicalDimensions.diameterMm}×${evalResult.physicalDimensions.lengthMm} mm) — will create Rev #${nextRev} DRAFT (ACTIVE chart preserved)`,
      });
    }

    return {
      template,
      totalTanksSelected: previews.length,
      previews,
    };
  }

  async assignGlobalTemplateToTanks(
    templateIdOrCode: string,
    tankIds: string[],
    userId: string,
    options?: {
      activateImmediately?: boolean;
      preserveExistingDraft?: boolean;
      notes?: string;
    }
  ): Promise<{
    template: any;
    assignments: Array<{
      tankId: string;
      tankName: string;
      chartId: string;
      revisionNumber: number;
      status: string;
      pointsCount: number;
      preservedExistingDraft?: boolean;
    }>;
  }> {
    const template = await this.findGlobalTankCalibrationTemplateById(templateIdOrCode);
    if (!template) {
      const err = new Error(`Global calibration template not found: ${templateIdOrCode}`);
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const hasScopedPolicyException = Boolean(
      String(template.code || '').toUpperCase() === 'EXCEL_10KL_REFERENCE' &&
        template.engineeringVerification?.decision === 'VERIFIED' &&
        template.engineeringVerification?.allowScopedPolicyException === true
    );

    if (template.requiresEngineeringReview || (template.isOverCapacityCeiling && !hasScopedPolicyException)) {
      const err = new Error(
        `Global reference template ${template.code} requires engineering review (chart maximum volume ${template.maxVolumeLitresStr} L exceeds the +10% operational capacity ceiling) and cannot be assigned, activated, or used in DSR calculations.`
      );
      (err as any).code = 'ENGINEERING_REVIEW_REQUIRED';
      throw err;
    }

    if (template.requiresDimensionVerification) {
      const err = new Error(
        `Global reference template ${template.code} has an unresolved dimensional conflict (5,500 mm vs 3,750 mm length note) and cannot be assigned until engineering verification confirms the physical tank certificate.`
      );
      (err as any).code = 'DIMENSION_CONFLICT_UNRESOLVED';
      throw err;
    }

    if (
      String(template.code || '').toUpperCase().startsWith('EXCEL_') &&
      template.engineeringVerification?.decision !== 'VERIFIED'
    ) {
      const err = new Error(
        `Global reference template ${template.code} has not completed Engineering Verification and cannot be assigned to operational tanks.`
      );
      (err as any).code = 'ENGINEERING_VERIFICATION_REQUIRED';
      throw err;
    }

    if (template.status !== 'APPROVED' && template.status !== 'ACTIVE') {
      const err = new Error(
        `Global template ${template.code} is in ${template.status} status and cannot be assigned to tanks until its dip-to-volume points are imported, validated, and marked APPROVED`
      );
      (err as any).code = 'TEMPLATE_NOT_APPROVED';
      throw err;
    }

    const points = await this.listGlobalTankCalibrationTemplatePoints(template.id);
    if (points.length < 2) {
      const err = new Error(`Global template ${template.code} has no validated calibration points`);
      (err as any).code = 'TEMPLATE_POINTS_NOT_VALIDATED';
      throw err;
    }

    const tankVerifMap = await this.getEngineeringVerificationsMap('TANK');

    // First pass: validate compatibility & verified dimensions for EVERY requested tank before modifying any data
    const validatedTankContexts: Array<{
      tank: Tank;
      charts: any[];
      existingDraft: any | null;
      evalResult: any;
    }> = [];

    for (const tankId of tankIds) {
      const tank = await this.findTankById(tankId);
      if (!tank) {
        const err = new Error(`Tank not found: ${tankId}`);
        (err as any).code = 'INVALID_TANK';
        throw err;
      }

      const outletRows = await this.db
        .select({ outletType: schema.retailOutlets.outletType })
        .from(schema.retailOutlets)
        .where(eq(schema.retailOutlets.id, tank.outletId))
        .limit(1);
      const outletType = outletRows[0]?.outletType || 'COCO';

      const charts = await this.listCalibrationCharts(tankId);
      const evalResult = this.evaluateTankCompatibilityWithTemplate(
        tank,
        outletType,
        charts,
        template,
        tankVerifMap.get(tankId) || null
      );

      // Requirement 6: Reject incompatible or unverified tank IDs even if submitted directly through the API
      if (!evalResult.isCompatible) {
        const err = new Error(
          `Tank #${tank.tankNumber} (${tank.name}, ${tank.capacityLitres.toLocaleString()} L) is not eligible for ${template.code}: ${evalResult.ineligibilityReason}`
        );
        (err as any).code =
          evalResult.eligibilityStatus === 'UNVERIFIED'
            ? 'UNVERIFIED_TANK_DIMENSIONS'
            : 'INCOMPATIBLE_TANK';
        throw err;
      }

      const existingDraft = charts.find(c => c.status === 'DRAFT') || null;
      validatedTankContexts.push({ tank, charts, existingDraft, evalResult });
    }

    const nowIso = new Date().toISOString();
    const effectiveFrom = nowIso.slice(0, 10);
    // Requirement 7: Keep all assignments DRAFT only. Never overwrite ACTIVE charts or existing DRAFT revisions.
    const chartStatus = 'DRAFT';

    const assignments: Array<{
      tankId: string;
      tankName: string;
      chartId: string;
      revisionNumber: number;
      status: string;
      pointsCount: number;
      preservedExistingDraft?: boolean;
    }> = [];

    for (const { tank, charts, existingDraft, evalResult } of validatedTankContexts) {
      const tankId = tank.id;

      // Always preserve existing DRAFT revisions (especially COCO 22 Tank #1 Revision #2 DRAFT)
      if (existingDraft) {
        assignments.push({
          tankId: tank.id,
          tankName: tank.name,
          chartId: existingDraft.id,
          revisionNumber: existingDraft.revisionNumber,
          status: 'DRAFT',
          pointsCount: existingDraft.pointsCount ?? 0,
          preservedExistingDraft: true,
        });
        continue;
      }

      const maxRev = charts.reduce((m, c) => Math.max(m, c.revisionNumber), 0);
      const nextRev = maxRev + 1;
      const chartId = `tcc-${tankId}-r${nextRev}-${Date.now().toString(36)}`;

      const batchStmts: any[] = [];

      batchStmts.push(
        this.db.insert(schema.tankCalibrationCharts).values({
          id: chartId,
          tankId: tankId,
          sourceTemplateId: template.id,
          revisionNumber: nextRev,
          status: chartStatus,
          chartUnitDip: 'MM',
          chartUnitVolume: 'LITRES',
          tankDiameterMmMilliunits: template.tankDiameterMmMilliunits,
          tankLengthMmMilliunits: template.tankLengthMmMilliunits,
          maxDipMmMilliunits: template.maxDipMmMilliunits,
          chartCapacityMilliunits: template.nominalCapacityLitres * 1000,
          sourceFileName: template.sourceFileName || `global-template-${template.code}`,
          referenceDocument:
            evalResult.physicalDimensions?.referenceDocument ||
            `ASSIGNED-${template.code}-REV${nextRev}`,
          notes: options?.notes || `Assigned as DRAFT from global calibration template ${template.code}`,
          effectiveFrom: effectiveFrom,
          approvedBy: null,
          approvedAt: null,
          createdAt: nowIso,
          createdBy: userId,
          updatedAt: nowIso,
          updatedBy: userId,
        })
      );

      const ptValues = points.map((p, idx) => ({
        id: `tcp-${chartId}-${idx + 1}`,
        chartId: chartId,
        tankId: tankId,
        dipMillimetresMilliunits: p.dipMillimetresMilliunits,
        volumeMilliunits: p.volumeMilliunits,
        createdAt: nowIso,
        createdBy: userId,
      }));

      for (const chunk of chunkArray(ptValues, SNAPSHOT_INSERT_CHUNK_SIZE)) {
        if (chunk.length > 0) {
          batchStmts.push(this.db.insert(schema.tankCalibrationPoints).values(chunk));
        }
      }

      await (this.db as any).batch(batchStmts);

      assignments.push({
        tankId: tank.id,
        tankName: tank.name,
        chartId: chartId,
        revisionNumber: nextRev,
        status: chartStatus,
        pointsCount: points.length,
        preservedExistingDraft: false,
      });
    }

    const refreshedTemplate = await this.findGlobalTankCalibrationTemplateById(template.id);
    return {
      template: refreshedTemplate || template,
      assignments,
    };
  }
}

