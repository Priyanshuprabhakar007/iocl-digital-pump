import { Context, Next } from 'hono';

export interface IdempotencyRecord {
  id: string;
  idempotency_key: string;
  actor_id: string;
  route: string;
  request_fingerprint: string;
  response_status: number;
  entity_id: string | null;
  response_body: string;
  created_at: string;
}

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_\-:.]{8,128}$/;

// In-flight mutex per (actorId, idempotencyKey) to serialize concurrent identical retries
const inFlightLocks = new Map<string, Promise<void>>();

function canonicalizeJsonValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, any> = {};
    for (const k of sortedKeys) {
      if (value[k] !== undefined) {
        result[k] = canonicalizeJsonValue(value[k]);
      }
    }
    return result;
  }
  return value;
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeRequestFingerprint(req: Request, routePath: string): Promise<string> {
  const method = req.method.toUpperCase();
  const contentType = (req.headers.get('content-type') || '').toLowerCase();

  let canonicalBody = '';
  try {
    const cloned = req.clone();
    if (contentType.includes('application/json')) {
      const text = await cloned.text();
      if (text.trim().length > 0) {
        try {
          const parsed = JSON.parse(text);
          canonicalBody = JSON.stringify(canonicalizeJsonValue(parsed));
        } catch {
          canonicalBody = text.trim();
        }
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await cloned.formData();
      const entries: string[] = [];
      formData.forEach((val, key) => {
        if (typeof val === 'string') {
          entries.push(`${key}=str:${val}`);
        } else if (val && typeof val === 'object' && 'name' in val && 'size' in val) {
          const f = val as File;
          entries.push(`${key}=file:${f.name}:${f.size}:${f.type || ''}`);
        }
      });
      entries.sort();
      canonicalBody = entries.join('&');
    } else {
      canonicalBody = (await cloned.text()).trim();
    }
  } catch {
    canonicalBody = '';
  }

  return sha256Hex(`${method}:${routePath}:${canonicalBody}`);
}

function extractEntityId(responseBody: string): string | null {
  try {
    const parsed = JSON.parse(responseBody);
    const data = parsed?.data;
    if (!data || typeof data !== 'object') return null;
    if (typeof data.id === 'string') return data.id;
    if (typeof data.shift?.id === 'string') return data.shift.id;
    if (typeof data.receipt?.id === 'string') return data.receipt.id;
    if (typeof data.reconciliation?.id === 'string') return data.reconciliation.id;
    if (typeof data.assignment?.id === 'string') return data.assignment.id;
    return null;
  } catch {
    return null;
  }
}

export class IdempotencyService {
  constructor(private d1: D1Database) {}

  async findByKeyAndActor(idempotencyKey: string, actorId: string): Promise<IdempotencyRecord | null> {
    const row = await this.d1
      .prepare(
        `SELECT id, idempotency_key, actor_id, route, request_fingerprint, response_status, entity_id, response_body, created_at
         FROM idempotency_keys
         WHERE idempotency_key = ? AND actor_id = ?
         LIMIT 1`
      )
      .bind(idempotencyKey, actorId)
      .first<IdempotencyRecord>();
    return row ?? null;
  }

  async saveRecord(record: IdempotencyRecord): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO idempotency_keys (
          id, idempotency_key, actor_id, route, request_fingerprint, response_status, entity_id, response_body, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        record.id,
        record.idempotency_key,
        record.actor_id,
        record.route,
        record.request_fingerprint,
        record.response_status,
        record.entity_id,
        record.response_body,
        record.created_at
      )
      .run();
  }

  static async handleAuthenticatedMutation(c: Context<any>, next: Next) {
    return handleIdempotentRequest(c, next);
  }
}

export async function handleIdempotentRequest(c: Context<any>, next: Next) {
  const method = c.req.method.toUpperCase();
  if (method !== 'POST') {
    return next();
  }

  const rawHeader = c.req.header('Idempotency-Key') ?? c.req.header('idempotency-key');
  if (rawHeader === undefined) {
    return next();
  }

  const idempotencyKey = rawHeader.trim();
  if (!IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key must be between 8 and 128 valid characters (alphanumeric, hyphen, colon, underscore, period).',
        },
      },
      400
    );
  }

  const userCtx = c.get('user');
  const actorId = userCtx?.user?.id || userCtx?.id || 'anonymous';
  const routePath = new URL(c.req.url).pathname;
  const requestFingerprint = await computeRequestFingerprint(c.req.raw, routePath);
  const service = new IdempotencyService(c.env.DB);
  const lockKey = `${actorId}:${idempotencyKey}`;

  // Wait for any in-flight request with the same (actorId, idempotencyKey)
  while (inFlightLocks.has(lockKey)) {
    try {
      await inFlightLocks.get(lockKey);
    } catch {
      break;
    }
  }

  let releaseLock!: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  inFlightLocks.set(lockKey, lockPromise);

  try {
    const existing = await service.findByKeyAndActor(idempotencyKey, actorId);
    if (existing) {
      if (existing.request_fingerprint !== requestFingerprint || existing.route !== routePath) {
        return c.json(
          {
            success: false,
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
              message: 'This Idempotency-Key was already used with a different request payload or endpoint.',
            },
          },
          409
        );
      }

      return new Response(existing.response_body, {
        status: existing.response_status,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Idempotent-Replay': 'true',
        },
      });
    }

    await next();

    const res = c.res;
    if (res && res.status >= 200 && res.status < 300) {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const clonedRes = res.clone();
        const responseBody = await clonedRes.text();
        const entityId = extractEntityId(responseBody);

        try {
          await service.saveRecord({
            id: crypto.randomUUID(),
            idempotency_key: idempotencyKey,
            actor_id: actorId,
            route: routePath,
            request_fingerprint: requestFingerprint,
            response_status: res.status,
            entity_id: entityId,
            response_body: responseBody,
            created_at: new Date().toISOString(),
          });
        } catch (err: any) {
          const msg = String(err?.message || err || '');
          if (msg.includes('UNIQUE constraint failed') && msg.includes('idempotency_keys')) {
            const concurrentRecord = await service.findByKeyAndActor(idempotencyKey, actorId);
            if (concurrentRecord) {
              if (
                concurrentRecord.request_fingerprint !== requestFingerprint ||
                concurrentRecord.route !== routePath
              ) {
                c.res = c.json(
                  {
                    success: false,
                    error: {
                      code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
                      message: 'This Idempotency-Key was already used with a different request payload or endpoint.',
                    },
                  },
                  409
                );
                return c.res;
              }
              c.res = new Response(concurrentRecord.response_body, {
                status: concurrentRecord.response_status,
                headers: {
                  'Content-Type': 'application/json; charset=UTF-8',
                  'X-Idempotent-Replay': 'true',
                },
              });
              return c.res;
            }
          }
          throw err;
        }
      }
    }
  } finally {
    inFlightLocks.delete(lockKey);
    releaseLock();
  }
}
