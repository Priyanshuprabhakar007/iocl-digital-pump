import fs from 'node:fs';
import { verifyStage01KStagingConfig, type Stage01KConfig } from './configSafety';

/**
 * Run BEFORE any remote Wrangler command:
 * bun scripts/stage01k/preflight.ts path/to/dedicated-staging-wrangler.jsonc
 * Uses no Cloudflare credentials and performs no network/database operations.
 * Only JSON-compatible Wrangler configs (not arbitrary JSONC comments).
 */
const filepath = process.argv[2];
if (!filepath || filepath === 'wrangler.jsonc') {
  throw new Error('STAGE01K_EXPLICIT_STAGING_CONFIG_REQUIRED');
}
const candidate = JSON.parse(fs.readFileSync(filepath, 'utf8')) as Stage01KConfig;
const production = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8')) as Stage01KConfig;
verifyStage01KStagingConfig(candidate, production);
process.stdout.write('STAGE01K_CONFIG_PREFLIGHT_PASSED: dedicated D1 differs from production binding\n');
