import { eq, and, desc, asc, gte, lte, sql, like, or } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import {
  hrDesignations,
  hrStaff,
  hrManpowerSanctions,
  hrRosterAssignments,
  shiftTemplates,
  documents,
} from '../../db/schema';
import {
  HrDesignation,
  HrStaff,
  HrManpowerSanction,
  HrRosterAssignment,
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
}
