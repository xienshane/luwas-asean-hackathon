import { describe, it, expect } from 'vitest';
import { capacityAlert } from './capacityAlert';

const NAMES: Record<string, string> = { b1: 'Guadalupe', b2: 'Tisa', b3: 'Apas' };
const nameFor = (id: string) => NAMES[id] ?? id;

describe('capacityAlert', () => {
  it('is silent when nothing was dropped', () => {
    expect(capacityAlert([], nameFor)).toBeNull();
    expect(capacityAlert(undefined, nameFor)).toBeNull();
  });

  it('names every dropped barangay', () => {
    expect(capacityAlert(['b1', 'b2'], nameFor)).toBe(
      'CAPACITY: 2 barangays not routable this run — Guadalupe, Tisa. Add team capacity or dispatch them manually.',
    );
  });

  it('uses the singular for one drop', () => {
    expect(capacityAlert(['b1'], nameFor)).toBe(
      'CAPACITY: 1 barangay not routable this run — Guadalupe. Add team capacity or dispatch them manually.',
    );
  });

  it('truncates a long list but keeps the true count', () => {
    const line = capacityAlert(['b1', 'b2', 'b3', 'b4'], nameFor)!;
    expect(line).toContain('4 barangays');
    expect(line).toContain('Guadalupe, Tisa, Apas +1 more');
  });

  it('falls back to the raw id when the barangay is unknown', () => {
    expect(capacityAlert(['zzz'], nameFor)).toContain('zzz');
  });
});
