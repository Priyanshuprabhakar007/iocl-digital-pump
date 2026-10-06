import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  empCode: text('emp_code').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  passwordHash: text('password_hash').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_users_email').on(table.email),
  index('idx_users_emp_code').on(table.empCode),
  index('idx_users_status').on(table.status),
]);

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
});

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
});

export const rolePermissions = sqliteTable('role_permissions', {
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: text('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionId] }),
  index('idx_rp_role_id').on(table.roleId),
]);

export const userRoles = sqliteTable('user_roles', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.userId, table.roleId] }),
  index('idx_ur_user_id').on(table.userId),
]);

export const states = sqliteTable('states', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const divisions = sqliteTable('divisions', {
  id: text('id').primaryKey(),
  stateId: text('state_id').notNull().references(() => states.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_divisions_state_id').on(table.stateId),
]);

export const salesAreas = sqliteTable('sales_areas', {
  id: text('id').primaryKey(),
  divisionId: text('division_id').notNull().references(() => divisions.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_sales_areas_division_id').on(table.divisionId),
]);

export const retailOutlets = sqliteTable('retail_outlets', {
  id: text('id').primaryKey(),
  roCode: text('ro_code').notNull().unique(),
  name: text('name').notNull(),
  outletType: text('outlet_type', { enum: ['COCO', 'CODO', 'A_SITE'] }).notNull(),
  stateId: text('state_id').notNull().references(() => states.id),
  divisionId: text('division_id').notNull().references(() => divisions.id),
  salesAreaId: text('sales_area_id').notNull().references(() => salesAreas.id),
  address: text('address').notNull(),
  city: text('city').notNull(),
  district: text('district').notNull(),
  pincode: text('pincode').notNull(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_outlets_ro_code').on(table.roCode),
  index('idx_outlets_state_id').on(table.stateId),
  index('idx_outlets_division_id').on(table.divisionId),
  index('idx_outlets_sales_area_id').on(table.salesAreaId),
]);

export const outletUserAssignments = sqliteTable('outlet_user_assignments', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignmentType: text('assignment_type', { enum: ['DEALER', 'CSP', 'INSPECTOR'] }).notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
}, (table) => [
  index('idx_oua_outlet_id').on(table.outletId),
  index('idx_oua_user_id').on(table.userId),
]);

export const userScopeAssignments = sqliteTable('user_scope_assignments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scopeLevel: text('scope_level', { enum: ['GLOBAL', 'STATE', 'DIVISION', 'SALES_AREA', 'OUTLET'] }).notNull(),
  stateId: text('state_id').references(() => states.id, { onDelete: 'set null' }),
  divisionId: text('division_id').references(() => divisions.id, { onDelete: 'set null' }),
  salesAreaId: text('sales_area_id').references(() => salesAreas.id, { onDelete: 'set null' }),
  outletId: text('outlet_id').references(() => retailOutlets.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
}, (table) => [
  index('idx_usa_user_id').on(table.userId),
  index('idx_usa_scope_level').on(table.scopeLevel),
]);

export const userScopes = userScopeAssignments;

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  revokedAt: text('revoked_at'),
}, (table) => [
  index('idx_sessions_user_id').on(table.userId),
  index('idx_sessions_token_hash').on(table.tokenHash),
]);

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  r2Key: text('r2_key').notNull().unique(),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  outletId: text('outlet_id').references(() => retailOutlets.id, { onDelete: 'set null' }),
  uploadedByUserId: text('uploaded_by_user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_documents_outlet_id').on(table.outletId),
  index('idx_documents_uploaded_by').on(table.uploadedByUserId),
]);

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  oldValueJson: text('old_value_json'),
  newValueJson: text('new_value_json'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_audit_logs_user_id').on(table.userId),
  index('idx_audit_logs_entity').on(table.entityType, table.entityId),
]);

// ==========================================
// Phase 2A & Hardening: Pump Operations & Shift Foundation
// ==========================================

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  unit: text('unit', { enum: ['LITRE', 'KG'] }).notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_products_code_unique').on(table.code),
  index('idx_products_category').on(table.category),
  index('idx_products_status').on(table.status),
]);

export const outletProducts = sqliteTable('outlet_products', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_outlet_products_unique').on(table.outletId, table.productId),
  index('idx_op_outlet_id').on(table.outletId),
  index('idx_op_product_id').on(table.productId),
]);

export const tanks = sqliteTable('tanks', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  tankNumber: integer('tank_number').notNull(),
  name: text('name').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  capacityLitres: real('capacity_litres').notNull(),
  safeFillCapacityLitres: real('safe_fill_capacity_litres').notNull(),
  minimumOperatingLevelLitres: real('minimum_operating_level_litres').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'] }).notNull().default('ACTIVE'),
  commissionedAt: text('commissioned_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_tanks_outlet_tank_num').on(table.outletId, table.tankNumber),
  index('idx_tanks_outlet_id').on(table.outletId),
  index('idx_tanks_product_id').on(table.productId),
]);

export const dispensers = sqliteTable('dispensers', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  dispenserNumber: integer('dispenser_number').notNull(),
  name: text('name').notNull(),
  manufacturer: text('manufacturer'),
  model: text('model'),
  serialNumber: text('serial_number'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'] }).notNull().default('ACTIVE'),
  commissionedAt: text('commissioned_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_dispensers_outlet_disp_num').on(table.outletId, table.dispenserNumber),
  uniqueIndex('idx_dispensers_serial_number_unique').on(table.serialNumber).where(sql`serial_number IS NOT NULL`),
  index('idx_dispensers_outlet_id').on(table.outletId),
  index('idx_dispensers_serial').on(table.serialNumber),
]);

export const nozzles = sqliteTable('nozzles', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  dispenserId: text('dispenser_id').notNull().references(() => dispensers.id, { onDelete: 'cascade' }),
  nozzleNumber: integer('nozzle_number').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_nozzles_disp_nozzle_num').on(table.dispenserId, table.nozzleNumber),
  index('idx_nozzles_outlet_id').on(table.outletId),
  index('idx_nozzles_dispenser_id').on(table.dispenserId),
  index('idx_nozzles_tank_id').on(table.tankId),
  index('idx_nozzles_product_id').on(table.productId),
]);

export const shiftTemplates = sqliteTable('shift_templates', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  sequence: integer('sequence').notNull().default(1),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_shift_templates_outlet_code').on(table.outletId, table.code),
  index('idx_shift_templates_outlet_id').on(table.outletId),
]);

export const operationalShifts = sqliteTable('operational_shifts', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  shiftTemplateId: text('shift_template_id').notNull().references(() => shiftTemplates.id),
  businessDate: text('business_date').notNull(),
  startedAt: text('started_at').notNull(),
  closedAt: text('closed_at'),
  status: text('status', { enum: ['OPEN', 'CLOSING', 'CLOSED', 'LOCKED'] }).notNull().default('OPEN'),
  openedByUserId: text('opened_by_user_id').notNull().references(() => users.id),
  closedByUserId: text('closed_by_user_id').references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_op_shifts_unique').on(table.outletId, table.shiftTemplateId, table.businessDate),
  uniqueIndex('idx_operational_shifts_single_active').on(table.outletId).where(sql`status IN ('OPEN', 'CLOSING')`),
  index('idx_op_shifts_outlet_id').on(table.outletId),
  index('idx_op_shifts_business_date').on(table.businessDate),
  index('idx_op_shifts_status').on(table.status),
]);

