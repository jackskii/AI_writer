import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Square, Wand2, Check, RotateCcw, Settings } from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
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
    onError: (error: string) => void
  ) => EventSource | null;
}

export interface AutoEditContext {
  chapterSelection: 'all' | 'past_3' | 'custom' | 'none';
  customChapterCount?: number;
  selectedLoreEntries: number[]; // IDs of selected lore entries
  model: 'deepseek-chat' | 'deepseek-reasoner';
  editRequirement?: string; // Editing requirement/instruction
  styleId?: number; // Optional writing style ID
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
  onGenerateEdit
}) => {
  // State for text boxes
  const [originalText, setOriginalText] = useState(initialOriginalText);
  const [editedVersions, setEditedVersions] = useState<AutoEditVersion[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1); // -1 means no version yet
  const [currentEditedText, setCurrentEditedText] = useState('');

  // State for streaming
  const [isGenerating, setIsGenerating] = useState(false);
  const [eventSourceRef, setEventSourceRef] = useState<EventSource | null>(null);

  // State for customize panel
  const [showCustomize, setShowCustomize] = useState(false);
  const [chapterSelection, setChapterSelection] = useState<'all' | 'past_3' | 'custom' | 'none'>('past_3');
  const [customChapterCount, setCustomChapterCount] = useState(3);
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
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);

  // Load prefills from backend on mount
  useEffect(() => {
    const loadPrefills = async () => {
      try {
        const { aiApi } = await import('../../services/api');
        const response = await aiApi.getPrefills();
        setPrefills(response.data.prefills);
        // Set default to '修改' prefill
        setEditRequirement(response.data.prefills['修改'] || '');
      } catch (error) {
        console.error('Failed to load prefills:', error);
        // Fallback to empty
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

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && !isLoadingPrefills) {
      setOriginalText(initialOriginalText);
      setEditedVersions([]);
      setCurrentVersionIndex(-1);
      setCurrentEditedText('');
      setIsGenerating(false);
      setEditRequirement(prefills['修改'] || '');
      loadLoreEntries();
      preselectTriggeredLoreEntries();
    }
  }, [isOpen, initialOriginalText, isLoadingPrefills, prefills]);

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

  // Handle generate auto edit
  const handleGenerateEdit = () => {
    if (isGenerating) {
      // Stop current generation
      if (eventSourceRef) {
        eventSourceRef.close();
        setEventSourceRef(null);
      }
      setIsGenerating(false);
      return;
    }

    setIsGenerating(true);
    setCurrentEditedText(''); // Clear current text

    const context: AutoEditContext = {
      chapterSelection,
      customChapterCount: chapterSelection === 'custom' ? customChapterCount : undefined,
      selectedLoreEntries: selectedLoreIds,
      model: selectedModel,
      editRequirement: editRequirement.trim() || '修改',
      styleId: selectedStyleId || undefined
    };

    const eventSource = onGenerateEdit(
      originalText,
      context,
      (chunk: string) => {
        setCurrentEditedText(prev => prev + chunk);
      },
      () => {
        // On end
        setIsGenerating(false);
        setEventSourceRef(null);

        // Add new version to list
        setEditedVersions(prev => {
          const newVersions = [...prev, { text: currentEditedText, timestamp: new Date() }];
          setCurrentVersionIndex(newVersions.length - 1);
          return newVersions;
        });
      },
      (error: string) => {
        // On error
        console.error('Auto edit error:', error);
        setIsGenerating(false);
        setEventSourceRef(null);
      }
    );

    if (eventSource) {
      setEventSourceRef(eventSource);
    }
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

  // Calculate estimated prompt character count
  const calculatePromptLength = (): number => {
    let length = 0;

    // Add work synopsis
    if (work.synopsis) {
      length += work.synopsis.length + 20; // +20 for "作品大纲：" etc
    }

    // Add selected lore entries
    const selectedLore = safeLoreeEntries.filter(entry => selectedLoreIds.includes(entry.id));
    selectedLore.forEach(entry => {
      length += entry.name.length + entry.description.length + 30; // +30 for formatting
    });

    // Calculate actual number of previous chapters available
    // chapter_number is 1-based, so previous chapters = chapter_number - 1
    const availablePreviousChapters = Math.max(0, chapter.chapter_number - 1);

    // Determine how many chapters will actually be included
    let chaptersToInclude = 0;
    if (chapterSelection === 'none') {
      chaptersToInclude = 0;
    } else if (chapterSelection === 'all') {
      chaptersToInclude = availablePreviousChapters;
    } else if (chapterSelection === 'past_3') {
      chaptersToInclude = Math.min(3, availablePreviousChapters);
    } else if (chapterSelection === 'custom') {
      chaptersToInclude = Math.min(customChapterCount, availablePreviousChapters);
    }

    // Estimate chapter content (5000 chars per chapter average)
    length += chaptersToInclude * 5000;

    // Add current chapter estimate (assume average chapter is ~5000 chars)
    length += 5000;

    // Add original text
    length += originalText.length;

    // Add system prompt and formatting overhead
    length += 500;

    return length;
  };

  const promptCharCount = calculatePromptLength();

  // Calculate actual number of previous chapters for display/validation
  const availablePreviousChapters = Math.max(0, chapter.chapter_number - 1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-dark-surface rounded-lg shadow-xl border border-dark-border max-w-7xl w-full mx-4 h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border flex-shrink-0">
          <h2 className="text-xl font-semibold text-dark-text">
            {initialOriginalText ? '自动编辑' : 'AI 生成文本'}
          </h2>
          <button
            onClick={onClose}
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
              onChange={(e) => setSelectedStyleId(e.target.value ? parseInt(e.target.value) : null)}
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
                        onClick={() => setEditRequirement(prefills[key])}
                        className={`px-3 py-1 text-sm rounded transition-colors ${
                          editRequirement === prefills[key]
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
