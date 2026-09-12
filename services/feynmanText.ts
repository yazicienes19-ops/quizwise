/**
 * feynmanText — Textpflege rund um die Feynman-Methode.
 *
 * 1. stripFeynmanMeta: Das Modell leitete Aufgaben gern mit Meta-Floskeln ein
 *    ("Erkläre nach der Feynman-Technik in einfachen Worten, wie …"). Die
 *    Zielgruppe zeigt die App ohnehin über der Frage an ("Du erklärst es einem
 *    Zwölfjährigen"), die Floskel ist also doppelt und macht die Frage lang.
 * 2. filterLeakyGapCards: Karten aus Feynman-Lücken, deren Vorderseite die
 *    Antwort schon verrät, sind wertlos (User-Befund 12.09.2026: vorher stand
 *    die Lücke wörtlich vorne und hinten). Solche Karten werden verworfen.
 */

const META_PATTERNS: RegExp[] = [
  /\s*(?:nach|mit|gemäß|anhand|mithilfe)\s+der\s+Feynman[-\s]?(?:Technik|Methode)/gi,
  /\s*(?:using|with|following)\s+the\s+Feynman\s+(?:technique|method)/gi,
  /\s*(?:in|mit)\s+(?:ganz\s+|möglichst\s+|sehr\s+)?einfachen\s+Worten/gi,
  /\s*in\s+(?:very\s+)?simple\s+(?:terms|words)/gi,
  /,?\s*so,?\s+dass\s+(?:es\s+)?(?:ein|eine)\s+(?:zwölfjährige[rs]?\s+)?(?:Kind|Laie|Zwölfjährige[rs]?)\s+(?:es\s+)?versteh\w*,?/gi,
];

export const stripFeynmanMeta = (question: string): string => {
  if (!question) return question;
  let s = question;
  for (const p of META_PATTERNS) s = s.replace(p, '');
  s = s.replace(/\s+,/g, ',').replace(/,{2,}/g, ',').replace(/\s{2,}/g, ' ').trim();
  // Übrig gebliebenes Komma direkt vor dem Satzende oder am Anfang entfernen.
  s = s.replace(/,\s*([.?!])$/, '$1').replace(/^,\s*/, '');
  if (s.length < 10) return question.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const contentWords = (s: string) => normalize(s).split(' ').filter(w => w.length > 4);

/** true, wenn die Vorderseite die Rückseite (fast) wörtlich enthält. */
export const frontLeaksAnswer = (front: string, back: string): boolean => {
  const f = normalize(front);
  const b = normalize(back);
  if (!f || !b) return true;
  if (/was fehlte/.test(f)) return true;
  if (b.length >= 20 && f.includes(b)) return true;
  const words = [...new Set(contentWords(back))];
  if (words.length < 4) return false;
  const frontWords = new Set(contentWords(front));
  const shared = words.filter(w => frontWords.has(w)).length;
  return shared / words.length >= 0.8;
};

export const filterLeakyGapCards = (raw: unknown): { front: string; back: string }[] => {
  const seen = new Set<string>();
  return (Array.isArray(raw) ? raw : []).flatMap((c: any) => {
    const front = typeof c?.front === 'string' ? c.front.trim() : '';
    const back = typeof c?.back === 'string' ? c.back.trim() : '';
    const key = normalize(front);
    if (!front || !back || !key || seen.has(key) || frontLeaksAnswer(front, back)) return [];
    seen.add(key);
    return [{ front, back }];
  });
};
