import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { LoadingSpinner } from '../ui/Loading';

export type StyleAnalyzeStep = 'input' | 'result';

interface StyleTextAnalyzePanelProps {
  step: StyleAnalyzeStep;
  title: string;
  sample: string;
  onSampleChange: (value: string) => void;
  result: string;
  onResultChange: (value: string) => void;
  samplePlaceholder: string;
  resultLabel?: string;
  isPending: boolean;
  onBack: () => void;
  onAnalyze: () => void;
  onApplyResult: () => void;
}

export const StyleTextAnalyzePanel: React.FC<StyleTextAnalyzePanelProps> = ({
  step,
  title,
  sample,
  onSampleChange,
  result,
  onResultChange,
  samplePlaceholder,
  resultLabel = '风格分析结果',
  isPending,
  onBack,
  onAnalyze,
  onApplyResult,
}) => {
  if (step === 'input') {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="text-sm text-dark-text-muted hover:text-dark-text transition-colors flex items-center gap-1"
        >
          ← 返回
        </button>

        <h3 className="text-lg font-medium text-dark-text">{title}</h3>

        <div>
          <label className="block text-sm font-medium text-dark-text mb-2">文章内容 (1000-100000字)</label>
          <Textarea
            value={sample}
            onChange={(e) => onSampleChange(e.target.value)}
            placeholder={samplePlaceholder}
            className="bg-dark-bg border-dark-border min-h-[300px] font-mono text-sm"
            rows={15}
          />
          <div className="text-xs text-dark-text-muted mt-2">字数: {sample.length}</div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onBack}>取消</Button>
          <Button
            onClick={onAnalyze}
            disabled={isPending || sample.length < 1000 || sample.length > 100000}
            className="flex items-center gap-2"
          >
            {isPending ? (
              <>
                <LoadingSpinner size="sm" />
                分析中...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                开始分析
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm text-dark-text-muted hover:text-dark-text transition-colors flex items-center gap-1"
      >
        ← 返回
      </button>

      <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-green-500 mb-2">分析完成！</h3>
        <p className="text-sm text-dark-text-muted">你可以在下方查看和编辑分析结果</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-dark-text mb-2">{resultLabel}</label>
        <Textarea
          value={result}
          onChange={(e) => onResultChange(e.target.value)}
          className="bg-dark-bg border-dark-border min-h-[400px] font-mono text-sm"
          rows={20}
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onBack}>取消</Button>
        <Button onClick={onApplyResult} disabled={!result.trim()}>
          使用此结果
        </Button>
      </div>
    </div>
  );
};
