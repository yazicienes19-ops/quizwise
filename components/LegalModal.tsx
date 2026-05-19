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
          ⚠️ Adresse noch ausstehend — vor dem Launch in LegalModal.tsx eintragen.
        </p>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Angaben gemäß § 5 TMG</p>
          <p>Enes Yazici</p>
          <p>[Straße Hausnummer]</p>
          <p>[PLZ Ort]</p>
          <p>Deutschland</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Kontakt</p>
          <p>E-Mail: yazicienes19@gmail.com</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</p>
          <p>Enes Yazici, [Adresse]</p>
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
        <div>
          <p className="font-bold text-slate-900 dark:text-white">1. Verantwortlicher</p>
          <p>Enes Yazici, [Straße Hausnummer, PLZ Ort], Deutschland</p>
          <p>E-Mail: yazicienes19@gmail.com</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">2. Erhobene Daten</p>
          <p>
            Bei der Registrierung und Nutzung von QuizWise werden folgende personenbezogene Daten
            erhoben: E-Mail-Adresse (für Authentifizierung und Kommunikation), Nutzungsdaten
            (Anzahl der KI-Anfragen zur Umsetzung des Freemium-Modells) sowie Zahlungsdaten, die
            ausschließlich über den Zahlungsdienstleister Stripe verarbeitet und nicht direkt bei
            uns gespeichert werden.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">3. Zweck der Verarbeitung</p>
          <p>
            Die Daten werden auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)
            zur Bereitstellung des Dienstes, zur Abrechnung des Pro-Abonnements sowie zur
            Sicherstellung der technischen Funktionsfähigkeit der App verarbeitet.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">4. Speicherdauer</p>
          <p>
            Personenbezogene Daten werden gelöscht, sobald der Zweck der Verarbeitung entfällt
            und keine gesetzlichen Aufbewahrungspflichten bestehen. Kontodaten werden nach
            Kündigung des Accounts innerhalb von 30 Tagen gelöscht.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">5. Drittanbieter</p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Supabase Inc.</strong> (Authentifizierung & Datenbank): Daten werden gemäß EU-Standardvertragsklauseln verarbeitet.</li>
            <li><strong>Google LLC / Gemini API</strong>: Hochgeladene Dokumente und Eingaben werden zur KI-Verarbeitung übermittelt. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</li>
            <li><strong>Stripe Inc.</strong>: Zahlungsabwicklung nach PCI-DSS-Standard. Stripe hat eigene DSGVO-konforme Datenschutzbestimmungen.</li>
            <li><strong>Vercel Inc.</strong>: Hosting des Frontends. Serverstandorte in der EU verfügbar.</li>
            <li><strong>Railway Technologies Inc.</strong>: Hosting des Backends.</li>
          </ul>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">6. Deine Rechte (Art. 15–22 DSGVO)</p>
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
            Datenübertragbarkeit sowie Widerspruch gegen die Verarbeitung deiner personenbezogenen
            Daten. Zur Ausübung dieser Rechte wende dich an: yazicienes19@gmail.com
          </p>
          <p className="mt-2">
            Du hast zudem das Recht, dich bei der zuständigen Datenschutzaufsichtsbehörde zu beschweren.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">7. Cookies & lokale Speicherung</p>
          <p>
            QuizWise verwendet ausschließlich technisch notwendige Cookies für die Authentifizierung
            (Supabase Session). Darüber hinaus werden Nutzerdaten (Dokumente, Einstellungen)
            im lokalen Speicher des Browsers (localStorage) gespeichert. Eine Einwilligung nach
            § 25 TTDSG ist nicht erforderlich, da es sich um technisch notwendige Speicherungen handelt.
          </p>
        </div>
      </div>
    ),
  },
  agb: {
    title: 'Allgemeine Geschäftsbedingungen',
    body: (
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 1 Geltungsbereich</p>
          <p>
            Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung der Web-App QuizWise,
            betrieben von Enes Yazici, [Straße Hausnummer, PLZ Ort], Deutschland
            (nachfolgend „Anbieter"). Mit der Registrierung akzeptierst du diese AGB.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 2 Leistungsbeschreibung</p>
          <p>
            QuizWise ist eine KI-gestützte Lernplattform für Schüler und Studierende. Der Anbieter
            bietet zwei Tarife an:
          </p>
          <ul className="list-disc pl-4 mt-1 space-y-1">
            <li><strong>Free-Tarif:</strong> 20 KI-Anfragen pro Tag, kostenlos.</li>
            <li><strong>Pro-Tarif:</strong> Unlimitierte KI-Anfragen, 4,99 €/Monat, monatlich kündbar.</li>
          </ul>
          <p className="mt-1">
            Der Anbieter behält sich vor, den Funktionsumfang des Free-Tarifs jederzeit anzupassen.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 3 Abonnement & Kündigung</p>
          <p>
            Das Pro-Abonnement wird monatlich im Voraus abgerechnet und verlängert sich automatisch,
            sofern es nicht gekündigt wird. Die Kündigung ist jederzeit zum Ende des laufenden
            Abrechnungszeitraums möglich — direkt über die App-Einstellungen (Bereich „Abonnement")
            oder per E-Mail an yazicienes19@gmail.com. Nach der Kündigung bleibt der Pro-Zugang
            bis zum Ende des bezahlten Zeitraums aktiv.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 4 Widerrufsrecht</p>
          <p>
            Als Verbraucher steht dir ein gesetzliches Widerrufsrecht von 14 Tagen ab Vertragsschluss
            zu. Das Widerrufsrecht erlischt bei digitalen Inhalten vorzeitig, wenn die Ausführung
            des Vertrags mit deiner ausdrücklichen Zustimmung vor Ablauf der Widerrufsfrist begonnen
            hat und du zur Kenntnis genommen hast, dass du dadurch dein Widerrufsrecht verlierst.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 5 Pflichten des Nutzers</p>
          <p>
            Du verpflichtest dich, QuizWise ausschließlich für legale Zwecke zu nutzen und keine
            Inhalte hochzuladen, an denen du keine Rechte hältst. Eine kommerzielle Weiterverwendung
            KI-generierter Inhalte ohne Genehmigung ist untersagt.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 6 Haftungsbeschränkung</p>
          <p>
            Die KI-generierten Inhalte (Quiz-Fragen, Erklärungen, Karteikarten) dienen
            ausschließlich zu Lernzwecken. Der Anbieter übernimmt keine Garantie für die
            inhaltliche Korrektheit. QuizWise haftet nicht für Schäden, die durch fehlerhafte
            KI-Ausgaben entstehen. Die Haftung für Vorsatz und grobe Fahrlässigkeit bleibt
            unberührt.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 7 Verfügbarkeit</p>
          <p>
            Der Anbieter strebt eine hohe Verfügbarkeit der Plattform an, übernimmt jedoch keine
            Garantie für eine ununterbrochene Verfügbarkeit. Wartungsarbeiten werden nach
            Möglichkeit angekündigt.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 8 Änderungen der AGB</p>
          <p>
            Der Anbieter behält sich vor, diese AGB mit einer Ankündigungsfrist von 30 Tagen zu
            ändern. Änderungen werden per E-Mail mitgeteilt. Widersprichst du nicht innerhalb
            von 30 Tagen, gelten die neuen AGB als akzeptiert.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 9 Anwendbares Recht & Gerichtsstand</p>
          <p>
            Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts (CISG). Gerichtsstand
            für Streitigkeiten mit Kaufleuten ist der Sitz des Anbieters.
          </p>
        </div>
        <p className="text-xs text-slate-400 pt-2">Stand: Mai 2026</p>
      </div>
    ),
  },
};

export const LegalModal: React.FC<LegalModalProps> = ({ page, onClose }) => {
  const { title, body } = CONTENT[page];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-[32px] shadow-3d-deep animate-in slide-in-from-bottom-4 duration-300"
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
        <div className="overflow-y-auto p-8 scrollbar-thin">{body}</div>
      </div>
    </div>
  );
};
