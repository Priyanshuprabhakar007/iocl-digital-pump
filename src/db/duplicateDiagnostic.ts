export interface DuplicateDiagnosticFinding {
  table: string;
  constraintName: string;
  businessKeyDescription: string;
  duplicateGroupsCount: number;
  sampleKeys: string[];
}

export interface DuplicateDiagnosticReport {
  hasDuplicates: boolean;
  checkedAt: string;
  findings: DuplicateDiagnosticFinding[];
}

interface DuplicateCheckDefinition {
  table: string;
  constraintName: string;
  businessKeyDescription: string;
  query: string;
}

const DUPLICATE_CHECKS: DuplicateCheckDefinition[] = [
  {
    table: 'users',
    constraintName: 'users_emp_code_unique',
    businessKeyDescription: '(emp_code)',
    query: `SELECT emp_code AS key_summary, COUNT(*) AS cnt FROM users GROUP BY emp_code HAVING COUNT(*) > 1`,
  },
  {
    table: 'users',
    constraintName: 'users_email_unique',
    businessKeyDescription: '(email)',
    query: `SELECT email AS key_summary, COUNT(*) AS cnt FROM users GROUP BY email HAVING COUNT(*) > 1`,
  },
  {
    table: 'retail_outlets',
    constraintName: 'retail_outlets_ro_code_unique',
    businessKeyDescription: '(ro_code)',
    query: `SELECT ro_code AS key_summary, COUNT(*) AS cnt FROM retail_outlets GROUP BY ro_code HAVING COUNT(*) > 1`,
  },
  {
    table: 'user_scope_assignments',
    constraintName: 'uq_user_scope_assignments_natural',
    businessKeyDescription: '(user_id, scope_level, state_id, division_id, sales_area_id, outlet_id)',
    query: `SELECT user_id || ':' || scope_level || ':' || COALESCE(state_id,'') || ':' || COALESCE(division_id,'') || ':' || COALESCE(sales_area_id,'') || ':' || COALESCE(outlet_id,'') AS key_summary, COUNT(*) AS cnt FROM user_scope_assignments GROUP BY user_id, scope_level, COALESCE(state_id,''), COALESCE(division_id,''), COALESCE(sales_area_id,''), COALESCE(outlet_id,'') HAVING COUNT(*) > 1`,
  },
  {
    table: 'outlet_user_assignments',
    constraintName: 'uq_outlet_user_assignments_natural',
    businessKeyDescription: '(outlet_id, user_id, assignment_type)',
    query: `SELECT outlet_id || ':' || user_id || ':' || assignment_type AS key_summary, COUNT(*) AS cnt FROM outlet_user_assignments GROUP BY outlet_id, user_id, assignment_type HAVING COUNT(*) > 1`,
  },
  {
    table: 'fuel_receipts',
    constraintName: 'uq_fuel_receipts_outlet_invoice',
    businessKeyDescription: '(outlet_id, invoice_number) WHERE status != CANCELLED',
    query: `SELECT outlet_id || ':' || invoice_number AS key_summary, COUNT(*) AS cnt FROM fuel_receipts WHERE status != 'CANCELLED' GROUP BY outlet_id, invoice_number HAVING COUNT(*) > 1`,
  },
  {
    table: 'fuel_receipt_tank_lines',
    constraintName: 'uq_fuel_receipt_lines_receipt_tank',
    businessKeyDescription: '(fuel_receipt_id, tank_id)',
    query: `SELECT fuel_receipt_id || ':' || tank_id AS key_summary, COUNT(*) AS cnt FROM fuel_receipt_tank_lines GROUP BY fuel_receipt_id, tank_id HAVING COUNT(*) > 1`,
  },
  {
    table: 'outlet_product_prices',
    constraintName: 'uq_outlet_product_prices_active_start',
    businessKeyDescription: '(outlet_id, product_id, effective_from) WHERE status = ACTIVE',
    query: `SELECT outlet_id || ':' || product_id || ':' || effective_from AS key_summary, COUNT(*) AS cnt FROM outlet_product_prices WHERE status = 'ACTIVE' GROUP BY outlet_id, product_id, effective_from HAVING COUNT(*) > 1`,
  },
  {
    table: 'shift_collections',
    constraintName: 'uq_shift_collections_shift_type_ref',
    businessKeyDescription: '(operational_shift_id, collection_type, reference_number) WHERE reference_number IS NOT NULL',
    query: `SELECT operational_shift_id || ':' || collection_type || ':' || reference_number AS key_summary, COUNT(*) AS cnt FROM shift_collections WHERE reference_number IS NOT NULL AND trim(reference_number) != '' GROUP BY operational_shift_id, collection_type, reference_number HAVING COUNT(*) > 1`,
  },
  {
    table: 'bank_deposits',
    constraintName: 'uq_bank_deposits_outlet_channel_ref',
    businessKeyDescription: '(outlet_id, deposit_channel, reference_number) WHERE reference_number IS NOT NULL AND status != REJECTED',
    query: `SELECT outlet_id || ':' || deposit_channel || ':' || reference_number AS key_summary, COUNT(*) AS cnt FROM bank_deposits WHERE reference_number IS NOT NULL AND trim(reference_number) != '' AND status != 'REJECTED' GROUP BY outlet_id, deposit_channel, reference_number HAVING COUNT(*) > 1`,
  },
  {
    table: 'lube_sku_prices',
    constraintName: 'uq_lube_sku_prices_active_start',
    businessKeyDescription: '(outlet_id, lube_sku_id, effective_from) WHERE status = ACTIVE',
    query: `SELECT outlet_id || ':' || lube_sku_id || ':' || effective_from AS key_summary, COUNT(*) AS cnt FROM lube_sku_prices WHERE status = 'ACTIVE' GROUP BY outlet_id, lube_sku_id, effective_from HAVING COUNT(*) > 1`,
  },
  {
    table: 'lube_stock_transactions',
    constraintName: 'uq_lube_stock_tx_opening_balance',
    businessKeyDescription: '(outlet_id, lube_sku_id) WHERE transaction_type = OPENING_BALANCE',
    query: `SELECT outlet_id || ':' || lube_sku_id AS key_summary, COUNT(*) AS cnt FROM lube_stock_transactions WHERE transaction_type = 'OPENING_BALANCE' GROUP BY outlet_id, lube_sku_id HAVING COUNT(*) > 1`,
  },
  {
    table: 'nfr_rent_payments',
    constraintName: 'uq_nfr_rent_payments_due_ref',
    businessKeyDescription: '(rent_due_id, payment_reference) WHERE payment_reference IS NOT NULL',
    query: `SELECT rent_due_id || ':' || payment_reference AS key_summary, COUNT(*) AS cnt FROM nfr_rent_payments WHERE payment_reference IS NOT NULL AND trim(payment_reference) != '' GROUP BY rent_due_id, payment_reference HAVING COUNT(*) > 1`,
  },
  {
    table: 'org_officers',
    constraintName: 'uq_org_officers_email',
    businessKeyDescription: '(email) WHERE email IS NOT NULL',
    query: `SELECT email AS key_summary, COUNT(*) AS cnt FROM org_officers WHERE email IS NOT NULL AND trim(email) != '' GROUP BY email HAVING COUNT(*) > 1`,
  },
  {
    table: 'org_officer_postings',
    constraintName: 'uq_org_officer_postings_active',
    businessKeyDescription: '(officer_id, scope_level, state_id, division_id, sales_area_id, outlet_id) WHERE status = ACTIVE',
    query: `SELECT officer_id || ':' || scope_level || ':' || COALESCE(state_id,'') || ':' || COALESCE(division_id,'') || ':' || COALESCE(sales_area_id,'') || ':' || COALESCE(outlet_id,'') AS key_summary, COUNT(*) AS cnt FROM org_officer_postings WHERE status = 'ACTIVE' GROUP BY officer_id, scope_level, COALESCE(state_id,''), COALESCE(division_id,''), COALESCE(sales_area_id,''), COALESCE(outlet_id,'') HAVING COUNT(*) > 1`,
  },
  {
    table: 'outlet_service_provider_assignments',
    constraintName: 'uq_outlet_sp_assignments_natural',
    businessKeyDescription: '(outlet_id, service_provider_id, effective_from, contract_number) WHERE status = ACTIVE',
    query: `SELECT outlet_id || ':' || service_provider_id || ':' || effective_from || ':' || COALESCE(contract_number,'') AS key_summary, COUNT(*) AS cnt FROM outlet_service_provider_assignments WHERE status = 'ACTIVE' GROUP BY outlet_id, service_provider_id, effective_from, COALESCE(contract_number,'') HAVING COUNT(*) > 1`,
  },
  {
    table: 'hr_leave_requests',
    constraintName: 'uq_hr_leave_requests_active_dates',
    businessKeyDescription: '(staff_id, from_date, to_date) WHERE status IN (PENDING, APPROVED)',
    query: `SELECT staff_id || ':' || from_date || ':' || to_date AS key_summary, COUNT(*) AS cnt FROM hr_leave_requests WHERE status IN ('PENDING', 'APPROVED') GROUP BY staff_id, from_date, to_date HAVING COUNT(*) > 1`,
  },
];

