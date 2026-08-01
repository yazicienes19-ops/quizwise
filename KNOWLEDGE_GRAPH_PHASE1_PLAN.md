# StudeArc Knowledge Graph — Phase 1 Implementierungsplanung (Datenbasis)

Status: **Phase 2 (TypeScript-Domain) umgesetzt, kritisch geprüft, zwei Fixes eingearbeitet (2026-08-02).** Baut auf `KNOWLEDGE_GRAPH_KONZEPT.md` auf (dort fixiert: ein Graph pro Fach, SVG-first, zeilenbasierter Sync, keine Migration alter Mindmaps). ID-Strategie final: `crypto.randomUUID()` ausschließlich für die vier neuen Graph-Tabellen, bestätigt durch vollständige Codebase-Analyse. Die App bleibt ansonsten unverändert. Migration liegt in `backend/migration_graph_v1.sql`. Vollständige Domain-Implementierung unter `services/graph/*.ts` (11 Module + Tests, 652 Tests grün projektweit). **Aktueller Stand und offene, bewusst zurückgestellte Punkte: Abschnitt 7.**

## Korrektur gegenüber dem Konzeptdokument (bitte gegenlesen)

Beim Durchdenken der Sync-/Lösch-Mechanik ist mir eine Schwäche im ursprünglichen Konzept aufgefallen: Abschnitt 5 dort führte **zwei parallele Lösch-Konzepte** ein — ein UI-`archived`-Flag am Node UND einen separaten Sync-Tombstone `deletedAt`. Das ist redundant und würde zwei Wahrheitsquellen für "ist dieser Node weg" erzeugen. Ich habe das zu **einem** Feld vereinheitlicht: `archivedAt` (Zeitstempel statt Boolean) dient gleichzeitig als UI-Sichtbarkeits-Flag UND als Sync-Tombstone. Ein echtes Hard-Delete passiert nur als bewusste Zweitaktion aus dem bereits archivierten Zustand heraus ("endgültig löschen"), nicht automatisch. Details unten in Abschnitt 1.

Außerdem: Ich bin von den bestehenden client-generierten Kurz-IDs (`Math.random().toString(36)`, wie in `mindmapTree.ts`/`MindmapSystem.tsx`) bewusst abgewichen und nutze `crypto.randomUUID()` — Begründung in Abschnitt 1 unter "ID-Strategie". Das vereinfacht jede einzelne Fremdschlüssel-Beziehung in diesem Schema spürbar.

---

## 1. Datenbankdesign

### ID-Strategie (grundsätzliche Entscheidung vorab)

Die bestehenden Tabellen `mindmaps`/`flashcard_decks` verwenden `id text` (client-generiert per `Math.random().toString(36).substr(2,9)`, ~9 Zeichen Base36) und schützen sich gegen Kollisionen zwischen Accounts, indem der Primary Key **zusammengesetzt** ist: `PRIMARY KEY (id, user_id)`. Das funktioniert, erzwingt aber ab jetzt bei jedem Fremdschlüssel einen zusammengesetzten Verweis (`FOREIGN KEY (x_id, user_id) REFERENCES ... (id, user_id)`) — bei einem Graphen mit drei verweisenden Tabellen (Edges verweisen zweimal auf Nodes plus einmal auf RelationTypes, dazu die Dokument-Verknüpfung) summiert sich das zu spürbar mehr Komplexität in jeder Query.

**Entscheidung:** Neue Graph-Tabellen nutzen `id uuid` (client-seitig per `crypto.randomUUID()` erzeugt, keine neue Abhängigkeit — im Browser seit Jahren verfügbar, funktioniert offline). Die Kollisionswahrscheinlichkeit einer UUIDv4 ist astronomisch kleiner als bei einer 9-stelligen Base36-ID, ein zusammengesetzter Schlüssel ist damit nicht mehr nötig — **einfacher Primary Key `id`** reicht aus, alle Fremdschlüssel werden dadurch einspaltig und lesbar. Das ist eine bewusste Abweichung vom `mindmaps`/`flashcard_decks`-Muster, keine Fortführung — dort wäre eine nachträgliche Änderung der ID-Erzeugung ein Breaking Change für Bestandsdaten, hier fangen wir bei Null an und können die sauberere Variante direkt wählen.

Wo Graph-Tabellen auf **bestehende** Tabellen verweisen (`collections.id`, `documents.id` — beide `text`), bleibt der Fremdschlüssel `text`, um kompatibel zu bleiben; diese Tabellen anzufassen wäre eine unrelated, riskante Migration außerhalb des Feature-Scopes.

### Tabelle: `graph_relation_types`

Beziehungstypen sind **global geteilt**, nicht pro Nutzer dupliziert: `user_id` ist **nullable** — `NULL` markiert die sechs eingebauten Typen (ist Teil von, Voraussetzung von, Beispiel für, Ursache von, Gegensatz zu, gehört zusammen mit), einmalig per Migration angelegt. Ein Nutzer sieht per RLS sowohl die globalen Typen als auch seine eigenen, kann aber nur seine eigenen anlegen/ändern/löschen. Das vermeide ich bewusst gegenüber der naheliegenderen Alternative "6 Zeilen pro Nutzer beim ersten Laden seeden" — letzteres bräuchte zusätzlichen Anwendungscode (Race-Bedingung: was, wenn der Seed-Call fehlschlägt oder zweimal parallel läuft?) für keinen Mehrwert, da eingebaute Typen ohnehin nie pro Nutzer unterschiedlich sind.

```sql
create table if not exists public.graph_relation_types (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references public.profiles(id) on delete cascade, -- NULL = global/eingebaut
  label         text        not null,
  inverse_label text,                    -- z.B. "baut auf … auf" zu "Voraussetzung von" — Phase-2-UI-Feature,
                                          -- Spalte jetzt schon anlegen ist kostenlos, spätere Migration wäre es nicht
  symmetric     boolean     not null default false,
  color         text,
  icon          text,
  is_built_in   boolean     not null default false,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  unique (user_id, label)                -- verhindert exakte Duplikate PRO NUTZER (Risiko "Beziehungstyp-Wildwuchs"
                                          -- aus dem Konzeptdokument, zumindest der Wortlaut-identische Fall)
);

alter table public.graph_relation_types enable row level security;

create policy "Sichtbare Beziehungstypen" on public.graph_relation_types
  for select using (user_id is null or auth.uid() = user_id);
create policy "Eigene Beziehungstypen verwalten" on public.graph_relation_types
  for insert with check (auth.uid() = user_id);
create policy "Eigene Beziehungstypen ändern" on public.graph_relation_types
  for update using (auth.uid() = user_id);
create policy "Eigene Beziehungstypen löschen" on public.graph_relation_types
  for delete using (auth.uid() = user_id);
```

**Warum kein Löschen der eingebauten Typen möglich ist:** Die UPDATE/DELETE-Policies prüfen `auth.uid() = user_id` — bei `user_id IS NULL` ist dieser Vergleich in SQL nie wahr, also lehnt Postgres jeden Änderungsversuch an globalen Zeilen automatisch ab. Kein Sonderfall im Code nötig, die RLS-Logik ergibt das von selbst.

