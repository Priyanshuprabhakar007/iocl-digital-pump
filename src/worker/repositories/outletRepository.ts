import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, inArray, or } from 'drizzle-orm';
import { RetailOutlet, OutletUserAssignment } from '../../shared/types';

export class OutletRepository {
  constructor(private db: AppDatabase) {}

  static isOutletArchived(outlet: any): boolean {
    if (!outlet) return false;
    return (
      outlet.lifecycleStatus === 'ARCHIVED' ||
      Boolean(outlet.isArchived) ||
      Boolean(outlet.directoryHidden)
    );
  }

  async listAllOutlets(options?: { includeArchived?: boolean }): Promise<RetailOutlet[]> {
    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id));

    const mapped = res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));

    if (options?.includeArchived) {
      return mapped;
    }
    return mapped.filter(o => !OutletRepository.isOutletArchived(o));
  }

  async findOutletsByIds(outletIds: string[], options?: { includeArchived?: boolean }): Promise<RetailOutlet[]> {
    if (outletIds.length === 0) return [];

    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(inArray(schema.retailOutlets.id, outletIds));

    const mapped = res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));

    if (options?.includeArchived) {
      return mapped;
    }
    return mapped.filter(o => !OutletRepository.isOutletArchived(o));
  }

  async findOutletsByStateIds(stateIds: string[], options?: { includeArchived?: boolean }): Promise<RetailOutlet[]> {
    if (stateIds.length === 0) return [];

    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(inArray(schema.retailOutlets.stateId, stateIds));

    const mapped = res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));

    if (options?.includeArchived) {
      return mapped;
    }
    return mapped.filter(o => !OutletRepository.isOutletArchived(o));
  }

  async findOutletsByDivisionIds(divisionIds: string[], options?: { includeArchived?: boolean }): Promise<RetailOutlet[]> {
    if (divisionIds.length === 0) return [];

    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(inArray(schema.retailOutlets.divisionId, divisionIds));

    const mapped = res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));

    if (options?.includeArchived) {
      return mapped;
    }
    return mapped.filter(o => !OutletRepository.isOutletArchived(o));
  }

  async findOutletsBySalesAreaIds(salesAreaIds: string[], options?: { includeArchived?: boolean }): Promise<RetailOutlet[]> {
    if (salesAreaIds.length === 0) return [];

    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(inArray(schema.retailOutlets.salesAreaId, salesAreaIds));

    const mapped = res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));

    if (options?.includeArchived) {
      return mapped;
    }
    return mapped.filter(o => !OutletRepository.isOutletArchived(o));
  }

  async findById(id: string): Promise<RetailOutlet | null> {
    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(eq(schema.retailOutlets.id, id))
      .limit(1);

    if (res.length === 0) return null;
    return {
      ...res[0].outlet,
      stateName: res[0].stateName,
      divisionName: res[0].divisionName,
      salesAreaName: res[0].salesAreaName,
    };
  }

  async findByIdOrCode(idOrCode: string): Promise<RetailOutlet | null> {
    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(or(eq(schema.retailOutlets.id, idOrCode), eq(schema.retailOutlets.roCode, idOrCode)))
      .limit(1);

    if (res.length === 0) return null;
    return {
      ...res[0].outlet,
      stateName: res[0].stateName,
      divisionName: res[0].divisionName,
      salesAreaName: res[0].salesAreaName,
    };
  }

  async createOutlet(data: {
    id: string;
    roCode: string;
    name: string;
    outletType: 'COCO' | 'CODO' | 'A_SITE';
    stateId: string;
    divisionId: string;
    salesAreaId: string;
    address: string;
    city: string;
    district: string;
    pincode: string;
    latitude?: number | null;
    longitude?: number | null;
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
    updatedAt: string;
  }): Promise<RetailOutlet> {
    await this.db.insert(schema.retailOutlets).values({
      id: data.id,
      roCode: data.roCode,
      name: data.name,
      outletType: data.outletType,
      stateId: data.stateId,
      divisionId: data.divisionId,
      salesAreaId: data.salesAreaId,
      address: data.address,
      city: data.city,
      district: data.district,
      pincode: data.pincode,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });

    const created = await this.findById(data.id);
    if (!created) throw new Error('Failed to create retail outlet');
    return created;
  }

  async updateOutlet(id: string, data: Partial<{
    name: string;
    outletType: 'COCO' | 'CODO' | 'A_SITE';
    stateId: string;
    divisionId: string;
    salesAreaId: string;
    address: string;
    city: string;
    district: string;
    pincode: string;
    latitude: number | null;
    longitude: number | null;
    status: 'ACTIVE' | 'INACTIVE';
    directoryHidden: boolean;
    directoryHiddenAt: string | null;
    directoryHiddenBy: string | null;
    lifecycleStatus: 'ACTIVE' | 'ARCHIVED';
    isArchived: boolean;
    archivedAt: string | null;
    archivedBy: string | null;
    updatedAt: string;
  }>): Promise<void> {
    await this.db
      .update(schema.retailOutlets)
      .set(data)
      .where(eq(schema.retailOutlets.id, id));
  }

  async archiveOutlet(id: string, userId: string, nowIso: string): Promise<RetailOutlet | null> {
    await this.updateOutlet(id, {
      directoryHidden: true,
      directoryHiddenAt: nowIso,
      directoryHiddenBy: userId,
      lifecycleStatus: 'ARCHIVED',
      isArchived: true,
      archivedAt: nowIso,
      archivedBy: userId,
      updatedAt: nowIso,
    });
    return this.findById(id);
  }

  async restoreOutlet(id: string, nowIso?: string): Promise<RetailOutlet | null> {
    const ts = nowIso || new Date().toISOString();
    await this.updateOutlet(id, {
      directoryHidden: false,
      directoryHiddenAt: null,
      directoryHiddenBy: null,
      lifecycleStatus: 'ACTIVE',
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      updatedAt: ts,
    });
    return this.findById(id);
  }

  async createOutletUserAssignment(data: {
    id: string;
    outletId: string;
    userId: string;
    assignmentType: 'DEALER' | 'CSP' | 'INSPECTOR';
    effectiveFrom: string;
    effectiveTo?: string | null;
    isActive: boolean;
    createdAt: string;
    createdBy: string;
  }): Promise<OutletUserAssignment> {
    await this.db.insert(schema.outletUserAssignments).values({
      id: data.id,
      outletId: data.outletId,
      userId: data.userId,
      assignmentType: data.assignmentType,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
      isActive: data.isActive,
      createdAt: data.createdAt,
      createdBy: data.createdBy,
    });

    return {
      id: data.id,
      outletId: data.outletId,
      userId: data.userId,
      assignmentType: data.assignmentType,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
      isActive: data.isActive,
      createdAt: data.createdAt,
      createdBy: data.createdBy,
    };
  }

  async listOutletAssignments(outletId: string, options?: { includeArchived?: boolean }): Promise<OutletUserAssignment[]> {
    const outlet = await this.findById(outletId);
    if (!outlet) return [];
    if (!options?.includeArchived && OutletRepository.isOutletArchived(outlet)) {
      return [];
    }

    const res = await this.db
      .select({
        assignment: schema.outletUserAssignments,
        userName: schema.users.name,
        userEmail: schema.users.email,
        userEmpCode: schema.users.empCode,
      })
      .from(schema.outletUserAssignments)
      .innerJoin(schema.users, eq(schema.outletUserAssignments.userId, schema.users.id))
      .where(eq(schema.outletUserAssignments.outletId, outletId));

    return res.map(r => ({
      ...r.assignment,
      userName: r.userName,
      userEmail: r.userEmail,
      userEmpCode: r.userEmpCode,
    }));
  }

  async listOutletAssignmentsByOutletIds(
    outletIds: string[]
  ): Promise<Map<string, OutletUserAssignment[]>> {
    const map = new Map<string, OutletUserAssignment[]>();
    for (const id of outletIds) {
      map.set(id, []);
    }
    if (outletIds.length === 0) return map;

    const res = await this.db
      .select({
        assignment: schema.outletUserAssignments,
        userName: schema.users.name,
        userEmail: schema.users.email,
        userEmpCode: schema.users.empCode,
      })
      .from(schema.outletUserAssignments)
      .innerJoin(schema.users, eq(schema.outletUserAssignments.userId, schema.users.id))
      .where(inArray(schema.outletUserAssignments.outletId, outletIds));

    for (const r of res) {
      const item = {
        ...r.assignment,
        userName: r.userName,
        userEmail: r.userEmail,
        userEmpCode: r.userEmpCode,
      } as any;
      const list = map.get(r.assignment.outletId);
      if (list) {
        list.push(item);
      } else {
        map.set(r.assignment.outletId, [item]);
      }
    }

    return map;
  }

  async getUserOutletAssignments(userId: string, options?: { includeArchived?: boolean }): Promise<OutletUserAssignment[]> {
    const res = await this.db
      .select({
        assignment: schema.outletUserAssignments,
        outlet: schema.retailOutlets,
      })
      .from(schema.outletUserAssignments)
      .innerJoin(schema.retailOutlets, eq(schema.outletUserAssignments.outletId, schema.retailOutlets.id))
      .where(eq(schema.outletUserAssignments.userId, userId));

    const activeRows = res.filter(r => r.assignment.isActive);
    if (options?.includeArchived) {
      return activeRows.map(r => r.assignment);
    }
    return activeRows
      .filter(r => !OutletRepository.isOutletArchived(r.outlet))
      .map(r => r.assignment);
  }
}
