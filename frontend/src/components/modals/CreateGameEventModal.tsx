import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { gameEventsApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import type { GameEvent } from '../../types';

interface CreateGameEventModalProps {
  workId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editEvent?: GameEvent | null;
}

export const CreateGameEventModal: React.FC<CreateGameEventModalProps> = ({
  workId,
  isOpen,
  onClose,
  onSuccess,
  editEvent,
}) => {
  const [name, setName] = useState('');
  const [settingDescription, setSettingDescription] = useState('');
  const [goal, setGoal] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editEvent) {
      setName(editEvent.name);
      setSettingDescription(editEvent.setting_description || '');
      setGoal(editEvent.goal || '');
    } else {
      setName('');
      setSettingDescription('');
      setGoal('');
    }
  }, [isOpen, editEvent?.id]);

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; setting_description: string; goal: string }) => {
      if (editEvent) {
        return gameEventsApi.update(workId, editEvent.id, data);
      }
      return gameEventsApi.create(workId, data);
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveMutation.mutate({
      name: name.trim(),
      setting_description: settingDescription.trim(),
      goal: goal.trim(),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-dark-surface border border-dark-border rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h3 className="text-lg font-semibold text-dark-text">
            {editEvent ? '编辑事件' : '新建事件'}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-dark-text-muted hover:text-dark-text">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">事件名称</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：课后与 Tia 的对话"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">场景描述</label>
              <Textarea
                value={settingDescription}
                onChange={(e) => setSettingDescription(e.target.value)}
                placeholder="给 AI 的场景/背景描述，用于生成开场"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">事件目标</label>
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="事件要达成的目标或主题"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border">
            <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={saveMutation.isPending || !name.trim()}>
              {saveMutation.isPending ? '保存中...' : editEvent ? '保存' : '创建'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