**Warum kein Tombstone/Soft-Delete hier:** Beziehungstypen sind niedrig-kardinal (eine Handvoll pro Nutzer) und werden selten geändert — das Konfliktfenster für Offline-Sync ist verschwindend klein. Löschen wird stattdessen durch die Fremdschlüssel-Regel bei `graph_edges` abgesichert (siehe dort, `ON DELETE RESTRICT`): Ein Typ, der noch von Kanten benutzt wird, lässt sich schlicht nicht löschen, bis die Anwendung dem Nutzer das erklärt hat.

### Tabelle: `graph_nodes`

```sql
create table if not exists public.graph_nodes (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  collection_id text        references public.collections(id) on delete set null,
  type          text        not null default 'begriff',   -- bewusst kein CHECK-Enum, siehe Begründung unten
  title         text        not null check (length(trim(title)) > 0),
  description   text        not null default '',
  notes         text        not null default '',
  color         text,
  icon          text,
  tags          text[]      not null default '{}',
  position_x    double precision not null default 0,
  position_y    double precision not null default 0,
  pinned        boolean     not null default false,        -- Phase-2-Feld (Auto-Layout), s.u.
  archived_at   timestamptz,                                -- Soft Delete + Sync-Tombstone in einem
  version       integer     not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.graph_nodes enable row level security;
create policy "Eigene Graph-Nodes" on public.graph_nodes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists graph_nodes_user_idx on public.graph_nodes (user_id);
create index if not exists graph_nodes_active_by_collection_idx
  on public.graph_nodes (user_id, collection_id) where archived_at is null;
create index if not exists graph_nodes_sync_idx on public.graph_nodes (user_id, updated_at);
create index if not exists graph_nodes_tags_idx on public.graph_nodes using gin (tags);
```

**Spalten-Begründungen (nur die nicht offensichtlichen):**
- `type text` ohne `CHECK`-Enum: Deine Vorgabe war ausdrücklich "bewusst flexibel bleiben". Ein `CHECK (type in (...))` würde bei jedem neuen Konzepttyp eine Migration erzwingen. Stattdessen validiert/schlägt die Anwendungsschicht (`GraphValidationService`, Abschnitt 3) eine Liste bekannter Typen vor — die Datenbank bleibt permissiv, die UX bleibt trotzdem geführt. Bewusster Trade-off, keine Nachlässigkeit.
- `title` mit `CHECK (length(trim(title)) > 0)`: Ein Node ohne Titel ist als Graph-Baustein sinnlos — anders als z. B. ein Entwurfstext, den man später ausfüllt. Der Constraint greift erst beim tatsächlichen Speichern; ein noch unbenannter Entwurf existiert nur lokal im UI-State, bevor er persistiert wird.
- `tags text[]` statt `jsonb` (wie sonst in der App üblich, z. B. `cards jsonb`): Tags sind eine flache Liste von Strings, die per Containment gefiltert werden sollen (`WHERE tags @> ARRAY['Statistik']`) — dafür ist Postgres' natives Array-Type mit GIN-Index das idiomatischere und schnellere Werkzeug als JSON zu parsen. Bewusste, begründete Abweichung vom sonstigen jsonb-lastigen Stil der App, nicht Inkonsistenz um ihrer selbst willen.
- `position_x`/`position_y` als eigene `double precision`-Spalten statt `position jsonb`: Es sind zwei Zahlen, keine verschachtelte Struktur — JSON-Parsing bei jedem Lesen wäre unnötiger Overhead, und falls jemals räumliche Queries nötig werden (z. B. "alle Nodes in diesem Sichtfenster"), sind numerische Spalten die Voraussetzung dafür, PostGIS/Bounding-Box-Indizes einzusetzen.
- `pinned boolean default false`: Hat in Phase 1 **keinen Konsumenten** — es gibt noch kein Auto-Layout, das diese Information bräuchte (Roadmap: Auto-Layout ist Phase 2). Ich nehme die Spalte trotzdem jetzt auf, weil sie nichts kostet (Default, keine Rückwirkung) und eine spätere Migration nur für ein einzelnes Boolean-Feld unverhältnismäßig wäre. Explizit als "für später reserviert" markiert, damit niemand rätselt, warum sie unbenutzt ist.
- `archived_at timestamptz` (nullable): Soft-Delete **und** Tombstone in einem Feld (siehe Korrektur oben). `NULL` = aktiver Node. Gesetzt = archiviert/aus der Graph-Ansicht ausgeblendet **und** Signal für die Sync-Logik, dass diese Zeile bei der nächsten Pull-Runde als "entfernt" zu behandeln ist. Ein echtes `DELETE FROM graph_nodes` passiert nur bei einer bewussten "endgültig löschen"-Zweitaktion aus dem Papierkorb heraus (kein automatischer Purge-Job in Phase 1, siehe Sync-Strategie unten) oder als Kaskadeneffekt, wenn ein Account gelöscht wird (`ON DELETE CASCADE` auf `user_id`).
- `version integer default 1`: Wird **nicht** vom Client gesetzt, sondern ausschließlich von einem Datenbank-Trigger hochgezählt (siehe unten) — der Client kann also nie versehentlich eine Version überspringen oder zurücksetzen. In Phase 1 dient sie nur der **Diagnose** (z. B. spätere Undo/Redo-Historie, Debugging von Sync-Problemen); echte blockierende Optimistic-Concurrency-Kontrolle (Schreiben ablehnen bei Versions-Mismatch) ist bewusst **nicht** Teil von Phase 1, weil die bereits im Konzeptdokument festgelegte Sync-Strategie Last-Write-Wins ist — eine strengere Sperre bräuchte zusätzlich eine Konflikt-UI, die wir noch nicht entworfen haben. Die Spalte existiert schon jetzt, damit diese Erweiterung später keine Migration braucht.

**Warum kein separates `archived`-Boolean zusätzlich zu `archived_at`:** genau die Redundanz, die ich oben als Korrektur am Konzept beschrieben habe — ein Zeitstempel transportiert "ist archiviert" (NULL-Check) UND "seit wann" (Grundlage für eine künftige Aufräum-Regel) in einem Feld.

### Tabelle: `graph_edges`

```sql
create table if not exists public.graph_edges (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  source_node_id   uuid        not null references public.graph_nodes(id) on delete cascade,
  target_node_id   uuid        not null references public.graph_nodes(id) on delete cascade,
  relation_type_id uuid        not null references public.graph_relation_types(id) on delete restrict,
  label            text,
  archived_at      timestamptz,
  version          integer     not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (source_node_id <> target_node_id),
  unique (source_node_id, target_node_id, relation_type_id) -- volle Eindeutigkeit reicht (s.u.), kein archived_at-Filter nötig
);
```

Warte — die `UNIQUE`-Klausel braucht noch die Präzisierung, dass sie nur **aktive** Duplikate verhindern soll (ein archivierter, dann neu angelegter, identischer Zusammenhang muss wieder möglich sein):

```sql
create unique index graph_edges_no_duplicate_active_idx
  on public.graph_edges (source_node_id, target_node_id, relation_type_id)
  where archived_at is null;
```

(Ersetzt die einfache `unique`-Zeile oben durch einen partiellen Index — nur so ist "kein doppeltes AKTIVES Duplikat, aber ein archiviertes darf wiederbelebt werden" ausdrückbar.)

