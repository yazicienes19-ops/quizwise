import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getLocale, t } from '../i18n';
import { useModalA11y } from '../hooks/useModalA11y';

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
          ⚠️ Adresse noch ausstehend, vor dem Launch in LegalModal.tsx eintragen.
        </p>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Angaben gemäß § 5 DDG</p>
          <p>Enes Yazici</p>
          <p>[Straße Hausnummer]</p>
          <p>[PLZ Ort]</p>
          <p>Deutschland</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Kontakt</p>
          <p>E-Mail: support@studearc.com</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</p>
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
          <p>E-Mail: support@studearc.com</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">2. Erhobene Daten</p>
          <p>
            Bei der Registrierung und Nutzung von StudeArc werden folgende personenbezogene Daten
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
          <p>
            Soweit die nachfolgenden Anbieter Daten außerhalb der Europäischen Union verarbeiten,
            erfolgt dies auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 Abs. 2 lit. c
            DSGVO oder eines Angemessenheitsbeschlusses der EU-Kommission gemäß Art. 45 DSGVO.
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Supabase Inc.</strong> (Authentifizierung & Datenbank): Daten werden gemäß EU-Standardvertragsklauseln verarbeitet.</li>
            <li><strong>Google LLC / Gemini API</strong>: Hochgeladene Dokumente und Eingaben werden zur KI-Verarbeitung übermittelt. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO, Drittlandtransfer gemäß EU-Standardvertragsklauseln.</li>
            <li><strong>Stripe Inc.</strong>: Zahlungsabwicklung nach PCI-DSS-Standard, Drittlandtransfer gemäß EU-Standardvertragsklauseln. Stripe hat eigene DSGVO-konforme Datenschutzbestimmungen.</li>
            <li><strong>Cloudflare, Inc.</strong>: Hosting und Auslieferung des Frontends. Drittlandtransfer gemäß EU-Standardvertragsklauseln.</li>
            <li><strong>Railway Technologies Inc.</strong>: Hosting des Backends. Drittlandtransfer gemäß EU-Standardvertragsklauseln.</li>
          </ul>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">6. Deine Rechte (Art. 15–22 DSGVO)</p>
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
            Datenübertragbarkeit sowie Widerspruch gegen die Verarbeitung deiner personenbezogenen
            Daten. Zur Ausübung dieser Rechte wende dich an: support@studearc.com
          </p>
          <p className="mt-2">
            Du hast zudem das Recht, dich bei der zuständigen Datenschutzaufsichtsbehörde zu beschweren.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">7. Cookies & lokale Speicherung</p>
          <p>
            StudeArc verwendet ausschließlich technisch notwendige Cookies für die Authentifizierung
            (Supabase Session). Darüber hinaus werden Nutzerdaten (Dokumente, Einstellungen)
            im lokalen Speicher des Browsers (localStorage) gespeichert. Eine Einwilligung nach
            § 25 TDDDG ist nicht erforderlich, da es sich um technisch notwendige Speicherungen handelt.
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
            Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung der Web-App StudeArc,
            betrieben von Enes Yazici, [Straße Hausnummer, PLZ Ort], Deutschland
            (nachfolgend „Anbieter"). Mit der Registrierung akzeptierst du diese AGB.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 2 Leistungsbeschreibung</p>
          <p>
            StudeArc ist eine KI-gestützte Lernplattform für Schüler und Studierende. Der Anbieter
            bietet zwei Tarife an:
          </p>
          <ul className="list-disc pl-4 mt-1 space-y-1">
            <li><strong>Free-Tarif:</strong> 20 KI-Anfragen pro Tag, kostenlos.</li>
            <li><strong>Pro-Tarif:</strong> Unlimitierte KI-Anfragen, 9,99 €/Monat, monatlich kündbar.</li>
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
            Abrechnungszeitraums möglich, direkt über die App-Einstellungen (Bereich „Abonnement")
            oder per E-Mail an support@studearc.com. Nach der Kündigung bleibt der Pro-Zugang
            bis zum Ende des bezahlten Zeitraums aktiv.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 4 Widerrufsrecht</p>
          <p>
            Als Verbraucher hast du das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen
            Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des
            Vertragsschlusses.
          </p>
          <p className="mt-2">
            Um dein Widerrufsrecht auszuüben, musst du uns (Enes Yazici, [Straße Hausnummer],
            [PLZ Ort], Deutschland, E-Mail: support@studearc.com) mittels einer eindeutigen Erklärung
            (z. B. ein mit der Post versandter Brief oder eine E-Mail) über deinen Entschluss, diesen
            Vertrag zu widerrufen, informieren. Du kannst dafür das unten stehende
            Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Zur Wahrung der
            Widerrufsfrist reicht es aus, dass du die Mitteilung über die Ausübung des Widerrufsrechts
            vor Ablauf der Widerrufsfrist absendest.
          </p>
          <p className="font-bold text-slate-900 dark:text-white mt-3">Folgen des Widerrufs</p>
          <p>
            Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir erhalten
            haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem
            die Mitteilung über deinen Widerruf dieses Vertrags bei uns eingegangen ist. Für diese
            Rückzahlung verwenden wir dasselbe Zahlungsmittel, das du bei der ursprünglichen
            Transaktion eingesetzt hast, es sei denn, mit dir wurde ausdrücklich etwas anderes
            vereinbart; in keinem Fall werden dir wegen dieser Rückzahlung Entgelte berechnet. Hast du
            verlangt, dass die Leistung während der Widerrufsfrist beginnen soll, so hast du uns einen
            angemessenen Betrag zu zahlen, der dem Anteil der bis zum Zeitpunkt deines Widerrufs bereits
            erbrachten Leistung im Vergleich zum Gesamtumfang der vertraglich vorgesehenen Leistung
            entspricht.
          </p>
          <p className="font-bold text-slate-900 dark:text-white mt-3">
            Vorzeitiges Erlöschen bei digitalen Dienstleistungen
          </p>
          <p>
            Das StudeArc Pro-Abonnement ist eine digitale Dienstleistung im Sinne des § 327 Abs. 1
            BGB (fortlaufend bereitgestellte Leistung, kein einmaliger digitaler Inhalt). Dein
            Widerrufsrecht erlischt bei Verträgen über digitale Dienstleistungen gemäß § 356 Abs. 4
            BGB vorzeitig, wenn du im Bestellvorgang ausdrücklich zugestimmt hast, dass wir mit der
            Ausführung des Vertrags vor Ablauf der Widerrufsfrist beginnen, und du zugleich bestätigt
            hast, dass du durch diese Zustimmung dein Widerrufsrecht bei vollständiger
            Vertragserfüllung verlierst. Ohne diese gesonderte Zustimmung besteht dein
            Widerrufsrecht während der vollen vierzehn Tage unabhängig davon fort, ob du den
            Pro-Zugang bereits genutzt hast.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">Muster-Widerrufsformular</p>
          <p className="italic">
            (Wenn du den Vertrag widerrufen willst, dann fülle bitte dieses Formular aus und sende es
            an support@studearc.com zurück.)
          </p>
          <p className="mt-2">
            An Enes Yazici, [Straße Hausnummer], [PLZ Ort], Deutschland, E-Mail: support@studearc.com:
          </p>
          <p className="mt-2">
            Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der
            folgenden Dienstleistung: StudeArc Pro-Abonnement
          </p>
          <p className="mt-2">Bestellt am: _______________</p>
          <p>Name des Verbrauchers: _______________</p>
          <p>Anschrift des Verbrauchers: _______________</p>
          <p>Datum: _______________</p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 5 Pflichten des Nutzers</p>
          <p>
            Du verpflichtest dich, StudeArc ausschließlich für legale Zwecke zu nutzen und keine
            Inhalte hochzuladen, an denen du keine Rechte hältst. Eine kommerzielle Weiterverwendung
            KI-generierter Inhalte ohne Genehmigung ist untersagt.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 6 Haftungsbeschränkung</p>
          <p>
            Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers
            oder der Gesundheit sowie für Schäden, die auf Vorsatz oder grober Fahrlässigkeit
            beruhen. Für Schäden aus der Verletzung wesentlicher Vertragspflichten (Kardinalpflichten),
            deren Erfüllung die ordnungsgemäße Durchführung dieses Vertrags überhaupt erst ermöglicht
            und auf deren Einhaltung du als Vertragspartner regelmäßig vertrauen darfst, haftet der
            Anbieter auch bei einfacher Fahrlässigkeit, der Höhe nach jedoch begrenzt auf den bei
            Vertragsschluss vorhersehbaren, vertragstypischen Schaden. Im Übrigen ist die Haftung des
            Anbieters für einfache Fahrlässigkeit ausgeschlossen. Die vorstehenden
            Haftungsbeschränkungen gelten nicht für Ansprüche nach dem Produkthaftungsgesetz.
          </p>
          <p className="mt-2">
            Die KI-generierten Inhalte (Quiz-Fragen, Erklärungen, Karteikarten) dienen ausschließlich
            Lernzwecken. Der Anbieter übernimmt keine Garantie für ihre inhaltliche Korrektheit oder
            Vollständigkeit; angesichts der Natur automatisiert erzeugter Lernhilfen ist die
            inhaltliche Fehlerfreiheit keine Kardinalpflicht im Sinne des vorstehenden Absatzes. Für
            Schäden, die ausschließlich auf einer fehlerhaften KI-Ausgabe beruhen, haftet der Anbieter
            daher nur nach Maßgabe der vorstehenden Haftungsbeschränkung.
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
            Änderungen dieser AGB, die dich nicht schlechterstellen (z. B. redaktionelle
            Anpassungen, neue gesetzliche Vorgaben, technische Weiterentwicklungen), teilen wir dir
            mindestens sechs Wochen vor ihrem Inkrafttreten per E-Mail mit. Wir weisen dich in dieser
            Mitteilung ausdrücklich darauf hin, dass die Änderung als angenommen gilt, wenn du ihr
            nicht innerhalb dieser Frist in Textform widersprichst. Widersprichst du, bleibt der
            Vertrag zu den bisherigen Bedingungen bestehen; du kannst den Vertrag außerdem innerhalb
            der Frist jederzeit außerordentlich zum Zeitpunkt des geplanten Inkrafttretens kündigen.
          </p>
          <p className="mt-2">
            Änderungen des Leistungsumfangs des Pro-Abonnements sowie Erhöhungen des Abo-Preises
            bedürfen deiner ausdrücklichen Zustimmung; das bloße Ausbleiben eines Widerspruchs genügt
            hierfür nicht. Lehnst du eine Preiserhöhung ab, läuft dein bestehendes Abonnement zu den
            bisherigen Konditionen bis zum Ende des laufenden Abrechnungszeitraums weiter.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 9 Verbraucherstreitbeilegung</p>
          <p>
            Die EU-Plattform zur Online-Streitbeilegung wurde zum 20. Juli 2025 eingestellt.
            Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor
            einer Verbraucherschlichtungsstelle im Sinne des Verbraucherstreitbeilegungsgesetzes
            (VSBG) teilzunehmen.
          </p>
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">§ 10 Anwendbares Recht & Gerichtsstand</p>
          <p>
            Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts (CISG). Gerichtsstand
            für Streitigkeiten mit Kaufleuten ist der Sitz des Anbieters.
          </p>
        </div>
        <p className="text-xs text-slate-400 pt-2">Stand: August 2026</p>
      </div>
    ),
  },
};

export const LegalModal: React.FC<LegalModalProps> = ({ page, onClose }) => {
  const { title, body } = CONTENT[page];
  const { titleId, dialogProps } = useModalA11y(onClose);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        {...dialogProps}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-[32px] shadow-3d-deep animate-in slide-in-from-bottom-4 duration-300"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between p-8 pb-0 shrink-0">
          <h2 id={titleId} className="text-2xl font-black tracking-tight dark:text-white">{title}</h2>
          <button aria-label={t('common.close')}
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
            style={{ background: 'var(--border-color)' }}
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-y-auto p-8 scrollbar-thin space-y-4">
          {getLocale() !== 'de' && (
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 p-3 rounded-xl">
              {t('legal.germanNotice')}
            </p>
          )}
          {body}
        </div>
      </div>
    </div>,
    document.body
  );
};
