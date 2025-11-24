import React, { useState, useEffect } from 'react';
import { X, Settings, Type, Palette, Clock, Brain, Key, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { authApi } from '../../services/authApi';
import { LoadingSpinner } from '../ui/Loading';

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

  // API Key management
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load settings when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  // Listen for custom event to open settings modal (from API error)
  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent) => {
      if (event.detail?.reason) {
        setSaveMessage({ type: 'error', text: event.detail.reason });
      }
      // Trigger parent to open modal if not already open
      if (!isOpen) {
        // This assumes the parent component also listens to the UIStore
        // We'll update pages to use UIStore for settings modal
      }
    };

    window.addEventListener('openSettingsModal', handleOpenSettings as EventListener);
    return () => {
      window.removeEventListener('openSettingsModal', handleOpenSettings as EventListener);
    };
  }, [isOpen, onClose]);

  const loadSettings = async () => {
    setIsLoadingSettings(true);
    try {
      const settings = await authApi.getSettings();
      setMaskedApiKey(settings.masked_api_key);
      setHasApiKey(settings.has_api_key);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setSaveMessage({ type: 'error', text: '请输入API密钥' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await authApi.updateSettings({ deepseek_api_key: apiKey });
      setMaskedApiKey(response.data.masked_api_key);
      setHasApiKey(response.data.has_api_key);
      setApiKey('');
      setShowApiKey(false);
      setSaveMessage({ type: 'success', text: 'API密钥已保存' });

      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error: any) {
      console.error('Failed to save API key:', error);
      setSaveMessage({
        type: 'error',
        text: error.response?.data?.error || 'API密钥保存失败'
      });
    } finally {
      setIsSaving(false);
    }
  };

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
          {/* API Key Section */}
          <div className="space-y-3 pb-6 border-b border-dark-border">
            <div className="flex items-center gap-2">
              <Key size={18} className="text-dark-text-muted" />
              <label className="text-sm font-medium text-dark-text">DeepSeek API密钥</label>
            </div>

            {isLoadingSettings ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Current API Key Status */}
                {hasApiKey && (
                  <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-dark-text-muted mb-1">当前密钥</p>
                        <p className="text-sm text-dark-text font-mono">{maskedApiKey}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs text-green-500">已配置</span>
                      </div>
                    </div>
                  </div>
                )}

                {!hasApiKey && (
                  <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
                    <p className="text-sm text-yellow-300">
                      ⚠️ 未配置API密钥。使用AI功能前需要配置DeepSeek API密钥。
                    </p>
                  </div>
                )}

                {/* API Key Input */}
                <div className="space-y-2">
                  <label className="text-xs text-dark-text-muted">
                    {hasApiKey ? '更新API密钥' : '输入API密钥'}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="bg-dark-bg border-dark-border font-mono text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-text-muted hover:text-dark-text"
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <Button
                      onClick={handleSaveApiKey}
                      disabled={isSaving || !apiKey.trim()}
                      className="flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <LoadingSpinner size="sm" />
                          保存中
                        </>
                      ) : (
                        '保存'
                      )}
                    </Button>
                  </div>

                  {/* Save Message */}
                  {saveMessage && (
                    <div className={`text-xs ${saveMessage.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                      {saveMessage.text}
                    </div>
                  )}

                  <p className="text-xs text-dark-text-muted">
                    API密钥将被加密存储。获取密钥：
                    <a
                      href="https://platform.deepseek.com/api_keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dark-primary hover:underline ml-1"
                    >
                      DeepSeek官网
                    </a>
                  </p>
                </div>
              </div>
            )}
          </div>

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