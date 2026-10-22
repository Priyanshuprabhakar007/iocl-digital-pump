import { Context, Next } from 'hono';

export interface RequestTimings {
  authDur: number;
  dbDur: number;
  handlerDur: number;
  totalDur: number;
}

/**
 * Transparently wraps a D1Database instance to record execution timings
 * without modifying any queries or exposing internal SQL.
 */
export function wrapD1WithTiming(d1: D1Database, onQuery: (durMs: number) => void): D1Database {
  if (!d1 || (d1 as any).__timed) return d1;

  function wrapStmt(stmt: any): any {
    if (!stmt) return stmt;
    const stmtWrapped: any = Object.create(stmt);

    stmtWrapped.bind = (...args: any[]) => {
      const bound = stmt.bind(...args);
      return wrapStmt(bound);
    };

    if (typeof stmt.first === 'function') {
      stmtWrapped.first = async (...args: any[]) => {
        const start = performance.now();
        try {
          return await stmt.first(...args);
        } finally {
          onQuery(performance.now() - start);
        }
      };
    }

    if (typeof stmt.all === 'function') {
      stmtWrapped.all = async (...args: any[]) => {
        const start = performance.now();
        try {
          return await stmt.all(...args);
        } finally {
          onQuery(performance.now() - start);
        }
      };
    }

    if (typeof stmt.run === 'function') {
      stmtWrapped.run = async (...args: any[]) => {
        const start = performance.now();
        try {
          return await stmt.run(...args);
        } finally {
          onQuery(performance.now() - start);
        }
      };
    }

    if (typeof stmt.raw === 'function') {
      stmtWrapped.raw = async (...args: any[]) => {
        const start = performance.now();
        try {
          return await stmt.raw(...args);
        } finally {
          onQuery(performance.now() - start);
        }
      };
    }

    return stmtWrapped;
  }

  const wrapped: any = Object.create(d1);
  (wrapped as any).__timed = true;

  wrapped.prepare = (sql: string) => {
    const stmt = d1.prepare(sql);
    return wrapStmt(stmt);
  };

  if (typeof d1.batch === 'function') {
    wrapped.batch = async (statements: any[]) => {
      const start = performance.now();
      try {
        return await d1.batch(statements);
      } finally {
        onQuery(performance.now() - start);
      }
    };
  }

  if (typeof d1.exec === 'function') {
    wrapped.exec = async (sql: string) => {
      const start = performance.now();
      try {
        return await d1.exec(sql);
      } finally {
        onQuery(performance.now() - start);
      }
    };
  }

  return wrapped;
}

/**
 * Performance instrumentation middleware:
 * - Instruments D1 database queries to measure db duration
 * - Measures auth duration and handler duration
 * - Emits standard Server-Timing headers
 * - Logs slow requests > 1000ms with { method, route, status, durationMs }
 */
export async function timingMiddleware(c: Context<any>, next: Next) {
  const reqStart = performance.now();
  let dbDurationMs = 0;
  let authDurationMs = 0;

  if (c.env?.DB) {
    c.env.DB = wrapD1WithTiming(c.env.DB, (dur) => {
      dbDurationMs += dur;
    });
  }

  c.set('recordAuthDuration', (dur: number) => {
    authDurationMs += dur;
  });
  c.set('recordDbDuration', (dur: number) => {
    dbDurationMs += dur;
  });

  await next();

  const totalDur = performance.now() - reqStart;
  const recordedAuth = (c.get('authDurationMs') as number) || authDurationMs;
  const recordedDb = (c.get('dbDurationMs') as number) || dbDurationMs;
  const handlerDur = Math.max(0, totalDur - recordedAuth);

  const formatDur = (ms: number) => Math.max(0, ms).toFixed(1);
  const serverTiming = `auth;dur=${formatDur(recordedAuth)}, db;dur=${formatDur(recordedDb)}, handler;dur=${formatDur(handlerDur)}, total;dur=${formatDur(totalDur)}`;

  c.header('Server-Timing', serverTiming);

  // Log only slow requests exceeding 1000ms threshold
  if (totalDur > 1000) {
    const method = c.req.method;
    const route = c.req.path;
    const status = c.res.status;
    const durationMs = Math.round(totalDur);

    console.warn(`[SLOW_REQUEST] method=${method} route=${route} status=${status} durationMs=${durationMs}ms`, {
      method,
      route,
      status,
      durationMs,
    });
  }
}