// Phase 2A Hardening: Historical Shift Nozzles Snapshot
export const operationalShiftNozzles = sqliteTable('operational_shift_nozzles', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  nozzleId: text('nozzle_id').notNull().references(() => nozzles.id),
  dispenserId: text('dispenser_id').notNull().references(() => dispensers.id),
  dispenserNumber: integer('dispenser_number').notNull(),
  dispenserName: text('dispenser_name').notNull(),
  nozzleNumber: integer('nozzle_number').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  productCode: text('product_code').notNull(),
  productName: text('product_name').notNull(),
  productCategory: text('product_category').notNull(),
  productUnit: text('product_unit').notNull(),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  tankNumber: integer('tank_number').notNull(),
  snapshotStatus: text('snapshot_status').notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_osn_shift_nozzle_unique').on(table.operationalShiftId, table.nozzleId),
  index('idx_osn_shift_id').on(table.operationalShiftId),
  index('idx_osn_outlet_id').on(table.outletId),
  index('idx_osn_nozzle_id').on(table.nozzleId),
]);

export const nozzleMeterReadings = sqliteTable('nozzle_meter_readings', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  nozzleId: text('nozzle_id').notNull().references(() => nozzles.id),
  openingTotalizerMilliunits: integer('opening_totalizer_milliunits').notNull(),
  closingTotalizerMilliunits: integer('closing_totalizer_milliunits').notNull(),
  testingQuantityMilliunits: integer('testing_quantity_milliunits').notNull().default(0),
  grossSalesQuantityMilliunits: integer('gross_sales_quantity_milliunits').notNull(),
  netSalesQuantityMilliunits: integer('net_sales_quantity_milliunits').notNull(),
  openingVarianceMilliunits: integer('opening_variance_milliunits').notNull().default(0),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  hasOpeningVariance: integer('has_opening_variance', { mode: 'boolean' }).notNull().default(false),
  varianceReason: text('variance_reason'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_nmr_shift_nozzle_unique').on(table.operationalShiftId, table.nozzleId),
  index('idx_nmr_shift_id').on(table.operationalShiftId),
  index('idx_nmr_nozzle_id').on(table.nozzleId),
  index('idx_nmr_outlet_id').on(table.outletId),
]);

export const nozzleUnavailabilityRecords = sqliteTable('nozzle_unavailability_records', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  nozzleId: text('nozzle_id').notNull().references(() => nozzles.id),
  reason: text('reason').notNull(),
  recordedBy: text('recorded_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_nur_shift_nozzle_unique').on(table.operationalShiftId, table.nozzleId),
  index('idx_nur_shift_id').on(table.operationalShiftId),
  index('idx_nur_nozzle_id').on(table.nozzleId),
]);

// ==========================================
// Phase 2B: Tank Stock, Calibration, Fuel Receipt & Reconciliation
// ==========================================

export const tankCalibrationPoints = sqliteTable('tank_calibration_points', {
  id: text('id').primaryKey(),
  tankId: text('tank_id').notNull().references(() => tanks.id, { onDelete: 'cascade' }),
  dipMillimetresMilliunits: integer('dip_millimetres_milliunits').notNull(),
  volumeMilliunits: integer('volume_milliunits').notNull(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_tcp_tank_dip').on(table.tankId, table.dipMillimetresMilliunits),
  index('idx_tcp_tank_id').on(table.tankId),
]);

export const operationalShiftTanks = sqliteTable('operational_shift_tanks', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  tankNumber: integer('tank_number').notNull(),
  tankName: text('tank_name').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  productCode: text('product_code').notNull(),
  productName: text('product_name').notNull(),
  productUnit: text('product_unit').notNull().default('LITRE'),
  capacityMilliunits: integer('capacity_milliunits').notNull(),
  safeFillCapacityMilliunits: integer('safe_fill_capacity_milliunits').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_ost_shift_tank').on(table.operationalShiftId, table.tankId),
  index('idx_ost_shift_id').on(table.operationalShiftId),
  index('idx_ost_outlet_id').on(table.outletId),
]);

export const tankStockReadings = sqliteTable('tank_stock_readings', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  productId: text('product_id').notNull().references(() => products.id),
  readingType: text('reading_type', { enum: ['OPENING', 'CLOSING', 'PRE_RECEIPT', 'POST_RECEIPT', 'ADHOC'] }).notNull(),
  source: text('source', { enum: ['MANUAL', 'ATG'] }).notNull(),
  productDipMmMilliunits: integer('product_dip_mm_milliunits').notNull(),
  waterDipMmMilliunits: integer('water_dip_mm_milliunits').notNull().default(0),
  grossObservedVolumeMilliunits: integer('gross_observed_volume_milliunits').notNull(),
  waterVolumeMilliunits: integer('water_volume_milliunits').notNull().default(0),
  netProductVolumeMilliunits: integer('net_product_volume_milliunits').notNull(),
  recordedAt: text('recorded_at').notNull(),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_tsr_single_opening').on(table.operationalShiftId, table.tankId).where(sql`reading_type = 'OPENING'`),
  uniqueIndex('idx_tsr_single_closing').on(table.operationalShiftId, table.tankId).where(sql`reading_type = 'CLOSING'`),
  index('idx_tsr_shift_id').on(table.operationalShiftId),
  index('idx_tsr_outlet_id').on(table.outletId),
  index('idx_tsr_tank_id').on(table.tankId),
]);

export const fuelReceipts = sqliteTable('fuel_receipts', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  ttNumber: text('tt_number').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  invoiceDate: text('invoice_date').notNull(),
  arrivalAt: text('arrival_at').notNull(),
  decantationStartedAt: text('decantation_started_at'),
  decantationCompletedAt: text('decantation_completed_at'),
  sealVerified: integer('seal_verified', { mode: 'boolean' }).notNull().default(true),
  sealExceptionReason: text('seal_exception_reason'),
  status: text('status', { enum: ['ARRIVED', 'VERIFIED', 'DECANTED', 'COMPLETED', 'CANCELLED'] }).notNull().default('ARRIVED'),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_fr_outlet_id').on(table.outletId),
  index('idx_fr_shift_id').on(table.operationalShiftId),
]);

