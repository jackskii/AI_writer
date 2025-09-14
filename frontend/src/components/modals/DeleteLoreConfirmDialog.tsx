import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardContent } from '../ui/Card';
import type { LoreEntry } from '../../types';

interface DeleteLoreConfirmDialogProps {
  loreEntry: LoreEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export const DeleteLoreConfirmDialog: React.FC<DeleteLoreConfirmDialogProps> = ({
  loreEntry,
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false
}) => {
  if (!isOpen || !loreEntry) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      onConfirm();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-dark-text">确认删除世界观条目</h3>
              <p className="text-sm text-dark-text-muted">此操作无法撤销</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-dark-text">
            确定要删除世界观条目 <strong className="text-dark-primary">"{loreEntry.name}"</strong> 吗？
          </p>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={onConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? '删除中...' : '确认删除'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};