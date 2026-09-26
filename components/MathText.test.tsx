import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { MathText } from './MathText';
import { MATH_TEXT_RE } from './markdownRenderer';

const matches = (s: string) => [...s.matchAll(MATH_TEXT_RE)].map(m => m[0]);

describe('MathText', () => {
  afterEach(cleanup);

  it('setzt Formeln mit KaTeX, lässt Text stehen', async () => {
    const { container } = render(<MathText text={'Bayes: $P(B \\mid A) = \\frac{a}{b}$ fertig'} />);
    await waitFor(() => expect(container.querySelector('.katex')).not.toBeNull());
    expect(container.textContent).toContain('Bayes:');
    expect(container.textContent).toContain('fertig');
    // sichtbarer Teil ohne LaTeX-Quelltext (die MathML-Annotation für Screenreader enthält ihn absichtlich)
    expect(container.querySelector('.katex-html')?.textContent).not.toContain('\\frac');
  });

  it('Text ohne Formel bleibt unverändert und lädt kein KaTeX', () => {
    const { container } = render(<MathText text="Was ist eine Kovarianz?" />);
    expect(container.textContent).toBe('Was ist eine Kovarianz?');
    expect(container.querySelector('.katex')).toBeNull();
  });

  it('Preise mit Dollarzeichen gelten nicht als Formel', () => {
    expect(matches('Das kostet 5$ und 10$ im Monat')).toEqual([]);
    expect(matches('zwischen $ 5 und $ 10')).toEqual([]);
    expect(matches('$x^2$ und $$\\sum x$$')).toEqual(['$x^2$', '$$\\sum x$$']);
    expect(matches('Wert $n$ gesetzt')).toEqual(['$n$']);
  });
});
