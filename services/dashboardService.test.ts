import { describe, it, expect } from 'vitest';
import { greetingKind } from './dashboardService';

describe('greetingKind', () => {
  it('bucket by hour', () => {
    expect(greetingKind(6)).toBe('morning');
    expect(greetingKind(13)).toBe('day');
    expect(greetingKind(19)).toBe('evening');
    expect(greetingKind(2)).toBe('night');
    expect(greetingKind(23)).toBe('night');
  });
});