```sql
alter table public.graph_edges enable row level security;
create policy "Eigene Graph-Edges" on public.graph_edges for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists graph_edges_source_idx
  on public.graph_edges (user_id, source_node_id) where archived_at is null;
create index if not exists graph_edges_target_idx
  on public.graph_edges (user_id, target_node_id) where archived_at is null;
create index if not exists graph_edges_sync_idx on public.graph_edges (user_id, updated_at);
```

**Begründungen:**
- **Mehrfachkanten sind erlaubt** (`(source, target)` darf mehrmals vorkommen — nur nicht mit demselben `relation_type_id`): Ein Wissensgraph ist konzeptionell ein Multigraph. "Photosynthese" und "Zellatmung" könnten gleichzeitig `Gegensatz zu` UND `gehört zusammen mit` sein — beide Aussagen sind gültig und unterschiedlich. Nur die exakt identische Aussage doppelt anzulegen wird verhindert.
- **Selbstschleifen verboten** (`CHECK (source_node_id <> target_node_id)`): Ein Konzept kann kein Beispiel/Voraussetzung/Gegensatz seiner selbst sein — das wäre in jedem der sechs eingebauten Beziehungstypen bedeutungslos.
- **Zyklen zwischen verschiedenen Nodes sind erlaubt** (keine Ausschluss-Logik wie im alten `mindmapTree.ts`, dessen `isDescendant`-Prüfung Zyklen strukturell verhindert hat) — bewusst anders als die alte Mindmap, weil "A Voraussetzung von B, B Voraussetzung von A" ein echter, potenziell interessanter Widerspruch ist, den die spätere KI-Inkonsistenzprüfung (Phase 4) genau deshalb erkennen soll. Die Datenbank muss ihn also zulassen, nicht verhindern.
- **`ON DELETE RESTRICT` beim Beziehungstyp**: Verhindert, dass ein Nutzer versehentlich einen Beziehungstyp löscht, der noch von Kanten benutzt wird — Postgres verweigert das Löschen und die Anwendung fängt den Fehler ab, um vorher verständlich zu warnen ("Wird noch von 12 Kanten verwendet").
- **Was die Datenbank NICHT prüfen kann:** Ob bei einem `symmetric: true`-Beziehungstyp eine Kante A→B UND zusätzlich B→A mit demselben Typ existiert (das wäre inhaltlich dieselbe Aussage doppelt, nur mit vertauschter Richtung). Ein `CHECK`-Constraint kann keine Subquery gegen `graph_relation_types` ausführen, um `symmetric` nachzuschlagen. Diese Regel gehört deshalb explizit in die Anwendungsschicht (`GraphValidationService`, Abschnitt 3) — hier bewusst dokumentiert, damit klar ist: das ist kein vergessener Constraint, sondern eine echte Grenze von SQL-`CHECK`.

**Referenzielle Integrität über RLS hinaus (echter Fund beim Durchdenken):** RLS auf `graph_edges` stellt nur sicher, dass `user_id` der eingeloggte Nutzer ist — sie prüft **nicht**, ob `source_node_id`/`target_node_id`/`relation_type_id` tatsächlich Zeilen sind, die demselben Nutzer gehören. Ohne weitere Absicherung könnte ein Client (versehentlich durch einen Bug, oder mutwillig) eine Kante mit `user_id = ich selbst`, aber `source_node_id` = die geratene ID eines fremden Nodes anlegen. Das wäre kein Datenleck (der fremde Node bliebe wegen RLS auf `graph_nodes` unsichtbar), aber ein bedeutungsloser, verwaister Verweis. Deshalb zusätzlich ein Trigger:

```sql
create or replace function public.assert_graph_edge_ownership()
returns trigger as $$
begin
  if not exists (
    select 1 from public.graph_nodes
    where id = new.source_node_id and user_id = new.user_id
  ) then
    raise exception 'source_node_id gehört nicht zum angegebenen Nutzer';
  end if;
  if not exists (
    select 1 from public.graph_nodes
    where id = new.target_node_id and user_id = new.user_id
  ) then
    raise exception 'target_node_id gehört nicht zum angegebenen Nutzer';
  end if;
  if not exists (
    select 1 from public.graph_relation_types
    where id = new.relation_type_id and (user_id = new.user_id or user_id is null)
  ) then
    raise exception 'relation_type_id ist weder eigen noch global';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger graph_edges_ownership before insert or update on public.graph_edges
  for each row execute procedure public.assert_graph_edge_ownership();
```

Das ist strenger als alles, was die bestehenden `mindmaps`/`flashcard_decks`-Tabellen heute prüfen — dort wäre ein analoges Problem (falsche `source_document_id`) folgenlos, weil diese Felder nur Anzeigezwecken dienen. Bei einem Graphen, der als "zentrales Wissensmodell" tragen soll, ist referenzielle Sauberkeit dagegen ein echtes Qualitätsmerkmal, kein Perfektionismus.

### Tabelle: `graph_node_documents`

```sql
create table if not exists public.graph_node_documents (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  node_id     uuid        not null references public.graph_nodes(id) on delete cascade,
  document_id text        not null references public.documents(id) on delete cascade,
  excerpt     text,
  page        integer,
  created_at  timestamptz not null default now()
);

alter table public.graph_node_documents enable row level security;
create policy "Eigene Dokument-Verknüpfungen" on public.graph_node_documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists graph_node_documents_node_idx on public.graph_node_documents (user_id, node_id);
create index if not exists graph_node_documents_doc_idx on public.graph_node_documents (user_id, document_id);

create trigger graph_node_documents_ownership before insert or update on public.graph_node_documents
  for each row execute procedure public.assert_graph_node_documents_ownership(); -- analoge Trigger-Funktion wie oben
```

**Begründungen:**
- `document_id ... on delete cascade`: Wird ein Dokument gelöscht, verschwindet nur diese eine Verknüpfungszeile — der Node selbst bleibt (er ist die dauerhafte Konzept-Einheit, das Dokument war nur eine von potenziell mehreren Quellen).
- `node_id ... on delete cascade`: Greift nur beim seltenen Hard-Delete (Papierkorb-Endgültig-Löschen), nicht beim normalen Archivieren — dann sollen auch die Dokument-Verweise mit verschwinden.
- **Bewusst KEIN Unique-Constraint** auf `(node_id, document_id)`: Anders als bei Kanten ist ein doppelter Verweis hier kein Datenfehler — derselbe Node kann legitim zwei verschiedene Zitatstellen aus demselben Dokument referenzieren (`excerpt` unterscheidet sie). Ein Unique-Constraint würde hier eine echte Anwendung verhindern statt einen Fehler abzufangen.
- **Bewusst kein Tombstone/`archived_at`**: Diese Tabelle ist eine leichte, konfliktarme Verknüpfung. Geht sie durch eine seltene Sync-Race verloren, ist der Schaden minimal (ein Zitat-Verweis lässt sich mit einem Klick neu anlegen) — der Aufwand einer Tombstone-Logik wäre hier unverhältnismäßig. Nicht jede Tabelle bekommt automatisch die volle Tombstone-Behandlung, nur die, wo ein Verlust wirklich wehtut (Nodes, Edges).

### `updated_at` + `version`: ein gemeinsamer Trigger statt Client-Verantwortung

