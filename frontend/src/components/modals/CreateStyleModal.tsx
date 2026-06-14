import React, { useState } from 'react';
import { X, Sparkles, FileText } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { stylesApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { LoadingSpinner } from '../ui/Loading';

interface CreateStyleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CreationMethod = 'analyze' | 'blank' | null;

export const CreateStyleModal: React.FC<CreateStyleModalProps> = ({
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [creationMethod, setCreationMethod] = useState<CreationMethod>(null);
  const [name, setName] = useState('');
  const [textSample, setTextSample] = useState('');
  const [styleData, setStyleData] = useState('');
  const [showResult, setShowResult] = useState(false);

  const handleClose = () => {
    setCreationMethod(null);
    setName('');
    setTextSample('');
    setStyleData('');
    setShowResult(false);
    onClose();
  };

  const analyzeMutation = useMutation({
    mutationFn: () => stylesApi.analyze(textSample, name || '未命名风格'),
    onSuccess: (response) => {
      setStyleData(response.data.style_text);
      setName(response.data.name);
      setShowResult(true);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; style_data: string }) =>
      stylesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      handleClose();
    },
  });

  const handleAnalyze = () => {
    if (!textSample.trim()) {
      alert('请输入文本样本');
      return;
    }

    const textLength = textSample.length;
    if (textLength < 1000) {
      alert(`文本太短（${textLength}字），至少需要1000字`);
      return;
    }
    if (textLength > 100000) {
      alert(`文本太长（${textLength}字），最多100000字`);
      return;
    }

    analyzeMutation.mutate();
  };

  const handleCreateFromAnalysis = () => {
    if (!name.trim()) {
      alert('请输入风格名称');
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      style_data: styleData,
    });
  };

  const handleCreateBlank = () => {
    if (!name.trim()) {
      alert('请输入风格名称');
      return;
    }
    if (!styleData.trim()) {
      alert('请输入风格描述');
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      style_data: styleData.trim(),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-dark-surface border-dark-border">
        <CardHeader className="border-b border-dark-border sticky top-0 bg-dark-surface z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-dark-text">创建写作风格</h2>
            <button onClick={handleClose} className="text-dark-text-muted hover:text-dark-text transition-colors">
              <X size={24} />
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {!creationMethod && (
            <div className="space-y-4">
              <p className="text-dark-text-muted text-sm">选择创建方式：</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setCreationMethod('analyze')}
                  className="p-6 border-2 border-dark-border rounded-lg hover:border-dark-primary transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-dark-primary rounded-lg group-hover:bg-opacity-80 transition-all">
                      <Sparkles size={24} className="text-white" />
                    </div>
                    <h3 className="font-semibold text-dark-text">AI分析文本</h3>
                  </div>
                  <p className="text-sm text-dark-text-muted">
                    粘贴1000-100000字的文本样本，AI将分析其写作风格特点（建议10000字以上）
                  </p>
                </button>

                <button
                  onClick={() => setCreationMethod('blank')}
                  className="p-6 border-2 border-dark-border rounded-lg hover:border-dark-primary transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-dark-secondary rounded-lg group-hover:bg-opacity-80 transition-all">
                      <FileText size={24} className="text-white" />
                    </div>
                    <h3 className="font-semibold text-dark-text">空白模板</h3>
                  </div>
                  <p className="text-sm text-dark-text-muted">从空白开始，手动编写风格描述</p>
                </button>
              </div>
            </div>
          )}

          {creationMethod === 'analyze' && !showResult && (
            <div className="space-y-4">
              <button
                onClick={() => setCreationMethod(null)}
                className="text-sm text-dark-text-muted hover:text-dark-text transition-colors flex items-center gap-1"
              >
                ← 返回
              </button>

              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">风格名称</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：武侠小说风格、现代都市风格"
                  className="bg-dark-bg border-dark-border"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">文章内容 (1000-100000字)</label>
                <Textarea
                  value={textSample}
                  onChange={(e) => setTextSample(e.target.value)}
                  placeholder="粘贴想要分析的文章内容..."
                  className="bg-dark-bg border-dark-border min-h-[300px] font-mono text-sm"
                  rows={15}
                />
                <div className="text-xs text-dark-text-muted mt-2">字数: {textSample.length}</div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleClose}>取消</Button>
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzeMutation.isPending || textSample.length < 1000 || textSample.length > 100000}
                  className="flex items-center gap-2"
                >
                  {analyzeMutation.isPending ? (
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
          )}

          {creationMethod === 'analyze' && showResult && (
            <div className="space-y-4">
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-500 mb-2">分析完成！</h3>
                <p className="text-sm text-dark-text-muted">你可以在下方查看和编辑分析结果</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">风格名称</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-dark-bg border-dark-border" />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">风格分析结果</label>
                <Textarea
                  value={styleData}
                  onChange={(e) => setStyleData(e.target.value)}
                  className="bg-dark-bg border-dark-border min-h-[400px] font-mono text-sm"
                  rows={20}
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleClose}>取消</Button>
                <Button onClick={handleCreateFromAnalysis} disabled={createMutation.isPending || !name.trim()}>
                  {createMutation.isPending ? '创建中...' : '创建风格'}
                </Button>
              </div>
            </div>
          )}

          {creationMethod === 'blank' && (
            <div className="space-y-4">
              <button
                onClick={() => setCreationMethod(null)}
                className="text-sm text-dark-text-muted hover:text-dark-text transition-colors flex items-center gap-1"
              >
                ← 返回
              </button>

              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">风格名称</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：武侠小说风格、现代都市风格"
                  className="bg-dark-bg border-dark-border"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">风格描述</label>
                <Textarea
                  value={styleData}
                  onChange={(e) => setStyleData(e.target.value)}
                  placeholder={"编写你的风格描述...\n\n【类型与风格概述】\n\n\n【描写示例】\n1. \n2. \n\n【对话示例】\n1. \n2. \n\n【叙述示例】\n1. \n2. "}
                  className="bg-dark-bg border-dark-border min-h-[300px] font-mono text-sm"
                  rows={15}
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleClose}>取消</Button>
                <Button
                  onClick={handleCreateBlank}
                  disabled={createMutation.isPending || !name.trim() || !styleData.trim()}
                >
                  {createMutation.isPending ? '创建中...' : '创建风格'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
