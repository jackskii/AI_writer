import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardContent } from '../ui/Card';
import type { Note } from '../../types';

interface DeleteNoteConfirmDialogProps {
  note: Note | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export const DeleteNoteConfirmDialog: React.FC<DeleteNoteConfirmDialogProps> = ({
  note,
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false
}) => {
  if (!isOpen || !note) return null;

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
              <h3 className="text-lg font-semibold text-dark-text">确认删除笔记</h3>
              <p className="text-sm text-dark-text-muted">此操作无法撤销</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-dark-surface rounded-lg p-3 border border-dark-border">
            <p className="text-sm text-dark-text-muted">即将删除的笔记：</p>
            <p className="font-medium text-dark-text line-clamp-2">{note.content}</p>
            {note.linked_text && (
              <div className="mt-2 p-2 bg-dark-bg rounded border border-dark-border">
                <p className="text-xs text-dark-text-muted mb-1">关联文本：</p>
                <p className="text-sm text-dark-text-muted line-clamp-2">"{note.linked_text}"</p>
              </div>
            )}
          </div>

          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-300">
                <p className="font-medium">警告</p>
                <p>删除笔记后无法恢复，请确认是否继续。</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="outline"
              onClick={onConfirm}
              disabled={isDeleting}
              className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
            >
              {isDeleting ? '删除中...' : '确认删除'}
            </Button>
          </div>

          <div className="text-xs text-dark-text-muted text-center border-t pt-3">
            <p>快捷键：Enter 确认删除，Esc 取消</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};