// Angaben aus dem Onboarding (profiles.preferences.onboarding), alle freiwillig.
// Nur das, was der Nutzer selbst eingetragen hat; leer = null.
const studyInfo = (onboarding) => {
  if (!onboarding || typeof onboarding !== 'object') return null;
  const ctx = onboarding.context && typeof onboarding.context === 'object' ? onboarding.context : {};
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
  const list = (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 10) : []);
  const info = {
    path: text(onboarding.educationPath),
    subject: text(ctx.subject),
    stage: text(ctx.stage),
    currentTopic: text(ctx.currentTopic),
    upcomingExam: text(ctx.upcomingExamAt),
    goalText: text(ctx.goalText),
    freeText: text(ctx.freeText),
    goals: list(onboarding.goals),
    challenges: list(onboarding.challenges),
  };
  const hasAny = Object.values(info).some(v => (Array.isArray(v) ? v.length > 0 : v !== null));
  return hasAny ? info : null;
};

module.exports = { studyInfo };
