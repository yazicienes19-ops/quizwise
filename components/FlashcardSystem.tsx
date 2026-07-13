
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FlashcardDeck, Flashcard, ProcessedDocument, Collection } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { EmojiImage } from './EmojiImage';
import { generateFlashcardsFromDocument } from '../services/geminiService';
import { toast } from '../services/toast';
import { FlashcardPlayer } from './FlashcardPlayer';
import { SourceSelector } from './SourceSelector';
import { loadDecksFromSupabase, saveDeckToSupabase, deleteDeckFromSupabase, uploadAllDecksToSupabase } from '../services/flashcardService';
import { mergeDecks } from '../services/deckMerge';
import { documentDisplayName } from '../services/libraryService';
import { getDueCards, createSrsState, migrateLegacyCard, countDueCards, QUALITY_MAP, reviewCard } from '../services/spacedRepetition';
import { recordActivity } from '../services/streakService';
import { AnkiImportModal } from './AnkiImportModal';
import { ExportDeckModal } from './ExportDeckModal';
import { EditCardModal } from './EditCardModal';
import { DeckStatsModal } from './DeckStatsModal';

interface FlashcardSystemProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  onDeleteDoc: (id: string) => void;
  onSaveToLibrary?: (file: File) => void;
  onGenerateQuizFromDeck: (deck: FlashcardDeck) => void;
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  isQuizLoading?: boolean;
  initialDoc?: ProcessedDocument;
  userId?: string;
}

