import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Plus, Minus } from 'lucide-react';
import { loreApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Card, CardHeader, CardContent } from '../ui/Card';
import type { LoreEntry } from '../../types';

interface CreateLoreModalProps {
  workId: number;
  isOpen: boolean;
  onClose: () => void;
  onLoreCreated: (lore: LoreEntry) => void;
  editEntry?: LoreEntry | null;
}

export const CreateLoreModal: React.FC<CreateLoreModalProps> = ({
  workId,
  isOpen,
  onClose,
  onLoreCreated,
  editEntry
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggers, setTriggers] = useState<string[]>(['']);
  
  const isEditMode = !!editEntry;

  // Populate form when editing
  useEffect(() => {
    if (editEntry) {
      setName(editEntry.name);
      setDescription(editEntry.description);
      setTriggers(editEntry.triggers.length > 0 ? editEntry.triggers : ['']);
    } else {
      setName('');
      setDescription('');
      setTriggers(['']);
    }
  }, [editEntry]);

  const saveMutation = useMutation({
    mutationFn: (loreData: { name: string; description: string; triggers: string[] }) => {
      if (isEditMode && editEntry) {
        return loreApi.update(workId, editEntry.id, loreData);
      } else {
        return loreApi.create(workId, loreData);
      }
    },
    onSuccess: (response) => {
      onLoreCreated(response.data);
      // Reset form
      if (!isEditMode) {
        setName('');
        setDescription('');
        setTriggers(['']);
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // Filter out empty triggers
    const validTriggers = triggers.filter(t => t.trim()).map(t => t.trim());
    
    saveMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      triggers: validTriggers
    });
  };

  const addTrigger = () => {
    setTriggers([...triggers, '']);
  };

  const removeTrigger = (index: number) => {
    if (triggers.length > 1) {
      setTriggers(triggers.filter((_, i) => i !== index));
    }
  };

  const updateTrigger = (index: number, value: string) => {
    const newTriggers = [...triggers];
    newTriggers[index] = value;
    setTriggers(newTriggers);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-dark-text">
              {isEditMode ? '编辑世界观条目' : '添加世界观条目'}
            </h3>
            <button
              onClick={onClose}
              className="text-dark-text-muted hover:text-dark-text"
            >
              <X size={20} />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="条目名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：主角、魔法系统、世界背景..."
              required
              autoFocus
            />
            
            <Textarea
              label="详细描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细描述这个条目的内容、特征、背景等信息..."
              rows={4}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-dark-text">
                触发词 <span className="text-dark-text-muted">(可选)</span>
              </label>
              <p className="text-xs text-dark-text-muted mb-3">
                当故事中出现这些词时，AI会自动加载相关背景信息
              </p>
              {triggers.map((trigger, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={trigger}
                    onChange={(e) => updateTrigger(index, e.target.value)}
                    placeholder="输入触发词..."
                    className="flex-1"
                  />
                  {triggers.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeTrigger(index)}
                      className="px-2"
                    >
                      <Minus size={16} />
                    </Button>
                  )}
                  {index === triggers.length - 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addTrigger}
                      className="px-2"
                    >
                      <Plus size={16} />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending 
                  ? (isEditMode ? '保存中...' : '创建中...') 
                  : (isEditMode ? '保存修改' : '创建条目')
                }
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};