import { describe, it, expect, vi } from 'vitest';
vi.mock('./supabaseClient', () => ({ supabase: {} }));
import { isValidCode } from './mfaService';

describe('isValidCode', () => {
  it('akzeptiert genau sechs Ziffern, auch mit Leerzeichen am Rand', () => {
    expect(isValidCode('123456')).toBe(true);
    expect(isValidCode(' 123456 ')).toBe(true);
    expect(isValidCode('12345')).toBe(false);
    expect(isValidCode('12a456')).toBe(false);
    expect(isValidCode('1234567')).toBe(false);
  });
});
