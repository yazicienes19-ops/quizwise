# StudeArc — Design-Perfektionierungs-Audit

**Datum:** 2026-08-09 · **Scope:** Bestehendes Design, keine neuen Features · **Methode:** 35 Screenshots (Landing + 10 Tabs × Mobile/Tablet/Desktop, gegen `localhost:3000` mit echtem Testaccount) + 4 systematische Code-Sweeps über alle 71 Komponenten (Spacing/Radius/Shadow/Border, Farben/States, Typografie/Icons, Accessibility).

**Nicht abgedeckt (Limitation, ehrlich benannt):**
- Landing-Page-Scroll-Reveal-Sektionen (IntersectionObserver-getriggert, ohne echtes Scrollen im Screenshot-Skript nicht sichtbar — kein Befund daraus abgeleitet)
- Mobile Hamburger-Sheet konnte nicht isoliert fotografiert werden (Settings-Modal blockierte den zweiten Versuch) — Bewertung dort nur aus Code, nicht visuell
- Ultrawide/32″ nicht separat getestet (nur bis 1440px Desktop-Breite), Aussagen zu Kategorie 6 sind auf 1440px extrapoliert
- Farbkontrast wurde heuristisch aus dem Code abgeleitet (welche Textfarbe auf welchem Hintergrund ohne `dark:`-Variante), nicht mit einem echten Kontrast-Messtool verifiziert — als "Risiko", nicht als bestätigter Fehler markiert

---

## 1. Visuelle Konsistenz

### 1.1 Rundungen (Border Radius)

🔴 **Hoch** — Bereich: App-weit (Primär-CTA-Buttons)
**Problem:** Der wichtigste, meistgeklickte Button-Typ der App ("Start"/"Absenden"-CTA mit `shadow-3d-deep`) hat mindestens 5 verschiedene Eckenradien: `rounded-[20px]` (Dashboard.tsx:239), `rounded-[24px]` (QuizSetup.tsx:296, SharedDeckPage.tsx:133, ResultView.tsx:184), `rounded-2xl`/`rounded-3xl` (ExamGenerator.tsx:476, StudyPlanner.tsx:342), `rounded-2xl lg:rounded-3xl` (ActiveRecall.tsx:359).
**Warum problematisch:** Der exakt gleiche visuelle Baustein sieht von Seite zu Seite anders "rund" aus — genau die Art Detail, die ein geschultes Auge sofort als uneinheitlich wahrnimmt.
**Lösung:** Einen einzigen CTA-Radius-Wert festlegen (Empfehlung: `rounded-[24px]`, da bereits die häufigste Variante) und in allen 8 Fundstellen vereinheitlichen.
**Erwarteter UX-Gewinn:** Der auffälligste, meistgesehene Button der App wirkt wie *ein* Designsystem statt wie 5 verschiedene.

🔴 **Hoch** — Bereich: App-weit (Badges/Chips)
**Problem:** Fast alle kleinen Uppercase-Badges nutzen `rounded-full` (Pill-Form), aber 7 Ausreißer nutzen `rounded-lg`/`rounded-md`: EditCardModal.tsx:72, ExamView.tsx:921, TermPaperSystem.tsx:691, ScholarSearch.tsx:217, GapRadar.tsx:961, SettingsModal.tsx:369, LearningCoach.tsx:328.
**Warum problematisch:** Badges erscheinen auf praktisch jeder Karte/Listeneintrag — der Pille-vs-Rechteck-Wechsel ist sofort sichtbar.
**Lösung:** Alle Badges auf `rounded-full` vereinheitlichen.
**Erwarteter UX-Gewinn:** Ein wiedererkennbares, konsistentes "das ist ein Tag/Badge"-Signal statt zwei konkurrierender Formen.

🟠 **Mittel** — Bereich: App-weit (Modals)
**Problem:** 12 Modals nutzen konsistent `rounded-[32px]`, aber `DocumentViewerModal.tsx:87` und `Onboarding.tsx:96` weichen mit `rounded-[28px]` ab.
**Lösung:** Auf `rounded-[32px]` angleichen.
**UX-Gewinn:** Modals fühlen sich als eine Familie an, nicht als Sonderfälle.

🟠 **Mittel** — Bereich: Karteikarten (FlashcardSystem)
**Problem:** Zwei nebeneinanderliegende Panels auf demselben Screen nutzen unterschiedliche `lg:`-Radien: `FlashcardSystem.tsx:617` (`rounded-[30px] lg:rounded-[40px]`) vs. `:685` (`rounded-[30px] lg:rounded-[48px]`).
**Lösung:** Beide auf denselben Wert (z. B. 40px) setzen.
**UX-Gewinn:** Zwei Panels, die der Nutzer gleichzeitig im Blick hat, wirken als bewusstes Paar statt als Zufall.

🟢 **Niedrig** — Bereich: Gesamtsystem
**Problem:** 20 verschiedene, beliebig gewählte `rounded-[Npx]`-Werte ohne Stufensystem (3–48px in ~2-4px-Schritten).
**Lösung:** Drei Stufen einführen (klein ≈14–16px für Chips/Inputs, mittel ≈20–24px für Karten, groß ≈28–32px für Modals/Panels) und als Tailwind-Theme-Tokens (`borderRadius` in `tailwind.config.cjs`) statt Arbitrary-Values verwenden.
**UX-Gewinn:** Jede künftige Komponente erbt automatisch die richtige Rundung, statt dass jeder Entwickler neu rät.

### 1.2 Schatten (Box-Shadow)

🔴 **Hoch** — Bereich: Lernfortschritt (GapRadar), Tutor-Bausteine (LearningCoach)
**Problem:** Die "erhöhte Karte"-Rolle (Radius 24–32px, Border) nutzt überall im Rest der App das eigene `shadow-3d-raised`-Token — aber in `GapRadar.tsx` (4 Stellen) und `LearningCoach.tsx` (14 Stellen!) wird stattdessen generisches `shadow-sm` verwendet.
**Warum problematisch:** Genau die zwei meistbesuchten "KI-Coach"-Tabs wirken dadurch spürbar flacher/billiger im direkten Vergleich zu Dashboard/Bibliothek/Karteikarten.
**Lösung:** `shadow-sm` → `shadow-3d-raised` in beiden Dateien.
**UX-Gewinn:** Die zwei komplexesten, "wertvollsten" Analyse-Features der App sehen erstmals so hochwertig aus wie der Rest der App.

🟠 **Mittel** — Bereich: Reader (SplitScreenReader), Lernfortschritt (GapRadar-Tooltip)
**Problem:** Statt der vorhandenen `shadow-3d-*`-Tokens werden handgeschriebene Einzel-`boxShadow`-Werte verwendet: `SplitScreenReader.tsx:333` und `GapRadar.tsx:80` — jeweils eine eigene, leicht andere Schattenrezeptur.
**Lösung:** Beide durch `shadow-3d-raised` (bzw. für den Tooltip einen neuen, kleinen `shadow-3d-tooltip`-Token) ersetzen.
**UX-Gewinn:** Ein Schatten-Vokabular statt drei parallel erfundener.

### 1.3 Border-Stärken

