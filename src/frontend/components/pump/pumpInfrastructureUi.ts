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

    case 'PRODUCT_IN_USE':
      return 'Product cannot be deactivated because active tanks or nozzles depend on it.';

    case 'TANK_IN_USE':
      return 'Tank cannot be deactivated because active nozzles depend on it.';

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
