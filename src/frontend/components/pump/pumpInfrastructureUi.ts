import {
  Product,
  OutletProduct,
  Tank,
  Dispenser,
  Nozzle,
} from '../../../shared/types';

// =========================================================================
// 1. DU LABELS & NOZZLE POSITIONS
// =========================================================================

export function getDuTypeLabel(capacity?: number | null): string {
  if (capacity === 2) return '2 Nozzle DU';
  if (capacity === 4) return '4 Nozzle DU';
  if (capacity === 6) return '6 Nozzle DU';
  return `${capacity || 6} Nozzle DU`;
}

export function getAvailableNozzleNumbers(
  capacity?: number | null,
  existingNozzles?: (Nozzle | { nozzleNumber: number })[] | null
): number[] {
  const cap = [2, 4, 6].includes(Number(capacity)) ? Number(capacity) : (capacity || 6);
  const configuredSet = new Set<number>();

  if (Array.isArray(existingNozzles)) {
    for (const n of existingNozzles) {
      if (n && typeof n.nozzleNumber === 'number') {
        configuredSet.add(n.nozzleNumber);
      }
    }
  }

  const available: number[] = [];
  for (let i = 1; i <= cap; i++) {
    if (!configuredSet.has(i)) {
      available.push(i);
    }
  }
  return available;
}

// =========================================================================
// 2. TANK & PRODUCT FILTERING
// =========================================================================

export function getTanksForProduct(
  tanks?: Tank[] | null,
  productId?: string | null
): Tank[] {
  if (!Array.isArray(tanks) || !productId) return [];
  return tanks.filter(t => t && t.productId === productId);
}

export function getActiveLiquidOutletProducts(
  outletProducts?: OutletProduct[] | null
): OutletProduct[] {
  if (!Array.isArray(outletProducts)) return [];
  return outletProducts.filter(op => {
    if (!op || op.status !== 'ACTIVE') return false;
    const prod = op.product;
    if (!prod) return true; // If product relation is not expanded, allow
    if (prod.status !== 'ACTIVE') return false;
    if (prod.unit === 'KG' || prod.category === 'CNG') return false;
    return true;
  });
}

export interface ResolvedNozzleFormState {
  dispenserId: string;
  selectedDispenser: Dispenser | null;
  availablePositions: number[];
  nozzleNumber: number;
  activeLiquidProducts: OutletProduct[];
  productId: string;
  matchingTanks: Tank[];
  tankId: string;
}

export function resolveNozzleFormState(
  dispensers?: Dispenser[] | null,
  nozzles?: Nozzle[] | null,
  outletProducts?: OutletProduct[] | null,
  tanks?: Tank[] | null,
  currentSelection?: {
    dispenserId?: string | null;
    nozzleNumber?: number | null;
    productId?: string | null;
    tankId?: string | null;
  }
): ResolvedNozzleFormState {
  const dispList = Array.isArray(dispensers) ? dispensers : [];
  const nozzList = Array.isArray(nozzles) ? nozzles : [];
  const tankList = Array.isArray(tanks) ? tanks : [];
  const activeLiquidProducts = getActiveLiquidOutletProducts(outletProducts);

  let selectedDispenser: Dispenser | null = null;
  if (currentSelection?.dispenserId) {
    selectedDispenser = dispList.find(d => d && d.id === currentSelection.dispenserId) || null;
  }
  if (!selectedDispenser && dispList.length > 0) {
    selectedDispenser =
      dispList.find(d => {
        const duNozzles = nozzList.filter(n => n && n.dispenserId === d.id);
        return getAvailableNozzleNumbers(d.nozzleCapacity, duNozzles).length > 0;
      }) || dispList[0];
  }

  const dispenserId = selectedDispenser?.id || '';
  const duNozzles = nozzList.filter(n => n && n.dispenserId === dispenserId);
  const availablePositions = getAvailableNozzleNumbers(selectedDispenser?.nozzleCapacity, duNozzles);

  const requestedNozzleNum = Number(currentSelection?.nozzleNumber);
  const nozzleNumber = availablePositions.includes(requestedNozzleNum)
    ? requestedNozzleNum
    : (availablePositions[0] ?? (requestedNozzleNum > 0 ? requestedNozzleNum : 1));

  let productId = '';
  if (
    currentSelection?.productId &&
    activeLiquidProducts.some(op => op.productId === currentSelection.productId)
  ) {
    productId = currentSelection.productId;
  } else {
    const withActiveTank = activeLiquidProducts.find(op =>
      getTanksForProduct(tankList, op.productId).some(t => t.status === 'ACTIVE')
    );
    productId = withActiveTank?.productId || activeLiquidProducts[0]?.productId || '';
  }

  const matchingTanks = getTanksForProduct(tankList, productId).filter(t => t.status === 'ACTIVE');
  const tankId =
    currentSelection?.tankId && matchingTanks.some(t => t.id === currentSelection.tankId)
      ? currentSelection.tankId
      : (matchingTanks[0]?.id || '');

  return {
    dispenserId,
    selectedDispenser,
    availablePositions,
    nozzleNumber,
    activeLiquidProducts,
    productId,
    matchingTanks,
    tankId,
  };
}

// =========================================================================
// 3. DU UTILIZATION
// =========================================================================

export interface DuUtilization {
  capacity: number;
  configured: number;
  ratioText: string;
  isFull: boolean;
  hasUnused: boolean;
  percent: number;
}

export function getDuUtilization(
  capacity?: number | null,
  nozzlesCount?: number | null
): DuUtilization {
  const cap = [2, 4, 6].includes(Number(capacity)) ? Number(capacity) : (capacity || 6);
  const configured = Math.max(0, Number(nozzlesCount) || 0);
  const ratioText = `${configured} / ${cap} configured`;
  const isFull = configured >= cap;
  const hasUnused = configured < cap;
  const percent = Math.min(100, Math.round((configured / cap) * 100));

  return {
    capacity: cap,
    configured,
    ratioText,
    isFull,
    hasUnused,
    percent,
  };
}

// =========================================================================
// 4. FUEL MAPPING TREE
// =========================================================================

export interface FuelMappingNozzleNode {
  id: string;
  nozzleNumber: number;
  status: string;
  dispenserId: string;
  tankId: string;
  productId: string;
}

export interface FuelMappingDuNode {
  dispenser: Dispenser;
  duTypeLabel: string;
  utilization: DuUtilization;
  nozzles: FuelMappingNozzleNode[];
  warnings: string[];
}

export interface FuelMappingTankNode {
  tank: Tank;
  connectedDus: FuelMappingDuNode[];
  totalNozzlesCount: number;
  warnings: string[];
}

export interface FuelMappingProductNode {
  product: Product;
  outletProduct?: OutletProduct;
  tanks: FuelMappingTankNode[];
  totalTanksCount: number;
  totalNozzlesCount: number;
  warnings: string[];
}

export interface FuelMappingTreeResult {
  products: FuelMappingProductNode[];
  unmappedTanks: Tank[];
  unassignedDispensers: FuelMappingDuNode[];
  warningsSummary: string[];
}

