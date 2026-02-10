import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, FileText, Sparkles, Zap } from 'lucide-react';
import { chaptersApi, aiApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import type { Chapter } from '../../types';

interface SummaryModalProps {
  chapter: Chapter | null;
  isOpen: boolean;
  onClose: () => void;
  onSummaryUpdated: (summary: string) => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  chapter,
  isOpen,
  onClose,
  onSummaryUpdated
}) => {
  const [summary, setSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamEventSource, setStreamEventSource] = useState<EventSource | null>(null);

  useEffect(() => {
    if (chapter) {
      setSummary(chapter.summary || '');
    }
  }, [chapter]);

  // Cleanup on component unmount
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
      // Don't call onSummaryUpdated here to prevent modal closing
      // onSummaryUpdated(summary);
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
      
      // Clear current summary to show streaming progress
      setSummary('');
      
      let accumulatedSummary = '';
      
      const eventSource = aiApi.summarizeStream(
        chapter.work, 
        chapter.id,
        // onChunk - called for each piece of text
        (chunk: string) => {
          accumulatedSummary += chunk;
          setSummary(accumulatedSummary);
        },
        // onStart
        () => {
          console.log('AI summary streaming started');
        },
        // onEnd
        (finalSummary: string) => {
          console.log('AI summary streaming completed');
          setIsStreaming(false);
          setIsGenerating(false);
          setStreamEventSource(null);
          setSummary(finalSummary);
          // Call onSummaryUpdated to update parent component but don't close modal
          onSummaryUpdated(finalSummary);
        },
        // onError
        (error: string) => {
          console.error('AI summary streaming error:', error);
          setIsStreaming(false);
          setIsGenerating(false);
          setStreamEventSource(null);
          // Show error in summary field
          setSummary(`摘要生成失败: ${error}`);
        }
      );
      
      // Store eventSource reference for cleanup
      setStreamEventSource(eventSource);
      
    } catch (error) {
      console.error('AI summary error:', error);
      setIsGenerating(false);
      setIsStreaming(false);
      setSummary('摘要生成连接失败，请稍后重试');
    }
  };

  // Cancel streaming
  const handleCancelStreaming = () => {
    if (streamEventSource) {
      streamEventSource.close();
      setStreamEventSource(null);
    }
    setIsStreaming(false);
    setIsGenerating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  if (!isOpen || !chapter) return null;

  const MIN_CHAPTER_WORDS = 1000;
  const chapterWordCount = chapter.content?.length || 0;
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
              className="text-dark-text-muted hover:text-dark-text"
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
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating || !chapter.content || !hasEnoughWords}
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
              >
                关闭
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>

          {!chapter.content && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
              <p className="text-sm text-yellow-300">
                💡 章节内容为空，AI无法生成摘要。请先编写章节内容。
              </p>
            </div>
          )}

          {chapter.content && !hasEnoughWords && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
              <p className="text-sm text-yellow-300">
                💡 章节字数不足，需要至少{MIN_CHAPTER_WORDS.toLocaleString()}字才能生成摘要（当前{chapterWordCount.toLocaleString()}字）
              </p>
            </div>
          )}

          <div className="text-xs text-dark-text-muted border-t pt-3">
            <p>快捷键：Ctrl/Cmd + Enter 保存手动编辑，Esc 关闭</p>
            <p className="mt-1">提示：AI生成的摘要会自动保存</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};