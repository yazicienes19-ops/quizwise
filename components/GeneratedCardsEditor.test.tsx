import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GeneratedCardsEditor, type DraftCard } from './GeneratedCardsEditor';
import { I18nProvider } from '../i18n/I18nProvider';
import { setLocale } from '../i18n';

const makeCards = (n: number): DraftCard[] => Array.from({ length: n }, (_, i) => ({
  id: `c${i}`, front: `Frage ${i + 1}`, back: `Antwort ${i + 1}`, tags: [i < 30 ? 'Kapitel1' : 'Kapitel2'],
}));

const Harness: React.FC<{ n: number; onCards?: (c: DraftCard[]) => void }> = ({ n, onCards }) => {
  const [state, setState] = useState({ title: 'Stapel', cards: makeCards(n) });
  return (
    <I18nProvider>
      <GeneratedCardsEditor title={state.title} cards={state.cards} makeId={() => `neu${Math.random()}`}
        onChange={next => { setState(next); onCards?.(next.cards); }} />
    </I18nProvider>
  );
};

const shownFronts = () => screen.queryAllByLabelText(/^Vorderseite Karte/).length;

describe('GeneratedCardsEditor bei vielen Karten', () => {
  beforeEach(() => setLocale('de'));
  afterEach(cleanup);

  it('kleine Stapel: alle Karten, keine Suche', () => {
    render(<Harness n={20} />);
    expect(shownFronts()).toBe(20);
    expect(screen.queryByLabelText('Karten durchsuchen')).toBeNull();
  });

  it('zeigt bei 120 Karten zuerst 50 und lädt schrittweise nach', () => {
    render(<Harness n={120} />);
    expect(shownFronts()).toBe(50);
    fireEvent.click(screen.getByRole('button', { name: /Weitere 50 anzeigen \(noch 70\)/ }));
    expect(shownFronts()).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: /Weitere 20 anzeigen/ }));
    expect(shownFronts()).toBe(120);
  });

  it('Suche filtert, Nummern bleiben die Position im Stapel', () => {
    render(<Harness n={120} />);
    fireEvent.change(screen.getByLabelText('Karten durchsuchen'), { target: { value: 'Frage 111' } });
    expect(shownFronts()).toBe(1);
    expect(screen.getByLabelText('Vorderseite Karte 111')).toBeTruthy();
  });

  it('entfernt alle Karten eines Schlagworts auf einmal und holt sie zurück', () => {
    let latest: DraftCard[] = [];
    render(<Harness n={120} onCards={c => { latest = c; }} />);
    fireEvent.change(screen.getByLabelText('Nach Schlagwort filtern'), { target: { value: 'Kapitel1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Alle 30 entfernen' }));
    expect(latest.filter(c => c.removed).length).toBe(30);
    expect(latest.filter(c => c.removed).every(c => c.tags?.includes('Kapitel1'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Alle 30 zurückholen' }));
    expect(latest.some(c => c.removed)).toBe(false);
  });
});
