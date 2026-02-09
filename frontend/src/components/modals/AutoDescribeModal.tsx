import React, { useState, useEffect } from 'react';
import { X, Sparkles, Check } from 'lucide-react';
import { aiApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { LoadingSpinner } from '../ui/Loading';

interface ChapterInfo {
  id: number;
  chapter_number: number;
  title: string;
}

interface AutoDescribeModalProps {
  workId: number;
  entryName: string;
  originalDescription?: string;
  isOpen: boolean;
  onClose: () => void;
  onDescriptionGenerated: (description: string, usedChapters: ChapterInfo[]) => void;
}

export const AutoDescribeModal: React.FC<AutoDescribeModalProps> = ({
  workId,
  entryName,
  originalDescription = '',
  isOpen,
  onClose,
  onDescriptionGenerated
}) => {
  const [availableChapters, setAvailableChapters] = useState<ChapterInfo[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<number[]>([]);
  const [additionalContext, setAdditionalContext] = useState('');
  const [isUpdate, setIsUpdate] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDescription, setGeneratedDescription] = useState('');
  const [usedChapters, setUsedChapters] = useState<ChapterInfo[]>([]);
  const [error, setError] = useState('');

  // Load chapters when modal opens
  useEffect(() => {
    if (isOpen && entryName) {
      loadChapters();
      // Reset state
      setAdditionalContext('');
      setIsUpdate(false);
      setGeneratedDescription('');
      setUsedChapters([]);
      setError('');
    }
  }, [isOpen, entryName, workId]);

  const loadChapters = async () => {
    setIsLoadingChapters(true);
    setError('');
    try {
      const chapters = await aiApi.getChaptersWithEntry(workId, entryName);
      setAvailableChapters(chapters);
      // Select all chapters by default
      setSelectedChapterIds(chapters.map(ch => ch.id));
    } catch (err) {
      console.error('Failed to load chapters:', err);
      setError('加载章节失败');
    } finally {
      setIsLoadingChapters(false);
    }
  };

  const toggleChapter = (chapterId: number) => {
    setSelectedChapterIds(prev =>
      prev.includes(chapterId)
        ? prev.filter(id => id !== chapterId)
        : [...prev, chapterId]
    );
  };

  const selectAllChapters = () => {
    setSelectedChapterIds(availableChapters.map(ch => ch.id));
  };

  const deselectAllChapters = () => {
    setSelectedChapterIds([]);
  };

  const handleGenerate = async () => {
    if (selectedChapterIds.length === 0) {
      setError('请至少选择一个章节');
      return;
    }

    setIsGenerating(true);
    setGeneratedDescription('');
    setUsedChapters([]);
    setError('');

    try {
      await aiApi.autoDescribeEntry(
        workId,
        entryName,
        // onChunk
        (chunk: string) => {
          setGeneratedDescription(prev => prev + chunk);
        },
        // onStart
        (chapters) => {
          setUsedChapters(chapters as ChapterInfo[]);
        },
        // onEnd
        (description, chapters) => {
          setGeneratedDescription(description);
          setUsedChapters(chapters as ChapterInfo[]);
          setIsGenerating(false);
        },
        // onError
        (errorMsg: string) => {
          setError(errorMsg);
          setIsGenerating(false);
        },
        // options
        {
          chapterIds: selectedChapterIds,
          additionalContext: additionalContext.trim(),
          isUpdate: isUpdate,
          originalDescription: isUpdate ? originalDescription : ''
        }
      );
    } catch (err) {
      console.error('Failed to generate description:', err);
      setError('生成描述失败');
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    onDescriptionGenerated(generatedDescription, usedChapters);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-dark-text">
              AI自动描述 - {entryName}
            </h3>
            <button
              onClick={onClose}
              className="text-dark-text-muted hover:text-dark-text"
            >
              <X size={20} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Chapter Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-dark-text">
                选择章节
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllChapters}
                  className="text-xs text-dark-primary hover:underline"
                >
                  全选
                </button>
                <span className="text-dark-text-muted">|</span>
                <button
                  type="button"
                  onClick={deselectAllChapters}
                  className="text-xs text-dark-primary hover:underline"
                >
                  取消全选
                </button>
              </div>
            </div>
            <p className="text-xs text-dark-text-muted mb-3">
              以下章节中出现了"{entryName}"
            </p>
            
            {isLoadingChapters ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner size="sm" />
                <span className="ml-2 text-dark-text-muted">加载章节中...</span>
              </div>
            ) : availableChapters.length === 0 ? (
              <div className="text-center py-4 text-dark-text-muted">
                "{entryName}" 尚未在任何章节中出现
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto border border-dark-border rounded-lg p-2 space-y-1">
                {availableChapters.map((chapter) => (
                  <label
                    key={chapter.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-dark-surface cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChapterIds.includes(chapter.id)}
                      onChange={() => toggleChapter(chapter.id)}
                      className="rounded border-dark-border text-dark-primary focus:ring-dark-primary"
                    />
                    <span className="text-sm text-dark-text">
                      第{chapter.chapter_number}章《{chapter.title}》
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Additional Context */}
          <div>
            <label className="block text-sm font-medium text-dark-text mb-2">
              补充说明 <span className="text-dark-text-muted">(可选)</span>
            </label>
            <Textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="输入额外的背景信息或特殊要求..."
              rows={3}
            />
          </div>

          {/* Update Mode Checkbox */}
          {originalDescription && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isUpdate}
                onChange={(e) => setIsUpdate(e.target.checked)}
                className="rounded border-dark-border text-dark-primary focus:ring-dark-primary"
              />
              <span className="text-sm text-dark-text">
                更新现有描述（保留原有信息并根据新内容更新）
              </span>
            </label>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Generated Description Preview */}
          {(isGenerating || generatedDescription) && (
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">
                生成结果
              </label>
              {usedChapters.length > 0 && (
                <p className="text-xs text-dark-text-muted mb-2">
                  使用章节: {usedChapters.map(ch => `第${ch.chapter_number}章`).join(', ')}
                </p>
              )}
              <div className="p-3 bg-dark-bg border border-dark-border rounded-lg min-h-[100px] max-h-[200px] overflow-y-auto">
                <p className="text-sm text-dark-text whitespace-pre-wrap">
                  {generatedDescription || (isGenerating ? '生成中...' : '')}
                </p>
                {isGenerating && (
                  <span className="inline-block w-2 h-4 bg-dark-primary animate-pulse ml-1" />
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              取消
            </Button>
            {generatedDescription && !isGenerating ? (
              <Button
                type="button"
                onClick={handleApply}
                className="flex items-center gap-2"
              >
                <Check size={16} />
                应用描述
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || selectedChapterIds.length === 0 || isLoadingChapters}
                className="flex items-center gap-2"
              >
                <Sparkles size={16} />
                {isGenerating ? '生成中...' : '生成描述'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
