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

export function validateCalibrationChartPoints(
  points: Array<{ dipMillimetres: string | number; volumeLitres: string | number }>,
  options?: {
    tankCapacityLitres?: number;
    allowOverCapacity?: boolean;
    requireMinTwoPoints?: boolean;
  }
): CalibrationValidationResult {
  const requireMinTwo = options?.requireMinTwoPoints !== false;
  if (!Array.isArray(points) || (requireMinTwo && points.length < 2)) {
    return {
      valid: false,
      error: 'At least 2 calibration points are required to configure a calibration chart.',
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

    if (
      options?.tankCapacityLitres &&
      options.tankCapacityLitres > 0 &&
      !options.allowOverCapacity &&
      volNum > options.tankCapacityLitres
    ) {
      return {
        valid: false,
        error: `Row ${i + 1}: Volume ${volNum.toLocaleString()} L exceeds tank capacity of ${options.tankCapacityLitres.toLocaleString()} L.`,
        normalizedPoints: [],
      };
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
  }
): { valid: boolean; error: string | null; normalizedPoint: CalibrationPointInput | null } {
  const singleRes = validateCalibrationChartPoints([candidate], {
    tankCapacityLitres: options?.tankCapacityLitres,
    allowOverCapacity: options?.allowOverCapacity,
    requireMinTwoPoints: false,
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

export function parseBulkCalibrationText(
  rawText: string,
  options?: {
    tankCapacityLitres?: number;
    allowOverCapacity?: boolean;
  }
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

    // Skip header line if it starts with non-digit column names like "dip", "dipMillimetres"
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
  });
}