Der Rest der App setzt `updated_at` clientseitig bei jedem Schreibvorgang (`new Date(item.updatedAt).toISOString()`, siehe `mindmapService.ts`). Für den Graphen reicht mir das nicht mehr: Die gesamte Sync-Korrektheit (Last-Write-Wins) hängt jetzt an sehr viel mehr Zeilen und über einen viel längeren Zeitraum von der Ehrlichkeit/Uhr des Clients ab. Deshalb übernimmt ein DB-Trigger beides zuverlässig, unabhängig vom Client:

```sql
create or replace function public.touch_graph_row()
returns trigger as $$
begin
  new.updated_at := now();
  new.version := coalesce(old.version, 0) + 1;
  return new;
end;
$$ language plpgsql;

create trigger graph_nodes_touch before update on public.graph_nodes
  for each row execute procedure public.touch_graph_row();
create trigger graph_edges_touch before update on public.graph_edges
  for each row execute procedure public.touch_graph_row();
```

Das ist eine bewusste, punktuelle Verschärfung gegenüber dem Rest der Codebase — gerechtfertigt durch die deutlich höheren Sync-Einsätze an dieser Stelle, keine allgemeine Regeländerung für andere Tabellen.

### Sync-Strategie (konkret)

- **Pull, inkrementell:** `select * from graph_nodes where user_id = auth.uid() and updated_at > $lastSyncedAt order by updated_at, id`. Der `graph_nodes_sync_idx` (`user_id, updated_at`) macht das zu einem Index-Scan statt einem Full-Table-Scan, auch bei tausenden Zeilen. `$lastSyncedAt` wird lokal pro Fach-Scope gespeichert (Details Abschnitt 7).
- **Push:** `upsert` pro geänderter Zeile, `onConflict: 'id'` — dank Single-Column-PK trivial (kein zusammengesetzter Konfliktschlüssel mehr nötig).
- **Löschen:** Client setzt `archived_at = now()` per normalem `UPDATE` (kein `DELETE`) — dieses Update läuft durch denselben Push-Pfad wie jede andere Änderung, kein Sonderfall im Sync-Code.
- **Tombstone-Bereinigung:** In Phase 1 **kein** automatischer Purge-Job. Archivierte Zeilen bleiben unbegrenzt liegen (Speicherkosten sind bei Textdaten dieser Größenordnung vernachlässigbar). Ein zeitgesteuerter Cleanup (z. B. Supabase Cron Function, harte Löschung nach 90 Tagen) ist explizit auf Phase 2+ verschoben — für Phase 1 wäre das eine Lösung für ein Problem, das noch nicht existiert.

---

## 2. TypeScript-Domain

Feldbeschreibung statt Code — Zuordnung DB-Spalte ↔ Domain-Feld passiert an der Repository-Grenze (dort auch die `null` ↔ `undefined`-Übersetzung, konsistent mit dem bestehenden Muster in `mindmapService.ts`: `row.source_document_id ?? undefined`).

### `GraphNode`

| Feld | Typ | Begründung |
|---|---|---|
| `id` | `string` (UUID) | s. Abschnitt 1 |
| `collectionId` | `string \| undefined` | optionaler Fach-Scope, wie bei `ProcessedDocument`/`MindmapItem` |
| `type` | `string` | offen, keine Enum-Bindung im Code (nur eine Vorschlagsliste in der UI-Schicht später) |
| `title` | `string` | Pflichtfeld, DB erzwingt Nicht-Leerheit |
| `description` | `string` | objektiver Inhalt, gerendert über den bestehenden `markdownRenderer.tsx` |
| `notes` | `string` | persönliche Anmerkung, bewusst getrennt von `description` (Zettelkasten-Prinzip) |
| `color` / `icon` | `string \| undefined` | `icon` referenziert einen `lucide-react`-Key, kein neues Icon-System |
| `tags` | `string[]` | flache Liste, DB-seitig `text[]` |
| `position` | `{ x: number; y: number }` | in der DB zwei flache Spalten (Performance), im Domain-Modell als verschachteltes Objekt — so wird es überall sonst im Code konsumiert (Rendering, Drag-Handler), die Flach-Struktur ist eine reine Storage-Entscheidung, die nicht nach oben durchsickern soll |
| `pinned` | `boolean` | reserviert für Phase 2 (Auto-Layout), im Domain-Modell schon vorhanden, damit spätere Nutzung keine Typ-Änderung braucht |
| `archivedAt` | `number \| undefined` (ms-Timestamp) | `undefined` = aktiv, gesetzt = archiviert/Tombstone |
| `version` | `number` | rein informativ in Phase 1 (Diagnose/künftige Undo-Historie), nie vom Client geschrieben |
| `createdAt` / `updatedAt` | `number` (ms-Timestamp) | konsistent mit dem Rest der App (`MindmapItem.updatedAt` ist ebenfalls `number`, nicht `Date`) |

### `GraphEdge`

| Feld | Typ | Begründung |
|---|---|---|
| `id`, `sourceNodeId`, `targetNodeId`, `relationTypeId` | `string` (UUID) | 1:1 zur DB |
| `label` | `string \| undefined` | Freitext-Override zum Typ-Label |
| `archivedAt`, `version`, `createdAt`, `updatedAt` | wie bei `GraphNode` | gleiche Begründung |

### `GraphRelationType`

| Feld | Typ | Begründung |
|---|---|---|
| `id` | `string` | |
| `label` | `string` | |
| `inverseLabel` | `string \| undefined` | Phase-2-Anzeigefeature (s. DB-Abschnitt) |
| `symmetric` | `boolean` | steuert Anzeige- und Validierungslogik |
| `color`, `icon` | `string \| undefined` | |
| `isBuiltIn` | `boolean` | steuert, ob die UI eine Löschen-Option überhaupt anbietet |
| `sortOrder` | `number` | stabile Reihenfolge in Auswahllisten |

### `GraphNodeDocumentRef`

| Feld | Typ | Begründung |
|---|---|---|
| `id`, `nodeId`, `documentId` | `string` | |
| `excerpt` | `string \| undefined` | Zitat-Text, Grundlage für eine spätere PDF-Sprung-Funktion (nicht Phase 1) |
| `page` | `number \| undefined` | |
| `createdAt` | `number` | |

### Zwei Lesemodelle statt eines — bewusste Ergänzung

Du hattest `NodeMetadata` als Beispieltyp genannt; beim Durchdenken der Performance-Anforderung ("tausende Nodes", "unnötige Re-Renders vermeiden") habe ich daraus zwei konkrete, unterschiedliche Typen gemacht statt einen:

- **`GraphNodeSummary`** — die schlanke Projektion (`id`, `title`, `type`, `color`, `icon`, `position`, `tags`), die für die Kanvas-Darstellung und die Suche **immer vollständig geladen** wird. Enthält bewusst **nicht** `description`/`notes` (können pro Node beliebig lang werden) — diese werden erst nachgeladen, wenn das Seitenpanel für GENAU EINEN Node geöffnet wird. Ohne diese Trennung würde jede Kanvas-Ansicht den vollen Textinhalt aller Nodes übertragen und im Speicher halten, obwohl zu jedem Zeitpunkt höchstens einer davon sichtbar im Panel steht.
- **`GraphNodeComputedMetadata`** — abgeleitete Werte, die **nicht** persistiert werden (keine eigene Spalte, kein Redundanz-/Sync-Risiko): Anzahl eingehender/ausgehender Kanten, Anzahl verknüpfter Dokumente/Karteikarten/Quizfragen. Wird bei Bedarf aus dem bereits geladenen `GraphIndex` (Abschnitt 3) sowie aus den `linkedNodeIds`-Feldern von Karteikarten/Fragen berechnet — genau der Mechanismus, der in Abschnitt 3/14 des Konzeptdokuments beschrieben ist ("keine Rückverweise am Node speichern").

