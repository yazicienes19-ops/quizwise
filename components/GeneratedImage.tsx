
import React from 'react';
import {
  Home, BookOpen, HelpCircle, Calendar, Brain, GraduationCap,
  Layers, Lightbulb, BarChart2, Search, FileText, Moon, Sun,
  AlertTriangle, X, Menu, Sparkles, Check, Scale, ArrowRight,
  Zap, Rocket, Globe, Download, Mail, Radio, Archive, Link2,
  Clipboard, Settings, Keyboard, Trophy, Star, TrendingUp, Plus,
  Map, Trash2, Target, Microscope, Building2, FlaskConical,
  type LucideIcon
} from 'lucide-react';

const iconMappings: { keywords: string[]; icon: LucideIcon }[] = [
  { keywords: ['home', 'dashboard'], icon: Home },
  { keywords: ['library', 'books', 'academic book'], icon: BookOpen },
  { keywords: ['quiz', 'question mark'], icon: HelpCircle },
  { keywords: ['calendar', 'planner', 'study flow'], icon: Calendar },
  { keywords: ['brain', 'recall', 'mind'], icon: Brain },
  { keywords: ['graduation', 'cap', 'exam paper', 'academic illustration'], icon: GraduationCap },
  { keywords: ['flashcard', 'deck', 'study deck', 'anki'], icon: Layers },
  { keywords: ['lightbulb', 'idea', 'explainer'], icon: Lightbulb },
  { keywords: ['radar', 'chart', 'analysis', 'data'], icon: BarChart2 },
  { keywords: ['magnifying', 'search', 'research'], icon: Search },
  { keywords: ['paper', 'writing pen', 'pen icon', 'term paper', 'document'], icon: FileText },
  { keywords: ['moon', 'night'], icon: Moon },
  { keywords: ['sun', 'day mode'], icon: Sun },
  { keywords: ['warning', 'alert'], icon: AlertTriangle },
  { keywords: ['close', '✕', 'dismiss'], icon: X },
  { keywords: ['menu', 'burger'], icon: Menu },
  { keywords: ['sparkle', 'sparkles', 'star'], icon: Sparkles },
  { keywords: ['check', 'tick'], icon: Check },
  { keywords: ['balance', 'scale'], icon: Scale },
  { keywords: ['arrow right', 'arrow'], icon: ArrowRight },
  { keywords: ['lightning', 'bolt', 'fast'], icon: Zap },
  { keywords: ['rocket', 'launch'], icon: Rocket },
  { keywords: ['globe', 'world'], icon: Globe },
  { keywords: ['inbox', 'download'], icon: Download },
  { keywords: ['mailbox', 'mail', 'empty'], icon: Mail },
  { keywords: ['satellite', 'radar dish'], icon: Radio },
  { keywords: ['archive'], icon: Archive },
  { keywords: ['link', 'chain'], icon: Link2 },
  { keywords: ['clipboard'], icon: Clipboard },
  { keywords: ['settings', 'gear'], icon: Settings },
  { keywords: ['keyboard'], icon: Keyboard },
  { keywords: ['trophy', 'award'], icon: Trophy },
  { keywords: ['growth', 'trending'], icon: TrendingUp },
  { keywords: ['plus', 'add'], icon: Plus },
  { keywords: ['mind map', 'map'], icon: Map },
  { keywords: ['trash', 'bin', 'delete'], icon: Trash2 },
  { keywords: ['target', 'bullseye'], icon: Target },
  { keywords: ['microscope'], icon: Microscope },
  { keywords: ['museum', 'building'], icon: Building2 },
  { keywords: ['flask', 'science'], icon: FlaskConical },
];

function resolveIcon(prompt: string): LucideIcon {
  const lower = prompt.toLowerCase();
  for (const { keywords, icon } of iconMappings) {
    if (keywords.some(k => lower.includes(k))) return icon;
  }
  return FileText;
}

interface GeneratedImageProps {
  prompt: string;
  className?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  fallbackUrl?: string;
}

export const GeneratedImage: React.FC<GeneratedImageProps> = ({ prompt, className = '' }) => {
  const Icon = resolveIcon(prompt);
  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      <Icon className="w-full h-full" strokeWidth={1.75} />
    </span>
  );
};
