import { AppDatabase } from '../../db';
import { HrRepository, HrDesignationFilters, HrStaffFilters, HrRosterFilters } from '../repositories/hrRepository';
import { AuditRepository } from '../repositories/auditRepository';
import {
  CreateHrDesignationSchema,
  UpdateHrDesignationSchema,
  CreateHrStaffSchema,
  UpdateHrStaffSchema,
  CreateHrManpowerSanctionSchema,
  UpdateHrManpowerSanctionSchema,
  CreateHrRosterAssignmentSchema,
  UpdateHrRosterAssignmentSchema,
  HrDesignationFilterSchema,
  HrStaffFilterSchema,
  HrRosterFilterSchema,
} from '../../shared/validators';
import {
  HrDesignation,
  HrStaff,
  HrManpowerSanction,
  HrManpowerSummary,
  HrRosterAssignment,
} from '../../shared/types';

export class HrError extends Error {
  constructor(public code: string, message: string, public status: number = 400) {
    super(message);
    this.name = 'HrError';
  }
}

function handleDbError(err: any): never {
  if (err instanceof HrError) {
    throw err;
  }
  const msg = String(err?.message || err);

  if (msg.includes('HR_DESIGNATION_NOT_FOUND')) {
    throw new HrError('HR_DESIGNATION_NOT_FOUND', 'Designation not found', 404);
  }
  if (msg.includes('HR_DESIGNATION_CODE_EXISTS') || msg.includes('idx_hr_designations_outlet_code') || (msg.includes('UNIQUE constraint') && msg.includes('hr_designations'))) {
    throw new HrError('HR_DESIGNATION_CODE_EXISTS', 'A designation with this code already exists for this outlet', 409);
  }
  if (msg.includes('HR_DESIGNATION_NOT_ACTIVE')) {
    throw new HrError('HR_DESIGNATION_NOT_ACTIVE', 'Designation is not active', 409);
  }
  if (msg.includes('HR_DESIGNATION_DELETE_FORBIDDEN')) {
    throw new HrError('HR_DESIGNATION_DELETE_FORBIDDEN', 'Direct deletion of HR designations is forbidden', 409);
  }
  if (msg.includes('HR_DESIGNATION_IDENTITY_IMMUTABLE')) {
    throw new HrError('HR_DESIGNATION_IDENTITY_IMMUTABLE', 'Designation code and identity fields cannot be modified', 400);
  }

  if (msg.includes('HR_STAFF_NOT_FOUND')) {
    throw new HrError('HR_STAFF_NOT_FOUND', 'Staff member not found', 404);
  }
  if (msg.includes('HR_STAFF_CODE_EXISTS') || msg.includes('idx_hr_staff_outlet_employee_code') || (msg.includes('UNIQUE constraint') && msg.includes('hr_staff'))) {
    throw new HrError('HR_STAFF_CODE_EXISTS', 'Staff member with this employee code already exists for this outlet', 409);
  }
  if (msg.includes('HR_STAFF_NOT_ACTIVE')) {
    throw new HrError('HR_STAFF_NOT_ACTIVE', 'Staff member is not active', 409);
  }
  if (msg.includes('HR_STAFF_DESIGNATION_OUTLET_MISMATCH')) {
    throw new HrError('HR_STAFF_DESIGNATION_OUTLET_MISMATCH', 'Designation does not belong to this outlet', 400);
  }
  if (msg.includes('HR_STAFF_IDENTITY_IMMUTABLE')) {
    throw new HrError('HR_STAFF_IDENTITY_IMMUTABLE', 'Staff identity and employee code are immutable', 400);
  }
  if (msg.includes('HR_STAFF_DELETE_FORBIDDEN')) {
    throw new HrError('HR_STAFF_DELETE_FORBIDDEN', 'Direct deletion of staff records is forbidden', 409);
  }
  if (msg.includes('HR_AADHAAR_DOCUMENT_NOT_FOUND')) {
    throw new HrError('HR_AADHAAR_DOCUMENT_NOT_FOUND', 'Aadhaar document not found', 400);
  }
  if (msg.includes('HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH')) {
    throw new HrError('HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH', 'Aadhaar document does not belong to this outlet', 400);
  }
  if (msg.includes('HR_PHOTO_DOCUMENT_NOT_FOUND')) {
    throw new HrError('HR_PHOTO_DOCUMENT_NOT_FOUND', 'Photo document not found', 400);
  }
  if (msg.includes('HR_PHOTO_DOCUMENT_OUTLET_MISMATCH')) {
    throw new HrError('HR_PHOTO_DOCUMENT_OUTLET_MISMATCH', 'Photo document does not belong to this outlet', 400);
  }

  if (msg.includes('HR_MANPOWER_SANCTION_EXISTS') || msg.includes('idx_hr_manpower_outlet_designation') || (msg.includes('UNIQUE constraint') && msg.includes('hr_manpower_sanctions'))) {
    throw new HrError('HR_MANPOWER_SANCTION_EXISTS', 'A manpower sanction already exists for this designation. Use PUT to update it.', 409);
  }
  if (msg.includes('HR_MANPOWER_DESIGNATION_OUTLET_MISMATCH')) {
    throw new HrError('HR_MANPOWER_DESIGNATION_OUTLET_MISMATCH', 'Designation does not belong to this outlet', 400);
  }
  if (msg.includes('HR_MANPOWER_DELETE_FORBIDDEN')) {
    throw new HrError('HR_MANPOWER_DELETE_FORBIDDEN', 'Direct deletion of manpower sanctions is forbidden', 409);
  }
  if (msg.includes('HR_MANPOWER_IDENTITY_IMMUTABLE')) {
    throw new HrError('HR_MANPOWER_IDENTITY_IMMUTABLE', 'Manpower sanction identity fields cannot be modified', 400);
  }

  if (msg.includes('HR_ROSTER_EXISTS') || msg.includes('idx_hr_roster_staff_date') || (msg.includes('UNIQUE constraint') && msg.includes('hr_roster_assignments'))) {
    throw new HrError('HR_ROSTER_EXISTS', 'Roster assignment already exists for this staff member on this date', 409);
  }
  if (msg.includes('HR_ROSTER_STAFF_OUTLET_MISMATCH')) {
    throw new HrError('HR_ROSTER_STAFF_OUTLET_MISMATCH', 'Staff member does not belong to this outlet', 400);
  }
  if (msg.includes('HR_ROSTER_SHIFT_OUTLET_MISMATCH')) {
    throw new HrError('HR_ROSTER_SHIFT_OUTLET_MISMATCH', 'Shift template does not belong to this outlet', 400);
  }
  if (msg.includes('HR_SHIFT_TEMPLATE_NOT_FOUND')) {
    throw new HrError('HR_SHIFT_TEMPLATE_NOT_FOUND', 'Shift template not found', 404);
  }
  if (msg.includes('HR_SHIFT_TEMPLATE_NOT_ACTIVE')) {
    throw new HrError('HR_SHIFT_TEMPLATE_NOT_ACTIVE', 'Shift template is not active', 409);
  }
  if (msg.includes('HR_ROSTER_DELETE_FORBIDDEN')) {
    throw new HrError('HR_ROSTER_DELETE_FORBIDDEN', 'Direct deletion of roster assignments is forbidden', 409);
  }
  if (msg.includes('HR_ROSTER_IDENTITY_IMMUTABLE')) {
    throw new HrError('HR_ROSTER_IDENTITY_IMMUTABLE', 'Roster assignment identity fields cannot be modified', 400);
  }

  throw err;
}

