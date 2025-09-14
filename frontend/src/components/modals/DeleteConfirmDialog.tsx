import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardContent } from '../ui/Card';
import type { Chapter } from '../../types';

interface DeleteConfirmDialogProps {
  chapter: Chapter | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  chapter,
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false
}) => {
  if (!isOpen || !chapter) return null;

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
              <h3 className="text-lg font-semibold text-dark-text">确认删除章节</h3>
              <p className="text-sm text-dark-text-muted">此操作无法撤销</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-dark-surface rounded-lg p-3 border border-dark-border">
            <p className="text-sm text-dark-text-muted">即将删除：</p>
            <p className="font-medium text-dark-text">第{chapter.order}章 {chapter.title}</p>
            {chapter.word_count > 0 && (
              <p className="text-xs text-dark-text-muted mt-1">
                包含 {chapter.word_count.toLocaleString()} 字的内容
              </p>
            )}
          </div>

          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-300">
                <p className="font-medium">警告</p>
                <p>删除章节将永久丢失该章节的所有内容、摘要和相关笔记。</p>
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