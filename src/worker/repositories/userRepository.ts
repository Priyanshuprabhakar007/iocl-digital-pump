import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { User, RoleCode, PermissionCode } from '../../shared/types';

export class UserRepository {
  constructor(private db: AppDatabase) {}

  async findByEmail(email: string): Promise<User | null> {
    const res = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase().trim()))
      .limit(1);

    if (res.length === 0) return null;

    const u = res[0];
    return {
      id: u.id,
      empCode: u.empCode,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  async findPasswordHashByEmail(email: string): Promise<{ user: User; passwordHash: string } | null> {
    const res = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase().trim()))
      .limit(1);

    if (res.length === 0) return null;

    const u = res[0];
    return {
      user: {
        id: u.id,
        empCode: u.empCode,
        name: u.name,
        email: u.email,
        phone: u.phone,
        status: u.status,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
      passwordHash: u.passwordHash,
    };
  }

  async findById(id: string): Promise<User | null> {
    const res = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    if (res.length === 0) return null;

    const u = res[0];
    return {
      id: u.id,
      empCode: u.empCode,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  async getUserRoles(userId: string): Promise<RoleCode[]> {
    const rows = await this.db
      .select({ code: schema.roles.code })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.userId, userId));

    return rows.map(r => r.code as RoleCode);
  }

  async getUserInheritedPermissions(userId: string): Promise<PermissionCode[]> {
    // Join user_roles -> role_permissions -> permissions
    const rows = await this.db
      .select({ code: schema.permissions.code })
      .from(schema.userRoles)
      .innerJoin(schema.rolePermissions, eq(schema.userRoles.roleId, schema.rolePermissions.roleId))
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.userRoles.userId, userId));

    const set = new Set<PermissionCode>();
    rows.forEach(r => set.add(r.code as PermissionCode));
    return Array.from(set);
  }

  async getUserPermissionOverrides(userId: string): Promise<Array<{
    permissionId: string;
    permissionCode: string;
    effect: 'ALLOW' | 'DENY';
    assignedByUserId: string;
    createdAt: string;
    updatedAt: string;
  }>> {
    const rows = await this.db
      .select({
        permissionId: schema.userPermissionOverrides.permissionId,
        permissionCode: schema.permissions.code,
        effect: schema.userPermissionOverrides.effect,
        assignedByUserId: schema.userPermissionOverrides.assignedByUserId,
        createdAt: schema.userPermissionOverrides.createdAt,
        updatedAt: schema.userPermissionOverrides.updatedAt,
      })
      .from(schema.userPermissionOverrides)
      .innerJoin(schema.permissions, eq(schema.userPermissionOverrides.permissionId, schema.permissions.id))
      .where(eq(schema.userPermissionOverrides.userId, userId));

    return rows as Array<{
      permissionId: string;
      permissionCode: string;
      effect: 'ALLOW' | 'DENY';
      assignedByUserId: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }

  async getUserPermissions(userId: string): Promise<PermissionCode[]> {
    const inherited = await this.getUserInheritedPermissions(userId);
    const overrides = await this.getUserPermissionOverrides(userId);

    const effective = new Set<PermissionCode>(inherited);
    for (const override of overrides) {
      if (override.effect === 'ALLOW') {
        effective.add(override.permissionCode as PermissionCode);
      } else if (override.effect === 'DENY') {
        effective.delete(override.permissionCode as PermissionCode);
      }
    }

    return Array.from(effective);
  }

  async getPermissionByCode(code: string): Promise<{ id: string; code: string; name: string; description: string } | null> {
    const rows = await this.db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.code, code))
      .limit(1);

    return rows[0] || null;
  }

  async setUserPermissionOverride(data: {
    userId: string;
    permissionId: string;
    effect: 'ALLOW' | 'DENY';
    assignedByUserId: string;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db
      .insert(schema.userPermissionOverrides)
      .values({
        userId: data.userId,
        permissionId: data.permissionId,
        effect: data.effect,
        assignedByUserId: data.assignedByUserId,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: [schema.userPermissionOverrides.userId, schema.userPermissionOverrides.permissionId],
        set: {
          effect: data.effect,
          assignedByUserId: data.assignedByUserId,
          updatedAt: nowIso,
        },
      });
  }

  async removeUserPermissionOverride(userId: string, permissionId: string): Promise<void> {
    await this.db
      .delete(schema.userPermissionOverrides)
      .where(
        and(
          eq(schema.userPermissionOverrides.userId, userId),
          eq(schema.userPermissionOverrides.permissionId, permissionId)
        )
      );
  }

  async createUser(data: {
    id: string;
    empCode: string;
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    roleCodes: string[];
    createdAt: string;
    updatedAt: string;
  }): Promise<User> {
    // 1. Resolve role IDs before user insertion; fail if not all mappings resolve
    let roleMappings: { userId: string; roleId: string }[] = [];
    if (data.roleCodes.length > 0) {
      const foundRoles = await this.db
        .select()
        .from(schema.roles)
        .where(inArray(schema.roles.code, data.roleCodes));

      if (foundRoles.length !== data.roleCodes.length) {
        const foundCodes = new Set(foundRoles.map(r => r.code));
        const missing = data.roleCodes.filter(c => !foundCodes.has(c));
        throw new Error(`Cannot resolve all requested role mappings: ${missing.join(', ')}`);
      }

      roleMappings = foundRoles.map(r => ({
        userId: data.id,
        roleId: r.id,
      }));
    }

    // 2. Insert user record
    await this.db.insert(schema.users).values({
      id: data.id,
      empCode: data.empCode,
      name: data.name,
      email: data.email.toLowerCase().trim(),
      phone: data.phone,
      passwordHash: data.passwordHash,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });

    // 3. Insert user role assignments
    if (roleMappings.length > 0) {
      await this.db.insert(schema.userRoles).values(roleMappings);
    }

    return {
      id: data.id,
      empCode: data.empCode,
      name: data.name,
      email: data.email,
      phone: data.phone,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  async updateUser(id: string, data: Partial<{
    name: string;
    email: string;
    phone: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    updatedAt: string;
  }>): Promise<void> {
    await this.db
      .update(schema.users)
      .set(data)
      .where(eq(schema.users.id, id));
  }

  async listAllUsers(): Promise<User[]> {
    const list = await this.db.select().from(schema.users);
    return list.map(u => ({
      id: u.id,
      empCode: u.empCode,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }
}
