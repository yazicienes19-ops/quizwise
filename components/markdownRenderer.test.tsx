import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown, parseInline } from './markdownRenderer';

const html = (md: string) => renderToStaticMarkup(<>{renderMarkdown(md)}</>);
const inlineHtml = (text: string) => renderToStaticMarkup(<>{parseInline(text, 'test')}</>);

describe('renderMarkdown — Überschriften', () => {
  it('Überschrift auf eigener Zeile bleibt wie bisher (h3 + folgender Absatz)', () => {
    const out = html('Grundlagen\nDas ist der Fließtext.');
    expect(out).toMatch(/<h3[^>]*>Grundlagen<\/h3>/);
    expect(out).toContain('Das ist der Fließtext.');
  });

  it('regression: KI setzt keinen Zeilenumbruch — Überschrift und Satz landen auf derselben Zeile', () => {
    // Genau der 2026-07-20 beobachtete Fall: "Grundlagen Psychologie wird als..."
    const out = html('Grundlagen Psychologie wird als eine empirische Wissenschaft definiert.');
    expect(out).toMatch(/<h3[^>]*>Grundlagen<\/h3>/);
    // Der Fließtext darf NICHT mit in die h3 rutschen
    expect(out).not.toContain('Grundlagen Psychologie');
    expect(out).toMatch(/<p[^>]*>Psychologie wird als eine empirische Wissenschaft definiert\.<\/p>/);
  });

  it('funktioniert für alle drei Stufen ohne Zeilenumbruch', () => {
    const out = html('Grundlagen A.\n\nVertiefung B.\n\nKontext C.');
    expect((out.match(/<h3/g) || [])).toHaveLength(3);
    expect(out).toContain('A.');
    expect(out).toContain('B.');
    expect(out).toContain('C.');
  });

  it('Doppelpunkt-Variante ("Grundlagen: Text") wird ebenso getrennt', () => {
    const out = html('Grundlagen: Der Satz direkt danach.');
    expect(out).toMatch(/<h3[^>]*>Grundlagen<\/h3>/);
    expect(out).toContain('Der Satz direkt danach.');
  });

  it('türkische Überschriften funktionieren ebenso', () => {
    const out = html('Temel Bilgiler Bu bir açıklamadır.');
    expect(out).toMatch(/<h3[^>]*>Temel Bilgiler<\/h3>/);
    expect(out).toContain('Bu bir açıklamadır.');
  });
});

describe('parseInline — Formeln (KaTeX)', () => {
  // Regression: ExplainerSystem.tsx zeigte den "Beleg aus: [Quelle]"-Zitatblock
  // bisher als reinen String (kein renderMarkdown/parseInline-Aufruf), roh
  // gequotete LaTeX-Formeln aus der KI-Antwort blieben dort unrenderd sichtbar
  // ("$f(x) = ...$" statt echter Formel), obwohl der Haupttext direkt darüber
  // dieselbe Formel bereits korrekt rendert. Fix: Zitat läuft jetzt ebenfalls
  // durch parseInline. Diese Tests sichern die zugrunde liegende Funktion ab.
  it('$...$ (inline) wird als KaTeX gerendert, kein rohes Dollarzeichen bleibt übrig', () => {
    const out = inlineHtml("Für $f(x) = x^3 + 2x^2 - 5x$ gilt $f'(x) = 3x^2 + 4x - 5$.");
    expect(out).toContain('class="katex"');
    expect(out).not.toContain('$f(x)');
    expect(out).not.toContain("$f'(x)");
  });

  it('\\(...\\) (alternative Inline-Delimiter) wird ebenfalls gerendert', () => {
    const out = inlineHtml('Es gilt \\(x^2 + 1\\).');
    expect(out).toContain('class="katex"');
    expect(out).not.toContain('\\(x^2');
  });

  it('ungültiges LaTeX crasht nicht (throwOnError:false greift), Fallback bleibt lesbar', () => {
    expect(() => inlineHtml('Kaputt: $\\frac{1$')).not.toThrow();
  });

  it('einzelnes Dollarzeichen ohne Gegenstück wird NICHT als Formel fehlinterpretiert', () => {
    const out = inlineHtml('Der Preis beträgt 5$ pro Stück, kein Mathe hier.');
    expect(out).not.toContain('class="katex"');
    expect(out).toContain('5$ pro Stück');
  });
});

describe('renderMarkdown — Listen über Leerzeilen hinweg', () => {
  it('regression: nummerierte Punkte mit Leerzeile dazwischen bleiben EINE Liste (nicht je "1.")', () => {
    // Live im Reader-Tutor gefunden (2026-09-08): drei erklärte Unterbegriffe,
    // vom Modell durch Leerzeilen getrennt, erschienen alle als "1." statt 1./2./3.
    const out = html('1. Subjektive Erfahrungen: Text A.\n\n1. Ganzheitlich: Text B.\n\n1. Selbst-Aktualisierung: Text C.');
    expect((out.match(/<ol/g) || [])).toHaveLength(1);
    expect((out.match(/<li/g) || [])).toHaveLength(3);
    expect(out).toMatch(/>1\.<\/span><span>Subjektive Erfahrungen/);
    expect(out).toMatch(/>2\.<\/span><span>Ganzheitlich/);
    expect(out).toMatch(/>3\.<\/span><span>Selbst-Aktualisierung/);
  });

  it('nummerierte Liste ohne Leerzeilen funktioniert weiterhin wie bisher', () => {
    const out = html('1. Eins\n2. Zwei\n3. Drei');
    expect((out.match(/<ol/g) || [])).toHaveLength(1);
    expect((out.match(/<li/g) || [])).toHaveLength(3);
  });

  it('Aufzählung mit Leerzeile dazwischen bleibt ebenfalls EINE Liste', () => {
    const out = html('- Punkt A\n\n- Punkt B');
    expect((out.match(/<ul/g) || [])).toHaveLength(1);
    expect((out.match(/<li/g) || [])).toHaveLength(2);
  });

  it('echter Absatz nach einer Liste beendet sie weiterhin korrekt', () => {
    const out = html('1. Eins\n2. Zwei\n\nEin normaler Absatz danach.');
    expect((out.match(/<ol/g) || [])).toHaveLength(1);
    expect((out.match(/<li/g) || [])).toHaveLength(2);
    expect(out).toMatch(/<p[^>]*>Ein normaler Absatz danach\.<\/p>/);
  });
});
