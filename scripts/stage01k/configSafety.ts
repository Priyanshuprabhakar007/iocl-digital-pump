export interface Stage01KConfig {
  name: string;
  main: string;
  d1_databases: Array<{ binding: string; database_name: string; database_id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Static no-network preflight. Refuse missing staging config or prod D1 alias. */
export function verifyStage01KStagingConfig(
  candidate: Stage01KConfig,
  production: Stage01KConfig,
): void {
  const staging = candidate?.d1_databases;
  const live = production?.d1_databases;
  if (!candidate || !production || !Array.isArray(staging) || !Array.isArray(live) || live.length === 0) {
    throw new Error('STAGE01K_INVALID_CONFIG');
  }
  if (staging.length !== 1) throw new Error('STAGE01K_STAGING_CONFIG_UNSAFE');
  const db = staging[0];
  const liveIds = new Set(live.map(x => x.database_id));
  const liveNames = new Set(live.map(x => x.database_name));
  if (candidate.name !== 'stage01k-d1-disposable-probe' ||
      candidate.main !== 'scripts/stage01k/standaloneWorker.ts' ||
      db.binding !== 'STAGING_DB' ||
      !UUID.test(db.database_id || '') ||
      !/^stage01k-[a-z0-9-]+$/.test(db.database_name || '') ||
      liveIds.has(db.database_id) ||
      liveNames.has(db.database_name)) {
    throw new Error('STAGE01K_STAGING_CONFIG_UNSAFE');
  }
}
