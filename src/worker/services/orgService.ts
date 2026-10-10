import { AppDatabase } from '../../db';
import { OrgRepository } from '../repositories/orgRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from './scopeService';
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

export class OrgService {
  private repo: OrgRepository;
  private auditRepo: AuditRepository;

  constructor(db: AppDatabase) {
    this.repo = new OrgRepository(db);
    this.auditRepo = new AuditRepository(db);
  }

  private ensureActor(userId?: string) {
    if (!userId) {
      throw new OrgError('UNAUTHORIZED_ACTOR', 'Authenticated actor user ID is required for organization master modifications.', 401);
    }
  }

  // Departments
  async listDepartments() {
    return this.repo.listDepartments();
  }

  async createDepartment(input: unknown, userId: string) {
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
      createdAt: now,
    });

    return record;
  }

  async updateDepartment(id: string, input: unknown, userId: string) {
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
      createdAt: now,
    });

    return updated;
  }

  // Officers
  async listOfficers(departmentId?: string) {
    return this.repo.listOfficers(departmentId);
  }

  async createOfficer(input: unknown, userId: string) {
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
      createdAt: now,
    });

    return record;
  }

  async updateOfficer(id: string, input: unknown, userId: string) {
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
      createdAt: now,
    });

    return updated;
  }

  // Officer Postings
  async listOfficerPostings(officerId?: string) {
    return this.repo.listOfficerPostings(officerId);
  }

  async getPostingById(id: string) {
    return this.repo.getPostingById(id);
  }

  async getAssignmentById(id: string) {
    return this.repo.getAssignmentById(id);
  }

  async createOfficerPosting(officerId: string, input: unknown, userId: string) {
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
      createdAt: now,
    });

    return record;
  }

  async updateOfficerPosting(postingId: string, input: unknown, userId: string) {
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
      createdAt: now,
    });

    return updated;
  }

  // Service Providers
  async listServiceProviders(status?: string) {
    return this.repo.listServiceProviders(status);
  }

  async createServiceProvider(input: unknown, userId: string) {
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
      createdAt: now,
    });

    return record;
  }

  async updateServiceProvider(id: string, input: unknown, userId: string) {
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
      createdAt: now,
    });

    return updated;
  }

  // Outlet Service Provider Assignments
  async listOutletServiceProviders(outletId: string) {
    return this.repo.listOutletServiceProviders(outletId);
  }

  async assignServiceProviderToOutlet(outletId: string, input: unknown, userId: string) {
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
      createdAt: now,
    });

    return record;
  }

  async updateOutletServiceProviderAssignment(assignmentId: string, input: unknown, userId: string) {
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
      createdAt: now,
    });

    return updated;
  }
}
