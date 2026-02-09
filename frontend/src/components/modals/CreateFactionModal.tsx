import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';

interface CreateFactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string) => void;
  editFaction?: {
    id: number;
    name: string;
    description: string;
  } | null;
}

export const CreateFactionModal: React.FC<CreateFactionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editFaction
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (editFaction) {
      setName(editFaction.name);
      setDescription(editFaction.description);
    } else {
      setName('');
      setDescription('');
    }
  }, [editFaction, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim(), description.trim());
      setName('');
      setDescription('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-dark-surface border border-dark-border rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-dark-text">
            {editFaction ? '编辑阵营' : '新建阵营'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-dark-text-muted hover:text-dark-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-text mb-2">
              阵营名称 <span className="text-red-400">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：主角团、反派势力、神秘组织..."
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-text mb-2">
              阵营描述
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述这个阵营的特点、背景、目标等..."
              rows={4}
            />
          </div>

          {/* Actions */}
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
              disabled={!name.trim()}
            >
              {editFaction ? '保存' : '创建'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
