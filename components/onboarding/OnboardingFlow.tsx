import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActiveTab, type FlashcardDeck, type OnboardingChallenge, type OnboardingProfile, type ProcessedDocument } from '../../types';
import type { GenerationSource } from '../../services/geminiService';
import { getFirstMomentPlan, getStartTab } from '../../services/onboardingFirstMoment';
import { useTranslation } from '../../i18n/I18nProvider';
import { importFromUrl } from '../../services/urlImport';
import { toast } from '../../services/toast';
import { isOnboardingDone, loadDraft, saveDraft } from './onboardingState';
import { OnboardingCard } from './OnboardingCard';
import { TourSpotlight } from './tour/TourSpotlight';
import { TOUR_STEP_LIBRARY, getTourSequence, type TourStepId } from './tour/tourSteps';
import { SystemOverviewStep } from './steps/SystemOverviewStep';
import { AppOverviewStep } from './steps/AppOverviewStep';
import { LibraryImportStep, type ImportMode } from './steps/LibraryImportStep';
import { StudyStep } from './steps/StudyStep';
import { ProblemStep } from './steps/ProblemStep';
import { FirstPracticeStep, type PracticeFooter } from './steps/FirstPracticeStep';
import { LearningPathStep, PATH_COPY } from './steps/LearningPathStep';
import type { OnboardingProblem } from '../../services/onboardingFirstMoment';
import { resolveErrorMessage } from '../../services/errorMessages';

type StepId = 'study' | 'problem' | TourStepId | 'system_overview' | 'app_overview' | 'library_import' | 'first_practice' | 'learning_path';
const isTourStep = (id: StepId): id is TourStepId => id in TOUR_STEP_LIBRARY;

/**
 * Onboarding = zwei Fragen, Upload, erster echter Lernmoment, Lernweg. Bildungsweg,
 * Ziele und Kontext werden nicht mehr vorab erfragt, und die App-Tour ist
 * raus: Funktionen werden später per Hinweis vorgeschlagen, wenn sie passen
 * (services/featureHints.ts). Die Tour gibt es nur noch als Wiedereinstieg
 * aus den Einstellungen ("StudeArc kennenlernen", `tourOnly`).
 */
const buildStepOrder = (primaryChallenge: OnboardingChallenge | undefined, tourOnly: boolean): StepId[] => {
  if (tourOnly) return [...getTourSequence(primaryChallenge), 'system_overview', 'app_overview'];
  return ['study', 'problem', 'library_import', 'first_practice', 'learning_path'];
};

interface OnboardingFlowProps {
  /** = docs.handleFileUpload aus hooks/useDocuments.ts, unverändert durchgereicht. */
  handleFileUpload: (file: File, collectionId?: string, onProgress?: (fraction: number) => void) => Promise<string | null>;
  /** = docs.documents — zum Auflösen der docId aus handleFileUpload auf das echte ProcessedDocument. */
  documents: ProcessedDocument[];
  /** = docs.getDocumentSource — Quelle für die ersten Fragen aus dem Skript. */
  getDocumentSource: (doc: ProcessedDocument) => GenerationSource;
  /** Karten-Modus im ersten Lernmoment legt einen echten Stapel an. */
  onDeckCreated: (deck: FlashcardDeck) => void;
  /** Echte App-Navigation für die Tour-Schritte im Wiedereinstieg. */
  setActiveTab: (tab: ActiveTab) => void;
  /**
   * `startContext.docId` ist gesetzt, wenn der Nutzer im Flow tatsächlich ein
   * Dokument hochgeladen hat — fehlt, wenn der Upload übersprungen wurde.
   */
  onComplete: (profile: Partial<OnboardingProfile>, startContext?: { docId?: string }) => void;
  /**
   * Nur gesetzt für den Wiedereinstieg (Settings → "StudeArc kennenlernen"):
   * zeigt ausschließlich die Tour mit dem bereits gespeicherten Profil.
   */
  replay?: { profile: Partial<OnboardingProfile>; onDone: () => void };
}