export const fuelReceiptTankLines = sqliteTable('fuel_receipt_tank_lines', {
  id: text('id').primaryKey(),
  fuelReceiptId: text('fuel_receipt_id').notNull().references(() => fuelReceipts.id, { onDelete: 'cascade' }),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  productId: text('product_id').notNull().references(() => products.id),
  invoiceQuantityMilliunits: integer('invoice_quantity_milliunits').notNull(),
  preDecantReadingId: text('pre_decant_reading_id').references(() => tankStockReadings.id),
  postDecantReadingId: text('post_decant_reading_id').references(() => tankStockReadings.id),
  measuredReceivedQuantityMilliunits: integer('measured_received_quantity_milliunits'),
  receiptVarianceMilliunits: integer('receipt_variance_milliunits'),
  densityMilliunits: integer('density_milliunits'),
  temperatureMilliunits: integer('temperature_milliunits'),
  invoiceDensityMilliunits: integer('invoice_density_milliunits'),
  densityVarianceMilliunits: integer('density_variance_milliunits'),
  qualityStatus: text('quality_status', { enum: ['PASS', 'OUT_OF_TOLERANCE', 'NOT_EVALUATED'] }).notNull().default('NOT_EVALUATED'),
  appliedToleranceSettingId: text('applied_tolerance_setting_id').references(() => qualityToleranceSettings.id),
  appliedDensityToleranceMilliunits: integer('applied_density_tolerance_milliunits'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_frtl_unique_pre_reading').on(table.preDecantReadingId).where(sql`pre_decant_reading_id IS NOT NULL`),
  uniqueIndex('idx_frtl_unique_post_reading').on(table.postDecantReadingId).where(sql`post_decant_reading_id IS NOT NULL`),
  index('idx_frtl_receipt_id').on(table.fuelReceiptId),
  index('idx_frtl_tank_id').on(table.tankId),
]);

export const qualityToleranceSettings = sqliteTable('quality_tolerance_settings', {
  id: text('id').primaryKey(),
  scopeType: text('scope_type', { enum: ['GLOBAL', 'STATE', 'DIVISION', 'OUTLET'] }).notNull(),
  scopeEntityId: text('scope_entity_id'),
  productId: text('product_id').references(() => products.id),
  densityToleranceMilliunits: integer('density_tolerance_milliunits').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  index('idx_qts_scope').on(table.scopeType, table.scopeEntityId),
  index('idx_qts_product').on(table.productId),
]);

export const shiftStockReconciliations = sqliteTable('shift_stock_reconciliations', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  productId: text('product_id').notNull().references(() => products.id),
  openingStockMilliunits: integer('opening_stock_milliunits').notNull(),
  receiptQuantityMilliunits: integer('receipt_quantity_milliunits').notNull().default(0),
  salesQuantityMilliunits: integer('sales_quantity_milliunits').notNull().default(0),
  theoreticalClosingStockMilliunits: integer('theoretical_closing_stock_milliunits').notNull(),
  physicalClosingStockMilliunits: integer('physical_closing_stock_milliunits').notNull(),
  varianceMilliunits: integer('variance_milliunits').notNull(),
  varianceStatus: text('variance_status', { enum: ['GAIN', 'LOSS', 'BALANCED'] }).notNull(),
  calculatedAt: text('calculated_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_ssr_shift_tank').on(table.operationalShiftId, table.tankId),
  index('idx_ssr_shift_id').on(table.operationalShiftId),
  index('idx_ssr_outlet_id').on(table.outletId),
]);

export const outletProductPrices = sqliteTable('outlet_product_prices', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  productId: text('product_id').notNull().references(() => products.id),
  pricePaisePerUnit: integer('price_paise_per_unit').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  index('idx_opp_outlet_product').on(table.outletId, table.productId),
]);

export const operationalShiftProductPrices = sqliteTable('operational_shift_product_prices', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  productId: text('product_id').notNull().references(() => products.id),
  productCode: text('product_code').notNull(),
  productName: text('product_name').notNull(),
  unit: text('unit').notNull(),
  productCategory: text('product_category'),
  pricePaisePerUnit: integer('price_paise_per_unit').notNull(),
  sourcePriceId: text('source_price_id').notNull().references(() => outletProductPrices.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_shift_product_price').on(table.operationalShiftId, table.productId),
  index('idx_ospp_shift').on(table.operationalShiftId),
]);

export const creditParties = sqliteTable('credit_parties', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  partyCode: text('party_code').notNull(),
  partyName: text('party_name').notNull(),
  contactName: text('contact_name'),
  phone: text('phone'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_outlet_party_code').on(table.outletId, table.partyCode),
  index('idx_cp_outlet_status').on(table.outletId, table.status),
]);

export const shiftCollections = sqliteTable('shift_collections', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  collectionType: text('collection_type', { enum: ['CASH', 'POS_CARD', 'UPI', 'FLEET_CARD', 'CREDIT_SALE', 'DIRECT_BANK_DROP'] }).notNull(),
  amountPaise: integer('amount_paise').notNull(),
  provider: text('provider'),
  referenceNumber: text('reference_number'),
  creditPartyId: text('credit_party_id').references(() => creditParties.id),
  creditPartyCodeSnapshot: text('credit_party_code_snapshot'),
  creditPartyNameSnapshot: text('credit_party_name_snapshot'),
  collectedAt: text('collected_at').notNull(),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_sc_shift_outlet').on(table.operationalShiftId, table.outletId),
]);

export const cashHandoverLogs = sqliteTable('cash_handover_logs', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  amountPaise: integer('amount_paise').notNull(),
  handedOverByUserId: text('handed_over_by_user_id').notNull().references(() => users.id),
  receivedByUserId: text('received_by_user_id').references(() => users.id),
  handedOverAt: text('handed_over_at').notNull(),
  receivedAt: text('received_at'),
  status: text('status', { enum: ['PENDING', 'ACKNOWLEDGED', 'DISPUTED'] }).notNull().default('PENDING'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_chl_shift_outlet').on(table.operationalShiftId, table.outletId),
]);

export const bankDeposits = sqliteTable('bank_deposits', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  depositChannel: text('deposit_channel', { enum: ['BANK_BRANCH', 'CASH_DROP_BOX'] }).notNull(),
  amountPaise: integer('amount_paise').notNull(),
  depositDate: text('deposit_date').notNull(),
  referenceNumber: text('reference_number'),
  documentId: text('document_id').references(() => documents.id),
  status: text('status', { enum: ['SUBMITTED', 'VERIFIED', 'REJECTED'] }).notNull().default('SUBMITTED'),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  verifiedByUserId: text('verified_by_user_id').references(() => users.id),
  verifiedAt: text('verified_at'),
  rejectionReason: text('rejection_reason'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_bd_shift_outlet_status').on(table.operationalShiftId, table.outletId, table.status),
]);

export const shiftFinancialReconciliations = sqliteTable('shift_financial_reconciliations', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id).unique(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  fuelSalesRevenuePaise: integer('fuel_sales_revenue_paise').notNull(),
  cngSalesRevenuePaise: integer('cng_sales_revenue_paise'),
  lubeSalesRevenuePaise: integer('lube_sales_revenue_paise'),
  authoritativeSalesRevenuePaise: integer('authoritative_sales_revenue_paise').notNull(),
  cashCollectionPaise: integer('cash_collection_paise').notNull(),
  posCollectionPaise: integer('pos_collection_paise').notNull(),
  upiCollectionPaise: integer('upi_collection_paise').notNull(),
  fleetCardCollectionPaise: integer('fleet_card_collection_paise').notNull(),
  creditSalesPaise: integer('credit_sales_paise').notNull(),
  directBankDropPaise: integer('direct_bank_drop_paise').notNull(),
  totalCollectionsPaise: integer('total_collections_paise').notNull(),
  salesCollectionVariancePaise: integer('sales_collection_variance_paise').notNull(),
  varianceStatus: text('variance_status', { enum: ['BALANCED', 'SHORTAGE', 'EXCESS'] }).notNull(),
  varianceReason: text('variance_reason'),
  calculatedAt: text('calculated_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const cngShiftLogs = sqliteTable('cng_shift_logs', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id).unique(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  mfmOpeningKgMilliunits: integer('mfm_opening_kg_milliunits').notNull(),
  mfmClosingKgMilliunits: integer('mfm_closing_kg_milliunits').notNull(),
  netSalesKgMilliunits: integer('net_sales_kg_milliunits').notNull(),
  gridIntakeKgMilliunits: integer('grid_intake_kg_milliunits'),
  gridSalesVarianceKgMilliunits: integer('grid_sales_variance_kg_milliunits'),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_cng_shift_logs_outlet_id').on(table.outletId),
  index('idx_cng_shift_logs_shift_id').on(table.operationalShiftId),
  check('mfm_opening_kg_milliunits_check', sql`${table.mfmOpeningKgMilliunits} >= 0`),
  check('mfm_closing_kg_milliunits_check', sql`${table.mfmClosingKgMilliunits} >= ${table.mfmOpeningKgMilliunits}`),
  check('net_sales_kg_milliunits_check', sql`${table.netSalesKgMilliunits} = ${table.mfmClosingKgMilliunits} - ${table.mfmOpeningKgMilliunits}`),
  check('grid_consistency_check', sql`
    (${table.gridIntakeKgMilliunits} IS NULL AND ${table.gridSalesVarianceKgMilliunits} IS NULL) OR
    (${table.gridIntakeKgMilliunits} IS NOT NULL AND ${table.gridIntakeKgMilliunits} >= 0 AND ${table.gridSalesVarianceKgMilliunits} = ${table.gridIntakeKgMilliunits} - ${table.netSalesKgMilliunits})
  `),
]);

