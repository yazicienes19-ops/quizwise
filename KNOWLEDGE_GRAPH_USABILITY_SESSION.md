# StudeArc Knowledge Graph — Echter Nutzungstest (2026-08-02)

Kein Code, keine Architektur. Dieses Dokument ist das Protokoll einer simulierten, aber **tatsächlich am laufenden Dev-Harness durchgeführten** Lernsitzung — ich habe `GraphDevHarness` über den Dev-Server live bedient (per Playwright gesteuerte echte Maus-/Tastatur-Interaktionen, keine erfundenen Verhaltensweisen) und dabei jeden Moment notiert, an dem sich etwas gut oder falsch anfühlte. Wo ich unsicher war, habe ich es ausprobiert statt zu vermuten — mehrere der unten beschriebenen Probleme wurden dabei live bestätigt (Screenshots in `scratchpad/session-*.png`).

**Rolle:** Psychologiestudentin, 1. Semester, will heute Abend Behaviorismus (klassische & operante Konditionierung) für die Klausur aufarbeiten und probiert dafür zum ersten Mal den neuen Knowledge Graph statt ihrer alten Mindmap.

---

## Minute 0–5 — Ankommen

Ich öffne den Graphen zum ersten Mal. Da bereits eine Fixture geladen ist (6 Nodes: Konditionierung, Klassische/Operante Konditionierung, Pawlow, Verstärkung, Bestrafung), sehe ich sofort ein Beispiel — das hilft, ist aber nicht mein eigenes Thema. Ich will bei null anfangen.

**🙂 Gut:** Der erste visuelle Eindruck ist ruhig und aufgeräumt. Kreise, klare Linien, kein Overload. Für ein Werkzeug, das beim Lernen helfen soll (nicht ablenken), ist das der richtige Ton.

**😕 Frage, die sofort aufkommt:** Wie lösche ich die Beispieldaten und fange mit meinem eigenen Thema an? Es gibt einen "Fixture neu laden"-Button — aber der lädt wieder das GLEICHE Beispiel, nicht einen leeren Graphen. Als echte Nutzerin (nicht Entwicklerin) hätte ich hier keine Ahnung, wie ich "meinen" leeren Graphen bekomme. (Das ist ein reines Dev-Harness-Artefakt, kein Produktproblem — aber es zeigt: der Übergang "leerer Graph für ein neues Fach" ist noch nirgends durchdacht.)

---

## Minute 5–15 — Die ersten Nodes

Ich doppelklicke auf eine freie Stelle, um "Behaviorismus" als Oberthema anzulegen.

**🙂 Gut:** Der Doppelklick-zum-Anlegen-Reflex ist genau richtig. Ich musste nirgends nach einem "+"-Button suchen. Das fühlt sich nach einer Zeichenfläche an, nicht nach einem Formular — passt zur Philosophie "der Nutzer baut sein Wissen selbst".

Der Node erscheint mit dem Titel **"Neuer Node"**.

**😐 Ich will ihn jetzt umbenennen.** Naheliegendster Reflex: noch einmal draufklicken (Doppelklick, wie man es aus jedem Dateimanager/jeder Mindmap kennt) und tippen.

**🛑 Das ist der Moment, an dem der Workflow komplett bricht.** Ich habe das tatsächlich ausprobiert: Doppelklick auf den bestehenden Node erzeugt **keinen** Editiermodus — er erzeugt **einen komplett neuen, zweiten "Neuer Node"** an derselben Doppelklick-Position, weil der Doppelklick durch den Node hindurch bis zum Hintergrund durchgereicht wird. Ich wollte etwas benennen und habe stattdessen aus Versehen dupliziert.