/**
 * Rendert GENAU EINE <OnboardingCard>-Hülle für den gesamten Flow — nur der
 * Inhalt (Kinder) wechselt zwischen Schritten. Würde jeder Step seine eigene
 * <OnboardingCard> mitbringen, mountete React die komplette Hülle bei jedem
 * Schrittwechsel neu und der animate-in-Übergang liefe jedes Mal ab.
 */
export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ handleFileUpload, documents, getDocumentSource, onDeckCreated, setActiveTab, onComplete, replay }) => {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [subject, setSubject] = useState(replay?.profile.context?.subject ?? '');
  const [problems, setProblems] = useState<OnboardingChallenge[]>(replay?.profile.challenges ?? []);
  const problem = problems[0];
  const [importMode, setImportMode] = useState<ImportMode>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [importTextTitle, setImportTextTitle] = useState('');
  const [importLink, setImportLink] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [practiceFooter, setPracticeFooter] = useState<PracticeFooter | null>(null);
  const restored = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entwurf einmalig beim Mount restaurieren (überlebt einen Reload mitten im
  // Flow). Upload-State lässt sich nicht serialisieren: nach einem Reload landet
  // der Nutzer höchstens wieder auf dem Upload-Schritt.
  useEffect(() => {
    if (replay || restored.current || isOnboardingDone()) return;
    restored.current = true;
    const draft = loadDraft();
    if (!draft) return;
    const restoredOrder = buildStepOrder(undefined, false);
    setStepIndex(Math.min(draft.stepIndex, restoredOrder.indexOf('library_import')));
    if (draft.profile.context?.subject) setSubject(draft.profile.context.subject);
    if (draft.profile.challenges?.length) setProblems(draft.profile.challenges);
  }, [replay]);

  const effectiveSteps = useMemo(() => buildStepOrder(problem, !!replay), [problem, replay]);
  const totalSteps = effectiveSteps.length;
  const clampedIndex = Math.min(stepIndex, totalSteps - 1);
  const currentStepId = effectiveSteps[clampedIndex];

  // Tour-Schritte (nur Wiedereinstieg) heben einen Sidebar-Bereich hervor —
  // dafür muss die App wirklich auf den passenden Tab wechseln. Bewusst der
  // ROHE setActiveTab-Setter, damit der "zuletzt gesehene Tab" unberührt bleibt.
  useEffect(() => {
    if (isTourStep(currentStepId)) setActiveTab(TOUR_STEP_LIBRARY[currentStepId].tab);
  }, [currentStepId, setActiveTab]);

  const profileDraft = useMemo<Partial<OnboardingProfile>>(() => {
    const s = subject.trim();
    return {
      educationPath: s ? 'university' : undefined,
      context: s ? { subject: s } : {},
      challenges: problems,
    };
  }, [subject, problems]);

  // Entwurf debounced speichern (300ms) — kein Storage-Write pro Tastenanschlag.
  useEffect(() => {
    if (replay || isOnboardingDone()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft({ stepIndex: clampedIndex, profile: profileDraft }), 300);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [clampedIndex, profileDraft, replay]);

  const goNext = () => setStepIndex(i => Math.min(totalSteps - 1, i + 1));
  const goBack = () => setStepIndex(i => Math.max(0, i - 1));
  const goToIndex = (i: number) => setStepIndex(i);

  const finish = (docId?: string) => {
    onComplete(
      {
        version: 1,
        ...profileDraft,
        primaryChallenge: problem,
        completedAt: Date.now(),
        completedFully: !!docId,
      },
      docId ? { docId } : undefined
    );
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
          toast.error(resolveErrorMessage(err));
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
      case 'app_overview':
        return replay ? t('onboarding.flow.tourReplay.done') : t('common.next');
      case 'library_import':
        if (isUploading) return t('common.loading');
        return t(importMode === 'file' ? 'onboarding.flow.import.ctaFile' : importMode === 'text' ? 'onboarding.flow.import.ctaText' : 'onboarding.flow.import.ctaLink');
      case 'learning_path': {
        const lead = problem && problem in PATH_COPY ? PATH_COPY[problem as OnboardingProblem] : null;
        return lead ? t('onboarding.v2.path.cta', { feature: t(lead.featureKey) }) : t('onboarding.v2.path.ctaFallback');
      }
      default:
        return t('common.next');
    }
  }, [currentStepId, importMode, isUploading, replay, problem, t]);

  const primaryDisabled = (currentStepId === 'problem' && problems.length === 0)
    || (currentStepId === 'library_import' && (isUploading || !importReady));

  const onPrimary = currentStepId === 'library_import' ? submitImport
    : (replay && currentStepId === 'app_overview') ? replay.onDone
    : currentStepId === 'learning_path' ? () => finish(uploadedDocId ?? undefined)
    : goNext;

  // Upload oder Übung überspringen führt direkt zum Lernweg: ohne Skript gibt es
  // nichts zu üben, aber der Nutzer soll trotzdem wissen, womit er lernt.
  const toLearningPath = () => setStepIndex(effectiveSteps.indexOf('learning_path'));
  const onSkip = currentStepId === 'library_import' ? toLearningPath
    : currentStepId === 'first_practice' && !practiceFooter?.hideSkip ? toLearningPath
    : undefined;
  const skipLabel = currentStepId === 'library_import' ? t('onboarding.v2.import.skip') : undefined;
  // Kein Zurück aus Übung und Lernweg: die Übung würde sonst neu generiert.
  const onBack = clampedIndex > 0 && currentStepId !== 'first_practice' && currentStepId !== 'learning_path' ? goBack : undefined;

  const uploadedDoc = documents.find(d => d.id === uploadedDocId) ?? null;

  let content: React.ReactNode;
  switch (currentStepId) {
    case 'study':
      content = <StudyStep value={subject} onChange={setSubject} onSubmit={goNext} />;
      break;
    case 'problem':
      content = <ProblemStep value={problems} onChange={setProblems} />;
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
    case 'first_practice':
      content = (
        <FirstPracticeStep
          doc={uploadedDoc}
          getDocumentSource={getDocumentSource}
          plan={getFirstMomentPlan(problem)}
          onDeckCreated={onDeckCreated}
          setFooter={setPracticeFooter}
          onFinish={toLearningPath}
        />
      );
      break;
    case 'learning_path':
      content = <LearningPathStep problems={problems} />;
      break;
    default:
      content = null;
  }

  if (isTourStep(currentStepId)) {
    const tourConfig = TOUR_STEP_LIBRARY[currentStepId];
    const tourSequence = getTourSequence(problem);
    const tourIndex = tourSequence.indexOf(currentStepId);
    // Der erste Tour-Schritt, dessen Tab dem Startpunkt aus dem Lernweg entspricht,
    // bekommt das "Deine Empfehlung"-Badge (nur einer, auch wenn Tabs sich wiederholen).
    const startTab = getStartTab(problems);
    const primaryTourStepId = tourSequence.find(id => TOUR_STEP_LIBRARY[id].tab === startTab);
    const isPrimaryRecommendation = problems.length > 0 && currentStepId === primaryTourStepId;
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

  const isPractice = currentStepId === 'first_practice';
  return (
    <OnboardingCard
      stepIndex={clampedIndex}
      totalSteps={totalSteps}
      onPillClick={goToIndex}
      primaryLabel={isPractice ? practiceFooter?.label ?? t('common.loading') : primaryLabel}
      onPrimary={isPractice ? () => practiceFooter?.onClick() : onPrimary}
      primaryDisabled={isPractice ? (!practiceFooter || !!practiceFooter.disabled) : primaryDisabled}
      onBack={onBack}
      onSkip={onSkip}
      skipLabel={skipLabel}
    >
      {content}
    </OnboardingCard>
  );
};
