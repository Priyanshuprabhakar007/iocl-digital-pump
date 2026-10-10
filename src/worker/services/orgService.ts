import { AppDatabase } from '../../db';
import { OrgRepository } from '../repositories/orgRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { HierarchyRepository } from '../repositories/hierarchyRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { ScopeService } from './scopeService';
import { UserContext } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import {
  DepartmentCreateSchema,
  DepartmentUpdateSchema,
  OfficerCreateSchema,
  OfficerUpdateSchema,
  OfficerPostingCreateSchema,
  OfficerPostingUpdateSchema,
  ServiceProviderCreateSchema,
  ServiceProviderUpdateSchema,
  OutletServiceProviderAssignmentCreateSchema,
  OutletServiceProviderAssignmentUpdateSchema,
} from '../../shared/validators';

export class OrgError extends Error {
  constructor(public code: string, message: string, public status: number = 400) {
    super(message);
    this.name = 'OrgError';
  }
}

export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class OrgService {
  private repo: OrgRepository;
  private auditRepo: AuditRepository;
  private hierarchyRepo: HierarchyRepository;
  private outletRepo: OutletRepository;

  constructor(db: AppDatabase) {
    this.repo = new OrgRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.hierarchyRepo = new HierarchyRepository(db);
    this.outletRepo = new OutletRepository(db);
  }

  private ensureActor(userId?: string) {
    if (!userId) {
      throw new OrgError('UNAUTHORIZED_ACTOR', 'Authenticated actor user ID is required for organization master modifications.', 401);
    }
  }

  // -------------------------------------------------------------------------
  // Departments
  // -------------------------------------------------------------------------
  async listDepartments() {
    return this.repo.listDepartments();
  }

  async createDepartment(input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const parsed = DepartmentCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid department data', 400);
    }
    const data = parsed.data;

    const existing = (await this.repo.listDepartments()).find(d => d.code === data.code);
    if (existing) {
      throw new OrgError('DUPLICATE_DEPARTMENT_CODE', `Department with code '${data.code}' already exists`, 409);
    }

    const now = new Date().toISOString();
    const id = `dept-${uuidv4()}`;
    const record = await this.repo.createDepartment({
      id,
      code: data.code,
      name: data.name,
      description: data.description || null,
      status: data.status,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'ORG_DEPARTMENT_CREATED',
      entityType: 'ORG_DEPARTMENT',
      entityId: id,
      newValue: record,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return record;
  }

  async updateDepartment(id: string, input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const dept = await this.repo.getDepartmentById(id);
    if (!dept) {
      throw new OrgError('DEPARTMENT_NOT_FOUND', 'Department not found', 404);
    }

    const parsed = DepartmentUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid department update data', 400);
    }
    const data = parsed.data;
    const now = new Date().toISOString();

    const updated = await this.repo.updateDepartment(id, {
      ...data,
      updatedAt: now,
    });

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'ORG_DEPARTMENT_UPDATED',
      entityType: 'ORG_DEPARTMENT',
      entityId: id,
      oldValue: dept,
      newValue: updated,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Officers
  // -------------------------------------------------------------------------
  async listOfficers(departmentId?: string) {
    return this.repo.listOfficers(departmentId);
  }

  async createOfficer(input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const parsed = OfficerCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid officer data', 400);
    }
    const data = parsed.data;

    const dept = await this.repo.getDepartmentById(data.departmentId);
    if (!dept) {
      throw new OrgError('DEPARTMENT_NOT_FOUND', 'Specified department does not exist', 404);
    }

    const existing = (await this.repo.listOfficers()).find(o => o.employeeCode === data.employeeCode || (data.email && o.email === data.email));
    if (existing) {
      throw new OrgError('DUPLICATE_OFFICER', 'Officer with employee code or email already exists', 409);
    }

    const now = new Date().toISOString();
    const id = `off-${uuidv4()}`;
    const record = await this.repo.createOfficer({
      id,
      employeeCode: data.employeeCode,
      fullName: data.fullName,
      designationTitle: data.designationTitle,
      departmentId: data.departmentId,
      email: data.email || null,
      phone: data.phone || null,
      status: data.status,
      notes: data.notes || null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'ORG_OFFICER_CREATED',
      entityType: 'ORG_OFFICER',
      entityId: id,
      newValue: record,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return record;
  }

  async updateOfficer(id: string, input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const officer = await this.repo.getOfficerById(id);
    if (!officer) {
      throw new OrgError('OFFICER_NOT_FOUND', 'Officer not found', 404);
    }

    const parsed = OfficerUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid officer update data', 400);
    }
    const data = parsed.data;
    if (data.departmentId) {
      const dept = await this.repo.getDepartmentById(data.departmentId);
      if (!dept) {
        throw new OrgError('DEPARTMENT_NOT_FOUND', 'Specified department does not exist', 404);
      }
    }

    const now = new Date().toISOString();
    const updated = await this.repo.updateOfficer(id, {
      ...data,
      updatedAt: now,
    });

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'ORG_OFFICER_UPDATED',
      entityType: 'ORG_OFFICER',
      entityId: id,
      oldValue: officer,
      newValue: updated,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Officer Postings
  // -------------------------------------------------------------------------
  async listOfficerPostings(officerId?: string, actorCtx?: UserContext) {
    const allPostings = await this.repo.listOfficerPostings(officerId);
    if (!actorCtx || actorCtx.isGlobalScope) {
      return allPostings;
    }

    const filtered: typeof allPostings = [];
    for (const posting of allPostings) {
      const isVisible = await ScopeService.isScopeWithinActorAuthority(
        actorCtx,
        {
          id: posting.id,
          userId: posting.officerId,
          scopeLevel: posting.scopeLevel as any,
          stateId: posting.stateId,
          divisionId: posting.divisionId,
          salesAreaId: posting.salesAreaId,
          outletId: posting.outletId,
          createdAt: posting.createdAt,
          createdBy: posting.createdBy,
        },
        this.hierarchyRepo,
        this.outletRepo
      );
      if (isVisible) {
        filtered.push(posting);
      }
    }

    return filtered;
  }

  async getPostingById(id: string) {
    return this.repo.getPostingById(id);
  }

  async getAssignmentById(id: string) {
    return this.repo.getAssignmentById(id);
  }

  async createOfficerPosting(officerId: string, input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const officer = await this.repo.getOfficerById(officerId);
    if (!officer) {
      throw new OrgError('OFFICER_NOT_FOUND', 'Officer not found', 404);
    }

    const parsed = OfficerPostingCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid officer posting data', 400);
    }
    const data = parsed.data;

    // Database-backed posting hierarchy validation
    if (data.scopeLevel === 'STATE') {
      const state = await this.hierarchyRepo.findStateById(data.stateId!);
      if (!state) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Specified state does not exist.', 400);
      }
    } else if (data.scopeLevel === 'DIVISION') {
      const division = await this.hierarchyRepo.findDivisionById(data.divisionId!);
      if (!division) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Specified division does not exist.', 400);
      }
      if (data.stateId && division.stateId !== data.stateId) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Division does not belong to the specified state.', 400);
      }
      const state = await this.hierarchyRepo.findStateById(division.stateId);
      if (!state) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Parent state for division does not exist.', 400);
      }
    } else if (data.scopeLevel === 'SALES_AREA') {
      const salesArea = await this.hierarchyRepo.findSalesAreaById(data.salesAreaId!);
      if (!salesArea) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Specified sales area does not exist.', 400);
      }
      if (data.divisionId && salesArea.divisionId !== data.divisionId) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Sales area does not belong to the specified division.', 400);
      }
      const division = await this.hierarchyRepo.findDivisionById(salesArea.divisionId);
      if (!division) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Parent division for sales area does not exist.', 400);
      }
      if (data.stateId && division.stateId !== data.stateId) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Division does not belong to the specified state.', 400);
      }
      const state = await this.hierarchyRepo.findStateById(division.stateId);
      if (!state) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Parent state for division does not exist.', 400);
      }
    } else if (data.scopeLevel === 'OUTLET') {
      const outlet = await this.outletRepo.findById(data.outletId!);
      if (!outlet) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Specified outlet does not exist.', 400);
      }
      if (data.salesAreaId && outlet.salesAreaId !== data.salesAreaId) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Outlet does not belong to the specified sales area.', 400);
      }
      if (data.divisionId && outlet.divisionId !== data.divisionId) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Outlet does not belong to the specified division.', 400);
      }
      if (data.stateId && outlet.stateId !== data.stateId) {
        throw new OrgError('INVALID_ORG_HIERARCHY', 'Outlet does not belong to the specified state.', 400);
      }
    }

    const now = new Date().toISOString();
    const id = `post-${uuidv4()}`;
    const record = await this.repo.createOfficerPosting({
      id,
      officerId,
      scopeLevel: data.scopeLevel,
      stateId: data.stateId || null,
      divisionId: data.divisionId || null,
      salesAreaId: data.salesAreaId || null,
      outletId: data.outletId || null,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo || null,
      isPrimary: data.isPrimary ? 1 : 0,
      status: data.status,
      notes: data.notes || null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'ORG_OFFICER_POSTING_CREATED',
      entityType: 'ORG_OFFICER_POSTING',
      entityId: id,
      newValue: record,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return record;
  }

  async updateOfficerPosting(postingId: string, input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const posting = await this.repo.getPostingById(postingId);
    if (!posting) {
      throw new OrgError('POSTING_NOT_FOUND', 'Officer posting not found', 404);
    }

    const parsed = OfficerPostingUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid posting update data', 400);
    }
    const data = parsed.data;

    // Calendar logic verification
    const effectiveFrom = posting.effectiveFrom;
    const effectiveTo = data.effectiveTo !== undefined ? data.effectiveTo : posting.effectiveTo;
    if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) {
      throw new OrgError('VALIDATION_ERROR', 'effectiveFrom must be on or before effectiveTo', 400);
    }

    const now = new Date().toISOString();
    const updatePayload: any = { updatedAt: now };
    if (data.effectiveTo !== undefined) updatePayload.effectiveTo = data.effectiveTo;
    if (data.isPrimary !== undefined) updatePayload.isPrimary = data.isPrimary ? 1 : 0;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.notes !== undefined) updatePayload.notes = data.notes;

    const updated = await this.repo.updateOfficerPosting(postingId, updatePayload);

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'ORG_OFFICER_POSTING_UPDATED',
      entityType: 'ORG_OFFICER_POSTING',
      entityId: postingId,
      oldValue: posting,
      newValue: updated,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Service Providers
  // -------------------------------------------------------------------------
  async listServiceProviders(status?: string) {
    return this.repo.listServiceProviders(status);
  }

  async createServiceProvider(input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const parsed = ServiceProviderCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid service provider data', 400);
    }
    const data = parsed.data;

    const existing = (await this.repo.listServiceProviders()).find(sp => sp.providerCode === data.providerCode);
    if (existing) {
      throw new OrgError('DUPLICATE_SERVICE_PROVIDER_CODE', `Service provider with code '${data.providerCode}' already exists`, 409);
    }

    const now = new Date().toISOString();
    const id = `sp-${uuidv4()}`;
    const record = await this.repo.createServiceProvider({
      id,
      providerCode: data.providerCode,
      providerName: data.providerName,
      proprietorOrAuthorizedPerson: data.proprietorOrAuthorizedPerson || null,
      contactPerson: data.contactPerson || null,
      phone: data.phone || null,
      alternatePhone: data.alternatePhone || null,
      email: data.email || null,
      gstin: data.gstin || null,
      pan: data.pan || null,
      address: data.address || null,
      city: data.city || null,
      district: data.district || null,
      stateText: data.stateText || null,
      pincode: data.pincode || null,
      status: data.status,
      notes: data.notes || null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'SERVICE_PROVIDER_CREATED',
      entityType: 'SERVICE_PROVIDER',
      entityId: id,
      newValue: record,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return record;
  }

  async updateServiceProvider(id: string, input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const sp = await this.repo.getServiceProviderById(id);
    if (!sp) {
      throw new OrgError('SERVICE_PROVIDER_NOT_FOUND', 'Service provider not found', 404);
    }

    const parsed = ServiceProviderUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid service provider update data', 400);
    }
    const data = parsed.data;
    const now = new Date().toISOString();

    const updated = await this.repo.updateServiceProvider(id, {
      ...data,
      updatedAt: now,
    });

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'SERVICE_PROVIDER_UPDATED',
      entityType: 'SERVICE_PROVIDER',
      entityId: id,
      oldValue: sp,
      newValue: updated,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Outlet Service Provider Assignments
  // -------------------------------------------------------------------------
  async listOutletServiceProviders(outletId: string) {
    return this.repo.listOutletServiceProviders(outletId);
  }

  async assignServiceProviderToOutlet(outletId: string, input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const parsed = OutletServiceProviderAssignmentCreateSchema.safeParse({ ...(input as any), outletId });
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid assignment data', 400);
    }
    const data = parsed.data;

    const sp = await this.repo.getServiceProviderById(data.serviceProviderId);
    if (!sp) {
      throw new OrgError('SERVICE_PROVIDER_NOT_FOUND', 'Service provider not found', 404);
    }

    // Inactive Service Provider Guard
    if (sp.status !== 'ACTIVE') {
      throw new OrgError('SERVICE_PROVIDER_INACTIVE', 'Cannot assign inactive service provider to outlet.', 409);
    }

    const now = new Date().toISOString();
    const id = `osp-${uuidv4()}`;
    const record = await this.repo.assignServiceProviderToOutlet({
      id,
      outletId,
      serviceProviderId: data.serviceProviderId,
      serviceType: data.serviceType,
      contractNumber: data.contractNumber || null,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo || null,
      status: data.status,
      notes: data.notes || null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'OUTLET_SERVICE_PROVIDER_ASSIGNED',
      entityType: 'OUTLET_SERVICE_PROVIDER_ASSIGNMENT',
      entityId: id,
      newValue: record,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return record;
  }

  async updateOutletServiceProviderAssignment(assignmentId: string, input: unknown, userId: string, auditCtx?: AuditContext) {
    this.ensureActor(userId);
    const assignment = await this.repo.getAssignmentById(assignmentId);
    if (!assignment) {
      throw new OrgError('ASSIGNMENT_NOT_FOUND', 'Outlet service provider assignment not found', 404);
    }

    const parsed = OutletServiceProviderAssignmentUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrgError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid assignment update data', 400);
    }
    const data = parsed.data;

    // Calendar logic verification
    const effectiveFrom = assignment.effectiveFrom;
    const effectiveTo = data.effectiveTo !== undefined ? data.effectiveTo : assignment.effectiveTo;
    if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) {
      throw new OrgError('VALIDATION_ERROR', 'effectiveFrom must be on or before effectiveTo', 400);
    }

    const now = new Date().toISOString();

    const updated = await this.repo.updateAssignment(assignmentId, {
      ...data,
      updatedAt: now,
    });

    await this.auditRepo.logAction({
      id: `audit-${uuidv4()}`,
      userId,
      action: 'OUTLET_SERVICE_PROVIDER_ASSIGNMENT_UPDATED',
      entityType: 'OUTLET_SERVICE_PROVIDER_ASSIGNMENT',
      entityId: assignmentId,
      oldValue: assignment,
      newValue: updated,
      ipAddress: auditCtx?.ipAddress ?? null,
      userAgent: auditCtx?.userAgent ?? null,
      createdAt: now,
    });

    return updated;
  }
}
