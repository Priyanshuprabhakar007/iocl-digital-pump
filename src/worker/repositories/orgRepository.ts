import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import {
  orgDepartments,
  orgOfficers,
  orgOfficerPostings,
  serviceProviders,
  outletServiceProviderAssignments,
} from '../../db/schema';

export class OrgRepository {
  constructor(private db: AppDatabase) {}

  // Departments
  async listDepartments(): Promise<any[]> {
    return this.db.select().from(orgDepartments).orderBy(asc(orgDepartments.code)).all();
  }

  async getDepartmentById(id: string): Promise<any | undefined> {
    return this.db.select().from(orgDepartments).where(eq(orgDepartments.id, id)).get();
  }

  async createDepartment(data: any): Promise<any> {
    await this.db.insert(orgDepartments).values(data).run();
    return this.getDepartmentById(data.id);
  }

  async updateDepartment(id: string, data: any): Promise<any> {
    await this.db.update(orgDepartments).set(data).where(eq(orgDepartments.id, id)).run();
    return this.getDepartmentById(id);
  }

  // Officers
  async listOfficers(departmentId?: string): Promise<any[]> {
    const conditions = departmentId ? [eq(orgOfficers.departmentId, departmentId)] : [];
    return this.db.select().from(orgOfficers).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(orgOfficers.employeeCode)).all();
  }

  async getOfficerById(id: string): Promise<any | undefined> {
    return this.db.select().from(orgOfficers).where(eq(orgOfficers.id, id)).get();
  }

  async createOfficer(data: any): Promise<any> {
    await this.db.insert(orgOfficers).values(data).run();
    return this.getOfficerById(data.id);
  }

  async updateOfficer(id: string, data: any): Promise<any> {
    await this.db.update(orgOfficers).set(data).where(eq(orgOfficers.id, id)).run();
    return this.getOfficerById(id);
  }

  // Officer Postings
  async listOfficerPostings(officerId?: string): Promise<any[]> {
    const conditions = officerId ? [eq(orgOfficerPostings.officerId, officerId)] : [];
    return this.db.select().from(orgOfficerPostings).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(orgOfficerPostings.createdAt)).all();
  }

  async getPostingById(id: string): Promise<any | undefined> {
    return this.db.select().from(orgOfficerPostings).where(eq(orgOfficerPostings.id, id)).get();
  }

  async createOfficerPosting(data: any): Promise<any> {
    await this.db.insert(orgOfficerPostings).values(data).run();
    return this.getPostingById(data.id);
  }

  async updateOfficerPosting(id: string, data: any): Promise<any> {
    await this.db.update(orgOfficerPostings).set(data).where(eq(orgOfficerPostings.id, id)).run();
    return this.getPostingById(id);
  }

  // Service Providers
  async listServiceProviders(status?: string): Promise<any[]> {
    const conditions = status ? [eq(serviceProviders.status, status as any)] : [];
    return this.db.select().from(serviceProviders).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(serviceProviders.providerCode)).all();
  }

  async getServiceProviderById(id: string): Promise<any | undefined> {
    return this.db.select().from(serviceProviders).where(eq(serviceProviders.id, id)).get();
  }

  async createServiceProvider(data: any): Promise<any> {
    await this.db.insert(serviceProviders).values(data).run();
    return this.getServiceProviderById(data.id);
  }

  async updateServiceProvider(id: string, data: any): Promise<any> {
    await this.db.update(serviceProviders).set(data).where(eq(serviceProviders.id, id)).run();
    return this.getServiceProviderById(id);
  }

  // Outlet Service Provider Assignments
  async listOutletServiceProviders(outletId: string): Promise<any[]> {
    return this.db.select().from(outletServiceProviderAssignments).where(eq(outletServiceProviderAssignments.outletId, outletId)).all();
  }

  async getAssignmentById(id: string): Promise<any | undefined> {
    return this.db.select().from(outletServiceProviderAssignments).where(eq(outletServiceProviderAssignments.id, id)).get();
  }

  async assignServiceProviderToOutlet(data: any): Promise<any> {
    await this.db.insert(outletServiceProviderAssignments).values(data).run();
    return this.getAssignmentById(data.id);
  }

  async updateAssignment(id: string, data: any): Promise<any> {
    await this.db.update(outletServiceProviderAssignments).set(data).where(eq(outletServiceProviderAssignments.id, id)).run();
    return this.getAssignmentById(id);
  }
}