export const cngPressureReadings = sqliteTable('cng_pressure_readings', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  recordedAt: text('recorded_at').notNull(),
  pressureUnit: text('pressure_unit').notNull(),
  suctionPressureMilliunits: integer('suction_pressure_milliunits'),
  dischargePressureMilliunits: integer('discharge_pressure_milliunits'),
  cascadePressureMilliunits: integer('cascade_pressure_milliunits'),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_cng_pressure_readings_shift_at').on(table.operationalShiftId, table.recordedAt),
  index('idx_cng_pressure_readings_outlet_at').on(table.outletId, table.recordedAt),
  check('suction_pressure_milliunits_check', sql`${table.suctionPressureMilliunits} IS NULL OR ${table.suctionPressureMilliunits} >= 0`),
  check('discharge_pressure_milliunits_check', sql`${table.dischargePressureMilliunits} IS NULL OR ${table.dischargePressureMilliunits} >= 0`),
  check('cascade_pressure_milliunits_check', sql`${table.cascadePressureMilliunits} IS NULL OR ${table.cascadePressureMilliunits} >= 0`),
  check('at_least_one_pressure_check', sql`${table.suctionPressureMilliunits} IS NOT NULL OR ${table.dischargePressureMilliunits} IS NOT NULL OR ${table.cascadePressureMilliunits} IS NOT NULL`),
]);

// ==========================================
// Phase 3B-1: Lube & Auxiliary Inventory Tables
// ==========================================

export const lubeSkus = sqliteTable('lube_skus', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  skuCode: text('sku_code').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  stockUnit: text('stock_unit', { enum: ['LITRE', 'PACK'] }).notNull(),
  reorderThresholdSubunits: integer('reorder_threshold_subunits').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_lube_skus_outlet_code_unique').on(table.outletId, table.skuCode),
  index('idx_lube_skus_outlet_id').on(table.outletId),
  index('idx_lube_skus_outlet_code').on(table.outletId, table.skuCode),
  check('lube_skus_stock_unit_check', sql`${table.stockUnit} IN ('LITRE', 'PACK')`),
  check('lube_skus_status_check', sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
  check('lube_skus_reorder_threshold_check', sql`${table.reorderThresholdSubunits} >= 0`),
]);

export const lubeSkuPrices = sqliteTable('lube_sku_prices', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  lubeSkuId: text('lube_sku_id').notNull().references(() => lubeSkus.id),
  pricePaisePerUnit: integer('price_paise_per_unit').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  index('idx_lube_sku_prices_sku_outlet').on(table.outletId, table.lubeSkuId, table.status),
  check('lube_sku_prices_price_check', sql`${table.pricePaisePerUnit} > 0`),
  check('lube_sku_prices_status_check', sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
  check('lube_sku_prices_range_check', sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`),
]);

export const lubeStockTransactions = sqliteTable('lube_stock_transactions', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  lubeSkuId: text('lube_sku_id').notNull().references(() => lubeSkus.id),
  transactionType: text('transaction_type', { enum: ['OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] }).notNull(),
  quantitySubunits: integer('quantity_subunits').notNull(),
  occurredAt: text('occurred_at').notNull(),
  referenceNumber: text('reference_number'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_lube_tx_sku_outlet').on(table.outletId, table.lubeSkuId),
  index('idx_lube_tx_occurred_at').on(table.occurredAt),
  check('lube_tx_type_check', sql`${table.transactionType} IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')`),
  check('lube_tx_qty_check', sql`${table.quantitySubunits} > 0`),
  check('lube_tx_notes_check', sql`(${table.transactionType} NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')) OR (${table.notes} IS NOT NULL AND trim(${table.notes}) != '')`),
]);

export const lubeShiftSales = sqliteTable('lube_shift_sales', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  lubeSkuId: text('lube_sku_id').notNull().references(() => lubeSkus.id),
  skuCode: text('sku_code').notNull(),
  skuName: text('sku_name').notNull(),
  category: text('category').notNull(),
  stockUnit: text('stock_unit', { enum: ['LITRE', 'PACK'] }).notNull(),
  quantitySubunits: integer('quantity_subunits').notNull(),
  unitPricePaise: integer('unit_price_paise').notNull(),
  revenuePaise: integer('revenue_paise').notNull(),
  soldAt: text('sold_at').notNull(),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_lube_sales_shift').on(table.operationalShiftId),
  index('idx_lube_sales_sku').on(table.lubeSkuId),
  index('idx_lube_sales_outlet').on(table.outletId),
  check('lube_sales_qty_check', sql`${table.quantitySubunits} > 0`),
  check('lube_sales_unit_price_check', sql`${table.unitPricePaise} > 0`),
  check('lube_sales_revenue_check', sql`${table.revenuePaise} >= 0`),
  check('lube_sales_stock_unit_check', sql`${table.stockUnit} IN ('LITRE', 'PACK')`),
]);

// ==========================================
// Phase 3C-1: Equipment Breakdown Management Tables
// ==========================================

export const equipmentAssets = sqliteTable('equipment_assets', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  assetCode: text('asset_code').notNull(),
  equipmentType: text('equipment_type').notNull(),
  name: text('name').notNull(),
  manufacturer: text('manufacturer'),
  model: text('model'),
  serialNumber: text('serial_number'),
  status: text('status').notNull().default('ACTIVE'),
  commissionedAt: text('commissioned_at'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_eq_assets_outlet_code_unique').on(table.outletId, table.assetCode),
  uniqueIndex('idx_eq_assets_outlet_serial_unique').on(table.outletId, table.serialNumber).where(sql`serial_number IS NOT NULL`),
  index('idx_eq_assets_outlet_id').on(table.outletId),
  index('idx_eq_assets_type').on(table.equipmentType),
  index('idx_eq_assets_status').on(table.status),
  check('eq_assets_type_check', sql`${table.equipmentType} IN ('ATG', 'AIR_COMPRESSOR', 'CNG_COMPRESSOR', 'DG_SET', 'OTHER')`),
  check('eq_assets_status_check', sql`${table.status} IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED')`),
  check('eq_assets_code_check', sql`trim(${table.assetCode}) <> ''`),
  check('eq_assets_name_check', sql`trim(${table.name}) <> ''`),
]);

