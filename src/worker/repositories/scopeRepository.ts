import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { UserScopeAssignment, ScopeLevel } from '../../shared/types';
import { OutletRepository } from './outletRepository';

export class ScopeRepository {
  constructor(private db: AppDatabase) {}

  async getUserScopesByUserIds(
    userIds: string[],
    options?: { includeArchived?: boolean }
  ): Promise<Map<string, UserScopeAssignment[]>> {
    const map = new Map<string, UserScopeAssignment[]>();
    for (const uid of userIds) {
      map.set(uid, []);
    }
    if (userIds.length === 0) return map;

    const res = await this.db
      .select({
        usa: schema.userScopeAssignments,
        userName: schema.users.name,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
        outletName: schema.retailOutlets.name,
        outlet: schema.retailOutlets,
      })
      .from(schema.userScopeAssignments)
      .innerJoin(schema.users, eq(schema.userScopeAssignments.userId, schema.users.id))
      .leftJoin(schema.states, eq(schema.userScopeAssignments.stateId, schema.states.id))
      .leftJoin(schema.divisions, eq(schema.userScopeAssignments.divisionId, schema.divisions.id))
      .leftJoin(schema.salesAreas, eq(schema.userScopeAssignments.salesAreaId, schema.salesAreas.id))
      .leftJoin(schema.retailOutlets, eq(schema.userScopeAssignments.outletId, schema.retailOutlets.id))
      .where(inArray(schema.userScopeAssignments.userId, userIds));

    const filtered = options?.includeArchived
      ? res
      : res.filter(r => {
          if (r.usa.scopeLevel === 'OUTLET') {
            return Boolean(r.outlet && !OutletRepository.isOutletArchived(r.outlet));
          }
          return true;
        });

    for (const r of filtered) {
      const item: UserScopeAssignment = {
        id: r.usa.id,
        userId: r.usa.userId,
        scopeLevel: r.usa.scopeLevel as ScopeLevel,
        stateId: r.usa.stateId,
        divisionId: r.usa.divisionId,
        salesAreaId: r.usa.salesAreaId,
        outletId: r.usa.outletId,
        createdAt: r.usa.createdAt,
        createdBy: r.usa.createdBy,
        userName: r.userName,
        stateName: r.stateName ?? undefined,
        divisionName: r.divisionName ?? undefined,
        salesAreaName: r.salesAreaName ?? undefined,
        outletName: r.outletName ?? undefined,
      };
      const list = map.get(r.usa.userId);
      if (list) {
        list.push(item);
      } else {
        map.set(r.usa.userId, [item]);
      }
    }

    return map;
  }

  async getUserScopes(userId: string, options?: { includeArchived?: boolean }): Promise<UserScopeAssignment[]> {
    const res = await this.db
      .select({
        usa: schema.userScopeAssignments,
        userName: schema.users.name,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
        outletName: schema.retailOutlets.name,
        outlet: schema.retailOutlets,
      })
      .from(schema.userScopeAssignments)
      .innerJoin(schema.users, eq(schema.userScopeAssignments.userId, schema.users.id))
      .leftJoin(schema.states, eq(schema.userScopeAssignments.stateId, schema.states.id))
      .leftJoin(schema.divisions, eq(schema.userScopeAssignments.divisionId, schema.divisions.id))
      .leftJoin(schema.salesAreas, eq(schema.userScopeAssignments.salesAreaId, schema.salesAreas.id))
      .leftJoin(schema.retailOutlets, eq(schema.userScopeAssignments.outletId, schema.retailOutlets.id))
      .where(eq(schema.userScopeAssignments.userId, userId));

    const filtered = options?.includeArchived
      ? res
      : res.filter(r => {
          if (r.usa.scopeLevel === 'OUTLET') {
            return Boolean(r.outlet && !OutletRepository.isOutletArchived(r.outlet));
          }
          return true;
        });

    return filtered.map(r => ({
      id: r.usa.id,
      userId: r.usa.userId,
      scopeLevel: r.usa.scopeLevel as ScopeLevel,
      stateId: r.usa.stateId,
      divisionId: r.usa.divisionId,
      salesAreaId: r.usa.salesAreaId,
      outletId: r.usa.outletId,
      createdAt: r.usa.createdAt,
      createdBy: r.usa.createdBy,
      userName: r.userName,
      stateName: r.stateName ?? undefined,
      divisionName: r.divisionName ?? undefined,
      salesAreaName: r.salesAreaName ?? undefined,
      outletName: r.outletName ?? undefined,
    }));
  }

