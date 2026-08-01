# StudeArc Knowledge Graph — Softwarekonzept

Status: **Konzeptphase abgeschlossen, Phase 1 (Datenbank) und Phase 2 (TypeScript-Domain) sind umgesetzt.** Basis: vollständige Analyse des bestehenden Mindmap-Systems (`MindmapSystem/Editor/Canvas/OutlineEditor`, `services/mindmapTree.ts`, `mindmapLayout.ts`, `mindmapExport.ts`, `mindmapService.ts`) sowie der angrenzenden Systeme (`types.ts`, `syncService.ts`, `flashcardService.ts`, `libraryService.ts`, `topicConfidence.ts`, `navConfig.ts`). Konkrete Umsetzung, Migration und der kritische Architektur-Review vom 2026-08-02 (inkl. zweier behobener Fehler: `purgeNode` löschte real nichts, Local-First war ohne Pending-Write-Tracking nicht eingehalten) stehen in `KNOWLEDGE_GRAPH_PHASE1_PLAN.md` — dieses Dokument bleibt die Produkt-/Architektur-Vision, jenes ist der aktuelle Implementierungsstand.

---

## 0. Kernentscheidungen vorab (Executive Summary)

Damit du nicht erst nach Abschnitt 16 merkst, wo ich widerspreche:

1. **Ein Graph pro Fach, nicht viele kleine Graphen pro Dokument.** Die alte Mindmap war multi-instanziierbar (viele kleine Mindmaps, oft 1:1 an ein Dokument gebunden). Der Knowledge Graph ist als **ein kontinuierlich wachsendes Wissensmodell pro Fach** gedacht (optional: ein globaler Graph über alle Fächer). Das ist eine bewusste Abkehr vom bisherigen Muster — sie ist notwendig, damit der Graph wirklich "Fundament" werden kann statt eine weitere Dokument-Notiz zu sein.
2. **Der Node wird die kanonische Konzept-Identität der App — und verdrängt damit langfristig die losen `topic`-Strings**, die heute in `TopicMetric`, `QuizQuestion.topic`, `ExamQuestion.topic`, `RecallChallenge.topic` etc. verstreut sind. Das ist der eigentliche strategische Wert des Projekts. Ohne diese Konvergenz entstehen **drei parallele Konzeptsysteme** (alte Mindmap-Leichen, freie Topic-Strings, neue Graph-Nodes) — das wäre schlechter als der jetzige Zustand.
3. **Die KI darf strukturell nicht schreiben können.** Ich schlage vor, das nicht nur als UX-Richtlinie, sondern als Code-Grenze zu erzwingen: Der KI-Service-Layer importiert die Schreibfunktionen des Graph-Modells gar nicht. Er kann nur `GraphSuggestion`-Objekte erzeugen, die der Nutzer explizit bestätigen muss — technisch identisch zu einer manuellen Aktion.
4. **Rendering: SVG zuerst, Canvas erst wenn Messung es verlangt.** Bei "hunderten bis tausenden Nodes" wäre die naheliegende Antwort "sofort Canvas + WebGL". Das widerspricht aber der Regel "keine Komplexität für hypothetische Anforderungen". Ich schlage einen klaren Renderer-Seam vor, der den Wechsel später ermöglicht, ohne dass Datenmodell/State neu geschrieben werden müssen.
5. **Sync-Muster aus `syncService.ts` (ein großer JSONB-Blob pro Feld) ist für den Graphen ungeeignet** und sollte hier bewusst NICHT wiederverwendet werden — bei tausenden Nodes würde jede Änderung den gesamten Graphen neu hochladen. Stattdessen: eine Zeile pro Node/Edge, wie es im Kern schon bei `flashcard_decks`/`mindmaps` gemacht wird, nur eine Granularitätsstufe feiner.
6. **Migration alter Mindmaps ist eine offene Entscheidung, keine Fußnote.** Falls echte Nutzer bereits Mindmaps angelegt haben, brauchen wir vor dem Rollout eine Antwort: Import als Node-Kette oder bewusster Datenverlust mit Hinweis.

Diese sechs Punkte ziehen sich durch die folgenden 16 Abschnitte.

---

## 1. Produktvision

Der Knowledge Graph ist nicht "Mindmap 2.0", sondern die Ablösung des Dokuments als gedankliche Grundeinheit der App. Heute organisiert sich StudeArc um **Dateien** (Bibliothek → Dokument → Aktion). Der Graph organisiert sich um **Konzepte**, die aus beliebig vielen Dokumenten gespeist werden können und über die Zeit wachsen — unabhängig davon, ob das ursprüngliche PDF noch geöffnet wird.

