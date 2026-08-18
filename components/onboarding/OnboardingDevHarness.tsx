import React, { useState } from 'react';
import type { OnboardingProfile, ProcessedDocument } from '../../types';
import { OnboardingFlow } from './OnboardingFlow';
import { resetOnboarding } from './onboardingState';

/** Realistischer mehrkapitliger Text, damit detectChaptersForDoc (echte
 *  Regex-Erkennung, kein Fake) im Harness tatsächlich Kapitel findet. */
const FIXTURE_TEXT = `Kapitel 1: Klassische Konditionierung

Iwan Pawlow entdeckte, dass Hunde beim Anblick von Futter zu speicheln beginnen. Durch wiederholte Kopplung eines neutralen Reizes (Glocke) mit dem unkonditionierten Reiz (Futter) lernten die Hunde, bereits auf die Glocke allein mit Speichelfluss zu reagieren.

Kapitel 2: Operante Konditionierung

B.F. Skinner untersuchte, wie Konsequenzen das Verhalten formen. Verstärkung erhöht die Wahrscheinlichkeit eines Verhaltens, Bestrafung senkt sie. Die Skinner-Box diente als zentrales Versuchsinstrument.

Kapitel 3: Gedächtnismodelle

Das Mehrspeichermodell unterscheidet sensorisches Gedächtnis, Kurzzeitgedächtnis und Langzeitgedächtnis. Informationen durchlaufen diese Stufen, wobei nur ein Teil ins Langzeitgedächtnis übergeht.`;

/**
 * Temporärer Test-Harness für Phase 2/3 (Screens 1-8, noch nicht in App.tsx
 * verdrahtet) — anders als GraphDevHarness KEINE dauerhafte Infrastruktur,
 * wird in Phase 4 wieder entfernt, sobald OnboardingFlow den echten Mount-
 * Punkt in App.tsx ersetzt. Erreichbar nur über ?onboardingFlowPreview=1 +
 * import.meta.env.DEV (s. index.tsx), exakt dieselbe doppelte Absicherung
 * wie beim Wissensnetz-Harness.
 *
 * handleFileUpload ist hier simuliert (kein Supabase/Backend im Harness) —
 * die eigentliche Themenerkennung (services/chapterService.ts) läuft aber
 * ECHT gegen den Fixture-Text, kein Fake.
 */
export const OnboardingDevHarness: React.FC = () => {
  const [result, setResult] = useState<Partial<OnboardingProfile> | null>(null);
  const [startContext, setStartContext] = useState<{ docId?: string } | undefined>(undefined);
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);

  const fakeHandleFileUpload = async (file: File): Promise<string | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const doc: ProcessedDocument = {
      id: Math.random().toString(36).slice(2, 9),
      name: file.name,
      content: FIXTURE_TEXT,
      type: 'text',
      uploadDate: Date.now(),
    };
    setDocuments(docs => [...docs, doc]);
    return doc.id;
  };

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--bg-main)' }}>
        <div className="max-w-lg w-full">
          <h1 className="text-lg font-black mb-4" style={{ color: 'var(--text-main)' }}>Onboarding abgeschlossen (Phase 3)</h1>
          <pre className="text-xs p-4 rounded-xl overflow-auto" style={{ background: 'var(--bg-sidebar)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
            {JSON.stringify({ profile: result, startContext }, null, 2)}
          </pre>
          <button
            className="mt-4 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            onClick={() => { resetOnboarding(); setResult(null); setStartContext(undefined); setDocuments([]); }}
          >
            Neu starten
          </button>
        </div>
      </div>
    );
  }

  // Kein echtes Layout im Harness (isolierte Fixture, s. Datei-Kommentar) —
  // Tour-Schritte finden ihr data-tour-Ziel deshalb nicht und degradieren
  // erwartungsgemäß auf die einfache zentrierte Karte ohne Spotlight.
  return (
    <OnboardingFlow
      handleFileUpload={fakeHandleFileUpload}
      documents={documents}
      setActiveTab={() => {}}
      onComplete={(profile, ctx) => { setResult(profile); setStartContext(ctx); }}
    />
  );
};
