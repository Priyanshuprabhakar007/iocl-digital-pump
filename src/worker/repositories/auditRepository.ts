import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { AuditLog } from '../../shared/types';

export class AuditRepository {
  constructor(private db: AppDatabase) {}

  async logAction(data: {
    id: string;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: string;
  }): Promise<void> {
    // Sanitize values to omit sensitive keys
    const sanitize = (obj?: Record<string, unknown> | null) => {
      if (!obj) return null;
      const copy = { ...obj };
      delete copy.password;
      delete copy.passwordHash;
      delete copy.token;
      delete copy.tokenHash;
      return JSON.stringify(copy);
    };

    await this.db.insert(schema.auditLogs).values({
      id: data.id,
      userId: data.userId ?? null,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      oldValueJson: sanitize(data.oldValue),
      newValueJson: sanitize(data.newValue),
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      createdAt: data.createdAt,
    });
  }

  async listLogs(
    limit = 100,
    offset = 0,
    filters?: { entityType?: string; entityId?: string }
  ): Promise<AuditLog[]> {
    const conditions: any[] = [];
    if (filters?.entityType) {
      conditions.push(eq(schema.auditLogs.entityType, filters.entityType));
    }
    if (filters?.entityId) {
      conditions.push(eq(schema.auditLogs.entityId, filters.entityId));
    }

    let query = this.db
      .select({
        log: schema.auditLogs,
        userName: schema.users.name,
        userEmail: schema.users.email,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id)) as any;

    if (conditions.length === 1) {
      query = query.where(conditions[0]);
    } else if (conditions.length > 1) {
      query = query.where(and(...conditions));
    }

    const res = await query
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return res.map((r: any) => ({
      id: r.log.id,
      userId: r.log.userId,
      action: r.log.action,
      entityType: r.log.entityType,
      entityId: r.log.entityId,
      oldValueJson: r.log.oldValueJson,
      newValueJson: r.log.newValueJson,
      ipAddress: r.log.ipAddress,
      userAgent: r.log.userAgent,
      createdAt: r.log.createdAt,
      userName: r.userName ?? 'System',
      userEmail: r.userEmail ?? undefined,
    }));
  }
}

