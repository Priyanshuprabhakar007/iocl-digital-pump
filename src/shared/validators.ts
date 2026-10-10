import { z } from 'zod';
import { parseMilliunits } from './precision';
import { parseLubeQuantity } from './lubeUtils';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password required'),
});

export const RoleCodeSchema = z.enum([
  'ADMIN',
  'STATE_OFFICE',
  'DIVISIONAL_OFFICE',
  'BUSINESS_MANAGER',
  'FIELD_OFFICER',
  'DEALER',
  'CSP',
]);

export const ScopeLevelSchema = z.enum([
  'GLOBAL',
  'STATE',
  'DIVISION',
  'SALES_AREA',
  'OUTLET',
]);

export const CreateUserSchema = z.object({
  empCode: z.string().min(3, 'Employee code must be at least 3 characters').trim().toUpperCase(),
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  phone: z.string().min(10, 'Phone must be at least 10 digits').regex(/^[0-9+\-\s]+$/, 'Invalid phone number format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  roleCodes: z.array(RoleCodeSchema).min(1, 'At least one valid role is required'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
  initialScope: z.object({
    scopeLevel: ScopeLevelSchema,
    stateId: z.string().nullable().optional(),
    divisionId: z.string().nullable().optional(),
    salesAreaId: z.string().nullable().optional(),
    outletId: z.string().nullable().optional(),
  }).optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).trim().optional(),
  phone: z.string().min(10).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

export const UserCreateSchema = CreateUserSchema;
export const UserUpdateSchema = UpdateUserSchema;
export const UserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
});

export const CreateStateSchema = z.object({
  code: z.string().min(2).max(10).trim().toUpperCase(),
  name: z.string().min(2).trim(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export const StateSchema = CreateStateSchema;

export const CreateDivisionSchema = z.object({
  stateId: z.string().min(1, 'State ID required'),
  code: z.string().min(2).max(10).trim().toUpperCase(),
  name: z.string().min(2).trim(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export const DivisionSchema = CreateDivisionSchema;

export const CreateSalesAreaSchema = z.object({
  divisionId: z.string().min(1, 'Division ID required'),
  code: z.string().min(2).max(10).trim().toUpperCase(),
  name: z.string().min(2).trim(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export const SalesAreaSchema = CreateSalesAreaSchema;

export const RetailOutletSchema = z.object({
  roCode: z.string().min(3).trim().toUpperCase(),
  name: z.string().min(2).trim(),
  outletType: z.enum(['A_SITE', 'COCO', 'CODO']).default('A_SITE'),
  category: z.enum(['A_SITE', 'B_SITE', 'COCO', 'CORO', 'CODO']).optional(),
  stateId: z.string().min(1, 'State ID required'),
  divisionId: z.string().min(1, 'Division ID required'),
  salesAreaId: z.string().min(1, 'Sales Area ID required'),
  address: z.string().min(1, 'Address required').trim().default('Main Road'),
  location: z.string().min(1, 'Location required').trim().optional(),
  city: z.string().min(1, 'City required').trim().default('City'),
  district: z.string().min(1, 'District required').trim().default('District'),
  pincode: z.string().trim().default('700001'),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export const CreateRetailOutletSchema = RetailOutletSchema;

export const UpdateRetailOutletSchema = z.object({
  name: z.string().min(2).trim().optional(),
  outletType: z.enum(['A_SITE', 'COCO', 'CODO']).optional(),
  category: z.enum(['A_SITE', 'B_SITE', 'COCO', 'CORO', 'CODO']).optional(),
  stateId: z.string().min(1).optional(),
  divisionId: z.string().min(1).optional(),
  salesAreaId: z.string().min(1).optional(),
  address: z.string().min(1).trim().optional(),
  location: z.string().min(1).trim().optional(),
  city: z.string().min(1).trim().optional(),
  district: z.string().min(1).trim().optional(),
  pincode: z.string().trim().optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).refine(data => {
  const hasState = !!data.stateId;
  const hasDivision = !!data.divisionId;
  const hasSalesArea = !!data.salesAreaId;
  if (hasState || hasDivision || hasSalesArea) {
    return hasState && hasDivision && hasSalesArea;
  }
  return true;
}, {
  message: 'If any hierarchy field (stateId, divisionId, salesAreaId) is supplied, all three must be provided.',
});
export const RetailOutletUpdateSchema = UpdateRetailOutletSchema;

export const OutletUserAssignmentSchema = z.object({
  outletId: z.string().min(1, 'Outlet ID required'),
  userId: z.string().min(1, 'User ID required'),
  assignmentType: z.enum(['DEALER', 'CSP', 'INSPECTOR']).default('DEALER'),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
});

export const AssignScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: ScopeLevelSchema,
  stateId: z.string().nullable().optional(),
  divisionId: z.string().nullable().optional(),
  salesAreaId: z.string().nullable().optional(),
  outletId: z.string().nullable().optional(),
});

export const GlobalScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('GLOBAL'),
  stateId: z.null().optional(),
  divisionId: z.null().optional(),
  salesAreaId: z.null().optional(),
  outletId: z.null().optional(),
}).strict();

export const StateScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('STATE'),
  stateId: z.string().min(1, 'stateId is required for STATE scope'),
  divisionId: z.null().optional(),
  salesAreaId: z.null().optional(),
  outletId: z.null().optional(),
}).strict();

export const DivisionScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('DIVISION'),
  divisionId: z.string().min(1, 'divisionId is required for DIVISION scope'),
  stateId: z.null().optional(),
  salesAreaId: z.null().optional(),
  outletId: z.null().optional(),
}).strict();

export const SalesAreaScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('SALES_AREA'),
  salesAreaId: z.string().min(1, 'salesAreaId is required for SALES_AREA scope'),
  stateId: z.null().optional(),
  divisionId: z.null().optional(),
  outletId: z.null().optional(),
}).strict();

export const OutletScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('OUTLET'),
  outletId: z.string().min(1, 'outletId is required for OUTLET scope'),
  stateId: z.null().optional(),
  divisionId: z.null().optional(),
  salesAreaId: z.null().optional(),
}).strict();

export const UserScopeAssignmentSchema = z.discriminatedUnion('scopeLevel', [
  GlobalScopeSchema,
  StateScopeSchema,
  DivisionScopeSchema,
  SalesAreaScopeSchema,
  OutletScopeSchema,
]);

export const DocumentMetadataSchema = z.object({
  name: z.string().min(1, 'Document name required'),
  mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg'], {
    error: 'Only PDF, PNG, and JPEG documents are permitted',
  }),
  sizeBytes: z.number().positive().max(5242880, 'File size cannot exceed 5 MB'),
  outletId: z.string().min(1, 'Outlet ID is required for document upload'),
});