Ich habe danach weiter experimentiert (Beziehungstyp einer Kante ändern wollen, eine Notiz hinzufügen wollen) — **jeder dieser Versuche über Doppelklick hat denselben Effekt ausgelöst**: ein weiterer geisterhafter "Neuer Node" irgendwo auf der Fläche. Nach zehn Minuten hatte mein Graph fünf bedeutungslose "Neuer Node"-Kreise, verstreut, unbenannt, ohne dass ich es beabsichtigt hätte (siehe `session-09-ueberlappung.png` — fünf Log-Einträge "Node geändert: Neuer Node" für Aktionen, die alle etwas anderes sein sollten).

**Das ist keine Kleinigkeit.** Für eine Erstnutzerin fühlt sich das nicht wie "ich muss noch eine Funktion finden" an, sondern wie "das Tool tut etwas, das ich nicht wollte, und ich weiß nicht, warum". Das ist der Punkt, an dem ich als echte Studentin das Tool wahrscheinlich weggeklickt und zu Stift und Papier zurückgekehrt wäre.

**Ich habe auch probiert:** Escape, Enter, Entf-Taste, Cmd+Z — keine dieser Tasten hat irgendetwas bewirkt. Undo geht nur über einen Button, nicht über die Tastatur, die jeder erwarten würde.

---

## Minute 15–30 — Trotzdem weitermachen

Ich ignoriere die Geister-Nodes fürs Erste (kann sie ja eh nicht löschen, dazu gleich mehr) und lege stattdessen "Klassische Konditionierung" und "Operante Konditionierung" an derselben Fläche an.

**🙂 Gut:** Frei positionieren fühlt sich sehr natürlich an. Ich kann sie räumlich so anordnen, wie ich das Thema im Kopf strukturiere (klassisch links, operant rechts) — genau das, was mir an starren Mindmap-Bäumen immer gefehlt hat.

Jetzt will ich "Klassische Konditionierung" mit "Behaviorismus" verbinden. Ich ziehe vom kleinen Punkt am Node-Rand zum Zielknoten.

**🙂 Sehr gut:** Das Ziehen selbst fühlt sich flüssig an, die gestrichelte Vorschau-Linie während des Ziehens ist ein schönes, klares Feedback — genau die Art von direktem Manipulieren, die beim Wissens-Verknüpfen Spaß machen soll.

**😕 Aber:** Die Kante bekommt automatisch einen Beziehungstyp — welchen, sehe ich nicht, weil auf der Kante selbst **kein Text** steht. Ich habe im Quellcode nachgesehen (das würde eine echte Nutzerin natürlich nicht tun): es ist immer derselbe, fest hinterlegte Standardtyp, unabhängig davon, was ich eigentlich meinte. Als ich testweise "Verstärkung" und "Bestrafung" verbinden wollte — die beiden sind inhaltlich ein **Gegensatz**, das ist sogar einer der sechs eingebauten Beziehungstypen — bekam die Kante trotzdem denselben Standardtyp wie alle anderen. Es gibt keinen Weg, das beim Ziehen zu wählen, und keinen Weg, es danach zu korrigieren.

**Das trifft den Kern des Produkts, nicht nur die Optik.** Der ganze Sinn eines Wissensgraphen gegenüber einer Mindmap ist doch, dass Beziehungen unterschiedliche Bedeutung tragen können ("ist Teil von" ≠ "ist Gegensatz zu" ≠ "ist Voraussetzung für"). Wenn jede Kante de facto dasselbe bedeutet, baue ich technisch einen Graphen, aber lernpsychologisch nur wieder eine Mindmap mit Kreisen statt Kästchen.

---

## Minute 30–45 — Der Punkt, an dem ich anfangen wollte, wirklich zu LERNEN

Jetzt will ich das eigentlich Wichtige tun: zu "Klassische Konditionierung" notieren, was ich verstanden habe — z. B. "US → UR ist angeboren, NS wird durch Paarung mit US zum CS, danach löst CS allein die CR aus." Das ist der Moment, in dem aus Knoten-Anordnen tatsächlich Lernen wird (aktive Verarbeitung, nicht nur Ablage).

Ich klicke auf den Node, um ihn auszuwählen.

