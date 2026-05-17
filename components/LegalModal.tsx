import React from 'react';
import { X } from 'lucide-react';

type LegalPage = 'impressum' | 'datenschutz' | 'agb';

interface LegalModalProps {
  page: LegalPage;
  onClose: () => void;
}

const CONTENT: Record<LegalPage, { title: string; body: React.ReactNode }> = {
  impressum: {
    title: 'Impressum',
    body: (
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <p className="text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl">
          ⚠️ Pflichtangaben gemäß § 5 TMG — bitte vor Launch vollständig ausfüllen.
        </p>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Angaben gemäß § 5 TMG</p>
          <p>[Vorname Nachname]</p>
          <p>[Straße Hausnummer]</p>
          <p>[PLZ Ort]</p>
          <p>Deutschland</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Kontakt</p>
          <p>E-Mail: [deine@email.de]</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</p>
          <p>[Vorname Nachname], [Adresse]</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Haftungsausschluss</p>
          <p>
            Die Inhalte dieser App wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit,
            Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.
            Die KI-generierten Inhalte dienen ausschließlich Lernzwecken und ersetzen keine
            professionelle Beratung.
          </p>
        </div>
      </div>
    ),
  },
  datenschutz: {
    title: 'Datenschutzerklärung',
    body: (
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <p className="text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl">
          ⚠️ Dies ist ein Platzhalter. Vor dem Launch eine vollständige DSGVO-konforme Erklärung eintragen (z. B. über e-recht24.de).
        </p>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">1. Verantwortlicher</p>
          <p>[Name und Adresse des Verantwortlichen]</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">2. Erhobene Daten</p>
          <p>
            Wir erheben folgende personenbezogene Daten bei der Registrierung und Nutzung der App:
            E-Mail-Adresse, Nutzungsdaten (Anzahl der KI-Anfragen), Zahlungsdaten (werden über
            Stripe verarbeitet und nicht direkt gespeichert).
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">3. Zweck der Verarbeitung</p>
          <p>
            Die Daten werden zur Bereitstellung des Dienstes, zur Abrechnung des Pro-Abonnements
            und zur Verbesserung der App-Qualität verwendet.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">4. Drittanbieter</p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Supabase</strong> (Auth & Datenbank): Daten werden in der EU verarbeitet.</li>
            <li><strong>Google Gemini API</strong>: Inhalte werden zur KI-Verarbeitung übertragen.</li>
            <li><strong>Stripe</strong>: Zahlungsabwicklung gemäß PCI-DSS-Standard.</li>
            <li><strong>Vercel</strong>: Hosting des Frontends.</li>
          </ul>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">5. Deine Rechte</p>
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der
            Verarbeitung deiner Daten. Wende dich dazu an: [deine@email.de]
          </p>
        </div>
      </div>
    ),
  },
  agb: {
    title: 'Allgemeine Geschäftsbedingungen',
    body: (
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <p className="text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl">
          ⚠️ Platzhalter — vor dem Launch durch vollständige AGB ersetzen. Für Abo-Modelle empfiehlt sich juristische Beratung.
        </p>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 1 Geltungsbereich</p>
          <p>
            Diese AGB gelten für die Nutzung der Web-App QuizWise, betrieben von [Name],
            [Adresse], Deutschland.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 2 Leistungsbeschreibung</p>
          <p>
            QuizWise ist eine KI-gestützte Lernplattform für Studierende. Es wird ein Free-Tarif
            (20 KI-Anfragen/Tag) und ein Pro-Tarif (4,99 €/Monat, unlimitiert) angeboten.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 3 Abonnement & Kündigung</p>
          <p>
            Das Pro-Abonnement wird monatlich abgerechnet und verlängert sich automatisch.
            Eine Kündigung ist jederzeit zum Ende des laufenden Abrechnungszeitraums möglich,
            über die Einstellungen der App oder per E-Mail an [deine@email.de].
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 4 Haftungsbeschränkung</p>
          <p>
            Die KI-generierten Inhalte dienen ausschließlich zu Lernzwecken. Eine Garantie
            für die Korrektheit der Inhalte wird nicht übernommen. QuizWise haftet nicht
            für Schäden, die durch fehlerhafte KI-Ausgaben entstehen.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 5 Anwendbares Recht</p>
          <p>Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts.</p>
        </div>
      </div>
    ),
  },
};

export const LegalModal: React.FC<LegalModalProps> = ({ page, onClose }) => {
  const { title, body } = CONTENT[page];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-[32px] shadow-3d-deep animate-in slide-in-from-bottom-4 duration-300 overflow-hidden"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between p-8 pb-0 shrink-0">
          <h2 className="text-2xl font-black tracking-tight dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
            style={{ background: 'var(--border-color)' }}
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 p-8">{body}</div>
      </div>
    </div>
  );
};
