import { runStage01KContract } from './d1ContractProbe';

interface Stage01KEnv {
  STAGING_DB: D1Database;
  STAGE01K_PROBE_TOKEN?: string;
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Standalone disposable probe Worker only. NOT referenced by the IOCL app
 * wrangler.jsonc. Deploy only with a manually confirmed dedicated Stage 01K
 * config, a secret token, and a matching guard row in the scratch database.
 *
 * No CORS support. Refuses requests without secret + explicit acknowledgement.
 */
export default {
  async fetch(request: Request, env: Stage01KEnv): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (request.method !== 'POST' || pathname !== '/stage01k/run') {
      return response(404, { success: false, code: 'NOT_FOUND' });
    }
    const expected = env.STAGE01K_PROBE_TOKEN;
    if (!expected || expected.length < 24) {
      return response(503, { success: false, code: 'STAGING_PROBE_DISABLED' });
    }
    const header = request.headers.get('Authorization') || '';
    if (!header.startsWith('Bearer ') || !sameSecret(header.slice(7), expected) ||
        request.headers.get('X-Stage01K-Acknowledge') !== 'isolated-disposable-staging') {
      return response(403, { success: false, code: 'STAGING_APPROVAL_REQUIRED' });
    }
    try {
      const result = await runStage01KContract(env.STAGING_DB, expected);
      return response(200, { success: true, data: result });
    } catch (err: unknown) {
      // Never leak raw SQL, database IDs or the private guard token to clients.
      const guardIssue = err instanceof Error && err.message.startsWith('STAGE01K_');
      return response(guardIssue ? 409 : 500, {
        success: false,
        code: guardIssue ? 'STAGING_PROBE_CHECK_FAILED' : 'STAGING_PROBE_ERROR',
      });
    }
  },
};