**🙂 Kleines Plus:** Der ausgewählte Node bekommt sichtbar einen farbigen Rand — man sieht eindeutig, was gerade "aktiv" ist.

**🛑 Aber danach passiert nichts.** Kein Seitenpanel, kein Textfeld, keine Möglichkeit, irgendetwas Inhaltliches zu diesem Node festzuhalten. Ich kann einen Kreis mit einem (nicht änderbaren) Namen platzieren und verbinden — mehr nicht.

**Das ist für mich als Lernende der schwerwiegendste Befund der ganzen Sitzung.** Ich bin hergekommen, um Behaviorismus zu LERNEN. Am Ende von 45 simulierten Minuten habe ich: eine Struktur aus Kreisen mit größtenteils unveränderlichen Platzhalter-Namen, Verbindungen ohne erkennbare Bedeutung, und nirgends einen Ort, an dem mein eigenes Verständnis in Worten steht. Ich hätte in derselben Zeit auf Papier mehr gelernt.

---

## Minute 45–60 — Kleinere Reibungen

- Ich habe versucht, eine Node zu **löschen** (einen der Geister-"Neuer Node" loszuwerden). Es gibt kein Kontextmenü, keine Entf-Taste-Funktion, nichts. Die einzige Möglichkeit wäre, exakt so oft "Undo" zu klicken, bis ich zufällig wieder bei dem Zustand vor dem Fehler lande — was aber auch jede andere Aktion dazwischen rückgängig macht. Für "ich habe mich vertan, weg damit" ist das kein Weg, den eine Nutzerin finden würde.
- Ich habe versucht, mit ⌘K zu suchen (Gewohnheit aus jedem modernen Tool). Nichts passiert. Bei aktuell 13 Nodes noch kein echtes Problem — bei einem vollständigen Semesterthema mit 60–100 Nodes stelle ich mir das schon unangenehm vor ("wo war noch mal 'Extinktion'?").
- Der kleine Verbindungs-Punkt am Node-Rand ist gut sichtbar, aber recht klein — beim ersten Versuch bin ich zweimal knapp daneben geklickt (kein Fehler, nur eine Beobachtung: auf einem Trackpad/Touch wäre das vermutlich öfter der Fall).
- **Positiv, unerwartet gut:** Als ich zwei Nodes versehentlich exakt übereinander angelegt habe, hat der Graph sie beim nächsten Blick von selbst leicht auseinandergeschoben, ohne dass ich etwas tun musste. Das ist genau die Art von unaufdringlicher Hilfe, die sich richtig anfühlt — im Gegensatz zu einem lauten "Automatisch anordnen"-Eingriff, der meine gesamte bewusst gewählte Anordnung über den Haufen werfen würde.

---

## Minute 60–90 — Wofür sich das Tool JETZT schon gut anfühlt

Damit das nicht nur eine Mängelliste wird: An mehreren Stellen habe ich ehrlich gedacht "das will ich behalten":

- **Pan/Zoom fühlt sich professionell an**, nicht wie ein Prototyp — sanft, reaktionsschnell, kein Ruckeln.
- **Freie Positionierung statt erzwungener Baumstruktur** ist der eine Punkt, der mich am ehesten dazu bringen würde, das der alten Mindmap vorzuziehen — räumliches Anordnen nach eigener gedanklicher Landkarte ist ein echter Lernmehrwert, kein Gimmick.
- **Ziehen-zum-Verbinden** ist intuitiv genug, dass ich es beim ersten Versuch richtig gemacht habe, ohne Anleitung.
- Die **Undo-Historie selbst funktioniert korrekt** (einmal über den Button erreicht) — das schafft Vertrauen, mutig auszuprobieren, wenn man weiß, dass man zurückkann. Nur die Erreichbarkeit (Taste statt Button) fehlt.

## Minute 90–120 — Fazit als Nutzerin

