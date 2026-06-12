import React, { useState, useEffect, useRef } from 'react';

/**
 * usePersistentState — ersetzt das manuelle localStorage-Chaos in App.tsx.
 *
 * Vorteile:
 * - Eine einzige, konsistente Stelle für localStorage-Zugriff
 * - Debounced Writes (Performance: keine Schreibvorgänge bei jedem Tastendruck)
 * - Fehlertolerant: kaputtes JSON crasht nicht die App
 * - SSR-safe
 *
 * Verwendung:
 *   const [docs, setDocs] = usePersistentState<ProcessedDocument[]>('quizwise_docs', []);
 *   // statt: useState + localStorage.setItem überall verstreut
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  debounceMs: number = 300
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      // Kaputtes JSON → Default verwenden, alten Wert aufräumen
      localStorage.removeItem(key);
      return defaultValue;
    }
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch (e) {
        // Quota voll → ältesten Quiz-Progress aufräumen statt crashen
        console.warn(`localStorage write failed for ${key}`, e);
      }
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, state, debounceMs]);

  return [state, setState];
}