export function buildFuelMappingTree(
  products?: Product[] | null,
  outletProducts?: OutletProduct[] | null,
  tanks?: Tank[] | null,
  dispensers?: Dispenser[] | null,
  nozzles?: Nozzle[] | null
): FuelMappingTreeResult {
  const prodsList = Array.isArray(products) ? products : [];
  const opsList = Array.isArray(outletProducts) ? outletProducts : [];
  const tanksList = Array.isArray(tanks) ? tanks : [];
  const dispsList = Array.isArray(dispensers) ? dispensers : [];
  const nozzlesList = Array.isArray(nozzles) ? nozzles : [];

  const warningsSummary: string[] = [];

  // Group nozzles by dispenser
  const nozzlesByDispenser = new Map<string, Nozzle[]>();
  // Group nozzles by tank
  const nozzlesByTank = new Map<string, Nozzle[]>();

  for (const n of nozzlesList) {
    if (!n) continue;
    if (n.dispenserId) {
      const list = nozzlesByDispenser.get(n.dispenserId) || [];
      list.push(n);
      nozzlesByDispenser.set(n.dispenserId, list);
    }
    if (n.tankId) {
      const list = nozzlesByTank.get(n.tankId) || [];
      list.push(n);
      nozzlesByTank.set(n.tankId, list);
    }
  }

  // Build product map (outlet mapped preferred, or fallback)
  const productMap = new Map<string, Product>();
  for (const p of prodsList) {
    if (p && p.id) productMap.set(p.id, p);
  }

  // Group tanks by product
  const tanksByProduct = new Map<string, Tank[]>();
  const mappedTankIds = new Set<string>();

  for (const t of tanksList) {
    if (!t) continue;
    if (t.productId) {
      const list = tanksByProduct.get(t.productId) || [];
      list.push(t);
      tanksByProduct.set(t.productId, list);
      mappedTankIds.add(t.id);
    }
  }

  const unmappedTanks = tanksList.filter(t => t && !t.productId);

  // Identify DUs with nozzles or unassigned
  const duMap = new Map<string, Dispenser>();
  for (const d of dispsList) {
    if (d && d.id) duMap.set(d.id, d);
  }

  // Build product nodes
  const productNodes: FuelMappingProductNode[] = [];

  // Consider all mapped outlet products, plus any products that have tanks
  const relevantProductIds = new Set<string>();
  for (const op of opsList) {
    if (op && op.productId) relevantProductIds.add(op.productId);
  }
  for (const pid of tanksByProduct.keys()) {
    relevantProductIds.add(pid);
  }

  for (const pid of relevantProductIds) {
    const product = productMap.get(pid) || {
      id: pid,
      code: pid,
      name: `Product (${pid})`,
      category: 'OTHER',
      unit: 'LITRE',
      status: 'ACTIVE',
      createdAt: '',
      updatedAt: '',
    };
    const outletProduct = opsList.find(op => op.productId === pid);
    const prodTanks = tanksByProduct.get(pid) || [];
    const prodWarnings: string[] = [];

    const tankNodes: FuelMappingTankNode[] = [];
    let prodTotalNozzles = 0;

    for (const t of prodTanks) {
      const tankNozzles = nozzlesByTank.get(t.id) || [];
      const tankWarnings: string[] = [];

      if (tankNozzles.length === 0) {
        const warn = `Tank #${t.tankNumber} (${t.name}) has no connected nozzles`;
        tankWarnings.push(warn);
        warningsSummary.push(warn);
      }

      // Group tank nozzles by dispenser
      const dusForTank = new Map<string, Nozzle[]>();
      for (const n of tankNozzles) {
        const list = dusForTank.get(n.dispenserId) || [];
        list.push(n);
        dusForTank.set(n.dispenserId, list);
      }

      const connectedDus: FuelMappingDuNode[] = [];

      for (const [dispId, dispNozzles] of dusForTank.entries()) {
        const dispenser = duMap.get(dispId) || {
          id: dispId,
          outletId: t.outletId,
          dispenserNumber: 0,
          name: `DU (${dispId})`,
          nozzleCapacity: 6,
          status: 'ACTIVE',
          createdAt: '',
          updatedAt: '',
          createdBy: '',
        };

        const allDuNozzles = nozzlesByDispenser.get(dispId) || [];
        const util = getDuUtilization(dispenser.nozzleCapacity, allDuNozzles.length);
        const duWarnings: string[] = [];

        if (util.hasUnused) {
          duWarnings.push(`DU has ${util.capacity - util.configured} unused nozzle position(s)`);
        }

        connectedDus.push({
          dispenser,
          duTypeLabel: getDuTypeLabel(dispenser.nozzleCapacity),
          utilization: util,
          nozzles: dispNozzles.map(n => ({
            id: n.id,
            nozzleNumber: n.nozzleNumber,
            status: n.status,
            dispenserId: n.dispenserId,
            tankId: n.tankId,
            productId: n.productId,
          })),
          warnings: duWarnings,
        });
      }

      prodTotalNozzles += tankNozzles.length;

      tankNodes.push({
        tank: t,
        connectedDus,
        totalNozzlesCount: tankNozzles.length,
        warnings: tankWarnings,
      });
    }

    if (tankNodes.length === 0) {
      const warn = `Product ${product.code} (${product.name}) has no underground tanks configured`;
      prodWarnings.push(warn);
      warningsSummary.push(warn);
    }

    productNodes.push({
      product,
      outletProduct,
      tanks: tankNodes,
      totalTanksCount: tankNodes.length,
      totalNozzlesCount: prodTotalNozzles,
      warnings: prodWarnings,
    });
  }

  // Build unassigned DUs (zero configured nozzles)
  const unassignedDispensers: FuelMappingDuNode[] = [];
  for (const d of dispsList) {
    const duNozzles = nozzlesByDispenser.get(d.id) || [];
    if (duNozzles.length === 0) {
      const util = getDuUtilization(d.nozzleCapacity, 0);
      const warn = `DU #${d.dispenserNumber} (${d.name}) has zero configured nozzles`;
      warningsSummary.push(warn);
      unassignedDispensers.push({
        dispenser: d,
        duTypeLabel: getDuTypeLabel(d.nozzleCapacity),
        utilization: util,
        nozzles: [],
        warnings: [warn],
      });
    }
  }

  return {
    products: productNodes,
    unmappedTanks,
    unassignedDispensers,
    warningsSummary,
  };
}

// =========================================================================
// 5. ERROR SANITIZATION
// =========================================================================