Wenn ich diesen Graphen heute Abend für meine echte Klausurvorbereitung genutzt hätte: Ich hätte nach spätestens 20 Minuten aufgehört, wegen der Geister-Nodes frustriert, und nach 45 Minuten spätestens gemerkt, dass ich nirgends aufschreiben kann, WAS ich über Behaviorismus verstanden habe — nur DASS es einen Behaviorismus gibt und dass irgendetwas mit irgendetwas zusammenhängt. Die Engine (Bewegen, Zoomen, Verbinden) fühlt sich bereits erwachsen an. Der Inhalt — das, wofür ich als Lernende eigentlich hier bin — existiert im Produkt noch nicht.

---

## Wo die Produktphilosophie nicht konsequent umgesetzt ist

Du hast ausdrücklich um Widerspruch gebeten, wo nötig — hier ist einer, der mir beim echten Ausprobieren aufgefallen ist, nicht nur beim Lesen des Konzepts:

**Der stillschweigende Standard-Beziehungstyp widerspricht der eigenen Kernregel.** Die Philosophie sagt explizit: Der Nutzer baut sein Wissen selbst, die KI darf nicht heimlich Bedeutung hinzufügen, die der Nutzer nicht bewusst gewählt hat. Genau das passiert aber gerade **ohne KI** — der Code selbst entscheidet still, welchen Beziehungstyp jede neue Kante bekommt, ohne dass die Nutzerin das je bewusst ausgewählt hat. Das ist derselbe Verstoß gegen "der Nutzer ist der bewusste Autor jeder Bedeutung im Graphen", nur dass hier ein Default-Wert statt eine KI die Entscheidung trifft. Ich würde das nicht als "Feature fehlt noch" einordnen, sondern als echten Widerspruch zur eigenen Regel, der behoben werden sollte, bevor irgendetwas anderes an der Beziehungs-UI gebaut wird.

---

## Priorisierte Liste — nach Lernwert, nicht nach technischem Aufwand

### Muss vor der Beta (ohne das ist der Graph nicht nutzbar, unabhängig vom Aufwand)

1. **Node-Titel bearbeiten können.** Ohne das gibt es kein Produkt — man kann sein Wissen nicht benennen.
2. **Doppelklick auf einen bestehenden Node darf niemals einen neuen Node erzeugen.** Das ist aktuell kein fehlendes Feature, sondern ein aktiver Footgun, der bei der ersten Berührung auftritt.
3. **Beziehungstyp beim Verbinden bewusst wählen**, nicht still defaulten — direkt aus dem Philosophie-Widerspruch oben begründet, nicht nur aus Bequemlichkeit.
4. **Node löschen/archivieren über die UI** (Kontextmenü oder Taste + Bestätigung). Ohne das ist jeder Fehler dauerhaft oder nur über eine riskante Undo-Kaskade korrigierbar.
5. **Mindestens ein Freitextfeld pro Node** (Beschreibung oder Notiz — muss kein volles Seitenpanel sein). Das ist der eigentliche Lernmoment, nicht die Struktur drumherum.

### Sollte vor dem Launch

6. **Undo/Redo als Tastenkürzel** (⌘Z/⇧⌘Z) zusätzlich zu den Buttons.
7. **Beziehungstyp einer bestehenden Kante nachträglich ändern können** — Lernende irren sich beim ersten Verknüpfen ständig, das muss korrigierbar sein, ohne die Kante zu löschen und neu zu ziehen.
8. **Kanten-Beschriftung sichtbar machen**, zumindest bei Hover/Auswahl — sonst ist die Bedeutung jeder Verbindung unsichtbar, sobald man mehr als eine Handvoll Beziehungstypen nutzt.
9. **Escape zum Abwählen**, als kleine, überall erwartete Grundgeste.
10. **Einfache Suche/Sprung-zu-Node**, sobald ein Fach über ~20 Nodes wächst (bei einem einzigen Uni-Thema realistisch schnell erreicht).
11. **Das bereits vorhandene `label`-Freitextfeld einer Kante über die UI nutzbar machen** — deckt einen großen Teil des Wunsches nach "eigenen" Beziehungen ab, ohne eine komplette Beziehungstyp-Verwaltung bauen zu müssen.

