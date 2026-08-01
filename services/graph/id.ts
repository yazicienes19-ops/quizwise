/**
 * Zentrale ID-Erzeugung für den Knowledge Graph — bewusst crypto.randomUUID()
 * statt des sonst in der App üblichen Math.random().toString(36)-Musters.
 * Begründung (vollständige Codebase-Analyse, s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md):
 * nur diese vier neuen Graph-Tabellen sind betroffen, keine bestehende Route/
 * Tabelle verlässt sich auf das alte Kurz-ID-Format. Eine UUID ist praktisch
 * kollisionsfrei, wodurch ein einfacher statt zusammengesetzter Primary Key
 * (id, user_id) möglich wird.
 *
 * An einer einzigen Stelle gekapselt, damit ein späterer Wechsel der
 * ID-Strategie (falls je nötig) nicht an jeder Aufrufstelle einzeln
 * nachvollzogen werden muss.
 */
export const generateGraphId = (): string => crypto.randomUUID();