function queryAll(sqlite: any, sqlQuery: string, ...params: any[]): any[] {
  if (typeof sqlite.prepare === 'function') {
    return sqlite.prepare(sqlQuery).all(...params);
  }
  if (typeof sqlite.query === 'function') {
    return sqlite.query(sqlQuery).all(...params);
  }
  return [];
}

function tableExists(sqlite: any, tableName: string): boolean {
  const rows = queryAll(
    sqlite,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    tableName
  );
  return rows.length > 0;
}

/**
 * Non-destructively scans existing database tables for duplicate business records
 * prior to applying UNIQUE constraints/indexes. Never deletes existing rows.
 */
export function detectDuplicateRecords(sqlite: any): DuplicateDiagnosticReport {
  const findings: DuplicateDiagnosticFinding[] = [];

  for (const check of DUPLICATE_CHECKS) {
    if (!tableExists(sqlite, check.table)) {
      continue;
    }

    const rows = queryAll(sqlite, check.query) as Array<{ key_summary: string; cnt: number }>;
    if (rows.length > 0) {
      findings.push({
        table: check.table,
        constraintName: check.constraintName,
        businessKeyDescription: check.businessKeyDescription,
        duplicateGroupsCount: rows.length,
        sampleKeys: rows.slice(0, 5).map(r => `${r.key_summary} (count=${r.cnt})`),
      });
    }
  }

  return {
    hasDuplicates: findings.length > 0,
    checkedAt: new Date().toISOString(),
    findings,
  };
}

/**
 * Throws a detailed diagnostic error if any duplicate records exist before migration.
 * Never deletes or modifies existing data.
 */
export function assertNoDuplicateRecordsBeforeMigration(sqlite: any): void {
  const report = detectDuplicateRecords(sqlite);
  if (!report.hasDuplicates) {
    return;
  }

  const lines = report.findings.map(
    f =>
      `- Table "${f.table}" [${f.constraintName}] on ${f.businessKeyDescription}: ${f.duplicateGroupsCount} duplicate group(s) found. Samples: ${f.sampleKeys.join(', ')}`
  );

  throw new Error(
    `DUPLICATE_DIAGNOSTIC_REPORT: Cannot apply unique constraint migration because pre-existing duplicate records were detected (no rows were deleted):\n${lines.join('\n')}`
  );
}