export const equipmentBreakdownTickets = sqliteTable('equipment_breakdown_tickets', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  dispenserId: text('dispenser_id').references(() => dispensers.id),
  equipmentAssetId: text('equipment_asset_id').references(() => equipmentAssets.id),
  equipmentTypeSnapshot: text('equipment_type_snapshot').notNull(),
  equipmentLabelSnapshot: text('equipment_label_snapshot').notNull(),
  priority: text('priority').notNull(),
  failureCategory: text('failure_category').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('OPEN'),
  breakdownAt: text('breakdown_at').notNull(),
  technicianName: text('technician_name'),
  technicianPhone: text('technician_phone'),
  assignedAt: text('assigned_at'),
  assignedByUserId: text('assigned_by_user_id').references(() => users.id),
  resolutionNotes: text('resolution_notes'),
  resolvedAt: text('resolved_at'),
  resolvedByUserId: text('resolved_by_user_id').references(() => users.id),
  downtimeSeconds: integer('downtime_seconds'),
  signoffNotes: text('signoff_notes'),
  signedOffAt: text('signed_off_at'),
  signedOffByUserId: text('signed_off_by_user_id').references(() => users.id),
  cancelReason: text('cancel_reason'),
  cancelledAt: text('cancelled_at'),
  cancelledByUserId: text('cancelled_by_user_id').references(() => users.id),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_eq_tickets_outlet_id').on(table.outletId),
  index('idx_eq_tickets_dispenser_id').on(table.dispenserId),
  index('idx_eq_tickets_asset_id').on(table.equipmentAssetId),
  index('idx_eq_tickets_status').on(table.status),
  index('idx_eq_tickets_priority').on(table.priority),
  index('idx_eq_tickets_breakdown_at').on(table.breakdownAt),
  index('idx_eq_tickets_type_snapshot').on(table.equipmentTypeSnapshot),
  check('eq_tickets_target_check', sql`(${table.dispenserId} IS NOT NULL AND ${table.equipmentAssetId} IS NULL) OR (${table.dispenserId} IS NULL AND ${table.equipmentAssetId} IS NOT NULL)`),
  check('eq_tickets_type_check', sql`${table.equipmentTypeSnapshot} IN ('DISPENSER', 'ATG', 'AIR_COMPRESSOR', 'CNG_COMPRESSOR', 'DG_SET', 'OTHER')`),
  check('eq_tickets_priority_check', sql`${table.priority} IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`),
  check('eq_tickets_cat_check', sql`${table.failureCategory} IN ('ELECTRICAL', 'MECHANICAL', 'ELECTRONICS', 'COMMUNICATION', 'CALIBRATION', 'PRESSURE', 'LEAKAGE', 'POWER', 'SOFTWARE', 'OTHER')`),
  check('eq_tickets_status_check', sql`${table.status} IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED')`),
  check('eq_tickets_desc_check', sql`trim(${table.description}) <> ''`),
  check('eq_tickets_downtime_check', sql`${table.downtimeSeconds} IS NULL OR ${table.downtimeSeconds} >= 0`),
  check('eq_tickets_resolved_check', sql`${table.status} NOT IN ('RESOLVED', 'CLOSED') OR (${table.resolutionNotes} IS NOT NULL AND trim(${table.resolutionNotes}) <> '' AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedByUserId} IS NOT NULL AND ${table.downtimeSeconds} IS NOT NULL AND ${table.downtimeSeconds} >= 0)`),
  check('eq_tickets_closed_check', sql`${table.status} != 'CLOSED' OR (${table.signedOffAt} IS NOT NULL AND ${table.signedOffByUserId} IS NOT NULL)`),
  check('eq_tickets_cancelled_check', sql`${table.status} != 'CANCELLED' OR (${table.cancelReason} IS NOT NULL AND trim(${table.cancelReason}) <> '' AND ${table.cancelledAt} IS NOT NULL AND ${table.cancelledByUserId} IS NOT NULL)`),
]);

export const equipmentBreakdownEvents = sqliteTable('equipment_breakdown_events', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull().references(() => equipmentBreakdownTickets.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  notes: text('notes'),
  actorUserId: text('actor_user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_eq_events_ticket_id').on(table.ticketId),
  index('idx_eq_events_ticket_created').on(table.ticketId, table.createdAt),
  check('eq_events_type_check', sql`${table.eventType} IN ('CREATED', 'ASSIGNED', 'REASSIGNED', 'WORK_STARTED', 'RESOLVED', 'SIGNED_OFF', 'CANCELLED')`),
  check('eq_events_from_status_check', sql`${table.fromStatus} IS NULL OR ${table.fromStatus} IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED')`),
  check('eq_events_to_status_check', sql`${table.toStatus} IS NULL OR ${table.toStatus} IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED')`),
]);

// ============================================================================
// Phase 4A-1: Utilities (Electricity & Sub-meters)
// ============================================================================

export const utilityElectricityAccounts = sqliteTable('utility_electricity_accounts', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  consumerNumber: text('consumer_number').notNull(),
  providerName: text('provider_name'),
  billingCycle: text('billing_cycle').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_util_elec_acc_outlet_consumer').on(table.outletId, table.consumerNumber),
  index('idx_util_elec_acc_outlet_id').on(table.outletId),
  index('idx_util_elec_acc_status').on(table.status),
  check('util_elec_acc_status_check', sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
  check('util_elec_acc_consumer_check', sql`trim(${table.consumerNumber}) <> ''`),
  check('util_elec_acc_cycle_check', sql`trim(${table.billingCycle}) <> ''`),
]);

export const utilityElectricityBills = sqliteTable('utility_electricity_bills', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  electricityAccountId: text('electricity_account_id').notNull().references(() => utilityElectricityAccounts.id),
  billingPeriodStart: text('billing_period_start').notNull(),
  billingPeriodEnd: text('billing_period_end').notNull(),
  billAmountPaise: integer('bill_amount_paise').notNull(),
  dueDate: text('due_date').notNull(),
  billDocumentId: text('bill_document_id').notNull().references(() => documents.id),
  status: text('status', { enum: ['PENDING', 'PAID'] }).notNull().default('PENDING'),
  paymentReceiptDocumentId: text('payment_receipt_document_id').references(() => documents.id),
  paymentReference: text('payment_reference'),
  paidAt: text('paid_at'),
  paidByUserId: text('paid_by_user_id').references(() => users.id),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_util_elec_bills_acc_period').on(table.electricityAccountId, table.billingPeriodStart, table.billingPeriodEnd),
  index('idx_util_elec_bills_outlet_id').on(table.outletId),
  index('idx_util_elec_bills_account_id').on(table.electricityAccountId),
  index('idx_util_elec_bills_status').on(table.status),
  index('idx_util_elec_bills_due_date').on(table.dueDate),
  index('idx_util_elec_bills_period_start').on(table.billingPeriodStart),
  check('util_elec_bills_amount_check', sql`${table.billAmountPaise} >= 0`),
  check('util_elec_bills_start_check', sql`trim(${table.billingPeriodStart}) <> ''`),
  check('util_elec_bills_end_check', sql`trim(${table.billingPeriodEnd}) <> ''`),
  check('util_elec_bills_due_check', sql`trim(${table.dueDate}) <> ''`),
  check('util_elec_bills_period_range_check', sql`${table.billingPeriodEnd} >= ${table.billingPeriodStart}`),
  check('util_elec_bills_status_check', sql`${table.status} IN ('PENDING', 'PAID')`),
  check('util_elec_bills_paid_check', sql`${table.status} != 'PAID' OR (${table.paymentReceiptDocumentId} IS NOT NULL AND ${table.paidAt} IS NOT NULL AND ${table.paidByUserId} IS NOT NULL)`),
]);

