import { describe, it, expect } from 'vitest';
import { detectUrlKind, normalizeUrl } from './urlImport';

describe('detectUrlKind', () => {
  it('erkennt normale YouTube-Watch-Links', () => {
    expect(detectUrlKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectUrlKind('https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('youtube');
    expect(detectUrlKind('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
  });

  it('erkennt Kurz-, Shorts- und Live-Links', () => {
    expect(detectUrlKind('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(detectUrlKind('https://www.youtube.com/shorts/abc123def45')).toBe('youtube');
    expect(detectUrlKind('https://www.youtube.com/live/abc123def45')).toBe('youtube');
  });

  it('erkennt YouTube auch ohne Protokoll', () => {
    expect(detectUrlKind('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(detectUrlKind('youtu.be/dQw4w9WgXcQ')).toBe('youtube');
  });

  it('behandelt Kanal- und Playlist-Seiten nicht als Video', () => {
    expect(detectUrlKind('https://www.youtube.com/@some-channel')).toBeNull();
    expect(detectUrlKind('https://www.youtube.com/playlist?list=PL123')).toBeNull();
    expect(detectUrlKind('https://www.youtube.com/')).toBeNull();
  });

  it('stuft sonstige Webseiten als web ein', () => {
    expect(detectUrlKind('https://de.wikipedia.org/wiki/Klassische_Konditionierung')).toBe('web');
    expect(detectUrlKind('spektrum.de/lexikon/psychologie')).toBe('web');
  });

  it('lehnt Nicht-URLs und andere Protokolle ab', () => {
    expect(detectUrlKind('nur ein satz mit worten')).toBeNull();
    expect(detectUrlKind('ftp://example.com/datei')).toBeNull();
    expect(detectUrlKind('')).toBeNull();
    expect(detectUrlKind('localhost')).toBeNull();
  });
});

describe('normalizeUrl', () => {
  it('ergänzt fehlendes https://', () => {
    expect(normalizeUrl('example.com/artikel')).toBe('https://example.com/artikel');
  });

  it('lässt vollständige URLs unverändert', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com');
  });
});
