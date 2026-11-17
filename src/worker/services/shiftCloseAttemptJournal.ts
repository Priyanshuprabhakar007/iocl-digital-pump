/**
 * Stage 01P: runtime shift-close attempt journal.
 *
 * No public recovery command or retry path is exposed here. The claim is
 * committed atomically with intent and its append-only event. Validation
 * reopen, preparation and close have separate guarded atomic boundaries.
 * An unknown outcome is held for an authorized evidence review.
 */
export class ShiftCloseAttemptJournal {
  constructor(private readonly d1: D1Database) {}

  /** Claim OPEN -> CLOSING AND reserve an attempt in one D1 transaction. */
  async claim(shiftId: string, outletId: string, actorId: string): Promise<string | null> {
    const id = `sca-${crypto.randomUUID()}`;
    const eventId = `sce-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const rows = await this.d1.batch([
      this.d1.prepare(`
        UPDATE operational_shifts SET status = 'CLOSING', updated_at = ?
        WHERE id = ? AND outlet_id = ? AND status = 'OPEN'
        RETURNING id
      `).bind(timestamp, shiftId, outletId),
      this.d1.prepare(`
        INSERT INTO shift_close_attempts (
          id, shift_id, outlet_id, actor_id, state, created_at, updated_at
        )
        SELECT ?, s.id, s.outlet_id, ?, 'CLAIMED', ?, ?
        FROM operational_shifts AS s
        WHERE s.id = ? AND s.outlet_id = ? AND s.status = 'CLOSING'
          AND s.updated_at = ?
        RETURNING id
      `).bind(id, actorId, timestamp, timestamp, shiftId, outletId, timestamp),
      this.d1.prepare(`
        INSERT INTO shift_close_attempt_events (
          id, attempt_id, event_type, actor_id, created_at
        )
        SELECT ?, a.id, 'CLAIMED', a.actor_id, ?
        FROM shift_close_attempts AS a
        WHERE a.id = ? AND a.state = 'CLAIMED'
        RETURNING id
      `).bind(eventId, timestamp, id),
    ]);
    const lengths = rows.map(row => row?.results?.length ?? 0);
    if (lengths.every(n => n === 0)) return null;
    if (!lengths.every(n => n === 1)) {
      throw new Error('SHIFT_CLOSE_JOURNAL_CLAIM_UNCERTAIN');
    }
    return id;
  }

  /**
   * Only a clean validation refusal can reopen the shift. Reopen + journal
   * rejection + immutable event happen in the same transaction.
   */
  async rejectValidation(shiftId: string, attemptId: string, actorId: string): Promise<boolean> {
    const eventId = `sce-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const rows = await this.d1.batch([
      this.d1.prepare(`
        UPDATE operational_shifts SET status = 'OPEN', updated_at = ?
        WHERE id = ? AND status = 'CLOSING'
          AND EXISTS (
            SELECT 1 FROM shift_close_attempts
            WHERE id = ? AND shift_id = operational_shifts.id
              AND actor_id = ? AND state = 'CLAIMED'
          )
        RETURNING id
      `).bind(now, shiftId, attemptId, actorId),
      this.d1.prepare(`
        UPDATE shift_close_attempts
        SET state = 'VALIDATION_REJECTED', updated_at = ?
        WHERE id = ? AND shift_id = ? AND actor_id = ? AND state = 'CLAIMED'
          AND EXISTS (
            SELECT 1 FROM operational_shifts WHERE id = ? AND status = 'OPEN'
          )
        RETURNING id
      `).bind(now, attemptId, shiftId, actorId, shiftId),
      this.d1.prepare(`
        INSERT INTO shift_close_attempt_events (
          id, attempt_id, event_type, actor_id, created_at
        )
        SELECT ?, id, 'VALIDATION_REJECTED', actor_id, ?
        FROM shift_close_attempts
        WHERE id = ? AND state = 'VALIDATION_REJECTED'
        RETURNING id
      `).bind(eventId, now, attemptId),
    ]);
    return rows.length === 3 && rows.every(row => row?.results?.length === 1);
  }

  /**
   * Best-effort supervised HOLD after any ambiguous boundary. Never turn a
   * committed journal entry into REVIEW_REQUIRED or reset the actual shift.
   * Failure to mark HOLD must not mask the original failure: a CLAIMED or
   * PREPARED attempt remains durable and still blocks a new claim.
   */
  async markReviewRequired(attemptId: string, actorId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const rows = await this.d1.batch([
      this.d1.prepare(`
        UPDATE shift_close_attempts SET state = 'REVIEW_REQUIRED', updated_at = ?
        WHERE id = ? AND actor_id = ? AND state IN ('CLAIMED', 'PREPARED')
        RETURNING id
      `).bind(now, attemptId, actorId),
      this.d1.prepare(`
        INSERT INTO shift_close_attempt_events (
          id, attempt_id, event_type, actor_id, created_at
        )
        SELECT ?, id, 'REVIEW_REQUIRED', actor_id, ?
        FROM shift_close_attempts
        WHERE id = ? AND actor_id = ? AND state = 'REVIEW_REQUIRED'
        RETURNING id
      `).bind(`sce-${crypto.randomUUID()}`, now, attemptId, actorId),
    ]);
    return rows.length === 2 && rows.every(row => row?.results?.length === 1);
  }

  /** Internal/read-only evidence access, not a user-facing recovery route. */
  async get(attemptId: string) {
    return this.d1.prepare(`
      SELECT id, shift_id, outlet_id, actor_id, state, created_at, updated_at
      FROM shift_close_attempts WHERE id = ?
    `).bind(attemptId).first<{
      id: string; shift_id: string; outlet_id: string; actor_id: string;
      state: 'CLAIMED' | 'PREPARED' | 'COMMITTED' | 'VALIDATION_REJECTED' | 'REVIEW_REQUIRED';
      created_at: string; updated_at: string;
    }>();
  }
}
