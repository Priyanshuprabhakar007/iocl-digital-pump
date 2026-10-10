import { RoleCode, ScopeLevel, PermissionCode } from './constants';

export * from './constants';

export interface User {
  id: string;
  empCode: string;
  name: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
}

export interface UserWithDetails extends User {
  roles: RoleSummary[];
  scopes: UserScopeAssignment[];
}

export interface RoleSummary {
  id: string;
  code: RoleCode;
  name: string;
  description: string;
}

export interface PermissionSummary {
  id: string;
  code: PermissionCode;
  name: string;
  description: string;
}

export interface UserScopeAssignment {
  id: string;
  userId: string;
  scopeLevel: ScopeLevel;
  stateId: string | null;
  divisionId: string | null;
  salesAreaId: string | null;
  outletId: string | null;
  assignedByUserId?: string;
  createdBy?: string;
  createdAt: string;
  userName?: string;
  stateName?: string;
  divisionName?: string;
  salesAreaName?: string;
  outletName?: string;
}

export interface State {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Division {
  id: string;
  stateId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  stateName?: string;
}

export interface SalesArea {
  id: string;
  divisionId: string;
  stateId?: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  divisionName?: string;
  stateName?: string;
}

export interface RetailOutlet {
  id: string;
  roCode: string;
  name: string;
  outletType: 'COCO' | 'CODO' | 'A_SITE';
  category?: 'A_SITE' | 'B_SITE' | 'COCO' | 'CORO';
  stateId: string;
  divisionId: string;
  salesAreaId: string;
  address: string;
  location?: string;
  city: string;
  district: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
  salesAreaName?: string;
  divisionName?: string;
  stateName?: string;
  assignedUsersCount?: number;
}

export interface OutletUserAssignment {
  id: string;
  outletId: string;
  userId: string;
  assignmentType?: 'DEALER' | 'CSP' | 'INSPECTOR';
  effectiveFrom?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  isPrimary?: boolean;
  createdAt: string;
  createdBy?: string;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  revokedAt?: string | null;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  userName?: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValueJson: string | null;
  newValueJson: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  r2Key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  outletId: string | null;
  uploadedByUserId: string;
  createdAt: string;
  uploadedByName?: string;
  outletName?: string;
}

export type Document = DocumentRecord;

export interface UserContext {
  user: User;
  roles: RoleCode[];
  permissions: PermissionCode[];
  scopes: UserScopeAssignment[];
  primaryScope: ScopeLevel;
  isGlobalScope: boolean;
  accessibleStateIds: string[];
  accessibleDivisionIds: string[];
  accessibleSalesAreaIds: string[];
  accessibleOutletIds: string[];
  isGlobalAdmin: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
}

// ==========================================
// Phase 2A: Pump Operations & Shift Foundation
// ==========================================

export type ProductCategory = 'MS' | 'HSD' | 'XP95' | 'XTRAGREEN' | 'CNG' | 'OTHER' | string;
export type ProductUnit = 'LITRE' | 'KG';
export type ProductStatus = 'ACTIVE' | 'INACTIVE';
export type EquipmentStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
export type ShiftStatus = 'OPEN' | 'CLOSING' | 'CLOSED' | 'LOCKED';

export interface Product {
  id: string;
  code: string;
  name: string;
  category: ProductCategory;
  unit: ProductUnit;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OutletProduct {
  id: string;
  outletId: string;
  productId: string;
  status: ProductStatus;
  createdAt: string;
  createdBy: string;
  product?: Product;
}

export interface Tank {
  id: string;
  outletId: string;
  tankNumber: number;
  name: string;
  productId: string;
  capacityLitres: number;
  safeFillCapacityLitres: number;
  minimumOperatingLevelLitres: number;
  status: EquipmentStatus;
  commissionedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  productName?: string;
  productCode?: string;
}

export interface Dispenser {
  id: string;
  outletId: string;
  dispenserNumber: number;
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  status: EquipmentStatus;
  commissionedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  nozzlesCount?: number;
}

export interface Nozzle {
  id: string;
  outletId: string;
  dispenserId: string;
  nozzleNumber: number;
  productId: string;
  tankId: string;
  status: EquipmentStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  dispenserNumber?: number;
  dispenserName?: string;
  productName?: string;
  productCode?: string;
  tankNumber?: number;
  tankName?: string;
}

export interface ShiftTemplate {
  id: string;
  outletId: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  sequence: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface OperationalShift {
  id: string;
  outletId: string;
  shiftTemplateId: string;
  businessDate: string;
  startedAt: string;
  closedAt: string | null;
  status: ShiftStatus;
  openedByUserId: string;
  closedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  shiftTemplateName?: string;
  shiftTemplateCode?: string;
  openedByName?: string;
  closedByName?: string;
  outletName?: string;
  roCode?: string;
}

export interface OperationalShiftNozzleSnapshot {
  id: string;
  operationalShiftId: string;
  outletId: string;
  nozzleId: string;
  dispenserId: string;
  dispenserNumber: number;
  dispenserName: string;
  nozzleNumber: number;
  productId: string;
  productCode: string;
  productName: string;
  productCategory: string;
  productUnit: ProductUnit;
  tankId: string;
  tankNumber: number;
  snapshotStatus: string;
  createdAt: string;
}

export interface NozzleMeterReading {
  id: string;
  operationalShiftId: string;
  outletId: string;
  nozzleId: string;
  openingTotalizer: number;
  closingTotalizer: number;
  testingQuantity: number;
  grossSalesQuantity: number;
  netSalesQuantity: number;
  openingTotalizerMilliunits?: number;
  closingTotalizerMilliunits?: number;
  testingQuantityMilliunits?: number;
  grossSalesQuantityMilliunits?: number;
  netSalesQuantityMilliunits?: number;
  openingVarianceMilliunits?: number;
  openingTotalizerStr: string;
  closingTotalizerStr: string;
  testingQuantityStr: string;
  grossSalesQuantityStr: string;
  netSalesQuantityStr: string;
  recordedByUserId: string;
  hasOpeningVariance: boolean;
  openingVarianceQuantity: number;
  openingVarianceStr?: string;
  varianceReason: string | null;
  createdAt: string;
  updatedAt: string;
  nozzleNumber?: number;
  dispenserNumber?: number;
  dispenserName?: string;
  productName?: string;
  productCode?: string;
  recorderName?: string;
}

export interface NozzleUnavailabilityRecord {
  id: string;
  operationalShiftId: string;
  nozzleId: string;
  reason: string;
  recordedBy: string;
  createdAt: string;
  nozzleNumber?: number;
  dispenserNumber?: number;
  productName?: string;
  recordedByName?: string;
}

export interface UnitQuantitySummary {
  unit: ProductUnit;
  grossQuantity: string;
  testingQuantity: string;
  netQuantity: string;
  grossMilliunits?: number;
  testingMilliunits?: number;
  netMilliunits?: number;
}

export interface ShiftSalesSummary {
  operationalShiftId: string;
  businessDate: string;
  status: ShiftStatus;
  outletId: string;
  byNozzle: Array<{
    nozzleId: string;
    nozzleNumber: number;
    dispenserId: string;
    dispenserNumber: number;
    dispenserName: string;
    productId: string;
    productCode: string;
    productName: string;
    productCategory: string;
    unit: ProductUnit;
    openingTotalizerStr: string | null;
    closingTotalizerStr: string | null;
    grossQuantity: string;
    testingQuantity: string;
    netQuantity: string;
    openingTotalizer?: number | null;
    closingTotalizer?: number | null;
    isUnavailable: boolean;
    unavailableReason: string | null;
    hasVariance: boolean;
    varianceQuantity: string;
  }>;
  byDispenser: Array<{
    dispenserId: string;
    dispenserNumber: number;
    name: string;
    totalsByUnit: UnitQuantitySummary[];
  }>;
  byProduct: Array<{
    productId: string;
    productCode: string;
    productName: string;
    productCategory: string;
    unit: ProductUnit;
    grossQuantity: string;
    testingQuantity: string;
    netQuantity: string;
  }>;
  totalsByUnit: UnitQuantitySummary[];
}

export interface ShiftEntryGridItem {
  snapshot: OperationalShiftNozzleSnapshot;
  reading?: NozzleMeterReading | null;
  unavailability?: NozzleUnavailabilityRecord | null;
  suggestedOpeningTotalizer: string;
  hasPreviousShift: boolean;
}

// ==========================================
// Phase 2B: Tank Stock, Calibration, Receipts & Reconciliation Types
// ==========================================

export interface TankCalibrationPoint {
  id: string;
  tankId: string;
  dipMillimetresMilliunits: number;
  volumeMilliunits: number;
  dipMmStr?: string;
  volumeLitreStr?: string;
  createdAt: string;
  createdBy: string;
}

export interface OperationalShiftTankSnapshot {
  id: string;
  operationalShiftId: string;
  outletId: string;
  tankId: string;
  tankNumber: number;
  tankName: string;
  productId: string;
  productCode: string;
  productName: string;
  productUnit: ProductUnit;
  capacityMilliunits: number;
  safeFillCapacityMilliunits: number;
  capacityLitresStr?: string;
  safeFillLitresStr?: string;
  createdAt: string;
}

export type TankReadingType = 'OPENING' | 'CLOSING' | 'PRE_RECEIPT' | 'POST_RECEIPT' | 'ADHOC';
export type TankReadingSource = 'MANUAL' | 'ATG';

export interface TankStockReading {
  id: string;
  operationalShiftId: string;
  outletId: string;
  tankId: string;
  productId: string;
  readingType: TankReadingType;
  source: TankReadingSource;
  productDipMmMilliunits: number;
  waterDipMmMilliunits: number;
  grossObservedVolumeMilliunits: number;
  waterVolumeMilliunits: number;
  netProductVolumeMilliunits: number;
  productDipMmStr?: string;
  waterDipMmStr?: string;
  grossObservedVolumeStr?: string;
  waterVolumeStr?: string;
  netProductVolumeStr?: string;
  recordedAt: string;
  recordedByUserId: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  tankNumber?: number;
  tankName?: string;
  productCode?: string;
  productName?: string;
  recorderName?: string;
}

export type FuelReceiptStatus = 'ARRIVED' | 'VERIFIED' | 'DECANTED' | 'COMPLETED' | 'CANCELLED';
export type QualityStatus = 'PASS' | 'OUT_OF_TOLERANCE' | 'NOT_EVALUATED';

// ==========================================
// Phase 2C: Financial Reconciliation Types
// ==========================================

export interface ProductPrice {
  id: string;
  outletId: string;
  productId: string;
  pricePaisePerUnit: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  createdBy: string;
}

export interface OperationalShiftProductPrice {
  id: string;
  operationalShiftId: string;
  outletId: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  productCategory: string | null;
  pricePaisePerUnit: number;
  pricePerUnitStr?: string;
  sourcePriceId: string;
  createdAt: string;
}

export interface CreditParty {
  id: string;
  outletId: string;
  partyCode: string;
  partyName: string;
  contactName?: string | null;
  phone?: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type CollectionType = "CASH" | "POS_CARD" | "UPI" | "FLEET_CARD" | "CREDIT_SALE" | "DIRECT_BANK_DROP";

export interface ShiftCollection {
  id: string;
  operationalShiftId: string;
  outletId: string;
  collectionType: CollectionType;
  amountPaise: number;
  amountStr?: string;
  provider?: string | null;
  referenceNumber?: string | null;
  creditPartyId?: string | null;
  creditPartyCodeSnapshot?: string | null;
  creditPartyNameSnapshot?: string | null;
  collectedAt: string;
  recordedByUserId: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CashHandover {
  id: string;
  operationalShiftId: string;
  outletId: string;
  amountPaise: number;
  amountStr?: string;
  handedOverByUserId: string;
  receivedByUserId?: string | null;
  handedOverAt: string;
  receivedAt?: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "DISPUTED";
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankDeposit {
  id: string;
  outletId: string;
  operationalShiftId: string;
  depositChannel: "BANK_BRANCH" | "CASH_DROP_BOX";
  amountPaise: number;
  amountStr?: string;
  depositDate: string;
  referenceNumber?: string | null;
  documentId?: string | null;
  status: "SUBMITTED" | "VERIFIED" | "REJECTED";
  recordedByUserId: string;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FinancialVarianceStatus = 'BALANCED' | 'SHORTAGE' | 'EXCESS';

export interface ShiftFinancialReconciliation {
  id: string;
  operationalShiftId: string;
  outletId: string;
  fuelSalesRevenuePaise: number;
  cngSalesRevenuePaise?: number | null;
  lubeSalesRevenuePaise?: number | null;
  authoritativeSalesRevenuePaise: number;
  cashCollectionPaise: number;
  posCollectionPaise: number;
  upiCollectionPaise: number;
  fleetCardCollectionPaise: number;
  creditSalesPaise: number;
  directBankDropPaise: number;
  totalCollectionsPaise: number;
  salesCollectionVariancePaise: number;
  varianceStatus: FinancialVarianceStatus;
  varianceReason?: string | null;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialRevenueProduct {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantityMilliunits: number;
  quantityStr: string;
  pricePaisePerUnit: number;
  pricePerUnitStr: string;
  revenuePaise: number;
  revenueStr: string;
}

export interface CashDepositControl {
  cashCollectedPaise: number;
  cashCollectedStr: string;
  verifiedCashDepositedPaise: number;
  verifiedCashDepositedStr: string;
  pendingCashDepositPaise: number;
  pendingCashDepositStr: string;
}

export interface CreditSalesPartySummary {
  creditPartyId: string;
  partyCode: string;
  partyName: string;
  amountPaise: number;
  amountStr: string;
}

export interface ShiftFinancialSummary {
  operationalShiftId: string;
  outletId: string;
  salesRevenue: {
    byProduct: FinancialRevenueProduct[];
    fuelTotalPaise: number;
    fuelTotalStr: string;
    cngTotalPaise: number | null;
    cngTotalStr: string | null;
    lubeTotalPaise: number;
    lubeTotalStr: string;
    lubeBySku: LubeShiftSummarySkuItem[];
    cngApplicable: boolean;
    cngComplete: boolean;
    includedComponents: string[];
    pendingComponents: string[];
    authoritativeTotalPaise: number;
    authoritativeTotalStr: string;
    cngProduct?: FinancialRevenueProduct | null;
  };
  collections: {
    cashPaise: number;
    cashStr: string;
    posCardPaise: number;
    posCardStr: string;
    upiPaise: number;
    upiStr: string;
    fleetCardPaise: number;
    fleetCardStr: string;
    creditSalesPaise: number;
    creditSalesStr: string;
    directBankDropPaise: number;
    directBankDropStr: string;
    totalPaise: number;
    totalStr: string;
  };
  creditSalesByParty: CreditSalesPartySummary[];
  variancePaise: number;
  varianceStr: string;
  varianceStatus: FinancialVarianceStatus | null;
  varianceReason: string | null;
  cashHandoverSummary: {
    totalPendingPaise: number;
    totalPendingStr: string;
    totalAcknowledgedPaise: number;
    totalAcknowledgedStr: string;
  };
  bankDepositSummary: {
    totalSubmittedPaise: number;
    totalSubmittedStr: string;
    totalVerifiedPaise: number;
    totalVerifiedStr: string;
    totalRejectedPaise: number;
    totalRejectedStr: string;
  };
  cashDepositControl: CashDepositControl;
}

export interface FuelReceipt {
  id: string;
  outletId: string;
  operationalShiftId: string;
  ttNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  arrivalAt: string;
  decantationStartedAt?: string | null;
  decantationCompletedAt?: string | null;
  sealVerified: boolean;
  sealExceptionReason?: string | null;
  status: FuelReceiptStatus;
  recordedByUserId: string;
  createdAt: string;
  updatedAt: string;
  lines?: FuelReceiptTankLine[];
  recorderName?: string;
}

export interface FuelReceiptTankLine {
  id: string;
  fuelReceiptId: string;
  tankId: string;
  productId: string;
  invoiceQuantityMilliunits: number;
  invoiceQuantityStr?: string;
  preDecantReadingId?: string | null;
  postDecantReadingId?: string | null;
  measuredReceivedQuantityMilliunits?: number | null;
  measuredReceivedQuantityStr?: string | null;
  receiptVarianceMilliunits?: number | null;
  receiptVarianceStr?: string | null;
  densityMilliunits?: number | null;
  densityStr?: string | null;
  temperatureMilliunits?: number | null;
  temperatureStr?: string | null;
  invoiceDensityMilliunits?: number | null;
  invoiceDensityStr?: string | null;
  densityVarianceMilliunits?: number | null;
  densityVarianceStr?: string | null;
  qualityStatus: QualityStatus;
  appliedToleranceSettingId?: string | null;
  appliedDensityToleranceMilliunits?: number | null;
  appliedDensityToleranceStr?: string | null;
  createdAt: string;
  updatedAt: string;
  tankNumber?: number;
  tankName?: string;
  productCode?: string;
  productName?: string;
  preDecantReading?: TankStockReading | null;
  postDecantReading?: TankStockReading | null;
}

export type QualityScopeType = 'GLOBAL' | 'STATE' | 'DIVISION' | 'OUTLET';

export interface QualityToleranceSetting {
  id: string;
  scopeType: QualityScopeType;
  scopeEntityId?: string | null;
  productId?: string | null;
  densityToleranceMilliunits: number;
  densityToleranceStr?: string;
  status: 'ACTIVE' | 'INACTIVE';
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt: string;
  createdBy: string;
  productCode?: string;
  productName?: string;
}

export type VarianceStatus = 'GAIN' | 'LOSS' | 'BALANCED';

export interface ShiftStockReconciliation {
  id: string;
  operationalShiftId: string;
  outletId: string;
  tankId: string;
  productId: string;
  openingStockMilliunits: number;
  receiptQuantityMilliunits: number;
  salesQuantityMilliunits: number;
  theoreticalClosingStockMilliunits: number;
  physicalClosingStockMilliunits: number;
  varianceMilliunits: number;
  varianceStatus: VarianceStatus;
  openingStockStr: string;
  receiptQuantityStr: string;
  salesQuantityStr: string;
  theoreticalClosingStockStr: string;
  physicalClosingStockStr: string;
  varianceStr: string;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
  tankNumber?: number;
  tankName?: string;
  productCode?: string;
  productName?: string;
  productUnit?: ProductUnit;
}

export interface ShiftStockSummary {
  operationalShiftId: string;
  businessDate: string;
  outletId: string;
  byTank: Array<{
    tankId: string;
    tankNumber: number;
    tankName: string;
    productId: string;
    productCode: string;
    productName: string;
    productUnit: ProductUnit;
    openingStockStr: string | null;
    receiptQuantityStr: string;
    salesQuantityStr: string;
    theoreticalClosingStockStr: string | null;
    physicalClosingStockStr: string | null;
    varianceStr: string | null;
    varianceStatus: VarianceStatus | null;
    hasOpeningReading: boolean;
    hasClosingReading: boolean;
    receiptsCount: number;
  }>;
  byProduct: Array<{
    productId: string;
    productCode: string;
    productName: string;
    productUnit: ProductUnit;
    openingStockStr: string | null;
    receiptQuantityStr: string;
    salesQuantityStr: string;
    theoreticalClosingStockStr: string | null;
    physicalClosingStockStr: string | null;
    varianceStr: string | null;
    varianceStatus: VarianceStatus | null;
  }>;
}

// ==========================================
// Phase 3A-1: CNG Operations Types
// ==========================================

export interface CngShiftLog {
  id: string;
  operationalShiftId: string;
  outletId: string;
  mfmOpeningKgMilliunits: number;
  mfmClosingKgMilliunits: number;
  netSalesKgMilliunits: number;
  gridIntakeKgMilliunits: number | null;
  gridSalesVarianceKgMilliunits: number | null;
  mfmOpeningKg: string;
  mfmClosingKg: string;
  netSalesKg: string;
  gridIntakeKg: string | null;
  gridSalesVarianceKg: string | null;
  recordedByUserId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CngPressureReading {
  id: string;
  operationalShiftId: string;
  outletId: string;
  recordedAt: string;
  pressureUnit: string;
  suctionPressureMilliunits: number | null;
  dischargePressureMilliunits: number | null;
  cascadePressureMilliunits: number | null;
  suctionPressure: string | null;
  dischargePressure: string | null;
  cascadePressure: string | null;
  recordedByUserId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CngDailySummary {
  outletId: string;
  businessDate: string;
  totalMfmSalesKgMilliunits: number;
  totalMfmSalesKg: string;
  gridIntakeKgMilliunits: number | null;
  gridIntakeKg: string | null;
  gridSalesVarianceKgMilliunits: number | null;
  gridSalesVarianceKg: string | null;
  shiftCount: number;
  gridDataComplete: boolean;
}

// ==========================================
// Phase 3B-1: Lube & Auxiliary Inventory Types
// ==========================================

export type LubeStockUnit = 'LITRE' | 'PACK';

export type LubeSkuCategory = 'ENGINE_OIL' | 'GREASE' | 'COOLANT' | 'OTHER' | string;

export interface LubeSku {
  id: string;
  outletId: string;
  skuCode: string;
  name: string;
  category: string;
  stockUnit: LubeStockUnit;
  reorderThresholdSubunits: number;
  reorderThreshold: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface LubeSkuPrice {
  id: string;
  outletId: string;
  lubeSkuId: string;
  pricePaisePerUnit: number;
  pricePerUnitStr?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  createdBy: string;
}

export type LubeStockTransactionType = 'OPENING_BALANCE' | 'RECEIPT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

export interface LubeStockTransaction {
  id: string;
  outletId: string;
  lubeSkuId: string;
  transactionType: LubeStockTransactionType;
  quantitySubunits: number;
  quantity: string;
  occurredAt: string;
  referenceNumber?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface LubeShiftSale {
  id: string;
  operationalShiftId: string;
  outletId: string;
  lubeSkuId: string;
  skuCode: string;
  skuName: string;
  category: string;
  stockUnit: LubeStockUnit;
  quantitySubunits: number;
  quantity: string;
  unitPricePaise: number;
  unitPriceStr: string;
  revenuePaise: number;
  revenueStr: string;
  soldAt: string;
  recordedByUserId: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LubeStockSummaryItem {
  lubeSkuId: string;
  skuCode: string;
  skuName: string;
  category: string;
  stockUnit: LubeStockUnit;
  currentStockSubunits: number;
  currentStock: string;
  reorderThresholdSubunits: number;
  reorderThreshold: string;
  isLowStock: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface LubeShiftSummarySkuItem {
  lubeSkuId: string;
  skuCode: string;
  skuName: string;
  category: string;
  stockUnit: LubeStockUnit;
  quantitySubunits: number;
  quantity: string;
  saleCount: number;
  revenuePaise: number;
  revenueStr: string;
}

export interface LubeShiftSummary {
  operationalShiftId: string;
  outletId: string;
  businessDate: string;
  bySku: LubeShiftSummarySkuItem[];
  totalRevenuePaise: number;
  totalRevenueStr: string;
  quantitiesByUnit: {
    litre: string;
    pack: string;
  };
}

export interface LubeDailySummary {
  outletId: string;
  businessDate: string;
  shiftCountWithLubeSales: number;
  saleLineCount: number;
  bySku: LubeShiftSummarySkuItem[];
  totalRevenuePaise: number;
  totalRevenueStr: string;
  quantitiesByUnit: {
    litre: string;
    pack: string;
  };
}

export type EquipmentAssetType =
  'ATG' |
  'AIR_COMPRESSOR' |
  'CNG_COMPRESSOR' |
  'DG_SET' |
  'OTHER';

export type EquipmentType =
  'DISPENSER' | EquipmentAssetType;

export type EquipmentAssetStatus =
  'ACTIVE' |
  'INACTIVE' |
  'MAINTENANCE' |
  'DECOMMISSIONED';

export type EquipmentTicketPriority =
  'LOW' |
  'MEDIUM' |
  'HIGH' |
  'CRITICAL';

export type EquipmentFailureCategory =
  'ELECTRICAL' |
  'MECHANICAL' |
  'ELECTRONICS' |
  'COMMUNICATION' |
  'CALIBRATION' |
  'PRESSURE' |
  'LEAKAGE' |
  'POWER' |
  'SOFTWARE' |
  'OTHER';

export type EquipmentTicketStatus =
  'OPEN' |
  'ASSIGNED' |
  'IN_PROGRESS' |
  'RESOLVED' |
  'CLOSED' |
  'CANCELLED';

export type EquipmentBreakdownEventType =
  'CREATED' |
  'ASSIGNED' |
  'REASSIGNED' |
  'WORK_STARTED' |
  'RESOLVED' |
  'SIGNED_OFF' |
  'CANCELLED';

export interface EquipmentAsset {
  id: string;
  outletId: string;
  assetCode: string;
  equipmentType: EquipmentAssetType;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  status: EquipmentAssetStatus;
  commissionedAt: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentBreakdownTicket {
  id: string;
  outletId: string;
  dispenserId: string | null;
  equipmentAssetId: string | null;
  equipmentTypeSnapshot: EquipmentType;
  equipmentLabelSnapshot: string;
  priority: EquipmentTicketPriority;
  failureCategory: EquipmentFailureCategory;
  description: string;
  status: EquipmentTicketStatus;
  breakdownAt: string;
  technicianName: string | null;
  technicianPhone: string | null;
  assignedAt: string | null;
  assignedByUserId: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  downtimeSeconds: number | null;
  signoffNotes: string | null;
  signedOffAt: string | null;
  signedOffByUserId: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentBreakdownEvent {
  id: string;
  ticketId: string;
  eventType: EquipmentBreakdownEventType;
  fromStatus: EquipmentTicketStatus | null;
  toStatus: EquipmentTicketStatus | null;
  notes: string | null;
  actorUserId: string;
  createdAt: string;
}

export interface EquipmentHealthSummary {
    activeTicketCount: number;
    criticalActiveCount: number;
    resolvedAwaitingSignoffCount: number;
    currentlyDownTargetCount: number;
    countsByEquipmentType: Record<string, number>;
    countsByStatus: Record<string, number>;
}

export interface EquipmentTarget {
  targetType: "DISPENSER" | "ASSET";
  targetId: string;
  equipmentType: EquipmentType;
  label: string;
  status: EquipmentAssetStatus;
}

// ============================================================================
// Phase 4A-1: Electricity & Sub-meter Utilities
// ============================================================================

export type UtilityElectricityAccountStatus = 'ACTIVE' | 'INACTIVE';
export type UtilityElectricityBillStatus = 'PENDING' | 'PAID';
export type UtilitySubMeterBeneficiaryType = 'NFR_VENDOR' | 'CNG_FACILITY' | 'OTHER';
export type UtilitySubMeterStatus = 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';

export interface UtilityElectricityAccount {
  id: string;
  outletId: string;
  consumerNumber: string;
  providerName: string | null;
  billingCycle: string;
  status: UtilityElectricityAccountStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityElectricityBill {
  id: string;
  outletId: string;
  electricityAccountId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billAmountPaise: number;
  billAmountStr?: string;
  dueDate: string;
  billDocumentId: string;
  status: UtilityElectricityBillStatus;
  paymentReceiptDocumentId: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  paidByUserId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isOverdue?: boolean;
}

export interface UtilitySubMeter {
  id: string;
  outletId: string;
  meterCode: string;
  name: string;
  beneficiaryType: UtilitySubMeterBeneficiaryType;
  beneficiaryName: string;
  serialNumber: string | null;
  ratePaisePerKwh: number;
  ratePerKwhStr?: string;
  status: UtilitySubMeterStatus;
  commissionedAt: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilitySubMeterReading {
  id: string;
  outletId: string;
  subMeterId: string;
  previousReadingId: string | null;
  readingAt: string;
  readingMilliKwh: number;
  readingStr?: string;
  previousReadingMilliKwh: number | null;
  previousReadingStr?: string | null;
  consumptionMilliKwh: number;
  consumptionStr?: string;
  ratePaisePerKwhSnapshot: number;
  ratePerKwhStr?: string;
  chargePaise: number;
  chargeStr?: string;
  recordedByUserId: string;
  notes: string | null;
  createdAt: string;
}

export interface UtilityElectricitySummary {
  accountCount: number;
  activeAccountCount: number;
  pendingBillCount: number;
  overdueBillCount: number;
  paidBillCount: number;
  pendingAmountPaise: number;
  pendingAmountStr: string;
  overdueAmountPaise: number;
  overdueAmountStr: string;
  latestBillDueDate: string | null;
}

export interface UtilitySubMeterChargeSummaryItem {
  subMeterId: string;
  meterCode: string;
  name: string;
  beneficiaryType: UtilitySubMeterBeneficiaryType;
  beneficiaryName: string;
  consumptionMilliKwh: number;
  consumptionStr: string;
  chargePaise: number;
  chargeStr: string;
  readingCount: number;
}

export interface UtilitySubMeterChargeSummary {
  totalConsumptionMilliKwh: number;
  totalConsumptionStr: string;
  totalChargePaise: number;
  totalChargeStr: string;
  readingCount: number;
  bySubMeter: UtilitySubMeterChargeSummaryItem[];
}

// ============================================================================
// Phase 4B-1: Municipal Taxes & Statutory Dues
// ============================================================================

export type MunicipalTaxType =
  | 'PROPERTY_TAX'
  | 'TRADE_LICENSE_FEE'
  | 'SIGNAGE_CHARGE'
  | 'LOCAL_AUTHORITY_DUE';

export type MunicipalTaxFrequency =
  | 'ANNUAL'
  | 'QUARTERLY';

export type MunicipalTaxStatus =
  | 'PENDING'
  | 'PAID';

export interface MunicipalTaxDue {
  id: string;
  outletId: string;
  taxType: MunicipalTaxType;
  authorityName: string;
  referenceNumber: string;
  assessmentFrequency: MunicipalTaxFrequency;
  assessmentPeriodStart: string;
  assessmentPeriodEnd: string;
  amountPaise: number;
  amountStr?: string;
  dueDate: string;
  assessmentDocumentId: string | null;
  status: MunicipalTaxStatus;
  paymentReceiptDocumentId: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  paidByUserId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isOverdue?: boolean;
}

export interface MunicipalTaxSummary {
  totalCount: number;
  pendingCount: number;
  overdueCount: number;
  paidCount: number;

  pendingAmountPaise: number;
  pendingAmountStr: string;

  overdueAmountPaise: number;
  overdueAmountStr: string;

  paidAmountPaise: number;
  paidAmountStr: string;

  nextDueDate: string | null;
}

// ============================================================================
// Phase 4C-1: NFR / Vendor Lease & Rent Management Types
// ============================================================================

export type NfrType =
  | 'ATM'
  | 'CONVENIENCE_STORE'
  | 'QSR'
  | 'CAR_WASH'
  | 'EV_CHARGING'
  | 'CANOPY_ADVERTISING';

export type NfrSpaceStatus = 'ACTIVE' | 'INACTIVE';
export type NfrVendorStatus = 'ACTIVE' | 'INACTIVE';
export type NfrLeaseStatus = 'ACTIVE' | 'TERMINATED';
export type NfrRentPaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';

export interface NfrSpace {
  id: string;
  outletId: string;
  spaceCode: string;
  name: string;
  nfrType: NfrType;
  locationDescription: string | null;
  status: NfrSpaceStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isCurrentlyLeased?: boolean;
}

export interface NfrVendor {
  id: string;
  outletId: string;
  vendorName: string;
  ownerContactName: string;
  ownerContactPhone: string;
  ownerContactEmail: string | null;
  address: string | null;
  status: NfrVendorStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NfrLease {
  id: string;
  outletId: string;
  spaceId: string;
  vendorId: string;
  agreementNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRentPaise: number;
  monthlyRentStr: string;
  securityDepositPaise: number;
  securityDepositStr: string;
  monthlyDueDay: number;
  agreementDocumentId: string | null;
  subMeterId: string | null;
  status: NfrLeaseStatus;
  terminatedAt: string | null;
  terminationReason: string | null;
  terminatedByUserId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isExpired: boolean;
  space?: NfrSpace;
  vendor?: NfrVendor;
}

export interface NfrRentDue {
  id: string;
  outletId: string;
  leaseId: string;
  billingMonth: string;
  rentPeriodStart: string;
  rentPeriodEnd: string;
  dueDate: string;
  monthlyRentPaiseSnapshot: number;
  monthlyRentStr: string;
  totalPaidPaise: number;
  totalPaidStr: string;
  outstandingPaise: number;
  outstandingStr: string;
  paymentStatus: NfrRentPaymentStatus;
  isOverdue: boolean;
  paymentCount: number;
  createdBy: string;
  createdAt: string;
  lease?: NfrLease;
}

export interface NfrRentPayment {
  id: string;
  outletId: string;
  rentDueId: string;
  amountPaise: number;
  amountStr: string;
  receiptDocumentId: string;
  paymentReference: string | null;
  paidAt: string;
  recordedByUserId: string;
  notes: string | null;
  createdAt: string;
}

export interface NfrSummary {
  spaceCount: number;
  activeSpaceCount: number;
  vendorCount: number;
  activeVendorCount: number;
  leaseCount: number;
  activeLeaseCount: number;
  expiredLeaseCount: number;
  terminatedLeaseCount: number;
  rentDueCount: number;
  pendingDueCount: number;
  partialDueCount: number;
  paidDueCount: number;
  overdueDueCount: number;
  totalRentDuePaise: number;
  totalRentDueStr: string;
  totalCollectedPaise: number;
  totalCollectedStr: string;
  totalOutstandingPaise: number;
  totalOutstandingStr: string;
  overdueOutstandingPaise: number;
  overdueOutstandingStr: string;
  nextDueDate: string | null;
}

// ============================================================================
// Phase 5A-1: Workforce Master, Manpower Allocation & Shift Roster Types
// ============================================================================

export type HrDesignationStatus = 'ACTIVE' | 'INACTIVE';
export type HrEmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'EXITED';
export type HrRosterStatus = 'SCHEDULED' | 'CANCELLED';

export interface HrDesignation {
  id: string;
  outletId: string;
  code: string;
  name: string;
  status: HrDesignationStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HrStaff {
  id: string;
  outletId: string;
  employeeCode: string;
  fullName: string;
  designationId: string;
  aadhaarLast4: string;
  maskedAadhaar: string;
  aadhaarDocumentId: string | null;
  photoDocumentId: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  joiningDate: string;
  employmentStatus: HrEmploymentStatus;
  exitDate: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  designationName?: string;
  designationCode?: string;
}

export interface HrManpowerSanction {
  id: string;
  outletId: string;
  designationId: string;
  sanctionedCount: number;
  effectiveFrom: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  designationName?: string;
  designationCode?: string;
}

export interface HrManpowerDesignationSummary {
  designationId: string;
  designationCode: string;
  designationName: string;
  sanctionedCount: number;
  actualCount: number;
  varianceCount: number;
  shortageCount: number;
  excessCount: number;
}

export interface HrManpowerSummary {
  totalSanctionedCount: number;
  totalActualCount: number;
  totalShortageCount: number;
  totalExcessCount: number;
  byDesignation: HrManpowerDesignationSummary[];
}

export interface HrRosterAssignment {
  id: string;
  outletId: string;
  staffId: string;
  rosterDate: string;
  shiftTemplateId: string;
  status: HrRosterStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  staffName?: string;
  employeeCode?: string;
  designationName?: string;
  shiftTemplateCode?: string;
  shiftTemplateName?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
}

export interface HrGeofencePolicy {
  id: string;
  outletId: string;
  radiusMetres: number;
  maxAccuracyMetres: number;
  attendanceGeofenceRequired: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type HrAttendanceStatus = 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';

export interface HrAttendanceRecord {
  id: string;
  outletId: string;
  staffId: string;
  rosterAssignmentId: string;
  attendanceDate: string;
  shiftTemplateId: string;
  checkInAt: string;
  checkInLatitude: number;
  checkInLongitude: number;
  checkInAccuracyMetres: number;
  checkInDistanceMetres: number;
  checkInInsideGeofence: number;
  checkOutAt: string | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  checkOutAccuracyMetres: number | null;
  checkOutDistanceMetres: number | null;
  checkOutInsideGeofence: number | null;
  status: HrAttendanceStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  staffName?: string;
  employeeCode?: string;
  designationName?: string;
  shiftTemplateCode?: string;
  shiftTemplateName?: string;
}

export type HrNozzleAssignmentStatus = 'ASSIGNED' | 'CANCELLED';

export interface HrNozzleAssignment {
  id: string;
  outletId: string;
  rosterAssignmentId: string;
  staffId: string;
  nozzleId: string;
  assignmentDate: string;
  shiftTemplateId: string;
  status: HrNozzleAssignmentStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  staffName?: string;
  employeeCode?: string;
  nozzleNumber?: number;
  productName?: string;
  dispenserName?: string;
  shiftTemplateName?: string;
}

// ==========================================
// Phase 5C: Uniform Management
// ==========================================

export type HrUniformCategory = 'SHIRT' | 'TROUSER' | 'JACKET' | 'T_SHIRT' | 'CAP' | 'SHOES' | 'BELT' | 'OTHER' | string;
export type HrUniformStatus = 'ACTIVE' | 'INACTIVE';
export type HrUniformStockTransactionType = 'OPENING_BALANCE' | 'RECEIPT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'ISSUE_OUT' | 'RETURN_IN';
export type HrUniformIssueStatus = 'ISSUED' | 'RETURNED' | 'REPLACED';
export type HrUniformCondition = 'NEW' | 'GOOD' | 'FAIR' | 'DAMAGED' | 'LOST';
export type HrUniformReplacementReason = 'WORN_OUT' | 'DAMAGED' | 'SIZE_CHANGE' | 'LOST' | 'OTHER';

export interface HrUniformItem {
  id: string;
  outletId: string;
  itemCode: string;
  itemName: string;
  category: HrUniformCategory;
  description: string | null;
  status: HrUniformStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HrUniformVariant {
  id: string;
  outletId: string;
  uniformItemId: string;
  sizeLabel: string;
  sizeSortOrder: number;
  reorderLevel: number;
  status: HrUniformStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  itemCode?: string;
  itemName?: string;
  category?: HrUniformCategory;
}

export interface HrUniformStockTransaction {
  id: string;
  outletId: string;
  variantId: string;
  transactionType: HrUniformStockTransactionType;
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
  itemCode?: string;
  itemName?: string;
  sizeLabel?: string;
}

export interface HrUniformStockSummary {
  variantId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  category: HrUniformCategory;
  sizeLabel: string;
  sizeSortOrder: number;
  reorderLevel: number;
  status: HrUniformStatus;
  currentStock: number;
  isLowStock: boolean;
}

export interface HrUniformIssue {
  id: string;
  outletId: string;
  staffId: string;
  variantId: string;
  quantity: number;
  issuedAt: string;
  issuedBy: string;
  conditionAtIssue: HrUniformCondition;
  status: HrUniformIssueStatus;
  closedAt: string | null;
  closedBy: string | null;
  conditionOnClose: HrUniformCondition | null;
  replacementReason: HrUniformReplacementReason | null;
  replacesIssueId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  staffName?: string;
  employeeCode?: string;
  itemCode?: string;
  itemName?: string;
  sizeLabel?: string;
  category?: HrUniformCategory;
}

export interface HrUniformReportSummary {
  totalActiveItems: number;
  totalActiveVariants: number;
  totalAvailableStock: number;
  lowStockVariantCount: number;
  totalIssued: number;
  totalReturned: number;
  totalReplaced: number;
}

export interface UserPermissionsDetails {
  user: {
    id: string;
    name: string;
    empCode: string;
    email: string;
    status: string;
  };
  roleCodes: RoleCode[];
  inheritedPermissionCodes: PermissionCode[];
  overrides: Array<{
    permissionCode: string;
    effect: 'ALLOW' | 'DENY';
  }>;
  effectivePermissionCodes: PermissionCode[];
  scopes: UserScopeAssignment[];
}

export type OrgStatus = 'ACTIVE' | 'INACTIVE';
export type OfficerStatus = 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'RETIRED';
export type OfficerPostingScopeLevel = 'GLOBAL' | 'STATE' | 'DIVISION' | 'SALES_AREA' | 'OUTLET';
export type ServiceType = 'MANPOWER' | 'HOUSEKEEPING' | 'SECURITY' | 'MAINTENANCE' | 'OTHER';

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: OrgStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Officer {
  id: string;
  employeeCode: string;
  fullName: string;
  designationTitle: string;
  departmentId: string;
  email: string | null;
  phone: string | null;
  status: OfficerStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  departmentName?: string;
  departmentCode?: string;
}

export interface OfficerPosting {
  id: string;
  officerId: string;
  scopeLevel: OfficerPostingScopeLevel;
  stateId: string | null;
  divisionId: string | null;
  salesAreaId: string | null;
  outletId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isPrimary: boolean;
  status: OrgStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  officerName?: string;
  employeeCode?: string;
}

export interface ServiceProvider {
  id: string;
  providerCode: string;
  providerName: string;
  proprietorOrAuthorizedPerson: string | null;
  contactPerson: string | null;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  stateText: string | null;
  pincode: string | null;
  status: OrgStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutletServiceProviderAssignment {
  id: string;
  outletId: string;
  serviceProviderId: string;
  serviceType: ServiceType;
  contractNumber: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: OrgStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  outletName?: string;
  serviceProviderName?: string;
  providerCode?: string;
}