Der Nutzer baut sein eigenes mentales Modell des Fachs aktiv auf (Konstruktivismus statt Konsum). Die KI ist Lektor, nicht Autor: Sie kommentiert einen bestehenden Graphen, sie entwirft ihn nie. Das ist der entscheidende Unterschied zu praktisch jedem "AI Mindmap Generator" auf dem Markt — und der eigentliche USP.

Langfristig hängen an jedem Node: die Dokumentstellen, aus denen das Konzept stammt, die Karteikarten, die es abfragen, die Quiz-/Klausurfragen, die es prüfen, und die Lernstand-Metrik, die zeigt, wie sicher der Nutzer darin ist. Der Graph wird damit zur Landkarte, auf der alle anderen Module nur noch Werkzeuge sind, die man an einem Punkt der Karte auslöst.

---

## 2. UX-Konzept

**Einstieg:** Aus der Bibliothek heraus (wie bisher bei `initialDoc` in `MindmapSystem`) kann der Nutzer aus einem geöffneten Dokument heraus "Knoten für dieses Konzept anlegen" auswählen — das öffnet den Graphen mit einem vorausgefüllten, aber leeren Node-Entwurf (Titel-Vorschlag aus der Markierung, Rest bleibt manuell). Das ist bewusst kein Automatismus, sondern eine Abkürzung für eine Aktion, die der Nutzer sowieso vorhatte.

**Hauptfläche:** Der Graph selbst — Pan/Zoom-Canvas, Nodes als kompakte Karten (Titel, Icon, Farbe, kleiner Typ-Tag), Edges als beschriftete Linien. Kein Auto-Layout-Zwang: Nodes bleiben, wo der Nutzer sie hinlegt (siehe Abschnitt 11).

**Seitenpanel statt Vollbild-Navigation.** Das ist ein bewusster Bruch mit dem bisherigen Navigationsmuster der App: Bibliothek → `SourceDetailPage` und Mindmap-Liste → `MindmapEditor` ersetzen beim Klick die komplette Ansicht (`onBack`-Pattern). Für den Graphen wäre das falsch — der Nutzer verliert bei jedem Klick auf einen Node die räumliche Orientierung im Graphen. Stattdessen: Klick auf Node → Panel schiebt sich von rechts ein, Canvas bleibt sichtbar und interaktiv darunter/daneben (angelehnt an Obsidian/Notion/Figma-Inspector). Technisch ist das keine Neuerfindung: `MindmapEditor.tsx` nutzt bereits ein Zwei-Spalten-Grid (`lg:col-span-4` Outline / `lg:col-span-6` Canvas) — wir übernehmen dieselbe Grid-Technik, nur dass die rechte Spalte jetzt bedingt ein- und ausblendet statt permanent zwei Editoren nebeneinander zu zeigen.

**Suche statt nur Navigation.** Ab ca. 50+ Nodes ist reines Herumnavigieren im Canvas nicht mehr die primäre Zugriffsart. Eine Befehlsleiste (⌘/Strg+K) zum Suchen *und* Neuanlegen von Nodes ist ab Phase 1 Pflicht, kein Nice-to-have.

**Fokus-Modus.** Ein Klick auf einen Node kann optional den Graphen auf dessen direkte Nachbarschaft (1–2 Hops) reduzieren — wichtig, sobald ein Fach hunderte Nodes hat und der Gesamtüberblick nicht mehr hilfreich ist.

**Leerer Graph als Problem.** Die alte Mindmap hatte einen klaren Kaltstart (`# Thema\n## Unterpunkt 1`). Ein leerer Graph ist einschüchternder als ein leeres Textdokument. Ohne bewusstes Onboarding (z. B. "Leg deinen ersten Knoten an, während du liest") wird die Funktion vermutlich kaum genutzt — das ist unter Risiken nochmal aufgeführt.

**Mobil/iOS ist kein Nachgedanke.** `@capacitor/ios` ist bereits Abhängigkeit — eine native App ist also real geplant. Ein Graph-Editor mit Drag, Marquee-Selection und Kontextmenüs ist auf Touch strukturell schwieriger als auf Desktop. Das gehört als Anforderung in Phase 1, nicht als "kümmern wir uns später drum".

---

## 3. Informationsarchitektur

