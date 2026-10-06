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
  GeofencePolicySchema,
  AttendanceCheckInSchema,
  AttendanceCheckOutSchema,
  AttendanceListQuerySchema,
  NozzleAssignmentCreateSchema,
  NozzleAssignmentListQuerySchema,
} from '../../shared/validators';
import {
  HrDesignation,
  HrStaff,
  HrManpowerSanction,
  HrManpowerSummary,
  HrRosterAssignment,
  HrGeofencePolicy,
  HrAttendanceRecord,
  HrNozzleAssignment,
} from '../../shared/types';

export function calculateHaversineDistanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function evaluateGeofence(
  hrRepo: HrRepository,
  outletId: string,
  latitude: number,
  longitude: number,
  accuracyMetres: number
): Promise<{ distanceMetres: number; insideGeofence: number }> {
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new HrError('VALIDATION_ERROR', 'Invalid latitude or longitude coordinates', 400);
  }

  const outletLoc = await hrRepo.getRetailOutletLocation(outletId);
  if (!outletLoc || outletLoc.latitude === null || outletLoc.longitude === null) {
    throw new HrError('HR_OUTLET_LOCATION_NOT_CONFIGURED', 'Outlet location coordinates not configured', 400);
  }

  const policy = await hrRepo.getGeofencePolicy(outletId);
  if (!policy || policy.status !== 'ACTIVE') {
    throw new HrError('HR_GEOFENCE_POLICY_NOT_FOUND', 'Active geofence policy not found for outlet', 404);
  }

  if (accuracyMetres > policy.maxAccuracyMetres) {
    throw new HrError('HR_GPS_ACCURACY_TOO_LOW', 'GPS accuracy is too low', 400);
  }

  const distanceMetres = calculateHaversineDistanceMetres(
    outletLoc.latitude,
    outletLoc.longitude,
    latitude,
    longitude
  );

  const insideGeofence = distanceMetres <= policy.radiusMetres ? 1 : 0;

  if (policy.attendanceGeofenceRequired === 1 && !insideGeofence) {
    throw new HrError('HR_OUTSIDE_GEOFENCE', 'Device is outside the allowed geofence radius', 400);
  }

  return { distanceMetres, insideGeofence };
}

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
  if (msg.includes('HR_GEOFENCE_POLICY_NOT_FOUND')) {
    throw new HrError('HR_GEOFENCE_POLICY_NOT_FOUND', 'Geofence policy not found', 404);
  }
  if (msg.includes('HR_OUTLET_LOCATION_NOT_CONFIGURED')) {
    throw new HrError('HR_OUTLET_LOCATION_NOT_CONFIGURED', 'Outlet location coordinates not configured', 400);
  }
  if (msg.includes('HR_GPS_ACCURACY_TOO_LOW')) {
    throw new HrError('HR_GPS_ACCURACY_TOO_LOW', 'GPS accuracy is too low', 400);
  }
  if (msg.includes('HR_OUTSIDE_GEOFENCE')) {
    throw new HrError('HR_OUTSIDE_GEOFENCE', 'Device is outside the allowed geofence radius', 400);
  }
  if (msg.includes('HR_ROSTER_NOT_FOUND')) {
    throw new HrError('HR_ROSTER_NOT_FOUND', 'Roster assignment not found', 404);
  }
  if (msg.includes('HR_ROSTER_NOT_SCHEDULED')) {
    throw new HrError('HR_ROSTER_NOT_SCHEDULED', 'Roster assignment is not scheduled', 400);
  }
  if (msg.includes('HR_ATTENDANCE_ALREADY_EXISTS') || msg.includes('idx_hr_attendance_active_roster') || (msg.includes('UNIQUE constraint') && msg.includes('hr_attendance_records'))) {
    throw new HrError('HR_ATTENDANCE_ALREADY_EXISTS', 'Attendance already exists for this roster assignment', 409);
  }
  if (msg.includes('HR_ATTENDANCE_NOT_FOUND')) {
    throw new HrError('HR_ATTENDANCE_NOT_FOUND', 'Attendance record not found', 404);
  }
  if (msg.includes('HR_ATTENDANCE_NOT_CHECKED_IN')) {
    throw new HrError('HR_ATTENDANCE_NOT_CHECKED_IN', 'Attendance is not checked in', 400);
  }
  if (msg.includes('HR_ATTENDANCE_ALREADY_CHECKED_OUT')) {
    throw new HrError('HR_ATTENDANCE_ALREADY_CHECKED_OUT', 'Attendance already checked out', 409);
  }
  if (msg.includes('HR_NOZZLE_ASSIGNMENT_NOT_FOUND')) {
    throw new HrError('HR_NOZZLE_ASSIGNMENT_NOT_FOUND', 'Nozzle assignment not found', 404);
  }
  if (msg.includes('HR_NOZZLE_ALREADY_ASSIGNED') || msg.includes('idx_hr_nozzle_active_assignment') || (msg.includes('UNIQUE constraint') && msg.includes('hr_nozzle_assignments'))) {
    throw new HrError('HR_NOZZLE_ALREADY_ASSIGNED', 'Nozzle is already assigned for this shift and date', 409);
  }
  if (msg.includes('HR_NOZZLE_NOT_ACTIVE')) {
    throw new HrError('HR_NOZZLE_NOT_ACTIVE', 'Nozzle is not active', 409);
  }
  if (msg.includes('HR_NOZZLE_OUTLET_MISMATCH')) {
    throw new HrError('HR_NOZZLE_OUTLET_MISMATCH', 'Nozzle belongs to another outlet', 400);
  }
  if (msg.includes('HR_NOZZLE_ASSIGNMENT_ALREADY_CANCELLED')) {
    throw new HrError('HR_NOZZLE_ASSIGNMENT_ALREADY_CANCELLED', 'Nozzle assignment is already cancelled', 409);
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

  // ==========================================================================
  // PHASE 5B: GEOFENCE, ATTENDANCE & NOZZLE ASSIGNMENTS
  // ==========================================================================

  async getGeofencePolicy(outletId: string): Promise<HrGeofencePolicy> {
    const policy = await this.hrRepo.getGeofencePolicy(outletId);
    if (!policy) {
      throw new HrError('HR_GEOFENCE_POLICY_NOT_FOUND', 'Geofence policy not found for outlet', 404);
    }
    return policy;
  }

  async upsertGeofencePolicy(
    outletId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrGeofencePolicy> {
    const validated = GeofencePolicySchema.parse(payload);
    const id = `geo-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      const updated = await this.hrRepo.upsertGeofencePolicy({
        id,
        outletId,
        radiusMetres: validated.radiusMetres,
        maxAccuracyMetres: validated.maxAccuracyMetres,
        attendanceGeofenceRequired: validated.attendanceGeofenceRequired ? 1 : 0,
        status: validated.status,
        createdBy: actorUserId,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_GEOFENCE_POLICY_UPDATED',
        entityType: 'HR_OUTLET_GEOFENCE_POLICY',
        entityId: updated.id,
        newValue: {
          radiusMetres: updated.radiusMetres,
          maxAccuracyMetres: updated.maxAccuracyMetres,
          attendanceGeofenceRequired: updated.attendanceGeofenceRequired,
          status: updated.status,
        },
        createdAt: now,
      });

      return updated;
    } catch (err) {
      return handleDbError(err);
    }
  }

  async checkInAttendance(
    outletId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrAttendanceRecord> {
    const validated = AttendanceCheckInSchema.parse(payload);

    const roster = await this.hrRepo.getRosterById(validated.rosterAssignmentId);
    if (!roster) {
      throw new HrError('HR_ROSTER_NOT_FOUND', 'Roster assignment not found', 404);
    }
    if (roster.outletId !== outletId) {
      throw new HrError('HR_ROSTER_OUTLET_MISMATCH', 'Roster assignment belongs to another outlet', 400);
    }
    if (roster.status !== 'SCHEDULED') {
      throw new HrError('HR_ROSTER_NOT_SCHEDULED', 'Roster assignment is not scheduled', 400);
    }

    const staff = await this.hrRepo.getStaffById(roster.staffId);
    if (!staff || staff.outletId !== outletId) {
      throw new HrError('HR_STAFF_NOT_FOUND', 'Staff member not found', 404);
    }
    if (staff.employmentStatus !== 'ACTIVE') {
      throw new HrError('HR_STAFF_NOT_ACTIVE', 'Staff member is not active', 409);
    }

    const existingAttendance = await this.hrRepo.getActiveAttendanceByRosterAssignment(roster.id);
    if (existingAttendance) {
      throw new HrError('HR_ATTENDANCE_ALREADY_EXISTS', 'Attendance already exists for this roster assignment', 409);
    }

    const { distanceMetres, insideGeofence } = await evaluateGeofence(
      this.hrRepo,
      outletId,
      validated.latitude,
      validated.longitude,
      validated.accuracyMetres
    );

    const id = `att-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      const record = await this.hrRepo.createAttendanceRecord({
        id,
        outletId,
        staffId: roster.staffId,
        rosterAssignmentId: roster.id,
        attendanceDate: roster.rosterDate,
        shiftTemplateId: roster.shiftTemplateId,
        checkInAt: now,
        checkInLatitude: validated.latitude,
        checkInLongitude: validated.longitude,
        checkInAccuracyMetres: validated.accuracyMetres,
        checkInDistanceMetres: distanceMetres,
        checkInInsideGeofence: insideGeofence,
        status: 'CHECKED_IN',
        notes: validated.notes,
        createdBy: actorUserId,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_ATTENDANCE_CHECKED_IN',
        entityType: 'HR_ATTENDANCE_RECORD',
        entityId: id,
        newValue: {
          rosterAssignmentId: roster.id,
          staffId: roster.staffId,
          attendanceDate: roster.rosterDate,
          checkInAt: now,
          distanceMetres,
          insideGeofence,
        },
        createdAt: now,
      });

      return record;
    } catch (err) {
      return handleDbError(err);
    }
  }

  async checkOutAttendance(
    outletId: string,
    attendanceId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrAttendanceRecord> {
    const validated = AttendanceCheckOutSchema.parse(payload);

    const attendance = await this.hrRepo.getAttendanceById(attendanceId);
    if (!attendance || attendance.outletId !== outletId) {
      throw new HrError('HR_ATTENDANCE_NOT_FOUND', 'Attendance record not found', 404);
    }
    if (attendance.status === 'CHECKED_OUT') {
      throw new HrError('HR_ATTENDANCE_ALREADY_CHECKED_OUT', 'Attendance already checked out', 409);
    }
    if (attendance.status !== 'CHECKED_IN') {
      throw new HrError('HR_ATTENDANCE_NOT_CHECKED_IN', 'Attendance is not checked in', 400);
    }

    const { distanceMetres, insideGeofence } = await evaluateGeofence(
      this.hrRepo,
      outletId,
      validated.latitude,
      validated.longitude,
      validated.accuracyMetres
    );

    let now = new Date().toISOString();
    const checkInTime = new Date(attendance.checkInAt).getTime();
    const nowTime = new Date(now).getTime();
    if (nowTime <= checkInTime) {
      now = new Date(checkInTime + 1000).toISOString();
    }

    try {
      const updated = await this.hrRepo.updateAttendanceRecord(attendanceId, {
        checkOutAt: now,
        checkOutLatitude: validated.latitude,
        checkOutLongitude: validated.longitude,
        checkOutAccuracyMetres: validated.accuracyMetres,
        checkOutDistanceMetres: distanceMetres,
        checkOutInsideGeofence: insideGeofence,
        status: 'CHECKED_OUT',
        notes: validated.notes ?? attendance.notes,
        updatedAt: now,
      });

      if (!updated) {
        throw new HrError('HR_ATTENDANCE_NOT_FOUND', 'Attendance record not found', 404);
      }

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_ATTENDANCE_CHECKED_OUT',
        entityType: 'HR_ATTENDANCE_RECORD',
        entityId: attendanceId,
        newValue: {
          checkOutAt: now,
          distanceMetres,
          insideGeofence,
        },
        createdAt: now,
      });

      return updated;
    } catch (err) {
      return handleDbError(err);
    }
  }

  async listAttendance(outletId: string, rawQuery?: any): Promise<HrAttendanceRecord[]> {
    const filters = rawQuery ? AttendanceListQuerySchema.parse(rawQuery) : undefined;
    return this.hrRepo.listAttendanceRecords(outletId, filters);
  }

  async createNozzleAssignment(
    outletId: string,
    actorUserId: string,
    payload: any
  ): Promise<HrNozzleAssignment> {
    const validated = NozzleAssignmentCreateSchema.parse(payload);

    const roster = await this.hrRepo.getRosterById(validated.rosterAssignmentId);
    if (!roster) {
      throw new HrError('HR_ROSTER_NOT_FOUND', 'Roster assignment not found', 404);
    }
    if (roster.outletId !== outletId) {
      throw new HrError('HR_ROSTER_OUTLET_MISMATCH', 'Roster assignment belongs to another outlet', 400);
    }
    if (roster.status !== 'SCHEDULED') {
      throw new HrError('HR_ROSTER_NOT_SCHEDULED', 'Roster assignment is not scheduled', 400);
    }

    const staff = await this.hrRepo.getStaffById(roster.staffId);
    if (!staff || staff.outletId !== outletId) {
      throw new HrError('HR_STAFF_NOT_FOUND', 'Staff member not found', 404);
    }
    if (staff.employmentStatus !== 'ACTIVE') {
      throw new HrError('HR_STAFF_NOT_ACTIVE', 'Staff member is not active', 409);
    }

    const nozzle = await this.hrRepo.getNozzleById(validated.nozzleId);
    if (!nozzle) {
      throw new HrError('HR_NOZZLE_ASSIGNMENT_NOT_FOUND', 'Nozzle not found', 404);
    }
    if (nozzle.outletId !== outletId) {
      throw new HrError('HR_NOZZLE_OUTLET_MISMATCH', 'Nozzle belongs to another outlet', 400);
    }
    if (nozzle.status !== 'ACTIVE') {
      throw new HrError('HR_NOZZLE_NOT_ACTIVE', 'Nozzle is not active', 409);
    }

    const existingConflict = await this.hrRepo.getActiveNozzleAssignmentForNozzleDateShift(
      validated.nozzleId,
      roster.rosterDate,
      roster.shiftTemplateId
    );
    if (existingConflict) {
      throw new HrError('HR_NOZZLE_ALREADY_ASSIGNED', 'Nozzle is already assigned for this shift and date', 409);
    }

    const id = `nozz-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    try {
      const created = await this.hrRepo.createNozzleAssignment({
        id,
        outletId,
        rosterAssignmentId: roster.id,
        staffId: roster.staffId,
        nozzleId: validated.nozzleId,
        assignmentDate: roster.rosterDate,
        shiftTemplateId: roster.shiftTemplateId,
        status: 'ASSIGNED',
        notes: validated.notes,
        createdBy: actorUserId,
        createdAt: now,
        updatedAt: now,
      });

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_NOZZLE_ASSIGNED',
        entityType: 'HR_NOZZLE_ASSIGNMENT',
        entityId: id,
        newValue: {
          rosterAssignmentId: roster.id,
          staffId: roster.staffId,
          nozzleId: validated.nozzleId,
          assignmentDate: roster.rosterDate,
          shiftTemplateId: roster.shiftTemplateId,
        },
        createdAt: now,
      });

      return created;
    } catch (err) {
      return handleDbError(err);
    }
  }

  async listNozzleAssignments(outletId: string, rawQuery?: any): Promise<HrNozzleAssignment[]> {
    const filters = rawQuery ? NozzleAssignmentListQuerySchema.parse(rawQuery) : undefined;
    return this.hrRepo.listNozzleAssignments(outletId, filters);
  }

  async cancelNozzleAssignment(
    assignmentId: string,
    outletId: string,
    actorUserId: string
  ): Promise<HrNozzleAssignment> {
    const assignment = await this.hrRepo.getNozzleAssignmentById(assignmentId);
    if (!assignment || assignment.outletId !== outletId) {
      throw new HrError('HR_NOZZLE_ASSIGNMENT_NOT_FOUND', 'Nozzle assignment not found', 404);
    }
    if (assignment.status === 'CANCELLED') {
      throw new HrError('HR_NOZZLE_ASSIGNMENT_ALREADY_CANCELLED', 'Nozzle assignment is already cancelled', 409);
    }

    const now = new Date().toISOString();

    try {
      const updated = await this.hrRepo.updateNozzleAssignment(assignmentId, {
        status: 'CANCELLED',
        updatedAt: now,
      });

      if (!updated) {
        throw new HrError('HR_NOZZLE_ASSIGNMENT_NOT_FOUND', 'Nozzle assignment not found', 404);
      }

      await this.auditRepo.logAction({
        id: crypto.randomUUID(),
        userId: actorUserId,
        action: 'HR_NOZZLE_ASSIGNMENT_CANCELLED',
        entityType: 'HR_NOZZLE_ASSIGNMENT',
        entityId: assignmentId,
        oldValue: { status: assignment.status },
        newValue: { status: 'CANCELLED' },
        createdAt: now,
      });

      return updated;
    } catch (err) {
      return handleDbError(err);
    }
  }
}

