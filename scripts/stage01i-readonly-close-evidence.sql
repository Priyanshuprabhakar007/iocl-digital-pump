-- Stage 01I / READ-ONLY / For a VERIFIED disposable staging D1 only.
-- This script neither inserts nor updates nor deletes data.
-- Do not run against a database until its Cloudflare account, name, UUID,
-- binding configuration and absence of production data are independently verified.
-- Review results privately: shift IDs and outlet IDs may be operational data.

SELECT 'total_shifts' AS check_name, COUNT(*) AS observed_count FROM operational_shifts;
SELECT 'open_shifts' AS check_name, COUNT(*) AS observed_count FROM operational_shifts WHERE status = 'OPEN';
SELECT 'closing_shifts' AS check_name, COUNT(*) AS observed_count FROM operational_shifts WHERE status = 'CLOSING';
SELECT 'closed_or_locked_shifts' AS check_name, COUNT(*) AS observed_count FROM operational_shifts WHERE status IN ('CLOSED', 'LOCKED');

-- CLOSED/LOCKED with missing evidence OR duplicates:
-- Every finalized shift should have >=1 tank reconciliation,
-- exactly one financial reconciliation and exactly one SHIFT_CLOSE audit.
SELECT s.id AS shift_id, s.outlet_id, s.status,
  (SELECT COUNT(*) FROM shift_stock_reconciliations sr
    WHERE sr.operational_shift_id = s.id) AS stock_count,
  (SELECT COUNT(*) FROM shift_financial_reconciliations fr
    WHERE fr.operational_shift_id = s.id) AS financial_count,
  (SELECT COUNT(*) FROM audit_logs al
    WHERE al.entity_type = 'OPERATIONAL_SHIFT'
      AND al.entity_id = s.id AND al.action = 'SHIFT_CLOSE') AS shift_close_audit_count
FROM operational_shifts AS s
WHERE s.status IN ('CLOSED', 'LOCKED')
  AND (
    NOT EXISTS (SELECT 1 FROM shift_stock_reconciliations sr WHERE sr.operational_shift_id = s.id)
    OR (SELECT COUNT(*) FROM shift_financial_reconciliations fr WHERE fr.operational_shift_id = s.id) <> 1
    OR (SELECT COUNT(*) FROM audit_logs al
        WHERE al.entity_type = 'OPERATIONAL_SHIFT'
          AND al.entity_id = s.id AND al.action = 'SHIFT_CLOSE') <> 1
  )
ORDER BY s.business_date DESC, s.id
LIMIT 100;

-- OPEN/CLOSING with prior or incomplete close artifacts:
-- This is triage evidence, not authorization for any cleanup.
SELECT s.id AS shift_id, s.outlet_id, s.status,
  (SELECT COUNT(*) FROM shift_stock_reconciliations sr WHERE sr.operational_shift_id = s.id) AS stock_count,
  (SELECT COUNT(*) FROM shift_financial_reconciliations fr WHERE fr.operational_shift_id = s.id) AS financial_count,
  (SELECT COUNT(*) FROM audit_logs al WHERE al.entity_type = 'OPERATIONAL_SHIFT'
    AND al.entity_id = s.id AND al.action = 'SHIFT_CLOSE') AS shift_close_audit_count
FROM operational_shifts s
WHERE s.status = 'CLOSING' OR
  (s.status = 'OPEN' AND (
    EXISTS (SELECT 1 FROM shift_stock_reconciliations sr WHERE sr.operational_shift_id = s.id)
    OR EXISTS (SELECT 1 FROM shift_financial_reconciliations fr WHERE fr.operational_shift_id = s.id)
    OR EXISTS (SELECT 1 FROM audit_logs al WHERE al.entity_type = 'OPERATIONAL_SHIFT'
      AND al.entity_id = s.id AND al.action = 'SHIFT_CLOSE')
  ))
ORDER BY s.business_date DESC, s.id
LIMIT 100;
