import React from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface DeleteActConfirmDialogProps {
  act: number | null;
  actName?: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export const DeleteActConfirmDialog: React.FC<DeleteActConfirmDialogProps> = ({
  act,
  actName,
  isOpen,
  onClose,
  onConfirm,
  isDeleting
}) => {
  if (!isOpen || !act) return null;

  const displayName = actName || `第${act}卷`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-96 max-w-[90vw]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-dark-text">
              删除卷
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1 hover:bg-dark-bg"
          >
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-4">
          <p className="text-dark-text">
            确定要删除 <span className="font-semibold text-red-400">{displayName}</span> 吗？
          </p>
          
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <p className="text-sm text-red-300">
              <strong>注意：</strong>此操作不可撤销。只有空卷（不包含任何章节）才能被删除。
            </p>
          </div>

          <div className="flex justify-end gap-3">
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
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
            >
              {isDeleting ? (
                <>删除中...</>
              ) : (
                <>
                  <Trash2 size={16} />
                  删除卷
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};