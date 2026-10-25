import React, { useState, useEffect } from 'react';
import { X, Sparkles, Check, RefreshCw } from 'lucide-react';
import { aiApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { LoadingSpinner } from '../ui/Loading';
import { appendAnswerOnlyChunk, stripThoughtProcess } from '../../utils/stripThoughtProcess';

interface ChapterInfo {
  id: number;
  chapter_number: number;
  title: string;
  summary?: string;
  act_order?: number;
  act_type?: string;
}

// Per-arc numbering: chapter_number is only unique within an act, so the
// act order must be included to disambiguate when listing chapters across acts.
const chapterSortKey = (ch: ChapterInfo): [number, number, number] => {
  // Side chapters (外传) sink to the bottom.
  const isSide = ch.act_type === 'side_chapters' ? 1 : 0;
  return [isSide, ch.act_order ?? 0, ch.chapter_number];
};

const formatChapterLabel = (ch: ChapterInfo): string =>
  ch.act_type === 'side_chapters'
    ? `外传 第${ch.chapter_number}章`
    : `第${ch.act_order ?? 0}卷 第${ch.chapter_number}章`;

interface AutoDescribeModalProps {
  workId: number;
  entryName: string;
  originalDescription?: string;
  isOpen: boolean;
  onClose: () => void;
  onDescriptionGenerated: (description: string, usedChapters: ChapterInfo[]) => void;
  isWorldbuilding?: boolean;
}

export const AutoDescribeModal: React.FC<AutoDescribeModalProps> = ({
  workId,
  entryName,
  originalDescription = '',
  isOpen,
  onClose,
  onDescriptionGenerated,
  isWorldbuilding = false
}) => {
  const [allChapters, setAllChapters] = useState<ChapterInfo[]>([]);
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
      // Fetch both appeared chapters and all chapters in parallel
      const [appearedChapters, all] = await Promise.all([
        aiApi.getChaptersWithEntry(workId, entryName),
        aiApi.getAllChaptersWithSummary(workId),
      ]);
      setAllChapters(all);
      // Select all appeared chapters by default
      setSelectedChapterIds(appearedChapters.map((ch: ChapterInfo) => ch.id));
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

  const addChapter = (chapterId: number) => {
    setSelectedChapterIds(prev =>
      prev.includes(chapterId) ? prev : [...prev, chapterId]
    );
  };

  // Chapters currently selected (with full info from allChapters)
  const selectedChapters: ChapterInfo[] = selectedChapterIds
    .map(id => allChapters.find(ch => ch.id === id))
    .filter((ch): ch is ChapterInfo => ch !== undefined)
    .sort((a, b) => {
      const ka = chapterSortKey(a);
      const kb = chapterSortKey(b);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
    });

  // Chapters available to add (not already selected)
  const addableChapters: ChapterInfo[] = allChapters
    .filter(ch => !selectedChapterIds.includes(ch.id))
    .sort((a, b) => {
      const ka = chapterSortKey(a);
      const kb = chapterSortKey(b);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
    });

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedDescription('');
    setUsedChapters([]);
    setError('');

    let accumulated = '';

    try {
      await aiApi.autoDescribeEntry(
        workId,
        entryName,
        // onChunk
        (chunk: string) => {
          accumulated = appendAnswerOnlyChunk(accumulated, chunk);
          setGeneratedDescription(accumulated);
        },
        // onStart
        (chapters) => {
          setUsedChapters(chapters as ChapterInfo[]);
        },
        // onEnd
        (description, chapters) => {
          const cleaned = stripThoughtProcess(description);
          accumulated = cleaned;
          setGeneratedDescription(cleaned);
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
          originalDescription: isUpdate ? originalDescription : '',
          isWorldbuilding: isWorldbuilding
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
            <label className="block text-sm font-medium text-dark-text mb-1">
              选择章节
            </label>
            <p className="text-xs text-dark-text-muted mb-3">
              已自动选中"{entryName}"出现的章节，可通过下方下拉菜单添加其他章节
            </p>

            {isLoadingChapters ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner size="sm" />
                <span className="ml-2 text-dark-text-muted">加载章节中...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Selected chapters list */}
                <div className="border border-dark-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-dark-surface text-xs text-dark-text-muted border-b border-dark-border">
                    已选章节 ({selectedChapters.length})
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {selectedChapters.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-dark-text-muted">
                        未选择任何章节
                      </div>
                    ) : (
                      selectedChapters.map((chapter) => (
                        <div
                          key={chapter.id}
                          className="flex items-start gap-2 px-3 py-2 border-b border-dark-border last:border-b-0 hover:bg-dark-surface"
                        >
                          <input
                            type="checkbox"
                            checked
                            onChange={() => toggleChapter(chapter.id)}
                            className="mt-1 rounded border-dark-border text-dark-primary focus:ring-dark-primary shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-dark-text font-medium">
                              {formatChapterLabel(chapter)}
                            </div>
                            <div
                              className="text-xs text-dark-text-muted mt-0.5"
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {chapter.summary?.trim() ? chapter.summary.trim() : '(无摘要)'}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Add chapter dropdown */}
                {addableChapters.length > 0 && (
                  <div className="relative">
                    <select
                      value=""
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        if (id) addChapter(id);
                      }}
                      className="w-full px-3 py-2 text-sm bg-dark-surface border border-dark-border rounded-lg text-dark-text focus:outline-none focus:ring-1 focus:ring-dark-primary cursor-pointer"
                    >
                      <option value="">+ 添加章节...</option>
                      {addableChapters.map((chapter) => (
                        <option key={chapter.id} value={chapter.id}>
                          {formatChapterLabel(chapter)}{chapter.title ? `《${chapter.title}》` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
                  使用章节: {usedChapters.map(ch => formatChapterLabel(ch)).join(', ')}
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
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={selectedChapterIds.length === 0 || isLoadingChapters}
                  className="flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  重新生成
                </Button>
                <Button
                  type="button"
                  onClick={handleApply}
                  className="flex items-center gap-2"
                >
                  <Check size={16} />
                  应用描述
                </Button>
              </>
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
