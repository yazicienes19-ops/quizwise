import React, { useEffect, useRef } from 'react';
import {
  MindmapNode, updateNodeText, deleteNode, addChild, addSiblingAfter, indentNode, outdentNode, findNode,
} from '../services/mindmapTree';
import { useTranslation } from '../i18n/I18nProvider';

interface FlatRow {
  node: MindmapNode;
  depth: number;
}

const flatten = (node: MindmapNode, depth: number, out: FlatRow[]) => {
  out.push({ node, depth });
  node.children.forEach(c => flatten(c, depth + 1, out));
};

interface MindmapOutlineEditorProps {
  tree: MindmapNode;
  onChange: (tree: MindmapNode) => void;
}

export const MindmapOutlineEditor: React.FC<MindmapOutlineEditorProps> = ({ tree, onChange }) => {
  const { t } = useTranslation();
  const focusNextId = useRef<string | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const rows: FlatRow[] = [];
  flatten(tree, 0, rows);

  // Nach jedem Umbau (Enter/Tab/Shift+Tab) Fokus auf den betroffenen Knoten
  // legen — nötig, weil sich die Zeilenreihenfolge im DOM ändern kann.
  useEffect(() => {
    if (!focusNextId.current) return;
    const el = inputRefs.current.get(focusNextId.current);
    el?.focus();
    focusNextId.current = null;
  });

  const handleEnter = (nodeId: string) => {
    const { tree: next, newNodeId } = addSiblingAfter(tree, nodeId);
    focusNextId.current = newNodeId;
    onChange(next);
  };

  const handleTab = (nodeId: string, shift: boolean) => {
    focusNextId.current = nodeId;
    onChange(shift ? outdentNode(tree, nodeId) : indentNode(tree, nodeId));
  };

  const handleDelete = (nodeId: string) => {
    const node = findNode(tree, nodeId);
    if (node && node.children.length > 0 && !window.confirm(t('mm.deleteNodeConfirm'))) return;
    onChange(deleteNode(tree, nodeId));
  };

  const handleAddTopLevel = () => {
    const { tree: next, newNodeId } = addChild(tree, tree.id);
    focusNextId.current = newNodeId;
    onChange(next);
  };

  /** Fügt direkt ein Kind DIESER Zeile hinzu — so lässt sich ein bestehender Ast gezielt vertiefen, statt nur über Enter+Tab. */
  const handleExtendBranch = (nodeId: string) => {
    const { tree: next, newNodeId } = addChild(tree, nodeId);
    focusNextId.current = newNodeId;
    onChange(next);
  };

  return (
    <div className="space-y-1.5 p-1">
      {rows.map(({ node, depth }) => (
        <div key={node.id} className="flex items-center gap-1.5" style={{ paddingLeft: Math.min(depth, 6) * 18 }}>
          <input
            ref={el => { if (el) inputRefs.current.set(node.id, el); else inputRefs.current.delete(node.id); }}
            value={node.text}
            placeholder={depth === 0 ? t('mm.titlePlaceholder') : t('mm.untitledNode')}
            onChange={e => onChange(updateNodeText(tree, node.id, e.target.value))}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleEnter(node.id); }
              else if (e.key === 'Tab') { e.preventDefault(); handleTab(node.id, e.shiftKey); }
            }}
            className={`flex-1 min-w-0 px-3.5 py-2.5 rounded-xl text-sm font-bold outline-none dark:text-white bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 transition-colors ${depth === 0 ? 'font-black' : ''}`}
          />
          <button
            onClick={() => handleExtendBranch(node.id)}
            title={t('mm.addChild')}
            className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-300 hover:text-indigo-600 rounded-lg transition-colors"
          >+</button>
          {depth > 0 && (
            <button
              onClick={() => handleDelete(node.id)}
              title={t('mm.delete')}
              className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-300 hover:text-rose-500 rounded-lg transition-colors"
            >×</button>
          )}
        </div>
      ))}
      <button
        onClick={handleAddTopLevel}
        className="w-full mt-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 border-dashed transition-all"
        style={{ color: 'var(--primary)', borderColor: 'color-mix(in srgb, var(--primary) 40%, transparent)' }}
      >
        + {t('mm.addChild')}
      </button>
    </div>
  );
};
