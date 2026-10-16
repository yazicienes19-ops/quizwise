/**
 * Höchstens ein Lauf gleichzeitig: ein zweiter Aufruf, solange der erste
 * läuft, wird ignoriert (Doppelklick auf "Erstellen" = ein Eintrag).
 */
export const createRunGuard = () => {
  let running = false;
  return {
    get running() { return running; },
    run: async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (running) return undefined;
      running = true;
      try { return await fn(); } finally { running = false; }
    },
  };
};
