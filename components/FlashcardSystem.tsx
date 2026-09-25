
import { ClozeText } from './ClozeText';
import { hasCloze } from '../services/cloze';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FlashcardDeck, Flashcard, ProcessedDocument, Collection, ExamTerm } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { EmojiImage } from './EmojiImage';
import { generateFlashcardsFromDocument } from '../services/geminiService';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';
import { FlashcardPlayer } from './FlashcardPlayer';
import { SourceSelector } from './SourceSelector';
import { saveDeckToSupabase, deleteDeckFromSupabase, uploadAllDecksToSupabase } from '../services/flashcardService';
import { readLocalDecks, writeLocalDecks, subscribeLocalDecks, claimLocalDecks } from '../services/deckStore';
import { syncDecksWithCloud } from '../services/deckCloudSync';
import { documentDisplayName } from '../services/libraryService';
import { createSrsState, migrateLegacyCard, countDueCards, QUALITY_MAP, reviewCard, buildSessionBatch, SESSION_BATCH_SIZE, isCardDue, LEECH_THRESHOLD, type SrsState } from '../services/spacedRepetition';
import { recordActivity } from '../services/streakService';
import { AnkiImportModal } from './AnkiImportModal';
import { buildPrintHtml } from '../services/printDeckService';
import { ExportDeckModal } from './ExportDeckModal';
import { EditCardModal } from './EditCardModal';
import { DeckStatsModal } from './DeckStatsModal';
import { MoreHorizontal, ListOrdered, HelpCircle, BarChart2, Pencil, Share2, Printer, Trash2, SquareDashed } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { confirmDialog } from '../services/confirmDialog';
import { runUndoable } from '../services/undoable';
import { findDuplicateDeckGroups, mergeDuplicateDecks } from '../services/duplicateDecks';
import { collectTags, hasTag, parseTags } from '../services/cardTags';
import { CardImage } from './CardImage';
import type { CardImages } from './EditCardModal';
import { deleteCardImage, isOwnImage } from '../services/cardImages';
import { buildFigureCards, canUseFigures } from '../services/figureCardBuilder';
import { getCardLimits, setCardLimits, remainingToday, todayUsage, NEW_LIMIT_OPTIONS, REVIEW_LIMIT_OPTIONS, UNLIMITED, type CardLimits } from '../services/cardLimits';
import { OcclusionEditorModal } from './OcclusionEditorModal';
import { buildOcclusionCards, cardImagePaths } from '../services/occlusion';
import { makeEntry, logReview, undoLastReview, ratingFor, loadReviews, type ReviewEntry } from '../services/reviewLog';
import { ReviewStatsPanel } from './ReviewStatsPanel';
import { getFsrsParams, saveFsrsParams, personalize, MIN_PAIRS, RETENTION_OPTIONS } from '../services/fsrsPersonal';
import type { FsrsParams } from '../services/spacedRepetition';
import { ModuleDeckModal } from './ModuleDeckModal';

interface FlashcardSystemProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  /** Klausurtermine für den Lernplan beim "Ganzen Fach als Karten". */
  examTerms?: ExamTerm[];
  onDeleteDoc: (id: string) => void;
  onSaveToLibrary?: (file: File) => void;
  onGenerateQuizFromDeck: (deck: FlashcardDeck) => void;
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  isQuizLoading?: boolean;
  initialDoc?: ProcessedDocument;
  userId?: string;
  userName?: string | null;
  /** Aktives Fach aus der Sidebar (Bug-Fix 2026-09-10) — die Dokument-Auswahl
   *  für ein neues Deck zeigte bisher alle Dokumente kontoweit statt nur die
   *  des gewählten Fachs. null/undefined = "Alle Fächer", keine Einschränkung. */
  activeModuleId?: string | null;
  /** Aus der globalen Suche: diesen Stapel direkt in der Kartenliste öffnen, gefiltert nach initialCardQuery. */
  initialDeckId?: string;
  initialCardQuery?: string;
}

/** Cloud-Speichern bündeln: vorher lief pro Bewertung ein SELECT + UPSERT des
 *  ganzen Decks, bei einer 30-Karten-Runde also 60 Requests in wenigen Minuten. */
const CLOUD_SAVE_DELAY_MS = 1500;

const newId = () => Math.random().toString(36).slice(2, 11);
const FIGURES_KEY = 'studearc_cards_with_figures';

const isValidSrs = (s: unknown): s is SrsState => {
  const v = s as SrsState;
  return !!v && [v.ease, v.interval, v.repetitions, v.nextReview].every(n => typeof n === 'number' && Number.isFinite(n));
};