export function getPumpInfrastructureErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const code = typeof error === 'string'
    ? error
    : (error.code || error.error?.code || error.message || '');

  const rawMessage = typeof error === 'object'
    ? (error.message || error.error?.message || '')
    : '';

  // Specific Business Error Codes
  switch (code) {
    case 'NOZZLE_CAPACITY_EXCEEDED':
      return 'Nozzle number exceeds the physical nozzle capacity of this Dispensing Unit (DU).';

    case 'DISPENSER_CAPACITY_BELOW_EXISTING_NOZZLES':
      return 'Cannot change this DU to a smaller nozzle configuration because higher-numbered nozzle positions are already configured.';

    case 'NOZZLE_DISPENSER_OUTLET_MISMATCH':
      return 'Selected Dispensing Unit does not belong to this retail outlet.';

    case 'NOZZLE_TANK_OUTLET_MISMATCH':
      return 'Selected Underground Tank does not belong to this retail outlet.';

    case 'NOZZLE_TANK_PRODUCT_MISMATCH':
      return 'Selected Underground Tank product does not match the nozzle product.';

    case 'NOZZLE_OUTLET_PRODUCT_NOT_MAPPED':
      return 'Product is not mapped to this retail outlet.';

    case 'NOZZLE_TOPOLOGY_INTEGRITY_ERROR':
      return 'An existing nozzle record for this position has broken topology references. Please repair the existing nozzle configuration instead of creating a duplicate.';

    case 'PRODUCT_IN_USE':
      return 'Product cannot be deactivated because active tanks or nozzles depend on it.';

    case 'TANK_PRODUCT_CHANGE_BLOCKED':
      return rawMessage || 'Cannot change tank fuel product because dependent nozzles, historical readings, or fuel receipts are tied to this tank.';

    case 'TANK_IN_USE':
      return 'Tank cannot be modified or deactivated because active nozzles depend on it.';

    case 'ACTIVE_NOZZLES_DEPEND_ON_TANK':
      return 'Cannot deactivate tank while active nozzles are connected to it.';

    case 'ACTIVE_NOZZLES_DEPEND_ON_DISPENSER':
      return 'Cannot deactivate dispenser while active nozzles belong to it.';

    case 'UNIT_NOT_SUPPORTED_BY_LIQUID_TANK':
      return 'Only liquid products measured in litres can be assigned to underground fuel tanks.';

    case 'INVALID_PRODUCT':
      return 'Product is invalid or not mapped to this retail outlet.';

    case 'INVALID_TANK':
      return 'Tank is invalid or belongs to another retail outlet.';

    case 'PRODUCT_MISMATCH':
      return 'Tank product does not match the nozzle product.';

    case 'INACTIVE_PRODUCT':
      return 'Cannot configure nozzle because the product or its outlet mapping is inactive.';

    case 'INACTIVE_TANK':
      return 'Cannot configure nozzle because the underground tank is inactive.';

    case 'INACTIVE_DISPENSER':
      return 'Cannot configure nozzle because the dispenser is inactive.';

    case 'DUPLICATE_DIP':
      return rawMessage || 'A calibration point for this dip height (mm) already exists.';

    case 'NON_MONOTONIC_CALIBRATION':
      return rawMessage || 'Calibration volume must increase monotonically with dip height.';

    case 'CALIBRATION_IMPORT_FAILED':
      return rawMessage || 'Bulk calibration import failed. Please verify dip and volume values.';

    case 'CALIBRATION_NOT_AVAILABLE':
      return rawMessage || 'Tank calibration chart requires at least 2 calibration points.';

    case 'CALIBRATION_CHART_LOCKED_HISTORICAL_REFERENCE':
      return (
        rawMessage ||
        'This calibration chart version is referenced by historical tank readings and cannot be modified in place. Create or import a new revision instead.'
      );

    case 'CALIBRATION_ACTIVATION_FORBIDDEN':
      return (
        rawMessage ||
        'Activating or approving a calibration chart requires explicit tank infrastructure authorization (TANKS_WRITE or ADMIN). Please save as DRAFT instead.'
      );

    case 'MAX_DIP_RANGE_EXCEEDED':
      return rawMessage || 'One or more calibration points exceed the configured maximum dip range.';

    case 'MAX_DIP_EXCEEDS_DIAMETER':
      return rawMessage || 'Configured maximum dip range cannot exceed the tank internal diameter.';

    case 'CAPACITY_CONFLICT':
      return rawMessage || 'Maximum chart volume exceeds nominal tank capacity.';

    case 'INSUFFICIENT_CALIBRATION_POINTS':
      return rawMessage || 'At least 2 calibration points are required to approve or activate a chart.';

    case 'CHART_NOT_FOUND':
      return rawMessage || 'Requested calibration chart revision was not found.';

    case 'INVALID_UNITS':
      return rawMessage || 'Invalid calibration units. Dip must be in millimetres (mm) and volume in litres (L).';

    case 'DIP_OUT_OF_RANGE':
      return rawMessage || 'Dip measurement is outside the configured calibration chart range.';

    case 'FORBIDDEN':
      return 'You do not have permission to perform this infrastructure action.';

    case 'VALIDATION_ERROR':
      return rawMessage || 'Please check the entered fields and try again.';

    case 'NETWORK_ERROR':
      return 'Network connection error. Please try again.';

    case 'HTTP_ERROR':
      return 'An HTTP error occurred while communicating with the server.';

    case 'INTERNAL_SERVER_ERROR':
      return 'An unexpected server error occurred. Please contact support.';
  }

  // Check raw message for known triggers or constraints
  const combined = `${code} ${rawMessage}`.toUpperCase();

  if (combined.includes('NOZZLE_TOPOLOGY_INTEGRITY_ERROR')) {
    return 'An existing nozzle record for this position has broken topology references. Please repair the existing nozzle configuration instead of creating a duplicate.';
  }
  if (combined.includes('NOZZLE_CAPACITY_EXCEEDED')) {
    return 'Nozzle number exceeds the physical nozzle capacity of this Dispensing Unit (DU).';
  }
  if (combined.includes('DISPENSER_CAPACITY_BELOW_EXISTING_NOZZLES')) {
    return 'Cannot change this DU to a smaller nozzle configuration because higher-numbered nozzle positions are already configured.';
  }
  if (combined.includes('NOZZLE_DISPENSER_OUTLET_MISMATCH')) {
    return 'Selected Dispensing Unit does not belong to this retail outlet.';
  }
  if (combined.includes('NOZZLE_TANK_OUTLET_MISMATCH')) {
    return 'Selected Underground Tank does not belong to this retail outlet.';
  }
  if (combined.includes('NOZZLE_TANK_PRODUCT_MISMATCH')) {
    return 'Selected Underground Tank product does not match the nozzle product.';
  }
  if (combined.includes('NOZZLE_OUTLET_PRODUCT_NOT_MAPPED')) {
    return 'Product is not mapped to this retail outlet.';
  }
  if (combined.includes('TEMPLATE_POINTS_NOT_VALIDATED')) {
    return 'Reference templates cannot be marked APPROVED unless complete dip-to-volume calibration points have been imported and validated.';
  }
  if (combined.includes('INCOMPLETE_CALIBRATION_RANGE')) {
    return rawMessage || 'Calibration points must start at 0 mm (0 L) and cover the full reference Max Dip range.';
  }
  if (combined.includes('ASSIGNMENT_FAILED')) {
    return rawMessage || 'Global calibration template assignment failed. Verify that the template is APPROVED and has validated points.';
  }
  if (combined.includes('OVER_CAPACITY_CEILING_EXCEEDED')) {
    return rawMessage || 'Chart maximum volume exceeds the maximum permitted +10% over-capacity ceiling.';
  }
  if (combined.includes('OVER_CAPACITY_CONFIRMATION_REQUIRED')) {
    return rawMessage || 'Explicit confirmation of above-nominal chart volume (up to the +10% ceiling) is required before approving this template.';
  }

  // Strict Sanitization: Never expose raw SQLite / SQL / D1 / stack traces
  if (
    combined.includes('SQLITE') ||
    combined.includes('SYNTAX ERROR') ||
    combined.includes('D1_') ||
    combined.includes('CONSTRAINT') ||
    combined.includes('NEAR "') ||
    combined.includes('STACK TRACE') ||
    combined.includes('QUERY FAILED')
  ) {
    return 'A database constraint prevented this operation. Please verify fuel topology requirements.';
  }

  return rawMessage || 'An unexpected error occurred. Please verify your inputs.';
}

// =========================================================================
// 6. PRODUCT CATEGORY BADGE
// =========================================================================