  async listAllScopes(options?: { includeArchived?: boolean }): Promise<UserScopeAssignment[]> {
    const res = await this.db
      .select({
        usa: schema.userScopeAssignments,
        userName: schema.users.name,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
        outletName: schema.retailOutlets.name,
        outlet: schema.retailOutlets,
      })
      .from(schema.userScopeAssignments)
      .innerJoin(schema.users, eq(schema.userScopeAssignments.userId, schema.users.id))
      .leftJoin(schema.states, eq(schema.userScopeAssignments.stateId, schema.states.id))
      .leftJoin(schema.divisions, eq(schema.userScopeAssignments.divisionId, schema.divisions.id))
      .leftJoin(schema.salesAreas, eq(schema.userScopeAssignments.salesAreaId, schema.salesAreas.id))
      .leftJoin(schema.retailOutlets, eq(schema.userScopeAssignments.outletId, schema.retailOutlets.id));

    const filtered = options?.includeArchived
      ? res
      : res.filter(r => {
          if (r.usa.scopeLevel === 'OUTLET') {
            return Boolean(r.outlet && !OutletRepository.isOutletArchived(r.outlet));
          }
          return true;
        });

    return filtered.map(r => ({
      id: r.usa.id,
      userId: r.usa.userId,
      scopeLevel: r.usa.scopeLevel as ScopeLevel,
      stateId: r.usa.stateId,
      divisionId: r.usa.divisionId,
      salesAreaId: r.usa.salesAreaId,
      outletId: r.usa.outletId,
      createdAt: r.usa.createdAt,
      createdBy: r.usa.createdBy,
      userName: r.userName,
      stateName: r.stateName ?? undefined,
      divisionName: r.divisionName ?? undefined,
      salesAreaName: r.salesAreaName ?? undefined,
      outletName: r.outletName ?? undefined,
    }));
  }

  async createScopeAssignment(data: {
    id: string;
    userId: string;
    scopeLevel: ScopeLevel;
    stateId?: string | null;
    divisionId?: string | null;
    salesAreaId?: string | null;
    outletId?: string | null;
    createdAt: string;
    createdBy: string;
  }): Promise<UserScopeAssignment> {
    await this.db.insert(schema.userScopeAssignments).values({
      id: data.id,
      userId: data.userId,
      scopeLevel: data.scopeLevel,
      stateId: data.stateId ?? null,
      divisionId: data.divisionId ?? null,
      salesAreaId: data.salesAreaId ?? null,
      outletId: data.outletId ?? null,
      createdAt: data.createdAt,
      createdBy: data.createdBy,
    });

    const userScopes = await this.getUserScopes(data.userId);
    const created = userScopes.find(s => s.id === data.id);
    if (!created) {
      return {
        id: data.id,
        userId: data.userId,
        scopeLevel: data.scopeLevel,
        stateId: data.stateId ?? null,
        divisionId: data.divisionId ?? null,
        salesAreaId: data.salesAreaId ?? null,
        outletId: data.outletId ?? null,
        createdAt: data.createdAt,
        createdBy: data.createdBy,
      };
    }
    return created;
  }

  async deleteScopeAssignment(id: string): Promise<void> {
    await this.db
      .delete(schema.userScopeAssignments)
      .where(eq(schema.userScopeAssignments.id, id));
  }
}
