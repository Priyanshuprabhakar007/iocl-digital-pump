import { eq, and, desc, asc, gte, lte, sql, like, or } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import {
  hrDesignations,
  hrStaff,
  hrManpowerSanctions,
  hrRosterAssignments,
  hrOutletGeofencePolicies,
  hrAttendanceRecords,
  hrNozzleAssignments,
  shiftTemplates,
  documents,
  retailOutlets,
  nozzles,
  products,
  dispensers,
} from '../../db/schema';
import {
  HrDesignation,
  HrStaff,
  HrManpowerSanction,
  HrRosterAssignment,
  HrGeofencePolicy,
  HrAttendanceRecord,
  HrNozzleAssignment,
  HrDesignationStatus,
  HrEmploymentStatus,
  HrRosterStatus,
} from '../../shared/types';

export interface HrDesignationFilters {
  status?: HrDesignationStatus;
  search?: string;
}

export interface HrStaffFilters {
  designationId?: string;
  employmentStatus?: HrEmploymentStatus;
  search?: string;
  joinedFrom?: string;
  joinedTo?: string;
}

export interface HrRosterFilters {
  staffId?: string;
  designationId?: string;
  shiftTemplateId?: string;
  status?: HrRosterStatus;
  fromDate?: string;
  toDate?: string;
}

export class HrRepository {
  constructor(private db: AppDatabase) {}

  // ==========================================================================
  // DESIGNATIONS
  // ==========================================================================

  async getDesignationById(id: string): Promise<HrDesignation | null> {
    const row = await this.db
      .select()
      .from(hrDesignations)
      .where(eq(hrDesignations.id, id))
      .get();
    return row ? (row as HrDesignation) : null;
  }

  async findDesignationByCode(outletId: string, code: string): Promise<HrDesignation | null> {
    const row = await this.db
      .select()
      .from(hrDesignations)
      .where(and(eq(hrDesignations.outletId, outletId), eq(hrDesignations.code, code)))
      .get();
    return row ? (row as HrDesignation) : null;
  }

  async listDesignations(outletId: string, filters?: HrDesignationFilters): Promise<HrDesignation[]> {
    const conditions = [eq(hrDesignations.outletId, outletId)];

    if (filters?.status) {
      conditions.push(eq(hrDesignations.status, filters.status));
    }
    if (filters?.search) {
      const s = `%${filters.search.trim()}%`;
      conditions.push(
        or(like(hrDesignations.code, s), like(hrDesignations.name, s))!
      );
    }

    const rows = await this.db
      .select()
      .from(hrDesignations)
      .where(and(...conditions))
      .orderBy(asc(hrDesignations.code))
      .all();

    return rows as HrDesignation[];
  }