- `ActiveTab.MINDMAP` wird zu `ActiveTab.GRAPH` (Rename, kein Parallelbetrieb — die Nav-Gruppe "Lernen" behält ihren Platz).
- **Scope-Modell:** Jeder Node/Edge trägt ein optionales `collectionId` (Fach), exakt wie heute `ProcessedDocument`, `MindmapItem`, `FlashcardDeck`. Die Graph-Ansicht filtert standardmäßig auf das aktive Modul (`studearc_active_module`, dasselbe Muster wie in `MindmapSystem.tsx`), erlaubt aber eine "Alle Fächer"-Gesamtansicht — echte fachübergreifende Kanten (z. B. Statistik-Konzept als Voraussetzung in Forschungsmethoden) sollen möglich sein, nicht künstlich verboten.
- **Verhältnis zu Dokumenten:** Dokumente werden zu reinen Quellen. Statt `MindmapItem.sourceDocumentId` (1:1) gibt es eine echte n:m-Verknüpfungstabelle Node↔Dokument (Details Abschnitt 4/6).
- **Verhältnis zu Karteikarten/Quiz/Klausur:** Additiv, nicht invasiv. Es wird kein neues Fremdschlüsselsystem im Sinne einer relationalen DB erzwungen; stattdessen bekommen `Flashcard`, `QuizQuestion`, `ExamQuestion` ein optionales `linkedNodeIds?: string[]` — exakt das Muster, mit dem dieser Codebase seit jeher rückwärtskompatible Erweiterungen macht (`srs?`, `bloomLevel?`, `subScores?`). Der Node selbst speichert keine Rückverweise (Begründung Abschnitt 5).
- **Verhältnis zu `TopicMetric`/Lernanalyse:** Bewusst NICHT in Phase 1 verschmolzen (siehe Roadmap), aber als Zielbild festgehalten: `TopicMetric` bekommt später ein optionales `nodeId?`, GapRadar/`errorPool.ts`/`learningProfileService.ts` können dann graduell auf Node-Referenzen statt Freitext-Strings umstellen, ohne dass die bestehenden String-Topics sofort brechen.

---

## 4. Datenmodell

Vier Kernentitäten, alle Zeilen-basiert (nicht ein großes Blob-Dokument wie die alte `MindmapItem.markdown`):

**GraphNode** — siehe Abschnitt 5
**GraphEdge** — siehe Abschnitt 6
**GraphRelationType** — benutzerdefinierbarer Beziehungstyp (siehe Abschnitt 6)
**GraphNodeDocumentRef** — Verknüpfungstabelle Node ↔ Dokument, n:m:
  - `nodeId`, `documentId`, optional `excerpt` (Textstelle), optional `page`
  - Idee zur späteren Erweiterung (nicht Phase 1): Die App hat mit `pdfHighlightService.ts`/`sourceQuoteParser.ts` bereits Infrastruktur, um ein Zitat im PDF exakt zu markieren (genutzt im Split-Screen-Reader). Ein `excerpt`-Feld hier könnte darüber später "Dokument öffnen" direkt zur passenden Stelle springen lassen, statt nur das Dokument zu öffnen. Reine Option, kein MVP-Bestandteil.

Bewusst **kein** Vererbungs-/Blob-Format wie bei der alten Mindmap (`markdown`-Feld, das trotz des Namens JSON-serialisierter Baum war). Jede Entität ist ein eigener, flacher Datensatz — Voraussetzung für granulare Sync- und Query-Performance bei tausenden Nodes.

---

## 5. Node-Modell

Felder (konzeptionell, keine Implementierung):

- `id`
- `type`: freier String mit Vorschlagsliste (Begriff, Theorie, Definition, Formel, Prozess, Person, Beispiel, Ereignis) statt hartem Enum — konsistent mit deiner Vorgabe "bewusst flexibel bleiben" und mit dem bestehenden Muster im Code (`ExamCategory`, `BloomLevel` sind auch offene String-Unions, keine geschlossenen Systeme).
- `title`
- `description`: Markdown-Text (objektive Definition/Inhalt) — rendert über den bereits vorhandenen `markdownRenderer.tsx`, keine neue Rich-Text-Engine nötig.
- `notes`: separates Feld für persönliche Anmerkungen, bewusst getrennt von `description` (Zettelkasten-Prinzip: "was das Konzept ist" vs. "was ich mir dazu merke").
- `color`, `icon` (Icon-Key aus `lucide-react`, bereits Abhängigkeit — kein neuer Icon-Picker nötig)
- `position: { x, y }` — **wird persistiert**, nicht bei jedem Laden neu berechnet. Das ist ein bewusster Unterschied zur alten Mindmap, die bei jeder Änderung per `d3.tree()` komplett neu layoutet. Der Nutzer "besitzt" die räumliche Anordnung seines Wissens; Auto-Layout ist nur eine Hilfe für neue/importierte Nodes (Abschnitt 11).
- `collectionId?` (Fach-Scope)
- `tags: string[]`
- `archivedAt: number | undefined` (Zeitstempel statt reinem Boolean — dient gleichzeitig als Soft-Delete-Flag UND als Sync-Tombstone, siehe Korrektur/Detailplanung in `KNOWLEDGE_GRAPH_PHASE1_PLAN.md`. Ein stark vernetzter Node verschwindet damit reversibel aus der Ansicht, ohne dass Kanten separat mit-archiviert werden müssen — deren Sichtbarkeit wird beim Lesen aus dem Archiv-Status ihrer Endpunkte abgeleitet)
- `createdAt`, `updatedAt`

