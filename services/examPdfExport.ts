import type { ExamQuestion } from '../types';
import type { jsPDF as JsPDFType } from 'jspdf';
import { formatCorrectAnswer } from './examAnswerFormat';
import { formatDate } from '../i18n/dates';

/**
 * PDF-Export für eine gespeicherte, noch NICHT abgelegte Klausur (SavedExam,
 * services/savedExamsService.ts) — Pendant zu ExamView.tsx handleExportPdf,
 * das nur für bereits ausgewertete Klausuren gilt (Note/eigene Antwort). Hier
 * gibt es keine Nutzer-Antwort, nur Frage + Lösung (formatCorrectAnswer,
 * dieselbe Quelle wie Archiv/Ergebnis-PDF).
 */
export const exportSavedExamToPdf = async (
  title: string,
  savedAt: number,
  questions: ExamQuestion[],
  t: (k: any, p?: any) => string,
): Promise<void> => {
  const { jsPDF } = await import('jspdf');
  const doc: JsPDFType = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, margin = 18, lw = W - 2 * margin;
  let y = margin;

  const addText = (text: string, size: number, bold: boolean, color: [number, number, number] = [0, 0, 0]) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, lw) as string[];
    lines.forEach(line => {
      if (y > 275) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += size * 0.4;
    });
    y += 2;
  };

  addText(title, 22, true);
  addText(formatDate(savedAt, { day: '2-digit', month: 'long', year: 'numeric' }), 9, false, [120, 120, 120]);
  y += 4;

  questions.forEach((q, i) => {
    if (y > 260) { doc.addPage(); y = margin; }
    addText(`${i + 1}. ${q.question}`, 10, true);
    if (q.type === 'mc' && q.options?.length) {
      q.options.forEach((opt, idx) => addText(`${String.fromCharCode(97 + idx)}) ${opt}`, 9, false, [60, 60, 60]));
    }
    addText(t('ev.pdf.correct', { text: formatCorrectAnswer(q, t) }), 9, false, [16, 185, 129]);
    y += 2;
  });

  doc.save(`StudeArc_${title.replace(/[^a-z0-9]+/gi, '_')}.pdf`);
};
