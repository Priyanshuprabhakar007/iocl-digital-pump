import { AppDatabase } from '../../db';
import { OrgRepository } from '../repositories/orgRepository';
import { v4 as uuidv4 } from 'uuid';

export class OrgError extends Error {
  constructor(public code: string, message: string, public status: number = 400) {
    super(message);
    this.name = 'OrgError';
  }
}

export class OrgService {
  private repo: OrgRepository;

  constructor(db: AppDatabase) {
    this.repo = new OrgRepository(db);
  }

  async listDepartments() {
    return this.repo.listDepartments();
  }

  async createDepartment(data: { code: string; name: string }, userId: string) {
    if (!data.code || !data.name) {
      throw new OrgError('VALIDATION_ERROR', 'Department code and name are required', 400);
    }
    const existing = (await this.repo.listDepartments()).find(d => d.code === data.code);
    if (existing) {
      throw new OrgError('DUPLICATE_DEPARTMENT_CODE', `Department with code '${data.code}' already exists`, 409);
    }

    const now = new Date().toISOString();
    return this.repo.createDepartment({
      id: `dept-${uuidv4()}`,
      code: data.code.trim(),
      name: data.name.trim(),
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  }

  async listOfficers(departmentId?: string) {
    return this.repo.listOfficers(departmentId);
  }

  async createOfficer(data: { officerCode: string; name: string; email: string; phone: string; departmentId: string }, userId: string) {
    if (!data.officerCode || !data.name || !data.email || !data.phone || !data.departmentId) {
      throw new OrgError('VALIDATION_ERROR', 'All officer fields are required', 400);
    }
    const dept = await this.repo.getDepartmentById(data.departmentId);
    if (!dept) {
      throw new OrgError('DEPARTMENT_NOT_FOUND', 'Specified department does not exist', 404);
    }

    const existing = (await this.repo.listOfficers()).find(o => o.officerCode === data.officerCode || o.email === data.email);
    if (existing) {
      throw new OrgError('DUPLICATE_OFFICER', 'Officer with code or email already exists', 409);
    }

    const now = new Date().toISOString();
    return this.repo.createOfficer({
      id: `off-${uuidv4()}`,
      officerCode: data.officerCode.trim(),
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      departmentId: data.departmentId,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  }

  async listServiceProviders(serviceType?: string) {
    return this.repo.listServiceProviders(serviceType);
  }

  async createServiceProvider(data: { code: string; name: string; serviceType: string; contactName?: string; phone?: string; email?: string }, userId: string) {
    if (!data.code || !data.name || !data.serviceType) {
      throw new OrgError('VALIDATION_ERROR', 'Service provider code, name and serviceType are required', 400);
    }
    const existing = (await this.repo.listServiceProviders()).find(sp => sp.code === data.code);
    if (existing) {
      throw new OrgError('DUPLICATE_SERVICE_PROVIDER_CODE', `Service provider with code '${data.code}' already exists`, 409);
    }

    const now = new Date().toISOString();
    return this.repo.createServiceProvider({
      id: `sp-${uuidv4()}`,
      code: data.code.trim(),
      name: data.name.trim(),
      serviceType: data.serviceType.trim(),
      contactName: data.contactName?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  }

  async assignServiceProviderToOutlet(data: { outletId: string; serviceProviderId: string; contractReference?: string; effectiveFrom: string; effectiveTo?: string }, userId: string) {
    if (!data.outletId || !data.serviceProviderId || !data.effectiveFrom) {
      throw new OrgError('VALIDATION_ERROR', 'outletId, serviceProviderId, and effectiveFrom are required', 400);
    }
    const sp = await this.repo.getServiceProviderById(data.serviceProviderId);
    if (!sp) {
      throw new OrgError('SERVICE_PROVIDER_NOT_FOUND', 'Service provider not found', 404);
    }

    const now = new Date().toISOString();
    return this.repo.assignServiceProviderToOutlet({
      id: `osp-${uuidv4()}`,
      outletId: data.outletId,
      serviceProviderId: data.serviceProviderId,
      contractReference: data.contractReference?.trim() || null,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo || null,
      isActive: true,
      createdAt: now,
      createdBy: userId,
    });
  }
}
