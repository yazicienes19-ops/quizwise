
import React from 'react';
import { FlashcardDeck } from '../types';
import { shareDeck } from '../services/sharedDecksService';
import { toast } from '../services/toast';

interface ExportDeckModalProps {
  deck: FlashcardDeck;
  userId?: string;
  onClose: () => void;
}

export const ExportDeckModal: React.FC<ExportDeckModalProps> = ({ deck, userId, onClose }) => {

  const handleShareLink = async () => {
    if (!userId) {
      toast.error('Bitte zuerst einloggen, um Decks zu teilen.');
      return;
    }
    try {
      const id = await shareDeck(deck.id, deck.title, deck.cards, userId);
      const url = `${window.location.origin}/shared/${id}`;
      await navigator.clipboard.writeText(url);
      toast.success('Link kopiert! Teile ihn mit deinen Kommilitonen.');
      onClose();
    } catch (e: any) {
      if (e?.code === '23505') {
        const url = `${window.location.origin}/shared/${deck.id}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        toast.success('Link kopiert (Deck bereits geteilt)!');
        onClose();
      } else {
        toast.error('Teilen fehlgeschlagen. Bitte versuche es erneut.');
      }
    }
  };

  const handleCsvExport = () => {
    const lines = deck.cards.map(c => {
      const front = c.front.replace(/\t/g, ' ').replace(/\n/g, ' ');
      const back  = c.back.replace(/\t/g, ' ').replace(/\n/g, ' ');
      return `${front}\t${back}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.title.replace(/[^a-z0-9äöüß]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportiert. In Anki oder Quizlet importierbar.');
    onClose();
  };

  const handlePdfExport = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const margin = 18;
    const pageW  = 210;
    const colW   = (pageW - margin * 2 - 14) / 2; // two equal columns, 14mm for number col
    const numColX   = margin;
    const frontColX = margin + 14;
    const backColX  = margin + 14 + colW + 4;
    let y = margin;

    const lineHeight = (size: number) => size * 0.37;

    const cell = (
      text: string,
      x: number,
      maxW: number,
      size: number,
      bold: boolean,
      color: [number, number, number],
    ): number => {
      doc.setFontSize(size);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(String(text), maxW);
      lines.forEach((ln: string, i: number) => doc.text(ln, x, y + i * lineHeight(size)));
      return lines.length * lineHeight(size);
    };

    // ── Header ──────────────────────────────────────────────────────────
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 28, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('QuizWise Karteikarten', margin, 10);

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(deck.title, margin, 20);

    const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`${deck.cards.length} Karten · ${dateStr}`, pageW - margin, 10, { align: 'right' });

    y = 36;

    // ── Column Headers ───────────────────────────────────────────────────
    doc.setFillColor(99, 102, 241);
    doc.rect(margin, y - 4, pageW - margin * 2, 8, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Nr.', numColX + 2, y + 1);
    doc.text('Vorderseite', frontColX, y + 1);
    doc.text('Rückseite', backColX, y + 1);

    y += 10;

    // ── Cards ────────────────────────────────────────────────────────────
    deck.cards.forEach((card, i) => {
      const frontLines = doc.splitTextToSize(card.front, colW - 4);
      const backLines  = doc.splitTextToSize(card.back, colW - 4);
      const rowH = Math.max(frontLines.length, backLines.length) * lineHeight(10) + 5;

      if (y + rowH > 282) {
        doc.addPage();
        y = margin;
      }

      // alternating row background
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 3, pageW - margin * 2, rowH, 'F');
      }

      // Nr
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(String(i + 1), numColX + 2, y + 1);

      // Front
      cell(card.front, frontColX, colW - 4, 10, true, [15, 23, 42]);

      // Back
      const backY = y;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 100);
      const backSplit = doc.splitTextToSize(card.back, colW - 4);
      backSplit.forEach((ln: string, li: number) => doc.text(ln, backColX, backY + li * lineHeight(10)));

      // subtle divider
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, y + rowH - 1, pageW - margin, y + rowH - 1);

      y += rowH;
    });

    // page numbers
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      doc.text(`${p} / ${totalPages}`, pageW / 2, 292, { align: 'center' });
    }

    doc.save(`${deck.title.replace(/[^a-z0-9äöüß]/gi, '_')}.pdf`);
    toast.success('PDF erstellt.');
    onClose();
  };

  const handleJsonExport = () => {
    const data = {
      title: deck.title,
      exportedAt: new Date().toISOString(),
      cards: deck.cards.map(c => ({ front: c.front, back: c.back })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.title.replace(/[^a-z0-9äöüß]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const options = [
    {
      key: 'link',
      label: 'Link teilen',
      description: 'Freunde importieren das Deck direkt in QuizWise',
      badge: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      ),
      iconBg:   'bg-indigo-100 dark:bg-indigo-900/40',
      iconHover:'group-hover:bg-indigo-200 dark:group-hover:bg-indigo-900/60',
      iconColor:'text-indigo-600 dark:text-indigo-400',
      rowHover: 'hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/20',
      chevron:  'group-hover:text-indigo-500',
      onClick: handleShareLink,
    },
    {
      key: 'csv',
      label: 'Als CSV exportieren',
      description: 'Anki- & Quizlet-kompatibel, auch ohne QuizWise nutzbar',
      badge: 'Anki · Quizlet',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      ),
      iconBg:   'bg-emerald-100 dark:bg-emerald-900/40',
      iconHover:'group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60',
      iconColor:'text-emerald-600 dark:text-emerald-400',
      rowHover: 'hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20',
      chevron:  'group-hover:text-emerald-500',
      onClick: handleCsvExport,
    },
    {
      key: 'pdf',
      label: 'Als PDF exportieren',
      description: 'Druckbar und tabellarisch, auch ohne App nutzbar',
      badge: 'Drucken · Teilen',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
      ),
      iconBg:   'bg-rose-100 dark:bg-rose-900/40',
      iconHover:'group-hover:bg-rose-200 dark:group-hover:bg-rose-900/60',
      iconColor:'text-rose-600 dark:text-rose-400',
      rowHover: 'hover:border-rose-300 dark:hover:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20',
      chevron:  'group-hover:text-rose-500',
      onClick: handlePdfExport,
    },
    {
      key: 'json',
      label: 'Als JSON sichern',
      description: 'QuizWise-Format, direkt wieder importierbar',
      badge: null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      ),
      iconBg:   'bg-slate-100 dark:bg-slate-800',
      iconHover:'group-hover:bg-slate-200 dark:group-hover:bg-slate-700',
      iconColor:'text-slate-500 dark:text-slate-400',
      rowHover: 'hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50',
      chevron:  'group-hover:text-slate-500',
      onClick: handleJsonExport,
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-md shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start px-8 py-6 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0 flex-1 pr-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Exportieren & Teilen</p>
            <h2 className="text-xl font-black dark:text-white break-words">{deck.title}</h2>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{deck.cards.length} Karten</p>
          </div>
          <button aria-label="Schließen"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Options */}
        <div className="px-6 py-6 space-y-3">
          {options.map(opt => (
            <button
              key={opt.key}
              onClick={opt.onClick}
              className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-800 ${opt.rowHover} transition-all group text-left`}
            >
              <div className={`w-10 h-10 rounded-xl ${opt.iconBg} ${opt.iconHover} flex items-center justify-center shrink-0 transition-colors`}>
                <span className={opt.iconColor}>{opt.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black dark:text-white">{opt.label}</p>
                  {opt.badge && (
                    <span className="text-[8px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{opt.description}</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-300 ${opt.chevron} transition-colors shrink-0`}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
