import type { ShiftFinancialReconciliation } from '../../shared/types';

/**
 * Stage 01N candidate: narrow atomic final status + mandatory audit boundary.
 *
 * This intentionally uses Cloudflare D1Database.batch rather than multiple
 * sequential ORM calls (or interactive BEGIN/COMMIT, which D1 does not support).
 * All SQL values are bound parameters.
 *
 * OUT OF SCOPE: stock/financial reconciliation are still persisted before
 * this batch by ShiftCloseService. This does not claim a full source-to-close
 * transaction, durable attempt journal, or final production release readiness.
 */
export class AtomicShiftCloseFinalizer {
  constructor(private readonly d1: D1Database) {}

  async finalize(
    shiftId: string,
    closedByUserId: string,
    recon: ShiftFinancialReconciliation,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<boolean> {
    if (!recon || recon.operationalShiftId !== shiftId) {
      throw new Error('SHIFT_CLOSE_FINANCIAL_EVIDENCE_MISSING');
    }

    const closedAt = new Date().toISOString();
    const closeAuditId = `aud-${crypto.randomUUID()}`;
    const financialAuditId = `aud-${crypto.randomUUID()}`;
    const financialAuditValue = JSON.stringify({
      fuelRevenuePaise: recon.fuelSalesRevenuePaise,
      cngRevenuePaise: recon.cngSalesRevenuePaise,
      lubeRevenuePaise: recon.lubeSalesRevenuePaise,
      authoritativeSalesRevenuePaise: recon.authoritativeSalesRevenuePaise,
      totalCollectionsPaise: recon.totalCollectionsPaise,
      variancePaise: recon.salesCollectionVariancePaise,
      varianceStatus: recon.varianceStatus,
      varianceReason: recon.varianceReason,
    });

    const results = await this.d1.batch([
      // Status change is allowed only with a real financial reconciliation
      // and a stock reconciliation for EVERY shift-tank snapshot. Do not
      // overwrite previous/partial SHIFT_CLOSE audit evidence.
      this.d1.prepare(`
        UPDATE operational_shifts
        SET status = 'CLOSED', closed_at = ?, closed_by_user_id = ?, updated_at = ?
        WHERE id = ? AND status = 'CLOSING'
          AND EXISTS (
            SELECT 1 FROM shift_financial_reconciliations AS f
            WHERE f.operational_shift_id = operational_shifts.id
              AND f.outlet_id = operational_shifts.outlet_id
          )
          AND EXISTS (
            SELECT 1 FROM operational_shift_tanks AS t
            WHERE t.operational_shift_id = operational_shifts.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM operational_shift_tanks AS t
            WHERE t.operational_shift_id = operational_shifts.id
              AND NOT EXISTS (
                SELECT 1 FROM shift_stock_reconciliations AS sr
                WHERE sr.operational_shift_id = t.operational_shift_id
                  AND sr.outlet_id = t.outlet_id
                  AND sr.tank_id = t.tank_id
                  AND sr.product_id = t.product_id
              )
          )
          AND NOT EXISTS (
            SELECT 1 FROM audit_logs AS a
            WHERE a.entity_type = 'OPERATIONAL_SHIFT'
              AND a.entity_id = operational_shifts.id
              AND a.action = 'SHIFT_CLOSE'
          )
        RETURNING id
      `).bind(closedAt, closedByUserId, closedAt, shiftId),

      // The audit is conditional on the exact transition above. If the
      // update matched no shift, BOTH audit inserts also match nothing.
      // If either audit insert fails, D1.batch rolls back the CLOSED change.
      this.d1.prepare(`
        INSERT INTO audit_logs (
          id, user_id, action, entity_type, entity_id,
          old_value_json, new_value_json, ip_address, user_agent, created_at
        )
        SELECT ?, ?, 'SHIFT_CLOSE', 'OPERATIONAL_SHIFT', s.id,
          ?, json_object(
            'id', s.id, 'outletId', s.outlet_id,
            'status', s.status, 'closedAt', s.closed_at,
            'closedByUserId', s.closed_by_user_id
          ), ?, ?, ?
        FROM operational_shifts AS s
        WHERE s.id = ? AND s.status = 'CLOSED'
          AND s.closed_at = ? AND s.closed_by_user_id = ?
      `).bind(
        closeAuditId, closedByUserId, JSON.stringify({ status: 'CLOSING' }),
        ipAddress ?? null, userAgent ?? null, closedAt,
        shiftId, closedAt, closedByUserId,
      ),

      this.d1.prepare(`
        INSERT INTO audit_logs (
          id, user_id, action, entity_type, entity_id,
          old_value_json, new_value_json, ip_address, user_agent, created_at
        )
        SELECT ?, ?, 'FINANCIAL_RECONCILIATION', 'OPERATIONAL_SHIFT', s.id,
          NULL, ?, ?, ?, ?
        FROM operational_shifts AS s
        WHERE s.id = ? AND s.status = 'CLOSED'
          AND s.closed_at = ? AND s.closed_by_user_id = ?
      `).bind(
        financialAuditId, closedByUserId, financialAuditValue,
        ipAddress ?? null, userAgent ?? null, closedAt,
        shiftId, closedAt, closedByUserId,
      ),
    ]);

    const updated = results[0]?.results?.length === 1;
    const closeAuditInserted = Number(results[1]?.meta?.changes ?? 0) === 1;
    const financeAuditInserted = Number(results[2]?.meta?.changes ?? 0) === 1;

    if (!updated) {
      // No CLOSING->CLOSED transition happened. Neither audit may be inserted.
      if (closeAuditInserted || financeAuditInserted) {
        throw new Error('SHIFT_CLOSE_ATOMIC_EVIDENCE_UNCERTAIN');
      }
      return false;
    }

    // These two guarded inserts should always accompany an updated shift.
    // Never claim success if the provider reports an inconsistent result.
    if (!closeAuditInserted || !financeAuditInserted) {
      throw new Error('SHIFT_CLOSE_ATOMIC_EVIDENCE_UNCERTAIN');
    }
    return true;
  }
}
