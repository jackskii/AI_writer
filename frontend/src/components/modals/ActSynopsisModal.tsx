import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, FileText, Sparkles, Zap, CheckCircle, AlertCircle, SkipForward } from 'lucide-react';
import { actsApi, aiApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import type { Act } from '../../types';

interface ActSynopsisModalProps {
  act: Act | null;
  workId: number;
  isOpen: boolean;
  onClose: () => void;
  onSynopsisUpdated: (synopsis: string) => void;
}

interface ChapterProgressItem {
  chapter: string;
  status: 'pending' | 'generating' | 'done' | 'error' | 'skipped';
  message?: string;
}

export const ActSynopsisModal: React.FC<ActSynopsisModalProps> = ({
  act,
  workId,
  isOpen,
  onClose,
  onSynopsisUpdated
}) => {
  const [synopsis, setSynopsis] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [chapterProgress, setChapterProgress] = useState<ChapterProgressItem[]>([]);
  const [currentPhase, setCurrentPhase] = useState<'idle' | 'chapters' | 'synopsis'>('idle');
  const [progressMessage, setProgressMessage] = useState('');
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const { data: actDetail } = useQuery({
    queryKey: ['act', workId, act?.id, 'synopsis-modal'],
    queryFn: async () => {
      if (!act) return null;
      const response = await actsApi.get(workId, act.id);
      return response.data;
    },
    enabled: isOpen && !!act,
  });

  const effectiveAct = actDetail || act;

  useEffect(() => {
    if (act) {
      setSynopsis((actDetail?.synopsis ?? act.synopsis) || '');
    }
  }, [act, actDetail]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setChapterProgress([]);
      setCurrentPhase('idle');
      setProgressMessage('');
      setIsGenerating(false);
    }
  }, [isOpen]);

  const updateMutation = useMutation({
    mutationFn: (synopsisData: { synopsis: string }) => 
      actsApi.update(workId, act!.id, synopsisData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acts', workId] });
    }
  });

  const handleSave = () => {
    if (act) {
      updateMutation.mutate({ synopsis: synopsis.trim() });
    }
  };

  const handleGenerate = async () => {
    if (!effectiveAct || isGenerating) return;

    setIsGenerating(true);
    setCurrentPhase('chapters');
    setChapterProgress([]);
    setSynopsis('');
    setProgressMessage('');

    try {
      await aiApi.generateActSynopsisStream(workId, effectiveAct.id, {
        onStart: () => {
          setProgressMessage('开始生成卷摘要...');
        },
        onChapterProgress: (info) => {
          setCurrentPhase('chapters');
          if (info.message && info.total > 0) {
            setProgressMessage(info.message);
          }
          setChapterProgress(prev => {
            const existing = prev.find(p => p.chapter === info.chapter);
            if (existing) {
              return prev.map(p => 
                p.chapter === info.chapter 
                  ? { ...p, status: info.status as ChapterProgressItem['status'] }
                  : p
              );
            } else {
              return [...prev, { chapter: info.chapter, status: info.status as ChapterProgressItem['status'] }];
            }
          });
        },
        onChapterDone: (chapter) => {
          setChapterProgress(prev => 
            prev.map(p => p.chapter === chapter ? { ...p, status: 'done' } : p)
          );
        },
        onChapterSkip: (chapter, message) => {
          setChapterProgress(prev => {
            const existing = prev.find(p => p.chapter === chapter);
            if (existing) {
              return prev.map(p => 
                p.chapter === chapter ? { ...p, status: 'skipped', message } : p
              );
            } else {
              return [...prev, { chapter, status: 'skipped', message }];
            }
          });
        },
        onChapterError: (chapter, message) => {
          setChapterProgress(prev => {
            const existing = prev.find(p => p.chapter === chapter);
            if (existing) {
              return prev.map(p => 
                p.chapter === chapter ? { ...p, status: 'error', message } : p
              );
            } else {
              return [...prev, { chapter, status: 'error', message }];
            }
          });
        },
        onSynopsisProgress: (message) => {
          setCurrentPhase('synopsis');
          setProgressMessage(message);
        },
        onChunk: (chunk) => {
          setSynopsis(prev => prev + chunk);
        },
        onEnd: (finalSynopsis) => {
          setSynopsis(finalSynopsis);
          setIsGenerating(false);
          setCurrentPhase('idle');
          setProgressMessage('生成完成');
          onSynopsisUpdated(finalSynopsis);
          // Invalidate queries to refresh act data
          queryClient.invalidateQueries({ queryKey: ['acts', workId] });
        },
        onError: (error) => {
          setIsGenerating(false);
          setCurrentPhase('idle');
          setProgressMessage(`生成失败: ${error}`);
        }
      });
    } catch (error) {
      setIsGenerating(false);
      setCurrentPhase('idle');
      setProgressMessage(`生成失败: ${error}`);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    setCurrentPhase('idle');
    setProgressMessage('已取消');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isGenerating) {
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  if (!isOpen || !act) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-dark-primary" />
              <div>
                <h3 className="text-lg font-semibold text-dark-text">卷摘要</h3>
                <p className="text-sm text-dark-text-muted">{effectiveAct?.name || act.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="text-dark-text-muted hover:text-dark-text disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Display */}
          {isGenerating && (
            <div className="bg-dark-bg border border-dark-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap size={16} className="animate-pulse text-yellow-400" />
                <span className="text-sm text-dark-text font-medium">{progressMessage}</span>
              </div>

              {/* Chapter Progress List */}
              {chapterProgress.length > 0 && currentPhase === 'chapters' && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {chapterProgress.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {item.status === 'generating' && (
                        <Zap size={14} className="animate-pulse text-yellow-400" />
                      )}
                      {item.status === 'done' && (
                        <CheckCircle size={14} className="text-green-500" />
                      )}
                      {item.status === 'error' && (
                        <AlertCircle size={14} className="text-red-500" />
                      )}
                      {item.status === 'skipped' && (
                        <SkipForward size={14} className="text-dark-text-muted" />
                      )}
                      {item.status === 'pending' && (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-dark-border" />
                      )}
                      <span className={`${
                        item.status === 'generating' ? 'text-yellow-400' :
                        item.status === 'done' ? 'text-green-500' :
                        item.status === 'error' ? 'text-red-500' :
                        item.status === 'skipped' ? 'text-dark-text-muted' :
                        'text-dark-text-muted'
                      }`}>
                        {item.chapter}
                        {item.message && <span className="text-xs ml-2">({item.message})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {currentPhase === 'synopsis' && (
                <div className="text-sm text-dark-text-muted">
                  正在生成卷摘要...
                </div>
              )}
            </div>
          )}

          {/* Synopsis Textarea */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-dark-text">
              摘要内容
            </label>
            <Textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入卷摘要，或点击生成按钮让AI自动生成..."
              rows={12}
              className="resize-none"
              disabled={isGenerating}
            />
            {synopsis && (
              <p className="text-xs text-dark-text-muted text-right">
                {synopsis.length} 字
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating || (effectiveAct?.chapter_count || 0) < 3}
                className="flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Zap size={16} className="animate-pulse text-yellow-400" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    AI生成摘要
                  </>
                )}
              </Button>
              
              {isGenerating && (
                <Button
                  variant="outline"
                  onClick={handleCancel}
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
                disabled={isGenerating}
              >
                关闭
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending || isGenerating}
              >
                {updateMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>

          {/* Warning if insufficient chapters */}
          {(effectiveAct?.chapter_count || 0) < 3 && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
              <p className="text-sm text-yellow-300">
                💡 本卷章节不足，需要至少3个章节才能生成卷摘要（当前{effectiveAct?.chapter_count || 0}章）
              </p>
            </div>
          )}

          {/* Tips */}
          <div className="text-xs text-dark-text-muted border-t border-dark-border pt-3">
            <p>快捷键：Ctrl/Cmd + Enter 保存手动编辑，Esc 关闭</p>
            <p className="mt-1">提示：AI生成的摘要会自动保存。章节摘要需要至少1000字，卷摘要需要至少3个章节。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
