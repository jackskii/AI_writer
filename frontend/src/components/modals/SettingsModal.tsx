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

  // API Key management - per provider
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [qwenApiKey, setQwenApiKey] = useState('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [maskedDeepseekApiKey, setMaskedDeepseekApiKey] = useState('');
  const [maskedQwenApiKey, setMaskedQwenApiKey] = useState('');
  const [maskedOpenrouterApiKey, setMaskedOpenrouterApiKey] = useState('');
  const [hasDeepseekApiKey, setHasDeepseekApiKey] = useState(false);
  const [hasQwenApiKey, setHasQwenApiKey] = useState(false);
  const [hasOpenrouterApiKey, setHasOpenrouterApiKey] = useState(false);
  const [apiProvider, setApiProvider] = useState<'deepseek' | 'qwen' | 'openrouter'>('deepseek');
  const [openrouterModel, setOpenrouterModel] = useState('x-ai/grok-4-fast');
  const [openrouterModels, setOpenrouterModels] = useState<Array<{ id: string; name: string }>>([]);
  const [isChangingDeepseekKey, setIsChangingDeepseekKey] = useState(false);
  const [isChangingQwenKey, setIsChangingQwenKey] = useState(false);
  const [isChangingOpenrouterKey, setIsChangingOpenrouterKey] = useState(false);

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

  // Original settings for comparison
  const [originalSettings, setOriginalSettings] = useState<Partial<UserSettings>>({});

  // Load settings function
  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    setSaveMessage(null);
    setDeepseekApiKey('');
    setQwenApiKey('');
    setOpenrouterApiKey('');
    setIsChangingDeepseekKey(false);
    setIsChangingQwenKey(false);
    setIsChangingOpenrouterKey(false);
    try {
      const settings = await authApi.getSettings();
      // Per-provider API key info
      setMaskedDeepseekApiKey(settings.masked_deepseek_api_key || '');
      setMaskedQwenApiKey(settings.masked_qwen_api_key || '');
      setMaskedOpenrouterApiKey(settings.masked_openrouter_api_key || '');
      setHasDeepseekApiKey(settings.has_deepseek_api_key || false);
      setHasQwenApiKey(settings.has_qwen_api_key || false);
      setHasOpenrouterApiKey(settings.has_openrouter_api_key || false);
      setApiProvider((settings.api_provider as 'deepseek' | 'qwen' | 'openrouter') || 'deepseek');
      setOpenrouterModel(settings.openrouter_model || 'x-ai/grok-4-fast');
      setOpenrouterModels(settings.openrouter_models || []);
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
        api_provider: settings.api_provider,
        openrouter_model: settings.openrouter_model,
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


  const handleApplyChanges = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const updateData: Record<string, string | number> = {};

      // Include provider if changed
      if (apiProvider !== originalSettings.api_provider) {
        updateData.api_provider = apiProvider;
      }

      // Include API keys if entered (per provider) - but not if user is in "changing" mode (they have their own confirm button)
      if (deepseekApiKey.trim() && !isChangingDeepseekKey) {
        updateData.deepseek_api_key = deepseekApiKey;
      }
      if (qwenApiKey.trim() && !isChangingQwenKey) {
        updateData.qwen_api_key = qwenApiKey;
      }
      if (openrouterApiKey.trim() && !isChangingOpenrouterKey) {
        updateData.openrouter_api_key = openrouterApiKey;
      }
      if (openrouterModel && openrouterModel !== originalSettings.openrouter_model) {
        updateData.openrouter_model = openrouterModel;
      }

      // Only include changed values
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
      setMaskedDeepseekApiKey(response.data.masked_deepseek_api_key || '');
      setMaskedQwenApiKey(response.data.masked_qwen_api_key || '');
      setMaskedOpenrouterApiKey(response.data.masked_openrouter_api_key || '');
      setHasDeepseekApiKey(response.data.has_deepseek_api_key || false);
      setHasQwenApiKey(response.data.has_qwen_api_key || false);
      setHasOpenrouterApiKey(response.data.has_openrouter_api_key || false);
      setDeepseekApiKey('');
      setQwenApiKey('');
      setOpenrouterApiKey('');
      setShowApiKey(false);
      setIsChangingDeepseekKey(false);
      setIsChangingQwenKey(false);
      setIsChangingOpenrouterKey(false);

      // Update original settings
      setOriginalSettings({
        api_provider: response.data.api_provider,
        openrouter_model: response.data.openrouter_model,
        temperature: response.data.temperature,
        top_p: response.data.top_p,
        max_tokens: response.data.max_tokens,
        frequency_penalty: response.data.frequency_penalty,
        presence_penalty: response.data.presence_penalty,
        theme: response.data.theme
      });

      setSaveMessage({ type: 'success', text: '设置已应用' });

      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error: unknown) {
      console.error('Failed to apply settings:', error);
      const errorMessage = error instanceof Error ? error.message : '设置应用失败';
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSaveMessage({
        type: 'error',
        text: axiosError.response?.data?.error || errorMessage
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset any unsaved changes
    setDeepseekApiKey('');
    setQwenApiKey('');
    setOpenrouterApiKey('');
    setIsChangingDeepseekKey(false);
    setIsChangingQwenKey(false);
    setIsChangingOpenrouterKey(false);
    onClose();
  };

  const handleSave = async () => {
    // Apply changes first, then close
    await handleApplyChanges();
    if (!saveMessage || saveMessage.type === 'success') {
      onClose();
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
                        onChange={(e) => setApiProvider(e.target.value as 'deepseek' | 'qwen' | 'openrouter')}
                        className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text text-sm focus:outline-none focus:border-dark-primary"
                      >
                        <option value="deepseek">DeepSeek</option>
                        <option value="qwen">Qwen (通义千问)</option>
                        <option value="openrouter">OpenRouter</option>
                      </select>
                      <p className="text-xs text-dark-text-muted">选择您要使用的AI服务提供商</p>
                    </div>

                    {apiProvider === 'openrouter' && (
                      <div className="space-y-2">
                        <label className="text-sm text-dark-text-muted">OpenRouter 模型</label>
                        <select
                          value={openrouterModel}
                          onChange={(e) => setOpenrouterModel(e.target.value)}
                          className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text text-sm focus:outline-none focus:border-dark-primary"
                        >
                          {openrouterModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name} : {model.id}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-dark-text-muted">模型列表由后端配置统一下发，便于后续增删更新。</p>
                      </div>
                    )}

                    {/* API Key Section - shows based on selected provider */}
                    {apiProvider === 'deepseek' ? (
                      <div className="space-y-3 p-3 rounded-lg border border-dark-primary bg-dark-primary/5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-dark-text">DeepSeek API 密钥</span>
                          {hasDeepseekApiKey && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-xs text-green-500">已配置</span>
                            </div>
                          )}
                        </div>

                        {hasDeepseekApiKey && !isChangingDeepseekKey && (
                          <p className="text-sm text-dark-text font-mono">{maskedDeepseekApiKey}</p>
                        )}

                        {!hasDeepseekApiKey || isChangingDeepseekKey ? (
                          <>
                            <div className="relative">
                              <Input
                                type={showApiKey ? 'text' : 'password'}
                                value={deepseekApiKey}
                                onChange={(e) => setDeepseekApiKey(e.target.value)}
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
                            {isChangingDeepseekKey && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    if (deepseekApiKey.trim()) {
                                      setIsSaving(true);
                                      try {
                                        const response = await authApi.updateSettings({
                                          deepseek_api_key: deepseekApiKey.trim()
                                        });
                                        setMaskedDeepseekApiKey(response.data.masked_deepseek_api_key || '');
                                        setHasDeepseekApiKey(response.data.has_deepseek_api_key || false);
                                        setDeepseekApiKey('');
                                        setIsChangingDeepseekKey(false);
                                        setShowApiKey(false);
                                        setSaveMessage({ type: 'success', text: 'API密钥已更新' });
                                        setTimeout(() => setSaveMessage(null), 3000);
                                      } catch (error: unknown) {
                                        const axiosError = error as { response?: { data?: { error?: string } } };
                                        setSaveMessage({
                                          type: 'error',
                                          text: axiosError.response?.data?.error || '更新失败'
                                        });
                                      } finally {
                                        setIsSaving(false);
                                      }
                                    }
                                  }}
                                  disabled={isSaving || !deepseekApiKey.trim()}
                                  className="text-xs"
                                >
                                  确定
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setDeepseekApiKey('');
                                    setIsChangingDeepseekKey(false);
                                    setShowApiKey(false);
                                  }}
                                  disabled={isSaving}
                                  className="text-xs"
                                >
                                  取消
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsChangingDeepseekKey(true)}
                            className="text-xs"
                          >
                            更改密钥
                          </Button>
                        )}
                        <p className="text-xs text-dark-text-muted">
                          获取密钥：
                          <a
                            href="https://platform.deepseek.com/api_keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-dark-primary hover:underline ml-1"
                          >
                            DeepSeek官网
                          </a>
                        </p>

                        {!hasDeepseekApiKey && !deepseekApiKey.trim() && (
                          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 mt-2">
                            <p className="text-sm text-yellow-300">
                              未配置API密钥。使用AI功能前需要配置API密钥。
                            </p>
                          </div>
                        )}
                      </div>
                    ) : apiProvider === 'qwen' ? (
                      <div className="space-y-3 p-3 rounded-lg border border-dark-primary bg-dark-primary/5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-dark-text">Qwen (通义千问) API 密钥</span>
                          {hasQwenApiKey && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-xs text-green-500">已配置</span>
                            </div>
                          )}
                        </div>

                        {hasQwenApiKey && !isChangingQwenKey && (
                          <p className="text-sm text-dark-text font-mono">{maskedQwenApiKey}</p>
                        )}

                        {!hasQwenApiKey || isChangingQwenKey ? (
                          <>
                            <div className="relative">
                              <Input
                                type={showApiKey ? 'text' : 'password'}
                                value={qwenApiKey}
                                onChange={(e) => setQwenApiKey(e.target.value)}
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
                            {isChangingQwenKey && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    if (qwenApiKey.trim()) {
                                      setIsSaving(true);
                                      try {
                                        const response = await authApi.updateSettings({
                                          qwen_api_key: qwenApiKey.trim()
                                        });
                                        setMaskedQwenApiKey(response.data.masked_qwen_api_key || '');
                                        setHasQwenApiKey(response.data.has_qwen_api_key || false);
                                        setQwenApiKey('');
                                        setIsChangingQwenKey(false);
                                        setShowApiKey(false);
                                        setSaveMessage({ type: 'success', text: 'API密钥已更新' });
                                        setTimeout(() => setSaveMessage(null), 3000);
                                      } catch (error: unknown) {
                                        const axiosError = error as { response?: { data?: { error?: string } } };
                                        setSaveMessage({
                                          type: 'error',
                                          text: axiosError.response?.data?.error || '更新失败'
                                        });
                                      } finally {
                                        setIsSaving(false);
                                      }
                                    }
                                  }}
                                  disabled={isSaving || !qwenApiKey.trim()}
                                  className="text-xs"
                                >
                                  确定
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setQwenApiKey('');
                                    setIsChangingQwenKey(false);
                                    setShowApiKey(false);
                                  }}
                                  disabled={isSaving}
                                  className="text-xs"
                                >
                                  取消
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsChangingQwenKey(true)}
                            className="text-xs"
                          >
                            更改密钥
                          </Button>
                        )}
                        <p className="text-xs text-dark-text-muted">
                          获取密钥：
                          <a
                            href="https://dashscope.console.aliyun.com/apiKey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-dark-primary hover:underline ml-1"
                          >
                            阿里云DashScope
                          </a>
                        </p>

                        {!hasQwenApiKey && !qwenApiKey.trim() && (
                          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 mt-2">
                            <p className="text-sm text-yellow-300">
                              未配置API密钥。使用AI功能前需要配置API密钥。
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3 p-3 rounded-lg border border-dark-primary bg-dark-primary/5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-dark-text">OpenRouter API 密钥</span>
                          {hasOpenrouterApiKey && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-xs text-green-500">已配置</span>
                            </div>
                          )}
                        </div>

                        {hasOpenrouterApiKey && !isChangingOpenrouterKey && (
                          <p className="text-sm text-dark-text font-mono">{maskedOpenrouterApiKey}</p>
                        )}

                        {!hasOpenrouterApiKey || isChangingOpenrouterKey ? (
                          <>
                            <div className="relative">
                              <Input
                                type={showApiKey ? 'text' : 'password'}
                                value={openrouterApiKey}
                                onChange={(e) => setOpenrouterApiKey(e.target.value)}
                                placeholder="sk-or-..."
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
                            {isChangingOpenrouterKey && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    if (openrouterApiKey.trim()) {
                                      setIsSaving(true);
                                      try {
                                        const response = await authApi.updateSettings({
                                          openrouter_api_key: openrouterApiKey.trim()
                                        });
                                        setMaskedOpenrouterApiKey(response.data.masked_openrouter_api_key || '');
                                        setHasOpenrouterApiKey(response.data.has_openrouter_api_key || false);
                                        setOpenrouterApiKey('');
                                        setIsChangingOpenrouterKey(false);
                                        setShowApiKey(false);
                                        setSaveMessage({ type: 'success', text: 'API密钥已更新' });
                                        setTimeout(() => setSaveMessage(null), 3000);
                                      } catch (error: unknown) {
                                        const axiosError = error as { response?: { data?: { error?: string } } };
                                        setSaveMessage({
                                          type: 'error',
                                          text: axiosError.response?.data?.error || '更新失败'
                                        });
                                      } finally {
                                        setIsSaving(false);
                                      }
                                    }
                                  }}
                                  disabled={isSaving || !openrouterApiKey.trim()}
                                  className="text-xs"
                                >
                                  确定
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setOpenrouterApiKey('');
                                    setIsChangingOpenrouterKey(false);
                                    setShowApiKey(false);
                                  }}
                                  disabled={isSaving}
                                  className="text-xs"
                                >
                                  取消
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsChangingOpenrouterKey(true)}
                            className="text-xs"
                          >
                            更改密钥
                          </Button>
                        )}
                        <p className="text-xs text-dark-text-muted">
                          获取密钥：
                          <a
                            href="https://openrouter.ai/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-dark-primary hover:underline ml-1"
                          >
                            OpenRouter
                          </a>
                        </p>

                        {!hasOpenrouterApiKey && !openrouterApiKey.trim() && (
                          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 mt-2">
                            <p className="text-sm text-yellow-300">
                              未配置API密钥。使用AI功能前需要配置API密钥。
                            </p>
                          </div>
                        )}
                      </div>
                    )}
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
                        <input
                          type="number"
                          min="0"
                          max="2"
                          step="0.01"
                          value={temperature}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setTemperature(Math.min(2, Math.max(0, val)));
                          }}
                          className="w-20 px-2 py-1 text-sm text-center font-mono bg-transparent rounded text-dark-primary transition-all duration-200 outline-none hover:bg-white/5 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] focus:bg-white/10 focus:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.5)]"
                        />
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
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={topP}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setTopP(Math.min(1, Math.max(0, val)));
                          }}
                          className="w-20 px-2 py-1 text-sm text-center font-mono bg-transparent rounded text-dark-primary transition-all duration-200 outline-none hover:bg-white/5 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] focus:bg-white/10 focus:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.5)]"
                        />
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
                        <input
                          type="number"
                          min="100"
                          max="8000"
                          step="100"
                          value={maxTokens}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) setMaxTokens(Math.min(8000, Math.max(100, val)));
                          }}
                          className="w-20 px-2 py-1 text-sm text-center font-mono bg-transparent rounded text-dark-primary transition-all duration-200 outline-none hover:bg-white/5 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] focus:bg-white/10 focus:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.5)]"
                        />
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
                        <input
                          type="number"
                          min="-2"
                          max="2"
                          step="0.01"
                          value={frequencyPenalty}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setFrequencyPenalty(Math.min(2, Math.max(-2, val)));
                          }}
                          className="w-20 px-2 py-1 text-sm text-center font-mono bg-transparent rounded text-dark-primary transition-all duration-200 outline-none hover:bg-white/5 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] focus:bg-white/10 focus:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.5)]"
                        />
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
                        <input
                          type="number"
                          min="-2"
                          max="2"
                          step="0.01"
                          value={presencePenalty}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setPresencePenalty(Math.min(2, Math.max(-2, val)));
                          }}
                          className="w-20 px-2 py-1 text-sm text-center font-mono bg-transparent rounded text-dark-primary transition-all duration-200 outline-none hover:bg-white/5 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] focus:bg-white/10 focus:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.5)]"
                        />
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
                  onClick={handleApplyChanges}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <div className="flex items-center gap-2">
                      <LoadingSpinner size="sm" />
                      应用中
                    </div>
                  ) : (
                    '应用'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                >
                  取消
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <div className="flex items-center gap-2">
                      <LoadingSpinner size="sm" />
                      保存中
                    </div>
                  ) : (
                    '保存'
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