export function getProductCategoryBadgeClass(category?: string | null): string {
  const cat = (category || '').toUpperCase();
  switch (cat) {
    case 'MS':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'HSD':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'XP95':
      return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    case 'XP100':
      return 'bg-purple-500/10 text-purple-300 border-purple-500/30 shadow-sm shadow-purple-500/10 font-bold';
    case 'XTRAGREEN':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'CNG':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}

// =========================================================================
// 7. EDIT NOZZLE DEPENDENCY HELPERS
// =========================================================================

export function filterTanksForEditNozzle(
  tanks: Tank[] | null | undefined,
  productId: string | null | undefined
): Tank[] {
  if (!Array.isArray(tanks) || !productId) return [];
  return tanks.filter(t => t && t.productId === productId && t.status === 'ACTIVE');
}

export function findTankProduct(
  tanks: Tank[] | null | undefined,
  tankId: string | null | undefined
): string | null {
  if (!Array.isArray(tanks) || !tankId) return null;
  const t = tanks.find(tank => tank && tank.id === tankId);
  return t ? t.productId : null;
}

// =========================================================================
// 8. TANK CALIBRATION CHART HELPERS
// =========================================================================

export interface TankCalibrationStatusInfo {
  isConfigured: boolean;
  pointsCount: number;
  badgeLabel: string;
  fullLabel: string;
  badgeClass: string;
  warningText: string | null;
}

export function getTankCalibrationStatus(pointsCount?: number | null): TankCalibrationStatusInfo {
  const count = Math.max(0, Number(pointsCount) || 0);
  if (count >= 2) {
    return {
      isConfigured: true,
      pointsCount: count,
      badgeLabel: `Configured (${count} points)`,
      fullLabel: `Calibration: Configured (${count} points)`,
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      warningText: null,
    };
  }
  return {
    isConfigured: false,
    pointsCount: count,
    badgeLabel: 'Missing',
    fullLabel: 'Calibration: Missing',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    warningText:
      count === 1
        ? 'At least 2 calibration points are required before recording tank dips in Daily Operations.'
        : 'Upload calibration chart before recording dips in Daily Operations.',
  };
}

export function formatCalibrationDecimal(value: string | number): string {
  const cleaned = String(value ?? '').replace(/,/g, '').trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid calibration numeric value: ${value}`);
  }
  return num.toFixed(3);
}

export function formatCalibrationDisplay(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '0';
  const cleaned = String(value).replace(/,/g, '').trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return String(value);
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(3).replace(/\.?0+$/, '');
}

export interface CalibrationPointInput {
  dipMillimetres: string;
  volumeLitres: string;
}

export function buildDummyCalibrationPreset(capacityLitres = 20000): CalibrationPointInput[] {
  const cap = Number(capacityLitres) > 0 ? Number(capacityLitres) : 20000;
  const steps = [0, 0.25, 0.5, 0.75, 1];
  const maxDipMm = 2000;
  return steps.map(ratio => ({
    dipMillimetres: formatCalibrationDecimal(Math.round(maxDipMm * ratio)),
    volumeLitres: formatCalibrationDecimal(Math.round(cap * ratio)),
  }));
}

export function formatDummyCalibrationPresetText(capacityLitres = 20000): string {
  return buildDummyCalibrationPreset(capacityLitres)
    .map(pt => `${formatCalibrationDisplay(pt.dipMillimetres)},${formatCalibrationDisplay(pt.volumeLitres)}`)
    .join('\n');
}

export interface CalibrationValidationResult {
  valid: boolean;
  error: string | null;
  normalizedPoints: CalibrationPointInput[];
}

export interface CalibrationValidationOptions {
  tankCapacityLitres?: number;
  allowOverCapacity?: boolean;
  requireMinTwoPoints?: boolean;
  maxDipMm?: number;
  tankDiameterMm?: number;
}

export function validateCalibrationChartPoints(
  points: Array<{ dipMillimetres: string | number; volumeLitres: string | number }>,
  options?: CalibrationValidationOptions
): CalibrationValidationResult {
  const requireMinTwo = options?.requireMinTwoPoints !== false;
  if (!Array.isArray(points) || (requireMinTwo && points.length < 2)) {
    return {
      valid: false,
      error: 'At least 2 calibration points are required to configure a calibration chart.',
      normalizedPoints: [],
    };
  }

  if (
    options?.maxDipMm !== undefined &&
    options.maxDipMm > 0 &&
    options?.tankDiameterMm !== undefined &&
    options.tankDiameterMm > 0 &&
    options.maxDipMm > options.tankDiameterMm
  ) {
    return {
      valid: false,
      error: `Maximum dip range (${formatCalibrationDisplay(options.maxDipMm)} mm) cannot exceed tank internal diameter (${formatCalibrationDisplay(options.tankDiameterMm)} mm).`,
      normalizedPoints: [],
    };
  }

  const parsed: Array<{ dipNum: number; volNum: number; dipMillimetres: string; volumeLitres: string }> = [];

  for (let i = 0; i < points.length; i++) {
    const rawDip = String(points[i]?.dipMillimetres ?? '').replace(/,/g, '').trim();
    const rawVol = String(points[i]?.volumeLitres ?? '').replace(/,/g, '').trim();

    if (rawDip === '' || rawVol === '') {
      return {
        valid: false,
        error: `Row ${i + 1}: Both Dip (mm) and Volume (L) are required.`,
        normalizedPoints: [],
      };
    }

    const dipNum = Number(rawDip);
    const volNum = Number(rawVol);

    if (!Number.isFinite(dipNum)) {
      return {
        valid: false,
        error: `Row ${i + 1}: Dip (mm) "${points[i]?.dipMillimetres}" is not a valid number.`,
        normalizedPoints: [],
      };
    }
    if (!Number.isFinite(volNum)) {
      return {
        valid: false,
        error: `Row ${i + 1}: Volume (L) "${points[i]?.volumeLitres}" is not a valid number.`,
        normalizedPoints: [],
      };
    }
    if (dipNum < 0) {
      return {
        valid: false,
        error: `Row ${i + 1}: Dip (mm) must be >= 0 (received ${dipNum}).`,
        normalizedPoints: [],
      };
    }
    if (volNum < 0) {
      return {
        valid: false,
        error: `Row ${i + 1}: Volume (L) must be >= 0 (received ${volNum}).`,
        normalizedPoints: [],
      };
    }

    if (options?.maxDipMm !== undefined && options.maxDipMm > 0 && dipNum > options.maxDipMm) {
      return {
        valid: false,
        error: `Row ${i + 1}: Dip ${formatCalibrationDisplay(dipNum)} mm exceeds configured maximum dip range of ${formatCalibrationDisplay(options.maxDipMm)} mm.`,
        normalizedPoints: [],
      };
    }

    if (options?.tankDiameterMm !== undefined && options.tankDiameterMm > 0 && dipNum > options.tankDiameterMm) {
      return {
        valid: false,
        error: `Row ${i + 1}: Dip ${formatCalibrationDisplay(dipNum)} mm exceeds tank internal diameter of ${formatCalibrationDisplay(options.tankDiameterMm)} mm.`,
        normalizedPoints: [],
      };
    }

    if (options?.tankCapacityLitres && options.tankCapacityLitres > 0) {
      const maxOverCapacityLitres =
        Math.round(options.tankCapacityLitres * 1.1 * 1000) / 1000;
      if (!options.allowOverCapacity && volNum > options.tankCapacityLitres) {
        return {
          valid: false,
          error: `Row ${i + 1}: Volume ${volNum.toLocaleString()} L exceeds tank capacity of ${options.tankCapacityLitres.toLocaleString()} L.`,
          normalizedPoints: [],
        };
      }
      if (options.allowOverCapacity && volNum > maxOverCapacityLitres) {
        return {
          valid: false,
          error: `Row ${i + 1}: Volume ${volNum.toLocaleString()} L exceeds the maximum permitted +10% over-capacity ceiling of ${maxOverCapacityLitres.toLocaleString()} L (nominal ${options.tankCapacityLitres.toLocaleString()} L).`,
          normalizedPoints: [],
        };
      }
    }

    parsed.push({
      dipNum: Math.round(dipNum * 1000) / 1000,
      volNum: Math.round(volNum * 1000) / 1000,
      dipMillimetres: dipNum.toFixed(3),
      volumeLitres: volNum.toFixed(3),
    });
  }

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      if (parsed[i].dipNum === parsed[j].dipNum) {
        return {
          valid: false,
          error: `Duplicate dip value ${formatCalibrationDisplay(parsed[i].dipNum)} mm is not allowed.`,
          normalizedPoints: [],
        };
      }
    }
  }

  for (let i = 0; i < parsed.length - 1; i++) {
    if (parsed[i].dipNum >= parsed[i + 1].dipNum) {
      return {
        valid: false,
        error: `Dip values must be strictly increasing (row ${i + 1}: ${formatCalibrationDisplay(parsed[i].dipNum)} mm vs row ${i + 2}: ${formatCalibrationDisplay(parsed[i + 1].dipNum)} mm).`,
        normalizedPoints: [],
      };
    }
    if (parsed[i].volNum > parsed[i + 1].volNum) {
      return {
        valid: false,
        error: `Volume values must be monotonically increasing: ${formatCalibrationDisplay(parsed[i + 1].volNum)} L at ${formatCalibrationDisplay(parsed[i + 1].dipNum)} mm cannot be less than ${formatCalibrationDisplay(parsed[i].volNum)} L at ${formatCalibrationDisplay(parsed[i].dipNum)} mm.`,
        normalizedPoints: [],
      };
    }
  }

  return {
    valid: true,
    error: null,
    normalizedPoints: parsed.map(p => ({
      dipMillimetres: p.dipMillimetres,
      volumeLitres: p.volumeLitres,
    })),
  };
}

export function validateSingleCalibrationPoint(
  candidate: { dipMillimetres: string | number; volumeLitres: string | number },
  existingPoints: Array<{
    id?: string;
    dipMillimetresMilliunits?: number;
    volumeMilliunits?: number;
    dipMmStr?: string;
    volumeLitreStr?: string;
  }>,
  options?: {
    editingPointId?: string | null;
    tankCapacityLitres?: number;
    allowOverCapacity?: boolean;
    maxDipMm?: number;
    tankDiameterMm?: number;
  }
): { valid: boolean; error: string | null; normalizedPoint: CalibrationPointInput | null } {
  const singleRes = validateCalibrationChartPoints([candidate], {
    tankCapacityLitres: options?.tankCapacityLitres,
    allowOverCapacity: options?.allowOverCapacity,
    requireMinTwoPoints: false,
    maxDipMm: options?.maxDipMm,
    tankDiameterMm: options?.tankDiameterMm,
  });

  if (!singleRes.valid || singleRes.normalizedPoints.length === 0) {
    return { valid: false, error: singleRes.error, normalizedPoint: null };
  }

  const normalized = singleRes.normalizedPoints[0];
  const candDipMilli = Math.round(Number(normalized.dipMillimetres) * 1000);
  const candVolMilli = Math.round(Number(normalized.volumeLitres) * 1000);

  for (const pt of existingPoints || []) {
    if (options?.editingPointId && pt.id === options.editingPointId) {
      continue;
    }
    const ptDipMilli =
      typeof pt.dipMillimetresMilliunits === 'number'
        ? pt.dipMillimetresMilliunits
        : Math.round(Number(pt.dipMmStr || 0) * 1000);
    const ptVolMilli =
      typeof pt.volumeMilliunits === 'number'
        ? pt.volumeMilliunits
        : Math.round(Number(pt.volumeLitreStr || 0) * 1000);

    if (ptDipMilli === candDipMilli) {
      return {
        valid: false,
        error: `Calibration point for dip ${formatCalibrationDisplay(normalized.dipMillimetres)} mm already exists.`,
        normalizedPoint: null,
      };
    }
    if (ptDipMilli < candDipMilli && ptVolMilli > candVolMilli) {
      return {
        valid: false,
        error: `Non-monotonic volume: ${formatCalibrationDisplay(normalized.volumeLitres)} L at ${formatCalibrationDisplay(normalized.dipMillimetres)} mm is less than ${formatCalibrationDisplay(ptVolMilli / 1000)} L at ${formatCalibrationDisplay(ptDipMilli / 1000)} mm.`,
        normalizedPoint: null,
      };
    }
    if (ptDipMilli > candDipMilli && ptVolMilli < candVolMilli) {
      return {
        valid: false,
        error: `Non-monotonic volume: ${formatCalibrationDisplay(normalized.volumeLitres)} L at ${formatCalibrationDisplay(normalized.dipMillimetres)} mm is greater than ${formatCalibrationDisplay(ptVolMilli / 1000)} L at ${formatCalibrationDisplay(ptDipMilli / 1000)} mm.`,
        normalizedPoint: null,
      };
    }
  }

  return {
    valid: true,
    error: null,
    normalizedPoint: normalized,
  };
}

const UNSUPPORTED_HEADER_UNIT_REGEX =
  /(?:^|[^a-zA-Z])(cm|centimetres?|centimeters?|inch|inches|ft|feet|gallons?|gal|bbl|barrels?|m3|cubic|kl|kilolitres?|kiloliters?)(?:$|[^a-zA-Z])/i;

const UNSUPPORTED_VALUE_UNIT_REGEX =
  /(?:^|[^a-zA-Z])(cm|inch|in|ft|gal|gallons?|bbl|kl)(?:$|[^a-zA-Z])/i;

export function parseBulkCalibrationText(
  rawText: string,
  options?: CalibrationValidationOptions
): CalibrationValidationResult {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      valid: false,
      error: 'Please paste or upload at least 2 calibration points (Dip mm and Volume L).',
      normalizedPoints: [],
    };
  }

  const rawPoints: Array<{ dipMillimetres: string; volumeLitres: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check header line if it starts with non-digit column names like "dip", "dipMillimetres"
    if (i === 0 && /^[a-zA-Z]/.test(line)) {
      if (UNSUPPORTED_HEADER_UNIT_REGEX.test(line)) {
        return {
          valid: false,
          error:
            'Invalid units in CSV header: Tank dip must be in millimetres (mm) and volume in litres (L).',
          normalizedPoints: [],
        };
      }
      continue;
    }

    if (UNSUPPORTED_VALUE_UNIT_REGEX.test(line)) {
      return {
        valid: false,
        error: `Line ${i + 1}: Unsupported unit detected. Tank dip must be in millimetres (mm) and volume in litres (L).`,
        normalizedPoints: [],
      };
    }

    let dipPart = '';
    let volPart = '';

    if (line.includes('->')) {
      const parts = line.split('->');
      dipPart = parts[0] || '';
      volPart = parts[1] || '';
    } else if (line.includes('\t')) {
      const parts = line.split('\t');
      dipPart = parts[0] || '';
      volPart = parts[1] || '';
    } else if (line.includes(';')) {
      const parts = line.split(';');
      dipPart = parts[0] || '';
      volPart = parts[1] || '';
    } else if (line.includes(',')) {
      const parts = line.split(',');
      if (parts.length === 2) {
        dipPart = parts[0] || '';
        volPart = parts[1] || '';
      } else {
        return {
          valid: false,
          error: `Line ${i + 1}: Expected 2 columns (dipMillimetres, volumeLitres), found ${parts.length}.`,
          normalizedPoints: [],
        };
      }
    } else {
      const parts = line.split(/\s+/);
      dipPart = parts[0] || '';
      volPart = parts[1] || '';
    }

    // Strip optional unit suffixes like "mm" or "L" and thousands separators
    const cleanDip = dipPart.replace(/mm/gi, '').replace(/,/g, '').trim();
    const cleanVol = volPart.replace(/litres|litre|l/gi, '').replace(/,/g, '').trim();

    rawPoints.push({
      dipMillimetres: cleanDip,
      volumeLitres: cleanVol,
    });
  }

  return validateCalibrationChartPoints(rawPoints, {
    tankCapacityLitres: options?.tankCapacityLitres,
    allowOverCapacity: options?.allowOverCapacity,
    requireMinTwoPoints: true,
    maxDipMm: options?.maxDipMm,
    tankDiameterMm: options?.tankDiameterMm,
  });
}

export interface CalibrationStepGapWarning {
  fromDipMm: number;
  toDipMm: number;
  actualStepMm: number;
  expectedStepMm: number;
  missingCountEstimate: number;
  message: string;
}

export interface CalibrationChartDiagnostics {
  pointsCount: number;
  minDipMm: number;
  maxDipMm: number;
  minVolumeLitres: number;
  maxVolumeLitres: number;
  startsAtZeroDip: boolean;
  dominantStepMm: number | null;
  isUniformStep: boolean;
  isNonLinear: boolean;
  missingStepWarnings: CalibrationStepGapWarning[];
  exceedsNominalCapacity: boolean;
  exceedsSafeFillCapacity: boolean;
  exceedsMaxDip?: boolean;
  exceedsDiameter?: boolean;
}

export interface CalibrationDiagnosticsOptions {
  tankCapacityLitres?: number;
  safeFillCapacityLitres?: number;
  tankDiameterMm?: number;
  maxDipMm?: number;
}

export function analyzeCalibrationChartDiagnostics(
  points: Array<{
    dipMillimetres?: string | number;
    volumeLitres?: string | number;
    dipMmStr?: string;
    volumeLitreStr?: string;
    dipMillimetresMilliunits?: number;
    volumeMilliunits?: number;
  }>,
  options?: CalibrationDiagnosticsOptions
): CalibrationChartDiagnostics {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      pointsCount: 0,
      minDipMm: 0,
      maxDipMm: 0,
      minVolumeLitres: 0,
      maxVolumeLitres: 0,
      startsAtZeroDip: false,
      dominantStepMm: null,
      isUniformStep: true,
      isNonLinear: false,
      missingStepWarnings: [],
      exceedsNominalCapacity: false,
      exceedsSafeFillCapacity: false,
      exceedsMaxDip: false,
      exceedsDiameter: false,
    };
  }

  const numeric = points
    .map(p => {
      const dip =
        typeof p.dipMillimetresMilliunits === 'number'
          ? p.dipMillimetresMilliunits / 1000
          : Number(String(p.dipMillimetres ?? p.dipMmStr ?? 0).replace(/,/g, ''));
      const vol =
        typeof p.volumeMilliunits === 'number'
          ? p.volumeMilliunits / 1000
          : Number(String(p.volumeLitres ?? p.volumeLitreStr ?? 0).replace(/,/g, ''));
      return {
        dip: Math.round(dip * 1000) / 1000,
        vol: Math.round(vol * 1000) / 1000,
      };
    })
    .filter(p => Number.isFinite(p.dip) && Number.isFinite(p.vol))
    .sort((a, b) => a.dip - b.dip);

  if (numeric.length === 0) {
    return {
      pointsCount: 0,
      minDipMm: 0,
      maxDipMm: 0,
      minVolumeLitres: 0,
      maxVolumeLitres: 0,
      startsAtZeroDip: false,
      dominantStepMm: null,
      isUniformStep: true,
      isNonLinear: false,
      missingStepWarnings: [],
      exceedsNominalCapacity: false,
      exceedsSafeFillCapacity: false,
    };
  }

  const minDipMm = numeric[0].dip;
  const maxDipMm = numeric[numeric.length - 1].dip;
  const minVolumeLitres = numeric[0].vol;
  const maxVolumeLitres = numeric[numeric.length - 1].vol;
  const startsAtZeroDip = minDipMm === 0;

  const stepCounts = new Map<number, number>();
  const intervals: Array<{ fromDip: number; toDip: number; dDip: number; dVol: number; slope: number }> = [];

  for (let i = 0; i < numeric.length - 1; i++) {
    const dDip = Math.round((numeric[i + 1].dip - numeric[i].dip) * 1000) / 1000;
    const dVol = Math.round((numeric[i + 1].vol - numeric[i].vol) * 1000) / 1000;
    if (dDip > 0) {
      stepCounts.set(dDip, (stepCounts.get(dDip) || 0) + 1);
      intervals.push({
        fromDip: numeric[i].dip,
        toDip: numeric[i + 1].dip,
        dDip,
        dVol,
        slope: dVol / dDip,
      });
    }
  }

  let dominantStepMm: number | null = null;
  let bestFreq = 0;
  for (const [stepVal, freq] of stepCounts.entries()) {
    if (freq > bestFreq || (freq === bestFreq && (dominantStepMm === null || stepVal < dominantStepMm))) {
      bestFreq = freq;
      dominantStepMm = stepVal;
    }
  }

  const missingStepWarnings: CalibrationStepGapWarning[] = [];
  if (dominantStepMm !== null && dominantStepMm > 0 && intervals.length >= 2) {
    for (const seg of intervals) {
      const ratio = seg.dDip / dominantStepMm;
      if (seg.dDip > dominantStepMm * 1.01 && Math.abs(ratio - Math.round(ratio)) < 0.05 && Math.round(ratio) >= 2) {
        const missingCountEstimate = Math.round(ratio) - 1;
        missingStepWarnings.push({
          fromDipMm: seg.fromDip,
          toDipMm: seg.toDip,
          actualStepMm: seg.dDip,
          expectedStepMm: dominantStepMm,
          missingCountEstimate,
          message: `Gap between ${formatCalibrationDisplay(seg.fromDip)} mm and ${formatCalibrationDisplay(seg.toDip)} mm (${formatCalibrationDisplay(seg.dDip)} mm jump vs standard ${formatCalibrationDisplay(dominantStepMm)} mm step; ~${missingCountEstimate} missing point${missingCountEstimate > 1 ? 's' : ''}).`,
        });
      } else if (seg.dDip > dominantStepMm * 1.5) {
        const missingCountEstimate = Math.max(1, Math.floor(seg.dDip / dominantStepMm) - 1);
        missingStepWarnings.push({
          fromDipMm: seg.fromDip,
          toDipMm: seg.toDip,
          actualStepMm: seg.dDip,
          expectedStepMm: dominantStepMm,
          missingCountEstimate,
          message: `Irregular dip interval between ${formatCalibrationDisplay(seg.fromDip)} mm and ${formatCalibrationDisplay(seg.toDip)} mm (${formatCalibrationDisplay(seg.dDip)} mm vs dominant ${formatCalibrationDisplay(dominantStepMm)} mm step).`,
        });
      }
    }
  }

  const isUniformStep = stepCounts.size <= 1;

  let isNonLinear = false;
  if (intervals.length >= 2) {
    const firstSlope = intervals[0].slope;
    for (let i = 1; i < intervals.length; i++) {
      if (Math.abs(intervals[i].slope - firstSlope) > 0.01) {
        isNonLinear = true;
        break;
      }
    }
  }

  const exceedsNominalCapacity = Boolean(
    options?.tankCapacityLitres && options.tankCapacityLitres > 0 && maxVolumeLitres > options.tankCapacityLitres
  );
  const exceedsSafeFillCapacity = Boolean(
    options?.safeFillCapacityLitres &&
      options.safeFillCapacityLitres > 0 &&
      maxVolumeLitres > options.safeFillCapacityLitres
  );
  const exceedsMaxDip = Boolean(
    options?.maxDipMm && options.maxDipMm > 0 && maxDipMm > options.maxDipMm
  );
  const exceedsDiameter = Boolean(
    options?.tankDiameterMm && options.tankDiameterMm > 0 && maxDipMm > options.tankDiameterMm
  );

  return {
    pointsCount: numeric.length,
    minDipMm,
    maxDipMm,
    minVolumeLitres,
    maxVolumeLitres,
    startsAtZeroDip,
    dominantStepMm,
    isUniformStep,
    isNonLinear,
    missingStepWarnings,
    exceedsNominalCapacity,
    exceedsSafeFillCapacity,
    exceedsMaxDip,
    exceedsDiameter,
  };
}

export interface CalibrationImportPreview {
  valid: boolean;
  error: string | null;
  normalizedPoints: CalibrationPointInput[];
  diagnostics: CalibrationChartDiagnostics;
}

export function buildCalibrationImportPreview(
  rawText: string,
  options?: CalibrationValidationOptions & { safeFillCapacityLitres?: number }
): CalibrationImportPreview {
  const parsed = parseBulkCalibrationText(rawText, options);
  const diagnostics = analyzeCalibrationChartDiagnostics(parsed.normalizedPoints, {
    tankCapacityLitres: options?.tankCapacityLitres,
    safeFillCapacityLitres: options?.safeFillCapacityLitres,
    tankDiameterMm: options?.tankDiameterMm,
    maxDipMm: options?.maxDipMm,
  });

  return {
    valid: parsed.valid,
    error: parsed.error,
    normalizedPoints: parsed.normalizedPoints,
    diagnostics,
  };
}

// =========================================================================
// 9. DRY-RUN VERIFICATION AGAINST PRINTED IOCL CHART HELPERS
// =========================================================================

export interface DryRunCheckpointInput {
  dipMm: string;
  printedVolumeLitres: string;
}

export interface DryRunCheckpointParseResult {
  valid: boolean;
  error: string | null;
  checkpoints: DryRunCheckpointInput[];
}

export function parseDryRunCheckpointsText(rawText: string): DryRunCheckpointParseResult {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      valid: false,
      error: 'Please enter at least 1 reference checkpoint (dip_mm, printed_volume_litres).',
      checkpoints: [],
    };
  }

  const checkpoints: DryRunCheckpointInput[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && /^[a-zA-Z]/.test(line)) {
      continue;
    }

    let dipPart = '';
    let volPart = '';

    if (line.includes('->')) {
      const parts = line.split('->');
      dipPart = parts[0] || '';
      volPart = parts[1] || '';
    } else if (line.includes('\t')) {
      const parts = line.split('\t');
      dipPart = parts[0] || '';
      volPart = parts[1] || '';
    } else if (line.includes(';')) {
      const parts = line.split(';');
      dipPart = parts[0] || '';
      volPart = parts[1] || '';
    } else if (line.includes(',')) {
      const parts = line.split(',');
      dipPart = parts[0] || '';
      volPart = parts[1] || '';
    } else {
      const parts = line.split(/\s+/);
      dipPart = parts[0] || '';
      volPart = parts[1] || '';
    }

    const cleanDip = dipPart.replace(/mm/gi, '').replace(/,/g, '').trim();
    const cleanVol = volPart.replace(/litres|litre|l/gi, '').replace(/,/g, '').trim();

    const dipNum = Number(cleanDip);
    const volNum = Number(cleanVol);

    if (cleanDip === '' || cleanVol === '' || !Number.isFinite(dipNum) || !Number.isFinite(volNum)) {
      return {
        valid: false,
        error: `Line ${i + 1}: Invalid checkpoint "${line}". Expected dip_mm, printed_volume_litres.`,
        checkpoints: [],
      };
    }

    if (dipNum < 0 || volNum < 0) {
      return {
        valid: false,
        error: `Line ${i + 1}: Dip and printed volume must be >= 0.`,
        checkpoints: [],
      };
    }

    checkpoints.push({
      dipMm: dipNum.toFixed(3),
      printedVolumeLitres: volNum.toFixed(3),
    });
  }

  if (checkpoints.length === 0) {
    return {
      valid: false,
      error: 'Please enter at least 1 reference checkpoint (dip_mm, printed_volume_litres).',
      checkpoints: [],
    };
  }

  return {
    valid: true,
    error: null,
    checkpoints,
  };
}

export function buildSampleDryRunCheckpointsText(
  points: Array<{
    dipMillimetres?: string | number;
    volumeLitres?: string | number;
    dipMmStr?: string;
    volumeLitreStr?: string;
    dipMillimetresMilliunits?: number;
    volumeMilliunits?: number;
  }>
): string {
  const numeric = (points || [])
    .map(p => {
      const dip =
        typeof p.dipMillimetresMilliunits === 'number'
          ? p.dipMillimetresMilliunits / 1000
          : Number(String(p.dipMillimetres ?? p.dipMmStr ?? 0).replace(/,/g, ''));
      const vol =
        typeof p.volumeMilliunits === 'number'
          ? p.volumeMilliunits / 1000
          : Number(String(p.volumeLitres ?? p.volumeLitreStr ?? 0).replace(/,/g, ''));
      return { dip, vol };
    })
    .filter(p => Number.isFinite(p.dip) && Number.isFinite(p.vol))
    .sort((a, b) => a.dip - b.dip);

  if (numeric.length < 2) {
    return '0,0\n250,2500\n500,5000\n1250,12500\n2000,20000';
  }

  const sampleRows: string[] = [];
  // Include first point, midpoint of first interval, middle point, midpoint of last interval, and last point
  sampleRows.push(`${formatCalibrationDisplay(numeric[0].dip)},${formatCalibrationDisplay(numeric[0].vol)}`);

  const midDip1 = (numeric[0].dip + numeric[1].dip) / 2;
  const midVol1 = (numeric[0].vol + numeric[1].vol) / 2;
  sampleRows.push(`${formatCalibrationDisplay(midDip1)},${formatCalibrationDisplay(midVol1)}`);

  const midIdx = Math.floor(numeric.length / 2);
  sampleRows.push(`${formatCalibrationDisplay(numeric[midIdx].dip)},${formatCalibrationDisplay(numeric[midIdx].vol)}`);

  if (numeric.length >= 3) {
    const lastIdx = numeric.length - 1;
    const prevIdx = lastIdx - 1;
    const midDip2 = (numeric[prevIdx].dip + numeric[lastIdx].dip) / 2;
    const midVol2 = (numeric[prevIdx].vol + numeric[lastIdx].vol) / 2;
    sampleRows.push(`${formatCalibrationDisplay(midDip2)},${formatCalibrationDisplay(midVol2)}`);
    sampleRows.push(`${formatCalibrationDisplay(numeric[lastIdx].dip)},${formatCalibrationDisplay(numeric[lastIdx].vol)}`);
  }

  return Array.from(new Set(sampleRows)).join('\n');
}

export interface ClientDryRunRow {
  dipMm: string;
  printedVolumeLitres: string;
  calculatedVolumeLitres: string | null;
  deltaLitres: string | null;
  absDeltaLitres: string | null;
  deltaPercent: string | null;
  matchType: 'EXACT_POINT' | 'INTERPOLATED' | 'OUT_OF_RANGE';
  withinTolerance: boolean;
  error: string | null;
}

export interface ClientDryRunReport {
  pointsCount: number;
  checkpointsCount: number;
  passedCount: number;
  failedCount: number;
  maxAbsDeltaLitres: string;
  meanAbsDeltaLitres: string;
  toleranceLitres: string;
  rows: ClientDryRunRow[];
}

export function evaluateCalibrationDryRunClient(
  points: Array<{
    dipMillimetres?: string | number;
    volumeLitres?: string | number;
    dipMmStr?: string;
    volumeLitreStr?: string;
    dipMillimetresMilliunits?: number;
    volumeMilliunits?: number;
  }>,
  checkpoints: DryRunCheckpointInput[],
  toleranceLitres = 0.5
): ClientDryRunReport {
  const sorted = (points || [])
    .map(p => {
      const dipMilli =
        typeof p.dipMillimetresMilliunits === 'number'
          ? p.dipMillimetresMilliunits
          : Math.round(Number(String(p.dipMillimetres ?? p.dipMmStr ?? 0).replace(/,/g, '')) * 1000);
      const volMilli =
        typeof p.volumeMilliunits === 'number'
          ? p.volumeMilliunits
          : Math.round(Number(String(p.volumeLitres ?? p.volumeLitreStr ?? 0).replace(/,/g, '')) * 1000);
      return { dipMilli, volMilli };
    })
    .filter(p => Number.isFinite(p.dipMilli) && Number.isFinite(p.volMilli))
    .sort((a, b) => a.dipMilli - b.dipMilli);

  const tolMilli = Math.round(toleranceLitres * 1000);
  const rows: ClientDryRunRow[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let maxAbsDeltaMilli = 0;
  let sumAbsDeltaMilli = 0;
  let validComparedCount = 0;

  const minDip = sorted.length > 0 ? sorted[0].dipMilli : 0;
  const maxDip = sorted.length > 0 ? sorted[sorted.length - 1].dipMilli : 0;

  for (const cp of checkpoints) {
    const dipMilli = Math.round(Number(cp.dipMm) * 1000);
    const printedMilli = Math.round(Number(cp.printedVolumeLitres) * 1000);

    if (sorted.length < 2 || dipMilli < minDip || dipMilli > maxDip) {
      failedCount++;
      rows.push({
        dipMm: (dipMilli / 1000).toFixed(3),
        printedVolumeLitres: (printedMilli / 1000).toFixed(3),
        calculatedVolumeLitres: null,
        deltaLitres: null,
        absDeltaLitres: null,
        deltaPercent: null,
        matchType: 'OUT_OF_RANGE',
        withinTolerance: false,
        error:
          sorted.length < 2
            ? 'At least 2 calibration points are required.'
            : `Dip ${(dipMilli / 1000).toFixed(3)} mm is outside chart range [${(minDip / 1000).toFixed(3)} - ${(maxDip / 1000).toFixed(3)}] mm.`,
      });
      continue;
    }

    let calcMilli = 0;
    let isExact = false;

    const exactPt = sorted.find(p => p.dipMilli === dipMilli);
    if (exactPt) {
      calcMilli = exactPt.volMilli;
      isExact = true;
    } else {
      for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        if (dipMilli > p1.dipMilli && dipMilli < p2.dipMilli) {
          const dDip = BigInt(p2.dipMilli - p1.dipMilli);
          const dVol = BigInt(p2.volMilli - p1.volMilli);
          const offsetDip = BigInt(dipMilli - p1.dipMilli);
          const offsetVol = (offsetDip * dVol + dDip / 2n) / dDip;
          calcMilli = p1.volMilli + Number(offsetVol);
          break;
        }
      }
    }

    const deltaMilli = calcMilli - printedMilli;
    const absDeltaMilli = Math.abs(deltaMilli);
    const withinTolerance = absDeltaMilli <= tolMilli;

    if (withinTolerance) {
      passedCount++;
    } else {
      failedCount++;
    }

    if (absDeltaMilli > maxAbsDeltaMilli) {
      maxAbsDeltaMilli = absDeltaMilli;
    }
    sumAbsDeltaMilli += absDeltaMilli;
    validComparedCount++;

    const deltaPct =
      printedMilli > 0 ? ((deltaMilli / printedMilli) * 100).toFixed(3) : '0.000';

    rows.push({
      dipMm: (dipMilli / 1000).toFixed(3),
      printedVolumeLitres: (printedMilli / 1000).toFixed(3),
      calculatedVolumeLitres: (calcMilli / 1000).toFixed(3),
      deltaLitres: (deltaMilli / 1000).toFixed(3),
      absDeltaLitres: (absDeltaMilli / 1000).toFixed(3),
      deltaPercent: deltaPct,
      matchType: isExact ? 'EXACT_POINT' : 'INTERPOLATED',
      withinTolerance,
      error: null,
    });
  }

  const meanAbsDeltaMilli =
    validComparedCount > 0 ? Math.round(sumAbsDeltaMilli / validComparedCount) : 0;

  return {
    pointsCount: sorted.length,
    checkpointsCount: checkpoints.length,
    passedCount,
    failedCount,
    maxAbsDeltaLitres: (maxAbsDeltaMilli / 1000).toFixed(3),
    meanAbsDeltaLitres: (meanAbsDeltaMilli / 1000).toFixed(3),
    toleranceLitres: (tolMilli / 1000).toFixed(3),
    rows,
  };
}

// =========================================================================
// 12. GLOBAL CALIBRATION MASTER HELPERS (Migration 0034)
// =========================================================================

export interface GlobalTemplateStatusBadgeInfo {
  label: string;
  badgeClass: string;
  readinessLabel: string;
  isApproved: boolean;
  hasValidatedPoints: boolean;
}

export function getGlobalTemplateStatusBadge(
  status?: string | null,
  pointsCount?: number | null
): GlobalTemplateStatusBadgeInfo {
  const st = (status || 'DRAFT').toUpperCase();
  const count = Math.max(0, Number(pointsCount) || 0);
  const hasValidatedPoints = count >= 2;

  if (st === 'APPROVED' || st === 'ACTIVE') {
    return {
      label: st,
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      readinessLabel: hasValidatedPoints
        ? `Verified & Approved (${count} points)`
        : 'Approved',
      isApproved: true,
      hasValidatedPoints,
    };
  }

  if (st === 'DRAFT') {
    return {
      label: 'DRAFT',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      readinessLabel: hasValidatedPoints
        ? `Points Imported (${count} pts) — Pending Verification & Approval`
        : 'Header Initialized (0 points) — Awaiting CSV Import',
      isApproved: false,
      hasValidatedPoints,
    };
  }

  return {
    label: st,
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    readinessLabel: `${st} (${count} points)`,
    isApproved: false,
    hasValidatedPoints,
  };
}

export function formatGlobalTemplateDimensions(template: {
  tankDiameterMm?: number | null;
  tankLengthMm?: number | null;
  maxDipMm?: number | null;
}): {
  diameterLabel: string;
  lengthLabel: string;
  maxDipLabel: string;
  summaryLabel: string;
} {
  const dia = template.tankDiameterMm ? `${template.tankDiameterMm.toLocaleString()} mm` : '—';
  const len = template.tankLengthMm ? `${template.tankLengthMm.toLocaleString()} mm` : '—';
  const dip = template.maxDipMm ? `${template.maxDipMm.toLocaleString()} mm` : '—';
  return {
    diameterLabel: dia,
    lengthLabel: len,
    maxDipLabel: dip,
    summaryLabel: `${dia} Dia × ${len} Len • Max Dip ${dip}`,
  };
}

export function generateVerifiedCylindricalCalibrationCsv(
  maxDipMm: number,
  nominalCapacityLitres: number,
  stepMm = 10
): string {
  const safeMaxDip = Math.max(100, Number(maxDipMm) || 2100);
  const safeCap = Math.max(1000, Number(nominalCapacityLitres) || 20000);
  const safeStep = Math.max(1, Number(stepMm) || 10);

  const lines = ['dip_mm,volume_litres'];
  const radius = safeMaxDip / 2;
  const fullArea = Math.PI * radius * radius;

  for (let h = 0; h <= safeMaxDip; h += safeStep) {
    let ratio = 0;
    if (h <= 0) {
      ratio = 0;
    } else if (h >= safeMaxDip) {
      ratio = 1;
    } else {
      const term1 = radius * radius * Math.acos((radius - h) / radius);
      const term2 = (radius - h) * Math.sqrt(Math.max(0, 2 * radius * h - h * h));
      ratio = (term1 - term2) / fullArea;
    }
    const vol = Math.min(safeCap, Math.max(0, ratio * safeCap));
    lines.push(`${h.toFixed(3)},${vol.toFixed(3)}`);
  }

  return lines.join('\n');
}

export interface GlobalTemplateImportPreviewResult extends CalibrationImportPreview {
  startsAtZero: boolean;
  reachesMaxDip: boolean;
  expectedMaxDipMm: number | null;
  expectedCapacityLitres: number;
  maxOverCapacityCeilingLitres: number;
  isOverNominalCapacity: boolean;
  inferredZeroPoint: boolean;
  saveStatusDefault: 'DRAFT';
}

export function buildGlobalTemplateImportPreview(
  rawText: string,
  template: {
    code?: string;
    nominalCapacityLitres: number;
    tankDiameterMm?: number | null;
    maxDipMm?: number | null;
  },
  options?: {
    allowOverCapacity?: boolean;
  }
): GlobalTemplateImportPreviewResult {
  const expectedMaxDip = template.maxDipMm ?? template.tankDiameterMm ?? null;
  const maxOverCapacityCeilingLitres =
    Math.round(template.nominalCapacityLitres * 1.1 * 1000) / 1000;
  const basePreview = buildCalibrationImportPreview(rawText, {
    tankCapacityLitres: template.nominalCapacityLitres,
    allowOverCapacity: options?.allowOverCapacity,
    maxDipMm: expectedMaxDip ?? undefined,
    tankDiameterMm: template.tankDiameterMm ?? undefined,
  });

  if (!basePreview.valid) {
    return {
      ...basePreview,
      startsAtZero: false,
      reachesMaxDip: false,
      expectedMaxDipMm: expectedMaxDip,
      expectedCapacityLitres: template.nominalCapacityLitres,
      maxOverCapacityCeilingLitres,
      isOverNominalCapacity: false,
      inferredZeroPoint: false,
      saveStatusDefault: 'DRAFT',
    };
  }

  let normalizedPoints = [...basePreview.normalizedPoints];
  let diagnostics = { ...basePreview.diagnostics };
  let minDipNum = Number(diagnostics.minDipMm);
  const maxDipNum = Number(diagnostics.maxDipMm);
  const maxVolNum = Number(diagnostics.maxVolumeLitres);
  let inferredZeroPoint = false;

  // Support scanned IOCL reference charts that print 210 readings (10 mm .. 2100 mm)
  // and omit the 0 mm / 0 L baseline row on paper: infer and prepend 0.000 mm / 0.000 L.
  if (
    minDipNum > 0 &&
    minDipNum <= 20 &&
    normalizedPoints.length >= 200
  ) {
    normalizedPoints = [
      { dipMillimetres: '0.000', volumeLitres: '0.000' },
      ...normalizedPoints,
    ];
    diagnostics = {
      ...diagnostics,
      pointsCount: normalizedPoints.length,
      minDipMm: 0,
      minVolumeLitres: 0,
    };
    minDipNum = 0;
    inferredZeroPoint = true;
  }

  const startsAtZero = Math.abs(minDipNum) < 0.001;
  const reachesMaxDip =
    expectedMaxDip !== null ? Math.abs(maxDipNum - expectedMaxDip) < 0.001 : maxDipNum > 0;
  const isOverNominalCapacity = maxVolNum > template.nominalCapacityLitres;

  let rangeError: string | null = null;
  if (!startsAtZero) {
    rangeError = `Global reference template ${template.code || ''} requires calibration points starting at 0.000 mm dip (found ${diagnostics.minDipMm} mm).`;
  } else if (expectedMaxDip !== null && !reachesMaxDip) {
    rangeError = `Global reference template ${template.code || ''} requires complete dip coverage up to Max Dip ${expectedMaxDip.toFixed(3)} mm (found max dip ${diagnostics.maxDipMm} mm).`;
  }

  return {
    ...basePreview,
    normalizedPoints,
    diagnostics,
    valid: basePreview.valid && !rangeError,
    error: rangeError || basePreview.error,
    startsAtZero,
    reachesMaxDip,
    expectedMaxDipMm: expectedMaxDip,
    expectedCapacityLitres: template.nominalCapacityLitres,
    maxOverCapacityCeilingLitres,
    isOverNominalCapacity,
    inferredZeroPoint,
    saveStatusDefault: 'DRAFT',
  };
}

export function canApproveGlobalTemplate(
  template: {
    status?: string | null;
    pointsCount?: number | null;
    nominalCapacityLitres?: number | null;
    maxVolumeLitres?: number | null;
    isOverNominalCapacity?: boolean;
    points?: Array<{ volumeLitres?: number; volumeMilliunits?: number }>;
  } | null | undefined,
  hasApprovalPermission: boolean,
  options?: {
    confirmOverCapacity?: boolean;
    maxVolumeLitres?: number | null;
    nominalCapacityLitres?: number | null;
  }
): {
  allowed: boolean;
  reason: string | null;
  requiresOverCapacityConfirmation?: boolean;
} {
  if (!template) {
    return { allowed: false, reason: 'No template selected.' };
  }
  if (!hasApprovalPermission) {
    return {
      allowed: false,
      reason: 'Only authorised calibration administrators can approve global calibration templates.',
    };
  }
  const count = Math.max(0, Number(template.pointsCount) || 0);
  if (count < 2) {
    return {
      allowed: false,
      reason: 'Reference templates cannot be marked APPROVED until complete dip-to-volume points are imported and validated.',
    };
  }
  if (template.status === 'APPROVED') {
    return {
      allowed: false,
      reason: 'Template is already APPROVED.',
    };
  }

  const nominalCap =
    options?.nominalCapacityLitres ??
    template.nominalCapacityLitres ??
    null;
  let maxVol = options?.maxVolumeLitres ?? template.maxVolumeLitres ?? null;
  if (maxVol == null && Array.isArray(template.points) && template.points.length > 0) {
    const lastPt = template.points[template.points.length - 1];
    maxVol =
      typeof lastPt.volumeLitres === 'number'
        ? lastPt.volumeLitres
        : typeof lastPt.volumeMilliunits === 'number'
          ? lastPt.volumeMilliunits / 1000
          : null;
  }

  if (nominalCap != null && nominalCap > 0 && maxVol != null) {
    const maxOverCapacityCeiling = Math.round(nominalCap * 1.1 * 1000) / 1000;
    if (maxVol > maxOverCapacityCeiling) {
      return {
        allowed: false,
        reason: `Chart maximum volume (${maxVol.toLocaleString()} L) exceeds the maximum permitted +10% over-capacity ceiling (${maxOverCapacityCeiling.toLocaleString()} L).`,
        requiresOverCapacityConfirmation: true,
      };
    }
    if (maxVol > nominalCap && !options?.confirmOverCapacity) {
      return {
        allowed: false,
        reason: `Chart maximum volume (${maxVol.toLocaleString()} L) exceeds nominal capacity (${nominalCap.toLocaleString()} L). Please confirm above-nominal volume verification to approve.`,
        requiresOverCapacityConfirmation: true,
      };
    }
  }

  return { allowed: true, reason: null, requiresOverCapacityConfirmation: false };
}

export function formatGlobalCalibrationAuditLogEntry(log: {
  action: string;
  createdAt: string;
  userName?: string;
  newValueJson?: string | null;
}): {
  actionBadge: string;
  actionBadgeClass: string;
  summary: string;
} {
  let parsed: Record<string, any> = {};
  if (log.newValueJson) {
    try {
      parsed = JSON.parse(log.newValueJson);
    } catch {
      parsed = {};
    }
  }

  const act = (log.action || '').toUpperCase();
  if (act.includes('IMPORT')) {
    return {
      actionBadge: 'CSV IMPORT',
      actionBadgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
      summary: `Imported ${parsed.pointsCount ?? 0} verified points into ${parsed.code || 'template'} as ${parsed.status || 'DRAFT'}${parsed.sourceFileName ? ` (${parsed.sourceFileName})` : ''}`,
    };
  }
  if (act.includes('STATUS_UPDATE')) {
    return {
      actionBadge: `STATUS → ${parsed.status || 'UPDATED'}`,
      actionBadgeClass:
        parsed.status === 'APPROVED'
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          : 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      summary: `Marked ${parsed.code || 'global template'} as ${parsed.status || 'APPROVED'}`,
    };
  }
  if (act.includes('ASSIGN')) {
    const preservedNote =
      parsed.preservedDraftsCount && parsed.preservedDraftsCount > 0
        ? ` (${parsed.preservedDraftsCount} existing DRAFT revision preserved)`
        : '';
    return {
      actionBadge: 'TANK ASSIGNMENT',
      actionBadgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      summary: `Assigned ${parsed.templateCode || 'template'} to ${parsed.tanksCount ?? 0} tank(s) (${parsed.activateImmediately ? 'ACTIVE' : 'DRAFT — Active Charts Preserved'})${preservedNote}`,
    };
  }
  if (act.includes('CREATE')) {
    return {
      actionBadge: 'TEMPLATE CREATED',
      actionBadgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      summary: `Created ${parsed.code || 'template'} (${parsed.nominalCapacityLitres ? `${Number(parsed.nominalCapacityLitres).toLocaleString()} L` : ''}) in ${parsed.status || 'DRAFT'} status`,
    };
  }
  return {
    actionBadge: act || 'AUDIT',
    actionBadgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    summary: log.newValueJson || 'Global calibration template operation recorded',
  };
}