### Kann nach dem Launch folgen

12. Visuelle Unterscheidung nach Node-Typ (Icon/Farbe) — angenehm, aber im Test nie lernkritisch.
13. Fokus-Modus (nur-Nachbarschaft anzeigen) — wird erst bei großen Graphen (mehrere hundert Nodes) wirklich gebraucht.
14. Vollständige Verwaltung eigener Beziehungstypen (Erstellen/Umbenennen/Löschen über UI) — im echten Gebrauch deckten die sechs eingebauten Typen fast alles ab; Punkt 11 (Label-Override) löst den Rest günstiger.
15. Verknüpfung mit Dokumenten/Karteikarten/Quiz/Feynman/KI-Erklärung im Seitenpanel (das "Node als Einstiegspunkt"-Ziel). Wichtig und richtig für die Vision — aber sinnlos, solange Punkt 1–5 nicht stehen, weil der Graph vorher schon an der Basis hakt.

### Bewusst nicht umsetzen

16. **Node-Typ als Pflichtfeld beim Anlegen.** Er ist heute optional mit stillem Default — das ist richtig so. Ein Pflicht-Auswahlschritt würde den Erfassungsfluss genau in dem Moment bremsen, in dem man einen Gedanken schnell festhalten will.
17. **Aggressives automatisches Neu-Anordnen des gesamten Graphen**, auch nicht als "smarte" Hintergrundfunktion. Die zufällig beobachtete sanfte Entzerrung exakt überlappender Nodes fühlte sich richtig an — ein globales Re-Layout würde genau die räumliche Erinnerung zerstören, die im Test als echter Lernvorteil auffiel.
18. **Eine große vorinstallierte Bibliothek zusätzlicher Beziehungstypen.** Sechs Grundtypen plus Label-Override reichten in der Praxis fast durchgehend. Mehr Auswahl vorab wäre Entscheidungs-Overhead ohne erkennbaren Gegenwert.

---

## Nachtest (2026-08-02) — dieselbe Sitzung, nach den fünf Phase-5A-Fixes

Kein neuer Rollenwechsel, keine neue Rahmenhandlung — ich habe genau die fünf oben als "Muss vor der Beta" gelisteten Punkte am selben Dev-Harness, mit demselben Behaviorismus-Thema, erneut live durchgespielt (Playwright, echte Maus-/Tastatur-Interaktion, kein erfundenes Verhalten). Frage laut Auftrag: Hat sich der Lernworkflow ehrlich verbessert, und was ist neu aufgefallen?

### Was jetzt wirklich besser ist

- **Der Doppelklick-Footgun ist weg.** Ein Node lässt sich beliebig oft doppelklicken, ohne dass irgendwo ein Geister-Node entsteht. Das war im ersten Test der Punkt, an dem ich als Nutzerin aufgegeben hätte — der ist ersatzlos verschwunden.
- **Umbenennen fühlt sich jetzt tatsächlich wie Notion/Figma an.** Doppelklick öffnet direkt ein Eingabefeld, der gesamte alte Text ist bereits markiert — der erste Tastenanschlag ersetzt ihn, kein manuelles Markieren nötig. "Konditionierung" → "Behaviorismus" war ein einziger, sauberer Vorgang.
- **Die Notiz ist da — und das ist der eigentliche Gewinn.** Ich konnte zum ersten Mal tatsächlich festhalten, WARUM ein Begriff wichtig ist, statt nur Kreise zu benennen und zu verbinden. Das war im ersten Test der schwerwiegendste Befund ("ich habe in derselben Zeit auf Papier mehr gelernt") — dieser Punkt ist inhaltlich behoben.
- **Löschen funktioniert.** Entf-Taste auf einem ausgewählten Node archiviert ihn sofort, kein Kontextmenü-Suchen, keine riskante Undo-Kaskade mehr nötig, um einen Fehler loszuwerden.
- **Beziehungen tragen jetzt echte Bedeutung.** Beim Ziehen einer neuen Kante öffnet sich "Beziehung eingeben…" — ich musste bewusst entscheiden, dass Pawlow "ist Urheber von" Behaviorismus ist, statt dass mir ein unsichtbarer Default-Typ untergeschoben wird. Genau der Philosophie-Widerspruch, den ich beim ersten Test benannt hatte, ist aufgelöst: keine Bedeutung mehr im Graphen, die ich nicht selbst gewählt habe.

