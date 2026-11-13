/**
 * Stage 01L: TEST-ONLY atomic closing-contract experiment.
 *
 * This is NOT the production ShiftCloseService, a migration, or an API route.
 * Values are synthetic, not calculated from metering/receipts/finance.
 * It exercises persisted rows and local-D1 rollback in disposable test DBs.
 *
 * The real shift-closing implementation must not adopt this until hosted D1
 * verification, business preflight, authorization and audit signoff.
 */
import { getPrototypeAttempt } from './closeAttemptJournalPrototype';

export interface AtomicCloseFixture {
  shiftId: string;
  outletId: string;
  actorId: string;
  attemptId: string;
}
interface TankRow {
  tank_id: string;
  product_id: string;
}

/** Guard triggers exist ONLY in an ephemeral test SQLite DB. */
export async function installStage01LTestGuards(db: D1Database): Promise<void> {
  await db.exec(`
    CREATE UNIQUE INDEX stage01l_test_single_close_audit
      ON audit_logs(entity_id, action)
      WHERE entity_type = 'OPERATIONAL_SHIFT' AND action = 'SHIFT_CLOSE';

    CREATE TRIGGER stage01l_test_audit_needs_claim
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'SHIFT_CLOSE' AND NEW.entity_type = 'OPERATIONAL_SHIFT'
       AND NOT EXISTS (
         SELECT 1 FROM stage01j_close_attempts a
         JOIN operational_shifts s ON s.id = a.shift_id
         WHERE a.shift_id = NEW.entity_id AND a.state = 'PREPARED'
           AND s.status = 'CLOSING' AND s.outlet_id = a.outlet_id
           AND a.actor_id = NEW.user_id
       )
      BEGIN SELECT RAISE(ABORT, 'STAGE01L_CLOSE_INTENT_NOT_VALID'); END;

    CREATE TRIGGER stage01l_test_closed_needs_evidence
      BEFORE UPDATE OF status ON operational_shifts
      WHEN NEW.status = 'CLOSED' AND (
        OLD.status != 'CLOSING'
        OR NOT EXISTS (
          SELECT 1 FROM shift_financial_reconciliations f
          WHERE f.operational_shift_id = NEW.id AND f.outlet_id = NEW.outlet_id
        )
        OR NOT EXISTS (
          SELECT 1 FROM audit_logs a
          WHERE a.entity_type = 'OPERATIONAL_SHIFT'
            AND a.entity_id = NEW.id AND a.action = 'SHIFT_CLOSE'
        )
        OR NOT EXISTS (
          SELECT 1 FROM operational_shift_tanks t WHERE t.operational_shift_id = NEW.id
        )
        OR EXISTS (
          SELECT 1 FROM operational_shift_tanks t
          WHERE t.operational_shift_id = NEW.id
            AND NOT EXISTS (
              SELECT 1 FROM shift_stock_reconciliations sr
              WHERE sr.operational_shift_id = NEW.id AND sr.outlet_id = NEW.outlet_id
                AND sr.tank_id = t.tank_id AND sr.product_id = t.product_id
            )
        )
      )
      BEGIN SELECT RAISE(ABORT, 'STAGE01L_INCOMPLETE_MANDATORY_EVIDENCE'); END;

    CREATE TRIGGER stage01l_test_commit_requires_closed
      BEFORE UPDATE OF state ON stage01j_close_attempts
      WHEN NEW.state = 'COMMITTED' AND (
        OLD.state != 'PREPARED'
        OR NOT EXISTS (
          SELECT 1 FROM operational_shifts s
          WHERE s.id = NEW.shift_id AND s.outlet_id = NEW.outlet_id
            AND s.status = 'CLOSED' AND s.closed_by_user_id = NEW.actor_id
        )
      )
      BEGIN SELECT RAISE(ABORT, 'STAGE01L_CLOSE_NOT_VERIFIED'); END;
  `);
}

/**
 * Claim OPEN -> CLOSING only after a Stage 01J journal reservation.
 * Guarded as a local prototype; never call against a live Worker database.
 */
export async function claimStage01LTestShift(db: D1Database, fixture: AtomicCloseFixture): Promise<void> {
  const attempt = await getPrototypeAttempt(db, fixture.attemptId);
  if (!attempt ||
      attempt.shift_id !== fixture.shiftId ||
      attempt.outlet_id !== fixture.outletId ||
      attempt.actor_id !== fixture.actorId ||
      attempt.state !== 'PREPARED') {
    throw new Error('STAGE01L_UNVERIFIED_ATTEMPT');
  }
  const result = await db.prepare(`
    UPDATE operational_shifts SET status = 'CLOSING', updated_at = ?
    WHERE id = ? AND outlet_id = ? AND status = 'OPEN'
    RETURNING id
  `).bind(new Date().toISOString(), fixture.shiftId, fixture.outletId).all<{id: string}>();
  if (result.results.length !== 1) throw new Error('STAGE01L_SHIFT_NOT_OPEN');
}