**Bewusst NICHT im Node:** Listen wie `linkedFlashcardIds`/`linkedQuizQuestionIds`. Grund: Würde man das am Node führen, bräuchte man bei jeder Karteikarten-Erstellung/-Löschung ein zweiseitiges Sync (Karte→Node und Node→Karte), mit denselben Merge-Konflikt-Risiken wie früher bei Markdown-verschachtelten Strukturen. Stattdessen zeigt nur die Karte/Frage optional auf den Node (`linkedNodeIds?`), und "welche Karten gehören zu diesem Node" wird beim Laden aus dem vorhandenen Karten-/Fragenbestand berechnet (einmaliger Index-Aufbau, siehe Abschnitt 7) — eine Quelle der Wahrheit statt zwei.

---

## 6. Beziehungen (Edge-Modell)

**GraphEdge:**
- `id`, `sourceNodeId`, `targetNodeId`
- `relationTypeId`
- `label?` (Freitext-Override, falls der Nutzer eine Kante abweichend vom Typ beschriften will)
- `createdAt`
- Bewusst **keine** `strength`/Gewichtung in Phase 1 — es gibt aktuell keinen definierten Nutzen dafür (YAGNI); kann nachgerüstet werden, sobald eine KI-Funktion tatsächlich gewichtete Pfade braucht.

**GraphRelationType** (nutzerdefinierbar):
- `id`, `label`, `symmetric: boolean`, `color?`, `icon?`, `isBuiltIn: boolean`
- Sechs eingebaute Typen als Startbestand: ist Teil von, Voraussetzung von, Beispiel für, Ursache von, Gegensatz zu, gehört zusammen mit. Die letzten beiden sind `symmetric: true` (eine Kante reicht, Anzeige läuft in beide Richtungen), die anderen sind gerichtet.
- Eigene Typen sind pro Account, nicht global.
- Ergänzungsidee für später (nicht MVP): gerichtete Typen bekommen ein `inverseLabel` ("Voraussetzung von" ↔ "baut auf … auf"), damit das Seitenpanel eines Ziel-Nodes die Beziehung grammatikalisch korrekt in Gegenrichtung anzeigen kann statt nur einen Pfeil umzudrehen.

**Zyklen sind explizit erlaubt.** Das ist ein bewusster Unterschied zur alten Mindmap, deren `moveNode`/`isDescendant`-Logik Zyklen strukturell verhindert (Baum-Invariante). Ein Wissensgraph darf zirkuläre Beziehungen abbilden — und genau ein problematischer Zyklus (z. B. "A Voraussetzung von B" UND "B Voraussetzung von A") ist ein gutes, konkretes erstes Ziel für die spätere "Inkonsistenzen finden"-Funktion. Die Datenstruktur muss das also zulassen, nicht verhindern.

---

## 7. State Management

Der Codebase verwendet aktuell **keine** globale State-Library (kein Redux/Zustand/Jotai) — Zustand lebt in domänenspezifischen Hooks (`useDocuments`, `useQuizState`, `usePersistentState`), orchestriert von `AppContent.tsx` per Props. Diesem Muster sollte der Graph grundsätzlich folgen (`useKnowledgeGraph(collectionId?)`), aber mit einer wichtigen Ergänzung:

