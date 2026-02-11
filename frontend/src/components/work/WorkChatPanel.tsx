import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, Square, Settings, Trash2, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { aiApi, chatApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import type { Work, ChatMessage } from '../../types';

interface WorkChatPanelProps {
  work: Work;
  scrollToLatestOnMount?: boolean;
}

type AIModel = 'deepseek-chat' | 'deepseek-reasoner';

export const WorkChatPanel: React.FC<WorkChatPanelProps> = ({ work, scrollToLatestOnMount = false }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreamingChat, setIsStreamingChat] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState<AIModel>('deepseek-chat');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamEventSourceRef = useRef<EventSource | null>(null);
  const hasInitialScrollRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Only auto-scroll after user-triggered chat actions (send/regenerate/streaming).
    if (!shouldAutoScrollRef.current) {
      return;
    }
    scrollToBottom();
  }, [messages, streamingMessage]);

  useEffect(() => {
    // One-time jump to latest when entering dedicated chat page.
    if (!scrollToLatestOnMount || hasInitialScrollRef.current || messages.length === 0) {
      return;
    }
    hasInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, [messages.length, scrollToLatestOnMount]);

  useEffect(() => {
    return () => {
      if (streamEventSourceRef.current) {
        streamEventSourceRef.current.close();
        streamEventSourceRef.current = null;
      }
    };
  }, []);

  const handleSendMessage = async () => {
    const message = inputMessage.trim();
    if (!message || isStreamingChat) return;

    if (!work?.id) {
      console.error('Work not available for chat');
      return;
    }

    shouldAutoScrollRef.current = true;
    setInputMessage('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Save user message to backend first and get real ID
    let userMessage: ChatMessage;
    try {
      const response = await chatApi.saveWorkMessage(work.id, 'user', message);
      userMessage = {
        id: response.data.id,
        role: 'user',
        content: message,
        timestamp: response.data.timestamp,
      };
    } catch (error) {
      console.error('Failed to save work chat user message:', error);
      // Fallback: use temporary ID if save fails
      userMessage = {
        id: `${Date.now()}_user`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
    }
    setMessages((prev) => [...prev, userMessage]);

    try {
      if (streamEventSourceRef.current) {
        streamEventSourceRef.current.close();
        streamEventSourceRef.current = null;
      }
      setIsStreamingChat(true);
      setStreamingMessage('');

      const eventSource = aiApi.workChatStream(
        work.id,
        message,
        (chunk: string) => {
          setStreamingMessage((prev) => prev + chunk);
        },
        () => {
          console.log('Work chat streaming started');
        },
        async (fullResponse: string) => {
          setIsStreamingChat(false);
          setStreamingMessage('');
          if (streamEventSourceRef.current) {
            streamEventSourceRef.current.close();
            streamEventSourceRef.current = null;
          }

          try {
            const response = await chatApi.saveWorkMessage(work.id, 'assistant', fullResponse);
            const aiResponse: ChatMessage = {
              id: response.data.id,
              role: 'assistant',
              content: fullResponse,
              timestamp: response.data.timestamp,
            };
            setMessages((prev) => [...prev, aiResponse]);
          } catch (error) {
            console.error('Failed to save work chat AI response:', error);
            // Fallback: add with temporary ID if save fails
            const aiResponse: ChatMessage = {
              id: `${Date.now()}_ai`,
              role: 'assistant',
              content: fullResponse,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, aiResponse]);
          }
        },
        (error: string) => {
          console.error('Work chat streaming error:', error);
          setIsStreamingChat(false);
          setStreamingMessage('');
          if (streamEventSourceRef.current) {
            streamEventSourceRef.current.close();
            streamEventSourceRef.current = null;
          }
          const fallback: ChatMessage = {
            id: `${Date.now()}_error`,
            role: 'assistant',
            content: 'AI暂时无法回应，请稍后重试。',
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, fallback]);
        },
        selectedModel
      );

      streamEventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to start work chat streaming:', error);
      setIsStreamingChat(false);
      if (streamEventSourceRef.current) {
        streamEventSourceRef.current.close();
        streamEventSourceRef.current = null;
      }
      const fallback: ChatMessage = {
        id: `${Date.now()}_error`,
        role: 'assistant',
        content: 'AI暂时无法回应，请稍后重试。',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, fallback]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
      inputRef.current.style.overflowY = inputRef.current.scrollHeight > 200 ? 'auto' : 'hidden';
    }
  };

  const handleStopGeneration = async () => {
    if (streamEventSourceRef.current) {
      streamEventSourceRef.current.close();
      streamEventSourceRef.current = null;
    }

    // Save whatever we have so far
    if (streamingMessage) {
      const messageContent = streamingMessage;
      setIsStreamingChat(false);
      setStreamingMessage('');

      // Save to backend and get real ID
      if (work?.id) {
        try {
          const response = await chatApi.saveWorkMessage(work.id, 'assistant', messageContent);
          const aiResponse: ChatMessage = {
            id: response.data.id,
            role: 'assistant',
            content: messageContent,
            timestamp: response.data.timestamp
          };
          setMessages(prev => [...prev, aiResponse]);
        } catch (error) {
          console.error('Failed to save stopped work message:', error);
          // Fallback: add with temporary ID if save fails
          const aiResponse: ChatMessage = {
            id: `${Date.now()}_ai`,
            role: 'assistant',
            content: messageContent,
            timestamp: new Date().toISOString()
          };
          setMessages(prev => [...prev, aiResponse]);
        }
      }
    } else {
      setIsStreamingChat(false);
      setStreamingMessage('');
    }
  };

  const handleClearChat = async () => {
    if (!confirm('确定要清空聊天记录吗？')) return;
    if (!work?.id) return;

    try {
      await chatApi.clearWorkHistory(work.id);
      setMessages([]);
    } catch (error) {
      console.error('Failed to clear work chat history:', error);
      setMessages([]);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('确定要删除此消息及之后的所有消息吗？')) return;

    if (!work?.id) return;

    try {
      await chatApi.deleteWorkMessage(work.id, messageId);

      // Remove the message and all subsequent messages from local state
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex !== -1) {
        setMessages(prev => prev.slice(0, messageIndex));
      }
    } catch (error) {
      console.error('Failed to delete work message:', error);
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    if (!work?.id) return;

    // Find the message to regenerate
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;

    // Get the previous user message
    const previousMessage = messages[messageIndex - 1];
    if (previousMessage.role !== 'user') return;

    try {
      shouldAutoScrollRef.current = true;
      // Delete this AI message and all subsequent messages
      await chatApi.deleteWorkMessage(work.id, messageId);

      // Remove from local state
      setMessages(prev => prev.slice(0, messageIndex));

      // Resend the previous user message to trigger new AI response
      const userMessageContent = previousMessage.content;

      if (streamEventSourceRef.current) {
        streamEventSourceRef.current.close();
        streamEventSourceRef.current = null;
      }
      setIsStreamingChat(true);
      setStreamingMessage('');

      const eventSource = aiApi.workChatStream(
        work.id,
        userMessageContent,
        (chunk: string) => {
          setStreamingMessage((prev) => prev + chunk);
        },
        () => {
          console.log('Regenerate work chat streaming started');
        },
        async (fullResponse: string) => {
          setIsStreamingChat(false);
          setStreamingMessage('');
          if (streamEventSourceRef.current) {
            streamEventSourceRef.current.close();
            streamEventSourceRef.current = null;
          }

          try {
            const response = await chatApi.saveWorkMessage(work.id, 'assistant', fullResponse);
            const aiResponse: ChatMessage = {
              id: response.data.id,
              role: 'assistant',
              content: fullResponse,
              timestamp: response.data.timestamp,
            };
            setMessages((prev) => [...prev, aiResponse]);
          } catch (error) {
            console.error('Failed to save regenerated work response:', error);
            // Fallback: add with temporary ID if save fails
            const aiResponse: ChatMessage = {
              id: `${Date.now()}_ai`,
              role: 'assistant',
              content: fullResponse,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, aiResponse]);
          }
        },
        (error: string) => {
          console.error('Regenerate work chat streaming error:', error);
          setIsStreamingChat(false);
          setStreamingMessage('');
          if (streamEventSourceRef.current) {
            streamEventSourceRef.current.close();
            streamEventSourceRef.current = null;
          }
        },
        selectedModel
      );

      streamEventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to regenerate work message:', error);
    }
  };

  useEffect(() => {
    const loadHistory = async () => {
      if (!work?.id) return;

      try {
        const response = await chatApi.getWorkHistory(work.id);
        const history = response.data.messages;

        if (history.length > 0) {
          setMessages(history);
        } else {
          const greetingContent = `你好！我是你的作品顾问。我已阅读《${work.title}》的大纲、世界观与章节摘要，可以与你讨论整体故事节奏、角色弧光或未来剧情方向。你想先聊哪一部分？`;

          try {
            const response = await chatApi.saveWorkMessage(work.id, 'assistant', greetingContent);
            const greeting: ChatMessage = {
              id: response.data.id,
              role: 'assistant',
              content: greetingContent,
              timestamp: response.data.timestamp,
            };
            setMessages([greeting]);
          } catch (error) {
            console.error('Failed to save work greeting:', error);
            // Fallback: show greeting with temporary ID if save fails
            const greeting: ChatMessage = {
              id: 'work-greeting',
              role: 'assistant',
              content: greetingContent,
              timestamp: new Date().toISOString(),
            };
            setMessages([greeting]);
          }
        }
      } catch (error) {
        console.error('Failed to load work chat history:', error);
        const fallbackGreeting: ChatMessage = {
          id: 'work-greeting',
          role: 'assistant',
          content: `你好！我是你的作品顾问。我已阅读《${work.title}》的大纲、世界观与章节摘要，可以与你讨论整体故事节奏、角色弧光或未来剧情方向。你想先聊哪一部分？`,
          timestamp: new Date().toISOString(),
        };
        setMessages([fallbackGreeting]);
      }
    };

    if (messages.length === 0) {
      loadHistory();
    }
  }, [work?.id, work?.title, messages.length]);

  return (
    <div className="h-full flex flex-col bg-dark-bg border border-dark-border rounded-lg overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 bg-dark-surface border-b border-dark-border">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-dark-text">作品顾问聊天</h4>
            <p className="text-xs text-dark-text-muted mt-1">
              基于作品大纲、世界观与章节摘要提供总体建议
            </p>
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="flex items-center gap-1 text-xs text-dark-text-muted hover:text-dark-text"
            >
              <Settings size={14} />
              <span>{selectedModel === 'deepseek-chat' ? '标准模式' : '推理模式'}</span>
            </Button>

            {/* Model Selector Dropdown */}
            {showModelSelector && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-dark-surface border border-dark-border rounded-lg shadow-lg z-50">
                <div className="p-2 border-b border-dark-border">
                  <div className="text-xs font-semibold text-dark-text">选择AI模型</div>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => {
                      setSelectedModel('deepseek-chat');
                      setShowModelSelector(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                      selectedModel === 'deepseek-chat'
                        ? 'bg-dark-primary text-white'
                        : 'text-dark-text hover:bg-dark-bg'
                    }`}
                  >
                    <div className="font-medium">标准模式</div>
                    <div className="text-xs opacity-75">deepseek-chat</div>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedModel('deepseek-reasoner');
                      setShowModelSelector(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                      selectedModel === 'deepseek-reasoner'
                        ? 'bg-dark-primary text-white'
                        : 'text-dark-text hover:bg-dark-bg'
                    }`}
                  >
                    <div className="font-medium">推理模式</div>
                    <div className="text-xs opacity-75">deepseek-reasoner</div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="w-full">
            <div className={`flex items-center mb-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-center gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                  message.role === 'assistant' ? 'bg-dark-primary' : 'bg-dark-secondary'
                }`}>
                  {message.role === 'assistant' ? (
                    <Bot size={12} className="text-white" />
                  ) : (
                    <User size={12} className="text-white" />
                  )}
                </div>
                <span className="text-xs text-dark-text-muted">
                  {message.role === 'assistant' ? 'AI顾问' : '你'}
                </span>
              </div>
            </div>

            <div className={`w-full ${message.role === 'user' ? 'bg-dark-secondary/40' : 'bg-dark-surface'} border border-dark-border rounded-lg p-3 mb-1`}>
              {message.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none text-dark-text">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-sm text-dark-text">
                  {message.content}
                </div>
              )}
            </div>

            {/* Timestamp and Action Buttons */}
            <div className={`flex items-center gap-2 mb-4 ${
              message.role === 'user'
                ? 'justify-end'
                : 'justify-start'
            }`}>
              <div className={`text-xs opacity-70 ${
                message.role === 'user'
                  ? 'text-dark-text-muted'
                  : 'text-dark-text-muted'
              }`}>
                {new Date(message.timestamp).toLocaleString()}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                {message.role === 'assistant' && (
                  <button
                    onClick={() => handleRegenerateMessage(message.id)}
                    disabled={isStreamingChat}
                    className="p-1 rounded hover:bg-dark-bg text-dark-text-muted hover:text-dark-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="重新生成"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteMessage(message.id)}
                  disabled={isStreamingChat}
                  className="p-1 rounded hover:bg-dark-bg text-dark-text-muted hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="删除此消息及之后的消息"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {isStreamingChat && (
          <div className="w-full">
            <div className="flex items-center mb-2 justify-start">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-6 h-6 bg-dark-primary rounded-full flex items-center justify-center">
                  <Bot size={12} className="text-white" />
                </div>
                <span className="text-xs text-dark-text-muted">AI顾问</span>
              </div>
            </div>
            <div className="w-full bg-dark-surface border border-dark-border rounded-lg p-3 mb-1">
              <div className="prose prose-sm prose-invert max-w-none text-dark-text">
                <ReactMarkdown>{streamingMessage}</ReactMarkdown>
                <span className="inline-block w-2 h-4 bg-dark-primary animate-pulse ml-1" />
              </div>
            </div>
            <div className="text-xs opacity-70 mb-4 text-left text-dark-text-muted">
              正在输入...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 border-t border-dark-border bg-dark-surface p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Textarea
              ref={inputRef}
              value={inputMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder="与AI谈话获得建议。"
              className="bg-dark-bg border-dark-border text-sm resize-none overflow-y-auto min-h-[40px] max-h-[200px]"
              rows={1}
              disabled={isStreamingChat}
            />
          </div>

          {isStreamingChat ? (
            <Button
              onClick={handleStopGeneration}
              size="sm"
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white"
            >
              <Square size={16} fill="currentColor" />
            </Button>
          ) : (
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim()}
              size="sm"
              className="flex items-center gap-2 px-3 py-2"
            >
              <Send size={16} />
            </Button>
          )}
        </div>

        {messages.length > 1 && (
          <div className="flex justify-center mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              className="text-xs text-dark-text-muted hover:text-dark-text"
            >
              清空聊天记录
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
