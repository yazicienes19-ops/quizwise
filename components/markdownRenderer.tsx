import React from 'react';

export function parseInline(text: string, baseKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0; let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0]; const k = `${baseKey}-${match.index}`;
    if (token.startsWith('**'))      parts.push(<strong key={k} className="font-black text-slate-900 dark:text-white">{token.slice(2,-2)}</strong>);
    else if (token.startsWith('*'))  parts.push(<em key={k} className="italic text-slate-600 dark:text-slate-300">{token.slice(1,-1)}</em>);
    else                             parts.push(<code key={k} className="px-1.5 py-0.5 rounded-md text-[0.85em] font-mono bg-slate-100 dark:bg-slate-800" style={{ color: 'var(--primary)' }}>{token.slice(1,-1)}</code>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
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
    if (line.match(/^(Grundlagen|Vertiefung|Kontext|Stufe\s*\d*|Phase\s*\d*)[\s:]/i)) {
      blocks.push(<h3 key={key++} className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">{parseInline(line,String(key))}</h3>); i++; continue;
    }
    if (line.startsWith('Allgemeinwissen:')) {
      const content: string[] = [line.replace('Allgemeinwissen:','').trim()]; i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].match(/^[-*•]\s/) && !lines[i].match(/^\d+\.\s/)) { content.push(lines[i]); i++; }
      blocks.push(<div key={key++} className="px-5 py-4 rounded-2xl" style={{ background:'color-mix(in srgb,var(--primary) 8%,transparent)', border:'1px solid color-mix(in srgb,var(--primary) 20%,transparent)' }}><p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color:'var(--primary)' }}>Externes Wissen</p><p className="text-base font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(content.join(' '),String(key))}</p></div>);
      continue;
    }
    if (line.match(/^[-*•]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*•]\s/)) { items.push(lines[i].replace(/^[-*•]\s/,'')); i++; }
      blocks.push(<ul key={key++} className="space-y-2 pl-1">{items.map((item,idx) => <li key={idx} className="flex gap-2.5 items-start text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed"><span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background:'var(--primary)' }}/><span>{parseInline(item,`${key}-${idx}`)}</span></li>)}</ul>);
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) { items.push(lines[i].replace(/^\d+\.\s/,'')); i++; }
      blocks.push(<ol key={key++} className="space-y-2 pl-1">{items.map((item,idx) => <li key={idx} className="flex gap-3 items-start text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed"><span className="font-black shrink-0 w-6 text-right" style={{ color:'var(--primary)' }}>{idx+1}.</span><span>{parseInline(item,`${key}-${idx}`)}</span></li>)}</ol>);
      continue;
    }
    const paraLines: string[] = [line]; i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].match(/^[-*•]\s/) && !lines[i].match(/^\d+\.\s/) && !lines[i].startsWith('Allgemeinwissen:') && !lines[i].match(/^(Grundlagen|Vertiefung|Kontext|Stufe\s*\d*|Phase\s*\d*)[\s:]/i)) { paraLines.push(lines[i]); i++; }
    blocks.push(<p key={key++} className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(paraLines.join(' '),String(key))}</p>);
  }
  return <div className="space-y-5">{blocks}</div>;
}
