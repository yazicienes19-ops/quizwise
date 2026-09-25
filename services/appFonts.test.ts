// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyTypography, FONT_STACKS } from './appFonts';

describe('applyTypography', () => {
  beforeEach(() => { document.documentElement.removeAttribute('style'); });

  it('setzt eine bekannte Schrift und den Zeilenabstand sofort', () => {
    applyTypography('merriweather', '1.9');
    const st = document.documentElement.style;
    expect(st.getPropertyValue('--font-app')).toBe(FONT_STACKS.merriweather);
    expect(st.getPropertyValue('--line-height-app')).toBe('1.9');
  });

  it('ignoriert unbekannte oder fehlende Werte', () => {
    applyTypography('comic-sans', null);
    expect(document.documentElement.style.getPropertyValue('--font-app')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--line-height-app')).toBe('');
  });
});
