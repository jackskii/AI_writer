import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, FileText, Sparkles, Zap } from 'lucide-react';
import { actsApi, aiApi, chaptersApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { appendAnswerOnlyChunk, stripThoughtProcess } from '../../utils/stripThoughtProcess';
import type { Act } from '../../types';

interface ActSynopsisModalProps {
  act: Act | null;
  workId: number;
  isOpen: boolean;
  onClose: () => void;
  onSynopsisUpdated: (synopsis: string) => void;
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
  const [errorMessage, setErrorMessage] = useState('');
  const accumulatedRef = useRef('');
  const queryClient = useQueryClient();

  const { data: actDetail } = useQuery({
    queryKey: ['act', workId, act?.id, 'synopsis-modal'],
    queryFn: async () => {
      if (!act) return null;
      const response = await actsApi.get(workId, act.id);
      return response.data;
    },
    enabled: isOpen && !!act,
  });

  const { data: workChapters } = useQuery({
    queryKey: ['chapters', workId, 'act-synopsis-modal'],
    queryFn: async () => {
      const response = await chaptersApi.list(workId);
      return response.data;
    },
    enabled: isOpen && !!act,
  });

  const effectiveAct = actDetail || act;
  const actChapters = (workChapters || []).filter(ch => ch.act === act?.id);
  const missingSummaryChapters = actChapters.filter(
    ch => !ch.summary || !ch.summary.trim()
  );
  const hasEnoughChapters = (effectiveAct?.chapter_count || actChapters.length) >= 3;
  const allChaptersHaveSummary = actChapters.length > 0 && missingSummaryChapters.length === 0;
  const canGenerate = hasEnoughChapters && allChaptersHaveSummary && !isGenerating;

  useEffect(() => {
    if (act) {
      setSynopsis((actDetail?.synopsis ?? act.synopsis) || '');
    }
  }, [act, actDetail]);

  useEffect(() => {
    if (!isOpen) {
      setErrorMessage('');
      setIsGenerating(false);
    }
  }, [isOpen]);

  const updateMutation = useMutation({
    mutationFn: (synopsisData: { synopsis: string }) =>
      actsApi.update(workId, act!.id, synopsisData),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['acts', workId] });
      onSynopsisUpdated(variables.synopsis);
    }
  });

  const handleSave = () => {
    if (act) {
      updateMutation.mutate({ synopsis: synopsis.trim() });
    }
  };

  const handleGenerate = async () => {
    if (!effectiveAct || isGenerating || !canGenerate) return;

    setIsGenerating(true);
    setErrorMessage('');
    setSynopsis('');
    accumulatedRef.current = '';

    try {
      await aiApi.generateActSynopsisStream(workId, effectiveAct.id, {
        onChunk: (chunk) => {
          accumulatedRef.current = appendAnswerOnlyChunk(accumulatedRef.current, chunk);
          setSynopsis(accumulatedRef.current);
        },
        onEnd: (finalSynopsis) => {
          const cleaned = stripThoughtProcess(finalSynopsis);
          accumulatedRef.current = cleaned;
          setSynopsis(cleaned);
          setIsGenerating(false);
        },
        onError: (error) => {
          setIsGenerating(false);
          setErrorMessage(error);
        }
      });
    } catch (error) {
      setIsGenerating(false);
      setErrorMessage(`生成失败: ${error}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isGenerating) {
      onClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isGenerating) {
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
          {errorMessage && (
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
              <p className="text-sm text-red-300">{errorMessage}</p>
            </div>
          )}

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

          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex items-center gap-2"
              >
                {isGenerating ? (
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

          {!hasEnoughChapters && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
              <p className="text-sm text-yellow-300">
                本卷章节不足，需要至少3个章节才能生成卷摘要（当前{effectiveAct?.chapter_count || actChapters.length}章）
              </p>
            </div>
          )}

          {hasEnoughChapters && missingSummaryChapters.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
              <p className="text-sm text-yellow-300">
                请先生成所有章节的摘要后再生成卷摘要：
                {missingSummaryChapters.map(ch => `第${ch.chapter_number}章《${ch.title}》`).join('、')}
              </p>
            </div>
          )}

          <div className="text-xs text-dark-text-muted border-t border-dark-border pt-3">
            <p>快捷键：Ctrl/Cmd + Enter 保存，Esc 关闭（生成中不可用）</p>
            <p className="mt-1">提示：AI生成后不会自动保存，请点击“保存”后生效</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
