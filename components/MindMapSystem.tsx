
import React, { useState, useEffect, useRef } from 'react';
import { MindMapProject, MindMapNode, MindMapEdge, ProcessedDocument } from '../types';
import { EmojiImage } from './EmojiImage';
import { suggestConceptsForMindMap } from '../services/geminiService';
import { toast } from '../services/toast';

interface MindMapSystemProps {
  availableDocuments: ProcessedDocument[];
  onGenerateQuizFromConcept: (concept: string) => void;
  onGenerateCardsFromConcept: (concept: string) => void;
}

export const MindMapSystem: React.FC<MindMapSystemProps> = ({ 
  availableDocuments, 
  onGenerateQuizFromConcept,
  onGenerateCardsFromConcept
}) => {
  const [projects, setProjects] = useState<MindMapProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [edgeStartNodeId, setEdgeStartNodeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  
  const svgRef = useRef<SVGSVGElement>(null);

  // Initial Load
  useEffect(() => {
    const saved = localStorage.getItem('mindmap_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setProjects(parsed);
        }
      } catch (e) {
        console.error("Error loading projects", e);
      }
    }
  }, []);

  // Sync to LocalStorage
  useEffect(() => {
    if (projects.length >= 0) {
      localStorage.setItem('mindmap_projects', JSON.stringify(projects));
    }
  }, [projects]);

  const activeProject = projects.find(p => p.id === activeProjectId);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const newProject: MindMapProject = {
      id: Math.random().toString(36).substr(2, 9),
      title: newProjectName,
      lastModified: Date.now(),
      nodes: [
        { id: 'root', label: newProjectName, category: 'core', summary: 'Zentrales Thema', x: 400, y: 300 }
      ],
      edges: []
    };

    setProjects(prev => [...prev, newProject]);
    setActiveProjectId(newProject.id);
    setNewProjectName('');
    setIsCreatingNew(false);
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Mindmap wirklich löschen?")) {
      const nextProjects = projects.filter(p => p.id !== id);
      setProjects(nextProjects);
      if (activeProjectId === id) setActiveProjectId(null);
    }
  };

  const addNodeAt = (x: number, y: number, label: string = "Neuer Begriff") => {
    if (!activeProjectId) return;
    const newNode: MindMapNode = {
      id: Math.random().toString(36).substr(2, 9),
      label,
      category: 'definition',
      summary: '',
      x,
      y
    };
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { 
      ...p, 
      nodes: [...p.nodes, newNode], 
      lastModified: Date.now() 
    } : p));
    setSelectedNodeId(newNode.id);
  };

  const updateNode = (id: string, updates: Partial<MindMapNode>) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
      ...p,
      nodes: p.nodes.map(n => n.id === id ? { ...n, ...updates } : n),
      lastModified: Date.now()
    } : p));
  };

  const deleteNode = (id: string) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { 
      ...p, 
      nodes: p.nodes.filter(n => n.id !== id),
      edges: p.edges.filter(e => e.from !== id && e.to !== id),
      lastModified: Date.now()
    } : p));
    setSelectedNodeId(null);
  };

  const createEdge = (fromId: string, toId: string) => {
    if (!activeProjectId || fromId === toId) return;
    
    // Check if edge already exists
    const project = projects.find(p => p.id === activeProjectId);
    if (!project) return;
    const exists = project.edges.some(e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId));
    if (exists) return;

    const newEdge: MindMapEdge = {
      id: Math.random().toString(36).substr(2, 9),
      from: fromId,
      to: toId,
      label: ''
    };
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { 
      ...p, 
      edges: [...p.edges, newEdge], 
      lastModified: Date.now() 
    } : p));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return;
    
    const x = (e.clientX - CTM.e) / CTM.a;
    const y = (e.clientY - CTM.f) / CTM.d;
    setMousePos({ x, y });

    if (dragNodeId && activeProjectId) {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p,
        nodes: p.nodes.map(n => n.id === dragNodeId ? { ...n, x, y } : n)
      } : p));
    }
  };

  const handleMouseUpGlobal = () => {
    setDragNodeId(null);
    // Note: edgeStartNodeId is intentionally cleared here. 
    // Child onMouseUp should handle connection before this fires.
    setTimeout(() => setEdgeStartNodeId(null), 10);
  };

  const handleAiSuggest = async () => {
    if (!activeProject || availableDocuments.length === 0) return;
    const doc = availableDocuments[0];
    setIsAiLoading(true);
    try {
      const source = doc.type === 'pdf' 
        ? { file: { data: doc.content, mimeType: 'application/pdf' } } 
        : { text: doc.content };
      
      const suggestions = await suggestConceptsForMindMap(source, activeProject.nodes.map(n => n.label));
      
      const newNodes = suggestions.map((s, i) => ({
        id: Math.random().toString(36).substr(2, 9),
        label: s.label || 'Vorschlag',
        category: (s.category as any) || 'definition',
        summary: s.summary || '',
        x: 400 + Math.cos(i) * 200,
        y: 300 + Math.sin(i) * 200
      }));

      setProjects(prev => prev.map(p => p.id === activeProjectId ? { 
        ...p, 
        nodes: [...p.nodes, ...newNodes],
        lastModified: Date.now() 
      } : p));
    } catch (e) {
      toast.error('KI-Vorschlag fehlgeschlagen. Prüfe den API-Key.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch(cat) {
      case 'core': return 'fill-indigo-600 stroke-indigo-400';
      case 'definition': return 'fill-cyan-500 stroke-cyan-400';
      case 'process': return 'fill-emerald-500 stroke-emerald-400';
      case 'example': return 'fill-amber-500 stroke-amber-400';
      default: return 'fill-slate-500 stroke-slate-400';
    }
  };

  const selectedNode = activeProject?.nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 h-[800px] flex flex-col">
      <div className="flex justify-between items-end shrink-0">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Knowledge <span className="text-cyan-600 dark:text-cyan-400">Maps</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeProject ? `Projekt: ${activeProject.title}` : 'Organisiere dein Wissen grafisch.'}
          </p>
        </div>
        
        {!activeProject && !isCreatingNew && (
          <button 
            onClick={() => setIsCreatingNew(true)}
            className="px-6 py-3 bg-cyan-600 text-white rounded-2xl font-bold shadow-lg hover:bg-cyan-700 transition-all flex items-center gap-2"
          >
            <EmojiImage emoji="➕" size={16} /> Neue Mindmap
          </button>
        )}

        {activeProject && (
          <button 
            onClick={() => { setActiveProjectId(null); setSelectedNodeId(null); }}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-all"
          >
            ← Projektliste
          </button>
        )}
      </div>

      {isCreatingNew && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border-2 border-cyan-500 shadow-2xl animate-in zoom-in-95 duration-200">
          <h3 className="text-xl font-bold mb-4 dark:text-white">Name der Mindmap:</h3>
          <form onSubmit={handleCreateProject} className="flex gap-4">
            <input 
              autoFocus
              type="text" 
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="z.B. Psychologie Einführung"
              className="flex-grow px-6 py-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-none outline-none ring-2 ring-slate-200 dark:ring-slate-700 focus:ring-cyan-500 dark:text-white"
            />
            <button 
              type="submit"
              className="bg-cyan-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-cyan-700 transition-all"
            >
              Erstellen
            </button>
            <button 
              type="button"
              onClick={() => setIsCreatingNew(false)}
              className="px-8 py-4 text-slate-400 font-bold hover:text-slate-600"
            >
              Abbrechen
            </button>
          </form>
        </div>
      )}

      {!activeProject && !isCreatingNew ? (
        <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pr-2 scrollbar-thin">
          {projects.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl opacity-50">
              <EmojiImage emoji="🗺️" size={64} className="mb-6" />
              <p className="font-bold text-lg">Noch keine Mindmaps erstellt.</p>
              <p className="text-sm mt-2">Klicke oben auf "Neue Mindmap".</p>
            </div>
          ) : (
            projects.sort((a,b) => b.lastModified - a.lastModified).map(project => (
              <div 
                key={project.id}
                onClick={() => setActiveProjectId(project.id)}
                className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl hover:border-cyan-500 hover:shadow-2xl transition-all group cursor-pointer relative"
              >
                <button 
                  onClick={(e) => deleteProject(project.id, e)}
                  className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-2"
                ><EmojiImage emoji="✕" size={14} /></button>
                <h3 className="text-2xl font-bold dark:text-white mb-2 truncate">{project.title}</h3>
                <div className="flex justify-between items-center mt-6">
                  <span className="text-xs font-black uppercase text-slate-400">{project.nodes.length} Knoten</span>
                  <span className="text-xs font-bold text-slate-300">{new Date(project.lastModified).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : activeProject && (
        <div className="flex-grow flex flex-col gap-4 relative select-none">
          {/* Toolbar */}
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
            <button 
              onClick={() => addNodeAt(400, 300)}
              className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-cyan-600 hover:text-white transition-all text-2xl"
              title="Begriff hinzufügen"
            >
              <EmojiImage emoji="➕" size={24} />
            </button>
            <button 
              onClick={handleAiSuggest}
              disabled={isAiLoading || availableDocuments.length === 0}
              className={`w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all text-2xl ${isAiLoading ? 'animate-pulse' : ''} ${availableDocuments.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
              title="KI Konzepte vorschlagen"
            >
              <EmojiImage emoji="✨" size={24} />
            </button>
          </div>

          {/* Canvas Wrapper */}
          <div className="flex-grow relative border border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50 dark:bg-slate-900 overflow-hidden shadow-inner">
            <svg 
              ref={svgRef}
              viewBox="0 0 800 600" 
              className="w-full h-full cursor-crosshair"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpGlobal}
              onDoubleClick={(e) => {
                if (e.target === svgRef.current) addNodeAt(mousePos.x, mousePos.y);
              }}
            >
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-slate-800" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              {/* Edges */}
              {activeProject.edges.map((edge) => {
                const fromNode = activeProject.nodes.find(n => n.id === edge.from);
                const toNode = activeProject.nodes.find(n => n.id === edge.to);
                if (!fromNode || !toNode) return null;
                return (
                  <line 
                    key={edge.id}
                    x1={fromNode.x} y1={fromNode.y} 
                    x2={toNode.x} y2={toNode.y} 
                    className="stroke-slate-300 dark:stroke-slate-700 stroke-2" 
                  />
                );
              })}

              {/* Interactive Edge (Dragging a connection) */}
              {edgeStartNodeId && (
                <line 
                  x1={activeProject.nodes.find(n => n.id === edgeStartNodeId)?.x || 0} 
                  y1={activeProject.nodes.find(n => n.id === edgeStartNodeId)?.y || 0}
                  x2={mousePos.x} 
                  y2={mousePos.y}
                  className="stroke-cyan-500 stroke-2 stroke-dashed pointer-events-none opacity-60"
                  strokeDasharray="5,5"
                />
              )}

              {/* Nodes */}
              {activeProject.nodes.map((node) => (
                <g 
                  key={node.id} 
                  className="cursor-move"
                  onMouseDown={(e) => { 
                    e.stopPropagation(); 
                    if (e.shiftKey) {
                      setEdgeStartNodeId(node.id);
                    } else {
                      setDragNodeId(node.id);
                      setSelectedNodeId(node.id);
                    }
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    if (edgeStartNodeId && edgeStartNodeId !== node.id) {
                      createEdge(edgeStartNodeId, node.id);
                      setEdgeStartNodeId(null);
                    }
                  }}
                >
                  <circle 
                    cx={node.x} cy={node.y} 
                    r={node.id === selectedNodeId ? 42 : 35} 
                    className={`${getCategoryColor(node.category)} transition-all shadow-lg ${node.id === selectedNodeId ? 'stroke-white stroke-[3px]' : 'stroke-transparent'}`} 
                  />
                  <text 
                    x={node.x} y={node.y} 
                    textAnchor="middle" 
                    dy=".3em" 
                    className="fill-white font-bold text-[10px] pointer-events-none select-none"
                  >
                    {node.label.length > 12 ? node.label.substring(0, 10) + '...' : node.label}
                  </text>
                </g>
              ))}
            </svg>

            {/* Sidebar Inspector */}
            {selectedNode && (
              <div className="absolute top-4 right-4 w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl animate-in slide-in-from-right-4 overflow-y-auto max-h-[90%] scrollbar-thin">
                <div className="flex justify-between items-start mb-6">
                  <select 
                    value={selectedNode.category}
                    onChange={(e) => updateNode(selectedNode.id, { category: e.target.value as any })}
                    className="text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 p-2 rounded-xl border-none outline-none dark:text-white"
                  >
                    <option value="core">Zentrum</option>
                    <option value="definition">Definition</option>
                    <option value="process">Prozess</option>
                    <option value="example">Beispiel</option>
                  </select>
                  <button onClick={() => deleteNode(selectedNode.id)} className="text-rose-500 hover:scale-110 transition-transform p-2 bg-rose-50 dark:bg-rose-950/30 rounded-xl">
                    <EmojiImage emoji="🗑️" size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Titel</label>
                    <input 
                      value={selectedNode.label}
                      onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                      className="w-full text-xl font-bold bg-transparent border-b-2 border-slate-200 dark:border-slate-700 outline-none dark:text-white focus:border-cyan-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Notizen</label>
                    <textarea 
                      value={selectedNode.summary}
                      placeholder="Was bedeutet dieser Begriff?"
                      onChange={(e) => updateNode(selectedNode.id, { summary: e.target.value })}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 h-32 outline-none resize-none dark:text-white border border-transparent focus:border-cyan-500/30 transition-all"
                    />
                  </div>

                  <div className="pt-4 space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Aktionen</p>
                    <button 
                      onClick={() => onGenerateQuizFromConcept(selectedNode.label)} 
                      className="w-full py-4 bg-cyan-600 text-white rounded-2xl text-xs font-bold hover:bg-cyan-700 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                    >
                      <EmojiImage emoji="🎯" size={16} /> Mini-Quiz generieren
                    </button>
                    <button 
                      onClick={() => onGenerateCardsFromConcept(selectedNode.label)} 
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                    >
                      <EmojiImage emoji="🗂️" size={16} /> Karteikarten generieren
                    </button>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/20">
                  <p className="text-[9px] text-amber-700 dark:text-amber-400 font-bold uppercase tracking-tight text-center leading-tight flex items-center justify-center gap-2">
                    <EmojiImage emoji="💡" size={12} /> Halte <b>Shift</b> gedrückt und ziehe von einem Knoten zum anderen, um sie zu verbinden.
                  </p>
                </div>
              </div>
            )}

            {/* Zoom Controls */}
            <div className="absolute bottom-6 left-6 flex gap-2">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">-</button>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.2))} className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">+</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
