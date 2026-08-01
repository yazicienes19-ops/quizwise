/**
 * Referenz-/Testdaten für die 6 eingebauten Beziehungstypen — MUSS inhaltlich
 * mit dem Seed in backend/migration_graph_v1.sql übereinstimmen.
 *
 * Bewusst OHNE `id`-Feld: Die echten IDs entstehen erst beim Seed-Insert in
 * Supabase (gen_random_uuid()) und unterscheiden sich pro Umgebung. Ein
 * clientseitig fabriziertes Fake-Objekt mit erfundener ID wäre irreführend —
 * jede echte Validierung/Anzeige muss die tatsächlich per GraphRepository
 * geladenen GraphRelationType-Zeilen verwenden, nie diese Konstante. Sie dient
 * ausschließlich als lesbare, einmalige Quelle für Tests/Dokumentation, damit
 * Migration und Domain-Schicht nicht unbemerkt auseinanderlaufen.
 */
export interface BuiltInRelationTypeSeed {
  label: string;
  inverseLabel?: string;
  symmetric: boolean;
  sortOrder: number;
}

export const BUILT_IN_RELATION_TYPE_SEEDS: readonly BuiltInRelationTypeSeed[] = [
  { label: 'ist Teil von', inverseLabel: 'enthält', symmetric: false, sortOrder: 1 },
  { label: 'Voraussetzung von', inverseLabel: 'baut auf … auf', symmetric: false, sortOrder: 2 },
  { label: 'Beispiel für', inverseLabel: 'hat als Beispiel', symmetric: false, sortOrder: 3 },
  { label: 'Ursache von', inverseLabel: 'wird verursacht durch', symmetric: false, sortOrder: 4 },
  { label: 'Gegensatz zu', symmetric: true, sortOrder: 5 },
  { label: 'gehört zusammen mit', symmetric: true, sortOrder: 6 },
];
