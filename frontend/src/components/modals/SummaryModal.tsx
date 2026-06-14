import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, FileText, Sparkles, Zap } from 'lucide-react';
import { chaptersApi, aiApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { appendAnswerOnlyChunk, stripThoughtProcess } from '../../utils/stripThoughtProcess';
import type { Chapter } from '../../types';

interface SummaryModalProps {
  chapter: Chapter | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  chapter,
  isOpen,
  onClose
}) => {
  const [summary, setSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamEventSource, setStreamEventSource] = useState<EventSource | null>(null);
  const accumulatedRef = useRef('');
  const queryClient = useQueryClient();
  const { data: chapterDetail } = useQuery({
    queryKey: ['chapter', chapter?.work, chapter?.id, 'summary-modal'],
    queryFn: async () => {
      if (!chapter) return null;
      const response = await chaptersApi.get(chapter.work, chapter.id);
      return response.data;
    },
    enabled: isOpen && !!chapter,
  });

  const effectiveChapter = chapterDetail || chapter;
  const effectiveContent = effectiveChapter?.content || '';

  useEffect(() => {
    if (chapter && isOpen) {
      setSummary((chapterDetail?.summary ?? chapter.summary) || '');
    }
  }, [chapter, chapterDetail, isOpen]);

  useEffect(() => {
    return () => {
      if (streamEventSource) {
        streamEventSource.close();
      }
    };
  }, [streamEventSource]);

  const updateMutation = useMutation({
    mutationFn: (summaryData: { summary: string }) =>
      chaptersApi.update(chapter!.work, chapter!.id, summaryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', chapter!.work] });
    }
  });

  const handleSave = () => {
    if (chapter) {
      updateMutation.mutate({ summary: summary.trim() });
    }
  };

  const handleGenerate = () => {
    if (!chapter || isStreaming) return;

    try {
      setIsGenerating(true);
      setIsStreaming(true);
      setSummary('');
      accumulatedRef.current = '';

      const eventSource = aiApi.summarizeStream(
        chapter.work,
        chapter.id,
        (chunk: string) => {
          accumulatedRef.current = appendAnswerOnlyChunk(accumulatedRef.current, chunk);
          setSummary(accumulatedRef.current);
        },
        () => {},
        (finalSummary: string) => {
          const cleaned = stripThoughtProcess(finalSummary);
          accumulatedRef.current = cleaned;
          setSummary(cleaned);
          setIsStreaming(false);
          setIsGenerating(false);
          setStreamEventSource(null);
        },
        (error: string) => {
          setIsStreaming(false);
          setIsGenerating(false);
          setStreamEventSource(null);
          setSummary(`摘要生成失败: ${error}`);
        }
      );

      setStreamEventSource(eventSource);
    } catch (error) {
      console.error('AI summary error:', error);
      setIsGenerating(false);
      setIsStreaming(false);
      setSummary('摘要生成连接失败，请稍后重试');
    }
  };

  const handleCancelStreaming = () => {
    if (streamEventSource) {
      streamEventSource.close();
      setStreamEventSource(null);
    }
    setIsStreaming(false);
    setIsGenerating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isStreaming) {
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isStreaming) {
      handleSave();
    }
  };

  if (!isOpen || !chapter) return null;

  const MIN_CHAPTER_WORDS = 1000;
  const chapterWordCount = effectiveContent.length;
  const hasEnoughWords = chapterWordCount >= MIN_CHAPTER_WORDS;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-dark-primary" />
              <div>
                <h3 className="text-lg font-semibold text-dark-text">章节摘要</h3>
                <p className="text-sm text-dark-text-muted">
                  第{chapter.chapter_number}章 {chapter.title}
                  <span className="ml-2 text-dark-text-muted">({chapterWordCount.toLocaleString()}字)</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isStreaming}
              className="text-dark-text-muted hover:text-dark-text disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-text">
              摘要内容
            </label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入章节摘要，或点击生成按钮让AI自动生成..."
              rows={8}
              className="resize-none"
              autoFocus
              disabled={isStreaming}
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating || !effectiveContent || !hasEnoughWords}
                className="flex items-center gap-2"
              >
                {isStreaming ? (
                  <>
                    <Zap size={16} className="animate-pulse text-yellow-400" />
                    流式生成中...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    AI生成摘要
                  </>
                )}
              </Button>

              {isStreaming && (
                <Button
                  variant="outline"
                  onClick={handleCancelStreaming}
                  className="flex items-center gap-1 px-3 py-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                >
                  <X size={14} />
                  取消
                </Button>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isStreaming}
              >
                关闭
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending || isStreaming}
              >
                {updateMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>

          {!effectiveContent && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
              <p className="text-sm text-yellow-300">
                章节内容为空，AI无法生成摘要。请先编写章节内容。
              </p>
            </div>
          )}

          {effectiveContent && !hasEnoughWords && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
              <p className="text-sm text-yellow-300">
                章节字数不足，需要至少{MIN_CHAPTER_WORDS.toLocaleString()}字才能生成摘要（当前{chapterWordCount.toLocaleString()}字）
              </p>
            </div>
          )}

          <div className="text-xs text-dark-text-muted border-t pt-3">
            <p>快捷键：Ctrl/Cmd + Enter 保存，Esc 关闭（生成中不可用）</p>
            <p className="mt-1">提示：AI生成后不会自动保存，请点击“保存”后生效</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