**Naives `useState<GraphNode[]>` + `useState<GraphEdge[]>` skaliert nicht** auf "tausende Nodes" — jede Mutation eines einzelnen Nodes würde sonst ein komplettes Array-Copy + Re-Render des gesamten Graphen auslösen (das ist bei der alten Mindmap mit ihren maximal paar Dutzend Knoten pro Baum nie ein Problem gewesen). Vorschlag: ein normalisierter In-Memory-Store innerhalb des Hooks (`Map` für `nodesById`, `edgesById`, plus Adjazenz-Indizes `edgesBySource`/`edgesByTarget`, einmal aufgebaut und inkrementell bei Mutationen aktualisiert). Mutationen selbst sind **reine Funktionen** (`addNode`, `updateNode`, `archiveNode`, `addEdge`, `updateEdge`, `removeEdge`, …), die den Store transformieren — exakt das Testmuster, das `mindmapTree.ts`/`mindmapTree.test.ts` bereits etabliert hat, nur auf einer normalisierten statt verschachtelten Struktur.

**Kein globaler Context in Phase 1.** `AppContent.tsx` bleibt der einzige Owner, der den Hook aufruft und die Ergebnisse als Props durchreicht — konsistent mit dem restlichen Code. Sobald mehrere, gleichzeitig sichtbare Bereiche (z. B. ein Dashboard-Widget UND das Graph-Panel UND eine künftige "Wo im Graphen bin ich"-Sidebar) parallel lesenden Zugriff brauchen, wird Prop-Drilling unhandlich — dann (nicht früher) ein `GraphProvider`-Context einführen. Das ist keine Spekulation, sondern folgt direkt eurer eigenen Regel in `CLAUDE.md` (Paket 10: App.tsx aufteilen, Hooks statt Monolith) — nur zeitlich später angewendet als beim ersten Wurf.

**Persistenz-Debouncing:** Positions-Updates beim Ziehen eines Nodes dürfen NICHT bei jedem Frame synchronisiert werden — nur bei Drag-Ende persistieren (lokal sofort, Cloud-Sync gedebounced wie im bestehenden 400ms-Muster aus `MindmapEditor.tsx`).

---

## 8. Komponentenstruktur

```
KnowledgeGraphSystem        — Einstiegspunkt, lädt Graph für aktiven Scope (kein "Liste vieler Mindmaps" mehr)
├── KnowledgeGraphCanvas     — Pan/Zoom/Drag, rendert Nodes+Edges (Renderer austauschbar, s. Abschnitt 10)
├── GraphNodeDetailPanel     — Seitenpanel: Titel/Beschreibung/Notizen/Tags/Dokument-Refs/Beziehungen,
│                              später Tabs: Karteikarten, Quiz, Feynman, KI-Erklärung
├── GraphSearchCommandBar    — ⌘K: Node suchen ODER direkt neu anlegen
├── GraphFilterBar           — Filter nach Fach/Tag/Node-Typ/Beziehungstyp, Fokus-Modus (Hop-Distanz)
├── GraphRelationTypeManager — eigene Beziehungstypen verwalten
└── GraphOnboardingEmptyState
```

```
services/graph/
├── graphModel.ts            — reine CRUD-Funktionen auf dem normalisierten Store (getestet wie mindmapTree.test.ts)
├── graphIndex.ts             — Adjazenz-Aufbau, neighbors(), subgraph(nodeId, hops) für Fokus-Modus
├── graphLayoutForce.ts       — d3-force-Wrapper, NUR für unpositionierte/neue/importierte Nodes
├── graphSyncService.ts       — Supabase CRUD, Zeilen-Granularität (analog mindmapService.ts/flashcardService.ts)
├── graphRelationTypes.ts     — Seed + CRUD für Beziehungstypen
└── (Phase 4) graphAiSuggestions.ts — siehe Abschnitt 14, importiert graphSyncService NICHT
```

Diese Trennung ist keine Kosmetik: dass `graphAiSuggestions.ts` die Schreibfunktionen aus `graphSyncService.ts`/`graphModel.ts` gar nicht importiert, ist die technische Umsetzung der Philosophie "KI erstellt nicht automatisch" — ein Code-Review kann das an einem fehlenden Import erkennen, nicht nur an einer Konvention im Kopf der Entwickler.

---

## 9. Ordnerstruktur

Folgt eins zu eins der bestehenden Struktur (`components/`, `services/`, `hooks/`), kein neues Top-Level-Verzeichnis:

```
components/
  KnowledgeGraphSystem.tsx
  GraphCanvas.tsx
  GraphNodeDetailPanel.tsx
  GraphSearchCommandBar.tsx
  GraphFilterBar.tsx
  GraphRelationTypeManager.tsx
services/graph/
  graphModel.ts (+ .test.ts)
  graphIndex.ts (+ .test.ts)
  graphLayoutForce.ts
  graphSyncService.ts
  graphRelationTypes.ts (+ .test.ts)
hooks/
  useKnowledgeGraph.ts
```

