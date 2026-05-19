
import React from 'react';
import {
  Lightbulb, Sparkles, Brain, Globe, GraduationCap, Target, Link2,
  BarChart2, Radio, Plus, Map, X, Trash2, Layers, MousePointerClick,
  BookMarked, Book, FileText, BookOpen, Download, Folder, Keyboard,
  MailOpen, Archive, Zap, Settings, PenLine, Clipboard, FlaskConical,
  Building2, Microscope, Trophy, Star, TrendingUp, Calendar, type LucideIcon,
} from 'lucide-react';

const emojiToIcon: Record<string, LucideIcon> = {
  '💡': Lightbulb,
  '✨': Sparkles,
  '🧠': Brain,
  '🌐': Globe,
  '🎓': GraduationCap,
  '🎯': Target,
  '🔗': Link2,
  '📊': BarChart2,
  '📡': Radio,
  '➕': Plus,
  '🗺️': Map,
  '✕': X,
  '✖': X,
  '🗑️': Trash2,
  '🗂️': Layers,
  '👆': MousePointerClick,
  '📕': BookMarked,
  '📘': Book,
  '📄': FileText,
  '📚': BookOpen,
  '📥': Download,
  '📁': Folder,
  '⌨️': Keyboard,
  '📭': MailOpen,
  '🗃️': Archive,
  '⚡': Zap,
  '⚙️': Settings,
  '🖋️': PenLine,
  '📝': PenLine,
  '📋': Clipboard,
  '🧪': FlaskConical,
  '🏛️': Building2,
  '🔬': Microscope,
  '🏆': Trophy,
  '🌟': Star,
  '📈': TrendingUp,
  '🃏': Layers,
  '📅': Calendar,
  '✍️': PenLine,
};

interface EmojiImageProps {
  emoji: string;
  className?: string;
  size?: number;
}

export const EmojiImage: React.FC<EmojiImageProps> = ({ emoji, className = '', size = 24 }) => {
  const Icon = emojiToIcon[emoji] ?? FileText;
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Icon width={size} height={size} strokeWidth={1.75} />
    </span>
  );
};
