import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Wand2 } from 'lucide-react';
import { LoadingButton } from '../ui/Loading';
import { AutoEditModal, type AutoEditContext } from '../modals/AutoEditModal';
import { aiApi } from '../../services/api';
import { useUIStore } from '../../stores/useUIStore';
import type { Work, Chapter } from '../../types';

interface InteractiveEditorPanelProps {
  content: string;
  onChange: (content: string) => void;
  work: Work;
  chapter: Chapter;
  onSave?: (content?: string) => void;
  isMobile?: boolean;
  autoEditTriggerKey?: number;
  onActionModeChange?: (mode: 'auto_edit' | 'cyoa') => void;
}

type SegmentRole = 'user' | 'agent';

interface Segment {
  role: SegmentRole;
  content: string;
}

const DEFAULT_OPENING_AGENT_TEXT = '编辑这段文字以创造开场白';

const parseTaggedContent = (rawContent: string): Segment[] => {
  const content = rawContent || '';
  if (!content.trim()) {
    return [{ role: 'agent', content: DEFAULT_OPENING_AGENT_TEXT }];
  }

  const lines = content.split('\n');
  const segments: Segment[] = [];
  let currentRole: SegmentRole | null = null;
  let currentLines: string[] = [];

  const pushCurrent = () => {
    if (!currentRole) return;
    // Preserve content as-is, don't trim (preserves spaces and newlines)
    segments.push({
      role: currentRole,
      content: currentLines.join('\n'),
    });
  };

  for (const line of lines) {
    const userMatch = line.match(/^User:\s*(.*)$/i);
    const agentMatch = line.match(/^Agent:\s*(.*)$/i);
    if (userMatch || agentMatch) {
      pushCurrent();
      currentRole = userMatch ? 'user' : 'agent';
      currentLines = [userMatch ? userMatch[1] : (agentMatch?.[1] || '')];
      continue;
    }
    if (!currentRole) {
      currentRole = 'agent';
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  pushCurrent();

  return segments.length > 0 ? segments : [{ role: 'agent', content }];
};

const serializeSegments = (segments: Segment[]): string => {
  const normalized = segments
    .map((s) => ({ ...s, content: s.content ?? '' }))
    .filter((s, idx, arr) => s.content.trim() || idx < arr.length - 1);
  return normalized
    .map((segment) => `${segment.role === 'user' ? 'User' : 'Agent'}: ${segment.content}`)
    .join('\n\n');
};

const calcWordCount = (text: string): number => {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = text
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.trim()).length;
  return chineseChars + englishWords;
};

export const InteractiveEditorPanel: React.FC<InteractiveEditorPanelProps> = ({
  content,
  onChange,
  work,
  chapter,
  onSave,
  isMobile = false,
  autoEditTriggerKey,
  onActionModeChange,
}) => {
  const [segments, setSegments] = useState<Segment[]>(() => parseTaggedContent(content));
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [selectedText, setSelectedText] = useState('');
  const [showAutoEditModal, setShowAutoEditModal] = useState(false);
  const [modalMode, setModalMode] = useState<'auto_edit' | 'cyoa'>('cyoa');
  const [autoEditOriginalText, setAutoEditOriginalText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetSegmentIndex, setTargetSegmentIndex] = useState(0);
  const lastHandledAutoEditTriggerRef = useRef<number | null>(null);
  const latestCyoaPromptRef = useRef('');
  const isInternalUpdateRef = useRef(false); // Track if update is from local editing
  const textareaRefs = useRef<{ [key: number]: HTMLTextAreaElement | null }>({});

  const { addNotification } = useUIStore();

  // Auto-resize textarea based on content
  const adjustTextareaHeight = (textarea: HTMLTextAreaElement | null, preserveScroll = false) => {
    if (!textarea) return;
    
    // Save scroll position if needed
    const scrollContainer = textarea.closest('.overflow-y-auto');
    let scrollTop = 0;
    if (preserveScroll && scrollContainer) {
      scrollTop = scrollContainer.scrollTop;
    }
    
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 500;
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    
    // Restore scroll position
    if (preserveScroll && scrollContainer) {
      scrollContainer.scrollTop = scrollTop;
    }
  };

  useEffect(() => {
    // Only re-parse if the change came from external source (not from local editing)
    if (!isInternalUpdateRef.current) {
      setSegments(parseTaggedContent(content));
    }
    // Reset the flag after processing
    isInternalUpdateRef.current = false;
  }, [content]);

  useEffect(() => {
    if (activeSegmentIndex >= segments.length) {
      setActiveSegmentIndex(Math.max(segments.length - 1, 0));
    }
  }, [segments, activeSegmentIndex]);

  // Adjust all textarea heights when segments change
  useEffect(() => {
    requestAnimationFrame(() => {
      Object.values(textareaRefs.current).forEach((textarea) => {
        if (textarea) {
          adjustTextareaHeight(textarea, true);
        }
      });
    });
  }, [segments.length]); // Only when number of segments changes (new segments added/removed)

  const hasSelection = selectedText.length > 0;

  useEffect(() => {
    onActionModeChange?.(hasSelection ? 'auto_edit' : 'cyoa');
  }, [hasSelection, onActionModeChange]);

  const syncSegments = (updated: Segment[]) => {
    setSegments(updated);
    // Mark as internal update to prevent re-parsing
    isInternalUpdateRef.current = true;
    onChange(serializeSegments(updated));
  };

  const handleSegmentContentChange = (index: number, newValue: string) => {
    const updated = [...segments];
    updated[index] = { ...updated[index], content: newValue };
    syncSegments(updated);
    // Adjust height after content changes
    requestAnimationFrame(() => {
      adjustTextareaHeight(textareaRefs.current[index], true);
    });
  };

  const handleDeleteSegment = (index: number) => {
    const ok = window.confirm('确认删除这个对话块吗？');
    if (!ok) return;

    const updated = segments.filter((_, i) => i !== index);
    if (updated.length === 0) {
      const fallback = [{ role: 'agent' as const, content: DEFAULT_OPENING_AGENT_TEXT }];
      syncSegments(fallback);
      onSave?.(serializeSegments(fallback));
      setActiveSegmentIndex(0);
      setSelectedText('');
      setSelectionStart(0);
      setSelectionEnd(0);
      return;
    }
    syncSegments(updated);
    onSave?.(serializeSegments(updated));
    setActiveSegmentIndex(Math.max(0, Math.min(activeSegmentIndex, updated.length - 1)));
    setSelectedText('');
    setSelectionStart(0);
    setSelectionEnd(0);
  };

  const handleSmartAction = () => {
    const useAutoEdit = hasSelection;
    setModalMode(useAutoEdit ? 'auto_edit' : 'cyoa');
    setTargetSegmentIndex(activeSegmentIndex);
    setAutoEditOriginalText(useAutoEdit ? selectedText : '');
    if (!useAutoEdit) {
      latestCyoaPromptRef.current = '';
    }
    setShowAutoEditModal(true);
  };

  useEffect(() => {
    if (typeof autoEditTriggerKey !== 'number') return;
    if (lastHandledAutoEditTriggerRef.current === null) {
      lastHandledAutoEditTriggerRef.current = autoEditTriggerKey;
      return;
    }
    if (lastHandledAutoEditTriggerRef.current === autoEditTriggerKey) return;
    lastHandledAutoEditTriggerRef.current = autoEditTriggerKey;
    handleSmartAction();
  }, [autoEditTriggerKey, hasSelection, activeSegmentIndex, selectedText]);

  const handleGenerateEdit = async (
    originalText: string,
    context: AutoEditContext,
    onChunk: (chunk: string) => void,
    onEnd: () => void,
    onError: (error: string) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    try {
      setIsGenerating(true);
      if (modalMode === 'cyoa') {
        latestCyoaPromptRef.current = originalText.trim();
      }
      await aiApi.autoEditStream(
        work.id,
        chapter.id,
        originalText,
        context,
        onChunk,
        () => undefined,
        () => {
          setIsGenerating(false);
          onEnd();
        },
        (error: string) => {
          setIsGenerating(false);
          onError(error);
        },
        signal
      );
    } finally {
      // Guard against stale loading state if stream exits unexpectedly.
      setIsGenerating(false);
    }
  };

  const handleAccept = (editedText: string) => {
    const trimmedEditedText = editedText.trim();
    if (!trimmedEditedText) return;

    if (modalMode === 'cyoa') {
      const promptText = latestCyoaPromptRef.current.trim();
      if (!promptText) {
        addNotification({
          type: 'info',
          message: '请先输入你的行动或指令，再确认 CYOA 结果',
        });
        return;
      }
      const nextSegments = [
        ...segments,
        { role: 'user' as const, content: promptText },
        { role: 'agent' as const, content: trimmedEditedText },
      ];
      syncSegments(nextSegments);
      setActiveSegmentIndex(nextSegments.length - 1);
      setSelectedText('');
      setSelectionStart(0);
      setSelectionEnd(0);
      onSave?.(serializeSegments(nextSegments));
      return;
    }

    if (targetSegmentIndex < 0 || targetSegmentIndex >= segments.length) {
      return;
    }

    const target = segments[targetSegmentIndex];
    const replacedContent =
      target.content.slice(0, selectionStart) +
      trimmedEditedText +
      target.content.slice(selectionEnd);
    const updated = [...segments];
    updated[targetSegmentIndex] = { ...target, content: replacedContent };
    syncSegments(updated);
    setSelectedText('');
    setSelectionStart(0);
    setSelectionEnd(0);
    onSave?.(serializeSegments(updated));
    // Adjust height after content replacement
    requestAnimationFrame(() => {
      adjustTextareaHeight(textareaRefs.current[targetSegmentIndex], true);
    });
  };

  const handleRevert = () => undefined;

  const actionText = hasSelection ? '局部自动编辑（Auto Edit）' : '剧情推进（CYOA）';
  const actionHint = hasSelection
    ? '已选中文本：确认后会替换当前框的选区'
    : '未选中文本：确认后会追加 User/Agent 新回合';
  const serializedContent = useMemo(() => serializeSegments(segments), [segments]);
  const totalWords = calcWordCount(serializedContent);

  return (
    <div className={`h-full flex flex-col bg-dark-bg ${isMobile ? 'pb-[60px]' : ''}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarGutter: 'stable' }}>
        {segments.map((segment, idx) => (
          <div
            key={`${segment.role}-${idx}`}
            className={`rounded-lg border ${
              idx === activeSegmentIndex ? 'border-dark-primary' : 'border-dark-border'
            } ${
              idx === 0 && segment.role === 'agent'
                ? 'bg-black'
                : (segment.role === 'user' ? 'bg-blue-900/20' : 'bg-purple-900/20')
            }`}
          >
            <div className="px-3 py-2 text-xs font-semibold text-dark-text-muted border-b border-dark-border flex items-center justify-between">
              <span>{segment.role === 'user' ? 'User' : 'Agent'}</span>
              <button
                onClick={() => handleDeleteSegment(idx)}
                className="p-1 rounded hover:bg-dark-surface/50 text-dark-text-muted hover:text-red-400"
                title="删除此块"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              ref={(el) => {
                textareaRefs.current[idx] = el;
              }}
              value={segment.content}
              onFocus={() => {
                setActiveSegmentIndex(idx);
              }}
              onClick={(e) => {
                const target = e.target as HTMLTextAreaElement;
                setActiveSegmentIndex(idx);
                if (target.selectionStart === target.selectionEnd) {
                  setSelectedText('');
                }
              }}
              onChange={(e) => handleSegmentContentChange(idx, e.target.value)}
              onSelect={(e) => {
                const target = e.target as HTMLTextAreaElement;
                const start = target.selectionStart;
                const end = target.selectionEnd;
                setActiveSegmentIndex(idx);
                if (start !== end) {
                  setSelectedText(target.value.slice(start, end));
                  setSelectionStart(start);
                  setSelectionEnd(end);
                } else {
                  setSelectedText('');
                }
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault();
                  onSave?.();
                }
              }}
              className="w-full p-3 bg-transparent text-dark-text outline-none resize-none overflow-y-auto"
              style={{ minHeight: '40px', maxHeight: '500px' }}
              rows={1}
              placeholder={segment.role === 'user' ? '输入玩家输入...' : 'Agent 输出...'}
            />
          </div>
        ))}
      </div>

      <div
        className={`flex-shrink-0 border-t border-dark-border bg-dark-surface ${isMobile ? 'fixed left-0 right-0 z-20' : ''}`}
        style={isMobile ? { bottom: '60px' } : undefined}
      >
        <div className={`py-2 border-b border-dark-border h-[48px] flex items-center ${isMobile ? 'px-3' : 'px-6'}`}>
          <div className="flex items-center justify-between text-sm text-dark-text-muted w-full gap-3">
            <div className="flex items-center gap-4 overflow-hidden">
              <span>字数: {totalWords.toLocaleString()}</span>
              <span className="truncate">{actionHint}</span>
            </div>
            <LoadingButton
              isLoading={isGenerating}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSmartAction}
              className="flex items-center gap-1 px-3 py-1 text-xs"
            >
              <Wand2 size={14} />
              {actionText}
            </LoadingButton>
          </div>
        </div>
      </div>

      {showAutoEditModal && (
        <AutoEditModal
          isOpen={showAutoEditModal}
          onClose={() => setShowAutoEditModal(false)}
          originalText={autoEditOriginalText}
          work={work}
          chapter={chapter}
          onAccept={handleAccept}
          onRevert={handleRevert}
          onGenerateEdit={handleGenerateEdit}
          isMobile={isMobile}
          mode={modalMode}
          modeLabel={modalMode === 'cyoa' ? '剧情推进模式（CYOA）' : '局部编辑模式（Auto Edit）'}
        />
      )}
    </div>
  );
};