Diese Aufteilung war im ursprünglichen Konzept nur implizit angelegt ("Node kann beliebig viele Rückverweise haben") — hier wird sie explizit zu einer Architekturentscheidung, weil sie direkt beantwortet, wie Re-Renders bei tausenden Nodes vermieden werden (Details Abschnitt 4).

### Bewusst NICHT geplant: `GraphSuggestion`, `Graph`-Entität

- **`GraphSuggestion`** (KI-Vorschläge) gehört laut Roadmap zu Phase 4. Sie jetzt schon zu entwerfen wäre genau das "Scope-Kriechen", das im Konzeptdokument als Risiko benannt ist — bewusst ausgelassen.
- **Kein `graphs`-Tabelle/`Graph`-Entität in der Datenbank.** Ein "Graph" ist keine eigenständige, speicherbare Sache — er ist die Menge aller aktiven Nodes/Edges mit passendem `collection_id`, also eine **Query, keine Zeile**. Im Domain-Modell gibt es dafür `GraphState` (Abschnitt 4), aber das ist ein reines In-Memory-Aggregat, kein Persistenz-Konzept. Das weicht von deiner Beispiel-Liste ab (dort stand "Graph" als eigenes Modell) — ich denke, eine eigene `graphs`-Tabelle würde nur eine zusätzliche, nie wirklich befüllte Indirektionsebene schaffen.

---

## 3. Services

Reihenfolge nach Abhängigkeit (unten hängt von oben ab):

### `GraphRepository`
**Verantwortung:** Reine, zustandslose Supabase-CRUD-Funktionen pro Entität (`fetchNodes`, `upsertNode`, `fetchEdges`, `upsertEdge`, …). Einzige Stelle, die `supabase` importiert. Übersetzt `null` ↔ `undefined` und flache DB-Spalten (`position_x`/`position_y`) ↔ verschachtelte Domain-Felder (`position: {x,y}`).
**Nicht verantwortlich für:** wann synchronisiert wird, Merge-Logik, Offline-Verhalten — das ist `GraphSyncService`.

### `GraphSyncService`
**Verantwortung:** Orchestriert den **wann/wie** rund um `GraphRepository`: Local-First-Ladezyklus (localStorage sofort, dann Cloud-Pull im Hintergrund mergen — exakt das Muster aus `useDocuments.ts`), Verwaltung des `lastSyncedAt`-Cursors pro Fach-Scope für inkrementelles Nachladen, Debounce der ausgehenden Schreibvorgänge, Last-Write-Wins-Vergleich beim Merge.
**Warum getrennt von `GraphRepository`, obwohl `mindmapService.ts` heute beides in einer Datei macht:** Bei der alten Mindmap gab es nie einen Cursor, keinen Merge-Konflikt-Vergleich, keine Debounce-Strategie — ein simpler "lade alles, schreib alles"-Ansatz reichte. Sobald echte inkrementelle Synchronisation (Pflicht bei "tausenden Nodes") dazukommt, wird aus dieser Datei sonst ein unübersichtlicher Mix aus Low-Level-SQL und Ablaufsteuerung. Die Trennung hält beides einzeln testbar.

### `GraphValidationService`
**Verantwortung:** Reine, synchrone Prüf-Funktionen, die **vor** jeder Mutation laufen — insbesondere die Dinge, die die Datenbank nicht prüfen kann (Abschnitt 1): symmetrische Beziehungstypen nicht doppelt in Gegenrichtung, Titel nicht leer (serverseitig zusätzlich abgesichert, hier zusätzlich für sofortiges UI-Feedback ohne Round-Trip), Beziehungstyp-Löschung erst zulassen, wenn keine Kante mehr referenziert (freundliche Fehlermeldung statt der rohen Postgres-`RESTRICT`-Exception).
**Kein I/O**, vollständig unit-testbar wie `mindmapTree.test.ts`.

### `GraphMutationService`
**Verantwortung:** Reine Reducer-Funktionen auf dem normalisierten `GraphState` (Abschnitt 4): `addNode`, `updateNode`, `archiveNode`, `addEdge`, `updateEdge`, `archiveEdge`, `addRelationType`, … Ruft `GraphValidationService` intern auf, bevor eine Mutation angewendet wird; gibt bei Verstoß ein Fehler-Result statt eine Exception zurück (konsistent mit dem Stil in `examScoring.ts`/`quizNormalize.ts`).
**Das ist die technische Grenze für die KI-Regel:** Eine künftige KI-Vorschlags-Funktion (Phase 4) darf nur die **Typen** aus Abschnitt 2 importieren, um einen Vorschlag zu formulieren — sie darf `GraphMutationService` nicht importieren, um ihn selbst aufzurufen. Der Vorschlag muss durch dieselbe UI-Bestätigung wie eine manuelle Aktion laufen, die dann ganz normal `GraphMutationService` aufruft. Das ist im Code an einem fehlenden Import erkennbar, nicht nur an einer Absichtserklärung.

### `GraphPersistenceService`
**Verantwortung:** Sitzt zwischen `GraphMutationService` (In-Memory) und `GraphSyncService` (Netzwerk): schreibt nach jeder Mutation **sofort** in den localStorage-Cache (optimistisch, funktioniert komplett offline) und plant den späteren Push über `GraphSyncService` — mit unterschiedlichem Debounce je nach Feld (Positions-Updates beim Ziehen: nur bei Drag-Ende; Text-Updates: 400ms wie im bestehenden `MindmapEditor`-Muster).
**Warum getrennt von `GraphSyncService`, statt zusammenzulegen:** Persistenz muss synchron/sofort laufen, unabhängig davon, ob gerade eine Netzwerkverbindung besteht — das ist die Grundlage für "Local-First funktioniert" aus der Anforderungsliste. `GraphSyncService` ist dagegen von Natur aus asynchron und netzwerkabhängig (Pull, Merge, Cursor). Würde man beides zusammenlegen, würde ein hängender Netzwerkaufruf im schlimmsten Fall auch lokale Schreibvorgänge verzögern — genau das Gegenteil von Local-First.

### `GraphIndexService` *(im Prompt nicht genannt, aber strukturell notwendig — Ergänzung)*
**Verantwortung:** Baut aus `nodesById`/`edgesById` die Adjazenz-Strukturen (`edgesBySource`, `edgesByTarget`) einmalig auf und hält sie bei Mutationen inkrementell aktuell. Stellt `neighbors(nodeId)` und `subgraph(nodeId, hops)` bereit (letzteres Grundlage für den Fokus-Modus, Phase 2). Wird auch von `GraphValidationService` gebraucht (O(1) statt O(n)-Scan bei der Duplikat-Kanten-Prüfung) und von `GraphSearchService`.
Ich ergänze diesen Service bewusst, weil ohne ihn entweder `GraphValidationService` bei jeder neuen Kante den kompletten Kantenbestand linear durchsuchen müsste (bei tausenden Kanten spürbar) oder die Adjazenz-Logik in mehreren Services parallel und inkonsistent nachgebaut würde.

