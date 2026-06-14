import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Save, Trash2, Sparkles } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stylesApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { LoadingSpinner } from '../ui/Loading';
import { StyleTextAnalyzePanel, type StyleAnalyzeStep } from './StyleTextAnalyzePanel';
import type { WritingStyle } from '../../types';

interface StyleManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNew: () => void;
}

type NsfwPanelView = 'edit' | 'analyze';

export const StyleManagerModal: React.FC<StyleManagerModalProps> = ({
  isOpen,
  onClose,
  onCreateNew
}) => {
  const queryClient = useQueryClient();
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedStyleData, setEditedStyleData] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [nsfwPanelView, setNsfwPanelView] = useState<NsfwPanelView>('edit');
  const [analyzeStep, setAnalyzeStep] = useState<StyleAnalyzeStep>('input');
  const [analyzeSample, setAnalyzeSample] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState('');

  const { data: styles, isLoading, isFetched } = useQuery({
    queryKey: ['styles'],
    queryFn: async () => {
      const response = await stylesApi.list();
      return Array.isArray(response.data) ? response.data : ((response.data as any)?.results || []);
    },
    enabled: isOpen,
    refetchOnMount: 'always',
  });

  const regularStyles = useMemo(
    () => (styles || []).filter((s: WritingStyle) => !s.is_nsfw),
    [styles]
  );
  const nsfwStyle = useMemo(
    () => (styles || []).find((s: WritingStyle) => s.is_nsfw) || null,
    [styles]
  );

  const selectedStyle = styles?.find((s: WritingStyle) => s.id === selectedStyleId);
  const isNsfwSelected = selectedStyle?.is_nsfw === true;

  const resetNsfwAnalyzeState = () => {
    setNsfwPanelView('edit');
    setAnalyzeStep('input');
    setAnalyzeSample('');
    setAnalyzeResult('');
  };

  useEffect(() => {
    if (!isOpen) {
      resetNsfwAnalyzeState();
      return;
    }
    if (selectedStyle) {
      setEditedName(selectedStyle.name);
      setEditedStyleData(selectedStyle.style_data);
      setHasUnsavedChanges(false);
      if (!selectedStyle.is_nsfw) {
        resetNsfwAnalyzeState();
      }
    } else {
      setEditedName('');
      setEditedStyleData('');
      setHasUnsavedChanges(false);
      resetNsfwAnalyzeState();
    }
  }, [selectedStyle, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (selectedStyleId !== null) return;
    if (regularStyles.length > 0) {
      setSelectedStyleId(regularStyles[0].id);
    } else if (nsfwStyle) {
      setSelectedStyleId(nsfwStyle.id);
    }
  }, [isOpen, regularStyles, nsfwStyle, selectedStyleId]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WritingStyle> }) =>
      stylesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setHasUnsavedChanges(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => stylesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setSelectedStyleId(null);
    },
  });

  const analyzeNsfwMutation = useMutation({
    mutationFn: () => stylesApi.analyzeNsfw(analyzeSample, 'NSFW风格'),
    onSuccess: (response) => {
      setAnalyzeResult(response.data.style_text);
      setAnalyzeStep('result');
    },
  });

  const handleSave = () => {
    if (!selectedStyleId) return;
    updateMutation.mutate({
      id: selectedStyleId,
      data: isNsfwSelected
        ? { style_data: editedStyleData }
        : { name: editedName, style_data: editedStyleData },
    });
  };

  const handleDelete = () => {
    if (!selectedStyleId || isNsfwSelected) return;
    if (confirm(`确定要删除风格"${editedName}"吗？此操作无法撤销。`)) {
      deleteMutation.mutate(selectedStyleId);
    }
  };

  const handleAnalyzeNsfw = () => {
    const textLength = analyzeSample.length;
    if (textLength < 1000) {
      alert(`文本太短（${textLength}字），至少需要1000字`);
      return;
    }
    if (textLength > 100000) {
      alert(`文本太长（${textLength}字），最多100000字`);
      return;
    }
    analyzeNsfwMutation.mutate();
  };

  const handleNsfwAnalyzeBack = () => {
    setAnalyzeSample('');
    setAnalyzeResult('');
    setAnalyzeStep('input');
    setNsfwPanelView('edit');
  };

  const handleApplyAnalyzeResult = () => {
    setEditedStyleData(analyzeResult);
    setHasUnsavedChanges(true);
    resetNsfwAnalyzeState();
  };

  const handleSelectStyle = (styleId: number) => {
    setSelectedStyleId(styleId);
  };

  if (!isOpen) return null;

  const renderSaveFooter = (showDelete: boolean) => (
    <div className="flex-shrink-0 border-t border-dark-border p-4 flex items-center justify-between bg-dark-bg">
      {showDelete ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          className="flex items-center gap-2 text-red-500 hover:bg-red-500/10"
          disabled={deleteMutation.isPending}
        >
          <Trash2 size={16} />
          删除风格
        </Button>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-3">
        {hasUnsavedChanges && (
          <span className="text-xs text-yellow-500">有未保存的更改</span>
        )}
        <Button
          onClick={handleSave}
          disabled={!hasUnsavedChanges || updateMutation.isPending}
          className="flex items-center gap-2"
          size="sm"
        >
          {updateMutation.isPending ? (
            <>
              <LoadingSpinner size="sm" />
              保存中...
            </>
          ) : (
            <>
              <Save size={16} />
              保存更改
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderRegularEdit = () => (
    <>
      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-dark-text mb-2">风格名称</label>
          <Input
            value={editedName}
            onChange={(e) => {
              setEditedName(e.target.value);
              setHasUnsavedChanges(true);
            }}
            placeholder="输入风格名称"
            className="bg-dark-bg border-dark-border"
          />
        </div>

        <div className="flex-1 flex flex-col">
          <label className="block text-sm font-medium text-dark-text mb-2">风格描述</label>
          <Textarea
            value={editedStyleData}
            onChange={(e) => {
              setEditedStyleData(e.target.value);
              setHasUnsavedChanges(true);
            }}
            placeholder="输入或粘贴风格描述..."
            className="bg-dark-bg border-dark-border min-h-[400px] resize-none font-mono text-sm"
            rows={20}
          />
          <div className="text-xs text-dark-text-muted mt-2">字数: {editedStyleData.length}</div>
        </div>
      </div>
      {renderSaveFooter(true)}
    </>
  );

  const renderNsfwEdit = () => (
    <>
      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-dark-text">NSFW风格</h3>
          <Button
            size="sm"
            onClick={() => setNsfwPanelView('analyze')}
            className="flex items-center gap-2"
          >
            <Sparkles size={16} />
            生成NSFW风格
          </Button>
        </div>

        <div className="flex-1 flex flex-col">
          <label className="block text-sm font-medium text-dark-text mb-2">风格描述</label>
          <Textarea
            value={editedStyleData}
            onChange={(e) => {
              setEditedStyleData(e.target.value);
              setHasUnsavedChanges(true);
            }}
            placeholder="输入或粘贴NSFW风格描述..."
            className="bg-dark-bg border-dark-border min-h-[400px] resize-none font-mono text-sm"
            rows={20}
          />
          <div className="text-xs text-dark-text-muted mt-2">字数: {editedStyleData.length}</div>
        </div>
      </div>
      {renderSaveFooter(false)}
    </>
  );

  const renderNsfwAnalyze = () => (
    <div className="p-6 flex-1 overflow-y-auto">
      <StyleTextAnalyzePanel
        step={analyzeStep}
        title="从文本生成NSFW风格"
        sample={analyzeSample}
        onSampleChange={setAnalyzeSample}
        result={analyzeResult}
        onResultChange={setAnalyzeResult}
        samplePlaceholder="粘贴NSFW文本样本（1000-100000字）..."
        resultLabel="NSFW风格分析结果"
        isPending={analyzeNsfwMutation.isPending}
        onBack={handleNsfwAnalyzeBack}
        onAnalyze={handleAnalyzeNsfw}
        onApplyResult={handleApplyAnalyzeResult}
      />
    </div>
  );

  const renderRightPanel = () => {
    if (!selectedStyle) {
      return (
        <div className="flex-1 flex items-center justify-center text-dark-text-muted">
          <p>{isLoading ? '加载中...' : '选择一个风格进行编辑'}</p>
        </div>
      );
    }

    if (isNsfwSelected && nsfwPanelView === 'analyze') {
      return renderNsfwAnalyze();
    }

    if (isNsfwSelected) {
      return renderNsfwEdit();
    }

    return renderRegularEdit();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl h-[80vh] bg-dark-surface border-dark-border flex flex-col">
        <CardHeader className="flex-shrink-0 border-b border-dark-border">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-dark-text">写作风格管理</h2>
            <button onClick={onClose} className="text-dark-text-muted hover:text-dark-text transition-colors">
              <X size={24} />
            </button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <div className="flex h-full min-h-0">
            <div className="w-64 h-full min-h-0 border-r border-dark-border flex flex-col bg-dark-bg flex-shrink-0">
              <div className="p-4 border-b border-dark-border">
                <Button onClick={onCreateNew} className="w-full flex items-center justify-center gap-2" size="sm">
                  <Plus size={16} />
                  创建新风格
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 min-h-0">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : regularStyles.length > 0 ? (
                  <div className="space-y-1">
                    {regularStyles.map((style: WritingStyle) => (
                      <button
                        key={style.id}
                        onClick={() => handleSelectStyle(style.id)}
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${
                          selectedStyleId === style.id
                            ? 'bg-dark-primary text-white'
                            : 'text-dark-text hover:bg-dark-surface'
                        }`}
                      >
                        <div className="font-medium truncate">{style.name}</div>
                        <div className="text-xs opacity-75 truncate mt-1">
                          {new Date(style.updated_at).toLocaleDateString('zh-CN')}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-dark-text-muted text-sm">
                    <p>还没有创建常规风格</p>
                  </div>
                )}
              </div>

              <div className="border-t border-dark-border p-2 flex-shrink-0">
                {isLoading ? (
                  <div className="text-xs text-dark-text-muted px-2 py-2">加载中...</div>
                ) : nsfwStyle ? (
                  <button
                    onClick={() => handleSelectStyle(nsfwStyle.id)}
                    className={`w-full text-left px-3 py-2 rounded transition-colors ${
                      selectedStyleId === nsfwStyle.id
                        ? 'bg-dark-primary text-white'
                        : 'text-dark-text hover:bg-dark-surface'
                    }`}
                  >
                    <div className="font-medium truncate">NSFW风格</div>
                    <div className="text-xs opacity-75 truncate mt-1">
                      {nsfwStyle.style_data?.trim() ? '已配置' : '未配置'}
                    </div>
                  </button>
                ) : (
                  <div className="w-full text-left px-3 py-2 rounded text-dark-text-muted">
                    <div className="font-medium truncate">NSFW风格</div>
                    <div className="text-xs opacity-75 truncate mt-1">
                      {isFetched ? '未加载' : '加载中...'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              {renderRightPanel()}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
