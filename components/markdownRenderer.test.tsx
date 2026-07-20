import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from './markdownRenderer';

const html = (md: string) => renderToStaticMarkup(<>{renderMarkdown(md)}</>);

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
