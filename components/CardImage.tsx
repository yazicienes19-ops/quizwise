import React, { useEffect, useState } from 'react';
import { getCardImageUrl } from '../services/cardImages';

interface Props {
  path?: string;
  /** Vorschau eines noch nicht hochgeladenen Bildes (Objekt-URL). */
  previewUrl?: string;
  alt: string;
  className?: string;
}

/** Zeigt ein Kartenbild über einen signierten Link; unsichtbar, wenn es nicht geladen werden kann. */
export const CardImage: React.FC<Props> = ({ path, previewUrl, alt, className }) => {
  const [url, setUrl] = useState<string | null>(previewUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (previewUrl) { setUrl(previewUrl); return; }
    if (!path) { setUrl(null); return; }
    let cancelled = false;
    getCardImageUrl(path).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [path, previewUrl]);

  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className ?? 'max-h-[40vh] max-w-full mx-auto rounded-xl object-contain'}
    />
  );
};
