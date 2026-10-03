import { eq, and, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import {
  nfrSpaces,
  nfrVendors,
  nfrLeases,
  nfrRentDues,
  nfrRentPayments,
  documents,
  utilitySubMeters,
} from '../../db/schema';
import {
  NfrSpace,
  NfrVendor,
  NfrLease,
  NfrRentDue,
  NfrRentPayment,
  NfrType,
  NfrSpaceStatus,
  NfrVendorStatus,
  NfrLeaseStatus,
  NfrRentPaymentStatus,
  Document,
} from '../../shared/types';

export interface NfrSpaceFilters {
  nfrType?: NfrType;
  status?: NfrSpaceStatus;
}

export interface NfrVendorFilters {
  status?: NfrVendorStatus;
  search?: string;
}

export interface NfrLeaseFilters {
  spaceId?: string;
  vendorId?: string;
  status?: NfrLeaseStatus;
  nfrType?: NfrType;
  expiredOnly?: boolean;
}

export interface NfrRentDueFilters {
  leaseId?: string;
  vendorId?: string;
  spaceId?: string;
  billingMonth?: string;
  paymentStatus?: NfrRentPaymentStatus;
  overdueOnly?: boolean;
  fromDate?: string;
  toDate?: string;
}

export class NfrRepository {
  constructor(private db: AppDatabase) {}

  // ==========================================================================
  // SPACES
  // ==========================================================================

  async getSpaceById(id: string): Promise<NfrSpace | undefined> {
    const res = await this.db
      .select()
      .from(nfrSpaces)
      .where(eq(nfrSpaces.id, id))
      .get();
    return (res as unknown as NfrSpace) || undefined;
  }

  async getSpaceByCode(outletId: string, spaceCode: string): Promise<NfrSpace | undefined> {
    const res = await this.db
      .select()
      .from(nfrSpaces)
      .where(
        and(
          eq(nfrSpaces.outletId, outletId),
          eq(nfrSpaces.spaceCode, spaceCode)
        )
      )
      .get();
    return (res as unknown as NfrSpace) || undefined;
  }

  async listSpaces(outletId: string, filters?: NfrSpaceFilters): Promise<NfrSpace[]> {
    const conditions = [eq(nfrSpaces.outletId, outletId)];

    if (filters?.nfrType) {
      conditions.push(eq(nfrSpaces.nfrType, filters.nfrType));
    }
    if (filters?.status) {
      conditions.push(eq(nfrSpaces.status, filters.status));
    }

    const rows = await this.db
      .select()
      .from(nfrSpaces)
      .where(and(...conditions))
      .orderBy(asc(nfrSpaces.spaceCode))
      .all();

    return rows as unknown as NfrSpace[];
  }

  async createSpace(space: {
    id: string;
    outletId: string;
    spaceCode: string;
    name: string;
    nfrType: NfrType;
    locationDescription?: string | null;
    status?: NfrSpaceStatus;
    notes?: string | null;
    createdBy: string;
  }): Promise<NfrSpace> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(nfrSpaces)
      .values({
        id: space.id,
        outletId: space.outletId,
        spaceCode: space.spaceCode,
        name: space.name,
        nfrType: space.nfrType,
        locationDescription: space.locationDescription || null,
        status: space.status || 'ACTIVE',
        notes: space.notes || null,
        createdBy: space.createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return row as unknown as NfrSpace;
  }

  async updateSpace(
    id: string,
    updates: {
      name?: string;
      nfrType?: NfrType;
      locationDescription?: string | null;
      status?: NfrSpaceStatus;
      notes?: string | null;
    }
  ): Promise<NfrSpace | undefined> {
    const now = new Date().toISOString();
    const updateValues: Record<string, any> = { updatedAt: now };

    if (updates.name !== undefined) updateValues.name = updates.name;
    if (updates.nfrType !== undefined) updateValues.nfrType = updates.nfrType;
    if (updates.locationDescription !== undefined) updateValues.locationDescription = updates.locationDescription;
    if (updates.status !== undefined) updateValues.status = updates.status;
    if (updates.notes !== undefined) updateValues.notes = updates.notes;

    const row = await this.db
      .update(nfrSpaces)
      .set(updateValues)
      .where(eq(nfrSpaces.id, id))
      .returning()
      .get();

    return (row as unknown as NfrSpace) || undefined;
  }

  async isSpaceCurrentlyLeased(spaceId: string, currentDateStr: string): Promise<boolean> {
    const row = await this.db
      .select({ id: nfrLeases.id })
      .from(nfrLeases)
      .where(
        and(
          eq(nfrLeases.spaceId, spaceId),
          eq(nfrLeases.status, 'ACTIVE'),
          lte(nfrLeases.leaseStartDate, currentDateStr),
          gte(nfrLeases.leaseEndDate, currentDateStr)
        )
      )
      .get();

    return !!row;
  }

  // ==========================================================================
  // VENDORS
  // ==========================================================================

  async getVendorById(id: string): Promise<NfrVendor | undefined> {
    const res = await this.db
      .select()
      .from(nfrVendors)
      .where(eq(nfrVendors.id, id))
      .get();
    return (res as unknown as NfrVendor) || undefined;
  }

  async listVendors(outletId: string, filters?: NfrVendorFilters): Promise<NfrVendor[]> {
    const conditions = [eq(nfrVendors.outletId, outletId)];

    if (filters?.status) {
      conditions.push(eq(nfrVendors.status, filters.status));
    }
    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim().toLowerCase()}%`;
      conditions.push(
        sql`(lower(${nfrVendors.vendorName}) LIKE ${q} OR lower(${nfrVendors.ownerContactName}) LIKE ${q})`
      );
    }

    const rows = await this.db
      .select()
      .from(nfrVendors)
      .where(and(...conditions))
      .orderBy(asc(nfrVendors.vendorName))
      .all();

    return rows as unknown as NfrVendor[];
  }

  async createVendor(vendor: {
    id: string;
    outletId: string;
    vendorName: string;
    ownerContactName: string;
    ownerContactPhone: string;
    ownerContactEmail?: string | null;
    address?: string | null;
    status?: NfrVendorStatus;
    notes?: string | null;
    createdBy: string;
  }): Promise<NfrVendor> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(nfrVendors)
      .values({
        id: vendor.id,
        outletId: vendor.outletId,
        vendorName: vendor.vendorName,
        ownerContactName: vendor.ownerContactName,
        ownerContactPhone: vendor.ownerContactPhone,
        ownerContactEmail: vendor.ownerContactEmail || null,
        address: vendor.address || null,
        status: vendor.status || 'ACTIVE',
        notes: vendor.notes || null,
        createdBy: vendor.createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return row as unknown as NfrVendor;
  }

  async updateVendor(
    id: string,
    updates: {
      vendorName?: string;
      ownerContactName?: string;
      ownerContactPhone?: string;
      ownerContactEmail?: string | null;
      address?: string | null;
      status?: NfrVendorStatus;
      notes?: string | null;
    }
  ): Promise<NfrVendor | undefined> {
    const now = new Date().toISOString();
    const updateValues: Record<string, any> = { updatedAt: now };

    if (updates.vendorName !== undefined) updateValues.vendorName = updates.vendorName;
    if (updates.ownerContactName !== undefined) updateValues.ownerContactName = updates.ownerContactName;
    if (updates.ownerContactPhone !== undefined) updateValues.ownerContactPhone = updates.ownerContactPhone;
    if (updates.ownerContactEmail !== undefined) updateValues.ownerContactEmail = updates.ownerContactEmail;
    if (updates.address !== undefined) updateValues.address = updates.address;
    if (updates.status !== undefined) updateValues.status = updates.status;
    if (updates.notes !== undefined) updateValues.notes = updates.notes;

    const row = await this.db
      .update(nfrVendors)
      .set(updateValues)
      .where(eq(nfrVendors.id, id))
      .returning()
      .get();

    return (row as unknown as NfrVendor) || undefined;
  }

  // ==========================================================================
  // LEASES
  // ==========================================================================

  async getLeaseById(id: string): Promise<NfrLease | undefined> {
    const res = await this.db
      .select()
      .from(nfrLeases)
      .where(eq(nfrLeases.id, id))
      .get();
    return (res as unknown as NfrLease) || undefined;
  }

  async findAgreementDuplicate(
    outletId: string,
    agreementNumber: string,
    excludeId?: string
  ): Promise<NfrLease | undefined> {
    const conditions = [
      eq(nfrLeases.outletId, outletId),
      eq(nfrLeases.agreementNumber, agreementNumber),
    ];
    if (excludeId) {
      conditions.push(sql`${nfrLeases.id} != ${excludeId}`);
    }

    const res = await this.db
      .select()
      .from(nfrLeases)
      .where(and(...conditions))
      .get();

    return (res as unknown as NfrLease) || undefined;
  }

  async findOverlappingLease(
    spaceId: string,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): Promise<NfrLease | undefined> {
    const conditions = [
      eq(nfrLeases.spaceId, spaceId),
      eq(nfrLeases.status, 'ACTIVE'),
      lte(nfrLeases.leaseStartDate, endDate),
      gte(nfrLeases.leaseEndDate, startDate),
    ];
    if (excludeId) {
      conditions.push(sql`${nfrLeases.id} != ${excludeId}`);
    }

    const res = await this.db
      .select()
      .from(nfrLeases)
      .where(and(...conditions))
      .get();

    return (res as unknown as NfrLease) || undefined;
  }

  async listLeases(
    outletId: string,
    filters?: NfrLeaseFilters,
    currentDateStr?: string
  ): Promise<(NfrLease & { space?: NfrSpace; vendor?: NfrVendor })[]> {
    const conditions = [eq(nfrLeases.outletId, outletId)];

    if (filters?.spaceId) {
      conditions.push(eq(nfrLeases.spaceId, filters.spaceId));
    }
    if (filters?.vendorId) {
      conditions.push(eq(nfrLeases.vendorId, filters.vendorId));
    }
    if (filters?.status) {
      conditions.push(eq(nfrLeases.status, filters.status));
    }
    if (filters?.expiredOnly && currentDateStr) {
      conditions.push(eq(nfrLeases.status, 'ACTIVE'));
      conditions.push(sql`${nfrLeases.leaseEndDate} < ${currentDateStr}`);
    }

    const rows = await this.db
      .select({
        lease: nfrLeases,
        space: nfrSpaces,
        vendor: nfrVendors,
      })
      .from(nfrLeases)
      .innerJoin(nfrSpaces, eq(nfrLeases.spaceId, nfrSpaces.id))
      .innerJoin(nfrVendors, eq(nfrLeases.vendorId, nfrVendors.id))
      .where(and(...conditions))
      .orderBy(desc(nfrLeases.createdAt))
      .all();

    let result = rows.map(r => ({
      ...(r.lease as unknown as NfrLease),
      space: r.space as unknown as NfrSpace,
      vendor: r.vendor as unknown as NfrVendor,
    }));

    if (filters?.nfrType) {
      result = result.filter(l => l.space?.nfrType === filters.nfrType);
    }

    return result;
  }

  async createLease(lease: {
    id: string;
    outletId: string;
    spaceId: string;
    vendorId: string;
    agreementNumber: string;
    leaseStartDate: string;
    leaseEndDate: string;
    monthlyRentPaise: number;
    securityDepositPaise: number;
    monthlyDueDay: number;
    agreementDocumentId?: string | null;
    subMeterId?: string | null;
    notes?: string | null;
    createdBy: string;
  }): Promise<NfrLease> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(nfrLeases)
      .values({
        id: lease.id,
        outletId: lease.outletId,
        spaceId: lease.spaceId,
        vendorId: lease.vendorId,
        agreementNumber: lease.agreementNumber,
        leaseStartDate: lease.leaseStartDate,
        leaseEndDate: lease.leaseEndDate,
        monthlyRentPaise: lease.monthlyRentPaise,
        securityDepositPaise: lease.securityDepositPaise,
        monthlyDueDay: lease.monthlyDueDay,
        agreementDocumentId: lease.agreementDocumentId || null,
        subMeterId: lease.subMeterId || null,
        status: 'ACTIVE',
        notes: lease.notes || null,
        createdBy: lease.createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return row as unknown as NfrLease;
  }

  async updateActiveLease(
    id: string,
    updates: {
      spaceId?: string;
      vendorId?: string;
      agreementNumber?: string;
      leaseStartDate?: string;
      leaseEndDate?: string;
      monthlyRentPaise?: number;
      securityDepositPaise?: number;
      monthlyDueDay?: number;
      agreementDocumentId?: string | null;
      subMeterId?: string | null;
      notes?: string | null;
    }
  ): Promise<NfrLease | undefined> {
    const now = new Date().toISOString();
    const updateValues: Record<string, any> = { updatedAt: now };

    if (updates.spaceId !== undefined) updateValues.spaceId = updates.spaceId;
    if (updates.vendorId !== undefined) updateValues.vendorId = updates.vendorId;
    if (updates.agreementNumber !== undefined) updateValues.agreementNumber = updates.agreementNumber;
    if (updates.leaseStartDate !== undefined) updateValues.leaseStartDate = updates.leaseStartDate;
    if (updates.leaseEndDate !== undefined) updateValues.leaseEndDate = updates.leaseEndDate;
    if (updates.monthlyRentPaise !== undefined) updateValues.monthlyRentPaise = updates.monthlyRentPaise;
    if (updates.securityDepositPaise !== undefined) updateValues.securityDepositPaise = updates.securityDepositPaise;
    if (updates.monthlyDueDay !== undefined) updateValues.monthlyDueDay = updates.monthlyDueDay;
    if (updates.agreementDocumentId !== undefined) updateValues.agreementDocumentId = updates.agreementDocumentId;
    if (updates.subMeterId !== undefined) updateValues.subMeterId = updates.subMeterId;
    if (updates.notes !== undefined) updateValues.notes = updates.notes;

    const row = await this.db
      .update(nfrLeases)
      .set(updateValues)
      .where(and(eq(nfrLeases.id, id), eq(nfrLeases.status, 'ACTIVE')))
      .returning()
      .get();

    return (row as unknown as NfrLease) || undefined;
  }

  async terminateLeaseConditional(
    id: string,
    terminationReason: string | null | undefined,
    terminatedByUserId: string,
    terminatedAt: string
  ): Promise<NfrLease | undefined> {
    const now = new Date().toISOString();
    const row = await this.db
      .update(nfrLeases)
      .set({
        status: 'TERMINATED',
        terminatedAt,
        terminationReason: terminationReason || null,
        terminatedByUserId,
        updatedAt: now,
      })
      .where(and(eq(nfrLeases.id, id), eq(nfrLeases.status, 'ACTIVE')))
      .returning()
      .get();

    return (row as unknown as NfrLease) || undefined;
  }

  // ==========================================================================
  // RENT DUES
  // ==========================================================================

  async getRentDueById(id: string): Promise<NfrRentDue | undefined> {
    const res = await this.db
      .select()
      .from(nfrRentDues)
      .where(eq(nfrRentDues.id, id))
      .get();
    return (res as unknown as NfrRentDue) || undefined;
  }

  async findRentDueByMonth(leaseId: string, billingMonth: string): Promise<NfrRentDue | undefined> {
    const res = await this.db
      .select()
      .from(nfrRentDues)
      .where(
        and(
          eq(nfrRentDues.leaseId, leaseId),
          eq(nfrRentDues.billingMonth, billingMonth)
        )
      )
      .get();
    return (res as unknown as NfrRentDue) || undefined;
  }

  async listRentDues(
    outletId: string,
    filters?: NfrRentDueFilters
  ): Promise<(NfrRentDue & { lease?: NfrLease; totalPaidPaise: number; paymentCount: number })[]> {
    const conditions = [eq(nfrRentDues.outletId, outletId)];

    if (filters?.leaseId) {
      conditions.push(eq(nfrRentDues.leaseId, filters.leaseId));
    }
    if (filters?.billingMonth) {
      conditions.push(eq(nfrRentDues.billingMonth, filters.billingMonth));
    }
    if (filters?.fromDate) {
      conditions.push(gte(nfrRentDues.dueDate, filters.fromDate));
    }
    if (filters?.toDate) {
      conditions.push(lte(nfrRentDues.dueDate, filters.toDate));
    }

    const rows = await this.db
      .select({
        due: nfrRentDues,
        lease: nfrLeases,
      })
      .from(nfrRentDues)
      .innerJoin(nfrLeases, eq(nfrRentDues.leaseId, nfrLeases.id))
      .where(and(...conditions))
      .orderBy(desc(nfrRentDues.dueDate), desc(nfrRentDues.createdAt))
      .all();

    // Query payment aggregates for all dues in this outlet
    const paymentSums = await this.db
      .select({
        rentDueId: nfrRentPayments.rentDueId,
        totalPaidPaise: sql<number>`coalesce(sum(${nfrRentPayments.amountPaise}), 0)`.mapWith(Number),
        paymentCount: sql<number>`count(${nfrRentPayments.id})`.mapWith(Number),
      })
      .from(nfrRentPayments)
      .where(eq(nfrRentPayments.outletId, outletId))
      .groupBy(nfrRentPayments.rentDueId)
      .all();

    const sumMap = new Map<string, { totalPaidPaise: number; paymentCount: number }>();
    for (const ps of paymentSums) {
      sumMap.set(ps.rentDueId, {
        totalPaidPaise: ps.totalPaidPaise,
        paymentCount: ps.paymentCount,
      });
    }

    let result = rows.map(r => {
      const p = sumMap.get(r.due.id) || { totalPaidPaise: 0, paymentCount: 0 };
      return {
        ...(r.due as unknown as NfrRentDue),
        lease: r.lease as unknown as NfrLease,
        totalPaidPaise: p.totalPaidPaise,
        paymentCount: p.paymentCount,
      };
    });

    if (filters?.vendorId) {
      result = result.filter(d => d.lease?.vendorId === filters.vendorId);
    }
    if (filters?.spaceId) {
      result = result.filter(d => d.lease?.spaceId === filters.spaceId);
    }

    return result;
  }

  async createRentDue(due: {
    id: string;
    outletId: string;
    leaseId: string;
    billingMonth: string;
    rentPeriodStart: string;
    rentPeriodEnd: string;
    dueDate: string;
    monthlyRentPaiseSnapshot: number;
    createdBy: string;
  }): Promise<NfrRentDue> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(nfrRentDues)
      .values({
        id: due.id,
        outletId: due.outletId,
        leaseId: due.leaseId,
        billingMonth: due.billingMonth,
        rentPeriodStart: due.rentPeriodStart,
        rentPeriodEnd: due.rentPeriodEnd,
        dueDate: due.dueDate,
        monthlyRentPaiseSnapshot: due.monthlyRentPaiseSnapshot,
        createdBy: due.createdBy,
        createdAt: now,
      })
      .returning()
      .get();

    return row as unknown as NfrRentDue;
  }

  // ==========================================================================
  // RENT PAYMENTS
  // ==========================================================================

  async getRentPaymentById(id: string): Promise<NfrRentPayment | undefined> {
    const res = await this.db
      .select()
      .from(nfrRentPayments)
      .where(eq(nfrRentPayments.id, id))
      .get();
    return (res as unknown as NfrRentPayment) || undefined;
  }

  async listRentPayments(rentDueId: string): Promise<NfrRentPayment[]> {
    const rows = await this.db
      .select()
      .from(nfrRentPayments)
      .where(eq(nfrRentPayments.rentDueId, rentDueId))
      .orderBy(asc(nfrRentPayments.paidAt), asc(nfrRentPayments.createdAt))
      .all();

    return rows as unknown as NfrRentPayment[];
  }

  async sumRentPayments(rentDueId: string): Promise<{ totalPaidPaise: number; paymentCount: number }> {
    const res = await this.db
      .select({
        totalPaidPaise: sql<number>`coalesce(sum(${nfrRentPayments.amountPaise}), 0)`.mapWith(Number),
        paymentCount: sql<number>`count(${nfrRentPayments.id})`.mapWith(Number),
      })
      .from(nfrRentPayments)
      .where(eq(nfrRentPayments.rentDueId, rentDueId))
      .get();

    return {
      totalPaidPaise: res?.totalPaidPaise || 0,
      paymentCount: res?.paymentCount || 0,
    };
  }

  async createRentPayment(payment: {
    id: string;
    outletId: string;
    rentDueId: string;
    amountPaise: number;
    receiptDocumentId: string;
    paymentReference?: string | null;
    paidAt: string;
    recordedByUserId: string;
    notes?: string | null;
  }): Promise<NfrRentPayment> {
    const now = new Date().toISOString();
    const row = await this.db
      .insert(nfrRentPayments)
      .values({
        id: payment.id,
        outletId: payment.outletId,
        rentDueId: payment.rentDueId,
        amountPaise: payment.amountPaise,
        receiptDocumentId: payment.receiptDocumentId,
        paymentReference: payment.paymentReference || null,
        paidAt: payment.paidAt,
        recordedByUserId: payment.recordedByUserId,
        notes: payment.notes || null,
        createdAt: now,
      })
      .returning()
      .get();

    return row as unknown as NfrRentPayment;
  }

  // ==========================================================================
  // REFERENCE LOOKUPS
  // ==========================================================================

  async getDocumentById(id: string): Promise<Document | undefined> {
    const res = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .get();
    return (res as unknown as Document) || undefined;
  }

  async getSubMeterById(
    id: string
  ): Promise<
    | {
        id: string;
        outletId: string;
        beneficiaryType: string;
        status: string;
        meterCode: string;
        name: string;
      }
    | undefined
  > {
    const res = await this.db
      .select({
        id: utilitySubMeters.id,
        outletId: utilitySubMeters.outletId,
        beneficiaryType: utilitySubMeters.beneficiaryType,
        status: utilitySubMeters.status,
        meterCode: utilitySubMeters.meterCode,
        name: utilitySubMeters.name,
      })
      .from(utilitySubMeters)
      .where(eq(utilitySubMeters.id, id))
      .get();

    return res || undefined;
  }
}