🔴 **Hoch** — Bereich: Quiz, Klausur, Ergebnisansicht
**Problem:** Dasselbe UI-Element (Selbstkorrektur-Eingabefeld nach einer offenen Frage) hat je nach Bildschirm 1px- oder 2px-Rahmen: `QuizPlayer.tsx:616`/`ExamView.tsx:635,1047`/`ResultView.tsx:152` (`border`) vs. `QuizPlayer.tsx:407`/`ExamView.tsx:442` (`border-2`) — kombiniert mit ebenfalls unterschiedlichen Radien (12–16px vs. `rounded-2xl`).
**Warum problematisch:** Exakt dasselbe Eingabefeld fühlt sich je nach Fragetyp unterschiedlich "gewichtig" an.
**Lösung:** Auf `border-2` + einen einheitlichen Radius vereinheitlichen (Konvention: MC-Optionen nutzen bereits durchgängig `border-2`, s. Positivbeispiel unten).
**UX-Gewinn:** Ein Eingabefeld-Standard für den gesamten Lern-Loop.

🟠 **Mittel** — Bereich: Klausur-Archiv, Lernfortschritt
**Problem:** Der farbige linke Rahmen für "richtig/teilweise/falsch"-Feedback ist `border-l-4` in `ExamArchive.tsx:86`/`GapRadar.tsx:762`, aber `border-l-8` (doppelt so dick) im zentralen Ergebnis-Block `ExamView.tsx:940`.
**Lösung:** Auf `border-l-4` vereinheitlichen.
**UX-Gewinn:** Dieselbe Farbcodierung bedeutet überall dieselbe visuelle Intensität.

*(Positivbefund, kein Fix nötig: Lade-Spinner nutzen durchgängig `border-4`, MC-Options-Buttons durchgängig `border-2` — das zeigt, dass Konsistenz in Teilen der App bereits gut funktioniert.)*

### 1.4 Abstände (Spacing)

🔴 **Hoch** — Bereich: Lernfortschritt (GapRadar) vs. Tutor-Bausteine (LearningCoach)
**Problem:** Beide Screens teilen exakt dieselbe Karten-Signatur (`rounded-[24px] lg:rounded-[32px] border shadow-sm`, s. o.), aber unterschiedliches Innenpolster: `LearningCoach.tsx` durchgängig `p-6 lg:p-8`, `GapRadar.tsx` uneinheitlich `p-5 lg:p-8` (3×) und `p-6 lg:p-8` (1×) — sogar innerhalb derselben Datei uneinheitlich.
**Lösung:** `GapRadar.tsx` intern auf `p-6 lg:p-8` vereinheitlichen (Angleichung an LearningCoach).
**UX-Gewinn:** Zwei Schwester-Features fühlen sich wie eine zusammengehörige Produktfamilie an.

🟠 **Mittel** — Bereich: Bibliothek
**Problem:** `SourceCard.tsx:133` (Dokumentkarte) nutzt `p-6`, das strukturell identische `LibrarySystem.tsx:498/564` (Sammlungsinfo-Panel, dieselbe Radius/Shadow-Signatur) nutzt `p-5` — beide sichtbar auf derselben Bibliotheks-Ansicht.
**Lösung:** Auf `p-6` vereinheitlichen.
**UX-Gewinn:** Kein spürbarer "Polster-Sprung" beim Blick zwischen Dokument- und Sammlungskarten.

🟠 **Mittel** — Bereich: App-weit (CTA-Buttons)
**Problem:** Vertikales Button-Polster ohne erkennbare Formel: `py-6` (ExamGenerator.tsx:476), `py-5` (SharedDeckPage.tsx:133, QuizSetup.tsx:296, ExamView.tsx:1071), `py-4` (Dashboard.tsx:239, StudyPlanner.tsx:342).
**Lösung:** Feste Werte pro Button-Größe definieren (z. B. `py-4` für Standard-CTA, `py-5` nur für besonders prominente Einzel-CTAs) und dokumentieren.
**UX-Gewinn:** Buttons fühlen sich "gleich schwer" an, unabhängig von der Seite.

### 1.5 Farben

🔴 **Hoch** — Bereich: App-weit (Hover-Effekte auf Karten)
**Problem:** `group-hover:*-indigo-*`-Klassen sind in `app.css` **nicht** auf `var(--primary)` umgemappt (nur `hover:`, nicht `group-hover:` wird dort abgefangen) — betrifft u. a. `FlashcardSystem.tsx:569`, `ExportDeckModal.tsx:208-211`, `SourceCard.tsx`/`SourceSelector.tsx:286`, `FlashcardSystem.tsx:746`, `FileUploader.tsx:203`.
**Warum problematisch:** Beim Hovern über eine Karte springt die Akzentfarbe kurz auf sichtbares Blau/Indigo statt Gold — ein direkter Bruch mit der eigenen Markenidentität, an einer Stelle, die der Nutzer ständig sieht (Kartenlisten).
**Lösung:** In `app.css` fehlende `.group:hover .group-hover\:bg-indigo-*`/`.group-hover\:text-indigo-*`-Overrides ergänzen (analog zu den bereits vorhandenen `hover:`-Regeln).
```css
/* app.css — ergänzen, analog zu den bestehenden .hover\:bg-indigo-*-Regeln */
.group:hover .group-hover\:text-indigo-500 { color: var(--primary) !important; }
.group:hover .group-hover\:text-indigo-600 { color: var(--primary) !important; }
.group:hover .group-hover\:bg-indigo-50    { background-color: color-mix(in srgb, var(--primary) 8%, transparent) !important; }
.group:hover .group-hover\:bg-indigo-200   { background-color: color-mix(in srgb, var(--primary) 20%, transparent) !important; }
.dark .group:hover .group-hover\:bg-indigo-950\/30 { background-color: color-mix(in srgb, var(--primary) 15%, transparent) !important; }
.dark .group:hover .group-hover\:bg-indigo-900\/60 { background-color: color-mix(in srgb, var(--primary) 22%, transparent) !important; }
```
**UX-Gewinn:** Kein Marken-Farbbruch mehr beim Hovern — die Gold-Identität bleibt zu 100 % konsistent.

🔴 **Hoch** — Bereich: Login/Registrierung (AuthModal, AuthPage)
**Problem:** `focus:ring-2` ohne Farbklasse → Tailwinds Default-Ringfarbe ist Blau (`AuthModal.tsx:180,197,214`, `AuthPage.tsx:191,208,224`).
**Warum problematisch:** Der allererste Screen, den ein neuer Nutzer per Tastatur bedient, zeigt einen sichtbar app-fremden blauen Fokusring statt Gold.
**Lösung:** `focus:ring-2 focus:ring-[color:var(--primary)]/50` ergänzen.
**UX-Gewinn:** Erster Eindruck der App ist von der ersten Interaktion an markenkonsistent.

🟠 **Mittel** — Bereich: Landing-Page, Auth
**Problem:** ~13 Stellen in `LandingPage.tsx` sowie `AuthPage.tsx:93` und `Layout.tsx:361` hardcoden `#D9A94E` statt `var(--primary)`.
**Warum problematisch:** Das System ist explizit für nutzerdefinierbare Akzentfarben gebaut (`ColorPicker.tsx`) — auf der Landing-Page und beim Wortmarken-Logo bliebe bei einer Farbänderung trotzdem immer Gold hartkodiert.
**Lösung:** Alle 15 Stellen auf `var(--primary)` umstellen.
**UX-Gewinn:** Konsistente Markenfarbe über die gesamte Journey (Marketing → App), zukunftssicher für Theming.

