// 基础数据类型定义

export interface Work {
  id: number;
  title: string;
  synopsis: string;
  lore_entry_template?: string;
  created_at: string;
  updated_at: string;
  word_count: number;
  chapter_count: number;
}

export interface Act {
  id: number;
  work: number;
  name: string;
  order: number;
  synopsis: string;
  act_type?: 'normal' | 'side_chapters';
  word_count: number;
  chapter_count: number;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: number;
  work: number;
  title: string;
  content: string;
  order: number;
  act: number;
  act_name?: string;
  act_order?: number;
  chapter_number: number;
  word_count: number;
  created_at: string;
  updated_at: string;
  summary?: string;
}

export interface Faction {
  id: number;
  work: number;
  name: string;
  description: string;
  is_default: boolean;
  faction_type: 'normal' | 'no_faction' | 'worldbuilding';
  order: number;
  is_collapsed: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoreEntry {
  id: number;
  work: number;
  name: string;
  description: string;
  triggers: string[];
  // Reserved field from backend; current frontend UI does not edit it.
  extra_triggers: string[];
  factions: number[];
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  work?: number;
  chapter?: number;
  content: string;
  color: string;
  text_start_position?: number;
  text_end_position?: number;
  linked_text?: string;
  is_ai_generated?: boolean;
  note_type?: 'user' | 'suggestion' | 'reminder' | 'character' | 'plot' | 'setting';
  created_at: string;
  updated_at: string;
}

export interface AutoEditVersion {
  id: number;
  version_number: number;
  edited_text: string;
  created_at: string;
}

export interface AutoEdit {
  id: number;
  work: number;
  chapter: number;
  text_start_position: number;
  text_end_position: number;
  original_text: string;
  active_version_index: number;
  versions: AutoEditVersion[];
  current_text: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIService {
  type: 'chat' | 'continue' | 'suggest' | 'summary';
  model: 'deepseek-reasoner' | 'deepseek-chat';
}

export interface Suggestion {
  id: string;
  type: 'expand' | 'improve' | 'rewrite' | 'continue';
  content: string;
  targetText?: string;
  position?: {
    start: number;
    end: number;
  };
  created_at: string;
}

export interface AIContext {
  synopsis: string;
  loreEntries: LoreEntry[];
  recentChapterSummaries: string[];
  currentChapterContent: string;
  guide?: string;
}

export interface WritingStylePerspective {
  name: string;
  description: string;
  examples: string[];
}

export interface WritingStyle {
  id: number;
  name: string;
  style_data: string;
  analysis_result?: {
    overall?: string;
    perspectives: WritingStylePerspective[];
  };
  created_at: string;
  updated_at: string;
}