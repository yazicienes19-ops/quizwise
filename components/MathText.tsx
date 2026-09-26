import React, { useEffect, useState } from 'react';

/**
 * Text mit Formeln: LaTeX zwischen $...$, $$...$$, \(...\), \[...\] wird mit
 * KaTeX gesetzt, der Rest bleibt reiner Text. KaTeX (rund 250 KB) lädt erst,
 * wenn ein Text wirklich eine Formel enthält; bis dahin steht der Text roh da.
 */
const HAS_MATH = /\$[^$\n]*\S\$|\\\(|\\\[/;

type Renderer = (text: string, baseKey?: string) => React.ReactNode[];
let renderer: Renderer | null = null;
let loading: Promise<Renderer> | null = null;
const loadRenderer = (): Promise<Renderer> => {
  loading ??= import('./markdownRenderer').then(m => { renderer = m.renderMathText; return renderer; });
  return loading;
};

export const MathText: React.FC<{ text: string }> = ({ text }) => {
  const needsMath = HAS_MATH.test(text);
  const [ready, setReady] = useState(() => !needsMath || renderer !== null);
  useEffect(() => {
    if (!needsMath || renderer) return;
    let alive = true;
    void loadRenderer().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [needsMath]);
  if (!needsMath || !ready || !renderer) return <>{text}</>;
  return <>{renderer(text)}</>;
};