### `GraphSelectionService`
**Verantwortung:** Rein ephemerer UI-Auswahlzustand (ausgewählter/gehoverter Node, Fokus-Modus-Zentrum + Hop-Radius). Wird **nicht** synchronisiert, nicht in `GraphState` gehalten.
Eine ehrliche Einordnung: Das ist streng genommen kein Domain-Service wie die anderen, sondern gehört in die Application-Schicht (Abschnitt 5) — ich plane hier nur seine Schnittstelle (`selectNode`, `hoverNode`, `setFocus`, `clear`), die eigentliche Implementierung folgt erst mit der UI-Phase. Wichtig jetzt schon zu wissen, weil `GraphMutationService` und der spätere Renderer beide dagegen programmieren werden.

### `GraphHistoryService` (Undo/Redo)
**Verantwortung:** Legt bei jeder erfolgreichen Mutation eine **inverse Operation** (nicht einen vollständigen Zustands-Snapshot!) auf einen Undo-Stack — z. B. bei `updateNode(id, {title: 'neu'})` wird nur der vorherige `title`-Wert gemerkt, nicht der komplette Node- oder gar Graph-Zustand.
**Warum explizit NICHT Snapshot-basiert:** Bei "tausenden Nodes" würde ein vollständiger Zustands-Schnappschuss pro Undo-Schritt schnell mehrere Megabyte kosten und den Speicherverbrauch bei aktivem Editieren unnötig aufblähen. Command-Pattern mit inversen Operationen kostet pro Schritt nur so viel wie die tatsächliche Änderung.
Historie ist **sessionlokal**, nicht synchronisiert, mit einer Obergrenze (z. B. 50 Schritte) und wird beim Wechsel des Fach-Scopes oder Reload verworfen — Persistenz über Sitzungen hinweg ist ein mögliches, aber bewusst nicht in Phase 1 geplantes Extra.

### `GraphSearchService`
**Verantwortung:** Durchsucht die bereits geladenen `GraphNodeSummary`-Objekte (Titel, Tags) per einfachem Substring-/Fuzzy-Match für die künftige ⌘K-Leiste.
Bei "hunderten" Nodes (Phase-1-Realität) ist eine In-Memory-Suche völlig ausreichend — eine echte Suchmaschine wäre hier verfrühte Komplexität. Sollte `description`/`notes` je durchsuchbar werden müssen (Volltextsuche über viel Text bei tausenden Nodes), ist der natürliche nächste Schritt Postgres' eingebaute Volltextsuche (`tsvector`-Spalte + GIN-Index) serverseitig — dokumentiert als Erweiterungspfad, nicht jetzt gebaut.

---

## 4. State Management

**Was gehört in den globalen (App-weiten) Zustand — gehalten vom künftigen `useKnowledgeGraph(collectionId?)`-Hook, analog zu `useDocuments`/`useQuizState`:**
- Der normalisierte `GraphState` **nur für den aktuell aktiven Fach-Scope**: `nodesById: Map<string, GraphNode>`, `edgesById: Map<string, GraphEdge>`, `relationTypesById: Map<string, GraphRelationType>`, plus die Adjazenz-Maps aus `GraphIndexService`.
- Sync-Metadaten: `lastSyncedAt` pro Scope, eine Menge `pendingWriteIds` (welche Entitäten haben lokale, noch nicht bestätigte Änderungen — Grundlage für einen künftigen "Synchronisiert…"-Indikator).

**Bewusste Abkehr vom bisherigen Mindmap-Muster:** `MindmapSystem.tsx` lädt heute **den gesamten Mindmap-Bestand** eines Nutzers und filtert erst beim Rendern nach aktivem Modul (`visibleItems = items.filter(...)`). Das skaliert nicht auf "tausende Nodes über viele Fächer verteilt" — der Graph lädt/hält deshalb von Anfang an nur die Daten des aktiven Scopes im Speicher, ein Fach-Wechsel tauscht den geladenen `GraphState` komplett aus, statt nur die Anzeige umzuschalten.

**Was ausdrücklich LOKAL/ephemeral bleibt, nie im globalen `GraphState`:**
- Auswahl/Hover (`GraphSelectionService`) — ändert sich bei jeder Mausbewegung; würde sie im globalen State liegen, triggerte jede Bewegung einen Re-Render des gesamten (potenziell tausende Elemente umfassenden) Graphen.
- Viewport-Transform (Pan/Zoom) — reines Rendering-Detail, betrifft diese Planungsphase nicht direkt, wird aber schon jetzt bewusst aus dem Domain-State ausgeschlossen.
- Undo/Redo-Stack, Suchleisten-Query, Command-Bar-offen/zu — reiner UI-Zustand.

**Wie unnötige Re-Renders konkret vermieden werden:**
Der entscheidende Hebel wird **jetzt**, in der Datenschicht, gelegt — nicht erst später in der UI: Weil `GraphState` normalisiert ist (Maps statt eines verschachtelten Baums wie beim alten `MindmapNode`, oder eines flachen Arrays wie bei `FlashcardDeck.cards`), erzeugt eine einzelne Mutation ("Titel von Node X ändern") nur eine **neue `Map`-Referenz mit einem geänderten Eintrag** — alle anderen Node-Objekte behalten ihre Referenz-Identität. Das ist die Voraussetzung dafür, dass die spätere UI-Schicht einzelne Node-Komponenten per `React.memo`/Referenzvergleich gezielt NICHT neu rendert, wenn nur ein anderer Node sich geändert hat. Bei einer flachen Array- oder verschachtelten Baum-Struktur (wie der alten Mindmap) wäre nach jeder Änderung entweder das ganze Array neu oder der komplette Baum ab der Wurzel neu — feingranulares Memoization wäre praktisch unmöglich. Diese Entscheidung wird also bewusst schon in Phase 1 (reine Datenschicht) getroffen, obwohl sie erst in der UI-Phase sichtbare Wirkung zeigt.
Zusätzlich: abgeleitete Ansichten (z. B. "alle Nodes vom Typ X", Suchergebnisse) werden nie bei jedem Render neu berechnet, sondern über gezielt gecachte Selektoren (memoisiert auf die relevante Teilmenge des State, nicht auf den kompletten `GraphState`).

---

## 5. Architektur (Layer-Diagramm)