export const utilitySubMeters = sqliteTable('utility_sub_meters', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  meterCode: text('meter_code').notNull(),
  name: text('name').notNull(),
  beneficiaryType: text('beneficiary_type', { enum: ['NFR_VENDOR', 'CNG_FACILITY', 'OTHER'] }).notNull(),
  beneficiaryName: text('beneficiary_name').notNull(),
  serialNumber: text('serial_number'),
  ratePaisePerKwh: integer('rate_paise_per_kwh').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'DECOMMISSIONED'] }).notNull().default('ACTIVE'),
  commissionedAt: text('commissioned_at'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_util_sub_meters_outlet_code').on(table.outletId, table.meterCode),
  uniqueIndex('idx_util_sub_meters_outlet_serial').on(table.outletId, table.serialNumber).where(sql`${table.serialNumber} IS NOT NULL AND trim(${table.serialNumber}) <> ''`),
  index('idx_util_sub_meters_outlet_id').on(table.outletId),
  index('idx_util_sub_meters_beneficiary_type').on(table.beneficiaryType),
  index('idx_util_sub_meters_status').on(table.status),
  check('util_sub_meters_type_check', sql`${table.beneficiaryType} IN ('NFR_VENDOR', 'CNG_FACILITY', 'OTHER')`),
  check('util_sub_meters_status_check', sql`${table.status} IN ('ACTIVE', 'INACTIVE', 'DECOMMISSIONED')`),
  check('util_sub_meters_rate_check', sql`${table.ratePaisePerKwh} >= 0`),
  check('util_sub_meters_code_check', sql`trim(${table.meterCode}) <> ''`),
  check('util_sub_meters_name_check', sql`trim(${table.name}) <> ''`),
  check('util_sub_meters_beneficiary_check', sql`trim(${table.beneficiaryName}) <> ''`),
]);

export const utilitySubMeterReadings = sqliteTable('utility_sub_meter_readings', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  subMeterId: text('sub_meter_id').notNull().references(() => utilitySubMeters.id, { onDelete: 'cascade' }),
  previousReadingId: text('previous_reading_id'),
  readingAt: text('reading_at').notNull(),
  readingMilliKwh: integer('reading_millikwh').notNull(),
  previousReadingMilliKwh: integer('previous_reading_millikwh'),
  consumptionMilliKwh: integer('consumption_millikwh').notNull(),
  ratePaisePerKwhSnapshot: integer('rate_paise_per_kwh_snapshot').notNull(),
  chargePaise: integer('charge_paise').notNull(),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_util_sub_meter_readings_prev').on(table.previousReadingId).where(sql`${table.previousReadingId} IS NOT NULL`),
  uniqueIndex('idx_util_sub_meter_readings_single_root').on(table.subMeterId).where(sql`${table.previousReadingId} IS NULL`),
  index('idx_util_sub_meter_readings_meter_time').on(table.subMeterId, table.readingAt),
  index('idx_util_sub_meter_readings_outlet_time').on(table.outletId, table.readingAt),
  check('util_sub_readings_reading_check', sql`${table.readingMilliKwh} >= 0`),
  check('util_sub_readings_consumption_check', sql`${table.consumptionMilliKwh} >= 0`),
  check('util_sub_readings_rate_check', sql`${table.ratePaisePerKwhSnapshot} >= 0`),
  check('util_sub_readings_charge_check', sql`${table.chargePaise} >= 0`),
  check('util_sub_readings_chain_check', sql`(${table.previousReadingId} IS NULL AND ${table.previousReadingMilliKwh} IS NULL AND ${table.consumptionMilliKwh} = 0) OR (${table.previousReadingId} IS NOT NULL AND ${table.previousReadingMilliKwh} IS NOT NULL AND ${table.consumptionMilliKwh} = ${table.readingMilliKwh} - ${table.previousReadingMilliKwh})`),
]);

// ============================================================================
// Phase 4B-1: Municipal Taxes & Statutory Dues
// ============================================================================

export const municipalTaxDues = sqliteTable('municipal_tax_dues', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  taxType: text('tax_type', { enum: ['PROPERTY_TAX', 'TRADE_LICENSE_FEE', 'SIGNAGE_CHARGE', 'LOCAL_AUTHORITY_DUE'] }).notNull(),
  authorityName: text('authority_name').notNull(),
  referenceNumber: text('reference_number').notNull(),
  assessmentFrequency: text('assessment_frequency', { enum: ['ANNUAL', 'QUARTERLY'] }).notNull(),
  assessmentPeriodStart: text('assessment_period_start').notNull(),
  assessmentPeriodEnd: text('assessment_period_end').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  dueDate: text('due_date').notNull(),
  assessmentDocumentId: text('assessment_document_id').references(() => documents.id),
  status: text('status', { enum: ['PENDING', 'PAID'] }).notNull().default('PENDING'),
  paymentReceiptDocumentId: text('payment_receipt_document_id').references(() => documents.id),
  paymentReference: text('payment_reference'),
  paidAt: text('paid_at'),
  paidByUserId: text('paid_by_user_id').references(() => users.id),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_municipal_tax_statutory_identity').on(
    table.outletId,
    table.taxType,
    table.authorityName,
    table.referenceNumber,
    table.assessmentPeriodStart,
    table.assessmentPeriodEnd
  ),
  index('idx_municipal_tax_outlet_id').on(table.outletId),
  index('idx_municipal_tax_outlet_status').on(table.outletId, table.status),
  index('idx_municipal_tax_outlet_due_date').on(table.outletId, table.dueDate),
  index('idx_municipal_tax_outlet_tax_type').on(table.outletId, table.taxType),
  index('idx_municipal_tax_outlet_frequency').on(table.outletId, table.assessmentFrequency),
  index('idx_municipal_tax_period_start').on(table.assessmentPeriodStart),
  index('idx_municipal_tax_reference_number').on(table.referenceNumber),
  check('municipal_tax_type_check', sql`${table.taxType} IN ('PROPERTY_TAX', 'TRADE_LICENSE_FEE', 'SIGNAGE_CHARGE', 'LOCAL_AUTHORITY_DUE')`),
  check('municipal_tax_frequency_check', sql`${table.assessmentFrequency} IN ('ANNUAL', 'QUARTERLY')`),
  check('municipal_tax_status_check', sql`${table.status} IN ('PENDING', 'PAID')`),
  check('municipal_tax_authority_check', sql`trim(${table.authorityName}) <> ''`),
  check('municipal_tax_ref_check', sql`trim(${table.referenceNumber}) <> ''`),
  check('municipal_tax_start_check', sql`trim(${table.assessmentPeriodStart}) <> ''`),
  check('municipal_tax_end_check', sql`trim(${table.assessmentPeriodEnd}) <> ''`),
  check('municipal_tax_due_check', sql`trim(${table.dueDate}) <> ''`),
  check('municipal_tax_period_range_check', sql`${table.assessmentPeriodEnd} >= ${table.assessmentPeriodStart}`),
  check('municipal_tax_amount_check', sql`${table.amountPaise} > 0 AND ${table.amountPaise} <= 9000000000000000`),
  check('municipal_tax_paid_check', sql`(${table.status} = 'PENDING' AND ${table.paymentReceiptDocumentId} IS NULL AND ${table.paidAt} IS NULL AND ${table.paidByUserId} IS NULL) OR (${table.status} = 'PAID' AND ${table.paymentReceiptDocumentId} IS NOT NULL AND ${table.paidAt} IS NOT NULL AND ${table.paidByUserId} IS NOT NULL)`),
]);

// ============================================================================
// Phase 4C-1: NFR / Vendor Lease & Rent Management
// ============================================================================