Die alten `Mindmap*`-Dateien werden nach erfolgreicher Migration vollständig entfernt, nicht als toter Code belassen (kein Kompatibilitäts-Reexport).

---

## 10. Rendering-Konzept

Zwei ehrliche Optionen, keine Alternative überspringen:

**Option A — SVG (Empfehlung für Phase 1).** Direkte Weiterentwicklung des bestehenden `MindmapCanvas.tsx`-Ansatzes: `d3-zoom` fürs Pan/Zoom, `framer-motion` für sanfte Node-Übergänge, HTML-Overlay für interaktive Steuerelemente (das bereits gelöste Safari-`foreignObject`-Problem bleibt gelöst). Grenze: SVG hält bei einigen hundert DOM-Knoten gut durch, wird aber im vierstelligen Bereich spürbar langsam (Layout-Thrashing, teure Re-Paints).

**Option B — Canvas 2D + manuelles Hit-Testing** (z. B. via `d3.quadtree`, ebenfalls Teil der bereits vorhandenen `d3`-Abhängigkeit). Skaliert deutlich besser auf tausende Elemente, kostet aber: `framer-motion` funktioniert nicht auf Canvas (animiert DOM/SVG-Properties) — Animationen (Pan-Trägheit, Node-Einblendungen) müssten manuell per `requestAnimationFrame` + Easing gebaut werden. Höherer Implementierungsaufwand, höheres Risiko.

**Empfehlung:** Mit Option A starten, aber den Renderer hinter einer klaren Schnittstelle kapseln (Canvas-Komponente bekommt nur `positioned nodes + edges` aus `graphIndex.ts`, nichts SVG-Spezifisches sickert in Datenmodell/State). Der Wechsel zu Option B wird dann zu einem lokalen Austausch der Rendering-Komponente, sobald echte Nutzungsdaten zeigen, dass ein Fach tatsächlich in den vierstelligen Node-Bereich kommt — nicht vorher. Volle Canvas-Infrastruktur vor dem ersten echten Graphen mit >50 Nodes zu bauen, wäre Komplexität für eine hypothetische Anforderung.

---

## 11. Layout-Konzept

- **Manuelle Position ist die Wahrheit.** Einmal gesetzt (durch Ziehen oder durch initiales Auto-Layout), bleibt `position` unangetastet, bis der Nutzer erneut zieht oder explizit "Automatisch anordnen" klickt.
- **d3-force nur für neue/unpositionierte Nodes**, nicht als Dauerzustand. Ein kurzer Simulationslauf beim Anlegen mehrerer Nodes auf einmal (z. B. Import) platziert sie sinnvoll; danach wird die Simulation gestoppt und die Positionen eingefroren.
- **"Automatisch anordnen" ist ein expliziter, nutzerausgelöster Button**, nie ein automatischer Hintergrundprozess — konsistent mit der Philosophie "der Nutzer erstellt sein Wissen selbst", die sich hier auch auf die räumliche Darstellung erstreckt.
- **Fokus-Modus** berechnet ein eigenständiges, temporäres Kraft-Layout nur für die gefilterte Nachbarschaft, ohne die gespeicherten Positionen der ausgeblendeten Nodes zu verändern.

---

## 12. Interaktionsmodell

- Klick auf Node → Seitenpanel öffnet sich (Canvas bleibt aktiv)
- Doppelklick auf leere Fläche → neuer Node an dieser Position
- Ziehen von einem Node-Rand zu einem anderen Node → Kante erzeugen, danach Inline-Popover zur Auswahl des Beziehungstyps
- Rechtsklick/Long-Press → Kontextmenü (Archivieren, Duplizieren, Position fixieren/lösen, Panel öffnen)
- Mehrfachauswahl (Rahmen ziehen) → Sammel-Tagging/Fach-Zuordnung
- Tastatur: ⌘/Strg+K (Suche/Neuanlage), Entf (Archivieren der Auswahl), Escape (Panel schließen)
- **Touch/iOS** (siehe Abschnitt 2): Pinch-Zoom, Tap-and-Hold für Kontextmenü, Drag-Handle für Kanten muss groß genug für Finger sein — als Designanforderung, nicht als Portierungs-Nachgedanke.

---

## 13. Synchronisationsstrategie

