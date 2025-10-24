import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { aiApi, chatApi } from '../../services/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import type { Work, ChatMessage } from '../../types';

interface WorkChatPanelProps {
  work: Work;
}

export const WorkChatPanel: React.FC<WorkChatPanelProps> = ({ work }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreamingChat, setIsStreamingChat] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamEventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

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

    setInputMessage('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}_user`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      await chatApi.saveWorkMessage(work.id, 'user', message);
    } catch (error) {
      console.error('Failed to save work chat user message:', error);
    }

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
          const aiResponse: ChatMessage = {
            id: `${Date.now()}_ai`,
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date().toISOString(),
          };

          setMessages((prev) => [...prev, aiResponse]);
          setIsStreamingChat(false);
          setStreamingMessage('');
          if (streamEventSourceRef.current) {
            streamEventSourceRef.current.close();
            streamEventSourceRef.current = null;
          }

          try {
            await chatApi.saveWorkMessage(work.id, 'assistant', fullResponse);
          } catch (error) {
            console.error('Failed to save work chat AI response:', error);
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
        }
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

  useEffect(() => {
    const loadHistory = async () => {
      if (!work?.id) return;

      try {
        const response = await chatApi.getWorkHistory(work.id);
        const history = response.data.messages;

        if (history.length > 0) {
          setMessages(history);
        } else {
          const greeting: ChatMessage = {
            id: 'work-greeting',
            role: 'assistant',
            content: `你好！我是你的作品顾问。我已阅读《${work.title}》的大纲、世界观与章节摘要，可以与你讨论整体故事节奏、角色弧光或未来剧情方向。你想先聊哪一部分？`,
            timestamp: new Date().toISOString(),
          };
          setMessages([greeting]);
          await chatApi.saveWorkMessage(work.id, 'assistant', greeting.content);
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
              <div className="prose prose-sm prose-invert max-w-none text-dark-text">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>

            <div className={`text-xs opacity-70 mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'} text-dark-text-muted`}>
              {new Date(message.timestamp).toLocaleString()}
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
              placeholder="向AI顾问询问故事走向、角色弧光或世界观建议...(Enter发送, Shift+Enter换行)"
              className="bg-dark-bg border-dark-border text-sm resize-none overflow-hidden min-h-[40px] max-h-[200px]"
              rows={1}
              disabled={isStreamingChat}
            />
          </div>

          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isStreamingChat}
            size="sm"
            className="flex items-center gap-2 px-3 py-2"
          >
            <Send size={16} />
          </Button>
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