export const nfrSpaces = sqliteTable('nfr_spaces', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  spaceCode: text('space_code').notNull(),
  name: text('name').notNull(),
  nfrType: text('nfr_type', { enum: ['ATM', 'CONVENIENCE_STORE', 'QSR', 'CAR_WASH', 'EV_CHARGING', 'CANOPY_ADVERTISING'] }).notNull(),
  locationDescription: text('location_description'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_nfr_spaces_outlet_code').on(table.outletId, table.spaceCode),
  index('idx_nfr_spaces_outlet_id').on(table.outletId),
  index('idx_nfr_spaces_outlet_type').on(table.outletId, table.nfrType),
  index('idx_nfr_spaces_outlet_status').on(table.outletId, table.status),
  check('nfr_spaces_type_check', sql`${table.nfrType} IN ('ATM', 'CONVENIENCE_STORE', 'QSR', 'CAR_WASH', 'EV_CHARGING', 'CANOPY_ADVERTISING')`),
  check('nfr_spaces_status_check', sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
  check('nfr_spaces_code_check', sql`trim(${table.spaceCode}) <> ''`),
  check('nfr_spaces_name_check', sql`trim(${table.name}) <> ''`),
]);

export const nfrVendors = sqliteTable('nfr_vendors', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  vendorName: text('vendor_name').notNull(),
  ownerContactName: text('owner_contact_name').notNull(),
  ownerContactPhone: text('owner_contact_phone').notNull(),
  ownerContactEmail: text('owner_contact_email'),
  address: text('address'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_nfr_vendors_outlet_id').on(table.outletId),
  index('idx_nfr_vendors_outlet_status').on(table.outletId, table.status),
  check('nfr_vendors_status_check', sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
  check('nfr_vendors_name_check', sql`trim(${table.vendorName}) <> ''`),
  check('nfr_vendors_contact_check', sql`trim(${table.ownerContactName}) <> ''`),
  check('nfr_vendors_phone_check', sql`trim(${table.ownerContactPhone}) <> ''`),
]);

export const nfrLeases = sqliteTable('nfr_leases', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  spaceId: text('space_id').notNull().references(() => nfrSpaces.id),
  vendorId: text('vendor_id').notNull().references(() => nfrVendors.id),
  agreementNumber: text('agreement_number').notNull(),
  leaseStartDate: text('lease_start_date').notNull(),
  leaseEndDate: text('lease_end_date').notNull(),
  monthlyRentPaise: integer('monthly_rent_paise').notNull(),
  securityDepositPaise: integer('security_deposit_paise').notNull(),
  monthlyDueDay: integer('monthly_due_day').notNull(),
  agreementDocumentId: text('agreement_document_id').references(() => documents.id),
  subMeterId: text('sub_meter_id').references(() => utilitySubMeters.id),
  status: text('status', { enum: ['ACTIVE', 'TERMINATED'] }).notNull().default('ACTIVE'),
  terminatedAt: text('terminated_at'),
  terminationReason: text('termination_reason'),
  terminatedByUserId: text('terminated_by_user_id').references(() => users.id),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_nfr_leases_outlet_agreement').on(table.outletId, table.agreementNumber),
  index('idx_nfr_leases_outlet_id').on(table.outletId),
  index('idx_nfr_leases_space_id').on(table.spaceId),
  index('idx_nfr_leases_vendor_id').on(table.vendorId),
  index('idx_nfr_leases_outlet_status').on(table.outletId, table.status),
  index('idx_nfr_leases_dates').on(table.leaseStartDate, table.leaseEndDate),
  check('nfr_leases_status_check', sql`${table.status} IN ('ACTIVE', 'TERMINATED')`),
  check('nfr_leases_agreement_check', sql`trim(${table.agreementNumber}) <> ''`),
  check('nfr_leases_period_range_check', sql`${table.leaseEndDate} >= ${table.leaseStartDate}`),
  check('nfr_leases_rent_check', sql`${table.monthlyRentPaise} > 0 AND ${table.monthlyRentPaise} <= 9000000000000000`),
  check('nfr_leases_deposit_check', sql`${table.securityDepositPaise} >= 0 AND ${table.securityDepositPaise} <= 9000000000000000`),
  check('nfr_leases_due_day_check', sql`${table.monthlyDueDay} >= 1 AND ${table.monthlyDueDay} <= 31`),
  check('nfr_leases_term_check', sql`(${table.status} = 'ACTIVE' AND ${table.terminatedAt} IS NULL AND ${table.terminatedByUserId} IS NULL) OR (${table.status} = 'TERMINATED' AND ${table.terminatedAt} IS NOT NULL AND ${table.terminatedByUserId} IS NOT NULL)`),
]);

export const nfrRentDues = sqliteTable('nfr_rent_dues', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  leaseId: text('lease_id').notNull().references(() => nfrLeases.id),
  billingMonth: text('billing_month').notNull(),
  rentPeriodStart: text('rent_period_start').notNull(),
  rentPeriodEnd: text('rent_period_end').notNull(),
  dueDate: text('due_date').notNull(),
  monthlyRentPaiseSnapshot: integer('monthly_rent_paise_snapshot').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_nfr_rent_dues_lease_month').on(table.leaseId, table.billingMonth),
  index('idx_nfr_rent_dues_outlet_id').on(table.outletId),
  index('idx_nfr_rent_dues_lease_id').on(table.leaseId),
  index('idx_nfr_rent_dues_due_date').on(table.outletId, table.dueDate),
  index('idx_nfr_rent_dues_billing_month').on(table.billingMonth),
  check('nfr_rent_dues_period_check', sql`${table.rentPeriodEnd} >= ${table.rentPeriodStart}`),
  check('nfr_rent_dues_snapshot_check', sql`${table.monthlyRentPaiseSnapshot} > 0 AND ${table.monthlyRentPaiseSnapshot} <= 9000000000000000`),
  check('nfr_rent_dues_month_check', sql`trim(${table.billingMonth}) <> ''`),
  check('nfr_rent_dues_due_check', sql`trim(${table.dueDate}) <> ''`),
]);

export const nfrRentPayments = sqliteTable('nfr_rent_payments', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  rentDueId: text('rent_due_id').notNull().references(() => nfrRentDues.id),
  amountPaise: integer('amount_paise').notNull(),
  receiptDocumentId: text('receipt_document_id').notNull().references(() => documents.id),
  paymentReference: text('payment_reference'),
  paidAt: text('paid_at').notNull(),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_nfr_rent_payments_outlet_id').on(table.outletId),
  index('idx_nfr_rent_payments_due_id').on(table.rentDueId),
  index('idx_nfr_rent_payments_paid_at').on(table.paidAt),
  check('nfr_rent_payments_amount_check', sql`${table.amountPaise} > 0 AND ${table.amountPaise} <= 9000000000000000`),
  check('nfr_rent_payments_paid_check', sql`trim(${table.paidAt}) <> ''`),
]);

// ============================================================================
// Phase 5A-1: Workforce Master, Manpower Allocation & Shift Roster
// ============================================================================

export const hrDesignations = sqliteTable('hr_designations', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_hr_designations_outlet_code').on(table.outletId, table.code),
  index('idx_hr_designations_outlet_id').on(table.outletId),
  index('idx_hr_designations_outlet_status').on(table.outletId, table.status),
  check('hr_designations_status_check', sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
  check('hr_designations_code_check', sql`trim(${table.code}) <> ''`),
  check('hr_designations_name_check', sql`trim(${table.name}) <> ''`),
]);

