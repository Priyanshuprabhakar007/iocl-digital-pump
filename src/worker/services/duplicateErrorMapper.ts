export interface MappedDuplicateError {
  code: string;
  message: string;
  status: 409;
}

const UNIQUE_CONSTRAINT_MAP: Array<{
  pattern: string;
  code: string;
  message: string;
}> = [
  {
    pattern: 'users.email',
    code: 'EMAIL_EXISTS',
    message: 'A user with this email already exists.',
  },
  {
    pattern: 'users.employee_code',
    code: 'EMPLOYEE_CODE_EXISTS',
    message: 'A user with this employee code already exists.',
  },
  {
    pattern: 'retail_outlets.ro_code',
    code: 'RO_CODE_EXISTS',
    message: 'A retail outlet with this RO Code already exists.',
  },
  {
    pattern: 'products.code',
    code: 'PRODUCT_CODE_EXISTS',
    message: 'A product with this code already exists.',
  },
  {
    pattern: 'outlet_products',
    code: 'OUTLET_PRODUCT_MAPPING_EXISTS',
    message: 'This product is already mapped to the outlet.',
  },
  {
    pattern: 'tanks',
    code: 'TANK_CODE_EXISTS',
    message: 'A tank with this tank code already exists at this outlet.',
  },
  {
    pattern: 'dispensers',
    code: 'DISPENSER_CODE_EXISTS',
    message: 'A dispenser with this code already exists at this outlet.',
  },
  {
    pattern: 'nozzles',
    code: 'NOZZLE_NUMBER_EXISTS',
    message: 'A nozzle with this nozzle number already exists on this dispenser.',
  },
  {
    pattern: 'shift_templates',
    code: 'SHIFT_TEMPLATE_CODE_EXISTS',
    message: 'A shift template with this code already exists at this outlet.',
  },
  {
    pattern: 'operational_shifts',
    code: 'ACTIVE_SHIFT_ALREADY_EXISTS',
    message: 'An active shift already exists for this outlet.',
  },
  {
    pattern: 'nozzle_meter_readings',
    code: 'DUPLICATE_NOZZLE_READING',
    message: 'A meter reading already exists for this nozzle in this shift.',
  },
  {
    pattern: 'tank_stock_readings',
    code: 'DUPLICATE_TANK_STOCK_READING',
    message: 'A tank stock reading for this stage already exists for this tank and shift.',
  },
  {
    pattern: 'fuel_receipt_tank_lines',
    code: 'DUPLICATE_RECEIPT_TANK_LINE',
    message: 'A decantation line for this tank already exists on this fuel receipt.',
  },
  {
    pattern: 'fuel_receipts',
    code: 'DUPLICATE_FUEL_RECEIPT_INVOICE',
    message: 'A fuel receipt with this invoice number already exists for this outlet.',
  },
  {
    pattern: 'outlet_product_prices',
    code: 'DUPLICATE_PRODUCT_PRICE',
    message: 'An active product price already exists for this outlet and product.',
  },
  {
    pattern: 'credit_parties',
    code: 'CREDIT_PARTY_CODE_EXISTS',
    message: 'A credit party with this code already exists at this outlet.',
  },
  {
    pattern: 'shift_collections',
    code: 'DUPLICATE_COLLECTION_REFERENCE',
    message: 'A collection with this reference number already exists for this shift and collection type.',
  },
  {
    pattern: 'cash_handover_logs',
    code: 'CASH_HANDOVER_ALREADY_RECORDED',
    message: 'A cash handover has already been recorded for this shift.',
  },
  {
    pattern: 'bank_deposits',
    code: 'DUPLICATE_DEPOSIT_REFERENCE',
    message: 'A bank deposit with this reference number already exists for this outlet and channel.',
  },
  {
    pattern: 'shift_financial_reconciliations',
    code: 'FINANCIAL_RECONCILIATION_EXISTS',
    message: 'A financial reconciliation already exists for this shift.',
  },
  {
    pattern: 'cng_shift_logs',
    code: 'CNG_SHIFT_LOG_EXISTS',
    message: 'A CNG shift MFM log already exists for this shift.',
  },
  {
    pattern: 'cng_pressure_readings',
    code: 'CNG_PRESSURE_READING_EXISTS',
    message: 'A CNG pressure reading for this stage already exists for this shift.',
  },
  {
    pattern: 'lube_sku_prices',
    code: 'DUPLICATE_LUBE_PRICE',
    message: 'An active price already exists for this lubricant SKU at this outlet.',
  },
  {
    pattern: 'lube_stock_transactions',
    code: 'LUBE_OPENING_BALANCE_EXISTS',
    message: 'An opening balance transaction already exists for this lubricant SKU at this outlet.',
  },
  {
    pattern: 'lube_skus',
    code: 'LUBE_SKU_CODE_EXISTS',
    message: 'A lubricant SKU with this code already exists.',
  },
  {
    pattern: 'equipment_assets',
    code: 'EQUIPMENT_ASSET_CODE_EXISTS',
    message: 'An equipment asset with this asset code already exists at this outlet.',
  },
  {
    pattern: 'dg_daily_logs',
    code: 'DG_DAILY_LOG_ALREADY_EXISTS',
    message: 'A DG daily log already exists for this asset and business date.',
  },
  {
    pattern: 'dg_run_intervals',
    code: 'DG_RUN_INTERVAL_SEQUENCE_EXISTS',
    message: 'A DG run interval with this sequence number already exists for this log.',
  },
  {
    pattern: 'utility_electricity_accounts',
    code: 'UTILITY_ACCOUNT_NUMBER_EXISTS',
    message: 'An electricity account with this consumer/account number already exists at this outlet.',
  },
  {
    pattern: 'utility_electricity_bills',
    code: 'UTILITY_BILL_EXISTS',
    message: 'An electricity bill with this bill number or billing period already exists for this account.',
  },
  {
    pattern: 'utility_sub_meter_readings',
    code: 'UTILITY_SUB_METER_READING_EXISTS',
    message: 'A reading already exists for this sub-meter on this reading date.',
  },
  {
    pattern: 'utility_sub_meters',
    code: 'UTILITY_SUB_METER_CODE_EXISTS',
    message: 'A sub-meter with this meter code already exists at this outlet.',
  },
  {
    pattern: 'municipal_tax_dues',
    code: 'MUNICIPAL_TAX_DUE_EXISTS',
    message: 'A municipal tax due record already exists for this tax type, authority, and period.',
  },
  {
    pattern: 'nfr_spaces',
    code: 'NFR_SPACE_CODE_EXISTS',
    message: 'An NFR space with this space code already exists at this outlet.',
  },
  {
    pattern: 'nfr_vendors',
    code: 'NFR_VENDOR_CODE_EXISTS',
    message: 'An NFR vendor with this vendor code already exists at this outlet.',
  },
  {
    pattern: 'nfr_leases',
    code: 'NFR_LEASE_EXISTS',
    message: 'A lease with this lease number or active space allocation already exists.',
  },
  {
    pattern: 'nfr_rent_dues',
    code: 'NFR_RENT_DUE_EXISTS',
    message: 'A rent due record already exists for this lease and period.',
  },
  {
    pattern: 'nfr_rent_payments',
    code: 'DUPLICATE_RENT_PAYMENT_REFERENCE',
    message: 'A rent payment with this reference number already exists for this rent due.',
  },
  {
    pattern: 'hr_designations',
    code: 'HR_DESIGNATION_CODE_EXISTS',
    message: 'An HR designation with this code already exists at this outlet.',
  },
  {
    pattern: 'hr_staff',
    code: 'HR_STAFF_CODE_EXISTS',
    message: 'A staff member with this employee code already exists at this outlet.',
  },
  {
    pattern: 'hr_manpower_sanctions',
    code: 'HR_MANPOWER_SANCTION_EXISTS',
    message: 'An active manpower sanction already exists for this designation at this outlet.',
  },
  {
    pattern: 'hr_roster_assignments',
    code: 'HR_ROSTER_DUPLICATE',
    message: 'A roster assignment already exists for this staff member on this date.',
  },
  {
    pattern: 'hr_attendance_records',
    code: 'HR_ATTENDANCE_ALREADY_EXISTS',
    message: 'An attendance record already exists for this roster assignment.',
  },
  {
    pattern: 'hr_outlet_geofence_policies',
    code: 'HR_GEOFENCE_POLICY_EXISTS',
    message: 'A geofence policy already exists for this outlet.',
  },
  {
    pattern: 'hr_shift_nozzle_assignments',
    code: 'HR_NOZZLE_ALREADY_ASSIGNED',
    message: 'This nozzle is already assigned for this shift and date.',
  },
  {
    pattern: 'uniform_item_variants',
    code: 'UNIFORM_VARIANT_SKU_EXISTS',
    message: 'A uniform variant with this SKU or size already exists.',
  },
  {
    pattern: 'uniform_items',
    code: 'UNIFORM_ITEM_CODE_EXISTS',
    message: 'A uniform item with this code already exists.',
  },
  {
    pattern: 'uniform_stock_transactions',
    code: 'UNIFORM_OPENING_BALANCE_EXISTS',
    message: 'An opening balance already exists for this uniform variant at this outlet.',
  },
  {
    pattern: 'hr_leave_requests',
    code: 'HR_LEAVE_OVERLAP',
    message: 'An active leave request already exists for this staff member and date range.',
  },
  {
    pattern: 'org_departments',
    code: 'DUPLICATE_DEPARTMENT_CODE',
    message: 'A department with this code or name already exists.',
  },
  {
    pattern: 'org_officer_postings',
    code: 'DUPLICATE_POSTING',
    message: 'An active posting already exists for this officer, role, and scope.',
  },
  {
    pattern: 'uq_org_officer_postings_active',
    code: 'DUPLICATE_POSTING',
    message: 'An active posting already exists for this officer, role, and scope.',
  },
  {
    pattern: 'org_officers',
    code: 'DUPLICATE_OFFICER',
    message: 'An officer with this employee code or email already exists.',
  },
  {
    pattern: 'outlet_service_provider_assignments',
    code: 'DUPLICATE_ASSIGNMENT',
    message: 'This service provider is already actively assigned to this outlet.',
  },
  {
    pattern: 'uq_outlet_sp_assignments_natural',
    code: 'DUPLICATE_ASSIGNMENT',
    message: 'This service provider is already actively assigned to this outlet.',
  },
  {
    pattern: 'service_providers',
    code: 'DUPLICATE_PROVIDER_CODE',
    message: 'A service provider with this provider code already exists.',
  },
  {
    pattern: 'user_scope_assignments',
    code: 'SCOPE_ASSIGNMENT_EXISTS',
    message: 'User already holds this organizational scope assignment.',
  },
  {
    pattern: 'uq_user_scope_assignments_natural',
    code: 'SCOPE_ASSIGNMENT_EXISTS',
    message: 'User already holds this organizational scope assignment.',
  },
  {
    pattern: 'outlet_user_assignments',
    code: 'OUTLET_ASSIGNMENT_EXISTS',
    message: 'User already has this assignment type for this retail outlet.',
  },
];

export function mapDatabaseUniqueError(err: unknown): MappedDuplicateError | null {
  const rawMessage = String(
    (err as any)?.message || (err as any)?.cause?.message || err || ''
  );

  if (!rawMessage.includes('UNIQUE constraint failed')) {
    return null;
  }

  for (const entry of UNIQUE_CONSTRAINT_MAP) {
    if (rawMessage.includes(entry.pattern)) {
      return {
        code: entry.code,
        message: entry.message,
        status: 409,
      };
    }
  }

  return {
    code: 'DUPLICATE_RECORD',
    message: 'A record with the same unique business identity already exists.',
    status: 409,
  };
}
