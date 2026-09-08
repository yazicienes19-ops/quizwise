import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { t } from '../i18n';

// Erklärer-Überschriften beider Sprachen (DE + TR) für die Block-Erkennung.
// Trennzeichen nach dem Überschriftswort ist optional: steht die Überschrift
// ALLEIN auf ihrer Zeile (der Normalfall), folgt direkt das Zeilenende, kein
// Leerzeichen/Doppelpunkt mehr — (?:[\s:]|$) deckt beides ab.
const HEADING_RE = /^(Grundlagen|Vertiefung|Kontext|Temel Bilgiler|Derinlemesine|Bağlam|Basics|Deep Dive|Context|Stufe\s*\d*|Phase\s*\d*|Aşama\s*\d*|Level\s*\d*)(?:[\s:]|$)/i;

// Gemini gibt Formeln als LaTeX aus ($...$, $$...$$, \(...\), \[...\]) — ohne
// KaTeX kam das bisher als rohe Zeichenkette mit Dollarzeichen/Backslashes
// beim Nutzer an (live am YouTube-Import-Digest verifiziert, 2026-08-31).
// throwOnError: false + strict: 'ignore', weil KI-generiertes LaTeX gelegentlich
// leicht von der strengen Syntax abweicht — lieber best-effort rendern als
// die ganze Antwort mit einer roten Fehlermeldung zu sprengen.
function renderMath(latex: string, displayMode: boolean, key: string): React.ReactNode {
  try {
    const html = katex.renderToString(latex.trim(), { throwOnError: false, strict: 'ignore', displayMode });
    return displayMode
      ? <div key={key} className="overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: html }} />
      : <span key={key} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    // Absoluter Fallback, falls katex selbst wirft (throwOnError deckt nicht
    // jeden Fall ab) — Originaltext statt Absturz der ganzen Nachricht.
    return <span key={key}>{displayMode ? `$$${latex}$$` : `$${latex}$`}</span>;
  }
}

export function parseInline(text: string, baseKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Math-Delimiter zuerst in der Alternation (sonst würde z.B. ein "*" in
  // "$x^2 * y$" die Kursiv-Erkennung fälschlich zünden, bevor Math greift).
  const regex = /(\$\$[^$]+?\$\$|\\\[[^\]]+?\\\]|\\\([^)]+?\\\)|\$[^$\n]+?\$|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0; let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0]; const k = `${baseKey}-${match.index}`;
    // Inline-Kontext (innerhalb eines <p>/<li>) — auch $$...$$/\[...\] hier
    // bewusst NICHT im Display-Modus rendern, das würde ein <div> in einen
    // <p>-Tag setzen. Echte Display-Formeln laufen über den Block-Zweig in
    // renderMarkdown (eigene Zeile mit $$...$$), der displayMode:true nutzt.
    if (token.startsWith('$$'))        parts.push(renderMath(token.slice(2,-2), false, k));
    else if (token.startsWith('\\['))  parts.push(renderMath(token.slice(2,-2), false, k));
    else if (token.startsWith('\\('))  parts.push(renderMath(token.slice(2,-2), false, k));
    else if (token.startsWith('$'))    parts.push(renderMath(token.slice(1,-1), false, k));
    // Inhalt rekursiv erneut durch parseInline schicken (nicht roh ausgeben) —
    // sonst gewinnt z.B. bei "**$s$**" der Bold-Regex an der Startposition
    // und verschluckt die Formel als literalen String statt sie zu rendern
    // (live gefunden: alle bold-umschlossenen Formeln blieben roh sichtbar).
    else if (token.startsWith('**'))   parts.push(<strong key={k} className="font-black text-slate-900 dark:text-white">{parseInline(token.slice(2,-2), k)}</strong>);
    else if (token.startsWith('*'))    parts.push(<em key={k} className="italic text-slate-600 dark:text-slate-300">{parseInline(token.slice(1,-1), k)}</em>);
    else                               parts.push(<code key={k} className="px-1.5 py-0.5 rounded-md text-[0.85em] font-mono bg-slate-100 dark:bg-slate-800" style={{ color: 'var(--primary)' }}>{token.slice(1,-1)}</code>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Sammelt Listenzeilen (Aufzählung/Nummerierung) über Leerzeilen zwischen
// Einträgen hinweg — das Modell trennt Listenpunkte gelegentlich durch eine
// Leerzeile (z.B. bei mehreren erklärten Unterbegriffen). Ohne diese Toleranz
// beendet jede Leerzeile die Liste und erzeugt pro Punkt eine eigene <ol>/<ul>,
// die bei der Nummerierung wieder bei "1." startet (live im Reader-Tutor
// gefunden: drei erklärte Unterbegriffe erschienen alle als "1.").
function collectListLines(lines: string[], start: number, itemRe: RegExp): { items: string[]; next: number } {
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    if (itemRe.test(lines[i])) { items.push(lines[i].replace(itemRe, '')); i++; continue; }
    if (!lines[i].trim()) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && itemRe.test(lines[j])) { i = j; continue; }
    }
    break;
  }
  return { items, next: i };
}

