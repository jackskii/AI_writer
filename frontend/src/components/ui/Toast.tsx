import React from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';

const typeStyles = {
  success: 'border-green-600/50 bg-green-900/90 text-green-100',
  error: 'border-red-600/50 bg-red-900/90 text-red-100',
  warning: 'border-amber-600/50 bg-amber-900/90 text-amber-100',
  info: 'border-blue-600/50 bg-blue-900/90 text-blue-100',
};

export const Toast: React.FC = () => {
  const { notifications, removeNotification } = useUIStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm ${typeStyles[n.type]}`}
        >
          <p className="flex-1">{n.message}</p>
          <button
            type="button"
            onClick={() => removeNotification(n.id)}
            className="opacity-70 hover:opacity-100 flex-shrink-0"
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