🟠 **Mittel** — Bereich: Einstellungen (Konto löschen)
**Problem:** `SettingsModal.tsx:526,545` hardcodet `#ef4444` (Tailwind red-500), während derselbe "Konto löschen"-Block direkt daneben (Zeilen 528-537) durchgängig `rose-*` nutzt — die beiden Rottöne sind sichtbar unterschiedlich.
**Lösung:** `#ef4444` durch `rose-500`/`#f43f5e` ersetzen.
**UX-Gewinn:** Eine einzige, eindeutige "Gefahr"-Farbe für die kritischste Aktion der App.

🟢 **Niedrig** — Bereich: App-weit
**Problem:** Vereinzelte weitere ungedeckte Indigo-Varianten (`accent-indigo-600` in FileUploader.tsx:103, `border-t-indigo-500` in ExamView.tsx:857, einzelne `dark:hover:*`-Opazitätsstufen) sowie ein `text-red-500` (GraphCanvas) und ein `text-yellow-500` (ResultView.tsx:42) neben sonst durchgängig `rose-*`/`amber-*`.
**Lösung:** Einzeln nachziehen, sobald der `group-hover`-Fix (s. o.) gemacht wird — gleiche Fehlerklasse.

### 1.6 Hover-States

🔴 **Hoch** — Bereich: Dashboard
**Problem:** 5 strukturell identische, anklickbare Dashboard-Karten nutzen 5 verschiedene Hover-Scale-Werte: `hover:scale-[1.02]` (Zeile 239, 355), `hover:scale-[1.015]` (271), `hover:scale-[1.01]` (305), `hover:scale-[1.03]` (401).
**Warum problematisch:** Der Nutzer spürt beim Überfahren der Kachelreihe vier spürbar unterschiedliche "Hebe"-Intensitäten ohne erkennbaren Grund — auf dem allerersten Screen der App.
**Lösung:** Alle 5 auf `hover:scale-[1.02]` (die im Rest der App dominante Konvention, 30 Dateien) vereinheitlichen.
```tsx
// components/Dashboard.tsx:239,271,305,355,401 — jeweils ersetzen:
className="... hover:scale-[1.02] active:scale-[0.99] ..."
```
**UX-Gewinn:** Die erste Interaktion in der App fühlt sich sofort "aus einem Guss" an.

🟠 **Mittel** — Bereich: App-weit
**Problem:** Neben der dominanten `hover:scale-[1.02]`-Konvention für Karten existiert eine Splittergruppe mit `hover:scale-[1.01]` (ExplainerSystem, ResultView, SourceSelector, SplitScreenReader, TermPaperSystem) sowie `hover:scale-110` statt `hover:scale-105` bei mehreren Primär-Buttons (ColorPicker, CalendarDayPanel, ExamView, LandingPage u. a.).
**Lösung:** Zwei feste Werte definieren: `1.02` für Karten, `1.05` für Buttons — alle Ausreißer angleichen.
**UX-Gewinn:** Zwei klare, wiedererkennbare "Antwortstärken" statt fünf zufälliger.

### 1.7 Active/Press-States

🔴 **Hoch** — Bereich: App-weit (Code-Hygiene, kein sichtbarer Bug)
**Problem:** ~75 Stellen in ~40 Dateien setzen `active:scale-95`/`-90`/`-[0.98]`/`-[0.99]` auf `<button>`-Elemente — diese werden aber **immer** von der globalen Regel `button:not(:disabled):active { transform: scale(0.97); }` (`app.css:314-320`) überschrieben, weil deren CSS-Spezifität höher ist. Die Werte sind aktuell komplett tote Deko, ohne dass es irgendjemandem auffällt.
**Warum problematisch:** ~40 Entwickler-Entscheidungen ("dieser Button drückt sich stärker ein als jener") kommen beim Nutzer nie an — verstecktes Risiko: Sobald jemand die globale Regel anpasst, brechen plötzlich 75 Stellen mit echt unterschiedlichem, unbeabsichtigtem Press-Feedback auf.
**Lösung:** Entweder (a) alle lokalen `active:scale-*`-Klassen entfernen und sich bewusst auf die globale 0.97-Regel verlassen, oder (b) wenn wirklich Varianz gewollt ist (z. B. kleine Icon-Buttons dürfen stärker einsinken), die globale Regel auf `button:not(:disabled):not([data-press-custom]):active` einschränken und die Sonderfälle explizit markieren.
**Erwarteter UX-Gewinn:** Codebase sagt die Wahrheit über das tatsächliche Verhalten — verhindert einen zukünftigen, schwer auffindbaren Bug.

### 1.8 Disabled-States

🔴 **Hoch** — Bereich: Einstellungen (SettingsModal)
**Problem:** Im selben Modal 3 verschiedene Disabled-Opazitäten für strukturell gleiche Buttons: `opacity-50` (Speichern, Zeile 251/333/346/518), `opacity-40` (Zeile 271/551).
**Lösung:** Auf `disabled:opacity-40` vereinheitlichen (App-weit zweithäufigster Wert, aber innerhalb dieses Modals zuerst konsistent machen).
**UX-Gewinn:** "Deaktiviert" bedeutet in einem Modal immer dasselbe Maß an Deaktiviertheit.

🟠 **Mittel** — Bereich: App-weit
**Problem:** Kein einheitlicher Disabled-Opazitätswert: `opacity-50` (23×), `opacity-40` (20×), `opacity-30` (17×), `opacity-60` (4×) — `ActiveRecall.tsx` allein nutzt 3 verschiedene Werte in einem einzigen Screen-Flow (Zeile 359/411/459).
**Lösung:** Einen App-weiten Standard festlegen (Empfehlung: `opacity-40`, da bereits zweithäufigster Wert) und global vereinheitlichen; dabei auch `disabled:cursor-not-allowed` überall ergänzen (aktuell nur in 6 von >60 Dateien vorhanden).
**UX-Gewinn:** "Das ist gerade nicht klickbar" wird überall gleich kommuniziert, auch für Maus-Nutzer ohne Screenreader (Cursor-Feedback).

### 1.9 Schriftgrößen

🔴 **Hoch** — Bereich: App-weit (Microcopy)
**Problem:** Die dokumentierte Konvention (CLAUDE.md: "text-[9px]–[11px] font-black uppercase") wird an 89 Stellen in 23 Dateien mit `text-[8px]` unterschritten — knapp unter der eigenen Spezifikation, aber nicht selten, sondern die meistgenutzte Variante nach der Spezifikation selbst.
**Lösung:** `text-[8px]` → `text-[9px]` app-weit (Suchen&Ersetzen, betrifft ausschließlich diese eine Größenklasse).
**UX-Gewinn:** Kleine Labels werden auf Retina-Displays minimal, aber spürbar besser lesbar — und die Doku stimmt wieder mit dem Code überein.

🔴 **Hoch** — Bereich: App-weit (Microcopy-Gewicht)
**Problem:** Von 574 Uppercase-Tracking-Widest-Labels nutzen 542 korrekt `font-black`, aber 22 nutzen `font-bold` (ApiKeySettings, AuthModal, AuthPage, ExamArchive, FlashcardPlayer, Onboarding, UpgradeModal) und 10 gar kein Gewicht (AnkiImportModal, LandingPage, QuizSetup, SourceSelector, UploadSourceModal).
**Lösung:** Alle 32 Stellen auf `font-black` anheben.
**UX-Gewinn:** Dieselbe "Label-Rolle" liest sich überall gleich kräftig — aktuell wirkt ~1 von 6 Labels spürbar "dünner" neben seinen Nachbarn.

