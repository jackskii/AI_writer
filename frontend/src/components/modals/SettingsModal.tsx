import React, { useState, useEffect, useCallback } from 'react';
import { X, Settings, Key, Eye, EyeOff, ChevronDown, ChevronRight, Cpu, Palette, Sun, Moon } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { authApi } from '../../services/authApi';
import type { UserSettings } from '../../services/authApi';
import { LoadingSpinner } from '../ui/Loading';
import { useUIStore } from '../../stores/useUIStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExpandedSections {
  api: boolean;
  ai: boolean;
  visual: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { theme, setTheme } = useUIStore();

  const [expandedSections, setExpandedSections] = useState<ExpandedSections>({
    api: true,
    ai: true,
    visual: true
  });

  // API Key management
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiProvider, setApiProvider] = useState('deepseek');

  // AI Settings
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.0);
  const [presencePenalty, setPresencePenalty] = useState(0.0);

  // Loading states
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Original settings for comparison
  const [originalSettings, setOriginalSettings] = useState<Partial<UserSettings>>({});

  // Load settings function
  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const settings = await authApi.getSettings();
      setMaskedApiKey(settings.masked_api_key);
      setHasApiKey(settings.has_api_key);
      setApiProvider(settings.api_provider || 'deepseek');
      setTemperature(settings.temperature);
      setTopP(settings.top_p);
      setMaxTokens(settings.max_tokens);
      setFrequencyPenalty(settings.frequency_penalty);
      setPresencePenalty(settings.presence_penalty);

      // Sync theme from backend
      if (settings.theme && settings.theme !== theme) {
        setTheme(settings.theme);
      }

      // Store original settings
      setOriginalSettings({
        temperature: settings.temperature,
        top_p: settings.top_p,
        max_tokens: settings.max_tokens,
        frequency_penalty: settings.frequency_penalty,
        presence_penalty: settings.presence_penalty,
        theme: settings.theme
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [theme, setTheme]);

  // Load settings when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen, loadSettings]);

  // Listen for custom event to open settings modal (from API error)
  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent) => {
      if (event.detail?.reason) {
        setSaveMessage({ type: 'error', text: event.detail.reason });
      }
    };

    window.addEventListener('openSettingsModal', handleOpenSettings as EventListener);
    return () => {
      window.removeEventListener('openSettingsModal', handleOpenSettings as EventListener);
    };
  }, [isOpen]);

  // Check for unsaved changes
  useEffect(() => {
    const hasChanges =
      temperature !== originalSettings.temperature ||
      topP !== originalSettings.top_p ||
      maxTokens !== originalSettings.max_tokens ||
      frequencyPenalty !== originalSettings.frequency_penalty ||
      presencePenalty !== originalSettings.presence_penalty ||
      theme !== originalSettings.theme ||
      apiKey.trim() !== '';

    setHasUnsavedChanges(hasChanges);
  }, [temperature, topP, maxTokens, frequencyPenalty, presencePenalty, theme, apiKey, originalSettings]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const updateData: Record<string, string | number> = {};

      // Only include changed values
      if (apiKey.trim()) {
        updateData.deepseek_api_key = apiKey;
      }
      if (temperature !== originalSettings.temperature) {
        updateData.temperature = temperature;
      }
      if (topP !== originalSettings.top_p) {
        updateData.top_p = topP;
      }
      if (maxTokens !== originalSettings.max_tokens) {
        updateData.max_tokens = maxTokens;
      }
      if (frequencyPenalty !== originalSettings.frequency_penalty) {
        updateData.frequency_penalty = frequencyPenalty;
      }
      if (presencePenalty !== originalSettings.presence_penalty) {
        updateData.presence_penalty = presencePenalty;
      }
      if (theme !== originalSettings.theme) {
        updateData.theme = theme;
      }

      if (Object.keys(updateData).length === 0) {
        setSaveMessage({ type: 'error', text: '没有需要保存的更改' });
        setIsSaving(false);
        return;
      }

      const response = await authApi.updateSettings(updateData);

      // Update local state with new values
      setMaskedApiKey(response.data.masked_api_key);
      setHasApiKey(response.data.has_api_key);
      setApiKey('');
      setShowApiKey(false);

      // Update original settings
      setOriginalSettings({
        temperature: response.data.temperature,
        top_p: response.data.top_p,
        max_tokens: response.data.max_tokens,
        frequency_penalty: response.data.frequency_penalty,
        presence_penalty: response.data.presence_penalty,
        theme: response.data.theme
      });

      setSaveMessage({ type: 'success', text: '设置已保存' });
      setHasUnsavedChanges(false);

      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error: unknown) {
      console.error('Failed to save settings:', error);
      const errorMessage = error instanceof Error ? error.message : '设置保存失败';
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSaveMessage({
        type: 'error',
        text: axiosError.response?.data?.error || errorMessage
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSection = (section: keyof ExpandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
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
        <CardContent className="space-y-4">
          {isLoadingSettings ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <>
              {/* API Settings Section */}
              <div className="border border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('api')}
                  className="w-full flex items-center justify-between p-3 bg-dark-surface hover:bg-dark-border/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Key size={18} className="text-dark-primary" />
                    <span className="font-medium text-dark-text">API 设置</span>
                  </div>
                  {expandedSections.api ? (
                    <ChevronDown size={18} className="text-dark-text-muted" />
                  ) : (
                    <ChevronRight size={18} className="text-dark-text-muted" />
                  )}
                </button>

                {expandedSections.api && (
                  <div className="p-4 space-y-4 border-t border-dark-border">
                    {/* Provider Selection */}
                    <div className="space-y-2">
                      <label className="text-sm text-dark-text-muted">API 提供商</label>
                      <select
                        value={apiProvider}
                        disabled
                        className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text text-sm cursor-not-allowed opacity-60"
                      >
                        <option value="deepseek">DeepSeek</option>
                      </select>
                      <p className="text-xs text-dark-text-muted">目前仅支持 DeepSeek</p>
                    </div>

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
                          未配置API密钥。使用AI功能前需要配置DeepSeek API密钥。
                        </p>
                      </div>
                    )}

                    {/* API Key Input */}
                    <div className="space-y-2">
                      <label className="text-sm text-dark-text-muted">
                        {hasApiKey ? '更新 API 密钥' : '输入 API 密钥'}
                      </label>
                      <div className="relative">
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

              {/* AI Settings Section */}
              <div className="border border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('ai')}
                  className="w-full flex items-center justify-between p-3 bg-dark-surface hover:bg-dark-border/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Cpu size={18} className="text-dark-primary" />
                    <span className="font-medium text-dark-text">AI 设置</span>
                  </div>
                  {expandedSections.ai ? (
                    <ChevronDown size={18} className="text-dark-text-muted" />
                  ) : (
                    <ChevronRight size={18} className="text-dark-text-muted" />
                  )}
                </button>

                {expandedSections.ai && (
                  <div className="p-4 space-y-5 border-t border-dark-border">
                    {/* Temperature */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-dark-text">Temperature</label>
                        <span className="text-sm text-dark-primary font-mono">{temperature.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.01"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer slider"
                      />
                      <p className="text-xs text-dark-text-muted">控制输出的随机性。较低值更保守，较高值更有创意。</p>
                    </div>

                    {/* Top P */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-dark-text">Top P</label>
                        <span className="text-sm text-dark-primary font-mono">{topP.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={topP}
                        onChange={(e) => setTopP(parseFloat(e.target.value))}
                        className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer slider"
                      />
                      <p className="text-xs text-dark-text-muted">核采样参数。建议与Temperature二选一调整。</p>
                    </div>

                    {/* Max Tokens */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-dark-text">Max Tokens</label>
                        <span className="text-sm text-dark-primary font-mono">{maxTokens}</span>
                      </div>
                      <input
                        type="range"
                        min="100"
                        max="8000"
                        step="100"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                        className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer slider"
                      />
                      <p className="text-xs text-dark-text-muted">AI回复的最大长度限制。</p>
                    </div>

                    {/* Frequency Penalty */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-dark-text">Frequency Penalty</label>
                        <span className="text-sm text-dark-primary font-mono">{frequencyPenalty.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.01"
                        value={frequencyPenalty}
                        onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value))}
                        className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer slider"
                      />
                      <p className="text-xs text-dark-text-muted">降低重复词语的概率。正值减少重复。</p>
                    </div>

                    {/* Presence Penalty */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-dark-text">Presence Penalty</label>
                        <span className="text-sm text-dark-primary font-mono">{presencePenalty.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.01"
                        value={presencePenalty}
                        onChange={(e) => setPresencePenalty(parseFloat(e.target.value))}
                        className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer slider"
                      />
                      <p className="text-xs text-dark-text-muted">鼓励讨论新话题。正值增加话题多样性。</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Visual Settings Section */}
              <div className="border border-dark-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('visual')}
                  className="w-full flex items-center justify-between p-3 bg-dark-surface hover:bg-dark-border/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Palette size={18} className="text-dark-primary" />
                    <span className="font-medium text-dark-text">视觉设置</span>
                  </div>
                  {expandedSections.visual ? (
                    <ChevronDown size={18} className="text-dark-text-muted" />
                  ) : (
                    <ChevronRight size={18} className="text-dark-text-muted" />
                  )}
                </button>

                {expandedSections.visual && (
                  <div className="p-4 space-y-4 border-t border-dark-border">
                    {/* Theme Selection */}
                    <div className="space-y-3">
                      <label className="text-sm text-dark-text-muted">主题</label>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleThemeChange('dark')}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                            theme === 'dark'
                              ? 'bg-dark-primary border-dark-primary text-white'
                              : 'bg-dark-bg border-dark-border text-dark-text-muted hover:border-dark-text-muted'
                          }`}
                        >
                          <Moon size={18} />
                          <span>深色</span>
                        </button>
                        <button
                          onClick={() => handleThemeChange('light')}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all ${
                            theme === 'light'
                              ? 'bg-dark-primary border-dark-primary text-white'
                              : 'bg-dark-bg border-dark-border text-dark-text-muted hover:border-dark-text-muted'
                          }`}
                        >
                          <Sun size={18} />
                          <span>浅色</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Save Message */}
              {saveMessage && (
                <div className={`text-sm text-center py-2 rounded-lg ${
                  saveMessage.type === 'success'
                    ? 'bg-green-900/20 text-green-400'
                    : 'bg-red-900/20 text-red-400'
                }`}>
                  {saveMessage.text}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                >
                  取消
                </Button>
                <Button
                  onClick={handleSaveSettings}
                  disabled={isSaving || !hasUnsavedChanges}
                >
                  {isSaving ? (
                    <div className="flex items-center gap-2">
                      <LoadingSpinner size="sm" />
                      保存中
                    </div>
                  ) : (
                    '保存设置'
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <style>{`
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--color-primary);
          cursor: pointer;
          border: 2px solid var(--color-surface);
          box-shadow: 0 0 0 1px var(--color-primary);
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--color-primary);
          cursor: pointer;
          border: 2px solid var(--color-surface);
          box-shadow: 0 0 0 1px var(--color-primary);
        }
      `}</style>
    </div>
  );
};
