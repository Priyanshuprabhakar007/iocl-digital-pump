import { describe, it, expect } from 'vitest';
import {
  getDuTypeLabel,
  getAvailableNozzleNumbers,
  getTanksForProduct,
  getActiveLiquidOutletProducts,
  getDuUtilization,
  buildFuelMappingTree,
  getPumpInfrastructureErrorMessage,
  getProductCategoryBadgeClass,
} from '../src/frontend/components/pump/pumpInfrastructureUi';
import {
  Product,
  OutletProduct,
  Tank,
  Dispenser,
  Nozzle,
} from '../src/shared/types';

describe('Phase 3 Pump Infrastructure Pure Frontend Helpers Suite', () => {

  // =========================================================================
  // 1. getDuTypeLabel
  // =========================================================================
  describe('getDuTypeLabel', () => {
    it('returns exact labels for 2, 4, and 6 nozzle capacity', () => {
      expect(getDuTypeLabel(2)).toBe('2 Nozzle DU');
      expect(getDuTypeLabel(4)).toBe('4 Nozzle DU');
      expect(getDuTypeLabel(6)).toBe('6 Nozzle DU');
    });

    it('falls back gracefully on custom, null, or undefined values', () => {
      expect(getDuTypeLabel(8)).toBe('8 Nozzle DU');
      expect(getDuTypeLabel(null)).toBe('6 Nozzle DU');
      expect(getDuTypeLabel(undefined)).toBe('6 Nozzle DU');
    });
  });

  // =========================================================================
  // 2. getAvailableNozzleNumbers
  // =========================================================================
  describe('getAvailableNozzleNumbers', () => {
    it('2-capacity empty returns [1, 2]', () => {
      expect(getAvailableNozzleNumbers(2, [])).toEqual([1, 2]);
    });

    it('2-capacity with nozzle #1 returns [2]', () => {
      expect(getAvailableNozzleNumbers(2, [{ nozzleNumber: 1 } as Nozzle])).toEqual([2]);
    });

    it('2-capacity full returns []', () => {
      const existing = [{ nozzleNumber: 1 }, { nozzleNumber: 2 }] as Nozzle[];
      expect(getAvailableNozzleNumbers(2, existing)).toEqual([]);
    });

    it('4-capacity with #1 and #3 returns [2, 4]', () => {
      const existing = [{ nozzleNumber: 1 }, { nozzleNumber: 3 }] as Nozzle[];
      expect(getAvailableNozzleNumbers(4, existing)).toEqual([2, 4]);
    });

    it('6-capacity with #1 through #5 returns [6]', () => {
      const existing = [1, 2, 3, 4, 5].map(num => ({ nozzleNumber: num } as Nozzle));
      expect(getAvailableNozzleNumbers(6, existing)).toEqual([6]);
    });

    it('handles null or undefined input safely', () => {
      expect(getAvailableNozzleNumbers(null, null)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(getAvailableNozzleNumbers(4, undefined)).toEqual([1, 2, 3, 4]);
    });
  });

  // =========================================================================
  // 3. Tank Filtering by Product
  // =========================================================================
  describe('getTanksForProduct', () => {
    const sampleTanks: Tank[] = [
      { id: 't1', outletId: 'ro-1', tankNumber: 1, name: 'Tank 1 MS', productId: 'p-ms', capacityLitres: 20000, safeFillCapacityLitres: 19000, minimumOperatingLevelLitres: 1000, status: 'ACTIVE', createdAt: '', updatedAt: '', createdBy: '' },
      { id: 't2', outletId: 'ro-1', tankNumber: 2, name: 'Tank 2 HSD', productId: 'p-hsd', capacityLitres: 20000, safeFillCapacityLitres: 19000, minimumOperatingLevelLitres: 1000, status: 'ACTIVE', createdAt: '', updatedAt: '', createdBy: '' },
      { id: 't3', outletId: 'ro-1', tankNumber: 3, name: 'Tank 3 MS', productId: 'p-ms', capacityLitres: 10000, safeFillCapacityLitres: 9500, minimumOperatingLevelLitres: 500, status: 'ACTIVE', createdAt: '', updatedAt: '', createdBy: '' },
    ];

    it('filters tanks matching specific product ID', () => {
      const msTanks = getTanksForProduct(sampleTanks, 'p-ms');
      expect(msTanks.length).toBe(2);
      expect(msTanks.map(t => t.id)).toEqual(['t1', 't3']);

      const hsdTanks = getTanksForProduct(sampleTanks, 'p-hsd');
      expect(hsdTanks.length).toBe(1);
      expect(hsdTanks[0].id).toBe('t2');
    });

    it('handles empty arrays or missing product ID', () => {
      expect(getTanksForProduct([], 'p-ms')).toEqual([]);
      expect(getTanksForProduct(sampleTanks, '')).toEqual([]);
      expect(getTanksForProduct(null, 'p-ms')).toEqual([]);
    });
  });

  // =========================================================================
  // 4. ACTIVE Liquid Outlet Product Filtering
  // =========================================================================
  describe('getActiveLiquidOutletProducts', () => {
    const sampleOutletProducts: OutletProduct[] = [
      { id: 'op1', outletId: 'ro-1', productId: 'p-ms', status: 'ACTIVE', createdAt: '', createdBy: '', product: { id: 'p-ms', code: 'MS', name: 'Petrol', category: 'MS', unit: 'LITRE', status: 'ACTIVE', createdAt: '', updatedAt: '' } },
      { id: 'op2', outletId: 'ro-1', productId: 'p-cng', status: 'ACTIVE', createdAt: '', createdBy: '', product: { id: 'p-cng', code: 'CNG', name: 'CNG Gas', category: 'CNG', unit: 'KG', status: 'ACTIVE', createdAt: '', updatedAt: '' } },
      { id: 'op3', outletId: 'ro-1', productId: 'p-inactive', status: 'INACTIVE', createdAt: '', createdBy: '', product: { id: 'p-inactive', code: 'OLD', name: 'Old Grade', category: 'OTHER', unit: 'LITRE', status: 'INACTIVE', createdAt: '', updatedAt: '' } },
      { id: 'op4', outletId: 'ro-1', productId: 'p-xp100', status: 'ACTIVE', createdAt: '', createdBy: '', product: { id: 'p-xp100', code: 'XP100', name: 'XP100 Premium', category: 'XP100', unit: 'LITRE', status: 'ACTIVE', createdAt: '', updatedAt: '' } },
    ];

    it('filters ACTIVE outlet products that measure in LITRE', () => {
      const filtered = getActiveLiquidOutletProducts(sampleOutletProducts);
      expect(filtered.length).toBe(2);
      expect(filtered.map(op => op.productId)).toEqual(['p-ms', 'p-xp100']);
    });

    it('handles empty or null arrays', () => {
      expect(getActiveLiquidOutletProducts([])).toEqual([]);
      expect(getActiveLiquidOutletProducts(null)).toEqual([]);
    });
  });

  // =========================================================================
  // 5. getDuUtilization
  // =========================================================================
  describe('getDuUtilization', () => {
    it('0/2 utilization', () => {
      const u = getDuUtilization(2, 0);
      expect(u.ratioText).toBe('0 / 2 configured');
      expect(u.isFull).toBe(false);
      expect(u.hasUnused).toBe(true);
      expect(u.percent).toBe(0);
    });

    it('1/2 utilization', () => {
      const u = getDuUtilization(2, 1);
      expect(u.ratioText).toBe('1 / 2 configured');
      expect(u.isFull).toBe(false);
      expect(u.hasUnused).toBe(true);
      expect(u.percent).toBe(50);
    });

    it('2/2 utilization', () => {
      const u = getDuUtilization(2, 2);
      expect(u.ratioText).toBe('2 / 2 configured');
      expect(u.isFull).toBe(true);
      expect(u.hasUnused).toBe(false);
      expect(u.percent).toBe(100);
    });

    it('3/4 utilization', () => {
      const u = getDuUtilization(4, 3);
      expect(u.ratioText).toBe('3 / 4 configured');
      expect(u.isFull).toBe(false);
      expect(u.hasUnused).toBe(true);
      expect(u.percent).toBe(75);
    });

    it('6/6 utilization', () => {
      const u = getDuUtilization(6, 6);
      expect(u.ratioText).toBe('6 / 6 configured');
      expect(u.isFull).toBe(true);
      expect(u.hasUnused).toBe(false);
      expect(u.percent).toBe(100);
    });
  });

  // =========================================================================
  // 6. Fuel Mapping Tree Generation
  // =========================================================================
  describe('buildFuelMappingTree', () => {
    const products: Product[] = [
      { id: 'p-ms', code: 'MS', name: 'Petrol', category: 'MS', unit: 'LITRE', status: 'ACTIVE', createdAt: '', updatedAt: '' },
      { id: 'p-xp100', code: 'XP100', name: 'XP100 Premium', category: 'XP100', unit: 'LITRE', status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ];

    const outletProducts: OutletProduct[] = [
      { id: 'op-1', outletId: 'ro-1', productId: 'p-ms', status: 'ACTIVE', createdAt: '', createdBy: '' },
      { id: 'op-2', outletId: 'ro-1', productId: 'p-xp100', status: 'ACTIVE', createdAt: '', createdBy: '' },
    ];

    const tanks: Tank[] = [
      { id: 't-1', outletId: 'ro-1', tankNumber: 1, name: 'Tank MS', productId: 'p-ms', capacityLitres: 20000, safeFillCapacityLitres: 19000, minimumOperatingLevelLitres: 1000, status: 'ACTIVE', createdAt: '', updatedAt: '', createdBy: '' },
      { id: 't-2', outletId: 'ro-1', tankNumber: 2, name: 'Tank XP100', productId: 'p-xp100', capacityLitres: 10000, safeFillCapacityLitres: 9500, minimumOperatingLevelLitres: 500, status: 'ACTIVE', createdAt: '', updatedAt: '', createdBy: '' },
    ];

    const dispensers: Dispenser[] = [
      { id: 'd-1', outletId: 'ro-1', dispenserNumber: 1, name: 'DU 1', nozzleCapacity: 4, status: 'ACTIVE', createdAt: '', updatedAt: '', createdBy: '' },
      { id: 'd-2', outletId: 'ro-1', dispenserNumber: 2, name: 'DU 2 (Unassigned)', nozzleCapacity: 2, status: 'ACTIVE', createdAt: '', updatedAt: '', createdBy: '' },
    ];

    const nozzles: Nozzle[] = [
      { id: 'n-1', outletId: 'ro-1', dispenserId: 'd-1', nozzleNumber: 1, productId: 'p-ms', tankId: 't-1', status: 'ACTIVE', createdAt: '', updatedAt: '', createdBy: '' },
    ];

    it('builds full Product -> Tank -> DU -> Nozzle tree and records warnings', () => {
      const tree = buildFuelMappingTree(products, outletProducts, tanks, dispensers, nozzles);

      expect(tree.products.length).toBe(2);

      // MS Node
      const msNode = tree.products.find(p => p.product.code === 'MS');
      expect(msNode).toBeDefined();
      expect(msNode?.tanks.length).toBe(1);
      expect(msNode?.totalNozzlesCount).toBe(1);

      // XP100 Node (Tank t-2 has no connected nozzles)
      const xp100Node = tree.products.find(p => p.product.code === 'XP100');
      expect(xp100Node).toBeDefined();
      expect(xp100Node?.tanks[0].warnings.length).toBeGreaterThan(0);
      expect(xp100Node?.tanks[0].warnings[0]).toContain('has no connected nozzles');

      // Unassigned DU d-2 (0 nozzles configured)
      expect(tree.unassignedDispensers.length).toBe(1);
      expect(tree.unassignedDispensers[0].dispenser.id).toBe('d-2');

      // Warnings summary contains audit alerts
      expect(tree.warningsSummary.length).toBeGreaterThan(0);
    });

    it('handles empty or null inputs safely without crashing', () => {
      const emptyTree = buildFuelMappingTree([], [], [], [], []);
      expect(emptyTree.products).toEqual([]);
      expect(emptyTree.unmappedTanks).toEqual([]);
      expect(emptyTree.unassignedDispensers).toEqual([]);
      expect(emptyTree.warningsSummary).toEqual([]);
    });
  });

  // =========================================================================
  // 7. Error Sanitization & Raw SQLite Protection
  // =========================================================================
  describe('getPumpInfrastructureErrorMessage', () => {
    it('maps known Phase 3 error codes to user-friendly messages', () => {
      expect(getPumpInfrastructureErrorMessage('NOZZLE_CAPACITY_EXCEEDED'))
        .toBe('Nozzle number exceeds the physical nozzle capacity of this Dispensing Unit (DU).');

      expect(getPumpInfrastructureErrorMessage('DISPENSER_CAPACITY_BELOW_EXISTING_NOZZLES'))
        .toBe('Cannot change this DU to a smaller nozzle configuration because higher-numbered nozzle positions are already configured.');

      expect(getPumpInfrastructureErrorMessage('NOZZLE_TANK_PRODUCT_MISMATCH'))
        .toBe('Selected Underground Tank product does not match the nozzle product.');
    });

    it('sanitizes raw SQLite, SQL, and D1 database errors without leaking internal syntax or constraint strings', () => {
      const rawError = {
        code: 'SQLITE_CONSTRAINT_TRIGGER',
        message: 'D1_ERROR: SQLiteError: near "WHERE": syntax error; constraint failed on nozzles',
      };
      const clean = getPumpInfrastructureErrorMessage(rawError);
      expect(clean).toBe('A database constraint prevented this operation. Please verify fuel topology requirements.');
      expect(clean).not.toContain('SQLite');
      expect(clean).not.toContain('D1_ERROR');
      expect(clean).not.toContain('syntax error');
    });

    it('falls back gracefully on empty, null, or undefined values', () => {
      expect(getPumpInfrastructureErrorMessage(null)).toBe('An unexpected error occurred. Please try again.');
      expect(getPumpInfrastructureErrorMessage(undefined)).toBe('An unexpected error occurred. Please try again.');
    });
  });

  // =========================================================================
  // 8. Product Category Badge Styling
  // =========================================================================
  describe('getProductCategoryBadgeClass', () => {
    it('returns distinct badge styles for fuel categories including XP100', () => {
      expect(getProductCategoryBadgeClass('MS')).toContain('amber');
      expect(getProductCategoryBadgeClass('HSD')).toContain('blue');
      expect(getProductCategoryBadgeClass('XP95')).toContain('indigo');
      expect(getProductCategoryBadgeClass('XP100')).toContain('purple');
      expect(getProductCategoryBadgeClass('XTRAGREEN')).toContain('emerald');
      expect(getProductCategoryBadgeClass('CNG')).toContain('cyan');
    });

    it('handles unlisted or null categories gracefully', () => {
      expect(getProductCategoryBadgeClass('FUTURE_GRADE')).toContain('slate');
      expect(getProductCategoryBadgeClass(null)).toContain('slate');
    });
  });
});
