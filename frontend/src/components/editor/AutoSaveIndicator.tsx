import React from 'react';
import { Save, Check, Clock } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';

export const AutoSaveIndicator: React.FC = () => {
  const { isAutoSaving, lastSaveTime } = useUIStore();

  const formatSaveTime = (time: Date) => {
    const now = new Date();
    const diff = now.getTime() - time.getTime();
    
    if (diff < 60000) { // Less than 1 minute
      return '刚刚保存';
    } else if (diff < 3600000) { // Less than 1 hour
      const minutes = Math.floor(diff / 60000);
      return `${minutes}分钟前保存`;
    } else {
      return time.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm text-dark-text-muted">
      {isAutoSaving ? (
        <>
          <Save size={14} className="animate-pulse" />
          <span>自动保存中...</span>
        </>
      ) : lastSaveTime ? (
        <>
          <Check size={14} className="text-green-400" />
          <span>{formatSaveTime(lastSaveTime)}</span>
        </>
      ) : (
        <>
          <Clock size={14} />
          <span>未保存</span>
        </>
      )}
    </div>
  );
};