import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActiveTab, type EducationPath, type OnboardingChallenge, type OnboardingContext, type OnboardingGoal, type OnboardingProfile, type ProcessedDocument } from '../../types';
import { useTranslation } from '../../i18n/I18nProvider';
import { getRecommendation, buildCombinedRecommendation } from '../../services/onboardingRecommendation';
import { importFromUrl } from '../../services/urlImport';
import { toast } from '../../services/toast';
import { isOnboardingDone, loadDraft, saveDraft } from './onboardingState';
import { OnboardingCard } from './OnboardingCard';
import { TourSpotlight } from './tour/TourSpotlight';
import { TOUR_STEP_LIBRARY, getTourSequence, type TourStepId } from './tour/tourSteps';
import { IntroStep } from './steps/IntroStep';
import { EducationPathStep } from './steps/EducationPathStep';
import { ContextStep } from './steps/ContextStep';
import { GoalsStep } from './steps/GoalsStep';
import { ChallengesStep } from './steps/ChallengesStep';
import { RecommendationStep } from './steps/RecommendationStep';
import { PersonalPathStep } from './steps/PersonalPathStep';
import { TourIntroStep } from './steps/TourIntroStep';
import { SystemOverviewStep } from './steps/SystemOverviewStep';
import { AppOverviewStep } from './steps/AppOverviewStep';
import { LibraryImportStep, type ImportMode } from './steps/LibraryImportStep';
import { FirstLearningMomentStep } from './steps/FirstLearningMomentStep';

type StepId = 'intro' | 'education_path' | 'context' | 'goals' | 'challenges' | 'recommendation' | 'learning_path' | 'tour_intro'
  | TourStepId | 'system_overview' | 'app_overview' | 'library_import' | 'first_moment';
const isTourStep = (id: StepId): id is TourStepId => id in TOUR_STEP_LIBRARY;

/**
 * Die Tour-Reihenfolge hängt vom Hauptlernproblem ab (Onboarding-Plan Abschnitt 3) —
 * deshalb keine feste Modul-Konstante mehr, sondern pro Aufruf gebaut (Draft-
 * Wiederherstellung UND laufender State nutzen dieselbe Funktion).
 * `tourOnly` = Wiedereinstieg aus den Einstellungen ("StudeArc kennenlernen"):
 * nur Tour + Abschluss-Screens, keine erneute Personalisierung, kein Material-Import.
 */
const buildStepOrder = (primaryChallenge: OnboardingChallenge | undefined, tourOnly: boolean): StepId[] => {
  const tourPart: StepId[] = [...getTourSequence(primaryChallenge), 'system_overview', 'app_overview'];
  if (tourOnly) return tourPart;
  return [
    'intro', 'education_path', 'context', 'goals', 'challenges', 'recommendation', 'learning_path', 'tour_intro',
    ...tourPart,
    'library_import', 'first_moment',
  ];
};

interface OnboardingFlowProps {
  /** = docs.handleFileUpload aus hooks/useDocuments.ts, unverändert durchgereicht. */
  handleFileUpload: (file: File, collectionId?: string, onProgress?: (fraction: number) => void) => Promise<string | null>;
  /** = docs.documents — zum Auflösen der docId aus handleFileUpload auf das echte ProcessedDocument. */
  documents: ProcessedDocument[];
  /** Echte App-Navigation für die Tour-Schritte (Onboarding-Plan Abschnitt 2) —
   *  die Tour dunkelt den Bildschirm ab und hebt einzelne Bereiche hervor,
   *  dafür muss der Tab dahinter wirklich wechseln. */
  setActiveTab: (tab: ActiveTab) => void;
  /**
   * `startContext.docId` ist gesetzt, wenn der Nutzer im Flow tatsächlich ein
   * Dokument hochgeladen hat (für die "erste Lernaktivität"-CTA, die das
   * Dokument vorausgewählt öffnen soll) — fehlt, wenn der Import übersprungen
   * wurde oder der Flow schon vor Schritt 7 verlassen wurde.
   */
  onComplete: (profile: Partial<OnboardingProfile>, startContext?: { docId?: string }) => void;
  /**
   * Nur gesetzt für den Wiedereinstieg (Settings → "StudeArc kennenlernen"):
   * startet direkt bei der Tour mit dem bereits gespeicherten Profil, ohne
   * Personalisierungsfragen und ohne Material-Import erneut abzufragen.
   */
  replay?: { profile: Partial<OnboardingProfile>; onDone: () => void };
}

