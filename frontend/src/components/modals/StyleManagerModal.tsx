import React, { useState, useEffect } from 'react';
import { X, Plus, Save, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stylesApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { LoadingSpinner } from '../ui/Loading';
import type { WritingStyle } from '../../types';

interface StyleManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNew: () => void;
}

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

  // Fetch all styles
  const { data: styles, isLoading } = useQuery({
    queryKey: ['styles'],
    queryFn: async () => {
      const response = await stylesApi.list();
      // Handle both paginated and non-paginated responses
      return Array.isArray(response.data) ? response.data : ((response.data as any)?.results || []);
    },
    enabled: isOpen,
  });

  // Get selected style
  const selectedStyle = styles?.find((s: any) => s.id === selectedStyleId);

  // Update local state when selected style changes
  useEffect(() => {
    if (selectedStyle) {
      setEditedName(selectedStyle.name);
      setEditedStyleData(selectedStyle.style_data);
      setHasUnsavedChanges(false);
    } else {
      setEditedName('');
      setEditedStyleData('');
      setHasUnsavedChanges(false);
    }
  }, [selectedStyle]);

  // Auto-select first style when list loads
  useEffect(() => {
    if (styles && styles.length > 0 && !selectedStyleId) {
      setSelectedStyleId(styles[0].id);
    }
  }, [styles, selectedStyleId]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WritingStyle> }) =>
      stylesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setHasUnsavedChanges(false);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => stylesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setSelectedStyleId(null);
    },
  });

  const handleSave = () => {
    if (!selectedStyleId) return;

    updateMutation.mutate({
      id: selectedStyleId,
      data: {
        name: editedName,
        style_data: editedStyleData,
      },
    });
  };

  const handleDelete = () => {
    if (!selectedStyleId) return;

    if (confirm(`确定要删除风格"${editedName}"吗？此操作无法撤销。`)) {
      deleteMutation.mutate(selectedStyleId);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedName(e.target.value);
    setHasUnsavedChanges(true);
  };

  const handleStyleDataChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedStyleData(e.target.value);
    setHasUnsavedChanges(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl h-[80vh] bg-dark-surface border-dark-border flex flex-col">
        <CardHeader className="flex-shrink-0 border-b border-dark-border">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-dark-text">写作风格管理</h2>
            <button
              onClick={onClose}
              className="text-dark-text-muted hover:text-dark-text transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          <div className="flex h-full">
            {/* Left Sidebar - Styles List */}
            <div className="w-64 border-r border-dark-border flex flex-col bg-dark-bg">
              <div className="p-4 border-b border-dark-border">
                <Button
                  onClick={onCreateNew}
                  className="w-full flex items-center justify-center gap-2"
                  size="sm"
                >
                  <Plus size={16} />
                  创建新风格
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : styles && styles.length > 0 ? (
                  <div className="space-y-1">
                    {styles.map((style: any) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyleId(style.id)}
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
                  <div className="text-center py-8 text-dark-text-muted text-sm">
                    <p>还没有创建风格</p>
                    <p className="mt-2">点击上方按钮创建</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Style Editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedStyle ? (
                <>
                  <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                    <div>
                      <label className="block text-sm font-medium text-dark-text mb-2">
                        风格名称
                      </label>
                      <Input
                        value={editedName}
                        onChange={handleNameChange}
                        placeholder="输入风格名称"
                        className="bg-dark-bg border-dark-border"
                      />
                    </div>

                    <div className="flex-1 flex flex-col">
                      <label className="block text-sm font-medium text-dark-text mb-2">
                        风格描述
                      </label>
                      <Textarea
                        value={editedStyleData}
                        onChange={handleStyleDataChange}
                        placeholder="输入或粘贴风格描述..."
                        className="bg-dark-bg border-dark-border min-h-[400px] resize-none font-mono text-sm"
                        rows={20}
                      />
                      <div className="text-xs text-dark-text-muted mt-2">
                        字数: {editedStyleData.length}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex-shrink-0 border-t border-dark-border p-4 flex items-center justify-between bg-dark-bg">
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
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-dark-text-muted">
                  <p>{isLoading ? '加载中...' : '选择一个风格进行编辑'}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
