import { describe, expect, it } from 'vitest';
import { COLLECTIONS, compareCloseSourceSnapshots, type SourceSnapshot } from '../src/worker/services/shiftCloseSourceSnapshotFence';

const snapshot = (): SourceSnapshot => Object.fromEntries(
  COLLECTIONS.map(name => [name, []]),
) as SourceSnapshot;

describe('Stage 01R: read-only source snapshot fence contract', () => {
  it('accepts identical complete source snapshots as candidate only', () => {
    expect(compareCloseSourceSnapshots(snapshot(), snapshot()).safeToProceedToAtomicFence).toBe(true);
  });
  it('is independent of row ordering and object property ordering', () => {
    const a = snapshot(); const b = snapshot();
    a.meter_readings = [
      { id: 'n2', values: { totalizerMilli: 1200, nozzleId: 'two' } },
      { id: 'n1', values: { nozzleId: 'one', totalizerMilli: 1000 } },
    ];
    b.meter_readings = [
      { id: 'n1', values: { totalizerMilli: 1000, nozzleId: 'one' } },
      { id: 'n2', values: { nozzleId: 'two', totalizerMilli: 1200 } },
    ];
    expect(compareCloseSourceSnapshots(a,b).safeToProceedToAtomicFence).toBe(true);
  });
  it('detects changed meter reading after financial preview', () => {
    const a = snapshot(); const b = snapshot();
    a.meter_readings = [{ id: 'meter-1', values: { closingMilli: 1000 } }];
    b.meter_readings = [{ id: 'meter-1', values: { closingMilli: 1001 } }];
    expect(compareCloseSourceSnapshots(a,b).changedCollections).toEqual(['meter_readings']);
  });
  it('detects added or removed receipt line', () => {
    const a = snapshot(); const b = snapshot();
    b.fuel_receipt_lines = [{id:'r-1',values:{milli:500}}];
    expect(compareCloseSourceSnapshots(a,b).changedCollections).toEqual(['fuel_receipt_lines']);
  });
  it('detects price and calibration revisions separately', () => {
    const a = snapshot(); const b = snapshot();
    a.price_snapshots = [{id:'p1',values:{pricePaise:9000}}];
    b.price_snapshots = [{id:'p1',values:{pricePaise:9001}}];
    b.calibration_references = [{id:'c1',values:{revision:'v2'}}];
    expect(compareCloseSourceSnapshots(a,b).changedCollections).toEqual(['price_snapshots','calibration_references']);
  });
  it('rejects incomplete snapshots instead of silently treating missing data as empty', () => {
    expect(() => compareCloseSourceSnapshots(snapshot(), {} as SourceSnapshot)).toThrow('Missing source collection');
  });
  it('rejects duplicate IDs in a source collection', () => {
    const a=snapshot();
    a.meter_readings=[{id:'x',values:{v:1}},{id:'x',values:{v:2}}];
    expect(() => compareCloseSourceSnapshots(a,snapshot())).toThrow();
  });
  it('rejects floats and undefined fields to preserve exact reconciliation arithmetic', () => {
    const a=snapshot(); a.financial_inputs=[{id:'p',values:{moneyPaise:1.5}}];
    expect(() => compareCloseSourceSnapshots(a,snapshot())).toThrow();
    a.financial_inputs=[{id:'p',values:{moneyPaise:undefined}}];
    expect(() => compareCloseSourceSnapshots(a,snapshot())).toThrow();
  });
  it('detects altered source version even if amount is unchanged', () => {
    const a=snapshot(); const b=snapshot();
    a.tank_stock_readings=[{id:'t',values:{litresMilli:1000,revision:1}}];
    b.tank_stock_readings=[{id:'t',values:{litresMilli:1000,revision:2}}];
    expect(compareCloseSourceSnapshots(a,b).safeToProceedToAtomicFence).toBe(false);
  });
});