/**
 * Rendert GENAU EINE <OnboardingCard>-Hülle für den gesamten Flow — nur der
 * Inhalt (Kinder) wechselt zwischen Schritten. Wichtig: würde stattdessen
 * jeder Step seine eigene <OnboardingCard> mitbringen, sähe React darin bei
 * jedem Schrittwechsel eine andere Komponente an derselben Stelle und würde
 * die komplette Hülle (Backdrop + Karte) neu mounten — der animate-in-
 * Übergang liefe dann bei JEDER Frage erneut ab statt nur beim ersten Öffnen.
 * Genau das wurde bei der ersten Fassung per Screenshot sichtbar (Karte wirkte
 * bei jedem Schritt wie neu eingeblendet) und ist hier deshalb bewusst
 * zentralisiert.
 */
export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ handleFileUpload, documents, setActiveTab, onComplete, replay }) => {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [path, setPath] = useState<EducationPath | undefined>(replay?.profile.educationPath);
  const [context, setContext] = useState<OnboardingContext>(replay?.profile.context ?? {});
  const [goals, setGoals] = useState<OnboardingGoal[]>(replay?.profile.goals ?? []);
  const [challenges, setChallenges] = useState<OnboardingChallenge[]>(replay?.profile.challenges ?? []);
  const [importMode, setImportMode] = useState<ImportMode>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [importTextTitle, setImportTextTitle] = useState('');
  const [importLink, setImportLink] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const restored = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entwurf einmalig beim Mount restaurieren (überlebt einen Reload mitten im Flow,
  // z.B. während der Themenerkennung in Schritt 8). Upload-bezogener State (Datei-
  // Objekte lassen sich nicht serialisieren) wird bewusst NICHT restauriert — nach
  // einem Reload landet der Nutzer wieder auf dem Import-Schritt, nicht mittendrin.
  // Im Wiedereinstiegs-Modus (replay) gibt es keinen Entwurf zu restaurieren.
  useEffect(() => {
    if (replay || restored.current || isOnboardingDone()) return;
    restored.current = true;
    const draft = loadDraft();
    if (!draft) return;
    const restoredOrder = buildStepOrder(draft.profile.challenges?.[0], false);
    setStepIndex(Math.min(draft.stepIndex, restoredOrder.indexOf('library_import')));
    if (draft.profile.educationPath) setPath(draft.profile.educationPath);
    if (draft.profile.context) setContext(draft.profile.context);
    if (draft.profile.goals) setGoals(draft.profile.goals);
    if (draft.profile.challenges) setChallenges(draft.profile.challenges);
  }, [replay]);

  // Nur der Screen "context" ist bedingt (kein Bildungsweg gewählt → nichts zu
  // erfragen). Die Tour-Schritte hängen zusätzlich vom Hauptlernproblem ab
  // (buildStepOrder) — deshalb reicht ein gefilterter Index, keine echte
  // Verzweigungs-Logik.
  const effectiveSteps = useMemo(
    () => buildStepOrder(challenges[0], !!replay).filter(id => id !== 'context' || path !== undefined),
    [path, challenges, replay]
  );
  const totalSteps = effectiveSteps.length;
  const clampedIndex = Math.min(stepIndex, totalSteps - 1);
  const currentStepId = effectiveSteps[clampedIndex];

  // Tour-Schritte dunkeln den Bildschirm ab und heben einen Sidebar-Bereich
  // hervor — dafür muss die App wirklich auf den passenden Tab wechseln.
  // Bewusst der ROHE setActiveTab-Setter (nicht Layouts onTabChange-Wrapper),
  // damit das Tab-Hopping der Tour NICHT den "zuletzt gesehener Tab"-Eintrag
  // in localStorage überschreibt.
  useEffect(() => {
    if (isTourStep(currentStepId)) setActiveTab(TOUR_STEP_LIBRARY[currentStepId].tab);
  }, [currentStepId, setActiveTab]);

  // Entwurf debounced speichern (300ms, wie das bestehende saveQuizProgress-Muster) —
  // vermeidet einen Storage-Write pro Tastenanschlag in den Kontext-Textfeldern.
  // Im Wiedereinstiegs-Modus (replay) wird nichts gespeichert.
  useEffect(() => {
    if (replay || isOnboardingDone()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft({
        stepIndex: clampedIndex,
        profile: { educationPath: path, context, goals, challenges },
      });
    }, 300);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [clampedIndex, path, context, goals, challenges, replay]);

  const goNext = () => setStepIndex(i => Math.min(totalSteps - 1, i + 1));
  const goBack = () => setStepIndex(i => Math.max(0, i - 1));
  const goToIndex = (i: number) => setStepIndex(i);
  const patchContext = (patch: Partial<OnboardingContext>) => setContext(c => ({ ...c, ...patch }));

  const finish = (docId?: string) => {
    onComplete(
      {
        version: 1,
        educationPath: path,
        context,
        goals,
        challenges,
        primaryChallenge: challenges[0],
        completedAt: Date.now(),
        completedFully: !!docId,
      },
      docId ? { docId } : undefined
    );
  };

  /** Springt direkt zum Material-Import — "Später ansehen" auf dem Tour-Einstieg
   *  überspringt Tour UND die beiden Abschluss-Screens (Onboarding-Plan Abschnitt 20). */
  const skipTour = () => {
    const idx = effectiveSteps.indexOf('library_import');
    if (idx >= 0) setStepIndex(idx);
  };

  const importReady = importMode === 'file' ? !!selectedFile
    : importMode === 'text' ? importText.trim().length > 0
    : importLink.trim().length > 0;

  const submitImport = async () => {
    if (isUploading || !importReady) return;
    setIsUploading(true);
    try {
      let file: File | null = null;
      if (importMode === 'file') {
        file = selectedFile;
      } else if (importMode === 'text') {
        file = new File([importText], `${(importTextTitle.trim() || 'Notiz')}.txt`, { type: 'text/plain' });
      } else {
        try {
          const imported = await importFromUrl(importLink);
          file = new File([imported.text], `${(imported.title || 'Import').slice(0, 100)}.txt`, { type: 'text/plain' });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Link konnte nicht importiert werden.');
          return;
        }
      }
      if (!file) return;
      const docId = await handleFileUpload(file);
      if (docId) {
        setUploadedDocId(docId);
        goNext();
      }
    } finally {
      setIsUploading(false);
    }
  };

  const primaryLabel = useMemo(() => {
    switch (currentStepId) {
      case 'intro':
        return t('onboarding.flow.intro.cta');
      case 'tour_intro':
        return t('onboarding.flow.tourIntro.cta');
      case 'recommendation':
      case 'learning_path':
        return t('common.next');
      case 'app_overview':
        return replay ? t('onboarding.flow.tourReplay.done') : t('common.next');
      case 'library_import':
        if (isUploading) return t('common.loading');
        return t(importMode === 'file' ? 'onboarding.flow.import.ctaFile' : importMode === 'text' ? 'onboarding.flow.import.ctaText' : 'onboarding.flow.import.ctaLink');
      case 'first_moment':
        return t('onboarding.flow.firstMoment.cta');
      default:
        return t('common.next');
    }
  }, [currentStepId, importMode, isUploading, replay, t]);

  const primaryDisabled = (currentStepId === 'challenges' && challenges.length === 0)
    || (currentStepId === 'library_import' && (isUploading || !importReady));

  const onPrimary = currentStepId === 'library_import' ? submitImport
    : currentStepId === 'first_moment' ? () => finish(uploadedDocId ?? undefined)
    : (replay && currentStepId === 'app_overview') ? replay.onDone
    : goNext;

  const onSkip = currentStepId === 'library_import' ? () => finish()
    : currentStepId === 'tour_intro' ? skipTour
    : undefined;
  const skipLabel = currentStepId === 'tour_intro' ? t('onboarding.flow.tourIntro.skip') : undefined;
  const onBack = clampedIndex > 0 && currentStepId !== 'first_moment' ? goBack : undefined;

  const uploadedDoc = documents.find(d => d.id === uploadedDocId) ?? null;

  let content: React.ReactNode;
  switch (currentStepId) {
    case 'intro':
      content = <IntroStep />;
      break;
    case 'education_path':
      content = <EducationPathStep value={path} onChange={setPath} />;
      break;
    case 'context':
      content = <ContextStep path={path} value={context} onChange={patchContext} />;
      break;
    case 'goals':
      content = <GoalsStep value={goals} onChange={setGoals} />;
      break;
    case 'challenges':
      content = <ChallengesStep value={challenges} onChange={setChallenges} />;
      break;
    case 'recommendation':
      content = <RecommendationStep challenges={challenges} />;
      break;
    case 'learning_path':
      content = <PersonalPathStep challenges={challenges} />;
      break;
    case 'tour_intro':
      content = <TourIntroStep />;
      break;
    case 'system_overview':
      content = <SystemOverviewStep />;
      break;
    case 'app_overview':
      content = <AppOverviewStep />;
      break;
    case 'library_import':
      content = (
        <LibraryImportStep
          mode={importMode} onModeChange={setImportMode}
          selectedFile={selectedFile} onFileSelect={setSelectedFile}
          text={importText} onTextChange={setImportText}
          textTitle={importTextTitle} onTextTitleChange={setImportTextTitle}
          link={importLink} onLinkChange={setImportLink}
        />
      );
      break;
    case 'first_moment':
      content = <FirstLearningMomentStep challenges={challenges} doc={uploadedDoc} />;
      break;
    default:
      content = null;
  }

  if (isTourStep(currentStepId)) {
    const tourConfig = TOUR_STEP_LIBRARY[currentStepId];
    const tourSequence = getTourSequence(challenges[0]);
    const tourIndex = tourSequence.indexOf(currentStepId);
    // Derselbe "lead" wie in RecommendationStep/PersonalPathStep (USP-Moment):
    // der ERSTE Tour-Schritt in der bereits personalisierten Reihenfolge, dessen
    // Tab zur zuvor als "Deine Lösung" gezeigten Kernfunktion passt, bekommt hier
    // in der allgemeinen Tour nochmal ein sichtbares "Deine Empfehlung"-Badge —
    // schließt den Kreis zwischen USP-Moment und der Feature-Tour (User-Feedback:
    // "bei der Vorstellung aller Features sagen: das ist dein Feynman").
    // "Erster Treffer" statt "jeder Treffer", weil mehrere Tour-Schritte denselben
    // Tab teilen können (z. B. Analyse+Coach beide RADAR) — nur einer soll markiert sein.
    const lead = challenges.length >= 2 ? buildCombinedRecommendation(challenges).lead : getRecommendation(challenges[0] ?? 'unsure');
    const primaryTourStepId = tourSequence.find(id => TOUR_STEP_LIBRARY[id].tab === lead.primaryTab);
    const isPrimaryRecommendation = challenges.length > 0 && currentStepId === primaryTourStepId;
    return (
      <TourSpotlight
        targetSelector={`[data-tour="nav-${tourConfig.tab}"]`}
        title={t(tourConfig.titleKey)}
        body={t(tourConfig.bodyKey)}
        ctaLabel={t('common.next')}
        onNext={goNext}
        onBack={clampedIndex > 0 ? goBack : undefined}
        stepIndex={tourIndex}
        totalSteps={tourSequence.length}
        isPrimaryRecommendation={isPrimaryRecommendation}
        previewPanel={tourConfig.Preview ? <tourConfig.Preview /> : undefined}
        badgeLabel={tourConfig.Preview ? t('onboarding.tour.previewBadge') : undefined}
      />
    );
  }

  return (
    <OnboardingCard
      stepIndex={clampedIndex}
      totalSteps={totalSteps}
      onPillClick={goToIndex}
      primaryLabel={primaryLabel}
      onPrimary={onPrimary}
      primaryDisabled={primaryDisabled}
      onBack={onBack}
      onSkip={onSkip}
      skipLabel={skipLabel}
    >
      {content}
    </OnboardingCard>
  );
};