```
┌──────────────────────────────────────────────────────────┐
│ UI                                                        │  (folgt erst nach Phase 1)
│  GraphCanvas, GraphNodeDetailPanel, GraphSearchCommandBar │
└───────────────────────────┬────────────────────────────────┘
                             │ ruft nur Application-Hooks/-Funktionen auf
┌───────────────────────────▼────────────────────────────────┐
│ Application                                                │
│  useKnowledgeGraph()-Hook, GraphSelectionService,           │
│  GraphHistoryService, GraphSearchService (Orchestrierung)   │
└───────────────────────────┬────────────────────────────────┘
                             │ ruft Domain- und Infrastructure-Funktionen auf
┌───────────────────────────▼────────────────────────────────┐
│ Domain  (pure, framework-agnostisch, voll unit-testbar)     │
│  GraphMutationService, GraphValidationService,               │
│  GraphIndexService, TS-Typen (GraphNode/Edge/RelationType)   │
└───────────────────────────┬────────────────────────────────┘
                             │ liest/schreibt über
┌───────────────────────────▼────────────────────────────────┐
│ Infrastructure                                              │
│  GraphRepository, GraphSyncService, GraphPersistenceService, │
│  localStorage-Zugriff                                        │
└───────────────────────────┬────────────────────────────────┘
                             │ SQL / RLS
┌───────────────────────────▼────────────────────────────────┐
│ Supabase                                                     │
│  graph_nodes, graph_edges, graph_relation_types,              │
│  graph_node_documents (Abschnitt 1)                           │
└──────────────────────────────────────────────────────────────┘
```

**Warum fünf Schichten, obwohl der Rest der App flacher ist:** Die meisten bestehenden Features (`useDocuments` → `documentService.ts` → Supabase) kommen mit zwei bis drei Ebenen aus, ohne eine eigene, reine Domain-Schicht. Das ist für sie angemessen — sie haben kaum eigene Invarianten jenseits einfacher CRUD-Regeln. Der Knowledge Graph hat das nicht: Multigraph-Regeln, symmetrische Beziehungstypen, Zyklen-Toleranz bei gleichzeitigem Selbstschleifen-Verbot, und vor allem die geforderte KI-Schreibgrenze — all das braucht eine Schicht, die **nur** diese Regeln kennt und weder Supabase noch React kennt. Eine flache 2-3-Schichten-Lösung könnte diese Grenze nur als Konvention im Kopf der Entwickler festhalten; mit einer eigenen Domain-Schicht ist sie eine überprüfbare Code-Struktur (fehlender Import). Das ist eine bewusste, für dieses eine Feature gerechtfertigte Ausnahme vom sonstigen Stil der App — keine generelle Empfehlung, jedes Feature so tief zu schichten.

Zusätzlicher Vorteil: Die Renderer-Entscheidung aus dem Konzeptdokument (SVG jetzt, Canvas evtl. später) betrifft ausschließlich die UI-Schicht. Domain/Infrastructure merken von einem Renderer-Wechsel nichts — genau deshalb kann diese Entscheidung überhaupt später revidiert werden, ohne das hier geplante Fundament neu zu bauen.

---

## 6. Risiken (vertieft gegenüber dem Konzeptdokument)

1. **Zusammengesetzte vs. einfache Primary Keys war ein echter Wendepunkt.** Hätte ich unreflektiert das `mindmaps`/`flashcard_decks`-Muster übernommen, wären alle Fremdschlüssel in diesem Schema unnötig komplex geworden. Die UUID-Entscheidung behebt das — Restrisiko: Falls es einen Grund für die alten Kurz-IDs gab, den ich nicht kenne (z. B. Kompatibilität mit einem externen System), gilt diese Begründung hier nicht automatisch. Bitte kurz bestätigen, dass `crypto.randomUUID()` für dieses neue Feature unproblematisch ist.
2. **Der `assert_graph_edge_ownership`-Trigger kostet bei jedem Insert/Update zwei bis drei zusätzliche Lookups.** Bei sehr hoher Schreibfrequenz (z. B. massenhaftes Kanten-Anlegen bei einem künftigen Bulk-Import) könnte das spürbar werden. Für Phase-1-Nutzung (interaktives, manuelles Anlegen) ist das vernachlässigbar; bei einem späteren Bulk-Import-Feature lohnt sich eine Prüfung, ob der Trigger dafür temporär deaktiviert und durch eine einmalige Batch-Validierung ersetzt werden sollte.
3. **`version` ohne echte Konfliktsperre ist nur halb genutzt.** Die Spalte existiert, wird aber in Phase 1 nirgends aktiv ausgewertet außer zur Diagnose. Risiko: Sie verkommt zu töter Infrastruktur, wenn Phase 2+ sie nie aufgreift. Gegenmaßnahme: explizit in die Phase-2/3-Planung aufnehmen (z. B. für `GraphHistoryService`, falls Undo je über Geräte hinweg funktionieren soll), sonst rechtzeitig entfernen statt stillschweigend mitschleppen.
4. **Kein automatischer Tombstone-Purge** bedeutet, dass `graph_nodes`/`graph_edges` über Jahre nur wachsen, nie schrumpfen. Bei Textinhalten unkritisch, aber ein Punkt, den man in einem Jahr wiedersehen sollte, bevor er zum echten Speicherproblem wird.
5. **Fünf Architekturschichten für ein Feature, das in Phase 1 noch gar keine UI hat**, ist ein reales Überbau-Risiko, falls Phase 1 aus irgendeinem Grund abgebrochen/stark vereinfacht werden müsste — dann wäre relativ viel Struktur für relativ wenig sichtbaren Fortschritt entstanden. Gegenmaßnahme: Domain- und Infrastructure-Schicht sind beide für sich genommen bereits nutzbar/testbar, bevor die Application-/UI-Schicht existiert (jede Mutation ist per Unit-Test überprüfbar) — der Zwischenstand ist also nicht "wertlos ohne UI", sondern bereits ein verifizierbares Fundament.
6. **Die globalen (`user_id IS NULL`) Beziehungstypen sind ein Novum in diesem Schema** — bisher hat keine Tabelle in dieser App nutzerübergreifend geteilte Zeilen. Sollte sich das Muster bewähren, ist es eine potenzielle Vorlage für andere zukünftige "eingebaute + anpassbare" Konzepte (z. B. Node-Typen-Vorschlagslisten) — hier nur als Beobachtung festgehalten, keine Handlung nötig.

---

## Offene Punkte, die ich bewusst nicht allein entschieden habe

1. ~~Bestätigung, dass `crypto.randomUUID()` statt der bisherigen Kurz-ID-Konvention für dich in Ordnung ist~~ — **geklärt (2026-08-01):** Codebase-Analyse ergab, dass `Math.random().toString(36)` an 24 Stellen dupliziert vorkommt, aber nur 4 Tabellen (`documents`, `collections`, `mindmaps`, `flashcard_decks`) echte Primärschlüssel damit bilden; der Rest sind JSONB-Array-Item-IDs. Konkreter Fund: `shared_decks.id` übernimmt `FlashcardDeck.id` 1:1 und steckt in bereits live verteilten `/shared/{id}`-Links, deren Routing-Regex (`App.tsx:227`, `[a-z0-9]+`) UUIDs mit Bindestrich nicht matchen würde. **Entscheidung: UUID (`crypto.randomUUID()`) ausschließlich für die vier neuen Graph-Tabellen, keine App-weite Migration** — rein additiv, kein bestehender Call-Site muss geändert werden.
2. Die `title`-NOT-NULL/CHECK-Regel bedeutet: Ein Node muss einen Titel haben, BEVOR er zum ersten Mal gespeichert wird. Ein Entwurfszustand ("ich tippe gerade, noch kein Titel") muss dann rein lokal im UI bleiben und darf nicht vorzeitig einen Insert auslösen — das ist eine Anforderung an die spätere UI-Schicht, die ich hier nur markiere, nicht selbst lösen kann, weil UI ausdrücklich nicht Teil dieser Phase ist. Weiterhin offen (UI existiert noch nicht).