export const FlashcardSystem: React.FC<FlashcardSystemProps> = ({
  availableDocuments,
  collections,
  examTerms = [],
  onDeleteDoc,
  onSaveToLibrary,
  onGenerateQuizFromDeck,
  getDocumentSource,
  isQuizLoading = false,
  initialDoc,
  userId,
  userName,
  activeModuleId = null,
  initialDeckId,
  initialCardQuery,
}) => {
  const { t, tp } = useTranslation();
  const moduleDocuments = useMemo(
    () => activeModuleId ? availableDocuments.filter(d => d.collectionId === activeModuleId) : availableDocuments,
    [availableDocuments, activeModuleId],
  );
  // Sofort mit dem lokalen Stand starten (kein leerer "Keine Stapel"-Blitz,
  // bis die Cloud antwortet); der Cloud-Merge zieht danach nach.
  const [decks, setDecksState] = useState<FlashcardDeck[]>(() => {
    if (userId) claimLocalDecks(userId);
    return readLocalDecks();
  });
  // Handler lesen IMMER die aktuelle Liste über die Ref. Vorher schrieb z.B.
  // die Auto-Generierung aus der Bibliothek (Effekt beim Mount, Closure mit
  // decks = []) nach ein paar Sekunden nur das neue Deck zurück und warf alle
  // anderen aus State und localStorage.
  const decksRef = useRef(decks);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [sessionCards, setSessionCards] = useState<Flashcard[]>([]);
  const [isPracticeSession, setIsPracticeSession] = useState(false);
  const sessionReviewCount = React.useRef(0);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(initialDeckId ?? null);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState<number>(15);
  /** Abbildungen aus dem PDF als zusätzliche Bildkarten (services/figureCardBuilder.ts). */
  const [withFigures, setWithFigures] = useState(() => {
    try { return localStorage.getItem(FIGURES_KEY) === '1'; } catch { return false; }
  });
  const [figureProgress, setFigureProgress] = useState<{ done: number; total: number } | null>(null);
  const toggleFigures = () => setWithFigures(v => {
    try { localStorage.setItem(FIGURES_KEY, v ? '0' : '1'); } catch { /* Speicher gesperrt */ }
    return !v;
  });
  const [freshDeckId, setFreshDeckId] = useState<string | null>(null);

  // States for manual deck creation
  const [showManualDeckDialog, setShowManualDeckDialog] = useState(false);
  const [showAnkiImport, setShowAnkiImport] = useState(false);
  const [exportingDeck, setExportingDeck] = useState<FlashcardDeck | null>(null);
  const [statsDeck, setStatsDeck] = useState<FlashcardDeck | null>(null);
  const [cardSearch, setCardSearch] = useState(initialCardQuery ?? '');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showOcclusion, setShowOcclusion] = useState(false);
  const [showModuleDeck, setShowModuleDeck] = useState(false);
  // Tageslimits (Anki-Standard 20 neue / 200 Wiederholungen)
  const [limits, setLimits] = useState<CardLimits>(getCardLimits);
  const [showLimits, setShowLimits] = useState(false);
  const updateLimits = (l: CardLimits) => { setLimits(l); setCardLimits(l, userId); };
  const limitUsage = useMemo(() => todayUsage(decks), [decks]);
  // FSRS an mich anpassen (services/fsrsPersonal.ts)
  const [fsrsParams, setFsrsParamsState] = useState<FsrsParams>(getFsrsParams);
  const [fsrsBusy, setFsrsBusy] = useState(false);
  const [fsrsMsg, setFsrsMsg] = useState<string | null>(null);
  const updateFsrs = (p: FsrsParams) => { setFsrsParamsState(p); saveFsrsParams(p, userId); setFsrsMsg(null); };
  const runPersonalize = async () => {
    setFsrsBusy(true);
    try {
      const r = personalize(await loadReviews());
      if (!r.ok) { setFsrsMsg(t('fsrs.tooFew', { n: r.pairsUsed, min: MIN_PAIRS })); return; }
      updateFsrs({ ...fsrsParams, initialStability: r.initialStability });
      setFsrsMsg(t('fsrs.done', { n: r.pairsUsed, a: r.initialStability[0], h: r.initialStability[1], g: r.initialStability[2], e: r.initialStability[3] }));
    } catch {
      setFsrsMsg(t('fsrs.failed'));
    } finally {
      setFsrsBusy(false);
    }
  };
  const [manualDeckTitle, setManualDeckTitle] = useState('');

  // null = closed, 'new' = add mode, Flashcard = edit mode
  const [editingCard, setEditingCard] = useState<Flashcard | 'new' | null>(null);

  const [isRenamingDeck, setIsRenamingDeck] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');

  const cardCounts = [5, 10, 15, 20, 30];
  const importInputRef = useRef<HTMLInputElement>(null);

  // ── Lokaler Stand (deckStore) ────────────────────────────────────────────
  const selfWrite = useRef(false);
  // Geöffnetes "⋯"-Menü einer Stapel-Zeile; schließt bei Klick daneben und Esc.
  const [menuDeckId, setMenuDeckId] = useState<string | null>(null);
  // Nach oben öffnen, wenn unter dem Knopf zu wenig Platz ist (unterster Stapel).
  const [menuOpensUp, setMenuOpensUp] = useState(false);
  useEffect(() => {
    if (!menuDeckId) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && (e.target as Element | null)?.closest('[role="menu"], [aria-haspopup="menu"]')) return;
      setMenuDeckId(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [menuDeckId]);

  const commitDecks = useCallback((next: FlashcardDeck[]) => {
    decksRef.current = next;
    setDecksState(next);
    selfWrite.current = true;
    writeLocalDecks(next);
    selfWrite.current = false;
  }, []);

  // Änderungen von außen (Tutor-Karte, Wissensnetz, anderer Tab) übernehmen.
  useEffect(() => subscribeLocalDecks(() => {
    if (selfWrite.current) return;
    const next = readLocalDecks();
    decksRef.current = next;
    setDecksState(next);
  }), []);

  // ── Cloud (gebündelt) ────────────────────────────────────────────────────
  const pendingCloud = useRef(new Map<string, FlashcardDeck>());
  const cloudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushCloud = useCallback(() => {
    if (cloudTimer.current) { clearTimeout(cloudTimer.current); cloudTimer.current = null; }
    const batch = [...pendingCloud.current.values()];
    pendingCloud.current.clear();
    if (!userId) return;
    batch.forEach(d => { saveDeckToSupabase(d, userId).catch(() => {}); });
  }, [userId]);
  const queueCloudSave = useCallback((deck: FlashcardDeck) => {
    if (!userId) return;
    pendingCloud.current.set(deck.id, deck);
    if (cloudTimer.current) clearTimeout(cloudTimer.current);
    cloudTimer.current = setTimeout(flushCloud, CLOUD_SAVE_DELAY_MS);
  }, [userId, flushCloud]);
  useEffect(() => {
    window.addEventListener('pagehide', flushCloud);
    return () => { window.removeEventListener('pagehide', flushCloud); flushCloud(); };
  }, [flushCloud]);

  // Cloud-Abgleich (services/deckCloudSync.ts). Läuft schon beim Login aus
  // App.tsx; hier ein zweiter Anstoß für den Fall, dass die Karteikarten
  // offen sind, während der Login gerade erst abgeschlossen wird. Gleichzeitige
  // Aufrufe teilen sich denselben Abgleich. Das Ergebnis kommt über
  // subscribeLocalDecks oben an.
  useEffect(() => {
    if (!userId) return;
    syncDecksWithCloud(userId).catch(() => { /* Offline oder Fehler → lokaler Stand bleibt */ });
  }, [userId]);

  // Auto-generate cards when navigated from Library source detail.
  // Ref-Sperre: React StrictMode (Dev) führt Mount-Effekte doppelt aus, das
  // erzeugte zwei identische Decks und zwei gezählte API-Calls.
  const autoGenStarted = useRef(false);
  useEffect(() => {
    if (!initialDoc || !getDocumentSource || autoGenStarted.current) return;
    autoGenStarted.current = true;
    try {
      const source = getDocumentSource(initialDoc);
      handleGenerateFromSource(source, documentDisplayName(initialDoc), initialDoc.id);
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Frisch erzeugtes Deck sichtbar machen: es landet unten in der Liste und
  // ging bei vielen Stapeln vorher kommentarlos unter.
  useEffect(() => {
    if (!freshDeckId) return;
    const el = document.getElementById(`deck-row-${freshDeckId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const timer = setTimeout(() => setFreshDeckId(null), 4000);
    return () => clearTimeout(timer);
  }, [freshDeckId]);

  // Bearbeitetes Deck existiert nicht mehr (z.B. in anderem Tab gelöscht):
  // Editor schließen. Vorher als setState direkt im Render.
  useEffect(() => {
    if (editingDeckId && !decks.some(d => d.id === editingDeckId)) setEditingDeckId(null);
  }, [editingDeckId, decks]);

  const saveDecks = (newDecks: FlashcardDeck[], changedDeck?: FlashcardDeck) => {
    commitDecks(newDecks);
    if (changedDeck) queueCloudSave(changedDeck);
  };

  const updateDeck = (deckId: string, update: (deck: FlashcardDeck) => FlashcardDeck) => {
    let changed: FlashcardDeck | undefined;
    const next = decksRef.current.map(d => {
      if (d.id !== deckId) return d;
      changed = update(d);
      return changed;
    });
    if (changed) saveDecks(next, changed);
  };

  // Ein Klick → Druckdialog: ausschneidbare A4-Bögen, Rückseiten gespiegelt
  // für beidseitigen Druck (Wenden an der langen Kante).
  const handlePrintDeck = (deck: FlashcardDeck) => {
    if (deck.cards.length === 0) { toast.error(t('fcs.printEmpty')); return; }
    const w = window.open('', '_blank');
    if (!w) { toast.error(t('fcs.printPopupBlocked')); return; }
    w.document.write(buildPrintHtml(deck.title, deck.cards, { hint: t('pd.hint'), print: t('pd.print') }));
    w.document.close();
  };

  const handleCreateEmptyDeck = (e: React.FormEvent) => {
    e.preventDefault();
    const title = manualDeckTitle.trim();
    if (!title) return;

    const newDeck: FlashcardDeck = { id: newId(), title, cards: [] };

    saveDecks([...decksRef.current, newDeck], newDeck);
    setManualDeckTitle('');
    setShowManualDeckDialog(false);
    setEditingDeckId(newDeck.id);
  };

  const handleSaveCard = (front: string, back: string, tags: string[] = [], images: CardImages = {}) => {
    if (!editingDeckId) return;

    if (editingCard === 'new') {
      const newCard: Flashcard = {
        id: newId(),
        front, back,
        ...(tags.length ? { tags } : {}),
        ...(images.frontImage ? { frontImage: images.frontImage } : {}),
        ...(images.backImage ? { backImage: images.backImage } : {}),
        level: 0,
        nextReview: Date.now(),
        lastInterval: 0,
        srs: createSrsState(),
      };
      updateDeck(editingDeckId, d => ({ ...d, cards: [newCard, ...d.cards] }));
    } else if (editingCard) {
      const cardId = editingCard.id;
      updateDeck(editingDeckId, d => ({ ...d, cards: d.cards.map(c => c.id === cardId ? { ...c, front, back, tags: tags.length ? tags : undefined, frontImage: images.frontImage, backImage: images.backImage } : c) }));
    }

    setEditingCard(null);
  };

  /** Eigene Kartenbilder löschen, die in keinem verbleibenden Stapel mehr vorkommen. */
  const cleanupCardImages = (cards: Flashcard[]) => {
    // Verdeckte Bilder teilen sich einen Pfad: erst löschen, wenn keine Karte ihn mehr nutzt.
    const used = new Set(decksRef.current.flatMap(d => d.cards.flatMap(cardImagePaths)));
    [...new Set(cards.flatMap(cardImagePaths))]
      .filter(p => !used.has(p) && isOwnImage(p, userId))
      .forEach(p => void deleteCardImage(p));
  };

  const handleDeleteCard = (deckId: string, cardId: string) => {
    const removed = decksRef.current.find(d => d.id === deckId)?.cards.filter(c => c.id === cardId) ?? [];
    updateDeck(deckId, d => ({ ...d, cards: d.cards.filter(c => c.id !== cardId) }));
    cleanupCardImages(removed);
  };

  const handleRenameDeck = (e: React.FormEvent, deckId: string) => {
    e.preventDefault();
    const title = renameTitle.trim();
    if (!title) return;
    updateDeck(deckId, d => ({ ...d, title }));
    setIsRenamingDeck(false);
  };

  // Gleich benannte Stapel zusammenführen (services/duplicateDecks.ts), mit Rückgängig.
  const duplicateGroups = useMemo(() => findDuplicateDeckGroups(decks), [decks]);
  const handleMergeDuplicates = (group: FlashcardDeck[]) => {
    const before = decksRef.current;
    const merged = mergeDuplicateDecks(group);
    const originalBase = group.find(d => d.id === merged.id)!;
    const removedIds = new Set(group.filter(d => d.id !== merged.id).map(d => d.id));
    removedIds.forEach(id => pendingCloud.current.delete(id));
    commitDecks(before.filter(d => !removedIds.has(d.id)).map(d => (d.id === merged.id ? merged : d)));
    queueCloudSave(merged);
    runUndoable({
      message: t('fcs.dupMerged', { title: merged.title, n: merged.cards.length }),
      undo: () => { commitDecks(before); queueCloudSave(originalBase); },
      commit: () => { if (userId) removedIds.forEach(id => deleteDeckFromSupabase(id, userId).catch(() => {})); },
    });
  };

  // Löschen mit "Rückgängig" statt Bestätigungsfrage (services/undoable.ts).
  const handleDeleteDeck = (deck: FlashcardDeck) => {
    const index = decksRef.current.findIndex(d => d.id === deck.id);
    // Ausstehenden Upload verwerfen, sonst legt der gebündelte Save das
    // gerade gelöschte Deck in der Cloud wieder an.
    pendingCloud.current.delete(deck.id);
    commitDecks(decksRef.current.filter(d => d.id !== deck.id));
    runUndoable({
      message: t('undo.deckDeleted', { title: deck.title }),
      undo: () => {
        if (decksRef.current.some(d => d.id === deck.id)) return;
        const next = [...decksRef.current];
        next.splice(Math.min(Math.max(index, 0), next.length), 0, deck);
        commitDecks(next);
      },
      commit: () => { if (userId) deleteDeckFromSupabase(deck.id, userId).catch(() => {}); cleanupCardImages(deck.cards); },
    });
  };

  const handleGenerateFromSource = async (source: GenerationSource, name: string, docId?: string) => {
    const requested = selectedCount;
    setIsGenerating(docId ?? name);
    try {
      const generated = await generateFlashcardsFromDocument(source, requested);
      if (generated.length === 0) { toast.error(t('fcs.noCardsGenerated')); return; }

      // Zusätzlich Abbildungs-Karten, wenn gewünscht und die Quelle ein PDF ist.
      const doc = docId ? availableDocuments.find(d => d.id === docId) : undefined;
      let figureCards: { front: string; back: string; frontImage?: string; backImage?: string }[] = [];
      if (withFigures && userId && canUseFigures(doc)) {
        try {
          figureCards = await buildFigureCards(doc!, userId, Math.max(2, Math.round(requested / 3)),
            (done, total) => setFigureProgress({ done, total }));
          if (figureCards.length === 0) toast.info(t('fcs.fig.none'));
        } catch {
          toast.info(t('fcs.fig.failed'));
        } finally {
          setFigureProgress(null);
        }
      }
      const newDeck: FlashcardDeck = {
        id: newId(),
        title: name.replace(/\.[^/.]+$/, ''),
        sourceDocumentId: docId,
        cards: generated.map(c => ({
          id: newId(),
          front: c.front || '',
          back: c.back || '',
          level: 0,
          nextReview: Date.now(),
          lastInterval: 0,
          srs: createSrsState(),
        })).concat(figureCards.map(c => ({
          id: newId(),
          front: c.front,
          back: c.back,
          ...(c.frontImage ? { frontImage: c.frontImage } : {}),
          ...(c.backImage ? { backImage: c.backImage } : {}),
          level: 0,
          nextReview: Date.now(),
          lastInterval: 0,
          srs: createSrsState(),
        })))
      };
      saveDecks([...decksRef.current, newDeck], newDeck);
      if (figureCards.length > 0) toast.success(tp('fcs.fig.added', figureCards.length));
      setFreshDeckId(newDeck.id);
      if (generated.length < requested) toast.info(t('fcs.deckCreatedPartial', { n: generated.length, total: requested }));
      else toast.success(tp('fcs.deckCreated', generated.length));
    } catch (e) {
      console.error(e);
      toast.error(t('fcs.genError'));
    } finally {
      setIsGenerating(null);
    }
  };

  const handleSelectDocument = async (doc: ProcessedDocument) => {
    const source = getDocumentSource
      ? getDocumentSource(doc)
      : doc.type === 'pdf'
        ? { file: { data: doc.content, mimeType: 'application/pdf' } }
        : { text: doc.content };
    handleGenerateFromSource(source, documentDisplayName(doc), doc.id);
  };

  const deckStats = useMemo(() => {
    const now = Date.now();
    return decks.map(deck => {
      const migratedCards = deck.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) });
      const dueCount = countDueCards(migratedCards);
      const dueCards = migratedCards.filter(c => isCardDue(c, now));
      const newCards = dueCards.filter(c => !c.srs?.lastReview).length;
      const learnCards = dueCards.filter(c => c.srs?.lastReview && c.srs.interval < 7).length;
      const reviewCards = dueCards.filter(c => c.srs?.lastReview && c.srs.interval >= 7).length;
      return { id: deck.id, newCards, learnCards, reviewCards, dueCount };
    });
  }, [decks]);

  const handleReview = (cardId: string, difficulty: 'again' | 'hard' | 'good' | 'easy') => {
    if (!activeDeckId) return;
    const quality = QUALITY_MAP[difficulty];
    let newLeech = false;
    let entry: ReviewEntry | null = null;
    const deckIdForLog = activeDeckId;

    updateDeck(activeDeckId, deck => ({
      ...deck,
      cards: deck.cards.map(card => {
        if (card.id !== cardId) return card;
        const currentSrs = card.srs ?? migrateLegacyCard(card);
        const nextSrs = reviewCard(currentSrs, quality);
        // Anki-Standard: ab 8 Lapses Problemkarte, nur markieren, nicht aussetzen.
        entry = makeEntry(card.id, deckIdForLog, ratingFor(difficulty), card.srs, nextSrs);
        const becomesLeech = !card.leech && (nextSrs.lapses ?? 0) >= LEECH_THRESHOLD;
        if (becomesLeech) newLeech = true;
        return {
          ...card,
          srs: nextSrs,
          level: nextSrs.repetitions,
          nextReview: nextSrs.nextReview,
          lastInterval: nextSrs.interval,
          ...(becomesLeech ? { leech: true, tags: parseTags([...(card.tags ?? []), t('leech.tag')].join(',')) } : {}),
        };
      }),
    }));
    if (newLeech) toast.info(t('leech.toast'));
    if (entry) logReview(entry);
    sessionReviewCount.current += 1;
    // >= statt ===: recordActivity ist pro Tag idempotent (streakService),
    // ein zweiter Anlauf am selben Tag darf den Streak also noch auslösen.
    if (sessionReviewCount.current >= 5) recordActivity(userId);
  };


  /** Letzte Bewertung zurücknehmen: Lernstand der Karte wie vor der Bewertung. */
  const handleUndoReview = (before: Flashcard) => {
    if (!activeDeckId) return;
    updateDeck(activeDeckId, deck => ({
      ...deck,
      cards: deck.cards.map(card => (card.id === before.id
        ? { ...card, srs: before.srs, level: before.level, nextReview: before.nextReview, lastInterval: before.lastInterval, leech: before.leech, tags: before.tags }
        : card)),
    }));
    sessionReviewCount.current = Math.max(0, sessionReviewCount.current - 1);
    void undoLastReview(before.id);
  };

  /** Karte aussetzen bzw. fortsetzen (in jedem Stapel, der sie enthält). */
  const setCardFlags = (cardId: string, patch: Partial<Pick<Flashcard, 'suspended' | 'buriedUntil'>>) => {
    const deck = decksRef.current.find(d => d.cards.some(c => c.id === cardId));
    if (!deck) return;
    updateDeck(deck.id, d => ({ ...d, cards: d.cards.map(c => (c.id === cardId ? { ...c, ...patch } : c)) }));
  };
  const handleSuspend = (cardId: string, suspended = true) => {
    setCardFlags(cardId, { suspended: suspended || undefined });
    toast.info(suspended ? t('susp.done') : t('susp.resumed'));
  };
  /** Anki: zurückgestellt bis zum nächsten Tag (lokale Mitternacht). */
  const handleBury = (cardId: string) => {
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    setCardFlags(cardId, { buriedUntil: midnight.getTime() });
    toast.info(t('bury.done'));
  };

  const handleExportAll = () => {
    // srs mit exportieren: sonst verliert "Alle sichern" trotz des Namens den
    // gesamten Lernfortschritt bei jedem Restore (Re-Import erzeugt sonst
    // immer einen frischen SRS-Zustand, siehe handleImport).
    const data = {
      exportedAt: new Date().toISOString(),
      decks: decksRef.current.map(deck => ({
        title: deck.title,
        cards: deck.cards.map(c => ({ front: c.front, back: c.back, srs: c.srs }))
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studearc_alle_decks_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        let skipped = 0;

        // srs übernehmen, wenn im Export vorhanden und plausibel (eigenes
        // Backup), sonst frischer Zustand. Karten ohne Text werden übersprungen:
        // vorher landeten sie als undefined und ließen die Kartensuche abstürzen.
        const toCards = (raw: unknown): Flashcard[] => (Array.isArray(raw) ? raw : []).flatMap((c: any) => {
          const front = typeof c?.front === 'string' ? c.front.trim() : '';
          const back = typeof c?.back === 'string' ? c.back.trim() : '';
          if (!front || (!back && !hasCloze(front))) { skipped++; return []; }
          const srs = isValidSrs(c.srs) ? c.srs : createSrsState();
          return [{
            id: newId(),
            front,
            back,
            level: srs.repetitions ?? 0,
            nextReview: srs.nextReview ?? Date.now(),
            lastInterval: srs.interval ?? 0,
            srs,
          }];
        });
        const toDeck = (d: any): FlashcardDeck => ({
          id: newId(),
          title: typeof d?.title === 'string' && d.title.trim() ? d.title.trim() : t('aim.importedDeck'),
          cards: toCards(d?.cards),
        });

        let imported: FlashcardDeck[];
        if (Array.isArray(json?.decks)) imported = json.decks.map(toDeck);        // Alle-sichern-Format
        else if (Array.isArray(json?.cards)) imported = [toDeck(json)];           // Einzelnes Deck
        else { toast.error(t('fcs.importInvalidFormat')); return; }
        imported = imported.filter(d => d.cards.length > 0);
        if (imported.length === 0) { toast.error(t('fcs.importInvalidFormat')); return; }

        commitDecks([...decksRef.current, ...imported]);
        if (userId) uploadAllDecksToSupabase(imported, userId).catch(() => {});
        toast.success(tp('fcs.decksImported', imported.length, { cards: imported.reduce((sum, d) => sum + d.cards.length, 0) }));
        if (skipped > 0) toast.info(tp('fcs.importSkipped', skipped));
      } catch {
        toast.error(t('fcs.importReadError'));
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };


  const handleAnkiImport = (cards: Flashcard[], targetDeckId: string | null, newDeckName?: string) => {
    if (targetDeckId) {
      updateDeck(targetDeckId, d => ({ ...d, cards: [...d.cards, ...cards] }));
      toast.success(tp('fcs.cardsAddedTo', cards.length, { deck: decksRef.current.find(d => d.id === targetDeckId)?.title ?? '' }));
    } else {
      const newDeck: FlashcardDeck = {
        id: newId(),
        title: newDeckName || t('aim.importedDeck'),
        cards,
      };
      saveDecks([...decksRef.current, newDeck], newDeck);
      setFreshDeckId(newDeck.id);
      toast.success(tp('fcs.cardsImportedInto', cards.length, { deck: newDeck.title }));
    }
  };

  // Streak-Aktivität auch im freien Üben gutschreiben — aber OHNE die SRS-Planung
  // anzufassen, damit man beliebig oft am Tag wiederholen kann.
  const handlePracticed = () => {
    sessionReviewCount.current += 1;
    if (sessionReviewCount.current >= 5) recordActivity(userId);
  };

  // Lernrunden-Kontext: bei großen Decks (> SESSION_BATCH_SIZE) wird pro
  // Runde kuratiert gespielt (Schwäche zuerst, Neu-Karten begrenzt, Rest
  // wartet) — selbes Prinzip wie die Themenwahl beim Recall (recallGaps.ts).
  const [sessionMode, setSessionMode] = useState<'due' | 'all' | 'free'>('due');
  const [moreWaiting, setMoreWaiting] = useState(0);

  const closeSession = () => {
    setActiveDeckId(null);
    setSessionCards([]);
    setIsPracticeSession(false);
    setMoreWaiting(0);
    flushCloud(); // Runde vorbei: Fortschritt sofort sichern statt auf den Timer zu warten
  };

  /** true = Session gestartet, false = nichts zu lernen (Toast ging raus). */
  const handleOpenDeck = (deckId: string, mode: 'due' | 'all' | 'free' = 'due', ignoreLimits = false): boolean => {
    const deck = decksRef.current.find(d => d.id === deckId);
    if (!deck) return false;
    // Explizite Annotation: die map-returnte Union (Flashcard | Spread mit
    // srs) ist zu Flashcard[] zuweisbar, und die Typ-Inferenz der
    // Session-Batch-Funktion bleibt sauber auf Flashcard statt Constraint.
    const nowTs = Date.now();
    const migratedCards: Flashcard[] = deck.cards
      .filter(c => !c.suspended && !(mode !== 'free' && c.buriedUntil && c.buriedUntil > nowTs))
      .map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) });

    let cardsToLearn: Flashcard[];
    let remaining = 0;
    if (mode === 'free') {
      // Frei lernen: ALLE Karten, zufällig gemischt, SRS bleibt unberührt.
      if (migratedCards.length === 0) { toast.error(t('fcs.noCardsInDeck')); return false; }
      const shuffled = [...migratedCards];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      // Auch im freien Üben in Runden teilen — 60+ Karten am Stück sind
      // motivativ eine Wand, egal ob mit oder ohne SRS.
      cardsToLearn = shuffled.slice(0, SESSION_BATCH_SIZE);
      remaining = shuffled.length - cardsToLearn.length;
    } else if (mode === 'all') {
      const sorted = [...migratedCards].sort((a, b) => (a.srs?.nextReview ?? 0) - (b.srs?.nextReview ?? 0));
      if (sorted.length === 0) { toast.error(t('fcs.noCardsInDeck')); return false; }
      cardsToLearn = sorted.slice(0, SESSION_BATCH_SIZE);
      remaining = sorted.length - cardsToLearn.length;
    } else {
      // Tageslimits (services/cardLimits.ts) über alle Stapel; "Heute trotzdem lernen" hebt sie auf.
      const left = ignoreLimits ? undefined : remainingToday(decksRef.current);
      const batch = buildSessionBatch(migratedCards, SESSION_BATCH_SIZE, left);
      if (batch.cards.length === 0) {
        if (batch.heldBack > 0) {
          toast.withAction(tp('limit.reached', batch.heldBack), {
            label: t('limit.learnAnyway'),
            onClick: () => { handleOpenDeck(deckId, mode, true); },
          }, 10000);
        } else {
          toast.success(t('fcs.deckDoneToday'));
        }
        return false;
      }
      cardsToLearn = batch.cards;
      // Zurückgehaltene Karten sind heute nicht mehr dran, also nicht "weitere Runde".
      remaining = batch.remainingAfter - batch.heldBack;
      if (batch.heldBack > 0) toast.info(tp('limit.partial', batch.heldBack));
    }

    sessionReviewCount.current = 0;
    setIsPracticeSession(mode === 'free');
    setSessionMode(mode);
    setMoreWaiting(remaining);
    setSessionCards(cardsToLearn);
    setActiveDeckId(deckId);
    return true;
  };

  /** Nur die Karten mit einem Schlagwort lernen (normale Wiederholungsplanung, fällige zuerst). */
  const startTagSession = (deckId: string, tag: string) => {
    const deck = decksRef.current.find(d => d.id === deckId);
    if (!deck) return;
    const cards: Flashcard[] = deck.cards
      .filter(c => hasTag(c, tag) && !c.suspended)
      .map(c => (c.srs ? c : { ...c, srs: migrateLegacyCard(c) }))
      .sort((a, b) => (a.srs?.nextReview ?? 0) - (b.srs?.nextReview ?? 0));
    if (!cards.length) return;
    sessionReviewCount.current = 0;
    setIsPracticeSession(false);
    setSessionMode('all');
    setMoreWaiting(0);
    setSessionCards(cards.slice(0, SESSION_BATCH_SIZE));
    setActiveDeckId(deckId);
  };

  if (activeDeckId) {
    return (
      <FlashcardPlayer
        key={`fc-session-${sessionCards.length}-${sessionCards[0]?.id ?? 'x'}`}
        cards={sessionCards}
        practiceMode={isPracticeSession}
        onReview={handleReview}
        onUndo={handleUndoReview}
        onSuspend={id => handleSuspend(id, true)}
        onBury={handleBury}
        onPracticed={handlePracticed}
        moreWaiting={moreWaiting}
        onContinue={moreWaiting > 0 ? () => {
          // Nächste Runde aus demselben Deck im selben Modus — Bewertungen der
          // gerade beendeten Runde sind längst in `decks` gespeichert, damit
          // wählt buildSessionBatch sauber die nächsten Karten. Kann leer
          // ausgehen (Rest doch noch geschafft): dann Session sauber schließen.
          const started = handleOpenDeck(activeDeckId, sessionMode);
          if (!started) closeSession();
        } : undefined}
        onClose={closeSession}
      />
    );
  }

  // Edit Mode View
  if (editingDeckId) {
    const deck = decks.find(d => d.id === editingDeckId);
    if (!deck) return null; // Effekt oben schließt den Editor

    const query = cardSearch.trim().toLowerCase();
    const deckTags = collectTags(deck.cards);
    const activeTag = tagFilter && deckTags.some(x => x.tag.toLowerCase() === tagFilter.toLowerCase()) ? tagFilter : null;
    const filtered = deck.cards.filter(c =>
      (!query || c.front.toLowerCase().includes(query) || c.back.toLowerCase().includes(query)
        || (c.tags ?? []).some(x => x.toLowerCase().includes(query)))
      && (!activeTag || hasTag(c, activeTag)));

    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-right-12 duration-700 py-6 lg:py-10">

        {showOcclusion && userId && (
          <OcclusionEditorModal
            userId={userId}
            onClose={() => setShowOcclusion(false)}
            onCreate={({ image, masks, mode, header, back }) => {
              const created = buildOcclusionCards(image, masks, mode, header, back, newId)
                .map(c => ({ ...c, srs: createSrsState() }));
              updateDeck(deck.id, d => ({ ...d, cards: [...created, ...d.cards] }));
              toast.success(tp('occ.created', created.length));
            }}
          />
        )}

        {/* Edit Card Modal */}
        {editingCard !== null && (
          <EditCardModal
            card={editingCard === 'new' ? undefined : editingCard}
            cardIndex={editingCard === 'new' ? undefined : deck.cards.findIndex(c => c.id === (editingCard as Flashcard).id)}
            totalCards={deck.cards.length}
            knownTags={deckTags.map(x => x.tag)}
            userId={userId}
            onSave={handleSaveCard}
            onToggleSuspend={editingCard !== 'new' ? () => {
              const c = editingCard as Flashcard;
              handleSuspend(c.id, !c.suspended);
              setEditingCard(null);
            } : undefined}
            onDelete={editingCard !== 'new' ? () => {
              handleDeleteCard(deck.id, (editingCard as Flashcard).id);
              setEditingCard(null);
            } : undefined}
            onClose={() => setEditingCard(null)}
          />
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-start px-4 gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            {isRenamingDeck ? (
              <form onSubmit={e => handleRenameDeck(e, deck.id)} className="flex gap-2 items-center animate-in zoom-in-95 duration-200">
                <input
                  autoFocus
                  value={renameTitle}
                  onChange={e => setRenameTitle(e.target.value)}
                  aria-label={t('fcs.renameDeck')}
                  className="flex-1 min-w-0 text-2xl font-black bg-transparent border-b-2 border-indigo-500 outline-none dark:text-white pb-1"
                  onKeyDown={e => e.key === 'Escape' && setIsRenamingDeck(false)}
                />
                <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[13px] font-semibold shrink-0">
                  {t('common.save')}
                </button>
                <button type="button" onClick={() => setIsRenamingDeck(false)} aria-label={t('common.close')} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl text-[13px] font-semibold shrink-0">
                  ✕
                </button>
              </form>
            ) : (
              <div className="flex items-start gap-3">
                <h2 className="min-w-0 flex-1 text-2xl sm:text-3xl font-black dark:text-white break-words" style={{ textWrap: 'balance' as any }}>{deck.title}</h2>
                <button
                  onClick={() => { setRenameTitle(deck.title); setIsRenamingDeck(true); }}
                  className="p-2 rounded-xl text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all shrink-0"
                  title={t('fcs.renameDeck')}
                  aria-label={t('fcs.renameDeck')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            )}
            <p className="text-xs font-semibold text-slate-400">{tp('fcs.cardsInDeck', deck.cards.length)}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {userId && (
              <button
                onClick={() => setShowOcclusion(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:opacity-80 transition-all"
              >
                <SquareDashed className="w-3.5 h-3.5" aria-hidden="true" />
                {t('occ.title')}
              </button>
            )}
            <button
              onClick={() => setEditingCard('new')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold shadow-sm hover:scale-[1.02] transition-all"
              style={{ background: 'var(--primary)', color: 'var(--primary-text, #fff)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {t('fcs.newCard')}
            </button>
            <button
              onClick={() => { setEditingDeckId(null); setIsRenamingDeck(false); setEditingCard(null); setCardSearch(''); }}
              className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl text-[13px] font-semibold hover:text-indigo-600 transition-colors"
            >
              {t('fcs.done')}
            </button>
          </div>
        </div>

        {/* Search + Card list */}
        <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-3d-raised overflow-hidden">
          {deck.cards.length > 0 && (
            <div className="px-6 py-4 border-b border-slate-50 dark:border-slate-800">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  value={cardSearch}
                  onChange={e => setCardSearch(e.target.value)}
                  placeholder={t('fcs.searchCards', { n: deck.cards.length })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm outline-none border-2 border-transparent focus:border-indigo-400 dark:text-white transition-colors"
                />
                {cardSearch && (
                  <button onClick={() => setCardSearch('')} aria-label={t('common.close')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {deckTags.length > 0 && (
            <div className="px-6 py-3 border-b border-slate-50 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mr-1">{t('tags.label')}</span>
              {deckTags.map(({ tag, count }) => {
                const on = activeTag?.toLowerCase() === tag.toLowerCase();
                return (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(on ? null : tag)}
                    aria-pressed={on}
                    className="px-2.5 py-1 rounded-full text-[12px] font-semibold transition-colors"
                    style={on
                      ? { background: 'var(--primary)', color: 'var(--primary-text)' }
                      : { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary-ink)' }}
                  >
                    #{tag} <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
              {activeTag && (
                <button
                  onClick={() => startTagSession(deck.id, activeTag)}
                  className="ml-auto px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all hover:scale-[1.02]"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                >
                  {tp('tags.learnN', filtered.length)}
                </button>
              )}
            </div>
          )}

          {deck.cards.length === 0 ? (
            <div className="py-20 text-center space-y-4 opacity-30 px-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">{t('fcs.noCards')}</p>
              <p className="text-xs">{t('fcs.noCardsHint')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center opacity-40 text-sm">{t('fcs.noCardsForSearch', { q: cardSearch })}</div>
          ) : (
            <>
              {(query || activeTag) && (
                <p className="px-6 pt-3 text-xs font-semibold text-slate-400">
                  {t('fcs.filteredOf', { n: filtered.length, total: deck.cards.length })}
                </p>
              )}
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {filtered.map(card => (
                  <button
                    type="button"
                    key={card.id}
                    className="w-full text-left flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
                    onClick={() => setEditingCard(card)}
                  >
                    {/* Nummer = Position im Deck, auch bei aktiver Suche (vorher Position im Suchergebnis) */}
                    <span className="text-[11px] font-semibold text-slate-300 dark:text-slate-600 w-6 shrink-0 text-right">{deck.cards.indexOf(card) + 1}</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-w-0">
                      <p className="text-sm font-bold dark:text-white md:border-r md:border-slate-100 md:dark:border-slate-800 md:pr-4 leading-snug break-words whitespace-pre-line line-clamp-4">{hasCloze(card.front) ? <ClozeText text={card.front} revealed /> : card.front}</p>
                      <p className="text-sm text-slate-400 dark:text-slate-500 leading-snug break-words whitespace-pre-line line-clamp-4">{card.back}</p>
                      {card.occlusion && (
                        <div className="md:col-span-2 flex items-center gap-2">
                          <CardImage path={card.occlusion.image} alt="" className="h-12 w-16 object-cover rounded-md" />
                          <span className="text-xs text-slate-500 dark:text-slate-400">{t('occ.cardLabel', { i: card.occlusion.index + 1, n: card.occlusion.masks.length })}</span>
                        </div>
                      )}
                      {(card.frontImage || card.backImage) && (
                        <div className="md:col-span-2 flex gap-2">
                          {[card.frontImage, card.backImage].filter(Boolean).map(p => (
                            <CardImage key={p} path={p} alt="" className="h-12 w-16 object-cover rounded-md" />
                          ))}
                        </div>
                      )}
                      {(card.suspended || card.leech) && (
                        <div className="md:col-span-2 flex flex-wrap gap-1">
                          {card.suspended && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{t('susp.badge')}</span>}
                          {card.leech && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300">{t('leech.badge')}</span>}
                        </div>
                      )}
                      {card.tags && card.tags.length > 0 && (
                        <div className="md:col-span-2 flex flex-wrap gap-1">
                          {card.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary-ink)' }}>#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 p-2 rounded-xl text-slate-200 dark:text-slate-700 group-hover:text-indigo-500 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/30 transition-all">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 lg:space-y-16 animate-in fade-in duration-700 py-6 lg:py-10 px-2 sm:px-4">
      {showModuleDeck && (
        <ModuleDeckModal
          collections={collections}
          documents={availableDocuments}
          examTerms={examTerms}
          initialCollectionId={activeModuleId}
          onCreate={deck => {
            // Gleichnamigen Stapel nicht überschreiben: Titel eindeutig machen.
            const title = decksRef.current.some(d => d.title === deck.title) ? `${deck.title} · ${t('mod.allDocs')}` : deck.title;
            const created = { ...deck, title };
            saveDecks([...decksRef.current, created], created);
            setFreshDeckId(created.id);
          }}
          onSetNewPerDay={n => updateLimits({ ...limits, newPerDay: n })}
          onClose={() => setShowModuleDeck(false)}
        />
      )}
      {showAnkiImport && (
        <AnkiImportModal
          decks={decks}
          onClose={() => setShowAnkiImport(false)}
          onImport={handleAnkiImport}
          userId={userId}
        />
      )}
      {exportingDeck && (
        <ExportDeckModal
          deck={exportingDeck}
          userId={userId}
          userName={userName}
          onClose={() => setExportingDeck(null)}
        />
      )}
      {statsDeck && (
        <DeckStatsModal
          deck={statsDeck}
          onClose={() => setStatsDeck(null)}
        />
      )}
      <div className="px-4">
        <PageHeader eyebrow={t('nav.cards')} title={t('page.cards.title')} subtitle={t('fcs.subtitle')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">

        <div className="lg:col-span-5 space-y-6 lg:space-y-8 order-2 lg:order-1">
          <div className="bg-white dark:bg-slate-900 rounded-[24px] lg:rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-3d-raised p-5 lg:p-7 space-y-8">

            <div className="space-y-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-indigo-600">{t('fcs.manualDeck')}</h3>
              {!showManualDeckDialog ? (
                <button
                  onClick={() => setShowManualDeckDialog(true)}
                  className="w-full p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-2xl font-semibold text-[13px] border-2 border-dashed border-indigo-200 hover:border-indigo-500 transition-all"
                >
                  {t('fcs.createEmptyDeck')}
                </button>
              ) : (
                <form onSubmit={handleCreateEmptyDeck} className="space-y-3 animate-in zoom-in-95 duration-200">
                  <input
                    autoFocus
                    placeholder={t('fcs.newDeckPlaceholder')}
                    value={manualDeckTitle}
                    onChange={e => setManualDeckTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setShowManualDeckDialog(false); }}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold outline-none border-2 border-indigo-500 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={!manualDeckTitle.trim()} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-[13px] font-semibold disabled:opacity-40">{t('fcs.create')}</button>
                    <button type="button" onClick={() => setShowManualDeckDialog(false)} aria-label={t('common.close')} className="px-4 bg-slate-100 dark:bg-slate-800 text-slate-400 py-3 rounded-xl text-[13px] font-semibold">✕</button>
                  </div>
                </form>
              )}
            </div>

            <div className="space-y-6 pt-4 border-t border-slate-50 dark:border-slate-800">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-indigo-600">{t('fcs.cardGenerator')}</h3>
              {collections.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowModuleDeck(true)}
                  className="w-full text-left px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-slate-400 transition-colors"
                >
                  <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">{t('mod.title')}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{t('mod.entryHint')}</span>
                </button>
              )}

              <div className="space-y-4">
                <div className="flex justify-between items-center text-[11px] font-semibold uppercase text-slate-400 tracking-[0.08em] px-2">
                  <span>{t('fcs.cardCount')}</span>
                  <span>{selectedCount}</span>
                </div>
                <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl lg:rounded-2xl shadow-inner border border-slate-100 dark:border-slate-700">
                  {cardCounts.map(count => (
                    <button
                      key={count}
                      onClick={() => setSelectedCount(count)}
                      aria-pressed={selectedCount === count}
                      className={`flex-1 py-2 rounded-lg lg:rounded-xl text-[13px] font-semibold tabular-nums transition-all ${selectedCount === count ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={withFigures}
                  onClick={toggleFigures}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200">{t('fcs.fig.toggle')}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{t('fcs.fig.hint')}</span>
                  </span>
                  <span className="w-10 h-6 rounded-full p-0.5 shrink-0 transition-all" style={{ background: withFigures ? 'var(--primary)' : 'var(--border-color)' }}>
                    <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${withFigures ? 'translate-x-4' : ''}`} />
                  </span>
                </button>
              </div>

              {isGenerating ? (
                <div className="py-8 flex flex-col items-center gap-3 text-center">
                  <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                  <p className="text-xs font-semibold text-indigo-600 animate-pulse">
                    {figureProgress
                      ? t('fcs.fig.progress', { done: figureProgress.done, total: figureProgress.total })
                      : t('fcs.cardsForming')}
                  </p>
                </div>
              ) : (
                <SourceSelector
                  documents={moduleDocuments}
                  collections={collections}
                  onSelectDocument={handleSelectDocument}
                  onSelectSource={(source, name) => handleGenerateFromSource(source, name)}
                  onSaveToLibrary={onSaveToLibrary}
                  isLoading={isGenerating !== null}
                />
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-[24px] lg:rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-3d-deep order-1 lg:order-2">
          <div className="p-5 sm:p-6 lg:p-10 border-b border-slate-50 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 lg:gap-0">
            <div className="flex flex-col items-center sm:items-start gap-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('fcs.yourDecks', { n: decks.length })}</h3>
              <button
                type="button"
                onClick={() => setShowLimits(v => !v)}
                aria-expanded={showLimits}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                {t('limit.summary', {
                  n: limitUsage.newToday, max: limits.newPerDay >= UNLIMITED ? '∞' : limits.newPerDay,
                  r: limitUsage.reviewsToday, rmax: limits.reviewsPerDay >= UNLIMITED ? '∞' : limits.reviewsPerDay,
                })}
              </button>
            </div>
            <div className="flex gap-3 sm:gap-4 items-center flex-wrap justify-center sm:justify-end">
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
              />
              <button
                onClick={() => setShowAnkiImport(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-xl text-[13px] font-semibold transition-colors"
                title={t('fcs.importCards')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {t('fcs.import')}
              </button>
              {decks.length > 0 && (
                <button
                  onClick={handleExportAll}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-xl text-[13px] font-semibold transition-colors"
                  title={t('fcs.exportAll')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {t('fcs.backupAll')}
                </button>
              )}
            </div>
          </div>

          {showLimits && (
            <div className="px-5 sm:px-6 lg:px-10 pt-5">
              <div className="flex flex-wrap items-end gap-4 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('limit.newPerDay')}
                  <select value={limits.newPerDay} onChange={e => updateLimits({ ...limits, newPerDay: Number(e.target.value) })}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 text-[13px] font-semibold text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                    {NEW_LIMIT_OPTIONS.map(o => <option key={o} value={o}>{o >= UNLIMITED ? t('limit.unlimited') : o}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('limit.reviewsPerDay')}
                  <select value={limits.reviewsPerDay} onChange={e => updateLimits({ ...limits, reviewsPerDay: Number(e.target.value) })}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 text-[13px] font-semibold text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                    {REVIEW_LIMIT_OPTIONS.map(o => <option key={o} value={o}>{o >= UNLIMITED ? t('limit.unlimited') : o}</option>)}
                  </select>
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex-1 min-w-[200px]">{t('limit.hint')}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-4 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('fsrs.retention')}
                  <select value={fsrsParams.retention ?? 0.9} onChange={e => updateFsrs({ ...fsrsParams, retention: Number(e.target.value) })}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 text-[13px] font-semibold text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                    {RETENTION_OPTIONS.map(r => <option key={r} value={r}>{Math.round(r * 100)} %</option>)}
                  </select>
                </label>
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={runPersonalize} disabled={fsrsBusy}
                    className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50">
                    {fsrsBusy ? t('fsrs.busy') : t('fsrs.personalize')}
                  </button>
                  {fsrsParams.initialStability && (
                    <button type="button" onClick={() => updateFsrs({ retention: fsrsParams.retention })} className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-left">
                      {t('fsrs.reset')}
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex-1 min-w-[220px]">
                  {fsrsMsg ?? (fsrsParams.initialStability
                    ? t('fsrs.active', { a: fsrsParams.initialStability[0], h: fsrsParams.initialStability[1], g: fsrsParams.initialStability[2], e: fsrsParams.initialStability[3] })
                    : t('fsrs.hint'))}
                </p>
              </div>
            </div>
          )}

          {duplicateGroups.length > 0 && (
            <div className="px-5 sm:px-6 lg:px-10 pt-5 space-y-2">
              {duplicateGroups.map(group => (
                <div
                  key={group[0].id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}
                >
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[13px] font-bold dark:text-white">{t('fcs.dupFound', { n: group.length, title: group[0].title })}</p>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('fcs.dupHint')}</p>
                  </div>
                  <button
                    onClick={() => handleMergeDuplicates(group)}
                    className="px-4 py-2 rounded-xl text-[12px] font-bold transition-opacity hover:opacity-90"
                    style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                  >
                    {t('fcs.dupMerge')}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {decks.length === 0 ? (
              <div className="py-20 lg:py-32 text-center space-y-4 lg:space-y-6 opacity-30 px-6">
                <EmojiImage emoji="🗃️" size={64} className="mx-auto" />
                <p className="text-xs lg:text-sm font-semibold">{t('fcs.noDecks')}</p>
                <p className="text-xs">{t('fcs.noDecksHint')}</p>
              </div>
            ) : (
              decks.map(deck => {
                const stats = deckStats.find(s => s.id === deck.id);
                const isFresh = deck.id === freshDeckId;
                return (
                  <div
                    key={deck.id}
                    id={`deck-row-${deck.id}`}
                    className={`flex flex-col sm:flex-row items-center justify-between p-6 lg:p-8 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all group gap-6 last:rounded-b-[30px] lg:last:rounded-b-[40px] ${isFresh ? 'bg-indigo-50/70 dark:bg-indigo-950/30' : ''}`}
                    style={isFresh ? { boxShadow: 'inset 4px 0 0 var(--primary)' } : undefined}
                  >
                    <div className="flex-grow min-w-0 text-center sm:text-left">
                      <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                        <h4 className="text-base lg:text-lg font-black text-slate-900 dark:text-white break-words group-hover:text-indigo-600 transition-colors cursor-pointer" style={{ textWrap: 'balance' as any }} onClick={() => handleOpenDeck(deck.id)}>
                          {deck.title}
                        </h4>
                        {!deck.sourceDocumentId && <span className="bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold uppercase px-2 py-0.5 rounded text-slate-400 tracking-tighter">{t('fcs.manual')}</span>}
                      </div>
                      {/* Zahlen mit Beschriftung statt drei farbiger Ziffern ohne Legende
                          (Audit 23.09.2026). */}
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 justify-center sm:justify-start">
                        <span>{t('fcs.totalCards', { n: deck.cards.length })}</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />{t('fcs.countNew', { n: stats?.newCards || 0 })}</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" aria-hidden="true" />{t('fcs.countLearn', { n: stats?.learnCards || 0 })}</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />{t('fcs.countDue', { n: stats?.reviewCards || 0 })}</span>
                      </p>
                    </div>

                    {/* Zwei Hauptaktionen sichtbar, alles Weitere im Menü: vorher neun
                        Knöpfe je Stapel, auf dem Handy zwei volle Zeilen. */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
                      <button
                        onClick={() => handleOpenDeck(deck.id)}
                        className="flex-1 sm:flex-none px-6 py-3 rounded-2xl text-[13px] font-semibold transition-all hover:scale-[1.02]"
                        style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                      >
                        {t('fcs.learn')}
                      </button>
                      <button
                        onClick={() => handleOpenDeck(deck.id, 'free')}
                        className="flex-1 sm:flex-none px-5 py-3 rounded-2xl text-[13px] font-semibold border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-all hover:border-[color:var(--primary)]"
                        title={t('fcs.practiceTitle')}
                      >
                        {t('fcs.practice')}
                      </button>
                      <div className="relative">
                        <button
                          onClick={e => {
                            const below = window.innerHeight - e.currentTarget.getBoundingClientRect().bottom;
                            setMenuOpensUp(below < 360);
                            setMenuDeckId(id => (id === deck.id ? null : deck.id));
                          }}
                          aria-label={t('fcs.moreActions')}
                          aria-haspopup="menu"
                          aria-expanded={menuDeckId === deck.id}
                          title={t('fcs.moreActions')}
                          className="w-11 h-11 flex items-center justify-center rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 transition-all hover:border-[color:var(--primary)]"
                        >
                          <MoreHorizontal className="w-5 h-5" strokeWidth={2} />
                        </button>
                        {menuDeckId === deck.id && (
                          <div
                            role="menu"
                            className={`absolute right-0 z-30 w-60 rounded-2xl p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${menuOpensUp ? 'bottom-full mb-2' : 'top-full mt-2'}`}
                            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
                          >
                            {([
                              { key: 'all', label: t('fcs.menuLearnAll'), icon: ListOrdered, onClick: () => handleOpenDeck(deck.id, 'all') },
                              { key: 'quiz', label: t('fcs.menuQuiz'), icon: HelpCircle, onClick: () => onGenerateQuizFromDeck(deck), disabled: isQuizLoading || deck.cards.length === 0 },
                              { key: 'stats', label: t('fcs.statsTitle'), icon: BarChart2, onClick: () => setStatsDeck(deck) },
                              { key: 'edit', label: t('fcs.editTitle'), icon: Pencil, onClick: () => setEditingDeckId(deck.id) },
                              { key: 'share', label: t('fcs.exportShareTitle'), icon: Share2, onClick: () => setExportingDeck(deck) },
                              { key: 'print', label: t('fcs.printTitle'), icon: Printer, onClick: () => handlePrintDeck(deck) },
                              { key: 'delete', label: t('fcs.deleteDeck'), icon: Trash2, onClick: () => handleDeleteDeck(deck), danger: true },
                            ] as const).map(item => (
                              <button
                                key={item.key}
                                role="menuitem"
                                disabled={'disabled' in item ? item.disabled : false}
                                onClick={() => { setMenuDeckId(null); item.onClick(); }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-left transition-colors disabled:opacity-40 ${'danger' in item ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                              >
                                <item.icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                                {item.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {decks.length > 0 && <div className="px-0 sm:px-0"><ReviewStatsPanel decks={decks} /></div>}
    </div>
  );
};
