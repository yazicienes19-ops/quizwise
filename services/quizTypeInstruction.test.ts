import { describe, it, expect } from 'vitest';
import { buildTypeInstruction, MIXED_TYPE_INSTRUCTION } from './quizTypeInstruction';

describe('buildTypeInstruction', () => {
  it('liefert die unveränderte volle Palette für "mixed"', () => {
    expect(buildTypeInstruction('mixed')).toBe(MIXED_TYPE_INSTRUCTION);
    expect(buildTypeInstruction('mixed')).toContain('numeric');
    expect(buildTypeInstruction('mixed')).toContain('scenario');
  });

  it('liefert bei genau 1 Typ den wortgleichen Einzeltyp-Text (AUSSCHLIESSLICH-Formulierung)', () => {
    const text = buildTypeInstruction(['mc']);
    expect(text).toContain('AUSSCHLIESSLICH Multiple-Choice-Fragen');
    expect(text).not.toContain('numeric');
  });

  it('liefert bei 2 Typen einen kombinierten Block mit exakt diesen beiden', () => {
    const text = buildTypeInstruction(['cloze', 'ranking']);
    expect(text).toContain('"cloze"');
    expect(text).toContain('"ranking"');
    expect(text).not.toContain('"mc"');
    expect(text).not.toContain('AUSSCHLIESSLICH');
    expect(text).toContain('2 gewählten Typen');
  });

  it('verteilt die Prozentangabe gleichmäßig auf die gewählte Anzahl', () => {
    const text = buildTypeInstruction(['mc', 'truefalse', 'open']);
    expect(text).toContain('ca. 33% je Typ');
  });
});
