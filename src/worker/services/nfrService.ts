import { NfrRepository, NfrSpaceFilters, NfrVendorFilters, NfrLeaseFilters, NfrRentDueFilters } from '../repositories/nfrRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { AppDatabase } from '../../db';
import {
  CreateNfrSpaceSchema,
  UpdateNfrSpaceSchema,
  CreateNfrVendorSchema,
  UpdateNfrVendorSchema,
  CreateNfrLeaseSchema,
  UpdateNfrLeaseSchema,
  TerminateNfrLeaseSchema,
  GenerateNfrRentDueSchema,
  CreateNfrRentPaymentSchema,
  NfrSpaceFilterSchema,
  NfrVendorFilterSchema,
  NfrLeaseFilterSchema,
  NfrRentDueFilterSchema,
} from '../../shared/validators';
import {
  NfrSpace,
  NfrVendor,
  NfrLease,
  NfrRentDue,
  NfrRentPayment,
  NfrSummary,
  NfrRentPaymentStatus,
} from '../../shared/types';
import { parseMoneyToPaise, formatPaiseToMoney, checkedUtilityMoneyAdd } from '../../shared/utilityUtils';

export class NfrError extends Error {
  constructor(public code: string, message: string, public status: number = 400) {
    super(message);
    this.name = 'NfrError';
  }
}

function safeParseMoney(amount: string, fieldName = 'Money'): number {
  try {
    return parseMoneyToPaise(amount);
  } catch (err: any) {
    if (err instanceof NfrError) throw err;
    if (err.message && err.message.includes('OVERFLOW')) {
      throw new NfrError('VALIDATION_ERROR', `${fieldName} amount exceeds safe financial limits.`, 400);
    }
    throw new NfrError('VALIDATION_ERROR', `Invalid ${fieldName.toLowerCase()} format.`, 400);
  }
}