export class HrService {
  private hrRepo: HrRepository;
  private auditRepo: AuditRepository;

  constructor(private db: AppDatabase) {
    this.hrRepo = new HrRepository(db);
    this.auditRepo = new AuditRepository(db);
  }

  // ==========================================================================
  // DESIGNATIONS
  // ==========================================================================

  async listDesignations(outletId: string, rawQuery?: any): Promise<HrDesignation[]> {
    const filters = rawQuery ? HrDesignationFilterSchema.parse(rawQuery) : undefined;
    return this.hrRepo.listDesignations(outletId, filters);
  }

  async getDesignationById(id: string, outletId: string): Promise<HrDesignation> {
    const designation = await this.hrRepo.getDesignationById(id);
    if (!designation || designation.outletId !== outletId) {
      throw new HrError('HR_DESIGNATION_NOT_FOUND', 'The designation could not be found', 404);
    }
    return designation;
  }

  async createDesignation(outletId: string, actorUserId: string, payload: any): Promise<HrDesignation> {
    const validated = CreateHrDesignationSchema.parse(payload);

    const existing = await this.hrRepo.findDesignationByCode(outletId, validated.code);
    if (existing) {
      throw new HrError('HR_DESIGNATION_CODE_EXISTS', 'A designation with this code already exists for this outlet', 409);
    }

    const id = `desig-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      const created = await this.hrRepo.createDesignation({
        id,
        outletId,
        code: validated.code,
        name: validated.name,
        status: validated.status,
        notes: validated.notes,
        createdBy: actorUserId,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_DESIGNATION_CREATE',
        entityType: 'HR_DESIGNATION',
        entityId: id,
        newValue: {
          code: created.code,
          name: created.name,
          status: created.status,
        },
        createdAt: now,
      });

      return created;
    } catch (err) {
      return handleDbError(err);
    }
  }

  async updateDesignation(
    id: string,
    outletId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrDesignation> {
    const validated = UpdateHrDesignationSchema.parse(payload);
    const existing = await this.getDesignationById(id, outletId);

    const now = new Date().toISOString();

    try {
      const updated = await this.hrRepo.updateDesignation(id, outletId, {
        name: validated.name,
        status: validated.status,
        notes: validated.notes,
        updatedAt: now,
      });

      if (!updated) {
        throw new HrError('HR_DESIGNATION_NOT_FOUND', 'The designation could not be found', 404);
      }

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_DESIGNATION_UPDATE',
        entityType: 'HR_DESIGNATION',
        entityId: id,
        oldValue: {
          status: existing.status,
          name: existing.name,
        },
        newValue: {
          status: updated.status,
          name: updated.name,
        },
        createdAt: now,
      });

      return updated;
    } catch (err) {
      return handleDbError(err);
    }
  }

  // ==========================================================================
  // STAFF
  // ==========================================================================

  async listStaff(outletId: string, rawQuery?: any): Promise<HrStaff[]> {
    const filters = rawQuery ? HrStaffFilterSchema.parse(rawQuery) : undefined;
    return this.hrRepo.listStaff(outletId, filters);
  }

  async getStaffById(id: string, outletId: string): Promise<HrStaff> {
    const staff = await this.hrRepo.getStaffById(id);
    if (!staff || staff.outletId !== outletId) {
      throw new HrError('HR_STAFF_NOT_FOUND', 'The staff profile could not be found', 404);
    }
    return staff;
  }

  async createStaff(outletId: string, actorUserId: string, payload: any): Promise<HrStaff> {
    const validated = CreateHrStaffSchema.parse(payload);

    const duplicateCode = await this.hrRepo.findStaffByEmployeeCode(outletId, validated.employeeCode);
    if (duplicateCode) {
      throw new HrError('HR_STAFF_CODE_EXISTS', 'Staff member with this employee code already exists for this outlet', 409);
    }

    const designation = await this.hrRepo.getDesignationById(validated.designationId);
    if (!designation) {
      throw new HrError('HR_DESIGNATION_NOT_FOUND', 'Designation could not be found', 404);
    }
    if (designation.outletId !== outletId) {
      throw new HrError('HR_STAFF_DESIGNATION_OUTLET_MISMATCH', 'Designation belongs to another outlet', 400);
    }
    if (designation.status !== 'ACTIVE') {
      throw new HrError('HR_DESIGNATION_NOT_ACTIVE', 'Designation is not active', 409);
    }

    if (validated.aadhaarDocumentId) {
      const doc = await this.hrRepo.getDocumentById(validated.aadhaarDocumentId);
      if (!doc) {
        throw new HrError('HR_AADHAAR_DOCUMENT_NOT_FOUND', 'Aadhaar document not found', 400);
      }
      if (doc.outletId !== outletId) {
        throw new HrError('HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH', 'Aadhaar document does not belong to this outlet', 400);
      }
    }

    if (validated.photoDocumentId) {
      const photoDoc = await this.hrRepo.getDocumentById(validated.photoDocumentId);
      if (!photoDoc) {
        throw new HrError('HR_PHOTO_DOCUMENT_NOT_FOUND', 'Photo document not found', 400);
      }
      if (photoDoc.outletId !== outletId) {
        throw new HrError('HR_PHOTO_DOCUMENT_OUTLET_MISMATCH', 'Photo document does not belong to this outlet', 400);
      }
    }

    const id = `staff-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      const created = await this.hrRepo.createStaff({
        id,
        outletId,
        employeeCode: validated.employeeCode,
        fullName: validated.fullName,
        designationId: validated.designationId,
        aadhaarLast4: validated.aadhaarLast4,
        aadhaarDocumentId: validated.aadhaarDocumentId,
        photoDocumentId: validated.photoDocumentId,
        emergencyContactName: validated.emergencyContactName,
        emergencyContactPhone: validated.emergencyContactPhone,
        joiningDate: validated.joiningDate,
        employmentStatus: validated.employmentStatus,
        exitDate: validated.exitDate,
        notes: validated.notes,
        createdBy: actorUserId,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_STAFF_CREATE',
        entityType: 'HR_STAFF',
        entityId: id,
        newValue: {
          employeeCode: created.employeeCode,
          fullName: created.fullName,
          designationId: created.designationId,
          aadhaarLast4: created.aadhaarLast4,
          maskedAadhaar: created.maskedAadhaar,
          employmentStatus: created.employmentStatus,
          joiningDate: created.joiningDate,
        },
        createdAt: now,
      });

      return created;
    } catch (err) {
      return handleDbError(err);
    }
  }

  async updateStaff(
    id: string,
    outletId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrStaff> {
    const validated = UpdateHrStaffSchema.parse(payload);
    const existing = await this.getStaffById(id, outletId);

    if (validated.designationId && validated.designationId !== existing.designationId) {
      const designation = await this.hrRepo.getDesignationById(validated.designationId);
      if (!designation) {
        throw new HrError('HR_DESIGNATION_NOT_FOUND', 'Designation could not be found', 404);
      }
      if (designation.outletId !== outletId) {
        throw new HrError('HR_STAFF_DESIGNATION_OUTLET_MISMATCH', 'Designation belongs to another outlet', 400);
      }
      if (designation.status !== 'ACTIVE') {
        throw new HrError('HR_DESIGNATION_NOT_ACTIVE', 'New designation is not active', 409);
      }
    }

    if (validated.aadhaarDocumentId) {
      const doc = await this.hrRepo.getDocumentById(validated.aadhaarDocumentId);
      if (!doc) {
        throw new HrError('HR_AADHAAR_DOCUMENT_NOT_FOUND', 'Aadhaar document not found', 400);
      }
      if (doc.outletId !== outletId) {
        throw new HrError('HR_AADHAAR_DOCUMENT_OUTLET_MISMATCH', 'Aadhaar document does not belong to this outlet', 400);
      }
    }

    if (validated.photoDocumentId) {
      const photoDoc = await this.hrRepo.getDocumentById(validated.photoDocumentId);
      if (!photoDoc) {
        throw new HrError('HR_PHOTO_DOCUMENT_NOT_FOUND', 'Photo document not found', 400);
      }
      if (photoDoc.outletId !== outletId) {
        throw new HrError('HR_PHOTO_DOCUMENT_OUTLET_MISMATCH', 'Photo document does not belong to this outlet', 400);
      }
    }

    const targetStatus = validated.employmentStatus ?? existing.employmentStatus;
    const targetJoiningDate = validated.joiningDate ?? existing.joiningDate;

    let targetExitDate: string | null = existing.exitDate;
    if (validated.exitDate !== undefined) {
      targetExitDate = validated.exitDate;
    } else if (validated.employmentStatus && validated.employmentStatus !== 'EXITED') {
      targetExitDate = null;
    }

    if (targetStatus === 'EXITED') {
      if (!targetExitDate) {
        throw new HrError('VALIDATION_ERROR', 'exitDate is required when employmentStatus is EXITED', 400);
      }
      if (targetExitDate < targetJoiningDate) {
        throw new HrError('VALIDATION_ERROR', 'exitDate must be on or after joiningDate', 400);
      }
    } else {
      if (validated.exitDate) {
        throw new HrError('VALIDATION_ERROR', 'exitDate must be empty when employmentStatus is not EXITED', 400);
      }
      targetExitDate = null;
    }

    const now = new Date().toISOString();

    try {
      const updated = await this.hrRepo.updateStaff(id, outletId, {
        fullName: validated.fullName,
        designationId: validated.designationId,
        aadhaarLast4: validated.aadhaarLast4,
        aadhaarDocumentId: validated.aadhaarDocumentId,
        photoDocumentId: validated.photoDocumentId,
        emergencyContactName: validated.emergencyContactName,
        emergencyContactPhone: validated.emergencyContactPhone,
        joiningDate: validated.joiningDate,
        employmentStatus: validated.employmentStatus,
        exitDate: targetExitDate,
        notes: validated.notes,
        updatedAt: now,
      });

      if (!updated) {
        throw new HrError('HR_STAFF_NOT_FOUND', 'The staff profile could not be found', 404);
      }

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_STAFF_UPDATE',
        entityType: 'HR_STAFF',
        entityId: id,
        oldValue: {
          previousStatus: existing.employmentStatus,
          designationId: existing.designationId,
          exitDate: existing.exitDate,
        },
        newValue: {
          employeeCode: updated.employeeCode,
          fullName: updated.fullName,
          newStatus: updated.employmentStatus,
          designationId: updated.designationId,
          maskedAadhaar: updated.maskedAadhaar,
          exitDate: updated.exitDate,
        },
        createdAt: now,
      });

      return updated;
    } catch (err) {
      return handleDbError(err);
    }
  }

  // ==========================================================================
  // MANPOWER SANCTIONS & SUMMARY
  // ==========================================================================

  async listManpowerSanctions(outletId: string): Promise<HrManpowerSanction[]> {
    return this.hrRepo.listManpowerSanctions(outletId);
  }

  async getManpowerSanctionById(id: string, outletId: string): Promise<HrManpowerSanction> {
    const sanction = await this.hrRepo.getManpowerSanctionById(id);
    if (!sanction || sanction.outletId !== outletId) {
      throw new HrError('HR_MANPOWER_SANCTION_NOT_FOUND', 'The manpower sanction could not be found', 404);
    }
    return sanction;
  }

  async createManpowerSanction(
    outletId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrManpowerSanction> {
    const validated = CreateHrManpowerSanctionSchema.parse(payload);

    const designation = await this.hrRepo.getDesignationById(validated.designationId);
    if (!designation) {
      throw new HrError('HR_DESIGNATION_NOT_FOUND', 'Designation could not be found', 404);
    }
    if (designation.outletId !== outletId) {
      throw new HrError('HR_MANPOWER_DESIGNATION_OUTLET_MISMATCH', 'Designation belongs to another outlet', 400);
    }

    const existing = await this.hrRepo.findSanctionByDesignation(outletId, validated.designationId);
    if (existing) {
      throw new HrError('HR_MANPOWER_SANCTION_EXISTS', 'A manpower sanction already exists for this designation. Use PUT to update it.', 409);
    }

    const id = `sanc-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      const created = await this.hrRepo.createManpowerSanction({
        id,
        outletId,
        designationId: validated.designationId,
        sanctionedCount: validated.sanctionedCount,
        effectiveFrom: validated.effectiveFrom,
        notes: validated.notes,
        createdBy: actorUserId,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_MANPOWER_SANCTION_CREATE',
        entityType: 'HR_MANPOWER_SANCTION',
        entityId: id,
        newValue: {
          designationId: created.designationId,
          sanctionedCount: created.sanctionedCount,
          effectiveFrom: created.effectiveFrom,
        },
        createdAt: now,
      });

      return created;
    } catch (err) {
      return handleDbError(err);
    }
  }

  async updateManpowerSanction(
    id: string,
    outletId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrManpowerSanction> {
    const validated = UpdateHrManpowerSanctionSchema.parse(payload);
    const existing = await this.getManpowerSanctionById(id, outletId);

    const now = new Date().toISOString();

    try {
      const updated = await this.hrRepo.updateManpowerSanction(id, outletId, {
        sanctionedCount: validated.sanctionedCount,
        effectiveFrom: validated.effectiveFrom,
        notes: validated.notes,
        updatedAt: now,
      });

      if (!updated) {
        throw new HrError('HR_MANPOWER_SANCTION_NOT_FOUND', 'The manpower sanction could not be found', 404);
      }

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_MANPOWER_SANCTION_UPDATE',
        entityType: 'HR_MANPOWER_SANCTION',
        entityId: id,
        oldValue: {
          designationId: existing.designationId,
          previousCount: existing.sanctionedCount,
        },
        newValue: {
          designationId: updated.designationId,
          newCount: updated.sanctionedCount,
          effectiveFrom: updated.effectiveFrom,
        },
        createdAt: now,
      });

      return updated;
    } catch (err) {
      return handleDbError(err);
    }
  }

  async getManpowerSummary(outletId: string): Promise<HrManpowerSummary> {
    const { designations, sanctions, activeStaffCounts } =
      await this.hrRepo.getManpowerSummaryInputs(outletId);

    const sanctionMap = new Map<string, number>();
    for (const s of sanctions) {
      sanctionMap.set(s.designationId, s.sanctionedCount);
    }

    const actualCountMap = new Map<string, number>();
    for (const ac of activeStaffCounts) {
      actualCountMap.set(ac.designationId, ac.count);
    }

    let totalSanctionedCount = 0;
    let totalActualCount = 0;
    let totalShortageCount = 0;
    let totalExcessCount = 0;

    const byDesignation = designations.map((d) => {
      const sanctionedCount = sanctionMap.get(d.id) ?? 0;
      const actualCount = actualCountMap.get(d.id) ?? 0;
      const varianceCount = actualCount - sanctionedCount;
      const shortageCount = Math.max(sanctionedCount - actualCount, 0);
      const excessCount = Math.max(actualCount - sanctionedCount, 0);

      totalSanctionedCount += sanctionedCount;
      totalActualCount += actualCount;
      totalShortageCount += shortageCount;
      totalExcessCount += excessCount;

      return {
        designationId: d.id,
        designationCode: d.code,
        designationName: d.name,
        sanctionedCount,
        actualCount,
        varianceCount,
        shortageCount,
        excessCount,
      };
    });

    return {
      totalSanctionedCount,
      totalActualCount,
      totalShortageCount,
      totalExcessCount,
      byDesignation,
    };
  }

  // ==========================================================================
  // SHIFT ROSTER
  // ==========================================================================

  async listRoster(outletId: string, rawQuery?: any): Promise<HrRosterAssignment[]> {
    const filters = rawQuery ? HrRosterFilterSchema.parse(rawQuery) : undefined;
    return this.hrRepo.listRoster(outletId, filters);
  }

  async getRosterById(id: string, outletId: string): Promise<HrRosterAssignment> {
    const roster = await this.hrRepo.getRosterById(id);
    if (!roster || roster.outletId !== outletId) {
      throw new HrError('HR_ROSTER_NOT_FOUND', 'The roster assignment could not be found', 404);
    }
    return roster;
  }

  async createRoster(
    outletId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrRosterAssignment> {
    const validated = CreateHrRosterAssignmentSchema.parse(payload);

    const staff = await this.hrRepo.getStaffById(validated.staffId);
    if (!staff) {
      throw new HrError('HR_STAFF_NOT_FOUND', 'Staff member could not be found', 404);
    }
    if (staff.outletId !== outletId) {
      throw new HrError('HR_ROSTER_STAFF_OUTLET_MISMATCH', 'Staff member does not belong to this outlet', 400);
    }
    if (staff.employmentStatus !== 'ACTIVE') {
      throw new HrError('HR_STAFF_NOT_ACTIVE', 'Staff member is not active', 409);
    }

    const template = await this.hrRepo.getShiftTemplateById(validated.shiftTemplateId);
    if (!template) {
      throw new HrError('HR_SHIFT_TEMPLATE_NOT_FOUND', 'Shift template could not be found', 404);
    }
    if (template.outletId !== outletId) {
      throw new HrError('HR_ROSTER_SHIFT_OUTLET_MISMATCH', 'Shift template does not belong to this outlet', 400);
    }
    if (template.status !== 'ACTIVE') {
      throw new HrError('HR_SHIFT_TEMPLATE_NOT_ACTIVE', 'Shift template is not active', 409);
    }

    const existing = await this.hrRepo.findRosterForStaffDate(validated.staffId, validated.rosterDate);
    if (existing) {
      throw new HrError('HR_ROSTER_EXISTS', 'Roster assignment already exists for this staff member on this date', 409);
    }

    const id = `roster-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      const created = await this.hrRepo.createRoster({
        id,
        outletId,
        staffId: validated.staffId,
        rosterDate: validated.rosterDate,
        shiftTemplateId: validated.shiftTemplateId,
        status: 'SCHEDULED',
        notes: validated.notes,
        createdBy: actorUserId,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_ROSTER_CREATE',
        entityType: 'HR_ROSTER_ASSIGNMENT',
        entityId: id,
        newValue: {
          staffId: created.staffId,
          rosterDate: created.rosterDate,
          shiftTemplateId: created.shiftTemplateId,
          status: created.status,
        },
        createdAt: now,
      });

      return created;
    } catch (err) {
      return handleDbError(err);
    }
  }

  async updateRoster(
    id: string,
    outletId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrRosterAssignment> {
    const validated = UpdateHrRosterAssignmentSchema.parse(payload);
    const existing = await this.getRosterById(id, outletId);

    if (validated.staffId && validated.staffId !== existing.staffId) {
      const staff = await this.hrRepo.getStaffById(validated.staffId);
      if (!staff) {
        throw new HrError('HR_STAFF_NOT_FOUND', 'Staff member could not be found', 404);
      }
      if (staff.outletId !== outletId) {
        throw new HrError('HR_ROSTER_STAFF_OUTLET_MISMATCH', 'Staff member does not belong to this outlet', 400);
      }
      if (staff.employmentStatus !== 'ACTIVE') {
        throw new HrError('HR_STAFF_NOT_ACTIVE', 'Staff member is not active', 409);
      }
    }

    if (validated.shiftTemplateId && validated.shiftTemplateId !== existing.shiftTemplateId) {
      const template = await this.hrRepo.getShiftTemplateById(validated.shiftTemplateId);
      if (!template) {
        throw new HrError('HR_SHIFT_TEMPLATE_NOT_FOUND', 'Shift template could not be found', 404);
      }
      if (template.outletId !== outletId) {
        throw new HrError('HR_ROSTER_SHIFT_OUTLET_MISMATCH', 'Shift template does not belong to this outlet', 400);
      }
      if (template.status !== 'ACTIVE') {
        throw new HrError('HR_SHIFT_TEMPLATE_NOT_ACTIVE', 'Shift template is not active', 409);
      }
    }

    const targetStaffId = validated.staffId ?? existing.staffId;
    const targetRosterDate = validated.rosterDate ?? existing.rosterDate;

    if (targetStaffId !== existing.staffId || targetRosterDate !== existing.rosterDate) {
      const conflict = await this.hrRepo.findRosterForStaffDate(targetStaffId, targetRosterDate);
      if (conflict && conflict.id !== id) {
        throw new HrError('HR_ROSTER_EXISTS', 'Roster assignment already exists for this staff member on this date', 409);
      }
    }

    const now = new Date().toISOString();

    try {
      const updated = await this.hrRepo.updateRoster(id, outletId, {
        staffId: validated.staffId,
        rosterDate: validated.rosterDate,
        shiftTemplateId: validated.shiftTemplateId,
        status: validated.status,
        notes: validated.notes,
        updatedAt: now,
      });

      if (!updated) {
        throw new HrError('HR_ROSTER_NOT_FOUND', 'The roster assignment could not be found', 404);
      }

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_ROSTER_UPDATE',
        entityType: 'HR_ROSTER_ASSIGNMENT',
        entityId: id,
        oldValue: {
          previousStatus: existing.status,
          staffId: existing.staffId,
          rosterDate: existing.rosterDate,
          shiftTemplateId: existing.shiftTemplateId,
        },
        newValue: {
          newStatus: updated.status,
          staffId: updated.staffId,
          rosterDate: updated.rosterDate,
          shiftTemplateId: updated.shiftTemplateId,
        },
        createdAt: now,
      });

      return updated;
    } catch (err) {
      return handleDbError(err);
    }
  }
}

