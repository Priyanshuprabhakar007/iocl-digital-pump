/**
 * Stage 01U: exceptional ADMIN close-empty must never commit CLOSED
 * without the corresponding mandatory audit row.
 *
 * The conditional status change and audit insertion share a D1 batch,
 * which is transactional. A network error is indeterminate; callers must
 * not retry automatically or presume that the transaction rolled back.
 */
export class AtomicAdminEmptyShiftCloser {
  constructor(private readonly db: D1Database) {}

  async close(input: {
    shiftId: string;
    outletId: string;
    businessDate: string;
    actorId: string;
    reason: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<boolean> {
    const timestamp = new Date().toISOString();
    const auditId = `aud-${crypto.randomUUID()}`;
    const newValue = JSON.stringify({
      status: 'CLOSED',
      closureType: 'ADMIN_EMPTY_NO_DATA',
      reason: input.reason,
      outletId: input.outletId,
      businessDate: input.businessDate,
      reconciliationPerformed: false,
      closedByUserId: input.actorId,
      closedAt: timestamp,
    });
    const statement = this.db.prepare(`
      UPDATE operational_shifts
      SET status = 'CLOSED', closed_at = ?, closed_by_user_id = ?, updated_at = ?
      WHERE id = ? AND outlet_id = ? AND status = 'OPEN'
        AND NOT EXISTS (SELECT 1 FROM nozzle_meter_readings WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM nozzle_unavailability_records WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM tank_stock_readings WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM fuel_receipts WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM shift_stock_reconciliations WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM shift_collections WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM cash_handover_logs WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM bank_deposits WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM shift_financial_reconciliations WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM cng_shift_logs WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM cng_pressure_readings WHERE operational_shift_id = ?)
        AND NOT EXISTS (SELECT 1 FROM lube_shift_sales WHERE operational_shift_id = ?)
      RETURNING id
    `).bind(
      timestamp, input.actorId, timestamp, input.shiftId, input.outletId,
      ...Array(12).fill(input.shiftId),
    );
    // The audit SELECT uses the exact transition timestamp and actor.
    // A rejected status transition therefore cannot create a success audit.
    const audit = this.db.prepare(`
      INSERT INTO audit_logs (
        id, user_id, action, entity_type, entity_id,
        old_value_json, new_value_json, ip_address, user_agent, created_at
      )
      SELECT ?, ?, 'SHIFT_CLOSE_EMPTY_ADMIN', 'OPERATIONAL_SHIFT', ?,
        ?, ?, ?, ?, ?
      FROM operational_shifts
      WHERE id = ? AND outlet_id = ? AND status = 'CLOSED'
        AND closed_by_user_id = ? AND closed_at = ? AND updated_at = ?
      RETURNING id
    `).bind(
      auditId, input.actorId, input.shiftId,
      JSON.stringify({ status: 'OPEN' }), newValue,
      input.ipAddress || null, input.userAgent || null, timestamp,
      input.shiftId, input.outletId, input.actorId, timestamp, timestamp,
    );
    const results = await this.db.batch([statement, audit]);
    const updated = results[0]?.results?.length ?? 0;
    const audited = results[1]?.results?.length ?? 0;
    if (updated === 0 && audited === 0) return false;
    // Do not return success if D1 returned an unexpected shape/outcome.
    // The batch may have committed, so caller must hold for review.
    if (updated !== 1 || audited !== 1) {
      throw new Error('ADMIN_EMPTY_CLOSE_COMMIT_UNCERTAIN');
    }
    return true;
  }
}
