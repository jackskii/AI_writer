import React, { useState } from 'react';
import { X, Settings, Type, Palette, Clock, Brain } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardContent } from '../ui/Card';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const [fontSize, setFontSize] = useState('medium');
  const [theme, setTheme] = useState('dark');
  const [autoSaveInterval, setAutoSaveInterval] = useState('5');
  const [aiSuggestions, setAiSuggestions] = useState('auto');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings size={20} className="text-dark-primary" />
              <h3 className="text-lg font-semibold text-dark-text">应用设置</h3>
            </div>
            <button
              onClick={onClose}
              className="text-dark-text-muted hover:text-dark-text"
            >
              <X size={20} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Font Size */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Type size={18} className="text-dark-text-muted" />
              <label className="text-sm font-medium text-dark-text">字体大小</label>
            </div>
            <div className="flex gap-2">
              {['small', 'medium', 'large'].map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`px-3 py-2 rounded-md text-sm transition-colors ${
                    fontSize === size
                      ? 'bg-dark-primary text-white'
                      : 'bg-dark-surface text-dark-text-muted hover:bg-dark-border'
                  }`}
                >
                  {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Palette size={18} className="text-dark-text-muted" />
              <label className="text-sm font-medium text-dark-text">背景主题</label>
            </div>
            <div className="flex gap-2">
              {[
                { id: 'dark', label: '深色' },
                { id: 'light', label: '浅色' },
                { id: 'sepia', label: '护眼' }
              ].map((themeOption) => (
                <button
                  key={themeOption.id}
                  onClick={() => setTheme(themeOption.id)}
                  className={`px-3 py-2 rounded-md text-sm transition-colors ${
                    theme === themeOption.id
                      ? 'bg-dark-primary text-white'
                      : 'bg-dark-surface text-dark-text-muted hover:bg-dark-border'
                  }`}
                >
                  {themeOption.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-save Interval */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-dark-text-muted" />
              <label className="text-sm font-medium text-dark-text">自动保存间隔</label>
            </div>
            <div className="flex gap-2">
              {[
                { id: '3', label: '3秒' },
                { id: '5', label: '5秒' },
                { id: '10', label: '10秒' },
                { id: 'off', label: '关闭' }
              ].map((interval) => (
                <button
                  key={interval.id}
                  onClick={() => setAutoSaveInterval(interval.id)}
                  className={`px-3 py-2 rounded-md text-sm transition-colors ${
                    autoSaveInterval === interval.id
                      ? 'bg-dark-primary text-white'
                      : 'bg-dark-surface text-dark-text-muted hover:bg-dark-border'
                  }`}
                >
                  {interval.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Suggestions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain size={18} className="text-dark-text-muted" />
              <label className="text-sm font-medium text-dark-text">AI建议</label>
            </div>
            <div className="flex gap-2">
              {[
                { id: 'auto', label: '自动' },
                { id: 'manual', label: '手动' },
                { id: 'off', label: '关闭' }
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setAiSuggestions(option.id)}
                  className={`px-3 py-2 rounded-md text-sm transition-colors ${
                    aiSuggestions === option.id
                      ? 'bg-dark-primary text-white'
                      : 'bg-dark-surface text-dark-text-muted hover:bg-dark-border'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Development Notice */}
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
            <p className="text-sm text-yellow-300 text-center">
              ⚠️ 功能开发中，设置暂不生效
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              onClick={onClose}
              disabled
            >
              保存设置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};