export const hrStaff = sqliteTable('hr_staff', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  employeeCode: text('employee_code').notNull(),
  fullName: text('full_name').notNull(),
  designationId: text('designation_id').notNull().references(() => hrDesignations.id),
  aadhaarLast4: text('aadhaar_last4').notNull(),
  aadhaarDocumentId: text('aadhaar_document_id').references(() => documents.id),
  photoDocumentId: text('photo_document_id').references(() => documents.id),
  emergencyContactName: text('emergency_contact_name').notNull(),
  emergencyContactPhone: text('emergency_contact_phone').notNull(),
  joiningDate: text('joining_date').notNull(),
  employmentStatus: text('employment_status', { enum: ['ACTIVE', 'INACTIVE', 'EXITED'] }).notNull().default('ACTIVE'),
  exitDate: text('exit_date'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_hr_staff_outlet_employee_code').on(table.outletId, table.employeeCode),
  index('idx_hr_staff_outlet_id').on(table.outletId),
  index('idx_hr_staff_outlet_designation').on(table.outletId, table.designationId),
  index('idx_hr_staff_outlet_status').on(table.outletId, table.employmentStatus),
  check('hr_staff_status_check', sql`${table.employmentStatus} IN ('ACTIVE', 'INACTIVE', 'EXITED')`),
  check('hr_staff_code_check', sql`trim(${table.employeeCode}) <> ''`),
  check('hr_staff_name_check', sql`trim(${table.fullName}) <> ''`),
  check('hr_staff_aadhaar_check', sql`length(${table.aadhaarLast4}) = 4 AND ${table.aadhaarLast4} GLOB '[0-9][0-9][0-9][0-9]'`),
  check('hr_staff_em_name_check', sql`trim(${table.emergencyContactName}) <> ''`),
  check('hr_staff_em_phone_check', sql`trim(${table.emergencyContactPhone}) <> ''`),
  check('hr_staff_join_date_check', sql`${table.joiningDate} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`),
  check('hr_staff_exit_date_check', sql`(${table.employmentStatus} = 'EXITED' AND ${table.exitDate} IS NOT NULL AND ${table.exitDate} >= ${table.joiningDate} AND ${table.exitDate} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]') OR (${table.employmentStatus} IN ('ACTIVE', 'INACTIVE') AND ${table.exitDate} IS NULL)`),
]);

export const hrManpowerSanctions = sqliteTable('hr_manpower_sanctions', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  designationId: text('designation_id').notNull().references(() => hrDesignations.id),
  sanctionedCount: integer('sanctioned_count').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_hr_manpower_outlet_designation').on(table.outletId, table.designationId),
  index('idx_hr_manpower_outlet_id').on(table.outletId),
  index('idx_hr_manpower_designation_id').on(table.designationId),
  check('hr_manpower_count_check', sql`${table.sanctionedCount} >= 0 AND ${table.sanctionedCount} <= 10000`),
  check('hr_manpower_date_check', sql`${table.effectiveFrom} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`),
]);

export const hrRosterAssignments = sqliteTable('hr_roster_assignments', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  staffId: text('staff_id').notNull().references(() => hrStaff.id),
  rosterDate: text('roster_date').notNull(),
  shiftTemplateId: text('shift_template_id').notNull().references(() => shiftTemplates.id),
  status: text('status', { enum: ['SCHEDULED', 'CANCELLED'] }).notNull().default('SCHEDULED'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_hr_roster_staff_date').on(table.staffId, table.rosterDate),
  index('idx_hr_roster_outlet_id').on(table.outletId),
  index('idx_hr_roster_outlet_date').on(table.outletId, table.rosterDate),
  index('idx_hr_roster_shift').on(table.outletId, table.shiftTemplateId),
  check('hr_roster_status_check', sql`${table.status} IN ('SCHEDULED', 'CANCELLED')`),
  check('hr_roster_date_check', sql`${table.rosterDate} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`),
]);

export const hrOutletGeofencePolicies = sqliteTable('hr_outlet_geofence_policies', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().unique().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  radiusMetres: integer('radius_metres').notNull().default(100),
  maxAccuracyMetres: integer('max_accuracy_metres').notNull().default(50),
  attendanceGeofenceRequired: integer('attendance_geofence_required').notNull().default(1),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_hr_outlet_geofence_policies_outlet_id').on(table.outletId),
  check('hr_geofence_status_check', sql`${table.status} IN ('ACTIVE', 'INACTIVE')`),
  check('hr_geofence_radius_check', sql`${table.radiusMetres} BETWEEN 10 AND 10000`),
  check('hr_geofence_accuracy_check', sql`${table.maxAccuracyMetres} BETWEEN 1 AND 1000`),
  check('hr_geofence_required_check', sql`${table.attendanceGeofenceRequired} IN (0, 1)`),
]);

export const hrAttendanceRecords = sqliteTable('hr_attendance_records', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  staffId: text('staff_id').notNull().references(() => hrStaff.id, { onDelete: 'cascade' }),
  rosterAssignmentId: text('roster_assignment_id').notNull().references(() => hrRosterAssignments.id, { onDelete: 'cascade' }),
  attendanceDate: text('attendance_date').notNull(),
  shiftTemplateId: text('shift_template_id').notNull().references(() => shiftTemplates.id),
  checkInAt: text('check_in_at').notNull(),
  checkInLatitude: real('check_in_latitude').notNull(),
  checkInLongitude: real('check_in_longitude').notNull(),
  checkInAccuracyMetres: real('check_in_accuracy_metres').notNull(),
  checkInDistanceMetres: real('check_in_distance_metres').notNull(),
  checkInInsideGeofence: integer('check_in_inside_geofence').notNull(),
  checkOutAt: text('check_out_at'),
  checkOutLatitude: real('check_out_latitude'),
  checkOutLongitude: real('check_out_longitude'),
  checkOutAccuracyMetres: real('check_out_accuracy_metres'),
  checkOutDistanceMetres: real('check_out_distance_metres'),
  checkOutInsideGeofence: integer('check_out_inside_geofence'),
  status: text('status', { enum: ['CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'] }).notNull().default('CHECKED_IN'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_hr_attendance_outlet_date').on(table.outletId, table.attendanceDate),
  index('idx_hr_attendance_staff_date').on(table.staffId, table.attendanceDate),
  index('idx_hr_attendance_outlet_status').on(table.outletId, table.status),
  check('hr_attendance_status_check', sql`${table.status} IN ('CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')`),
  check('hr_attendance_checkin_geofence_check', sql`${table.checkInInsideGeofence} IN (0, 1)`),
  check('hr_attendance_checkout_geofence_check', sql`${table.checkOutInsideGeofence} IS NULL OR ${table.checkOutInsideGeofence} IN (0, 1)`),
  check('hr_attendance_date_check', sql`${table.attendanceDate} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`),
]);

export const hrNozzleAssignments = sqliteTable('hr_nozzle_assignments', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  rosterAssignmentId: text('roster_assignment_id').notNull().references(() => hrRosterAssignments.id, { onDelete: 'cascade' }),
  staffId: text('staff_id').notNull().references(() => hrStaff.id, { onDelete: 'cascade' }),
  nozzleId: text('nozzle_id').notNull().references(() => nozzles.id, { onDelete: 'cascade' }),
  assignmentDate: text('assignment_date').notNull(),
  shiftTemplateId: text('shift_template_id').notNull().references(() => shiftTemplates.id),
  status: text('status', { enum: ['ASSIGNED', 'CANCELLED'] }).notNull().default('ASSIGNED'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_hr_nozzle_outlet_date').on(table.outletId, table.assignmentDate),
  index('idx_hr_nozzle_staff_date').on(table.staffId, table.assignmentDate),
  index('idx_hr_nozzle_outlet_status').on(table.outletId, table.status),
  check('hr_nozzle_assignment_status_check', sql`${table.status} IN ('ASSIGNED', 'CANCELLED')`),
  check('hr_nozzle_assignment_date_check', sql`${table.assignmentDate} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`),
]);





