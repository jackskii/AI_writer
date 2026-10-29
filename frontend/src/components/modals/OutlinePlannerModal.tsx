import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Send, Square, Check, Save, FileText, ArrowLeft, Sparkles } from 'lucide-react';
import { actsApi, aiApi, chatApi } from '../../services/api';
import { ChatMessageList } from '../chat/ChatMessageList';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import type { Act, ChatMessage } from '../../types';

interface OutlineRound {
  id: number;
  closed_at: string;
  preview: string;
}

interface OutlinePlannerModalProps {
  workId: number;
  act: Act | null;
  isOpen: boolean;
  onClose: () => void;
}

export const OutlinePlannerModal: React.FC<OutlinePlannerModalProps> = ({
  workId,
  act,
  isOpen,
  onClose,
}) => {
  const [content, setContent] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [outlineView, setOutlineView] = useState<'preview' | 'edit'>('preview');
  const [rounds, setRounds] = useState<OutlineRound[]>([]);
  const [viewingRound, setViewingRound] = useState<OutlineRound | null>(null);
  const [roundMessages, setRoundMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const lastSavedRef = useRef('');
  const saveTimerRef = useRef<number | null>(null);
  const generatingRef = useRef(false);
  const updatingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef('');
  contentRef.current = content;

  const saveOutline = useCallback(async (next: string, force = false) => {
    if (!act) return;
    if (!force && next === lastSavedRef.current) return;
    setIsSaving(true);
    try {
      await actsApi.autosaveOutline(workId, act.id, next);
      lastSavedRef.current = next;
      setLastSaveTime(new Date());
    } catch (error) {
      console.error('Failed to autosave outline:', error);
    } finally {
      setIsSaving(false);
    }
  }, [act, workId]);

  useEffect(() => {
    if (!isOpen || !act) return;
    let cancelled = false;
    setErrorMessage('');
    setInputMessage('');
    setIsGenerating(false);
    setIsUpdating(false);
    setStreamingMessage('');
    setOutlineView('preview');
    setViewingRound(null);
    setRoundMessages([]);
    setShowHistory(false);

    (async () => {
      try {
        const [actResponse, historyResponse] = await Promise.all([
          actsApi.get(workId, act.id),
          chatApi.getOutlineHistory(workId, act.id),
        ]);
        if (cancelled) return;
        const stored = actResponse.data.outline || '';
        const template = historyResponse.data.outline_template || '';
        const initial = stored.trim() ? stored : template;
        setContent(initial);
        contentRef.current = initial;
        lastSavedRef.current = stored;
        setLastSaveTime(null);
        setMessages(historyResponse.data.messages || []);
        setRounds(historyResponse.data.rounds || []);
        if (!stored.trim() && template) {
          await saveOutline(template, true);
        }
      } catch (error) {
        console.error('Failed to load outline planner:', error);
        if (!cancelled) setErrorMessage('加载大纲失败');
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [isOpen, act, workId, saveOutline]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, streamingMessage]);

  const handleContentChange = (next: string) => {
    if (updatingRef.current) return;
    setContent(next);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveOutline(next);
    }, 5000);
  };

  const requestChat = async (message: string, saveUser: boolean, priorAssistant = '') => {
    if (!act || isGenerating || generatingRef.current || updatingRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    generatingRef.current = true;
    setIsGenerating(true);
    setErrorMessage('');
    setStreamingMessage('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (saveUser) {
        const saved = await chatApi.saveOutlineMessage(workId, act.id, 'user', message);
        setMessages((prev) => [...prev, saved.data]);
      }
      await aiApi.outlinePlannerChat(
        workId,
        act.id,
        message,
        contentRef.current,
        undefined,
        (chunk) => {
          setStreamingMessage((prev) => prev + chunk);
        },
        async (reply) => {
          try {
            const saved = await chatApi.saveOutlineMessage(workId, act.id, 'assistant', reply);
            setMessages((prev) => [...prev, saved.data]);
          } catch (error) {
            console.error('Failed to save outline chat reply:', error);
            setErrorMessage('保存回复失败');
          } finally {
            setStreamingMessage('');
            generatingRef.current = false;
            setIsGenerating(false);
            abortRef.current = null;
          }
        },
        (error) => {
          setErrorMessage(error);
          setStreamingMessage('');
          generatingRef.current = false;
          setIsGenerating(false);
          abortRef.current = null;
        },
        controller.signal,
        priorAssistant,
      );
    } catch (error) {
      console.error('Outline chat failed:', error);
      setErrorMessage('大纲策划失败');
      setStreamingMessage('');
      generatingRef.current = false;
      setIsGenerating(false);
    }
  };

  const requestUpdate = async () => {
    if (!act || isGenerating || generatingRef.current || updatingRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    updatingRef.current = true;
    setIsUpdating(true);
    setErrorMessage('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await aiApi.outlinePlannerUpdate(
        workId,
        act.id,
        contentRef.current,
        undefined,
        async (_reply, documentContent, closedRound, newMessages) => {
          try {
            setContent(documentContent);
            contentRef.current = documentContent;
            await saveOutline(documentContent, true);
            setMessages(newMessages);
            if (closedRound) {
              setRounds((prev) => [closedRound, ...prev]);
            }
          } catch (error) {
            console.error('Failed to apply outline update:', error);
            setErrorMessage('保存大纲失败');
          } finally {
            updatingRef.current = false;
            setIsUpdating(false);
            abortRef.current = null;
          }
        },
        (error) => {
          setErrorMessage(error);
          updatingRef.current = false;
          setIsUpdating(false);
          abortRef.current = null;
        },
        controller.signal,
      );
    } catch (error) {
      console.error('Outline update failed:', error);
      setErrorMessage('大纲更新失败');
      updatingRef.current = false;
      setIsUpdating(false);
    }
  };

  const resizeInput = (el: HTMLTextAreaElement) => {
    const max = Math.floor(window.innerHeight * 0.5);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    resizeInput(e.target);
  };

  const handleSend = () => {
    const message = inputMessage.trim();
    if (!message) return;
    setInputMessage('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    requestChat(message, true);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (updatingRef.current) {
      updatingRef.current = false;
      setIsUpdating(false);
    } else {
      generatingRef.current = false;
      setIsGenerating(false);
      setStreamingMessage('');
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!act) return;
    await chatApi.deleteOutlineMessage(workId, act.id, messageId);
    const index = messages.findIndex((item) => item.id === messageId);
    if (index !== -1) setMessages((prev) => prev.slice(0, index));
  };

  const handleRegenerate = async (messageId: string) => {
    if (!act) return;
    const index = messages.findIndex((item) => item.id === messageId);
    const previous = index > 0 ? messages[index - 1] : undefined;
    if (!previous || previous.role !== 'user') return;
    const question = index > 1 ? messages[index - 2] : undefined;
    const priorAssistant = question?.role === 'assistant' ? question.content : '';
    await chatApi.deleteOutlineMessage(workId, act.id, messageId);
    setMessages((prev) => prev.slice(0, index));
    requestChat(previous.content, false, priorAssistant);
  };

  const handleViewRound = async (round: OutlineRound) => {
    if (!act) return;
    try {
      const res = await chatApi.getOutlineRound(workId, act.id, round.id);
      setViewingRound(round);
      setRoundMessages(res.data.messages || []);
      setShowHistory(false);
    } catch (error) {
      console.error('Failed to load round:', error);
      setErrorMessage('加载历史对话失败');
    }
  };

  const handleClose = async () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (contentRef.current !== lastSavedRef.current) {
      await saveOutline(contentRef.current, true);
    }
    onClose();
  };

  if (!isOpen || !act) return null;

  const busy = isGenerating || isUpdating;
  const hasUserMessage = messages.some((m) => m.role === 'user');
  const shownMessages = viewingRound ? roundMessages : messages;
  const showStreaming = isGenerating && streamingMessage.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-dark-bg flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div>
          <h2 className="text-lg font-semibold text-dark-text">创建大纲 · {act.name}</h2>
          <div className="flex items-center gap-2 text-xs text-dark-text-muted mt-1">
            {isSaving ? (
              <>
                <Save size={12} className="animate-pulse" />
                <span>自动保存中...</span>
              </>
            ) : lastSaveTime ? (
              <>
                <Check size={12} className="text-green-400" />
                <span>已保存</span>
              </>
            ) : (
              <span>大纲会自动保存</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rounds.length > 0 && !viewingRound && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-dark-text-muted hover:text-dark-text rounded hover:bg-dark-surface"
              title="历史对话"
            >
              <FileText size={14} />
              历史
            </button>
          )}
          {viewingRound && (
            <button
              type="button"
              onClick={() => {
                setViewingRound(null);
                setRoundMessages([]);
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-dark-text-muted hover:text-dark-text rounded hover:bg-dark-surface"
              title="返回当前对话"
            >
              <ArrowLeft size={14} />
              返回当前对话
            </button>
          )}
          <button onClick={handleClose} className="text-dark-text-muted hover:text-dark-text" title="关闭">
            <X size={20} />
          </button>
        </div>
      </div>

      {showHistory && !viewingRound && (
        <div className="border-b border-dark-border bg-dark-surface max-h-48 overflow-y-auto">
          {rounds.map((round) => (
            <button
              key={round.id}
              type="button"
              onClick={() => handleViewRound(round)}
              className="w-full text-left px-4 py-2 text-sm text-dark-text hover:bg-dark-bg border-b border-dark-border/50"
            >
              <div className="text-xs text-dark-text-muted">
                {new Date(round.closed_at).toLocaleString('zh-CN')}
              </div>
              <div className="truncate">{round.preview}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <div className="md:w-[55%] h-1/2 md:h-full min-h-0 border-b md:border-b-0 md:border-r border-dark-border p-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOutlineView('preview')}
              className={`px-2 py-1 text-xs rounded ${outlineView === 'preview' ? 'bg-dark-primary text-white' : 'text-dark-text-muted hover:text-dark-text'}`}
            >
              预览
            </button>
            <button
              type="button"
              onClick={() => setOutlineView('edit')}
              className={`px-2 py-1 text-xs rounded ${outlineView === 'edit' ? 'bg-dark-primary text-white' : 'text-dark-text-muted hover:text-dark-text'}`}
            >
              编辑
            </button>
            {isUpdating && <span className="px-2 py-1 text-xs text-dark-primary">正在更新大纲…</span>}
          </div>
          {outlineView === 'preview' ? (
            <div className="flex-1 min-h-0 overflow-auto px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-dark-text">
              {content.trim() ? (
                <div className="prose prose-sm prose-invert max-w-none chinese-text">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-dark-text-muted">在这里写这一卷的详细大纲...</p>
              )}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              readOnly={isUpdating}
              disabled={isUpdating}
              placeholder="在这里写这一卷的详细大纲..."
              className="flex-1 min-h-0 w-full px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-dark-text placeholder-dark-text-muted focus-ring focus:border-dark-primary chinese-text leading-relaxed resize-none overflow-auto"
            />
          )}
        </div>
        <div className="md:w-[45%] h-1/2 md:h-full flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4">
            <ChatMessageList
              messages={shownMessages}
              streamingMessage={showStreaming ? streamingMessage : isUpdating ? '正在更新大纲…' : ''}
              isStreamingChat={busy}
              isStreamingChatDisabled={busy || !!viewingRound}
              errorMessage={errorMessage}
              assistantLabel="大纲策划"
              onRegenerate={viewingRound ? () => {} : handleRegenerate}
              onDelete={viewingRound ? () => {} : handleDelete}
              messagesEndRef={messagesEndRef}
            />
          </div>
          {!viewingRound && (
            <div className="p-3 border-t border-dark-border flex gap-2 items-end">
              <div className="flex-1 min-w-0">
                <Textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={handleInputChange}
                  placeholder="和策划讨论这一卷..."
                  rows={4}
                  disabled={busy}
                  className="bg-dark-bg border-dark-border text-sm leading-relaxed resize-y min-h-[7rem] max-h-[50vh]"
                />
              </div>
              <div className="flex flex-col gap-2 self-end">
                <Button
                  onClick={requestUpdate}
                  variant="outline"
                  disabled={busy || !hasUserMessage}
                  title="更新大纲"
                >
                  <Sparkles size={16} />
                </Button>
                {busy ? (
                  <Button onClick={handleStop} variant="outline" title="停止">
                    <Square size={16} />
                  </Button>
                ) : (
                  <Button onClick={handleSend} disabled={!inputMessage.trim()} title="发送">
                    <Send size={16} />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
