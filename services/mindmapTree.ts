export interface MindmapNode {
  id: string;
  text: string;
  children: MindmapNode[];
  /** Frei wählbare Akzentfarbe dieses einen Knotens (z.B. '#f97316'), unabhängig von Eltern/Kindern. */
  color?: string;
  /** Nur für die Vorschau relevant — blendet die Kinder dieses Knotens beim Rendern aus, ändert aber nicht die eigentlichen Daten. */
  collapsed?: boolean;
}

const genId = (): string => Math.random().toString(36).slice(2, 10);

const BULLET_LEVEL_BASE = 100;

/**
 * Stack-basierter Parser: Heading-Zeilen (#..######) ergeben Ebene 1-6, tiefer
 * verschachtelt optional per eingerückten Bullets (-/*), die immer unter der
 * zuletzt gesehenen Zeile hängen (BULLET_LEVEL_BASE liegt über jeder möglichen
 * Heading-Ebene). Muss bestehende, real gespeicherte Mindmaps (nur Headings)
 * weiterhin korrekt lesen können.
 */
export function markdownToTree(markdown: string): MindmapNode {
  type StackEntry = { level: number; node: MindmapNode };
  const stack: StackEntry[] = [];
  let root: MindmapNode | null = null;

  const pushNode = (level: number, text: string) => {
    const node: MindmapNode = { id: genId(), text, children: [], collapsed: false };
    if (!root) {
      root = node;
    } else {
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].node : root;
      parent.children.push(node);
    }
    stack.push({ level, node });
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      pushNode(headingMatch[1].length, headingMatch[2].trim());
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      pushNode(BULLET_LEVEL_BASE + Math.floor(indent / 2), bulletMatch[2].trim());
    }
  }

  return root ?? { id: genId(), text: '', children: [], collapsed: false };
}

function normalizeNode(raw: unknown): MindmapNode {
  const n = raw as Partial<MindmapNode> | null | undefined;
  return {
    id: typeof n?.id === 'string' ? n.id : genId(),
    text: typeof n?.text === 'string' ? n.text : '',
    color: typeof n?.color === 'string' ? n.color : undefined,
    collapsed: !!n?.collapsed,
    children: Array.isArray(n?.children) ? n!.children!.map(normalizeNode) : [],
  };
}

/** Persistenzformat für `MindmapItem.markdown` — trotz des Feldnamens seit Einführung von Farben/Einklappen reines JSON (siehe `deserializeMindmap` für die Rückwärtskompatibilität mit altem Heading-Markdown). */
export function serializeMindmap(root: MindmapNode): string {
  return JSON.stringify(root);
}

/**
 * Bestandsmindmaps von vor der Farb-/Einklapp-Funktion sind reines
 * Heading-Markdown (`# Thema\n## Punkt`) — daran erkennbar, dass es NICHT mit
 * `{` beginnt bzw. sich nicht als JSON-Objekt mit `id`-Feld parsen lässt.
 * Neue Mindmaps werden ab jetzt immer als JSON gespeichert.
 */
export function deserializeMindmap(raw: string): MindmapNode {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') return normalizeNode(parsed);
    } catch {
      // fällt durch auf Markdown-Parsing
    }
  }
  return markdownToTree(raw);
}

function findAndUpdate(node: MindmapNode, targetId: string, update: (n: MindmapNode) => MindmapNode): MindmapNode {
  if (node.id === targetId) return update(node);
  return { ...node, children: node.children.map(child => findAndUpdate(child, targetId, update)) };
}

export function findNode(root: MindmapNode, nodeId: string): MindmapNode | undefined {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return undefined;
}

/** Ist `nodeId` (irgendwo tiefer) ein Nachfahre von `ancestorId`? */
export function isDescendant(root: MindmapNode, ancestorId: string, nodeId: string): boolean {
  const ancestor = findNode(root, ancestorId);
  if (!ancestor) return false;
  const check = (n: MindmapNode): boolean => n.children.some(c => c.id === nodeId || check(c));
  return check(ancestor);
}

export function updateNodeText(root: MindmapNode, nodeId: string, text: string): MindmapNode {
  return findAndUpdate(root, nodeId, n => ({ ...n, text }));
}

/** `color: undefined` setzt die Farbe wieder auf den Standard zurück. */
export function updateNodeColor(root: MindmapNode, nodeId: string, color: string | undefined): MindmapNode {
  return findAndUpdate(root, nodeId, n => ({ ...n, color }));
}

export function toggleCollapsed(root: MindmapNode, nodeId: string): MindmapNode {
  return findAndUpdate(root, nodeId, n => ({ ...n, collapsed: !n.collapsed }));
}

/** Nur für die Vorschau: blendet die Kinder eingeklappter Knoten aus, ohne die eigentlichen Daten zu verändern. */
export function pruneCollapsed(root: MindmapNode): MindmapNode {
  if (root.collapsed) return { ...root, children: [] };
  return { ...root, children: root.children.map(pruneCollapsed) };
}

export function addChild(root: MindmapNode, parentId: string): { tree: MindmapNode; newNodeId: string } {
  const newNode: MindmapNode = { id: genId(), text: '', children: [], collapsed: false };
  const tree = findAndUpdate(root, parentId, n => ({ ...n, children: [...n.children, newNode] }));
  return { tree, newNodeId: newNode.id };
}

