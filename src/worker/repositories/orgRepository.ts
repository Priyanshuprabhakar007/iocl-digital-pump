import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { AppDatabase } from '../../db';
import {
  departments,
  officers,
  officerPostings,
  serviceProviders,
  outletServiceProviderAssignments,
} from '../../db/schema';

export class OrgRepository {
  constructor(private db: AppDatabase) {}

  // Departments
  async listDepartments(): Promise<any[]> {
    return this.db.select().from(departments).orderBy(asc(departments.code)).all();
  }

  async getDepartmentById(id: string): Promise<any | undefined> {
    return this.db.select().from(departments).where(eq(departments.id, id)).get();
  }

  async createDepartment(data: any): Promise<any> {
    await this.db.insert(departments).values(data).run();
    return this.getDepartmentById(data.id);
  }

  async updateDepartment(id: string, data: any): Promise<any> {
    await this.db.update(departments).set(data).where(eq(departments.id, id)).run();
    return this.getDepartmentById(id);
  }

  // Officers
  async listOfficers(departmentId?: string): Promise<any[]> {
    const conditions = departmentId ? [eq(officers.departmentId, departmentId)] : [];
    return this.db.select().from(officers).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(officers.officerCode)).all();
  }

  async getOfficerById(id: string): Promise<any | undefined> {
    return this.db.select().from(officers).where(eq(officers.id, id)).get();
  }

  async createOfficer(data: any): Promise<any> {
    await this.db.insert(officers).values(data).run();
    return this.getOfficerById(data.id);
  }

  async updateOfficer(id: string, data: any): Promise<any> {
    await this.db.update(officers).set(data).where(eq(officers.id, id)).run();
    return this.getOfficerById(id);
  }

  // Officer Postings
  async listOfficerPostings(officerId?: string): Promise<any[]> {
    const conditions = officerId ? [eq(officerPostings.officerId, officerId)] : [];
    return this.db.select().from(officerPostings).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(officerPostings.createdAt)).all();
  }

  async createOfficerPosting(data: any): Promise<any> {
    await this.db.insert(officerPostings).values(data).run();
    return this.db.select().from(officerPostings).where(eq(officerPostings.id, data.id)).get();
  }

  // Service Providers
  async listServiceProviders(serviceType?: string): Promise<any[]> {
    const conditions = serviceType ? [eq(serviceProviders.serviceType, serviceType)] : [];
    return this.db.select().from(serviceProviders).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(serviceProviders.code)).all();
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

  async assignServiceProviderToOutlet(data: any): Promise<any> {
    await this.db.insert(outletServiceProviderAssignments).values(data).run();
    return this.db.select().from(outletServiceProviderAssignments).where(eq(outletServiceProviderAssignments.id, data.id)).get();
  }
}
