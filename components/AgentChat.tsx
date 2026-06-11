import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Loader2 } from 'lucide-react';
import type { AgentType, AgentMessage, AgentContext } from '../types';
import { chatWithAgent } from '../services/agentService';

const AGENT_LABELS: Record<AgentType, string> = {
  lernCoach: 'Lern-Coach',
  studyFlow: 'StudyFlow-Agent',
  erklaerer: 'Erklärer-Agent',
  uxHelper: 'App-Assistent',
};

const AGENT_WELCOME: Record<AgentType, string> = {
  lernCoach: 'Hi! Ich bin dein Lern-Coach. Ich analysiere deinen Fortschritt und gebe dir konkrete Empfehlungen. Wie kann ich dir helfen?',
  studyFlow: 'Hi! Ich bin der StudyFlow-Agent. Ich helfe dir einen realistischen Lernplan zu erstellen. Womit soll ich anfangen?',
  erklaerer: 'Hi! Ich bin der Erklärer-Agent. Welches Konzept soll ich dir erklären?',
  uxHelper: 'Hi! Ich bin der App-Assistent. Ich erkläre dir alle Features und helfe dir QuizWise optimal zu nutzen. Was möchtest du wissen?',
};

interface AgentChatProps {
  agentType: AgentType;
  context?: AgentContext;
  isOpen: boolean;
  onClose: () => void;
  initialMessage?: string;
}

export const AgentChat: React.FC<AgentChatProps> = ({ agentType, context = {}, isOpen, onClose, initialMessage }) => {
  const [messages, setMessages] = useState<AgentMessage[]>([
    { role: 'assistant', content: AGENT_WELCOME[agentType], timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessages([{ role: 'assistant', content: AGENT_WELCOME[agentType], timestamp: Date.now() }]);
      setInput(initialMessage || '');
      // Andere offene Agent-Chats schließen
      window.dispatchEvent(new CustomEvent('quizwise-agent-opened', { detail: { agentType } }));
    }
  }, [isOpen, agentType]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: AgentMessage = { role: 'user', content: text, timestamp: Date.now() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0);
      const reply = await chatWithAgent(agentType, text, history, context);
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }]);
    } catch (err: any) {
      const errText = err.message === 'LIMIT_REACHED'
        ? 'Tageslimit erreicht. Upgrade auf Pro für mehr Nutzung.'
        : 'Fehler beim Abrufen der Antwort. Bitte versuche es erneut.';
      setMessages(prev => [...prev, { role: 'assistant', content: errText, timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50 w-80 md:w-96 flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-[var(--border-color)]"
      style={{ maxHeight: '520px' }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 text-white flex-shrink-0"
        style={{ background: 'var(--primary)' }}>
        <Bot size={18} />
        <span className="font-semibold text-sm flex-1" style={{ color: 'var(--primary-text)' }}>
          {AGENT_LABELS[agentType]}
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-0.5 opacity-80 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--primary-text)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[var(--bg-main)]" style={{ minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'text-white'
                  : 'bg-[var(--bg-sidebar)] text-[var(--text-main,#1a1a2e)] dark:text-slate-200 border border-[var(--border-color)]'
              }`}
              style={msg.role === 'user' ? { background: 'var(--primary)', color: 'var(--primary-text)' } : {}}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[var(--bg-sidebar)] border border-[var(--border-color)] px-3 py-2 rounded-2xl">
              <Loader2 size={16} className="animate-spin text-[var(--primary)]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-sidebar)] border-t border-[var(--border-color)] flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nachricht eingeben…"
          disabled={isLoading}
          className="flex-1 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)] transition-colors disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
          className="p-1.5 rounded-xl text-white disabled:opacity-40 transition-opacity"
          style={{ background: 'var(--primary)' }}>
          <Send size={15} style={{ color: 'var(--primary-text)' }} />
        </button>
      </div>
    </div>
  );
};
