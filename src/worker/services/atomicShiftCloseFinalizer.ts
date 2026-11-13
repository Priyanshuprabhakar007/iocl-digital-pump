import type { ShiftStockReconciliation, ShiftFinancialReconciliation } from '../../shared/types';

/**
 * Stage 01N candidate: narrow atomic final status + mandatory audit boundary.
 *
 * This intentionally uses Cloudflare D1Database.batch rather than multiple
 * sequential ORM calls (or interactive BEGIN/COMMIT, which D1 does not support).
 * All SQL values are bound parameters.
 *
 * Stock+financial PREPARATION is now a separate atomic batch. PREPARATION and
 * CLOSED+audit FINALIZATION are NOT one transaction; this does not claim a
 * full source-to-close transaction, durable attempt journal, immutable input
 * snapshot, or production release readiness.
 */
export class AtomicShiftCloseFinalizer {
  constructor(private readonly d1: D1Database) {}

  /**
   * Atomic PREPARATION only: stock + financial rows are persisted together,
   * and no existing evidence is overwritten. This separate D1 batch is
   * intentionally NOT claimed to be atomic with the later CLOSED/audit batch.
   *
   * A previously operator-computed stock reconciliation is only reusable
   * after ShiftCloseService compares every persisted per-tank value to a
   * read-only calculation. In that case this batch inserts finance only.
   */
  async prepare(
    shiftId: string,
    outletId: string,
    stock: ShiftStockReconciliation[],
    financial: ShiftFinancialReconciliation,
    reuseExistingStock: boolean,
  ): Promise<boolean> {
    if (!shiftId || !outletId || !Array.isArray(stock) || stock.length === 0 ||
        financial?.operationalShiftId !== shiftId || financial?.outletId !== outletId ||
        stock.some(r => r.operationalShiftId !== shiftId || r.outletId !== outletId)) {
      throw new Error('SHIFT_CLOSE_PREPARATION_INPUT_INVALID');
    }

    // A unique stock conflict or finance constraint failure aborts and rolls
    // back this entire D1 batch, including preceding successful stock inserts.
    // The CLOSING guard prevents a late, stale request from inserting rows.
    const statements: D1PreparedStatement[] = [];
    if (!reuseExistingStock) {
      for (const row of stock) {
        statements.push(this.d1.prepare(`
          INSERT INTO shift_stock_reconciliations (
            id, operational_shift_id, outlet_id, tank_id, product_id,
            opening_stock_milliunits, receipt_quantity_milliunits,
            sales_quantity_milliunits, theoretical_closing_stock_milliunits,
            physical_closing_stock_milliunits, variance_milliunits,
            variance_status, calculated_at, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM operational_shifts AS s
          WHERE s.id = ? AND s.outlet_id = ? AND s.status = 'CLOSING'
          RETURNING id
        `).bind(
          row.id, shiftId, outletId, row.tankId, row.productId,
          row.openingStockMilliunits, row.receiptQuantityMilliunits,
          row.salesQuantityMilliunits, row.theoreticalClosingStockMilliunits,
          row.physicalClosingStockMilliunits, row.varianceMilliunits,
          row.varianceStatus, row.calculatedAt, row.createdAt, row.updatedAt,
          shiftId, outletId,
        ));
      }
    }

    statements.push(this.d1.prepare(`
      INSERT INTO shift_financial_reconciliations (
        id, operational_shift_id, outlet_id, fuel_sales_revenue_paise,
        cng_sales_revenue_paise, lube_sales_revenue_paise,
        authoritative_sales_revenue_paise, cash_collection_paise,
        pos_collection_paise, upi_collection_paise, fleet_card_collection_paise,
        credit_sales_paise, direct_bank_drop_paise, total_collections_paise,
        sales_collection_variance_paise, variance_status, variance_reason,
        calculated_at, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM operational_shifts AS s
      WHERE s.id = ? AND s.outlet_id = ? AND s.status = 'CLOSING'
      RETURNING id
    `).bind(
      financial.id, shiftId, outletId, financial.fuelSalesRevenuePaise,
      financial.cngSalesRevenuePaise ?? null, financial.lubeSalesRevenuePaise ?? null,
      financial.authoritativeSalesRevenuePaise, financial.cashCollectionPaise,
      financial.posCollectionPaise, financial.upiCollectionPaise,
      financial.fleetCardCollectionPaise, financial.creditSalesPaise,
      financial.directBankDropPaise, financial.totalCollectionsPaise,
      financial.salesCollectionVariancePaise, financial.varianceStatus,
      financial.varianceReason ?? null, financial.calculatedAt,
      financial.createdAt, financial.updatedAt,
      shiftId, outletId,
    ));

    const results = await this.d1.batch(statements);
    // INSERT ... RETURNING is supported by both Cloudflare D1 and LocalD1.
    // This is verification, not post-commit cleanup: a contradictory result
    // must be held for manual review rather than automatically rolled back.
    return results.length === statements.length &&
      results.every(result => result?.results?.length === 1);
  }

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
        RETURNING id
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
        RETURNING id
      `).bind(
        financialAuditId, closedByUserId, financialAuditValue,
        ipAddress ?? null, userAgent ?? null, closedAt,
        shiftId, closedAt, closedByUserId,
      ),
    ]);

    const updated = results[0]?.results?.length === 1;
    // RETURNING is reliable for Bun's LocalD1 as well as hosted D1;
    // some local adapters do not populate meta.changes for INSERT ... SELECT.
    const closeAuditInserted = results[1]?.results?.length === 1;
    const financeAuditInserted = results[2]?.results?.length === 1;

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