  async createDesignation(data: {
    id: string;
    outletId: string;
    code: string;
    name: string;
    status: HrDesignationStatus;
    notes?: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<HrDesignation> {
    await this.db.insert(hrDesignations).values({
      id: data.id,
      outletId: data.outletId,
      code: data.code,
      name: data.name,
      status: data.status,
      notes: data.notes ?? null,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }).run();

    const created = await this.getDesignationById(data.id);
    return created!;
  }

  async updateDesignation(
    id: string,
    outletId: string,
    data: {
      name?: string;
      status?: HrDesignationStatus;
      notes?: string | null;
      updatedAt: string;
    }
  ): Promise<HrDesignation | null> {
    const updateValues: Record<string, any> = {
      updatedAt: data.updatedAt,
    };
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.notes !== undefined) updateValues.notes = data.notes;

    await this.db
      .update(hrDesignations)
      .set(updateValues)
      .where(and(eq(hrDesignations.id, id), eq(hrDesignations.outletId, outletId)))
      .run();

    return this.getDesignationById(id);
  }

  // ==========================================================================
  // STAFF
  // ==========================================================================

  async getStaffById(id: string): Promise<HrStaff | null> {
    const row = await this.db
      .select({
        staff: hrStaff,
        designation: hrDesignations,
      })
      .from(hrStaff)
      .leftJoin(hrDesignations, eq(hrStaff.designationId, hrDesignations.id))
      .where(eq(hrStaff.id, id))
      .get();

    if (!row) return null;

    return {
      ...(row.staff as HrStaff),
      maskedAadhaar: `XXXX XXXX ${row.staff.aadhaarLast4}`,
      designationName: row.designation?.name,
      designationCode: row.designation?.code,
    };
  }

  async findStaffByEmployeeCode(outletId: string, employeeCode: string): Promise<HrStaff | null> {
    const row = await this.db
      .select()
      .from(hrStaff)
      .where(and(eq(hrStaff.outletId, outletId), eq(hrStaff.employeeCode, employeeCode)))
      .get();

    if (!row) return null;
    return {
      ...(row as HrStaff),
      maskedAadhaar: `XXXX XXXX ${row.aadhaarLast4}`,
    };
  }

  async listStaff(outletId: string, filters?: HrStaffFilters): Promise<HrStaff[]> {
    const conditions = [eq(hrStaff.outletId, outletId)];

    if (filters?.designationId) {
      conditions.push(eq(hrStaff.designationId, filters.designationId));
    }
    if (filters?.employmentStatus) {
      conditions.push(eq(hrStaff.employmentStatus, filters.employmentStatus));
    }
    if (filters?.search) {
      const s = `%${filters.search.trim()}%`;
      conditions.push(
        or(like(hrStaff.employeeCode, s), like(hrStaff.fullName, s))!
      );
    }
    if (filters?.joinedFrom) {
      conditions.push(gte(hrStaff.joiningDate, filters.joinedFrom));
    }
    if (filters?.joinedTo) {
      conditions.push(lte(hrStaff.joiningDate, filters.joinedTo));
    }

    const rows = await this.db
      .select({
        staff: hrStaff,
        designation: hrDesignations,
      })
      .from(hrStaff)
      .leftJoin(hrDesignations, eq(hrStaff.designationId, hrDesignations.id))
      .where(and(...conditions))
      .orderBy(asc(hrStaff.employeeCode))
      .all();

    return rows.map(r => ({
      ...(r.staff as HrStaff),
      maskedAadhaar: `XXXX XXXX ${r.staff.aadhaarLast4}`,
      designationName: r.designation?.name,
      designationCode: r.designation?.code,
    }));
  }

  async createStaff(data: {
    id: string;
    outletId: string;
    employeeCode: string;
    fullName: string;
    designationId: string;
    aadhaarLast4: string;
    aadhaarDocumentId?: string | null;
    photoDocumentId?: string | null;
    emergencyContactName: string;
    emergencyContactPhone: string;
    joiningDate: string;
    employmentStatus: HrEmploymentStatus;
    exitDate?: string | null;
    notes?: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<HrStaff> {
    await this.db.insert(hrStaff).values({
      id: data.id,
      outletId: data.outletId,
      employeeCode: data.employeeCode,
      fullName: data.fullName,
      designationId: data.designationId,
      aadhaarLast4: data.aadhaarLast4,
      aadhaarDocumentId: data.aadhaarDocumentId ?? null,
      photoDocumentId: data.photoDocumentId ?? null,
      emergencyContactName: data.emergencyContactName,
      emergencyContactPhone: data.emergencyContactPhone,
      joiningDate: data.joiningDate,
      employmentStatus: data.employmentStatus,
      exitDate: data.exitDate ?? null,
      notes: data.notes ?? null,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }).run();

    const created = await this.getStaffById(data.id);
    return created!;
  }

  async updateStaff(
    id: string,
    outletId: string,
    data: {
      fullName?: string;
      designationId?: string;
      aadhaarLast4?: string;
      aadhaarDocumentId?: string | null;
      photoDocumentId?: string | null;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      joiningDate?: string;
      employmentStatus?: HrEmploymentStatus;
      exitDate?: string | null;
      notes?: string | null;
      updatedAt: string;
    }
  ): Promise<HrStaff | null> {
    const updateValues: Record<string, any> = {
      updatedAt: data.updatedAt,
    };
    if (data.fullName !== undefined) updateValues.fullName = data.fullName;
    if (data.designationId !== undefined) updateValues.designationId = data.designationId;
    if (data.aadhaarLast4 !== undefined) updateValues.aadhaarLast4 = data.aadhaarLast4;
    if (data.aadhaarDocumentId !== undefined) updateValues.aadhaarDocumentId = data.aadhaarDocumentId;
    if (data.photoDocumentId !== undefined) updateValues.photoDocumentId = data.photoDocumentId;
    if (data.emergencyContactName !== undefined) updateValues.emergencyContactName = data.emergencyContactName;
    if (data.emergencyContactPhone !== undefined) updateValues.emergencyContactPhone = data.emergencyContactPhone;
    if (data.joiningDate !== undefined) updateValues.joiningDate = data.joiningDate;
    if (data.employmentStatus !== undefined) updateValues.employmentStatus = data.employmentStatus;
    if (data.exitDate !== undefined) updateValues.exitDate = data.exitDate;
    if (data.notes !== undefined) updateValues.notes = data.notes;

    await this.db
      .update(hrStaff)
      .set(updateValues)
      .where(and(eq(hrStaff.id, id), eq(hrStaff.outletId, outletId)))
      .run();

    return this.getStaffById(id);
  }

  // ==========================================================================
  // MANPOWER SANCTIONS
  // ==========================================================================

  async getManpowerSanctionById(id: string): Promise<HrManpowerSanction | null> {
    const row = await this.db
      .select({
        sanction: hrManpowerSanctions,
        designation: hrDesignations,
      })
      .from(hrManpowerSanctions)
      .leftJoin(hrDesignations, eq(hrManpowerSanctions.designationId, hrDesignations.id))
      .where(eq(hrManpowerSanctions.id, id))
      .get();

    if (!row) return null;

    return {
      ...(row.sanction as HrManpowerSanction),
      designationName: row.designation?.name,
      designationCode: row.designation?.code,
    };
  }

  async findSanctionByDesignation(
    outletId: string,
    designationId: string
  ): Promise<HrManpowerSanction | null> {
    const row = await this.db
      .select({
        sanction: hrManpowerSanctions,
        designation: hrDesignations,
      })
      .from(hrManpowerSanctions)
      .leftJoin(hrDesignations, eq(hrManpowerSanctions.designationId, hrDesignations.id))
      .where(
        and(
          eq(hrManpowerSanctions.outletId, outletId),
          eq(hrManpowerSanctions.designationId, designationId)
        )
      )
      .get();

    if (!row) return null;

    return {
      ...(row.sanction as HrManpowerSanction),
      designationName: row.designation?.name,
      designationCode: row.designation?.code,
    };
  }

  async listManpowerSanctions(outletId: string): Promise<HrManpowerSanction[]> {
    const rows = await this.db
      .select({
        sanction: hrManpowerSanctions,
        designation: hrDesignations,
      })
      .from(hrManpowerSanctions)
      .leftJoin(hrDesignations, eq(hrManpowerSanctions.designationId, hrDesignations.id))
      .where(eq(hrManpowerSanctions.outletId, outletId))
      .orderBy(asc(hrDesignations.code))
      .all();

    return rows.map(r => ({
      ...(r.sanction as HrManpowerSanction),
      designationName: r.designation?.name,
      designationCode: r.designation?.code,
    }));
  }

  async createManpowerSanction(data: {
    id: string;
    outletId: string;
    designationId: string;
    sanctionedCount: number;
    effectiveFrom: string;
    notes?: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<HrManpowerSanction> {
    await this.db.insert(hrManpowerSanctions).values({
      id: data.id,
      outletId: data.outletId,
      designationId: data.designationId,
      sanctionedCount: data.sanctionedCount,
      effectiveFrom: data.effectiveFrom,
      notes: data.notes ?? null,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }).run();

    const created = await this.getManpowerSanctionById(data.id);
    return created!;
  }

  async updateManpowerSanction(
    id: string,
    outletId: string,
    data: {
      sanctionedCount?: number;
      effectiveFrom?: string;
      notes?: string | null;
      updatedAt: string;
    }
  ): Promise<HrManpowerSanction | null> {
    const updateValues: Record<string, any> = {
      updatedAt: data.updatedAt,
    };
    if (data.sanctionedCount !== undefined) updateValues.sanctionedCount = data.sanctionedCount;
    if (data.effectiveFrom !== undefined) updateValues.effectiveFrom = data.effectiveFrom;
    if (data.notes !== undefined) updateValues.notes = data.notes;

    await this.db
      .update(hrManpowerSanctions)
      .set(updateValues)
      .where(and(eq(hrManpowerSanctions.id, id), eq(hrManpowerSanctions.outletId, outletId)))
      .run();

    return this.getManpowerSanctionById(id);
  }

  // ==========================================================================
  // ROSTER
  // ==========================================================================

  async getRosterById(id: string): Promise<HrRosterAssignment | null> {
    const row = await this.db
      .select({
        roster: hrRosterAssignments,
        staff: hrStaff,
        designation: hrDesignations,
        shiftTemplate: shiftTemplates,
      })
      .from(hrRosterAssignments)
      .leftJoin(hrStaff, eq(hrRosterAssignments.staffId, hrStaff.id))
      .leftJoin(hrDesignations, eq(hrStaff.designationId, hrDesignations.id))
      .leftJoin(shiftTemplates, eq(hrRosterAssignments.shiftTemplateId, shiftTemplates.id))
      .where(eq(hrRosterAssignments.id, id))
      .get();

    if (!row) return null;

    return {
      ...(row.roster as HrRosterAssignment),
      staffName: row.staff?.fullName,
      employeeCode: row.staff?.employeeCode,
      designationName: row.designation?.name,
      shiftTemplateCode: row.shiftTemplate?.code,
      shiftTemplateName: row.shiftTemplate?.name,
      shiftStartTime: row.shiftTemplate?.startTime,
      shiftEndTime: row.shiftTemplate?.endTime,
    };
  }

  async findRosterForStaffDate(
    staffId: string,
    rosterDate: string
  ): Promise<HrRosterAssignment | null> {
    const row = await this.db
      .select({
        roster: hrRosterAssignments,
        staff: hrStaff,
        designation: hrDesignations,
        shiftTemplate: shiftTemplates,
      })
      .from(hrRosterAssignments)
      .leftJoin(hrStaff, eq(hrRosterAssignments.staffId, hrStaff.id))
      .leftJoin(hrDesignations, eq(hrStaff.designationId, hrDesignations.id))
      .leftJoin(shiftTemplates, eq(hrRosterAssignments.shiftTemplateId, shiftTemplates.id))
      .where(
        and(
          eq(hrRosterAssignments.staffId, staffId),
          eq(hrRosterAssignments.rosterDate, rosterDate)
        )
      )
      .get();

    if (!row) return null;

    return {
      ...(row.roster as HrRosterAssignment),
      staffName: row.staff?.fullName,
      employeeCode: row.staff?.employeeCode,
      designationName: row.designation?.name,
      shiftTemplateCode: row.shiftTemplate?.code,
      shiftTemplateName: row.shiftTemplate?.name,
      shiftStartTime: row.shiftTemplate?.startTime,
      shiftEndTime: row.shiftTemplate?.endTime,
    };
  }

  async listRoster(outletId: string, filters?: HrRosterFilters): Promise<HrRosterAssignment[]> {
    const conditions = [eq(hrRosterAssignments.outletId, outletId)];

    if (filters?.staffId) {
      conditions.push(eq(hrRosterAssignments.staffId, filters.staffId));
    }
    if (filters?.shiftTemplateId) {
      conditions.push(eq(hrRosterAssignments.shiftTemplateId, filters.shiftTemplateId));
    }
    if (filters?.status) {
      conditions.push(eq(hrRosterAssignments.status, filters.status));
    }
    if (filters?.fromDate) {
      conditions.push(gte(hrRosterAssignments.rosterDate, filters.fromDate));
    }
    if (filters?.toDate) {
      conditions.push(lte(hrRosterAssignments.rosterDate, filters.toDate));
    }
    if (filters?.designationId) {
      conditions.push(eq(hrStaff.designationId, filters.designationId));
    }

    const rows = await this.db
      .select({
        roster: hrRosterAssignments,
        staff: hrStaff,
        designation: hrDesignations,
        shiftTemplate: shiftTemplates,
      })
      .from(hrRosterAssignments)
      .leftJoin(hrStaff, eq(hrRosterAssignments.staffId, hrStaff.id))
      .leftJoin(hrDesignations, eq(hrStaff.designationId, hrDesignations.id))
      .leftJoin(shiftTemplates, eq(hrRosterAssignments.shiftTemplateId, shiftTemplates.id))
      .where(and(...conditions))
      .orderBy(asc(hrRosterAssignments.rosterDate), asc(hrRosterAssignments.createdAt))
      .all();

    return rows.map(r => ({
      ...(r.roster as HrRosterAssignment),
      staffName: r.staff?.fullName,
      employeeCode: r.staff?.employeeCode,
      designationName: r.designation?.name,
      shiftTemplateCode: r.shiftTemplate?.code,
      shiftTemplateName: r.shiftTemplate?.name,
      shiftStartTime: r.shiftTemplate?.startTime,
      shiftEndTime: r.shiftTemplate?.endTime,
    }));
  }

  async createRoster(data: {
    id: string;
    outletId: string;
    staffId: string;
    rosterDate: string;
    shiftTemplateId: string;
    status: HrRosterStatus;
    notes?: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<HrRosterAssignment> {
    await this.db.insert(hrRosterAssignments).values({
      id: data.id,
      outletId: data.outletId,
      staffId: data.staffId,
      rosterDate: data.rosterDate,
      shiftTemplateId: data.shiftTemplateId,
      status: data.status,
      notes: data.notes ?? null,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }).run();

    const created = await this.getRosterById(data.id);
    return created!;
  }

  async updateRoster(
    id: string,
    outletId: string,
    data: {
      staffId?: string;
      rosterDate?: string;
      shiftTemplateId?: string;
      status?: HrRosterStatus;
      notes?: string | null;
      updatedAt: string;
    }
  ): Promise<HrRosterAssignment | null> {
    const updateValues: Record<string, any> = {
      updatedAt: data.updatedAt,
    };
    if (data.staffId !== undefined) updateValues.staffId = data.staffId;
    if (data.rosterDate !== undefined) updateValues.rosterDate = data.rosterDate;
    if (data.shiftTemplateId !== undefined) updateValues.shiftTemplateId = data.shiftTemplateId;
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.notes !== undefined) updateValues.notes = data.notes;

    await this.db
      .update(hrRosterAssignments)
      .set(updateValues)
      .where(and(eq(hrRosterAssignments.id, id), eq(hrRosterAssignments.outletId, outletId)))
      .run();

    return this.getRosterById(id);
  }

  // ==========================================================================
  // HELPERS & SUMMARY INPUTS
  // ==========================================================================

  async getManpowerSummaryInputs(outletId: string): Promise<{
    designations: HrDesignation[];
    sanctions: HrManpowerSanction[];
    activeStaffCounts: { designationId: string; count: number }[];
  }> {
    const [designations, sanctions, activeStaffGroup] = await Promise.all([
      this.db
        .select()
        .from(hrDesignations)
        .where(eq(hrDesignations.outletId, outletId))
        .orderBy(asc(hrDesignations.code))
        .all(),
      this.db
        .select()
        .from(hrManpowerSanctions)
        .where(eq(hrManpowerSanctions.outletId, outletId))
        .all(),
      this.db
        .select({
          designationId: hrStaff.designationId,
          count: sql<number>`count(*)`.as('count'),
        })
        .from(hrStaff)
        .where(
          and(
            eq(hrStaff.outletId, outletId),
            eq(hrStaff.employmentStatus, 'ACTIVE')
          )
        )
        .groupBy(hrStaff.designationId)
        .all(),
    ]);

    return {
      designations: designations as HrDesignation[],
      sanctions: sanctions as HrManpowerSanction[],
      activeStaffCounts: activeStaffGroup.map(r => ({
        designationId: r.designationId,
        count: Number(r.count),
      })),
    };
  }

  async getDocumentById(id: string): Promise<{ id: string; outletId: string | null } | null> {
    const row = await this.db
      .select({ id: documents.id, outletId: documents.outletId })
      .from(documents)
      .where(eq(documents.id, id))
      .get();
    return row ?? null;
  }

  async getShiftTemplateById(id: string): Promise<{
    id: string;
    outletId: string;
    status: string;
    code: string;
    name: string;
    startTime: string;
    endTime: string;
  } | null> {
    const row = await this.db
      .select({
        id: shiftTemplates.id,
        outletId: shiftTemplates.outletId,
        status: shiftTemplates.status,
        code: shiftTemplates.code,
        name: shiftTemplates.name,
        startTime: shiftTemplates.startTime,
        endTime: shiftTemplates.endTime,
      })
      .from(shiftTemplates)
      .where(eq(shiftTemplates.id, id))
      .get();
    return row ?? null;
  }

  // ==========================================================================
  // PHASE 5B: GEOFENCE, ATTENDANCE & NOZZLE ASSIGNMENTS
  // ==========================================================================

  async getGeofencePolicy(outletId: string): Promise<HrGeofencePolicy | null> {
    const row = await this.db
      .select()
      .from(hrOutletGeofencePolicies)
      .where(eq(hrOutletGeofencePolicies.outletId, outletId))
      .get();
    return row ? (row as HrGeofencePolicy) : null;
  }

  async upsertGeofencePolicy(data: {
    id: string;
    outletId: string;
    radiusMetres: number;
    maxAccuracyMetres: number;
    attendanceGeofenceRequired: number;
    status: 'ACTIVE' | 'INACTIVE';
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<HrGeofencePolicy> {
    const existing = await this.getGeofencePolicy(data.outletId);
    if (existing) {
      await this.db
        .update(hrOutletGeofencePolicies)
        .set({
          radiusMetres: data.radiusMetres,
          maxAccuracyMetres: data.maxAccuracyMetres,
          attendanceGeofenceRequired: data.attendanceGeofenceRequired,
          status: data.status,
          updatedAt: data.updatedAt,
        })
        .where(eq(hrOutletGeofencePolicies.outletId, data.outletId))
        .run();
    } else {
      await this.db.insert(hrOutletGeofencePolicies).values({
        id: data.id,
        outletId: data.outletId,
        radiusMetres: data.radiusMetres,
        maxAccuracyMetres: data.maxAccuracyMetres,
        attendanceGeofenceRequired: data.attendanceGeofenceRequired,
        status: data.status,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      }).run();
    }
    return (await this.getGeofencePolicy(data.outletId))!;
  }

  async getAttendanceById(id: string): Promise<HrAttendanceRecord | null> {
    const row = await this.db
      .select({
        record: hrAttendanceRecords,
        staffName: hrStaff.fullName,
        employeeCode: hrStaff.employeeCode,
        designationName: hrDesignations.name,
        shiftTemplateCode: shiftTemplates.code,
        shiftTemplateName: shiftTemplates.name,
      })
      .from(hrAttendanceRecords)
      .innerJoin(hrStaff, eq(hrAttendanceRecords.staffId, hrStaff.id))
      .innerJoin(hrDesignations, eq(hrStaff.designationId, hrDesignations.id))
      .innerJoin(shiftTemplates, eq(hrAttendanceRecords.shiftTemplateId, shiftTemplates.id))
      .where(eq(hrAttendanceRecords.id, id))
      .get();

    if (!row) return null;
    return {
      ...row.record,
      staffName: row.staffName,
      employeeCode: row.employeeCode,
      designationName: row.designationName,
      shiftTemplateCode: row.shiftTemplateCode,
      shiftTemplateName: row.shiftTemplateName,
    } as HrAttendanceRecord;
  }

  async getActiveAttendanceByRosterAssignment(rosterAssignmentId: string): Promise<HrAttendanceRecord | null> {
    const row = await this.db
      .select()
      .from(hrAttendanceRecords)
      .where(and(eq(hrAttendanceRecords.rosterAssignmentId, rosterAssignmentId), sql`${hrAttendanceRecords.status} != 'CANCELLED'`))
      .get();
    return row ? (row as HrAttendanceRecord) : null;
  }

  async createAttendanceRecord(data: any): Promise<HrAttendanceRecord> {
    await this.db.insert(hrAttendanceRecords).values(data).run();
    return (await this.getAttendanceById(data.id))!;
  }

  async updateAttendanceRecord(id: string, data: any): Promise<HrAttendanceRecord> {
    await this.db
      .update(hrAttendanceRecords)
      .set(data)
      .where(eq(hrAttendanceRecords.id, id))
      .run();
    return (await this.getAttendanceById(id))!;
  }

  async listAttendanceRecords(outletId: string, filters?: {
    date?: string;
    fromDate?: string;
    toDate?: string;
    staffId?: string;
    shiftTemplateId?: string;
    status?: string;
  }): Promise<HrAttendanceRecord[]> {
    const conditions = [eq(hrAttendanceRecords.outletId, outletId)];

    if (filters?.date) {
      conditions.push(eq(hrAttendanceRecords.attendanceDate, filters.date));
    }
    if (filters?.fromDate) {
      conditions.push(gte(hrAttendanceRecords.attendanceDate, filters.fromDate));
    }
    if (filters?.toDate) {
      conditions.push(lte(hrAttendanceRecords.attendanceDate, filters.toDate));
    }
    if (filters?.staffId) {
      conditions.push(eq(hrAttendanceRecords.staffId, filters.staffId));
    }
    if (filters?.shiftTemplateId) {
      conditions.push(eq(hrAttendanceRecords.shiftTemplateId, filters.shiftTemplateId));
    }
    if (filters?.status) {
      conditions.push(eq(hrAttendanceRecords.status, filters.status as any));
    }

    const rows = await this.db
      .select({
        record: hrAttendanceRecords,
        staffName: hrStaff.fullName,
        employeeCode: hrStaff.employeeCode,
        designationName: hrDesignations.name,
        shiftTemplateCode: shiftTemplates.code,
        shiftTemplateName: shiftTemplates.name,
      })
      .from(hrAttendanceRecords)
      .innerJoin(hrStaff, eq(hrAttendanceRecords.staffId, hrStaff.id))
      .innerJoin(hrDesignations, eq(hrStaff.designationId, hrDesignations.id))
      .innerJoin(shiftTemplates, eq(hrAttendanceRecords.shiftTemplateId, shiftTemplates.id))
      .where(and(...conditions))
      .orderBy(desc(hrAttendanceRecords.createdAt))
      .all();

    return rows.map(row => ({
      ...row.record,
      staffName: row.staffName,
      employeeCode: row.employeeCode,
      designationName: row.designationName,
      shiftTemplateCode: row.shiftTemplateCode,
      shiftTemplateName: row.shiftTemplateName,
    })) as HrAttendanceRecord[];
  }

  async getNozzleAssignmentById(id: string): Promise<HrNozzleAssignment | null> {
    const row = await this.db
      .select({
        record: hrNozzleAssignments,
        staffName: hrStaff.fullName,
        employeeCode: hrStaff.employeeCode,
        nozzleNumber: nozzles.nozzleNumber,
        productName: products.name,
        dispenserName: dispensers.name,
        shiftTemplateName: shiftTemplates.name,
      })
      .from(hrNozzleAssignments)
      .innerJoin(hrStaff, eq(hrNozzleAssignments.staffId, hrStaff.id))
      .innerJoin(nozzles, eq(hrNozzleAssignments.nozzleId, nozzles.id))
      .innerJoin(products, eq(nozzles.productId, products.id))
      .innerJoin(dispensers, eq(nozzles.dispenserId, dispensers.id))
      .innerJoin(shiftTemplates, eq(hrNozzleAssignments.shiftTemplateId, shiftTemplates.id))
      .where(eq(hrNozzleAssignments.id, id))
      .get();

    if (!row) return null;
    return {
      ...row.record,
      staffName: row.staffName,
      employeeCode: row.employeeCode,
      nozzleNumber: row.nozzleNumber,
      productName: row.productName,
      dispenserName: row.dispenserName,
      shiftTemplateName: row.shiftTemplateName,
    } as HrNozzleAssignment;
  }

  async getActiveNozzleAssignmentForNozzleDateShift(
    nozzleId: string,
    assignmentDate: string,
    shiftTemplateId: string
  ): Promise<HrNozzleAssignment | null> {
    const row = await this.db
      .select()
      .from(hrNozzleAssignments)
      .where(
        and(
          eq(hrNozzleAssignments.nozzleId, nozzleId),
          eq(hrNozzleAssignments.assignmentDate, assignmentDate),
          eq(hrNozzleAssignments.shiftTemplateId, shiftTemplateId),
          sql`${hrNozzleAssignments.status} != 'CANCELLED'`
        )
      )
      .get();
    return row ? (row as HrNozzleAssignment) : null;
  }

  async createNozzleAssignment(data: any): Promise<HrNozzleAssignment> {
    await this.db.insert(hrNozzleAssignments).values(data).run();
    return (await this.getNozzleAssignmentById(data.id))!;
  }

  async updateNozzleAssignment(id: string, data: any): Promise<HrNozzleAssignment> {
    await this.db
      .update(hrNozzleAssignments)
      .set(data)
      .where(eq(hrNozzleAssignments.id, id))
      .run();
    return (await this.getNozzleAssignmentById(id))!;
  }

  async listNozzleAssignments(outletId: string, filters?: {
    date?: string;
    fromDate?: string;
    toDate?: string;
    staffId?: string;
    nozzleId?: string;
    shiftTemplateId?: string;
    status?: string;
  }): Promise<HrNozzleAssignment[]> {
    const conditions = [eq(hrNozzleAssignments.outletId, outletId)];

    if (filters?.date) {
      conditions.push(eq(hrNozzleAssignments.assignmentDate, filters.date));
    }
    if (filters?.fromDate) {
      conditions.push(gte(hrNozzleAssignments.assignmentDate, filters.fromDate));
    }
    if (filters?.toDate) {
      conditions.push(lte(hrNozzleAssignments.assignmentDate, filters.toDate));
    }
    if (filters?.staffId) {
      conditions.push(eq(hrNozzleAssignments.staffId, filters.staffId));
    }
    if (filters?.nozzleId) {
      conditions.push(eq(hrNozzleAssignments.nozzleId, filters.nozzleId));
    }
    if (filters?.shiftTemplateId) {
      conditions.push(eq(hrNozzleAssignments.shiftTemplateId, filters.shiftTemplateId));
    }
    if (filters?.status) {
      conditions.push(eq(hrNozzleAssignments.status, filters.status as any));
    }

    const rows = await this.db
      .select({
        record: hrNozzleAssignments,
        staffName: hrStaff.fullName,
        employeeCode: hrStaff.employeeCode,
        nozzleNumber: nozzles.nozzleNumber,
        productName: products.name,
        dispenserName: dispensers.name,
        shiftTemplateName: shiftTemplates.name,
      })
      .from(hrNozzleAssignments)
      .innerJoin(hrStaff, eq(hrNozzleAssignments.staffId, hrStaff.id))
      .innerJoin(nozzles, eq(hrNozzleAssignments.nozzleId, nozzles.id))
      .innerJoin(products, eq(nozzles.productId, products.id))
      .innerJoin(dispensers, eq(nozzles.dispenserId, dispensers.id))
      .innerJoin(shiftTemplates, eq(hrNozzleAssignments.shiftTemplateId, shiftTemplates.id))
      .where(and(...conditions))
      .orderBy(desc(hrNozzleAssignments.createdAt))
      .all();

    return rows.map(row => ({
      ...row.record,
      staffName: row.staffName,
      employeeCode: row.employeeCode,
      nozzleNumber: row.nozzleNumber,
      productName: row.productName,
      dispenserName: row.dispenserName,
      shiftTemplateName: row.shiftTemplateName,
    })) as HrNozzleAssignment[];
  }

  async getRetailOutletLocation(outletId: string): Promise<{ latitude: number | null; longitude: number | null } | null> {
    const row = await this.db
      .select({ latitude: retailOutlets.latitude, longitude: retailOutlets.longitude })
      .from(retailOutlets)
      .where(eq(retailOutlets.id, outletId))
      .get();
    return row ?? null;
  }

  async getNozzleById(nozzleId: string): Promise<{ id: string; outletId: string; status: string } | null> {
    const row = await this.db
      .select({ id: nozzles.id, outletId: nozzles.outletId, status: nozzles.status })
      .from(nozzles)
      .where(eq(nozzles.id, nozzleId))
      .get();
    return row ?? null;
  }
}