// ==========================================
// Phase 2A Hardened: Pump Operations & Shift
// ==========================================

export const ProductSchema = z.object({
  code: z.string().min(1, 'Product code is required').trim().toUpperCase(),
  name: z.string().min(2, 'Product name is required').trim(),
  category: z.string().min(1, 'Product category is required').trim(),
  unit: z.enum(['LITRE', 'KG']),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const ProductUpdateSchema = z.object({
  name: z.string().min(2, 'Product name is required').trim().optional(),
  category: z.string().min(1, 'Product category is required').trim().optional(),
  unit: z.enum(['LITRE', 'KG']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const OutletProductSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const TankSchema = z.object({
  tankNumber: z.number().int().positive('Tank number must be a positive integer'),
  name: z.string().min(1, 'Tank name is required').trim(),
  productId: z.string().min(1, 'Product ID is required'),
  capacityLitres: z.number().positive('Capacity must be greater than 0'),
  safeFillCapacityLitres: z.number().positive('Safe fill capacity must be greater than 0'),
  minimumOperatingLevelLitres: z.number().min(0, 'Minimum operating level must be non-negative'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).default('ACTIVE'),
  commissionedAt: z.string().nullable().optional(),
}).refine(data => data.safeFillCapacityLitres <= data.capacityLitres, {
  message: 'Safe fill capacity cannot exceed total capacity',
  path: ['safeFillCapacityLitres'],
});

export const TankUpdateSchema = z.object({
  name: z.string().min(1).trim().optional(),
  productId: z.string().min(1).optional(),
  capacityLitres: z.number().positive().optional(),
  safeFillCapacityLitres: z.number().positive().optional(),
  minimumOperatingLevelLitres: z.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
  commissionedAt: z.string().nullable().optional(),
});

export const DispenserSchema = z.object({
  dispenserNumber: z.number().int().positive('Dispenser number must be a positive integer'),
  name: z.string().min(1, 'Dispenser name is required').trim(),
  manufacturer: z.string().trim().nullable().optional(),
  model: z.string().trim().nullable().optional(),
  serialNumber: z.string().trim().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).default('ACTIVE'),
  commissionedAt: z.string().nullable().optional(),
});

export const DispenserUpdateSchema = z.object({
  name: z.string().min(1).trim().optional(),
  manufacturer: z.string().trim().nullable().optional(),
  model: z.string().trim().nullable().optional(),
  serialNumber: z.string().trim().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
  commissionedAt: z.string().nullable().optional(),
});

export const NozzleSchema = z.object({
  dispenserId: z.string().min(1, 'Dispenser ID is required'),
  nozzleNumber: z.number().int().positive('Nozzle number must be a positive integer'),
  productId: z.string().min(1, 'Product ID is required'),
  tankId: z.string().min(1, 'Tank ID is required'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).default('ACTIVE'),
});

export const NozzleUpdateSchema = z.object({
  productId: z.string().min(1).optional(),
  tankId: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
});

export const ShiftTemplateSchema = z.object({
  code: z.string().min(1, 'Shift code is required').trim().toUpperCase(),
  name: z.string().min(2, 'Shift name is required').trim(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be in HH:MM format (24h)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be in HH:MM format (24h)'),
  sequence: z.number().int().min(1).default(1),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const OpenShiftSchema = z.object({
  shiftTemplateId: z.string().min(1, 'Shift template is required'),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be YYYY-MM-DD'),
  notes: z.string().trim().nullable().optional(),
});

const StrictDecimalQuantityString = z.string()
  .trim()
  .refine(val => {
    if (!/^\d+(\.\d{1,3})?$/.test(val)) {
      return false;
    }
    try {
      parseMilliunits(val);
      return true;
    } catch {
      return false;
    }
  }, { message: 'Quantity must be a valid non-negative decimal string with at most 3 decimal places (e.g. "1000.125")' });

export const MeterReadingSchema = z.object({
  nozzleId: z.string().min(1, 'Nozzle ID is required'),
  openingTotalizer: StrictDecimalQuantityString,
  closingTotalizer: StrictDecimalQuantityString,
  testingQuantity: StrictDecimalQuantityString.default('0.000'),
  varianceReason: z.string().trim().nullable().optional(),
}).refine(data => {
  try {
    const op = parseMilliunits(data.openingTotalizer);
    const cl = parseMilliunits(data.closingTotalizer);
    return cl >= op;
  } catch {
    return true;
  }
}, {
  message: 'Closing totalizer must be greater than or equal to opening totalizer',
  path: ['closingTotalizer'],
}).refine(data => {
  try {
    const op = parseMilliunits(data.openingTotalizer);
    const cl = parseMilliunits(data.closingTotalizer);
    const test = parseMilliunits(data.testingQuantity);
    const gross = cl - op;
    return test <= gross;
  } catch {
    return true;
  }
}, {
  message: 'Testing quantity cannot exceed gross sales quantity',
  path: ['testingQuantity'],
});

export const NozzleUnavailabilitySchema = z.object({
  nozzleId: z.string().min(1, 'Nozzle ID is required'),
  reason: z.string().min(3, 'A valid reason (minimum 3 characters) is required').trim(),
});

// ==========================================
// Phase 2B: Tank Stock, Calibration, Receipts & Reconciliation Validators
// ==========================================

export const TankCalibrationPointSchema = z.object({
  dipMillimetres: StrictDecimalQuantityString,
  volumeLitres: StrictDecimalQuantityString,
});

export const TankCalibrationBulkSchema = z.object({
  points: z.array(TankCalibrationPointSchema).min(2, 'At least 2 calibration points are required to define a calibration chart'),
});

export const TankStockReadingSchema = z.object({
  tankId: z.string().min(1, 'Tank ID is required'),
  readingType: z.enum(['OPENING', 'CLOSING', 'PRE_RECEIPT', 'POST_RECEIPT', 'ADHOC']),
  source: z.enum(['MANUAL', 'ATG']).default('MANUAL'),
  productDipMm: StrictDecimalQuantityString,
  waterDipMm: StrictDecimalQuantityString.default('0.000'),
  notes: z.string().trim().nullable().optional(),
}).refine(data => {
  try {
    const prodDip = parseMilliunits(data.productDipMm);
    const waterDip = parseMilliunits(data.waterDipMm);
    return waterDip <= prodDip;
  } catch {
    return true;
  }
}, {
  message: 'Water dip cannot exceed product dip',
  path: ['waterDipMm'],
});

export const FuelReceiptLineSchema = z.object({
  tankId: z.string().min(1, 'Tank ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  invoiceQuantity: StrictDecimalQuantityString,
  density: StrictDecimalQuantityString.optional().nullable(),
  temperature: StrictDecimalQuantityString.optional().nullable(),
  invoiceDensity: StrictDecimalQuantityString.optional().nullable(),
});

export const FuelReceiptCreateSchema = z.object({
  ttNumber: z.string().min(1, 'Tank Truck / TT Number is required').trim(),
  invoiceNumber: z.string().min(1, 'Invoice Number is required').trim(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invoice date must be YYYY-MM-DD'),
  arrivalAt: z.string().min(1, 'Arrival timestamp is required'),
  sealVerified: z.boolean().default(true),
  sealExceptionReason: z.string().trim().nullable().optional(),
  lines: z.array(FuelReceiptLineSchema).min(1, 'At least one receiving tank line is required'),
}).refine(data => {
  if (data.sealVerified === false && (!data.sealExceptionReason || data.sealExceptionReason.trim().length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'A seal exception reason is required when seal is not verified',
  path: ['sealExceptionReason'],
});

export const FuelReceiptLineUpdateSchema = z.object({
  preDecantReadingId: z.string().optional().nullable(),
  postDecantReadingId: z.string().optional().nullable(),
  density: StrictDecimalQuantityString.optional().nullable(),
  temperature: StrictDecimalQuantityString.optional().nullable(),
  invoiceDensity: StrictDecimalQuantityString.optional().nullable(),
});

export const FuelReceiptStatusUpdateSchema = z.object({
  status: z.enum(['ARRIVED', 'VERIFIED', 'DECANTED', 'COMPLETED', 'CANCELLED']),
  decantationStartedAt: z.string().optional().nullable(),
  decantationCompletedAt: z.string().optional().nullable(),
  sealVerified: z.boolean().optional(),
  sealExceptionReason: z.string().optional().nullable(),
});

import { parseMoneyToPaise } from './financialUtils';

export const MoneyStringSchema = z.string().refine((val) => {
  try {
    parseMoneyToPaise(val);
    return true;
  } catch {
    return false;
  }
}, { message: "Invalid positive decimal money format (at most 2 decimal places)" });

export const PositiveMoneyStringSchema = z.string().refine((val) => {
  try {
    const paise = parseMoneyToPaise(val);
    return paise > 0;
  } catch {
    return false;
  }
}, { message: "Invalid positive money format or amount must be greater than 0 (at most 2 decimal places)" });

export const ProductPriceSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
  pricePaisePerUnit: PositiveMoneyStringSchema,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
}).refine(data => {
  if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
    return false;
  }
  return true;
}, {
  message: 'effectiveTo cannot be earlier than effectiveFrom',
  path: ['effectiveTo'],
});

export const CreditPartySchema = z.object({
  partyCode: z.string().trim().min(1, "Party code required"),
  partyName: z.string().trim().min(1, "Party name required"),
  contactName: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const ShiftCollectionSchema = z.object({
  collectionType: z.enum(["CASH", "POS_CARD", "UPI", "FLEET_CARD", "CREDIT_SALE", "DIRECT_BANK_DROP"]),
  amount: PositiveMoneyStringSchema,
  provider: z.string().trim().optional().nullable(),
  referenceNumber: z.string().trim().optional().nullable(),
  creditPartyId: z.string().trim().optional().nullable(),
  collectedAt: z.string().min(1, "Collection time required"),
  notes: z.string().trim().optional().nullable(),
}).refine(data => {
  if (data.collectionType === 'CREDIT_SALE' && !data.creditPartyId) return false;
  return true;
}, {
  message: 'Credit party is required for credit sales',
  path: ['creditPartyId']
});

export const CashHandoverSchema = z.object({
  amount: PositiveMoneyStringSchema,
  handedOverAt: z.string().min(1, "Handover time required"),
  notes: z.string().trim().optional().nullable(),
});

export const BankDepositSchema = z.object({
  depositChannel: z.enum(["BANK_BRANCH", "CASH_DROP_BOX"]),
  amount: PositiveMoneyStringSchema,
  depositDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  referenceNumber: z.string().trim().optional().nullable(),
  documentId: z.string().trim().optional().nullable(),
});

export const FinancialVarianceReasonSchema = z.object({
  varianceReason: z.string().trim().min(3, "Reason must be at least 3 characters"),
});

export const QualityToleranceSchema = z.object({
  scopeType: z.enum(['GLOBAL', 'STATE', 'DIVISION', 'OUTLET']),
  scopeEntityId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  densityTolerance: StrictDecimalQuantityString,
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective from date must be YYYY-MM-DD'),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective to date must be YYYY-MM-DD').optional().nullable(),
});

export const CngShiftLogSchema = z.object({
  mfmOpeningKg: StrictDecimalQuantityString,
  mfmClosingKg: StrictDecimalQuantityString,
  gridIntakeKg: StrictDecimalQuantityString.optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).refine(data => {
  try {
    const op = parseMilliunits(data.mfmOpeningKg);
    const cl = parseMilliunits(data.mfmClosingKg);
    return cl >= op;
  } catch {
    return true;
  }
}, {
  message: 'Closing MFM reading must be greater than or equal to opening MFM reading',
  path: ['mfmClosingKg'],
});

export const CngPressureReadingSchema = z.object({
  recordedAt: z.string().min(1, 'Recorded at timestamp is required'),
  pressureUnit: z.string().trim().min(1, 'Pressure unit is required'),
  suctionPressure: StrictDecimalQuantityString.optional().nullable(),
  dischargePressure: StrictDecimalQuantityString.optional().nullable(),
  cascadePressure: StrictDecimalQuantityString.optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).refine(data => {
  return data.suctionPressure != null || data.dischargePressure != null || data.cascadePressure != null;
}, {
  message: 'At least one pressure reading (suction, discharge, or cascade) is required',
  path: ['suctionPressure'],
});

// Phase 3B-1: Lube & Auxiliary Inventory Schemas
export const CreateLubeSkuSchema = z.object({
  skuCode: z.string().trim().min(1, 'SKU code is required').max(50, 'SKU code is too long').toUpperCase(),
  name: z.string().trim().min(1, 'SKU name is required').max(100, 'SKU name is too long'),
  category: z.string().trim().min(1, 'Category is required'),
  stockUnit: z.enum(['LITRE', 'PACK']),
  reorderThreshold: z.string().trim().min(1, 'Reorder threshold is required'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
}).refine(data => {
  try {
    const val = parseLubeQuantity(data.stockUnit, data.reorderThreshold);
    return val >= 0;
  } catch {
    return false;
  }
}, {
  message: 'Invalid reorder threshold format for the selected stock unit',
  path: ['reorderThreshold'],
});

export const UpdateLubeSkuSchema = z.object({
  name: z.string().trim().min(1, 'SKU name is required').max(100, 'SKU name is too long').optional(),
  category: z.string().trim().min(1, 'Category is required').optional(),
  reorderThreshold: z.string().trim().min(1).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const CreateLubeSkuPriceSchema = z.object({
  lubeSkuId: z.string().trim().min(1, 'Lube SKU ID is required'),
  pricePaisePerUnit: PositiveMoneyStringSchema,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective from date must be YYYY-MM-DD'),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective to date must be YYYY-MM-DD').optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
}).refine(data => {
  if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
    return false;
  }
  return true;
}, {
  message: 'effectiveTo cannot be earlier than effectiveFrom',
  path: ['effectiveTo'],
});

export const UpdateLubeSkuPriceSchema = z.object({
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective to date must be YYYY-MM-DD').optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const CreateLubeStockTransactionSchema = z.object({
  lubeSkuId: z.string().trim().min(1, 'Lube SKU ID is required'),
  transactionType: z.enum(['OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.string().trim().min(1, 'Quantity is required'),
  occurredAt: z.string().datetime({ offset: true, message: 'occurredAt must be a valid ISO-8601 timestamp with timezone' }),
  referenceNumber: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).refine(data => {
  if (data.transactionType === 'ADJUSTMENT_IN' || data.transactionType === 'ADJUSTMENT_OUT') {
    return data.notes != null && data.notes.trim().length > 0;
  }
  return true;
}, {
  message: 'Notes/reason are required for inventory adjustments (ADJUSTMENT_IN and ADJUSTMENT_OUT)',
  path: ['notes'],
});

export const CreateLubeShiftSaleSchema = z.object({
  lubeSkuId: z.string().trim().min(1, 'Lube SKU ID is required'),
  quantity: z.string().trim().min(1, 'Quantity is required'),
  soldAt: z.string().datetime({ offset: true, message: 'soldAt must be a valid ISO-8601 timestamp with timezone' }),
  notes: z.string().trim().optional().nullable(),
});

export const UpdateLubeShiftSaleSchema = z.object({
  quantity: z.string().trim().min(1, 'Quantity is required'),
  soldAt: z.string().datetime({ offset: true, message: 'soldAt must be a valid ISO-8601 timestamp with timezone' }).optional(),
  notes: z.string().trim().optional().nullable(),
});

// ==========================================
// Phase 3C-1: Equipment Breakdown Management Validators
// ==========================================

export const CreateEquipmentAssetSchema = z.object({
  assetCode: z.string().trim().min(1, 'Asset code is required').toUpperCase(),
  equipmentType: z.enum(['ATG', 'AIR_COMPRESSOR', 'CNG_COMPRESSOR', 'DG_SET', 'OTHER']),
  name: z.string().trim().min(1, 'Name is required'),
  manufacturer: z.string().trim().optional().nullable(),
  model: z.string().trim().optional().nullable(),
  serialNumber: z.string().trim().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).default('ACTIVE'),
  commissionedAt: z.string().datetime({ offset: true, message: 'commissionedAt must be a valid ISO-8601 timestamp with timezone' }).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UpdateEquipmentAssetSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').optional(),
  manufacturer: z.string().trim().optional().nullable(),
  model: z.string().trim().optional().nullable(),
  serialNumber: z.string().trim().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
  commissionedAt: z.string().datetime({ offset: true, message: 'commissionedAt must be a valid ISO-8601 timestamp with timezone' }).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const CreateEquipmentTicketSchema = z.object({
  dispenserId: z.string().optional().nullable(),
  equipmentAssetId: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  failureCategory: z.enum(['ELECTRICAL', 'MECHANICAL', 'ELECTRONICS', 'COMMUNICATION', 'CALIBRATION', 'PRESSURE', 'LEAKAGE', 'POWER', 'SOFTWARE', 'OTHER']),
  description: z.string().trim().min(1, 'Description is required'),
  breakdownAt: z.string().datetime({ offset: true, message: 'breakdownAt must be a valid ISO-8601 timestamp with timezone' }),
}).strict().refine(data => !!data.dispenserId !== !!data.equipmentAssetId, {
    message: 'Exactly one of dispenserId or equipmentAssetId must be provided',
});

export const AssignTicketSchema = z.object({
  technicianName: z.string().trim().min(1, 'Technician name is required'),
  technicianPhone: z.string().trim().optional().nullable(),
}).strict();

export const ResolveTicketSchema = z.object({
  resolutionNotes: z.string().trim().min(1, 'Resolution notes are required'),
  resolvedAt: z.string().datetime({ offset: true, message: 'resolvedAt must be a valid ISO-8601 timestamp with timezone' }).optional().nullable(),
}).strict();

export const SignoffTicketSchema = z.object({
  signoffNotes: z.string().trim().optional().nullable(),
}).strict();

export const CancelTicketSchema = z.object({
  reason: z.string().trim().min(1, 'Cancellation reason is required'),
}).strict();

export const EquipmentAssetFilterSchema = z.object({
  equipmentType: z.enum(['ATG', 'AIR_COMPRESSOR', 'CNG_COMPRESSOR', 'DG_SET', 'OTHER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
}).strict();

export const EquipmentTicketFilterSchema = z.object({
  status: z.enum(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  equipmentType: z.enum(['DISPENSER', 'ATG', 'AIR_COMPRESSOR', 'CNG_COMPRESSOR', 'DG_SET', 'OTHER']).optional(),
}).strict();

// ============================================================================
// Phase 4A-1: Electricity & Sub-meter Validators
// ============================================================================

export const StrictDateOnlySchema = z.string().trim().refine((val) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const [yearStr, monthStr, dayStr] = val.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}, {
  message: 'Must be a valid calendar date in YYYY-MM-DD format',
});

export const CreateUtilityElectricityAccountSchema = z.object({
  consumerNumber: z.string().trim().min(1, 'consumerNumber is required'),
  providerName: z.string().trim().optional().nullable(),
  billingCycle: z.string().trim().min(1, 'billingCycle is required'),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UpdateUtilityElectricityAccountSchema = z.object({
  providerName: z.string().trim().optional().nullable(),
  billingCycle: z.string().trim().min(1, 'billingCycle cannot be empty').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const CreateUtilityElectricityBillSchema = z.object({
  electricityAccountId: z.string().trim().min(1, 'electricityAccountId is required'),
  billingPeriodStart: StrictDateOnlySchema,
  billingPeriodEnd: StrictDateOnlySchema,
  billAmount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'billAmount must be a non-negative decimal string (up to 2 decimal places)').max(20, 'billAmount exceeds maximum length'),
  dueDate: StrictDateOnlySchema,
  billDocumentId: z.string().trim().min(1, 'billDocumentId is required'),
}).strict().refine(data => data.billingPeriodEnd >= data.billingPeriodStart, {
  message: 'billingPeriodEnd must be on or after billingPeriodStart',
});

export const UpdateUtilityElectricityBillSchema = z.object({
  billingPeriodStart: StrictDateOnlySchema.optional(),
  billingPeriodEnd: StrictDateOnlySchema.optional(),
  billAmount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'billAmount must be a non-negative decimal string (up to 2 decimal places)').max(20, 'billAmount exceeds maximum length').optional(),
  dueDate: StrictDateOnlySchema.optional(),
  billDocumentId: z.string().trim().min(1, 'billDocumentId cannot be empty').optional(),
}).strict().refine(data => {
  if (data.billingPeriodStart && data.billingPeriodEnd) {
    return data.billingPeriodEnd >= data.billingPeriodStart;
  }
  return true;
}, {
  message: 'billingPeriodEnd must be on or after billingPeriodStart',
});

export const MarkUtilityElectricityBillPaidSchema = z.object({
  paymentReceiptDocumentId: z.string().trim().min(1, 'paymentReceiptDocumentId is required'),
  paymentReference: z.string().trim().optional().nullable(),
  paidAt: z.string().datetime({ offset: true, message: 'paidAt must be a valid ISO-8601 timestamp with timezone' }).optional().nullable(),
}).strict();

export const CreateUtilitySubMeterSchema = z.object({
  meterCode: z.string().trim().min(1, 'meterCode is required'),
  name: z.string().trim().min(1, 'name is required'),
  beneficiaryType: z.enum(['NFR_VENDOR', 'CNG_FACILITY', 'OTHER']),
  beneficiaryName: z.string().trim().min(1, 'beneficiaryName is required'),
  serialNumber: z.string().trim().optional().nullable(),
  ratePaisePerKwh: z.number().int().min(0, 'ratePaisePerKwh must be non-negative').max(9_000_000_000_000_000, 'ratePaisePerKwh exceeds maximum allowed value').refine(val => Number.isSafeInteger(val), { message: 'ratePaisePerKwh must be a safe integer' }).optional(),
  ratePerKwh: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'ratePerKwh must be a non-negative decimal string (up to 2 decimal places)').max(20, 'ratePerKwh exceeds maximum length').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DECOMMISSIONED']).optional().default('ACTIVE'),
  commissionedAt: z.string().datetime({ offset: true, message: 'commissionedAt must be a valid ISO-8601 timestamp with timezone' }).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict().refine(data => data.ratePaisePerKwh !== undefined || data.ratePerKwh !== undefined, {
  message: 'ratePaisePerKwh or ratePerKwh is required',
  path: ['ratePaisePerKwh'],
});

export const UpdateUtilitySubMeterSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty').optional(),
  beneficiaryType: z.enum(['NFR_VENDOR', 'CNG_FACILITY', 'OTHER']).optional(),
  beneficiaryName: z.string().trim().min(1, 'beneficiaryName cannot be empty').optional(),
  serialNumber: z.string().trim().optional().nullable(),
  ratePaisePerKwh: z.number().int().min(0, 'ratePaisePerKwh must be non-negative').max(9_000_000_000_000_000, 'ratePaisePerKwh exceeds maximum allowed value').refine(val => Number.isSafeInteger(val), { message: 'ratePaisePerKwh must be a safe integer' }).optional(),
  ratePerKwh: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'ratePerKwh must be a non-negative decimal string (up to 2 decimal places)').max(20, 'ratePerKwh exceeds maximum length').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DECOMMISSIONED']).optional(),
  commissionedAt: z.string().datetime({ offset: true, message: 'commissionedAt must be a valid ISO-8601 timestamp with timezone' }).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const CreateUtilitySubMeterReadingSchema = z.object({
  reading: z.string().trim().regex(/^\d+(\.\d{1,3})?$/, 'reading must be a non-negative decimal string (up to 3 decimal places)').max(20, 'reading exceeds maximum length'),
  readingAt: z.string().datetime({ offset: true, message: 'readingAt must be a valid ISO-8601 timestamp with timezone' }),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UtilityBillFilterSchema = z.object({
  status: z.enum(['PENDING', 'PAID']).optional(),
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
});

export const UtilitySubMeterFilterSchema = z.object({
  beneficiaryType: z.enum(['NFR_VENDOR', 'CNG_FACILITY', 'OTHER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DECOMMISSIONED']).optional(),
}).strict();

export const UtilityChargeSummaryFilterSchema = z.object({
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
  subMeterId: z.string().trim().min(1).optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
});

// ============================================================================
// Phase 4B-1: Municipal Taxes & Statutory Dues Validators
// ============================================================================

export const MunicipalTaxTypeEnum = z.enum([
  'PROPERTY_TAX',
  'TRADE_LICENSE_FEE',
  'SIGNAGE_CHARGE',
  'LOCAL_AUTHORITY_DUE',
]);

export const MunicipalTaxFrequencyEnum = z.enum([
  'ANNUAL',
  'QUARTERLY',
]);

export const MunicipalTaxStatusEnum = z.enum([
  'PENDING',
  'PAID',
]);

export const CreateMunicipalTaxDueSchema = z.object({
  taxType: MunicipalTaxTypeEnum,
  authorityName: z.string().trim().min(1, 'authorityName is required'),
  referenceNumber: z.string().trim().min(1, 'referenceNumber is required'),
  assessmentFrequency: MunicipalTaxFrequencyEnum,
  assessmentPeriodStart: StrictDateOnlySchema,
  assessmentPeriodEnd: StrictDateOnlySchema,
  amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'amount must be a non-negative decimal string (up to 2 decimal places)').max(20, 'amount exceeds maximum length'),
  dueDate: StrictDateOnlySchema,
  assessmentDocumentId: z.string().trim().min(1, 'assessmentDocumentId cannot be empty').optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict().refine(data => data.assessmentPeriodEnd >= data.assessmentPeriodStart, {
  message: 'assessmentPeriodEnd must be on or after assessmentPeriodStart',
  path: ['assessmentPeriodEnd'],
});

export const UpdateMunicipalTaxDueSchema = z.object({
  taxType: MunicipalTaxTypeEnum.optional(),
  authorityName: z.string().trim().min(1, 'authorityName cannot be empty').optional(),
  referenceNumber: z.string().trim().min(1, 'referenceNumber cannot be empty').optional(),
  assessmentFrequency: MunicipalTaxFrequencyEnum.optional(),
  assessmentPeriodStart: StrictDateOnlySchema.optional(),
  assessmentPeriodEnd: StrictDateOnlySchema.optional(),
  amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'amount must be a non-negative decimal string (up to 2 decimal places)').max(20, 'amount exceeds maximum length').optional(),
  dueDate: StrictDateOnlySchema.optional(),
  assessmentDocumentId: z.string().trim().min(1, 'assessmentDocumentId cannot be empty').optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict().refine(data => {
  if (data.assessmentPeriodStart && data.assessmentPeriodEnd) {
    return data.assessmentPeriodEnd >= data.assessmentPeriodStart;
  }
  return true;
}, {
  message: 'assessmentPeriodEnd must be on or after assessmentPeriodStart',
  path: ['assessmentPeriodEnd'],
});

export const MarkMunicipalTaxPaidSchema = z.object({
  paymentReceiptDocumentId: z.string().trim().min(1, 'paymentReceiptDocumentId is required'),
  paymentReference: z.string().trim().optional().nullable(),
  paidAt: z.string().datetime({ offset: true, message: 'paidAt must be a valid ISO-8601 timestamp with timezone' }).optional().nullable(),
}).strict();

export const MunicipalTaxFilterSchema = z.object({
  taxType: MunicipalTaxTypeEnum.optional(),
  status: MunicipalTaxStatusEnum.optional(),
  assessmentFrequency: MunicipalTaxFrequencyEnum.optional(),
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
  path: ['fromDate'],
});

// ============================================================================
// Phase 4C-1: NFR / Vendor Lease & Rent Management Validators
// ============================================================================

export const StrictYearMonthSchema = z.string().trim().refine((val) => {
  if (!/^\d{4}-\d{2}$/.test(val)) return false;
  const [yearStr, monthStr] = val.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (month < 1 || month > 12 || year < 1900 || year > 2100) {
    return false;
  }
  return true;
}, {
  message: 'Must be a valid calendar year-month in YYYY-MM format',
});

export const NfrTypeEnum = z.enum([
  'ATM',
  'CONVENIENCE_STORE',
  'QSR',
  'CAR_WASH',
  'EV_CHARGING',
  'CANOPY_ADVERTISING',
]);

export const NfrSpaceStatusEnum = z.enum([
  'ACTIVE',
  'INACTIVE',
]);

export const CreateNfrSpaceSchema = z.object({
  spaceCode: z.string().trim().min(1, 'spaceCode is required').max(50),
  name: z.string().trim().min(1, 'name is required').max(100),
  nfrType: NfrTypeEnum,
  locationDescription: z.string().trim().optional().nullable(),
  status: NfrSpaceStatusEnum.optional().default('ACTIVE'),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UpdateNfrSpaceSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty').max(100).optional(),
  nfrType: NfrTypeEnum.optional(),
  locationDescription: z.string().trim().optional().nullable(),
  status: NfrSpaceStatusEnum.optional(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const NfrVendorStatusEnum = z.enum([
  'ACTIVE',
  'INACTIVE',
]);

export const CreateNfrVendorSchema = z.object({
  vendorName: z.string().trim().min(1, 'vendorName is required').max(150),
  ownerContactName: z.string().trim().min(1, 'ownerContactName is required').max(100),
  ownerContactPhone: z.string().trim().min(1, 'ownerContactPhone is required').max(30).regex(/^[0-9+\-\s()]+$/, 'Invalid phone number format'),
  ownerContactEmail: z.string().trim().email('Invalid email address').optional().nullable(),
  address: z.string().trim().optional().nullable(),
  status: NfrVendorStatusEnum.optional().default('ACTIVE'),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UpdateNfrVendorSchema = z.object({
  vendorName: z.string().trim().min(1, 'vendorName cannot be empty').max(150).optional(),
  ownerContactName: z.string().trim().min(1, 'ownerContactName cannot be empty').max(100).optional(),
  ownerContactPhone: z.string().trim().min(1, 'ownerContactPhone cannot be empty').max(30).regex(/^[0-9+\-\s()]+$/, 'Invalid phone number format').optional(),
  ownerContactEmail: z.string().trim().email('Invalid email address').optional().nullable(),
  address: z.string().trim().optional().nullable(),
  status: NfrVendorStatusEnum.optional(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const CreateNfrLeaseSchema = z.object({
  spaceId: z.string().trim().min(1, 'spaceId is required'),
  vendorId: z.string().trim().min(1, 'vendorId is required'),
  agreementNumber: z.string().trim().min(1, 'agreementNumber is required').max(100),
  leaseStartDate: StrictDateOnlySchema,
  leaseEndDate: StrictDateOnlySchema,
  monthlyRent: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'monthlyRent must be a positive decimal string (up to 2 decimal places)').max(20),
  securityDeposit: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'securityDeposit must be a non-negative decimal string (up to 2 decimal places)').max(20).optional().default('0'),
  monthlyDueDay: z.number().int().min(1, 'monthlyDueDay must be between 1 and 31').max(31, 'monthlyDueDay must be between 1 and 31'),
  agreementDocumentId: z.string().trim().min(1).optional().nullable(),
  subMeterId: z.string().trim().min(1).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict().refine(data => data.leaseEndDate >= data.leaseStartDate, {
  message: 'leaseEndDate must be on or after leaseStartDate',
  path: ['leaseEndDate'],
});

export const UpdateNfrLeaseSchema = z.object({
  spaceId: z.string().trim().min(1, 'spaceId cannot be empty').optional(),
  vendorId: z.string().trim().min(1, 'vendorId cannot be empty').optional(),
  agreementNumber: z.string().trim().min(1, 'agreementNumber cannot be empty').max(100).optional(),
  leaseStartDate: StrictDateOnlySchema.optional(),
  leaseEndDate: StrictDateOnlySchema.optional(),
  monthlyRent: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'monthlyRent must be a positive decimal string (up to 2 decimal places)').max(20).optional(),
  securityDeposit: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'securityDeposit must be a non-negative decimal string (up to 2 decimal places)').max(20).optional(),
  monthlyDueDay: z.number().int().min(1, 'monthlyDueDay must be between 1 and 31').max(31, 'monthlyDueDay must be between 1 and 31').optional(),
  agreementDocumentId: z.string().trim().min(1).optional().nullable(),
  subMeterId: z.string().trim().min(1).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict().refine(data => {
  if (data.leaseStartDate && data.leaseEndDate) {
    return data.leaseEndDate >= data.leaseStartDate;
  }
  return true;
}, {
  message: 'leaseEndDate must be on or after leaseStartDate',
  path: ['leaseEndDate'],
});

export const TerminateNfrLeaseSchema = z.object({
  terminationReason: z.string().trim().optional().nullable(),
}).strict();

export const GenerateNfrRentDueSchema = z.object({
  billingMonth: StrictYearMonthSchema,
}).strict();

export const CreateNfrRentPaymentSchema = z.object({
  amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'amount must be a positive decimal string (up to 2 decimal places)').max(20),
  receiptDocumentId: z.string().trim().min(1, 'receiptDocumentId is required'),
  paymentReference: z.string().trim().optional().nullable(),
  paidAt: z.string().datetime({ offset: true, message: 'paidAt must be a valid ISO-8601 timestamp with timezone' }).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const NfrSpaceFilterSchema = z.object({
  nfrType: NfrTypeEnum.optional(),
  status: NfrSpaceStatusEnum.optional(),
}).strict();

export const NfrVendorFilterSchema = z.object({
  status: NfrVendorStatusEnum.optional(),
  search: z.string().trim().optional(),
}).strict();

export const NfrLeaseFilterSchema = z.object({
  spaceId: z.string().trim().min(1).optional(),
  vendorId: z.string().trim().min(1).optional(),
  status: z.enum(['ACTIVE', 'TERMINATED']).optional(),
  nfrType: NfrTypeEnum.optional(),
  expiredOnly: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
}).strict();

export const NfrRentPaymentStatusEnum = z.enum([
  'PENDING',
  'PARTIAL',
  'PAID',
]);

export const NfrRentDueFilterSchema = z.object({
  leaseId: z.string().trim().min(1).optional(),
  vendorId: z.string().trim().min(1).optional(),
  spaceId: z.string().trim().min(1).optional(),
  billingMonth: StrictYearMonthSchema.optional(),
  paymentStatus: NfrRentPaymentStatusEnum.optional(),
  overdueOnly: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
  path: ['fromDate'],
});

// ============================================================================
// Phase 5A-1: Workforce Master, Manpower Allocation & Shift Roster Validators
// ============================================================================

export const HrDesignationStatusEnum = z.enum(['ACTIVE', 'INACTIVE']);
export const HrEmploymentStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'EXITED']);
export const HrRosterStatusEnum = z.enum(['SCHEDULED', 'CANCELLED']);

export const CreateHrDesignationSchema = z.object({
  code: z.string().trim().min(1, 'code is required'),
  name: z.string().trim().min(1, 'name is required'),
  status: HrDesignationStatusEnum.optional().default('ACTIVE'),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UpdateHrDesignationSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty').optional(),
  status: HrDesignationStatusEnum.optional(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const CreateHrStaffSchema = z.object({
  employeeCode: z.string().trim().min(1, 'employeeCode is required'),
  fullName: z.string().trim().min(1, 'fullName is required'),
  designationId: z.string().trim().min(1, 'designationId is required'),
  aadhaarLast4: z.string().trim().regex(/^\d{4}$/, 'aadhaarLast4 must be exactly 4 numeric digits'),
  aadhaarDocumentId: z.string().trim().min(1).optional().nullable(),
  photoDocumentId: z.string().trim().min(1).optional().nullable(),
  emergencyContactName: z.string().trim().min(1, 'emergencyContactName is required'),
  emergencyContactPhone: z.string().trim().min(1, 'emergencyContactPhone is required').regex(/^[0-9+\-\s()]+$/, 'emergencyContactPhone contains invalid characters'),
  joiningDate: StrictDateOnlySchema,
  employmentStatus: HrEmploymentStatusEnum.optional().default('ACTIVE'),
  exitDate: StrictDateOnlySchema.optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict().refine(data => {
  if (data.employmentStatus === 'EXITED') {
    return !!data.exitDate && data.exitDate >= data.joiningDate;
  }
  return !data.exitDate;
}, {
  message: 'exitDate is required and must be on or after joiningDate when employmentStatus is EXITED, and must be null/omitted otherwise',
  path: ['exitDate'],
});

export const UpdateHrStaffSchema = z.object({
  fullName: z.string().trim().min(1, 'fullName cannot be empty').optional(),
  designationId: z.string().trim().min(1, 'designationId cannot be empty').optional(),
  aadhaarLast4: z.string().trim().regex(/^\d{4}$/, 'aadhaarLast4 must be exactly 4 numeric digits').optional(),
  aadhaarDocumentId: z.string().trim().min(1).optional().nullable(),
  photoDocumentId: z.string().trim().min(1).optional().nullable(),
  emergencyContactName: z.string().trim().min(1, 'emergencyContactName cannot be empty').optional(),
  emergencyContactPhone: z.string().trim().min(1, 'emergencyContactPhone cannot be empty').regex(/^[0-9+\-\s()]+$/, 'emergencyContactPhone contains invalid characters').optional(),
  joiningDate: StrictDateOnlySchema.optional(),
  employmentStatus: HrEmploymentStatusEnum.optional(),
  exitDate: StrictDateOnlySchema.optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const CreateHrManpowerSanctionSchema = z.object({
  designationId: z.string().trim().min(1, 'designationId is required'),
  sanctionedCount: z.number().int('sanctionedCount must be an integer').min(0, 'sanctionedCount cannot be negative').max(10000, 'sanctionedCount cannot exceed 10000'),
  effectiveFrom: StrictDateOnlySchema,
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UpdateHrManpowerSanctionSchema = z.object({
  sanctionedCount: z.number().int('sanctionedCount must be an integer').min(0, 'sanctionedCount cannot be negative').max(10000, 'sanctionedCount cannot exceed 10000').optional(),
  effectiveFrom: StrictDateOnlySchema.optional(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UpsertHrManpowerSanctionSchema = CreateHrManpowerSanctionSchema;

export const CreateHrRosterAssignmentSchema = z.object({
  staffId: z.string().trim().min(1, 'staffId is required'),
  rosterDate: StrictDateOnlySchema,
  shiftTemplateId: z.string().trim().min(1, 'shiftTemplateId is required'),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UpdateHrRosterAssignmentSchema = z.object({
  staffId: z.string().trim().min(1).optional(),
  rosterDate: StrictDateOnlySchema.optional(),
  shiftTemplateId: z.string().trim().min(1).optional(),
  status: HrRosterStatusEnum.optional(),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const HrDesignationFilterSchema = z.object({
  status: HrDesignationStatusEnum.optional(),
  search: z.string().trim().optional(),
}).strict();

export const HrStaffFilterSchema = z.object({
  designationId: z.string().trim().min(1).optional(),
  employmentStatus: HrEmploymentStatusEnum.optional(),
  search: z.string().trim().optional(),
  joinedFrom: StrictDateOnlySchema.optional(),
  joinedTo: StrictDateOnlySchema.optional(),
}).strict().refine(data => {
  if (data.joinedFrom && data.joinedTo) {
    return data.joinedFrom <= data.joinedTo;
  }
  return true;
}, {
  message: 'joinedFrom must be on or before joinedTo',
  path: ['joinedFrom'],
});

export const HrRosterFilterSchema = z.object({
  staffId: z.string().trim().min(1).optional(),
  designationId: z.string().trim().min(1).optional(),
  shiftTemplateId: z.string().trim().min(1).optional(),
  status: HrRosterStatusEnum.optional(),
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
  path: ['fromDate'],
});

export const GeofencePolicySchema = z.object({
  radiusMetres: z.number().int().min(10).max(10000),
  maxAccuracyMetres: z.number().int().min(1).max(1000),
  attendanceGeofenceRequired: z.boolean(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
}).strict();

export const AttendanceCheckInSchema = z.object({
  rosterAssignmentId: z.string().trim().min(1, 'Roster assignment ID required'),
  latitude: z.number().min(-90).max(90, 'Invalid latitude'),
  longitude: z.number().min(-180).max(180, 'Invalid longitude'),
  accuracyMetres: z.number().positive('Accuracy must be positive').max(10000),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const AttendanceCheckOutSchema = z.object({
  latitude: z.number().min(-90).max(90, 'Invalid latitude'),
  longitude: z.number().min(-180).max(180, 'Invalid longitude'),
  accuracyMetres: z.number().positive('Accuracy must be positive').max(10000),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const AttendanceListQuerySchema = z.object({
  date: StrictDateOnlySchema.optional(),
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
  staffId: z.string().trim().min(1).optional(),
  shiftTemplateId: z.string().trim().min(1).optional(),
  status: z.enum(['CHECKED_IN', 'CHECKED_OUT', 'CANCELLED']).optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
  path: ['fromDate'],
});

export const NozzleAssignmentCreateSchema = z.object({
  rosterAssignmentId: z.string().trim().min(1, 'Roster assignment ID required'),
  nozzleId: z.string().trim().min(1, 'Nozzle ID required'),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const NozzleAssignmentListQuerySchema = z.object({
  date: StrictDateOnlySchema.optional(),
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
  staffId: z.string().trim().min(1).optional(),
  nozzleId: z.string().trim().min(1).optional(),
  shiftTemplateId: z.string().trim().min(1).optional(),
  status: z.enum(['ASSIGNED', 'CANCELLED']).optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
  path: ['fromDate'],
});

// ==========================================
// Phase 5C: Uniform Management Validators
// ==========================================

export const UniformItemCreateSchema = z.object({
  itemCode: z.string().min(1, 'Item code required').trim().toUpperCase(),
  itemName: z.string().min(1, 'Item name required').trim(),
  category: z.string().min(1, 'Category required').trim(),
  description: z.string().trim().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
}).strict();

export const UniformItemUpdateSchema = z.object({
  itemName: z.string().min(1, 'Item name required').trim().optional(),
  category: z.string().min(1, 'Category required').trim().optional(),
  description: z.string().trim().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();

export const UniformVariantCreateSchema = z.object({
  uniformItemId: z.string().min(1, 'Uniform item ID required').trim(),
  sizeLabel: z.string().min(1, 'Size label required').trim(),
  sizeSortOrder: z.number().int().default(0),
  reorderLevel: z.number().int().nonnegative('Reorder level cannot be negative').default(5),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
}).strict();

export const UniformVariantUpdateSchema = z.object({
  sizeSortOrder: z.number().int().optional(),
  reorderLevel: z.number().int().nonnegative('Reorder level cannot be negative').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();

export const UniformStockTransactionCreateSchema = z.object({
  variantId: z.string().min(1, 'Variant ID required').trim(),
  transactionType: z.enum(['OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.number().int().positive('Quantity must be positive'),
  referenceType: z.string().trim().optional().nullable(),
  referenceId: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).strict().refine(data => {
  if (['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(data.transactionType)) {
    return Boolean(data.notes && data.notes.trim().length > 0);
  }
  return true;
}, {
  message: 'Notes are required for inventory adjustments.',
  path: ['notes'],
});

export const UniformIssueCreateSchema = z.object({
  staffId: z.string().min(1, 'Staff ID required').trim(),
  variantId: z.string().min(1, 'Variant ID required').trim(),
  quantity: z.number().int().positive('Quantity must be positive').default(1),
  conditionAtIssue: z.enum(['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST']).default('NEW'),
  notes: z.string().trim().optional().nullable(),
}).strict();

export const UniformReturnSchema = z.object({
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST']),
  returnToStock: z.boolean(),
  notes: z.string().trim().optional().nullable(),
}).strict().refine(data => {
  if (data.returnToStock && ['DAMAGED', 'LOST'].includes(data.condition)) {
    return false;
  }
  return true;
}, {
  message: 'Damaged or lost items cannot be returned to usable stock.',
  path: ['returnToStock'],
});

export const UniformReplacementSchema = z.object({
  replacementVariantId: z.string().min(1, 'Replacement variant ID required').trim(),
  quantity: z.number().int().positive('Quantity must be positive').default(1),
  oldCondition: z.enum(['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST']),
  replacementReason: z.enum(['WORN_OUT', 'DAMAGED', 'SIZE_CHANGE', 'LOST', 'OTHER']),
  returnOldToStock: z.boolean(),
  notes: z.string().trim().optional().nullable(),
}).strict().refine(data => {
  if (data.returnOldToStock && ['DAMAGED', 'LOST'].includes(data.oldCondition)) {
    return false;
  }
  return true;
}, {
  message: 'Damaged or lost items cannot be returned to usable stock during replacement.',
  path: ['returnOldToStock'],
});

export const UniformIssueListQuerySchema = z.object({
  staffId: z.string().trim().min(1).optional(),
  itemId: z.string().trim().min(1).optional(),
  variantId: z.string().trim().min(1).optional(),
  status: z.enum(['ISSUED', 'RETURNED', 'REPLACED']).optional(),
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
  path: ['fromDate'],
});

export const UniformStockTransactionListQuerySchema = z.object({
  variantId: z.string().trim().min(1).optional(),
  transactionType: z.enum(['OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'ISSUE_OUT', 'RETURN_IN']).optional(),
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
  path: ['fromDate'],
});

export const UniformReportQuerySchema = z.object({
  staffId: z.string().trim().min(1).optional(),
  fromDate: StrictDateOnlySchema.optional(),
  toDate: StrictDateOnlySchema.optional(),
}).strict().refine(data => {
  if (data.fromDate && data.toDate) {
    return data.fromDate <= data.toDate;
  }
  return true;
}, {
  message: 'fromDate must be on or before toDate',
  path: ['fromDate'],
});