🔴 **Hoch** — Bereich: App-weit (Seitentitel)
**Problem:** Der große `<h1>`-Seitentitel jedes Tabs (das dominanteste Textelement der App) nutzt mindestens 7 verschiedene Größen-Kurven — von `text-4xl lg:text-6xl` bis `text-5xl lg:text-7xl`, teils sogar ganz ohne responsive Steigerung (`TermPaperSystem.tsx:530`, `SharedDeckPage.tsx:92` bleiben bei `text-4xl` auf jeder Breite).
**Lösung:** Eine einzige Formel definieren (Empfehlung: `text-4xl lg:text-6xl`, aktuell häufigste Variante) und auf alle 10+ Vorkommen anwenden — inkl. Nachrüsten der responsiven Steigerung bei den zwei Ausreißern ohne `lg:`-Stufe.
**UX-Gewinn:** Jeder Tab beginnt mit demselben "Gewicht" — aktuell wirkt ein Tabwechsel manchmal wie ein Sprung zwischen zwei verschiedenen Produkten.

🟠 **Mittel** — Bereich: Landing-Page
**Problem:** Die Haupt-CTA-Buttons der Landing-Page nutzen `text-[13px]` für ihre Microcopy — deutlich über der 9-11px-Konvention und größer als jede vergleichbare Pill-Button-Beschriftung im Rest der App.
**Lösung:** Auf `text-[11px]` (oberes Ende der Konvention, für Landing-Page-Prominenz vertretbar) reduzieren.

### 1.10 Zeilenhöhen

🟢 **Niedrig** — Bereich: Quiz/Klausur vs. Ergebnis-Feedback
**Problem:** Fragetext nutzt `leading-loose` (QuizPlayer.tsx:433, ExamView.tsx:476/500/531), das Feedback/Begründungs-Fließtext direkt danach (ExamView.tsx:930) wechselt zu `leading-relaxed` — für denselben "lange deutsche Sätze lesen"-Kontext.
**Lösung:** Beide auf `leading-relaxed` (der App-weit dominante, gut etablierte Wert für Fließtext) vereinheitlichen.

*(Positivbefund: `leading-relaxed` ist mit 65 konsistenten Verwendungen die am saubersten durchgehaltene Konvention der gesamten Typografie-Kategorie — hier ist am wenigsten zu tun.)*

### 1.11 Icon-Größen

🔴 **Hoch** — Bereich: App-weit (Modal-Schließen-Button)
**Problem:** Der meistgenutzte Icon-Button der App (Modal-"X") existiert in 2 Implementierungen und 3 Größen: `lucide-react`s `X` bei `w-4 h-4` (AuthModal, ApiKeySettings, Toast) oder `w-5 h-5` (UpgradeModal, LegalModal, SettingsModal) — **plus** 6 Modals (EditCardModal, AnkiImportModal, DeckStatsModal, EditSourceModal, DocumentViewerModal, ExportDeckModal), die stattdessen ein eigenes, handgeschriebenes Inline-SVG-X (18×18px, `strokeWidth="3"`) verwenden statt der `lucide-react`-Komponente.
**Warum problematisch:** Jedes Modal in der App hat diesen Button — Größe UND Strichstärke wechseln sichtbar je nach Modal, und 6 Komponenten pflegen parallel eine eigene SVG-Kopie desselben Symbols.
**Lösung:** Eine gemeinsame `<ModalCloseButton />`-Komponente einführen (lucide `X`, `w-5 h-5`, `strokeWidth={1.75}`, mit `aria-label`), alle 6 Inline-SVGs + beide lucide-Größenvarianten darauf ummünzen.
```tsx
// components/ModalCloseButton.tsx — neu
export const ModalCloseButton: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-95 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
  >
    <X className="w-5 h-5" strokeWidth={1.75} />
  </button>
);
```
**UX-Gewinn:** Ein einziger, gepflegter Close-Button statt 7 parallelen Implementierungen — jede künftige Änderung (Größe, Fokus-Ring, Touch-Target) wirkt sofort überall.

🟠 **Mittel** — Bereich: Bibliothek
**Problem:** `LibrarySystem.tsx` dupliziert das identische "Ordner bearbeiten/löschen"-Icon-Paar zweimal in derselben Datei, in unterschiedlicher Größe: Grid-Ansicht `w-8 h-8`-Button/12×12-SVG (Zeile 266-282), Sidebar-Listenansicht `w-6 h-6`-Button/8×8-SVG (Zeile 536-552) — beide als eigene rohe SVGs statt `lucide-react`.
**Lösung:** Auf `lucide-react`s `Pencil`/`Trash2` in einer gemeinsamen Größe (empfohlen `w-4 h-4` Icon in `w-8 h-8` Hit-Area) vereinheitlichen.

🟠 **Mittel** — Bereich: Sidebar (Layout.tsx)
**Problem:** Identische Steuerelemente (Theme-Toggle, Nav-Icon) haben auf Desktop `w-4 h-4`, im mobilen Menü aber `w-5 h-5` — ohne erkennbaren Grund für den Unterschied (beide sind reine Icon-Anzeigen, keine Touch-Target-bedingte Vergrößerung, da beide in ausreichend große Buttons eingebettet sind).
**Lösung:** Auf `w-[18px] h-[18px]` (bereits der Wert der Tablet-Sidebar, s. Abschnitt 5) über alle drei Breakpoints vereinheitlichen.

---

## 2. Informationshierarchie

🔴 **Hoch** — Bereich: Lernfortschritt (GapRadar)
**Problem:** Diese Seite ist mit Abstand die dichteste der App — 10+ vollständig gleichgewichtige Karten in Folge (Klausurprognose, Coach-CTA, Methodenvergleich mit 5 Balken, Learning Score mit 5 Balken, Themen-Sicherheit mit 8 identisch-roten "KRITISCH"-Chips, Wissensprofil mit 11 Chips, "Warum verlierst du Punkte", "Deine Entwicklung", plus eine zweite Kartenreihe am Ende). Auf Mobile wird daraus eine **4536px lange** Einzelseite.
**Warum problematisch:** Der Nutzer bekommt keinerlei visuelle Führung, wo er zuerst hinschauen soll — alles schreit gleich laut. Die "Themen-Sicherheit"-Chips sind zusätzlich alle 8 identisch rot/"KRITISCH" beschriftet, wodurch die Farbcodierung ihre Funktion (Unterscheidung) verliert.
**Lösung:** (1) Progressive Disclosure einführen — nur "Heute solltest du" + Klausurprognose + Coach-CTA initial sichtbar, Rest hinter einem "Mehr Details"-Tab/Akkordeon. (2) Bei "Themen-Sicherheit" nur die Top 3-5 kritischsten Themen zeigen + "12 weitere anzeigen" statt aller 8 auf einmal.
**Erwarteter UX-Gewinn:** Aus "elf Datenfriedhöfe gleichzeitig" wird "eine klare nächste Handlung + optionale Tiefe" — der stärkste Hebel im gesamten Audit für gefühlte Premium-Qualität, weil diese Seite aktuell am weitesten von "ruhig und selbstbewusst" entfernt ist.