---

## 7. Phase 2 umgesetzt — kritischer Architektur-Review (2026-08-02) und Status danach

Nach Fertigstellung der vollständigen TypeScript-Domain (`services/graph/`: `types.ts`, `id.ts`, `builtInRelationTypes.ts`, `graphIndex.ts`, `graphValidationService.ts`, `graphMutationService.ts`, `graphRepository.ts`, `graphSyncService.ts`, `graphPersistenceService.ts`, `graphHistoryService.ts`, `graphSearchService.ts`, je mit Tests) wurde die Architektur explizit kritisch geprüft — Import-Graph mechanisch extrahiert (verifiziert: **keine Zyklen**, sauberer DAG), jede Datei gegen KI/Rendering/Mobile/Offline/Kollaboration/Performance-bei-Tausenden-Nodes durchdacht. Ergebnis und Konsequenzen:

### Behoben (kritisch, vor jedem echten Einsatz nötig)

- **`purgeNode` löschte real gar nichts.** Der In-Memory-State wurde bereinigt, die DB-Zeile blieb (archiviert) bestehen und wurde vom nächsten `pullSince` (`includeArchived: true`) zurückgeholt — die "endgültig löschen"-Aktion hatte nach einer Synchronisation keine dauerhafte Wirkung. **Fix:** `GraphRepository.deleteNode` (Hard Delete, `ON DELETE CASCADE` der DB räumt Kanten/Dokument-Refs automatisch mit auf) + `GraphSyncService.pushDeleteNode` + `GraphPersistenceService.commitPurgeNode`.
- **Local-First war nicht wirklich eingehalten.** Schlug ein Push offline fehl, gab es keinen Mechanismus, der das beim nächsten Start erkennt und erneut versucht — die Änderung sah im Cache "normal" aus und verschwand faktisch. **Fix:** `GraphSyncService` bekam `markPending`/`clearPending`/`loadPendingWrites`/`hasPendingWrites`/`retryPendingWrites` (synchrone, scope-getrennte Pending-Liste in `localStorage`, unabhängig vom 400ms-Debounce der eigentlichen Commits). `GraphPersistenceService` markiert jetzt in JEDER `commit*`-Funktion sofort als pending und räumt erst nach bestätigtem Push auf. `pullSince` ruft `retryPendingWrites` vor dem eigentlichen Pull auf und filtert zusätzlich Nodes mit offenem Pending-Delete aus der Cloud-Antwort — schließt damit auch die Race Condition, bei der ein Pull einen gerade erst (noch nicht bestätigt) gelöschten Node aus einer veralteten Cloud-Zeile wiederbelebt hätte.
- **Bekannte, bewusst akzeptierte Restlücke aus diesem Fix:** `purgeNode`s In-Memory-Kaskade entfernt anhängende Kanten/Dokument-Refs lokal sofort, aber es wird nur für den Node selbst ein Pending-Delete geführt (der `ON DELETE CASCADE` der DB übernimmt den Rest automatisch, sobald der Node-Delete durchkommt). Bleibt der Node-Delete offline hängen UND läuft in genau diesem Fenster ein Pull, könnten die kaskadierten (serverseitig noch existierenden) Kanten/Refs kurzzeitig zurückgeholt werden. Seltener, zusammengesetzter Fall — nicht gesondert abgesichert, im Code dokumentiert (`graphSyncService.ts`, Kommentar bei `retryPendingWrites`).

### Bewusst zurückgestellt (Priorisierung vom Nutzer bestätigt, 2026-08-02)

- **GraphIndex inkrementell statt bei jeder Mutation neu aufgebaut** (`createEdge`/`updateEdge`/`restoreEdge`/`deleteRelationType` rufen aktuell `buildGraphIndex(state)` — vollständiger O(Kanten)-Scan pro Aufruf; bei sequenziellem Anlegen vieler Kanten O(n²)). Wahrscheinlichster erster Performance-Refactor, sobald ein Fach viele hundert Kanten hat — später.
- **`graph_node_documents`-Fetch ist nicht inkrementell** (`fetchNodeDocumentRefs` hat keinen `updatedAfter`-Parameter, jeder Pull holt den kompletten Bestand). Günstiger Fix wäre `created_at` als Cursor, da Zeilen unveränderlich sind — später.
- **KI-Schreibgrenze ist Konvention, kein Zwang** — nichts hindert eine künftige `graphAiSuggestions.ts` daran, `graphMutationService` direkt zu importieren. Muss vor Phase 4 eine echte Lint-Regel werden (z. B. `no-restricted-imports` oder Dependency-Cruiser), sonst ist das zentrale KI-Versprechen nur Vorsatz.
- **`initAutoFlush` ist Web-only** (`visibilitychange`/`pagehide`/`beforeunload`) — in der per Capacitor gewrappten iOS-App bleibt die WKWebView beim App-Wechsel typischerweise im Speicher, die zuverlässigere Signalquelle wäre `@capacitor/app`s `appStateChange` (Paket aktuell nicht installiert). Erst mit dem tatsächlichen Bau der mobilen App nachziehen.
- **Cache-Granularität ist ein großer Blob pro Fach-Scope** (`saveCachedState` serialisiert den kompletten `GraphState`). Bei tatsächlich tausenden Nodes und häufigem Editieren ein Skalierungs-Deckel (`localStorage`-Kontingent, synchrones `JSON.stringify`+`setItem`). Erst bei nachgewiesenem Bedarf auf granularere Keys pro Entität umstellen.
- **Kollaboration/Mehrnutzer-Editing wird von der aktuellen Last-Write-Wins-Strategie (ganzes Objekt, kein Feld-Merge) nicht getragen** — für den aktuellen Einzelnutzer-Anwendungsfall angemessen, bei einem künftigen "geteilte Graphen"-Feature wäre das keine Erweiterung, sondern eine Neukonstruktion des Sync-Kerns. Kein Fehler, nur ein klar zu benennender Fakt.
- Kleinere, risikolose Funde: `builtInRelationTypes.ts` und `GraphNodeSummary`/`GraphNodeComputedMetadata` (types.ts) sind aktuell unbenutzt (vorbereitete, noch nicht konsumierte Abstraktionen) — kein Handlungsbedarf, nur zur Kenntnisnahme.

### Ehrliche Bilanz

Die Schichtung, der Test-first-Stil der reinen Domain-Funktionen, die UUID-Entscheidung und die DB-seitige Autorität für `version`/`updated_at` haben sich beim Review bewährt. Zwei Stellen (`purgeNode` ohne echten Lösch-Pfad, fehlendes Pending-Write-Tracking) waren echte Lücken zwischen dem, was geplant war, und dem, was zuerst gebaut wurde — beide sind jetzt behoben und getestet (652 Tests projektweit, 0 TypeScript-Fehler). Die zurückgestellten Punkte sind bekannt, priorisiert und im Code an der jeweiligen Stelle dokumentiert, nicht stillschweigend liegen gelassen.

Wenn das passt, ist die Datenbasis vollständig geplant und bereit für die erste konkrete Migration (`backend/migration_graph_v1.sql`) — die würde ich erst auf deine Bestätigung hin tatsächlich anlegen, nicht als Teil dieser Planung.
