import { describe, it, expect, beforeEach } from 'vitest';
import { reportQuestion, getQuestionFeedback, clearQuestionFeedback } from './questionFeedbackService';

describe('questionFeedbackService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('meldet eine Frage mit Grund und Zeitstempel', () => {
    reportQuestion('Was ist X?', 'unclear', 'Skript.pdf');
    const all = getQuestionFeedback();
    expect(all).toHaveLength(1);
    expect(all[0].reason).toBe('unclear');
    expect(all[0].docName).toBe('Skript.pdf');
    expect(all[0].timestamp).toBeGreaterThan(0);
  });

  it('doppelte Meldung derselben Frage mit demselben Grund wird ignoriert', () => {
    reportQuestion('Was ist X?', 'wrong');
    reportQuestion('Was ist X?', 'wrong');
    expect(getQuestionFeedback()).toHaveLength(1);
    // Anderer Grund ist erlaubt
    reportQuestion('Was ist X?', 'too_hard');
    expect(getQuestionFeedback()).toHaveLength(2);
  });

  it('leere Fragen werden nicht übernommen, sehr lange auf 500 Zeichen gekappt', () => {
    reportQuestion('   ', 'other');
    expect(getQuestionFeedback()).toHaveLength(0);
    reportQuestion('x'.repeat(900), 'other');
    expect(getQuestionFeedback()[0].questionText).toHaveLength(500);
  });

  it('Cap von 100 Einträgen verwirft die ältesten zuerst', () => {
    for (let i = 0; i < 130; i++) reportQuestion(`Frage ${i}`, 'other');
    const all = getQuestionFeedback();
    expect(all).toHaveLength(100);
    expect(all[0].questionText).toBe('Frage 30'); // 0–29 geflogen
  });

  it('clearQuestionFeedback leert die Queue', () => {
    reportQuestion('Was ist X?', 'duplicate');
    clearQuestionFeedback();
    expect(getQuestionFeedback()).toHaveLength(0);
  });
});