**Explizite Abkehr vom `syncService.ts`-Muster** (ein großer JSONB-Blob pro Nutzer/Feld, komplett überschrieben bei jeder Änderung) — das ist für Streaks/Settings/History sinnvoll, für einen wachsenden Graphen mit tausenden Zeilen aber der falsche Ansatz: jede kleine Änderung würde den kompletten Datensatz neu übertragen.

Stattdessen, in Fortführung des bereits bei `mindmaps`/`flashcard_decks` verwendeten Zeilen-Musters, nur eine Granularitätsstufe feiner:

- Tabellen: `graph_nodes`, `graph_edges`, `graph_relation_types`, `graph_node_documents` — je eine Zeile pro Entität.
- **Local-first**: Cache in `localStorage` unter fachbezogenen Schlüsseln (`studearc_graph_nodes_v1`, analog zum bestehenden `studearc_`-Präfix-Muster), sofortige optimistische UI-Updates, Cloud-Schreiben debounced im Hintergrund.
- **Merge:** Last-Write-Wins pro Entität anhand `updatedAt` — für Metadaten-Konflikte (zwei Geräte benennen denselben Node um) ausreichend, weil Kollisionen selten sind.
- **Löschen als Tombstone, nicht als harte DELETE-Zeile.** Bei Offline-Sync kann ein hartes `DELETE` auf einem Gerät eine gleichzeitig auf einem anderen Gerät neu angelegte Kante mit derselben ID "wiederauferstehen" lassen oder umgekehrt eine gerade wiederhergestellte Verbindung erneut löschen. Ein `deletedAt`-Zeitstempelfeld (später bereinigt) ist hier sicherer — das ist eine Neuerung gegenüber allen bisherigen Sync-Services in diesem Code, aber notwendig für die geforderte Skalierung.
- **Inkrementelles Nachladen.** Anders als `mindmapService.ts`/`flashcardService.ts`, die immer den kompletten Bestand eines Nutzers laden, braucht der Graph ab einigen hundert Nodes einen `lastSyncedAt`-Cursor pro Scope, um nur geänderte Zeilen nachzuladen — sonst lädt jeder App-Start den gesamten Graphen neu, was der explizit geforderten Skalierung auf "tausende Nodes" direkt widerspricht.

---

## 14. Erweiterbarkeit

- `type` am Node ist ein offener String mit Vorschlagsliste, kein geschlossenes Enum → neue Konzeptarten brauchen keine Migration.
- `GraphRelationType` ist nutzerdefinierbar von Anfang an → neue Beziehungsarten ohne Codeänderung.
- Das Seitenpanel ist als Tab-/Aktions-Registry gedacht: "Dokument öffnen", "Karteikarten", "Quiz starten", "Feynman-Modus" sind heute vier feste Tabs, aber strukturell nur Einträge einer Liste — ein zukünftiger fünfter Lernmodus registriert sich genauso, ohne den Panel-Kern anzufassen.
- Verknüpfung von Lernartefakten läuft einheitlich über `linkedNodeIds?` — jeder künftige Artefakt-Typ (z. B. ein zukünftiges "Konzept-Video") bekommt dieselbe Anbindung, ohne dass der Graph selbst etwas Neues wissen muss.
- Die KI-Funktionen (Feedback, fehlende Konzepte, Beziehungsvorschläge, Inkonsistenzen, Lernempfehlungen) sind fünf unabhängige "Suggestion Provider" mit gemeinsamer Ausgabe-Form (`GraphSuggestion`), einzeln testbar und einzeln abschaltbar — keine monolithische "KI-Analyse"-Funktion.

---

## 15. Risiken

