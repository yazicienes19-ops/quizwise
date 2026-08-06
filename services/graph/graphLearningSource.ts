import type { GraphNode } from './types';
import type { RelatedConceptEntry } from './graphIndex';
import type { ProcessedDocument } from '../../types';
import type { GenerationSource } from '../geminiService';

/**
 * Phase 5 ("Aktiv lernen") — verwandelt einen GraphNode in die Rohstoffe, die
 * die BESTEHENDE Lerninfrastruktur (Karteikarten/Quiz/Feynman/KI-Erklärung)
 * ohnehin schon erwartet: einen Fließtext bzw. eine GenerationSource. Bewusst
 * NUR Titel+Beschreibung+Notiz — keine ConceptNode-Konvergenz, keine Referenz
 * auf verknüpfte Dokumente/Kanten (das wäre eine eigene, hier ausdrücklich
 * nicht getroffene Architekturentscheidung).
 */

export function buildNodeLearningText(node: GraphNode): string {
  return [node.title, node.description, node.notes]
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function buildNodeGenerationSource(node: GraphNode): GenerationSource {
  return { text: buildNodeLearningText(node) };
}

/**
 * Wie buildNodeGenerationSource, aber für den Node-Dialog (GraphLearningOverlay
 * "Erklären"-Aktivität, s. continueNodeExplanation in geminiService.ts): hängt
 * zusätzlich die Beziehungen zu anderen Nodes an, damit Rückfragen wie
 * "Erkläre die Beziehung zu den verbundenen Konzepten" beantwortbar sind.
 * Bewusst NUR für den Dialog — die bestehende Karteikarten-/Quiz-/Feynman-
 * Generierung nutzt weiterhin buildNodeGenerationSource unverändert (keine
 * ConceptNode-Konvergenz, keine Kanten-Referenz dort, s. Datei-Kommentar oben).
 */
export function buildNodeDialogSource(node: GraphNode, relatedEntries: RelatedConceptEntry[]): GenerationSource {
  const relationsBlock = relatedEntries.length
    ? `\n\nBeziehungen zu anderen Konzepten im Wissensnetz:\n${relatedEntries.map(e => `- ${e.text}`).join('\n')}`
    : '';
  return { text: buildNodeLearningText(node) + relationsBlock };
}

/**
 * Feynman/`ActiveRecall` kennt keinen "roher Text"-Einstieg — nur `initialDoc`
 * + `getDocumentSource` (per Autostart). Statt die Komponente zu ändern
 * ("bestehende Infrastruktur nutzen", nicht anfassen), wird hier ein
 * minimales, rein clientseitiges `ProcessedDocument` fabriziert — nie
 * gespeichert, nie in `documents` eingehängt, existiert nur für die Dauer
 * dieser einen Sitzung im Speicher.
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
