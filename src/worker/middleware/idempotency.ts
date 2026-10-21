import { Next } from 'hono';
import { AppContext } from './auth';
import { IdempotencyService } from '../services/idempotencyService';

export async function idempotencyMiddleware(c: AppContext, next: Next) {
  return IdempotencyService.handleAuthenticatedMutation(c, next);
}
