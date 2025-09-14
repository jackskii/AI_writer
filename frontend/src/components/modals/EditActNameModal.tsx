import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';

interface EditActNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (actName: string) => void;
  currentName?: string;
  actNumber: number;
}

export const EditActNameModal: React.FC<EditActNameModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentName = '',
  actNumber
}) => {
  const [actName, setActName] = useState(currentName);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(actName.trim());
    onClose();
  };

  const handleCancel = () => {
    setActName(currentName);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-96 max-w-[90vw]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-dark-text">
            编辑第{actNumber}卷名称
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="p-1 hover:bg-dark-bg"
          >
            <X size={16} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-text mb-2">
              卷名称
            </label>
            <input
              type="text"
              value={actName}
              onChange={(e) => setActName(e.target.value)}
              placeholder={`第${actNumber}卷`}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-md text-dark-text placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-primary focus:border-transparent"
              autoFocus
            />
            <p className="text-xs text-dark-text-muted mt-1">
              留空将显示默认名称"第{actNumber}卷"
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
            >
              取消
            </Button>
            <Button type="submit">
              保存
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};