/** Synthetic raw data used strictly to exercise constraints/rollback. */
export async function commitStage01LTestBatch(
  db: D1Database,
  fixture: AtomicCloseFixture,
  options: { skipOneTank?: boolean } = {},
): Promise<void> {
  const rows = await db.prepare(`
    SELECT tank_id, product_id FROM operational_shift_tanks
    WHERE operational_shift_id = ? ORDER BY tank_id
  `).bind(fixture.shiftId).all<TankRow>();
  if (rows.results.length < 2) throw new Error('STAGE01L_TEST_TANKS_MISSING');
  const tankRows = options.skipOneTank ? rows.results.slice(1) : rows.results;
  const now = new Date().toISOString();
  const commands: D1PreparedStatement[] = [];

  for (const tank of tankRows) {
    commands.push(db.prepare(`
      INSERT INTO shift_stock_reconciliations (
        id, operational_shift_id, outlet_id, tank_id, product_id,
        opening_stock_milliunits, receipt_quantity_milliunits, sales_quantity_milliunits,
        theoretical_closing_stock_milliunits, physical_closing_stock_milliunits,
        variance_milliunits, variance_status, calculated_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 100000, 0, 0, 100000, 100000, 0, 'BALANCED', ?, ?, ?)
    `).bind('stage01l-stock-' + crypto.randomUUID(), fixture.shiftId, fixture.outletId,
      tank.tank_id, tank.product_id, now, now, now));
  }

  commands.push(db.prepare(`
    INSERT INTO shift_financial_reconciliations (
      id, operational_shift_id, outlet_id,
      fuel_sales_revenue_paise, cng_sales_revenue_paise, lube_sales_revenue_paise,
      authoritative_sales_revenue_paise,
      cash_collection_paise, pos_collection_paise, upi_collection_paise,
      fleet_card_collection_paise, credit_sales_paise, direct_bank_drop_paise,
      total_collections_paise, sales_collection_variance_paise, variance_status,
      variance_reason, calculated_at, created_at, updated_at
    ) VALUES (?, ?, ?, 10000, NULL, 0, 10000, 10000, 0, 0, 0, 0, 0,
      10000, 0, 'BALANCED', NULL, ?, ?, ?)
  `).bind('stage01l-finance-' + crypto.randomUUID(), fixture.shiftId, fixture.outletId,
    now, now, now));

  commands.push(db.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id, old_value_json,
      new_value_json, created_at
    ) VALUES (?, ?, 'SHIFT_CLOSE', 'OPERATIONAL_SHIFT', ?, ?, ?, ?)
  `).bind('stage01l-audit-' + crypto.randomUUID(), fixture.actorId, fixture.shiftId,
    JSON.stringify({ status: 'CLOSING', attemptId: fixture.attemptId }),
    JSON.stringify({ status: 'CLOSED', attemptId: fixture.attemptId }),
    now));

  commands.push(db.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id, new_value_json, created_at
    ) VALUES (?, ?, 'FINANCIAL_RECONCILIATION', 'OPERATIONAL_SHIFT', ?, ?, ?)
  `).bind('stage01l-audit-fin-' + crypto.randomUUID(), fixture.actorId, fixture.shiftId,
    JSON.stringify({ attemptId: fixture.attemptId, synthetic: true }), now));

  const statusIndex = commands.length;
  commands.push(db.prepare(`
    UPDATE operational_shifts
      SET status = 'CLOSED', closed_at = ?, closed_by_user_id = ?, updated_at = ?
      WHERE id = ? AND outlet_id = ? AND status = 'CLOSING'
      RETURNING id
  `).bind(now, fixture.actorId, now, fixture.shiftId, fixture.outletId));

  const attemptIndex = commands.length;
  commands.push(db.prepare(`
    UPDATE stage01j_close_attempts SET state = 'COMMITTED', updated_at = ?
      WHERE attempt_id = ? AND shift_id = ? AND outlet_id = ?
        AND actor_id = ? AND state = 'PREPARED'
      RETURNING attempt_id
  `).bind(now, fixture.attemptId, fixture.shiftId, fixture.outletId, fixture.actorId));

  const eventIndex = commands.length;
  commands.push(db.prepare(`
    INSERT INTO stage01j_close_attempt_events (
      event_id, attempt_id, event_type, actor_id, created_at
    ) VALUES (?, ?, 'COMMITTED', ?, ?)
    RETURNING event_id
  `).bind('stage01l-event-' + crypto.randomUUID(), fixture.attemptId, fixture.actorId, now));

  // All writes share one transaction under the local D1 emulator. The guarded
  // trigger preconditions make lost/zero-row state transitions fail, rather than
  // letting a successful batch commit partially meaningful output.
  const results = await db.batch(commands);
  if (results[statusIndex]?.results?.length !== 1 ||
      results[attemptIndex]?.results?.length !== 1 ||
      results[eventIndex]?.results?.length !== 1) {
    throw new Error('STAGE01L_UNVERIFIED_COMMIT_RESULT');
  }
}