export function deriveRentPeriodAndDueDate(billingMonth: string, monthlyDueDay: number): {
  rentPeriodStart: string;
  rentPeriodEnd: string;
  dueDate: string;
} {
  const [yearStr, monthStr] = billingMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const rentPeriodStart = `${yearStr}-${monthStr}-01`;

  // Number of days in this month
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rentPeriodEnd = `${yearStr}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

  const clampedDueDay = Math.min(monthlyDueDay, daysInMonth);
  const dueDate = `${yearStr}-${monthStr}-${String(clampedDueDay).padStart(2, '0')}`;

  return { rentPeriodStart, rentPeriodEnd, dueDate };
}

function formatLeaseDto(lease: NfrLease, currentDateStr?: string): NfrLease {
  const today = currentDateStr || new Date().toISOString().slice(0, 10);
  const isExpired = lease.status === 'ACTIVE' && lease.leaseEndDate < today;
  return {
    ...lease,
    monthlyRentStr: formatPaiseToMoney(lease.monthlyRentPaise),
    securityDepositStr: formatPaiseToMoney(lease.securityDepositPaise),
    isExpired,
  };
}

function formatRentDueDto(
  due: NfrRentDue,
  totalPaidPaise: number,
  paymentCount: number,
  currentDateStr?: string
): NfrRentDue {
  const today = currentDateStr || new Date().toISOString().slice(0, 10);
  const rentAmount = due.monthlyRentPaiseSnapshot;
  const outstandingPaise = Math.max(0, rentAmount - totalPaidPaise);

  let paymentStatus: NfrRentPaymentStatus = 'PENDING';
  if (totalPaidPaise >= rentAmount) {
    paymentStatus = 'PAID';
  } else if (totalPaidPaise > 0) {
    paymentStatus = 'PARTIAL';
  }

  const isOverdue = paymentStatus !== 'PAID' && due.dueDate < today;

  return {
    ...due,
    monthlyRentStr: formatPaiseToMoney(due.monthlyRentPaiseSnapshot),
    totalPaidPaise,
    totalPaidStr: formatPaiseToMoney(totalPaidPaise),
    outstandingPaise,
    outstandingStr: formatPaiseToMoney(outstandingPaise),
    paymentStatus,
    isOverdue,
    paymentCount,
  };
}

function mapDatabaseError(err: any): never {
  const msg = err?.message || String(err);

  if (msg.includes('NFR_SPACE_DELETE_FORBIDDEN')) {
    throw new NfrError('NFR_SPACE_DELETE_FORBIDDEN', 'NFR spaces cannot be deleted. Deactivate instead.', 409);
  }
  if (msg.includes('NFR_SPACE_IDENTITY_IMMUTABLE')) {
    throw new NfrError('NFR_SPACE_IDENTITY_IMMUTABLE', 'Space code and outlet identity cannot be modified.', 409);
  }
  if (msg.includes('NFR_VENDOR_DELETE_FORBIDDEN')) {
    throw new NfrError('NFR_VENDOR_DELETE_FORBIDDEN', 'NFR vendors cannot be deleted. Deactivate instead.', 409);
  }
  if (msg.includes('NFR_VENDOR_IDENTITY_IMMUTABLE')) {
    throw new NfrError('NFR_VENDOR_IDENTITY_IMMUTABLE', 'Vendor identity and outlet cannot be modified.', 409);
  }
  if (msg.includes('NFR_LEASE_DELETE_FORBIDDEN')) {
    throw new NfrError('NFR_LEASE_DELETE_FORBIDDEN', 'NFR leases cannot be deleted. Terminate instead.', 409);
  }
  if (msg.includes('NFR_LEASE_IDENTITY_IMMUTABLE')) {
    throw new NfrError('NFR_LEASE_IDENTITY_IMMUTABLE', 'Lease identity and outlet cannot be modified.', 409);
  }
  if (msg.includes('NFR_LEASE_TERMINATED_IMMUTABLE')) {
    throw new NfrError('NFR_LEASE_TERMINATED_IMMUTABLE', 'Terminated leases cannot be modified.', 409);
  }
  if (msg.includes('NFR_LEASE_SPACE_OUTLET_MISMATCH')) {
    throw new NfrError('NFR_LEASE_SPACE_OUTLET_MISMATCH', 'The selected space belongs to a different outlet.', 400);
  }
  if (msg.includes('NFR_LEASE_VENDOR_OUTLET_MISMATCH')) {
    throw new NfrError('NFR_LEASE_VENDOR_OUTLET_MISMATCH', 'The selected vendor belongs to a different outlet.', 400);
  }
  if (msg.includes('NFR_LEASE_DOCUMENT_OUTLET_MISMATCH')) {
    throw new NfrError('NFR_LEASE_DOCUMENT_OUTLET_MISMATCH', 'The agreement document does not belong to this outlet.', 400);
  }
  if (msg.includes('NFR_LEASE_SUB_METER_OUTLET_MISMATCH')) {
    throw new NfrError('NFR_LEASE_SUB_METER_OUTLET_MISMATCH', 'The sub-meter does not belong to this outlet.', 400);
  }
  if (msg.includes('NFR_LEASE_SUB_METER_NOT_NFR')) {
    throw new NfrError('NFR_LEASE_SUB_METER_NOT_NFR', 'The linked sub-meter must have beneficiary type NFR_VENDOR.', 400);
  }
  if (msg.includes('NFR_SPACE_LEASE_OVERLAP')) {
    throw new NfrError('NFR_SPACE_LEASE_OVERLAP', 'This space already has an active lease for the specified period.', 409);
  }
  if (msg.includes('NFR_RENT_DUE_IMMUTABLE')) {
    throw new NfrError('NFR_RENT_DUE_IMMUTABLE', 'Rent dues are immutable financial records and cannot be modified or deleted.', 409);
  }
  if (msg.includes('NFR_RENT_DUE_OUTLET_MISMATCH')) {
    throw new NfrError('NFR_RENT_DUE_OUTLET_MISMATCH', 'The lease does not belong to this outlet.', 400);
  }
  if (msg.includes('NFR_RENT_PAYMENT_IMMUTABLE')) {
    throw new NfrError('NFR_RENT_PAYMENT_IMMUTABLE', 'Rent payments are immutable records and cannot be modified or deleted.', 409);
  }
  if (msg.includes('NFR_RENT_PAYMENT_OUTLET_MISMATCH')) {
    throw new NfrError('NFR_RENT_PAYMENT_OUTLET_MISMATCH', 'The rent due does not belong to this outlet.', 400);
  }
  if (msg.includes('NFR_RENT_RECEIPT_OUTLET_MISMATCH')) {
    throw new NfrError('NFR_RENT_RECEIPT_OUTLET_MISMATCH', 'The receipt document does not belong to this outlet.', 400);
  }
  if (msg.includes('NFR_RENT_ALREADY_PAID')) {
    throw new NfrError('NFR_RENT_ALREADY_PAID', 'This statutory rent due has already been fully paid.', 409);
  }
  if (msg.includes('NFR_RENT_OVERPAYMENT')) {
    throw new NfrError('NFR_RENT_OVERPAYMENT', 'Payment amount exceeds the outstanding balance for this rent due.', 409);
  }

  // Unique index collisions
  if (msg.includes('idx_nfr_spaces_outlet_code') || msg.includes('nfr_spaces.outlet_id, nfr_spaces.space_code')) {
    throw new NfrError('NFR_SPACE_CODE_EXISTS', 'A space with this code already exists for this outlet.', 409);
  }
  if (msg.includes('idx_nfr_leases_outlet_agreement') || msg.includes('nfr_leases.outlet_id, nfr_leases.agreement_number')) {
    throw new NfrError('NFR_AGREEMENT_EXISTS', 'A lease with this agreement number already exists for this outlet.', 409);
  }
  if (msg.includes('idx_nfr_rent_dues_lease_month') || msg.includes('nfr_rent_dues.lease_id, nfr_rent_dues.billing_month')) {
    throw new NfrError('NFR_RENT_DUE_EXISTS', 'A rent due has already been generated for this lease and billing month.', 409);
  }

  throw err;
}

export class NfrService {
  constructor(private db: AppDatabase) {}

  // ==========================================================================
  // SPACES
  // ==========================================================================

  async createSpace(outletId: string, userId: string, data: unknown): Promise<NfrSpace> {
    const validated = CreateNfrSpaceSchema.parse(data);
    const repo = new NfrRepository(this.db);

    const existing = await repo.getSpaceByCode(outletId, validated.spaceCode);
    if (existing) {
      throw new NfrError('NFR_SPACE_CODE_EXISTS', 'A space with this code already exists for this outlet.', 409);
    }

    try {
      const space = await repo.createSpace({
        id: crypto.randomUUID(),
        outletId,
        spaceCode: validated.spaceCode,
        name: validated.name,
        nfrType: validated.nfrType,
        locationDescription: validated.locationDescription,
        status: validated.status,
        notes: validated.notes,
        createdBy: userId,
      });

      const now = new Date().toISOString();
      const audit = new AuditRepository(this.db);
      await audit.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'NFR_SPACE_CREATE',
        entityType: 'nfr_space',
        entityId: space.id,
        newValue: { spaceCode: space.spaceCode, name: space.name, nfrType: space.nfrType },
        createdAt: now,
      });

      return space;
    } catch (err: any) {
      if (err instanceof NfrError) throw err;
      mapDatabaseError(err);
    }
  }

  async getSpace(outletId: string, spaceId: string): Promise<NfrSpace> {
    const repo = new NfrRepository(this.db);
    const space = await repo.getSpaceById(spaceId);
    if (!space || space.outletId !== outletId) {
      throw new NfrError('NFR_SPACE_NOT_FOUND', 'NFR space not found.', 404);
    }

    const today = new Date().toISOString().slice(0, 10);
    const isCurrentlyLeased = await repo.isSpaceCurrentlyLeased(space.id, today);

    return {
      ...space,
      isCurrentlyLeased,
    };
  }

  async listSpaces(outletId: string, queryParams: unknown): Promise<NfrSpace[]> {
    const validated = NfrSpaceFilterSchema.parse(queryParams || {});
    const repo = new NfrRepository(this.db);
    const spaces = await repo.listSpaces(outletId, validated);

    const today = new Date().toISOString().slice(0, 10);
    const result: NfrSpace[] = [];
    for (const s of spaces) {
      const isCurrentlyLeased = await repo.isSpaceCurrentlyLeased(s.id, today);
      result.push({
        ...s,
        isCurrentlyLeased,
      });
    }

    return result;
  }

  async updateSpace(outletId: string, spaceId: string, userId: string, data: unknown): Promise<NfrSpace> {
    const validated = UpdateNfrSpaceSchema.parse(data);
    const repo = new NfrRepository(this.db);

    const existing = await repo.getSpaceById(spaceId);
    if (!existing || existing.outletId !== outletId) {
      throw new NfrError('NFR_SPACE_NOT_FOUND', 'NFR space not found.', 404);
    }

    try {
      const updated = await repo.updateSpace(spaceId, validated);
      if (!updated) {
        throw new NfrError('NFR_SPACE_NOT_FOUND', 'NFR space not found.', 404);
      }

      const now = new Date().toISOString();
      const audit = new AuditRepository(this.db);
      await audit.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'NFR_SPACE_UPDATE',
        entityType: 'nfr_space',
        entityId: updated.id,
        oldValue: { name: existing.name, nfrType: existing.nfrType, status: existing.status },
        newValue: { updates: validated },
        createdAt: now,
      });

      const today = new Date().toISOString().slice(0, 10);
      const isCurrentlyLeased = await repo.isSpaceCurrentlyLeased(updated.id, today);

      return {
        ...updated,
        isCurrentlyLeased,
      };
    } catch (err: any) {
      if (err instanceof NfrError) throw err;
      mapDatabaseError(err);
    }
  }

  // ==========================================================================
  // VENDORS
  // ==========================================================================

  async createVendor(outletId: string, userId: string, data: unknown): Promise<NfrVendor> {
    const validated = CreateNfrVendorSchema.parse(data);
    const repo = new NfrRepository(this.db);

    try {
      const vendor = await repo.createVendor({
        id: crypto.randomUUID(),
        outletId,
        vendorName: validated.vendorName,
        ownerContactName: validated.ownerContactName,
        ownerContactPhone: validated.ownerContactPhone,
        ownerContactEmail: validated.ownerContactEmail,
        address: validated.address,
        status: validated.status,
        notes: validated.notes,
        createdBy: userId,
      });

      const now = new Date().toISOString();
      const audit = new AuditRepository(this.db);
      await audit.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'NFR_VENDOR_CREATE',
        entityType: 'nfr_vendor',
        entityId: vendor.id,
        newValue: { vendorName: vendor.vendorName, ownerContactName: vendor.ownerContactName },
        createdAt: now,
      });

      return vendor;
    } catch (err: any) {
      if (err instanceof NfrError) throw err;
      mapDatabaseError(err);
    }
  }

  async getVendor(outletId: string, vendorId: string): Promise<NfrVendor> {
    const repo = new NfrRepository(this.db);
    const vendor = await repo.getVendorById(vendorId);
    if (!vendor || vendor.outletId !== outletId) {
      throw new NfrError('NFR_VENDOR_NOT_FOUND', 'NFR vendor not found.', 404);
    }
    return vendor;
  }

  async listVendors(outletId: string, queryParams: unknown): Promise<NfrVendor[]> {
    const validated = NfrVendorFilterSchema.parse(queryParams || {});
    const repo = new NfrRepository(this.db);
    return repo.listVendors(outletId, validated);
  }

  async updateVendor(outletId: string, vendorId: string, userId: string, data: unknown): Promise<NfrVendor> {
    const validated = UpdateNfrVendorSchema.parse(data);
    const repo = new NfrRepository(this.db);

    const existing = await repo.getVendorById(vendorId);
    if (!existing || existing.outletId !== outletId) {
      throw new NfrError('NFR_VENDOR_NOT_FOUND', 'NFR vendor not found.', 404);
    }

    try {
      const updated = await repo.updateVendor(vendorId, validated);
      if (!updated) {
        throw new NfrError('NFR_VENDOR_NOT_FOUND', 'NFR vendor not found.', 404);
      }

      const now = new Date().toISOString();
      const audit = new AuditRepository(this.db);
      await audit.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'NFR_VENDOR_UPDATE',
        entityType: 'nfr_vendor',
        entityId: updated.id,
        oldValue: { vendorName: existing.vendorName, status: existing.status },
        newValue: { updates: validated },
        createdAt: now,
      });

      return updated;
    } catch (err: any) {
      if (err instanceof NfrError) throw err;
      mapDatabaseError(err);
    }
  }

  // ==========================================================================
  // LEASES
  // ==========================================================================

  async createLease(outletId: string, userId: string, data: unknown): Promise<NfrLease> {
    const validated = CreateNfrLeaseSchema.parse(data);
    const repo = new NfrRepository(this.db);

    // Validate space
    const space = await repo.getSpaceById(validated.spaceId);
    if (!space) {
      throw new NfrError('NFR_SPACE_NOT_FOUND', 'The selected space could not be found.', 404);
    }
    if (space.outletId !== outletId) {
      throw new NfrError('NFR_LEASE_SPACE_OUTLET_MISMATCH', 'The selected space does not belong to this outlet.', 400);
    }

    // Validate vendor
    const vendor = await repo.getVendorById(validated.vendorId);
    if (!vendor) {
      throw new NfrError('NFR_VENDOR_NOT_FOUND', 'The selected vendor could not be found.', 404);
    }
    if (vendor.outletId !== outletId) {
      throw new NfrError('NFR_LEASE_VENDOR_OUTLET_MISMATCH', 'The selected vendor does not belong to this outlet.', 400);
    }

    // Validate duplicate agreement number per outlet
    const duplicateAgreement = await repo.findAgreementDuplicate(outletId, validated.agreementNumber);
    if (duplicateAgreement) {
      throw new NfrError('NFR_AGREEMENT_EXISTS', 'A lease with this agreement number already exists for this outlet.', 409);
    }

    // Validate space overlap
    const overlap = await repo.findOverlappingLease(validated.spaceId, validated.leaseStartDate, validated.leaseEndDate);
    if (overlap) {
      throw new NfrError('NFR_SPACE_LEASE_OVERLAP', 'This space already has an active lease for the specified period.', 409);
    }

    // Parse money
    const monthlyRentPaise = safeParseMoney(validated.monthlyRent, 'Monthly rent');
    if (monthlyRentPaise <= 0) {
      throw new NfrError('VALIDATION_ERROR', 'Monthly rent must be greater than zero.', 400);
    }

    const securityDepositPaise = validated.securityDeposit
      ? safeParseMoney(validated.securityDeposit, 'Security deposit')
      : 0;
    if (securityDepositPaise < 0) {
      throw new NfrError('VALIDATION_ERROR', 'Security deposit cannot be negative.', 400);
    }

    // Validate document if provided
    if (validated.agreementDocumentId) {
      const doc = await repo.getDocumentById(validated.agreementDocumentId);
      if (!doc) {
        throw new NfrError('NFR_LEASE_DOCUMENT_NOT_FOUND', 'The agreement document could not be found.', 404);
      }
      if (doc.outletId !== outletId) {
        throw new NfrError('NFR_LEASE_DOCUMENT_OUTLET_MISMATCH', 'The agreement document does not belong to this outlet.', 400);
      }
    }

    // Validate sub-meter if provided
    if (validated.subMeterId) {
      const subMeter = await repo.getSubMeterById(validated.subMeterId);
      if (!subMeter) {
        throw new NfrError('NFR_LEASE_SUB_METER_NOT_FOUND', 'The specified sub-meter could not be found.', 404);
      }
      if (subMeter.outletId !== outletId) {
        throw new NfrError('NFR_LEASE_SUB_METER_OUTLET_MISMATCH', 'The sub-meter does not belong to this outlet.', 400);
      }
      if (subMeter.beneficiaryType !== 'NFR_VENDOR') {
        throw new NfrError('NFR_LEASE_SUB_METER_NOT_NFR', 'The linked sub-meter must have beneficiary type NFR_VENDOR.', 400);
      }
    }

    try {
      const lease = await repo.createLease({
        id: crypto.randomUUID(),
        outletId,
        spaceId: validated.spaceId,
        vendorId: validated.vendorId,
        agreementNumber: validated.agreementNumber,
        leaseStartDate: validated.leaseStartDate,
        leaseEndDate: validated.leaseEndDate,
        monthlyRentPaise,
        securityDepositPaise,
        monthlyDueDay: validated.monthlyDueDay,
        agreementDocumentId: validated.agreementDocumentId,
        subMeterId: validated.subMeterId,
        notes: validated.notes,
        createdBy: userId,
      });

      const now = new Date().toISOString();
      const audit = new AuditRepository(this.db);
      await audit.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'NFR_LEASE_CREATE',
        entityType: 'nfr_lease',
        entityId: lease.id,
        newValue: {
          agreementNumber: lease.agreementNumber,
          spaceId: lease.spaceId,
          vendorId: lease.vendorId,
          monthlyRentPaise: lease.monthlyRentPaise,
        },
        createdAt: now,
      });

      return formatLeaseDto(lease);
    } catch (err: any) {
      if (err instanceof NfrError) throw err;
      mapDatabaseError(err);
    }
  }

  async getLease(outletId: string, leaseId: string): Promise<NfrLease> {
    const repo = new NfrRepository(this.db);
    const lease = await repo.getLeaseById(leaseId);
    if (!lease || lease.outletId !== outletId) {
      throw new NfrError('NFR_LEASE_NOT_FOUND', 'NFR lease not found.', 404);
    }

    const space = await repo.getSpaceById(lease.spaceId);
    const vendor = await repo.getVendorById(lease.vendorId);

    const dto = formatLeaseDto(lease);
    if (space) dto.space = space;
    if (vendor) dto.vendor = vendor;
    return dto;
  }

  async listLeases(outletId: string, queryParams: unknown): Promise<NfrLease[]> {
    const validated = NfrLeaseFilterSchema.parse(queryParams || {});
    const repo = new NfrRepository(this.db);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await repo.listLeases(outletId, validated, today);
    return rows.map(r => formatLeaseDto(r, today));
  }

  async updateLease(outletId: string, leaseId: string, userId: string, data: unknown): Promise<NfrLease> {
    const validated = UpdateNfrLeaseSchema.parse(data);
    const repo = new NfrRepository(this.db);

    const existing = await repo.getLeaseById(leaseId);
    if (!existing || existing.outletId !== outletId) {
      throw new NfrError('NFR_LEASE_NOT_FOUND', 'NFR lease not found.', 404);
    }

    if (existing.status === 'TERMINATED') {
      throw new NfrError('NFR_LEASE_TERMINATED_IMMUTABLE', 'Terminated leases cannot be modified.', 409);
    }

    // Resulting values
    const targetSpaceId = validated.spaceId || existing.spaceId;
    const targetVendorId = validated.vendorId || existing.vendorId;
    const targetAgreementNumber = validated.agreementNumber || existing.agreementNumber;
    const targetStartDate = validated.leaseStartDate || existing.leaseStartDate;
    const targetEndDate = validated.leaseEndDate || existing.leaseEndDate;

    if (targetEndDate < targetStartDate) {
      throw new NfrError('VALIDATION_ERROR', 'leaseEndDate must be on or after leaseStartDate.', 400);
    }

    // Validate space if changed
    if (validated.spaceId && validated.spaceId !== existing.spaceId) {
      const space = await repo.getSpaceById(validated.spaceId);
      if (!space) {
        throw new NfrError('NFR_SPACE_NOT_FOUND', 'The selected space could not be found.', 404);
      }
      if (space.outletId !== outletId) {
        throw new NfrError('NFR_LEASE_SPACE_OUTLET_MISMATCH', 'The selected space does not belong to this outlet.', 400);
      }
    }

    // Validate vendor if changed
    if (validated.vendorId && validated.vendorId !== existing.vendorId) {
      const vendor = await repo.getVendorById(validated.vendorId);
      if (!vendor) {
        throw new NfrError('NFR_VENDOR_NOT_FOUND', 'The selected vendor could not be found.', 404);
      }
      if (vendor.outletId !== outletId) {
        throw new NfrError('NFR_LEASE_VENDOR_OUTLET_MISMATCH', 'The selected vendor does not belong to this outlet.', 400);
      }
    }

    // Validate agreement duplicate if changed
    if (validated.agreementNumber && validated.agreementNumber !== existing.agreementNumber) {
      const dup = await repo.findAgreementDuplicate(outletId, validated.agreementNumber, leaseId);
      if (dup) {
        throw new NfrError('NFR_AGREEMENT_EXISTS', 'A lease with this agreement number already exists for this outlet.', 409);
      }
    }

    // Validate space overlap if space or dates changed
    if (
      (validated.spaceId && validated.spaceId !== existing.spaceId) ||
      (validated.leaseStartDate && validated.leaseStartDate !== existing.leaseStartDate) ||
      (validated.leaseEndDate && validated.leaseEndDate !== existing.leaseEndDate)
    ) {
      const overlap = await repo.findOverlappingLease(targetSpaceId, targetStartDate, targetEndDate, leaseId);
      if (overlap) {
        throw new NfrError('NFR_SPACE_LEASE_OVERLAP', 'This space already has an active lease for the specified period.', 409);
      }
    }

    // Parse money updates
    let monthlyRentPaise: number | undefined;
    if (validated.monthlyRent !== undefined) {
      monthlyRentPaise = safeParseMoney(validated.monthlyRent, 'Monthly rent');
      if (monthlyRentPaise <= 0) {
        throw new NfrError('VALIDATION_ERROR', 'Monthly rent must be greater than zero.', 400);
      }
    }

    let securityDepositPaise: number | undefined;
    if (validated.securityDeposit !== undefined) {
      securityDepositPaise = safeParseMoney(validated.securityDeposit, 'Security deposit');
      if (securityDepositPaise < 0) {
        throw new NfrError('VALIDATION_ERROR', 'Security deposit cannot be negative.', 400);
      }
    }

    // Validate document if changed
    if (validated.agreementDocumentId !== undefined && validated.agreementDocumentId !== null) {
      const doc = await repo.getDocumentById(validated.agreementDocumentId);
      if (!doc) {
        throw new NfrError('NFR_LEASE_DOCUMENT_NOT_FOUND', 'The agreement document could not be found.', 404);
      }
      if (doc.outletId !== outletId) {
        throw new NfrError('NFR_LEASE_DOCUMENT_OUTLET_MISMATCH', 'The agreement document does not belong to this outlet.', 400);
      }
    }

    // Validate sub-meter if changed
    if (validated.subMeterId !== undefined && validated.subMeterId !== null) {
      const subMeter = await repo.getSubMeterById(validated.subMeterId);
      if (!subMeter) {
        throw new NfrError('NFR_LEASE_SUB_METER_NOT_FOUND', 'The specified sub-meter could not be found.', 404);
      }
      if (subMeter.outletId !== outletId) {
        throw new NfrError('NFR_LEASE_SUB_METER_OUTLET_MISMATCH', 'The sub-meter does not belong to this outlet.', 400);
      }
      if (subMeter.beneficiaryType !== 'NFR_VENDOR') {
        throw new NfrError('NFR_LEASE_SUB_METER_NOT_NFR', 'The linked sub-meter must have beneficiary type NFR_VENDOR.', 400);
      }
    }

    try {
      const updated = await repo.updateActiveLease(leaseId, {
        spaceId: validated.spaceId,
        vendorId: validated.vendorId,
        agreementNumber: validated.agreementNumber,
        leaseStartDate: validated.leaseStartDate,
        leaseEndDate: validated.leaseEndDate,
        monthlyRentPaise,
        securityDepositPaise,
        monthlyDueDay: validated.monthlyDueDay,
        agreementDocumentId: validated.agreementDocumentId,
        subMeterId: validated.subMeterId,
        notes: validated.notes,
      });

      if (!updated) {
        throw new NfrError('NFR_LEASE_STATE_CHANGED', 'The lease could not be updated because its state changed concurrently.', 409);
      }

      const now = new Date().toISOString();
      const audit = new AuditRepository(this.db);
      await audit.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'NFR_LEASE_UPDATE',
        entityType: 'nfr_lease',
        entityId: updated.id,
        oldValue: {
          agreementNumber: existing.agreementNumber,
          monthlyRentPaise: existing.monthlyRentPaise,
        },
        newValue: { updates: validated },
        createdAt: now,
      });

      return formatLeaseDto(updated);
    } catch (err: any) {
      if (err instanceof NfrError) throw err;
      mapDatabaseError(err);
    }
  }

  async terminateLease(outletId: string, leaseId: string, userId: string, data: unknown): Promise<NfrLease> {
    const validated = TerminateNfrLeaseSchema.parse(data || {});
    const repo = new NfrRepository(this.db);

    const existing = await repo.getLeaseById(leaseId);
    if (!existing || existing.outletId !== outletId) {
      throw new NfrError('NFR_LEASE_NOT_FOUND', 'NFR lease not found.', 404);
    }

    if (existing.status === 'TERMINATED') {
      throw new NfrError('NFR_LEASE_ALREADY_TERMINATED', 'This lease is already terminated.', 409);
    }

    const now = new Date().toISOString();

    try {
      const terminated = await repo.terminateLeaseConditional(
        leaseId,
        validated.terminationReason,
        userId,
        now
      );

      if (!terminated) {
        throw new NfrError('NFR_LEASE_ALREADY_TERMINATED', 'This lease was already terminated concurrently.', 409);
      }

      const audit = new AuditRepository(this.db);
      await audit.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'NFR_LEASE_TERMINATE',
        entityType: 'nfr_lease',
        entityId: terminated.id,
        newValue: { terminationReason: validated.terminationReason, terminatedAt: now },
        createdAt: now,
      });

      return formatLeaseDto(terminated);
    } catch (err: any) {
      if (err instanceof NfrError) throw err;
      mapDatabaseError(err);
    }
  }

  // ==========================================================================
  // RENT DUES
  // ==========================================================================

  async generateRentDue(outletId: string, leaseId: string, userId: string, data: unknown): Promise<NfrRentDue> {
    const validated = GenerateNfrRentDueSchema.parse(data);
    const repo = new NfrRepository(this.db);

    const lease = await repo.getLeaseById(leaseId);
    if (!lease || lease.outletId !== outletId) {
      throw new NfrError('NFR_LEASE_NOT_FOUND', 'NFR lease not found.', 404);
    }

    const { rentPeriodStart, rentPeriodEnd, dueDate } = deriveRentPeriodAndDueDate(
      validated.billingMonth,
      lease.monthlyDueDay
    );

    // Contractual overlap check: month must overlap lease contractual period
    if (rentPeriodStart > lease.leaseEndDate || rentPeriodEnd < lease.leaseStartDate) {
      throw new NfrError('VALIDATION_ERROR', 'The specified billing month is outside the contractual lease period.', 400);
    }

    // Terminated lease check: billing month must start on or before termination date
    if (lease.status === 'TERMINATED' && lease.terminatedAt) {
      const termDate = lease.terminatedAt.slice(0, 10);
      if (rentPeriodStart > termDate) {
        throw new NfrError('VALIDATION_ERROR', 'Cannot generate rent due for a billing month after lease termination.', 400);
      }
    }

    // Check duplicate due
    const existingDue = await repo.findRentDueByMonth(leaseId, validated.billingMonth);
    if (existingDue) {
      throw new NfrError('NFR_RENT_DUE_EXISTS', 'A rent due has already been generated for this lease and billing month.', 409);
    }

    try {
      const due = await repo.createRentDue({
        id: crypto.randomUUID(),
        outletId,
        leaseId,
        billingMonth: validated.billingMonth,
        rentPeriodStart,
        rentPeriodEnd,
        dueDate,
        monthlyRentPaiseSnapshot: lease.monthlyRentPaise,
        createdBy: userId,
      });

      const now = new Date().toISOString();
      const audit = new AuditRepository(this.db);
      await audit.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'NFR_RENT_DUE_GENERATE',
        entityType: 'nfr_rent_due',
        entityId: due.id,
        newValue: {
          leaseId: due.leaseId,
          billingMonth: due.billingMonth,
          monthlyRentPaiseSnapshot: due.monthlyRentPaiseSnapshot,
          dueDate: due.dueDate,
        },
        createdAt: now,
      });

      return formatRentDueDto(due, 0, 0);
    } catch (err: any) {
      if (err instanceof NfrError) throw err;
      mapDatabaseError(err);
    }
  }

  async getRentDue(outletId: string, dueId: string): Promise<NfrRentDue> {
    const repo = new NfrRepository(this.db);
    const due = await repo.getRentDueById(dueId);
    if (!due || due.outletId !== outletId) {
      throw new NfrError('NFR_RENT_DUE_NOT_FOUND', 'NFR rent due not found.', 404);
    }

    const lease = await repo.getLeaseById(due.leaseId);
    const { totalPaidPaise, paymentCount } = await repo.sumRentPayments(due.id);

    const dto = formatRentDueDto(due, totalPaidPaise, paymentCount);
    if (lease) dto.lease = formatLeaseDto(lease);
    return dto;
  }

  async listRentDues(outletId: string, queryParams: unknown): Promise<NfrRentDue[]> {
    const validated = NfrRentDueFilterSchema.parse(queryParams || {});
    const repo = new NfrRepository(this.db);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await repo.listRentDues(outletId, validated);

    let result = rows.map(r => formatRentDueDto(r, r.totalPaidPaise, r.paymentCount, today));

    if (validated.paymentStatus) {
      result = result.filter(d => d.paymentStatus === validated.paymentStatus);
    }
    if (validated.overdueOnly) {
      result = result.filter(d => d.isOverdue === true);
    }

    return result;
  }

  // ==========================================================================
  // RENT PAYMENTS
  // ==========================================================================

  async recordRentPayment(
    outletId: string,
    dueId: string,
    userId: string,
    data: unknown
  ): Promise<{ payment: NfrRentPayment; due: NfrRentDue }> {
    const validated = CreateNfrRentPaymentSchema.parse(data);
    const repo = new NfrRepository(this.db);

    const due = await repo.getRentDueById(dueId);
    if (!due || due.outletId !== outletId) {
      throw new NfrError('NFR_RENT_DUE_NOT_FOUND', 'NFR rent due not found.', 404);
    }

    const { totalPaidPaise: currentPaid, paymentCount: currentCount } = await repo.sumRentPayments(due.id);
    if (currentPaid >= due.monthlyRentPaiseSnapshot) {
      throw new NfrError('NFR_RENT_ALREADY_PAID', 'This statutory rent due has already been fully paid.', 409);
    }

    const amountPaise = safeParseMoney(validated.amount, 'Payment amount');
    if (amountPaise <= 0) {
      throw new NfrError('VALIDATION_ERROR', 'Payment amount must be greater than zero.', 400);
    }

    const outstanding = due.monthlyRentPaiseSnapshot - currentPaid;
    if (amountPaise > outstanding) {
      throw new NfrError(
        'NFR_RENT_OVERPAYMENT',
        `Payment amount (₹${formatPaiseToMoney(amountPaise)}) exceeds the outstanding balance (₹${formatPaiseToMoney(outstanding)}).`,
        409
      );
    }

    // Validate receipt document
    const receiptDoc = await repo.getDocumentById(validated.receiptDocumentId);
    if (!receiptDoc) {
      throw new NfrError('NFR_RENT_RECEIPT_NOT_FOUND', 'The payment receipt document could not be found.', 404);
    }
    if (receiptDoc.outletId !== outletId) {
      throw new NfrError('NFR_RENT_RECEIPT_OUTLET_MISMATCH', 'The receipt document does not belong to this outlet.', 400);
    }

    const paidAt = validated.paidAt || new Date().toISOString();

    try {
      const payment = await repo.createRentPayment({
        id: crypto.randomUUID(),
        outletId,
        rentDueId: dueId,
        amountPaise,
        receiptDocumentId: validated.receiptDocumentId,
        paymentReference: validated.paymentReference,
        paidAt,
        recordedByUserId: userId,
        notes: validated.notes,
      });

      const now = new Date().toISOString();
      const audit = new AuditRepository(this.db);
      await audit.logAction({
        id: crypto.randomUUID(),
        userId,
        action: 'NFR_RENT_PAYMENT_CREATE',
        entityType: 'nfr_rent_payment',
        entityId: payment.id,
        newValue: {
          rentDueId: dueId,
          amountPaise,
          receiptDocumentId: payment.receiptDocumentId,
          paymentReference: payment.paymentReference,
        },
        createdAt: now,
      });

      const newTotalPaid = currentPaid + amountPaise;
      const updatedDueDto = formatRentDueDto(due, newTotalPaid, currentCount + 1);

      return {
        payment: {
          ...payment,
          amountStr: formatPaiseToMoney(payment.amountPaise),
        },
        due: updatedDueDto,
      };
    } catch (err: any) {
      if (err instanceof NfrError) throw err;
      mapDatabaseError(err);
    }
  }

  async listRentPayments(outletId: string, dueId: string): Promise<NfrRentPayment[]> {
    const repo = new NfrRepository(this.db);
    const due = await repo.getRentDueById(dueId);
    if (!due || due.outletId !== outletId) {
      throw new NfrError('NFR_RENT_DUE_NOT_FOUND', 'NFR rent due not found.', 404);
    }

    const rows = await repo.listRentPayments(dueId);
    return rows.map(p => ({
      ...p,
      amountStr: formatPaiseToMoney(p.amountPaise),
    }));
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  async getSummary(outletId: string): Promise<NfrSummary> {
    const repo = new NfrRepository(this.db);
    const today = new Date().toISOString().slice(0, 10);

    const [spaces, vendors, leases, rentDues] = await Promise.all([
      repo.listSpaces(outletId),
      repo.listVendors(outletId),
      repo.listLeases(outletId, undefined, today),
      repo.listRentDues(outletId),
    ]);

    const spaceCount = spaces.length;
    const activeSpaceCount = spaces.filter(s => s.status === 'ACTIVE').length;

    const vendorCount = vendors.length;
    const activeVendorCount = vendors.filter(v => v.status === 'ACTIVE').length;

    const leaseCount = leases.length;
    const activeLeaseCount = leases.filter(l => l.status === 'ACTIVE' && l.leaseEndDate >= today).length;
    const expiredLeaseCount = leases.filter(l => l.status === 'ACTIVE' && l.leaseEndDate < today).length;
    const terminatedLeaseCount = leases.filter(l => l.status === 'TERMINATED').length;

    let pendingDueCount = 0;
    let partialDueCount = 0;
    let paidDueCount = 0;
    let overdueDueCount = 0;

    let totalRentDuePaise = 0;
    let totalCollectedPaise = 0;
    let totalOutstandingPaise = 0;
    let overdueOutstandingPaise = 0;

    let nextDueDate: string | null = null;

    try {
      for (const rawDue of rentDues) {
        const dueDto = formatRentDueDto(rawDue, rawDue.totalPaidPaise, rawDue.paymentCount, today);

        totalRentDuePaise = checkedUtilityMoneyAdd(totalRentDuePaise, dueDto.monthlyRentPaiseSnapshot);
        totalCollectedPaise = checkedUtilityMoneyAdd(totalCollectedPaise, dueDto.totalPaidPaise);
        totalOutstandingPaise = checkedUtilityMoneyAdd(totalOutstandingPaise, dueDto.outstandingPaise);

        if (dueDto.paymentStatus === 'PENDING') {
          pendingDueCount++;
        } else if (dueDto.paymentStatus === 'PARTIAL') {
          partialDueCount++;
        } else if (dueDto.paymentStatus === 'PAID') {
          paidDueCount++;
        }

        if (dueDto.isOverdue) {
          overdueDueCount++;
          overdueOutstandingPaise = checkedUtilityMoneyAdd(overdueOutstandingPaise, dueDto.outstandingPaise);
        }

        // nextDueDate: earliest dueDate among dues that are not PAID
        if (dueDto.paymentStatus !== 'PAID') {
          if (!nextDueDate || dueDto.dueDate < nextDueDate) {
            nextDueDate = dueDto.dueDate;
          }
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('OVERFLOW')) {
        throw new NfrError('NFR_SUMMARY_OVERFLOW', 'The aggregate financial amount exceeds the supported financial ceiling.', 400);
      }
      throw err;
    }

    return {
      spaceCount,
      activeSpaceCount,
      vendorCount,
      activeVendorCount,
      leaseCount,
      activeLeaseCount,
      expiredLeaseCount,
      terminatedLeaseCount,
      rentDueCount: rentDues.length,
      pendingDueCount,
      partialDueCount,
      paidDueCount,
      overdueDueCount,
      totalRentDuePaise,
      totalRentDueStr: formatPaiseToMoney(totalRentDuePaise),
      totalCollectedPaise,
      totalCollectedStr: formatPaiseToMoney(totalCollectedPaise),
      totalOutstandingPaise,
      totalOutstandingStr: formatPaiseToMoney(totalOutstandingPaise),
      overdueOutstandingPaise,
      overdueOutstandingStr: formatPaiseToMoney(overdueOutstandingPaise),
      nextDueDate,
    };
  }
}