🔴 **Hoch** — Bereich: Tutor (ExplainerSystem)
**Problem:** Nach den zwei Auswahlkarten ("Frage stellen"/"Dokument öffnen") bleibt der Rest der 900px-Desktop-Ansicht (und mehr) komplett leer — kein Hinweistext, keine zuletzt gestellten Fragen, kein visuelles Element.
**Warum problematisch:** Direkter Kontrast zu Lernfortschritt (zu voll) — hier ist die Seite zu leer und wirkt unfertig/nicht fertig gebaut, obwohl funktional alles da ist.
**Lösung:** Vertikale Zentrierung der zwei Karten in der verfügbaren Höhe (statt Top-Alignment) oder Ergänzung eines dritten, ruhigen Elements darunter (z. B. "Zuletzt erklärt"-Liste, falls vorhanden, sonst ein simples zentriertes Illustrationselement).
**UX-Gewinn:** Die Seite wirkt bewusst gestaltet statt wie ein unfertiger Zwischenstand.

🟠 **Mittel** — Bereich: Sidebar (Layout.tsx, Desktop)
**Problem:** Der "Nachtmodus"-Umschalter steht in der Sidebar-Hierarchie **über** dem "Aktives Fach"-Dropdown — einer reinen Präferenz wird mehr Priorität eingeräumt als dem zentralen Kontext-Switcher, der die gesamte Arbeitsfläche steuert.
**Lösung:** Reihenfolge tauschen: Aktives Fach zuerst, Nachtmodus-Toggle klein am unteren Rand der Sidebar (neben Einstellungen) statt an prominenter erster Stelle.
**UX-Gewinn:** Die Sidebar führt zuerst zur wichtigsten Entscheidung (welches Fach lerne ich gerade), nicht zur unwichtigsten.

🟢 **Niedrig** — Bereich: Dashboard
**Problem:** Die "Fortschritt"-Stat-Kachel oben (Rohwert "24") und der "Lernfortschritt"-Balken direkt darunter ("24% · noch 76% bis zum Lernziel") zeigen dieselbe Zahl in zwei verschiedenen Darstellungen ohne erklärenden Kontext, was den Unterschied macht.
**Lösung:** Entweder zusammenlegen oder die Stat-Kachel umbenennen/differenzieren (z. B. "Sessions" statt "Fortschritt", falls das die tatsächliche Metrik ist).

---

## 3. Layout

🟠 **Mittel** — Bereich: Klausur-Simulator vs. Quiz/Karteikarten/Tutor
**Problem:** Während Quiz, Karteikarten, Feynman-Methode und Tutor alle demselben ruhigen "eine zentrierte Spalte, großzügiger Weißraum"-Muster folgen, bricht der Klausur-Simulator auf ein dichtes Zwei-Spalten-Layout mit einer Wand aus Pill-Buttons (7 Fragetypen, 4 Klausur-Typen, 7 Bewertungsprofil-Optionen, alle gleichzeitig sichtbar) um.
**Warum problematisch:** Der Stilbruch ist beim Tab-Wechsel sofort spürbar — von "Apple-artig ruhig" zu "Admin-Panel dicht", ohne dass die höhere Komplexität diese Dichte zwingend rechtfertigt.
**Lösung:** Setup-Optionen in 2-3 sequenzielle Schritte/Akkordeon-Sektionen gliedern (z. B. Schritt 1: Material + Grundeinstellungen, Schritt 2: Fragetypen, Schritt 3: Bewertung) statt alles gleichzeitig offen zu zeigen.
**Erwarteter UX-Gewinn:** Der komplexeste Screen der App bekommt dieselbe ruhige Erzählstruktur wie der Rest — Komplexität wird schrittweise offenbart statt auf einen Blick geworfen.

🟠 **Mittel** — Bereich: Klausur-Archiv (innerhalb Klausur-Simulator)
**Problem:** Alle vergangenen Klausurergebnisse werden ungekürzt und unpaginiert direkt unter das Setup-Formular gerendert — im Testaccount 10+ Einträge, macht die mobile Seite 3648px lang.
**Lösung:** Standardmäßig nur die letzten 3 Einträge zeigen + "Alle anzeigen"-Link (Muster existiert bereits in der Bibliothek: "Alle Dokumente"-Karte).
**UX-Gewinn:** Der eigentliche nächste Schritt ("neue Klausur starten") bleibt oben sichtbar, ohne durch die eigene Historie verdrängt zu werden.

🟠 **Mittel** — Bereich: App-weit (Cookie-Banner in der eingeloggten App)
**Problem:** Auf der Landing-Page ist der Datenschutz-Hinweis eine volle Breite einnehmende, am Viewport-Boden fixierte dunkle Leiste. In der eingeloggten App dagegen ist es eine schwebende, helle, abgerundete Karte, die **nicht** am Viewport-Rand andockt, sondern mitten im Content-Fluss über Dokumentenlisten/Formulare gelegt wird und diese teilweise verdeckt (auf jedem der 10 getesteten Tabs reproduzierbar).
**Warum problematisch:** Zwei komplett unterschiedliche visuelle Sprachen für dasselbe Feature, und die App-Variante verdeckt aktiv Inhalte statt sie nur zu ergänzen.
**Lösung:** Die App-Variante wie die Landing-Variante als echte, viewport-fixierte Bottom-Bar implementieren (`position: fixed; bottom: 0; left: [Sidebar-Breite]; right: 0`), die den Content nicht überlagert, sondern den scrollbaren Bereich verkürzt.
**UX-Gewinn:** Ein Consent-Banner-Muster für die gesamte Produktfläche, das nie versehentlich Inhalte verdeckt.

---

## 4. Mobile-Optimierung

🔴 **Hoch** — Bereich: Einstellungen (SettingsModal, Mobile)
**Problem:** Im "Anzeigename"-Formularblock stehen Input-Feld und "Speichern"-Button in einer nicht umbrechenden Flex-Reihe — bei 390px Viewport-Breite wird der Button sichtbar am rechten Rand abgeschnitten (per Screenshot bestätigt).
**Warum problematisch:** Direkte Verletzung von "kein horizontaler Scroll"/"Responsive Formulare" — ein Kernstück des Einstellungen-Formulars ist auf dem Standard-Smartphone nicht vollständig bedienbar sichtbar.
**Lösung:**
```tsx
// SettingsModal.tsx — Anzeigename-Zeile: flex-row → flex-col auf Mobile
<div className="flex flex-col sm:flex-row gap-2">
  <input className="w-full ..." ... />
  <button className="w-full sm:w-auto shrink-0 ...">✓ Speichern</button>
</div>
```
**UX-Gewinn:** Der Name lässt sich auf jedem Smartphone tatsächlich speichern, ohne zu horizontal scrollen oder zu raten, wo der abgeschnittene Button endet.

