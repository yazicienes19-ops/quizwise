import { ActiveTab, type OnboardingChallenge } from '../types';
import type { TKey } from '../i18n';

export interface ChallengeRecommendation {
  challenge: OnboardingChallenge;
  /** Kurzer "Wir starten hier"-Satz. */
  introKey: TKey;
  /** Erklärender Absatz darunter. */
  bodyKey: TKey;
  /** ActiveTab, den die primäre CTA öffnet. */
  primaryTab: ActiveTab;
  /** Weitere Tabs, die als "hilft dir auch" genannt, aber nicht direkt angesteuert werden. */
  secondaryTabs: ActiveTab[];
  ctaKey: TKey;
  /** Kurzes Phasen-Label, z. B. "Verstehen" — für die nummerierte Liste bei mehreren Challenges. */
  phaseLabelKey: TKey;
}

/**
 * Zuordnung Lernproblem → Empfehlung. Feature-Zuordnung vom Nutzer bestätigt
 * (s. Onboarding-Plan Abschnitt 2). Reine Daten, keine Übersetzung hier —
 * Copy wird über TKey am Call-Site aufgelöst.
 */
export const RECOMMENDATION_BY_CHALLENGE: Record<OnboardingChallenge, ChallengeRecommendation> = {
  understanding: {
    challenge: 'understanding',
    introKey: 'onboarding.rec.understanding.intro',
    bodyKey: 'onboarding.rec.understanding.body',
    primaryTab: ActiveTab.RECALL,
    // Tutor + Quiz ergänzt (vorher []) — macht den personalisierten Lernweg
    // (RecommendationStep/PersonalPathStep) zu Feynman→Tutor→Quiz, deckungsgleich
    // mit der Vorgabe "Verstehen → Feynman-Methode + Tutor/KI-Erklärer".
    secondaryTabs: [ActiveTab.EXPLAINER, ActiveTab.QUIZ],
    ctaKey: 'onboarding.rec.understanding.cta',
    phaseLabelKey: 'onboarding.rec.understanding.phase',
  },
  structure: {
    challenge: 'structure',
    introKey: 'onboarding.rec.structure.intro',
    bodyKey: 'onboarding.rec.structure.body',
    primaryTab: ActiveTab.PLANNER,
    secondaryTabs: [ActiveTab.RADAR],
    ctaKey: 'onboarding.rec.structure.cta',
    phaseLabelKey: 'onboarding.rec.structure.phase',
  },
  knowledge_gaps: {
    challenge: 'knowledge_gaps',
    introKey: 'onboarding.rec.knowledge_gaps.intro',
    bodyKey: 'onboarding.rec.knowledge_gaps.body',
    primaryTab: ActiveTab.RADAR,
    secondaryTabs: [ActiveTab.QUIZ],
    ctaKey: 'onboarding.rec.knowledge_gaps.cta',
    phaseLabelKey: 'onboarding.rec.knowledge_gaps.phase',
  },
  exam_confidence: {
    challenge: 'exam_confidence',
    introKey: 'onboarding.rec.exam_confidence.intro',
    bodyKey: 'onboarding.rec.exam_confidence.body',
    primaryTab: ActiveTab.EXAM,
    secondaryTabs: [ActiveTab.RADAR],
    ctaKey: 'onboarding.rec.exam_confidence.cta',
    phaseLabelKey: 'onboarding.rec.exam_confidence.phase',
  },
  retention: {
    challenge: 'retention',
    introKey: 'onboarding.rec.retention.intro',
    bodyKey: 'onboarding.rec.retention.body',
    primaryTab: ActiveTab.CARDS,
    secondaryTabs: [ActiveTab.QUIZ, ActiveTab.RADAR],
    ctaKey: 'onboarding.rec.retention.cta',
    phaseLabelKey: 'onboarding.rec.retention.phase',
  },
  effectiveness: {
    challenge: 'effectiveness',
    introKey: 'onboarding.rec.effectiveness.intro',
    bodyKey: 'onboarding.rec.effectiveness.body',
    primaryTab: ActiveTab.RADAR,
    secondaryTabs: [],
    ctaKey: 'onboarding.rec.effectiveness.cta',
    phaseLabelKey: 'onboarding.rec.effectiveness.phase',
  },
  motivation: {
    challenge: 'motivation',
    introKey: 'onboarding.rec.motivation.intro',
    bodyKey: 'onboarding.rec.motivation.body',
    primaryTab: ActiveTab.RADAR,
    secondaryTabs: [ActiveTab.PLANNER],
    ctaKey: 'onboarding.rec.motivation.cta',
    phaseLabelKey: 'onboarding.rec.motivation.phase',
  },
  unsure: {
    challenge: 'unsure',
    introKey: 'onboarding.rec.unsure.intro',
    bodyKey: 'onboarding.rec.unsure.body',
    primaryTab: ActiveTab.QUIZ,
    secondaryTabs: [ActiveTab.RADAR],
    ctaKey: 'onboarding.rec.unsure.cta',
    phaseLabelKey: 'onboarding.rec.unsure.phase',
  },
};

export function getRecommendation(challenge: OnboardingChallenge): ChallengeRecommendation {
  return RECOMMENDATION_BY_CHALLENGE[challenge];
}