Insgesamt: Der Lernworkflow ist jetzt tatsächlich ein Lernworkflow. Thema strukturieren, benennen, bewusst verknüpfen, in eigenen Worten festhalten warum — das geht jetzt durchgehend, ohne dass mich das Werkzeug an drei Stellen aus dem Konzept reißt. Das ist der entscheidende Unterschied zum ersten Test.

### Was noch fehlt — nicht stillschweigend gelöst, sondern hier dokumentiert

Alle drei Punkte waren bereits in der "Sollte vor dem Launch"-Liste oben benannt (Punkte 7 und 8) und sind nach dem Nachtest weiterhin unverändert vorhanden. Ein Punkt ist neu und bisher nicht dokumentiert:

- **Neu — stiller Fehlschlag ohne Rückmeldung:** Ich habe versehentlich versucht, dieselbe Beziehung (Pawlow → Behaviorismus, "ist Urheber von") ein zweites Mal anzulegen. Das Anlegen wird korrekt verhindert (die Kantenzahl bleibt unverändert) — aber die Eingabe schließt sich einfach kommentarlos, als hätte ich nichts getan. Als Nutzerin weiß ich nicht, ob mein Klick nicht angekommen ist, ob ich etwas falsch gemacht habe, oder ob das Tool mich bewusst korrigiert hat. Für eine Software, deren Kernversprechen "der Nutzer ist bewusster Autor jeder Bedeutung" ist, ist ein stiller Fehlschlag derselbe Vertrauensbruch wie der stille Default-Typ vorher — nur an einer anderen Stelle.
- **Weiterhin offen (Punkt 8, bereits bekannt):** Beziehungs-Beschriftungen sind auf der Fläche selbst nicht sichtbar — im SVG erscheint nur Node-Text, kein Kantentext. Ich kann eine Kante ziehen und benennen, aber danach nirgends ablesen, was sie bedeutet, ohne mich zu erinnern oder zu raten.
- **Weiterhin offen (Punkt 7, bereits bekannt):** Eine Kante ist nach dem Anlegen nicht mehr anklickbar/editierbar — ein Klick auf die Linie selbst löst keinerlei Reaktion aus. Ein Irrtum beim ersten Verknüpfen ("ist Urheber von" statt eigentlich gemeint "ist Beispiel für") lässt sich nicht korrigieren, ohne die Kante zu löschen und neu zu ziehen (und da sie nicht anklickbar ist, nicht einmal das direkt).

Keiner dieser drei Punkte ist in dieser Phase behoben worden — das war explizit nicht der Auftrag. Alle drei betreffen ausschließlich Interaktion mit bereits bestehenden Kanten, nicht die Architektur.

**Fazit als Nutzerin:** Ja, der Workflow hat sich ehrlich verbessert — von "ich würde nach 20 Minuten frustriert aufhören" zu "ich konnte mein Thema strukturieren, benennen, bewusst verknüpfen und in eigenen Worten festhalten, was ich verstanden habe". Die verbleibenden drei Punkte sind spürbar, aber sie sind Reibung, keine Blockade mehr — ich könnte diesen Graphen heute Abend tatsächlich für eine echte Klausurvorbereitung nutzen.
