import { describe, it, expect } from 'vitest';
import { nextHierarchyLevel } from './types';

describe('nextHierarchyLevel', () => {
  it('zykelt Hauptthema -> Unterthema -> Detail -> zurücksetzen -> Hauptthema', () => {
    expect(nextHierarchyLevel(undefined)).toBe('hauptthema');
    expect(nextHierarchyLevel('hauptthema')).toBe('unterthema');
    expect(nextHierarchyLevel('unterthema')).toBe('detail');
    expect(nextHierarchyLevel('detail')).toBeUndefined();
  });
});
