import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Square, Wand2, Check, RotateCcw, Settings } from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { useMobile } from '../../hooks/useMobile';
import type { Work, Chapter, LoreEntry, WritingStyle } from '../../types';

interface AutoEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  work: Work;
  chapter: Chapter;
  onAccept: (editedText: string) => void;
  onRevert: (originalText: string) => void;
  onGenerateEdit: (
    originalText: string,
    context: AutoEditContext,
    onChunk: (chunk: string) => void,
    onEnd: () => void,
    onError: (error: string) => void,
    signal?: AbortSignal
  ) => Promise<void>;
  isMobile?: boolean;
}

export interface AutoEditContext {
  chapterSelection: 'all' | 'past_3' | 'custom' | 'none';
  customChapterCount?: number;
  selectedLoreEntries: number[]; // IDs of selected lore entries
  model: 'deepseek-chat' | 'deepseek-reasoner';
  editRequirement?: string; // Editing requirement/instruction
  styleId?: number; // Optional writing style ID
  useSummaries?: boolean; // Use chapter summaries instead of full content
}

interface AutoEditVersion {
  text: string;
  timestamp: Date;
}

export const AutoEditModal: React.FC<AutoEditModalProps> = ({
  isOpen,
  onClose,
  originalText: initialOriginalText,
  work,
  chapter,
  onAccept,
  onRevert,
  onGenerateEdit,
  isMobile: isMobileProp
}) => {
  // Mobile detection - use prop if provided, otherwise detect
  const isMobileHook = useMobile();
  const isMobile = isMobileProp !== undefined ? isMobileProp : isMobileHook;

  // State for text boxes
  const [originalText, setOriginalText] = useState(initialOriginalText);
  const [editedVersions, setEditedVersions] = useState<AutoEditVersion[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1); // -1 means no version yet
  const [currentEditedText, setCurrentEditedText] = useState('');

  // State for streaming
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedTextRef = useRef<string>('');

  // Helper to clean up trailing "---" and newline before it from auto-edit output
  const cleanAutoEditOutput = (text: string): string => {
    // Remove trailing "---" with optional newline before it
    return text.replace(/\n?---\s*$/, '').trimEnd();
  };

  // State for customize panel
  const [showCustomize, setShowCustomize] = useState(false);
  const [chapterSelection, setChapterSelection] = useState<'all' | 'past_3' | 'custom' | 'none'>('past_3');
  const [customChapterCount, setCustomChapterCount] = useState(3);
  const [useSummaries, setUseSummaries] = useState(false);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [selectedLoreIds, setSelectedLoreIds] = useState<number[]>([]);
  const [loreCurrentPage, setLoreCurrentPage] = useState(1);
  const [selectedModel, setSelectedModel] = useState<'deepseek-chat' | 'deepseek-reasoner'>('deepseek-chat');
  const LORE_PAGE_SIZE = 8; // 4x2 grid

  // State for editing requirement
  const [editRequirement, setEditRequirement] = useState('');

  // Prefill options fetched from backend
  const [prefills, setPrefills] = useState<Record<string, string>>({});
  const [isLoadingPrefills, setIsLoadingPrefills] = useState(true);

  // Writing styles
  const [styles, setStyles] = useState<WritingStyle[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(() => {
    const saved = localStorage.getItem('autoEdit_selectedStyleId');
    return saved ? parseInt(saved, 10) : null;
  });

  // All chapters for accurate prompt length calculation
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);

  // Track selected prefill key for persistence
  const [selectedPrefillKey, setSelectedPrefillKey] = useState<string>(() => {
    return localStorage.getItem('autoEdit_selectedPrefillKey') || '修改';
  });

  // Load prefills from backend on mount
  useEffect(() => {
    const loadPrefills = async () => {
      try {
        const { aiApi } = await import('../../services/api');
        const response = await aiApi.getPrefills();
        setPrefills(response.data.prefills);
        // Use saved prefill key or default to '修改'
        const savedKey = localStorage.getItem('autoEdit_selectedPrefillKey') || '修改';
        setEditRequirement(response.data.prefills[savedKey] || response.data.prefills['修改'] || '');
      } catch (error) {
        console.error('Failed to load prefills:', error);
        setPrefills({});
      } finally {
        setIsLoadingPrefills(false);
      }
    };
    loadPrefills();
  }, []);

  // Load writing styles when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadStyles = async () => {
        try {
          const { stylesApi } = await import('../../services/api');
          const response = await stylesApi.list();
          // Handle both paginated and non-paginated responses
          const stylesList = Array.isArray(response.data) ? response.data : ((response.data as any)?.results || []);
          setStyles(stylesList);
        } catch (error) {
          console.error('Failed to load styles:', error);
          setStyles([]);
        }
      };
      loadStyles();
    }
  }, [isOpen]);

  // Load all chapters when modal opens for accurate prompt length calculation
  useEffect(() => {
    if (isOpen && work?.id) {
      const loadChapters = async () => {
        try {
          const { chaptersApi } = await import('../../services/api');
          const response = await chaptersApi.list(work.id);
          setAllChapters(response.data);
        } catch (error) {
          console.error('Failed to load chapters:', error);
          setAllChapters([]);
        }
      };
      loadChapters();
    }
  }, [isOpen, work?.id]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && !isLoadingPrefills) {
      setOriginalText(initialOriginalText);
      setEditedVersions([]);
      setCurrentVersionIndex(-1);
      setCurrentEditedText('');
      setIsGenerating(false);
      setEditRequirement(prefills[selectedPrefillKey] || prefills['修改'] || '');
      loadLoreEntries();
      preselectTriggeredLoreEntries();
    }
  }, [isOpen, initialOriginalText, isLoadingPrefills, prefills]);

  // Update edit requirement when prefill selection changes (without resetting modal)
  useEffect(() => {
    if (isOpen && !isLoadingPrefills) {
      setEditRequirement(prefills[selectedPrefillKey] || prefills['修改'] || '');
    }
  }, [selectedPrefillKey, isOpen, isLoadingPrefills, prefills]);

  // Load lore entries for the work
  const loadLoreEntries = async () => {
    try {
      const { loreApi } = await import('../../services/api');
      const response = await loreApi.list(work.id);
      const data = response.data;

      // Handle both array and paginated response formats
      if (Array.isArray(data)) {
        setLoreEntries(data);
      } else if ((data as any).results && Array.isArray((data as any).results)) {
        setLoreEntries((data as any).results);
      } else {
        console.warn('Unexpected lore entries format:', data);
        setLoreEntries([]);
      }
    } catch (error) {
      console.error('Failed to load lore entries:', error);
      setLoreEntries([]);
    }
  };

  // Preselect lore entries triggered by original text
  const preselectTriggeredLoreEntries = () => {
    const triggeredIds: number[] = [];
    loreEntries.forEach(entry => {
      const allTriggers = [...entry.triggers, ...entry.extra_triggers];
      const isTriggered = allTriggers.some(trigger =>
        initialOriginalText.includes(trigger)
      );
      if (isTriggered) {
        triggeredIds.push(entry.id);
      }
    });
    setSelectedLoreIds(triggeredIds);
  };

  useEffect(() => {
    if (loreEntries.length > 0) {
      preselectTriggeredLoreEntries();
    }
  }, [loreEntries, initialOriginalText]);

  // Real-time trigger detection as user types in originalText
  useEffect(() => {
    if (loreEntries.length === 0) return;

    const newTriggeredIds: number[] = [];
    loreEntries.forEach(entry => {
      const allTriggers = [...entry.triggers, ...entry.extra_triggers];
      const isTriggered = allTriggers.some(trigger =>
        originalText.includes(trigger)
      );
      if (isTriggered) {
        newTriggeredIds.push(entry.id);
      }
    });

    // Find newly triggered entries (not already selected)
    const newlyTriggered = newTriggeredIds.filter(id => !selectedLoreIds.includes(id));

    if (newlyTriggered.length > 0) {
      // Auto-select newly triggered entries (silently, without opening panel)
      setSelectedLoreIds(prev => [...new Set([...prev, ...newlyTriggered])]);
    }
  }, [originalText, loreEntries]);

  // Handle generate auto edit
  const handleGenerateEdit = async () => {
    if (isGenerating) {
      // Stop current generation - abort the request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Clean up the current version's text
      const cleanedText = cleanAutoEditOutput(accumulatedTextRef.current);
      setCurrentEditedText(cleanedText);
      setEditedVersions(prev => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1] = { ...updated[updated.length - 1], text: cleanedText };
        }
        return updated;
      });

      setIsGenerating(false);
      return;
    }

    setIsGenerating(true);
    setCurrentEditedText(''); // Clear current text
    accumulatedTextRef.current = ''; // Reset accumulated text ref

    // Create new version entry immediately before generation
    const newIndex = editedVersions.length;
    setEditedVersions(prev => [...prev, { text: '', timestamp: new Date() }]);
    setCurrentVersionIndex(newIndex);

    const context: AutoEditContext = {
      chapterSelection,
      customChapterCount: chapterSelection === 'custom' ? customChapterCount : undefined,
      selectedLoreEntries: selectedLoreIds,
      model: selectedModel,
      editRequirement: editRequirement.trim() || '修改',
      styleId: selectedStyleId || undefined,
      useSummaries: useSummaries
    };

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    await onGenerateEdit(
      originalText,
      context,
      (chunk: string) => {
        accumulatedTextRef.current += chunk;
        setCurrentEditedText(prev => prev + chunk);
      },
      () => {
        // On end - clean up text, version already exists
        const cleanedText = cleanAutoEditOutput(accumulatedTextRef.current);
        setCurrentEditedText(cleanedText);
        setEditedVersions(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = { ...updated[updated.length - 1], text: cleanedText };
          }
          return updated;
        });
        setIsGenerating(false);
        abortControllerRef.current = null;
      },
      (error: string) => {
        // On error - clean up version with whatever text we have
        console.error('Auto edit error:', error);
        const cleanedText = cleanAutoEditOutput(accumulatedTextRef.current);
        if (cleanedText.trim()) {
          setEditedVersions(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
              updated[updated.length - 1] = { ...updated[updated.length - 1], text: cleanedText };
            }
            return updated;
          });
        }
        setIsGenerating(false);
        abortControllerRef.current = null;
      },
      abortController.signal
    );
  };

  // Handle version navigation
  const handlePreviousVersion = () => {
    if (currentVersionIndex > 0) {
      const newIndex = currentVersionIndex - 1;
      setCurrentVersionIndex(newIndex);
      setCurrentEditedText(editedVersions[newIndex].text);
    }
  };

  const handleNextVersion = () => {
    if (currentVersionIndex < editedVersions.length - 1) {
      const newIndex = currentVersionIndex + 1;
      setCurrentVersionIndex(newIndex);
      setCurrentEditedText(editedVersions[newIndex].text);
    }
  };

  // Strip thought process from text (remove 【思考过程】 section)
  const stripThoughtProcess = (text: string): string => {
    // Remove everything between 【思考过程】 and 【回答】
    const thoughtPattern = /【思考过程】[\s\S]*?(?=【回答】|$)/g;
    let cleanedText = text.replace(thoughtPattern, '');

    // Remove 【回答】 marker if present
    cleanedText = cleanedText.replace(/【回答】\s*/g, '');

    return cleanedText.trim();
  };

  // Handle accept
  const handleAccept = () => {
    const cleanedText = stripThoughtProcess(currentEditedText);
    onAccept(cleanedText);
    onClose();
  };

  // Handle revert
  const handleRevert = () => {
    onRevert(originalText);
    onClose();
  };

  // Handle close - with confirmation if there's unsaved work
  const handleClose = () => {
    if (editedVersions.length > 0) {
      if (confirm('你有未保存的编辑内容。确定要关闭吗？')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Handle lore entry toggle
  const toggleLoreEntry = (id: number) => {
    setSelectedLoreIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Pagination for lore entries
  const safeLoreeEntries = Array.isArray(loreEntries) ? loreEntries : [];
  const totalLorePages = Math.ceil(safeLoreeEntries.length / LORE_PAGE_SIZE);
  const paginatedLoreEntries = safeLoreeEntries.slice(
    (loreCurrentPage - 1) * LORE_PAGE_SIZE,
    loreCurrentPage * LORE_PAGE_SIZE
  );

  // Calculate actual prompt character count using real data
  const calculatePromptLength = (): number => {
    let length = 0;

    // Add work synopsis (actual)
    if (work.synopsis) {
      length += work.synopsis.length + 20; // +20 for "作品大纲：" etc
    }

    // Add selected lore entries (actual)
    const selectedLore = safeLoreeEntries.filter(entry => selectedLoreIds.includes(entry.id));
    selectedLore.forEach(entry => {
      length += entry.name.length + entry.description.length + 30; // +30 for formatting
    });

    // Calculate previous chapters using actual word_count data
    const previousChapters = allChapters
      .filter(ch => ch.chapter_number < chapter.chapter_number)
      .sort((a, b) => b.chapter_number - a.chapter_number);

    let chaptersToInclude: Chapter[] = [];
    if (chapterSelection === 'none') {
      chaptersToInclude = [];
    } else if (chapterSelection === 'all') {
      chaptersToInclude = previousChapters;
    } else if (chapterSelection === 'past_3') {
      chaptersToInclude = previousChapters.slice(0, 3);
    } else if (chapterSelection === 'custom') {
      chaptersToInclude = previousChapters.slice(0, customChapterCount);
    }

    // Use actual word_count from fetched chapters
    if (useSummaries) {
      // Summaries are much shorter - use actual summary length or estimate
      chaptersToInclude.forEach(ch => {
        length += (ch.summary?.length || 200) + 50; // +50 for chapter title formatting
      });
    } else {
      chaptersToInclude.forEach(ch => {
        // word_count is Chinese characters, so length ≈ word_count
        // Add formatting overhead per chapter
        length += (ch.word_count || 0) + 50;
      });
    }

    // Add current chapter content (actual)
    length += chapter.content?.length || 0;

    // Add original text (actual)
    length += originalText.length;

    // Add edit requirement (actual)
    length += editRequirement.length;

    // Add system prompt and formatting overhead
    length += 500;

    return length;
  };

  const promptCharCount = calculatePromptLength();

  // Calculate actual number of previous chapters for display/validation
  const availablePreviousChapters = Math.max(0, chapter.chapter_number - 1);

  if (!isOpen) return null;

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-dark-surface flex flex-col">
        {/* Mobile Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-dark-text">
            {initialOriginalText ? '自动编辑' : 'AI 生成'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-dark-text-muted hover:text-dark-text transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        {/* Mobile Writing Style Selector */}
        <div className="px-4 py-2 border-b border-dark-border bg-dark-bg flex-shrink-0">
          <select
            value={selectedStyleId || ''}
            onChange={(e) => {
              const newStyleId = e.target.value ? parseInt(e.target.value) : null;
              setSelectedStyleId(newStyleId);
              if (newStyleId) {
                localStorage.setItem('autoEdit_selectedStyleId', newStyleId.toString());
              } else {
                localStorage.removeItem('autoEdit_selectedStyleId');
              }
            }}
            className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-dark-primary"
          >
            <option value="">无风格 (默认)</option>
            {styles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
        </div>

        {/* Mobile Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 提示词 (Original Text / Prompt) - Full Width */}
          <div>
            <label className="text-sm font-medium text-dark-text mb-2 block">
              {initialOriginalText ? '原始文本' : '提示词（可选）'}
            </label>
            <Textarea
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
              className="font-mono text-sm resize-none w-full"
              style={{ minHeight: '120px' }}
              placeholder={initialOriginalText ? "原始文本..." : "输入提示词来引导 AI 生成（可留空）..."}
            />
          </div>

          {/* 编辑指引 - Full Width */}
          <div>
            <label className="text-sm font-medium text-dark-text mb-2 block">
              编辑指引
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.keys(prefills).map(key => (
                <button
                  key={key}
                  onClick={() => {
                    setEditRequirement(prefills[key]);
                    setSelectedPrefillKey(key);
                    localStorage.setItem('autoEdit_selectedPrefillKey', key);
                  }}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    selectedPrefillKey === key
                      ? 'bg-dark-primary text-white'
                      : 'bg-dark-bg text-dark-text border border-dark-border'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
            <Textarea
              value={editRequirement}
              onChange={(e) => setEditRequirement(e.target.value)}
              className="font-mono text-sm resize-none w-full"
              style={{ minHeight: '80px' }}
              placeholder="输入编辑要求..."
              maxLength={50000}
            />
          </div>

          {/* 编辑文本 (Generated Text) - Full Width, Centered, Readable */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-dark-text">编辑文本</label>
              {/* Version Navigation */}
              {editedVersions.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePreviousVersion}
                    disabled={currentVersionIndex <= 0}
                    className="p-1 hover:bg-dark-bg rounded disabled:opacity-50"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-xs text-dark-text-muted">
                    {currentVersionIndex + 1}/{editedVersions.length}
                  </span>
                  <button
                    onClick={handleNextVersion}
                    disabled={currentVersionIndex >= editedVersions.length - 1}
                    className="p-1 hover:bg-dark-bg rounded disabled:opacity-50"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
            {/* Generated text box - full width, scrollable */}
            <Textarea
              value={currentEditedText}
              onChange={(e) => setCurrentEditedText(e.target.value)}
              className="font-mono text-sm resize-none w-full leading-relaxed"
              style={{ minHeight: '150px' }}
              placeholder={isGenerating ? "生成中..." : "编辑文本将在这里显示..."}
              disabled={isGenerating}
            />
          </div>
        </div>

        {/* Mobile Customize Overlay - Bottom Sheet Style (2/3 height) */}
        {showCustomize && (
          <>
            {/* Backdrop */}
            <div 
              className="absolute inset-0 z-50 bg-black/40"
              onClick={() => setShowCustomize(false)}
            />
            {/* Bottom Sheet */}
            <div className="absolute bottom-0 left-0 right-0 z-60 bg-dark-surface flex flex-col h-[66vh] rounded-t-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
                <h3 className="text-lg font-medium text-dark-text">自定义上下文</h3>
                <button
                  onClick={() => setShowCustomize(false)}
                  className="p-2 text-dark-text-muted hover:text-dark-text"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
              {/* Model Selection */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-dark-text mb-2">AI 模型</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={selectedModel === 'deepseek-chat'}
                      onChange={() => setSelectedModel('deepseek-chat')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">DeepSeek Chat（默认）</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={selectedModel === 'deepseek-reasoner'}
                      onChange={() => setSelectedModel('deepseek-reasoner')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">DeepSeek Reasoner</span>
                  </label>
                </div>
              </div>

              {/* Chapter Selection */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-dark-text mb-2">
                  章节选择 <span className="text-xs text-dark-text-muted">(可用: {availablePreviousChapters} 章)</span>
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'none'}
                      onChange={() => setChapterSelection('none')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">不使用前文</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'past_3'}
                      onChange={() => setChapterSelection('past_3')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">最近3章</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'all'}
                      onChange={() => setChapterSelection('all')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">所有前文 ({availablePreviousChapters} 章)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'custom'}
                      onChange={() => setChapterSelection('custom')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">自定义数量</span>
                  </label>
                  {chapterSelection === 'custom' && (
                    <div className="ml-6 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={availablePreviousChapters}
                        value={customChapterCount}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (isNaN(value)) {
                            setCustomChapterCount(0);
                          } else {
                            setCustomChapterCount(Math.min(Math.max(0, value), availablePreviousChapters));
                          }
                        }}
                        className="w-20 px-2 py-1 text-sm border border-dark-border rounded bg-dark-bg text-dark-text"
                      />
                    </div>
                  )}
                </div>
                {chapterSelection !== 'none' && (
                  <label className="flex items-center gap-2 mt-3 pt-3 border-t border-dark-border">
                    <input
                      type="checkbox"
                      checked={useSummaries}
                      onChange={(e) => setUseSummaries(e.target.checked)}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">使用摘要代替全文</span>
                  </label>
                )}
              </div>

              {/* Lore Entries */}
              <div>
                <h4 className="text-sm font-medium text-dark-text mb-2">世界观条目</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {paginatedLoreEntries.map(entry => (
                    <label
                      key={entry.id}
                      className="flex items-start gap-2 p-2 bg-dark-bg rounded border border-dark-border cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLoreIds.includes(entry.id)}
                        onChange={() => toggleLoreEntry(entry.id)}
                        className="mt-0.5"
                      />
                      <span className="text-xs text-dark-text line-clamp-2">{entry.name}</span>
                    </label>
                  ))}
                </div>
                {totalLorePages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setLoreCurrentPage(p => Math.max(1, p - 1))}
                      disabled={loreCurrentPage === 1}
                      className="px-2 py-1 border border-dark-border rounded disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-dark-text-muted">
                      {loreCurrentPage} / {totalLorePages}
                    </span>
                    <button
                      onClick={() => setLoreCurrentPage(p => Math.min(totalLorePages, p + 1))}
                      disabled={loreCurrentPage === totalLorePages}
                      className="px-2 py-1 border border-dark-border rounded disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 p-4 border-t border-dark-border">
              <Button onClick={() => setShowCustomize(false)} className="w-full">
                完成
              </Button>
            </div>
          </div>
          </>
        )}

        {/* Mobile Bottom Action Bar - Icon Only */}
        <div className="flex-shrink-0 border-t border-dark-border bg-dark-bg px-3 py-2 safe-area-bottom">
          <div className="flex items-center justify-between">
            {/* Left: Customize + Prompt Length */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCustomize(true)}
                className="p-2 rounded border border-dark-border text-dark-text-muted hover:text-dark-text hover:border-dark-primary transition-colors"
                title="自定义"
              >
                <Settings size={20} />
              </button>
              <div className="flex flex-col items-center text-xs text-dark-text-muted">
                <span>提示词长度</span>
                <span className="font-medium text-dark-text">{promptCharCount.toLocaleString()}</span>
              </div>
            </div>

            {/* Middle: Generate */}
            <div>
              {!isGenerating ? (
                <button
                  onClick={handleGenerateEdit}
                  className="p-2 rounded bg-dark-primary text-white hover:bg-dark-primary/80 transition-colors"
                  title={initialOriginalText ? '自动编辑' : 'AI 生成'}
                >
                  <Wand2 size={20} />
                </button>
              ) : (
                <button
                  onClick={handleGenerateEdit}
                  className="p-2 rounded border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                  title="停止生成"
                >
                  <Square size={20} />
                </button>
              )}
            </div>

            {/* Right: Revert + Accept */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleRevert}
                className="p-2 rounded border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                title="还原"
              >
                <RotateCcw size={20} />
              </button>
              <button
                onClick={handleAccept}
                disabled={!currentEditedText.trim()}
                className="p-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="接受"
              >
                <Check size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout (unchanged)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-dark-surface rounded-lg shadow-xl border border-dark-border max-w-7xl w-full mx-4 h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border flex-shrink-0">
          <h2 className="text-xl font-semibold text-dark-text">
            {initialOriginalText ? '自动编辑' : 'AI 生成文本'}
          </h2>
          <button
            onClick={handleClose}
            className="text-dark-text-muted hover:text-dark-text transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Writing Style Selector */}
        <div className="px-6 py-3 border-b border-dark-border bg-dark-bg flex-shrink-0">
          <label className="flex items-center gap-3">
            <span className="text-sm font-medium text-dark-text">写作风格:</span>
            <select
              value={selectedStyleId || ''}
              onChange={(e) => {
                const newStyleId = e.target.value ? parseInt(e.target.value) : null;
                setSelectedStyleId(newStyleId);
                if (newStyleId) {
                  localStorage.setItem('autoEdit_selectedStyleId', newStyleId.toString());
                } else {
                  localStorage.removeItem('autoEdit_selectedStyleId');
                }
              }}
              className="flex-1 bg-dark-surface border border-dark-border rounded px-3 py-1.5 text-sm text-dark-text focus:outline-none focus:ring-2 focus:ring-dark-primary"
            >
              <option value="">无风格 (默认)</option>
              {styles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Customize Panel (Left) */}
          {showCustomize && (
            <div className="w-80 border-r border-dark-border p-4 overflow-y-auto">
              <h3 className="text-lg font-medium text-dark-text mb-4">自定义上下文</h3>

              {/* Model Selection */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-dark-text mb-2">AI 模型</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={selectedModel === 'deepseek-chat'}
                      onChange={() => setSelectedModel('deepseek-chat')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">DeepSeek Chat（默认）</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={selectedModel === 'deepseek-reasoner'}
                      onChange={() => setSelectedModel('deepseek-reasoner')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">DeepSeek Reasoner（推理模型）</span>
                  </label>
                </div>
              </div>

              {/* Chapter Selection */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-dark-text mb-2">
                  章节选择 <span className="text-xs text-dark-text-muted">(可用前文: {availablePreviousChapters} 章)</span>
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'none'}
                      onChange={() => setChapterSelection('none')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">不使用前文章节</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'past_3'}
                      onChange={() => setChapterSelection('past_3')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">最近3章</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'all'}
                      onChange={() => setChapterSelection('all')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">所有前文章节 ({availablePreviousChapters} 章)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={chapterSelection === 'custom'}
                      onChange={() => setChapterSelection('custom')}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">自定义数量</span>
                  </label>
                  {chapterSelection === 'custom' && (
                    <div className="ml-6 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={availablePreviousChapters}
                        value={customChapterCount}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (isNaN(value)) {
                            setCustomChapterCount(0);
                          } else {
                            setCustomChapterCount(Math.min(Math.max(0, value), availablePreviousChapters));
                          }
                        }}
                        className="w-20 px-2 py-1 text-sm border border-dark-border rounded bg-dark-bg text-dark-text"
                      />
                      <span className="text-xs text-dark-text-muted">(0-{availablePreviousChapters})</span>
                    </div>
                  )}
                </div>

                {/* Use Summaries Toggle */}
                {chapterSelection !== 'none' && (
                  <label className="flex items-center gap-2 mt-3 pt-3 border-t border-dark-border">
                    <input
                      type="checkbox"
                      checked={useSummaries}
                      onChange={(e) => setUseSummaries(e.target.checked)}
                      className="text-dark-primary"
                    />
                    <span className="text-sm text-dark-text">使用章节摘要代替全文</span>
                    <span className="text-xs text-dark-text-muted">(减少token用量)</span>
                  </label>
                )}
              </div>

              {/* Lore Entries Selection */}
              <div>
                <h4 className="text-sm font-medium text-dark-text mb-2">世界观条目</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {paginatedLoreEntries.map(entry => (
                    <label
                      key={entry.id}
                      className="flex items-start gap-2 p-2 bg-dark-bg rounded border border-dark-border hover:border-dark-primary transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLoreIds.includes(entry.id)}
                        onChange={() => toggleLoreEntry(entry.id)}
                        className="mt-0.5"
                      />
                      <span className="text-xs text-dark-text line-clamp-2">{entry.name}</span>
                    </label>
                  ))}
                </div>

                {/* Pagination */}
                {totalLorePages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setLoreCurrentPage(p => Math.max(1, p - 1))}
                      disabled={loreCurrentPage === 1}
                      className="px-2 py-1 text-xs border border-dark-border rounded disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-dark-text-muted">
                      {loreCurrentPage} / {totalLorePages}
                    </span>
                    <button
                      onClick={() => setLoreCurrentPage(p => Math.min(totalLorePages, p + 1))}
                      disabled={loreCurrentPage === totalLorePages}
                      className="px-2 py-1 text-xs border border-dark-border rounded disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Auto Edit Panel */}
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            {/* Text Boxes */}
            <div className="flex gap-4 mb-4" style={{ height: 'calc(100% - 80px)' }}>
              {/* Original Text (Left) */}
              <div className="flex-1 flex flex-col min-w-0">
                <label className="text-sm font-medium text-dark-text mb-2 flex-shrink-0">
                  {initialOriginalText ? '原始文本' : '提示词（可选）'}
                </label>
                <Textarea
                  value={originalText}
                  onChange={(e) => setOriginalText(e.target.value)}
                  className="font-mono text-sm resize-none"
                  style={{ minHeight: '200px', height: '66%' }}
                  placeholder={initialOriginalText ? "原始文本..." : "输入提示词来引导 AI 生成（可留空）..."}
                />

                {/* Editing Guide Section */}
                <div className="mt-3 flex-shrink-0" style={{ height: '30%' }}>
                  <label className="text-sm font-medium text-dark-text mb-2 block">
                    编辑指引
                  </label>
                  <div className="flex gap-2 mb-2">
                    {Object.keys(prefills).map(key => (
                      <button
                        key={key}
                        onClick={() => {
                          setEditRequirement(prefills[key]);
                          setSelectedPrefillKey(key);
                          localStorage.setItem('autoEdit_selectedPrefillKey', key);
                        }}
                        className={`px-3 py-1 text-sm rounded transition-colors ${
                          selectedPrefillKey === key
                            ? 'bg-dark-primary text-white'
                            : 'bg-dark-bg text-dark-text border border-dark-border hover:border-dark-primary'
                        }`}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={editRequirement}
                    onChange={(e) => setEditRequirement(e.target.value)}
                    className="font-mono text-sm resize-none h-full"
                    placeholder="输入编辑要求..."
                    maxLength={50000}
                  />
                </div>
              </div>

              {/* Edited Text (Right) */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <label className="text-sm font-medium text-dark-text">编辑文本</label>
                  {/* Version Navigation */}
                  {editedVersions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePreviousVersion}
                        disabled={currentVersionIndex <= 0}
                        className="p-1 hover:bg-dark-bg rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title="上一个版本"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="text-xs text-dark-text-muted">
                        {currentVersionIndex + 1} / {editedVersions.length}
                      </span>
                      <button
                        onClick={handleNextVersion}
                        disabled={currentVersionIndex >= editedVersions.length - 1}
                        className="p-1 hover:bg-dark-bg rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        title="下一个版本"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  )}
                </div>
                <Textarea
                  value={currentEditedText}
                  onChange={(e) => setCurrentEditedText(e.target.value)}
                  className="flex-1 font-mono text-sm resize-none"
                  style={{ minHeight: '400px', height: '100%' }}
                  placeholder={isGenerating ? "生成中..." : "编辑文本将在这里显示..."}
                  disabled={isGenerating}
                />
              </div>
            </div>

            {/* Bottom Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-dark-border">
              {/* Left: Customize and Character Count */}
              <div className="flex items-center gap-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCustomize(!showCustomize)}
                  className="flex items-center gap-2"
                >
                  <Settings size={16} />
                  自定义
                </Button>
                <div className="text-sm text-dark-text-muted">
                  提示词长度: <span className="font-medium text-dark-text">{promptCharCount.toLocaleString()}</span> 字符
                </div>
              </div>

              {/* Middle: Generate and Stop buttons */}
              <div className="flex items-center gap-2">
                {!isGenerating ? (
                  <Button
                    size="sm"
                    onClick={handleGenerateEdit}
                    className="flex items-center gap-2"
                  >
                    <Wand2 size={16} />
                    {initialOriginalText ? '自动编辑' : 'AI 生成'}
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={handleGenerateEdit}
                      variant="outline"
                      className="flex items-center gap-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                    >
                      <Square size={16} />
                      停止生成
                    </Button>
                    <div className="flex items-center gap-1 text-sm text-dark-text-muted">
                      <div className="animate-pulse">生成中...</div>
                    </div>
                  </>
                )}
              </div>

              {/* Right: Accept and Revert */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRevert}
                  className="flex items-center gap-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  <RotateCcw size={16} />
                  还原
                </Button>
                <Button
                  size="sm"
                  onClick={handleAccept}
                  disabled={!currentEditedText.trim()}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Check size={16} />
                  接受
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