export const FlashcardSystem: React.FC<FlashcardSystemProps> = ({
  availableDocuments,
  collections,
  onDeleteDoc,
  onSaveToLibrary,
  onGenerateQuizFromDeck,
  getDocumentSource,
  isQuizLoading = false,
  initialDoc,
  userId,
}) => {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [sessionCards, setSessionCards] = useState<Flashcard[]>([]);
  const [isPracticeSession, setIsPracticeSession] = useState(false);
  const sessionReviewCount = React.useRef(0);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState<number>(15);
  
  // States for manual deck creation
  const [showManualDeckDialog, setShowManualDeckDialog] = useState(false);
  const [showAnkiImport, setShowAnkiImport] = useState(false);
  const [exportingDeck, setExportingDeck] = useState<FlashcardDeck | null>(null);
  const [statsDeck, setStatsDeck] = useState<FlashcardDeck | null>(null);
  const [cardSearch, setCardSearch] = useState('');
  const [manualDeckTitle, setManualDeckTitle] = useState('');

  // null = closed, 'new' = add mode, Flashcard = edit mode
  const [editingCard, setEditingCard] = useState<Flashcard | 'new' | null>(null);

  const [isRenamingDeck, setIsRenamingDeck] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');

  const cardCounts = [5, 10, 15, 20, 30];
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadDecks = async () => {
      if (userId) {
        try {
          const cloudDecks = await loadDecksFromSupabase(userId);
          if (cloudDecks.length > 0) {
            // Cloud NICHT blind übernehmen — mit lokalem Stand pro Karte mergen,
            // sonst geht Offline-Lernfortschritt dieses Geräts verloren.
            let localDecks: FlashcardDeck[] = [];
            try { localDecks = JSON.parse(localStorage.getItem('flashcard_decks') || '[]'); } catch {}
            const merged = mergeDecks(localDecks, cloudDecks);
            setDecks(merged);
            localStorage.setItem('flashcard_decks', JSON.stringify(merged));
            return;
          }
          // Keine Cloud-Decks: localStorage-Daten hochladen (Migration)
          const local = localStorage.getItem('flashcard_decks');
          if (local) {
            const localDecks: FlashcardDeck[] = JSON.parse(local);
            if (localDecks.length > 0) {
              await uploadAllDecksToSupabase(localDecks, userId);
              setDecks(localDecks);
              return;
            }
          }
        } catch {
          // Offline oder Fehler → localStorage-Fallback
          const saved = localStorage.getItem('flashcard_decks');
          if (saved) try { setDecks(JSON.parse(saved)); } catch {}
        }
      } else {
        const saved = localStorage.getItem('flashcard_decks');
        if (saved) try { setDecks(JSON.parse(saved)); } catch {}
      }
    };
    loadDecks();
  }, [userId]);

  // Auto-generate cards when navigated from Library source detail
  useEffect(() => {
    if (!initialDoc || !getDocumentSource) return;
    try {
      const source = getDocumentSource(initialDoc);
      handleGenerateFromSource(source, documentDisplayName(initialDoc), initialDoc.id);
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveDecks = (newDecks: FlashcardDeck[], changedDeck?: FlashcardDeck) => {
    setDecks(newDecks);
    localStorage.setItem('flashcard_decks', JSON.stringify(newDecks));
    if (userId && changedDeck) {
      saveDeckToSupabase(changedDeck, userId).catch(() => {});
    }
  };

  const handleCreateEmptyDeck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDeckTitle.trim()) return;
    
    const newDeck: FlashcardDeck = {
      id: Math.random().toString(36).substr(2, 9),
      title: manualDeckTitle,
      cards: []
    };
    
    saveDecks([...decks, newDeck], newDeck);
    setManualDeckTitle('');
    setShowManualDeckDialog(false);
    setEditingDeckId(newDeck.id);
  };

  const handleSaveCard = (front: string, back: string) => {
    if (!editingDeckId) return;

    if (editingCard === 'new') {
      const newCard: Flashcard = {
        id: Math.random().toString(36).substr(2, 9),
        front, back,
        level: 0,
        nextReview: Date.now(),
        lastInterval: 0,
        srs: createSrsState(),
      };
      const updatedDecks = decks.map(d =>
        d.id === editingDeckId ? { ...d, cards: [newCard, ...d.cards] } : d
      );
      const changed = updatedDecks.find(d => d.id === editingDeckId);
      saveDecks(updatedDecks, changed);
    } else if (editingCard) {
      const updatedDecks = decks.map(d =>
        d.id === editingDeckId
          ? { ...d, cards: d.cards.map(c => c.id === (editingCard as Flashcard).id ? { ...c, front, back } : c) }
          : d
      );
      const changed = updatedDecks.find(d => d.id === editingDeckId);
      saveDecks(updatedDecks, changed);
    }

    setEditingCard(null);
  };

  const handleDeleteCard = (deckId: string, cardId: string) => {
    const updated = decks.map(d =>
      d.id === deckId ? { ...d, cards: d.cards.filter(c => c.id !== cardId) } : d
    );
    const changed = updated.find(d => d.id === deckId);
    saveDecks(updated, changed);
  };


  const handleRenameDeck = (e: React.FormEvent, deckId: string) => {
    e.preventDefault();
    if (!renameTitle.trim()) return;
    const updated = decks.map(d => d.id === deckId ? { ...d, title: renameTitle.trim() } : d);
    const changed = updated.find(d => d.id === deckId);
    saveDecks(updated, changed);
    setIsRenamingDeck(false);
  };

  const handleGenerateFromSource = async (source: GenerationSource, name: string, docId?: string) => {
    setIsGenerating(docId ?? name);
    try {
      const generated = await generateFlashcardsFromDocument(source, selectedCount);
      const newDeck: FlashcardDeck = {
        id: Math.random().toString(36).substr(2, 9),
        title: name.replace(/\.[^/.]+$/, ''),
        sourceDocumentId: docId,
        cards: generated.map(c => ({
          id: Math.random().toString(36).substr(2, 9),
          front: c.front || '',
          back: c.back || '',
          level: 0,
          nextReview: Date.now(),
          lastInterval: 0,
          srs: createSrsState(),
        }))
      };
      saveDecks([...decks, newDeck], newDeck);
    } catch (e) {
      console.error(e);
      toast.error('Fehler bei der Generierung.');
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
      const dueCards = migratedCards.filter(c => !c.srs || c.srs.nextReview <= now);
      const newCards = dueCards.filter(c => !c.srs?.lastReview).length;
      const learnCards = dueCards.filter(c => c.srs?.lastReview && c.srs.interval < 7).length;
      const reviewCards = dueCards.filter(c => c.srs?.lastReview && c.srs.interval >= 7).length;
      return { id: deck.id, newCards, learnCards, reviewCards, dueCount };
    });
  }, [decks]);

  const handleReview = (cardId: string, difficulty: 'again' | 'hard' | 'good' | 'easy') => {
    if (!activeDeckId) return;
    const quality = QUALITY_MAP[difficulty];

    const newDecks = decks.map(deck => {
      if (deck.id !== activeDeckId) return deck;
      return {
        ...deck,
        cards: deck.cards.map(card => {
          if (card.id !== cardId) return card;
          const currentSrs = card.srs ?? migrateLegacyCard(card);
          const nextSrs = reviewCard(currentSrs, quality);
          return {
            ...card,
            srs: nextSrs,
            level: nextSrs.repetitions,
            nextReview: nextSrs.nextReview,
            lastInterval: nextSrs.interval,
          };
        }),
      };
    });
    const changedDeck = newDecks.find(d => d.id === activeDeckId);
    saveDecks(newDecks, changedDeck);
    sessionReviewCount.current += 1;
    if (sessionReviewCount.current === 5) recordActivity(userId);
  };


  const handleExportAll = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      decks: decks.map(deck => ({
        title: deck.title,
        cards: deck.cards.map(c => ({ front: c.front, back: c.back }))
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quizwise_alle_decks_${new Date().toISOString().slice(0, 10)}.json`;
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
        let imported: FlashcardDeck[] = [];

        if (Array.isArray(json.decks)) {
          // Alle-sichern Format
          imported = json.decks.map((d: { title: string; cards: { front: string; back: string }[] }) => ({
            id: Math.random().toString(36).substr(2, 9),
            title: d.title,
            cards: d.cards.map((c: { front: string; back: string }) => ({
              id: Math.random().toString(36).substr(2, 9),
              front: c.front,
              back: c.back,
              level: 0,
              nextReview: Date.now(),
              lastInterval: 0,
              srs: createSrsState(),
            }))
          }));
        } else if (json.title && Array.isArray(json.cards)) {
          // Einzelnes Deck Format
          imported = [{
            id: Math.random().toString(36).substr(2, 9),
            title: json.title,
            cards: json.cards.map((c: { front: string; back: string }) => ({
              id: Math.random().toString(36).substr(2, 9),
              front: c.front,
              back: c.back,
              level: 0,
              nextReview: Date.now(),
              lastInterval: 0,
              srs: createSrsState(),
            }))
          }];
        } else {
          toast.error('Ungültiges Format. Nur QuizWise-Exporte werden unterstützt.');
          return;
        }

        const merged = [...decks, ...imported];
        setDecks(merged);
        localStorage.setItem('flashcard_decks', JSON.stringify(merged));
        if (userId) uploadAllDecksToSupabase(imported, userId).catch(() => {});
        toast.success(`${imported.length} Deck${imported.length !== 1 ? 's' : ''} mit ${imported.reduce((sum, d) => sum + d.cards.length, 0)} Karten importiert.`);
      } catch {
        toast.error('Fehler beim Lesen der Datei. Ist es eine gültige JSON-Datei?');
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };


  const handleAnkiImport = (cards: Flashcard[], targetDeckId: string | null, newDeckName?: string) => {
    let updatedDecks: FlashcardDeck[];
    let changedDeck: FlashcardDeck | undefined;

    if (targetDeckId) {
      updatedDecks = decks.map(d => {
        if (d.id !== targetDeckId) return d;
        const updated = { ...d, cards: [...d.cards, ...cards] };
        changedDeck = updated;
        return updated;
      });
      const count = cards.length;
      toast.success(`${count} Karte${count !== 1 ? 'n' : ''} zu "${decks.find(d => d.id === targetDeckId)?.title}" hinzugefügt.`);
    } else {
      const newDeck: FlashcardDeck = {
        id: Math.random().toString(36).substr(2, 9),
        title: newDeckName || 'Importiertes Deck',
        cards,
      };
      updatedDecks = [...decks, newDeck];
      changedDeck = newDeck;
      toast.success(`${cards.length} Karte${cards.length !== 1 ? 'n' : ''} in "${newDeck.title}" importiert.`);
    }
    saveDecks(updatedDecks, changedDeck);
  };

  // Streak-Aktivität auch im freien Üben gutschreiben — aber OHNE die SRS-Planung
  // anzufassen, damit man beliebig oft am Tag wiederholen kann.
  const handlePracticed = () => {
    sessionReviewCount.current += 1;
    if (sessionReviewCount.current === 5) recordActivity(userId);
  };

  const handleOpenDeck = (deckId: string, mode: 'due' | 'all' | 'free' = 'due') => {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;
    const migratedCards = deck.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) });

    let cardsToLearn: Flashcard[];
    if (mode === 'free') {
      // Frei lernen: ALLE Karten, zufällig gemischt, SRS bleibt unberührt.
      if (migratedCards.length === 0) { toast.error('Keine Karten in diesem Deck.'); return; }
      cardsToLearn = [...migratedCards];
      for (let i = cardsToLearn.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cardsToLearn[i], cardsToLearn[j]] = [cardsToLearn[j], cardsToLearn[i]];
      }
    } else if (mode === 'all') {
      cardsToLearn = [...migratedCards].sort((a, b) => (a.srs?.nextReview ?? 0) - (b.srs?.nextReview ?? 0));
      if (cardsToLearn.length === 0) { toast.error('Keine Karten in diesem Deck.'); return; }
    } else {
      cardsToLearn = getDueCards(migratedCards);
      if (cardsToLearn.length === 0) {
        toast.success('Dieses Deck ist für heute erledigt! 🎉 Tipp: "Üben" lernt jederzeit weiter.');
        return;
      }
    }

    sessionReviewCount.current = 0;
    setIsPracticeSession(mode === 'free');
    setSessionCards(cardsToLearn);
    setActiveDeckId(deckId);
  };

  if (activeDeckId) {
    return (
      <FlashcardPlayer
        cards={sessionCards}
        practiceMode={isPracticeSession}
        onReview={handleReview}
        onPracticed={handlePracticed}
        onClose={() => { setActiveDeckId(null); setSessionCards([]); setIsPracticeSession(false); }}
      />
    );
  }

  // Edit Mode View
  if (editingDeckId) {
    const deck = decks.find(d => d.id === editingDeckId);
    if (!deck) { setEditingDeckId(null); return null; }

    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-right-12 duration-700 py-6 lg:py-10">

        {/* Edit Card Modal */}
        {editingCard !== null && (
          <EditCardModal
            card={editingCard === 'new' ? undefined : editingCard}
            cardIndex={editingCard === 'new' ? undefined : deck.cards.findIndex(c => c.id === (editingCard as Flashcard).id)}
            totalCards={deck.cards.length}
            onSave={handleSaveCard}
            onDelete={editingCard !== 'new' ? () => {
              handleDeleteCard(deck.id, (editingCard as Flashcard).id);
              setEditingCard(null);
            } : undefined}
            onClose={() => setEditingCard(null)}
          />
        )}

        {/* Header */}
        <div className="flex justify-between items-start px-4 gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            {isRenamingDeck ? (
              <form onSubmit={e => handleRenameDeck(e, deck.id)} className="flex gap-2 items-center animate-in zoom-in-95 duration-200">
                <input
                  autoFocus
                  value={renameTitle}
                  onChange={e => setRenameTitle(e.target.value)}
                  className="flex-1 text-2xl font-black bg-transparent border-b-2 border-indigo-500 outline-none dark:text-white pb-1"
                  onKeyDown={e => e.key === 'Escape' && setIsRenamingDeck(false)}
                />
                <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0">
                  Speichern
                </button>
                <button type="button" onClick={() => setIsRenamingDeck(false)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase shrink-0">
                  ✕
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-black dark:text-white break-words">{deck.title}</h2>
                <button
                  onClick={() => { setRenameTitle(deck.title); setIsRenamingDeck(true); }}
                  className="p-2 rounded-xl text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all shrink-0"
                  title="Deck umbenennen"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            )}
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{deck.cards.length} Karten im Stapel</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setEditingCard('new')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:scale-[1.02] transition-all"
              style={{ background: 'var(--primary)', color: 'var(--primary-text, #fff)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Neue Karte
            </button>
            <button
              onClick={() => { setEditingDeckId(null); setIsRenamingDeck(false); setEditingCard(null); }}
              className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-indigo-600 transition-colors"
            >
              Fertig
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
                  placeholder={`${deck.cards.length} Karten durchsuchen…`}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm outline-none border-2 border-transparent focus:border-indigo-400 dark:text-white transition-colors"
                />
                {cardSearch && (
                  <button onClick={() => setCardSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {(() => {
            const filtered = cardSearch.trim()
              ? deck.cards.filter(c =>
                  c.front.toLowerCase().includes(cardSearch.toLowerCase()) ||
                  c.back.toLowerCase().includes(cardSearch.toLowerCase())
                )
              : deck.cards;

            if (deck.cards.length === 0) return (
              <div className="py-20 text-center space-y-4 opacity-30 px-6">
                <p className="text-[10px] font-black uppercase tracking-widest">Noch keine Karten</p>
                <p className="text-xs">Klicke „Neue Karte" um loszulegen.</p>
              </div>
            );

            if (filtered.length === 0) return (
              <div className="py-12 text-center opacity-40 text-sm">Keine Karten für „{cardSearch}"</div>
            );

            return (
              <>
                {cardSearch && (
                  <p className="px-6 pt-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    {filtered.length} von {deck.cards.length} Karten
                  </p>
                )}
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                  {filtered.map((card, idx) => (
                    <div
                      key={card.id}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => setEditingCard(card)}
                    >
                      <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 w-6 shrink-0 text-right">{idx + 1}</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-w-0">
                        <p className="text-sm font-bold dark:text-white md:border-r md:border-slate-100 md:dark:border-slate-800 md:pr-4 leading-snug break-words">{card.front}</p>
                        <p className="text-sm text-slate-400 dark:text-slate-500 leading-snug break-words">{card.back}</p>
                      </div>
                      <span className="shrink-0 p-2 rounded-xl text-slate-200 dark:text-slate-700 group-hover:text-indigo-500 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/30 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 lg:space-y-16 animate-in fade-in duration-700 py-6 lg:py-10 px-2 sm:px-4">
      {showAnkiImport && (
        <AnkiImportModal
          decks={decks}
          onClose={() => setShowAnkiImport(false)}
          onImport={handleAnkiImport}
        />
      )}
      {exportingDeck && (
        <ExportDeckModal
          deck={exportingDeck}
          userId={userId}
          onClose={() => setExportingDeck(null)}
        />
      )}
      {statsDeck && (
        <DeckStatsModal
          deck={statsDeck}
          onClose={() => setStatsDeck(null)}
        />
      )}
      <div className="text-center space-y-4 px-4">
        <h1 className="text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter">
          Anki <span className="text-indigo-600">Decks</span> <EmojiImage emoji="🎓" size={48} />
        </h1>
        <p className="text-lg lg:text-xl text-slate-500 dark:text-slate-400 font-medium opacity-80">
          Wissenschaftlich fundiertes Lernen durch Spaced Repetition.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">

        <div className="lg:col-span-5 space-y-6 lg:space-y-8 order-2 lg:order-1">
          <div className="bg-white dark:bg-slate-900 rounded-[30px] lg:rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-3d-raised p-5 lg:p-7 space-y-8">
            
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-600">Manuelles Deck</h3>
              {!showManualDeckDialog ? (
                <button 
                  onClick={() => setShowManualDeckDialog(true)}
                  className="w-full p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2 border-dashed border-indigo-200 hover:border-indigo-500 transition-all"
                >
                  + Leeres Deck erstellen
                </button>
              ) : (
                <form onSubmit={handleCreateEmptyDeck} className="space-y-3 animate-in zoom-in-95 duration-200">
                  <input 
                    autoFocus
                    placeholder="Name des neuen Decks..."
                    value={manualDeckTitle}
                    onChange={e => setManualDeckTitle(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold outline-none border-2 border-indigo-500 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-[9px] font-black uppercase tracking-widest">Erstellen</button>
                    <button type="button" onClick={() => setShowManualDeckDialog(false)} className="px-4 bg-slate-100 dark:bg-slate-800 text-slate-400 py-3 rounded-xl text-[9px] font-black uppercase">X</button>
                  </div>
                </form>
              )}
            </div>

            <div className="space-y-6 pt-4 border-t border-slate-50 dark:border-slate-800">
              <h3 className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.4em] text-indigo-600">Karten-Generator</h3>

              <div className="space-y-4">
                <div className="flex justify-between items-center text-[9px] lg:text-[10px] font-black uppercase text-slate-400 tracking-widest px-2">
                  <span>Karten-Anzahl</span>
                  <span>{selectedCount}</span>
                </div>
                <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl lg:rounded-2xl shadow-inner border border-slate-100 dark:border-slate-700">
                  {cardCounts.map(count => (
                    <button
                      key={count}
                      onClick={() => setSelectedCount(count)}
                      className={`flex-1 py-2 rounded-lg lg:rounded-xl text-[9px] lg:text-[10px] font-black transition-all ${selectedCount === count ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              {isGenerating ? (
                <div className="py-8 flex flex-col items-center gap-3 text-center">
                  <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 animate-pulse">Deine Karten entstehen …</p>
                </div>
              ) : (
                <SourceSelector
                  documents={availableDocuments}
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

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-[30px] lg:rounded-[48px] border border-slate-200 dark:border-slate-800 shadow-3d-deep overflow-hidden order-1 lg:order-2">
          <div className="p-5 sm:p-6 lg:p-10 border-b border-slate-50 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 lg:gap-0">
            <h3 className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.3em] lg:tracking-[0.4em] text-slate-400">Deine Stapel ({decks.length})</h3>
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
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors"
                title="Karten importieren (CSV/TSV/Text)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Importieren
              </button>
              {decks.length > 0 && (
                <button
                  onClick={handleExportAll}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors"
                  title="Alle Stapel als JSON exportieren"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Alle sichern
                </button>
              )}
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                 <span className="text-[9px] font-black text-slate-400 uppercase">Neu</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                 <span className="text-[9px] font-black text-slate-400 uppercase">Learn</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                 <span className="text-[9px] font-black text-slate-400 uppercase">Due</span>
               </div>
            </div>
          </div>

          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {decks.length === 0 ? (
              <div className="py-20 lg:py-32 text-center space-y-4 lg:space-y-6 opacity-30 px-6">
                <EmojiImage emoji="🗃️" size={64} className="mx-auto" />
                <p className="text-[10px] lg:text-sm font-black uppercase tracking-widest">Keine Stapel vorhanden</p>
                <p className="text-xs">Nutze den Generator links oder erstelle ein manuelles Deck.</p>
              </div>
            ) : (
              decks.map(deck => {
                const stats = deckStats.find(s => s.id === deck.id);
                return (
                  <div 
                    key={deck.id} 
                    className="flex flex-col sm:flex-row items-center justify-between p-6 lg:p-8 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all group gap-6"
                  >
                    <div className="flex-grow min-w-0 text-center sm:text-left">
                      <div className="flex items-center gap-2 justify-center sm:justify-start">
                        <h4 className="text-lg lg:text-xl font-black text-slate-900 dark:text-white break-words group-hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => handleOpenDeck(deck.id)}>
                          {deck.title}
                        </h4>
                        {!deck.sourceDocumentId && <span className="bg-slate-100 dark:bg-slate-800 text-[8px] font-black uppercase px-2 py-0.5 rounded text-slate-400 tracking-tighter">Manuell</span>}
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Total: {deck.cards.length} Karten</p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6 w-full sm:w-auto">
                      <div className="flex gap-6 lg:gap-8 text-center justify-center">
                        <span className="text-sm font-black text-blue-500">{stats?.newCards || 0}</span>
                        <span className="text-sm font-black text-rose-500">{stats?.learnCards || 0}</span>
                        <span className="text-sm font-black text-emerald-500">{stats?.reviewCards || 0}</span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center justify-center sm:justify-end">
                        <button
                          onClick={() => handleOpenDeck(deck.id)}
                          className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-5 lg:px-6 py-3 rounded-xl lg:rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all"
                        >
                          Lernen
                        </button>
                        <button
                          onClick={() => handleOpenDeck(deck.id, 'free')}
                          className="flex-none flex items-center gap-1.5 border-2 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 px-3 py-3 rounded-xl lg:rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-emerald-400 hover:text-emerald-600 transition-all"
                          title="Frei üben: alle Karten, beliebig oft, ohne den Fälligkeitsplan zu verändern"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                          Üben
                        </button>
                        <button
                          onClick={() => handleOpenDeck(deck.id, 'all')}
                          className="flex-none border-2 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 px-3 py-3 rounded-xl lg:rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-all"
                          title="Alle Karten der Reihe nach lernen (verändert den SRS-Plan)"
                        >
                          Alle
                        </button>
                        <button
                          onClick={() => setStatsDeck(deck)}
                          className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
                          title="Statistiken"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                        </button>
                        <button
                          onClick={() => setEditingDeckId(deck.id)}
                          className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
                          title="Bearbeiten"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button
                          onClick={() => setExportingDeck(deck)}
                          className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
                          title="Exportieren & Teilen"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        </button>
                        <button
                          onClick={() => onGenerateQuizFromDeck(deck)}
                          disabled={isQuizLoading}
                          className="bg-white dark:bg-slate-800 border-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 px-4 py-3 rounded-xl lg:rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isQuizLoading ? '...' : <span>Quiz <EmojiImage emoji="🎯" size={12} /></span>}
                        </button>
                        <button
                          onClick={() => {
                            const filtered = decks.filter(d => d.id !== deck.id);
                            setDecks(filtered);
                            localStorage.setItem('flashcard_decks', JSON.stringify(filtered));
                            if (userId) deleteDeckFromSupabase(deck.id, userId).catch(() => {});
                          }}
                          className="p-3 text-slate-200 hover:text-rose-500 transition-all opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
