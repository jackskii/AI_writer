import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, RotateCcw } from 'lucide-react';
import { worksApi, aiApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { LoadingSpinner } from '../ui/Loading';
import type { Work } from '../../types';

interface LoreTemplateModalProps {
  work: Work;
  isOpen: boolean;
  onClose: () => void;
}

export const LoreTemplateModal: React.FC<LoreTemplateModalProps> = ({
  work,
  isOpen,
  onClose
}) => {
  const [template, setTemplate] = useState('');
  const [defaultTemplate, setDefaultTemplate] = useState('');
  const [isLoadingDefault, setIsLoadingDefault] = useState(false);
  const queryClient = useQueryClient();

  // Load current template and default template when modal opens
  useEffect(() => {
    if (isOpen) {
      // Set current template from work
      setTemplate(work.lore_entry_template || '');
      
      // Fetch default template
      const fetchDefault = async () => {
        setIsLoadingDefault(true);
        try {
          const response = await aiApi.getDefaultLoreTemplate();
          setDefaultTemplate(response.data.template);
          // If work doesn't have a custom template, use default
          if (!work.lore_entry_template) {
            setTemplate(response.data.template);
          }
        } catch (error) {
          console.error('Failed to fetch default template:', error);
        } finally {
          setIsLoadingDefault(false);
        }
      };
      fetchDefault();
    }
  }, [isOpen, work.lore_entry_template]);

  const saveMutation = useMutation({
    mutationFn: (newTemplate: string) => 
      worksApi.update(work.id, { lore_entry_template: newTemplate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work', work.id] });
      onClose();
    }
  });

  const handleSave = () => {
    saveMutation.mutate(template);
  };

  const handleResetToDefault = () => {
    setTemplate(defaultTemplate);
  };

  const handleClear = () => {
    // Clear custom template (will use default)
    saveMutation.mutate('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-dark-text">条目生成模板</h3>
              <p className="text-sm text-dark-text-muted mt-1">
                自定义AI生成世界观条目的格式和规则
              </p>
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
          {isLoadingDefault ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" />
              <span className="ml-2 text-dark-text-muted">加载模板中...</span>
            </div>
          ) : (
            <>
              <div className="p-3 bg-dark-bg rounded-lg border border-dark-border text-sm text-dark-text-muted">
                <p>此模板定义了AI生成条目描述时的格式和规则。</p>
                <p className="mt-1">修改后将应用于本作品所有的"AI自动描述"功能。</p>
              </div>

              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="输入自定义模板..."
                rows={15}
                className="font-mono text-sm"
              />

              <div className="flex items-center justify-between pt-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetToDefault}
                    className="flex items-center gap-1"
                    title="恢复为默认模板"
                  >
                    <RotateCcw size={14} />
                    恢复默认
                  </Button>
                  {work.lore_entry_template && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClear}
                      className="text-red-400 hover:text-red-300"
                    >
                      清除自定义
                    </Button>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? '保存中...' : '保存模板'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
