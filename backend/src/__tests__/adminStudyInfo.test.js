import { describe, it, expect } from 'vitest';
import { studyInfo } from '../admin/studyInfo';

describe('studyInfo (Admin-Nutzerübersicht)', () => {
  it('liest Bildungsweg, Fach, Semester und Listen aus dem Onboarding', () => {
    const info = studyInfo({
      educationPath: 'university',
      context: { subject: ' Psychologie ', stage: '1. Semester', currentTopic: 'Lernpsychologie' },
      goals: ['exam_prep'], challenges: ['retention', 'motivation'],
    });
    expect(info).toMatchObject({ path: 'university', subject: 'Psychologie', stage: '1. Semester', currentTopic: 'Lernpsychologie', goals: ['exam_prep'], challenges: ['retention', 'motivation'] });
  });

  it('gibt null zurück, wenn nichts angegeben ist', () => {
    expect(studyInfo(null)).toBeNull();
    expect(studyInfo({ version: 1, context: {}, goals: [], challenges: [] })).toBeNull();
    expect(studyInfo({ context: { subject: '   ' } })).toBeNull();
  });

  it('kürzt überlange Texte und ignoriert fremde Typen', () => {
    const info = studyInfo({ context: { subject: 'x'.repeat(500) }, goals: ['a', 3, null] });
    expect(info.subject).toHaveLength(200);
    expect(info.goals).toEqual(['a']);
  });
});