🟠 **Mittel** — Bereich: Kalender (StudyPlanner, Mobile)
**Problem:** Die drei gleichrangigen Aktions-Buttons ("Smart Plan"/"+ Klausur"/"+ Termin") stehen in einer `flex`-Reihe ohne `flex-wrap` (`StudyPlanner.tsx:338-360`) — bei 390px bricht nur der Text des ersten Buttons ("Smart Plan") auf zwei Zeilen um, während die Nachbarn einzeilig bleiben, wodurch die drei Buttons sichtbar unterschiedlich aussehen statt als saubere Gruppe.
**Lösung:** `flex-wrap` ergänzen oder auf `grid grid-cols-1 sm:grid-cols-3` umstellen, damit alle drei Buttons konsistent (entweder alle einzeilig oder alle gleich behandelt) umbrechen.
**UX-Gewinn:** Eine saubere, vorhersehbare Button-Gruppe statt einer zufällig wirkenden Reihe.

🟠 **Mittel** — Bereich: Kalender (StudyPlanner/CalendarDayPanel, Mobile)
**Problem:** 9 Bearbeiten/Löschen-Icon-Buttons im Kalender-Tagespanel sind `w-7 h-7` (28×28px) — unter der 44×44px-Touch-Target-Empfehlung, auf einer der am meisten mobil genutzten Screens (Termine verwalten).
**Lösung:** Hit-Area auf mind. `w-10 h-10` (40px) vergrößern, Icon selbst kann bei 16-18px bleiben (nur Padding erhöhen).
**UX-Gewinn:** Weniger Fehltipps beim Verwalten von Klausurterminen unterwegs.

🟢 **Niedrig** — Bereich: Wissensnetz (Mobile)
**Problem:** Die Canvas-Werkzeugleiste ("Hinweise / Beziehungen / Duplikate / Konzepte") wirkt bei 390px eng, bleibt aber noch innerhalb des Viewports ohne erkennbaren Umbruch-Mechanismus für schmalere Geräte (z. B. iPhone SE, 375px).
**Lösung:** Auf einem noch schmaleren Testgerät (375px) verifizieren; ggf. horizontales Scroll-Snapping für die Toolbar vorsehen.

*(Siehe auch Abschnitt 7 für weitere, accessibility-relevante Touch-Target-Befunde, die auch Mobile direkt betreffen.)*

---

## 5. Tablet-Optimierung