export function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0; let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('# '))   { blocks.push(<h2 key={key++} className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-2">{parseInline(line.slice(2),String(key))}</h2>); i++; continue; }
    if (line.startsWith('## '))  { blocks.push(<h3 key={key++} className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">{parseInline(line.slice(3),String(key))}</h3>); i++; continue; }
    if (line.startsWith('### ')) { blocks.push(<h4 key={key++} className="text-base lg:text-lg font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider mt-1">{parseInline(line.slice(4),String(key))}</h4>); i++; continue; }
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      // Modell setzt nicht immer verlässlich einen Zeilenumbruch nach der
      // Überschrift ("Grundlagen Der Text geht munter weiter…") — Überschrift
      // und Rest sauber trennen, statt den ganzen Satz in die Heading-Optik zu ziehen.
      const rest = line.slice(headingMatch[0].length).trim();
      blocks.push(<h3 key={key++} className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">{headingMatch[1]}</h3>);
      i++;
      if (rest) {
        const paraLines: string[] = [rest];
        while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].match(/^[-*•]\s/) && !lines[i].match(/^\d+\.\s/) && !lines[i].startsWith('Allgemeinwissen:') && !lines[i].trim().startsWith('$$') && !HEADING_RE.test(lines[i])) { paraLines.push(lines[i]); i++; }
        blocks.push(<p key={key++} className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(paraLines.join(' '),String(key))}</p>);
      }
      continue;
    }
    if (line.trim().startsWith('$$')) {
      // Eigenständige Display-Formel (own-line $$...$$, das übliche Muster
      // bei Gemini-Ausgaben) — im Gegensatz zur Inline-Erkennung in
      // parseInline hier mit displayMode:true (zentriert, größer).
      const opened = line.trim().slice(2);
      const mathLines: string[] = [opened];
      let closed = opened.endsWith('$$');
      if (closed) mathLines[0] = opened.slice(0, -2);
      i++;
      while (!closed && i < lines.length) {
        const l = lines[i];
        if (l.trim().endsWith('$$')) { mathLines.push(l.trim().slice(0, l.trim().length - 2)); closed = true; }
        else mathLines.push(l);
        i++;
      }
      blocks.push(<div key={key++} className="text-lg lg:text-xl text-slate-800 dark:text-slate-100">{renderMath(mathLines.join('\n'), true, String(key))}</div>);
      continue;
    }
    if (line.startsWith('Allgemeinwissen:')) {
      const content: string[] = [line.replace('Allgemeinwissen:','').trim()]; i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].match(/^[-*•]\s/) && !lines[i].match(/^\d+\.\s/)) { content.push(lines[i]); i++; }
      blocks.push(<div key={key++} className="px-5 py-4 rounded-2xl" style={{ background:'color-mix(in srgb,var(--primary) 8%,transparent)', border:'1px solid color-mix(in srgb,var(--primary) 20%,transparent)' }}><p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color:'var(--primary)' }}>{t('reader.externalKnowledge')}</p><p className="text-base font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(content.join(' '),String(key))}</p></div>);
      continue;
    }
    if (line.match(/^[-*•]\s/)) {
      const { items, next } = collectListLines(lines, i, /^[-*•]\s/);
      i = next;
      blocks.push(<ul key={key++} className="space-y-2 pl-1">{items.map((item,idx) => <li key={idx} className="flex gap-2.5 items-start text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed"><span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background:'var(--primary)' }}/><span>{parseInline(item,`${key}-${idx}`)}</span></li>)}</ul>);
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      const { items, next } = collectListLines(lines, i, /^\d+\.\s/);
      i = next;
      blocks.push(<ol key={key++} className="space-y-2 pl-1">{items.map((item,idx) => <li key={idx} className="flex gap-3 items-start text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed"><span className="font-black shrink-0 w-6 text-right" style={{ color:'var(--primary)' }}>{idx+1}.</span><span>{parseInline(item,`${key}-${idx}`)}</span></li>)}</ol>);
      continue;
    }
    const paraLines: string[] = [line]; i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].match(/^[-*•]\s/) && !lines[i].match(/^\d+\.\s/) && !lines[i].startsWith('Allgemeinwissen:') && !lines[i].trim().startsWith('$$') && !HEADING_RE.test(lines[i])) { paraLines.push(lines[i]); i++; }
    blocks.push(<p key={key++} className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(paraLines.join(' '),String(key))}</p>);
  }
  return <div className="space-y-5">{blocks}</div>;
}
