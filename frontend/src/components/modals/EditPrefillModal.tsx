import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Input';
import { editPrefillsApi, type EditPrefill } from '../../services/api';
import { LoadingSpinner } from '../ui/Loading';

interface EditPrefillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPrefillsUpdated: () => void;
}

export const EditPrefillModal: React.FC<EditPrefillModalProps> = ({
  isOpen,
  onClose,
  onPrefillsUpdated
}) => {
  const [prefills, setPrefills] = useState<EditPrefill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPromptText, setEditingPromptText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPromptText, setNewPromptText] = useState('');

  // Load prefills when modal opens
  useEffect(() => {
    if (isOpen) {
      loadPrefills();
    }
  }, [isOpen]);

  const loadPrefills = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await editPrefillsApi.list();
      setPrefills(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载失败');
      console.error('Failed to load prefills:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const validateName = (name: string): string | null => {
    if (!name || !name.trim()) {
      return '名称不能为空';
    }
    const words = name.trim().split(/\s+/);
    if (words.length > 10) {
      return '名称最多10个字';
    }
    if (name.length > 50) {
      return '名称过长';
    }
    return null;
  };

  const validatePromptText = (text: string): string | null => {
    if (!text || !text.trim()) {
      return '提示文本不能为空';
    }
    const words = text.trim().split(/\s+/);
    if (words.length > 200) {
      return '提示文本最多200字';
    }
    if (text.length > 1000) {
      return '提示文本过长';
    }
    return null;
  };

  const handleStartEdit = (prefill: EditPrefill) => {
    setEditingId(prefill.id);
    setEditingName(prefill.name);
    setEditingPromptText(prefill.prompt_text);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingPromptText('');
    setError(null);
  };

  const handleSaveEdit = async () => {
    const nameError = validateName(editingName);
    const textError = validatePromptText(editingPromptText);
    
    if (nameError || textError) {
      setError(nameError || textError);
      return;
    }

    if (!editingId) return;

    setIsSaving(true);
    setError(null);
    try {
      await editPrefillsApi.update(editingId, {
        name: editingName.trim(),
        prompt_text: editingPromptText.trim()
      });
      await loadPrefills();
      onPrefillsUpdated();
      setEditingId(null);
      setEditingName('');
      setEditingPromptText('');
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.name?.[0] || err.response?.data?.prompt_text?.[0] || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartAdd = () => {
    if (prefills.length >= 10) {
      setError('最多只能创建10个编辑指引预设');
      return;
    }
    setIsAddingNew(true);
    setNewName('');
    setNewPromptText('');
    setError(null);
  };

  const handleCancelAdd = () => {
    setIsAddingNew(false);
    setNewName('');
    setNewPromptText('');
    setError(null);
  };

  const handleSaveAdd = async () => {
    const nameError = validateName(newName);
    const textError = validatePromptText(newPromptText);
    
    if (nameError || textError) {
      setError(nameError || textError);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await editPrefillsApi.create({
        name: newName.trim(),
        prompt_text: newPromptText.trim()
      });
      await loadPrefills();
      onPrefillsUpdated();
      setIsAddingNew(false);
      setNewName('');
      setNewPromptText('');
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.name?.[0] || err.response?.data?.prompt_text?.[0] || '创建失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, isDefault: boolean) => {
    if (isDefault) {
      setError('不能删除默认的"增加细节"预设');
      return;
    }

    if (!confirm('确定要删除这个编辑指引预设吗？')) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await editPrefillsApi.delete(id);
      await loadPrefills();
      onPrefillsUpdated();
    } catch (err: any) {
      setError(err.response?.data?.error || '删除失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-dark-bg border border-dark-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-dark-text">编辑指引预设设置</h2>
          <button
            onClick={onClose}
            className="text-dark-text-muted hover:text-dark-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Add New Button */}
              {!isAddingNew && (
                <div className="mb-4">
                  <Button
                    onClick={handleStartAdd}
                    disabled={prefills.length >= 10}
                    className="w-full"
                  >
                    <Plus size={16} className="mr-2" />
                    添加新预设 {prefills.length >= 10 && '(已达上限)'}
                  </Button>
                </div>
              )}

              {/* Add New Form */}
              {isAddingNew && (
                <div className="mb-4 p-4 bg-dark-surface/30 rounded-lg border border-dark-border">
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-dark-text mb-1">
                      名称 (最多10字)
                    </label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="输入预设名称"
                      className="bg-dark-bg border-dark-border"
                      maxLength={50}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-dark-text mb-1">
                      提示文本 (最多200字)
                    </label>
                    <Textarea
                      value={newPromptText}
                      onChange={(e) => setNewPromptText(e.target.value)}
                      placeholder="输入提示文本"
                      className="bg-dark-bg border-dark-border font-mono text-sm"
                      rows={6}
                      maxLength={1000}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveAdd}
                      disabled={isSaving}
                      className="flex-1"
                    >
                      {isSaving ? <LoadingSpinner size="sm" /> : '保存'}
                    </Button>
                    <Button
                      onClick={handleCancelAdd}
                      variant="outline"
                      disabled={isSaving}
                      className="flex-1"
                    >
                      取消
                    </Button>
                  </div>
                </div>
              )}

              {/* Prefills List */}
              <div className="space-y-3">
                {prefills.map((prefill) => (
                  <div
                    key={prefill.id}
                    className="p-4 bg-dark-surface/30 rounded-lg border border-dark-border"
                  >
                    {editingId === prefill.id ? (
                      // Edit Mode
                      <>
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-dark-text mb-1">
                            名称 (最多10字)
                          </label>
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="bg-dark-bg border-dark-border"
                            maxLength={50}
                          />
                        </div>
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-dark-text mb-1">
                            提示文本 (最多200字)
                          </label>
                          <Textarea
                            value={editingPromptText}
                            onChange={(e) => setEditingPromptText(e.target.value)}
                            className="bg-dark-bg border-dark-border font-mono text-sm"
                            rows={6}
                            maxLength={1000}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            size="sm"
                            className="flex-1"
                          >
                            {isSaving ? <LoadingSpinner size="sm" /> : '保存'}
                          </Button>
                          <Button
                            onClick={handleCancelEdit}
                            variant="outline"
                            disabled={isSaving}
                            size="sm"
                            className="flex-1"
                          >
                            取消
                          </Button>
                        </div>
                      </>
                    ) : (
                      // View Mode
                      <>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-dark-text">{prefill.name}</h3>
                              {prefill.is_default && (
                                <span className="px-2 py-0.5 text-xs bg-blue-500/10 border border-blue-500/30 rounded text-blue-400">
                                  默认
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-dark-text-muted whitespace-pre-wrap">
                              {prefill.prompt_text}
                            </p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            <button
                              onClick={() => handleStartEdit(prefill)}
                              className="p-1.5 text-dark-text-muted hover:text-dark-primary transition-colors"
                              title="编辑"
                            >
                              <Edit2 size={16} />
                            </button>
                            {!prefill.is_default && (
                              <button
                                onClick={() => handleDelete(prefill.id, prefill.is_default)}
                                className="p-1.5 text-dark-text-muted hover:text-red-400 transition-colors"
                                title="删除"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-dark-border">
          <Button onClick={onClose} variant="outline">
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
};