🔴 **Hoch** — Bereich: Sidebar-Navigation, App-weit (alle Tabs betroffen)
**Problem:** Zwischen 768px und 1023px (also auf **jedem** Tablet im Hochformat, verifiziert bei 820px) rendert die Sidebar-Navigation jedes Label hart auf 6 Zeichen abgeschnitten — **ohne Ellipse, ohne Tooltip-Ersatz** — durch einen wörtlichen `.slice(0, 6)`-Aufruf im Code. Das Ergebnis: "KARTEI" statt "Karteikarten", "FEYNMA" statt "Feynman-Methode", "KLAUSU" statt "Klausur-Simulator", "WISSEN" statt "Wissensnetz", "BIBLIO" statt "Bibliothek", "LERNFO" statt "Lernfortschritt", "KALEND" statt "Kalender", "HAUSAR" statt "Hausarbeit", "RECHER" statt "Recherche". Screenshot-bestätigt auf 3 verschiedenen Tabs.
**Fundstelle:**
```tsx
// components/Layout.tsx:443 — aktuell
<span className="text-[7px] font-black uppercase tracking-wide leading-none">{t(item.labelKey).slice(0, 6)}</span>
```
**Warum problematisch:** Das ist der auffälligste Einzelbefund des gesamten Audits — abgeschnittene, zu Kauderwelsch verstümmelte Wörter sind das Gegenteil von "Apple/Notion/Linear-Niveau" und wirken wie ein ungetesteter Zwischenstand, nicht wie ein bewusstes Kompaktlayout. Jeder Tablet-Nutzer (iPad im Hochformat ist ein Alltagsgerät für Studierende) sieht das bei jedem einzelnen Tab-Wechsel.
**Lösung:** Text-Label auf diesem Breakpoint komplett entfernen und stattdessen auf reines Icon + das bereits vorhandene `title`-Tooltip-Attribut (Zeile 436) setzen — exakt das Muster, das Linear, Notion und Slack für schmale Sidebar-Zustände verwenden:
```tsx
// components/Layout.tsx:429-446 — Zielzustand
{allNavItems.map(item => {
  const isActive = activeTab === item.tab;
  const Icon = ICONS[item.tab];
  return (
    <button
      key={item.tab}
      onClick={() => onTabChange(item.tab)}
      title={t(item.labelKey)}
      className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-200 active:scale-90 shrink-0 ${isActive ? 'shadow-[0_2px_12px_rgba(169,119,44,0.35)]' : ''}`}
      style={isActive ? { background: SIDEBAR.gold, color: SIDEBAR.bg } : { color: SIDEBAR.textMuted }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = SIDEBAR.hoverBg; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      {Icon && <Icon className="w-5 h-5" strokeWidth={1.75} />}
    </button>
  );
})}
```
(Entfernt die `<span>`-Zeile komplett; `w-12 h-12` bleibt als reine Icon-Hit-Area erhalten, `title` übernimmt die Beschriftung als natives Hover-Tooltip.)
**Erwarteter UX-Gewinn:** Aus dem am wenigsten professionell wirkenden Detail der ganzen App wird ein sauberes, von großen Produkten bekanntes Icon-Rail-Muster — der höchste "wirkt plötzlich premium"-Hebel pro Aufwand im gesamten Audit.

🟢 **Niedrig** — Bereich: Klausur-Simulator (Tablet)
**Problem:** Keiner — das zweispaltige Desktop-Layout kollabiert bei 820px sauber zu einer einzelnen Spalte, ohne gequetschte oder gestreckte Bereiche.
**Positivbefund:** Dieses Verhalten zeigt, dass das responsive Grid-System grundsätzlich funktioniert — der Sidebar-Fund oben ist die Ausnahme, nicht die Regel.

---

## 6. Desktop-Optimierung

*(Nur bis 1440px getestet — Aussagen zu 27″/32″/Ultrawide sind Extrapolation, nicht Screenshot-verifiziert.)*

🟠 **Mittel** — Bereich: Tutor, Lernfortschritt
**Problem:** Die unter Abschnitt 2 genannten Hierarchie-Probleme (Tutor: riesige Leerfläche; Lernfortschritt: Kartenwand) verschärfen sich auf größeren Monitoren weiter, da der zentrierte `max-w-6xl`-Container bei 1440px+ nicht mitwächst, wodurch beidseitig noch mehr ungenutzte Fläche entsteht, während der Content-Bereich selbst nicht breiter/informationsdichter wird.
**Lösung:** Für Lernfortschritt speziell prüfen, ob ab `xl:`/`2xl:` ein zweispaltiges Karten-Grid (statt einspaltig gestapelt) die vorhandene Breite sinnvoller nutzt, ohne die in Abschnitt 2 empfohlene Reduktion der gleichzeitig sichtbaren Karten zu unterlaufen.
**UX-Gewinn:** Große Monitore zeigen mehr *Übersicht*, nicht nur mehr *Leerraum*.

🟢 **Niedrig** — Bereich: Landing-Page
**Problem:** Fließtext-Absätze (Hero-Subline, Storytelling-Sektionen) nutzen `max-w-xl`/`max-w-2xl` — für 1440px+ vertretbar, sollte aber bei einer echten Ultrawide-Prüfung (falls die Landing-Page dort je manuell geöffnet wird) gegengecheckt werden, da keine `2xl:`-Sonderregel für Zeilenlänge existiert.

---

## 7. Accessibility

🔴 **Hoch** — Bereich: App-weit (alle 12 Modals)
**Problem:** Keines der 12 Modal-Komponenten (`AnkiImportModal`, `AuthModal`, `ChapterSelectorModal`, `DeckStatsModal`, `DocumentViewerModal`, `EditCardModal`, `EditSourceModal`, `ExportDeckModal`, `LegalModal`, `SettingsModal`, `UpgradeModal`, `UploadSourceModal`) setzt `role="dialog"` oder `aria-modal="true"`. Nur `EditCardModal.tsx` bewegt den Fokus beim Öffnen aktiv ins Modal; die anderen 11 lassen den Tastatur-Fokus im Hintergrund stehen.
**Warum problematisch:** Screenreader-Nutzer erfahren nie, dass sie sich in einem Dialog befinden; Tastatur-Nutzer können aus jedem Modal versehentlich in den verdeckten Hintergrund tabben.
**Lösung:** Eine gemeinsame `useModalA11y()`-Hook einführen (setzt `role="dialog"`/`aria-modal="true"` auf den Modal-Container, fokussiert beim Mount das erste interaktive Element, fängt `Tab` am Rand ab), auf alle 12 Modals anwenden.
**UX-Gewinn:** Alle Modals werden für Tastatur- und Screenreader-Nutzer gleichzeitig zugänglich, mit einer einzigen zentralen Änderung.

🔴 **Hoch** — Bereich: App-weit (Icon-only Buttons)
**Problem:** Mindestens 13 Icon-only-Buttons ohne `aria-label`/`title`, darunter der Sidebar-**Logout**-Button (`Layout.tsx:352-354`), der Einstellungen-Button (`Layout.tsx:512-517`), die Wissensnetz-Zoom-/Fit-View-Controls (`GraphCanvas.tsx:1032-1037`, teils sogar nur `+`/`−` als Text statt Icon) sowie mehrere Löschen-Buttons (`AppContent.tsx:301,424`, `FlashcardSystem.tsx:523`).
**Warum problematisch:** Für Screenreader-Nutzer sind das nicht identifizierbare "Button"-Elemente ohne jede Funktion — bei "Logout" und "Löschen" potenziell folgenreich.
**Lösung:** `aria-label` an allen 13 Stellen ergänzen (das korrekte Muster existiert bereits an 7 anderen Stellen im selben Codebase, z. B. `AuthModal.tsx:109`, `Toast.tsx:48` — als Vorlage kopierbar).
**UX-Gewinn:** Kernaktionen (abmelden, löschen, zoomen) werden für unterstützende Technologien überhaupt erst wahrnehmbar.

🔴 **Hoch** — Bereich: Studienplaner, Kalender (Formulare)
**Problem:** 14+ Eingabefelder (`StudyPlanner.tsx:471-492`, `CalendarDayPanel.tsx:173-456`) setzen `outline-none` ohne jeden Fokus-Ersatz — inkl. Datums-/Zeitfeldern ganz ohne Label oder Platzhalter (`CalendarDayPanel.tsx:452,456`: reine `type="time"`-Felder ohne jeden Kontext).
**Lösung:** App-weites `focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/50`-Pattern (existiert bereits korrekt in `NotificationSettingsPanel.tsx`) auf alle betroffenen Inputs anwenden; Datum-/Zeitfelder zusätzlich mit `aria-label` versehen.
**UX-Gewinn:** Der komplette Termin-/Klausurplanungs-Flow wird erstmals ohne Maus bedienbar und verständlich.

🔴 **Hoch** — Bereich: Quiz, Klausur (Kern-Lern-Flow)
**Problem:** Die Lückentext-Eingabefelder während eines laufenden Quiz (`QuizPlayer.tsx:460,533`) und einer laufenden Klausur (`ExamView.tsx:490`) haben `outline-none` ohne Fokus-Ersatz.
**Lösung:** Gleiche Fokus-Ring-Regel wie oben anwenden — hier mit besonderer Priorität, da es sich um den zentralen Produkt-Loop handelt.

🟠 **Mittel** — Bereich: Suche/Umschalter (SourceSelector, ScholarSearch, TermPaperSystem)
**Problem:** Drei echte interaktive Steuerelemente sind als `<div onClick>` ohne `role`, `tabIndex` oder `onKeyDown` gebaut: ein kompletter Toggle-Switch (`SourceSelector.tsx:356-360`, dazu ohne `role="switch"`/`aria-checked`), eine Ergebnis-Ausklapp-Zeile (`ScholarSearch.tsx:191-194`), eine Dokumentauswahl-Checkbox-Zeile (`TermPaperSystem.tsx:624-625`).
**Lösung:** Entweder auf echte `<button>`/`<input type="checkbox">`-Elemente umstellen (bevorzugt) oder `role`, `tabIndex={0}`, `onKeyDown` (Enter/Space) ergänzen.
**UX-Gewinn:** Drei zentrale Auswahl-Interaktionen werden erstmals ohne Maus/Touch bedienbar.

🟠 **Mittel** — Bereich: App-weit (Farbkontrast-Risiko, nicht bestätigt)
**Problem:** `text-slate-300`/`text-slate-400` ohne `dark:`-Variante wird sehr breit für Sekundärtext/Icons verwendet (u. a. alle 9 Icon-Buttons in `CalendarDayPanel.tsx`, dazu kombiniert mit `opacity-40` auf Mobile in `SourceCard.tsx` — doppeltes Kontrastrisiko, da der Hover-Reveal-Mechanismus auf Touch nicht greift).
**Lösung:** Stichprobenartig mit einem echten Kontrastmesser (z. B. Chrome DevTools „Contrast ratio") gegenprüfen; wo <4.5:1, auf `slate-500`/`slate-600` anheben.
**UX-Gewinn:** Bessere Lesbarkeit für Nutzer mit eingeschränktem Sehvermögen, besonders auf Mobile bei Sonnenlicht.

🟢 **Niedrig** — Bereich: Formulare, App-weit
**Problem:** Viele `<label>`-Elemente sind sichtbar vorhanden, aber nicht über `htmlFor`/`id` mit ihrem Input verknüpft (Geschwister-Element statt Elternteil) — u. a. `AuthModal.tsx`, `AuthPage.tsx`, `SettingsModal.tsx`.
**Lösung:** `htmlFor`/`id`-Paare ergänzen (kleiner Aufwand, große Screenreader-Wirkung).

---

## 8. Animationen

*Diese Kategorie wurde bereits in einer vorherigen Audit-Runde (`plans/001`–`004`, alle vier umgesetzt und deployed-bereit) gezielt bearbeitet: kaputtes `animate-in`-Dauer-System repariert, Streak-Update-Bug behoben, `prefers-reduced-motion` + `hover:hover`-Gating app-weit ergänzt, Konfidenz-Panel interruptibel gemacht. Hier nur neue, in dieser Runde zusätzlich gefundene Berührungspunkte:*

🟠 **Mittel** — Bereich: App-weit
**Problem:** Die in Abschnitt 1.6/1.7 gefundene Hover-Scale- und Active-Scale-Uneinheitlichkeit ist auch eine Animations-Konsistenzfrage (unterschiedliche "gefühlte Physik" derselben Interaktion).
**Lösung:** Siehe 1.6/1.7 — mit der dortigen Vereinheitlichung ist dieser Punkt miterledigt.

---

## 9. Microinteractions

🟠 **Mittel** — Bereich: App-weit (Ladezustände)
**Problem:** Jeder Ladezustand in der App nutzt einen generischen Spinner (`border-4`-Kreis oder `BrandSpinner`) — nirgends wurden inhaltsspezifische Skeleton-Screens gefunden (die den späteren Karten-/Listen-Umriss vorab andeuten, wie bei Notion/Linear üblich).
**Warum problematisch:** Spinner kommunizieren nur "etwas lädt", Skeletons kommunizieren zusätzlich "so wird es aussehen" — spürbar niedrigeres wahrgenommenes Tempo und weniger "hochwertiges" Gefühl beim Laden von Bibliothek/Karteikarten-Listen.
**Lösung:** Für die 2-3 am häufigsten aufgerufenen Listenladezustände (Bibliothek-Dokumentliste, Karteikarten-Stapel-Liste) einfache Skeleton-Platzhalter (graue, pulsierende Rechtecke in Karten-Form) statt Spinner einführen.
**Erwarteter UX-Gewinn:** Ladezeiten fühlen sich kürzer an, ohne dass sich die tatsächliche Ladezeit ändert — einer der günstigsten "gefühlt schneller"-Hebel überhaupt.

🟢 **Niedrig** — Bereich: Klausur-Simulator ("Simulation starten")
**Problem:** Der finale, disabled-graue "SIMULATION STARTEN"-Button (wenn kein Dokument gewählt ist) gibt keinen Hinweis, *warum* er deaktiviert ist — kein Tooltip, kein Inline-Hinweistext direkt am Button.
**Lösung:** Kleinen Hinweistext unter dem Button einblenden ("Wähle zuerst ein Lernmaterial"), solange `disabled` aktiv ist.

*(Siehe auch Abschnitt 7: die fehlenden Fokus-Ring-Microinteractions und die Disabled-Opazitäts-Fragmentierung aus Abschnitt 1.8 gehören inhaltlich auch hierher.)*

---

## 10. Performance

🟢 **Niedrig** — Bereich: App-weit (Code-Gewicht, kein Laufzeitproblem)
**Problem:** Die ~75 toten `active:scale-*`-Klassen aus Abschnitt 1.7 vergrößern das kompilierte CSS geringfügig ohne jeden funktionalen Nutzen.
**Lösung:** Wird durch den Fix in 1.7 automatisch mit erledigt.

*Keine neuen Layout-Shift- oder Re-Render-Befunde in dieser Runde — die relevanten Punkte (Framer-Motion-Shorthands, `transition: all`, `width`-Animationen) wurden bereits in der vorherigen Animations-Audit-Runde behandelt (`plans/003`, `plans/004`). Die in Abschnitt 1.1 vorgeschlagenen Radius-Tokens und die in 9. vorgeschlagenen Skeletons haben keinen negativen Performance-Impact (reine CSS-Klassen bzw. bereits vorhandene Lade-Zeitfenster).*

---

## 11. Design-System

**Zusammenfassende Einschätzung:** Es gibt bereits ein echtes, benanntes Fundament (`--primary`-Farbfamilie mit `--p50`–`--p950`, `shadow-3d-*`-Tokens, eine dokumentierte Microcopy-Konvention in CLAUDE.md) — das Problem ist durchgängig, dass dieses Fundament **nicht erzwungen** wird. Fast jeder Einzelbefund oben ist derselbe Fehlertyp: eine Komponente entscheidet sich lokal neu, statt ein vorhandenes Token wiederzuverwenden.

🔴 **Hoch** — Bereich: `tailwind.config.cjs`
**Problem:** Es existieren keine `theme.extend.borderRadius`- oder `theme.extend.spacing`-Tokens — jeder der 20 Radius-Werte und jede Karten-Polsterung wird als freie Arbitrary-Value (`rounded-[Npx]`, `p-[Npx]`) neu erfunden.
**Lösung:**
```js
// tailwind.config.cjs — theme.extend ergänzen
borderRadius: {
  chip: '16px',
  card: '24px',
  panel: '32px',
},
```
Danach schrittweise (beginnend mit den 🔴-Befunden aus Abschnitt 1) auf `rounded-chip`/`rounded-card`/`rounded-panel` migrieren.
**Erwarteter UX-Gewinn:** Jede neue Komponente wählt automatisch aus 3 sinnvollen Werten statt aus unendlich vielen Pixelzahlen — verhindert, dass die in diesem Audit gefundenen Inkonsistenzen in 6 Monaten wieder neu entstehen.

🟠 **Mittel** — Bereich: App-weit (Icon-System)
**Problem:** Mindestens 8 Stellen (Modal-Close ×6, Bibliothek-Ordner-Aktionen ×2) pflegen eigene rohe Inline-SVGs parallel zu `lucide-react`, obwohl das passende Icon dort bereits existiert.
**Lösung:** Siehe 1.11 — eine gemeinsame `<ModalCloseButton />`-Komponente plus konsequente `lucide-react`-Nutzung überall.

🟢 **Niedrig** — Bereich: Dokumentation
**Problem:** CLAUDE.md dokumentiert die Microcopy-Konvention korrekt, aber keine der anderen in diesem Audit gefundenen De-facto-Konventionen (Hover-Scale 1.02/1.05, Disabled-Opazität, CTA-Radius) sind irgendwo schriftlich festgehalten — jede neue Komponente muss den Stil aus dem bestehenden Code erraten.
**Lösung:** Nach Umsetzung der 🔴-Befunde die finalen Werte in CLAUDE.md unter "Design-Regeln" ergänzen (Radius-Stufen, Hover-/Active-Scale-Werte, Disabled-Opazität, Icon-Größen-Tabelle).

---

## Priorisierung (Empfehlung)

Die stärksten Einzelhebel, sortiert nach Wirkung ÷ Aufwand:

1. **Tablet-Sidebar-Truncation** (Abschnitt 5) — 1 Zeile Code, größter sichtbarer "wirkt kaputt"-Eindruck der ganzen App.
2. **`group-hover:indigo`-Farbbruch** (1.5) — wenige CSS-Zeilen, verhindert sichtbaren Markenbruch bei jeder Karten-Interaktion.
3. **Fehlende `role="dialog"`/Fokus-Management in 11 Modals** (7) — eine Hook, 12 Anwendungsstellen, größter Accessibility-Hebel.
4. **Lernfortschritt-Seite entlasten** (2) — größter "fühlt sich premium an"-Hebel, aber der aufwändigste Punkt der Liste (echtes Redesign, kein Ein-Zeilen-Fix).
5. **Dashboard-Hover-Scale + Primär-CTA-Radius vereinheitlichen** (1.1, 1.6) — sehr sichtbar, sehr günstig.
6. **Mobile SettingsModal-Button-Clipping** (4) — konkreter, reproduzierbarer Bug, kleiner Fix.

Alles danach (Icon-Größen-Konsolidierung, Design-Tokens einführen, Skeletons) ist echte Qualitätsarbeit, aber bewusst nachrangig — passend zur bereits vom Nutzer selbst gelebten Regel aus der letzten Audit-Runde: die Top-Hebel zuerst, den Rest iterativ.