// ─── Kombination bei 2-3 Challenges ────────────────────────────────────────

/** Maximal wählbare Lernprobleme (ChallengesStep) — hält die kombinierte Liste überschaubar. */
export const MAX_CHALLENGES = 3;

/**
 * Kanonische Lernphasen-Reihenfolge. Jede Challenge sitzt in genau einer
 * Phase; werden mehrere Challenges kombiniert, sortiert das ihre Reihenfolge
 * in der Ergebnisliste und entscheidet, ob ein Brücken-Schritt nötig ist.
 */
type Phase = 'understand' | 'assess' | 'plan' | 'retain' | 'exam_check' | 'optimize' | 'sustain';

const PHASE_ORDER: Phase[] = ['understand', 'assess', 'plan', 'retain', 'exam_check', 'optimize', 'sustain'];

const CHALLENGE_PHASE: Record<OnboardingChallenge, Phase> = {
  understanding: 'understand',
  knowledge_gaps: 'assess',
  structure: 'plan',
  retention: 'retain',
  exam_confidence: 'exam_check',
  effectiveness: 'optimize',
  motivation: 'sustain',
  unsure: 'assess',
};

/**
 * 'assess' (→ Quiz) ist die einzige Brücken-Phase — sie steht für die
 * "Standortbestimmung", die zwischen entfernten Phasen sinnvoll fehlt
 * (Spec-Beispiel: Verstehen + Prüfungssicherheit → dazwischen "Überprüfen: Quiz").
 * Bewusst NICHT über getRecommendation('knowledge_gaps') aufgelöst — dessen
 * primaryTab ist RADAR (Lernanalyse), nicht QUIZ; die Brücke braucht den
 * Diagnose-Quiz-Tab unabhängig davon, welche reale Challenge zufällig
 * derselben Phase zugeordnet ist. Wird über alle Lücken hinweg höchstens
 * EINMAL eingefügt (nicht pro Lücke), damit die Liste bei 3 Challenges nicht
 * auf 5 Schritte anwächst.
 */
const BRIDGE_PHASE: Phase = 'assess';
const BRIDGE_STEP: CombinedStep = {
  phaseLabelKey: 'onboarding.rec.knowledge_gaps.phase',
  tab: ActiveTab.QUIZ,
  bodyKey: 'onboarding.rec.bridge.body',
};

export interface CombinedStep {
  phaseLabelKey: TKey;
  tab: ActiveTab;
  /** Kurze Erklärung, was dieser Schritt konkret bedeutet — für die ausführliche Anzeige im Empfehlungs-Screen. */
  bodyKey: TKey;
}

export interface CombinedRecommendation {
  steps: CombinedStep[];
  /** = die zuerst (höchste Priorität) gewählte Challenge — trägt introKey/ctaKey für den Screen. */
  lead: ChallengeRecommendation;
}

/**
 * Baut den kombinierten Lernweg aus 2-3 Challenges (Reihenfolge = vom Nutzer
 * gewählte Priorität). Mehrere Challenges in derselben Phase werden auf die
 * zuerst gewählte (höchste Priorität) reduziert. Zwischen zwei aufeinander-
 * folgenden Phasen mit Lücke > 1 wird höchstens einmal 'assess' (→ Quiz) als
 * Brücken-Schritt eingefügt (reproduziert das Spec-Beispiel Verstehen +
 * Prüfungssicherheit → Feynman / Quiz / Klausur-Simulation). Bei genau 1
 * übrig bleibender Phase (z. B. weil alle gewählten Challenges derselben
 * Phase angehören) liefert es einen Einzel-Schritt.
 */
export function buildCombinedRecommendation(challenges: OnboardingChallenge[]): CombinedRecommendation {
  const byPhase = new Map<Phase, OnboardingChallenge>();
  for (const c of challenges) {
    const phase = CHALLENGE_PHASE[c];
    if (!byPhase.has(phase)) byPhase.set(phase, c); // erste (höchste Priorität) gewinnt bei Phasen-Kollision
  }
  const sorted = [...byPhase.entries()].sort(
    ([a], [b]) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b)
  );

  const toStep = (challenge: OnboardingChallenge): CombinedStep => {
    const rec = getRecommendation(challenge);
    return { phaseLabelKey: rec.phaseLabelKey, tab: rec.primaryTab, bodyKey: rec.bodyKey };
  };

  const steps: CombinedStep[] = [toStep(sorted[0][1])];
  let bridgeUsed = sorted.some(([phase]) => phase === BRIDGE_PHASE);

  for (let i = 0; i < sorted.length - 1; i++) {
    const curIdx = PHASE_ORDER.indexOf(sorted[i][0]);
    const nextIdx = PHASE_ORDER.indexOf(sorted[i + 1][0]);
    if (!bridgeUsed && nextIdx - curIdx > 1) {
      steps.push(BRIDGE_STEP);
      bridgeUsed = true;
    }
    steps.push(toStep(sorted[i + 1][1]));
  }

  // lead = die tatsächlich zuerst vom Nutzer gewählte Challenge (Priorität), nicht zwingend sorted[0].
  return { steps, lead: getRecommendation(challenges[0]) };
}
