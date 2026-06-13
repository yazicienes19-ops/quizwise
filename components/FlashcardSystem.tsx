
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  const [showManualDeckDialog, setShowManualDeckDialog] = useState(false);
  const [showAnkiImport, setShowAnkiImport] = useState(false);
  const [manualDeckTitle, setManualDeckTitle] = useState('');
  const [newCardFront, setNewCardFront] = useState('');
  const [newCardBack, setNewCardBack] = useState('');
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
          return { ...card, srs: nextSrs, level: nextSrs.repetitions, nextReview: nextSrs.nextReview, lastInterval: nextSrs.interval };
        }),
      };
    });
    const changedDeck = newDecks.find(d => d.id === activeDeckId);
    saveDecks(newDecks, changedDeck);
    sessionReviewCount.current += 1;
    if (sessionReviewCount.current === 5) recordActivity();
  };

  const handleExportDeck = (deck: FlashcardDeck) => {
    const data = { title: deck.title, exportedAt: new Date().toISOString(), cards: deck.cards.map(c => ({ front: c.front, back: c.back })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${deck.title.replace(/[^a-z0-9äöüß]/gi, '_')}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    const data = { exportedAt: new Date().toISOString(), decks: decks.map(deck => ({ title: deck.title, cards: deck.cards.map(c => ({ front: c.front, back: c.back })) })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `quizwise_alle_decks_${new Date().toISOString().slice(0, 10)}.json`; a.click();
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
          imported = json.decks.map((d: { title: string; cards: { front: string; back: string }[] }) => ({
            id: Math.random().toString(36).substr(2, 9), title: d.title,
            cards: d.cards.map((c: { front: string; back: string }) => ({ id: Math.random().toString(36).substr(2, 9), front: c.front, back: c.back, level: 0, nextReview: Date.now(), lastInterval: 0, srs: createSrsState() }))
          }));
        } else if (json.title && Array.isArray(json.cards)) {
          imported = [{ id: Math.random().toString(36).substr(2, 9), title: json.title, cards: json.cards.map((c: { front: string; back: string }) => ({ id: Math.random().toString(36).substr(2, 9), front: c.front, back: c.back, level: 0, nextReview: Date.now(), lastInterval: 0, srs: createSrsState() })) }];
        } else { toast.error('Ungültiges Format.'); return; }
        const merged = [...decks, ...imported];
        setDecks(merged);
        localStorage.setItem('flashcard_decks', JSON.stringify(merged));
        if (userId) uploadAllDecksToSupabase(imported, userId).catch(() => {});
        toast.success(`${imported.length} Deck${imported.length !== 1 ? 's' : ''} importiert.`);
      } catch { toast.error('Fehler beim Lesen der Datei.'); }
      finally { if (importInputRef.current) importInputRef.current.value = ''; }
    };
    reader.readAsText(file);
  };

  const handleShareDeck = async (deck: FlashcardDeck) => {
    if (!userId) { toast.error('Bitte zuerst einloggen, um Decks zu teilen.'); return; }
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
      } else { toast.error('Teilen fehlgeschlagen. Bitte versuche es erneut.'); }
    }
  };

  const handleAnkiImport = (cards: Flashcard[], targetDeckId: string | null, newDeckName?: string) => {
    let updatedDecks: FlashcardDeck[];
    if (targetDeckId) {
      updatedDecks = decks.map(d => d.id === targetDeckId ? { ...d, cards: [...d.cards, ...cards] } : d);
      toast.success(`${cards.length} Karte${cards.length !== 1 ? 'n' : ''} hinzugefügt.`);
    } else {
      const newDeck: FlashcardDeck = { id: Math.random().toString(36).substr(2, 9), title: newDeckName || 'Importiertes Deck', cards };
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
    return getDueCards(deck.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) }));
  };

  const handleOpenDeck = (deckId: string) => {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;
    const due = getDueCards(deck.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) }));
    if (due.length === 0) { toast.success('Dieses Deck ist für heute erledigt! 🎉'); return; }
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

  /* ── Edit Mode ── */
  if (editingDeckId) {
    const deck = decks.find(d => d.id === editingDeckId);
    if (!deck) { setEditingDeckId(null); return null; }

    return (
      <div className="max-w-[860px] mx-auto px-4 py-6 space-y-6 animate-in slide-in-from-right-8 duration-500 pb-20">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isRenamingDeck ? (
              <form onSubmit={e => handleRenameDeck(e, deck.id)} className="flex gap-2 items-center">
                <input
                  autoFocus value={renameTitle} onChange={e => setRenameTitle(e.target.value)}
                  className="flex-1 text-xl font-black bg-transparent outline-none dark:text-white pb-1"
                  style={{ borderBottom: '2px solid var(--accent)' }}
                  onKeyDown={e => e.key === 'Escape' && setIsRenamingDeck(false)}
                />
                <button type="submit" className="px-4 py-1.5 text-white rounded-[12px] text-[10px] font-black uppercase tracking-widest shrink-0"
                  style={{ background: 'var(--accent)' }}>Speichern</button>
                <button type="button" onClick={() => setIsRenamingDeck(false)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-[12px] text-[10px] font-black uppercase shrink-0">✕</button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <h2 className="text-[22px] font-extrabold dark:text-white truncate">{deck.title}</h2>
                <button
                  onClick={() => { setRenameTitle(deck.title); setIsRenamingDeck(true); }}
                  className="p-1.5 rounded-[10px] text-slate-300 transition-colors"
                  style={{ color: '#94a3b8' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            )}
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{deck.cards.length} Karten im Stapel</p>
          </div>
          <button
            onClick={() => { setEditingDeckId(null); setEditingCardId(null); setIsRenamingDeck(false); }}
            className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-colors shrink-0"
          >
            Fertig
          </button>
        </div>

        {/* Add card form */}
        <form onSubmit={handleAddManualCard} className="bg-white dark:bg-slate-900 p-6 rounded-[18px] border space-y-4"
          style={{ borderColor: 'var(--border)' }}>
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Neue Karte hinzufügen</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase">Vorderseite</label>
              <textarea
                value={newCardFront} onChange={e => setNewCardFront(e.target.value)}
                placeholder="z.B. Was ist der Turing-Test?"
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-[14px] outline-none dark:text-white font-medium resize-none h-24 border-2 border-transparent transition-colors"
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase">Rückseite</label>
              <textarea
                value={newCardBack} onChange={e => setNewCardBack(e.target.value)}
                placeholder="z.B. Ein Test zur Unterscheidung von Mensch und KI."
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-[14px] outline-none dark:text-white font-medium resize-none h-24 border-2 border-transparent transition-colors"
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
              />
            </div>
          </div>
          <button
            type="submit" disabled={!newCardFront.trim() || !newCardBack.trim()}
            className="w-full text-white font-black py-4 rounded-[14px] uppercase tracking-widest text-[11px] transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            Karte hinzufügen +
          </button>
        </form>

        {/* Card list */}
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Bestehende Karten ({deck.cards.length})</p>
          {deck.cards.map(card => (
            <div key={card.id} className="bg-white dark:bg-slate-900 rounded-[16px] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {editingCardId === card.id ? (
                <form onSubmit={e => handleSaveCardEdit(e, deck.id)} className="p-5 space-y-4">
                  <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Karte bearbeiten</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase">Vorderseite</label>
                      <textarea autoFocus value={editCardFront} onChange={e => setEditCardFront(e.target.value)}
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-[12px] outline-none dark:text-white font-medium resize-none h-20 text-sm border-2"
                        style={{ borderColor: 'var(--accent)' }} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase">Rückseite</label>
                      <textarea value={editCardBack} onChange={e => setEditCardBack(e.target.value)}
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-[12px] border-2 border-slate-200 dark:border-slate-700 outline-none dark:text-white font-medium resize-none h-20 text-sm"
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                        onBlur={e => (e.currentTarget.style.borderColor = '')} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={!editCardFront.trim() || !editCardBack.trim()}
                      className="flex-1 py-2.5 text-white rounded-[12px] text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                      style={{ background: 'var(--accent)' }}>Speichern</button>
                    <button type="button" onClick={() => setEditingCardId(null)}
                      className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-[12px] text-[10px] font-black uppercase">Abbrechen</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-4 p-5 group">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-w-0">
                    <p className="text-sm font-bold dark:text-white md:border-r md:pr-3 leading-snug" style={{ borderColor: 'var(--border)' }}>{card.front}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic leading-snug">{card.back}</p>
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEditCard(card)}
                      className="p-2 rounded-[10px] text-slate-300 transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => handleDeleteCard(deck.id, card.id)}
                      className="p-2 rounded-[10px] text-slate-300 hover:text-rose-500 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {deck.cards.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-400 italic">Noch keine Karten in diesem Stapel.</div>
          )}
        </div>
      </div>
    );
  }

  /* ── Main View ── */
  return (
    <div className="max-w-[860px] mx-auto px-4 py-6 space-y-6 animate-in fade-in duration-500 pb-20">
      {showAnkiImport && (
        <AnkiImportModal decks={decks} onClose={() => setShowAnkiImport(false)} onImport={handleAnkiImport} />
      )}
      <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white">Karteikarten</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Spaced Repetition · {decks.length} Stapel</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAnkiImport(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-white rounded-[12px] text-[9px] font-black uppercase tracking-widest transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Importieren
          </button>
          {decks.length > 0 && (
            <button onClick={handleExportAll}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-white rounded-[12px] text-[9px] font-black uppercase tracking-widest transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Alle sichern
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">

        {/* Left sidebar */}
        <div className="space-y-4">
          {/* Create deck */}
          <div className="bg-white dark:bg-slate-900 rounded-[18px] border p-5 space-y-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Manuelles Deck</p>
            {!showManualDeckDialog ? (
              <button onClick={() => setShowManualDeckDialog(true)}
                className="w-full p-4 rounded-[14px] border-2 border-dashed font-black uppercase text-[10px] tracking-widest transition-colors"
                style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                + Leeres Deck erstellen
              </button>
            ) : (
              <form onSubmit={handleCreateEmptyDeck} className="space-y-3">
                <input autoFocus placeholder="Name des neuen Decks..." value={manualDeckTitle}
                  onChange={e => setManualDeckTitle(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-[12px] text-xs font-bold outline-none dark:text-white border-2"
                  style={{ borderColor: 'var(--accent)' }} />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 text-white py-2.5 rounded-[12px] text-[9px] font-black uppercase tracking-widest"
                    style={{ background: 'var(--accent)' }}>Erstellen</button>
                  <button type="button" onClick={() => setShowManualDeckDialog(false)}
                    className="px-4 bg-slate-100 dark:bg-slate-800 text-slate-400 py-2.5 rounded-[12px] text-[9px] font-black uppercase">✕</button>
                </div>
              </form>
            )}
          </div>

          {/* AI Generator */}
          <div className="bg-white dark:bg-slate-900 rounded-[18px] border p-5 space-y-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>KI Deck Generator</p>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase text-slate-400 tracking-widest">
                <span>Anzahl Karten</span><span>{selectedCount}</span>
              </div>
              <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-[12px] border" style={{ borderColor: 'var(--border)' }}>
                {cardCounts.map(count => (
                  <button key={count} onClick={() => setSelectedCount(count)}
                    className={`flex-1 py-1.5 rounded-[9px] text-[9px] font-black transition-all ${selectedCount === count ? 'text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                    style={selectedCount === count ? { background: 'var(--accent)' } : {}}>
                    {count}
                  </button>
                ))}
              </div>
            </div>
            {isGenerating ? (
              <div className="py-6 flex flex-col items-center gap-3 text-center">
                <div className="w-7 h-7 border-4 border-slate-100 border-t-current rounded-full animate-spin" style={{ borderTopColor: 'var(--accent)' }} />
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>KI generiert Karten...</p>
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

        {/* Deck list */}
        <div className="bg-white dark:bg-slate-900 rounded-[18px] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {/* Legend */}
          <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Deine Stapel ({decks.length})</p>
            <div className="flex items-center gap-4">
              {[{ color: 'bg-blue-500', label: 'Neu' }, { color: 'bg-rose-500', label: 'Learn' }, { color: 'bg-emerald-500', label: 'Due' }].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
                  <span className="text-[8px] font-black uppercase text-slate-400">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {decks.length === 0 ? (
            <div className="py-16 text-center space-y-4 px-6">
              <div className="w-14 h-14 rounded-[16px] flex items-center justify-center mx-auto" style={{ background: 'var(--icon-box)' }}>
                <EmojiImage emoji="🗃️" size={28} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">Keine Stapel vorhanden</p>
                <p className="text-[11px] text-slate-400 mt-1">Generator verwenden oder manuelles Deck erstellen</p>
              </div>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {decks.map(deck => {
                const stats = deckStats.find(s => s.id === deck.id);
                return (
                  <div key={deck.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group gap-4">
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[14px] font-bold text-slate-900 dark:text-white truncate cursor-pointer transition-colors"
                          onClick={() => handleOpenDeck(deck.id)}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.color = '')}>
                          {deck.title}
                        </h4>
                        {!deck.sourceDocumentId && (
                          <span className="bg-slate-100 dark:bg-slate-800 text-[8px] font-black uppercase px-2 py-0.5 rounded text-slate-400 shrink-0">Manuell</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-[9px] font-bold text-slate-400">{deck.cards.length} Karten</span>
                        <span className="text-[9px] font-black text-blue-500">{stats?.newCards || 0} neu</span>
                        <span className="text-[9px] font-black text-emerald-500">{stats?.reviewCards || 0} fällig</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => handleOpenDeck(deck.id)}
                        className="px-4 py-2 text-white rounded-[11px] text-[9px] font-black uppercase tracking-widest transition-opacity hover:opacity-90"
                        style={{ background: 'var(--accent)' }}>Lernen</button>
                      <button onClick={() => setEditingDeckId(deck.id)}
                        className="p-2 text-slate-300 hover:text-slate-600 dark:hover:text-slate-200 rounded-[10px] transition-colors" title="Bearbeiten">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => handleExportDeck(deck)}
                        className="p-2 text-slate-300 hover:text-slate-600 dark:hover:text-slate-200 rounded-[10px] transition-colors" title="Exportieren">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </button>
                      <button onClick={() => handleShareDeck(deck)}
                        className="p-2 text-slate-300 hover:text-slate-600 dark:hover:text-slate-200 rounded-[10px] transition-colors" title="Teilen">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      </button>
                      <button onClick={() => onGenerateQuizFromDeck(deck)} disabled={isQuizLoading}
                        className="px-3 py-2 rounded-[11px] text-[9px] font-black uppercase tracking-widest transition-opacity disabled:opacity-40 border-2"
                        style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }}>
                        {isQuizLoading ? '...' : 'Quiz'}
                      </button>
                      <button
                        onClick={() => {
                          const filtered = decks.filter(d => d.id !== deck.id);
                          setDecks(filtered);
                          localStorage.setItem('flashcard_decks', JSON.stringify(filtered));
                          if (userId) deleteDeckFromSupabase(deck.id, userId).catch(() => {});
                        }}
                        className="p-2 text-slate-200 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 rounded-[10px]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
