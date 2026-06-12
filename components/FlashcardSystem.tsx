
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FlashcardDeck, Flashcard, ProcessedDocument, Collection } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { EmojiImage } from './EmojiImage';
import { generateFlashcardsFromDocument } from '../services/geminiService';
import { toast } from '../services/toast';
import { FlashcardPlayer } from './FlashcardPlayer';
import { SourceSelector } from './SourceSelector';
import { loadDecksFromSupabase, saveDeckToSupabase, deleteDeckFromSupabase, uploadAllDecksToSupabase } from '../services/flashcardService';
import { reviewCard, getDueCards, createSrsState, migrateLegacyCard, ReviewQuality, countDueCards } from '../services/spacedRepetition';
import { recordActivity } from '../services/streakService';
import { AnkiImportModal } from './AnkiImportModal';
import { shareDeck } from '../services/sharedDecksService';

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
  const sessionReviewCount = React.useRef(0);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState<number>(15);
  
  // States for manual deck creation
  const [showManualDeckDialog, setShowManualDeckDialog] = useState(false);
  const [showAnkiImport, setShowAnkiImport] = useState(false);
  const [manualDeckTitle, setManualDeckTitle] = useState('');

  // States for manual card addition
  const [newCardFront, setNewCardFront] = useState('');
  const [newCardBack, setNewCardBack] = useState('');

  // States for card editing + deck renaming
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editCardFront, setEditCardFront] = useState('');
  const [editCardBack, setEditCardBack] = useState('');
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
            setDecks(cloudDecks);
            localStorage.setItem('flashcard_decks', JSON.stringify(cloudDecks));
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
      handleGenerateFromSource(source, initialDoc.name.replace(/\.[^/.]+$/, ''), initialDoc.id);
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

  const handleAddManualCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeckId || !newCardFront.trim() || !newCardBack.trim()) return;

    const newCard: Flashcard = {
      id: Math.random().toString(36).substr(2, 9),
      front: newCardFront,
      back: newCardBack,
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
    setNewCardFront('');
    setNewCardBack('');
  };

  const handleDeleteCard = (deckId: string, cardId: string) => {
    const updated = decks.map(d =>
      d.id === deckId ? { ...d, cards: d.cards.filter(c => c.id !== cardId) } : d
    );
    const changed = updated.find(d => d.id === deckId);
    saveDecks(updated, changed);
  };

  const startEditCard = (card: Flashcard) => {
    setEditingCardId(card.id);
    setEditCardFront(card.front);
    setEditCardBack(card.back);
  };

  const handleSaveCardEdit = (e: React.FormEvent, deckId: string) => {
    e.preventDefault();
    if (!editCardFront.trim() || !editCardBack.trim()) return;
    const updated = decks.map(d =>
      d.id === deckId
        ? { ...d, cards: d.cards.map(c => c.id === editingCardId ? { ...c, front: editCardFront.trim(), back: editCardBack.trim() } : c) }
        : d
    );
    const changed = updated.find(d => d.id === deckId);
    saveDecks(updated, changed);
    setEditingCardId(null);
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
    handleGenerateFromSource(source, doc.name, doc.id);
  };

  const deckStats = useMemo(() => {
    return decks.map(deck => {
      const migratedCards = deck.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) });
      const dueCount = countDueCards(migratedCards);
      const newCards = migratedCards.filter(c => !c.srs?.lastReview).length;
      const reviewCards = migratedCards.filter(c => c.srs?.lastReview && c.srs.nextReview <= Date.now()).length;
      return { id: deck.id, newCards, learnCards: 0, reviewCards, dueCount };
    });
  }, [decks]);

  const QUALITY_MAP: Record<'again' | 'hard' | 'good' | 'easy', ReviewQuality> = {
    again: ReviewQuality.BLACKOUT,
    hard:  ReviewQuality.HARD,
    good:  ReviewQuality.GOOD,
    easy:  ReviewQuality.EASY,
  };

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
    if (sessionReviewCount.current === 5) recordActivity();
  };

  const handleExportDeck = (deck: FlashcardDeck) => {
    const data = {
      title: deck.title,
      exportedAt: new Date().toISOString(),
      cards: deck.cards.map(c => ({ front: c.front, back: c.back }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.title.replace(/[^a-z0-9äöüß]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  const handleShareDeck = async (deck: FlashcardDeck) => {
    if (!userId) {
      toast.error('Bitte zuerst einloggen, um Decks zu teilen.');
      return;
    }
    try {
      const id = await shareDeck(deck.id, deck.title, deck.cards, userId);
      const url = `${window.location.origin}/shared/${id}`;
      await navigator.clipboard.writeText(url);
      toast.success('Link kopiert! Teile ihn mit deinen Kommilitonen.');
    } catch (e: any) {
      if (e?.code === '23505') {
        const url = `${window.location.origin}/shared/${deck.id}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        toast.success('Link kopiert (Deck bereits geteilt)!');
      } else {
        toast.error('Teilen fehlgeschlagen. Bitte versuche es erneut.');
      }
    }
  };

  const handleAnkiImport = (cards: Flashcard[], targetDeckId: string | null, newDeckName?: string) => {
    let updatedDecks: FlashcardDeck[];
    if (targetDeckId) {
      updatedDecks = decks.map(d =>
        d.id === targetDeckId ? { ...d, cards: [...d.cards, ...cards] } : d
      );
      const count = cards.length;
      toast.success(`${count} Karte${count !== 1 ? 'n' : ''} zu "${decks.find(d => d.id === targetDeckId)?.title}" hinzugefügt.`);
    } else {
      const newDeck: FlashcardDeck = {
        id: Math.random().toString(36).substr(2, 9),
        title: newDeckName || 'Importiertes Deck',
        cards,
      };
      updatedDecks = [...decks, newDeck];
      toast.success(`${cards.length} Karte${cards.length !== 1 ? 'n' : ''} in "${newDeck.title}" importiert.`);
    }
    setDecks(updatedDecks);
    localStorage.setItem('flashcard_decks', JSON.stringify(updatedDecks));
    if (userId) uploadAllDecksToSupabase(updatedDecks.filter(d => !decks.some(od => od.id === d.id)), userId).catch(() => {});
  };

  const getActiveDeckCards = () => {
    if (!activeDeckId) return [];
    const deck = decks.find(d => d.id === activeDeckId);
    if (!deck) return [];
    const migratedCards = deck.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) });
    return getDueCards(migratedCards);
  };

  const handleOpenDeck = (deckId: string) => {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;
    const migratedCards = deck.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) });
    const due = getDueCards(migratedCards);
    if (due.length === 0) {
      toast.success("Dieses Deck ist für heute erledigt! 🎉");
      return;
    }
    sessionReviewCount.current = 0;
    setActiveDeckId(deckId);
  };

  if (activeDeckId) {
    return (
      <FlashcardPlayer
        cards={getActiveDeckCards()}
        onReview={handleReview}
        onClose={() => setActiveDeckId(null)}
      />
    );
  }

  // Edit Mode View
  if (editingDeckId) {
    const deck = decks.find(d => d.id === editingDeckId);
    if (!deck) { setEditingDeckId(null); return null; }

    return (
      <div className="max-w-4xl mx-auto space-y-10 lg:space-y-16 animate-in slide-in-from-right-12 duration-700 py-6 lg:py-10">

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
                <h2 className="text-3xl font-black dark:text-white truncate">{deck.title}</h2>
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
          <button
            onClick={() => { setEditingDeckId(null); setEditingCardId(null); setIsRenamingDeck(false); }}
            className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-indigo-600 transition-colors shrink-0"
          >
            Fertig & Schließen
          </button>
        </div>

        {/* Form to add new card */}
        <form onSubmit={handleAddManualCard} className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Neue Karte hinzufügen</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Vorderseite (Frage/Begriff)</label>
              <textarea
                value={newCardFront}
                onChange={e => setNewCardFront(e.target.value)}
                placeholder="z.B. Was ist der Turing-Test?"
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white font-medium resize-none h-24"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Rückseite (Antwort/Definition)</label>
              <textarea
                value={newCardBack}
                onChange={e => setNewCardBack(e.target.value)}
                placeholder="z.B. Ein Test zur Unterscheidung von menschlicher und künstlicher Intelligenz."
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none dark:text-white font-medium resize-none h-24"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!newCardFront.trim() || !newCardBack.trim()}
            className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-[11px] shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50"
          >
            Karte zum Stapel hinzufügen +
          </button>
        </form>

        {/* Card list */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4">Bestehende Karten ({deck.cards.length})</h3>
          <div className="space-y-3">
            {deck.cards.map(card => (
              <div key={card.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                {editingCardId === card.id ? (
                  /* ── Inline Edit Form ── */
                  <form onSubmit={e => handleSaveCardEdit(e, deck.id)} className="p-5 space-y-4 animate-in fade-in duration-200">
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Karte bearbeiten</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Vorderseite</label>
                        <textarea
                          autoFocus
                          value={editCardFront}
                          onChange={e => setEditCardFront(e.target.value)}
                          className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-indigo-500 outline-none dark:text-white font-medium resize-none h-20 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Rückseite</label>
                        <textarea
                          value={editCardBack}
                          onChange={e => setEditCardBack(e.target.value)}
                          className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none dark:text-white font-medium resize-none h-20 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={!editCardFront.trim() || !editCardBack.trim()}
                        className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 hover:scale-[1.01] transition-all"
                      >
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCardId(null)}
                        className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-colors"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                ) : (
                  /* ── Card Display Row ── */
                  <div className="flex items-center gap-4 p-5 group">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-w-0">
                      <p className="text-sm font-bold dark:text-white md:border-r md:border-slate-100 md:dark:border-slate-800 md:pr-3 leading-snug">{card.front}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 italic leading-snug">{card.back}</p>
                    </div>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEditCard(card)}
                        className="p-2 rounded-xl text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all"
                        title="Bearbeiten"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        onClick={() => handleDeleteCard(deck.id, card.id)}
                        className="p-2 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all"
                        title="Löschen"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {deck.cards.length === 0 && (
              <div className="py-12 text-center opacity-30 italic text-sm">Noch keine Karten in diesem Stapel.</div>
            )}
          </div>
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
      <div className="text-center space-y-4 px-4">
        <h1 className="text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter">
          Anki <span className="text-indigo-600">Decks</span> <EmojiImage emoji="🎓" size={48} />
        </h1>
        <p className="text-lg lg:text-xl text-slate-500 dark:text-slate-400 font-medium opacity-80">
          Wissenschaftlich fundiertes Lernen durch Spaced Repetition.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        
        <div className="lg:col-span-4 space-y-6 lg:space-y-8 order-2 lg:order-1">
          <div className="bg-white dark:bg-slate-900 rounded-[30px] lg:rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-3d-raised p-6 lg:p-10 space-y-8">
            
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
              <h3 className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.4em] text-indigo-600">KI Deck Generator</h3>

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
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 animate-pulse">KI generiert Karten...</p>
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

        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-[30px] lg:rounded-[48px] border border-slate-200 dark:border-slate-800 shadow-3d-deep overflow-hidden order-1 lg:order-2">
          <div className="p-6 lg:p-10 border-b border-slate-50 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 lg:gap-0">
            <h3 className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.3em] lg:tracking-[0.4em] text-slate-400">Deine Stapel ({decks.length})</h3>
            <div className="flex gap-4 items-center">
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
                        <h4 className="text-lg lg:text-xl font-black text-slate-900 dark:text-white truncate group-hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => handleOpenDeck(deck.id)}>
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
                      
                      <div className="flex gap-2 w-full sm:w-auto items-center">
                        <button
                          onClick={() => handleOpenDeck(deck.id)}
                          className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-5 lg:px-6 py-3 rounded-xl lg:rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all"
                        >
                          Lernen
                        </button>
                        <button
                          onClick={() => setEditingDeckId(deck.id)}
                          className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
                          title="Bearbeiten"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button
                          onClick={() => handleExportDeck(deck)}
                          className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
                          title="Als JSON exportieren"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                        <button
                          onClick={() => handleShareDeck(deck)}
                          className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
                          title="Deck teilen — Link kopieren"
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