1. **Migration bestehender Mindmaps ungeklärt.** Falls reale Nutzerdaten existieren (`mindmaps`-Tabelle), muss vor dem Rollout entschieden werden: automatischer Import als lineare Node-Kette (Heading-Ebene → Node-Hierarchie über "ist Teil von"-Kanten) oder expliziter, kommunizierter Funktionsverlust. Das ist eine Produktentscheidung, keine technische Nebensache.
2. **Doppelte Konzeptmodelle, wenn die Konvergenz mit `TopicMetric` verschleppt wird.** Passiert das nicht, widersprechen sich künftig Graph-Node-Ansicht und Lernanalyse-Dashboard in genau der Art, die die KI eigentlich als "Inkonsistenz" erkennen soll — nur diesmal ist die Inkonsistenz in der eigenen Architektur.
3. **Overengineering-Falle beim Rendering.** Eine volle Canvas/WebGL-Pipeline vor dem ersten Graphen mit nennenswerter Nodezahl zu bauen, bindet Wochen an einem Problem, das evtl. nie in der Größenordnung eintritt.
4. **Kalter Start / leerer Graph.** Ohne bewusstes Onboarding wirkt eine leere Fläche einschüchternder als das alte "# Thema"-Gerüst — reales Adoptionsrisiko, kein rein kosmetisches Problem.
5. **Scope-Kriechen.** Die 16 hier beschriebenen Abschnitte ergeben zusammen fast eine eigene Teilplattform. Wird versucht, Basis-Graph UND KI-Feedback-Layer gleichzeitig zu bauen, wird vermutlich nichts fertig. Sequenzierung ist Pflicht (siehe Roadmap).
6. **Beziehungstyp-Wildwuchs.** Nutzer könnten viele semantisch redundante Beziehungstypen anlegen ("verwandt mit" neben "gehört zusammen mit" neben "ähnlich zu"). Kein Bug, aber schwächt später die Fähigkeit der KI, über den Graphen sauber zu argumentieren. Eine sanfte "Gibt es schon einen ähnlichen Typ?"-Anzeige beim Anlegen kann helfen, ist aber Politur, kein Blocker.
7. **Touch-Bedienbarkeit auf iOS ist ungetestetes Neuland** für diese Art von Editor in diesem Codebase — verdient einen frühen Prototyp/Spike, bevor viel Engineering-Zeit in die volle Interaktion fließt.

---

## 16. Roadmap

**Phase 0 — diese Architektur fixieren** (dieses Dokument; offene Fragen unten klären).

**Phase 1 — MVP, ersetzt den Mindmap-Tab:** Node-/Edge-CRUD, ein Graph pro Fach, SVG-Renderer mit Zoom/Pan/Drag, Seitenpanel (nur Titel/Beschreibung/Notizen/Tags/Dokument-Refs — noch keine Karteikarten-/Quiz-Verknüpfung), Local-First + zeilenbasierter Supabase-Sync, nur eingebaute Beziehungstypen, manuelle Platzierung (kein Auto-Layout nötig bei wenigen Nodes), Suchleiste. Migrationsentscheidung aus Risiko 1 ist hier bereits umgesetzt, nicht aufgeschoben.

**Phase 2 — Ausbau:** Eigene Beziehungstypen, Verknüpfung von Karteikarten/Quiz-/Klausurfragen mit Nodes (`linkedNodeIds` + Panel-Tabs), Fokus-Modus, d3-force-Auto-Layout für neue/importierte Nodes, inkrementeller Sync (`lastSyncedAt`) sobald Graphen wachsen.

**Phase 3 — Konvergenz:** Beginn der Annäherung Graph-Node ↔ `TopicMetric` (Dashboard/GapRadar lesen bevorzugt vom Node, fallen zurück auf String-Topics). Canvas-Renderer-Wechsel NUR falls Messung ihn tatsächlich nötig macht.

**Phase 4 — KI-Schicht (additiv, nie schreibend):** Feedback, fehlende Konzepte erkennen, Beziehungen vorschlagen, Inkonsistenzen finden, Lernempfehlungen — als Vorschlags-Warteschlange mit Bestätigungs-UI, technisch getrennt vom Schreibpfad (Abschnitt 8/14).

**Phase 5 — Graph als echter Einstiegspunkt:** Erst wenn Nutzungsdaten das rechtfertigen, wird der Graph zur primären Landing-Ansicht (statt/neben Dashboard) — eine große Navigationsänderung, die nicht vorschnell passieren sollte.

---

## Entscheidungen (2026-08-01, final für Phase 1)

1. **Scope:** Ein Graph pro Fach, mit optionaler Gesamtansicht — wie empfohlen (Abschnitt 3).
2. **Migration:** Keine echten Nutzerdaten in der `mindmaps`-Tabelle vorhanden → **kein Import**. Die alte Mindmap-Tabelle/Komponenten werden nach dem Umbau ersatzlos entfernt, keine Import-Logik nötig. Risiko 1 (Abschnitt 15) ist damit erledigt.
3. **Rendering:** SVG-first wie empfohlen (Abschnitt 10) — Canvas-Wechsel bleibt eine spätere, messungsgetriebene Option (Phase 3), kein Thema für Phase 1.
4. **Roadmap-Reihenfolge:** bestätigt, KI-Schicht (Phase 4) kommt erst nach einem alltagstauglichen manuellen Graphen.

Damit ist die Architektur für Phase 1 vollständig fixiert. Nächster Schritt: konkrete Implementierungsplanung (Datenbank-Migrationen, Komponenten-Reihenfolge, erster Commit-Schnitt).
