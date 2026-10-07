import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StudioDiagram } from './StudioDiagram';
import { parseDiagram } from '../services/studioDiagrams';
import { I18nProvider } from '../i18n/I18nProvider';

const wrap = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

const cite = (refs: { n: number; page?: number }[], key: string) =>
  <span key={key} data-testid="cite">{refs.map(r => `${r.n}:${r.page ?? ''}`).join(',')}</span>;

afterEach(cleanup);

describe('StudioDiagram', () => {
  it('zeichnet einen Ablauf mit Schrittnummern, Details und Fußnoten', () => {
    const d = parseDiagram('{"type":"flow","title":"Gross","steps":[{"label":"Auswahl","cite":"1:3"},{"label":"Umbewertung","detail":"Bewertung ändern"}]}')!;
    wrap(<StudioDiagram diagram={d} renderCite={cite} />);
    expect(screen.getByText('Gross')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Bewertung ändern')).toBeTruthy();
    expect(screen.getByTestId('cite').textContent).toBe('1:3');
  });

  it('zeichnet Baum mit dritter Ebene und Vergleich', () => {
    const tree = parseDiagram('{"type":"tree","root":{"label":"Verstärkung","children":[{"label":"positiv","children":[{"label":"Lob"}]},{"label":"negativ"}]}}')!;
    const { unmount } = wrap(<StudioDiagram diagram={tree} renderCite={cite} />);
    expect(screen.getByText('Verstärkung')).toBeTruthy();
    expect(screen.getByText('Lob')).toBeTruthy();
    unmount();
    const cmp = parseDiagram('{"type":"compare","columns":[{"label":"Angst","points":["diffus"]},{"label":"Furcht","points":["konkret","angemessen"]}]}')!;
    wrap(<StudioDiagram diagram={cmp} renderCite={cite} />);
    expect(screen.getByText('Furcht')).toBeTruthy();
    expect(screen.getByText('angemessen')).toBeTruthy();
  });
});

describe('StudioDiagram neue Typen', () => {
  it('Kurve, Vierfeldertafel und Kreislauf zeichnen ohne Fehler', () => {
    const curve = parseDiagram('{"type":"curve","title":"Yerkes-Dodson","xLabel":"Erregung","yLabel":"Leistung","series":[{"label":"einfach","points":[[0,1],[6,9],[10,4]]}]}')!;
    const { unmount } = wrap(<StudioDiagram diagram={curve} renderCite={cite} />);
    expect(screen.getByText('Erregung')).toBeTruthy();
    expect(document.querySelectorAll('path[stroke-width="3"]')).toHaveLength(1);
    unmount();
    const m = parseDiagram('{"type":"matrix","rows":["internal","external"],"cols":["stabil","variabel"],"cells":[[{"label":"Fähigkeit"},{"label":"Anstrengung"}],[{"label":"Schwierigkeit"},{"label":"Zufall"}]]}')!;
    const r2 = wrap(<StudioDiagram diagram={m} renderCite={cite} />);
    expect(screen.getByText('Zufall')).toBeTruthy();
    r2.unmount();
    const cy = parseDiagram('{"type":"cycle","steps":[{"label":"Angst"},{"label":"Vermeidung"},{"label":"Erleichterung"}]}')!;
    wrap(<StudioDiagram diagram={cy} renderCite={cite} />);
    expect(screen.getAllByText('Vermeidung')).toHaveLength(2);
  });
});

describe('StudioDiagram VS', () => {
  it('zeigt beide Seiten, VS und die Merkmale', () => {
    const d = parseDiagram('{"type":"versus","left":{"label":"Furcht"},"right":{"label":"Angst"},"rows":[{"aspect":"Auslöser","left":"konkrete Gefahr","right":"diffus"},{"aspect":"Dauer","left":"endet","right":"chronisch"}]}')!;
    wrap(<StudioDiagram diagram={d} renderCite={cite} />);
    expect(screen.getByText('VS')).toBeTruthy();
    expect(screen.getByText('Auslöser')).toBeTruthy();
    expect(screen.getByText('chronisch')).toBeTruthy();
  });
});
