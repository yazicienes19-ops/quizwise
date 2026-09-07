import type { GraphNode } from './types';
import type { RelatedConceptEntry } from './graphIndex';
import type { ProcessedDocument } from '../../types';
import type { GenerationSource } from '../geminiService';

/**
 * Phase 5 ("Aktiv lernen") — verwandelt einen GraphNode in die Rohstoffe, die
 * die BESTEHENDE Lerninfrastruktur (Karteikarten/Quiz/Feynman/KI-Erklärung)
 * ohnehin schon erwartet: einen Fließtext bzw. eine GenerationSource.
 *
 * SEIT 2026-09-07 (User-Anforderung: "Erklärer soll meinen Wissensnetz-
 * Kontext verstehen, nicht nur den Node isoliert"): Titel+Beschreibung+Notiz
 * bleiben die PRIMÄRE Quelle, aber die direkten Verknüpfungen des Nodes
 * (RelatedConceptEntry[], inkl. kurzem Beschreibungs-Schnipsel des jeweils
 * verbundenen Nodes) werden als zusätzlicher Kontext-Block angehängt — s.
 * buildRelationsContextBlock. Bewusst weiterhin NUR direkte Nachbarn (1 Hop),
 * kein rekursiver Mehrhop-Kontext und keine Kanten-IDs/Metadaten jenseits
 * dessen, was describeRelatedEntry ohnehin schon aufbereitet — das hält die
 * Payload klein und lässt sich bei Bedarf später gezielt erweitern (z. B.
 * über subgraph() aus graphIndex.ts für einen "erweiterten Kontext"-Modus).
 *
 * WICHTIG: Die Verknüpfungen sind die PERSÖNLICHE, unverifizierte Struktur
 * des Nutzers — der Kontext-Block weist das Modell deshalb explizit an,
 * zwischen "laut deinem Wissensnetz" und einer fachlich begründeten
 * Einordnung zu unterscheiden (s. Text unten), statt Nutzer-Verknüpfungen
 * als bestätigte Fakten auszugeben.
 */

export function buildNodeLearningText(node: GraphNode): string {
  return [node.title, node.description, node.notes]
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Baut den "Verknüpfungen im Wissensnetz"-Kontextblock aus den direkten
 * Nachbarn eines Nodes — inklusive Beschreibungs-Schnipsel des jeweils
 * verbundenen Nodes, sofern vorhanden. Von der Node-Erklärung, dem
 * Rückfragen-Dialog UND der Karten-/Quiz-Generierung gemeinsam genutzt
 * (keine drei parallelen Formulierungen desselben Kontexts).
 *
 * SEIT 2026-09-07 (User-Feedback nach Live-Test): Die Verknüpfungen sollen
 * SEMANTISCH in die fachliche Antwort einfließen, nicht als sichtbarer
 * Meta-Verweis ("Laut deinem Wissensnetz...", "Du hast X mit Y verbunden...")
 * — das wirkte wie eine technische Herkunftsangabe statt einer verstandenen
 * Erklärung. Der explizite "keine geprüfte Tatsache"-Hinweis bleibt, aber nur
 * noch als AUSNAHME für fachlich nicht etablierte/unübliche Verknüpfungen,
 * nicht mehr als Standardformulierung für jede Antwort.
 */
function buildRelationsContextBlock(relatedEntries: RelatedConceptEntry[]): string {
  if (!relatedEntries.length) return '';
  const lines = relatedEntries
    .map(e => `- ${e.text}${e.otherDescriptionSnippet ? ` (${e.otherTitle}: "${e.otherDescriptionSnippet}")` : ''}`)
    .join('\n');
  return `\n\nVerknüpfungen im persönlichen Wissensnetz des Nutzers (vom Nutzer selbst angelegt — das sind SEINE Verknüpfungen, keine automatisch geprüften Fakten):\n${lines}\n\nVerarbeite diese Verknüpfungen SEMANTISCH in deine fachliche Erklärung/Fragen, um das Konzept richtig einzuordnen — OHNE technische Meta-Hinweise wie "laut deinem Wissensnetz", "du hast X mit Y verbunden" oder "in deinem Graphen". Formuliere stattdessen direkt fachlich (z. B. "X wird als ... bezeichnet, weil es sich von Y abgrenzt" statt "Laut deinem Wissensnetz stehen X und Y in Beziehung"). AUSNAHME: Nur wenn eine Verknüpfung fachlich NICHT etabliert, unüblich oder erkennbar eine rein persönliche Einordnung ist (nicht durch die Fachliteratur gedeckt), weise das explizit aus (z. B. "Das ist deine eigene Einordnung — fachlich lässt sich das eher so einordnen: ...") statt sie unkommentiert als gesicherte Tatsache darzustellen.`;
}

/**
 * Node → GenerationSource für Erklärung, Rückfragen-Dialog, Karteikarten und
 * Quiz gleichermaßen: Node-Text als primäre Quelle, direkte Verknüpfungen
 * als optionaler Zusatzkontext (leeres Array = altes Verhalten, reiner
 * Node-Text — z. B. wenn für einen Node noch keine Kanten existieren).
 */
export function buildNodeGenerationSource(node: GraphNode, relatedEntries: RelatedConceptEntry[] = []): GenerationSource {
  return { text: buildNodeLearningText(node) + buildRelationsContextBlock(relatedEntries) };
}

/**
 * Historischer Name für denselben Aufbau, beibehalten für Lesbarkeit an den
 * Aufrufstellen des Rückfragen-Dialogs (GraphLearningOverlay) — seit
 * 2026-09-07 identisch zu buildNodeGenerationSource, keine eigene Logik mehr
 * (vorher: nur hier gab es überhaupt einen Beziehungs-Block).
 */
export const buildNodeDialogSource = buildNodeGenerationSource;

/**
 * Feynman/`ActiveRecall` kennt keinen "roher Text"-Einstieg — nur `initialDoc`
 * + `getDocumentSource` (per Autostart). Statt die Komponente zu ändern
 * ("bestehende Infrastruktur nutzen", nicht anfassen), wird hier ein
 * minimales, rein clientseitiges `ProcessedDocument` fabriziert — nie
 * gespeichert, nie in `documents` eingehängt, existiert nur für die Dauer
 * dieser einen Sitzung im Speicher.
 *
 * Bewusst (noch) OHNE Verknüpfungs-Kontext — anders als die drei Funktionen
 * oben war das nicht Teil der Anforderung vom 2026-09-07; ließe sich analog
 * ergänzen (relatedEntries-Parameter + buildRelationsContextBlock), falls
 * gewünscht.
 */
export function buildNodeSyntheticDocument(node: GraphNode): ProcessedDocument {
  return {
    id: `graph-node-${node.id}`,
    name: node.title,
    content: buildNodeLearningText(node),
    type: 'text',
    uploadDate: Date.now(),
  };
}
