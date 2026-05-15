
import React, { useState, useEffect, useMemo } from 'react';
import { FlashcardDeck, Flashcard, ProcessedDocument } from '../types';
import { EmojiImage } from './EmojiImage';
import { generateFlashcardsFromDocument } from '../services/geminiService';
import { FlashcardPlayer } from './FlashcardPlayer';

interface FlashcardSystemProps {
  availableDocuments: ProcessedDocument[];
  onDeleteDoc: (id: string) => void;
  onUploadNew: (file: File) => void;
  onGenerateQuizFromDeck: (deck: FlashcardDeck) => void;
  isQuizLoading?: boolean;
}

export const FlashcardSystem: React.FC<FlashcardSystemProps> = ({ 
  availableDocuments, 
  onDeleteDoc,
  onUploadNew,
  onGenerateQuizFromDeck,
  isQuizLoading = false
}) => {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState<number>(15);
  
  // States for manual deck creation
  const [showManualDeckDialog, setShowManualDeckDialog] = useState(false);
  const [manualDeckTitle, setManualDeckTitle] = useState('');

  // States for manual card addition
  const [newCardFront, setNewCardFront] = useState('');
  const [newCardBack, setNewCardBack] = useState('');

  const cardCounts = [5, 10, 15, 20, 30];

  useEffect(() => {
    const saved = localStorage.getItem('flashcard_decks');
    if (saved) {
      try { setDecks(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveDecks = (newDecks: FlashcardDeck[]) => {
    setDecks(newDecks);
    localStorage.setItem('flashcard_decks', JSON.stringify(newDecks));
  };

  const handleCreateEmptyDeck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDeckTitle.trim()) return;
    
    const newDeck: FlashcardDeck = {
      id: Math.random().toString(36).substr(2, 9),
      title: manualDeckTitle,
      cards: []
    };
    
    saveDecks([...decks, newDeck]);
    setManualDeckTitle('');
    setShowManualDeckDialog(false);
    setEditingDeckId(newDeck.id); // Direkt in den Editor springen
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
      lastInterval: 0
    };

    const updatedDecks = decks.map(d => 
      d.id === editingDeckId ? { ...d, cards: [newCard, ...d.cards] } : d
    );

    saveDecks(updatedDecks);
    setNewCardFront('');
    setNewCardBack('');
  };

  const handleDeleteCard = (deckId: string, cardId: string) => {
    const updated = decks.map(d => 
      d.id === deckId ? { ...d, cards: d.cards.filter(c => c.id !== cardId) } : d
    );
    saveDecks(updated);
  };

  const handleGenerateFromDoc = async (doc: ProcessedDocument) => {
    setIsGenerating(doc.id);
    try {
      const source = doc.type === 'pdf' 
        ? { file: { data: doc.content, mimeType: 'application/pdf' } } 
        : { text: doc.content };

      const generated = await generateFlashcardsFromDocument(source, selectedCount);
      
      const newDeck: FlashcardDeck = {
        id: Math.random().toString(36).substr(2, 9),
        title: doc.name.replace(/\.[^/.]+$/, ""),
        sourceDocumentId: doc.id,
        cards: generated.map(c => ({
          id: Math.random().toString(36).substr(2, 9),
          front: c.front || '',
          back: c.back || '',
          level: 0,
          nextReview: Date.now(),
          lastInterval: 0
        }))
      };
      saveDecks([...decks, newDeck]);
    } catch (e) {
      console.error(e);
      alert("Fehler bei der Generierung.");
    } finally {
      setIsGenerating(null);
    }
  };

  const deckStats = useMemo(() => {
    const now = Date.now();
    return decks.map(deck => {
      const newCards = deck.cards.filter(c => c.level === 0).length;
      const learnCards = deck.cards.filter(c => c.level > 0 && c.level < 3).length;
      const reviewCards = deck.cards.filter(c => c.level >= 3 && c.nextReview <= now).length;
      return { id: deck.id, newCards, learnCards, reviewCards };
    });
  }, [decks]);

  const handleReview = (cardId: string, difficulty: 'again' | 'hard' | 'good' | 'easy') => {
    if (!activeDeckId) return;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const newDecks = decks.map(deck => {
      if (deck.id !== activeDeckId) return deck;
      return {
        ...deck,
        cards: deck.cards.map(card => {
          if (card.id !== cardId) return card;
          
          let nextInterval = 0;
          let nextLevel = card.level;

          switch(difficulty) {
            case 'again': 
              nextLevel = Math.max(0, card.level - 1); 
              nextInterval = 0;
              break;
            case 'hard': 
              nextLevel = card.level; 
              nextInterval = (card.lastInterval || 1) * 1.2; 
              break;
            case 'good': 
              nextLevel = card.level + 1; 
              nextInterval = (card.lastInterval || 1) * 2.5; 
              break;
            case 'easy': 
              nextLevel = card.level + 2; 
              nextInterval = (card.lastInterval || 1) * 4; 
              break;
          }
          if (nextLevel < 1 && (difficulty === 'good' || difficulty === 'easy')) nextLevel = 1;

          return {
            ...card,
            level: nextLevel,
            lastInterval: nextInterval,
            nextReview: now + (nextInterval * dayMs)
          };
        })
      };
    });
    saveDecks(newDecks);
  };

  const getActiveDeckCards = () => {
    if (!activeDeckId) return [];
    const deck = decks.find(d => d.id === activeDeckId);
    if (!deck) return [];
    const now = Date.now();
    return deck.cards.filter(c => c.nextReview <= now || c.level === 0);
  };

  if (activeDeckId) {
    const cards = getActiveDeckCards();
    if (cards.length === 0) {
      alert("Dieses Deck ist für heute erledigt!");
      setActiveDeckId(null);
    } else {
      return (
        <FlashcardPlayer 
          cards={cards} 
          onReview={handleReview} 
          onClose={() => setActiveDeckId(null)}
        />
      );
    }
  }

  // Edit Mode View
  if (editingDeckId) {
    const deck = decks.find(d => d.id === editingDeckId);
    if (!deck) { setEditingDeckId(null); return null; }

    return (
      <div className="max-w-4xl mx-auto space-y-10 lg:space-y-16 animate-in slide-in-from-right-12 duration-700 py-6 lg:py-10">
        <div className="flex justify-between items-center px-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-black dark:text-white truncate max-w-md">{deck.title} bearbeiten</h2>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{deck.cards.length} Karten im Stapel</p>
          </div>
          <button 
            onClick={() => setEditingDeckId(null)}
            className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-indigo-600 transition-colors"
          >
            Fertig & Schließen
          </button>
        </div>

        {/* Form to add manual card */}
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

        {/* List of cards in the deck */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4">Bestehende Karten</h3>
          <div className="grid grid-cols-1 gap-4">
            {deck.cards.map(card => (
              <div key={card.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 flex justify-between items-center group shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow pr-8">
                  <p className="text-sm font-bold dark:text-white border-r border-slate-50 dark:border-slate-800 pr-4">{card.front}</p>
                  <p className="text-sm text-slate-500 italic">{card.back}</p>
                </div>
                <button 
                  onClick={() => handleDeleteCard(deck.id, card.id)}
                  className="text-slate-200 hover:text-rose-500 transition-colors p-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
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

              <div className="space-y-3 max-h-[300px] lg:max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
                {availableDocuments.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => handleGenerateFromDoc(doc)}
                    disabled={isGenerating !== null}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl lg:rounded-2xl border-2 border-transparent hover:border-indigo-500/30 transition-all flex flex-col gap-1 text-left group active:scale-95"
                  >
                    <span className="text-xs lg:text-sm font-bold text-slate-800 dark:text-white truncate w-full group-hover:text-indigo-600">{doc.name}</span>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[8px] lg:text-[9px] font-black uppercase text-slate-400">{doc.type}</span>
                      <span className="text-[8px] lg:text-[9px] font-black uppercase text-indigo-600 opacity-60">
                        {isGenerating === doc.id ? 'KI lädt...' : 'KI-Erstellen →'}
                      </span>
                    </div>
                  </button>
                ))}
                {availableDocuments.length === 0 && (
                  <p className="text-[10px] text-slate-400 italic text-center py-4">Keine Dokumente für KI-Generierung verfügbar.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-[30px] lg:rounded-[48px] border border-slate-200 dark:border-slate-800 shadow-3d-deep overflow-hidden order-1 lg:order-2">
          <div className="p-6 lg:p-10 border-b border-slate-50 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 lg:gap-0">
            <h3 className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.3em] lg:tracking-[0.4em] text-slate-400">Deine Stapel ({decks.length})</h3>
            <div className="flex gap-4">
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
                        <h4 className="text-lg lg:text-xl font-black text-slate-900 dark:text-white truncate group-hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => setActiveDeckId(deck.id)}>
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
                          onClick={() => setActiveDeckId(deck.id)}
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
                          onClick={() => onGenerateQuizFromDeck(deck)}
                          disabled={isQuizLoading}
                          className="bg-white dark:bg-slate-800 border-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 px-4 py-3 rounded-xl lg:rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isQuizLoading ? '...' : <span>Quiz <EmojiImage emoji="🎯" size={12} /></span>}
                        </button>
                        <button 
                          onClick={() => saveDecks(decks.filter(d => d.id !== deck.id))}
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