/** Löscht den Knoten samt Subtree. Der Root-Knoten selbst wird nie entfernt (Aufrufer muss das ohnehin verhindern). */
export function deleteNode(root: MindmapNode, nodeId: string): MindmapNode {
  if (root.id === nodeId) return root;
  const removeFrom = (node: MindmapNode): MindmapNode => ({
    ...node,
    children: node.children.filter(c => c.id !== nodeId).map(removeFrom),
  });
  return removeFrom(root);
}

/**
 * Hängt `nodeId` unter `newParentId` um (Drag & Drop). Gibt den Baum
 * UNVERÄNDERT zurück, wenn das einen Zyklus erzeugen würde (Ziel ist der
 * Knoten selbst oder einer seiner eigenen Nachfahren), der Root verschoben
 * werden soll, oder eine der beiden IDs nicht existiert.
 */
export function moveNode(root: MindmapNode, nodeId: string, newParentId: string): MindmapNode {
  if (nodeId === root.id) return root;
  if (nodeId === newParentId) return root;
  if (isDescendant(root, nodeId, newParentId)) return root;
  const nodeToMove = findNode(root, nodeId);
  if (!nodeToMove) return root;
  const withoutNode = deleteNode(root, nodeId);
  if (!findNode(withoutNode, newParentId)) return root;
  return findAndUpdate(withoutNode, newParentId, n => ({ ...n, children: [...n.children, nodeToMove] }));
}

/** Findet Elternteil-ID + Index innerhalb dessen `children` für einen Knoten. `undefined` wenn `nodeId` der Root selbst ist. */
export function findParent(root: MindmapNode, nodeId: string): { parentId: string; index: number } | undefined {
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === nodeId) return { parentId: root.id, index: i };
    const found = findParent(root.children[i], nodeId);
    if (found) return found;
  }
  return undefined;
}

function insertChildAt(node: MindmapNode, parentId: string, index: number, newChild: MindmapNode): MindmapNode {
  if (node.id === parentId) {
    const children = [...node.children];
    children.splice(index, 0, newChild);
    return { ...node, children };
  }
  return { ...node, children: node.children.map(c => insertChildAt(c, parentId, index, newChild)) };
}

/**
 * Fügt einen leeren Knoten direkt NACH `nodeId` als Geschwister ein (Enter im
 * Gliederungs-Editor). Ist `nodeId` der Root selbst (hat keine Geschwister),
 * wird der neue Knoten stattdessen als erstes Kind des Root eingefügt.
 */
export function addSiblingAfter(root: MindmapNode, nodeId: string): { tree: MindmapNode; newNodeId: string } {
  const newNode: MindmapNode = { id: genId(), text: '', children: [], collapsed: false };
  const info = findParent(root, nodeId);
  if (!info) return { tree: { ...root, children: [newNode, ...root.children] }, newNodeId: newNode.id };
  return { tree: insertChildAt(root, info.parentId, info.index + 1, newNode), newNodeId: newNode.id };
}

function flattenIds(root: MindmapNode): string[] {
  const ids: string[] = [];
  const walk = (n: MindmapNode) => { ids.push(n.id); n.children.forEach(walk); };
  walk(root);
  return ids;
}

/**
 * Tab im Gliederungs-Editor: macht den Knoten zum (letzten) Kind der
 * unmittelbar VORHERIGEN Zeile in der Gesamtansicht — nicht nur des
 * vorherigen Geschwisters auf derselben Ebene (wie bei Workflowy & Co.), sonst
 * lassen sich Äste nicht tiefer als eine Ebene ausbauen, ohne vorher künstlich
 * ein Geschwister auf der Zielebene anzulegen. In einer Pre-Order-Liste kann
 * die vorherige Zeile nie ein Nachfahre des Knotens selbst sein, ein
 * Zyklus ist also strukturell ausgeschlossen. No-op, wenn der Knoten bereits
 * die erste Zeile ist (nichts davor zum Einhängen).
 */
export function indentNode(root: MindmapNode, nodeId: string): MindmapNode {
  const ids = flattenIds(root);
  const idx = ids.indexOf(nodeId);
  if (idx <= 0) return root;
  const newParentId = ids[idx - 1];
  const currentParent = findParent(root, nodeId);
  if (currentParent?.parentId === newParentId) return root; // steht schon direkt dort, kein sinnvolles Einrücken
  return moveNode(root, nodeId, newParentId);
}

/** Shift+Tab im Gliederungs-Editor: hebt den Knoten eine Ebene, direkt nach seinem bisherigen Elternteil eingefügt. No-op wenn der Elternteil bereits der Root ist. */
export function outdentNode(root: MindmapNode, nodeId: string): MindmapNode {
  const parentInfo = findParent(root, nodeId);
  if (!parentInfo) return root;
  const grandparentInfo = findParent(root, parentInfo.parentId);
  if (!grandparentInfo) return root;
  const node = findNode(root, nodeId);
  if (!node) return root;
  const withoutNode = deleteNode(root, nodeId);
  return insertChildAt(withoutNode, grandparentInfo.parentId, grandparentInfo.index + 1, node);
}
